<script lang="ts">
  import type { EventRow } from '../lib/data/fetchEventsCsv';

  type Props = {
    events: EventRow[];
    eventTypes: string[];
    base: string;
  };

  let { events, eventTypes, base }: Props = $props();

  type Status = 'live' | 'upcoming' | 'past';

  let now = $state(Date.now());
  let text = $state('');
  let typeFilter = $state('');
  let statusFilter = $state<Status | ''>('');

  $effect(() => {
    const hasLive = events.some((ev) => {
      const s = Date.parse(`${ev.start_date}T17:00:00+09:00`);
      const e = Date.parse(`${ev.end_date}T17:00:00+09:00`);
      return now >= s && now < e;
    });
    const interval = hasLive ? 1000 : 30000;
    const id = setInterval(() => { now = Date.now(); }, interval);
    return () => clearInterval(id);
  });

  function classify(startIso: string, endIso: string): { status: Status; start: number; end: number } {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    if (Number.isNaN(start) || Number.isNaN(end)) return { status: 'past', start: NaN, end: NaN };
    if (now < start) return { status: 'upcoming', start, end };
    if (now >= end) return { status: 'past', start, end };
    return { status: 'live', start, end };
  }

  function formatRemaining(ms: number): string {
    if (ms <= 0) return '';
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `残り ${d}日 ${h}時間 ${m}分 ${s}秒`;
    if (h > 0) return `残り ${h}時間 ${m}分 ${s}秒`;
    if (m > 0) return `残り ${m}分 ${s}秒`;
    return `残り ${s}秒`;
  }

  function formatRemainingShort(ms: number): string {
    if (ms <= 0) return '';
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (d > 0) return `${d}日 ${h}時間`;
    if (h > 0) return `${h}時間 ${m}分`;
    return `${m}分`;
  }

  const enriched = $derived(
    events.map((ev) => {
      const { status, start, end } = classify(`${ev.start_date}T17:00:00+09:00`, `${ev.end_date}T17:00:00+09:00`);
      let remainText = '';
      let remainClass = '';
      if (status === 'live') {
        remainText = formatRemaining(end - now);
        remainClass = 'text-red-600 font-medium';
      } else if (status === 'upcoming') {
        remainText = `開始まで ${formatRemainingShort(start - now)}`;
        remainClass = 'text-gray-500';
      }
      return { ev, status, remainText, remainClass };
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
    if (status === 'live') return 'text-white bg-red-600 animate-pulse';
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

<div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6">
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div>
      <label for="search-text" class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">イベント名検索</label>
      <input
        id="search-text"
        type="text"
        placeholder="イベント名"
        value={text}
        oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
        class="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
    <div>
      <label for="search-type" class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">イベントタイプ</label>
      <select id="search-type" bind:value={typeFilter} class="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
        <option value="">すべて</option>
        {#each eventTypes as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="search-status" class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">状態</label>
      <select id="search-status" bind:value={statusFilter} class="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
        <option value="">すべて</option>
        <option value="live">実施中</option>
        <option value="upcoming">開催予定</option>
        <option value="past">終了</option>
      </select>
    </div>
  </div>
  <div class="mt-3 flex items-center gap-3">
    <button type="button" class="text-sm text-indigo-600 hover:underline" onclick={reset}>条件リセット</button>
    <span class="text-sm text-gray-500 dark:text-slate-400">{filtered.length}件を表示</span>
  </div>
</div>

<p class="text-xs text-gray-500 dark:text-slate-400 mb-3">※ 終了時刻は各イベント終了日の 17:00 (JST) として扱います。</p>

<div class="hidden md:block overflow-x-auto">
  <table class="w-full text-sm">
    <thead>
      <tr class="bg-gray-100 dark:bg-slate-800 text-left text-xs text-gray-500 dark:text-slate-400 uppercase">
        <th class="px-3 py-2 w-40">状態</th>
        <th class="px-3 py-2">イベント名</th>
        <th class="px-3 py-2 w-56">イベントタイプ</th>
        <th class="px-3 py-2 w-36">開始 (17:00)</th>
        <th class="px-3 py-2 w-44">終了 (17:00)</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100 dark:divide-slate-800">
      {#each filtered as { ev, status, remainText, remainClass } (ev.id)}
        <tr class={rowClass(status)}>
          <td class="px-3 py-2 align-top">
            <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badgeClass(status)}">{badgeText(status)}</span>
            {#if remainText}
              <div class="text-xs mt-1 {remainClass}">{remainText}</div>
            {/if}
          </td>
          <td class="px-3 py-2 font-medium"><a href={`${base}events/${ev.id}/`} class="text-indigo-600 hover:underline">{ev.eventname}</a></td>
          <td class="px-3 py-2 text-xs text-gray-600 dark:text-slate-300">{ev.eventtype}</td>
          <td class="px-3 py-2 text-xs text-gray-700 dark:text-slate-200">{ev.start_date}</td>
          <td class="px-3 py-2 text-xs text-gray-700 dark:text-slate-200">{ev.end_date}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="md:hidden space-y-3">
  {#each filtered as { ev, status, remainText, remainClass } (ev.id)}
    <div class="rounded-lg shadow p-3 bg-white dark:bg-slate-800 {rowClass(status)}">
      <div class="flex items-start justify-between gap-2 mb-1">
        <a href={`${base}events/${ev.id}/`} class="font-medium text-sm flex-1 text-indigo-600 hover:underline">{ev.eventname}</a>
        <span class="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-semibold {badgeClass(status)}">{badgeText(status)}</span>
      </div>
      {#if remainText}
        <div class="text-xs mb-1 {remainClass}">{remainText}</div>
      {/if}
      <p class="text-xs text-gray-600 dark:text-slate-300">{ev.eventtype}</p>
      <p class="text-xs text-gray-700 dark:text-slate-200 mt-1">
        <span>{ev.start_date}</span>
        <span class="mx-1">〜</span>
        <span>{ev.end_date} 17:00</span>
      </p>
    </div>
  {/each}
</div>
