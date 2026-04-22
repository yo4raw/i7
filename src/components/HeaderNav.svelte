<script lang="ts">
  import { SITE_NAME } from '../lib/constants';

  type Props = { base: string };
  let { base }: Props = $props();

  let mobileOpen = $state(false);

  const links: Array<{ href: string; label: string }> = [
    { href: base, label: 'ホーム' },
    { href: `${base}cards/`, label: 'カード一覧' },
    { href: `${base}songs/`, label: '楽曲一覧' },
    { href: `${base}events/`, label: 'イベント情報' },
    { href: `${base}mycard/`, label: '所持カード' },
    { href: `${base}score-calc/`, label: 'スコア計算' },
    { href: `${base}rabbit-note/`, label: 'ラビットノート' },
    { href: `${base}decks/`, label: '保存デッキ' },
  ];

  $effect(() => {
    const handler = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  });
</script>

<header class="bg-indigo-700 text-white sticky top-0 z-50 shadow-md">
  <nav class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href={base} class="text-lg font-bold tracking-wide">{SITE_NAME}</a>
    <button
      type="button"
      class="md:hidden p-1"
      aria-label="メニュー"
      aria-expanded={mobileOpen}
      onclick={() => (mobileOpen = !mobileOpen)}
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <ul class="hidden md:flex gap-6 text-sm font-medium">
      {#each links as { href, label }}
        <li><a {href} class="hover:text-indigo-200 transition-colors">{label}</a></li>
      {/each}
    </ul>
  </nav>
  <ul class="flex-col gap-2 px-4 pb-3 text-sm font-medium md:hidden" class:hidden={!mobileOpen} class:flex={mobileOpen}>
    {#each links as { href, label }}
      <li><a {href} class="block py-1 hover:text-indigo-200">{label}</a></li>
    {/each}
  </ul>
</header>
