# yac-canvas — design

Working name until YAC HQ picks a product name. Approved in chat on 2026-10-22.

## Problem and user
YAC wants one local canvas app that does what a hand-drawn whiteboard, a diagram editor and a UI design tool do,
built in one pass (no v1/v2 split). The user is the YAC founder and their team, on one Mac.

## Reference capture
REA 6.7.0 (passive `inspect-web-page` + `capture-web-screenshot`, logged-out, throwaway Chrome) captured the two
public editors. Structure notes live in the shared session notes folder (`yac-canvas-rea-teardown.md`). The design
tool needs a login, so its behaviour comes from its public feature set. No names, logos, icons, code, or fonts are copied.

## Scope (all in)
| Area | Features |
|---|---|
| Canvas | Infinite pan/zoom, grid (lines/dots/none), page view, background, dark mode, minimap |
| Tools (top bar, keys 1–0 and letters) | lock, hand, select, rectangle, diamond, ellipse, arrow, line, freehand, text, image, eraser, sticky, frame, laser, pen, comment |
| Diagram | shape library with search (General, Basic, Arrows, Flowchart, Entity-relation, UML, Containers) + scratchpad; bound connectors (straight / elbow with obstacle avoidance / curved), labels, arrowheads, waypoints; tables; tree auto-layout |
| Design | frames with presets, layers panel, components + instances, auto-layout frames (row/column, gap, padding), pen paths, boolean ops, rulers |
| Editing | select/move/resize/rotate, marquee + shift multi-select, group/ungroup, lock, align/distribute, z-order, snapping + guides, copy/paste/duplicate, copy/paste style, undo/redo, find, shortcuts + help |
| Styling | stroke/fill, fill pattern (hachure/cross-hatch/solid/none), stroke width/style, roughness (hand-drawn ↔ crisp), radius, opacity, shadow, font/size/align |
| Files | many boards, many pages per board, IndexedDB autosave; export PNG/SVG (all or selection, background toggle); save/open `.yaccanvas` JSON; paste/drop images |
| Comments & collab | comment pins with threads; live sync + cursors between tabs of this browser (BroadcastChannel) |

Out: cloud share links and cross-device collab (needs a server off this Mac), AI generation, plugins,
importing other apps' formats.

## Approach
SVG rendering (chosen over Canvas 2D and over wrapping an existing editor engine). Pure engine modules
(geometry, viewport, scene ops, history, connectors, snapping, transforms, serialization, layout, boolean ops)
have no React and are unit-tested with `node --test`. React renders the document as SVG; the same renderer
produces SVG export via `renderToStaticMarkup`, and PNG export rasterises that SVG.

Hand-drawn look: `roughjs` (MIT) with a per-element seed so shapes don't jitter between renders.
Boolean ops: `polygon-clipping` (MIT). Handwriting font: Caveat via `@fontsource/caveat` (OFL-1.1).

## Data model
Board `{ id, name, pages: Page[], files: {id → dataURL}, updatedAt, v: 1 }`.
Page `{ id, name, elements: Element[] (z-order = array order), comments: Comment[], background, grid }`.
Element base `{ id, type, x, y, w, h, angle, stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness,
opacity, radius, shadow, groupIds, locked, frameId, seed, version, text, fontSize, fontFamily, textAlign }`
plus per-type fields (connector `points`, `start/endBinding`, `routing`, `start/endArrow`; `kind` for library
shapes; `fileId` for images; `cells` for tables; `componentId` for instances; `d` for paths; `layout` for frames).

## Chrome
All toolbars, menus, panels and dialogs use Kasumi (`@kasumi/ui`, `file:../kasumi`). Kasumi additions stay
product-neutral: `Slider`, `ColorSwatches`, and `shortcut`/`checked` on `MenuItem` (additive only).

## Testing
Unit tests for hit-testing, viewport/zoom maths, transforms, snapping, connector binding + routing, history,
scene ops, layout, boolean ops, serialization round-trip and SVG export. One Playwright journey for draw →
connect → undo → export. Max 2–3 browser tabs.

## Assumptions
- Single user per machine; collab is tab-to-tab only.
- Very large boards (>3k elements) may be slow with SVG; acceptable.
