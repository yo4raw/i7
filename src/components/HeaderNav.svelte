<script lang="ts">
  import { SITE_NAME } from '../lib/constants';
  import { materialIn, materialOut } from '../lib/motion';
  import CharacterColorBar from './CharacterColorBar.svelte';

  type Props = { base: string };
  let { base }: Props = $props();

  let mobileOpen = $state(false);
  let openDropdown = $state<string | null>(null);
  let mobileDropdownOpen = $state<Record<string, boolean>>({});
  let scrolled = $state(false);
  const dropdownWrappers = new Map<string, HTMLLIElement>();

  type LinkItem = { href: string; label: string };
  type DropdownItem = { label: string; children: LinkItem[] };
  type NavItem = LinkItem | DropdownItem;

  const isDropdown = (item: NavItem): item is DropdownItem => 'children' in item;

  const items: NavItem[] = [
    { href: base, label: 'ホーム' },
    { href: `${base}cards/`, label: '衣装一覧' },
    { href: `${base}songs/`, label: '楽曲一覧' },
    { href: `${base}events/`, label: 'イベント情報' },
    { href: `${base}mycard/`, label: '所持衣装' },
    {
      label: 'スコア計算',
      children: [
        { href: `${base}score-calc/`, label: 'スコア計算' },
        { href: `${base}score-calc/max-score-finder/`, label: '編成組合計算' },
        { href: `${base}card-compare/`, label: '衣装比較' },
      ],
    },
    {
      label: '各種登録',
      children: [
        { href: `${base}rabbit-note/`, label: 'ラビットノート' },
        { href: `${base}shared-broach/`, label: '共通ブローチ' },
      ],
    },
    { href: `${base}decks/`, label: '保存デッキ' },
  ];

  function registerDropdown(node: HTMLLIElement, label: string) {
    dropdownWrappers.set(label, node);
    return {
      destroy() {
        dropdownWrappers.delete(label);
      },
    };
  }

  function toggleDropdown(label: string) {
    openDropdown = openDropdown === label ? null : label;
  }

  function toggleMobileDropdown(label: string) {
    mobileDropdownOpen[label] = !mobileDropdownOpen[label];
  }

  function contextHandler(e: Event) {
    e.preventDefault();
  }

  $effect(() => {
    // スクロールエッジ効果: 先頭では影なし、スクロール時に hairline+影をフェードイン (ADR 0046)
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        scrolled = window.scrollY > 0;
        raf = 0;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    document.addEventListener('contextmenu', contextHandler);

    const clickHandler = (e: MouseEvent) => {
      if (openDropdown === null) return;
      const wrapper = dropdownWrappers.get(openDropdown);
      if (wrapper && !wrapper.contains(e.target as Node)) {
        openDropdown = null;
      }
    };
    document.addEventListener('click', clickHandler);

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        openDropdown = null;
      }
    };
    document.addEventListener('keydown', keyHandler);

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('contextmenu', contextHandler);
      document.removeEventListener('click', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  });
</script>

<header
  class="material-chrome text-white sticky top-0 z-(--z-chrome) transition-shadow duration-200"
  class:shadow-chrome={scrolled}
  data-scrolled={scrolled}
>
  <nav class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href={base} class="text-lg font-bold tracking-wide pressable">{SITE_NAME}</a>
    <button
      type="button"
      class="md:hidden p-1 pressable"
      aria-label="メニュー"
      aria-expanded={mobileOpen}
      onclick={() => (mobileOpen = !mobileOpen)}
    >
      <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <ul class="hidden md:flex gap-6 text-sm font-medium">
      {#each items as item}
        {#if isDropdown(item)}
          <li class="relative" use:registerDropdown={item.label}>
            <button
              type="button"
              class="hover:text-gray-300 transition-colors inline-flex items-center gap-1 cursor-pointer pressable"
              aria-haspopup="menu"
              aria-expanded={openDropdown === item.label}
              onclick={() => toggleDropdown(item.label)}
            >
              {item.label}
              <svg class="size-3 transition-transform" class:rotate-180={openDropdown === item.label} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if openDropdown === item.label}
              <ul
                role="menu"
                class="material-overlay absolute left-0 top-full mt-2 min-w-44 text-gray-800 rounded-card py-1 z-(--z-overlay) origin-top-left"
                in:materialIn
                out:materialOut
              >
                {#each item.children as child}
                  <li role="none">
                    <a
                      role="menuitem"
                      href={child.href}
                      class="block px-4 py-2 rounded-lg mx-1 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    >
                      {child.label}
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {:else}
          <li><a href={item.href} class="hover:text-gray-300 transition-colors">{item.label}</a></li>
        {/if}
      {/each}
    </ul>
  </nav>
  <CharacterColorBar />
  {#if mobileOpen}
  <ul class="flex flex-col gap-2 px-4 pb-3 text-sm font-medium md:hidden origin-top" in:materialIn={{ scaleFrom: 0.98 }} out:materialOut={{ scaleFrom: 0.98 }}>
    {#each items as item}
      {#if isDropdown(item)}
        <li>
          <button
            type="button"
            class="w-full flex items-center justify-between py-1 hover:text-gray-300 pressable"
            aria-expanded={!!mobileDropdownOpen[item.label]}
            onclick={() => toggleMobileDropdown(item.label)}
          >
            <span>{item.label}</span>
            <svg class="size-3 transition-transform" class:rotate-180={mobileDropdownOpen[item.label]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if mobileDropdownOpen[item.label]}
            <ul class="pl-4 flex flex-col gap-1 mt-1">
              {#each item.children as child}
                <li><a href={child.href} class="block py-1 hover:text-gray-300">{child.label}</a></li>
              {/each}
            </ul>
          {/if}
        </li>
      {:else}
        <li><a href={item.href} class="block py-1 hover:text-gray-300">{item.label}</a></li>
      {/if}
    {/each}
  </ul>
  {/if}
</header>
