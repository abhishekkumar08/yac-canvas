import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import { createBoard, validateBoard } from "../web/src/engine/serialize.js";
import { importExcalidraw, exportExcalidraw } from "../web/src/engine/interop/excalidraw.js";
import { importDrawio, exportDrawio } from "../web/src/engine/interop/drawio.js";
import { mermaidToElements } from "../web/src/engine/interop/mermaid.js";
import { svgToImage } from "../web/src/engine/interop/svg.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const boardWith = (elements, files = {}) => {
  const board = createBoard();
  board.pages[0].elements = elements;
  board.files = files;
  return validateBoard(board);
};
const byText = (els, text) => els.find((e) => e.text === text);

const excalidrawSample = {
  type: "excalidraw",
  version: 2,
  source: "test",
  elements: [
    { id: "r1", type: "rectangle", x: 10, y: 20, width: 120, height: 60, angle: 0, strokeColor: "#1971c2", backgroundColor: "#a5d8ff", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: ["g1"], frameId: null, roundness: { type: 3 }, boundElements: [{ id: "t1", type: "text" }, { id: "a1", type: "arrow" }] },
    { id: "t1", type: "text", x: 20, y: 40, width: 80, height: 25, angle: 0, strokeColor: "#1971c2", backgroundColor: "transparent", text: "Start", originalText: "Start", fontSize: 20, fontFamily: 2, textAlign: "center", verticalAlign: "middle", containerId: "r1", groupIds: ["g1"] },
    { id: "e1", type: "ellipse", x: 300, y: 20, width: 80, height: 80, angle: 0.5, strokeColor: "#e03131", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 1, strokeStyle: "dashed", roughness: 0, opacity: 60, groupIds: [], boundElements: [{ id: "a1", type: "arrow" }] },
    { id: "a1", type: "arrow", x: 130, y: 50, width: 170, height: 10, angle: 0, strokeColor: "#000000", backgroundColor: "transparent", points: [[0, 0], [170, 10]], startBinding: { elementId: "r1", focus: 0, gap: 4 }, endBinding: { elementId: "e1", focus: 0, gap: 4 }, startArrowhead: null, endArrowhead: "triangle", groupIds: [] },
    { id: "x1", type: "text", x: 0, y: 200, width: 100, height: 25, angle: 0, strokeColor: "#2f9e44", text: "Free", fontSize: 28, fontFamily: 3, textAlign: "left", verticalAlign: "top", containerId: null, groupIds: [] },
    { id: "gone", type: "rectangle", x: 0, y: 0, width: 5, height: 5, isDeleted: true },
    { id: "f1", type: "frame", x: -50, y: -50, width: 600, height: 400, name: "Main", groupIds: [] },
    { id: "i1", type: "image", x: 400, y: 200, width: 30, height: 30, fileId: "file1", frameId: "f1", groupIds: [] },
    { id: "em", type: "embeddable", x: 0, y: 300, width: 200, height: 100, link: "https://example.com", groupIds: [] },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: { file1: { mimeType: "image/png", id: "file1", dataURL: PNG } },
};

test("excalidraw import maps types, styles, bindings and bound text", () => {
  const { elements, files } = importExcalidraw(excalidrawSample);
  boardWith(elements, files);
  assert.equal(elements.length, 7);
  const rect = byText(elements, "Start");
  assert.equal(rect.type, "rect");
  assert.equal(rect.radius, 12);
  assert.equal(rect.fill, "#a5d8ff");
  assert.equal(rect.fontFamily, "sans");
  const ell = elements.find((e) => e.type === "ellipse");
  assert.equal(ell.strokeStyle, "dashed");
  assert.equal(ell.opacity, 60);
  assert.equal(ell.angle, 0.5);
  const arrow = elements.find((e) => e.type === "arrow");
  assert.deepEqual(arrow.startBinding, { id: rect.id, fx: 0.5, fy: 0.5, fixed: false });
  assert.equal(arrow.endBinding.id, ell.id);
  assert.equal(arrow.endArrow, "triangle");
  assert.equal(byText(elements, "Free").fontFamily, "mono");
  const frame = elements.find((e) => e.type === "frame");
  assert.equal(frame.name, "Main");
  assert.equal(elements.find((e) => e.type === "image").frameId, frame.id);
  assert.equal(files.file1, PNG);
  assert.equal(byText(elements, "https://example.com").type, "rect");
});

test("excalidraw export then import round-trips", () => {
  const first = importExcalidraw(excalidrawSample);
  const board = boardWith(first.elements, first.files);
  const out = exportExcalidraw(board, board.pages[0]);
  assert.equal(out.type, "excalidraw");
  assert.equal(out.version, 2);
  assert.ok(out.elements.every((e) => typeof e.seed === "number" && typeof e.versionNonce === "number"));
  const again = importExcalidraw(JSON.parse(JSON.stringify(out)));
  boardWith(again.elements, again.files);
  const sig = (els) => els.map((e) => [e.type, e.x, e.y, e.w, e.h, e.stroke, e.fill, e.text]).sort((a, b) => String(a).localeCompare(String(b)));
  assert.deepEqual(sig(again.elements), sig(first.elements));
  const rect = byText(again.elements, "Start");
  const arrow = again.elements.find((e) => e.type === "arrow");
  assert.equal(arrow.startBinding.id, rect.id);
  assert.equal(arrow.endBinding.id, again.elements.find((e) => e.type === "ellipse").id);
  assert.equal(again.files.file1, PNG);
});

const drawioPlain = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="test"><diagram id="d1" name="Flow &amp; more">
<mxGraphModel dx="800" dy="600"><root>
  <mxCell id="0" />
  <mxCell id="1" parent="0" />
  <mxCell id="a" value="Hello&lt;br&gt;World" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#ff0000;fontSize=14;" vertex="1" parent="1">
    <mxGeometry x="40" y="40" width="120" height="60" as="geometry" />
  </mxCell>
  <mxCell id="b" value="&lt;div&gt;Second&lt;/div&gt;&lt;div&gt;box &amp;amp; co&lt;/div&gt;" style="rounded=1;html=1;dashed=1;sketch=1;rotation=90;opacity=50;" vertex="1" parent="1">
    <mxGeometry x="300" y="200" width="120" height="60" as="geometry" />
  </mxCell>
  <mxCell id="e" value="go" style="edgeStyle=orthogonalEdgeStyle;html=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" edge="1" parent="1" source="a" target="b">
    <mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="230" y="70" /></Array></mxGeometry>
  </mxCell>
  <mxCell id="lane" value="Lane" style="swimlane;startSize=24;" vertex="1" parent="1">
    <mxGeometry x="500" y="40" width="200" height="200" as="geometry" />
  </mxCell>
  <mxCell id="kid" value="Child" style="ellipse;" vertex="1" parent="lane">
    <mxGeometry x="20" y="50" width="80" height="40" as="geometry" />
  </mxCell>
  <mxCell id="free" value="" style="endArrow=none;" edge="1" parent="1">
    <mxGeometry relative="1" as="geometry"><mxPoint x="0" y="300" as="sourcePoint" /><mxPoint x="100" y="300" as="targetPoint" /></mxGeometry>
  </mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const checkPlain = (pages) => {
  assert.equal(pages.length, 1);
  assert.equal(pages[0].name, "Flow & more");
  const els = pages[0].elements;
  boardWith(els);
  const a = byText(els, "Hello\nWorld");
  assert.equal(a.type, "rect");
  assert.equal(a.radius, 12);
  assert.equal(a.fill, "#dae8fc");
  assert.equal(a.textColor, "#ff0000");
  assert.equal(a.roughness, 0);
  const b = byText(els, "Second\nbox & co");
  assert.equal(b.strokeStyle, "dashed");
  assert.equal(b.roughness, 1);
  assert.equal(b.opacity, 50);
  assert.ok(Math.abs(b.angle - Math.PI / 2) < 1e-9);
  const edge = els.find((e) => e.type === "arrow");
  assert.equal(edge.routing, "elbow");
  assert.equal(edge.text, "go");
  assert.deepEqual(edge.startBinding, { id: a.id, fx: 1, fy: 0.5, fixed: true });
  assert.deepEqual(edge.endBinding, { id: b.id, fx: 0, fy: 0.5, fixed: true });
  assert.equal(edge.x, 160);
  assert.equal(edge.y, 70);
  const lane = els.find((e) => e.type === "frame");
  assert.equal(lane.name, "Lane");
  const kid = byText(els, "Child");
  assert.equal(kid.type, "ellipse");
  assert.equal(kid.frameId, lane.id);
  assert.equal(kid.x, 520);
  assert.equal(kid.y, 90);
  const line = els.find((e) => e.type === "line");
  assert.deepEqual(line.points, [[0, 0], [100, 0]]);
};

test("drawio import of an uncompressed file", async () => {
  const { pages } = await importDrawio(drawioPlain);
  checkPlain(pages);
});

test("drawio import of a compressed file", async () => {
  const model = /<mxGraphModel[\s\S]*<\/mxGraphModel>/.exec(drawioPlain)[0];
  const stream = new Blob([encodeURIComponent(model)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const b64 = Buffer.from(await new Response(stream).arrayBuffer()).toString("base64");
  const { pages } = await importDrawio(`<mxfile><diagram id="d1" name="Flow &amp; more">${b64}</diagram></mxfile>`);
  checkPlain(pages);
});

test("drawio import rejects malformed input", async () => {
  await assert.rejects(importDrawio("<mxfile><diagram>"), /never closed/);
  await assert.rejects(importDrawio("<html></html>"), /not a draw.io/);
});

test("drawio export then import round-trips", async () => {
  const frame = createElement("frame", { x: 400, y: 0, w: 300, h: 200, name: "Box" });
  const a = createElement("rect", { x: 0, y: 0, w: 100, h: 50, text: "A", fill: "#ffc9c9", fillStyle: "solid", radius: 12 });
  const b = createElement("shape", { kind: "database", x: 450, y: 60, w: 80, h: 90, text: "B", frameId: frame.id });
  const c = createElement("diamond", { x: 0, y: 200, w: 100, h: 100, text: "two\nlines" });
  const arrow = createElement("arrow", { x: 100, y: 25, points: [[0, 0], [350, 80]], startBinding: { id: a.id, fx: 0.5, fy: 0.5, fixed: false }, endBinding: { id: b.id, fx: 0, fy: 0.5, fixed: true }, routing: "curved", text: "uses" });
  const image = createElement("image", { x: 0, y: 400, w: 20, h: 20, fileId: "img1" });
  const board = boardWith([a, frame, b, c, arrow, image], { img1: PNG });
  board.pages[0].name = "Main";
  const xml = exportDrawio(board);
  const { pages, files } = await importDrawio(xml);
  const els = pages[0].elements;
  boardWith(els, files);
  assert.equal(pages[0].name, "Main");
  const A = byText(els, "A");
  const B = byText(els, "B");
  assert.deepEqual([A.type, A.x, A.y, A.w, A.h, A.fill, A.radius], ["rect", 0, 0, 100, 50, "#ffc9c9", 12]);
  assert.deepEqual([B.type, B.kind, B.x, B.y], ["shape", "database", 450, 60]);
  assert.equal(B.frameId, els.find((e) => e.type === "frame" && e.name === "Box").id);
  assert.equal(byText(els, "two\nlines").type, "diamond");
  const conn = els.find((e) => e.type === "arrow");
  assert.equal(conn.text, "uses");
  assert.equal(conn.routing, "curved");
  assert.equal(conn.startBinding.id, A.id);
  assert.deepEqual(conn.endBinding, { id: B.id, fx: 0, fy: 0.5, fixed: true });
  assert.equal(files[els.find((e) => e.type === "image").fileId], PNG);
});

test("mermaid flowchart builds nodes, labelled edges and subgraph frames", () => {
  const els = mermaidToElements(`flowchart TD
    %% a comment
    A([Start]) --> B{Is it ok?}
    B -->|yes| C[Ship it]
    B -- no --> D[(Fix DB)]
    subgraph post [After release]
      C --> E((Party))
    end
    classDef hot fill:#ffc9c9,stroke:#e03131
    class E hot`);
  boardWith(els);
  const nodes = els.filter((e) => !["arrow", "line", "frame"].includes(e.type));
  assert.equal(nodes.length, 5);
  assert.equal(byText(els, "Start").kind, "terminator");
  const B = byText(els, "Is it ok?");
  assert.equal(B.type, "diamond");
  assert.equal(byText(els, "Fix DB").kind, "database");
  const E = byText(els, "Party");
  assert.equal(E.type, "ellipse");
  assert.equal(E.fill, "#ffc9c9");
  const arrows = els.filter((e) => e.type === "arrow");
  assert.equal(arrows.length, 4);
  assert.deepEqual(arrows.map((a) => a.text).filter(Boolean).sort(), ["no", "yes"]);
  assert.ok(arrows.every((a) => a.startBinding && a.endBinding && !a.startBinding.fixed));
  const C = byText(els, "Ship it");
  assert.ok(C.y > B.y + B.h);
  const frame = els.find((e) => e.type === "frame");
  assert.equal(frame.name, "After release");
  for (const n of [C, E]) {
    assert.equal(n.frameId, frame.id);
    assert.ok(n.x >= frame.x && n.y >= frame.y && n.x + n.w <= frame.x + frame.w && n.y + n.h <= frame.y + frame.h);
  }
  const yes = arrows.find((a) => a.text === "yes");
  const inBox = (p, n) => p.x >= n.x - 1 && p.x <= n.x + n.w + 1 && p.y >= n.y - 1 && p.y <= n.y + n.h + 1;
  assert.ok(inBox({ x: yes.x, y: yes.y }, B));
  assert.ok(inBox({ x: yes.x + yes.points.at(-1)[0], y: yes.y + yes.points.at(-1)[1] }, C));
  assert.notDeepEqual([yes.x, yes.y], [B.x + B.w / 2, B.y + B.h / 2]);
});

test("mermaid LR chains and ampersands", () => {
  const els = mermaidToElements("graph LR; A & B --> C --> D");
  boardWith(els);
  assert.equal(els.filter((e) => e.type === "arrow").length, 3);
  assert.ok(byText(els, "D").x > byText(els, "C").x);
});

test("mermaid sequence diagram lays out participants and messages", () => {
  const els = mermaidToElements(`sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B-->>A: Hi Alice
    A-)A: think`);
  boardWith(els);
  const alice = byText(els, "Alice");
  const bob = byText(els, "Bob");
  assert.equal(alice.y, bob.y);
  assert.ok(bob.x > alice.x);
  assert.equal(els.filter((e) => e.kind === "lifeline").length, 2);
  const hello = byText(els, "Hello Bob");
  const hi = byText(els, "Hi Alice");
  assert.equal(hello.h, 0);
  assert.ok(hi.y > hello.y);
  assert.equal(hi.strokeStyle, "dashed");
  assert.equal(hello.points.at(-1)[0], bob.x - alice.x);
});

test("mermaid rejects unsupported diagrams", () => {
  assert.throws(() => mermaidToElements("pie title Pets\n\"Dogs\" : 3"), /Unsupported Mermaid diagram "pie"/);
});

test("svg import sanitises scripts, handlers and external refs", () => {
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 100" onload="steal()">
  <script>alert(1)</script>
  <rect width="10" height="10" onclick='x()' />
  <image href="https://evil.example/x.png" />
  <use xlink:href="#ok" />
  <image href="${PNG}" />
</svg>`;
  const { dataUrl, w, h } = svgToImage(svg);
  assert.deepEqual([w, h], [200, 100]);
  assert.match(dataUrl, /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);
  const out = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.ok(!/script/i.test(out));
  assert.ok(!/onload|onclick/i.test(out));
  assert.ok(!out.includes("evil.example"));
  assert.ok(out.includes('xlink:href="#ok"'));
  assert.ok(out.includes(PNG));
  assert.throws(() => svgToImage("<html><body/></html>"), /not an SVG/);
});
