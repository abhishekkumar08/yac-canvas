import { useEffect, useState } from "react";
import { pruneAuto, saveVersion, shouldAutoSave } from "@/store/versions.js";

const CHECK_EVERY = 60 * 1000;

export function useAutoVersions(editor) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let savedBoard = editor.state.board;
    let lastSavedAt = Date.now();
    const changed = () => editor.state.board !== savedBoard;
    const save = () => {
      if (!changed()) return;
      const board = editor.state.board;
      savedBoard = board;
      lastSavedAt = Date.now();
      saveVersion(board, { auto: true })
        .then(() => pruneAuto(board.id))
        .catch(() => setFailed(true));
    };
    const check = () => {
      if (shouldAutoSave(lastSavedAt, Date.now(), changed())) save();
    };
    const unsub = editor.subscribe(check);
    const timer = setInterval(check, CHECK_EVERY);
    window.addEventListener("pagehide", save);
    return () => {
      unsub();
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [editor]);

  return failed;
}
