<script lang="ts">
  import { getApSkillLevel } from '../../lib/data/fetchCardsJson';
  import type { FixedBroach } from '../../lib/data/fetchFixedBroachsJson';
  import type { Song } from '../../lib/data/fetchSongsJson';
  import type { DeckState } from '../../lib/score/deckState';
  import { SLOT_LABELS, DISPLAY_ORDER } from '../../lib/score/deckState';
  import { formatSkillEffect } from '../../lib/score/skillFormatter';
  import { computeTeam, getCenterSkillRate } from '../../lib/score/engine';
  import { BONUS_LABEL, BONUS_CLASS } from '../../lib/data/eventBonusTiers';
  import { NOTE_RATE, SCOREUP_ASSIST_RATE } from '../../lib/score/constants';
  import { loadRabbitNotes } from '../../lib/data/rabbitNote';
  import { ATTR_TEXT_CLASS } from '../../lib/ui';

  let { deckState, selectedSong, allBroachs, scoreUpAssist }: {
    deckState: DeckState;
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
    scoreUpAssist: boolean;
  } = $props();

  type DetailRow = {
    i: number;
    slotClass: string;
    cardname: string;
    name: string;
    trainedLabel: string;
    trainedClass: string;
    bonusLabel: string;
    bonusClass: string;
    statShout: number;
    statBeat: number;
    statMelody: number;
    bS: number;
    bB: number;
    bM: number;
    skillType: string;
    skillEffect: string;
  };

  // 属性値・ブローチ・センタースキルの計算は computeTeam に一本化し、
  // このコンポーネントは engine の出力を表示するだけにする (ADR 0039)
  const detail = $derived.by(() => {
    const filledCards = deckState.cards.filter(c => c !== null);
    if (filledCards.length === 0) return null;

    const dummySong = (selectedSong || { song_name: '' }) as Song;
    const team = computeTeam(
      deckState.cards, allBroachs, dummySong, deckState.bonusTiers, deckState.trained,
      undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes(),
    );

    const rows: DetailRow[] = [];
    for (const i of DISPLAY_ORDER) {
      const card = deckState.cards[i];
      const dc = team.cards.find(c => c.slotIndex === i);
      if (!card || !dc) continue;
      const sl = getApSkillLevel(card, deckState.skillLevels[i]);
      const tier = deckState.bonusTiers[i];
      const trained = deckState.trained[i];
      rows.push({
        i,
        slotClass: i === 0 ? 'text-gray-900 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500',
        cardname: card.cardname || '',
        name: card.name || '',
        trainedLabel: trained ? '済' : '未',
        trainedClass: trained ? 'text-gray-900 font-bold' : 'text-gray-400',
        bonusLabel: BONUS_LABEL[tier],
        bonusClass: BONUS_CLASS[tier],
        statShout: dc.shout_max,
        statBeat: dc.beat_max,
        statMelody: dc.melody_max,
        bS: dc.broachShout,
        bB: dc.broachBeat,
        bM: dc.broachMelody,
        skillType: card.ap_skill_type || '-',
        skillEffect: formatSkillEffect(card.ap_skill_type, card.ap_skill_req, sl),
      });
    }

    const centerCard = deckState.cards[0];
    const friendCard = deckState.cards[5];
    const centerRate = centerCard ? getCenterSkillRate(centerCard.rarity) : 0;
    const friendRate = friendCard ? getCenterSkillRate(friendCard.rarity) : 0;

    const teamShout = team.Shout;
    const teamBeat = team.Beat;
    const teamMelody = team.Melody;
    const assistShout = scoreUpAssist ? Math.floor(teamShout * (1 + SCOREUP_ASSIST_RATE)) - teamShout : 0;
    const assistBeat = scoreUpAssist ? Math.floor(teamBeat * (1 + SCOREUP_ASSIST_RATE)) - teamBeat : 0;
    const assistMelody = scoreUpAssist ? Math.floor(teamMelody * (1 + SCOREUP_ASSIST_RATE)) - teamMelody : 0;
    const assistPct = Math.round(SCOREUP_ASSIST_RATE * 100);

    const deckShout  = teamShout  + assistShout;
    const deckBeat   = teamBeat   + assistBeat;
    const deckMelody = teamMelody + assistMelody;

    const noteShoutWhite  = Math.floor(deckShout  * NOTE_RATE.white);
    const noteBeatWhite   = Math.floor(deckBeat   * NOTE_RATE.white);
    const noteMelodyWhite = Math.floor(deckMelody * NOTE_RATE.white);
    const noteShoutColor  = Math.floor(deckShout  * NOTE_RATE.color);
    const noteBeatColor   = Math.floor(deckBeat   * NOTE_RATE.color);
    const noteMelodyColor = Math.floor(deckMelody * NOTE_RATE.color);

    return {
      rows,
      foot: {
        totalShout: team.rawShout, totalBeat: team.rawBeat, totalMelody: team.rawMelody,
        totalBS: team.broachShout, totalBB: team.broachBeat, totalBM: team.broachMelody,
        hasBroachRow: (team.broachShout + team.broachBeat + team.broachMelody) > 0,
        hasCenter: !!centerCard && centerRate > 0,
        hasFriend: !!friendCard && friendRate > 0,
        centerRate, friendRate,
        centerShout: team.centerShout, centerBeat: team.centerBeat, centerMelody: team.centerMelody,
        friendShout: team.friendShout, friendBeat: team.friendBeat, friendMelody: team.friendMelody,
        scoreUpAssist,
        assistPct, assistShout, assistBeat, assistMelody,
        deckShout, deckBeat, deckMelody,
        noteShoutWhite, noteBeatWhite, noteMelodyWhite,
        noteShoutColor, noteBeatColor, noteMelodyColor,
      },
    };
  });
