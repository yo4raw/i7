<script lang="ts">
  import type { Card } from '../lib/data/fetchCardsJson';
  import { getApSkillLevel, SKILL_TYPE } from '../lib/data/fetchCardsJson';
  import { formatSkillEffect } from '../lib/score/skillFormatter';
  import type { Song } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import type { ScoreOptions } from '../lib/score/types';
  import { normalizeAttribute } from '../lib/score/types';
  import { computeTeam, calcMaxScore, calcExpectedScore, flattenNotes, computeShrinkExclusion, computeGroupSizes } from '../lib/score/engine';
  import { resolveDeckBroachs } from '../lib/score/broachResolver';
  import { buildLiveTierMap, isEventLive, BONUS_LABEL, BONUS_CLASS } from '../lib/data/eventBonusTiers';
  import type { EventBonusTier, EventForBonus } from '../lib/data/eventBonusTiers';
  import { ATTR_HEX, RARITY_BADGE_CLASSES, ATTR_BADGE_BG } from '../lib/constants';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { cardThumbUrl } from '../lib/ui';
  import { loadRabbitNotes } from '../lib/data/rabbitNote';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import { fetchSongsJson, filterValidSongs, filterAllowedSongs } from '../lib/data/fetchSongsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { allCounts, reloadFromStorage as reloadCardCounts } from '../lib/stores/cardCounts.svelte';

  type LiveEvent = EventForBonus & { eventname: string };

  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: LiveEvent[];
    base: string;
  };

  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events: initialEvents, base }: Props = $props();

  const SLOT_LABELS = ['センター', 'メンバー1', 'メンバー2', 'メンバー3', 'メンバー4', 'フレンド'];
  const DISPLAY_ORDER = [1, 2, 0, 3, 4, 5];

  type DeckRecord = {
    cardIds: (number | null)[];
    score: number;
    liveEndScore?: number;
    baseScore?: number;
    scoreUpExpected?: number;
    shrinkExpected?: number;
    finalScore?: number;
  };
  type FriendCandidate = {
    cardId: number;
    score: number;
  };
  type SearchResult = {
    best: DeckRecord;
    top: DeckRecord[];
    topFriends: FriendCandidate[];
    evaluated: number;
    elapsedMs: number;
    evalMode: 'expected' | 'max';
    aborted?: boolean;
  };

  let allCards = $state<Card[]>(initialCards);
  let allSongs = $state<Song[]>(initialSongs);
  let allBroachs = $state<FixedBroach[]>(initialBroachs);
  const allEventsData = initialEvents;

  let selectedSongId = $state<number | ''>('');
  let evalMode = $state<'expected' | 'max'>('expected');
  let scoreUpAssist = $state(false);
  let scoreUpBadgeRate = $state(0);
  let ownedOnly = $state(false);
  let shrinkPairOnly = $state(false);

  /** デッキ6枠中の判定縮小スキル持ち枚数を固定する条件 (shrinkPairOnly 有効時) */
  const SHRINK_PAIR_TARGET = 2;

  /** parseSkill (engine.ts) と同じ判定で「判定縮小スキル持ち」かどうかを返す */
  const isShrinkCard = (c: Card | null): boolean => {
    const t = c?.ap_skill_type;
    return !!t && (t === SKILL_TYPE.SHRINK || t.startsWith(SKILL_TYPE.SHRINK_PREFIX));
  };
  let now = $state(Date.now());

  let searching = $state(false);
  let progressPct = $state(0);
  let progressText = $state('');
  let lastResult = $state<SearchResult | null>(null);
  let abortRequested = false;

  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 60_000);
    return () => clearInterval(id);
  });

  $effect(() => {
    refreshData('cards', fetchCardsJson, (fresh) => { allCards = fresh as Card[]; });
    refreshData('songs', async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())), (fresh) => { allSongs = fresh as Song[]; });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => { allBroachs = fresh as FixedBroach[]; });
    reloadCardCounts();
  });

  const selectedSong = $derived(selectedSongId ? allSongs.find((s) => s.id === selectedSongId) ?? null : null);

  const currentLiveEvents = $derived(allEventsData.filter((ev) => isEventLive(ev.start_date, ev.end_date, now)));
  const currentTierMap = $derived(buildLiveTierMap(currentLiveEvents, now));
  const currentCandidates = $derived.by(() => {
    const goldSilverIds = new Set<number>();
    for (const ev of currentLiveEvents) {
      for (const id of ev.gold) goldSilverIds.add(id);
      for (const id of ev.silver) goldSilverIds.add(id);
    }
    return allCards.filter((c) => c.rarity === 'UR' && c.ID != null && goldSilverIds.has(c.ID));
  });

  const goldCandidates = $derived(currentCandidates.filter((c) => currentTierMap.get(c.ID!) === 'gold'));
  const silverCandidates = $derived(currentCandidates.filter((c) => currentTierMap.get(c.ID!) === 'silver'));

  const shrinkCandidates = $derived(currentCandidates.filter((c) => isShrinkCard(c)));
  const nonShrinkCandidates = $derived(currentCandidates.filter((c) => !isShrinkCard(c)));

  const cardCounts = $derived(allCounts());
  const ownedCountOf = (card: Card): number => (card.ID == null ? 0 : cardCounts[String(card.ID)] ?? 0);
  const ownedCandidates = $derived(currentCandidates.filter((c) => ownedCountOf(c) >= 1));
  const ownedGoldCount = $derived(goldCandidates.filter((c) => ownedCountOf(c) >= 1).length);
  const ownedSilverCount = $derived(silverCandidates.filter((c) => ownedCountOf(c) >= 1).length);

  function binomial(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
  }
  function multichoose(n: number, k: number): number {
    return binomial(n + k - 1, k);
  }
  // 各カード i の出現上限を limits[i] とした k-多重集合の総数
  // = ∏(1 + x + ... + x^{limits[i]}) における x^k の係数
  function countMultisetsWithLimits(limits: number[], k: number): number {
    let poly: number[] = [1];
    for (const lim of limits) {
      const newLen = Math.min(poly.length + lim, k + 1);
      const next = new Array<number>(newLen).fill(0);
      for (let d = 0; d < poly.length; d++) {
        if (poly[d] === 0) continue;
        const jMax = Math.min(lim, k - d);
        for (let j = 0; j <= jMax; j++) next[d + j] += poly[d];
      }
      poly = next;
    }
    return poly[k] ?? 0;
  }

  // ownedOnly 時の有効組合せ数:
  //   各 owned カードを center に置いた時の「残り所持枚数で 4-多重集合」の総和 × フレンド候補数
  // ownedOnly=false 時:
  //   (center, friend) は UR/UR で対称、(member1..4) は多重集合 → multichoose(N,2)×multichoose(N,4)
  // shrinkPairOnly 時: 縮小持ち / それ以外に分割し、6枠合計でちょうど SHRINK_PAIR_TARGET 枚になる組合せのみ数える
  const comboCount = $derived.by(() => {
    if (ownedOnly) {
      if (ownedCandidates.length < 1 || currentCandidates.length < 1) return 0;
      if (!shrinkPairOnly) {
        const limits = ownedCandidates.map((c) => ownedCountOf(c));
        let centerSum = 0;
        for (let ci = 0; ci < ownedCandidates.length; ci++) {
          const adjusted = limits.slice();
          adjusted[ci] -= 1;
          centerSum += countMultisetsWithLimits(adjusted, 4);
        }
        return centerSum * currentCandidates.length;
      }
      // 縮小2枚条件: center の縮小有無 × フレンドの縮小有無 で残りメンバーの縮小枚数が決まる
      let total = 0;
      for (let ci = 0; ci < ownedCandidates.length; ci++) {
        const center = ownedCandidates[ci];
        const cs = isShrinkCard(center) ? 1 : 0;
        const shrinkLimits: number[] = [];
        const nonShrinkLimits: number[] = [];
        for (const c of ownedCandidates) {
          let lim = ownedCountOf(c);
          if (c === center) lim -= 1;
          (isShrinkCard(c) ? shrinkLimits : nonShrinkLimits).push(lim);
        }
        for (const fs of [0, 1]) {
          const k = SHRINK_PAIR_TARGET - cs - fs;
          if (k < 0 || k > 4) continue;
          const friendPool = fs === 1 ? shrinkCandidates.length : nonShrinkCandidates.length;
          if (friendPool < 1) continue;
          total += countMultisetsWithLimits(shrinkLimits, k)
            * countMultisetsWithLimits(nonShrinkLimits, 4 - k)
            * friendPool;
        }
      }
      return total;
    }
    if (currentCandidates.length < 1) return 0;
    if (!shrinkPairOnly) {
      return multichoose(currentCandidates.length, 2) * multichoose(currentCandidates.length, 4);
    }
    // 縮小2枚条件: (center, friend) ペア内の縮小枚数 s2 ごとにメンバーの縮小枚数 k が決まる
    const S = shrinkCandidates.length;
    const T = nonShrinkCandidates.length;
    let total = 0;
    for (let s2 = 0; s2 <= SHRINK_PAIR_TARGET; s2++) {
      const k = SHRINK_PAIR_TARGET - s2;
      if (k < 0 || k > 4) continue;
      const pairs = s2 === 0 ? multichoose(T, 2) : s2 === 1 ? S * T : multichoose(S, 2);
      total += pairs * multichoose(S, k) * multichoose(T, 4 - k);
    }
    return total;
  });

  const searchDisabled = $derived(
    !selectedSong || currentCandidates.length < 1 || searching
      || (ownedOnly && ownedCandidates.length < 1)
      || comboCount === 0
  );
  const searchDisabledReason = $derived(
    !selectedSong ? '楽曲を選択してください'
      : currentCandidates.length < 1 ? '開催中イベントに金/銀特効 UR 衣装がありません'
      : ownedOnly && ownedCandidates.length < 1 ? '所持している金/銀特効 UR 衣装がありません'
      : ownedOnly && comboCount === 0 && !shrinkPairOnly ? '所持枚数の合計が 5 枚（センター+メンバー4枚分）に満たないため組合せがありません'
      : shrinkPairOnly && comboCount === 0 ? '判定縮小スキル持ちがちょうど2枚になる組合せが作れません（縮小持ち候補の不足など）'
      : ownedOnly && comboCount === 0 ? '所持枚数の合計が 5 枚（センター+メンバー4枚分）に満たないため組合せがありません'
      : ''
  );

  const pickedSongIds = $derived<Set<number>>(new Set(loadJson<number[]>(STORAGE_KEYS.SELECTED_SONGS, [])));
  const pickedSongs = $derived(
    allSongs.filter((s) => s.id != null && pickedSongIds.has(s.id)).sort((a, b) => (a.duration || 0) - (b.duration || 0))
  );
  const categorizedSongs = $derived.by(() => {
    const groups = new Map<string, Song[]>();
    for (const s of allSongs) {
      const cat = s.category || 'その他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }
    return [...groups.entries()];
  });

  function buildTiersFromDeck(deck: (Card | null)[]): EventBonusTier[] {
    return deck.map((c) => (c && c.ID != null ? currentTierMap.get(c.ID) ?? 'none' : 'none'));
  }

  function* multisetIndices(N: number, k: number): Generator<number[]> {
    if (N <= 0 || k <= 0) return;
    const idx = new Array(k).fill(0);
    while (true) {
      yield idx;
      let i = k - 1;
      while (i >= 0 && idx[i] === N - 1) i--;
      if (i < 0) break;
      const v = idx[i] + 1;
      for (let j = i; j < k; j++) idx[j] = v;
    }
  }

  /** multisetIndices の k=0 対応版: k=0 のとき空組合せを 1 回だけ yield する */
  function* multisetIndicesOrEmpty(N: number, k: number): Generator<number[]> {
    if (k === 0) { yield []; return; }
    yield* multisetIndices(N, k);
  }

  function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(2)} 秒`;
    const m = Math.floor(s / 60);
    return `${m}分 ${(s - m * 60).toFixed(1)}秒`;
  }

  async function runSearch() {
    if (!selectedSong || currentCandidates.length < 1) return;

    const totalEvals = comboCount;
    if (totalEvals > 5_000_000) {
      const estMinutes = Math.ceil(totalEvals / 300_000 / 60);
      const ok = confirm(
        `評価する組合せが ${totalEvals.toLocaleString()} 通りあります。\n計算時間は目安として ${estMinutes} 分以上かかる可能性があります。\n続行しますか？`
      );
      if (!ok) return;
    }

    abortRequested = false;
    searching = true;
    progressPct = 0;
    progressText = '準備中…';

    const scoreOptions: ScoreOptions = {
      scoreUpAssist,
      scoreUpBadgeRate,
    };

    const groupSizes = computeGroupSizes(selectedSong);
    const rabbit = loadRabbitNotes();
    const skillLevels: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
    const trained: boolean[] = [true, true, true, true, true, true];
    const emptyShared: number[][] = [[], [], [], [], [], []];
    const notesCount = selectedSong.notes_count
      || flattenNotes(selectedSong, 42).length;

    const TOP_K = 10;
    const top: DeckRecord[] = [];
    const pushTop = (rec: DeckRecord) => {
      if (top.length < TOP_K) {
        top.push(rec);
        top.sort((a, b) => b.score - a.score);
      } else if (rec.score > top[TOP_K - 1].score) {
        top[TOP_K - 1] = rec;
        top.sort((a, b) => b.score - a.score);
      }
    };

    const candidates = currentCandidates;
    const N = candidates.length;
    const ownedSlice = ownedCandidates;
    const Nowned = ownedSlice.length;
    const ownedLimitMap = new Map<number, number>();
    for (const c of ownedSlice) ownedLimitMap.set(c.ID!, ownedCountOf(c));
    const deck: (Card | null)[] = new Array(6).fill(null);
    let evaluated = 0;
    const YIELD_EVERY = 3000;
    const t0 = performance.now();

    const evaluateDeck = (): DeckRecord => {
      const tiers = buildTiersFromDeck(deck);
      const team = computeTeam(
        deck, allBroachs, selectedSong, tiers, trained, undefined, emptyShared, skillLevels, rabbit
      );
      const exclusion = computeShrinkExclusion(team, groupSizes);
      const notes = flattenNotes(selectedSong, 42, exclusion);
      const rec: DeckRecord = {
        cardIds: [deck[0]!.ID!, deck[1]!.ID!, deck[2]!.ID!, deck[3]!.ID!, deck[4]!.ID!, deck[5]!.ID!],
        score: 0,
      };
      let score = 0;
      if (evalMode === 'expected') {
        const e = calcExpectedScore(team, notes, notesCount, scoreOptions);
        score = e.finalScore;
        rec.baseScore = e.baseScore;
        rec.scoreUpExpected = e.scoreUpExpected;
        rec.shrinkExpected = e.shrinkExpected;
        rec.liveEndScore = e.liveEndScore;
        rec.finalScore = e.finalScore;
      } else {
        score = calcMaxScore(team, notes, scoreOptions);
        rec.finalScore = score;
      }
      rec.score = score;
      return rec;
    };

    const reportProgress = async () => {
      const pct = Math.min(100, Math.round((evaluated / Math.max(1, totalEvals)) * 100));
      progressPct = pct;
      const speed = evaluated / ((performance.now() - t0) / 1000);
      const etaSec = Math.max(0, (totalEvals - evaluated) / Math.max(1, speed));
      progressText = `探索中… ${pct}% (${evaluated.toLocaleString()} / ${totalEvals.toLocaleString()}, 残り約 ${formatElapsed(etaSec * 1000)}, 暫定 1位: ${top[0] ? top[0].score.toLocaleString() : '-'})`;
      await new Promise<void>((r) => setTimeout(r, 0));
    };

    if (ownedOnly) {
      // 所持カードで検索: center + member1..4 を所持枚数の範囲内で組合せ、フレンドは全候補
      // (center, friend) 対称性は所持プールが非対称なため利用しない
      outer1:
      for (let ci = 0; ci < Nowned; ci++) {
        deck[0] = ownedSlice[ci];
        for (const members of multisetIndices(Nowned, 4)) {
          deck[1] = ownedSlice[members[0]];
          deck[2] = ownedSlice[members[1]];
          deck[3] = ownedSlice[members[2]];
          deck[4] = ownedSlice[members[3]];

          // 5 スロット内の所持枚数違反を skip
          const usage = new Map<number, number>();
          for (let i = 0; i < 5; i++) {
            const id = deck[i]!.ID!;
            usage.set(id, (usage.get(id) ?? 0) + 1);
          }
          let valid = true;
          for (const [id, n] of usage) {
            if (n > (ownedLimitMap.get(id) ?? 0)) { valid = false; break; }
          }
          if (!valid) continue;

          // 縮小2枚条件: スロット0-4の縮小枚数からフレンド候補を縮小持ち/それ以外に絞る
          let friendPool = candidates;
          if (shrinkPairOnly) {
            let shrinkCount5 = 0;
            for (let i = 0; i < 5; i++) {
              if (isShrinkCard(deck[i])) shrinkCount5++;
            }
            if (shrinkCount5 === SHRINK_PAIR_TARGET) friendPool = nonShrinkCandidates;
            else if (shrinkCount5 === SHRINK_PAIR_TARGET - 1) friendPool = shrinkCandidates;
            else continue;
          }

          for (let fi = 0; fi < friendPool.length; fi++) {
            deck[5] = friendPool[fi];
            pushTop(evaluateDeck());
            evaluated++;
            if (evaluated % YIELD_EVERY === 0) {
              await reportProgress();
              if (abortRequested) break outer1;
            }
          }
        }
      }
    } else if (shrinkPairOnly) {
      // 縮小2枚条件: 候補を縮小持ち S / それ以外 T に分割し、
      // (center, friend) ペア内の縮小枚数 s2 → メンバーの縮小枚数 k = 2 − s2 として
      // S から k 枚 + T から 4−k 枚の多重集合を直接列挙する（条件外の組合せは生成しない）
      const S = shrinkCandidates;
      const T = nonShrinkCandidates;
      outer3:
      for (let s2 = 0; s2 <= SHRINK_PAIR_TARGET; s2++) {
        const k = SHRINK_PAIR_TARGET - s2;
        if (k < 0 || k > 4) continue;
        const pairGen: Generator<[Card, Card]> = (function* () {
          if (s2 === 0) {
            for (const p of multisetIndices(T.length, 2)) yield [T[p[0]], T[p[1]]] as [Card, Card];
          } else if (s2 === 1) {
            for (const s of S) for (const t of T) yield [s, t] as [Card, Card];
          } else {
            for (const p of multisetIndices(S.length, 2)) yield [S[p[0]], S[p[1]]] as [Card, Card];
          }
        })();
        for (const [c0, c5] of pairGen) {
          deck[0] = c0;
          deck[5] = c5;
          for (const sm of multisetIndicesOrEmpty(S.length, k)) {
            for (const nm of multisetIndicesOrEmpty(T.length, 4 - k)) {
              for (let i = 0; i < k; i++) deck[1 + i] = S[sm[i]];
              for (let i = 0; i < 4 - k; i++) deck[1 + k + i] = T[nm[i]];
              pushTop(evaluateDeck());
              evaluated++;
              if (evaluated % YIELD_EVERY === 0) {
                await reportProgress();
                if (abortRequested) break outer3;
              }
            }
          }
        }
      }
    } else {
      // (center, friend) は UR/UR でセンタースキルレートが等しく team 値が入れ替え対称 → 多重集合で列挙
      // (member1..4) も team 値計算上の位置依存性がないため多重集合で列挙
      outer2:
      for (const boost of multisetIndices(N, 2)) {
        deck[0] = candidates[boost[0]];
        deck[5] = candidates[boost[1]];
        for (const members of multisetIndices(N, 4)) {
          deck[1] = candidates[members[0]];
          deck[2] = candidates[members[1]];
          deck[3] = candidates[members[2]];
          deck[4] = candidates[members[3]];
          pushTop(evaluateDeck());
          evaluated++;
          if (evaluated % YIELD_EVERY === 0) {
            await reportProgress();
            if (abortRequested) break outer2;
          }
        }
      }
    }

    const elapsedMs = Math.round(performance.now() - t0);

    if (top.length === 0) {
      alert('評価できる組合せがありませんでした');
    } else {
      // 最適編成の center + member1..4 を固定し、friend だけ全候補に切り替えて Top 5 を抽出
      const best = top[0];
      const fixed = best.cardIds.map((id) => candidates.find((c) => c.ID === id) ?? null);
      // 縮小2枚条件: スロット0-4の縮小枚数を維持できるフレンドのみ差し替え候補にする
      let friendSwapPool = candidates;
      if (shrinkPairOnly) {
        let fixedShrink = 0;
        for (let i = 0; i < 5; i++) {
          if (isShrinkCard(fixed[i])) fixedShrink++;
        }
        friendSwapPool = fixedShrink === SHRINK_PAIR_TARGET ? nonShrinkCandidates
          : fixedShrink === SHRINK_PAIR_TARGET - 1 ? shrinkCandidates
          : [];
      }
      const friendScores: FriendCandidate[] = [];
      for (const cand of friendSwapPool) {
        fixed[5] = cand;
        const tiers = buildTiersFromDeck(fixed);
        const team = computeTeam(
          fixed, allBroachs, selectedSong, tiers, trained, undefined, emptyShared, skillLevels, rabbit
        );
        const exclusion = computeShrinkExclusion(team, groupSizes);
        const notes = flattenNotes(selectedSong, 42, exclusion);
        let score = 0;
        if (evalMode === 'expected') {
          score = calcExpectedScore(team, notes, notesCount, scoreOptions).finalScore;
        } else {
          score = calcMaxScore(team, notes, scoreOptions);
        }
        friendScores.push({ cardId: cand.ID!, score });
      }
      friendScores.sort((a, b) => b.score - a.score);
      const topFriends = friendScores.slice(0, 5);

      lastResult = {
        best: top[0],
        top,
        topFriends,
        evaluated,
        elapsedMs,
        evalMode,
        aborted: abortRequested,
      };
    }
    searching = false;
  }

  function requestAbort() {
    abortRequested = true;
  }

  function getCardById(id: number | null): Card | null {
    if (id == null) return null;
    return allCards.find((c) => c.ID === id) || null;
  }

  function sendToScoreCalc() {
    if (!lastResult || !selectedSong) return;
    const rec = lastResult.best;
    const tiers = buildTiersFromDeck(rec.cardIds.map(getCardById));
    const state = {
      songId: selectedSong.id,
      deckIds: rec.cardIds,
      bonusTiers: tiers,
      trained: [true, true, true, true, true, true],
      sharedBroachs: [[], [], [], [], [], []],
      skillLevels: [5, 5, 5, 5, 5, 5],
    };
    saveJson(STORAGE_KEYS.SCORE_CALC_STATE, state);
    window.location.href = `${base}score-calc/`;
  }

  // 詳細用の計算
  const bestContext = $derived.by(() => {
    if (!lastResult || !selectedSong) return null;
    const deck = lastResult.best.cardIds.map(getCardById);
    const tiers = buildTiersFromDeck(deck);
    const skillLevels: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
    const trained: boolean[] = [true, true, true, true, true, true];
    const team = computeTeam(deck, allBroachs, selectedSong, tiers, trained, undefined, [[], [], [], [], [], []], skillLevels, loadRabbitNotes());
    const resolvedBroachs = resolveDeckBroachs(deck, allBroachs, selectedSong, undefined);
    return { team, deck, resolvedBroachs };
  });
  const bestTeam = $derived(bestContext?.team ?? null);

  type ResolvedBroachItem = NonNullable<ReturnType<NonNullable<ReturnType<typeof resolveDeckBroachs>['get']>>>[number];
  function broachLabel(rb: ResolvedBroachItem): string {
    const br = rb.broach;
    const mult = (rb.active ? rb.multiplier : 1) ?? 1;
    const stats: string[] = [];
    if (br.shout) stats.push(`S+${(br.shout * mult).toLocaleString()}`);
    if (br.beat) stats.push(`B+${(br.beat * mult).toLocaleString()}`);
    if (br.melody) stats.push(`M+${(br.melody * mult).toLocaleString()}`);
    if (br.score) stats.push(`スコア+${br.score}`);
    const statStr = stats.join('/');
    const baseLabel = br.condition
      ? `${br.condition}${statStr ? ' ' + statStr : ''}`
      : statStr || `ブローチ#${br.id ?? '?'}`;
    return br.broach_type === 5 && rb.active && mult > 1 ? `${baseLabel}（${mult}枚）` : baseLabel;
  }
