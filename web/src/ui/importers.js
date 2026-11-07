import { createBoard, createPage, parseBoard, validateBoard } from "@/engine/serialize.js";
import { newId } from "@/engine/elements.js";
import { importExcalidraw, exportExcalidraw } from "@/engine/interop/excalidraw.js";
import { importDrawio, exportDrawio } from "@/engine/interop/drawio.js";
import { svgToImage } from "@/engine/interop/svg.js";
import { boardsDb } from "@/store/db.js";
import { insertElements, insertImage } from "@/ui/actions.js";
import { downloadBlob, safeName } from "@/render/exportImage.jsx";
import { createElement } from "@/engine/elements.js";
import { COPY } from "@/ui/copy.js";

export const IMPORT_ACCEPT = ".yaccanvas,.json,.excalidraw,.drawio,.xml,.svg,application/json,image/*";

function kindOf(file, text) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".excalidraw")) return "excalidraw";
  if (name.endsWith(".drawio") || name.endsWith(".xml")) return "drawio";
  if (name.endsWith(".svg") || file.type === "image/svg+xml") return "svg";
  const head = text.trimStart().slice(0, 200);
  if (head.startsWith("<mxfile") || head.startsWith("<mxGraphModel")) return "drawio";
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "svg";
  if (head.includes('"excalidraw"')) return "excalidraw";
  return "yaccanvas";
}

async function boardFrom(file) {
  const text = await file.text();
  const kind = kindOf(file, text);
  const base = file.name.replace(/\.[^.]+$/, "") || COPY.LABELS.UNTITLED;
  if (kind === "excalidraw") {
    const { elements, files } = importExcalidraw(text);
    const board = createBoard(base, "whiteboard");
    board.pages[0].elements = elements;
    board.files = files;
    return validateBoard(board);
  }
  if (kind === "drawio") {
    const { pages, files } = await importDrawio(text);
    const board = createBoard(base, "diagram");
    board.pages = pages.map((p) => ({ ...createPage(p.name), grid: "lines", elements: p.elements }));
    board.files = files ?? {};
    return validateBoard(board);
  }
  if (kind === "svg") return null;
  const board = parseBoard(text);
  return { ...board, id: newId() };
}

export async function openAsBoard(file) {
  const board = await boardFrom(file);
  if (!board) throw new Error(COPY.ERRORS.SVG_AS_BOARD);
  const now = Date.now();
  const saved = { ...board, id: board.id ?? newId(), createdAt: board.createdAt ?? now, updatedAt: now };
  await boardsDb.put(saved);
  return saved;
}

export async function importIntoBoard(editor, file, at) {
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") return insertImage(editor, file, at);
  const text = await file.text();
  if (kindOf(file, text) === "svg") return insertSvg(editor, text, at);
  const board = await boardFrom(file);
  const [first, ...rest] = board.pages;
  insertElements(editor, first.elements, { at, files: board.files });
  if (rest.length) {
    editor.updateBoard((b) => ({ ...b, files: { ...b.files, ...board.files }, pages: [...b.pages, ...rest.map((p) => ({ ...p, id: newId() }))] }));
  }
  return undefined;
}

export function insertSvg(editor, text, at) {
  const { dataUrl, w, h } = svgToImage(text);
  const fileId = newId();
  editor.applyBoard({ ...editor.state.board, files: { ...editor.state.board.files, [fileId]: dataUrl } }, { record: false });
  const el = createElement("image", { fileId, x: at.x - w / 2, y: at.y - h / 2, w, h });
  editor.setElements([...editor.elements, el]);
  editor.select([el.id], { expand: false });
}

export function exportAs(editor, kind) {
  const board = editor.state.board;
  const name = safeName(board.name);
  if (kind === "excalidraw") {
    downloadBlob(new Blob([JSON.stringify(exportExcalidraw(board, editor.page), null, 2)], { type: "application/json" }), `${name}.excalidraw`);
  } else {
    downloadBlob(new Blob([exportDrawio(board)], { type: "application/xml" }), `${name}.drawio`);
  }
}
