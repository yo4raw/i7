<script lang="ts">
  import { classifyEventStatus, eventStartMs, eventEndMs, formatDuration, formatEventPeriod } from '../lib/data/eventPeriod';

  type EventItem = {
    id: number;
    eventname: string;
    eventtype: string;
    start_date: string;
    end_date: string;
  };

  type Props = {
    events: EventItem[];
    heading: string;
    base: string;
  };

  let { events, heading, base }: Props = $props();

  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 60_000);
    return () => clearInterval(id);
  });

  function status(ev: EventItem): { text: string; className: string; remain: string } {
    const s = classifyEventStatus(ev.start_date, ev.end_date, now);
    if (s === 'upcoming') {
      const start = eventStartMs(ev.start_date);
      return { text: '開催予定', className: 'text-blue-700 bg-blue-100', remain: start === null ? '' : `開始まで ${formatDuration(start - now, 'minute')}` };
    }
    if (s === 'live') {
      const end = eventEndMs(ev.end_date);
      // 終了未定の実施中イベントは残り時間を出せない
      return { text: '実施中', className: 'text-red-700 bg-red-100', remain: end === null ? '' : `残り ${formatDuration(end - now, 'minute')}` };
    }
    return { text: '終了', className: 'text-gray-500 bg-gray-200', remain: '' };
  }
</script>

{#if events.length > 0}
  <section class="mb-8">
    <h2 class="text-lg font-bold text-gray-900 mb-3">{heading}</h2>
    <ul class="space-y-2">
      {#each events as ev (ev.id)}
        {@const s = status(ev)}
        <li data-motion-item data-motion-group="event-item" class="event-item surface-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <a href={`${base}events/${ev.id}/`} class="text-gray-900 font-semibold underline underline-offset-2 decoration-gray-400 hover:decoration-gray-900">
              {ev.eventname}
            </a>
            <div class="text-xs text-gray-500 mt-0.5">
              {ev.eventtype} / {formatEventPeriod(ev.start_date, ev.end_date)}
            </div>
          </div>
          <div class="flex items-center gap-3 text-xs">
            <span class="inline-block px-2 py-0.5 rounded font-semibold {s.className}">{s.text}</span>
            <span class="text-gray-500">{s.remain}</span>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}
