# DESIGN.md

Agasteer — Design System

## 1. Visual Theme & Atmosphere

Minimal note-taking with multi-theme personality. A two-pane layout (note list + editor) that adapts to six distinct themes — from warm neutral to retro neon blue to dark green chalkboard. The UI stays out of the way; the writing surface is the product. Svelte-powered with CSS custom properties for seamless theme switching.

Inspirations: Simplenote, iA Writer, VS Code's theme system, traditional chalkboards.

## 2. Color Palette & Roles

All colors are CSS custom properties, dynamically computed via `color-mix()`.

### Core Variables

| Variable             | Derivation              | Usage                               |
| -------------------- | ----------------------- | ----------------------------------- |
| `--bg`               | Theme-defined           | Page background                     |
| `--text`             | Theme-defined           | Primary text                        |
| `--accent`           | Theme-defined           | Brand, links, selection             |
| `--error`            | Theme-defined           | Error states                        |
| `--selection`        | `accent 35% + bg 65%`   | Text selection highlight            |
| `--selection-active` | `accent 80% + text 20%` | Selection on active line (stronger) |
| `--text-muted`       | `text 70% + bg 30%`     | Secondary text                      |
| `--surface-1`        | `bg 92% + text 8%`      | Card backgrounds                    |
| `--surface-2`        | `bg 86% + text 14%`     | Badge backgrounds                   |
| `--border`           | `text 15% + bg 85%`     | Standard borders                    |
| `--border-strong`    | `text 25% + bg 75%`     | Input borders, toggles              |

### Theme Definitions

| Theme      | --bg      | --text    | --accent  | --error   | Character       |
| ---------- | --------- | --------- | --------- | --------- | --------------- |
| default    | `#fdfdfc` | `#1f2933` | `#c7a443` | `#b42318` | Warm neutral    |
| campus     | `#fdf8ec` | `#1f2937` | `#2f56c6` | `#b42318` | Academic blue   |
| greenboard | `#102117` | `#e6f0e7` | `#96d46a` | `#ff9f9f` | Dark chalkboard |
| whiteboard | `#e8e8e8` | `#1f2933` | `#3b82f6` | `#b42318` | Clean gray      |
| dotsD      | `#05080f` | `#e2ecff` | `#666666` | `#f472b6` | Dark modern     |
| dotsF      | `#0000aa` | `#ffffff` | `#5ca8ff` | `#ff6666` | Retro neon      |

### Static Colors

- Notification badge: `#ef4444`
- Toggle thumb: `#ffffff`

## 3. Typography Rules

### Font Families

| Context | Family                                                                                  |
| ------- | --------------------------------------------------------------------------------------- |
| UI text | `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`           |
| Editor  | `"Courier New", Menlo, Consolas, "Noto Sans Mono CJK JP", "Source Han Mono", monospace` |

### Type Scale

| Element       | Size             | Weight  | Notes      |
| ------------- | ---------------- | ------- | ---------- |
| h1            | 1.25rem (20px)   | 600     | Main title |
| h2            | 1.1rem (17.6px)  | inherit |            |
| h3            | 1rem (16px)      | inherit |            |
| Body          | 1rem (16px)      | 400     |            |
| Button        | 0.9rem (14.4px)  | 600     |            |
| Breadcrumb    | 0.875rem (14px)  | 400     |            |
| Status        | 0.8125rem (13px) | 400     |            |
| Badge         | 0.75rem (12px)   | 400     |            |
| Pull progress | 0.75rem (12px)   | 500     |            |

## 4. Component Stylings

### Note Cards

- Background: `var(--surface-1)`, group variant uses `var(--surface-2)`
- Border: `1px solid var(--border)`
- Border radius: `8px`
- Padding: `1rem`
- Height: `150px` (fixed)
- Hover: accent border, `box-shadow: 0 2px 8px rgba(0,0,0,0.1)`
- Selected: accent border, `box-shadow: 0 0 0 2px var(--accent)`
- Transition: `all 0.2s`

### Buttons — Primary

- Background: `var(--accent)`, color: `#fff`
- Padding: `8px 12px`
- Border radius: `6px`
- Font weight: 600
- Transition: `background-color 0.2s`

### Buttons — Icon

- Background: transparent
- Padding: `0.25rem`
- Border radius: `6px`
- Hover: `opacity: 0.7`
- Disabled: `opacity: 0.4`

### Badges

- Background: `var(--surface-2)`
- Color: `var(--accent)`
- Padding: `2px 8px`
- Border radius: `999px`
- Font size: `12px`

### Dirty Indicator

- `8px` circle, `#ef4444`, `border-radius: 50%`

### Toggle Switch

- Track: `52x28px`, `var(--border-strong)`, radius `28px`
- Thumb: `20px`, white, transition `0.3s`
- Active: accent bg, `translateX(24px)`

### Modals

- Overlay: `rgba(0,0,0,0.5)`, z-index `1000`
- Content: `var(--bg)`, padding `2rem`, radius `8px`, max-width `400px`
- Shadow: `0 4px 20px rgba(0,0,0,0.3)`

### Toast Notifications

