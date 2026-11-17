/* GEAR//DROP clip kit: reads window.__CLIP__, trims and fits the cutout, anchors the callouts on
   the product and fits the type. The template calls ClipKit.run(layout); the renderer waits for
   window.__CLIP_READY__ (or window.__CLIP_ERROR__) before it pauses and seeks the animations. */
(function () {
  const K = (window.ClipKit = {});

  K.injectFonts = function () {
    if (!window.__FONT_CSS__) return;
    const s = document.createElement("style");
    s.textContent = window.__FONT_CSS__;
    document.head.appendChild(s);
  };

  K.el = function (tag, cls, text, style) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (style) Object.assign(e.style, style);
    return e;
  };

  K.loadImage = async function (src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  };

  /* Trimmed bounding box of the opaque pixels, in natural pixels, plus an alpha lookup. */
  K.trim = function (img, threshold = 24) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    let data;
    try { data = ctx.getImageData(0, 0, W, H).data; }
    catch (e) { console.warn("cutout pixels not readable, using the full image box:", e.name); return { x: 0, y: 0, w: W, h: H, alphaAt: () => 255, trimmed: false }; }
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W * 4;
      for (let x = 0; x < W; x++) {
        if (data[row + x * 4 + 3] > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) throw new Error("cutout is fully transparent");
    const alphaAt = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      return x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3];
    };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, alphaAt, trimmed: true };
  };

  /* Contain the trimmed box in the safe area, centred. Returns the img geometry and the box in frame px. */
  K.fit = function (img, trim, area) {
    const s = Math.min(area.w / trim.w, area.h / trim.h, area.maxScale || 2);
    const bw = trim.w * s, bh = trim.h * s;
    const bx = area.x + (area.w - bw) / 2, by = area.y + (area.h - bh) / 2;
    return { s, left: bx - trim.x * s, top: by - trim.y * s, width: img.naturalWidth * s, height: img.naturalHeight * s, box: { x: bx, y: by, w: bw, h: bh } };
  };

  K.product = function (img, fit, delay) {
    const p = K.el("img", "product", null, { left: fit.left + "px", top: fit.top + "px", width: fit.width + "px", height: fit.height + "px", animationDelay: delay + "s" });
    p.src = img.src;
    p.alt = "";
    return p;
  };

  /* A point on the product near the top or bottom edge of a region (default: the trimmed box), at a
     fraction of its width: scan the column from that edge to the first solid run, try neighbouring
     columns if it is empty. */
  K.edgeAnchor = function (trim, fit, fx, edge, region) {
    const r = region || trim;
    const depth = Math.max(10, r.h * 0.05);
    const solid = (x, y) => trim.alphaAt(x, y) > 160 && trim.alphaAt(x, y + (edge === "top" ? depth : -depth)) > 160;
    for (const d of [0, -0.04, 0.04, -0.08, 0.08, -0.12, 0.12, -0.18, 0.18, -0.24, 0.24]) {
      const x = r.x + Math.min(0.97, Math.max(0.03, fx + d)) * r.w;
      if (edge === "top") {
        for (let y = r.y; y < r.y + r.h - depth; y += 2) if (solid(x, y)) return K.toFrame(fit, x, y + depth * 0.6);
      } else {
        for (let y = r.y + r.h - 1; y > r.y + depth; y -= 2) if (solid(x, y)) return K.toFrame(fit, x, y - depth * 0.6);
      }
    }
    return K.toFrame(fit, r.x + fx * r.w, edge === "top" ? r.y + depth : r.y + r.h - depth);
  };

  /* The loose top when the cutout shows several pieces (pack, launcher, top): the roundest piece
     that is not the largest one. Null for a single piece (a bare top, a pack alone). */
  K.loosePiece = function (trim) {
    const cell = Math.max(2, Math.round(Math.max(trim.w, trim.h) / 160));
    const gw = Math.ceil(trim.w / cell), gh = Math.ceil(trim.h / cell);
    const solid = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++)
      for (let gx = 0; gx < gw; gx++) solid[gy * gw + gx] = trim.alphaAt(trim.x + (gx + 0.5) * cell, trim.y + (gy + 0.5) * cell) > 96 ? 1 : 0;
    const label = new Int32Array(gw * gh).fill(-1);
    const pieces = [];
    for (let i = 0; i < gw * gh; i++) {
      if (!solid[i] || label[i] >= 0) continue;
      const p = { n: 0, minX: gw, minY: gh, maxX: 0, maxY: 0 };
      const stack = [i];
      label[i] = pieces.length;
      while (stack.length) {
        const j = stack.pop(), x = j % gw, y = (j / gw) | 0;
        p.n++;
        if (x < p.minX) p.minX = x; if (x > p.maxX) p.maxX = x; if (y < p.minY) p.minY = y; if (y > p.maxY) p.maxY = y;
        for (const k of [x > 0 ? j - 1 : -1, x < gw - 1 ? j + 1 : -1, y > 0 ? j - gw : -1, y < gh - 1 ? j + gw : -1]) {
          if (k >= 0 && solid[k] && label[k] < 0) { label[k] = pieces.length; stack.push(k); }
        }
      }
      pieces.push(p);
    }
    const total = pieces.reduce((s, p) => s + p.n, 0);
    const big = pieces.filter((p) => p.n >= total * 0.03).sort((a, b) => b.n - a.n);
    let best = null;
    for (const p of big.slice(1)) {
      const w = p.maxX - p.minX + 1, h = p.maxY - p.minY + 1;
      const aspect = Math.min(w, h) / Math.max(w, h), fill = p.n / (w * h);
      if (aspect < 0.72 || fill < 0.5 || fill > 0.95) continue;
      const score = 1 - aspect + Math.abs(0.78 - fill);
      if (!best || score < best.score) best = { score, x: trim.x + p.minX * cell, y: trim.y + p.minY * cell, w: w * cell, h: h * cell };
    }
    return best;
  };

  /* Callout anchors. The first (a feature of the top or its bit) sits on the lower edge of the loose
     top when there is one, else on the lower edge of the product (the bit of a bare top); the second
     (what is in the box) on the upper edge, on the pack or the rim. */
  K.anchors = function (trim, fit) {
    const piece = K.loosePiece(trim);
    return {
      first: piece ? K.edgeAnchor(trim, fit, 0.5, "bottom", piece) : K.edgeAnchor(trim, fit, 0.72, "bottom"),
      second: K.edgeAnchor(trim, fit, 0.3, "top"),
      piece: piece ? { x: piece.x, y: piece.y, w: piece.w, h: piece.h } : null,
    };
  };
  K.toFrame = (fit, x, y) => ({ x: fit.left + x * fit.s, y: fit.top + y * fit.s });

  /* Callout: label above or below the product box, a vertical leader line from the anchor to it. */
  K.callout = function (parent, text, anchor, side, box, o) {
    const co = K.el("div", "co", null, { animationDelay: o.out + "s" });
    const label = K.el("span", "label", text, { animationDelay: o.t + 0.25 + "s" });
    co.appendChild(label);
    parent.appendChild(co);
    const lw = label.offsetWidth, lh = label.offsetHeight;
    const inset = 30;
    let lo = Math.max(o.marginL, anchor.x - lw + inset), hi = Math.min(o.frameW - o.marginR - lw, anchor.x - inset);
    let left = Math.round(Math.min(hi, Math.max(lo, anchor.x - lw / 2)));
    if (lo > hi) left = Math.round(Math.min(o.frameW - o.marginR - lw, Math.max(o.marginL, anchor.x - lw / 2)));
    let top = side === "above" ? box.y - o.gap - lh : box.y + box.h + o.gap;
    top = Math.round(Math.max(o.topLimit, Math.min(o.bottomLimit - lh, top)));
    label.style.left = left + "px";
    label.style.top = top + "px";
    const x = Math.round(Math.min(left + lw - inset, Math.max(left + inset, anchor.x)));
    const y1 = side === "above" ? top + lh : Math.round(anchor.y);
    const y2 = side === "above" ? Math.round(anchor.y) : top;
    co.appendChild(K.el("span", "line", null, { left: x + "px", top: y1 + "px", height: Math.max(0, y2 - y1) + "px", transformOrigin: side === "above" ? "50% 100%" : "50% 0", animationDelay: o.t + 0.1 + "s" }));
    co.appendChild(K.el("span", "dot", null, { left: x + "px", top: Math.round(anchor.y) + "px", animationDelay: o.t + "s" }));
    return { left, top, width: lw, height: lh };
  };

  /* Shrink an element's font until it is no wider than maxW (and no taller than maxH when given). */
  K.fit1 = function (el, maxW, minPx, maxH) {
    let px = parseFloat(getComputedStyle(el).fontSize);
    const tooBig = () => el.getBoundingClientRect().width > maxW || (maxH && el.getBoundingClientRect().height > maxH);
    while (tooBig() && px > minPx) { px -= 2; el.style.fontSize = px + "px"; }
    return px;
  };

  K.name = function (text, px, t0) {
    const n = K.el("div", "name", null, { fontSize: px + "px" });
    [...text].forEach((ch, i) => {
      const s = K.el("span", ch === " " ? "sp" : null, ch === " " ? null : ch);
      s.style.animationDelay = (t0 + i * 0.03).toFixed(3) + "s";
      n.appendChild(s);
    });
    return n;
  };

  K.identityRow = function (clip, o) {
    const row = K.el("div", "row");
    row.appendChild(K.el("span", "chip", clip.code, { fontSize: o.chipPx + "px", animationDelay: o.tChip + "s" }));
    if (clip.type) {
      const t = K.el("span", "type", null, { fontSize: o.typePx + "px", animationDelay: o.tType + "s" });
      t.appendChild(K.el("i", "mark"));
      t.appendChild(document.createTextNode(clip.type));
      row.appendChild(t);
    }
    return row;
  };

  K.watermark = function (stage, before, mark, o) {
    if (!mark) return null;
    const w = K.el("div", "watermark", mark, { left: o.left + "px", top: o.top + "px", fontSize: o.px + "px", animationDelay: o.t + "s" });
    stage.insertBefore(w, before);
    K.fit1(w, o.maxW, 120);
    return w;
  };

  K.run = function (layout) {
    (async () => {
      const clip = window.__CLIP__;
      if (!clip) throw new Error("window.__CLIP__ is missing");
      await Promise.all([
        document.fonts.load('italic 900 100px "Anybody Variable"'),
        document.fonts.load('normal 800 100px "Anybody Variable"'),
        document.fonts.load('500 40px "JetBrains Mono"'),
        document.fonts.load('italic 700 100px "Chakra Petch"'),
      ]);
      await document.fonts.ready;
      const img = await K.loadImage(clip.cutout);
      const trim = K.trim(img);
      const stage = document.getElementById("stage");
      stage.style.setProperty("--tint", clip.tint);
      await layout({ clip, img, trim, stage });
      await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
      window.__CLIP_LAYOUT__ = Object.assign({ trimmed: trim.trimmed, trim: { x: trim.x, y: trim.y, w: trim.w, h: trim.h } }, window.__CLIP_LAYOUT__ || {});
      window.__CLIP_READY__ = true;
    })().catch((e) => { window.__CLIP_ERROR__ = String((e && e.stack) || e); });
  };
})();
