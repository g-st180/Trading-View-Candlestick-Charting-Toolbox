# 📈 TradingView Clone

A feature-rich, browser-based charting tool for technical analysis — built with React, TypeScript, and [lightweight-charts](https://github.com/nicehash/lightweight-charts). Ships with 20+ drawing tools, real-time hit-testing, drag-to-resize handles, and a fully custom canvas overlay renderer.

> Think TradingView's drawing suite, running entirely in your browser with zero backend dependency.

<!-- Add screenshots here -->

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Drawing Tools](#drawing-tools)
- [How It Works](#how-it-works)
- [Key Subsystems](#key-subsystems)
- [Adding a New Tool](#adding-a-new-tool)
- [Tech Stack](#tech-stack)
- [Future Plans](#future-plans)

---

## Quick Start

```bash
# Clone the repo
git clone <repo-url> && cd groww_clone

# Install frontend dependencies
cd frontend
npm install

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Browser                                   │
│                                                                     │
│  ┌───────────┐   ┌──────────────────────────────────────────────┐  │
│  │           │   │              FullscreenChart                  │  │
│  │   Left    │   │                                              │  │
│  │  Toolbar  │──▶│  ┌────────────────────────────────────────┐  │  │
│  │           │   │  │         CandlestickChart               │  │  │
│  │  (tool    │   │  │                                        │  │  │
│  │  select,  │   │  │  ┌──────────────┐  ┌───────────────┐  │  │  │
│  │  colors,  │   │  │  │ lightweight-  │  │   Drawing     │  │  │  │
│  │  styles)  │   │  │  │ charts       │  │   Overlay     │  │  │  │
│  │           │   │  │  │ (candles,    │  │   (canvas)    │  │  │  │
│  └───────────┘   │  │  │  grid, axes) │  │              │  │  │  │
│                  │  │  └──────┬───────┘  └──────┬────────┘  │  │  │
│  ┌───────────┐   │  │         │                  │           │  │  │
│  │ Drawing   │   │  │         ▼                  ▼           │  │  │
│  │ Context   │◀─▶│  │  ┌─────────────────────────────────┐  │  │  │
│  │ (state)   │   │  │  │    DrawingsUnderlayPrimitive    │  │  │  │
│  └───────────┘   │  │  │    (below-candle rendering)     │  │  │  │
│                  │  │  └─────────────────────────────────┘  │  │  │
│                  │  └────────────────────────────────────────┘  │  │
│                  └──────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐                            │
│  │  Navigation  │  │  drawingHelpers  │                            │
│  │  (top bar)   │  │  (pure utils)    │                            │
│  └──────────────┘  └──────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘

Data flow:
  User click ──▶ CandlestickChart (event handler)
                      │
                      ├──▶ DrawingContext  (state update)
                      │
                      ├──▶ DrawingOverlay  (canvas re-render)
                      │
                      └──▶ UnderlayPrimitive (below-candle re-render)
```

---

## Project Structure

```
groww_clone/
├── README.md
├── .gitignore
├── backend/
│   ├── main.py                          # FastAPI WebSocket server (future use)
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx                      # Entry point
        ├── App.tsx                       # Router setup
        ├── index.css                     # Global styles (Tailwind)
        ├── CandlestickChart.tsx          # Core chart + drawing interaction
        ├── types/
        │   └── drawing.ts               # Shared TypeScript types
        ├── utils/
        │   └── drawingHelpers.ts        # Pure geometry & math utilities
        ├── components/
        │   ├── DrawingContext.tsx        # React context for drawing state
        │   ├── DrawingOverlay.tsx        # Canvas overlay renderer
        │   ├── DrawingsUnderlayPrimitive.ts  # Below-candle renderer
        │   ├── LeftToolbar.tsx           # Tool selection sidebar
        │   └── Navigation.tsx           # Top navigation bar
        └── pages/
            └── FullscreenChart.tsx       # Main page layout
```

---

## Drawing Tools

### Lines

| Tool | Description |
|------|-------------|
| Trend Line | Two-point line segment |
| Info Line | Trend line with a stats box (delta, %, bars) |
| Ray | Line extending infinitely in one direction |
| Horizontal Line | Price-level marker across the full chart |
| Horizontal Ray | Half-infinite horizontal from a point |
| Parallel Channel | Two parallel trend lines with fill |

### Projection

| Tool | Description |
|------|-------------|
| Long Position | Risk/reward box for long trades (entry, TP, SL) |
| Short Position | Risk/reward box for short trades (entry, TP, SL) |

### Measurers

| Tool | Description |
|------|-------------|
| Price Range | Vertical distance between two price levels |
| Date Range | Horizontal distance between two time points |
| Date & Price Range | Combined area measurement |

### Fibonacci

| Tool | Description |
|------|-------------|
| Fibonacci Retracement | Standard fib levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1) |
| Gann Box | Grid overlay with Gann ratios |

### Shapes

| Tool | Description |
|------|-------------|
| Brush | Freehand drawing |
| Rectangle | Axis-aligned box |
| Path | Multi-point polyline |
| Circle | Center + radius |
| Curve | Quadratic Bézier with control point |

### Arrows

| Tool | Description |
|------|-------------|
| Arrow | Simple directional arrow |
| Arrow Marker | Styled arrow indicator |
| Arrow Mark Up | Bullish marker (▲) |
| Arrow Mark Down | Bearish marker (▼) |

### Annotation

| Tool | Description |
|------|-------------|
| Text | Editable text label placed on chart |
| Emoji | Emoji picker with placement |

### Utility

| Tool | Description |
|------|-------------|
| Zoom | Click-drag to zoom into a region |
| Crosshair Modes | Cross, arrow, demonstration, eraser |
| Interactions | Drag handles, drag body, lock, hide, delete, keyboard delete |

---

## How It Works

The rendering pipeline has three layers that composite together:

```
  ┌─────────────────────────────────┐
  │        DrawingOverlay           │  ← topmost: handles, labels, text
  │        (HTML5 Canvas)           │
  ├─────────────────────────────────┤
  │     lightweight-charts          │  ← middle: candles, volume, grid
  │        (WebGL/Canvas)           │
  ├─────────────────────────────────┤
  │   DrawingsUnderlayPrimitive     │  ← bottom: filled shapes, channels
  │     (ISeriesPrimitive)          │
  └─────────────────────────────────┘
```

1. **User selects a tool** from `LeftToolbar` → updates `DrawingContext`.
2. **Mouse events** on the chart area are captured by `CandlestickChart`, which converts pixel coordinates to `{ time, price }` using the lightweight-charts coordinate API.
3. **Drawing objects** are stored as typed structs in `DrawingContext` (points, style, tool type).
4. **Rendering** happens on two layers simultaneously:
   - `DrawingsUnderlayPrimitive` renders filled regions *below* candles via the `ISeriesPrimitive` plugin API.
   - `DrawingOverlay` renders lines, handles, labels, and interactive elements on a canvas *above* candles.
5. **Hit-testing** on mouse move checks proximity to every visible drawing's edges and handles, highlighting the nearest match and changing the cursor.
6. **Dragging** updates the drawing's anchor points in real-time, re-rendering each frame.

---

## Key Subsystems

### Chart Setup

`CandlestickChart.tsx` initializes a `lightweight-charts` instance, feeds it OHLCV data, attaches the underlay primitive, and wires up mouse/keyboard event listeners. All coordinate translation (pixel ↔ price/time) flows through this component.

### Drawing Placement

When a tool is active, click events create anchor points. Single-click tools (horizontal line, markers) complete immediately. Two-click tools (trend line, rectangle) require a start and end point. Multi-click tools (path) accumulate points until double-click or Enter.

### Hit-Testing

On every `mousemove`, the overlay iterates visible drawings and tests point-to-segment distance, point-in-rect, and point-to-handle proximity. The closest match within a threshold is marked as "hovered" and rendered with highlight styling.

### Drag System

When a hovered drawing's handle or body is mousedown'd, the drag system activates. It captures the initial offset and updates anchor points on each `mousemove`, snapping to the price/time grid. `mouseup` commits the final position.

### Rendering

`DrawingOverlay` uses `requestAnimationFrame`-driven Canvas 2D rendering. Each drawing type has a dedicated render function that reads anchor points, converts to pixel coordinates, and draws lines/fills/text. `drawingHelpers.ts` provides pure geometric utilities (distance-to-segment, bezier interpolation, rectangle intersection).

---

## Adding a New Tool

A step-by-step guide for contributors:

### 1. Define the type

Add your tool to the union type in `types/drawing.ts`:

```typescript
export type DrawingTool = 
  | 'trendline'
  | 'rectangle'
  // ...
  | 'my_new_tool';
```

### 2. Add a toolbar entry

In `LeftToolbar.tsx`, add an icon and entry to the appropriate tool group so it appears in the sidebar.

### 3. Handle placement logic

In `CandlestickChart.tsx`, add a case to the mouse-event handler that creates anchor points for your tool. Follow the pattern of similar tools (two-click for segments, single-click for markers, etc.).

### 4. Define the drawing struct

Create the shape data your tool needs (anchor points, style overrides) and store it in `DrawingContext`.

### 5. Implement rendering

In `DrawingOverlay.tsx`, add a render function for your tool. Convert anchor points to pixel coordinates and use Canvas 2D API to draw.

If your tool needs a filled region behind candles, also add rendering logic to `DrawingsUnderlayPrimitive.ts`.

### 6. Add hit-testing

Add proximity detection for your tool's geometry in the hit-test loop inside `DrawingOverlay.tsx`, so users can hover and select it.

### 7. Add drag support

Wire up handle and body dragging by extending the drag handler in `CandlestickChart.tsx` to update your tool's anchor points.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| [React 18](https://react.dev) | UI framework |
| [TypeScript](https://www.typescriptlang.org) | Type safety |
| [Vite](https://vitejs.dev) | Dev server & bundler |
| [lightweight-charts](https://github.com/nicehash/lightweight-charts) | Financial charting engine |
| [Tailwind CSS](https://tailwindcss.com) | Utility-first styling |
| [emoji-picker-react](https://github.com/ealush/emoji-picker-react) | Emoji selection for annotation tool |
| [FastAPI](https://fastapi.tiangolo.com) | Backend WebSocket server (planned) |

---

## Future Plans

- **Real-time data** — connect the FastAPI WebSocket backend to stream live OHLCV candles
- **Drawing persistence** — save/load drawings to localStorage or a database
- **More indicators** — moving averages, Bollinger Bands, RSI overlays
- **Multi-chart layouts** — side-by-side or stacked chart panels
- **Undo/redo stack** — proper command-pattern history for all drawing operations
- **Drawing templates** — save and re-apply drawing configurations
- **Export** — screenshot and SVG export of chart with drawings
- **Mobile support** — touch-friendly drawing interactions

---

<sub>Built with ❤️ and too many canvas pixels.</sub>
