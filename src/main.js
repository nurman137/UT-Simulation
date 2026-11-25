/*
 * Penghubung UI: state aplikasi, kontrol, interaksi probe, kalibrasi, DAC, sizing, dan loop render.
 */
(function () {
  'use strict';
  const UT = window.UT;
  const C = UT.CONFIG;
  const $ = (id) => document.getElementById(id);
  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------- state
  const S = Object.assign({}, C.defaults, {
    probeX: null, indType: 'lain', showDac: true, xValue: 0, angleUser: 0, zero: 0,
  });
  let H = UT.makeProbeTruth(S.angle, null); // kebenaran probe (tersembunyi)
  let training = false; // true = probe latihan dengan galat acak
  const rand = UT.rng((Date.now() & 0xffffff) ^ 0x5eed);
  let dac = UT.dacCreate();
  let dacMsg = '';
  const sizing = { y1: null, y2: null, d1: null, d2: null };
  // Kunci kontrol saat ujian: truth = mode guru, scenario = skenario & tebal, autoCal = isi nilai sebenarnya
  const locks = { truth: false, scenario: false, autoCal: false };
  const frameHooks = [];
  let lastPct = null;
  // v0.4: teknik pencitraan
  let specVersion = 0;
  let img = null; // UT.ProgressiveScan aktif (B-scan / S-scan / D-scan)
  let imgKey = '';
  let imgDrawKey = '';
  const gainMem = { ut: null, paut: null, tofd: null };
  const tofd = { mA: null, mB: null, hoverT: null, nextMark: 'mA' };
  const isTech = (t) => S.technique === t;
  const tcgActive = () => !!S.tcg && dac.points.length > 0 && !isTech('tofd');

  let spec, view = null, sim = null, derived = null, simDirty = true;
  let hoverSP = null, lastPeak = null;
  const cvS = $('cvSection'), cvA = $('cvAscan'), cvT = $('cvTop'), cvI = $('cvImg');
  const ctxS = cvS.getContext('2d'), ctxA = cvA.getContext('2d'), ctxT = cvT.getContext('2d'), ctxI = cvI.getContext('2d');
  let szA = { w: 0, h: 0 }, szI = { w: 0, h: 0 }, topLay = null, topView = null;
  let lastAx = { delay: 0, range: 1 };
  let cov = null, covKey = '';

  const dir = () => (S.side === 'kiri' ? 1 : -1);
  const isWeld = () => spec && spec.type === 'las';
  // Scan sejajar las: penampang memanjang; S.probeX = posisi sepanjang las, S.probeY = posisi lateral
  const isPar = () => S.orient === 'sejajar' && isWeld() && !spec.isPipe;
  const aspec = () => (isPar() ? UT.parallelSpec(spec) : spec && spec.type === 'tubular' ? Object.assign({}, spec, { sec: tubLocal().sec, scene: tubLocal().scene }) : spec);
  const NO_COUPLING = { gain: 1, yScale: 1, lossDb: 0, gap: 0 };
  const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '–' : v.toFixed(d));

  function applyUserFromTruth() {
    S.xValue = H.front;
    S.angleUser = H.angle;
    S.zero = Math.round(H.zero * 100) / 100;
    S.velocity = trueV();
  }
  function applyUserNominal() {
    S.xValue = C.wedge.front;
    S.angleUser = S.angle;
    S.zero = Math.round(UT.nominalZero(S.angle) * 100) / 100;
  }
  applyUserFromTruth();

  // Kecepatan sebenarnya untuk material & mode gelombang aktif
  function trueV() { return UT.waveV(C.material, S.wave); }
  const cal = () => ({ vTrue: trueV(), vUser: S.velocity, zeroTrue: H.zero, zeroUser: S.zero });
  const couplingNow = () => UT.coupling(spec, S.contour);
  const clock = (y) => {
    const h = (((y / spec.yLen) * 12) % 12 + 12) % 12;
    let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    return `jam ${hh === 0 ? 12 : hh}:${String(mm).padStart(2, '0')}`;
  };
  const userIndexX = () => UT.userIndexX(S.probeX, dir(), H, S.xValue);
  // Sudut & kristal efektif: Phased Array memakai sudut sektor terpilih dan aperture array
  const isE = () => isTech('paut') && S.pautMode === 'E';
  const isKor = () => !!spec && spec.type === 'korosi';
  const isTub = () => !!spec && spec.type === 'tubular';
  /** Acuan AWS berbasis rating d = a − b − c (perlu reference level b). */
  const isRatingCode = () => S.code === 'aws' || S.code === 'aws-cyc';
  // Penampang lokal sambungan tubular per posisi φ (disimpan agar B-scan keliling cepat)
  const tubCache = new Map();
  let tubCacheVer = -1;
  function tubLocal(y) {
    if (tubCacheVer !== specVersion) { tubCache.clear(); tubCacheVer = specVersion; }
    const yy = y == null ? S.probeY : y;
    const circ = spec.yLen, yw = ((yy % circ) + circ) % circ;
    const key = Math.round(((yw / spec.J.r) * 180) / Math.PI * 2) + (yw > circ / 2 ? 'b' : 'a');
    let loc = tubCache.get(key);
    if (!loc) {
      if (tubCache.size > 400) tubCache.clear();
      loc = UT.tubLocal(spec, yw);
      tubCache.set(key, loc);
    }
    return loc;
  }
  const tubPhi = () => tubLocal().phi;
  function simTub(pr, spStart, spEnd, n, mb) {
    const loc = tubLocal(pr.y);
    const path = UT.traceTubular(loc.sec, { x0: pr.x, angle: pr.angle, spMax: spEnd + 5 });
    const r = UT.simulatePath({ probe: pr, mat: C.material, path, scene: loc.scene, grain: S.grain ? loc.grain : null,
      spStart, spEnd, n, mainBangSP: mb, coupling: couplingNow(), inWeld: (x, z) => UT.inPoly(loc.weld, x, z) });
    r.path = path;
    return r;
  }
  // Lintasan berkas umum: las memanjang pipa (anulus) atau las austenitik anisotropik
  const anisoOn = () => S.material === 'ss' && !!S.aniso;
  const usePath = () => isWeld() && !isPar() && !isTech('tofd') && (!!spec.seam || anisoOn());
  const skewDeg = () => (S.wave === 'L' ? 8 : 18);
  /** Lintasan sebenarnya untuk exit point x dan sudut fisik. */
  function truePath(x, angle, spMax) {
    if (spec.seam) return UT.tracePipe({ Ro: spec.R, T: spec.T, x0: x, dir: dir(), angle, spMax });
    return UT.tracePlate({ x0: x, dir: dir(), angle, T: spec.T, spMax, weld: spec.weld, skew: anisoOn() ? skewDeg() : 0 });
  }
  /** Lintasan menurut alat (tanda index & sudut terukur; tanpa pembelokan). */
  function userPathNow(spMax) {
    if (spec.seam) return UT.tracePipe({ Ro: spec.R, T: spec.T, x0: userIndexX() + beamOff(), dir: dir(), angle: userAngle(), spMax });
    return UT.tracePlate({ x0: userIndexX() + beamOff(), dir: dir(), angle: userAngle(), T: spec.T, spMax });
  }
  /** Lokasi reflektor menurut alat (dengan koreksi lengkung untuk las memanjang pipa). */
  function locateNow(sp, uIdx) {
    if (spec.seam && !isPar()) return UT.locatePipe(sp, userAngle(), spec.R, spec.T, uIdx, dir());
    return UT.locate(sp, userAngle(), spec.T, uIdx, dir());
  }
  /** Simulasi lintasan umum. */
  function simPath(pr, spStart, spEnd, n, mb) {
    const path = truePath(pr.x, pr.angle, spEnd + 5);
    const w = spec.weld;
    const sc = spec.seam ? UT.seamScene(spec) : { points: spec.scene.points, corners: spec.scene.corners, grain: spec.grain };
    const inWeld = spec.seam
      ? (u, v) => { const f = UT.seamFromUV(spec.R, u, v); return Math.abs(f.x) < UT.fusionX(w, Math.min(w.T, Math.max(0, f.z)), 1); }
      : (x, z) => Math.abs(x) < UT.fusionX(w, Math.min(w.T, Math.max(0, z)), 1);
    const r = UT.simulatePath({ probe: pr, mat: C.material, path, scene: sc, grain: S.grain ? sc.grain : null,
      spStart, spEnd, n, mainBangSP: mb, coupling: couplingNow(), inWeld });
    r.path = path;
    return r;
  }
  const isDual = () => !!S.dual && H.angle === 0;
  const pautA = () => (S.pautMode === 'E' ? S.pautEAngle : S.pautAngle);
  const physAngle = () => (isTech('paut') ? pautA() : H.angle);
  const userAngle = () => (isTech('paut') ? pautA() : S.angleUser);
  /** Pergeseran exit point berkas aktif (E-scan) terhadap posisi probe. */
  const beamOff = () => (isE() ? UT.escanOffset(S.pautBeam) : 0);
  /** Jarak fokus sepanjang berkas (SP) untuk sudut tertentu, atau null. */
  const focusSP = (angle) => (isTech('paut') && S.pautFocus > 0 ? S.pautFocus / Math.cos(angle * Math.PI / 180) : null);
  const probeFreq = () => (isTech('paut') ? UT.PAUT.freq : S.freq);
  const probeCrystal = () => (isTech('paut') ? UT.PAUT.aperture : S.crystal);
  const tofdS = () => S.tofdS || UT.tofdDefaultS(spec.T, UT.TOFD.angle);
  const tofdOpts = (y, tStart, tEnd, n) => ({
    S: tofdS(), angle: UT.TOFD.angle, freq: UT.TOFD.freq, crystal: UT.TOFD.crystal, y,
    T: spec.T, scene: spec.scene, grain: S.grain ? spec.grain : null, tStart, tEnd, n, mat: C.material,
  });

  // ---------------------------------------------------------------- model
  function defaultProbeX() {
    const tn = Math.tan(H.angle * DEG);
    if (spec.type === 'iiw') {
      const sc = spec.marks.scale;
      if (spec.face === 'B') return dir() > 0 ? 60 : sc.hx + sc.hz * tn + 12;
      return dir() > 0 ? UT.IIW.r100.cx - 25 : sc.hx + sc.hz * tn + 18;
    }
    if (spec.type === 'v2') {
      if (spec.face === 'B') return dir() > 0 ? Math.max(spec.xMin + 2, -(spec.marks.scale.hz * tn + 4)) : 5;
      return dir() > 0 ? -6 : 6;
    }
    if (isPar()) return dir() > 0 ? 100 : spec.yLen - 100;
    if (spec.type === 'asme') {
      const xs = UT.ASME_BLOCK.holesX;
      return dir() > 0 ? xs[0] - spec.T * 0.25 * tn - 10 : xs[2] + spec.T * 0.75 * tn + 10;
    }
    if (spec.type === 'korosi') return 30;
    if (spec.type === 'tubular') return -(spec.T * Math.tan(Math.max(30, H.angle) * DEG) * 1.6 + 30);
    if (H.angle === 0) return -dir() * ((spec.weld ? spec.weld.capHalf : 0) + 45);
    return -dir() * 1.75 * spec.T * tn;
  }

  function limits() {
    if (spec && spec.type === 'tubular') {
      const b = UT.probeBody(H);
      return { min: -240, max: tubLocal().sec.Be[0] - b.front - 1 };
    }
    return UT.specimenProbeLimits(aspec(), dir(), UT.probeBody(H));
  }

  function clampProbe() {
    if (S.probeX == null) S.probeX = defaultProbeX();
    const lim = limits();
    S.probeX = Math.min(lim.max, Math.max(lim.min, S.probeX));
    if (spec.type === 'korosi') S.probeY = Math.min(spec.yLen - 3, Math.max(3, S.probeY));
    if (spec.type === 'tubular') S.probeY = ((S.probeY % spec.yLen) + spec.yLen) % spec.yLen;
    if (isWeld()) {
      const hw = UT.PROBE_WIDTH / 2;
      if (isPar()) S.probeY = UT.lateralLimit(spec, S.probeY);
      else if (spec.isPipe) S.probeY = ((S.probeY % spec.yLen) + spec.yLen) % spec.yLen;
      else S.probeY = Math.min(spec.yLen - hw, Math.max(hw, S.probeY));
    }
  }

  function rebuild(resetView = true) {
    spec = UT.buildSpecimen(S);
    if (S.orient === 'sejajar' && (!isWeld() || spec.isPipe)) S.orient = 'tegak';
    specVersion++;
    if (img && (img.meta.kind === 'bscan' || img.meta.kind === 'cscan')) img = null;
    clampProbe();
    if (resetView) view = null;
    simDirty = true;
    updateInfo();
  }

  function clearDac(reason) {
    if (dac.points.length) dacMsg = `DAC dihapus: ${reason}. Buat ulang DAC di blok kalibrasi ASME.`;
    dac = UT.dacCreate();
    if (S.awsB != null) { S.awsB = null; dacMsg += ' Reference AWS (b) juga dihapus.'; }
    renderDac();
  }

  function newProbe(randomize) {
    // randomize: true (acak), fungsi rng (galat dari kode soal), atau false (probe ideal)
    H = UT.makeProbeTruth(S.angle, typeof randomize === 'function' ? randomize : randomize ? rand : null, { dual: S.dual });
    if (randomize) applyUserNominal(); else applyUserFromTruth();
    rebuild(false);
  }

  /** Benda uji untuk fisika sesuai arah scan (penampang melintang atau memanjang). */
  function physScene() {
    if (isPar()) {
      const ps = UT.parallelSpec(spec);
      // probe di atas logam las → seluruh lintasan di logam las (penting untuk las austenitik)
      ps.grain.inWeld.fill(Math.abs(S.probeY) < spec.weld.topHalf ? 1 : 0);
      return { T: ps.T, scene: ps.scene, grain: S.grain ? ps.grain : null, weld: null, coupling: NO_COUPLING, backwall: { flat: UT.flatBottomFn(ps) } };
    }
    return {
      T: spec.T, scene: spec.scene, grain: S.grain ? spec.grain : null,
      weld: isWeld() ? spec.weld : null, coupling: couplingNow(),
      shadows: spec.scene.shadows || [], backwall: { flat: UT.flatBottomFn(spec) },
    };
  }

  function simAt(x, y, angle, n) {
    const c = cal();
    const spStart = UT.spTrueFromUser(S.delay, c);
    const spEnd = UT.spTrueFromUser(S.delay + S.range, c);
    const pr = { x, y, dir: dir(), angle, freq: probeFreq(), crystal: probeCrystal(), wave: S.wave, focus: focusSP(angle), dual: isDual() };
    if (isKor()) return UT.simulateStraight({ probe: pr, spec, mat: C.material, spStart, spEnd, n, mainBangSP: UT.mainBangSP(c) });
    if (isTub()) return simTub(pr, spStart, spEnd, n, UT.mainBangSP(c));
    if (usePath() && Math.abs(angle) > 1) return simPath(pr, spStart, spEnd, n, UT.mainBangSP(c));
    return UT.simulate(Object.assign({
      probe: pr, mat: C.material, spStart, spEnd, n, mainBangSP: UT.mainBangSP(c),
    }, physScene()));
  }

  function runSim() {
    if (isTech('tofd') && isWeld() && !isPar()) {
      const W = UT.tofdWindow(tofdS(), spec.T, C.material.vL);
      sim = UT.simulateTOFD(tofdOpts(S.probeY, W.tStart, W.tEnd, 2400));
      sim.win = W;
      derived = UT.probeDerived({ freq: S.freq, crystal: S.crystal, angle: H.angle }, C.material);
      simDirty = false;
      return;
    }
    const c = cal();
    const spStart = UT.spTrueFromUser(S.delay, c);
    const spEnd = UT.spTrueFromUser(S.delay + S.range, c);
    const pr = { x: S.probeX + beamOff(), y: S.probeY, dir: dir(), angle: physAngle(), freq: probeFreq(), crystal: probeCrystal(), wave: S.wave, focus: focusSP(physAngle()), dual: isDual() };
    derived = UT.probeDerived(pr, C.material);
    const n = Math.max(1200, Math.min(9000, Math.ceil((spEnd - spStart) / (derived.lambda / 20))));
    sim = isKor()
      ? UT.simulateStraight({ probe: pr, spec, mat: C.material, spStart, spEnd, n, mainBangSP: UT.mainBangSP(c) })
      : isTub() ? simTub(pr, spStart, Math.max(spEnd, 1), n, UT.mainBangSP(c))
      : usePath() && Math.abs(pr.angle) > 1 ? simPath(pr, spStart, Math.max(spEnd, 1), n, UT.mainBangSP(c))
      : UT.simulate(Object.assign({
        probe: pr, mat: C.material, spStart, spEnd, n, mainBangSP: UT.mainBangSP(c),
      }, physScene()));
    simDirty = false;
  }

  // ---------------------------------------------------------------- UI setup
  function fillSelect(el, items, fmtFn, valFn) {
    el.innerHTML = '';
    items.forEach((v) => {
      const o = document.createElement('option');
      o.value = String(valFn ? valFn(v) : v);
      o.textContent = fmtFn ? fmtFn(v) : String(v);
      el.appendChild(o);
    });
  }

  function initControls() {
    const tabs = $('specTabs');
    UT.SPECIMENS.forEach((sp) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.dataset.spec = sp.id;
      b.textContent = sp.name;
      b.addEventListener('click', () => setSpecimen(sp.id));
      tabs.appendChild(b);
    });
    document.querySelectorAll('#techTabs .tab').forEach((b) => b.addEventListener('click', () => setTechnique(b.dataset.tech)));
    fillSelect($('inBevelType'), UT.BEVEL_TYPES, (t) => t.name, (t) => t.id);
    $('inBevelType').addEventListener('change', (e) => { S.bevelType = e.target.value; resetSizing(); rebuild(); syncControls(); });
    const bar = $('imgBar');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-b]');
      if (!b) return;
      const a = b.dataset.b;
      if (a === 'x' || a === 'y') startBscan(a);
      else if (a === 'c') startCscan();
      else if (a === 'modeS' || a === 'modeE') { S.pautMode = a === 'modeE' ? 'E' : 'S'; img = null; imgKey = ''; simDirty = true; updateInfo(); }
      else if (a === 'close') { img = null; imgKey = ''; }
      else if (a === 'pcsAuto') { S.tofdS = null; simDirty = true; updateInfo(); }
      else if (a === 'clearMarks') { tofd.mA = tofd.mB = null; tofd.nextMark = 'mA'; }
      bar.dataset.html = '';
      renderImgBar();
    });
    bar.addEventListener('input', (e) => {
      if (e.target.id === 'inPautB') {
        S.pautBeam = +e.target.value;
        simDirty = true;
        updateInfo();
        const o = e.target.parentElement.querySelector('b');
        if (o) o.textContent = String(S.pautBeam + 1);
      }
      if (e.target.id === 'inPautA') {
        S.pautAngle = +e.target.value;
        simDirty = true;
        updateInfo();
        const o = e.target.parentElement.querySelector('b');
        if (o) o.textContent = `${S.pautAngle}°`;
        const dl = bar.querySelector('.delaylaw');
        if (dl) dl.outerHTML = delayLawSVG(physAngle(), focusSP(physAngle()));
      }
    });
    bar.addEventListener('change', (e) => {
      if (e.target.id === 'inPautF' || e.target.id === 'inPautEA') {
        if (e.target.id === 'inPautF') S.pautFocus = +e.target.value; else S.pautEAngle = +e.target.value;
        simDirty = true;
        updateInfo();
        bar.dataset.html = '';
        renderImgBar();
        return;
      }
      if (e.target.id === 'inPcs') {
        const v = parseFloat(e.target.value);
        if (isFinite(v) && v >= 10) { S.tofdS = v / 2; simDirty = true; updateInfo(); }
        bar.dataset.html = '';
        renderImgBar();
      }
    });
    fillSelect($('inT'), C.options.thicknesses, (v) => `${v} mm`);
    fillSelect($('inBevel'), C.options.bevels, (v) => `${v}° (sudut bevel total ${v * 2}°)`);
    fillSelect($('inAngle'), C.options.angles, (v) => (v === 0 ? '0° (probe lurus)' : `${v}°`));
    S._prevAngle = S.angle;
    fillSelect($('inFreq'), C.options.freqs, (v) => `${v} MHz`);
    fillSelect($('inCrystal'), C.options.crystals, (v) => `${v} mm`);
    fillSelect($('inScenario'), UT.SCENARIOS, (s) => s.name, (s) => s.id);
    // Sambungan tubular
    fillSelect($('inTubType'), UT.TUB_TYPES, (t) => t.name, (t) => t.id);
    fillSelect($('inTubD'), C.options.ods, (v) => `${v}`);
    fillSelect($('inTubd'), C.options.ods, (v) => `${v}`);
    fillSelect($('inTubTc'), C.options.thicknesses, (v) => `${v}`);
    fillSelect($('inTubTb'), C.options.thicknesses, (v) => `${v}`);
    fillSelect($('inTubScn'), UT.TUB_SCENARIOS, (s) => s.name, (s) => s.id);
    const tubChanged = () => {
      if (S.tubd >= S.tubD) S.tubd = C.options.ods.filter((d) => d < S.tubD).pop() || S.tubD * 0.5;
      S.T = S.tubTb;
      clearDac('ukuran sambungan berubah');
      resetSizing(); rebuild(); syncControls();
    };
    $('inTubType').addEventListener('change', (e) => { S.tubType = e.target.value; if (S.tubType === 'T') S.tubTheta = 90; else if (S.tubTheta >= 90) S.tubTheta = 45; resetSizing(); rebuild(); syncControls(); });
    [['inTubD', 'tubD'], ['inTubd', 'tubd'], ['inTubTc', 'tubTc'], ['inTubTb', 'tubTb']].forEach(([id, k]) => $(id).addEventListener('change', (e) => { S[k] = parseFloat(e.target.value); tubChanged(); }));
    $('inTubTheta').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) S.tubTheta = Math.max(30, Math.min(90, v)); rebuild(); syncControls(); });
    $('inTubGap').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) S.tubGap = Math.max(5, Math.min(120, v)); rebuild(); syncControls(); });
    $('inTubScn').addEventListener('change', (e) => { S.tubScenario = e.target.value; resetSizing(); rebuild(false); syncControls(); });
    $('inTubPhi').addEventListener('input', (e) => moveProbeY((+e.target.value * Math.PI / 180) * spec.J.r));
    document.querySelectorAll('[data-phi]').forEach((b) => b.addEventListener('click', () => moveProbeY((+b.dataset.phi * Math.PI / 180) * spec.J.r)));
    fillSelect($('inIndType'), UT.INDICATION_TYPES, (t) => t.name, (t) => t.id);

    const num = (id, key, after) => {
      $(id).addEventListener('change', (e) => {
        const v = parseFloat(e.target.value);
        if (!isFinite(v)) { syncControls(); return; }
        const el = e.target;
        S[key] = Math.min(parseFloat(el.max || v), Math.max(parseFloat(el.min || v), v));
        if (after) after(); else simDirty = true;
        syncControls();
      });
    };
    const sel = (id, key, parse, after) => {
      $(id).addEventListener('change', (e) => {
        S[key] = parse ? parse(e.target.value) : e.target.value;
        if (after) after(); else simDirty = true;
        syncControls();
      });
    };
    const chk = (id, key, after) => {
      $(id).addEventListener('change', (e) => {
        S[key] = e.target.checked;
        if (after) after(); else simDirty = true;
        syncControls();
      });
    };

    sel('inT', 'T', parseFloat, () => { clearDac('tebal benda uji berubah'); resetSizing(); rebuild(); });
    $('inFace').addEventListener('change', (e) => {
      if (S.specimen === 'v2') {
        S.v2Face = e.target.value;
        if (S.v2Face === 'B') Object.assign(S, { side: 'kiri', gateStart: 8, gateWidth: 30, range: 100 });
        else Object.assign(S, { side: 'kiri', gateStart: 35, gateWidth: 30, range: 225 });
      } else S.iiwFace = e.target.value;
      S.probeX = null;
      rebuild();
      syncControls();
    });
    fillSelect($('inMaterial'), Object.values(C.materials), (m) => m.name, (m) => m.id);
    fillSelect($('inOD'), C.options.ods, (v) => `${v} mm`);
    $('inMaterial').addEventListener('change', (e) => setMaterial(e.target.value));
    $('inWave').addEventListener('change', (e) => setWave(e.target.value));
    $('inOrient').addEventListener('change', (e) => setOrient(e.target.value));
    // Rencana scan
    S.plan = Object.assign({}, C.defaults.plan, S.plan || {});
    $('inPlanOn').addEventListener('change', (e) => { S.plan.on = e.target.checked; syncControls(); });
    document.querySelectorAll('[data-plan-angle]').forEach((cb) => cb.addEventListener('change', () => {
      S.plan.angles = Array.from(document.querySelectorAll('[data-plan-angle]')).filter((c) => c.checked).map((c) => +c.dataset.planAngle);
    }));
    $('inPlanSides').addEventListener('change', (e) => { S.plan.sides = e.target.value; });
    $('inPlanLegs').addEventListener('change', (e) => { S.plan.legs = +e.target.value; });
    [['inPlanNear', 'near'], ['inPlanFar', 'far'], ['inPlanHaz', 'haz']].forEach(([id, k]) => {
      $(id).addEventListener('change', (e) => { const v = parseFloat(e.target.value); S.plan[k] = isFinite(v) ? v : null; });
    });
    sel('inGeom', 'geom', null, () => { resetSizing(); rebuild(); renderDac(); syncControls(); });
    $('inSeam').addEventListener('change', (e) => { S.seam = e.target.value === '1'; if (S.seam && isTech('tofd')) setTechnique('ut'); resetSizing(); rebuild(); renderDac(); syncControls(); });
    $('inAniso').addEventListener('change', (e) => { S.aniso = e.target.checked; simDirty = true; img = null; imgKey = ''; });
    sel('inOD', 'OD', parseFloat, () => { resetSizing(); rebuild(); renderDac(); });
    chk('inContour', 'contour', () => { simDirty = true; updateInfo(); renderDac(); });
    chk('inAsmeCurved', 'asmeCurved', () => { rebuild(); });
    sel('inBevel', 'bevelHalf', parseFloat, () => rebuild());
    num('inGap', 'rootGap', () => rebuild());
    chk('inCap', 'cap', () => rebuild());
    chk('inRoot', 'rootBead', () => rebuild());
    const probeChanged = (what) => { clearDac(`${what} probe berubah`); newProbe(training); };
    sel('inAngle', 'angle', parseFloat, () => {
      // probe lurus 0° memakai gelombang longitudinal; probe sudut kembali ke gelombang geser
      if (S.angle === 0) S.wave = 'L';
      else if (S._prevAngle === 0) S.wave = 'T';
      S._prevAngle = S.angle;
      probeChanged('sudut');
      S.velocity = trueV();
      S.probeX = null;
      rebuild();
    });
    sel('inFreq', 'freq', parseFloat, () => probeChanged('frekuensi'));
    $('inDual').addEventListener('change', (e) => { S.dual = e.target.value === '1'; probeChanged('jenis'); syncControls(); });
    sel('inCrystal', 'crystal', parseFloat, () => probeChanged('ukuran kristal'));
    $('sideL').addEventListener('click', () => setSide('kiri'));
    $('sideR').addEventListener('click', () => setSide('kanan'));

    document.querySelectorAll('[data-gain]').forEach((b) =>
      b.addEventListener('click', () => setGain(S.gain + parseFloat(b.dataset.gain))));
    $('inGain').addEventListener('input', (e) => setGain(parseFloat(e.target.value)));
    $('btnPeak80').addEventListener('click', () => {
      if (lastPeak && lastPeak.amp > 0.5) setGain(S.gain + 20 * Math.log10(80 / lastPeak.amp));
    });
    num('inRange', 'range');
    num('inDelay', 'delay');
    sel('inRect', 'rect', null, () => {});
    num('inGs', 'gateStart', () => {});
    num('inGw', 'gateWidth', () => {});
    num('inGl', 'gateLevel', () => {});

    // Kalibrasi
    num('inXv', 'xValue', () => {});
    num('inAngU', 'angleUser', () => updateInfo());
    num('inZero', 'zero');
    num('inVel', 'velocity');
    $('btnNewProbe').addEventListener('click', () => {
      training = true;
      clearDac('probe diganti');
      newProbe(true);
      syncControls();
    });
    $('btnAutoCal').addEventListener('click', () => {
      applyUserFromTruth();
      simDirty = true;
      updateInfo();
      syncControls();
    });

    // DAC
    $('btnDacAdd').addEventListener('click', () => {
      dacMsg = '';
      if (!lastPeak || !lastPeak.triggered) dacMsg = 'Tidak ada echo yang melewati level gate. Untuk echo lemah (mis. lewat leg 2) turunkan level gate.';
      else if (lastPeak.amp >= 100) dacMsg = 'Echo jenuh (≥ 100%). Turunkan gain lalu rekam lagi.';
      else {
        if (!dac.points.length) dac.meta = { blockOD: spec.type === 'asme' && spec.R ? spec.OD : null, contour: S.contour, material: S.material, wave: S.wave };
        UT.dacAdd(dac, lastPeak.sp, lastPeak.amp, S.gain);
      }
      renderDac();
    });
    $('btnAwsB').addEventListener('click', () => {
      dacMsg = '';
      if (spec.type !== 'iiw') dacMsg = 'Reference AWS direkam pada blok IIW V1 (lubang Ø1,5 mm, sisi B).';
      else if (!lastPeak || !lastPeak.triggered) dacMsg = 'Tidak ada echo di dalam Gate A.';
      else if (lastPeak.amp >= 100) dacMsg = 'Echo jenuh (≥ 100%). Turunkan gain lalu rekam lagi.';
      else S.awsB = UT.awsGainAtRef(S.gain, lastPeak.amp);
      renderDac();
    });
    $('inCode').addEventListener('change', (e) => { S.code = e.target.value; renderDac(); lastRo = ''; });
    // Scanning level AWS (Tabel 8.3): gain = b + level menurut SP di ujung gate
    $('btnAwsScan').addEventListener('click', () => {
      if (S.awsB == null) { dacMsg = 'Rekam reference level b dulu.'; renderDac(); return; }
      const lv = UT.awsScanLevel(S.gateStart + S.gateWidth);
      if (lv == null) return;
      setGain(S.awsB + lv);
      dacMsg = `Gain scanning = b + ${lv} dB (SP sampai ${(S.gateStart + S.gateWidth).toFixed(0)} mm).`;
      renderDac();
    });
    $('btnDacUndo').addEventListener('click', () => {
      dac.points.pop();
      dacMsg = '';
      renderDac();
    });
    $('btnDacClear').addEventListener('click', () => { dac = UT.dacCreate(); dacMsg = ''; renderDac(); });
    $('btnGainRef').addEventListener('click', () => { const g = UT.dacRefGain(dac); if (g != null) setGain(g); });
    $('btnGainScan').addEventListener('click', () => { const g = UT.dacRefGain(dac); if (g != null) setGain(g + 6); });
    chk('inShowDac', 'showDac', () => {});
    chk('inTcg', 'tcg', () => {});

    // Sizing
    $('btnY1').addEventListener('click', () => { sizing.y1 = S.probeY; renderSizing(); });
    $('btnY2').addEventListener('click', () => { sizing.y2 = S.probeY; renderSizing(); });
    const markDepth = (k) => () => {
      if (!lastPeak || !lastPeak.triggered) return;
      sizing[k] = locateNow(lastPeak.sp, userIndexX()).depth;
      renderSizing();
    };
    $('btnD1').addEventListener('click', markDepth('d1'));
    $('btnD2').addEventListener('click', markDepth('d2'));
    $('btnSizeReset').addEventListener('click', () => { resetSizing(); });
    sel('inIndType', 'indType', null, () => {});

    sel('inScenario', 'scenario', null, () => { resetSizing(); rebuild(false); });
    num('inSeed', 'randSeed', () => { resetSizing(); rebuild(false); });
    sel('inCount', 'randCount', parseFloat, () => { resetSizing(); rebuild(false); });
    $('btnReroll').addEventListener('click', () => {
      S.randSeed = UT.randomExamCode(rand);
      resetSizing();
      rebuild(false);
      syncControls();
    });
    chk('inShowDef', 'showDefects', () => {});
    chk('inShowBeam', 'showBeam', () => {});
    chk('inGrain', 'grain');

    $('aboutVer').textContent = `v${C.version}`;
    $('btnAbout').addEventListener('click', () => {
      const h = $('about');
      h.hidden = !h.hidden;
      $('btnAbout').setAttribute('aria-expanded', String(!h.hidden));
    });
    $('btnHelp').addEventListener('click', () => {
      const h = $('help');
      h.hidden = !h.hidden;
      $('btnHelp').setAttribute('aria-expanded', String(!h.hidden));
    });
    syncControls();
    renderDac();
    renderSizing();
  }

  function setSpecimen(id) {
    if (S.specimen === id) return;
    if (id !== 'las' && isTech('tofd')) {
      gainMem.tofd = S.gain;
      S.technique = 'ut';
      if (gainMem.ut != null) S.gain = gainMem.ut;
      img = null;
      imgKey = '';
    }
    S.specimen = id;
    if (id === 'las') Object.assign(S, { range: 125, delay: 0, gateStart: 40, gateWidth: 50 });
    if (id === 'iiw') Object.assign(S, { side: 'kiri', range: 250, delay: 0, gateStart: 80, gateWidth: 40 });
    if (id === 'v2') {
      Object.assign(S, S.v2Face === 'B'
        ? { side: 'kiri', range: 100, delay: 0, gateStart: 8, gateWidth: 30 }
        : { side: 'kiri', range: 225, delay: 0, gateStart: 35, gateWidth: 30 });
    }
    if (id === 'tubular') {
      if (isTech('tofd')) setTechnique('ut');
      S.side = 'kiri';
      S.T = S.tubTb;
      Object.assign(S, { range: 150, delay: 0, gateStart: 8, gateWidth: 110, probeY: 0 });
    }
    if (id === 'korosi') {
      if (isTech('paut')) setTechnique('ut');
      if (S.angle !== 0) {
        S._angleBefore = S.angle;
        S.angle = 0; S._prevAngle = 0; S.wave = 'L';
        S.specimen = id;
        newProbe(training);
        S.velocity = trueV();
      }
      Object.assign(S, { range: Math.max(25, Math.ceil((S.T * 2.2) / 5) * 5), delay: 0, gateStart: S.dual ? 1.5 : 6, gateWidth: S.dual ? S.T + 2 : S.T - 3, gateLevel: 20, probeY: 100 });
    }
    if (S._angleBefore && id !== 'korosi' && S.angle === 0) {
      // kembali dari pelat korosi: pulihkan probe sudut sebelumnya
      S.angle = S._angleBefore; S._prevAngle = S.angle; S.wave = 'T'; S._angleBefore = null;
      S.specimen = id;
      newProbe(training);
      S.velocity = trueV();
    }
    if (id === 'asme') {
      const r = Math.ceil((S.T * 2.6) / Math.cos(S.angle * DEG) / 25) * 25;
      Object.assign(S, { side: 'kiri', range: Math.max(75, r), delay: 0, gateStart: 5, gateWidth: Math.max(40, r - 10) });
    }
    S.probeX = null;
    rebuild();
    syncControls();
  }

  /** Arah scan: 'tegak' (berkas melintang las) atau 'sejajar' (berkas searah sumbu las). */
  function setOrient(o) {
    if (o === S.orient) return;
    if (o === 'sejajar') {
      if (!isWeld() || spec.isPipe) { syncControls(); return; }
      if (isTech('tofd')) setTechnique('ut');
      S._perpX = S.probeX;
      S.probeX = Math.max(40, S.probeY - (dir() > 0 ? 70 : -70)); // posisi sepanjang las
      S.probeY = 0; // di atas sumbu las (dibatasi bila cap masih ada)
    } else {
      const along = S.probeX;
      S.probeX = S._perpX != null ? S._perpX : null;
      S.probeY = Math.min(spec.yLen - 10, Math.max(10, along));
    }
    S.orient = o;
    img = null;
    imgKey = '';
    resetSizing();
    rebuild();
    syncControls();
  }

  /** Hitung ulang peta cakupan rencana scan bila pengaturannya berubah. */
  function updateCoverage() {
    if (!S.plan.on || !isWeld() || isPar()) return;
    const w = spec.weld, P = S.plan;
    const near = P.near != null ? P.near : UT.minProbeDistance(w);
    const maxA = Math.max(...(P.angles.length ? P.angles : [60]));
    const far = P.far != null ? P.far : Math.round(UT.planDistances(w, maxA, P.haz).farTopLeg2 + 5);
    const sides = P.sides === 'keduanya' ? ['kiri', 'kanan'] : [P.sides];
    const key = [specVersion, P.angles.join(','), P.sides, P.legs, near, far, P.haz, S.crystal, S.freq, S.material, S.wave].join('|');
    if (key === covKey) return;
    covKey = key;
    if (!P.angles.length) { cov = null; $('planOut').textContent = 'Pilih minimal satu sudut.'; return; }
    cov = UT.coverage(w, { angles: P.angles, sides, near, far, legs: P.legs, haz: P.haz, crystal: S.crystal, freq: S.freq, mat: C.material, wave: S.wave });
    if (document.activeElement !== $('inPlanNear')) $('inPlanNear').value = near.toFixed(0);
    if (document.activeElement !== $('inPlanFar')) $('inPlanFar').value = far.toFixed(0);
    const per = P.angles.map((a) => `${a}°: ${cov.perAngle[a].toFixed(0)}%`).join(' · ');
    const dist = P.angles.map((a) => { const d = UT.planDistances(w, a, P.haz); return `${a}°: ½ skip ${d.halfSkip.toFixed(0)} mm, sampai tepi zona seberang lewat leg 2 ≈ ${d.farTopLeg2.toFixed(0)} mm`; }).join('; ');
    $('planOut').innerHTML = `<b>Cakupan zona pemeriksaan: ${cov.pct.toFixed(1)}%</b>${cov.uncovered ? ' <span class="warn">(ada daerah merah tidak tercakup)</span>' : ' ✓'}<br>Per sudut: ${per}<br><span class="muted">Jarak exit point: ${dist}.</span>`;
  }

  function setMaterial(id) {
    if (S.material === id) return;
    S.material = id;
    UT.setMaterial(id);
    S.velocity = trueV();
    clearDac('material berubah');
    rebuild(false);
    syncControls();
  }

  function setWave(w) {
    if (S.wave === w) return;
    S.wave = w;
    S.velocity = trueV();
    clearDac('mode gelombang berubah');
    simDirty = true;
    updateInfo();
    syncControls();
  }

  function setGain(g) {
    S.gain = Math.round(Math.min(90, Math.max(0, g)) * 2) / 2;
    syncControls();
  }

  function setSide(side) {
    if (S.side === side) return;
    S.side = side;
    if (isWeld()) S.probeX = -S.probeX; // cerminkan ke sisi las yang lain
    else S.probeX = null;
    rebuild();
    syncControls();
  }

  function resetSizing() {
    sizing.y1 = sizing.y2 = sizing.d1 = sizing.d2 = null;
    renderSizing();
  }

  function syncControls() {
    document.querySelectorAll('#specTabs .tab').forEach((b) => {
      const on = b.dataset.spec === S.specimen;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    const weld = S.specimen === 'las';
    document.querySelectorAll('#techTabs .tab').forEach((b) => {
      const on = b.dataset.tech === S.technique;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('inBevelType').value = S.bevelType;
    $('inMaterial').value = S.material;
    $('inWave').value = S.wave;
    $('inWave').disabled = S.angle === 0 || locks.scenario;
    $('lblDual').hidden = S.angle !== 0;
    $('inDual').value = S.dual ? '1' : '0';
    $('inAngle').disabled = S.specimen === 'korosi';
    $('inGeom').value = S.geom;
    $('lblSeam').hidden = !(weld && S.geom === 'pipa');
    $('inSeam').value = S.seam ? '1' : '0';
    $('inSeam').disabled = locks.scenario;
    $('lblAniso').hidden = S.material !== 'ss';
    $('inAniso').checked = !!S.aniso;
    $('inOD').value = String(S.OD);
    $('lblOD').hidden = !(weld && S.geom === 'pipa') && !(S.specimen === 'asme' && S.asmeCurved);
    $('inContour').checked = S.contour;
    $('lblContour').hidden = !spec || !spec.R;
    $('inAsmeCurved').checked = S.asmeCurved;
    $('lblAsmeCurved').hidden = S.specimen !== 'asme';
    $('inMaterial').disabled = $('inWave').disabled = $('inGeom').disabled = locks.scenario;
    $('lblBevel').hidden = S.bevelType === 'U';
    renderImgBar();
    $('weldOnly').hidden = !weld;
    const tub = S.specimen === 'tubular';
    $('topWrap').hidden = !weld && !tub;
    $('sizingCard').hidden = !weld && !tub;
    $('tubCard').hidden = !tub;
    $('topTitle').textContent = tub ? 'Tampilan 3D sambungan' : 'Tampak atas';
    $('topHint').textContent = tub ? '– klik atau seret di garis las untuk memilih posisi keliling φ' : '– seret untuk menggeser probe sepanjang las (skala y dipadatkan)';
    $('sideL').disabled = $('sideR').disabled = tub;
    if (tub) {
      $('inTubType').value = S.tubType;
      $('inTubD').value = String(S.tubD);
      $('inTubTc').value = String(S.tubTc);
      $('inTubd').value = String(S.tubd);
      $('inTubTb').value = String(S.tubTb);
      $('inTubTheta').value = S.tubType === 'T' ? 90 : S.tubTheta;
      $('lblTubTheta').hidden = S.tubType === 'T';
      $('lblTubGap').hidden = S.tubType !== 'K';
      $('inTubGap').value = S.tubGap;
      $('inTubScn').value = S.tubScenario;
      const sc = UT.TUB_SCENARIOS.find((x) => x.id === S.tubScenario);
      $('tubDesc').textContent = sc ? sc.desc : '';
    }
    $('inT').disabled = S.specimen === 'iiw' || S.specimen === 'v2' || S.specimen === 'tubular' || locks.scenario;
    $('lblFace').hidden = S.specimen !== 'iiw' && S.specimen !== 'v2';
    const faceOpts = S.specimen === 'v2'
      ? [['A', 'Sisi atas – R25/R50, Ø5 skala 35°–65°'], ['B', 'Sisi miring – Ø5 skala 65°–75°']]
      : [['A', 'Sisi A – R100, Ø50, skala 35°–76°'], ['B', 'Sisi B – Ø1,5, skala 70°–80°']];
    const fsel = $('inFace');
    if (fsel.dataset.kind !== S.specimen) {
      fsel.innerHTML = faceOpts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
      fsel.dataset.kind = S.specimen;
    }
    fsel.value = S.specimen === 'v2' ? S.v2Face : S.iiwFace;
    $('inScenario').disabled = !weld || locks.scenario;
    $('randRow').hidden = !weld || S.scenario !== 'acak' || locks.scenario;
    $('inSeed').value = S.randSeed;
    $('inCount').value = String(S.randCount);
    $('inShowDef').disabled = locks.truth;
    $('btnAutoCal').disabled = locks.autoCal;
    $('sectionTitle').textContent = tub ? 'Tampilan scanning (penampang lokal sambungan tubular)' : weld ? (S.geom === 'pipa' ? (S.seam ? `Tampilan scanning (penampang keliling pipa OD ${S.OD}, las memanjang)` : `Tampilan scanning (penampang aksial dinding pipa OD ${S.OD})`)
      : S.orient === 'sejajar' ? 'Tampilan scanning (penampang memanjang – scan sejajar las)' : 'Tampilan scanning (penampang las)')
      : `Tampilan scanning (${UT.SPECIMENS.find((s) => s.id === S.specimen).name})`;
    if (roMode !== 'tofd') {
      const par = S.orient === 'sejajar' && weld;
      $('roXLabel').textContent = par ? 'Posisi sepanjang las' : weld ? 'Posisi thd sumbu las' : 'Posisi x pada blok';
      $('roPLabel').textContent = par ? 'Probe: lateral · sepanjang las' : weld ? 'Posisi probe (y)' : 'Tanda index pada blok';
    }
    $('inOrient').value = S.orient;
    $('inOrient').disabled = !weld || S.geom === 'pipa' || isTech('tofd');

    $('inT').value = String(S.T);
    $('inBevel').value = String(S.bevelHalf);
    $('inGap').value = S.rootGap;
    $('inCap').checked = S.cap;
    $('inRoot').checked = S.rootBead;
    $('inAngle').value = String(S.angle);
    $('inFreq').value = String(S.freq);
    $('inCrystal').value = String(S.crystal);
    $('sideL').classList.toggle('active', S.side === 'kiri');
    $('sideR').classList.toggle('active', S.side === 'kanan');
    $('sideL').setAttribute('aria-pressed', String(S.side === 'kiri'));
    $('sideR').setAttribute('aria-pressed', String(S.side === 'kanan'));
    $('inGain').value = S.gain;
    $('gainOut').textContent = `${S.gain.toFixed(1)} dB`;
    $('inRange').value = S.range;
    $('inDelay').value = S.delay;
    $('inRect').value = S.rect;
    $('inGs').value = S.gateStart;
    $('inGw').value = S.gateWidth;
    $('inGl').value = S.gateLevel;
    $('inXv').value = S.xValue;
    $('inAngU').value = S.angleUser;
    $('inZero').value = S.zero;
    $('inVel').value = S.velocity;
    $('inShowDac').checked = S.showDac;
    $('inTcg').checked = !!S.tcg;
    $('planCard').hidden = !weld || S.seam && S.geom === 'pipa';
    $('inPlanOn').checked = !!S.plan.on;
    document.querySelectorAll('[data-plan-angle]').forEach((c) => { c.checked = S.plan.angles.includes(+c.dataset.planAngle); });
    $('inPlanSides').value = S.plan.sides;
    $('inPlanLegs').value = String(S.plan.legs);
    $('inPlanHaz').value = S.plan.haz;
    $('inScenario').value = S.scenario;
    $('customBox').hidden = !(weld && S.scenario === 'kustom') || locks.scenario;
    if (!$('customBox').hidden && UT.renderCustomEditor) UT.renderCustomEditor();
    $('scenarioDesc').textContent = !weld ? 'Skenario cacat hanya berlaku pada benda uji las.'
      : locks.scenario ? 'Mode ujian: cacat dirahasiakan sampai jawaban dikirim.' : UT.findScenario(S.scenario).desc;
    $('inIndType').value = S.indType;
    $('inShowDef').checked = S.showDefects;
    $('inShowBeam').checked = S.showBeam;
    $('inGrain').checked = S.grain;
    renderCalStatus();
  }

  function renderCalStatus() {
    const st = UT.calibrationStatus(H, { xValue: S.xValue, angle: S.angleUser, zero: S.zero, velocity: S.velocity }, trueV());
    const badge = $('calBadge');
    const list = $('calStatus');
    list.innerHTML = '';
    if (!training) {
      badge.textContent = st.ok ? '✓ Probe ideal, terkalibrasi' : '⚠ Nilai kalibrasi alat diubah';
      badge.className = 'badge ' + (st.ok ? 'ok' : 'bad');
    } else if (S.showDefects) {
      badge.textContent = st.ok ? '✓ Probe latihan terkalibrasi' : '⚠ Probe latihan belum terkalibrasi';
      badge.className = 'badge ' + (st.ok ? 'ok' : 'bad');
    } else {
      badge.textContent = 'Probe latihan – kalibrasi di blok IIW';
      badge.className = 'badge';
    }
    if (training && !S.showDefects) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'Status per parameter tampil di mode guru.';
      list.appendChild(li);
    } else {
      st.items.forEach((it) => {
        const li = document.createElement('li');
        li.className = it.ok ? 'ok' : 'bad';
        li.textContent = `${it.ok ? '✓' : '✗'} ${it.key}`;
        list.appendChild(li);
      });
      if (S.showDefects) {
        const li = document.createElement('li');
        li.className = 'muted truth';
        li.textContent = `nilai sebenarnya: X ${H.front.toFixed(1)} mm · ${H.angle.toFixed(1)}° · zero ${H.zero.toFixed(2)} µs`;
        list.appendChild(li);
      }
    }
  }

  function renderDac() {
    const ref = UT.dacRefGain(dac);
    $('dacInfo').innerHTML = dac.points.length
      ? `${dac.points.length} titik · reference level <b>${ref.toFixed(1)} dB</b> · scanning ≥ <b>${(ref + 6).toFixed(1)} dB</b>`
      : 'Belum ada titik. Buka <b>Blok kalibrasi dasar ASME</b>, maksimalkan echo SDH, lalu rekam.';
    const ol = $('dacList');
    ol.innerHTML = '';
    dac.points.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = `SP ${p.sp.toFixed(1)} mm → ${Math.pow(10, (p.db + ref) / 20).toFixed(0)}% pada gain reference`;
      ol.appendChild(li);
    });
    $('btnGainRef').disabled = $('btnGainScan').disabled = !dac.points.length;
    $('awsRef').hidden = !isRatingCode();
    $('inCode').value = S.code;
    $('awsBOut').textContent = S.awsB == null ? '– (belum direkam)' : `${S.awsB.toFixed(1)} dB`;
    $('dacMsg').hidden = !dacMsg;
    $('dacMsg').textContent = dacMsg;
    // Peringatan validitas DAC untuk pipa (ASME: blok lengkung bila D ≤ 20 in ≈ 508 mm)
    const warn = [];
    if (dac.points.length && S.geom === 'pipa' && S.specimen === 'las') {
      const m = dac.meta || {};
      if (S.OD <= 508 && !UT.curvedBlockOk(S.OD, m.blockOD)) {
        warn.push(m.blockOD ? `Blok lengkung D = ${m.blockOD} mm hanya berlaku untuk permukaan ${(0.9 * m.blockOD).toFixed(0)}–${(1.5 * m.blockOD).toFixed(0)} mm.`
          : 'DAC dibuat pada blok datar. Untuk diameter ≤ 20 in (≈ 508 mm) ASME mensyaratkan blok kalibrasi lengkung.');
      }
      if (m.contour !== undefined && m.contour !== S.contour) warn.push('Kondisi wedge (datar/dikontur) berbeda dengan saat DAC dibuat.');
    }
    if (dac.points.length && dac.meta && (dac.meta.material !== S.material || dac.meta.wave !== S.wave)) {
      warn.push('DAC dibuat dengan material/mode gelombang lain.');
    }
    $('dacWarn').hidden = !warn.length;
    $('dacWarn').textContent = warn.join(' ');
  }

  function renderSizing() {
    const L = sizing.y1 != null && sizing.y2 != null ? Math.abs(sizing.y2 - sizing.y1) : null;
    const Hh = sizing.d1 != null && sizing.d2 != null ? Math.abs(sizing.d2 - sizing.d1) : null;
    const yt = (v) => (v == null ? '–' : `y ${v.toFixed(1)}`);
    $('outLen').textContent = L != null ? `${L.toFixed(1)} mm (${yt(sizing.y1)} s/d ${yt(sizing.y2)})` : `– (${yt(sizing.y1)}, ${yt(sizing.y2)})`;
    $('outHeight').textContent = Hh != null ? `${Hh.toFixed(1)} mm (kedalaman ${fmt(Math.min(sizing.d1, sizing.d2))}–${fmt(Math.max(sizing.d1, sizing.d2))} mm)` : '–';
  }

  /** Info tubular: Ψ lokal, zona, dan sudut probe ideal. */
  function tubInfo() {
    const sec = tubLocal().sec, id = UT.tubIdealAngles(sec);
    return `Ψ = ${sec.psi.toFixed(0)}° (${sec.zone}) · sudut ideal: muka bevel brace ≈ ${id.brace.toFixed(0)}° (leg 2), muka chord ≈ ${id.chord.toFixed(0)}° (leg 1)`;
  }

  /** Info las memanjang: SP & jarak busur ke dinding dalam, batas sudut agar berkas mengenai dinding dalam. */
  function seamInfo() {
    const Ri = spec.R - spec.T, aMax = Math.asin(Ri / spec.R) / DEG;
    const p = UT.tracePipe({ Ro: spec.R, T: spec.T, x0: 0, dir: 1, angle: userAngle(), spMax: 400 });
    if (!p.hitsID) return `Sudut ${userAngle()}° > ${aMax.toFixed(1)}°: berkas tidak mengenai dinding dalam (t/D = ${(spec.T / spec.OD).toFixed(3)})`;
    const q = UT.seamFromUV(spec.R, p.pts[1].x, p.pts[1].z);
    return `Dinding dalam dicapai di SP ${p.pts[1].s.toFixed(1)} mm, ${q.x.toFixed(1)} mm (busur) dari exit point · sudut maks ${aMax.toFixed(1)}°`;
  }

  function updateInfo() {
    if (!spec) return;
    const hs = spec.T * Math.tan(userAngle() * DEG);
    $('skipInfo').textContent = spec.type === 'iiw' ? `Blok V1 sisi ${spec.face} · 300 × 100 mm`
      : spec.type === 'v2' ? `Blok V2 ${spec.face === 'B' ? 'sisi miring' : 'sisi atas'} · R25 & R50 sepusat, lubang Ø5`
      : isTech('tofd') && isWeld() ? `TOFD · PCS = ${(2 * tofdS()).toFixed(1)} mm · ${UT.TOFD.freq} MHz L-wave ${UT.TOFD.angle}°`
        : isTub() ? tubInfo()
        : userAngle() === 0 ? `Probe lurus 0° · back wall di ${spec.T} mm, ${2 * spec.T} mm, …`
          : spec.seam && !isPar() ? seamInfo()
          : `½ skip = ${hs.toFixed(1)} mm · 1 skip = ${(2 * hs).toFixed(1)} mm (sudut ${userAngle()}°)`;
    const d = UT.probeDerived({ freq: S.freq, crystal: S.crystal, angle: S.angle, wave: S.wave }, C.material);
    const cp = couplingNow();
    $('probeInfo').textContent =
      `${S.wave === 'L' ? 'Gelombang longitudinal' : 'Gelombang geser'} v = ${trueV()} m/s · λ = ${d.lambda.toFixed(2)} mm · near field ≈ ${d.N.toFixed(0)} mm · sebaran berkas −6 dB ≈ ±${(d.gamma6 / DEG).toFixed(1)}°`
      + (spec.R ? ` · celah tepi wedge ${cp.gap.toFixed(2)} mm, rugi kopling ≈ ${cp.lossDb.toFixed(1)} dB` : '');
    const mat = `${C.material.name} (vL ${C.material.vL}, vT ${C.material.vT} m/s)`;
    $('specInfo').textContent = spec.type === 'iiw'
      ? `Blok IIW V1 (ISO 2400): 300 × 100 mm, R100, Ø50 (pusat 35 mm dari ujung, 27 mm dari sisi A), Ø1,5 (15 mm dari sisi B). Dimensi lubang diturunkan dari skala sudut pada blok. ${mat}.`
      : spec.type === 'v2'
        ? `Blok V2 (ISO 7963): R25 dan R50 sepusat di sisi atas, panjang 75 mm, lubang Ø5 sedalam 20 mm di bawah titik pusat, sisi miring ${UT.V2.slantDeg}° menyinggung R25 (lubang ${UT.v2Geometry().d.toFixed(1)} mm dari sisi miring). ${mat}.`
      : spec.type === 'asme'
        ? `Tebal blok = T = ${spec.T} mm. SDH Ø${spec.sdhDiameter} mm pada kedalaman ${(spec.T / 4).toFixed(1)}, ${(spec.T / 2).toFixed(1)}, ${(spec.T * 0.75).toFixed(1)} mm.${spec.R ? ` Blok lengkung D = ${spec.OD} mm.` : ''} ${mat}.`
        : spec.isPipe
          ? `${mat}. Pipa OD ${spec.OD} mm, keliling ${spec.yLen.toFixed(0)} mm (jam 12 di y = 0).`
          : isTub() ? `${mat}. Tebal pelat T = tebal brace (untuk blok DAC). Keliling brace ${spec.yLen.toFixed(0)} mm (φ = 0° di heel).` : `${mat}. Panjang las ${spec.yLen} mm.`;
  }

  function renderBlockHelp() {
    const el = $('blockHelp');
    let html = '';
    const m = spec.marks || {};
    if (spec.type === 'iiw' || spec.type === 'v2') {
      const lines = ['<b>Pembacaan pada blok</b>'];
      if (m.centerX != null && m.indexRef !== false) {
        const { xf } = UT.probeExtent(S.probeX, dir(), H);
        lines.push(`Muka depan probe → tanda ${spec.type === 'v2' ? 'pusat (0)' : 'pusat R100'}: <b>${(dir() * (xf - m.centerX)).toFixed(1)} mm</b>`);
      }
      if (m.scale) {
        const idx = userIndexX(), sc = m.scale;
        const sg = sc.sign || 1; // +1: skala di kanan lubang (berkas ←), −1: skala di kiri lubang (berkas →)
        let ang = '–';
        if (dir() === -sg && sg * (idx - sc.hx) > 0) ang = `${(Math.atan(Math.abs(idx - sc.hx) / sc.hz) / DEG).toFixed(1)}°`;
        const hole = spec.type === 'v2' ? 'Ø5' : spec.face === 'B' ? 'Ø1,5' : 'Ø50';
        lines.push(`Skala sudut pada tanda index: <b>${ang}</b>${dir() !== -sg ? ` <span class="muted">(arahkan berkas ${sg > 0 ? '←' : '→'} ke ${hole})</span>` : ''}`);
      }
      if (spec.type === 'v2' && spec.face === 'B') {
        lines.push(`<span class="muted">Sisi miring: cek sudut 65°–75° dengan lubang Ø5 (jarak ≈ ${m.scale.hz.toFixed(1)} mm dari permukaan). Tanda 0 tepat di atas lubang.</span>`);
      } else if (spec.type === 'v2') {
        lines.push('<span class="muted">Menghadap R25 (berkas ←): echo 25, 100, 175 mm. Menghadap R50 (berkas →): echo 50, 125, 200 mm. Sudut > 65° dicek dari sisi miring. Probe miniatur: wedge boleh menggantung di tepi blok.</span>');
      } else if (spec.face === 'B') {
        lines.push('<span class="muted">Sisi B: cek sudut 70°–80° dengan lubang Ø1,5 (15 mm dari permukaan). Untuk R100 dan Ø50 pakai sisi A.</span>');
      } else {
        lines.push('<span class="muted">Echo R100 seharusnya di 100 mm dan 200 mm. Cek sudut 35°–76° dengan lubang Ø50.</span>');
      }
      html = lines.join('<br>');
    } else if (isPar()) {
      html = spec.weld.capH > 0
        ? '<b>Scan sejajar las</b><br><span class="warn">Cap masih ada: probe tidak bisa diletakkan di atas las.</span> <span class="muted">Dari samping las, berkas sejajar tidak mengenai cacat di tengah las. Hilangkan centang “Cap” (cap digerinda rata) untuk scan di atas las.</span>'
        : '<b>Scan sejajar las</b><br><span class="muted">Berkas searah sumbu las untuk mencari cacat melintang. ← → menggeser probe sepanjang las, ↑ ↓ menggeser probe melintang las.</span>';
    } else if (spec.type === 'asme') {
      html = '<span class="muted">Rekam DAC: maksimalkan tiap echo SDH. Gunakan “puncak gate = 80%” hanya untuk titik pertama, lalu jangan ubah gain saat merekam titik berikutnya.</span>';
    } else {
      html = '<span class="muted">Kalibrasi probe dilakukan di blok IIW V1 atau V2, DAC di blok kalibrasi ASME.</span>';
    }
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }

  // ---------------------------------------------------------------- interaksi probe
  /** Batas X probe berubah menurut penampang lokal (tubular). */
  function clampProbeX() {
    const lim = limits();
    const nx = Math.min(lim.max, Math.max(lim.min, S.probeX));
    if (nx !== S.probeX) { S.probeX = nx; simDirty = true; }
  }
  function moveProbeTo(x) {
    const lim = limits();
    const nx = Math.min(lim.max, Math.max(lim.min, x));
    if (nx !== S.probeX) { S.probeX = nx; simDirty = true; }
  }
  function moveProbeY(y) {
    if (isTub()) {
      const ny = ((y % spec.yLen) + spec.yLen) % spec.yLen;
      if (ny !== S.probeY) { S.probeY = ny; simDirty = true; clampProbeX(); }
      return;
    }
    if (isKor()) {
      const ny = Math.min(spec.yLen - 3, Math.max(3, y));
      if (ny !== S.probeY) { S.probeY = ny; simDirty = true; }
      return;
    }
    if (!isWeld()) return;
    const hw = UT.PROBE_WIDTH / 2;
    const ny = isPar() ? UT.lateralLimit(spec, y) : spec.isPipe ? ((y % spec.yLen) + spec.yLen) % spec.yLen : Math.min(spec.yLen - hw, Math.max(hw, y));
    if (ny !== S.probeY) { S.probeY = ny; simDirty = true; }
  }
  function ensureView() {
    if (view && !UT.probeInView(view, S.probeX, dir(), H)) view = null;
  }

  let drag = null;
  let tubPick = null;
  /** Pilih posisi φ dari klik pada garis las di tampilan 3D. */
  function pickTub(px, py) {
    if (!tubPick) return;
    let best = null;
    tubPick.forEach((p) => { const d = Math.hypot(p.x - px, p.y - py); if (!best || d < best.d) best = { d, phi: p.phi }; });
    if (best && best.d < 40) moveProbeY((best.phi * Math.PI / 180) * spec.J.r);
  }
  function canvasPos(cv, e) {
    const r = cv.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }
  function startDrag(cv, e, withY) {
    if (!view) return;
    const { px, py } = canvasPos(cv, e);
    if (withY && isTub()) {
      drag = { cv, tub3d: true };
      pickTub(px, py);
      cv.setPointerCapture(e.pointerId);
      cv.focus({ preventScroll: true });
      return;
    }
    if (withY && isPar() && topView && topLay) {
      // Tampak atas saat scan sejajar: mendatar = lateral (melintang las), tegak = sepanjang las
      drag = { cv, parTop: true };
      moveProbeY(UT.viewToWorld(topView, px, py).x);
      moveProbeTo(topLay.yOf(py));
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('dragging');
      cv.focus({ preventScroll: true });
      return;
    }
    const tv = withY && topView ? topView : view;
    const x = UT.viewToWorld(tv, px, py).x;
    const ex = UT.probeExtent(S.probeX, dir(), H);
    const onProbe = x >= Math.min(ex.xf, ex.xb) - 3 && x <= Math.max(ex.xf, ex.xb) + 3;
    drag = { cv, withY, off: onProbe ? S.probeX - x : 0, offY: 0 };
    if (withY && topLay) {
      const y = topLay.yOf(py);
      const near = Math.abs(y - S.probeY) < UT.PROBE_WIDTH;
      drag.offY = near && onProbe ? S.probeY - y : 0;
      if (!(near && onProbe)) moveProbeY(y);
    }
    if (!onProbe) moveProbeTo(x);
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('dragging');
    cv.focus({ preventScroll: true });
  }
  function moveDrag(e) {
    if (!drag) return;
    const { px, py } = canvasPos(drag.cv, e);
    if (drag.tub3d) { pickTub(px, py); return; }
    if (drag.parTop) {
      moveProbeY(UT.viewToWorld(topView, px, py).x);
      moveProbeTo(topLay.yOf(py));
      return;
    }
    moveProbeTo(UT.viewToWorld(drag.withY && topView ? topView : view, px, py).x + drag.off);
    if (drag.withY && topLay) moveProbeY(topLay.yOf(py) + drag.offY);
  }
  function endDrag() {
    if (drag) drag.cv.classList.remove('dragging');
    drag = null;
    ensureView();
  }
  [[cvS, false], [cvT, true]].forEach(([cv, withY]) => {
    cv.addEventListener('pointerdown', (e) => startDrag(cv, e, withY));
    cv.addEventListener('pointermove', moveDrag);
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 0.5;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        moveProbeTo(S.probeX + (e.key === 'ArrowRight' ? step : -step));
        ensureView();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (isWeld() || isKor() || isTub())) {
        e.preventDefault();
        moveProbeY(S.probeY + (e.key === 'ArrowDown' ? step : -step));
      }
    });
  });

  cvA.addEventListener('pointermove', (e) => {
    const r = cvA.getBoundingClientRect();
    const lay = UT.ascanLayout(szA.w, szA.h);
    const x = e.clientX - r.left - lay.L;
    const v = x < 0 || x > lay.w ? null : lastAx.delay + (x / lay.w) * lastAx.range;
    if (isTech('tofd') && isWeld()) tofd.hoverT = v; else hoverSP = v;
  });
  cvA.addEventListener('pointerleave', () => { hoverSP = null; tofd.hoverT = null; });

  // ---------------------------------------------------------------- citra: B-scan / S-scan / D-scan
  function imgVisible() {
    if (isTech('paut')) return true;
    if (isTech('tofd')) return isWeld();
    return !!(img && (img.meta.kind === 'bscan' || img.meta.kind === 'cscan'));
  }

  /** C-scan peta tebal pelat korosi: grid 2 mm, tebal dari echo pertama di dalam Gate A. */
  function startCscan() {
    if (!isKor()) return;
    const step = 2.5, cols = Math.round(spec.xMax / step) + 1, rows = Math.round(spec.yLen / step) + 1;
    const c = cal();
    const g0 = S.gateStart, g1 = S.gateStart + S.gateWidth, lvl = S.gateLevel;
    const spStart = UT.spTrueFromUser(Math.max(0, g0 - 1), c), spEnd = UT.spTrueFromUser(g1 + 1, c);
    const n = Math.max(300, Math.ceil((spEnd - spStart) / 0.03));
    const gl = C.GAIN_K * Math.pow(10, S.gain / 20);
    const spOf = (i) => UT.spUserFromTrue(spStart + (i * (spEnd - spStart)) / (n - 1), c);
    const meta = { kind: 'cscan', step, min: null };
    img = new UT.ProgressiveScan(cols, rows, (ci) => {
      const out = new Float32Array(rows);
      for (let r = 0; r < rows; r++) {
        const s = UT.simulateStraight({ probe: { x: ci * step, y: r * step, freq: S.freq, crystal: S.crystal, dual: isDual() }, spec, mat: C.material, spStart, spEnd, n, fast: true });
        const t = UT.firstEchoSP(s.re, gl, spOf, g0, g1, lvl);
        out[r] = t == null ? NaN : t;
        if (t != null && (!meta.min || t < meta.min.t)) meta.min = { t, x: ci * step, y: r * step };
      }
      return out;
    }, meta);
    imgKey = 'c' + Date.now();
  }

  function startBscan(axis) {
    const rows = 256, n = 2400;
    const meta = { kind: 'bscan', axis, delay: S.delay, range: S.range };
    if (axis === 'y') {
      if (!isWeld() && !isTub()) return;
      const cols = 151, step = spec.yLen / (cols - 1), x = S.probeX, ang = physAngle();
      Object.assign(meta, { x0: 0, x1: spec.yLen });
      img = new UT.ProgressiveScan(cols, rows, (c) => UT.envelopeBins(simAt(x, c * step, ang, n).re, rows), meta);
    } else {
      const lim = limits(), y = S.probeY, ang = physAngle();
      const cols = Math.max(20, Math.min(200, Math.round(lim.max - lim.min) + 1));
      Object.assign(meta, { x0: lim.min, x1: lim.max });
      img = new UT.ProgressiveScan(cols, rows, (c) => UT.envelopeBins(simAt(lim.min + (c * (lim.max - lim.min)) / (cols - 1), y, ang, n).re, rows), meta);
    }
    imgKey = 'b' + Date.now();
  }

  function updateImage() {
    if (isE()) {
      const key = ['e', specVersion, S.probeX, S.probeY, S.side, S.delay, S.range, S.velocity, S.zero, S.grain, H.front, H.zero, S.pautEAngle, S.pautFocus].join('|');
      if (key !== imgKey) {
        imgKey = key;
        const nb = UT.PAUT.eBeams, rows = 240, x0 = S.probeX;
        img = new UT.ProgressiveScan(nb, rows, (i) => UT.envelopeBins(simAt(x0 + UT.escanOffset(i), S.probeY, S.pautEAngle, 1600).re, rows),
          { kind: 'escan', x0: x0 + UT.escanOffset(0), x1: x0 + UT.escanOffset(nb - 1), delay: S.delay, range: S.range });
      }
    } else if (isTech('paut')) {
      const key = ['s', specVersion, S.probeX, S.probeY, S.side, S.delay, S.range, S.velocity, S.zero, S.grain, H.front, H.zero, S.pautFocus].join('|');
      if (key !== imgKey) {
        imgKey = key;
        const angles = UT.pautAngles(), rows = 240;
        img = new UT.ProgressiveScan(angles.length, rows, (i) => UT.envelopeBins(simAt(S.probeX, S.probeY, angles[i], 1600).re, rows), { kind: 'sscan', angles });
      }
    } else if (isTech('tofd') && isWeld()) {
      const key = ['d', specVersion, tofdS(), S.grain].join('|');
      if (key !== imgKey) {
        imgKey = key;
        const W = UT.tofdWindow(tofdS(), spec.T, C.material.vL);
        const rows = 260, cols = 151, step = spec.yLen / (cols - 1);
        img = new UT.ProgressiveScan(cols, rows, (c) => UT.signedBins(UT.simulateTOFD(tofdOpts(c * step, W.tStart, W.tEnd, 1300)).re, rows), { kind: 'dscan', W, step });
      }
    }
    if (img && img.done < img.count) img.step(10);
  }

  function imgOpts(gl) {
    const m = img.meta;
    if (m.kind === 'sscan') {
      return { angles: m.angles, rows: img.rows, data: img.data, done: img.done, gainLin: gl,
        spStart: Math.max(0, S.delay), spEnd: S.delay + S.range, T: spec.T, selAngle: S.pautAngle };
    }
    if (m.kind === 'dscan') {
      const W = m.W, Sx = tofdS(), vL = C.material.vL;
      const hl = [];
      if (tofd.mA != null) hl.push({ y: UT.tofdTime(tofd.mA, Sx, vL), color: '#ff8c00', label: `A ${tofd.mA.toFixed(1)} mm` });
      if (tofd.mB != null) hl.push({ y: UT.tofdTime(tofd.mB, Sx, vL), color: '#7b2cbf', label: `B ${tofd.mB.toFixed(1)} mm` });
      return { cols: img.count, rows: img.rows, data: img.data, done: img.done, gainLin: gl, rf: true,
        xMin: 0, xMax: spec.yLen, xLabel: 'posisi sepanjang las y (mm)', yMin: W.tStart, yMax: W.tEnd,
        yLabel: 'kedalaman (mm)', yFmt: (t) => { const d = UT.tofdDepth(t, Sx, vL); return d == null ? '' : d.toFixed(0); },
        hLines: hl, vLines: [{ x: S.probeY, color: '#0077cc', dash: [4, 3] }], cursorY: tofd.hoverT };
    }
    if (m.kind === 'cscan') {
      return { cols: img.count, rows: img.rows, data: img.data, done: img.done, T: spec.T, xMax: spec.xMax, yMax: spec.yLen,
        probe: { x: S.probeX, y: S.probeY }, min: m.min };
    }
    if (m.kind === 'escan') {
      return { cols: img.count, rows: img.rows, data: img.data, done: img.done, gainLin: gl, rf: false,
        xMin: m.x0, xMax: m.x1, xLabel: `exit point berkas x (mm) · ${UT.PAUT.eBeams} berkas ${S.pautEAngle}°`,
        yMin: m.delay, yMax: m.delay + m.range, yLabel: 'SP (mm)',
        vLines: [{ x: S.probeX + beamOff(), color: '#7b2cbf', dash: [4, 3] }] };
    }
    return { cols: img.count, rows: img.rows, data: img.data, done: img.done, gainLin: gl, rf: false,
      xMin: m.x0, xMax: m.x1, xLabel: m.axis === 'y' ? 'posisi sepanjang las y (mm)' : 'posisi exit point x (mm)',
      yMin: m.delay, yMax: m.delay + m.range, yLabel: 'SP (mm)',
      vLines: [{ x: m.axis === 'y' ? S.probeY : S.probeX, color: '#0077cc', dash: [4, 3] }] };
  }

  function drawImage(ri, gl) {
    szI = ri;
    if (!img) return;
    const key = [img.done, imgKey, gl, ri.w, ri.h, ri.changed, S.pautAngle, S.pautBeam, S.probeY, S.probeX, tofd.mA, tofd.mB, tofd.hoverT].join('|');
    if (key === imgDrawKey) return;
    imgDrawKey = key;
    ctxI.setTransform(ri.dpr, 0, 0, ri.dpr, 0, 0);
    const lay = UT.imageLayout(ri.w, ri.h);
    if (img.meta.kind === 'sscan') UT.drawSScan(ctxI, lay, imgOpts(gl));
    else if (img.meta.kind === 'cscan') UT.drawCScan(ctxI, lay, imgOpts(gl));
    else UT.drawImageScan(ctxI, lay, imgOpts(gl));
  }

  cvI.addEventListener('pointermove', (e) => {
    if (!img || img.meta.kind !== 'dscan') return;
    const lay = UT.imageLayout(szI.w, szI.h);
    const { py } = canvasPos(cvI, e);
    const W = img.meta.W;
    tofd.hoverT = py < lay.T || py > lay.T + lay.h ? null : W.tStart + ((py - lay.T) / lay.h) * (W.tEnd - W.tStart);
  });
  cvI.addEventListener('pointerleave', () => { tofd.hoverT = null; });
  cvI.addEventListener('click', (e) => {
    if (!img) return;
    const lay = UT.imageLayout(szI.w, szI.h);
    const { px, py } = canvasPos(cvI, e);
    const m = img.meta;
    if (m.kind === 'sscan') {
      const a = UT.sscanAngleAt(lay, imgOpts(1), px, py);
      if (a == null) return;
      S.pautAngle = Math.round(Math.min(UT.PAUT.maxA, Math.max(UT.PAUT.minA, a)));
      simDirty = true;
      updateInfo();
      renderImgBar();
      return;
    }
    const fx = (px - lay.L) / lay.w;
    if (fx < 0 || fx > 1) return;
    if (m.kind === 'cscan') {
      const fy = (py - lay.T) / lay.h;
      if (fy < 0 || fy > 1) return;
      moveProbeTo(fx * spec.xMax);
      moveProbeY(fy * spec.yLen);
      ensureView();
      return;
    }
    if (m.kind === 'escan') {
      S.pautBeam = Math.round(fx * (UT.PAUT.eBeams - 1));
      simDirty = true;
      updateInfo();
      renderImgBar();
      return;
    }
    if (m.kind === 'dscan') {
      moveProbeY(fx * spec.yLen);
      const t = m.W.tStart + ((py - lay.T) / lay.h) * (m.W.tEnd - m.W.tStart);
      const d = UT.tofdDepth(t, tofdS(), C.material.vL);
      if (d != null && py >= lay.T && py <= lay.T + lay.h) {
        tofd[tofd.nextMark] = d;
        tofd.nextMark = tofd.nextMark === 'mA' ? 'mB' : 'mA';
      }
      return;
    }
    const pos = m.x0 + fx * (m.x1 - m.x0);
    if (m.axis === 'y') moveProbeY(pos); else { moveProbeTo(pos); ensureView(); }
  });

  /** Grafik batang delay law aperture aktif (ns). */
  function delayLawSVG(angle, F) {
    const d = UT.delayLaw(angle, F, C.material.vT);
    const mx = Math.max(1, ...d), W = 150, Hh = 34, bw = W / d.length;
    const bars = d.map((v, i) => { const h = (v / mx) * (Hh - 4); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(Hh - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="#7b2cbf"/>`; }).join('');
    return `<span class="delaylaw" title="Delay law: waktu tunda tiap elemen agar muka gelombang membelok ke ${angle}°${F ? ' dan terfokus' : ''}">
      <svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">${bars}</svg>
      <span class="small muted">delay law ${angle}°${F ? ', fokus' : ''} · maks ${mx.toFixed(0)} ns</span></span>`;
  }

  // Bilah kontrol citra sesuai teknik
  function renderImgBar() {
    const bar = $('imgBar');
    let html = '';
    if (isTech('paut')) {
      const foc = [0, 10, 15, 20, 25, 30, 40].map((f) => `<option value="${f}"${f === S.pautFocus ? ' selected' : ''}>${f ? f + ' mm' : 'tanpa fokus'}</option>`).join('');
      const modeBtns = `<span class="seg"><button type="button" class="btn${isE() ? '' : ' on'}" data-b="modeS">S-scan</button><button type="button" class="btn${isE() ? ' on' : ''}" data-b="modeE">E-scan</button></span>`;
      const ctl = isE()
        ? `<span class="muted">${UT.PAUT.total} elemen, aperture aktif ${UT.PAUT.elements} digeser 1 elemen · klik gambar untuk memilih berkas</span>
          <label class="inl">Sudut <select id="inPautEA">${[45, 55, 60, 70].map((a) => `<option${a === S.pautEAngle ? ' selected' : ''}>${a}</option>`).join('')}</select>°</label>
          <label class="inl">Berkas <input id="inPautB" type="range" min="0" max="${UT.PAUT.eBeams - 1}" step="1" value="${S.pautBeam}"> <b>${S.pautBeam + 1}</b></label>`
        : `<span class="muted">${UT.PAUT.elements} elemen · ${UT.PAUT.freq} MHz · ${UT.PAUT.minA}–${UT.PAUT.maxA}° · klik sektor untuk memilih sudut</span>
          <label class="inl">Sudut A-scan <input id="inPautA" type="range" min="${UT.PAUT.minA}" max="${UT.PAUT.maxA}" step="1" value="${S.pautAngle}"> <b>${S.pautAngle}°</b></label>`;
      const N = (UT.PAUT.aperture ** 2) / (4 * (C.material.vT / (UT.PAUT.freq * 1000)));
      const fsp = focusSP(physAngle());
      const fNote = S.pautFocus > 0 ? (fsp >= 0.95 * N ? ` <span class="warn">fokus SP ${fsp.toFixed(0)} mm ≥ near field ${N.toFixed(0)} mm: tidak efektif</span>` : ` <span class="muted">SP fokus ${fsp.toFixed(0)} mm (near field ${N.toFixed(0)} mm)</span>`) : '';
      html = `${modeBtns} ${ctl}
        <label class="inl">Fokus (kedalaman) <select id="inPautF">${foc}</select></label>${fNote}
        ${delayLawSVG(physAngle(), fsp)}`;
    } else if (isTech('tofd')) {
      html = isWeld()
        ? (isPar() ? '<b>TOFD</b> <span class="muted">tidak tersedia untuk scan sejajar las.</span>' : `<b>TOFD D-scan</b> <label class="inl">PCS <input id="inPcs" type="number" min="10" max="300" step="1" value="${(2 * tofdS()).toFixed(0)}"> mm</label>
          <button type="button" class="btn" data-b="pcsAuto">PCS otomatis (⅔T)</button>
          <button type="button" class="btn" data-b="clearMarks">Hapus penanda</button>
          <span class="muted small">Klik gambar: pindahkan probe ke posisi y tersebut dan pasang penanda kedalaman A/B.</span>`)
        : '<b>TOFD</b> <span class="muted">hanya untuk benda uji las.</span>';
    } else if (isKor()) {
      html = `<b>C-scan</b> <button type="button" class="btn" data-b="c">Rekam peta tebal (seluruh pelat)</button>
        ${img && img.meta.kind === 'cscan' ? '<button type="button" class="btn" data-b="close">Tutup</button>' : ''}
        <span class="muted small">Tebal = SP echo pertama yang melewati level Gate A (atur gate &amp; gain dulu). Klik peta untuk memindahkan probe; ↑ ↓ menggeser y.</span>`;
    } else {
      html = `<b>B-scan</b> <button type="button" class="btn" data-b="y"${(isWeld() && !isPar()) || isTub() ? '' : ' disabled'}>${isTub() ? 'Rekam keliling brace (φ)' : 'Rekam sepanjang las (y)'}</button>
        <button type="button" class="btn" data-b="x">${isPar() ? 'Rekam sepanjang las (arah berkas)' : 'Rekam melintang (x)'}</button>
        ${img && img.meta.kind === 'bscan' ? '<button type="button" class="btn" data-b="close">Tutup</button>' : ''}
        <span class="muted small">Klik gambar untuk memindahkan probe.</span>`;
    }
    if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
  }

  function setTechnique(t) {
    if (t === S.technique) return;
    gainMem[S.technique] = S.gain;
    if (t === 'tofd' && !isWeld()) setSpecimen('las');
    if (t === 'paut' && isKor()) setSpecimen('las');
    if (t === 'tofd' && spec.seam) { S.seam = false; rebuild(); }
    if (t === 'tofd' && S.orient === 'sejajar') setOrient('tegak');
    S.technique = t;
    if (gainMem[t] != null) S.gain = gainMem[t];
    else if (t === 'tofd') S.gain = 46;
    img = null;
    imgKey = '';
    tofd.mA = tofd.mB = tofd.hoverT = null;
    tofd.nextMark = 'mA';
    view = null;
    simDirty = true;
    updateInfo();
    syncControls();
  }

  // ---------------------------------------------------------------- render
  function resizeCanvas(cv, h) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.parentElement.clientWidth;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = h + 'px';
      return { w, h, dpr, changed: true };
    }
    return { w, h, dpr, changed: false };
  }

  function frame() {
    const stacked = window.matchMedia('(max-width: 900px)').matches;
    const wS = cvS.parentElement.clientWidth;
    const ext = UT.viewExtent(aspec(), S, dir(), H);
    const hS = Math.round(Math.min(520, Math.max(stacked ? 170 : 240, (wS * (ext.z1 - ext.z0)) / (ext.x1 - ext.x0))));
    const hT = isWeld() ? (stacked ? 110 : 130) : isTub() ? (stacked ? 190 : 220) : 0;
    const wA = cvA.parentElement.clientWidth;
    const hSide = Math.max(300, hS + (hT ? hT + 24 : 0));
    const showImg = imgVisible();
    $('imgWrap').hidden = !showImg;
    const rs = resizeCanvas(cvS, hS);
    let hA = stacked ? Math.round(Math.min(420, Math.max(240, wA * 0.6))) : hSide;
    let hI = 0;
    if (showImg) {
      hI = stacked ? Math.round(Math.min(380, Math.max(240, wA * 0.7))) : Math.max(220, Math.round(hSide * 0.58));
      hA = stacked ? 220 : Math.max(180, hSide - hI);
    }
    const ra = resizeCanvas(cvA, hA);
    szA = ra;
    if (rs.changed) view = null;
    if (!view) {
      const ext = UT.viewExtent(aspec(), S, dir(), H);
      if (spec.seam && !isPar()) {
        // anulus: dinding melengkung turun di tepi tampilan
        const xm = Math.max(Math.abs(ext.x0), Math.abs(ext.x1));
        ext.z1 = Math.max(ext.z1, spec.R - (spec.R - spec.T) * Math.cos(Math.min(1.4, xm / spec.R)) + 4);
      }
      view = UT.computeView(rs.w, rs.h, ext);
    }
    if (simDirty) runSim();

    const tofdOn = isTech('tofd') && isWeld();
    // Sinyal tampilan (%FSH) + noise elektronik
    const gl = C.GAIN_K * Math.pow(10, S.gain / 20);
    const n = sim.n;
    const disp = new Float32Array(n);
    const en = C.ELECTRONIC_NOISE;
    const rf = tofdOn || S.rect === 'rf';
    const tcgOn = tcgActive();
    let maxAmp = 0;
    for (let i = 0; i < n; i++) {
      let v = (sim.re[i] + (Math.random() - 0.5) * 2 * en) * gl;
      if (tcgOn) v *= UT.tcgFactor(dac, S.delay + (i * S.range) / (n - 1));
      disp[i] = rf ? v : Math.abs(v);
      const a = Math.abs(v);
      if (a > maxAmp) maxAmp = a;
    }
    const axDelay = tofdOn ? sim.tStart : S.delay;
    const axRange = tofdOn ? sim.tEnd - sim.tStart : S.range;
    lastAx = { delay: axDelay, range: axRange };
    const spOf = (i) => axDelay + (i * axRange) / (n - 1);
    const gStart = S.gateStart, gEnd = S.gateStart + S.gateWidth;
    const peak = tofdOn ? { amp: 0, sp: null, idx: -1, triggered: false } : UT.gatePeak(disp, spOf, gStart, gEnd, S.gateLevel);
    lastPeak = peak;
    $('satWarn').hidden = maxAmp < 100 || tofdOn;

    const dacOn = !tofdOn && S.showDac && dac.points.length > 0;
    ctxA.setTransform(ra.dpr, 0, 0, ra.dpr, 0, 0);
    UT.drawAscan(ctxA, UT.ascanLayout(ra.w, ra.h), {
      disp, rect: rf ? 'rf' : 'full', delay: axDelay, range: axRange,
      xLabel: tofdOn ? 'waktu (µs)' : 'SP (mm)',
      gate: tofdOn ? null : { start: gStart, end: gEnd, level: S.gateLevel },
      peak, hoverSP: tofdOn ? tofd.hoverT : hoverSP,
      // Dengan TCG, kurva DAC menjadi garis datar di tinggi referensi
      dacCurve: dacOn ? (tcgOn ? (sp) => (UT.dacAt(dac, sp, S.gain) == null ? null : UT.tcgLevel(dac, S.gain)) : (sp) => UT.dacAt(dac, sp, S.gain)) : null,
      dacPoints: dacOn ? dac.points.map((p) => ({ sp: p.sp, amp: tcgOn ? UT.tcgLevel(dac, S.gain) : Math.pow(10, (p.db + S.gain) / 20) })) : null,
    });

    const uIdx = userIndexX() + beamOff();
    const spMaxTrue = Math.max(1, UT.spTrueFromUser(S.delay + S.range, cal()));
    updateCoverage();
    ctxS.setTransform(rs.dpr, 0, 0, rs.dpr, 0, 0);
    const pathNow = isTub() ? UT.traceTubular(tubLocal().sec, { x0: S.probeX + beamOff(), angle: physAngle(), spMax: spMaxTrue + 5 })
      : usePath() && Math.abs(physAngle()) > 1 ? truePath(S.probeX + beamOff(), physAngle(), spMaxTrue + 5) : null;
    UT.drawSection(ctxS, view, {
      spec: aspec(), state: S, dir: dir(), H: Object.assign({}, H, { angle: physAngle() }), derived, spMaxTrue,
      crystal: probeCrystal(),
      gate: tofdOn ? null : { start: gStart, end: gEnd },
      peakSP: peak.triggered ? peak.sp : null,
      hoverSP: tofdOn ? null : hoverSP, userIndexX: uIdx, angleUser: userAngle(), showTruth: S.showDefects,
      technique: tofdOn ? 'tofd' : S.technique,
      pautAngles: isTech('paut') && !isE() ? [UT.PAUT.minA, UT.PAUT.maxA] : null,
      escan: isE() ? { x0: S.probeX + UT.escanOffset(0), x1: S.probeX + UT.escanOffset(UT.PAUT.eBeams - 1), angle: S.pautEAngle } : null,
      beamX: isTech('paut') ? S.probeX + beamOff() : null,
      focus: focusSP(physAngle()), lambda: derived ? derived.lambda : null,
      tofd: tofdOn ? { S: tofdS(), angle: UT.TOFD.angle, hoverDepth: tofd.hoverT == null ? null : UT.tofdDepth(tofd.hoverT, tofdS(), C.material.vL) } : null,
      coverage: S.plan.on && isWeld() && !isPar() && !tofdOn && !spec.seam ? cov : null,
      path: pathNow, userPath: pathNow ? userPathNow(spMaxTrue + 5) : null, pathHitsID: pathNow ? pathNow.hitsID : null,
      seamR: spec.seam && !isPar() ? spec.R : null, showUserPath: !!pathNow && (isTub() || (anisoOn() && !spec.seam)),
    });

    if (hT && isTub()) {
      const rt = resizeCanvas(cvT, hT);
      topLay = null;
      ctxT.setTransform(rt.dpr, 0, 0, rt.dpr, 0, 0);
      const loc = tubLocal();
      tubPick = UT.drawTubular3D(ctxT, rt.w, rt.h, { J: spec.J, phi: loc.phi, probeDist: Math.max(10, loc.sec.Be[0] - S.probeX),
        truth: loc.scene.truth, showTruth: S.showDefects });
    } else if (hT) {
      const rt = resizeCanvas(cvT, hT);
      topLay = UT.topLayout(rt.h, spec.yLen);
      // Saat scan sejajar, penampang memakai sumbu sepanjang las → tampak atas memakai skala melintang sendiri
      topView = isPar()
        ? { s: rt.w / 160, ox: rt.w / 2, oz: 0, x0: -80, x1: 80, cw: rt.w }
        : Object.assign({}, view, { cw: rt.w });
      ctxT.setTransform(rt.dpr, 0, 0, rt.dpr, 0, 0);
      UT.drawTopView(ctxT, topView, topLay, {
        spec, state: S, dir: dir(), H: Object.assign({}, H, { angle: physAngle() }), sizing, showTruth: S.showDefects, par: isPar(),
        tofdS: tofdOn ? tofdS() : null,
      });
    } else {
      topLay = null;
    }

    if (showImg) {
      updateImage();
      const ri = resizeCanvas(cvI, hI);
      drawImage(ri, gl);
    }

    updateReadouts(peak, uIdx);
    renderBlockHelp();
    for (let i = 0; i < frameHooks.length; i++) frameHooks[i](peak);
    requestAnimationFrame(frame);
  }

  const RO_LABELS = {
    def: ['Amplitudo', 'Terhadap DAC', 'Sound path (SP)', 'Kedalaman', 'Jarak permukaan', null, 'Leg', null],
    tofd: ['Waktu (kursor)', 'Kedalaman (kursor)', 'Penanda A', 'Penanda B', 'Tinggi |B − A|', 'PCS', 'Lateral / back wall', 'Posisi probe (y)'],
  };
  const RO_IDS = ['roAmpL', 'roDacL', 'roSPL', 'roDepthL', 'roSDL', 'roXLabel', 'roLegL', 'roPLabel'];
  let roMode = '';
  function setRoLabels(mode) {
    if (mode === roMode) return;
    roMode = mode;
    RO_LABELS[mode].forEach((t, i) => { if (t) $(RO_IDS[i]).textContent = t; });
    if (mode === 'def') syncControls();
  }

  function updateTofdReadouts() {
    setRoLabels('tofd');
    const Sx = tofdS(), vL = C.material.vL;
    const d = tofd.hoverT == null ? null : UT.tofdDepth(tofd.hoverT, Sx, vL);
    const W = sim.win;
    const ro = {
      amp: tofd.hoverT == null ? '–' : `${tofd.hoverT.toFixed(2)} µs`,
      dac: d == null ? '–' : `${d.toFixed(1)} mm`,
      sp: tofd.mA == null ? '–' : `${tofd.mA.toFixed(1)} mm`,
      depth: tofd.mB == null ? '–' : `${tofd.mB.toFixed(1)} mm`,
      sd: tofd.mA != null && tofd.mB != null ? `${Math.abs(tofd.mB - tofd.mA).toFixed(1)} mm` : '–',
      x: `${(2 * Sx).toFixed(1)} mm`,
      leg: `${W.tLat.toFixed(2)} / ${W.tBw.toFixed(2)} µs`,
      p: `${S.probeY.toFixed(1)} mm`,
    };
    const key = 'tofd' + JSON.stringify(ro);
    if (key === lastRo) return;
    lastRo = key;
    $('roAmp').textContent = ro.amp;
    $('roDac').textContent = ro.dac;
    $('roSP').textContent = ro.sp;
    $('roDepth').textContent = ro.depth;
    $('roSD').textContent = ro.sd;
    $('roX').textContent = ro.x;
    $('roLeg').textContent = ro.leg;
    $('roP').textContent = ro.p;
    $('evalBox').hidden = true;
  }

  let lastRo = '';
  let lastAws = null;
  function updateReadouts(peak, uIdx) {
    if (isTech('tofd') && isWeld()) { updateTofdReadouts(); return; }
    setRoLabels('def');
    const ro = { amp: `${peak.amp.toFixed(0)}%`, dac: '–', sp: '–', depth: '–', sd: '–', x: '–', leg: '–' };
    let pct = null;
    lastPct = null;
    if (peak.triggered) {
      const l = locateNow(peak.sp, uIdx);
      ro.amp = peak.amp >= 100 ? '>100%' : `${peak.amp.toFixed(0)}%`;
      ro.sp = `${fmt(peak.sp)} mm`;
      ro.depth = `${fmt(l.depth)} mm`;
      ro.sd = `${fmt(l.sd)} mm`;
      if (isPar()) {
        ro.x = `y ${fmt(l.x)} mm`;
      } else if (isTub()) {
        ro.x = `X ${fmt(l.x)} mm`;
      } else if (isWeld()) {
        const side = Math.abs(l.x) < 0.05 ? '' : l.x < 0 ? ' (kiri)' : ' (kanan)';
        ro.x = `${l.x >= 0 ? '+' : '−'}${fmt(Math.abs(l.x))} mm${side}`;
      } else {
        ro.x = `${fmt(l.x)} mm`;
      }
      ro.leg = String(l.leg);
      if (dac.points.length) {
        const inRange = UT.dacAt(dac, peak.sp, S.gain) != null;
        const ref = !inRange ? null : tcgActive() ? UT.tcgLevel(dac, S.gain) : UT.dacAt(dac, peak.sp, S.gain);
        if (ref != null) {
          pct = (peak.amp / ref) * 100;
          lastPct = pct;
          const dB = 20 * Math.log10(pct / 100);
          ro.dac = `${pct.toFixed(0)}% (${dB >= 0 ? '+' : ''}${dB.toFixed(1)} dB)`;
        } else ro.dac = 'di luar DAC';
      } else ro.dac = 'belum ada DAC';
    }
    // AWS D1.1: rating indikasi d = a − b − c
    let aws = null;
    lastAws = null;
    if (isRatingCode() && peak.triggered && (isWeld() || isTub()) && userAngle() !== 0) {
      const l = locateNow(peak.sp, uIdx);
      const L = sizing.y1 != null && sizing.y2 != null ? Math.abs(sizing.y2 - sizing.y1) : null;
      const a = UT.awsGainAtRef(S.gain, Math.max(0.5, Math.min(peak.amp, 100)));
      aws = UT.evaluateAWS({ a, b: S.awsB, sp: peak.sp, t: spec.T, angle: S.angleUser, length: L, depth: l.depth, cyclic: S.code === 'aws-cyc' });
      lastAws = aws;
      if (aws.d != null && S.awsB != null) ro.dac = `d ${aws.d >= 0 ? '+' : ''}${aws.d} dB${aws.cls ? ` · kelas ${aws.cls}` : ''}`;
      else ro.dac = 'b belum direkam';
    }
    $('roDacL').textContent = isRatingCode() && (isWeld() || isTub()) ? 'Rating AWS (d)' : 'Terhadap DAC';
    ro.p = isPar() ? `x ${S.probeY >= 0 ? '+' : '−'}${Math.abs(S.probeY).toFixed(1)} mm · y ${S.probeX.toFixed(1)}`
      : isTub() ? `φ ${tubPhi().toFixed(0)}° · ${tubLocal().sec.zone} · Ψ ${tubLocal().sec.psi.toFixed(0)}°`
      : isWeld() ? `${S.probeY.toFixed(1)} mm${spec.isPipe ? ` (${clock(S.probeY)})` : ''}` : `${uIdx.toFixed(1)} mm`;

    // Evaluasi (hanya las)
    let ev = null;
    if ((isWeld() || isTub()) && peak.triggered && userAngle() !== 0) {
      const L = sizing.y1 != null && sizing.y2 != null ? Math.abs(sizing.y2 - sizing.y1) : null;
      const dl = locateNow(peak.sp, uIdx).depth;
      ev = aws
        || (S.code === 'awsN-s' || S.code === 'awsN-c' ? UT.evaluateAWSN({ pctDAC: pct, length: L, depth: dl, t: spec.T, cyclic: S.code === 'awsN-c' }) : null)
        || (S.code === 'awsR' ? UT.evaluateClassR({ pctDAC: pct, length: L, type: S.indType, t: spec.T, D: spec.OD || (spec.J ? 2 * spec.J.r : null) }) : null)
        || UT.evaluateASME({ pctDAC: pct, dacExists: dac.points.length > 0, type: S.indType, length: L, t: spec.T });
    }
    if (isTub()) {
      const ph = tubPhi();
      $('outTubPhi').textContent = `${ph.toFixed(0)}° (${tubLocal().sec.zone}, Ψ = ${tubLocal().sec.psi.toFixed(0)}°)`;
      if (document.activeElement !== $('inTubPhi')) $('inTubPhi').value = String(Math.round(ph) % 360);
      updateInfo();
    }
    const key = JSON.stringify([ro, ev]);
    if (key === lastRo) return;
    lastRo = key;
    $('roAmp').textContent = ro.amp;
    $('roDac').textContent = ro.dac;
    $('roSP').textContent = ro.sp;
    $('roDepth').textContent = ro.depth;
    $('roSD').textContent = ro.sd;
    $('roX').textContent = ro.x;
    $('roLeg').textContent = ro.leg;
    $('roP').textContent = ro.p;
    const box = $('evalBox');
    box.hidden = !ev;
    if (ev) {
      const label = { abaikan: 'Abaikan', terima: 'Dapat diterima', tolak: 'Ditolak', ukur: 'Perlu sizing', nodac: 'Tidak dapat dievaluasi' }[ev.verdict];
      box.className = `evalbox v-${ev.verdict}`;
      box.innerHTML = `<b>Evaluasi ${UT.codeLabel(S.code)}: ${label}</b> <span>${ev.text}</span>`;
    }
  }

  // ---------------------------------------------------------------- API untuk modul edukasi (tutorial, ujian, laporan)
  UT.app = {
    S, sizing, locks, frameHooks,
    get H() { return H; },
    get spec() { return spec; },
    get dac() { return dac; },
    set dac(d) { dac = d; dacMsg = ''; renderDac(); },
    get peak() { return lastPeak; },
    get training() { return training; },
    set training(v) { training = v; },
    rand,
    rebuild, setSpecimen, syncControls, newProbe, clearDac, resetSizing, setGain, renderSizing, renderDac,
    /** Pasang kebenaran probe dari sesi tersimpan. */
    setH(h) { H = Object.assign({}, h); S._prevAngle = S.angle; rebuild(false); },
    applyUserFromTruth, userIndexX, cal,
    setSide,
    setTechnique,
    get tofdMarks() { return { a: tofd.mA, b: tofd.mB }; },
    setOrient,
    isPar,
    setMaterial,
    setWave,
    trueV,
    dir,
    calOk() {
      return UT.calibrationStatus(H, { xValue: S.xValue, angle: S.angleUser, zero: S.zero, velocity: S.velocity }, trueV()).ok;
    },
    /** Pembacaan alat untuk puncak gate saat ini, atau null. */
    reading() {
      if (!lastPeak || !lastPeak.triggered || !spec || isTech('tofd')) return null;
      const l = locateNow(lastPeak.sp, userIndexX());
      return { sp: lastPeak.sp, amp: lastPeak.amp, depth: l.depth, x: l.x, sd: l.sd, leg: l.leg, pct: lastPct };
    },
    forceSim() { simDirty = true; view = null; },
    /** Citra yang sedang tampil (jenis & selesai). */
    get imgKind() { return img ? img.meta.kind : null; },
    get imgDone() { return !!img && img.done >= img.count; },
    get cscanMin() { return img && img.meta.kind === 'cscan' ? img.meta.min : null; },
    /** Keadaan sambungan tubular di posisi probe (null bila bukan tubular). */
    get tub() {
      if (!isTub()) return null;
      const sec = tubLocal().sec;
      return { phi: sec.phi, psi: sec.psi, zone: sec.zone, ideal: UT.tubIdealAngles(sec), type: spec.J.type };
    },
    /** Hasil evaluasi AWS terakhir (null bila tidak ada). */
    get aws() { return lastAws; },
    /** Peta cakupan rencana scan terakhir (null bila tidak aktif). */
    coverage() { updateCoverage(); return S.plan.on ? cov : null; },
  };

  // ---------------------------------------------------------------- start
  rebuild();
  initControls();
  requestAnimationFrame(frame);
})();
