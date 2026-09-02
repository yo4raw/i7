<script lang="ts">
  import type { EventRow } from '../lib/data/fetchEventsCsv';
  import { classifyEventStatus, eventStartMs, eventEndMs, formatDuration, formatEventEnd, EVENT_END_UNDETERMINED_LABEL, type EventStatus } from '../lib/data/eventPeriod';

  type Props = {
    events: EventRow[];
    eventTypes: string[];
    base: string;
  };

  let { events, eventTypes, base }: Props = $props();

  type Status = EventStatus;

  let now = $state(Date.now());
  let text = $state('');
  let typeFilter = $state('');
  let statusFilter = $state<Status | ''>('');

  $effect(() => {
    const hasLive = events.some((ev) => classifyEventStatus(ev.start_date, ev.end_date, now) === 'live');
    const interval = hasLive ? 1000 : 30000;
    const id = setInterval(() => { now = Date.now(); }, interval);
    return () => clearInterval(id);
  });

  const enriched = $derived(
    events.map((ev) => {
      const status = classifyEventStatus(ev.start_date, ev.end_date, now);
      const start = eventStartMs(ev.start_date);
      const end = eventEndMs(ev.end_date);
      let remainText = '';
      let remainClass = '';
      if (status === 'live') {
        // 終了未定の実施中イベントは残り時間を出せない
        remainText = end === null ? '' : `残り ${formatDuration(end - now, 'second')}`;
        remainClass = 'text-red-600 font-medium';
      } else if (status === 'upcoming' && start !== null) {
        remainText = `開始まで ${formatDuration(start - now, 'minute')}`;
        remainClass = 'text-gray-500';
      }
      const endShort = end === null ? EVENT_END_UNDETERMINED_LABEL : ev.end_date;
      return { ev, status, remainText, remainClass, endShort, endLong: formatEventEnd(ev.end_date) };
    })
  );

  const filtered = $derived.by(() => {
    const t = text.toLowerCase();
    return enriched.filter(({ ev, status }) => {
      if (t && !ev.eventname.toLowerCase().includes(t)) return false;
      if (typeFilter && ev.eventtype !== typeFilter) return false;
      if (statusFilter && status !== statusFilter) return false;
      return true;
    });
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput(v: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { text = v; }, 200);
  }

  function reset() {
    text = '';
    typeFilter = '';
    statusFilter = '';
  }

  function badgeClass(status: Status): string {
    if (status === 'live') return 'text-white bg-red-600';
    if (status === 'upcoming') return 'text-blue-700 bg-blue-100';
    return 'text-gray-400 bg-gray-50';
  }

  function badgeText(status: Status): string {
    if (status === 'live') return '実施中';
    if (status === 'upcoming') return '開催予定';
    return '終了';
  }

  function rowClass(status: Status): string {
    if (status === 'live') return 'bg-red-50 border-l-4 border-red-500';
    if (status === 'past') return 'opacity-60';
    return '';
  }
</script>

<div class="surface-card p-4 mb-6">
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div>
      <label for="search-text" class="block text-xs font-medium text-gray-500 mb-1">イベント名検索</label>
      <input
        id="search-text"
        type="text"
        placeholder="イベント名"
        value={text}
        oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chrome-ink"
      />
    </div>
    <div>
      <label for="search-type" class="block text-xs font-medium text-gray-500 mb-1">イベントタイプ</label>
      <select id="search-type" bind:value={typeFilter} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chrome-ink">
        <option value="">すべて</option>
        {#each eventTypes as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="search-status" class="block text-xs font-medium text-gray-500 mb-1">状態</label>
      <select id="search-status" bind:value={statusFilter} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chrome-ink">
        <option value="">すべて</option>
        <option value="live">実施中</option>
        <option value="upcoming">開催予定</option>
        <option value="past">終了</option>
      </select>
    </div>
  </div>
  <div class="mt-3 flex items-center gap-3">
    <button type="button" class="text-sm text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-900" onclick={reset}>条件リセット</button>
    <span class="text-sm text-gray-500">{filtered.length}件を表示</span>
  </div>
</div>

<p class="text-xs text-gray-500 mb-3">※ 終了時刻は各イベント終了日の 17:00 (JST) として扱います。</p>

<div class="hidden md:block overflow-x-auto">
  <table class="w-full text-sm">
    <thead>
      <tr class="bg-gray-100 text-left text-xs text-gray-500 uppercase">
        <th class="px-3 py-2 w-40">状態</th>
        <th class="px-3 py-2">イベント名</th>
        <th class="px-3 py-2 w-56">イベントタイプ</th>
        <th class="px-3 py-2 w-36">開始 (17:00)</th>
        <th class="px-3 py-2 w-44">終了 (17:00)</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100">
      {#each filtered as { ev, status, remainText, remainClass, endShort } (ev.id)}
        <tr class={rowClass(status)}>
          <td class="px-3 py-2 align-top">
            <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badgeClass(status)}">{badgeText(status)}</span>
            {#if remainText}
              <div class="text-xs mt-1 {remainClass}">{remainText}</div>
            {/if}
          </td>
          <td class="px-3 py-2 font-medium"><a href={`${base}events/${ev.id}/`} class="text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-900">{ev.eventname}</a></td>
          <td class="px-3 py-2 text-xs text-gray-600">{ev.eventtype}</td>
          <td class="px-3 py-2 text-xs text-gray-700">{ev.start_date}</td>
          <td class="px-3 py-2 text-xs text-gray-700">{endShort}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="md:hidden space-y-3">
  {#each filtered as { ev, status, remainText, remainClass, endLong } (ev.id)}
    <div class="rounded-lg shadow p-3 bg-white {rowClass(status)}">
      <div class="flex items-start justify-between gap-2 mb-1">
        <a href={`${base}events/${ev.id}/`} class="font-medium text-sm flex-1 text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-900">{ev.eventname}</a>
        <span class="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-semibold {badgeClass(status)}">{badgeText(status)}</span>
      </div>
      {#if remainText}
        <div class="text-xs mb-1 {remainClass}">{remainText}</div>
      {/if}
      <p class="text-xs text-gray-600">{ev.eventtype}</p>
      <p class="text-xs text-gray-700 mt-1">
        <span>{ev.start_date}</span>
        <span class="mx-1">〜</span>
        <span>{endLong}</span>
      </p>
    </div>
  {/each}
</div>
