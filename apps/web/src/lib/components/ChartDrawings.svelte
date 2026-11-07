<script lang="ts">
  import type { IChartApi, ISeriesApi } from 'lightweight-charts';
  import type { Drawing, DrawingType, Point } from '$lib/types/drawing';
  import { DEFAULT_FIB_LEVELS } from '$lib/types/drawing';

  interface Props {
    chart: IChartApi;
    series: ISeriesApi<'Candlestick'>;
    drawings?: Drawing[];
    activeTool?: DrawingType | null;
    width?: number;
    height?: number;
    oncreate?: (drawing: Drawing) => void;
    ondelete?: (drawingId: string) => void;
  }

  let {
    chart,
    series,
    drawings = [],
    activeTool = null,
    width = 0,
    height = 0,
    oncreate,
    ondelete,
  }: Props = $props();

  let previewPoints: Point[] = $state([]);
  let isDrawing = $state(false);
  let contextMenu = $state<{ x: number; y: number; drawingId: string } | null>(null);

  // Coordinate conversion helpers
  const timeScale = $derived(chart.timeScale());

  function pointFromEvent(e: MouseEvent): Point | null {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = timeScale.coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time === null || price === null) return null;
    return { timestamp: (time as number) * 1000, price };
  }

  function handleMouseDown(e: MouseEvent) {
    if (!activeTool) return;

    const point = pointFromEvent(e);
    if (!point) return;

    if (!isDrawing) {
      isDrawing = true;
      previewPoints = [point];
    } else if (activeTool !== 'horizontal_line') {
      completeDrawing(point);
    }

    // 1-click tools complete immediately on the first click.
    if (activeTool === 'horizontal_line') {
      completeDrawing(point);
      isDrawing = false;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDrawing || !activeTool) return;

    const point = pointFromEvent(e);
    if (!point) return;

    previewPoints = [previewPoints[0], point];
  }

  function completeDrawing(endPoint: Point) {
    if (!activeTool || previewPoints.length === 0) return;

    const startPoint = previewPoints[0];
    const points = activeTool === 'horizontal_line' ? [endPoint] : [startPoint, endPoint];

    oncreate?.({
      id: crypto.randomUUID(),
      type: activeTool,
      points,
      properties: {
        color: '#38bdf8',
        lineWidth: 2,
        lineStyle: 'solid',
        fibLevels: activeTool === 'fibonacci' ? DEFAULT_FIB_LEVELS : undefined,
      },
    });

    isDrawing = false;
    previewPoints = [];
  }

  function handleContextMenu(e: MouseEvent, drawingId: string) {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as Element).closest('svg')?.getBoundingClientRect();
    if (!rect) return;

    contextMenu = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      drawingId,
    };
  }

  function deleteDrawing(id: string) {
    ondelete?.(id);
    contextMenu = null;
  }

  function closeMenu() {
    contextMenu = null;
  }

  // Helpers for rendering
  function toCoords(point: Point) {
    if (!point) return null;
    const x = timeScale.timeToCoordinate((point.timestamp / 1000) as unknown as import('lightweight-charts').Time);
    const y = series.priceToCoordinate(point.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  function getTrendlineD(p1: Point, p2: Point) {
    const c1 = toCoords(p1);
    const c2 = toCoords(p2);
    if (!c1 || !c2) return '';
    return `M ${c1.x} ${c1.y} L ${c2.x} ${c2.y}`;
  }

  function getHorizontalLineY(p: Point) {
    const c = toCoords(p);
    return c ? c.y : -1000;
  }

  function getFibLines(p1: Point, p2: Point, levels: number[]) {
    const c1 = toCoords(p1);
    const c2 = toCoords(p2);
    if (!c1 || !c2) return [];

    const yDiff = c2.y - c1.y;

    return levels.map((level) => {
      const y = c1.y + yDiff * level;
      return { y, level };
    });
  }
</script>

<svelte:window onclick={closeMenu} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg
  class="drawing-layer"
  {width}
  {height}
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  style:pointer-events={activeTool ? 'all' : 'none'}
  role="application"
  aria-label="Drawing Tools Overlay"
>
  <!-- Render Existing Drawings -->
  {#each drawings as drawing (drawing.id)}
    <!-- Trendline -->
    {#if drawing.type === 'trendline' && drawing.points.length === 2}
      <!-- Hit area -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <path
        d={getTrendlineD(drawing.points[0], drawing.points[1])}
        stroke={drawing.properties.color}
        stroke-width={drawing.properties.lineWidth + 6}
        stroke-opacity="0"
        fill="none"
        style="pointer-events: stroke; cursor: pointer;"
        oncontextmenu={(e) => handleContextMenu(e, drawing.id)}
      />
      <path
        d={getTrendlineD(drawing.points[0], drawing.points[1])}
        stroke={drawing.properties.color}
        stroke-width={drawing.properties.lineWidth}
        fill="none"
        style="pointer-events: none;"
      />
      <!-- Endpoints -->
      {#each drawing.points as p, i (`${drawing.id}-${i}`)}
        {#if toCoords(p)}
          <circle
            cx={toCoords(p)?.x}
            cy={toCoords(p)?.y}
            r="3"
            fill="white"
            stroke={drawing.properties.color}
          />
        {/if}
      {/each}
    {/if}

    <!-- Horizontal Line -->
    {#if drawing.type === 'horizontal_line' && drawing.points.length > 0}
      {@const y = getHorizontalLineY(drawing.points[0])}
      <!-- Hit area line -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <line
        x1="0"
        y1={y}
        x2={width}
        y2={y}
        stroke="transparent"
        stroke-width={drawing.properties.lineWidth + 6}
        style="pointer-events: stroke; cursor: pointer;"
        oncontextmenu={(e) => handleContextMenu(e, drawing.id)}
      />
      <!-- Visible line -->
      <line
        x1="0"
        y1={y}
        x2={width}
        y2={y}
        stroke={drawing.properties.color}
        stroke-width={drawing.properties.lineWidth}
        style="pointer-events: none;"
      />
    {/if}

    <!-- Fibonacci -->
    {#if drawing.type === 'fibonacci' && drawing.points.length === 2}
      {#each getFibLines(drawing.points[0], drawing.points[1], drawing.properties.fibLevels || []) as fib (fib.level)}
        <!-- Hit area -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <line
          x1="0"
          y1={fib.y}
          x2={width}
          y2={fib.y}
          stroke="transparent"
          stroke-width="5"
          style="pointer-events: stroke; cursor: pointer;"
          oncontextmenu={(e) => handleContextMenu(e, drawing.id)}
        />
        <!-- Visible Line -->
        <line
          x1="0"
          y1={fib.y}
          x2={width}
          y2={fib.y}
          stroke={drawing.properties.color}
          stroke-width="1"
          stroke-dasharray="4 4"
          style="pointer-events: none;"
        />
        <text x={width - 40} y={fib.y - 4} fill={drawing.properties.color} font-size="10"
          >{fib.level.toFixed(3)}</text
        >
      {/each}
      <!-- Diagonal connection line -->
      <path
        d={getTrendlineD(drawing.points[0], drawing.points[1])}
        stroke={drawing.properties.color}
        stroke-width="1"
        stroke-dasharray="2 2"
        opacity="0.5"
      />
    {/if}
  {/each}

  <!-- Render Preview (Active Drawing) -->
  {#if isDrawing && activeTool && previewPoints.length > 0}
    {#if activeTool === 'trendline' && previewPoints.length === 2}
      <path
        d={getTrendlineD(previewPoints[0], previewPoints[1])}
        stroke="#38bdf8"
        stroke-width="2"
        stroke-dasharray="4 4"
        fill="none"
      />
    {:else if activeTool === 'fibonacci' && previewPoints.length === 2}
      {#each getFibLines(previewPoints[0], previewPoints[1], DEFAULT_FIB_LEVELS) as fib (fib.level)}
        <line
          x1="0"
          y1={fib.y}
          x2={width}
          y2={fib.y}
          stroke="#38bdf8"
          stroke-width="1"
          stroke-dasharray="4 4"
        />
      {/each}
    {/if}
  {/if}
</svg>

{#if contextMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="context-menu" style="top: {contextMenu.y}px; left: {contextMenu.x}px;" onclick={(e) => e.stopPropagation()}>
    <button class="menu-item delete" onclick={() => deleteDrawing(contextMenu?.drawingId || '')}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
      Remove
    </button>
  </div>
{/if}

<style>
  .drawing-layer {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10; /* Above chart canvas */
    overflow: visible;
  }
  text {
    font-family: var(--font-sans);
    pointer-events: none;
  }

  .context-menu {
    position: absolute;
    background: var(--bg-top);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    padding: var(--space-1);
    min-width: 120px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
    z-index: 50;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .menu-item:hover {
    background: rgba(51, 65, 85, 1);
  }

  .menu-item.delete:hover {
    color: var(--danger-text);
    background: rgba(239, 68, 68, 0.1);
  }
</style>