</script>

{#if detail}
  {@const f = detail.foot}
  <details id="card-detail-section" class="surface-card p-4 group" open>
    <summary class="cursor-pointer text-sm font-bold text-gray-700 flex items-center justify-between select-none mb-3">
      <span>🧾 衣装詳細</span>
      <svg class="size-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </summary>
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-gray-500 border-b">
            <th class="text-left py-1 px-1">スロット</th>
            <th class="text-left py-1 px-1">衣装名</th>
            <th class="text-center py-1 px-1">特訓</th>
            <th class="text-center py-1 px-1">特効</th>
            <th class="text-right py-1 px-1 text-red-500">Shout</th>
            <th class="text-right py-1 px-1 text-green-500">Beat</th>
            <th class="text-right py-1 px-1 text-blue-500">Melody</th>
            <th class="text-right py-1 px-1">ブローチS</th>
            <th class="text-right py-1 px-1">ブローチB</th>
            <th class="text-right py-1 px-1">ブローチM</th>
            <th class="text-left py-1 px-1">スキル</th>
            <th class="text-left py-1 px-1">効果</th>
          </tr>
        </thead>
        <tbody id="card-detail-body">
          {#each detail.rows as row (row.i)}
            <tr class="border-t">
              <td class="py-1 px-1 text-[10px] {row.slotClass}">{SLOT_LABELS[row.i]}</td>
              <td class="py-1 px-1">
                <div>{row.cardname}</div>
                <div class="text-[10px] text-gray-400">{row.name}</div>
              </td>
              <td class="py-1 px-1 text-center {row.trainedClass}">{row.trainedLabel}</td>
              <td class="py-1 px-1 text-center {row.bonusClass}">{row.bonusLabel}</td>
              <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Shout}">{row.statShout.toLocaleString()}</td>
              <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Beat}">{row.statBeat.toLocaleString()}</td>
              <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Melody}">{row.statMelody.toLocaleString()}</td>
              <td class="py-1 px-1 text-right">{row.bS || '-'}</td>
              <td class="py-1 px-1 text-right">{row.bB || '-'}</td>
              <td class="py-1 px-1 text-right">{row.bM || '-'}</td>
              <td class="py-1 px-1">{row.skillType}</td>
              <td class="py-1 px-1">{row.skillEffect}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot id="card-detail-foot">
          <tr class="border-t-2 border-gray-300 font-bold text-xs">
            <td colspan="4" class="py-1 px-1 text-right text-gray-700">単純属性値計</td>
            <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Shout}">{f.totalShout.toLocaleString()}</td>
            <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Beat}">{f.totalBeat.toLocaleString()}</td>
            <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Melody}">{f.totalMelody.toLocaleString()}</td>
            <td class="py-1 px-1 text-right">{f.totalBS || '-'}</td>
            <td class="py-1 px-1 text-right">{f.totalBB || '-'}</td>
            <td class="py-1 px-1 text-right">{f.totalBM || '-'}</td>
            <td colspan="2"></td>
          </tr>
          {#if f.hasBroachRow}
            <tr class="font-bold text-xs text-gray-900">
              <td colspan="4" class="py-1 px-1 text-right">ブローチ</td>
              <td class="py-1 px-1 text-right">{f.totalBS > 0 ? `+${f.totalBS.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.totalBB > 0 ? `+${f.totalBB.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.totalBM > 0 ? `+${f.totalBM.toLocaleString()}` : '-'}</td>
              <td colspan="3"></td>
              <td colspan="2"></td>
            </tr>
          {/if}
          {#if f.hasCenter}
            <tr class="font-bold text-xs text-purple-600">
              <td colspan="4" class="py-1 px-1 text-right">センターSkill (+{f.centerRate}%)</td>
              <td class="py-1 px-1 text-right">{f.centerShout > 0 ? `+${f.centerShout.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.centerBeat > 0 ? `+${f.centerBeat.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.centerMelody > 0 ? `+${f.centerMelody.toLocaleString()}` : '-'}</td>
              <td colspan="3"></td>
              <td colspan="2"></td>
            </tr>
          {/if}
          {#if f.hasFriend}
            <tr class="font-bold text-xs text-purple-600">
              <td colspan="4" class="py-1 px-1 text-right">FセンターSkill (+{f.friendRate}%)</td>
              <td class="py-1 px-1 text-right">{f.friendShout > 0 ? `+${f.friendShout.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.friendBeat > 0 ? `+${f.friendBeat.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.friendMelody > 0 ? `+${f.friendMelody.toLocaleString()}` : '-'}</td>
              <td colspan="3"></td>
              <td colspan="2"></td>
            </tr>
          {/if}
          {#if f.scoreUpAssist}
            <tr class="border-t-2 border-gray-300 font-bold text-xs text-emerald-600">
              <td colspan="4" class="py-1 px-1 text-right">ScoreUPアシスト (+{f.assistPct}%)</td>
              <td class="py-1 px-1 text-right">{f.assistShout > 0 ? `+${f.assistShout.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.assistBeat > 0 ? `+${f.assistBeat.toLocaleString()}` : '-'}</td>
              <td class="py-1 px-1 text-right">{f.assistMelody > 0 ? `+${f.assistMelody.toLocaleString()}` : '-'}</td>
              <td colspan="3"></td>
              <td colspan="2"></td>
            </tr>
          {/if}
          <tr class="border-t-2 border-gray-300 font-bold text-xs">
            <td colspan="4" class="py-1 px-1 text-right text-gray-700">デッキ合計</td>
            <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Shout}">{f.deckShout.toLocaleString()}</td>
            <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Beat}">{f.deckBeat.toLocaleString()}</td>
            <td class="py-1 px-1 text-right {ATTR_TEXT_CLASS.Melody}">{f.deckMelody.toLocaleString()}</td>
            <td colspan="3"></td>
            <td colspan="2"></td>
          </tr>
          <tr class="text-xs text-gray-500">
            <td colspan="4" class="py-0.5 px-1 text-right">⚪🟢/1ノーツ</td>
            <td class="py-0.5 px-1 text-right {ATTR_TEXT_CLASS.Shout}">{f.noteShoutWhite.toLocaleString()}</td>
            <td class="py-0.5 px-1 text-right {ATTR_TEXT_CLASS.Beat}">{f.noteBeatWhite.toLocaleString()}</td>
            <td class="py-0.5 px-1 text-right {ATTR_TEXT_CLASS.Melody}">{f.noteMelodyWhite.toLocaleString()}</td>
            <td colspan="3"></td>
            <td colspan="2"></td>
          </tr>
          <tr class="text-xs text-gray-500">
            <td colspan="4" class="py-0.5 px-1 text-right">🔵🔴/1ノーツ</td>
            <td class="py-0.5 px-1 text-right {ATTR_TEXT_CLASS.Shout}">{f.noteShoutColor.toLocaleString()}</td>
            <td class="py-0.5 px-1 text-right {ATTR_TEXT_CLASS.Beat}">{f.noteBeatColor.toLocaleString()}</td>
            <td class="py-0.5 px-1 text-right {ATTR_TEXT_CLASS.Melody}">{f.noteMelodyColor.toLocaleString()}</td>
            <td colspan="3"></td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="text-xs text-gray-400 mt-2">※ オート専用ブローチはスコア計算の対象外です</p>
  </details>
{/if}
