/*
 * Tampak atas (hanya benda uji las): sumbu x sejajar dengan tampilan penampang,
 * sumbu vertikal = posisi sepanjang las (y). Dipakai untuk menggeser probe sepanjang las
 * dan untuk sizing panjang dengan metode 6 dB drop.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.PROBE_WIDTH = 20; // lebar wedge (mm, searah y)

  /** Pemetaan y (mm) ↔ piksel vertikal. Skala y independen dari skala x. */
  UT.topLayout = function (ch, yLen) {
    const top = 8, bottom = 8;
    const h = ch - top - bottom;
    return {
      top, h, yLen,
      Y: (y) => top + (y / yLen) * h,
      yOf: (py) => ((py - top) / h) * yLen,
    };
  };

  /**
   * o: { spec, state, dir, H, sizing:{y1,y2}, showTruth }
   * v = view penampang (dipakai untuk skala x).
   */
  UT.drawTopView = function (ctx, v, lay, o) {
    const X = (x) => v.ox + x * v.s;
    const { Y } = lay;
    const spec = o.spec, w = spec.weld;
    ctx.save();
    ctx.fillStyle = '#eef1f4';
    ctx.fillRect(0, 0, v.cw, lay.top * 2 + lay.h);

    // Pelat
    const px0 = Math.max(spec.xMin, v.x0 - 5), px1 = Math.min(spec.xMax, v.x1 + 5);
    ctx.fillStyle = '#c9d1d9';
    ctx.fillRect(X(px0), Y(0), X(px1) - X(px0), Y(lay.yLen) - Y(0));

    // Cap las (riak)
    const cw = w.capH > 0 ? w.capHalf : w.topHalf;
    ctx.fillStyle = '#b8a98f';
    ctx.fillRect(X(-cw), Y(0), X(cw) - X(-cw), Y(lay.yLen) - Y(0));
    ctx.strokeStyle = 'rgba(90,70,40,0.35)';
    ctx.lineWidth = 1;
    for (let y = 2; y < lay.yLen; y += 4) {
      ctx.beginPath();
      ctx.moveTo(X(-cw), Y(y + 1.5));
      ctx.quadraticCurveTo(X(0), Y(y - 1.5), X(cw), Y(y + 1.5));
      ctx.stroke();
    }
    ctx.strokeStyle = '#7a5c2e';
    ctx.setLineDash([4, 3]);
    [-w.topHalf, w.topHalf].forEach((x) => {
      ctx.beginPath(); ctx.moveTo(X(x), Y(0)); ctx.lineTo(X(x), Y(lay.yLen)); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Skala y
    ctx.fillStyle = '#6b7785';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (let y = 0; y <= lay.yLen; y += 50) {
      const py = Y(y);
      ctx.strokeStyle = 'rgba(60,70,80,0.45)';
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(8, py); ctx.stroke();
      if (y > 0 && y < lay.yLen) ctx.fillText(`y ${y}`, 10, py + 3);
    }

    // Cacat (mode guru): proyeksi tampak atas
    if (o.showTruth) {
      const sh = spec.scene.shapes;
      ctx.fillStyle = 'rgba(214,40,40,0.55)';
      ctx.strokeStyle = '#d62828';
      const rect = (xs, y1, y2) => {
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        const pw = Math.max(3, X(x1) - X(x0));
        ctx.fillRect(X((x0 + x1) / 2) - pw / 2, Y(y1), pw, Math.max(2, Y(y2) - Y(y1)));
        ctx.strokeRect(X((x0 + x1) / 2) - pw / 2, Y(y1), pw, Math.max(2, Y(y2) - Y(y1)));
      };
      sh.polys.forEach((p) => { if (p.y1 != null) rect(p.pts.map((q) => q[0]), p.y1, p.y2); });
      sh.circles.forEach((c) => {
        ctx.beginPath();
        ctx.arc(X(c.x), Y(c.y), Math.max(2, c.r * v.s), 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // Tanda sizing
    ctx.strokeStyle = '#7b2cbf';
    ctx.fillStyle = '#7b2cbf';
    ctx.lineWidth = 1.5;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ['y1', 'y2'].forEach((k, i) => {
      const y = o.sizing[k];
      if (y == null) return;
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(X(px0), Y(y)); ctx.lineTo(X(px1), Y(y)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(`ujung ${i + 1}`, v.cw - 6, Y(y) - 3);
    });

    const yp = o.state.probeY, hw = UT.PROBE_WIDTH / 2;
    if (o.tofdS != null) {
      // TOFD: pemancar & penerima simetris terhadap sumbu las, dipindai sepanjang las
      [[-o.tofdS, 1], [o.tofdS, -1]].forEach(([x0, d]) => {
        const xf = x0 + d * 8, xb = x0 - d * 22;
        ctx.fillStyle = 'rgba(80,120,170,0.55)';
        ctx.strokeStyle = '#2b3440';
        ctx.lineWidth = 1.5;
        const rx = X(Math.min(xf, xb)), rw = Math.abs(X(xf) - X(xb));
        ctx.fillRect(rx, Y(yp - hw * 0.6), rw, Y(yp + hw * 0.6) - Y(yp - hw * 0.6));
        ctx.strokeRect(rx, Y(yp - hw * 0.6), rw, Y(yp + hw * 0.6) - Y(yp - hw * 0.6));
      });
      ctx.strokeStyle = '#0077cc';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(X(-o.tofdS), Y(yp)); ctx.lineTo(X(o.tofdS), Y(yp)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#26303a';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`y = ${yp.toFixed(1)} mm`, X(0), Y(yp + hw) + 12 > lay.top + lay.h ? Y(yp - hw) - 4 : Y(yp + hw) + 12);
      ctx.restore();
      return;
    }
    // Probe (tapak wedge) + arah berkas
    const { xf, xb } = UT.probeExtent(o.state.probeX, o.dir, o.H);
    const rx = X(Math.min(xf, xb)), rw = Math.abs(X(xf) - X(xb));
    ctx.fillStyle = 'rgba(80,120,170,0.55)';
    ctx.strokeStyle = '#2b3440';
    ctx.lineWidth = 1.5;
    ctx.fillRect(rx, Y(yp - hw), rw, Y(yp + hw) - Y(yp - hw));
    ctx.strokeRect(rx, Y(yp - hw), rw, Y(yp + hw) - Y(yp - hw));
    // garis sumbu berkas
    ctx.strokeStyle = '#0077cc';
    ctx.lineWidth = 2;
    const xEnd = o.state.probeX + o.dir * 2 * spec.T * Math.tan((o.H.angle * Math.PI) / 180);
    ctx.beginPath(); ctx.moveTo(X(o.state.probeX), Y(yp)); ctx.lineTo(X(xEnd), Y(yp)); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(xEnd), Y(yp));
    ctx.lineTo(X(xEnd) - o.dir * 7, Y(yp) - 4);
    ctx.lineTo(X(xEnd) - o.dir * 7, Y(yp) + 4);
    ctx.closePath();
    ctx.fillStyle = '#0077cc';
    ctx.fill();
    ctx.fillStyle = '#26303a';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`y = ${yp.toFixed(1)} mm`, rx + rw / 2, Y(yp + hw) + 12 > lay.top + lay.h ? Y(yp - hw) - 4 : Y(yp + hw) + 12);
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
