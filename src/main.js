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
  const aspec = () => (isPar() ? UT.parallelSpec(spec) : spec);
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
  const physAngle = () => (isTech('paut') ? S.pautAngle : H.angle);
  const userAngle = () => (isTech('paut') ? S.pautAngle : S.angleUser);
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
    if (H.angle === 0) return -dir() * ((spec.weld ? spec.weld.capHalf : 0) + 45);
    return -dir() * 1.75 * spec.T * tn;
  }

  function limits() {
    return UT.specimenProbeLimits(aspec(), dir(), UT.probeBody(H));
  }

  function clampProbe() {
    if (S.probeX == null) S.probeX = defaultProbeX();
    const lim = limits();
    S.probeX = Math.min(lim.max, Math.max(lim.min, S.probeX));
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
    if (img && img.meta.kind === 'bscan') img = null;
    clampProbe();
    if (resetView) view = null;
    simDirty = true;
    updateInfo();
  }

  function clearDac(reason) {
    if (dac.points.length) dacMsg = `DAC dihapus: ${reason}. Buat ulang DAC di blok kalibrasi ASME.`;
    dac = UT.dacCreate();
    renderDac();
  }

  function newProbe(randomize) {
    H = UT.makeProbeTruth(S.angle, randomize ? rand : null);
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
    const pr = { x, y, dir: dir(), angle, freq: probeFreq(), crystal: probeCrystal(), wave: S.wave };
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
    const pr = { x: S.probeX, y: S.probeY, dir: dir(), angle: physAngle(), freq: probeFreq(), crystal: probeCrystal(), wave: S.wave };
    derived = UT.probeDerived(pr, C.material);
    const n = Math.max(1200, Math.min(9000, Math.ceil((spEnd - spStart) / (derived.lambda / 20))));
    sim = UT.simulate(Object.assign({
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
      else if (a === 'close') { img = null; imgKey = ''; }
      else if (a === 'pcsAuto') { S.tofdS = null; simDirty = true; updateInfo(); }
      else if (a === 'clearMarks') { tofd.mA = tofd.mB = null; tofd.nextMark = 'mA'; }
      bar.dataset.html = '';
      renderImgBar();
    });
    bar.addEventListener('input', (e) => {
      if (e.target.id === 'inPautA') {
        S.pautAngle = +e.target.value;
        simDirty = true;
        updateInfo();
        const o = e.target.parentElement.querySelector('b');
        if (o) o.textContent = `${S.pautAngle}°`;
      }
    });
    bar.addEventListener('change', (e) => {
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
    sel('inGeom', 'geom', null, () => { resetSizing(); rebuild(); renderDac(); });
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
      sizing[k] = UT.locate(lastPeak.sp, userAngle(), spec.T, userIndexX(), dir()).depth;
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
    $('inGeom').value = S.geom;
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
    $('topWrap').hidden = !weld;
    $('sizingCard').hidden = !weld;
    $('inT').disabled = S.specimen === 'iiw' || S.specimen === 'v2' || locks.scenario;
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
    $('sectionTitle').textContent = weld ? (S.geom === 'pipa' ? `Tampilan scanning (penampang aksial dinding pipa OD ${S.OD})`
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
    $('planCard').hidden = !weld;
    $('inPlanOn').checked = !!S.plan.on;
    document.querySelectorAll('[data-plan-angle]').forEach((c) => { c.checked = S.plan.angles.includes(+c.dataset.planAngle); });
    $('inPlanSides').value = S.plan.sides;
    $('inPlanLegs').value = String(S.plan.legs);
    $('inPlanHaz').value = S.plan.haz;
    $('inScenario').value = S.scenario;
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

  function updateInfo() {
    if (!spec) return;
    const hs = spec.T * Math.tan(userAngle() * DEG);
    $('skipInfo').textContent = spec.type === 'iiw' ? `Blok V1 sisi ${spec.face} · 300 × 100 mm`
      : spec.type === 'v2' ? `Blok V2 ${spec.face === 'B' ? 'sisi miring' : 'sisi atas'} · R25 & R50 sepusat, lubang Ø5`
      : isTech('tofd') && isWeld() ? `TOFD · PCS = ${(2 * tofdS()).toFixed(1)} mm · ${UT.TOFD.freq} MHz L-wave ${UT.TOFD.angle}°`
        : userAngle() === 0 ? `Probe lurus 0° · back wall di ${spec.T} mm, ${2 * spec.T} mm, …`
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
          : `${mat}. Panjang las ${spec.yLen} mm.`;
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
  function moveProbeTo(x) {
    const lim = limits();
    const nx = Math.min(lim.max, Math.max(lim.min, x));
    if (nx !== S.probeX) { S.probeX = nx; simDirty = true; }
  }
  function moveProbeY(y) {
    if (!isWeld()) return;
    const hw = UT.PROBE_WIDTH / 2;
    const ny = isPar() ? UT.lateralLimit(spec, y) : spec.isPipe ? ((y % spec.yLen) + spec.yLen) % spec.yLen : Math.min(spec.yLen - hw, Math.max(hw, y));
    if (ny !== S.probeY) { S.probeY = ny; simDirty = true; }
  }
  function ensureView() {
    if (view && !UT.probeInView(view, S.probeX, dir(), H)) view = null;
  }

  let drag = null;
  function canvasPos(cv, e) {
    const r = cv.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }
  function startDrag(cv, e, withY) {
    if (!view) return;
    const { px, py } = canvasPos(cv, e);
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
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isWeld()) {
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
    return !!(img && img.meta.kind === 'bscan');
  }

  function startBscan(axis) {
    const rows = 256, n = 2400;
    const meta = { kind: 'bscan', axis, delay: S.delay, range: S.range };
    if (axis === 'y') {
      if (!isWeld()) return;
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
    if (isTech('paut')) {
      const key = ['s', specVersion, S.probeX, S.probeY, S.side, S.delay, S.range, S.velocity, S.zero, S.grain, H.front, H.zero].join('|');
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
    return { cols: img.count, rows: img.rows, data: img.data, done: img.done, gainLin: gl, rf: false,
      xMin: m.x0, xMax: m.x1, xLabel: m.axis === 'y' ? 'posisi sepanjang las y (mm)' : 'posisi exit point x (mm)',
      yMin: m.delay, yMax: m.delay + m.range, yLabel: 'SP (mm)',
      vLines: [{ x: m.axis === 'y' ? S.probeY : S.probeX, color: '#0077cc', dash: [4, 3] }] };
  }

  function drawImage(ri, gl) {
    szI = ri;
    if (!img) return;
    const key = [img.done, imgKey, gl, ri.w, ri.h, ri.changed, S.pautAngle, S.probeY, S.probeX, tofd.mA, tofd.mB, tofd.hoverT].join('|');
    if (key === imgDrawKey) return;
    imgDrawKey = key;
    ctxI.setTransform(ri.dpr, 0, 0, ri.dpr, 0, 0);
    const lay = UT.imageLayout(ri.w, ri.h);
    if (img.meta.kind === 'sscan') UT.drawSScan(ctxI, lay, imgOpts(gl));
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

  // Bilah kontrol citra sesuai teknik
  function renderImgBar() {
    const bar = $('imgBar');
    let html = '';
    if (isTech('paut')) {
      html = `<b>S-scan</b> <span class="muted">${UT.PAUT.elements} elemen · ${UT.PAUT.freq} MHz · ${UT.PAUT.minA}–${UT.PAUT.maxA}° · klik sektor untuk memilih sudut</span>
        <label class="inl">Sudut A-scan <input id="inPautA" type="range" min="${UT.PAUT.minA}" max="${UT.PAUT.maxA}" step="1" value="${S.pautAngle}"> <b>${S.pautAngle}°</b></label>`;
    } else if (isTech('tofd')) {
      html = isWeld()
        ? (isPar() ? '<b>TOFD</b> <span class="muted">tidak tersedia untuk scan sejajar las.</span>' : `<b>TOFD D-scan</b> <label class="inl">PCS <input id="inPcs" type="number" min="10" max="300" step="1" value="${(2 * tofdS()).toFixed(0)}"> mm</label>
          <button type="button" class="btn" data-b="pcsAuto">PCS otomatis (⅔T)</button>
          <button type="button" class="btn" data-b="clearMarks">Hapus penanda</button>
          <span class="muted small">Klik gambar: pindahkan probe ke posisi y tersebut dan pasang penanda kedalaman A/B.</span>`)
        : '<b>TOFD</b> <span class="muted">hanya untuk benda uji las.</span>';
    } else {
      html = `<b>B-scan</b> <button type="button" class="btn" data-b="y"${isWeld() && !isPar() ? '' : ' disabled'}>Rekam sepanjang las (y)</button>
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
    const hT = isWeld() ? (stacked ? 110 : 130) : 0;
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
    if (!view) view = UT.computeView(rs.w, rs.h, UT.viewExtent(aspec(), S, dir(), H));
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

    const uIdx = userIndexX();
    const spMaxTrue = Math.max(1, UT.spTrueFromUser(S.delay + S.range, cal()));
    updateCoverage();
    ctxS.setTransform(rs.dpr, 0, 0, rs.dpr, 0, 0);
    UT.drawSection(ctxS, view, {
      spec: aspec(), state: S, dir: dir(), H: Object.assign({}, H, { angle: physAngle() }), derived, spMaxTrue,
      crystal: probeCrystal(),
      gate: tofdOn ? null : { start: gStart, end: gEnd },
      peakSP: peak.triggered ? peak.sp : null,
      hoverSP: tofdOn ? null : hoverSP, userIndexX: uIdx, angleUser: userAngle(), showTruth: S.showDefects,
      technique: tofdOn ? 'tofd' : S.technique,
      pautAngles: isTech('paut') ? [UT.PAUT.minA, UT.PAUT.maxA] : null,
      tofd: tofdOn ? { S: tofdS(), angle: UT.TOFD.angle, hoverDepth: tofd.hoverT == null ? null : UT.tofdDepth(tofd.hoverT, tofdS(), C.material.vL) } : null,
      coverage: S.plan.on && isWeld() && !isPar() && !tofdOn ? cov : null,
    });

    if (hT) {
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
  function updateReadouts(peak, uIdx) {
    if (isTech('tofd') && isWeld()) { updateTofdReadouts(); return; }
    setRoLabels('def');
    const ro = { amp: `${peak.amp.toFixed(0)}%`, dac: '–', sp: '–', depth: '–', sd: '–', x: '–', leg: '–' };
    let pct = null;
    lastPct = null;
    if (peak.triggered) {
      const l = UT.locate(peak.sp, userAngle(), spec.T, uIdx, dir());
      ro.amp = peak.amp >= 100 ? '>100%' : `${peak.amp.toFixed(0)}%`;
      ro.sp = `${fmt(peak.sp)} mm`;
      ro.depth = `${fmt(l.depth)} mm`;
      ro.sd = `${fmt(l.sd)} mm`;
      if (isPar()) {
        ro.x = `y ${fmt(l.x)} mm`;
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
    ro.p = isPar() ? `x ${S.probeY >= 0 ? '+' : '−'}${Math.abs(S.probeY).toFixed(1)} mm · y ${S.probeX.toFixed(1)}`
      : isWeld() ? `${S.probeY.toFixed(1)} mm${spec.isPipe ? ` (${clock(S.probeY)})` : ''}` : `${uIdx.toFixed(1)} mm`;

    // Evaluasi (hanya las)
    let ev = null;
    if (isWeld() && peak.triggered && userAngle() !== 0) {
      const L = sizing.y1 != null && sizing.y2 != null ? Math.abs(sizing.y2 - sizing.y1) : null;
      ev = UT.evaluateASME({ pctDAC: pct, dacExists: dac.points.length > 0, type: S.indType, length: L, t: spec.T });
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
      box.innerHTML = `<b>Evaluasi ASME: ${label}</b> <span>${ev.text}</span>`;
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
    rebuild, setSpecimen, syncControls, newProbe, clearDac, resetSizing, setGain, renderSizing,
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
      const l = UT.locate(lastPeak.sp, userAngle(), spec.T, userIndexX(), dir());
      return { sp: lastPeak.sp, amp: lastPeak.amp, depth: l.depth, x: l.x, sd: l.sd, leg: l.leg, pct: lastPct };
    },
    forceSim() { simDirty = true; view = null; },
    /** Peta cakupan rencana scan terakhir (null bila tidak aktif). */
    coverage() { updateCoverage(); return S.plan.on ? cov : null; },
  };

  // ---------------------------------------------------------------- start
  rebuild();
  initControls();
  requestAnimationFrame(frame);
})();
