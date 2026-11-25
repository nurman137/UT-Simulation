/*
 * Gambar sambungan tubular: tampilan 3D sederhana (proyeksi miring) dan penampang lokal.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  const COL = {
    bg: '#eef1f4', steel: '#c9d1d9', steel2: '#bcc6d0', edge: '#5c6773', weld: '#b8a98f', fusion: '#7a5c2e',
    text: '#26303a', muted: '#6b7785', line: 'rgba(60,72,86,0.55)', faint: 'rgba(60,72,86,0.18)',
    seam: '#8a5a1e', probe: '#0077cc', cur: '#d62828', defect: 'rgba(214,40,40,0.85)',
  };

  /** Proyeksi miring: putar (yaw) di sekitar sumbu z lalu condongkan (pitch). */
  function projector(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return (p) => {
      const u = p[0] * cy + p[1] * sy;
      const dpt = -p[0] * sy + p[1] * cy;
      const w = p[2] * cp - dpt * sp;
      return [u, w, dpt];
    };
  }

  /**
   * Tampilan 3D. o: { J, phi (°), probeDist (mm sepanjang brace dari kaki las), truth: [{y1,y2}] (busur), showTruth }
   * Mengembalikan daftar titik layar perpotongan [{phi, x, y}] untuk memilih posisi dengan klik.
   */
  UT.drawTubular3D = function (ctx, cw, ch, o) {
    const J = o.J, proj = projector(-32 * DEG, 22 * DEG);
    const segs = []; // [{pts:[[x,y,z]...], style}]
    const Lc = J.R * 2.6 + (J.type === 'K' ? Math.abs(UT.tubKOffset(J)) / 2 : 0);
    const xm = J.type === 'K' ? UT.tubKOffset(J) / 2 : 0;
    // chord: cincin di ujung & garis memanjang
    const ring = (x) => { const pts = []; for (let a = 0; a <= 360; a += 10) pts.push([x, J.R * Math.cos(a * DEG), J.R * Math.sin(a * DEG)]); return pts; };
    segs.push({ pts: ring(xm - Lc), st: 'line' }, { pts: ring(xm + Lc), st: 'line' });
    for (let a = 0; a < 360; a += 30) segs.push({ pts: [[xm - Lc, J.R * Math.cos(a * DEG), J.R * Math.sin(a * DEG)], [xm + Lc, J.R * Math.cos(a * DEG), J.R * Math.sin(a * DEG)]], st: 'faint' });
    const braces = [UT.tubBrace(J, 1)];
    if (J.type === 'K' || J.type === 'X') braces.push(UT.tubBrace(J, 2));
    const Lb = J.R * 2.3;
    braces.forEach((B, bi) => {
      const top = [], inter = [];
      for (let p = 0; p <= 360; p += 6) {
        const q = UT.tubIntersect(J, p, B);
        inter.push(q.p);
        top.push([q.p[0] + B.a[0] * (Lb - q.s), q.p[1] + B.a[1] * (Lb - q.s), q.p[2] + B.a[2] * (Lb - q.s)]);
      }
      segs.push({ pts: top, st: 'line' }, { pts: inter, st: bi === 0 ? 'seam' : 'seam2' });
      for (let p = 0; p < 360; p += 30) {
        const q = UT.tubIntersect(J, p, B);
        segs.push({ pts: [q.p, [q.p[0] + B.a[0] * (Lb - q.s), q.p[1] + B.a[1] * (Lb - q.s), q.p[2] + B.a[2] * (Lb - q.s)]], st: 'faint' });
      }
    });
    // skala agar muat
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    segs.forEach((s) => s.pts.forEach((p) => { const q = proj(p); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }));
    const pad = 16, sc = Math.min((cw - 2 * pad) / (x1 - x0), (ch - 2 * pad) / (y1 - y0));
    const ox = pad + ((cw - 2 * pad) - (x1 - x0) * sc) / 2 - x0 * sc;
    const oy = pad + ((ch - 2 * pad) - (y1 - y0) * sc) / 2 + y1 * sc;
    const S2 = (p) => { const q = proj(p); return [ox + q[0] * sc, oy - q[1] * sc]; };

    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, cw, ch);
    const style = { line: [COL.line, 1.2], faint: [COL.faint, 1], seam: [COL.seam, 2.4], seam2: ['rgba(138,90,30,0.6)', 2] };
    segs.forEach((s) => {
      ctx.strokeStyle = style[s.st][0];
      ctx.lineWidth = style[s.st][1];
      ctx.beginPath();
      s.pts.forEach((p, i) => { const q = S2(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
    });
    // cacat sebenarnya sepanjang kaki las (mode guru)
    const circ = 2 * Math.PI * J.r;
    if (o.showTruth) {
      ctx.strokeStyle = COL.defect;
      ctx.lineWidth = 5;
      (o.truth || []).forEach((t) => {
        const a0 = (t.y1 / J.r) / DEG, a1 = (t.y2 / J.r) / DEG;
        ctx.beginPath();
        for (let a = a0; a <= a1 + 1e-9; a += 2) { const q = S2(UT.tubIntersect(J, a).p); if (a === a0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
        ctx.stroke();
      });
    }
    // label zona
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = COL.text;
    ctx.textAlign = 'center';
    const lab = J.type === 'T' ? [[0, 'crown'], [90, 'saddle'], [180, 'crown'], [270, 'saddle']] : [[0, 'heel'], [90, 'sisi'], [180, 'toe'], [270, 'sisi']];
    lab.forEach(([p, t]) => {
      const q = S2(UT.tubIntersect(J, p).p);
      ctx.fillText(`${t} ${p}°`, q[0], q[1] + (p === 90 ? 16 : p === 270 ? -9 : 14));
    });
    // posisi saat ini + probe
    const qc = UT.tubIntersect(J, o.phi);
    const B = UT.tubBrace(J, 1);
    const pc = S2(qc.p);
    const pp = S2([qc.p[0] + B.a[0] * o.probeDist, qc.p[1] + B.a[1] * o.probeDist, qc.p[2] + B.a[2] * o.probeDist]);
    ctx.strokeStyle = COL.probe;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pp[0], pp[1]); ctx.lineTo(pc[0], pc[1]); ctx.stroke();
    ctx.fillStyle = COL.probe;
    ctx.fillRect(pp[0] - 6, pp[1] - 4, 12, 8);
    ctx.fillStyle = COL.cur;
    ctx.beginPath(); ctx.arc(pc[0], pc[1], 4.5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = COL.muted;
    ctx.textAlign = 'left';
    ctx.fillText(`Sambungan ${J.type} · chord Ø${(2 * J.R).toFixed(0)} × ${J.Tc} · brace Ø${(2 * J.r).toFixed(0)} × ${J.tb} · β = ${J.beta.toFixed(2)}${J.type === 'T' ? '' : ` · θ = ${J.theta}°`}`, 8, 14);
    ctx.restore();
    // titik perpotongan untuk pemilihan dengan klik
    const pick = [];
    for (let p = 0; p < 360; p += 2) { const q = S2(UT.tubIntersect(J, p).p); pick.push({ phi: p, x: q[0], y: q[1] }); }
    void circ;
    return pick;
  };

  /** Penampang lokal sambungan tubular (dipanggil dari drawSection). */
  UT.drawTubularSection = function (ctx, v, o, X, Z) {
    const sec = o.spec.sec;
    const fill = { brace: COL.steel, chord: COL.steel2, weld: COL.weld, brace2: COL.steel, weld2: COL.weld };
    ['chord', 'brace', 'brace2', 'weld', 'weld2'].forEach((k) => {
      sec.regions.filter((r) => r.kind === k).forEach((r) => {
        ctx.beginPath();
        r.poly.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
        ctx.closePath();
        ctx.fillStyle = fill[k];
        ctx.fill();
        ctx.strokeStyle = k.startsWith('weld') ? COL.fusion : COL.edge;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    });
    ctx.save();
    ctx.fillStyle = COL.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const zone = { toe: 'toe', heel: 'heel', sisi: 'sisi', crown: 'crown' }[sec.zone] || sec.zone;
    ctx.fillText(`Penampang lokal di φ = ${sec.phi.toFixed(0)}° · zona ${zone} · sudut dihedral Ψ = ${sec.psi.toFixed(0)}°`, 8, 14);
    ctx.textAlign = 'center';
    ctx.fillText('brace', X(-60), Z(sec.tb / 2) + 4);
    const cl = [sec.O[0] + sec.dc[0] * 40 + sec.nch[0] * sec.Tc / 2, sec.O[1] + sec.dc[1] * 40 + sec.nch[1] * sec.Tc / 2];
    ctx.fillText('chord', X(cl[0]), Z(cl[1]) + 4);
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
