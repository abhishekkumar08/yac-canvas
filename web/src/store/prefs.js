const KEY = "yac-canvas:prefs";

export const DEFAULT_PREFS = {
  snapToObjects: true,
  snapToGrid: false,
  gridSize: 20,
  showRulers: false,
  showMinimap: true,
  leftPanel: "shapes",
  showFormat: true,
  zen: false,
  name: "",
  scratchpad: [],
  recentColors: [],
};

export function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or full storage: preferences stay for this session only.
  }
}
