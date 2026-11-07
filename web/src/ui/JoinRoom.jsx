import { useEffect, useState } from "react";
import { Button, EmptyState, LoadingState } from "@kasumi/ui";
import { boardsDb } from "@/store/db.js";
import { connectRelay } from "@/store/relay.js";
import { COPY } from "@/ui/copy.js";

const JOIN_TIMEOUT = 8000;
const SETTLE = 400;

export function JoinRoom({ roomId, roomKey, navigate }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const boardId = `room-${roomId}`;
    const target = `/board/${boardId}?room=${roomId},${roomKey}`;
    let board = { id: boardId, name: COPY.SHARE.JOINED_NAME, v: 1, pages: [], files: {}, metaVersion: -1, createdAt: Date.now(), updatedAt: Date.now() };
    let settle = null;
    let done = false;
    let conn = null;
    const finish = async () => {
      if (done) return;
      done = true;
      conn?.close();
      await boardsDb.put({ ...board, updatedAt: Date.now() });
      navigate(target);
    };
    boardsDb.get(boardId).then((existing) => {
      if (existing) {
        done = true;
        navigate(target);
        return;
      }
      try {
        conn = connectRelay(boardId, {
          roomId,
          key: roomKey,
          getBoard: () => board,
          applyRemote: (b) => {
            board = b;
            clearTimeout(settle);
            if (board.pages.length) settle = setTimeout(finish, SETTLE);
          },
          onPeers: () => {},
          getName: () => COPY.LABELS.YOU,
        });
      } catch {
        setFailed(true);
      }
    });
    const timeout = setTimeout(() => {
      if (!done && !board.pages.length) {
        done = true;
        conn?.close();
        setFailed(true);
      }
    }, JOIN_TIMEOUT);
    return () => {
      clearTimeout(timeout);
      clearTimeout(settle);
      if (!done) conn?.close();
    };
  }, [roomId, roomKey, navigate]);

  if (failed) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-6 text-fg">
        <EmptyState
          title={COPY.SHARE.JOIN_FAILED_TITLE}
          description={COPY.SHARE.JOIN_FAILED_BODY}
          action={<Button onClick={() => navigate("/")}>{COPY.LABELS.BACK_TO_BOARDS}</Button>}
        />
      </main>
    );
  }
  return <LoadingState title={COPY.SHARE.JOINING} />;
}
