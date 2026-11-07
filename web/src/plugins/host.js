import { createElement } from "../engine/elements.js";
import { SHAPES } from "../engine/shapes.js";
import { assignFrames, deleteElements, updateElements } from "../engine/scene.js";
import { PLUGIN_COPY } from "./copy.js";

const E = PLUGIN_COPY.ERRORS;
const TAG = "__yacPlugin";
const TIMEOUT_MS = 10000;
const MAX_MESSAGE = 1_000_000;
const MAX_BATCH = 2000;
const MAX_TEXT = 10000;
const MAX_POINTS = 5000;
const MAX_HTML = 200_000;
const MAX_NOTE = 300;
const MAX_COORD = 1e6;

export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

const CREATABLE = new Set(["rect", "ellipse", "diamond", "shape", "text", "sticky", "frame", "line", "arrow", "freedraw"]);
const LINEAR = new Set(["line", "arrow", "freedraw"]);
const NUMBER_KEYS = new Set(["x", "y", "w", "h", "angle", "strokeWidth", "roughness", "opacity", "radius", "fontSize"]);
const COLOR_KEYS = new Set(["stroke", "fill", "textColor"]);
const WORD_KEYS = new Set(["fillStyle", "strokeStyle", "fontFamily", "textAlign", "verticalAlign", "routing", "startArrow", "endArrow"]);
const NULLABLE = new Set(["textColor", "startArrow", "endArrow"]);
const TEXT_KEYS = new Set(["text", "name"]);
const COLOR = /^(#[0-9a-f]{3,8}|transparent|[a-z]{3,20}|(rgb|hsl)a?\([\d\s.,%a-z/+-]{1,60}\))$/i;
const WORD = /^[a-z][a-z-]{0,23}$/i;
const METHODS = [
  "getSelection", "getElements", "getPage", "createElements", "updateElements", "deleteElements",
  "select", "zoomToFit", "notify", "showUI", "postMessage", "close",
];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;

function cleanPoints(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_POINTS) throw new Error(E.BAD_POINTS);
  return value.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || !finite(p[0]) || !finite(p[1])) throw new Error(E.BAD_POINTS);
    return [p[0], p[1]];
  });
}

function cleanValue(key, value) {
  if (NUMBER_KEYS.has(key)) {
    if (!finite(value)) throw new Error(E.BAD_NUMBER(key));
    return value;
  }
  if (value === null && NULLABLE.has(key)) return null;
  if (COLOR_KEYS.has(key)) {
    if (typeof value !== "string" || !COLOR.test(value)) throw new Error(E.BAD_COLOR(key));
    return value;
  }
  if (WORD_KEYS.has(key)) {
    if (typeof value !== "string" || !WORD.test(value)) throw new Error(E.BAD_STRING(key));
    return value;
  }
  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" || value.length > MAX_TEXT) throw new Error(E.BAD_STRING(key));
    return value;
  }
  if (key === "shadow") {
    if (typeof value !== "boolean") throw new Error(E.BAD_BOOL(key));
    return value;
  }
  if (key === "points") return cleanPoints(value);
  throw new Error(E.BAD_KEY(key));
}

export function sanitizePatch(patch) {
  if (!isObject(patch)) throw new Error(E.NOT_AN_OBJECT);
  return Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, cleanValue(k, v)]));
}

export function sanitizeNewElement(partial) {
  if (!isObject(partial)) throw new Error(E.NOT_AN_OBJECT);
  const { type, kind, ...rest } = partial;
  if (!CREATABLE.has(type)) throw new Error(E.BAD_TYPE(String(type)));
  const props = sanitizePatch(rest);
  if (type === "shape") {
    if (typeof kind !== "string" || !Object.hasOwn(SHAPES, kind)) throw new Error(E.BAD_KIND(String(kind)));
    props.kind = kind;
  } else if (kind !== undefined) {
    throw new Error(E.BAD_KEY("kind"));
  }
  if (LINEAR.has(type) && props.points) {
    const xs = props.points.map((p) => p[0]);
    const ys = props.points.map((p) => p[1]);
    props.w ??= Math.max(...xs) - Math.min(...xs);
    props.h ??= Math.max(...ys) - Math.min(...ys);
  } else if (!LINEAR.has(type)) {
    props.w ??= type === "text" ? 200 : 100;
    props.h ??= type === "text" ? 40 : 100;
  }
  return createElement(type, props);
}

