<script lang="ts">
  import { cn } from '$lib/utils';
  
  export let className = '';
  export let hover = true;
</script>

<div class={cn(
  "bg-white rounded-lg shadow-md overflow-hidden",
  hover && "transition-shadow hover:shadow-lg",
  className
)} {...$$restProps}>
  <slot />
</div>