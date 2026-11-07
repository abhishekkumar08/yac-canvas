import { useState } from "react";
import { Users, Sun, Moon, LayoutGrid, Menu as MenuIcon, BookOpen, Play } from "lucide-react";
import { Avatar, Button, IconButton, Input, Menu, SegmentedControl, Tooltip, useTheme } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { COPY } from "@/ui/copy.js";
import { MODES } from "@/ui/modes.js";

const MENUS = [
  ["File", COPY.MENUS.FILE],
  ["Edit", COPY.MENUS.EDIT],
  ["View", COPY.MENUS.VIEW],
  ["Insert", COPY.MENUS.INSERT],
  ["Arrange", COPY.MENUS.ARRANGE],
  ["Help", COPY.MENUS.HELP],
];

export function BrandMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="3" y="3" width="26" height="26" rx="7" fill="#6d5efc" />
      <path d="M9 21 L16 9 L23 21 Z" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function menuItems(actions, group, state) {
  return actions
    .filter((a) => a.group === group)
    .map((a) => ({
      label: a.label,
      group: a.sub,
      shortcut: a.shortcut,
      disabled: a.enabled ? !a.enabled(state) : false,
      checked: a.checked ? a.checked(state) : undefined,
      onSelect: a.run,
    }));
}

function BoardName() {
  const editor = useEditor();
  const name = useEditorState((s) => s.board.name);
  const [draft, setDraft] = useState(null);
  if (draft !== null) {
    const commit = () => {
      const next = draft.trim() || COPY.LABELS.UNTITLED;
      if (next !== name) editor.updateBoard((b) => ({ ...b, name: next }));
      setDraft(null);
    };
    return (
      <Input
        aria-label={COPY.LABELS.BOARD_NAME}
        value={draft}
        autoFocus
        className="h-8 w-56 py-1"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    );
  }
  return (
    <Button variant="ghost" size="xs" className="max-w-56 truncate font-semibold text-fg" onClick={() => setDraft(name)} aria-label={`${COPY.ACTIONS.RENAME_BOARD}: ${name}`}>
      {name}
    </Button>
  );
}

const HAMBURGER = [
  "file.open", "file.save", "file.export", "file.copyPng", "help.share", "file.home", "file.new",
  "file.versions", "help.palette", "edit.find", "help.shortcuts", "view.grid", "view.snapObjects", "view.zen", "view.theme",
];

export function ModeSwitch() {
  const ui = useUi();
  const mode = useEditorState((s) => s.board.uiMode ?? "diagram");
  return (
    <SegmentedControl
      label={COPY.LABELS.LAYOUT}
      value={mode}
      onChange={ui.setMode}
      options={MODES.map((m) => ({ value: m, label: COPY.MODES[m] }))}
      className="hidden lg:flex"
    />
  );
}

export function MainMenu({ side = "bottom" }) {
  const ui = useUi();
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const byId = new Map(ui.actions.map((a) => [a.id, a]));
  const state = editor.getState();
  const items = open
    ? [
        ...HAMBURGER.map((id) => byId.get(id)).filter(Boolean).map((a) => ({
          label: a.label,
          group: COPY.MENUS[a.group.toUpperCase()] ?? a.group,
          shortcut: a.shortcut,
          disabled: a.enabled ? !a.enabled(state) : false,
          checked: a.checked ? a.checked(state) : undefined,
          onSelect: a.run,
        })),
        ...MODES.map((m) => ({ label: COPY.MODES[m], group: COPY.LABELS.LAYOUT, checked: (state.board.uiMode ?? "diagram") === m, onSelect: () => ui.setMode(m) })),
      ]
    : [];
  return (
    <Menu
      label={COPY.LABELS.MAIN_MENU}
      align="start"
      side={side}
      open={open}
      onOpenChange={setOpen}
      trigger={<IconButton icon={MenuIcon} label={COPY.LABELS.MAIN_MENU} variant="secondary" size="sm" data-testid="main-menu" />}
      items={items}
    />
  );
}

function PeerAvatars() {
  const peerMap = useEditorState((s) => s.peers);
  const peers = Object.entries(peerMap);
  if (!peers.length) return null;
  return (
    <div className="flex -space-x-2" data-testid="peers">
      {peers.slice(0, 5).map(([id, p]) => (
        <Tooltip key={id} side="bottom" content={p.name}>
          <span className="rounded-full ring-2 ring-surface">
            <Avatar name={p.name} color={p.color} size="sm" />
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

function RightActions({ library = false, present = false }) {
  const ui = useUi();
  const editor = useEditor();
  const { isDark } = useTheme();
  const libraryOpen = useEditorState((s) => s.prefs.leftPanel === "shapes");
  return (
    <div className="pointer-events-auto ml-auto flex items-center gap-2">
      <PeerAvatars />
      <Tooltip side="bottom" content={COPY.ACTIONS.DARK_MODE}>
        <IconButton icon={isDark ? Sun : Moon} label={COPY.ACTIONS.DARK_MODE} variant="ghost" size="sm" onClick={ui.toggleTheme} />
      </Tooltip>
      {present && (
        <Tooltip side="bottom" content={COPY.ACTIONS.PRESENT}>
          <IconButton icon={Play} label={COPY.ACTIONS.PRESENT} variant="ghost" size="sm" onClick={ui.present} />
        </Tooltip>
      )}
      <Button size="xs" onClick={ui.openShare}>
        <Users aria-hidden="true" className="h-4 w-4" />
        {COPY.LABELS.SHARE}
      </Button>
      {library && (
        <Button size="xs" variant="secondary" aria-pressed={libraryOpen} onClick={() => editor.setPrefs({ leftPanel: libraryOpen ? null : "shapes" })}>
          <BookOpen aria-hidden="true" className="h-4 w-4" />
          {COPY.LABELS.LIBRARY}
        </Button>
      )}
    </div>
  );
}

export function MenuBar({ mode = "diagram" }) {
  const ui = useUi();
  const editor = useEditor();
  const [openMenu, setOpenMenu] = useState(null);
  useEditorState((s) => (openMenu ? s : null));
  if (mode === "whiteboard") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <MainMenu />
        </div>
        <RightActions library />
      </div>
    );
  }
  const compact = mode === "design";
  return (
    <header className="material-overlay absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-1 border-b border-line px-2">
      {compact ? (
        <MainMenu />
      ) : (
        <Tooltip side="bottom" content={COPY.LABELS.BACK_TO_BOARDS}>
          <IconButton icon={LayoutGrid} label={COPY.LABELS.BACK_TO_BOARDS} variant="ghost" size="sm" onClick={ui.goHome} />
        </Tooltip>
      )}
      <BrandMark className="h-6 w-6 shrink-0" />
      <BoardName />
      {!compact && (
        <nav aria-label={COPY.LABELS.MAIN_MENU} className="ml-2 flex items-center">
          {MENUS.map(([group, label]) => (
            <Menu
              key={group}
              label={label}
              align="start"
              trigger={
                <Button variant="ghost" size="xs" className="font-medium">
                  {label}
                </Button>
              }
              open={openMenu === group}
              onOpenChange={(o) => setOpenMenu(o ? group : null)}
              items={openMenu === group ? menuItems(ui.actions, group, editor.getState()) : []}
            />
          ))}
        </nav>
      )}
      <div className="mx-auto">
        <ModeSwitch />
      </div>
      <RightActions present />
    </header>
  );
}