export function checkList(list, max = MAX_BATCH) {
  if (!Array.isArray(list)) throw new Error(E.NOT_A_LIST);
  if (list.length > max) throw new Error(E.TOO_MANY(max));
  return list;
}

function checkIds(ids) {
  checkList(ids);
  if (!ids.every((id) => typeof id === "string")) throw new Error(E.BAD_IDS);
  return ids;
}

export function fitsMessage(value) {
  try {
    return (JSON.stringify(value ?? null)?.length ?? 0) <= MAX_MESSAGE;
  } catch {
    return false;
  }
}

export function pluginMethods({ editor, notify, onZoomToFit }) {
  const unlocked = (ids) => {
    const live = new Map(editor.elements.map((e) => [e.id, e]));
    return ids.filter((id) => live.has(id) && !live.get(id).locked);
  };
  return {
    getSelection: () => editor.selected,
    getElements: () => editor.elements,
    getPage: () => ({ name: editor.page.name, background: editor.page.background ?? null }),
    createElements(list) {
      const els = checkList(list).map(sanitizeNewElement);
      const ids = els.map((e) => e.id);
      if (els.length) editor.setElements(assignFrames([...editor.elements, ...els], ids));
      return ids;
    },
    updateElements(list) {
      const patches = new Map();
      for (const entry of checkList(list)) {
        if (!isObject(entry) || typeof entry.id !== "string") throw new Error(E.BAD_IDS);
        const { id, ...patch } = entry;
        if (!editor.elements.some((e) => e.id === id)) throw new Error(E.UNKNOWN_ID(id));
        patches.set(id, sanitizePatch(patch));
      }
      const ids = unlocked([...patches.keys()]);
      if (ids.length) editor.setElements(updateElements(editor.elements, ids, (el) => patches.get(el.id)));
      return ids;
    },
    deleteElements(list) {
      const ids = unlocked(checkIds(list));
      if (!ids.length) return [];
      const gone = new Set(ids);
      editor.setElements(deleteElements(editor.elements, ids));
      editor.set({ selectedIds: editor.state.selectedIds.filter((id) => !gone.has(id)) });
      return ids;
    },
    select(list) {
      const live = new Set(editor.elements.map((e) => e.id));
      editor.select(checkIds(list).filter((id) => live.has(id)));
      return editor.state.selectedIds;
    },
    zoomToFit() {
      onZoomToFit?.();
      return true;
    },
    notify(message) {
      notify(String(message).slice(0, MAX_NOTE));
      return true;
    },
  };
}

function workerRuntime(tag, methods, timeoutMs, timeoutText) {
  const pending = new Map();
  const listeners = [];
  let seq = 0;
  const send = (msg) => parent.postMessage({ [tag]: 1, ...msg }, "*");
  const report = (err) => send({ method: "error", args: [String((err && err.message) || err)] });
  const call = (method, args) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(timeoutText.replace("{m}", method)));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, args });
    });
  addEventListener("message", (e) => {
    const m = e.data;
    if (e.source !== parent || !m || m[tag] !== 1) return;
    if (m.event === "message") {
      for (const fn of listeners) {
        try {
          fn(m.data);
        } catch (err) {
          report(err);
        }
      }
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.error !== undefined) p.reject(new Error(m.error));
    else p.resolve(m.result);
  });
  addEventListener("error", (e) => report(e.error || e.message));
  addEventListener("unhandledrejection", (e) => report(e.reason));
  const api = {};
  for (const name of methods) api[name] = (...args) => call(name, args);
  api.onMessage = (fn) => {
    if (typeof fn === "function") listeners.push(fn);
  };
  window.canvas = Object.freeze(api);
}

function uiRuntime(tag) {
  const listeners = [];
  addEventListener("message", (e) => {
    const m = e.data;
    if (e.source !== parent || !m || m[tag] !== 1 || m.event !== "message") return;
    for (const fn of listeners) fn(m.data);
  });
  window.canvas = Object.freeze({
    postMessage: (data) => parent.postMessage({ [tag]: 1, method: "uiMessage", args: [data] }, "*"),
    onMessage: (fn) => {
      if (typeof fn === "function") listeners.push(fn);
    },
  });
}

