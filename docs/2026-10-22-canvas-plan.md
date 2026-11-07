# yac-canvas implementation plan

**Goal:** the app in `2026-10-22-canvas-design.md`, all scope in one pass.
**Architecture:** pure engine (`web/src/engine/*`, no React) + React SVG renderer + Kasumi chrome; IndexedDB storage.
**Tech stack:** Vite 8, React 18, Tailwind 3 + Kasumi, roughjs, polygon-clipping, node:test, Playwright 1.61.1.

## Global constraints
- Local only: commit, never push, no remote. Web on `127.0.0.1:5191`.
- Chrome = Kasumi components only (lint guard `designSystemGuard` on).
- No other product's names, logos, icons, code or fonts.
- Licences of every added library/font recorded in `THIRD_PARTY.md`.

## Tasks (each: failing test → implement → pass → commit)

| # | Files | Interfaces produced | Tests |
|---|---|---|---|
| 1 | scaffold: `package.json`, `web/{index.html,vite,tailwind,postcss}.config.js`, `eslint.config.js` | `npm run dev/test/lint/build/e2e` | — |
| 2 | `engine/geometry.js` | `rotatePoint(p,c,a)`, `elementBounds(el)`, `hitTest(el,p,tol)`, `distToSegment`, `pointInPolygon`, `rectsIntersect`, `outline(el)`, `borderPoint(el, toward)` | rotated rect/ellipse/diamond hits, line tolerance, freehand, polygon |
| 3 | `engine/viewport.js` | `toWorld(vp,p)`, `toScreen(vp,p)`, `zoomAt(vp,p,factor)`, `fitBounds(vp,b,size)`, `clampZoom` | zoom keeps point under cursor fixed; round-trip |
| 4 | `engine/elements.js`, `engine/scene.js` | `createElement(type,props)`, `addElements`, `updateElements`, `deleteElements`, z-order ops, `group/ungroup`, `duplicate`, `align`, `distribute`, `expandGroups` | z-order, groups, duplicate remaps ids + bindings |
| 5 | `engine/history.js` | `createHistory()`, `push(doc)`, `undo()`, `redo()`, coalescing key | undo/redo, branch drops redo, cap |
| 6 | `engine/transform.js` | `resize(el,handle,delta,opts)`, `rotate`, `scaleGroup`, `moveBy` | handles, shift ratio, alt centre, rotated resize |
| 7 | `engine/snapping.js` | `snapToGrid`, `snapMove(bounds, others, threshold) → {dx,dy,guides}` | edge/centre snap, guides |
| 8 | `engine/connectors.js` | `bindingFor(el,p)`, `resolveEndpoints(conn,elsById)`, `routeElbow(a,b,boxes)`, `curvePath`, `updateBoundConnectors(doc,ids)` | attach, follows shape move, elbow avoids boxes |
| 9 | `engine/shapes.js` | library `SHAPES[kind] = {group,label,path(w,h),poly(w,h)}` | every shape yields closed poly |
| 10 | `engine/boolean.js`, `engine/layout.js`, `engine/components.js` | `booleanOp(op, els)`, `treeLayout`, `applyAutoLayout(frame, children)`, `makeComponent`, `resolveInstance` | union area, tree levels, row/col gap/padding, instance follows master |
| 11 | `engine/serialize.js`, `render/exportSvg.js` | `serializeBoard`, `parseBoard` (validates), `exportSvg(page,ids,opts)`, `exportPng` | round-trip equal, rejects bad input, SVG contains elements |
| 12 | `store/*` (doc store, IndexedDB, BroadcastChannel collab) | `useEditor()`, `boardsDb`, `collab` | merge LWW by version |
| 13 | `render/*` (Scene, ElementView, rough cache, selection, guides, grid, minimap) | — | via e2e |
| 14 | `tools/*` pointer state machine (select, draw, connector, pen, eraser, laser, hand, text, comment) | — | via e2e |
| 15 | `ui/*` (MenuBar, Toolbar, ShapeLibrary, FormatPanel, LayersPanel, PagesBar, ZoomBar, Help, BoardsHome, Comments) + Kasumi additions | — | lint + e2e |
| 16 | `e2e/canvas.spec.js` | — | draw → connect → move → undo → export |
