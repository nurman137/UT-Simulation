/*
 * Penggambaran layar A-scan bergaya flaw detector.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  const COL = {
    bg: '#0c1512',
    grid: 'rgba(120,200,160,0.14)',
    gridMajor: 'rgba(120,200,160,0.28)',
    trace: '#7dff9e',
    text: '#9fc7b3',
    gate: '#ffa53a',
    gateHit: '#ff4d4d',
    cursor: '#4fd1ff',
  };

  UT.ascanLayout = function (cw, ch) {
    const L = 40, R = 10, Tp = 10, B = 28;
    return { L, R, T: Tp, B, w: cw - L - R, h: ch - Tp - B, cw, ch };
  };

  /**
   * o: { disp: Float32Array (%FSH, bertanda untuk RF), rect, delay, range,
   *      gate:{start,end,level}, peak:{sp,amp,triggered}, hoverSP }
   */
  UT.drawAscan = function (ctx, lay, o) {
    const { L, T, w, h } = lay;
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, lay.cw, lay.ch);

    // Grid 10 x 10
    for (let i = 0; i <= 10; i++) {
      ctx.strokeStyle = i === 0 || i === 10 || i === 5 ? COL.gridMajor : COL.grid;
      ctx.lineWidth = 1;
      const x = Math.round(L + (i * w) / 10) + 0.5;
      const y = Math.round(T + (i * h) / 10) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + w, y); ctx.stroke();
    }

    // Label sumbu
    ctx.fillStyle = COL.text;
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    const rf = o.rect === 'rf';
    for (let i = 0; i <= 10; i += 2) {
      const y = T + h - (i * h) / 10;
      const lab = rf ? String((i - 5) * 20) : String(i * 10);
      ctx.fillText(lab, L - 5, y + 3);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i <= 10; i += 2) {
      const x = L + (i * w) / 10;
      ctx.fillText((o.delay + (i * o.range) / 10).toFixed(o.range < 50 ? 1 : 0), x, T + h + 14);
    }
    ctx.textAlign = 'right';
    ctx.fillText(o.xLabel || 'SP (mm)', L + w, T + h + 26);
    ctx.save();
    ctx.translate(11, T + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('% FSH', 0, 0);
    ctx.restore();

    const yOf = (pct) => {
      const v = rf ? 50 + pct / 2 : pct;
      return T + h - (Math.max(-5, Math.min(110, v)) / 100) * h;
    };

    // Gate
    if (o.gate) {
      const gx0 = L + ((o.gate.start - o.delay) / o.range) * w;
      const gx1 = L + ((o.gate.end - o.delay) / o.range) * w;
      const gy = rf ? yOf(o.gate.level) : yOf(o.gate.level);
      ctx.strokeStyle = o.peak && o.peak.triggered ? COL.gateHit : COL.gate;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.max(L, gx0), gy);
      ctx.lineTo(Math.min(L + w, gx1), gy);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      if (gx0 >= L && gx0 <= L + w) ctx.fillText('A', gx0 + 2, gy - 4);
    }

    // Kurva DAC (100%, 50% = −6 dB, 20% = −14 dB)
    if (o.dacCurve && !rf) {
      const lines = [[1, [], 2], [0.5, [7, 4], 1.4], [0.2, [2, 3], 1.4]];
      ctx.save();
      ctx.beginPath();
      ctx.rect(L, T - 2, w, h + 4);
      ctx.clip();
      ctx.strokeStyle = '#ff7ad9';
      lines.forEach(([f, dash, lw]) => {
        ctx.setLineDash(dash);
        ctx.lineWidth = lw;
        ctx.beginPath();
        let pen = false, lastX = 0, lastY = 0;
        for (let c = 0; c <= w; c += 2) {
          const sp = o.delay + (c / w) * o.range;
          const a = o.dacCurve(sp);
          if (a == null) { pen = false; continue; }
          const x = L + c, y = yOf(Math.min(108, a * f));
          if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
          lastX = x; lastY = y;
        }
        ctx.stroke();
        if (pen) {
          ctx.setLineDash([]);
          ctx.fillStyle = '#ff7ad9';
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`${Math.round(f * 100)}%`, Math.min(L + w - 2, lastX + 22), lastY - 3);
        }
      });
      ctx.setLineDash([]);
      (o.dacPoints || []).forEach((p) => {
        const x = L + ((p.sp - o.delay) / o.range) * w;
        if (x < L || x > L + w) return;
        ctx.fillStyle = '#ff7ad9';
        ctx.beginPath();
        ctx.arc(x, yOf(Math.min(108, p.amp)), 3, 0, 2 * Math.PI);
        ctx.fill();
      });
      ctx.restore();
    }

    // Trace: min/max per kolom piksel
    const d = o.disp, n = d.length;
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, T - 2, w, h + 4);
    ctx.clip();
    ctx.strokeStyle = COL.trace;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    const cols = Math.max(1, Math.floor(w));
    let first = true;
    for (let c = 0; c < cols; c++) {
      const i0 = Math.floor((c * n) / cols), i1 = Math.max(i0 + 1, Math.floor(((c + 1) * n) / cols));
      let mn = Infinity, mx = -Infinity;
      for (let i = i0; i < i1 && i < n; i++) {
        const v = d[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const x = L + c + 0.5;
      if (first) { ctx.moveTo(x, yOf(mn)); first = false; } else ctx.lineTo(x, yOf(mn));
      if (mx !== mn) ctx.lineTo(x, yOf(mx));
    }
    ctx.stroke();
    ctx.restore();

    // Penanda puncak
    if (o.peak && o.peak.triggered && o.peak.sp != null) {
      const px = L + ((o.peak.sp - o.delay) / o.range) * w;
      const py = yOf(rf ? Math.min(100, o.peak.amp) : Math.min(105, o.peak.amp));
      ctx.fillStyle = COL.gateHit;
      ctx.beginPath();
      ctx.moveTo(px, py - 4); ctx.lineTo(px - 5, py - 12); ctx.lineTo(px + 5, py - 12);
      ctx.closePath();
      ctx.fill();
    }

    // Kursor hover
    if (o.hoverSP != null) {
      const x = L + ((o.hoverSP - o.delay) / o.range) * w;
      ctx.strokeStyle = COL.cursor;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.cursor;
      ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = x > L + w - 80 ? 'right' : 'left';
      const lab = o.xLabel && o.xLabel.startsWith('waktu') ? `${o.hoverSP.toFixed(2)} µs` : `SP ${o.hoverSP.toFixed(1)}`;
      ctx.fillText(lab, x + (ctx.textAlign === 'left' ? 4 : -4), T + 12);
    }

    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
