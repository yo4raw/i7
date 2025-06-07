<script lang="ts">
  import { cn } from '$lib/utils';
  
  export let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
  export let className = '';
  
  const variantClasses = {
    default: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    secondary: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    destructive: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    outline: 'text-gray-700 border border-gray-300 dark:text-gray-300 dark:border-gray-700'
  };
</script>

<span class={cn(
  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
  variantClasses[variant],
  className
)} {...$$restProps}>
  <slot />
</span>