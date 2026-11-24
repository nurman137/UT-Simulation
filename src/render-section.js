/*
 * Penggambaran tampilan scanning: penampang benda uji (las atau blok kalibrasi),
 * cacat, berkas, gate, dan probe.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

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
    text: '#26303a',
    muted: '#6b7785',
    marker: '#00a86b',
    peak: '#ff8c00',
    engrave: '#3a4652',
  };

  /** Posisi muka depan (xf) dan belakang (xb) wedge. */
  UT.probeExtent = function (probeX, dir, H) {
    const xf = probeX + dir * H.front;
    return { xf, xb: xf - dir * UT.PROBE_BODY };
  };

  /** Batas dunia (mm) yang perlu terlihat di tampilan scanning. */
  UT.viewExtent = function (spec, state, dir, H) {
    const wd = UT.CONFIG.wedge;
    const z0 = -(wd.height + 17), z1 = spec.T + 10;
    if (spec.type === 'par') {
      // Penampang memanjang: tampilkan probe dan ±1,5 skip ke arah berkas
      const skip = 2 * spec.T * Math.tan(state.angle * DEG);
      const e = UT.probeExtent(state.probeX, dir, H);
      const near = Math.min(e.xf, e.xb) - 10, far = Math.max(e.xf, e.xb) + 10;
      let x0 = dir > 0 ? near : state.probeX - 1.6 * skip - 15;
      let x1 = dir > 0 ? state.probeX + 1.6 * skip + 15 : far;
      x0 = Math.max(spec.xMin - 8, x0);
      x1 = Math.min(spec.xMax + 8, x1);
      return { x0, x1, z0, z1 };
    }
    if (spec.type !== 'las') {
      return { x0: spec.xMin - 8, x1: spec.xMax + 8, z0, z1 };
    }
    const w = spec.weld;
    if (state.technique === 'tofd') {
      const Sx = state.tofdS || UT.tofdDefaultS(w.T, UT.TOFD.angle);
      return { x0: -Sx - 34, x1: Sx + 34, z0, z1 };
    }
    const hs = w.T * Math.tan(state.angle * DEG);
    const skip = 2 * hs;
    const near = skip + UT.PROBE_BODY + 4;
    const far = Math.max(w.capHalf + 14, 0.45 * skip + 12);
    let x0 = dir > 0 ? -near : -far;
    let x1 = dir > 0 ? far : near;
    const e = UT.probeExtent(state.probeX, dir, H);
    x0 = Math.min(x0, Math.min(e.xf, e.xb) - 8);
    x1 = Math.max(x1, Math.max(e.xf, e.xb) + 8);
    return { x0, x1, z0, z1 };
  };

  /** Transformasi tampilan (skala x = skala z). */
  UT.computeView = function (cw, ch, ext) {
    const { x0, x1, z1 } = ext;
    let z0 = ext.z0;
    // sisakan ±38 px di atas probe untuk label, berapa pun skalanya
    const s0 = Math.min(cw / (x1 - x0), ch / (z1 - z0));
    z0 = Math.min(z0, -(UT.CONFIG.wedge.height + 9) - 38 / s0);
    const s = Math.min(cw / (x1 - x0), ch / (z1 - z0));
    const ox = (cw - (x1 - x0) * s) / 2 - x0 * s;
    const oz = (ch - (z1 - z0) * s) / 2 - z0 * s;
    return { s, ox, oz, x0: -ox / s, x1: (cw - ox) / s, z0: -oz / s, z1: (ch - oz) / s, cw, ch };
  };

  UT.viewToWorld = (v, px, py) => ({ x: (px - v.ox) / v.s, z: (py - v.oz) / v.s });

  /** Apakah probe masih terlihat dengan nyaman di view. */
  UT.probeInView = function (v, probeX, dir, H) {
    const e = UT.probeExtent(probeX, dir, H);
    return Math.min(e.xf, e.xb) > v.x0 + 4 && Math.max(e.xf, e.xb) < v.x1 - 4;
  };

  /**
   * o: { spec, state, dir, H, derived, spMaxTrue, gate:{start,end} (SP alat),
   *      peakSP, hoverSP (SP alat), userIndexX, angleUser, showTruth }
   */
  UT.drawSection = function (ctx, v, o) {
    const X = (x) => v.ox + x * v.s;
    const Z = (z) => v.oz + z * v.s;

    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, v.cw, v.ch);

    if (o.spec.type === 'las') drawWeld(ctx, v, o, X, Z);
    else drawBlock(ctx, v, o, X, Z);

    drawScale(ctx, v, X, Z, o.spec);

    if (o.state.showDefects && (o.spec.type === 'las' || o.spec.type === 'par')) drawDefects(ctx, o.spec.scene, X, Z, o.state.probeY);

    if (o.technique === 'tofd') {
      drawTofd(ctx, o, X, Z);
      ctx.restore();
      return;
    }
    if (o.technique === 'paut' && o.state.showBeam) drawFan(ctx, o, X, Z, o.spMaxTrue);
    if (o.state.showBeam) drawBeam(ctx, o, X, Z, o.spMaxTrue);
    drawSkipMarks(ctx, o, X, Z);

    // Gate pada sinar menurut kalibrasi alat
    if (o.gate) {
      ctx.strokeStyle = COL.gate;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.55;
      strokeUserRay(ctx, o, X, Z, Math.max(0, o.gate.start), Math.max(0, o.gate.end));
      ctx.globalAlpha = 1;
    }
    if (o.peakSP != null && o.peakSP > 0) drawMarker(ctx, o, X, Z, o.peakSP, COL.peak, 'diamond');
    if (o.hoverSP != null && o.hoverSP > 0) drawMarker(ctx, o, X, Z, o.hoverSP, COL.marker, 'cross');

    drawProbe(ctx, o, X, Z);
    ctx.restore();
  };

  // ------------------------------------------------------------------ benda uji
  /** Apakah posisi y berada di dalam salah satu rentang. */
  const inRanges = (y, rs) => (rs || []).some((r) => y >= r.y1 && y <= r.y2);

  function drawWeld(ctx, v, o, X, Z) {
    const spec = o.spec, w = spec.weld, scene = spec.scene, T = w.T;
    const bead = scene.rootBead && !inRanges(o.state.probeY, scene.ipRanges);
    const px0 = Math.max(spec.xMin, v.x0 - 5), px1 = Math.min(spec.xMax, v.x1 + 5);
    ctx.fillStyle = COL.plate;
    ctx.fillRect(X(px0), Z(0), X(px1) - X(px0), Z(T) - Z(0));

    const fusionPoly = (side, off) => UT.fusionProfile(w, side, off);
    ctx.fillStyle = COL.haz;
    [-1, 1].forEach((side) => {
      const a = fusionPoly(side, 0), b = fusionPoly(side, 2.2);
      ctx.beginPath();
      a.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      b.slice().reverse().forEach((p) => ctx.lineTo(X(p[0]), Z(p[1])));
      ctx.closePath();
      ctx.fill();
    });

    // Logam las: cap → profil fusi kanan (turun) → root bead / cap sisi kedua → profil fusi kiri (naik)
    ctx.beginPath();
    ctx.moveTo(X(-w.capHalf), Z(0));
    if (w.capH > 0) ctx.quadraticCurveTo(X(0), Z(-2 * w.capH), X(w.capHalf), Z(0));
    else ctx.lineTo(X(w.topHalf), Z(0));
    fusionPoly(1, 0).forEach((p) => ctx.lineTo(X(p[0]), Z(p[1])));
    if (bead) {
      ctx.lineTo(X(w.rootHalf), Z(T));
      ctx.quadraticCurveTo(X(0), Z(T + 2 * w.rootH), X(-w.rootHalf), Z(T));
    }
    fusionPoly(-1, 0).reverse().forEach((p) => ctx.lineTo(X(p[0]), Z(p[1])));
    ctx.closePath();
    ctx.fillStyle = COL.weld;
    ctx.fill();

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

    ctx.strokeStyle = COL.fusion;
    ctx.lineWidth = 1.2;
    [-1, 1].forEach((side) => {
      const a = fusionPoly(side, 0);
      ctx.beginPath();
      a.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      ctx.stroke();
    });

    ctx.strokeStyle = COL.plateEdge;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(X(px0), Z(0)); ctx.lineTo(X(-w.capHalf), Z(0));
    ctx.moveTo(X(w.capHalf), Z(0)); ctx.lineTo(X(px1), Z(0));
    ctx.moveTo(X(px0), Z(T)); ctx.lineTo(X(bead ? -w.rootHalf : -w.botHalf), Z(T));
    ctx.moveTo(X(bead ? w.rootHalf : w.botHalf), Z(T)); ctx.lineTo(X(px1), Z(T));
    if (px0 === spec.xMin) { ctx.moveTo(X(px0), Z(0)); ctx.lineTo(X(px0), Z(T)); }
    if (px1 === spec.xMax) { ctx.moveTo(X(px1), Z(0)); ctx.lineTo(X(px1), Z(T)); }
    ctx.stroke();

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
  }

  function drawBlock(ctx, v, o, X, Z) {
    const spec = o.spec;
    ctx.beginPath();
    spec.outline.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
    ctx.closePath();
    // Penampang memanjang: berwarna logam las bila probe berada di atas las
    const onWeld = spec.type === 'par' && Math.abs(o.state.probeY) < spec.weld.topHalf;
    ctx.fillStyle = onWeld ? COL.weld : COL.plate;
    ctx.fill();
    if (spec.type === 'par') {
      ctx.save();
      ctx.fillStyle = COL.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const lat = o.state.probeY;
      ctx.fillText(`Penampang memanjang las di x = ${lat >= 0 ? '+' : '−'}${Math.abs(lat).toFixed(1)} mm (${onWeld ? 'logam las' : 'logam induk, di samping las'})`, 8, 14);
      ctx.restore();
    }
    ctx.strokeStyle = COL.plateEdge;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Lubang
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    (spec.holes || []).forEach((h) => {
      ctx.beginPath();
      ctx.arc(X(h.x), Z(h.z), Math.max(2, h.r * v.s), 0, 2 * Math.PI);
      ctx.fillStyle = '#f7f9fb';
      ctx.fill();
      ctx.strokeStyle = COL.plateEdge;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = COL.engrave;
      const pr = Math.max(2, h.r * v.s);
      // lubang dekat permukaan: label di bawah lubang agar tidak bertumpuk dengan tanda di permukaan
      const ly = h.r * v.s > 14 ? Z(h.z) + 4 : (Z(h.z) - pr - Z(0) < 28 ? Z(h.z) + pr + 12 : Z(h.z) - pr - 5);
      ctx.fillText(h.label, X(h.x), ly);
    });

    const m = spec.marks || {};
    ctx.strokeStyle = COL.engrave;
    ctx.fillStyle = COL.engrave;
    ctx.lineWidth = 1;
    // Tanda titik pusat (R100 pada V1, R25/R50 pada V2)
    if (m.centerX != null) {
      const cx = X(m.centerX), cy = Z(0);
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx - 4, cy + 7); ctx.lineTo(cx + 4, cy + 7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 14); ctx.stroke();
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.centerLabel, cx, cy + 34);
    }
    [m.arcLabel, m.arcLabel2].forEach((l) => {
      if (!l) return;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(l.text, X(l.x), Z(l.z));
    });
    // Skala sudut terhadap lubang: tanda θ di x = x_lubang + d·tan θ
    if (m.scale) {
      const sc = m.scale;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let a = sc.from; a <= sc.to; a += sc.minorStep || 1) {
        const x = sc.hx + (sc.sign || 1) * sc.hz * Math.tan(a * DEG);
        if (x < spec.xMin || x > spec.xMax) continue;
        const lab = sc.labels.includes(a);
        ctx.beginPath();
        ctx.moveTo(X(x), Z(0));
        ctx.lineTo(X(x), Z(0) + (lab ? 9 : a % 5 === 0 ? 6 : 3.5));
        ctx.stroke();
        if (lab) ctx.fillText(`${a}°`, X(x), Z(0) + 20);
      }
    }
    // Tanda sudut pada busur (V2: sudut berkas dari titik pusat ke busur R50)
    if (m.arcTicks) {
      const t = m.arcTicks;
      ctx.font = '10px system-ui, sans-serif';
      for (let a = t.from; a <= t.to; a += 5) {
        const r = a * DEG, sx = Math.sin(r), cz = Math.cos(r);
        const x1 = t.cx + t.R * sx, z1 = t.R * cz;
        const x0 = t.cx + (t.R - (t.labels.includes(a) ? 3.5 : 2)) * sx, z0 = (t.R - (t.labels.includes(a) ? 3.5 : 2)) * cz;
        ctx.beginPath(); ctx.moveTo(X(x0), Z(z0)); ctx.lineTo(X(x1), Z(z1)); ctx.stroke();
        if (t.labels.includes(a)) {
          ctx.textAlign = 'right';
          ctx.fillText(`${a}°`, X(t.cx + (t.R - 5) * sx), Z((t.R - 5) * cz) + 3);
        }
      }
    }
    // Penggaris mm pada permukaan (V1 sisi B, angka dalam cm seperti pada blok)
    if (m.ruler) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let x = m.ruler.x0; x <= m.ruler.x1; x += 5) {
        const major = x % 50 === 0;
        ctx.beginPath(); ctx.moveTo(X(x), Z(0)); ctx.lineTo(X(x), Z(0) + (major ? 8 : x % 10 === 0 ? 5 : 3)); ctx.stroke();
        if (major && x > 0) ctx.fillText(String(x / 10), X(x), Z(0) + 32);
      }
    }
  }

  function drawScale(ctx, v, X, Z, spec) {
    const step = v.s > 6 ? 5 : v.s > 2.5 ? 10 : 20;
    const start = Math.ceil(Math.max(v.x0, spec.xMin) / step) * step;
    const end = Math.min(v.x1, spec.xMax);
    ctx.strokeStyle = 'rgba(60,70,80,0.5)';
    ctx.fillStyle = COL.muted;
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const zb = spec.T + 3.5;
    for (let x = start; x <= end; x += step) {
      const major = Math.round(x) % (step * 2) === 0;
      ctx.beginPath();
      ctx.moveTo(X(x), Z(zb));
      ctx.lineTo(X(x), Z(zb) + (major ? 6 : 3));
      ctx.stroke();
      if (major && !(spec.type === 'las' && Math.abs(x) < 1e-6)) ctx.fillText(String(x), X(x), Z(zb) + 16);
    }
  }

  // Cacat di bawah probe (±10 mm searah las) digambar tegas, yang lain samar.
  function drawDefects(ctx, scene, X, Z, yProbe) {
    const sh = scene.shapes;
    const alphaFor = (y1, y2) => (y1 == null || (y2 >= yProbe - 10 && y1 <= yProbe + 10) ? 1 : 0.22);
    ctx.save();
    (sh.gaps || []).forEach((gp) => {
      ctx.globalAlpha = alphaFor(gp.y1, gp.y2);
      ctx.fillStyle = 'rgba(30,30,30,0.85)';
      ctx.beginPath();
      gp.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      ctx.closePath();
      ctx.fill();
    });
    sh.polys.forEach((p) => {
      ctx.globalAlpha = alphaFor(p.y1, p.y2);
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
      ctx.globalAlpha = alphaFor(c.y1, c.y2);
      ctx.beginPath();
      ctx.arc(X(c.x), Z(c.z), Math.max(1.5, c.r * (X(1) - X(0))), 0, 2 * Math.PI);
      ctx.fillStyle = COL.defectFill;
      ctx.fill();
      ctx.strokeStyle = COL.defect;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.restore();
  }

  // ------------------------------------------------------------------ berkas
  // Titik pada berkas sebenarnya (sudut & exit point sebenarnya), offset tegak lurus 'off'
  function foldedPoint(o, sp, off) {
    const th = o.H.angle * DEG;
    const sn = Math.sin(th), cs = Math.cos(th);
    const xu = sp * sn + off * cs;
    const zu = sp * cs - off * sn;
    const f = UT.foldDepth(Math.max(0, zu), o.spec.T);
    return { x: o.state.probeX + o.dir * xu, z: zu < 0 ? 0 : f.z };
  }

  function drawBeam(ctx, o, X, Z, spMax) {
    const pd = o.derived;
    spMax = Math.max(1, spMax);
    const steps = Math.max(40, Math.ceil(spMax / 0.6));
    const h = spMax / steps;
    ctx.save();
    if (o.spec.outline) {
      ctx.beginPath();
      o.spec.outline.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      ctx.closePath();
      ctx.clip();
    }
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const a = i * h, b = (i + 1) * h;
      const wa = UT.beamHalfWidth(a, o.crystal || o.state.crystal, pd.gamma6);
      const wb = UT.beamHalfWidth(b, o.crystal || o.state.crystal, pd.gamma6);
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
    strokeRay(ctx, X, Z, o.spec.T, o.H.angle, o.state.probeX, o.dir, 0, spMax);
    ctx.restore();
  }

  function strokeRay(ctx, X, Z, T, angle, x0, dir, sp0, sp1) {
    const cs = Math.cos(angle * DEG);
    const pts = [sp0];
    const legLen = T / cs;
    for (let k = Math.ceil(sp0 / legLen + 1e-9); k * legLen < sp1; k++) pts.push(k * legLen);
    pts.push(sp1);
    ctx.beginPath();
    pts.forEach((s, i) => {
      const p = UT.rayPoint(s, angle, T, x0, dir);
      if (i === 0) ctx.moveTo(X(p.x), Z(p.z));
      else ctx.lineTo(X(p.x), Z(p.z));
    });
    ctx.stroke();
  }

  // Segmen sinar menurut kalibrasi alat (tanda index & sudut terukur)
  function strokeUserRay(ctx, o, X, Z, sp0, sp1) {
    if (sp1 <= sp0) return;
    strokeRay(ctx, X, Z, o.spec.T, o.angleUser, o.userIndexX, o.dir, sp0, sp1);
  }

  function drawSkipMarks(ctx, o, X, Z) {
    if (o.spec.type !== 'las' && o.spec.T > 60) return;
    const T = o.spec.T;
    const hs = T * Math.tan(o.H.angle * DEG);
    const labels = ['½ skip', '1 skip', '1½ skip', '2 skip'];
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let k = 1; k <= 4; k++) {
      const x = o.state.probeX + o.dir * k * hs;
      if (x < o.spec.xMin || x > o.spec.xMax) break;
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
    const l = UT.locate(spUser, o.angleUser, o.spec.T, o.userIndexX, o.dir);
    const cx = X(l.x), cz = Z(l.depth);
    ctx.save();
    ctx.strokeStyle = color;
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

  // ------------------------------------------------------------------ Phased Array: kipas sektor
  function drawFan(ctx, o, X, Z, spMax) {
    const [a0, a1] = o.pautAngles;
    ctx.save();
    ctx.strokeStyle = 'rgba(123,44,191,0.28)';
    ctx.lineWidth = 1;
    for (let a = a0; a <= a1; a += 5) {
      strokeRay(ctx, X, Z, o.spec.T, a, o.state.probeX, o.dir, 0, spMax);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ TOFD: pemancar & penerima
  function drawTofd(ctx, o, X, Z) {
    const T = o.spec.T, Sx = o.tofd.S, th = o.tofd.angle * DEG;
    const wd = UT.CONFIG.wedge;
    const gam = 14 * DEG; // sebaran berkas lebar khas probe TOFD (tampilan)
    ctx.save();
    // kerucut berkas
    [[-Sx, 1], [Sx, -1]].forEach(([x0, d]) => {
      ctx.beginPath();
      ctx.moveTo(X(x0), Z(0));
      [th - gam, th + gam].forEach((a, i) => {
        const L = T / Math.cos(a);
        const xe = x0 + d * L * Math.sin(a);
        if (i === 0) ctx.lineTo(X(xe), Z(T)); else ctx.lineTo(X(xe), Z(T));
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,150,255,0.14)';
      ctx.fill();
      ctx.strokeStyle = '#0077cc';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(X(x0), Z(0));
      ctx.lineTo(X(x0 + d * T * Math.tan(th)), Z(T));
      ctx.stroke();
    });
    // lintasan gelombang lateral dan back wall
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(0,119,204,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(-Sx), Z(0.6)); ctx.lineTo(X(Sx), Z(0.6));
    ctx.moveTo(X(-Sx), Z(0)); ctx.lineTo(X(0), Z(T)); ctx.lineTo(X(Sx), Z(0));
    ctx.stroke();
    ctx.setLineDash([]);
    // kedalaman kursor
    if (o.tofd.hoverDepth != null && o.tofd.hoverDepth <= T) {
      const d = o.tofd.hoverDepth;
      ctx.strokeStyle = COL.marker;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(X(-Sx), Z(0)); ctx.lineTo(X(0), Z(d)); ctx.lineTo(X(Sx), Z(0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(X(0), Z(d), 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    // probe
    [[-Sx, 1, 'Tx'], [Sx, -1, 'Rx']].forEach(([x0, d, lab]) => {
      const xf = x0 + d * 8, xb = x0 - d * 22, hf = wd.height * 0.55, hb = wd.height;
      ctx.beginPath();
      ctx.moveTo(X(xb), Z(0)); ctx.lineTo(X(xf), Z(0)); ctx.lineTo(X(xf), Z(-hf)); ctx.lineTo(X(xb), Z(-hb));
      ctx.closePath();
      ctx.fillStyle = 'rgba(80,120,170,0.35)';
      ctx.fill();
      ctx.strokeStyle = COL.probe;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.moveTo(X(x0), Z(0)); ctx.lineTo(X(x0) - 5, Z(0) - 8); ctx.lineTo(X(x0) + 5, Z(0) - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.text;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lab, X((xf + xb) / 2), Z(-hb) - 8);
    });
    ctx.fillStyle = COL.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`PCS ${(2 * Sx).toFixed(1)} mm · L-wave ${o.tofd.angle}°`, X(0), Z(-wd.height) - 26);
    ctx.restore();
  }

  // ------------------------------------------------------------------ probe
  function drawProbe(ctx, o, X, Z) {
    const wd = UT.CONFIG.wedge;
    const d = o.dir;
    const { xf, xb } = UT.probeExtent(o.state.probeX, d, o.H);
    const hf = wd.height * 0.55, hb = wd.height;
    ctx.save();
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

    const zAt = (x) => -hb + ((-hf + hb) * (x - xb)) / (xf - xb);
    const cx0 = xb + d * UT.PROBE_BODY * 0.08, cx1 = xb + d * UT.PROBE_BODY * 0.62;
    ctx.beginPath();
    ctx.moveTo(X(cx0), Z(zAt(cx0)));
    ctx.lineTo(X(cx1), Z(zAt(cx1)));
    ctx.lineTo(X(cx1), Z(zAt(cx1) - 5));
    ctx.lineTo(X(cx0), Z(zAt(cx0) - 5));
    ctx.closePath();
    ctx.fillStyle = COL.probe;
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const kx = (cx0 + cx1) / 2;
    ctx.moveTo(X(kx), Z(zAt(kx) - 5));
    ctx.quadraticCurveTo(X(kx - d * 2), Z(zAt(kx) - 9), X(kx - d * 12), Z(zAt(kx) - 8));
    ctx.stroke();

    // Tanda index (menurut X-value yang dimasukkan teknisi)
    const ix = X(o.userIndexX);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ix, Z(0) - 1);
    ctx.lineTo(ix, Z(-hf * 0.7));
    ctx.stroke();
    // Exit point sebenarnya (hanya mode guru)
    if (o.showTruth) {
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.moveTo(X(o.state.probeX), Z(0));
      ctx.lineTo(X(o.state.probeX) - 5, Z(0) - 8);
      ctx.lineTo(X(o.state.probeX) + 5, Z(0) - 8);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = COL.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const ly = Z(-hb - 9) - 4;
    ctx.fillText(`${o.state.angle}° · ${o.state.freq} MHz`, X((xb + xf) / 2), ly - 14);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = COL.muted;
    ctx.fillText(`index: ${o.userIndexX.toFixed(1)} mm`, X((xb + xf) / 2), ly);
    ctx.restore();
  }
})(typeof window !== 'undefined' ? window : globalThis);
