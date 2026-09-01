<script module lang="ts">
  /** インスタンスごとに aria の参照 id を一意にするための連番 */
  let instanceSeq = 0;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { materialIn, materialOut } from '../../lib/motion';

  type ConfirmOptions = {
    title: string;
    /** 補足説明。省略時は aria-describedby も付けない */
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /**
     * 破壊的・不可逆操作。確定ボタンを赤系にし、初期フォーカスをキャンセル側へ置く。
     * role も alertdialog になる
     */
    danger?: boolean;
  };

  type PromptOptions = ConfirmOptions & {
    /** 入力欄の初期値 */
    value?: string;
    placeholder?: string;
    /**
     * 値を読ませる/コピーさせるだけの用途 (クリップボード失敗時の URL 提示など)。
     * 入力欄を readonly にし、閉じるボタンのみを出す
     */
    readonly?: boolean;
  };

  type ChooseOptions = {
    title: string;
    message?: string;
    /** 主となる選択（例: この端末の内容を使う） */
    primaryLabel: string;
    /** 対になる選択（例: 別の端末の内容を使う） */
    secondaryLabel: string;
    /** 何もしないで閉じる選択。既定は「あとで」 */
    dismissLabel?: string;
  };

  /** choose の戻り値。null は「何もしない」 */
  type ChooseResult = 'primary' | 'secondary' | null;

  const uid = `modal-dialog-${++instanceSeq}`;
  const titleId = `${uid}-title`;
  const messageId = `${uid}-message`;
  const inputId = `${uid}-input`;

  let visible = $state(false);
  let mode = $state<'confirm' | 'prompt' | 'choose'>('confirm');
  let opts = $state<PromptOptions & Partial<ChooseOptions>>({ title: '' });
  let inputValue = $state('');

  type DialogResult = boolean | string | ChooseResult;
  let resolve: ((value: DialogResult) => void) | null = null;
  let returnFocusEl: HTMLElement | null = null;

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let panelEl: HTMLDivElement | undefined;
  // oxlint-disable-next-line no-unassigned-vars -- 同上
  let inputEl: HTMLInputElement | undefined;
  // oxlint-disable-next-line no-unassigned-vars -- 同上
  let cancelEl: HTMLButtonElement | undefined;
  // oxlint-disable-next-line no-unassigned-vars -- 同上
  let confirmEl: HTMLButtonElement | undefined;

  const confirmLabel = $derived(opts.confirmLabel ?? (opts.readonly ? '閉じる' : 'OK'));
  const cancelLabel = $derived(opts.cancelLabel ?? 'キャンセル');
  /** readonly は確定ボタンのみ (キャンセルの意味がない) */
  const showCancel = $derived(!opts.readonly);

  async function show(nextMode: 'confirm' | 'prompt' | 'choose', nextOpts: PromptOptions & Partial<ChooseOptions>) {
    mode = nextMode;
    opts = nextOpts;
    inputValue = nextOpts.value ?? '';
    returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    visible = true;

    await tick();
    if (nextMode === 'prompt') {
      inputEl?.focus();
      inputEl?.select();
    } else if (nextMode === 'choose' || nextOpts.danger) {
      // choose はどちらの選択肢もデータを失わせるため、まず「あとで」へ置く
      cancelEl?.focus();
    } else {
      confirmEl?.focus();
    }
  }

  /** 保留中の Promise を解決し、ダイアログを閉じてフォーカスを開いた要素へ戻す */
  function settle(value: DialogResult) {
    const pending = resolve;
    const target = returnFocusEl;
    resolve = null;
    returnFocusEl = null;
    visible = false;
    if (!pending) return;
    pending(value);
    // DOM 更新後に戻す。パネル内の要素がフォーカスを持ったまま外れると
    // ブラウザが body へリセットするため、同期的に focus() しても上書きされる
    void tick().then(() => target?.focus());
  }

  /**
   * 開いている最中に別のダイアログを要求されたら、先のものは cancel 相当で決着させる。
   * 新しい resolver を代入する「前」に呼ぶこと (後だと新しい Promise を即解決してしまう)
   */
  function cancelPending() {
    const pending = resolve;
    resolve = null;
    // choose は null が「何もしない」なので prompt と同じ扱いでよい
    pending?.(mode === 'confirm' ? false : null);
  }

  /**
   * ネイティブ `confirm()` の置き換え。true = 確定 / false = キャンセル。
   * 破壊的操作では `danger: true` を渡すこと
   */
  export function confirm(options: ConfirmOptions): Promise<boolean> {
    cancelPending();
    return new Promise<boolean>((res) => {
      resolve = res as (value: DialogResult) => void;
      void show('confirm', options);
    });
  }

  /**
   * ネイティブ `prompt()` の置き換え。確定時は入力文字列 / キャンセル時は null。
   * `readonly: true` の場合は常に null を返す (値を読ませるだけの用途)
   */
  export function prompt(options: PromptOptions): Promise<string | null> {
    cancelPending();
    return new Promise<string | null>((res) => {
      resolve = res as (value: DialogResult) => void;
      void show('prompt', options);
    });
  }

  /**
   * 3 択のダイアログ。競合の解決に使う。
   *
   * Esc / バックドロップ / dismiss ボタンはすべて null に解決され、何も起きない。
   * どちらの選択肢もデータを失わせるため、安全な逃げ道を必ず用意する必要がある。
   */
  export function choose(options: ChooseOptions): Promise<ChooseResult> {
    cancelPending();
    return new Promise<ChooseResult>((res) => {
      resolve = res as (value: DialogResult) => void;
      void show('choose', options as PromptOptions & ChooseOptions);
    });
  }

  function onConfirm() {
    if (mode === 'prompt') {
      settle(opts.readonly ? null : inputValue);
    } else {
      settle(true);
    }
  }

  function onCancel() {
    settle(mode === 'confirm' ? false : null);
  }

  const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** Esc で閉じ、Tab はパネル内に閉じ込める (自前実装の代わりの依存を増やさないため) */
  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !panelEl) return;

    const focusable = [...panelEl.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    const active = document.activeElement;

    if (event.shiftKey && (active === first || !panelEl.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onConfirm();
    }
  }
</script>

<svelte:window onkeydown={visible ? onKeydown : undefined} />

{#if visible}
  <div class="fixed inset-0 z-(--z-overlay) flex items-center justify-center p-4" data-testid="modal-dialog">
    <!-- スクリムは blur を持たない: 全画面の backdrop-filter を opacity フェードさせると
         合成コストが跳ね上がるため (Baseline UI) -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-black/40" onclick={onCancel} transition:fade={{ duration: 150 }}></div>
    <div
      bind:this={panelEl}
      class="surface-card relative w-full max-w-sm p-5 shadow-overlay"
      role={opts.danger ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={opts.message ? messageId : undefined}
      in:materialIn
      out:materialOut
    >
      <h2 id={titleId} class="text-base font-bold text-gray-900 text-pretty">{opts.title}</h2>
      {#if opts.message}
        <p id={messageId} class="mt-2 text-sm text-gray-600 whitespace-pre-line text-pretty">{opts.message}</p>
      {/if}

      {#if mode === 'prompt'}
        <input
          bind:this={inputEl}
          bind:value={inputValue}
          id={inputId}
          type="text"
          readonly={opts.readonly}
          placeholder={opts.placeholder}
          aria-label={opts.title}
          class="mt-3 w-full rounded-control border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chrome-ink"
          onkeydown={onInputKeydown}
        />
      {/if}

      <div class="mt-5 flex flex-wrap justify-end gap-2">
        {#if mode === 'choose'}
          <button
            bind:this={cancelEl}
            type="button"
            class="rounded-control bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 pressable"
            onclick={onCancel}
          >
            {opts.dismissLabel ?? 'あとで'}
          </button>
          <button
            type="button"
            class="rounded-control border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 pressable"
            onclick={() => settle('secondary')}
          >
            {opts.secondaryLabel}
          </button>
          <button
            bind:this={confirmEl}
            type="button"
            class="rounded-control bg-chrome-ink px-4 py-2 text-sm font-bold text-white hover:bg-chrome-ink-soft pressable"
            onclick={() => settle('primary')}
          >
            {opts.primaryLabel}
          </button>
        {:else}
          {#if showCancel}
            <button
              bind:this={cancelEl}
              type="button"
              class="rounded-control bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 pressable"
              onclick={onCancel}
            >
              {cancelLabel}
            </button>
          {/if}
          <button
            bind:this={confirmEl}
            type="button"
            class="rounded-control px-4 py-2 text-sm font-bold text-white pressable {opts.danger
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-chrome-ink hover:bg-chrome-ink-soft'}"
            onclick={onConfirm}
          >
            {confirmLabel}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
