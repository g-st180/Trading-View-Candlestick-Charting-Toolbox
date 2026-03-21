# 📈 Trading View's Candlestick Charting Toolbox

A browser-based charting tool for technical analysis — built with React, TypeScript, and [lightweight-charts](https://github.com/nicehash/lightweight-charts). Ships with 20+ drawing tools, drag-to-resize handles, and a fully custom canvas overlay renderer.

> A candlestick charting workspace inspired by professional trading platforms — running entirely in your browser with zero backend dependency.

## Screenshots

<p align="center">
  <img src="./docs/screenshots/1.jpeg" width="48%" alt="Trading View's Candlestick Charting Toolbox — chart view 1" />
  &nbsp;
  <img src="./docs/screenshots/2.jpeg" width="48%" alt="Trading View's Candlestick Charting Toolbox — chart view 2" />
</p>
<p align="center">
  <img src="./docs/screenshots/3.jpeg" width="48%" alt="Trading View's Candlestick Charting Toolbox — drawing tools" />
  &nbsp;
  <img src="./docs/screenshots/4.jpeg" width="48%" alt="Trading View's Candlestick Charting Toolbox — annotations and overlays" />
</p>

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Drawing Tools](#drawing-tools)
- [Adding a New Tool](#adding-a-new-tool)
- [Tech Stack](#tech-stack)

---

## Quick Start

```bash
git clone https://github.com/g-st180/groww_clone.git
cd groww_clone

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
│  ┌───────────┐   ┌──────────────────────────────────────────────┐   │
│  │           │   │              FullscreenChart                 │   │
│  │   Left    │   │                                              │   │
│  │  Toolbar  │──▶│  ┌────────────────────────────────────────┐  │   │
│  │           │   │  │         CandlestickChart               │  │   │
│  │  (tool    │   │  │                                        │  │   │
│  │  select,  │   │  │  ┌──────────────┐  ┌───────────────┐   │  │   │
│  │  colors,  │   │  │  │ lightweight- │  │   Drawing     │   │  │   │
│  │  styles)  │   │  │  │ charts       │  │   Overlay     │   │  │   │
│  │           │   │  │  │ (candles,    │  │   (canvas)    │   │  │   │
│  └───────────┘   │  │  │  grid, axes) │  │               │   │  │   │  
│                  │  │  └──────┬───────┘  └──────┬────────┘   │  │   │
│  ┌───────────┐   │  │         │                 │            │  │   │
│  │ Drawing   │   │  │         ▼                 ▼            │  │   │
│  │ Context   │◀─▶│  │  ┌─────────────────────────────────┐   │  │   │
│  │ (state)   │   │  │  │    DrawingsUnderlayPrimitive    │   │  │   │
│  └───────────┘   │  │  │    (below-candle rendering)     │   │  │   │
│                  │  │  └─────────────────────────────────┘   │  │   │
│                  │  └────────────────────────────────────────┘  │   │
│                  └──────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐                             │
│  │  Navigation  │  │  drawingHelpers  │                             │ 
│  │  (top bar)   │  │  (pure utils)    │                             │
│  └──────────────┘  └──────────────────┘                             │
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
├── docs/
│   └── screenshots/                    # README & docs images
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

<sub>Built with ❤️ and too many canvas pixels.</sub>
