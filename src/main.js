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

  let spec, view = null, sim = null, derived = null, simDirty = true;
  let hoverSP = null, lastPeak = null;
  const cvS = $('cvSection'), cvA = $('cvAscan'), cvT = $('cvTop');
  const ctxS = cvS.getContext('2d'), ctxA = cvA.getContext('2d'), ctxT = cvT.getContext('2d');
  let szA = { w: 0, h: 0 }, topLay = null;

  const dir = () => (S.side === 'kiri' ? 1 : -1);
  const isWeld = () => spec && spec.type === 'las';
  const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '–' : v.toFixed(d));

  function applyUserFromTruth() {
    S.xValue = H.front;
    S.angleUser = H.angle;
    S.zero = Math.round(H.zero * 100) / 100;
    S.velocity = C.material.vT;
  }
  function applyUserNominal() {
    S.xValue = C.wedge.front;
    S.angleUser = S.angle;
    S.zero = Math.round(UT.nominalZero(S.angle) * 100) / 100;
  }
  applyUserFromTruth();

  const cal = () => ({ vTrue: C.material.vT, vUser: S.velocity, zeroTrue: H.zero, zeroUser: S.zero });
  const userIndexX = () => UT.userIndexX(S.probeX, dir(), H, S.xValue);

  // ---------------------------------------------------------------- model
  function defaultProbeX() {
    const tn = Math.tan(H.angle * DEG);
    if (spec.type === 'iiw') {
      const h = UT.IIW.hole50;
      return dir() > 0 ? UT.IIW.r100.cx - 25 : h.x + h.z * tn + 18;
    }
    if (spec.type === 'asme') {
      const xs = UT.ASME_BLOCK.holesX;
      return dir() > 0 ? xs[0] - spec.T * 0.25 * tn - 10 : xs[2] + spec.T * 0.75 * tn + 10;
    }
    return -dir() * 1.75 * spec.T * tn;
  }

  function limits() {
    return UT.specimenProbeLimits(spec, dir(), UT.probeBody(H));
  }

  function clampProbe() {
    if (S.probeX == null) S.probeX = defaultProbeX();
    const lim = limits();
    S.probeX = Math.min(lim.max, Math.max(lim.min, S.probeX));
    if (isWeld()) {
      const hw = UT.PROBE_WIDTH / 2;
      S.probeY = Math.min(spec.yLen - hw, Math.max(hw, S.probeY));
    }
  }

  function rebuild(resetView = true) {
    spec = UT.buildSpecimen(S);
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

  function runSim() {
    const c = cal();
    const spStart = UT.spTrueFromUser(S.delay, c);
    const spEnd = UT.spTrueFromUser(S.delay + S.range, c);
    const pr = { x: S.probeX, y: S.probeY, dir: dir(), angle: H.angle, freq: S.freq, crystal: S.crystal };
    derived = UT.probeDerived(pr, C.material);
    const n = Math.max(1200, Math.min(9000, Math.ceil((spEnd - spStart) / (derived.lambda / 20))));
    sim = UT.simulate({
      probe: pr, mat: C.material, T: spec.T, scene: spec.scene,
      grain: S.grain ? spec.grain : null, spStart, spEnd, n, mainBangSP: UT.mainBangSP(c),
    });
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
    fillSelect($('inT'), C.options.thicknesses, (v) => `${v} mm`);
    fillSelect($('inBevel'), C.options.bevels, (v) => `${v}° (sudut bevel total ${v * 2}°)`);
    fillSelect($('inAngle'), C.options.angles, (v) => `${v}°`);
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
    sel('inBevel', 'bevelHalf', parseFloat, () => rebuild());
    num('inGap', 'rootGap', () => rebuild());
    chk('inCap', 'cap', () => rebuild());
    chk('inRoot', 'rootBead', () => rebuild());
    const probeChanged = (what) => { clearDac(`${what} probe berubah`); newProbe(training); };
    sel('inAngle', 'angle', parseFloat, () => { probeChanged('sudut'); S.probeX = null; rebuild(); });
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
      else UT.dacAdd(dac, lastPeak.sp, lastPeak.amp, S.gain);
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

    // Sizing
    $('btnY1').addEventListener('click', () => { sizing.y1 = S.probeY; renderSizing(); });
    $('btnY2').addEventListener('click', () => { sizing.y2 = S.probeY; renderSizing(); });
    const markDepth = (k) => () => {
      if (!lastPeak || !lastPeak.triggered) return;
      sizing[k] = UT.locate(lastPeak.sp, S.angleUser, spec.T, userIndexX(), dir()).depth;
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
    S.specimen = id;
    if (id === 'las') Object.assign(S, { range: 125, delay: 0, gateStart: 40, gateWidth: 50 });
    if (id === 'iiw') Object.assign(S, { side: 'kiri', range: 250, delay: 0, gateStart: 80, gateWidth: 40 });
    if (id === 'asme') {
      const r = Math.ceil((S.T * 2.6) / Math.cos(S.angle * DEG) / 25) * 25;
      Object.assign(S, { side: 'kiri', range: Math.max(75, r), delay: 0, gateStart: 5, gateWidth: Math.max(40, r - 10) });
    }
    S.probeX = null;
    rebuild();
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
    $('weldOnly').hidden = !weld;
    $('topWrap').hidden = !weld;
    $('sizingCard').hidden = !weld;
    $('inT').disabled = S.specimen === 'iiw' || locks.scenario;
    $('inScenario').disabled = !weld || locks.scenario;
    $('randRow').hidden = !weld || S.scenario !== 'acak' || locks.scenario;
    $('inSeed').value = S.randSeed;
    $('inCount').value = String(S.randCount);
    $('inShowDef').disabled = locks.truth;
    $('btnAutoCal').disabled = locks.autoCal;
    $('sectionTitle').textContent = weld ? 'Tampilan scanning (penampang las)'
      : `Tampilan scanning (${UT.SPECIMENS.find((s) => s.id === S.specimen).name})`;
    $('roXLabel').textContent = weld ? 'Posisi thd sumbu las' : 'Posisi x pada blok';
    $('roPLabel').textContent = weld ? 'Posisi probe (y)' : 'Tanda index pada blok';

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
    const st = UT.calibrationStatus(H, { xValue: S.xValue, angle: S.angleUser, zero: S.zero, velocity: S.velocity }, C.material.vT);
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
    const hs = spec.T * Math.tan(S.angleUser * DEG);
    $('skipInfo').textContent = spec.type === 'iiw' ? 'Tinggi blok 100 mm'
      : `½ skip = ${hs.toFixed(1)} mm · 1 skip = ${(2 * hs).toFixed(1)} mm (sudut ${S.angleUser}°)`;
    const d = UT.probeDerived({ freq: S.freq, crystal: S.crystal, angle: S.angle }, C.material);
    $('probeInfo').textContent =
      `λ = ${d.lambda.toFixed(2)} mm · near field ≈ ${d.N.toFixed(0)} mm · sebaran berkas −6 dB ≈ ±${(d.gamma6 / DEG).toFixed(1)}°`;
    $('specInfo').textContent = spec.type === 'iiw'
      ? 'Blok IIW (V1) disederhanakan: tinggi 100 mm, permukaan R100, lubang Ø50, skala sudut 40–75°. Baja karbon.'
      : spec.type === 'asme'
        ? `Tebal blok = T = ${spec.T} mm. SDH Ø${spec.sdhDiameter} mm pada kedalaman ${(spec.T / 4).toFixed(1)}, ${(spec.T / 2).toFixed(1)}, ${(spec.T * 0.75).toFixed(1)} mm.`
        : 'Material: baja karbon, vT = 3240 m/s. Panjang las 300 mm.';
  }

  function renderBlockHelp() {
    const el = $('blockHelp');
    let html = '';
    if (spec.type === 'iiw') {
      const { xf } = UT.probeExtent(S.probeX, dir(), H);
      const dFront = dir() * (xf - UT.IIW.r100.cx);
      const idx = userIndexX();
      const h = UT.IIW.hole50;
      let ang = '–';
      if (dir() < 0 && idx > h.x) ang = `${(Math.atan((idx - h.x) / h.z) / DEG).toFixed(1)}°`;
      html = `<b>Pembacaan pada blok</b><br>Muka depan probe → tanda pusat R100: <b>${dFront.toFixed(1)} mm</b><br>`
        + `Skala sudut pada tanda index: <b>${ang}</b>${dir() > 0 ? ' <span class="muted">(arahkan berkas ← ke Ø50)</span>' : ''}<br>`
        + '<span class="muted">Echo R100 seharusnya di 100 mm dan 200 mm.</span>';
    } else if (spec.type === 'asme') {
      html = '<span class="muted">Rekam DAC: maksimalkan tiap echo SDH. Gunakan “puncak gate = 80%” hanya untuk titik pertama, lalu jangan ubah gain saat merekam titik berikutnya.</span>';
    } else {
      html = '<span class="muted">Kalibrasi probe dilakukan di blok IIW, DAC di blok kalibrasi ASME.</span>';
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
    const ny = Math.min(spec.yLen - hw, Math.max(hw, y));
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
    const x = UT.viewToWorld(view, px, py).x;
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
    moveProbeTo(UT.viewToWorld(view, px, py).x + drag.off);
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
    hoverSP = x < 0 || x > lay.w ? null : S.delay + (x / lay.w) * S.range;
  });
  cvA.addEventListener('pointerleave', () => { hoverSP = null; });

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
    const ext = UT.viewExtent(spec, S, dir(), H);
    const hS = Math.round(Math.min(520, Math.max(stacked ? 170 : 240, (wS * (ext.z1 - ext.z0)) / (ext.x1 - ext.x0))));
    const hT = isWeld() ? (stacked ? 110 : 130) : 0;
    const wA = cvA.parentElement.clientWidth;
    const hSide = Math.max(300, hS + (hT ? hT + 24 : 0));
    const rs = resizeCanvas(cvS, hS);
    const ra = resizeCanvas(cvA, stacked ? Math.round(Math.min(420, Math.max(240, wA * 0.6))) : hSide);
    szA = ra;
    if (rs.changed) view = null;
    if (!view) view = UT.computeView(rs.w, rs.h, UT.viewExtent(spec, S, dir(), H));
    if (simDirty) runSim();

    // Sinyal tampilan (%FSH) + noise elektronik
    const gl = C.GAIN_K * Math.pow(10, S.gain / 20);
    const n = sim.n;
    const disp = new Float32Array(n);
    const en = C.ELECTRONIC_NOISE;
    const rf = S.rect === 'rf';
    let maxAmp = 0;
    for (let i = 0; i < n; i++) {
      const v = (sim.re[i] + (Math.random() - 0.5) * 2 * en) * gl;
      disp[i] = rf ? v : Math.abs(v);
      const a = Math.abs(v);
      if (a > maxAmp) maxAmp = a;
    }
    const spOf = (i) => S.delay + (i * S.range) / (n - 1);
    const gStart = S.gateStart, gEnd = S.gateStart + S.gateWidth;
    const peak = UT.gatePeak(disp, spOf, gStart, gEnd, S.gateLevel);
    lastPeak = peak;
    $('satWarn').hidden = maxAmp < 100;

    const dacOn = S.showDac && dac.points.length > 0;
    ctxA.setTransform(ra.dpr, 0, 0, ra.dpr, 0, 0);
    UT.drawAscan(ctxA, UT.ascanLayout(ra.w, ra.h), {
      disp, rect: S.rect, delay: S.delay, range: S.range,
      gate: { start: gStart, end: gEnd, level: S.gateLevel },
      peak, hoverSP,
      dacCurve: dacOn ? (sp) => UT.dacAt(dac, sp, S.gain) : null,
      dacPoints: dacOn ? dac.points.map((p) => ({ sp: p.sp, amp: Math.pow(10, (p.db + S.gain) / 20) })) : null,
    });

    const uIdx = userIndexX();
    const spMaxTrue = Math.max(1, UT.spTrueFromUser(S.delay + S.range, cal()));
    ctxS.setTransform(rs.dpr, 0, 0, rs.dpr, 0, 0);
    UT.drawSection(ctxS, view, {
      spec, state: S, dir: dir(), H, derived, spMaxTrue,
      gate: { start: gStart, end: gEnd },
      peakSP: peak.triggered ? peak.sp : null,
      hoverSP, userIndexX: uIdx, angleUser: S.angleUser, showTruth: S.showDefects,
    });

    if (hT) {
      const rt = resizeCanvas(cvT, hT);
      topLay = UT.topLayout(rt.h, spec.yLen);
      ctxT.setTransform(rt.dpr, 0, 0, rt.dpr, 0, 0);
      UT.drawTopView(ctxT, Object.assign({}, view, { cw: rt.w }), topLay, {
        spec, state: S, dir: dir(), H, sizing, showTruth: S.showDefects,
      });
    } else {
      topLay = null;
    }

    updateReadouts(peak, uIdx);
    renderBlockHelp();
    for (let i = 0; i < frameHooks.length; i++) frameHooks[i](peak);
    requestAnimationFrame(frame);
  }

  let lastRo = '';
  function updateReadouts(peak, uIdx) {
    const ro = { amp: `${peak.amp.toFixed(0)}%`, dac: '–', sp: '–', depth: '–', sd: '–', x: '–', leg: '–' };
    let pct = null;
    lastPct = null;
    if (peak.triggered) {
      const l = UT.locate(peak.sp, S.angleUser, spec.T, uIdx, dir());
      ro.amp = peak.amp >= 100 ? '>100%' : `${peak.amp.toFixed(0)}%`;
      ro.sp = `${fmt(peak.sp)} mm`;
      ro.depth = `${fmt(l.depth)} mm`;
      ro.sd = `${fmt(l.sd)} mm`;
      if (isWeld()) {
        const side = Math.abs(l.x) < 0.05 ? '' : l.x < 0 ? ' (kiri)' : ' (kanan)';
        ro.x = `${l.x >= 0 ? '+' : '−'}${fmt(Math.abs(l.x))} mm${side}`;
      } else {
        ro.x = `${fmt(l.x)} mm`;
      }
      ro.leg = String(l.leg);
      if (dac.points.length) {
        const ref = UT.dacAt(dac, peak.sp, S.gain);
        if (ref != null) {
          pct = (peak.amp / ref) * 100;
          lastPct = pct;
          const dB = 20 * Math.log10(pct / 100);
          ro.dac = `${pct.toFixed(0)}% (${dB >= 0 ? '+' : ''}${dB.toFixed(1)} dB)`;
        } else ro.dac = 'di luar DAC';
      } else ro.dac = 'belum ada DAC';
    }
    ro.p = isWeld() ? `${S.probeY.toFixed(1)} mm` : `${uIdx.toFixed(1)} mm`;

    // Evaluasi (hanya las)
    let ev = null;
    if (isWeld() && peak.triggered) {
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
    dir,
    calOk() {
      return UT.calibrationStatus(H, { xValue: S.xValue, angle: S.angleUser, zero: S.zero, velocity: S.velocity }, C.material.vT).ok;
    },
    /** Pembacaan alat untuk puncak gate saat ini, atau null. */
    reading() {
      if (!lastPeak || !lastPeak.triggered || !spec) return null;
      const l = UT.locate(lastPeak.sp, S.angleUser, spec.T, userIndexX(), dir());
      return { sp: lastPeak.sp, amp: lastPeak.amp, depth: l.depth, x: l.x, sd: l.sd, leg: l.leg, pct: lastPct };
    },
    forceSim() { simDirty = true; view = null; },
  };

  // ---------------------------------------------------------------- start
  rebuild();
  initControls();
  requestAnimationFrame(frame);
})();