- Position: fixed top center, z-index `2000`
- Background: `var(--surface-1)`
- Border: `2px solid` computed mix
- Border radius: `8px`
- Success: accent 30% mixed into surface
- Error: error 30% mixed into surface

### Inputs

- Border: `1px solid var(--border-strong)`
- Border radius: `6px`
- Padding: `8px`
- Focus: `border-color: var(--accent)`

## 5. Layout Principles

### Two-Pane Layout

- Grid: `grid-template-columns: 1fr 1fr` (dual pane) or `1fr` (single)
- Pane divider: `1px` absolute, z-index `150`
- Full height: `100dvh` (with `100vh` fallback)

### Header & Footer

- Height: `40px` each
- Padding: `8px 16px` (header), `0 1rem` (footer)
- Backdrop: `blur(10px)` with semi-transparent background
- Header z-index: `10`, footer z-index: `300`

### Card Grid

- `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`
- Gap: `12px`

### Spacing Scale

| Token | Value               |
| ----- | ------------------- |
| 2px   | Badge padding inner |
| 4px   | Small gaps          |
| 8px   | Standard padding    |
| 12px  | Card gaps, sections |
| 16px  | Section padding     |
| 2rem  | Modal padding       |

## 6. Depth & Elevation

### Shadows

| Context      | Shadow                        |
| ------------ | ----------------------------- |
| Card hover   | `0 2px 8px rgba(0,0,0,0.1)`   |
| Context menu | `0 4px 12px rgba(0,0,0,0.15)` |
| Toast        | `0 4px 12px rgba(0,0,0,0.15)` |
| Modal        | `0 4px 20px rgba(0,0,0,0.3)`  |

### Z-Index Stack

| Layer        | Value |
| ------------ | ----- |
| Header       | 10    |
| Pane divider | 150   |
| Loading      | 200   |
| Menu/Modal   | 1000  |
| Toast        | 2000  |

### Border Radius

| Component | Radius  |
| --------- | ------- |
| Buttons   | `6px`   |
| Cards     | `8px`   |
| Modal     | `8px`   |
| Inputs    | `6px`   |
| Badges    | `999px` |
| Toggle    | `28px`  |

### Backdrop Effects

- Header/footer: `backdrop-filter: blur(10px)`
- Config overlay: `backdrop-filter: blur(4px)`

## 7. Do's and Don'ts

### Do

- Use CSS custom properties for all colors — themes switch by changing 4 values
- Derive secondary colors with `color-mix()` from core variables
- Apply `backdrop-filter: blur(10px)` on header/footer
- Use the note card grid with `minmax(220px, 1fr)` for responsive columns
- Keep the two-pane layout for desktop, single pane for mobile
- Use CodeMirror 6 for the editor with theme-aware styling
- Respect `prefers-reduced-motion` — disable animations

### Don't

- Hardcode hex colors in components — always use CSS variables
- Add shadows as primary design element — borders and surface colors handle depth
- Use font sizes above 20px in the UI
- Break the `color-mix()` derivation chain — derived colors must stay in sync
- Override the monospace editor font stack

### Animations

| Animation | Duration  | Usage            |
| --------- | --------- | ---------------- |
| leaf-spin | 2.4s      | Loading spinner  |
| fadeIn    | 0.15-0.3s | Component entry  |
| shimmer   | 1.5s      | Skeleton loading |
| slideDown | 0.3s      | Install banner   |
| heartbeat | 1.5s      | Pulse effect     |

## 8. Responsive Behavior

### Breakpoints

| Trigger         | Change                       |
| --------------- | ---------------------------- |
| max-width 400px | Search bar optimization      |
| min-width 480px | Welcome modal layout         |
| max-width 768px | Mobile editor detection      |
| standalone PWA  | `100dvh` + safe area padding |

### PWA Adaptations

- iOS Safari: `height: -webkit-fill-available`
- PWA standalone: `100dvh` with `env(safe-area-inset-bottom)`

## 9. Agent Prompt Guide

### Theme Variable Reference

```
Core (set by theme):     --bg, --text, --accent, --error
Derived (auto-computed): --selection, --selection-active, --text-muted, --surface-1, --surface-2, --border, --border-strong
```

### When generating UI for this project

- Theme-aware. Every color must use CSS variables, never raw hex
- `color-mix(in srgb, ...)` for all derived colors. This is the color system
- Svelte 5 with scoped `<style>` blocks. No Tailwind
- Two-pane grid on desktop, single pane on mobile
- Header/footer at 40px with backdrop blur
- Cards at fixed 150px height in auto-fit grid
- CodeMirror 6 for Markdown editing with Vim mode support
- 6 themes with wildly different personalities — UI must work in all of them
- Toast at z-index 2000 (topmost), modals at 1000
- Notification badge is always `#ef4444` regardless of theme

### Theme Emotion Reference

- **default (gold accent):** Warm, familiar, paper-like
- **campus (blue accent):** Academic, focused, structured
- **greenboard (green accent):** Nostalgic, classroom, chalk on board
- **whiteboard (blue accent):** Clean, professional, bright
- **dotsD (gray accent):** Modern, muted, nighttime
- **dotsF (neon blue accent):** Retro, bold, CRT terminal
