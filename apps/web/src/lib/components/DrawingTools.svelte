<script lang="ts">
  import type { DrawingType } from '$lib/types/drawing';

  interface Props {
    tool?: DrawingType | null;
  }

  let { tool = $bindable(null) }: Props = $props();

  const tools: { id: DrawingType | null; title: string; icon: 'cursor' | 'trendline' | 'hline' | 'fib' }[] = [
    { id: null, title: 'Cursor', icon: 'cursor' },
    { id: 'trendline', title: 'Trendline', icon: 'trendline' },
    { id: 'horizontal_line', title: 'Horizontal Line', icon: 'hline' },
    { id: 'fibonacci', title: 'Fibonacci Retracement', icon: 'fib' },
  ];
</script>

<div class="drawing-tools" role="group" aria-label="Drawing tools">
  {#each tools as item (item.title)}
    <button
      class:active={tool === item.id}
      onclick={() => (tool = item.id)}
      title={item.title}
      aria-label={item.title}
      aria-pressed={tool === item.id}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        {#if item.icon === 'cursor'}
          <path
            d="M14.0828 9.50279L21.3579 16.7779L16.7779 21.3579L9.50279 14.0828L3.25 20.3356V3.25L20.3356 9.50279L14.0828 9.50279Z"
          />
        {:else if item.icon === 'trendline'}
          <line x1="4" y1="20" x2="20" y2="4" />
          <circle cx="4" cy="20" r="2" fill="currentColor" />
          <circle cx="20" cy="4" r="2" fill="currentColor" />
        {:else if item.icon === 'hline'}
          <line x1="3" y1="12" x2="21" y2="12" />
        {:else if item.icon === 'fib'}
          <line x1="4" y1="20" x2="20" y2="4" stroke-dasharray="2 2" opacity="0.5" />
          <line x1="4" y1="20" x2="10" y2="20" />
          <line x1="14" y1="10" x2="20" y2="10" />
          <line x1="14" y1="4" x2="20" y2="4" />
        {/if}
      </svg>
    </button>
  {/each}
</div>

<style>
  .drawing-tools {
    display: flex;
    gap: var(--space-1);
    margin-left: var(--space-4);
    padding-left: var(--space-4);
    border-left: 1px solid var(--border-subtle);
  }

  .drawing-tools button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .drawing-tools button:hover {
    background: rgba(148, 163, 184, 0.1);
    color: var(--text-primary);
  }

  .drawing-tools button.active {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent-border);
  }
</style>
