<script lang="ts">
  import type { Card } from '../../lib/data/fetchCardsJson';
  import { getApSkillLevel } from '../../lib/data/fetchCardsJson';
  import { formatSkillEffect } from '../../lib/score/skillFormatter';
  import type { Song } from '../../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../../lib/data/fetchFixedBroachsJson';
  import { normalizeAttribute } from '../../lib/score/types';
  import { computeTeam } from '../../lib/score/engine';
  import type { SearchResult } from '../../lib/score/maxScoreFinder';
  import { resolveDeckBroachs } from '../../lib/score/broachResolver';
  import { BONUS_LABEL, BONUS_CLASS } from '../../lib/data/eventBonusTiers';
  import { SHARED_BROACHS } from '../../lib/data/sharedBroachs';
  import type { EventBonusTier } from '../../lib/data/eventBonusTiers';
  import { ATTR_HEX } from '../../lib/constants';
  import RarityBadge from '../ui/RarityBadge.svelte';
  import AttributeBadge from '../ui/AttributeBadge.svelte';
  import { STORAGE_KEYS, saveJson } from '../../lib/storage';
  import { cardThumbUrl, formatElapsed } from '../../lib/ui';
  import { loadRabbitNotes } from '../../lib/data/rabbitNote';

  let { result, selectedSong, allCards, allBroachs, currentTierMap, base }: {
    result: SearchResult;
    selectedSong: Song | null;
    allCards: Card[];
    allBroachs: FixedBroach[];
    currentTierMap: Map<number, EventBonusTier>;
    base: string;
  } = $props();

  const SLOT_LABELS = ['センター', 'メンバー1', 'メンバー2', 'メンバー3', 'メンバー4', 'フレンド'];
  const DISPLAY_ORDER = [1, 2, 0, 3, 4, 5];

  const modeLabel = $derived(result.evalMode === 'expected' ? '算術期待値（最終リザルト）' : '理論最大値（全スキル発動）');

  function buildTiersFromDeck(deck: (Card | null)[]): EventBonusTier[] {
    return deck.map((c) => (c && c.ID != null ? currentTierMap.get(c.ID) ?? 'none' : 'none'));
  }

  function getCardById(id: number | null): Card | null {
    if (id == null) return null;
    return allCards.find((c) => c.ID === id) || null;
  }

  function sendToScoreCalc() {
    if (!selectedSong) return;
    const rec = result.best;
    const tiers = buildTiersFromDeck(rec.cardIds.map(getCardById));
    const state = {
      songId: selectedSong.id,
      deckIds: rec.cardIds,
      bonusTiers: tiers,
      trained: [true, true, true, true, true, true],
      sharedBroachs: rec.sharedBroachIds ?? [[], [], [], [], [], []],
      skillLevels: [5, 5, 5, 5, 5, 5],
    };
    saveJson(STORAGE_KEYS.SCORE_CALC_STATE, state);
    window.location.href = `${base}score-calc/`;
  }

  // 詳細用の計算
  const bestContext = $derived.by(() => {
    if (!selectedSong) return null;
    const deck = result.best.cardIds.map(getCardById);
    const tiers = buildTiersFromDeck(deck);
    const skillLevels: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
    const trained: boolean[] = [true, true, true, true, true, true];
    const team = computeTeam(deck, allBroachs, selectedSong, tiers, trained, undefined, result.best.sharedBroachIds ?? [[], [], [], [], [], []], skillLevels, loadRabbitNotes());
    const resolvedBroachs = resolveDeckBroachs(deck, allBroachs, selectedSong, undefined);
    return { team, deck, resolvedBroachs };
  });
  const bestTeam = $derived(bestContext?.team ?? null);

  function sharedBroachName(id: number): string {
    return SHARED_BROACHS.find((sb) => sb.id === id)?.name ?? `#${id}`;
  }

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
                <RarityBadge rarity={card.rarity} sizeClass="px-1 py-0.5 text-[9px]" fallbackLabel="?" />
                <AttributeBadge attribute={attr} sizeClass="px-1 py-0.5 text-[9px]" />
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
            {#if result.best.sharedBroachIds}
              <th class="text-left py-1 px-1">共通ブローチ</th>
            {/if}
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
                  {#if result.best.sharedBroachIds}
                    {@const sharedIds = result.best.sharedBroachIds[i] ?? []}
                    <td class="py-1 px-1">
                      {#if sharedIds.length === 0}
                        <span class="text-[10px] text-gray-300 dark:text-slate-600">—</span>
                      {:else}
                        {#each sharedIds as id}
                          <div class="text-[9px] text-purple-700" title={i === 5 ? '推奨ブローチ（所持制約なし）' : '所持ブローチから自動割当'}>💠 {sharedBroachName(id)}</div>
                        {/each}
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/if}
            {/each}
            <tr class="border-t-2 font-bold text-xs">
              <td colspan="3" class="py-1 px-1 text-right">チーム合計（ブローチ込み）</td>
              <td class="py-1 px-1 text-right text-red-500">{bestTeam.Shout.toLocaleString()}</td>
              <td class="py-1 px-1 text-right text-green-500">{bestTeam.Beat.toLocaleString()}</td>
              <td class="py-1 px-1 text-right text-blue-500">{bestTeam.Melody.toLocaleString()}</td>
              <td colspan={result.best.sharedBroachIds ? 4 : 3}></td>
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
