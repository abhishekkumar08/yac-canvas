# yac canvas

Working name. An infinite canvas that is a hand-drawn whiteboard, a diagram editor and a UI design tool in one.
Local only: boards live in this browser (IndexedDB); files save as `.yaccanvas` JSON.

## Run

```bash
npm install
npm run dev        # web on http://127.0.0.1:5191 + live-sync relay on ws://127.0.0.1:5192
npm run web        # web only
npm run relay      # relay only (HOST / PORT env, defaults 127.0.0.1:5192; GET /health -> ok)
npm test           # engine unit tests (node:test)
npm run lint
npm run e2e        # Playwright journeys (starts the web server)
```

The relay listens on this Mac only (`127.0.0.1`). It forwards end-to-end encrypted messages between browsers in
the same room (Share → Start live session gives a `#/room/<id>,<key>` link; the key never reaches the server) and keeps the latest
encrypted snapshot per room in memory. To let other devices on your LAN join, opt in yourself with
`HOST=0.0.0.0 npm run relay` (anyone on the network who has the room link can then join that room).

Needs `../kasumi` next to this folder (the shared design system, linked with `file:`).

## Layouts

Each board has a layout, picked on New board or switched from the top bar:

| Layout | Arranged like | New shapes |
|---|---|---|
| Whiteboard | Minimal: corner menu, floating tools, style panel on demand, library drawer | Hand-drawn, hatched fills, Caveat font |
| Diagram | Menu bar, docked toolbar with quick actions, shapes left, format right, page tabs | Crisp, white fill, thin lines, elbow connectors |
| Design | Pages + layers docked left, properties docked right, tools at the bottom | Crisp, grey fill, no stroke, sans font |

## Files in and out

Open or import `.yaccanvas`, `.excalidraw`, `.drawio`/`.xml`, `.svg` and images; export `.yaccanvas`,
`.excalidraw`, `.drawio`, PNG, SVG; Insert → Diagram from text turns Mermaid flowcharts and sequence diagrams into
shapes. Plugins run in a sandboxed iframe with no network access (Insert → Plugins).

## Map

| Path | What |
|---|---|
| `web/src/engine/` | Pure logic, no React: geometry + hit-testing, viewport maths, transforms, snapping, connectors + elbow routing, scene ops, history, layout, boolean ops, components, file format, tab merge |
| `web/src/store/` | Editor state + undo, IndexedDB, prefs, tab-to-tab live sync (BroadcastChannel), cross-device sync through the relay (`relay.js`, shared `syncCore.js`) |
| `server/` | `relay.js`: tiny WebSocket relay for encrypted rooms (in-memory, no accounts) |
| `web/src/render/` | SVG renderer (roughjs for the hand-drawn look), text editor overlay, image export |
| `web/src/tools/` | Pointer controller (every tool) and selection handles |
| `web/src/ui/` | Kasumi chrome: menus, toolbar, panels, dialogs, keyboard, home |
| `test/` | Unit tests; `e2e/` Playwright |
| `docs/` | Design + plan |
