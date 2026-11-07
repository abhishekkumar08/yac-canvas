export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  record(entry, key = null, merge = null) {
    this.future = [];
    if (key && key === this.lastKey && this.past.length && merge) {
      this.past[this.past.length - 1] = merge(this.past.at(-1), entry);
      return;
    }
    this.lastKey = key;
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
  }

  undo() {
    if (!this.past.length) return null;
    this.lastKey = null;
    const entry = this.past.pop();
    this.future.push(entry);
    return entry;
  }

  redo() {
    if (!this.future.length) return null;
    this.lastKey = null;
    const entry = this.future.pop();
    this.past.push(entry);
    return entry;
  }

  clear() {
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }
}
