/*
 * Modul edukasi: pemilih aktivitas (Bebas / Tutorial / Ujian), mesin tutorial,
 * panel ujian, dan tabel laporan indikasi + ekspor laporan.
 */
(function () {
  'use strict';
  const UT = window.UT;
  const app = UT.app;
  const C = UT.CONFIG;
  const S = app.S;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const panel = $('eduPanel');

  let activity = 'bebas';
  const rows = [];
  let rowsLocked = false;

  // tutorial
  let lesson = null, stepIdx = 0, stepDone = false;
  // ujian
  let exam = null; // { code, level, T, start, submitted, result, elapsed }
  let examLevel = 'mudah';
  let examCode = UT.randomExamCode(app.rand);

  // ================================================================ aktivitas
  function setActivity(a) {
    if (a === activity) return;
    if (activity === 'ujian' && exam && !exam.submitted) {
      if (!window.confirm('Ujian sedang berjalan. Batalkan ujian?')) return;
      cancelExam(false);
    }
    activity = a;
    lesson = null;
    if (a === 'bebas') unlockAll();
    renderTabs();
    renderPanel();
  }

  function unlockAll() {
    app.locks.truth = app.locks.scenario = app.locks.autoCal = false;
    rowsLocked = false;
    renderRows();
    app.syncControls();
  }

  function renderTabs() {
    document.querySelectorAll('#actTabs .tab').forEach((b) => {
      const on = b.dataset.act === activity;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  function renderPanel() {
    panel.hidden = activity === 'bebas';
    if (activity === 'tutorial') panel.innerHTML = tutorialHTML();
    else if (activity === 'ujian') panel.innerHTML = examHTML();
    else panel.innerHTML = '';
    lastStatus = '';
  }

  // ================================================================ tutorial
  function tutorialHTML() {
    const opts = UT.LESSONS.map((l) => `<option value="${l.id}"${lesson && lesson.id === l.id ? ' selected' : ''}>${esc(l.title)}</option>`).join('');
    let body = '';
    if (!lesson) {
      body = `<p class="small">Pilih pelajaran lalu tekan <b>Mulai</b>. Setiap langkah dicek otomatis; tombol <b>Lanjut</b> aktif setelah langkah berhasil.</p>
        <ul class="small lessonlist">${UT.LESSONS.map((l) => `<li><b>${esc(l.title)}</b> – ${esc(l.desc)}</li>`).join('')}</ul>`;
    } else {
      const st = lesson.steps[stepIdx];
      const steps = lesson.steps.map((s, i) => `<li class="${i < stepIdx ? 'done' : i === stepIdx ? 'cur' : ''}">${esc(s.title)}</li>`).join('');
      const quiz = st.quiz ? `<div class="quiz"><label>${esc(st.quiz.label)}
          <input id="quizIn" type="number" step="0.1"> ${esc(st.quiz.unit)}</label>
          <button type="button" class="btn" data-a="quiz">Periksa</button> <span id="quizMsg" class="small"></span></div>` : '';
      const hint = st.hint ? `<details class="small"><summary>Petunjuk</summary>${esc(st.hint)}</details>` : '';
      const last = stepIdx === lesson.steps.length - 1;
      body = `<div class="tut">
        <ol class="steps small">${steps}</ol>
        <div class="stepbox">
          <div class="steptitle">Langkah ${stepIdx + 1} / ${lesson.steps.length} · ${esc(st.title)}</div>
          <p>${esc(st.text)}</p>
          ${quiz}${hint}
          <div class="stepfoot">
            <span id="stepStatus" class="stepstatus"></span>
            <span class="btnrow">
              <button type="button" class="btn" data-a="prev"${stepIdx === 0 ? ' disabled' : ''}>Kembali</button>
              ${last ? '<button type="button" class="btn primary" data-a="finish">Selesai</button>'
                : '<button type="button" class="btn primary" id="btnNext" data-a="next">Lanjut</button>'}
            </span>
          </div>
        </div>
      </div>`;
    }
    return `<div class="edu-head"><b>Tutorial</b>
      <select id="lessonSel" aria-label="Pilih pelajaran">${opts}</select>
      <button type="button" class="btn primary" data-a="startLesson">${lesson ? 'Ulangi' : 'Mulai'}</button></div>${body}`;
  }

  function startLesson(id) {
    lesson = UT.LESSONS.find((l) => l.id === id) || UT.LESSONS[0];
    stepIdx = 0;
    stepDone = false;
    lesson.setup(app);
    app.forceSim();
    app.syncControls();
    renderPanel();
  }

  function stepPassive(st) { return !st.check && !st.quiz; }

  let lastStatus = '';
  function tutorialTick(peak) {
    if (activity !== 'tutorial' || !lesson) return;
    const st = lesson.steps[stepIdx];
    if (!stepDone && st.check) {
      let ok = false;
      try { ok = !!st.check(app, peak); } catch (e) { ok = false; }
      if (ok) stepDone = true;
    }
    if (stepPassive(st)) stepDone = true;
    const status = stepDone ? '✓ Berhasil – klik Lanjut' : st.quiz ? 'Jawab pertanyaan di atas' : '⏳ Menunggu…';
    if (status !== lastStatus) {
      lastStatus = status;
      const el = $('stepStatus');
      if (el) { el.textContent = stepPassive(st) ? '' : status; el.classList.toggle('ok', stepDone); }
      const nb = $('btnNext');
      if (nb) nb.disabled = !stepDone;
    }
  }

  // ================================================================ ujian
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function examHTML() {
    if (!exam) {
      const lv = UT.EXAM_LEVELS.map((l) => `<label class="lvl"><input type="radio" name="lvl" value="${l.id}"${l.id === examLevel ? ' checked' : ''}>
        <b>${esc(l.name)}</b> <span class="muted small">${esc(l.desc)}</span></label>`).join('');
      return `<div class="edu-head"><b>Ujian</b> <span class="muted small">Cacat acak dirahasiakan; mode guru terkunci sampai jawaban dikirim.</span></div>
        <div class="examsetup">
          <div class="lvls">${lv}</div>
          <div>
            <label class="small">Kode soal <input id="examCode" type="number" min="1" max="99999" value="${examCode}"></label>
            <button type="button" class="btn" data-a="newCode">Kode baru</button>
            <p class="muted small">Kode yang sama menghasilkan soal yang sama. Instruktur bisa membagikan satu kode ke semua siswa.</p>
            <label class="small">Nama <input id="examName" type="text" maxlength="60" value="${esc($('inStudent').value)}" placeholder="nama siswa"></label>
            <button type="button" class="btn primary" data-a="startExam">Mulai ujian</button>
          </div>
        </div>`;
    }
    if (!exam.submitted) {
      return `<div class="edu-head"><b>Ujian berjalan</b>
        <span class="small">kode <b>${exam.code}</b> · tingkat <b>${esc(exam.level.name)}</b> · T = ${exam.T} mm ·
        ${exam.level.count === 1 ? '1 cacat' : 'jumlah cacat dirahasiakan'} · ⏱ <b id="examTimer">00:00</b></span>
        <span class="btnrow"><button type="button" class="btn primary" data-a="submitExam">Kirim jawaban</button>
        <button type="button" class="btn" data-a="cancelExam">Batalkan</button></span></div>
        <ol class="small examsteps">
          ${exam.level.training ? '<li>Kalibrasi probe di <b>Blok IIW</b> (X-value, zero, sudut).</li>' : ''}
          ${exam.level.autoDac ? '<li>DAC sudah disediakan; gain diatur ke gain scanning (reference + 6 dB).</li>'
            : '<li>Buat DAC di <b>Blok kalibrasi ASME</b>, lalu atur gain scanning (+6 dB).</li>'}
          <li>Scan seluruh panjang las (geser probe sepanjang las dengan ↑ ↓ atau tampak atas) dari kedua sisi.</li>
          <li>Untuk setiap indikasi ≥ 20% DAC: ukur panjang (6 dB drop), tentukan interpretasi, lalu “+ Tambah dari pembacaan” di Laporan indikasi. Periksa keputusan terima/tolak.</li>
          <li>Echo geometri (akar las, kaki cap) bukan cacat, jangan dilaporkan.</li>
        </ol>`;
    }
    const R = exam.result;
    const det = R.perDefect.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(UT.TYPE_NAMES[p.truth.type])}</td>
      <td>y ${p.truth.y1.toFixed(0)}–${p.truth.y2.toFixed(0)}, kedalaman ${p.truth.z1.toFixed(1)}–${p.truth.z2.toFixed(1)} mm</td>
      <td>${p.reportIndex == null ? '<span class="bad">terlewat</span>' : '#' + (p.reportIndex + 1)}</td>
      <td>${Math.round(p.parts.deteksi)}</td><td>${Math.round(p.parts.lokasi)}</td><td>${Math.round(p.parts.panjang)}</td>
      <td>${Math.round(p.parts.jenis)}</td><td>${Math.round(p.parts.keputusan)}</td><td><b>${Math.round(p.total)}</b></td>
      <td class="small">${esc(p.notes.join('; '))}</td></tr>`).join('');
    const fc = R.falseCalls.length
      ? `<p class="small bad">Indikasi palsu (−10 poin per indikasi): ${R.falseCalls.map((o) => '#' + (o.j + 1)).join(', ')}</p>` : '';
    return `<div class="edu-head"><b>Hasil ujian</b>
      <span class="small">kode ${exam.code} · ${esc(exam.level.name)} · waktu ${fmtTime(exam.elapsed)}</span>
      <span class="btnrow"><button type="button" class="btn primary" data-a="print">Cetak laporan</button>
      <button type="button" class="btn" data-a="newExam">Ujian baru</button></span></div>
      <p class="bigscore">Nilai <b>${Math.round(R.score)}</b> / 100
        <span class="muted small">(rata-rata per cacat ${Math.round(R.base)}${R.penalty ? `, −${R.penalty} indikasi palsu` : ''})</span></p>
      <div class="tablewrap"><table class="reptable"><thead><tr><th>#</th><th>Cacat sebenarnya</th><th>Lokasi</th><th>Laporan</th>
      <th>Deteksi /40</th><th>Lokasi /15</th><th>Panjang /15</th><th>Jenis /15</th><th>Keputusan /15</th><th>Total</th><th>Catatan</th></tr></thead>
      <tbody>${det}</tbody></table></div>${fc}
      <p class="muted small">Cacat kini ditampilkan (mode guru). Geser probe untuk mempelajari echo yang terlewat.</p>`;
  }

  function startExam() {
    const code = Math.max(1, Math.round(parseFloat($('examCode').value) || examCode));
    const name = $('examName').value.trim();
    if (name) $('inStudent').value = name;
    const lvEl = panel.querySelector('input[name=lvl]:checked');
    examLevel = lvEl ? lvEl.value : examLevel;
    const ex = UT.makeExam(code, examLevel);
    app.setTechnique('ut');
    Object.assign(S, {
      bevelType: 'V',
      T: ex.T, bevelHalf: 30, rootGap: 2, cap: true, rootBead: true,
      scenario: 'acak', randSeed: code, randCount: ex.count, showDefects: false,
      probeY: 150, side: 'kiri', angle: 60, freq: 4, crystal: 10, velocity: C.material.vT, gateLevel: 20, probeX: null,
    });
    app.locks.truth = app.locks.scenario = app.locks.autoCal = true;
    app.training = ex.level.training;
    app.newProbe(ex.level.training);
    app.dac = UT.dacCreate();
    S.gain = 46;
    if (ex.level.autoDac) {
      app.dac = UT.autoDac({ T: ex.T, H: app.H, freq: S.freq, crystal: S.crystal, cal: app.cal() });
      S.gain = Math.round((UT.dacRefGain(app.dac) + 6) * 2) / 2;
    }
    app.resetSizing();
    rows.length = 0;
    rowsLocked = false;
    renderRows();
    S.specimen = 'x';
    app.setSpecimen('las');
    exam = { code, level: ex.level, T: ex.T, start: Date.now(), submitted: false };
    renderPanel();
  }

  function cancelExam(rerender = true) {
    exam = null;
    unlockAll();
    if (rerender) renderPanel();
  }

  function submitExam() {
    if (!rows.length && !window.confirm('Laporan indikasi masih kosong. Tetap kirim?')) return;
    if (rows.length && !window.confirm(`Kirim ${rows.length} indikasi untuk dinilai?`)) return;
    exam.elapsed = Date.now() - exam.start;
    exam.result = UT.gradeExam(app.spec.scene.truth, rows, { t: exam.T });
    exam.submitted = true;
    rowsLocked = true;
    app.locks.truth = false;
    S.showDefects = true;
    app.syncControls();
    renderRows();
    renderPanel();
  }

  let lastTimer = '';
  function examTick() {
    if (activity !== 'ujian' || !exam || exam.submitted) return;
    const t = fmtTime(Date.now() - exam.start);
    if (t !== lastTimer) {
      lastTimer = t;
      const el = $('examTimer');
      if (el) el.textContent = t;
    }
  }

  // ================================================================ laporan indikasi
  const typeOpts = (sel) => UT.INDICATION_TYPES.map((t) => `<option value="${t.id}"${t.id === sel ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
  const numCell = (i, k, v, step) => `<input type="number" step="${step || 0.1}" data-i="${i}" data-k="${k}" value="${v == null || !isFinite(v) ? '' : Math.round(v * 10) / 10}"${rowsLocked ? ' disabled' : ''}>`;

  function renderRows() {
    const body = $('repBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="11" class="muted small c">Belum ada indikasi.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r, i) => {
      const L = r.y1 != null && r.y2 != null ? Math.abs(r.y2 - r.y1).toFixed(1) : '–';
      return `<tr><td>${i + 1}</td><td>${numCell(i, 'y1', r.y1)}</td><td>${numCell(i, 'y2', r.y2)}</td><td>${L}</td>
        <td>${numCell(i, 'depth', r.depth)}</td><td>${numCell(i, 'x', r.x)}</td><td>${numCell(i, 'pctDAC', r.pctDAC, 1)}</td>
        <td><select data-i="${i}" data-k="type"${rowsLocked ? ' disabled' : ''}>${typeOpts(r.type)}</select></td>
        <td><select data-i="${i}" data-k="verdict"${rowsLocked ? ' disabled' : ''}>
          <option value="terima"${r.verdict === 'terima' ? ' selected' : ''}>Diterima</option>
          <option value="tolak"${r.verdict === 'tolak' ? ' selected' : ''}>Ditolak</option></select></td>
        <td><input type="text" maxlength="80" data-i="${i}" data-k="note" value="${esc(r.note)}"${rowsLocked ? ' disabled' : ''}></td>
        <td>${rowsLocked ? '' : `<button type="button" class="btn" data-del="${i}" aria-label="Hapus indikasi ${i + 1}">✕</button>`}</td></tr>`;
    }).join('');
  }

  function addFromReading() {
    const r = app.reading();
    const z = app.sizing;
    const y1 = z.y1 != null ? z.y1 : S.probeY;
    const y2 = z.y2 != null ? z.y2 : S.probeY;
    const type = S.indType;
    const L = Math.abs(y2 - y1) || null;
    const ev = UT.evaluateASME({ pctDAC: r ? r.pct : null, dacExists: app.dac.points.length > 0, type, length: L, t: app.spec.T });
    const planar = (UT.INDICATION_TYPES.find((x) => x.id === type) || {}).planar;
    rows.push({
      y1: Math.min(y1, y2), y2: Math.max(y1, y2),
      depth: r ? r.depth : null, x: r ? r.x : null, pctDAC: r ? r.pct : null,
      type, verdict: planar || ev.verdict === 'tolak' ? 'tolak' : 'terima',
      note: r ? '' : 'tidak ada echo di gate saat dicatat',
    });
    renderRows();
  }

  function reportData() {
    const ref = UT.dacRefGain(app.dac);
    return {
      student: $('inStudent').value.trim(),
      date: new Date().toLocaleString('id-ID'),
      mode: exam ? 'Ujian' : activity === 'tutorial' ? 'Tutorial' : 'Latihan',
      code: exam ? exam.code : S.scenario === 'acak' ? S.randSeed : '',
      level: exam ? exam.level.name : '',
      specimen: { T: app.spec.type === 'las' ? app.spec.T : S.T, bevel: S.bevelHalf, material: C.material.name },
      probe: { angle: S.angle, freq: S.freq, crystal: S.crystal },
      cal: { xValue: S.xValue, angleUser: S.angleUser, zero: S.zero, velocity: S.velocity },
      dac: {
        refGain: ref, scanGain: ref == null ? null : ref + 6,
        points: app.dac.points.map((p) => ({ sp: p.sp, pct: Math.pow(10, (p.db + ref) / 20) })),
      },
      indications: rows.slice(),
      result: exam && exam.submitted ? exam.result : null,
    };
  }

  function printReport() {
    const html = UT.buildReportHTML(reportData());
    const w = window.open('', '_blank');
    if (!w) { downloadReport(); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  function downloadReport() {
    const html = UT.buildReportHTML(reportData());
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    const name = ($('inStudent').value.trim() || 'laporan').replace(/[^\w\-]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-ut-${name}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ================================================================ event
  document.querySelectorAll('#actTabs .tab').forEach((b) => b.addEventListener('click', () => setActivity(b.dataset.act)));

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'startLesson') startLesson($('lessonSel').value);
    else if (a === 'next' && stepDone && stepIdx < lesson.steps.length - 1) { stepIdx++; stepDone = false; renderPanel(); }
    else if (a === 'prev' && stepIdx > 0) { stepIdx--; stepDone = true; renderPanel(); }
    else if (a === 'finish') { lesson = null; renderPanel(); }
    else if (a === 'quiz') {
      const st = lesson.steps[stepIdx];
      const v = parseFloat($('quizIn').value);
      const ok = isFinite(v) && st.quiz.check(v, app);
      const m = $('quizMsg');
      m.textContent = ok ? '✓ Benar' : '✗ Belum tepat, periksa pembacaan alat';
      m.className = 'small ' + (ok ? 'ok' : 'bad');
      if (ok) stepDone = true;
      lastStatus = '';
    } else if (a === 'newCode') { examCode = UT.randomExamCode(app.rand); $('examCode').value = examCode; }
    else if (a === 'startExam') startExam();
    else if (a === 'submitExam') submitExam();
    else if (a === 'cancelExam') { if (window.confirm('Batalkan ujian?')) cancelExam(); }
    else if (a === 'newExam') { exam = null; examCode = UT.randomExamCode(app.rand); unlockAll(); renderPanel(); }
    else if (a === 'print') printReport();
  });
  panel.addEventListener('change', (e) => {
    if (e.target.name === 'lvl') examLevel = e.target.value;
  });

  const repBody = $('repBody');
  repBody.addEventListener('change', (e) => {
    const el = e.target;
    const i = +el.dataset.i, k = el.dataset.k;
    if (!rows[i] || !k) return;
    if (k === 'type' || k === 'verdict' || k === 'note') rows[i][k] = el.value;
    else rows[i][k] = el.value === '' ? null : parseFloat(el.value);
    if (k === 'y1' || k === 'y2') renderRows();
  });
  repBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    rows.splice(+b.dataset.del, 1);
    renderRows();
  });
  $('btnRepAdd').addEventListener('click', () => { if (!rowsLocked) addFromReading(); });
  $('btnRepBlank').addEventListener('click', () => {
    if (rowsLocked) return;
    rows.push({ y1: null, y2: null, depth: null, x: null, pctDAC: null, type: 'lain', verdict: 'terima', note: '' });
    renderRows();
  });
  $('btnRepPrint').addEventListener('click', printReport);
  $('btnRepDownload').addEventListener('click', downloadReport);

  app.frameHooks.push(tutorialTick, examTick);

  UT.edu = {
    reportRows: () => rows,
    get activity() { return activity; },
    get exam() { return exam; },
    setActivity,
  };

  renderTabs();
  renderRows();
})();
