import { useCallback, useEffect, useState } from "react";
import { Plus, FolderOpen, Sun, Moon } from "lucide-react";
import { Button, Card, EmptyState, IconButton, LoadingState, Menu, PageHeader, useNotifications, useTheme } from "@kasumi/ui";
import { boardsDb } from "@/store/db.js";
import { createBoard } from "@/engine/serialize.js";
import { newId } from "@/engine/elements.js";
import { BrandMark } from "@/ui/MenuBar.jsx";
import { openAsBoard, IMPORT_ACCEPT } from "@/ui/importers.js";
import { pickFile } from "@/ui/actions.js";
import { COPY } from "@/ui/copy.js";
import { TemplatesGallery } from "@/ui/TemplatesGallery.jsx";

function Preview({ items }) {
  if (!items?.length) return <div className="h-full w-full" />;
  const x = Math.min(...items.map((i) => i.x));
  const y = Math.min(...items.map((i) => i.y));
  const w = Math.max(...items.map((i) => i.x + i.w)) - x;
  const h = Math.max(...items.map((i) => i.y + i.h)) - y;
  const pad = Math.max(w, h) * 0.08 + 10;
  return (
    <svg viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`} className="h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {items.map((i, k) =>
        i.t === "ellipse" ? (
          <ellipse key={k} cx={i.x + i.w / 2} cy={i.y + i.h / 2} rx={i.w / 2} ry={i.h / 2} fill={i.f && i.f !== "transparent" ? i.f : "none"} stroke={i.s && i.s !== "transparent" ? i.s : "#adb5bd"} strokeWidth={Math.max(w, h) / 200} />
        ) : (
          <rect key={k} x={i.x} y={i.y} width={i.w} height={i.h} rx={i.t === "sticky" ? 0 : Math.min(i.w, i.h) * 0.05} fill={i.f && i.f !== "transparent" ? i.f : "none"} stroke={i.s && i.s !== "transparent" ? i.s : "#adb5bd"} strokeWidth={Math.max(w, h) / 200} />
        ),
      )}
    </svg>
  );
}

export function Home({ navigate }) {
  const [boards, setBoards] = useState(null);
  const { notify, confirmAction, promptAction } = useNotifications();
  const { isDark, toggleTheme } = useTheme();
  const reload = useCallback(() => boardsDb.list().then(setBoards), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const create = async (mode = "whiteboard") => {
    const b = createBoard(COPY.LABELS.UNTITLED, mode);
    await boardsDb.put(b);
    navigate(`/board/${b.id}`);
  };
  const fromTemplate = async (t) => {
    const b = t.build();
    await boardsDb.put(b);
    navigate(`/board/${b.id}`);
  };
  const open = async () => {
    const file = await pickFile(IMPORT_ACCEPT);
    if (!file) return;
    try {
      const b = await openAsBoard(file);
      notify(COPY.NOTES.OPENED(b.name), "success");
      navigate(`/board/${b.id}`);
    } catch (err) {
      notify(`${COPY.ERRORS.OPEN}: ${err.message}`, "error");
    }
  };
  const rename = async (meta) => {
    const name = await promptAction({ title: COPY.HOME.RENAME, value: meta.name, confirmText: COPY.HOME.RENAME });
    if (!name) return;
    const b = await boardsDb.get(meta.id);
    await boardsDb.put({ ...b, name, updatedAt: Date.now() });
    reload();
  };
  const duplicate = async (meta) => {
    const b = await boardsDb.get(meta.id);
    await boardsDb.put({ ...b, id: newId(), name: COPY.LABELS.COPY_OF(b.name), updatedAt: Date.now() });
    reload();
  };
  const remove = async (meta) => {
    const ok = await confirmAction({ title: COPY.HOME.DELETE_CONFIRM_TITLE, description: COPY.HOME.DELETE_CONFIRM_BODY, confirmText: COPY.HOME.DELETE_CONFIRM, variant: "error" });
    if (!ok) return;
    await boardsDb.remove(meta.id);
    reload();
  };

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-fg sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center gap-2">
          <BrandMark className="h-8 w-8" />
          <span className="text-label font-semibold">{COPY.APP}</span>
          <IconButton className="ml-auto" icon={isDark ? Sun : Moon} label={COPY.ACTIONS.DARK_MODE} variant="ghost" size="sm" onClick={toggleTheme} />
        </div>
        <PageHeader
          title={COPY.HOME.TITLE}
          subtitle={COPY.HOME.SUBTITLE}
          action={
            <Button onClick={() => create("whiteboard")} data-testid="new-board">
              <Plus aria-hidden="true" className="h-4 w-4" />
              {COPY.HOME.NEW_WHITEBOARD}
            </Button>
          }
        >
          <Button variant="secondary" onClick={() => create("diagram")} data-testid="new-diagram">
            {COPY.HOME.NEW_DIAGRAM}
          </Button>
          <Button variant="secondary" onClick={() => create("design")} data-testid="new-design">
            {COPY.HOME.NEW_DESIGN}
          </Button>
          <Button variant="ghost" onClick={open}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            {COPY.HOME.OPEN}
          </Button>
        </PageHeader>
        <TemplatesGallery onCreate={fromTemplate} />
        {!boards ? (
          <LoadingState title={COPY.HOME.LOADING} />
        ) : !boards.length ? (
          <EmptyState title={COPY.HOME.EMPTY_TITLE} description={COPY.HOME.EMPTY_BODY} action={() => create("whiteboard")} actionLabel={COPY.HOME.NEW_WHITEBOARD} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {boards.map((b) => (
              <li key={b.id}>
                <Card className="group relative overflow-hidden">
                  <a href={`#/board/${b.id}`} className="block focus-ring" aria-label={b.name}>
                    <div className="aspect-[4/3] border-b border-line bg-surface-subtle p-3">
                      <Preview items={b.preview} />
                    </div>
                    <div className="p-3 pr-12">
                      <p className="truncate text-label font-semibold text-fg">{b.name}</p>
                      <p className="text-caption text-fg-muted">
                        {COPY.HOME.PAGES(b.pages)} · {COPY.HOME.EDITED} {new Date(b.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </a>
                  <div className="absolute bottom-3 right-2">
                    <Menu
                      label={COPY.HOME.BOARD_ACTIONS}
                      side="top"
                      items={[
                        { label: COPY.HOME.RENAME, onSelect: () => rename(b) },
                        { label: COPY.HOME.DUPLICATE, onSelect: () => duplicate(b) },
                        { label: COPY.HOME.DELETE, tone: "danger", onSelect: () => remove(b) },
                      ]}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
