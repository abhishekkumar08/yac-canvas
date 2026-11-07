// ponytail: equal versions keep the local copy; add a per-edit nonce if two tabs edit the same element at the same instant.
export function mergePage(local, incoming, tombstones) {
  for (const [id, v] of Object.entries(incoming.deleted ?? {})) tombstones.set(id, Math.max(tombstones.get(id) ?? 0, v));
  if (incoming.order) return mergeDelta(local, incoming, tombstones);
  const localById = new Map(local.elements.map((e) => [e.id, e]));
  const seen = new Set();
  const elements = [];
  for (const inc of incoming.elements) {
    seen.add(inc.id);
    const loc = localById.get(inc.id);
    if ((tombstones.get(inc.id) ?? -1) >= inc.version && !loc) continue;
    elements.push(!loc || inc.version > loc.version ? inc : loc);
  }
  for (const loc of local.elements) {
    if (seen.has(loc.id)) continue;
    const del = incoming.deleted?.[loc.id];
    if (del !== undefined && loc.version <= del) continue;
    elements.push(loc);
  }
  const { elements: _ignored, deleted: _d, ...meta } = incoming;
  return { ...local, ...meta, elements };
}

// A delta carries only the changed elements plus the full id order; unchanged ones come from the local copy.
function mergeDelta(local, incoming, tombstones) {
  const byId = new Map(local.elements.map((e) => [e.id, e]));
  for (const inc of incoming.elements) {
    const loc = byId.get(inc.id);
    if ((tombstones.get(inc.id) ?? -1) >= inc.version && !loc) continue;
    if (!loc || inc.version > loc.version) byId.set(inc.id, inc);
  }
  const elements = [];
  const used = new Set();
  for (const id of incoming.order) {
    const e = byId.get(id);
    if (e) {
      elements.push(e);
      used.add(id);
    }
  }
  for (const loc of local.elements) {
    if (used.has(loc.id)) continue;
    const del = incoming.deleted?.[loc.id];
    if (del !== undefined && loc.version <= del) continue;
    elements.push(loc);
  }
  const { elements: _ignored, deleted: _d, order: _o, ...meta } = incoming;
  return { ...local, ...meta, elements };
}
