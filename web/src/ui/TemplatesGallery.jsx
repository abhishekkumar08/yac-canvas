import { useMemo } from "react";
import { Button, Card, SectionHeader } from "@kasumi/ui";
import { ElementView } from "@/render/ElementView.jsx";
import { elementBounds, unionBounds } from "@/engine/geometry.js";
import { renderOrder } from "@/engine/scene.js";
import { TEMPLATES } from "@/ui/templates.js";
import { TEMPLATES_COPY } from "@/ui/copy-versions.js";

export function BoardPreview({ board, label, className }) {
  const page = board?.pages[0];
  const els = useMemo(() => (page ? renderOrder(page.elements).filter((e) => !e.hidden) : []), [page]);
  if (!els.length) return <div className={className} />;
  const b = unionBounds(els.map(elementBounds));
  const pad = Math.max(b.w, b.h) * 0.04 + 24;
  return (
    <svg viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className={className} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {els.map((el) => (
        <ElementView key={el.id} el={el} files={board.files} elements={el.type === "instance" ? page.elements : undefined} bg={page.background ?? "#ffffff"} />
      ))}
    </svg>
  );
}

export function TemplatesGallery({ onCreate }) {
  const items = useMemo(() => TEMPLATES.map((t) => ({ template: t, board: t.build() })), []);
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={TEMPLATES_COPY.TITLE} description={TEMPLATES_COPY.SUBTITLE} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(({ template, board }) => (
          <li key={template.id}>
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="aspect-[4/3] border-b border-line bg-white p-3">
                <BoardPreview board={board} label={TEMPLATES_COPY.PREVIEW_OF(template.name)} className="h-full w-full" />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="text-label font-semibold text-fg">{template.name}</p>
                <p className="text-caption text-fg-muted">{template.description}</p>
                <Button
                  className="mt-auto self-start"
                  size="sm"
                  variant="secondary"
                  aria-label={TEMPLATES_COPY.USE_NAMED(template.name)}
                  onClick={() => onCreate(template)}
                >
                  {TEMPLATES_COPY.USE}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
