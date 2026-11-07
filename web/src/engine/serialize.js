import { ELEMENT_TYPES, newId } from "./elements.js";

export const FILE_TYPE = "yac-canvas";
export const FILE_VERSION = 1;

export const createPage = (name = "Page 1") => ({ id: newId(), name, elements: [], comments: [], background: null, grid: "dots" });

const MODE_GRID = { whiteboard: "none", diagram: "lines", design: "none" };

export function createBoard(name = "Untitled board", uiMode) {
  const now = Date.now();
  const page = createPage();
  if (uiMode) page.grid = MODE_GRID[uiMode] ?? page.grid;
  return { id: newId(), name, v: FILE_VERSION, pages: [page], files: {}, createdAt: now, updatedAt: now, ...(uiMode ? { uiMode } : {}) };
}

export const serializeBoard = (board) => JSON.stringify({ type: FILE_TYPE, version: FILE_VERSION, board });

const TYPES = new Set(ELEMENT_TYPES);
const IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const num = (v) => typeof v === "number" && Number.isFinite(v);

export function validateBoard(board) {
  if (!board || typeof board !== "object" || !Array.isArray(board.pages) || !board.pages.length) throw new Error("This board has no pages.");
  for (const page of board.pages) {
    if (typeof page.id !== "string" || !Array.isArray(page.elements)) throw new Error("A page is missing its id or elements.");
    for (const el of page.elements) {
      if (typeof el.id !== "string") throw new Error("An element is missing its id.");
      if (!TYPES.has(el.type)) throw new Error(`Unknown element type: ${String(el.type)}`);
      for (const k of ["x", "y", "w", "h", "angle"]) if (!num(el[k])) throw new Error(`Invalid number in ${k} of ${el.id}`);
      if (el.points && !el.points.every((p) => Array.isArray(p) && num(p[0]) && num(p[1]))) throw new Error(`Invalid number in points of ${el.id}`);
    }
  }
  for (const [id, data] of Object.entries(board.files ?? {})) {
    if (typeof data !== "string" || !IMAGE_DATA.test(data)) throw new Error(`File ${id} is not image data.`);
  }
  return board;
}

export function parseBoard(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (data?.type !== FILE_TYPE) throw new Error("This is not a canvas file.");
  if (data.version > FILE_VERSION) throw new Error("This file was made by a newer version.");
  return validateBoard(data.board);
}
