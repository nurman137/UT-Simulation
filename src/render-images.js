/*
 * Penggambaran citra: B-scan / D-scan (gambar persegi panjang) dan S-scan sektor Phased Array.
 * Data disimpan mentah (sebelum gain); gain diterapkan saat menggambar sehingga gambar ikut
 * berubah ketika gain diubah, seperti pada alat sungguhan.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  // Palet amplitudo (0–100% FSH): putih → biru → cyan → hijau → kuning → merah
  const STOPS = [
    [0, [255, 255, 255]], [0.12, [200, 220, 255]], [0.25, [60, 110, 230]], [0.42, [0, 190, 220]],
    [0.58, [40, 200, 70]], [0.75, [250, 220, 0]], [0.9, [255, 110, 0]], [1, [200, 0, 0]],
  ];
  const LUT = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 1;
    while (k < STOPS.length - 1 && STOPS[k][0] < t) k++;
    const [t0, c0] = STOPS[k - 1], [t1, c1] = STOPS[k];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    for (let c = 0; c < 3; c++) LUT[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
  }
  UT.ampColor = (pct) => {
    const i = Math.max(0, Math.min(255, Math.round((pct / 100) * 255))) * 3;
    return [LUT[i], LUT[i + 1], LUT[i + 2]];
  };

  UT.imageLayout = function (cw, ch) {
    const L = 44, R = 30, T = 8, B = 26;
    return { L, R, T, B, w: cw - L - R, h: ch - T - B, cw, ch };
  };

  function axes(ctx, lay, o) {
    const { L, T, w, h } = lay;
    ctx.fillStyle = '#4b5864';
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.strokeStyle = 'rgba(60,70,80,0.5)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const v = o.xMin + ((o.xMax - o.xMin) * i) / 5;
      const x = L + (w * i) / 5;
      ctx.beginPath(); ctx.moveTo(x, T + h); ctx.lineTo(x, T + h + 4); ctx.stroke();
      ctx.fillText(v.toFixed(0), x, T + h + 14);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const v = o.yMin + ((o.yMax - o.yMin) * i) / 5;
      const y = T + (h * i) / 5;
      ctx.beginPath(); ctx.moveTo(L - 4, y); ctx.lineTo(L, y); ctx.stroke();
      ctx.fillText(o.yFmt ? o.yFmt(v) : v.toFixed(0), L - 6, y + 3);
    }
    ctx.textAlign = 'right';
    ctx.fillText(o.xLabel, L + w, T + h + 25);
    ctx.save();
    ctx.translate(10, T + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(o.yLabel, 0, 0);
    ctx.restore();
  }

  function colorbar(ctx, lay, rf) {
    const x = lay.L + lay.w + 8, y0 = lay.T, h = lay.h;
    for (let i = 0; i < h; i++) {
      const t = 1 - i / h;
      if (rf) { const gv = Math.round(t * 255); ctx.fillStyle = `rgb(${gv},${gv},${gv})`; }
      else { const c = UT.ampColor(t * 100); ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; }
      ctx.fillRect(x, y0 + i, 10, 1);
    }
    ctx.strokeStyle = '#8a96a3';
    ctx.strokeRect(x + 0.5, y0 + 0.5, 10, h - 1);
  }

  let offscreen = null;
  function blit(ctx, lay, cols, rows, fill) {
    if (!offscreen) offscreen = document.createElement('canvas');
    offscreen.width = cols;
    offscreen.height = rows;
    const oc = offscreen.getContext('2d');
    const img = oc.createImageData(cols, rows);
    fill(img.data);
    oc.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, lay.L, lay.T, lay.w, lay.h);
  }

  /**
   * Citra persegi (B-scan / D-scan). Data kolom-mayor: data[c*rows + r].
   * o: { cols, rows, data, done, gainLin (mentah → %FSH), rf (true = RF grayscale),
   *      xMin, xMax, xLabel, yMin, yMax, yLabel, yFmt, cursorX, cursorY, hLines:[{y, color, label}], vLines:[{x,color}] }
   */
  UT.drawImageScan = function (ctx, lay, o) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lay.cw, lay.ch);
    const { cols, rows, data, gainLin } = o;
    blit(ctx, lay, cols, rows, (px) => {
      for (let c = 0; c < cols; c++) {
        const has = c < o.done;
        for (let r = 0; r < rows; r++) {
          const k = (r * cols + c) * 4;
          if (!has) { px[k] = px[k + 1] = px[k + 2] = 235; px[k + 3] = 255; continue; }
          const v = data[c * rows + r] * gainLin;
          if (o.rf) {
            const gv = Math.max(0, Math.min(255, 128 + v * 1.27));
            px[k] = px[k + 1] = px[k + 2] = gv;
          } else {
            const i = Math.max(0, Math.min(255, Math.round((Math.abs(v) / 100) * 255))) * 3;
            px[k] = LUT[i]; px[k + 1] = LUT[i + 1]; px[k + 2] = LUT[i + 2];
          }
          px[k + 3] = 255;
        }
      }
    });
    const { L, T, w, h } = lay;
    const X = (x) => L + ((x - o.xMin) / (o.xMax - o.xMin)) * w;
    const Y = (y) => T + ((y - o.yMin) / (o.yMax - o.yMin)) * h;
    ctx.strokeStyle = '#8a96a3';
    ctx.strokeRect(L + 0.5, T + 0.5, w - 1, h - 1);
    (o.hLines || []).forEach((ln) => {
      if (ln.y < o.yMin || ln.y > o.yMax) return;
      ctx.strokeStyle = ln.color;
      ctx.setLineDash(ln.dash || [5, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(L, Y(ln.y)); ctx.lineTo(L + w, Y(ln.y)); ctx.stroke();
      ctx.setLineDash([]);
      if (ln.label) {
        ctx.fillStyle = ln.color;
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(ln.label, L + 4, Y(ln.y) - 3);
      }
    });
    (o.vLines || []).forEach((ln) => {
      if (ln.x < o.xMin || ln.x > o.xMax) return;
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = ln.width || 1.5;
      ctx.setLineDash(ln.dash || []);
      ctx.beginPath(); ctx.moveTo(X(ln.x), T); ctx.lineTo(X(ln.x), T + h); ctx.stroke();
      ctx.setLineDash([]);
    });
    if (o.cursorY != null && o.cursorY >= o.yMin && o.cursorY <= o.yMax) {
      ctx.strokeStyle = '#00a86b';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(L, Y(o.cursorY)); ctx.lineTo(L + w, Y(o.cursorY)); ctx.stroke();
      ctx.setLineDash([]);
    }
    axes(ctx, lay, o);
    colorbar(ctx, lay, o.rf);
    if (o.done < cols) {
      ctx.fillStyle = 'rgba(30,40,50,0.75)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`merekam… ${Math.round((o.done / cols) * 100)}%`, L + w - 6, T + 14);
    }
    ctx.restore();
  };

  /** Geometri tampilan sektor S-scan (koordinat sebenarnya, tanpa dilipat). */
  UT.sscanGeom = function (lay, o) {
    const aMin = o.angles[0] * DEG, aMax = o.angles[o.angles.length - 1] * DEG;
    const R = o.spEnd;
    const xMax = R * Math.sin(aMax), zMax = R * Math.cos(aMin);
    const s = Math.min(lay.w / xMax, lay.h / zMax);
    const ox = lay.L + (lay.w - xMax * s) / 2, oz = lay.T;
    return { s, ox, oz, X: (x) => ox + x * s, Z: (z) => oz + z * s, xMax, zMax, aMin, aMax };
  };

  /**
   * S-scan sektor. data[a*rows + r] = amplitudo mentah untuk sudut ke-a, bin SP ke-r.
   * o: { angles, rows, data, done (jumlah sudut terisi), gainLin, spStart, spEnd, T, selAngle }
   * Tampilan "true depth" tanpa dilipat: garis T, 2T, 3T menandai permukaan bawah/atas.
   */
  UT.drawSScan = function (ctx, lay, o) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lay.cw, lay.ch);
    const G = UT.sscanGeom(lay, o);
    const nA = o.angles.length, a0 = o.angles[0], da = o.angles[1] - o.angles[0];
    const pxW = Math.max(2, Math.round(G.xMax * G.s)), pxH = Math.max(2, Math.round(G.zMax * G.s));
    const tmp = { L: G.ox, T: G.oz, w: pxW, h: pxH };
    const cols = Math.min(pxW, 420), rows = Math.min(pxH, 420);
    blit(ctx, tmp, cols, rows, (px) => {
      for (let r = 0; r < rows; r++) {
        const z = ((r + 0.5) / rows) * G.zMax;
        for (let c = 0; c < cols; c++) {
          const x = ((c + 0.5) / cols) * G.xMax;
          const k = (r * cols + c) * 4;
          const ang = Math.atan2(x, z) / DEG;
          const sp = Math.hypot(x, z);
          const ai = Math.round((ang - a0) / da);
          if (ai < 0 || ai >= nA || sp < o.spStart || sp > o.spEnd) { px[k + 3] = 0; continue; }
          if (ai >= o.done) { px[k] = px[k + 1] = px[k + 2] = 235; px[k + 3] = 255; continue; }
          const ri = Math.min(o.rows - 1, Math.floor(((sp - o.spStart) / (o.spEnd - o.spStart)) * o.rows));
          const v = Math.abs(o.data[ai * o.rows + ri]) * o.gainLin;
          const li = Math.max(0, Math.min(255, Math.round((v / 100) * 255))) * 3;
          px[k] = LUT[li]; px[k + 1] = LUT[li + 1]; px[k + 2] = LUT[li + 2]; px[k + 3] = 255;
        }
      }
    });
    // Garis ketebalan (T, 2T, …) dan label
    ctx.font = '10px system-ui, sans-serif';
    for (let k = 1; k * o.T <= G.zMax; k++) {
      const y = G.Z(k * o.T);
      ctx.strokeStyle = k % 2 ? 'rgba(90,100,110,0.8)' : 'rgba(90,100,110,0.5)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(G.X(0), y); ctx.lineTo(G.X(G.xMax), y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#4b5864';
      ctx.textAlign = 'left';
      // label di sisi kiri (di luar sektor) agar tidak bertumpuk dengan label sudut
      ctx.fillText(k === 1 ? 'T (dasar)' : k === 2 ? '2T (atas)' : `${k}T`, G.X(0) + 3, y - 3);
    }
    // Garis sudut batas & sudut terpilih
    const ray = (aDeg, color, wdt, dash) => {
      const a = aDeg * DEG;
      ctx.strokeStyle = color;
      ctx.lineWidth = wdt;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      ctx.moveTo(G.X(o.spStart * Math.sin(a)), G.Z(o.spStart * Math.cos(a)));
      ctx.lineTo(G.X(o.spEnd * Math.sin(a)), G.Z(o.spEnd * Math.cos(a)));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    ray(o.angles[0], 'rgba(90,100,110,0.6)', 1);
    ray(o.angles[nA - 1], 'rgba(90,100,110,0.6)', 1);
    if (o.selAngle != null) ray(o.selAngle, '#7b2cbf', 1.6, [6, 3]);
    // Label sudut
    ctx.fillStyle = '#4b5864';
    ctx.textAlign = 'center';
    [o.angles[0], o.angles[nA - 1]].forEach((a) => {
      const rr = o.spEnd * 0.98;
      ctx.fillText(`${a}°`, G.X(rr * Math.sin(a * DEG)) + (a > 55 ? -10 : 10), G.Z(rr * Math.cos(a * DEG)) - 4);
    });
    if (o.selAngle != null) {
      ctx.fillStyle = '#7b2cbf';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`A-scan: ${o.selAngle}°`, lay.L + 2, lay.T + 12);
    }
    // Skala kedalaman di kiri
    ctx.fillStyle = '#4b5864';
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    const step = G.zMax > 80 ? 20 : G.zMax > 40 ? 10 : 5;
    for (let z = 0; z <= G.zMax; z += step) ctx.fillText(String(z), G.X(0) - 4, G.Z(z) + 3);
    ctx.save();
    ctx.translate(10, lay.T + lay.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('kedalaman tanpa dilipat (mm)', 0, 0);
    ctx.restore();
    colorbar(ctx, lay, false);
    if (o.done < nA) {
      ctx.fillStyle = 'rgba(30,40,50,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText(`menghitung… ${Math.round((o.done / nA) * 100)}%`, lay.L + lay.w - 6, lay.T + 14);
    }
    ctx.restore();
  };

  /** Sudut sektor dari koordinat piksel pada S-scan (untuk klik memilih sudut). */
  UT.sscanAngleAt = function (lay, o, px, py) {
    const G = UT.sscanGeom(lay, o);
    const x = (px - G.ox) / G.s, z = (py - G.oz) / G.s;
    if (z <= 0) return null;
    return Math.atan2(x, z) / DEG;
  };
})(typeof window !== 'undefined' ? window : globalThis);
