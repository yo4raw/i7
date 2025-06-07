<script lang="ts">
  import { cn } from '$lib/utils';
  
  export let className = '';
</script>

<div class={cn("p-6", className)} {...$$restProps}>
  <slot />
</div>