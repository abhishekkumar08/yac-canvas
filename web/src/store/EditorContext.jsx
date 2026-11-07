import { createContext, useContext, useSyncExternalStore } from "react";

export const EditorContext = createContext(null);

export const useEditor = () => useContext(EditorContext).editor;
export const useUi = () => useContext(EditorContext).ui;

export function useEditorState(selector) {
  const { editor } = useContext(EditorContext);
  return useSyncExternalStore(editor.subscribe, () => selector(editor.getState()));
}
