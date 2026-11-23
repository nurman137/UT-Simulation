/*
 * Penghubung UI: state aplikasi, kontrol, interaksi probe, dan loop render.
 */
(function () {
  'use strict';
  const UT = window.UT;
  const C = UT.CONFIG;
  const $ = (id) => document.getElementById(id);

  const S = Object.assign({}, C.defaults, { probeX: null });
  let weld, scene, grain, view = null, simDirty = true, sim = null, derived = null;
  let hoverSP = null;
  const cvS = $('cvSection'), cvA = $('cvAscan');
  const ctxS = cvS.getContext('2d'), ctxA = cvA.getContext('2d');
  let szS = { w: 0, h: 0 }, szA = { w: 0, h: 0 };

  const dir = () => (S.side === 'kiri' ? 1 : -1);
  const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '–' : v.toFixed(d));

  // ---------------------------------------------------------------- model
  function defaultProbeX() {
    const hs = S.T * Math.tan((S.angle * Math.PI) / 180);
    return -dir() * 1.75 * hs;
  }

  function clampProbe() {
    const lim = UT.probeLimits(weld, dir());
    if (S.probeX == null) S.probeX = defaultProbeX();
    S.probeX = Math.min(lim.max, Math.max(lim.min, S.probeX));
  }

  function rebuild(resetView = true) {
    weld = UT.buildWeld(S);
    scene = UT.buildScene(weld, S.scenario);
    grain = UT.buildGrain(weld, 20240611);
    clampProbe();
    if (resetView) view = null;
    simDirty = true;
    updateInfo();
  }

  function probe() {
    return { x: S.probeX, dir: dir(), angle: S.angle, freq: S.freq, crystal: S.crystal };
  }

  function runSim() {
    const vt = C.material.vT;
    const k = vt / S.velocity; // SP sebenarnya = SP tampilan × (vT / v_alat)
    const spStart = S.delay * k, spEnd = (S.delay + S.range) * k;
    derived = UT.probeDerived(probe(), C.material);
    const n = Math.max(1200, Math.min(9000, Math.ceil((spEnd - spStart) / (derived.lambda / 20))));
    sim = UT.simulate({
      probe: probe(), mat: C.material, T: weld.T, scene,
      grain: S.grain ? grain : null, spStart, spEnd, n,
    });
    simDirty = false;
  }

  // ---------------------------------------------------------------- UI setup
  function fillSelect(el, items, fmtFn) {
    el.innerHTML = '';
    items.forEach((v) => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = fmtFn ? fmtFn(v) : String(v);
      el.appendChild(o);
    });
  }

  function initControls() {
    fillSelect($('inT'), C.options.thicknesses, (v) => `${v} mm`);
    fillSelect($('inBevel'), C.options.bevels, (v) => `${v}° (sudut bevel total ${v * 2}°)`);
    fillSelect($('inAngle'), C.options.angles, (v) => `${v}°`);
    fillSelect($('inFreq'), C.options.freqs, (v) => `${v} MHz`);
    fillSelect($('inCrystal'), C.options.crystals, (v) => `${v} mm`);
    const scSel = $('inScenario');
    scSel.innerHTML = '';
    UT.SCENARIOS.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name;
      scSel.appendChild(o);
    });
    syncControls();

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
      });
    };

    sel('inT', 'T', parseFloat, () => rebuild());
    sel('inBevel', 'bevelHalf', parseFloat, () => rebuild());
    num('inGap', 'rootGap', () => rebuild());
    chk('inCap', 'cap', () => rebuild());
    chk('inRoot', 'rootBead', () => rebuild());
    sel('inAngle', 'angle', parseFloat, () => rebuild());
    sel('inFreq', 'freq', parseFloat, () => rebuild(false));
    sel('inCrystal', 'crystal', parseFloat, () => rebuild(false));
    $('sideL').addEventListener('click', () => setSide('kiri'));
    $('sideR').addEventListener('click', () => setSide('kanan'));

    document.querySelectorAll('[data-gain]').forEach((b) =>
      b.addEventListener('click', () => setGain(S.gain + parseFloat(b.dataset.gain))));
    $('inGain').addEventListener('input', (e) => setGain(parseFloat(e.target.value)));
    num('inRange', 'range');
    num('inDelay', 'delay');
    num('inVel', 'velocity');
    sel('inRect', 'rect', null, () => {});
    num('inGs', 'gateStart', () => {});
    num('inGw', 'gateWidth', () => {});
    num('inGl', 'gateLevel', () => {});

    sel('inScenario', 'scenario', null, () => rebuild(false));
    chk('inShowDef', 'showDefects', () => {});
    chk('inShowBeam', 'showBeam', () => {});
    chk('inGrain', 'grain');

    $('btnHelp').addEventListener('click', () => {
      const h = $('help');
      h.hidden = !h.hidden;
      $('btnHelp').setAttribute('aria-expanded', String(!h.hidden));
    });
  }

  function setGain(g) {
    S.gain = Math.round(Math.min(90, Math.max(0, g)) * 2) / 2;
    syncControls();
  }

  function setSide(side) {
    if (S.side === side) return;
    S.side = side;
    S.probeX = -S.probeX; // cerminkan posisi probe ke sisi lain
    rebuild();
    syncControls();
  }

  function syncControls() {
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
    $('inVel').value = S.velocity;
    $('inRect').value = S.rect;
    $('inGs').value = S.gateStart;
    $('inGw').value = S.gateWidth;
    $('inGl').value = S.gateLevel;
    $('inScenario').value = S.scenario;
    $('scenarioDesc').textContent = UT.findScenario(S.scenario).desc;
    $('inShowDef').checked = S.showDefects;
    $('inShowBeam').checked = S.showBeam;
    $('inGrain').checked = S.grain;
  }

  function updateInfo() {
    const hs = S.T * Math.tan((S.angle * Math.PI) / 180);
    $('skipInfo').textContent = `½ skip = ${hs.toFixed(1)} mm · 1 skip = ${(2 * hs).toFixed(1)} mm`;
    const d = UT.probeDerived(probe(), C.material);
    const sp6 = (d.gamma6 * 180) / Math.PI;
    $('probeInfo').textContent =
      `λ = ${d.lambda.toFixed(2)} mm · near field ≈ ${d.N.toFixed(0)} mm · sebaran berkas −6 dB ≈ ±${sp6.toFixed(1)}°`;
  }

  // ---------------------------------------------------------------- interaksi probe
  let drag = null;
  function worldFromEvent(e) {
    const r = cvS.getBoundingClientRect();
    return UT.viewToWorld(view, e.clientX - r.left, e.clientY - r.top);
  }
  function moveProbeTo(x) {
    const lim = UT.probeLimits(weld, dir());
    const nx = Math.min(lim.max, Math.max(lim.min, x));
    if (nx !== S.probeX) { S.probeX = nx; simDirty = true; }
  }
  cvS.addEventListener('pointerdown', (e) => {
    if (!view) return;
    const p = worldFromEvent(e);
    const wd = C.wedge;
    const a = S.probeX - dir() * wd.back, b = S.probeX + dir() * wd.front;
    const onProbe = p.x >= Math.min(a, b) - 3 && p.x <= Math.max(a, b) + 3;
    drag = { off: onProbe ? S.probeX - p.x : 0 };
    if (!onProbe) moveProbeTo(p.x);
    cvS.setPointerCapture(e.pointerId);
    cvS.classList.add('dragging');
    cvS.focus({ preventScroll: true });
  });
  cvS.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moveProbeTo(worldFromEvent(e).x + drag.off);
  });
  const endDrag = () => {
    drag = null;
    cvS.classList.remove('dragging');
    if (view && !UT.probeInView(view, S.probeX, dir())) view = null;
  };
  cvS.addEventListener('pointerup', endDrag);
  cvS.addEventListener('pointercancel', endDrag);
  cvS.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 0.5;
    moveProbeTo(S.probeX + (e.key === 'ArrowRight' ? step : -step));
    if (!UT.probeInView(view, S.probeX, dir())) view = null;
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
    // Tinggi kanvas mengikuti proporsi penampang; A-scan disamakan tingginya
    const wS = cvS.parentElement.clientWidth;
    const ext = UT.viewExtent(weld, S, dir());
    const stacked = window.matchMedia('(max-width: 900px)').matches; // layout bertumpuk
    const hS = Math.round(Math.min(520, Math.max(stacked ? 170 : 260, (wS * (ext.z1 - ext.z0)) / (ext.x1 - ext.x0))));
    const wA = cvA.parentElement.clientWidth;
    const hSide = Math.max(hS, 300);
    const rs = resizeCanvas(cvS, stacked ? hS : hSide);
    const ra = resizeCanvas(cvA, stacked ? Math.round(Math.min(420, Math.max(240, wA * 0.6))) : hSide);
    szS = rs; szA = ra;
    if (rs.changed) view = null;
    if (!view) view = UT.computeView(rs.w, rs.h, weld, S, dir());
    if (simDirty) runSim();

    // Sinyal tampilan (%FSH) + noise elektronik
    const gl = C.GAIN_K * Math.pow(10, S.gain / 20);
    const n = sim.n;
    const disp = new Float32Array(n);
    const en = C.ELECTRONIC_NOISE;
    const rf = S.rect === 'rf';
    for (let i = 0; i < n; i++) {
      const v = (sim.re[i] + (Math.random() - 0.5) * 2 * en) * gl;
      disp[i] = rf ? v : Math.abs(v);
    }
    const spOf = (i) => S.delay + (i * S.range) / (n - 1);
    const gStart = S.gateStart, gEnd = S.gateStart + S.gateWidth;
    const peak = UT.gatePeak(disp, spOf, gStart, gEnd, S.gateLevel);
    let maxAmp = 0;
    for (let i = 0; i < n; i++) maxAmp = Math.max(maxAmp, Math.abs(disp[i]));
    $('satWarn').hidden = maxAmp < 100;

    // A-scan
    ctxA.setTransform(ra.dpr, 0, 0, ra.dpr, 0, 0);
    UT.drawAscan(ctxA, UT.ascanLayout(ra.w, ra.h), {
      disp, rect: S.rect, delay: S.delay, range: S.range,
      gate: { start: gStart, end: gEnd, level: S.gateLevel },
      peak, hoverSP,
    });

    // Penampang
    ctxS.setTransform(rs.dpr, 0, 0, rs.dpr, 0, 0);
    const k = C.material.vT / S.velocity;
    UT.drawSection(ctxS, view, {
      weld, scene, state: S, dir: dir(), derived,
      spMaxTrue: (S.delay + S.range) * k,
      gate: { start: gStart, end: gEnd },
      peakSP: peak.triggered ? peak.sp : null,
      hoverSP,
    });

    updateReadouts(peak);
    requestAnimationFrame(frame);
  }

  let lastRo = '';
  function updateReadouts(peak) {
    let ro;
    if (peak.triggered) {
      const l = UT.locate(peak.sp, S.angle, weld.T, S.probeX, dir());
      const side = Math.abs(l.x) < 0.05 ? '' : l.x < 0 ? ' (kiri)' : ' (kanan)';
      ro = {
        amp: peak.amp >= 100 ? '>100%' : `${peak.amp.toFixed(0)}%`,
        sp: `${fmt(peak.sp)} mm`,
        depth: `${fmt(l.depth)} mm`,
        sd: `${fmt(l.sd)} mm`,
        x: `${l.x >= 0 ? '+' : '−'}${fmt(Math.abs(l.x))} mm${side}`,
        leg: String(l.leg),
      };
    } else {
      ro = { amp: `${peak.amp.toFixed(0)}%`, sp: '–', depth: '–', sd: '–', x: '–', leg: '–' };
    }
    const key = JSON.stringify(ro);
    if (key === lastRo) return;
    lastRo = key;
    $('roAmp').textContent = ro.amp;
    $('roSP').textContent = ro.sp;
    $('roDepth').textContent = ro.depth;
    $('roSD').textContent = ro.sd;
    $('roX').textContent = ro.x;
    $('roLeg').textContent = ro.leg;
  }

  // ---------------------------------------------------------------- start
  rebuild();
  initControls();
  requestAnimationFrame(frame);
})();
