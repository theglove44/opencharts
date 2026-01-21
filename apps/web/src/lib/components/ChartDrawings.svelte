<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
  import type { Drawing, DrawingType, Point } from '$lib/types/drawing';
  import { DEFAULT_FIB_LEVELS } from '$lib/types/drawing';

  export let chart: IChartApi;
  export let series: ISeriesApi<'Candlestick'>;
  export let drawings: Drawing[] = [];
  export let activeTool: DrawingType | null = null;
  export let width = 0;
  export let height = 0;

  const dispatch = createEventDispatcher();

  let previewPoints: Point[] = [];
  let isDrawing = false;
  let hoveredDrawingId: string | null = null;

  let contextMenu: { x: number; y: number; drawingId: string } | null = null;

  // Coordinate conversion helpers
  $: timeScale = chart.timeScale();

  function toCoords(point: Point) {
    if (!point) return null;
    const x = timeScale.timeToCoordinate((point.timestamp / 1000) as any);
    const y = series.priceToCoordinate(point.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  // Interaction handlers
  function handleMouseDown(e: MouseEvent) {
    if (!activeTool) return;

    // Get chart coordinates from mouse event
    // We rely on the parent container passing us standard mouse events,
    // but lightweight-charts coordinate conversion needs the internal chart coordinates.
    // The SVG overlay should be exactly on top of the chart container (position: absolute).

    // Since we are in an overlay, we can just use e.offsetX/Y but we need to convert to Time/Price.
    // This is tricky: lightweight-charts API converts Time/Price -> Coordinate.
    // To go Coordinate -> Time/Price, we need coordinateToTime / coordinateToPrice.

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = timeScale.coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time === null || price === null) return;

    // Convert time to timestamp (lightweight-charts can return object or number)
    const timestamp = (time as number) * 1000; // Assuming input is seconds since we devided by 1000 earlier

    const point: Point = { timestamp, price };

    if (!isDrawing) {
      // Start drawing
      isDrawing = true;
      previewPoints = [point];
    } else {
      // Finish drawing (for 2-point tools)
      // If we support multi-point tools later, this logic will need to change.
      // All current supported tools (Trendline, Fib, Rect) are 2 points.
      // H-Line is 1 point (click to place).

      if (activeTool === 'horizontal_line') {
        // It's 1 point, so we shouldn't have been 'isDrawing' wait for 2nd point?
        // Actually let's just complete it immediately on first click if it's 1 point.
      } else {
        completeDrawing(point);
      }
    }

    // Special handling for 1-click tools
    if (activeTool === 'horizontal_line') {
      completeDrawing(point);
      isDrawing = false;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDrawing || !activeTool) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = timeScale.coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time === null || price === null) return;
    const timestamp = (time as number) * 1000;

    // Update preview (2nd point)
    previewPoints = [previewPoints[0], { timestamp, price }];
  }

  function completeDrawing(endPoint: Point) {
    if (previewPoints.length === 0) return; // Should not happen

    const startPoint = previewPoints[0];
    const points = activeTool === 'horizontal_line' ? [endPoint] : [startPoint, endPoint];

    const newDrawing: Drawing = {
      id: crypto.randomUUID(),
      type: activeTool!,
      points,
      properties: {
        color: '#38bdf8', // Default color
        lineWidth: 2,
        lineStyle: 'solid',
        fibLevels: activeTool === 'fibonacci' ? DEFAULT_FIB_LEVELS : undefined,
      },
    };

    dispatch('create', newDrawing);
    isDrawing = false;
    previewPoints = [];
  }

  function handleContextMenu(e: MouseEvent, drawingId: string) {
    e.preventDefault();
    e.stopPropagation();

    // Position menu at mouse coordinates relative to container (or viewport?)
    // Using simple offsetting
    const rect = (e.currentTarget as Element).closest('svg')?.getBoundingClientRect();
    if (!rect) return;

    contextMenu = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      drawingId,
    };
  }

  function deleteDrawing(id: string) {
    dispatch('delete', id);
    contextMenu = null;
  }

  function closeMenu() {
    contextMenu = null;
  }

  // Helpers for rendering

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

<svelte:window on:click={closeMenu} />

<svg
  class="drawing-layer"
  {width}
  {height}
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  style:pointer-events={activeTool ? 'all' : 'none'}
  role="application"
  aria-label="Drawing Tools Overlay"
>
  <!-- Render Existing Drawings -->
  {#each drawings as drawing (drawing.id)}
    <!-- Trendline -->
    {#if drawing.type === 'trendline' && drawing.points.length === 2}
      <path
        d={getTrendlineD(drawing.points[0], drawing.points[1])}
        stroke={drawing.properties.color}
        stroke-width={drawing.properties.lineWidth + 6}
        stroke-opacity="0"
        fill="none"
        style="pointer-events: stroke; cursor: pointer;"
        on:contextmenu={(e) => handleContextMenu(e, drawing.id)}
      />
      <path
        d={getTrendlineD(drawing.points[0], drawing.points[1])}
        stroke={drawing.properties.color}
        stroke-width={drawing.properties.lineWidth}
        fill="none"
        style="pointer-events: none;"
      />
      <!-- Endpoints (optional, for selection) -->
      {#each drawing.points as p}
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
      <line
        x1="0"
        y1={y}
        x2={width}
        y2={y}
        stroke="transparent"
        stroke-width={drawing.properties.lineWidth + 6}
        style="pointer-events: stroke; cursor: pointer;"
        on:contextmenu={(e) => handleContextMenu(e, drawing.id)}
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
      {#each getFibLines(drawing.points[0], drawing.points[1], drawing.properties.fibLevels || []) as fib}
        <!-- Hit area -->
        <line
          x1="0"
          y1={fib.y}
          x2={width}
          y2={fib.y}
          stroke="transparent"
          stroke-width="5"
          style="pointer-events: stroke; cursor: pointer;"
          on:contextmenu={(e) => handleContextMenu(e, drawing.id)}
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
    <!-- Trendline Preview -->
    {#if activeTool === 'trendline' && previewPoints.length === 2}
      <path
        d={getTrendlineD(previewPoints[0], previewPoints[1])}
        stroke="#38bdf8"
        stroke-width="2"
        stroke-dasharray="4 4"
        fill="none"
      />
    {/if}

    <!-- Fibonacci Preview -->
    {#if activeTool === 'fibonacci' && previewPoints.length === 2}
      {#each getFibLines(previewPoints[0], previewPoints[1], DEFAULT_FIB_LEVELS) as fib}
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
  <div
    class="context-menu"
    style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
    on:click|stopPropagation
  >
    <button class="menu-item delete" on:click={() => deleteDrawing(contextMenu?.drawingId || '')}>
      <span class="icon">🗑️</span> Remove
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
    font-family: sans-serif;
    pointer-events: none;
  }

  .context-menu {
    position: absolute;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 4px;
    min-width: 120px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
    z-index: 50;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: #e2e8f0;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
  }

  .menu-item:hover {
    background: #334155;
  }

  .menu-item.delete:hover {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.1);
  }

  .icon {
    font-size: 14px;
  }
</style>
