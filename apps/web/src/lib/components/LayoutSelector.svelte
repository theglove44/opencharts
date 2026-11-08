<script lang="ts">
  import { chartStore, type LayoutType } from '$lib/state/charts.svelte';

  const layouts: { id: LayoutType; title: string; icon: 'single' | 'cols' | 'rows' | 'grid' | 'left-split' | 'right-split' }[] = [
    { id: 'single', title: 'Single View', icon: 'single' },
    { id: '1-2', title: '2 Columns', icon: 'cols' },
    { id: '2-1', title: '2 Rows', icon: 'rows' },
    { id: '2-2', title: '4 Grid', icon: 'grid' },
    { id: '1-3', title: '1 Left + 2 Right', icon: 'left-split' },
    { id: '3-1', title: '2 Left + 1 Right', icon: 'right-split' },
  ];
</script>

<div class="layout-selector" role="group" aria-label="Chart layout">
  {#each layouts as item (item.id)}
    <button
      class:active={chartStore.layout === item.id}
      onclick={() => chartStore.setLayout(item.id)}
      title={item.title}
      aria-label={item.title}
      aria-pressed={chartStore.layout === item.id}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="1" y="1" width="14" height="14" rx="2" />
        {#if item.icon === 'cols'}
          <line x1="8" y1="1" x2="8" y2="15" />
        {:else if item.icon === 'rows'}
          <line x1="1" y1="8" x2="15" y2="8" />
        {:else if item.icon === 'grid'}
          <line x1="8" y1="1" x2="8" y2="15" />
          <line x1="1" y1="8" x2="15" y2="8" />
        {:else if item.icon === 'left-split'}
          <line x1="7" y1="1" x2="7" y2="15" />
          <line x1="7" y1="8" x2="15" y2="8" />
        {:else if item.icon === 'right-split'}
          <line x1="9" y1="1" x2="9" y2="15" />
          <line x1="1" y1="8" x2="9" y2="8" />
        {/if}
      </svg>
    </button>
  {/each}
</div>

<style>
  .layout-selector {
    display: flex;
    gap: var(--space-1);
    margin-left: var(--space-5);
    padding-left: var(--space-5);
    border-left: 1px solid var(--border-subtle);
  }
  .layout-selector button {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .layout-selector button:hover {
    background: rgba(148, 163, 184, 0.1);
    color: var(--text-secondary);
  }
  .layout-selector button.active {
    background: rgba(148, 163, 184, 0.2);
    color: var(--text-primary);
  }

  @media (max-width: 900px) {
    .layout-selector {
      display: none;
    }
  }
</style>
