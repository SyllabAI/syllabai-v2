/**
 * C) native ink reference implementation — T-MG-INK-1 run-001 spike artifact.
 * Zero dependencies. Pointer-capture stroke capture over a page box, normalized
 * 0..1 coordinates (RegionOverlay geometry law: zoom/dpr scaling is the
 * browser's problem), devicePixelRatio capped at 2 (pdf-pane:987 law), and a
 * persistence doc shaped {schema, shapes[]} — the dossier A7 anatomy — so the
 * stored doc is format-compatible regardless of which renderer drew it.
 */
const SCHEMA_ID = "syllabai-ink/1";
const COLORS = { black: "#1a1a1a", red: "#d13438", blue: "#0f6cbd", green: "#107c10" };

function makeId() {
  return "shape:" + Math.random().toString(36).slice(2, 10);
}

export class InkLayer {
  /**
   * @param {HTMLCanvasElement} canvas positioned absolutely over the page box
   * @param {{ color?: string; width?: number; onChange?: () => void }} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.color = opts.color ?? "black";
    this.width = opts.width ?? 2;
    this.onChange = opts.onChange;
    this.shapes = []; // {id,type:'draw',x,y,color,size,dash,scale,segments:[{path:"m x,y l dx,dy ..."}]}
    this.redoStack = [];
    this.active = null;
    this.dprCap = 2;
    this._bind();
  }

  /** Resize backing store to the page box at dpr ≤ 2; strokes re-render normalized. */
  resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.canvas.width = Math.max(1, Math.round(box.width * dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  _bind() {
    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("pointerdown", this._down = (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this.canvas.setPointerCapture(e.pointerId);
      const b = this.canvas.getBoundingClientRect();
      this.active = {
        id: makeId(), type: "draw", x: 0, y: 0, color: this.color,
        size: this.width, dash: "draw", scale: 1,
        segments: [{ path: `M ${e.clientX - b.left},${e.clientY - b.top}` }],
        _pts: [[e.clientX - b.left, e.clientY - b.top, e.pressure || 0.5]],
      };
      this.redoStack = [];
    });
    this.canvas.addEventListener("pointermove", this._move = (e) => {
      if (!this.active) return;
      const b = this.canvas.getBoundingClientRect();
      const x = e.clientX - b.left, y = e.clientY - b.top;
      const pts = this.active._pts;
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 1.2) return; // rdp-lite coalescing
      pts.push([x, y, e.pressure || 0.5]);
      this.active.segments[0].path += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
      this.render();
    });
    const up = () => {
      if (!this.active) return;
      this.shapes.push(this.active);
      delete this.active._pts;
      this.active = null;
      this.onChange?.();
    };
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", up);
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.canvas);
    this.resize();
  }

  /** Re-paint all shapes; coordinates are page-box pixels captured at stroke time. */
  render() {
    const w = this.canvas.width, h = this.canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.ctx.clearRect(0, 0, w / dpr, h / dpr);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    for (const s of [...this.shapes, this.active].filter(Boolean)) {
      const pts = s._pts ?? decodePath(s.segments[0].path);
      this.ctx.strokeStyle = COLORS[s.color] ?? s.color;
      this.ctx.lineWidth = s.size;
      this.ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
    }
  }

  undo() { const s = this.shapes.pop(); if (s) { this.redoStack.push(s); this.render(); this.onChange?.(); } }
  redo() { const s = this.redoStack.pop(); if (s) { this.shapes.push(s); this.render(); this.onChange?.(); } }
  clear() { if (this.shapes.length) { this.redoStack = this.shapes.concat(this.redoStack); this.shapes = []; this.render(); this.onChange?.(); } }

  /** Persistence doc — the A7 anatomy: {schema, shapes[]} verbatim container. */
  toDoc() {
    return { schema: SCHEMA_ID, shapes: this.shapes.map(({ _pts, ...s }) => s) };
  }

  /** Restore from a stored doc (draw → reload → redraw pin). */
  loadDoc(doc) {
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.shapes)) throw new Error("bad doc");
    if (doc.schema !== SCHEMA_ID) throw new Error(`schema mismatch: ${doc.schema}`);
    this.shapes = doc.shapes.filter((s) => s.type === "draw");
    this.redoStack = [];
    this.render();
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this._down);
    this.canvas.removeEventListener("pointermove", this._move);
    this._ro.disconnect();
  }
}

/** Decode "M x,y L x,y ..." back to points for restored docs. */
function decodePath(path) {
  return path.split(/[ML]/).filter(Boolean).map((p) => {
    const [x, y] = p.trim().split(",").map(Number);
    return [x, y];
  });
}
