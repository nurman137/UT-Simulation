/*
 * Penggambaran tampilan scanning: penampang pelat & las, cacat, berkas, probe.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  const COL = {
    bg: '#eef1f4',
    plate: '#c9d1d9',
    plateEdge: '#5c6773',
    weld: '#b8a98f',
    weldLine: 'rgba(90,70,40,0.35)',
    haz: 'rgba(214,170,90,0.28)',
    fusion: '#7a5c2e',
    defect: '#d62828',
    defectFill: 'rgba(214,40,40,0.55)',
    beam: 'rgba(0,150,255,0.18)',
    ray: '#0077cc',
    gate: 'rgba(255,140,0,0.9)',
    probe: '#2b3440',
    probeFace: '#3d4a59',
    text: '#26303a',
    muted: '#6b7785',
    marker: '#00a86b',
    peak: '#ff8c00',
  };

  /** Hitung transformasi tampilan agar las & probe terlihat, skala x = skala z. */
  /** Batas dunia (mm) yang perlu terlihat di tampilan scanning. */
  UT.viewExtent = function (w, state, dir) {
    const wd = UT.CONFIG.wedge;
    const hs = w.T * Math.tan((state.angle * Math.PI) / 180);
    const skip = 2 * hs;
    const near = skip + wd.back + 14;
    const far = Math.max(w.capHalf + 14, 0.45 * skip + 12);
    let x0 = dir > 0 ? -near : -far;
    let x1 = dir > 0 ? far : near;
    const pA = state.probeX - dir * wd.back, pB = state.probeX + dir * wd.front;
    x0 = Math.min(x0, Math.min(pA, pB) - 8);
    x1 = Math.max(x1, Math.max(pA, pB) + 8);
    return { x0, x1, z0: -(wd.height + 17), z1: w.T + 10 };
  };

  /** Hitung transformasi tampilan agar las & probe terlihat, skala x = skala z. */
  UT.computeView = function (cw, ch, w, state, dir) {
    const { x0, x1, z0, z1 } = UT.viewExtent(w, state, dir);
    const s = Math.min(cw / (x1 - x0), ch / (z1 - z0));
    const ox = (cw - (x1 - x0) * s) / 2 - x0 * s;
    const oz = (ch - (z1 - z0) * s) / 2 - z0 * s;
    return { s, ox, oz, x0: -ox / s, x1: (cw - ox) / s, z0: -oz / s, z1: (ch - oz) / s, cw, ch };
  };

  UT.viewToWorld = (v, px, py) => ({ x: (px - v.ox) / v.s, z: (py - v.oz) / v.s });

  /** Apakah posisi probe masih terlihat dengan nyaman di view. */
  UT.probeInView = function (v, xp, dir) {
    const wd = UT.CONFIG.wedge;
    const a = xp - dir * wd.back, b = xp + dir * wd.front;
    return Math.min(a, b) > v.x0 + 4 && Math.max(a, b) < v.x1 - 4;
  };

  UT.drawSection = function (ctx, v, o) {
    const { weld: w, scene, state, dir } = o;
    const X = (x) => v.ox + x * v.s;
    const Z = (z) => v.oz + z * v.s;
    const T = w.T;

    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, v.cw, v.ch);

    // --- Pelat
    const px0 = Math.max(-w.P, v.x0 - 5), px1 = Math.min(w.P, v.x1 + 5);
    ctx.fillStyle = COL.plate;
    ctx.fillRect(X(px0), Z(0), X(px1) - X(px0), Z(T) - Z(0));

    // --- HAZ (pita tipis di luar garis fusi)
    const fusionPoly = (side, off) => [
      [side * (w.topHalf + off), 0],
      [side * (w.g + off), T - w.rf],
      [side * (w.g + off), T],
    ];
    ctx.fillStyle = COL.haz;
    [-1, 1].forEach((side) => {
      const a = fusionPoly(side, 0), b = fusionPoly(side, 2.2);
      ctx.beginPath();
      a.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      b.slice().reverse().forEach((p) => ctx.lineTo(X(p[0]), Z(p[1])));
      ctx.closePath();
      ctx.fill();
    });

    // --- Logam las (bevel V) + cap + root bead
    ctx.beginPath();
    ctx.moveTo(X(-w.capHalf), Z(0));
    if (w.capH > 0) ctx.quadraticCurveTo(X(0), Z(-2 * w.capH), X(w.capHalf), Z(0));
    else ctx.lineTo(X(w.topHalf), Z(0));
    ctx.lineTo(X(w.topHalf), Z(0));
    ctx.lineTo(X(w.g), Z(T - w.rf));
    ctx.lineTo(X(w.g), Z(T));
    if (scene.rootBead) {
      ctx.lineTo(X(w.rootHalf), Z(T));
      ctx.quadraticCurveTo(X(0), Z(T + 2 * w.rootH), X(-w.rootHalf), Z(T));
    }
    ctx.lineTo(X(-w.g), Z(T));
    ctx.lineTo(X(-w.g), Z(T - w.rf));
    ctx.lineTo(X(-w.topHalf), Z(0));
    ctx.closePath();
    ctx.fillStyle = COL.weld;
    ctx.fill();

    // Garis lapisan las (estetika)
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = COL.weldLine;
    ctx.lineWidth = 1;
    const passes = Math.max(3, Math.round(T / 4));
    for (let i = 1; i < passes; i++) {
      const z = T - (i * T) / passes;
      const hx = UT.fusionX(w, z, 1);
      ctx.beginPath();
      ctx.moveTo(X(-hx - 1), Z(z + 0.8));
      ctx.quadraticCurveTo(X(0), Z(z - 1.6), X(hx + 1), Z(z + 0.8));
      ctx.stroke();
    }
    ctx.restore();

    // Garis fusi
    ctx.strokeStyle = COL.fusion;
    ctx.lineWidth = 1.2;
    [-1, 1].forEach((side) => {
      const a = fusionPoly(side, 0);
      ctx.beginPath();
      a.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      ctx.stroke();
    });

    // Tepi pelat
    ctx.strokeStyle = COL.plateEdge;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(X(px0), Z(0)); ctx.lineTo(X(-w.capHalf), Z(0));
    ctx.moveTo(X(w.capHalf), Z(0)); ctx.lineTo(X(px1), Z(0));
    ctx.moveTo(X(px0), Z(T)); ctx.lineTo(X(scene.rootBead ? -w.rootHalf : -w.g), Z(T));
    ctx.moveTo(X(scene.rootBead ? w.rootHalf : w.g), Z(T)); ctx.lineTo(X(px1), Z(T));
    if (px0 === -w.P) { ctx.moveTo(X(-w.P), Z(0)); ctx.lineTo(X(-w.P), Z(T)); }
    if (px1 === w.P) { ctx.moveTo(X(w.P), Z(0)); ctx.lineTo(X(w.P), Z(T)); }
    ctx.stroke();

    // Sumbu las
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(40,50,60,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(0), Z(-w.capH * 2 - 3));
    ctx.lineTo(X(0), Z(T + 6));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sumbu las', X(0), Z(T + 7.5));

    // Skala mm di bawah pelat
    drawScale(ctx, v, X, Z, T);

    // --- Cacat
    if (state.showDefects) drawDefects(ctx, scene, X, Z, v);

    // --- Berkas & sinar
    const sp = o.spMaxTrue;
    if (state.showBeam) drawBeam(ctx, o, X, Z, sp);

    // Penanda skip di permukaan
    drawSkipMarks(ctx, o, X, Z);

    // Gate pada sinar (posisi menurut kalibrasi alat)
    if (o.gate) {
      ctx.strokeStyle = COL.gate;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.55;
      strokeRaySegment(ctx, o, X, Z, o.gate.start, o.gate.end);
      ctx.globalAlpha = 1;
    }

    // Penanda puncak gate & kursor A-scan
    if (o.peakSP != null) drawMarker(ctx, o, X, Z, o.peakSP, COL.peak, 'diamond');
    if (o.hoverSP != null) drawMarker(ctx, o, X, Z, o.hoverSP, COL.marker, 'cross');

    // --- Probe
    drawProbe(ctx, o, X, Z, v);

    ctx.restore();
  };

  function drawScale(ctx, v, X, Z, T) {
    const step = v.s > 6 ? 5 : v.s > 2.5 ? 10 : 20;
    const start = Math.ceil(v.x0 / step) * step;
    ctx.strokeStyle = 'rgba(60,70,80,0.5)';
    ctx.fillStyle = COL.muted;
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const zb = T + 3.5;
    for (let x = start; x <= v.x1; x += step) {
      const major = Math.round(x) % (step * 2) === 0;
      ctx.beginPath();
      ctx.moveTo(X(x), Z(zb));
      ctx.lineTo(X(x), Z(zb) + (major ? 6 : 3));
      ctx.stroke();
      if (major && Math.abs(x) > 1e-6) ctx.fillText(String(x), X(x), Z(zb) + 16);
    }
  }

  function drawDefects(ctx, scene, X, Z) {
    const sh = scene.shapes;
    if (sh.gap) {
      ctx.fillStyle = 'rgba(30,30,30,0.85)';
      ctx.beginPath();
      sh.gap.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      ctx.closePath();
      ctx.fill();
    }
    sh.polys.forEach((p) => {
      ctx.beginPath();
      p.pts.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Z(q[1])) : ctx.moveTo(X(q[0]), Z(q[1]))));
      if (p.closed) {
        ctx.closePath();
        ctx.fillStyle = COL.defectFill;
        ctx.fill();
        ctx.strokeStyle = COL.defect;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = COL.defect;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    });
    sh.circles.forEach((c) => {
      ctx.beginPath();
      ctx.arc(X(c.x), Z(c.z), Math.max(1.5, c.r * (X(1) - X(0))), 0, 2 * Math.PI);
      ctx.fillStyle = COL.defectFill;
      ctx.fill();
      ctx.strokeStyle = COL.defect;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // Titik pada sumbu berkas (unfolded) dengan offset tegak lurus 'off', dilipat ke dalam pelat
  function foldedPoint(o, sp, off) {
    const th = (o.state.angle * Math.PI) / 180;
    const sn = Math.sin(th), cs = Math.cos(th);
    const xu = sp * sn + off * cs; // arah horizontal (relatif dir)
    const zu = sp * cs - off * sn;
    const f = UT.foldDepth(Math.max(0, zu), o.weld.T);
    return { x: o.state.probeX + o.dir * xu, z: zu < 0 ? 0 : f.z };
  }

  function drawBeam(ctx, o, X, Z, spMax) {
    const pd = o.derived;
    const steps = Math.max(40, Math.ceil(spMax / 0.6));
    const h = spMax / steps;
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const a = i * h, b = (i + 1) * h;
      const wa = UT.beamHalfWidth(a, o.state.crystal, pd.gamma6);
      const wb = UT.beamHalfWidth(b, o.state.crystal, pd.gamma6);
      const p1 = foldedPoint(o, a, -wa), p2 = foldedPoint(o, b, -wb);
      const p3 = foldedPoint(o, b, wb), p4 = foldedPoint(o, a, wa);
      ctx.moveTo(X(p1.x), Z(p1.z));
      ctx.lineTo(X(p2.x), Z(p2.z));
      ctx.lineTo(X(p3.x), Z(p3.z));
      ctx.lineTo(X(p4.x), Z(p4.z));
      ctx.closePath();
    }
    ctx.fillStyle = COL.beam;
    ctx.fill('nonzero');

    ctx.strokeStyle = COL.ray;
    ctx.lineWidth = 1.5;
    strokeRaySegment(ctx, o, X, Z, 0, spMax);
  }

  function strokeRaySegment(ctx, o, X, Z, sp0, sp1) {
    const th = (o.state.angle * Math.PI) / 180;
    const T = o.weld.T;
    const cs = Math.cos(th);
    // titik-titik pecah di setiap pantulan
    const pts = [sp0];
    const legLen = T / cs;
    for (let k = Math.ceil(sp0 / legLen + 1e-9); k * legLen < sp1; k++) pts.push(k * legLen);
    pts.push(sp1);
    ctx.beginPath();
    pts.forEach((s, i) => {
      const p = UT.rayPoint(s, o.state.angle, T, o.state.probeX, o.dir);
      if (i === 0) ctx.moveTo(X(p.x), Z(p.z));
      else ctx.lineTo(X(p.x), Z(p.z));
    });
    ctx.stroke();
  }

  function drawSkipMarks(ctx, o, X, Z) {
    const T = o.weld.T;
    const hs = T * Math.tan((o.state.angle * Math.PI) / 180);
    const labels = ['½ skip', '1 skip', '1½ skip', '2 skip'];
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let k = 1; k <= 4; k++) {
      const x = o.state.probeX + o.dir * k * hs;
      if (Math.abs(x) > o.weld.P) break;
      const z = k % 2 ? T : 0;
      ctx.fillStyle = 'rgba(0,119,204,0.9)';
      ctx.beginPath();
      ctx.arc(X(x), Z(z), 2.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,90,160,0.9)';
      ctx.fillText(labels[k - 1], X(x), Z(z) - 6);
    }
  }

  function drawMarker(ctx, o, X, Z, spUser, color, kind) {
    const l = UT.locate(spUser, o.state.angle, o.weld.T, o.state.probeX, o.dir);
    const cx = X(l.x), cz = Z(l.depth);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (kind === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(cx, cz - 6); ctx.lineTo(cx + 6, cz); ctx.lineTo(cx, cz + 6); ctx.lineTo(cx - 6, cz);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cz, 5, 0, 2 * Math.PI);
      ctx.moveTo(cx - 9, cz); ctx.lineTo(cx + 9, cz);
      ctx.moveTo(cx, cz - 9); ctx.lineTo(cx, cz + 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawProbe(ctx, o, X, Z) {
    const wd = UT.CONFIG.wedge;
    const xp = o.state.probeX, d = o.dir;
    const xb = xp - d * wd.back, xf = xp + d * wd.front;
    const hf = wd.height * 0.55, hb = wd.height;
    ctx.save();
    // Badan wedge
    ctx.beginPath();
    ctx.moveTo(X(xb), Z(0));
    ctx.lineTo(X(xf), Z(0));
    ctx.lineTo(X(xf), Z(-hf));
    ctx.lineTo(X(xb), Z(-hb));
    ctx.closePath();
    ctx.fillStyle = 'rgba(80,120,170,0.35)';
    ctx.fill();
    ctx.strokeStyle = COL.probe;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Housing kristal (di bagian belakang atas, miring)
    const cx0 = xp - d * wd.back * 0.85, cx1 = xp - d * wd.back * 0.05;
    const zAt = (x) => -hb + ((-hf + hb) * (x - xb)) / (xf - xb);
    ctx.beginPath();
    ctx.moveTo(X(cx0), Z(zAt(cx0)));
    ctx.lineTo(X(cx1), Z(zAt(cx1)));
    ctx.lineTo(X(cx1), Z(zAt(cx1) - 5));
    ctx.lineTo(X(cx0), Z(zAt(cx0) - 5));
    ctx.closePath();
    ctx.fillStyle = COL.probe;
    ctx.fill();
    // Kabel
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const kx = (cx0 + cx1) / 2;
    ctx.moveTo(X(kx), Z(zAt(kx) - 5));
    ctx.quadraticCurveTo(X(kx - d * 2), Z(zAt(kx) - 9), X(kx - d * 12), Z(zAt(kx) - 8));
    ctx.stroke();
    // Exit point
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.moveTo(X(xp), Z(0));
    ctx.lineTo(X(xp) - 5, Z(0) - 8);
    ctx.lineTo(X(xp) + 5, Z(0) - 8);
    ctx.closePath();
    ctx.fill();
    // Label
    ctx.fillStyle = COL.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const ly = Z(-hb - 9) - 4;
    ctx.fillText(`${o.state.angle}° · ${o.state.freq} MHz`, X((xb + xf) / 2), ly - 14);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = COL.muted;
    ctx.fillText(`index: ${xp.toFixed(1)} mm`, X((xb + xf) / 2), ly);
    ctx.restore();
  }
})(typeof window !== 'undefined' ? window : globalThis);
