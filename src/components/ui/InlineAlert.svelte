<script lang="ts">
  /**
   * 操作したボタンの近くにエラー / 完了を出すためのインライン表示。
   * ネイティブ `alert()` の置き換え (ブラウザモーダルは操作をブロックし、
   * どの操作に対する結果なのかも伝わらないため)。
   */
  let { message, tone = 'error', class: className = '' }: {
    /** null / 空文字なら何も描画しない */
    message: string | null;
    tone?: 'error' | 'success';
    /** 配置調整用の追加クラス (mt-* 等) */
    class?: string;
  } = $props();

  const toneClass = $derived(tone === 'error' ? 'text-red-600' : 'text-green-600');
</script>

{#if message}
  <p
    class="text-xs font-medium text-pretty {toneClass} {className}"
    role={tone === 'error' ? 'alert' : 'status'}
    aria-live={tone === 'error' ? 'assertive' : 'polite'}
  >
    {message}
  </p>
{/if}
