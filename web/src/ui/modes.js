export const MODES = ["whiteboard", "diagram", "design"];

export const MODE_STYLE = {
  whiteboard: { roughness: 1, fontFamily: "hand", fontSize: 20, fillStyle: "hachure", fill: "transparent", stroke: "#1e1e1e", strokeWidth: 2, routing: "straight", radius: 0 },
  diagram: { roughness: 0, fontFamily: "sans", fontSize: 14, fillStyle: "solid", fill: "#ffffff", stroke: "#1e1e1e", strokeWidth: 1, routing: "elbow", radius: 0 },
  design: { roughness: 0, fontFamily: "sans", fontSize: 16, fillStyle: "solid", fill: "#d9d9d9", stroke: "transparent", strokeWidth: 1, routing: "straight", radius: 0 },
};

export const MODE_PANELS = {
  whiteboard: { leftPanel: null, showFormat: true, showMinimap: false },
  diagram: { leftPanel: "shapes", showFormat: true, showMinimap: true },
  design: { leftPanel: "layers", showFormat: true, showMinimap: false },
};

export const modeOf = (board) => (MODES.includes(board?.uiMode) ? board.uiMode : "diagram");