const escapeScript = (s) => s.replace(/<\/script/gi, "<\\/script");

export function sandboxDoc(scripts, body = "") {
  const tags = scripts.map((s) => `<script>${escapeScript(s)}</script>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">${tags}</head><body>${body}</body></html>`;
}

const args = (...list) => list.map((v) => JSON.stringify(v)).join(", ");

export const workerDoc = (code) =>
  sandboxDoc([`(${workerRuntime})(${args(TAG, METHODS, TIMEOUT_MS, E.TIMEOUT("{m}"))});`, `(async () => {\n${code}\n})();`]);

export const uiDoc = (html) => sandboxDoc([`(${uiRuntime})(${args(TAG)});`], html);

const clamp = (v, lo, hi, fallback) => (finite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

function sandboxFrame(srcdoc, onReload) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.srcdoc = srcdoc;
  let loads = 0;
  frame.addEventListener("load", () => {
    loads += 1;
    if (loads > 1) onReload();
  });
  return frame;
}

export function runPlugin({ code, name, editor, notify, onZoomToFit, uiContainer, onExit }) {
  let stopped = false;
  let ui = null;
  const methods = pluginMethods({ editor, notify, onZoomToFit });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("message", onMessage);
    worker.remove();
    ui?.frame.remove();
    onExit?.();
  };
  const fail = (message) => {
    if (stopped) return;
    notify(PLUGIN_COPY.NOTES.FAILED(name, String(message).slice(0, MAX_NOTE)), "error");
    stop();
  };

  const post = (frame, msg) => frame.contentWindow?.postMessage({ [TAG]: 1, ...msg }, "*");
  const toUi = (msg) => {
    if (!ui) return;
    if (ui.ready) post(ui.frame, msg);
    else ui.queue.push(msg);
  };

  methods.showUI = (html, opts = {}) => {
    if (typeof html !== "string" || html.length > MAX_HTML) throw new Error(E.BAD_STRING("html"));
    if (!uiContainer) return false;
    ui?.frame.remove();
    const frame = sandboxFrame(uiDoc(html), stop);
    const next = { frame, ready: false, queue: [] };
    frame.addEventListener("load", () => {
      if (next.ready) return;
      next.ready = true;
      for (const msg of next.queue.splice(0)) post(frame, msg);
    });
    frame.style.width = `${clamp(opts?.width, 120, 800, 320)}px`;
    frame.style.height = `${clamp(opts?.height, 80, 600, 240)}px`;
    frame.style.maxWidth = "100%";
    frame.style.border = "0";
    ui = next;
    uiContainer.appendChild(frame);
    return true;
  };
  methods.postMessage = (data) => {
    toUi({ event: "message", data });
    return true;
  };
  methods.close = () => {
    stop();
    return true;
  };

  const handleWorker = (m) => {
    if (m.method === "error") return fail(Array.isArray(m.args) ? m.args[0] : "");
    let reply;
    try {
      if (!fitsMessage(m.args)) throw new Error(E.PAYLOAD_TOO_LARGE);
      if (typeof m.method !== "string" || !Object.hasOwn(methods, m.method)) throw new Error(E.UNKNOWN_METHOD(String(m.method)));
      reply = { result: methods[m.method](...(Array.isArray(m.args) ? m.args : [])) ?? null };
    } catch (err) {
      reply = { error: String(err?.message ?? err) };
    }
    if (!stopped && typeof m.id === "number") post(worker, { id: m.id, ...reply });
    return undefined;
  };

  function onMessage(e) {
    const m = e.data;
    if (stopped || !m || m[TAG] !== 1) return;
    if (e.source === worker.contentWindow) handleWorker(m);
    else if (ui && e.source === ui.frame.contentWindow && m.method === "uiMessage" && Array.isArray(m.args) && fitsMessage(m.args)) {
      post(worker, { event: "message", data: m.args[0] });
    }
  }

  // ponytail: a meta CSP cannot stop self-navigation or WebRTC, so a reload of either frame ends the plugin; serve plugins from a separate origin with a CSP header if that matters.
  const worker = sandboxFrame(workerDoc(code), stop);
  worker.style.display = "none";
  window.addEventListener("message", onMessage);
  document.body.appendChild(worker);
  return { stop };
}
