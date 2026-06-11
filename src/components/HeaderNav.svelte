<script lang="ts">
  import { SITE_NAME } from '../lib/constants';

  type Props = { base: string };
  let { base }: Props = $props();

  let mobileOpen = $state(false);
  let openDropdown = $state<string | null>(null);
  let mobileDropdownOpen = $state<Record<string, boolean>>({});
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

  $effect(() => {
    const contextHandler = (e: Event) => e.preventDefault();
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
      document.removeEventListener('contextmenu', contextHandler);
      document.removeEventListener('click', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
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
      {#each items as item}
        {#if isDropdown(item)}
          <li class="relative" use:registerDropdown={item.label}>
            <button
              type="button"
              class="hover:text-indigo-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
              aria-haspopup="menu"
              aria-expanded={openDropdown === item.label}
              onclick={() => toggleDropdown(item.label)}
            >
              {item.label}
              <svg class="w-3 h-3 transition-transform" class:rotate-180={openDropdown === item.label} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if openDropdown === item.label}
              <ul role="menu" class="absolute left-0 top-full mt-2 min-w-44 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 rounded-md shadow-lg ring-1 ring-black/10 py-1 z-50">
                {#each item.children as child}
                  <li role="none">
                    <a
                      role="menuitem"
                      href={child.href}
                      class="block px-4 py-2 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {child.label}
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {:else}
          <li><a href={item.href} class="hover:text-indigo-200 transition-colors">{item.label}</a></li>
        {/if}
      {/each}
    </ul>
  </nav>
  <ul class="flex-col gap-2 px-4 pb-3 text-sm font-medium md:hidden" class:hidden={!mobileOpen} class:flex={mobileOpen}>
    {#each items as item}
      {#if isDropdown(item)}
        <li>
          <button
            type="button"
            class="w-full flex items-center justify-between py-1 hover:text-indigo-200"
            aria-expanded={!!mobileDropdownOpen[item.label]}
            onclick={() => toggleMobileDropdown(item.label)}
          >
            <span>{item.label}</span>
            <svg class="w-3 h-3 transition-transform" class:rotate-180={mobileDropdownOpen[item.label]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if mobileDropdownOpen[item.label]}
            <ul class="pl-4 flex flex-col gap-1 mt-1">
              {#each item.children as child}
                <li><a href={child.href} class="block py-1 hover:text-indigo-200">{child.label}</a></li>
              {/each}
            </ul>
          {/if}
        </li>
      {:else}
        <li><a href={item.href} class="block py-1 hover:text-indigo-200">{item.label}</a></li>
      {/if}
    {/each}
  </ul>
</header>
