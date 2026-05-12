<script lang="ts">
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

  function formatRemain(ms: number): string {
    if (ms <= 0) return '';
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / (60 * 24));
    const h = Math.floor((totalMin % (60 * 24)) / 60);
    const m = totalMin % 60;
    if (d > 0) return `残り ${d}日 ${h}時間`;
    if (h > 0) return `残り ${h}時間 ${m}分`;
    return `残り ${m}分`;
  }

  function status(ev: EventItem): { text: string; className: string; remain: string } {
    const start = new Date(`${ev.start_date}T17:00:00+09:00`).getTime();
    const end = new Date(`${ev.end_date}T17:00:00+09:00`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return { text: '—', className: 'text-gray-500 bg-gray-100', remain: '' };
    }
    if (now < start) {
      return { text: '開催予定', className: 'text-blue-700 bg-blue-100', remain: `開始まで ${formatRemain(start - now)}` };
    }
    if (now < end) {
      return { text: '実施中', className: 'text-red-700 bg-red-100', remain: formatRemain(end - now) };
    }
    return { text: '終了', className: 'text-gray-500 bg-gray-200', remain: '' };
  }
</script>

{#if events.length > 0}
  <section class="mb-8">
    <h2 class="text-lg font-bold text-indigo-700 mb-3">{heading}</h2>
    <ul class="space-y-2">
      {#each events as ev (ev.id)}
        {@const s = status(ev)}
        <li class="event-item bg-white dark:bg-slate-800 rounded-lg shadow p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <a href={`${base}events/${ev.id}/`} class="text-indigo-700 font-semibold hover:underline">
              {ev.eventname}
            </a>
            <div class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              {ev.eventtype} / {ev.start_date} 17:00 〜 {ev.end_date} 17:00 (JST)
            </div>
          </div>
          <div class="flex items-center gap-3 text-xs">
            <span class="inline-block px-2 py-0.5 rounded font-semibold {s.className}">{s.text}</span>
            <span class="text-gray-500 dark:text-slate-400">{s.remain}</span>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}
