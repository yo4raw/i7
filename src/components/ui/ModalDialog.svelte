<script module lang="ts">
  /** インスタンスごとに aria の参照 id を一意にするための連番 */
  let instanceSeq = 0;
</script>

<script lang="ts">
  import { tick } from 'svelte';
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

  const uid = `modal-dialog-${++instanceSeq}`;
  const titleId = `${uid}-title`;
  const messageId = `${uid}-message`;
  const inputId = `${uid}-input`;

  let visible = $state(false);
  let mode = $state<'confirm' | 'prompt'>('confirm');
  let opts = $state<PromptOptions>({ title: '' });
  let inputValue = $state('');

  let resolve: ((value: boolean | string | null) => void) | null = null;

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let dialogEl: HTMLDialogElement | undefined;
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

  async function show(nextMode: 'confirm' | 'prompt', nextOpts: PromptOptions) {
    mode = nextMode;
    opts = nextOpts;
    inputValue = nextOpts.value ?? '';
    visible = true;

    await tick();
    // showModal がフォーカストラップ・背景の inert 化・Esc・フォーカス復帰を標準で担う (ADR 0048 追記)
    dialogEl?.showModal();

    // 初期フォーカスは明示する。<dialog> の既定 (最初の focusable) は
    // danger 時にキャンセルへ置きたい要件と一致しないため
    if (nextMode === 'prompt') {
      inputEl?.focus();
      inputEl?.select();
    } else if (nextOpts.danger) {
      // 破壊的操作では Enter 連打で誤確定しないよう、まずキャンセルへ置く
      cancelEl?.focus();
    } else {
      confirmEl?.focus();
    }
  }

  /** 保留中の Promise を解決し、ダイアログを閉じる。フォーカス復帰は close() の標準挙動に任せる */
  function settle(value: boolean | string | null) {
    const pending = resolve;
    resolve = null;
    dialogEl?.close();
    visible = false;
    pending?.(value);
  }

  /**
   * 開いている最中に別のダイアログを要求されたら、先のものは cancel 相当で決着させる。
   * 新しい resolver を代入する「前」に呼ぶこと (後だと新しい Promise を即解決してしまう)
   */
  function cancelPending() {
    const pending = resolve;
    resolve = null;
    pending?.(mode === 'confirm' ? false : null);
  }

  /**
   * ネイティブ `confirm()` の置き換え。true = 確定 / false = キャンセル。
   * 破壊的操作では `danger: true` を渡すこと
   */
  export function confirm(options: ConfirmOptions): Promise<boolean> {
    cancelPending();
    return new Promise<boolean>((res) => {
      resolve = res as (value: boolean | string | null) => void;
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
      resolve = res as (value: boolean | string | null) => void;
      void show('prompt', options);
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

  /** Esc は <dialog> の cancel イベントで届く。既定の即時 close を止めて settle に通す */
  function onNativeCancel(event: Event) {
    event.preventDefault();
    onCancel();
  }

  /** close が settle 以外の経路で起きた場合の保険 */
  function onNativeClose() {
    if (resolve) onCancel();
  }

  /** 背景クリックで閉じる。<dialog> 自身が背景も含む矩形なので、標的が dialog 本体なら背景 */
  function onBackdropClick(event: MouseEvent) {
    if (event.target === dialogEl) onCancel();
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onConfirm();
    }
  }
</script>

{#if visible}
  <dialog
    bind:this={dialogEl}
    class="modal-dialog surface-card w-full max-w-sm shadow-overlay"
    role={opts.danger ? 'alertdialog' : undefined}
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={opts.message ? messageId : undefined}
    oncancel={onNativeCancel}
    onclose={onNativeClose}
    onclick={onBackdropClick}
    data-testid="modal-dialog"
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

    <div class="mt-5 flex justify-end gap-2">
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
    </div>
  </dialog>
{/if}

<style>
  /* ブラウザ既定の枠と余白を消し、中央へ置く。surface-card の背景は utility 側が持つ */
  .modal-dialog {
    border: none;
    padding: 1.25rem;
    margin: auto;
  }

  /* スクリムは blur を持たない: 全画面の backdrop-filter を opacity フェードさせると
     合成コストが跳ね上がるため (Baseline UI) */
  .modal-dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
</style>
