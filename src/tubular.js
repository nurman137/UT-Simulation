/*
 * Sambungan tubular T, Y, K, X (brace/cabang dilas ke chord/pipa utama).
 *
 * Geometri 3D: chord berporos x (jari-jari R), brace berporos a = (−cos θ, 0, sin θ) yang memotong
 * poros chord. Titik permukaan brace: c + s·a + r(cos φ·e1 + sin φ·e2), e1 = (sin θ, 0, cos θ), e2 = y.
 *   φ = 0   → heel (sisi tumpul, Ψ = 180° − θ)
 *   φ = 180 → toe  (sisi lancip, Ψ = θ)
 *   φ = 90/270 → sisi (saddle pada sambungan T)
 * Sudut dihedral lokal Ψ(φ) = 180° − sudut antara normal luar brace dan normal luar chord.
 *
 * Penampang lokal (bidang berisi garis permukaan brace dan normalnya) dipakai untuk simulasi UT
 * seperti di lapangan: probe di permukaan luar brace, berkas menuju las. Koordinat lokal (X, Z):
 * X searah poros brace menuju chord (las di X ≈ 0), Z = kedalaman dari permukaan luar brace.
 * Chord digambar lurus di penampang lokal (kelengkungan chord diabaikan secara lokal).
 * Fungsi murni (tanpa DOM) sehingga bisa diuji di Node.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  UT.TUB_TYPES = [
    { id: 'T', name: 'T (brace tegak lurus)' },
    { id: 'Y', name: 'Y (brace miring)' },
    { id: 'K', name: 'K (dua brace, ada gap)' },
    { id: 'X', name: 'X (brace di kedua sisi chord)' },
  ];

  /** Parameter sambungan dari state (dengan batas wajar). */
  UT.tubJoint = function (S) {
    const type = S.tubType || 'T';
    const R = (S.tubD || 323.9) / 2, Tc = S.tubTc || 16;
    const r = Math.min((S.tubd || 168.3) / 2, R * 0.95), tb = S.tubTb || 10;
    const theta = type === 'T' ? 90 : Math.max(30, Math.min(90, S.tubTheta || 60));
    return { type, R, Tc, r, tb, theta, gap: S.tubGap == null ? 25 : S.tubGap, beta: r / R };
  };

  // ------------------------------------------------------------------ geometri 3D
  const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

  /** Kerangka brace ke-k (k = 1 utama, 2 = brace kedua K/X). */
  UT.tubBrace = function (J, k) {
    const th = J.theta * DEG;
    if (k === 2 && J.type === 'X') {
      // brace di sisi bawah chord, segaris dengan brace utama (dicerminkan z → −z)
      return { c: [0, 0, 0], a: [-Math.cos(th), 0, -Math.sin(th)], e1: [Math.sin(th), 0, -Math.cos(th)], e2: [0, 1, 0], down: true };
    }
    if (k === 2 && J.type === 'K') {
      const xc = UT.tubKOffset(J);
      return { c: [xc, 0, 0], a: [Math.cos(th), 0, Math.sin(th)], e1: [-Math.sin(th), 0, Math.cos(th)], e2: [0, 1, 0] };
    }
    return { c: [0, 0, 0], a: [-Math.cos(th), 0, Math.sin(th)], e1: [Math.sin(th), 0, Math.cos(th)], e2: [0, 1, 0] };
  };

  /** Titik perpotongan brace dengan permukaan luar chord pada sudut φ (°). */
  UT.tubIntersect = function (J, phiDeg, B) {
    B = B || UT.tubBrace(J, 1);
    const ph = phiDeg * DEG, r = J.r, R = J.R;
    const y = r * Math.sin(ph);
    const zc = (B.down ? -1 : 1) * Math.sqrt(Math.max(0, R * R - y * y));
    const nb = add3(mul3(B.e1, Math.cos(ph)), mul3(B.e2, Math.sin(ph)));
    // c_z + s·a_z + r·nb_z = zc
    const s = (zc - B.c[2] - r * nb[2]) / B.a[2];
    const p = add3(add3(B.c, mul3(B.a, s)), mul3(nb, r));
    return { p, nb, s };
  };

  /** Sudut dihedral lokal Ψ (°) pada posisi φ di sekeliling brace utama. */
  UT.tubDihedral = function (J, phiDeg) {
    const q = UT.tubIntersect(J, phiDeg);
    const nc = [0, q.p[1] / J.R, q.p[2] / J.R];
    const d = q.nb[0] * nc[0] + q.nb[1] * nc[1] + q.nb[2] * nc[2];
    return 180 - Math.acos(Math.max(-1, Math.min(1, d))) / DEG;
  };

  /** Pergeseran poros brace kedua (K) agar gap antar kaki las di crown = J.gap. */
  UT.tubKOffset = function (J) {
    // kaki las brace 1 di heel (φ = 0, sisi +x) dan brace 2 (cermin) di sisi −x-nya
    const p1 = UT.tubIntersect(J, 0).p;
    return 2 * p1[0] + J.gap + 2 * UT.tubWeldWidth(J, 180 - J.theta);
  };

  /** Lebar kaki las kira-kira di permukaan chord (mm) untuk Ψ tertentu. */
  UT.tubWeldWidth = (J, psi) => Math.max(3, J.tb * (psi >= 90 ? 0.6 : 0.9));

  /** Zona menurut posisi φ. */
  UT.tubZone = function (J, phiDeg) {
    const p = ((phiDeg % 360) + 360) % 360;
    const d = Math.min(Math.abs(p - 180), 360 - Math.abs(p - 180)); // jarak sudut ke toe
    if (d < 45) return J.type === 'T' ? 'crown' : 'toe';
    if (d > 135) return J.type === 'T' ? 'crown' : 'heel';
    return 'sisi';
  };

  // ------------------------------------------------------------------ penampang lokal
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  /** Titik di dalam poligon cembung/sembarang (ray casting). */
  function inPoly(P, x, z) {
    let ins = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
    }
    return ins;
  }
  UT.inPoly = inPoly;

  /**
   * Penampang lokal pada φ: poligon brace, las, chord (dan brace kedua pada K di daerah heel).
   * Hasil: { psi, tb, Tc, O, Rt, Ae, Be, C, dc, nch, de, ne, regions:[{kind, poly}], zone, phi }
   */
  UT.tubSection = function (J, phiDeg) {
    const psi = UT.tubDihedral(J, phiDeg);
    const tb = J.tb, Tc = J.Tc, P = psi * DEG;
    const dc = [-Math.cos(P), -Math.sin(P)]; // arah permukaan luar chord dari O, ke luar (ke atas)
    const nch = [Math.sin(P), -Math.cos(P)]; // normal ke dalam material chord
    const O = [0, 0];
    const Rt = [tb / Math.tan(P), tb]; // akar di permukaan chord
    const gap = 2;
    const Ae = [Rt[0] - gap / Math.max(0.35, Math.sin(P)), tb];
    // muka bevel brace: alur ±45° terhadap permukaan chord, tetap mengarah ke atas
    const ac = Math.atan2(dc[1], dc[0]) / DEG;
    const G = Math.max(12, Math.min(45, 0.5 * psi)); // sudut alur: 45° untuk Ψ ≥ 90°, lebih sempit di toe lancip
    // bevel brace standar 45° terhadap normal dinding; dipersempit bila alur terhadap chord < G
    const ae = Math.max(-165, Math.min(-20, Math.min(-135, ac - G)));
    const de = [Math.cos(ae * DEG), Math.sin(ae * DEG)];
    const tUp = -tb / de[1];
    const Be = [Ae[0] + de[0] * tUp, 0];
    let ne = [-de[1], de[0]];
    if (dot(ne, nch) < 0) ne = [-ne[0], -ne[1]];
    const w = Math.min(Math.abs(Be[0]) * 0.7 + 2.5, tb * 0.9 + 2);
    const C = [O[0] + dc[0] * w, O[1] + dc[1] * w];
    const L = 70, Xmin = -260;
    const brace = [[Xmin, 0], Be, Ae, [Xmin, tb]];
    const weld = [Ae, Rt, C, Be];
    const P1 = [dc[0] * L, dc[1] * L], P2 = [-dc[0] * L, -dc[1] * L];
    const chord = [P1, P2, [P2[0] + nch[0] * Tc, P2[1] + nch[1] * Tc], [P1[0] + nch[0] * Tc, P1[1] + nch[1] * Tc]];
    const regions = [{ kind: 'brace', poly: brace }, { kind: 'weld', poly: weld }, { kind: 'chord', poly: chord }];
    // K: brace kedua muncul di seberang gap bila penampang berada di daerah heel (bidang crown)
    const phn = ((phiDeg % 360) + 360) % 360;
    if (J.type === 'K' && (phn < 25 || phn > 335)) {
      const ww = UT.tubWeldWidth(J, psi);
      const s0 = w + J.gap + ww; // jarak sepanjang permukaan chord dari O ke kaki brace 2
      const base = [dc[0] * s0, dc[1] * s0];
      // poros brace 2 = cermin poros brace utama (−X) terhadap normal chord
      const out = [-nch[0], -nch[1]];
      const v = [-1, 0], vn = dot(v, out);
      const dirB = [2 * vn * out[0] - v[0], 2 * vn * out[1] - v[1]];
      const side = [dc[0], dc[1]];
      const Lb = 60;
      const q0 = base, q1 = [base[0] + side[0] * tb, base[1] + side[1] * tb];
      const b2 = [q0, q1, [q1[0] + dirB[0] * Lb, q1[1] + dirB[1] * Lb], [q0[0] + dirB[0] * Lb, q0[1] + dirB[1] * Lb]];
      const wl = [[base[0] - side[0] * ww, base[1] - side[1] * ww], q0, [q0[0] + dirB[0] * ww * 0.8, q0[1] + dirB[1] * ww * 0.8]];
      regions.push({ kind: 'brace2', poly: b2 }, { kind: 'weld2', poly: wl });
    }
    return { psi, tb, Tc, O, Rt, Ae, Be, C, dc, nch, de, ne, regions, zone: UT.tubZone(J, phiDeg), phi: phiDeg };
  };

  /** Titik di dalam baja (salah satu daerah). */
  UT.tubInside = (sec, x, z) => sec.regions.some((r) => inPoly(r.poly, x, z));

  /**
   * Telusuri sinar di penampang lokal: lurus di dalam baja, memantul di permukaan bebas.
   * o: { x0, angle, spMax } – probe di permukaan luar brace (Z = 0), berkas menuju las (+X).
   */
  UT.traceTubular = function (sec, o) {
    const step = 0.25;
    let x = o.x0, z = 0.001, s = 0;
    let d = [Math.sin(o.angle * DEG), Math.cos(o.angle * DEG)];
    const pts = [{ x, z: 0, s: 0 }];
    let guard = 0;
    const regOf = (px, pz) => sec.regions.find((r) => inPoly(r.poly, px, pz));
    while (s < o.spMax && guard++ < 6000) {
      const nx = x + d[0] * step, nz = z + d[1] * step;
      if (UT.tubInside(sec, nx, nz)) { x = nx; z = nz; s += step; continue; }
      // keluar dari baja: cari batas dengan bisection, lalu pantulkan pada sisi poligon terdekat
      let lo = 0, hi = step;
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (UT.tubInside(sec, x + d[0] * m, z + d[1] * m)) lo = m; else hi = m; }
      const bx = x + d[0] * lo, bz = z + d[1] * lo;
      const reg = regOf(x, z) || sec.regions[0];
      let best = null;
      const P = reg.poly;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez;
        const t = Math.max(0, Math.min(1, ((bx - a[0]) * ex + (bz - a[1]) * ez) / L2));
        const dd = Math.hypot(a[0] + ex * t - bx, a[1] + ez * t - bz);
        if (!best || dd < best.dd) best = { dd, n: [-ez / Math.sqrt(L2), ex / Math.sqrt(L2)] };
      }
      s += lo;
      x = bx; z = bz;
      pts.push({ x, z, s });
      const dn = d[0] * best.n[0] + d[1] * best.n[1];
      d = [d[0] - 2 * dn * best.n[0], d[1] - 2 * dn * best.n[1]];
      // mundur sedikit ke dalam
      x += d[0] * 1e-3; z += d[1] * 1e-3;
    }
    pts.push({ x, z, s: Math.min(s, o.spMax) });
    return { pts };
  };

  // ------------------------------------------------------------------ cacat & reflektor
  UT.TUB_SCENARIOS = [
    { id: 'none', name: 'Tanpa cacat (hanya geometri)', desc: 'Las tubular sehat. Echo yang muncul berasal dari akar las, kaki las, dan bagian chord.' },
    { id: 'lof-brace', name: 'LOF sisi brace (daerah heel)', desc: 'Tidak menyatu pada muka bevel brace di daerah heel. Paling jelas bila berkas tegak lurus muka bevel (lihat sudut yang disarankan).' },
    { id: 'lof-chord', name: 'LOF sisi chord (daerah sisi)', desc: 'Tidak menyatu pada permukaan chord di daerah sisi/saddle. Bidangnya mengikuti permukaan chord sehingga orientasinya berubah menurut Ψ.' },
    { id: 'root', name: 'Akar tidak tertembus (daerah toe)', desc: 'Akar las tidak tertembus di daerah toe yang sempit (Ψ lancip): daerah tersulit untuk dilas dan diperiksa.' },
    { id: 'toe-crack', name: 'Retak kaki las sisi brace (hot spot)', desc: 'Retak lelah yang berawal di kaki las pada permukaan brace dan menjalar ke dinding brace; bersama permukaan luar brace membentuk corner trap (terlihat lewat leg 2). Retak di kaki las sisi chord sulit dijangkau berkas dari brace dan biasanya diperiksa dengan MT.' },
    { id: 'porositas', name: 'Porositas di logam las', desc: 'Kumpulan pori di logam las; echo lemah dan berpuncak banyak.' },
    { id: 'campuran', name: 'Campuran (LOF brace + retak kaki + porositas)', desc: 'Beberapa cacat di posisi keliling yang berbeda. Scan seluruh keliling brace dan catat posisi φ setiap indikasi.' },
  ];

  // Definisi cacat dalam besaran lokal; rentang φ (°, bisa melewati 0)
  const TUB_DEF = {
    'lof-brace': [{ kind: 'lofB', f0: 0.05, f1: 0.75, phi: [-30, 25] }],
    'lof-chord': [{ kind: 'lofC', f0: 0.1, f1: 0.8, phi: [75, 115] }],
    root: [{ kind: 'root', phi: [160, 205] }],
    'toe-crack': [{ kind: 'toeC', depth: 0.3, phi: [250, 285] }],
    porositas: [{ kind: 'poro', phi: [120, 140] }],
    campuran: [{ kind: 'lofB', f0: 0.1, f1: 0.6, phi: [-20, 15] }, { kind: 'toeC', depth: 0.25, phi: [80, 100] }, { kind: 'poro', phi: [200, 225] }],
  };

  /** Rentang φ → panjang busur di permukaan brace (y). Rentang melewati 0 dipetakan ke [y1 − keliling, y2]. */
  const phiToY = (J, a) => (a * DEG) * J.r;

  /**
   * Bangun pemandangan lokal pada φ: titik cacat (dengan y1/y2 sepanjang keliling), reflektor sudut
   * geometri, bentuk untuk digambar, dan kebenaran cacat.
   */
  UT.tubScene = function (J, sec, scenario, yProbe) {
    const points = [], corners = [], polys = [], circles = [], truth = [];
    const circ = 2 * Math.PI * J.r;
    // reflektor geometri: akar (sudut antara permukaan dalam brace dan chord) & kaki las
    corners.push({ x: sec.Rt[0], z: sec.Rt[1], s: 1.6, kind: 'akar', tx: sec.dc[0], tz: sec.dc[1], nrmx: sec.nch[0], nrmz: sec.nch[1] });
    corners.push({ x: sec.C[0], z: sec.C[1], s: 0.8, kind: 'kaki', tx: sec.dc[0], tz: sec.dc[1], nrmx: sec.nch[0], nrmz: sec.nch[1] });
    (TUB_DEF[scenario] || []).forEach((d) => {
      // rentang y relatif ke posisi probe (agar rentang yang melewati 0 tetap benar)
      let y1 = phiToY(J, d.phi[0]), y2 = phiToY(J, d.phi[1]);
      const yp = ((yProbe % circ) + circ) % circ;
      if (y1 < 0 && yp > circ / 2) { y1 += circ; y2 += circ; }
      const base = { y1, y2 };
      const pts = [];
      if (d.kind === 'lofB') {
        const a = lerp(sec.Ae, sec.Be, d.f0), b = lerp(sec.Ae, sec.Be, d.f1);
        pts.push(a, b);
        truth.push(Object.assign({ type: 'lof', where: 'brace' }, base));
      } else if (d.kind === 'lofC') {
        const a = lerp(sec.Rt, sec.C, d.f0), b = lerp(sec.Rt, sec.C, d.f1);
        pts.push(a, b);
        truth.push(Object.assign({ type: 'lof', where: 'chord' }, base));
      } else if (d.kind === 'root') {
        const a = lerp(sec.Ae, sec.Be, 0), b = lerp(sec.Ae, sec.Be, 0.3);
        pts.push(a, b);
        corners.push(Object.assign({ x: sec.Ae[0], z: sec.Ae[1], s: 2.2, kind: 'cacat', tx: 1, tz: 0, nrmx: 0, nrmz: 1 }, base));
        truth.push(Object.assign({ type: 'ip', where: 'akar' }, base));
      } else if (d.kind === 'toeC') {
        // retak di kaki las sisi brace: dari permukaan luar brace ke dalam dinding brace
        const L = J.tb * d.depth;
        const a = [sec.Be[0] - 0.5, 0], b = [sec.Be[0] - 0.5, L];
        pts.push(a, b);
        corners.push(Object.assign({ x: a[0], z: 0.3, s: 2.0, kind: 'cacat', tx: 1, tz: 0, nrmx: 0, nrmz: 1 }, base));
        truth.push(Object.assign({ type: 'retak', where: 'kaki las brace' }, base));
      } else if (d.kind === 'poro') {
        const cx = (sec.Ae[0] + sec.Rt[0] + sec.C[0] + sec.Be[0]) / 4, cz = (sec.Ae[1] + sec.Rt[1] + sec.C[1] + sec.Be[1]) / 4;
        const rnd = UT.rng(9090);
        for (let i = 0; i < 6; i++) {
          const x = cx + (rnd() - 0.5) * 3, z = cz + (rnd() - 0.5) * 3, rr = 0.4 + rnd() * 0.3;
          circles.push(Object.assign({ x, z, r: rr }, base));
          UT.sampleCircle(points, x, z, rr, Object.assign({ refl: 0.9 }, base));
        }
        truth.push(Object.assign({ type: 'porositas', where: 'las' }, base));
      }
      if (pts.length === 2) {
        polys.push(Object.assign({ pts, two: true }, base));
        UT.samplePolyline(points, pts, Object.assign({ two: true, refl: 1 }, base));
      }
    });
    return { points, corners, shapes: { polys, circles, gaps: [] }, truth, ipRanges: [], rootBead: false };
  };

  /** Benda uji sambungan tubular (penampang lokal dibangun per posisi φ di main.js). */
  UT.buildTubularSpec = function (S) {
    const J = UT.tubJoint(S);
    const rnd = UT.rng(31337);
    const C = UT.CONFIG;
    const x0 = -260, x1 = 60, z0 = -75, z1 = 75;
    const n = Math.round((x1 - x0) * (z1 - z0) * C.GRAIN_DENSITY * 0.5);
    const xs = new Float32Array(n), zs = new Float32Array(n), ws = new Float32Array(n);
    for (let i = 0; i < n; i++) { xs[i] = x0 + rnd() * (x1 - x0); zs[i] = z0 + rnd() * (z1 - z0); ws[i] = (rnd() * 2 - 1) * C.GRAIN_STRENGTH; }
    const tname = (UT.TUB_TYPES.find((t) => t.id === J.type) || UT.TUB_TYPES[0]).id;
    return {
      type: 'tubular', name: `Sambungan tubular ${tname}`, T: J.tb, xMin: -250, xMax: 40, yLen: 2 * Math.PI * J.r,
      J, R: J.r, OD: 2 * J.r, scenario: S.tubScenario || 'none', grainAll: { n, xs, zs, ws },
      scene: { points: [], corners: [], shapes: { polys: [], circles: [], gaps: [] }, truth: [], ipRanges: [], rootBead: false },
      marks: {}, holes: [],
    };
  };

  /** Penampang + pemandangan lokal + butir untuk posisi busur y (mm di permukaan brace). */
  UT.tubLocal = function (spec, y) {
    const J = spec.J, circ = 2 * Math.PI * J.r;
    const yy = ((y % circ) + circ) % circ;
    const phi = Math.round(((yy / J.r) / DEG) * 2) / 2;
    const sec = UT.tubSection(J, phi);
    const scene = UT.tubScene(J, sec, spec.scenario, yy);
    const ga = spec.grainAll, xs = [], zs = [], ws = [], inW = [];
    const weld = sec.regions.find((r) => r.kind === 'weld').poly;
    for (let i = 0; i < ga.n; i++) {
      const x = ga.xs[i], z = ga.zs[i];
      if (!UT.tubInside(sec, x, z)) continue;
      xs.push(x); zs.push(z); ws.push(ga.ws[i]); inW.push(UT.inPoly(weld, x, z) ? 1 : 0);
    }
    const grain = { n: xs.length, xs: Float32Array.from(xs), zs: Float32Array.from(zs), ws: Float32Array.from(ws), inWeld: Uint8Array.from(inW) };
    return { sec, scene, grain, weld, phi };
  };

  /** Sudut probe ideal (°): tegak lurus muka bevel brace lewat leg 2, dan tegak lurus permukaan chord lewat leg 1. */
  UT.tubIdealAngles = function (sec) {
    const ae = Math.atan2(sec.de[1], sec.de[0]) / DEG;
    const ac = Math.atan2(sec.dc[1], sec.dc[0]) / DEG;
    const leg2 = ae + 180; // berkas naik (setelah memantul di permukaan dalam brace)
    const leg1 = -ac; // berkas turun
    const norm = (a) => { let v = ((a % 180) + 180) % 180; if (v > 90) v = 180 - v; return v; };
    return { brace: norm(leg2), chord: norm(leg1) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
