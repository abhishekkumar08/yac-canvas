import { createSync } from "./syncCore.js";

export { clientId, clientColor } from "./syncCore.js";

// ponytail: live sync between tabs of this browser only; cross-device rooms go through relay.js.
export function connectCollab(boardId, { getBoard, applyRemote, onPeers, getName }) {
  if (typeof BroadcastChannel === "undefined") return { publish() {}, cursor() {}, close() {} };
  const channel = new BroadcastChannel(`yac-canvas:${boardId}`);
  const sync = createSync({
    send: (msg) => channel.postMessage(msg),
    getBoard,
    applyRemote,
    onPeers,
    getName,
    onHello: () => {
      for (const msg of sync.snapshotPages()) sync.post(msg);
    },
  });
  channel.onmessage = ({ data }) => sync.receive(data);
  sync.post({ type: "hello" });

  return {
    publish: sync.publish,
    cursor: sync.cursor,
    close() {
      sync.close();
      channel.close();
    },
  };
}
