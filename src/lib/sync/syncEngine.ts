import { ADAPTERS, findAdapter, planKind, type Adapter, type KindPlan } from './adapters';
import { commitBaselineRow, loadBaselineRowSet, type BaselineKind } from './baseline';
import type { PulledRows, SyncPort } from './port';
import type { RowSet } from './rows';
import { loadSyncMeta, nextCursorRev, reconcileUser, saveSyncMeta } from './syncMeta';

export type Resolution = 'local' | 'server';

export type ConflictResolver =
  (kinds: readonly BaselineKind[]) => Promise<Map<BaselineKind, Resolution>>;

export type SyncStatus = 'ok' | 'unauthenticated' | 'error' | 'baseline-write-failed';

export type SyncReport = {
  status: SyncStatus;
  adopted: number;
  pushed: number;
  failed: number;
  /** 競合が解決されず、今回触らなかったデータ種別 */
  unresolved: BaselineKind[];
  error?: string;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type KindOutcome = { adopted: number; pushed: number; failed: number; baselineOk: boolean };

/**
 * 1 データ種別ぶんを適用する。
 *
 * 順序が重要: 先に取り込み（ローカルへ書く）→ そのぶんのベースラインを行単位で確定
 * → push → 成功した行だけベースラインを確定。ベースラインを一括更新してはならない。
 */
async function applyKind<V>(
  port: SyncPort,
  adapter: Adapter<V>,
  plan: KindPlan,
  resolution: Resolution | undefined,
): Promise<KindOutcome> {
  const outcome: KindOutcome = { adopted: 0, pushed: 0, failed: 0, baselineOk: true };
  const nextLocal: RowSet<V> = new Map(adapter.localRowSet());
  const baseline = loadBaselineRowSet<V>(adapter.kind);
  const pushEntries: [string, V | null][] = [];
  const adoptedKeys: [string, V | null][] = [];

  for (const verdict of plan.verdicts as unknown as {
    kind: 'noop' | 'push' | 'adopt' | 'conflict';
    key: string;
    value?: V | null;
    local?: V | null;
    server?: V | null;
  }[]) {
    if (verdict.kind === 'noop') {
      // 収束済みだがベースラインが古い行はここで進めておく。
      // 放置すると毎回 3 値比較の対象になり続ける
      const value = verdict.value ?? null;
      const known = baseline.has(verdict.key) ? (baseline.get(verdict.key) as V) : null;
      const differs = value === null || known === null
        ? value !== known
        : !adapter.equals(known, value);
      if (differs) adoptedKeys.push([verdict.key, value]);
      continue;
    }

    if (verdict.kind === 'adopt') {
      const value = verdict.value ?? null;
      if (value === null) nextLocal.delete(verdict.key);
      else nextLocal.set(verdict.key, value);
      adoptedKeys.push([verdict.key, value]);
      outcome.adopted += 1;
      continue;
    }

    if (verdict.kind === 'push') {
      pushEntries.push([verdict.key, verdict.value ?? null]);
      continue;
    }

    // conflict。resolution は呼び出し側で必ず決まっている
    if (resolution === 'server') {
      const value = verdict.server ?? null;
      if (value === null) nextLocal.delete(verdict.key);
      else nextLocal.set(verdict.key, value);
      adoptedKeys.push([verdict.key, value]);
      outcome.adopted += 1;
    } else {
      pushEntries.push([verdict.key, verdict.local ?? null]);
    }
  }

  // writeLocal はローカルの内容が実際に変わったときだけ呼ぶ。収束済みの noop 行
  // （ベースラインだけ古い行）で呼ぶと、何も変わらないのにストアの再読込が走る。
  // 失敗を無視してはならない: ベースラインだけ進むと、次の同期で古いローカルの値が
  // 相手の新しい値を上書きする
  if (outcome.adopted > 0 && !adapter.writeLocal(nextLocal)) {
    outcome.baselineOk = false;
    return outcome;
  }

  // ベースラインの確定は adopted の有無に関わらず行う。収束済みの noop 行は
  // ローカルを変えないが、ベースラインは進めないと毎回 3 値比較の対象になり続ける
  for (const [key, value] of adoptedKeys) {
    if (!commitBaselineRow(adapter.kind, key, value)) {
      outcome.baselineOk = false;
      return outcome;
    }
  }

  if (pushEntries.length > 0) {
    const results = await adapter.push(port, pushEntries);
    for (const [key, value] of pushEntries) {
      const result = results.get(key);
      if (result?.ok) {
        outcome.pushed += 1;
        if (!commitBaselineRow(adapter.kind, key, value)) {
          outcome.baselineOk = false;
          return outcome;
        }
      } else {
        // ベースラインを進めない。次回の diff が同じ差分を再検出して再送する
        outcome.failed += 1;
      }
    }
  }

  return outcome;
}

/**
 * 同期を 1 回実行する。
 *
 * この関数は SyncPort しか知らないため、実 Supabase なしで全分岐をテストできる。
 * どのエラー経路でも「何も書かずに状態だけ返す」のが既定の振る舞い。
 */
export async function runSync(
  port: SyncPort,
  resolveConflicts: ConflictResolver,
): Promise<SyncReport> {
  const report: SyncReport = { status: 'ok', adopted: 0, pushed: 0, failed: 0, unresolved: [] };

  let userId: string | null;
  try {
    userId = await port.getUserId();
  } catch (error) {
    return { ...report, status: 'error', error: describeError(error) };
  }
  if (userId === null) return { ...report, status: 'unauthenticated' };

  const meta = reconcileUser(loadSyncMeta(), userId);
  if (meta === null) return { ...report, status: 'baseline-write-failed' };

  let pulled: PulledRows;
  try {
    pulled = await port.pull(meta.cursorRev);
  } catch (error) {
    return { ...report, status: 'error', error: describeError(error) };
  }

  // localStorage が壊れているとプロジェクションが throw しうる
  // （SAVED_DECKS が配列でない、createdAt が欠落しているなど。バックアップ復元後や
  // 旧形式のレコードで起こる）。どのエラー経路でも「何も書かずに状態だけ返す」
  let plans: KindPlan[];
  try {
    plans = ADAPTERS.map((adapter) => planKind(adapter, pulled));
  } catch (error) {
    return { ...report, status: 'error', error: describeError(error) };
  }
  const conflicted = plans.filter((plan) => plan.conflictKeys.length > 0).map((plan) => plan.kind);

  let resolutions = new Map<BaselineKind, Resolution>();
  if (conflicted.length > 0) {
    try {
      resolutions = await resolveConflicts(conflicted);
    } catch (error) {
      return { ...report, status: 'error', error: describeError(error) };
    }
  }

  const appliedRevs: number[] = [];

  for (const plan of plans) {
    const resolution = resolutions.get(plan.kind);
    if (plan.conflictKeys.length > 0 && resolution === undefined) {
      // 未解決の競合があるデータ種別は一切触らない（部分適用で状態を混ぜない）
      report.unresolved.push(plan.kind);
      continue;
    }

    let outcome: KindOutcome;
    try {
      outcome = await applyKind(port, findAdapter(plan.kind), plan, resolution);
    } catch (error) {
      return { ...report, status: 'error', error: describeError(error) };
    }

    report.adopted += outcome.adopted;
    report.pushed += outcome.pushed;
    report.failed += outcome.failed;
    if (!outcome.baselineOk) {
      return { ...report, status: 'baseline-write-failed' };
    }
    appliedRevs.push(...plan.serverRevs);
  }

  // 未解決の競合が 1 つでもあればカーソルを進めない。
  //
  // cursorRev はデータ種別を跨いだ単一の値なので、未解決の種別を飛ばしても
  // 他の種別の rev で前進してしまう。すると未解決だった行が次回の
  // pull(rev > cursor) に現れなくなり、「サーバ側は未変更」と解釈されて
  // ローカルが一方的に push される。つまり利用者が「あとで」を選んだ競合が
  // 二度と提示されないまま、別の端末の値を黙って上書きすることになる。
  const cursorRev = report.unresolved.length === 0
    ? nextCursorRev(meta.cursorRev, appliedRevs)
    : meta.cursorRev;

  saveSyncMeta({ userId, cursorRev, lastSyncedAt: Date.now() });

  return report;
}