</script>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
  <label for="song-select" class="block text-xs font-bold text-gray-700 dark:text-slate-200 mb-2">🎵 楽曲</label>
  <select
    id="song-select"
    bind:value={selectedSongId}
    class="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
  >
    <option value="">楽曲を選択</option>
    {#if pickedSongs.length > 0}
      <optgroup label={`選択中の曲（${pickedSongs.length}曲・秒数順）`}>
        {#each pickedSongs as s}
          <option value={s.id}>{s.song_name} ({s.difficulty || ''}) - {s.duration || '?'}秒</option>
        {/each}
      </optgroup>
    {/if}
    {#each categorizedSongs as [cat, songs]}
      <optgroup label={cat}>
        {#each songs as s}
          <option value={s.id}>{s.song_name} ({s.difficulty || ''})</option>
        {/each}
      </optgroup>
    {/each}
  </select>
  {#if selectedSong}
    <div class="mt-3 text-xs text-gray-600 dark:text-slate-300">
      <div class="flex flex-wrap gap-3">
        <span><b>{selectedSong.song_name}</b></span>
        <span class="text-gray-400 dark:text-slate-500">|</span>
        <span>{selectedSong.difficulty || '-'} / {selectedSong.duration || '?'}秒 / {(selectedSong.notes_count || 0).toLocaleString()}ノーツ</span>
        <span class="text-gray-400 dark:text-slate-500">|</span>
        <span style="color:{ATTR_HEX.Shout}">Shout {Math.round((selectedSong.shout_ratio || 0) * 100)}%</span>
        <span style="color:{ATTR_HEX.Beat}">Beat {Math.round((selectedSong.beat_ratio || 0) * 100)}%</span>
        <span style="color:{ATTR_HEX.Melody}">Melody {Math.round((selectedSong.melody_ratio || 0) * 100)}%</span>
      </div>
    </div>
  {/if}
</section>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
  <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-2">📅 現在開催中のイベント</h2>
  <div class="text-xs text-gray-600 dark:text-slate-300">
    {#if currentLiveEvents.length === 0}
      <p class="text-gray-400 dark:text-slate-500">現在開催中のイベントはありません。</p>
    {:else}
      <ul class="mb-2 list-disc pl-5">
        {#each currentLiveEvents as ev}
          <li class="mb-0.5"><b>{ev.eventname}</b> <span class="text-gray-400 dark:text-slate-500 text-[11px]">({ev.start_date} 〜 {ev.end_date} 17:00)</span></li>
        {/each}
      </ul>
      <div class="mb-2">
        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-400 mr-1">金特効</span>
        <b>{goldCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 dark:text-slate-500 text-[10px]">（所持 {ownedGoldCount}）</span>{/if}
        <span class="ml-3 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-400 dark:border-slate-500 mr-1">銀特効</span>
        <b>{silverCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 dark:text-slate-500 text-[10px]">（所持 {ownedSilverCount}）</span>{/if}
        <span class="ml-3">候補合計 <b>{currentCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 dark:text-slate-500 text-[10px]">（所持 {ownedCandidates.length}）</span>{/if} → 評価する組合せ <b>{comboCount.toLocaleString()}</b> 通り</span>
      </div>
      <details class="mt-2">
        <summary class="cursor-pointer text-[11px] text-indigo-600">候補衣装を展開</summary>
        <div class="mt-2">
          <div class="text-[11px] font-bold text-yellow-700">金特効（{goldCandidates.length}枚）</div>
          <div>
            {#each goldCandidates.slice(0, 30) as c}
              {@const attr = normalizeAttribute(c.attribute)}
              {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
              <span class="inline-flex items-center gap-1 mr-1 mb-1 px-1.5 py-0.5 text-[10px] rounded border" style="border-color:{attrColor}; color:{attrColor}">
                {c.cardname || ''}<span class="text-gray-400 dark:text-slate-500">({c.name || ''})</span>
              </span>
            {/each}
            {#if goldCandidates.length > 30}
              <span class="text-[10px] text-gray-400 dark:text-slate-500">…他 {goldCandidates.length - 30}枚</span>
            {/if}
          </div>
          <div class="mt-2 text-[11px] font-bold text-gray-500 dark:text-slate-400">銀特効（{silverCandidates.length}枚）</div>
          <div>
            {#each silverCandidates.slice(0, 30) as c}
              {@const attr = normalizeAttribute(c.attribute)}
              {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
              <span class="inline-flex items-center gap-1 mr-1 mb-1 px-1.5 py-0.5 text-[10px] rounded border" style="border-color:{attrColor}; color:{attrColor}">
                {c.cardname || ''}<span class="text-gray-400 dark:text-slate-500">({c.name || ''})</span>
              </span>
            {/each}
            {#if silverCandidates.length > 30}
              <span class="text-[10px] text-gray-400 dark:text-slate-500">…他 {silverCandidates.length - 30}枚</span>
            {/if}
          </div>
        </div>
      </details>
    {/if}
  </div>
</section>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
    <div>
      <label for="eval-mode" class="block text-xs text-gray-500 dark:text-slate-400 mb-1">評価指標</label>
      <select id="eval-mode" bind:value={evalMode} class="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm">
        <option value="expected">算術期待値（推奨）</option>
        <option value="max">理論最大値（全スキル発動）</option>
      </select>
    </div>
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={scoreUpAssist} class="rounded" />
      <span class="text-xs">SCOREUPアシスト（+12%）</span>
    </label>
    <label class="flex items-center gap-2 text-xs">
      <span>SCOREUPバッジ</span>
      <input type="number" bind:value={scoreUpBadgeRate} class="w-16 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm" min="0" max="100" step="1" />
      <span>%</span>
    </label>
  </div>
  <div class="mt-3 border-t pt-3 space-y-2">
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" bind:checked={ownedOnly} class="rounded" />
      <span><b>所持衣装で検索</b> — センター + メンバー4枚を所持枚数の範囲内で組合せ、フレンドは全候補から評価します</span>
    </label>
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" bind:checked={shrinkPairOnly} class="rounded" />
      <span><b>判定縮小2枚編成に限定</b> — フレンドを含む6枠中、判定縮小スキル持ちがちょうど2枚の組合せのみ探索します（縮小持ち候補 {shrinkCandidates.length} 枚）</span>
    </label>
  </div>
</section>

<div class="space-y-2 mb-4">
  <div class="flex gap-2">
    <button
      type="button"
      class="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={searchDisabled}
      onclick={runSearch}
    >
      {searching ? '探索中…' : '🔍 総当たり探索を開始'}
    </button>
    {#if searching}
      <button type="button" class="px-4 bg-red-500 text-white py-3 rounded-lg font-bold text-sm hover:bg-red-600 transition-colors" onclick={requestAbort}>
        中断
      </button>
    {/if}
  </div>
  {#if searchDisabledReason && !searching}
    <p class="text-xs text-center text-amber-600">{searchDisabledReason}</p>
  {/if}
  {#if searching}
    <div>
      <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
        <div class="bg-indigo-600 h-2 rounded-full transition-all" style="width: {progressPct}%"></div>
      </div>
      <p class="text-xs text-gray-500 dark:text-slate-400 mt-1 text-center">{progressText}</p>
    </div>
  {/if}
</div>

{#if lastResult}
  {@const result = lastResult}
  {@const modeLabel = result.evalMode === 'expected' ? '算術期待値（最終リザルト）' : '理論最大値（全スキル発動）'}
  <section class="space-y-4">
    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow p-4 md:p-6">
      <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest text-center">理論値最大編成</div>
      <div class="text-3xl md:text-5xl font-bold text-indigo-700 text-center mt-1">{result.best.score.toLocaleString()}</div>
      <div class="text-center text-xs text-gray-500 dark:text-slate-400 mt-1">
        {result.aborted ? `${modeLabel} ※探索中断` : modeLabel}
      </div>
      <div class="mt-3 grid grid-cols-2 gap-4 text-center text-xs">
        <div>
          <div class="text-gray-500 dark:text-slate-400">評価済み組合せ</div>
          <div class="font-bold text-gray-700 dark:text-slate-200 text-base">{result.evaluated.toLocaleString()}</div>
        </div>
        <div>
          <div class="text-gray-500 dark:text-slate-400">計算時間</div>
          <div class="font-bold text-gray-700 dark:text-slate-200 text-base">{formatElapsed(result.elapsedMs)}</div>
        </div>
      </div>
    </div>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">🎴 最適編成</h2>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {#each DISPLAY_ORDER as i}
          {@const card = getCardById(result.best.cardIds[i])}
          {#if card}
            {@const attr = normalizeAttribute(card.attribute)}
            {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
            {@const rarityClass = RARITY_BADGE_CLASSES[card.rarity || ''] || 'bg-gray-300'}
            {@const attrBgClass = ATTR_BADGE_BG[attr] || 'bg-gray-300'}
            {@const tier = currentTierMap.get(card.ID!) ?? 'none'}
            {@const bonusLabel = BONUS_LABEL[tier]}
            {@const bonusClass = BONUS_CLASS[tier]}
            {@const slotLabel = SLOT_LABELS[i]}
            {@const labelColor = i === 0 ? 'text-indigo-600' : i === 5 ? 'text-amber-600' : 'text-gray-500'}
            <div>
              <div class="text-[10px] text-center {labelColor} font-bold mb-1">{slotLabel}</div>
              <div class="border-2 rounded-lg p-1.5 flex flex-col items-center min-h-[120px]" style="border-color:{attrColor}">
                <img src={cardThumbUrl(card.ID!)} alt={card.cardname || ''} class="w-full max-w-[60px] h-auto rounded mb-1" loading="lazy" />
                <div class="flex gap-0.5 mb-1">
                  <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded {rarityClass}">{card.rarity || '?'}</span>
                  <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded {attrBgClass}">{attr}</span>
                </div>
                <div class="text-[9px] text-gray-600 dark:text-slate-300 text-center truncate w-full" title={card.cardname || ''}>{card.cardname || ''}</div>
                <div class="text-[8px] text-gray-400 dark:text-slate-500 text-center">{card.name || ''}</div>
                <div class="mt-1 text-[9px] {bonusClass}">{bonusLabel}</div>
              </div>
            </div>
          {:else}
            <div class="text-center text-gray-400 dark:text-slate-500">空</div>
          {/if}
        {/each}
      </div>
    </section>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">🧾 衣装詳細</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-gray-500 dark:text-slate-400 border-b">
              <th class="text-left py-1 px-1">スロット</th>
              <th class="text-left py-1 px-1">衣装名</th>
              <th class="text-center py-1 px-1">特効</th>
              <th class="text-right py-1 px-1 text-red-500">Shout</th>
              <th class="text-right py-1 px-1 text-green-500">Beat</th>
              <th class="text-right py-1 px-1 text-blue-500">Melody</th>
              <th class="text-left py-1 px-1">スキル</th>
              <th class="text-left py-1 px-1">効果</th>
              <th class="text-left py-1 px-1">固定ブローチ</th>
            </tr>
          </thead>
          <tbody>
            {#if bestTeam && bestContext}
              {#each DISPLAY_ORDER as i}
                {@const dc = bestTeam.cards.find((x) => x.slotIndex === i)}
                {@const card = getCardById(result.best.cardIds[i])}
                {#if dc && card}
                  {@const tier = buildTiersFromDeck(result.best.cardIds.map(getCardById))[i]}
                  {@const bonusLabel = BONUS_LABEL[tier]}
                  {@const bonusClass = BONUS_CLASS[tier]}
                  {@const sl = getApSkillLevel(card, 5)}
                  {@const skillEffect = formatSkillEffect(card.ap_skill_type, card.ap_skill_req, sl)}
                  {@const labelColor = i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500'}
                  {@const slotBroachs = bestContext.resolvedBroachs.get(i) ?? []}
                  <tr class="border-t">
                    <td class="py-1 px-1 text-[10px] {labelColor}">{SLOT_LABELS[i]}</td>
                    <td class="py-1 px-1">
                      <div>{card.cardname || ''}</div>
                      <div class="text-[10px] text-gray-400 dark:text-slate-500">{card.name || ''}</div>
                    </td>
                    <td class="py-1 px-1 text-center {bonusClass}">{bonusLabel}</td>
                    <td class="py-1 px-1 text-right text-red-500">
                      {dc.shout_max.toLocaleString()}{#if dc.broachShout > 0}<div class="text-[9px] text-purple-600">+{dc.broachShout.toLocaleString()}</div>{/if}
                    </td>
                    <td class="py-1 px-1 text-right text-green-500">
                      {dc.beat_max.toLocaleString()}{#if dc.broachBeat > 0}<div class="text-[9px] text-purple-600">+{dc.broachBeat.toLocaleString()}</div>{/if}
                    </td>
                    <td class="py-1 px-1 text-right text-blue-500">
                      {dc.melody_max.toLocaleString()}{#if dc.broachMelody > 0}<div class="text-[9px] text-purple-600">+{dc.broachMelody.toLocaleString()}</div>{/if}
                    </td>
                    <td class="py-1 px-1">{card.ap_skill_type || '-'}</td>
                    <td class="py-1 px-1">{skillEffect}</td>
                    <td class="py-1 px-1">
                      {#if slotBroachs.length === 0}
                        <span class="text-[10px] text-gray-300 dark:text-slate-600">—</span>
                      {:else}
                        {#each slotBroachs as rb}
                          {#if rb.broach.broach_type === 8}
                            <div class="text-[9px] text-gray-400 dark:text-slate-500 line-through" title="オート専用・計算対象外">🔮 {broachLabel(rb)}</div>
                          {:else if rb.active}
                            <div class="text-[9px] text-purple-700">🔮 {broachLabel(rb)}</div>
                          {:else}
                            <div class="text-[9px] text-gray-400 dark:text-slate-500" title="条件未達">🔮 {broachLabel(rb)}</div>
                          {/if}
                        {/each}
                      {/if}
                    </td>
                  </tr>
                {/if}
              {/each}
              <tr class="border-t-2 font-bold text-xs">
                <td colspan="3" class="py-1 px-1 text-right">チーム合計（ブローチ込み）</td>
                <td class="py-1 px-1 text-right text-red-500">{bestTeam.Shout.toLocaleString()}</td>
                <td class="py-1 px-1 text-right text-green-500">{bestTeam.Beat.toLocaleString()}</td>
                <td class="py-1 px-1 text-right text-blue-500">{bestTeam.Melody.toLocaleString()}</td>
                <td colspan="3"></td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">📊 スコア内訳</h2>
      <table class="w-full text-sm">
        <tbody>
          {#if result.best.baseScore != null}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">属性値による楽曲スコア</td><td class="text-right py-1">{result.best.baseScore.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.scoreUpExpected != null}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">スコアアップ期待値</td><td class="text-right py-1">{result.best.scoreUpExpected.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.shrinkExpected != null}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">判定縮小期待値</td><td class="text-right py-1">{result.best.shrinkExpected.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.liveEndScore != null}
            <tr class="border-t"><td class="text-gray-500 dark:text-slate-400 py-1">ライブ終了時スコア</td><td class="text-right py-1">{result.best.liveEndScore.toLocaleString()}</td></tr>
          {/if}
          {#if bestTeam && bestTeam.broachScoreBonus > 0}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">固定ブローチ スコア加算</td><td class="text-right py-1">+{bestTeam.broachScoreBonus.toLocaleString()}</td></tr>
          {/if}
          <tr><td class="text-gray-500 dark:text-slate-400 py-1 font-bold">最終リザルト</td><td class="text-right py-1 font-bold">{result.best.score.toLocaleString()}</td></tr>
        </tbody>
      </table>
    </section>

    {#if result.topFriends && result.topFriends.length > 0}
      <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-1">🤝 フレンド候補 TOP 5</h2>
        <p class="text-[11px] text-gray-500 dark:text-slate-400 mb-3">最適編成のセンター + メンバー4枚を固定し、フレンドだけ差し替えた場合のスコア（高い順）。マッチング次第で 1 位フレンドが取れない場合の代替候補です。</p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-500 dark:text-slate-400 border-b">
                <th class="text-left py-1 px-1">#</th>
                <th class="text-left py-1 px-1">衣装</th>
                <th class="text-center py-1 px-1">特効</th>
                <th class="text-right py-1 px-1">スコア</th>
              </tr>
            </thead>
            <tbody>
              {#each result.topFriends as f, rank}
                {@const card = getCardById(f.cardId)}
                {#if card}
                  {@const attr = normalizeAttribute(card.attribute)}
                  {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
                  {@const tier = currentTierMap.get(card.ID!) ?? 'none'}
                  {@const bonusLabel = BONUS_LABEL[tier]}
                  {@const bonusClass = BONUS_CLASS[tier]}
                  <tr class="border-t">
                    <td class="py-1 px-1 align-middle">{rank + 1}</td>
                    <td class="py-1 px-1 align-middle">
                      <div class="flex items-center gap-2">
                        <img
                          src={cardThumbUrl(card.ID!)}
                          alt={card.cardname || ''}
                          class="w-10 h-auto rounded border flex-shrink-0"
                          style="border-color:{attrColor}"
                          loading="lazy"
                        />
                        <div class="min-w-0">
                          <div class="truncate" style="color:{attrColor}">{card.cardname || ''}</div>
                          <div class="text-[10px] text-gray-400 dark:text-slate-500 truncate">{card.name || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td class="py-1 px-1 text-center align-middle {bonusClass}">{bonusLabel}</td>
                    <td class="py-1 px-1 text-right font-bold align-middle">{f.score.toLocaleString()}</td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-1">🏅 上位候補 TOP 10</h2>
      <p class="text-[10px] text-gray-400 dark:text-slate-500 mb-3">スロット表記: ★センター / ✦フレンド / それ以外はメンバー</p>
      <div class="space-y-2">
        {#each result.top as rec, rank}
          <div class="border rounded-lg p-2 flex items-center gap-3">
            <div class="flex-shrink-0 w-8 text-center">
              <div class="text-xs text-gray-400 dark:text-slate-500">#{rank + 1}</div>
            </div>
            <div class="flex-shrink-0 text-right">
              <div class="text-sm font-bold text-indigo-700">{rec.score.toLocaleString()}</div>
            </div>
            <div class="flex-1 min-w-0 overflow-x-auto">
              <div class="flex gap-1.5">
                {#each DISPLAY_ORDER as i}
                  {@const card = getCardById(rec.cardIds[i])}
                  {#if card}
                    {@const attr = normalizeAttribute(card.attribute)}
                    {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
                    {@const tier = currentTierMap.get(card.ID!) ?? 'none'}
                    {@const tierMark = tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : ''}
                    {@const slotMark = i === 0 ? '★' : i === 5 ? '✦' : ''}
                    {@const slotColor = i === 0 ? 'text-indigo-600' : i === 5 ? 'text-amber-600' : 'text-gray-400'}
                    <div class="flex-shrink-0 flex flex-col items-center w-20" title={`${SLOT_LABELS[i]}: ${card.cardname || ''} (${card.name || ''})`}>
                      <div class="text-[10px] {slotColor} font-bold leading-none">{slotMark}{tierMark}</div>
                      <img
                        src={cardThumbUrl(card.ID!)}
                        alt={card.cardname || ''}
                        class="w-9 h-auto rounded border mt-0.5"
                        style="border-color:{attrColor}"
                        loading="lazy"
                      />
                      <div class="mt-0.5 text-[9px] leading-tight text-center w-full truncate" style="color:{attrColor}">{card.cardname || ''}</div>
                      <div class="text-[8px] leading-tight text-center w-full truncate text-gray-400 dark:text-slate-500">{card.name || ''}</div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <div class="text-center">
      <button type="button" class="text-xs text-indigo-600 hover:underline" onclick={sendToScoreCalc}>
        この編成をスコア計算ページに送る →
      </button>
    </div>
  </section>
{/if}
