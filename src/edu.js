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
  // pengaturan instruktur untuk ujian
  const examOpt = { specimen: 'pelat', count: 0, minutes: 0, source: 'acak' };
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
    else if (activity === 'rekap') panel.innerHTML = rekapHTML();
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
            <div class="examopts">
              <label class="small">Benda uji soal <select id="exSpec">${UT.EXAM_SPECIMENS.map((s) => `<option value="${s.id}"${s.id === examOpt.specimen ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
              <label class="small">Jumlah cacat <select id="exCount"><option value="0">sesuai tingkat</option>${[1, 2, 3, 4].map((n) => `<option value="${n}"${n === examOpt.count ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
              <label class="small">Batas waktu (menit, 0 = bebas) <input id="exMin" type="number" min="0" max="240" step="5" value="${examOpt.minutes}"></label>
              <label class="small">Sumber soal <select id="exSrc"><option value="acak"${examOpt.source === 'acak' ? ' selected' : ''}>Acak dari kode soal</option><option value="kustom"${examOpt.source === 'kustom' ? ' selected' : ''}>Skenario instruktur (pelat)</option></select></label>
            </div>
            <p class="muted small">Skenario instruktur memakai cacat dari editor skenario (kartu Cacat &amp; tampilan, skenario “Skenario instruktur”).</p>
            <div class="btnrow"><button type="button" class="btn" data-a="packMake">Buat kode paket ujian</button>
              <label class="small">Kode paket <input id="exPack" type="text" size="22" placeholder="UTX1:…"></label>
              <button type="button" class="btn" data-a="packUse">Pakai paket</button></div>
            <p id="exPackMsg" class="small"></p>
            <label class="small">Nama <input id="examName" type="text" maxlength="60" value="${esc($('inStudent').value)}" placeholder="nama siswa"></label>
            <button type="button" class="btn primary" data-a="startExam">Mulai ujian</button>
          </div>
        </div>`;
    }
    if (!exam.submitted) {
      return `<div class="edu-head"><b>Ujian berjalan</b>
        <span class="small">kode <b>${exam.code}</b> · tingkat <b>${esc(exam.level.name)}</b> · ${esc((UT.EXAM_SPECIMENS.find((x) => x.id === exam.specimen) || {}).name || '')} · T = ${exam.T} mm ·
        ${exam.count === 1 ? '1 cacat' : 'jumlah cacat dirahasiakan'} · ⏱ <b id="examTimer">00:00</b>${exam.minutes ? ` <span class="muted">(batas ${exam.minutes} menit)</span>` : ''}</span>
        <span class="btnrow"><button type="button" class="btn primary" data-a="submitExam">Kirim jawaban</button>
        <button type="button" class="btn" data-a="cancelExam">Batalkan</button></span></div>
        <ol class="small examsteps">
          ${exam.level.training ? '<li>Kalibrasi probe di <b>Blok IIW</b> (X-value, zero, sudut).</li>' : ''}
          ${exam.level.autoDac ? '<li>DAC sudah disediakan; gain diatur ke gain scanning (reference + 6 dB).</li>'
            : '<li>Buat DAC di <b>Blok kalibrasi ASME</b>, lalu atur gain scanning (+6 dB).</li>'}
          ${exam.level.process ? '<li><b>Proses ikut dinilai (30%)</b>: nilai kalibrasi di alat (X-value, sudut, zero, velocity), kurva DAC, dan gain scanning saat jawaban dikirim. Biarkan gain pada gain scanning ketika mengirim.</li>' : ''}
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
    const P = R.process;
    const procHTML = P ? `<p class="small"><b>Proses ${Math.round(P.score)}/100</b> — kalibrasi ${Math.round(P.parts.kalibrasi)}/40 ·
      DAC ${Math.round(P.parts.dac)}/40 · gain scanning ${Math.round(P.parts.gain)}/20${P.notes.length ? ` <span class="muted">(${esc(P.notes.join('; '))})</span>` : ''}<br>
      Nilai akhir = 70% laporan (${Math.round(R.reportScore)}) + 30% proses (${Math.round(P.score)}).</p>` : '';
    const fc = R.falseCalls.length
      ? `<p class="small bad">Indikasi palsu (−10 poin per indikasi): ${R.falseCalls.map((o) => '#' + (o.j + 1)).join(', ')}</p>` : '';
    return `<div class="edu-head"><b>Hasil ujian</b>
      <span class="small">kode ${exam.code} · ${esc(exam.level.name)} · waktu ${fmtTime(exam.elapsed)}</span>
      <span class="btnrow"><button type="button" class="btn primary" data-a="print">Cetak laporan</button>
      <button type="button" class="btn primary" data-a="saveResult">Unduh hasil (.json)</button>
      <button type="button" class="btn" data-a="newExam">Ujian baru</button></span></div>
      <p class="muted small">Serahkan file hasil (.json) atau laporan (.html) ke instruktur. Instruktur mengimpornya di tab <b>Rekap kelas</b>.</p>
      <p class="bigscore">Nilai <b>${Math.round(R.score)}</b> / 100
        <span class="muted small">(${P ? `laporan ${Math.round(R.reportScore)}, proses ${Math.round(P.score)}; ` : ''}rata-rata per cacat ${Math.round(R.base)}${R.penalty ? `, −${R.penalty} indikasi palsu` : ''})</span></p>
      <div class="tablewrap"><table class="reptable"><thead><tr><th>#</th><th>Cacat sebenarnya</th><th>Lokasi</th><th>Laporan</th>
      <th>Deteksi /40</th><th>Lokasi /15</th><th>Panjang /15</th><th>Jenis /15</th><th>Keputusan /15</th><th>Total</th><th>Catatan</th></tr></thead>
      <tbody>${det}</tbody></table></div>${fc}${procHTML}
      <p class="muted small">Cacat kini ditampilkan (mode guru). Geser probe untuk mempelajari echo yang terlewat.</p>`;
  }

  function startExam() {
    const code = Math.max(1, Math.round(parseFloat($('examCode').value) || examCode));
    const name = $('examName').value.trim();
    if (name) $('inStudent').value = name;
    const lvEl = panel.querySelector('input[name=lvl]:checked');
    examLevel = lvEl ? lvEl.value : examLevel;
    readExamOpts();
    if (examOpt.source === 'kustom' && !(S.custom && S.custom.length)) { window.alert('Skenario instruktur masih kosong. Susun cacat di editor skenario dulu.'); return; }
    const ex = UT.makeExam(code, examLevel, { specimen: examOpt.specimen, count: examOpt.count, minutes: examOpt.minutes, custom: examOpt.source === 'kustom' ? S.custom : null });
    app.setTechnique('ut');
    app.setMaterial('cs');
    app.setWave('T');
    const st = UT.examState(ex);
    Object.assign(S, {
      contour: true, asmeCurved: false, code: 'asme', awsB: null, _angleBefore: null, dual: false, orient: 'tegak',
      showDefects: false, probeY: st.specimen === 'tubular' ? 0 : 150, side: 'kiri', angle: 60, freq: 4, crystal: 10,
      velocity: C.material.vT, gateLevel: 20, probeX: null,
    }, st);
    app.locks.truth = app.locks.scenario = app.locks.autoCal = true;
    app.training = ex.level.training;
    if (ex.level.process) app.newProbe(UT.rng((code * 104729) ^ 0x3c3c)); // galat probe dari kode soal
    else app.newProbe(ex.level.training);
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
    app.setSpecimen(st.specimen);
    exam = { code, level: ex.level, T: ex.T, start: Date.now(), submitted: false, specimen: ex.specimen, count: ex.count, minutes: ex.minutes, custom: ex.custom };
    renderPanel();
  }

  function readExamOpts() {
    if (!$('exSpec')) return;
    examOpt.specimen = $('exSpec').value;
    examOpt.count = +$('exCount').value || 0;
    examOpt.minutes = Math.max(0, Math.min(240, +$('exMin').value || 0));
    examOpt.source = $('exSrc').value;
    if (examOpt.source === 'kustom') examOpt.specimen = 'pelat';
  }

  function cancelExam(rerender = true) {
    exam = null;
    unlockAll();
    if (rerender) renderPanel();
  }

  function submitExam(auto) {
    if (!auto && !rows.length && !window.confirm('Laporan indikasi masih kosong. Tetap kirim?')) return;
    if (!auto && rows.length && !window.confirm(`Kirim ${rows.length} indikasi untuk dinilai?`)) return;
    exam.elapsed = Date.now() - exam.start;
    const truth = app.spec.type === 'tubular' ? UT.tubTruth(app.spec) : app.spec.scene.truth;
    exam.result = UT.gradeExam(truth, rows, { t: exam.T });
    let process = null;
    if (exam.level.process) {
      process = {
        H: Object.assign({}, app.H),
        user: { xValue: S.xValue, angle: S.angleUser, zero: S.zero, velocity: S.velocity },
        vTrue: app.trueV(), dacPoints: app.dac.points.map((p) => ({ sp: p.sp, db: p.db })),
        gain: S.gain, freq: S.freq, crystal: S.crystal,
      };
      const proc = UT.gradeProcess(Object.assign({ T: exam.T }, process));
      exam.result.reportScore = exam.result.score;
      exam.result.process = proc;
      exam.result.score = UT.combineScore({ score: exam.result.reportScore }, proc);
    }
    exam.submitted = true;
    exam.record = UT.buildResultRecord({
      student: $('inStudent').value.trim(), code: exam.code, levelId: exam.level.id, T: exam.T, gen: 2,
      date: new Date().toLocaleString('id-ID'), elapsedMs: exam.elapsed, rows, result: exam.result, process,
      specimen: exam.specimen, count: exam.count, minutes: exam.minutes, custom: exam.custom,
    });
    rowsLocked = true;
    app.locks.truth = false;
    S.showDefects = true;
    app.syncControls();
    renderRows();
    renderPanel();
  }

  let lastTimer = '';
  function examTick() {
    if (!exam || exam.submitted) return;
    const used = Date.now() - exam.start;
    if (exam.minutes && used >= exam.minutes * 60000) {
      // waktu habis: jawaban dikirim otomatis
      if (activity !== 'ujian') setActivity('ujian');
      submitExam(true);
      window.alert('Waktu ujian habis. Jawaban dikirim otomatis.');
      return;
    }
    if (activity !== 'ujian') return;
    const t = exam.minutes ? `${fmtTime(used)} / sisa ${fmtTime(exam.minutes * 60000 - used)}` : fmtTime(used);
    if (t !== lastTimer) {
      lastTimer = t;
      const el = $('examTimer');
      if (el) el.textContent = t;
    }
  }

  // ================================================================ rekap kelas
  const REKAP_KEY = 'ut-rekap-v1';
  const rekap = []; // { rec, regrade, file }
  let rekapFilter = '';
  let rekapMsg = '';
  try {
    const saved = JSON.parse(window.localStorage.getItem(REKAP_KEY) || '[]');
    saved.forEach((r) => {
      try { const rec = UT.parseResultFile(JSON.stringify(r.rec)); rekap.push({ rec, regrade: UT.regradeRecord(rec), file: r.file }); } catch (e) { /* lewati */ }
    });
  } catch (e) { /* penyimpanan tidak tersedia */ }
  function saveRekap() {
    try { window.localStorage.setItem(REKAP_KEY, JSON.stringify(rekap.map((e) => ({ rec: e.rec, file: e.file })))); } catch (e) { /* abaikan */ }
  }
  const filteredEntries = () => rekap.filter((e) => !rekapFilter || String(e.rec.code) === rekapFilter);

  function importFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    let ok = 0, dup = 0;
    const errs = [];
    let pending = list.length;
    list.forEach((f) => {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const rec = UT.parseResultFile(fr.result);
          if (rekap.some((e) => UT.recordKey(e.rec) === UT.recordKey(rec))) dup++;
          else { rekap.push({ rec, regrade: UT.regradeRecord(rec), file: f.name }); ok++; }
        } catch (err) { errs.push(`${f.name}: ${err.message}`); }
        if (--pending === 0) {
          rekapMsg = `${ok} file diimpor${dup ? `, ${dup} duplikat dilewati` : ''}${errs.length ? `. Gagal: ${errs.join('; ')}` : ''}.`;
          saveRekap();
          renderPanel();
        }
      };
      fr.onerror = () => { errs.push(`${f.name}: tidak bisa dibaca`); if (--pending === 0) renderPanel(); };
      fr.readAsText(f);
    });
  }

  function rekapHTML() {
    const codes = Array.from(new Set(rekap.map((e) => String(e.rec.code)))).sort();
    const ents = filteredEntries();
    const st = UT.summarizeClass(ents);
    const f0 = (v) => (v == null ? '–' : Math.round(v));
    const typeRows = Object.keys(st.byType).sort().map((t) => {
      const v = st.byType[t];
      return `<tr><td>${esc(UT.TYPE_NAMES[t] || t)}</td><td>${v.found} / ${v.total}</td><td>${Math.round((v.found / v.total) * 100)}%</td></tr>`;
    }).join('');
    const rowsHtml = ents.map((e) => {
      const r = e.regrade.result;
      const i = rekap.indexOf(e);
      const stCls = e.regrade.status === 'cocok' ? 'ok' : e.regrade.status === 'berbeda' ? 'bad' : '';
      return `<tr><td>${esc(e.rec.student || '(tanpa nama)')}</td><td>${e.rec.code}</td><td>${esc(e.regrade.level.name)}</td>
        <td><b>${Math.round(r.score)}</b></td><td class="${stCls}">${e.rec.score == null ? '–' : Math.round(e.rec.score)} · ${esc(e.regrade.status)}</td>
        <td>${r.perDefect.filter((p) => p.report).length} / ${r.perDefect.length}</td><td>${r.falseCalls.length}</td>
        <td>${UT.fmtElapsed(e.rec.elapsedMs)}</td><td class="small">${esc(e.rec.date)}</td>
        <td><button type="button" class="btn" data-a="rekapDel" data-i="${i}" aria-label="Hapus">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="10" class="muted small c">Belum ada hasil. Impor file hasil ujian (.json) atau laporan (.html) dari siswa.</td></tr>';
    return `<div class="edu-head"><b>Rekap kelas</b>
        <label class="btn primary filebtn">Impor file hasil… <input id="rekapFiles" type="file" accept=".json,.html,.htm,application/json,text/html" multiple></label>
        <label class="small">Kode soal <select id="rekapCode"><option value="">semua</option>${codes.map((c) => `<option${c === rekapFilter ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <span class="btnrow"><button type="button" class="btn" data-a="rekapCsv"${ents.length ? '' : ' disabled'}>Unduh CSV</button>
        <button type="button" class="btn" data-a="rekapClear"${rekap.length ? '' : ' disabled'}>Hapus semua</button></span></div>
      <p class="muted small">Seret file ke panel ini atau pakai tombol impor. Nilai <b>dihitung ulang</b> dari kode soal dan laporan indikasi; kolom “Nilai di file” menandai bila angka di file berbeda. Data tersimpan hanya di browser ini.</p>
      ${rekapMsg ? `<p class="small">${esc(rekapMsg)}</p>` : ''}
      <div class="rekapstats">
        <div><span>Siswa</span><b>${st.n}</b></div><div><span>Rata-rata</span><b>${f0(st.mean)}</b></div>
        <div><span>Median</span><b>${f0(st.median)}</b></div><div><span>Min – maks</span><b>${f0(st.min)} – ${f0(st.max)}</b></div>
        <div><span>Cacat ditemukan</span><b>${st.total ? Math.round((st.found / st.total) * 100) + '%' : '–'}</b></div>
        <div><span>Indikasi palsu</span><b>${st.falseCalls}</b></div>
      </div>
      <div class="rekapgrid">
        <div class="tablewrap"><table class="reptable"><thead><tr><th>Nama</th><th>Kode</th><th>Tingkat</th><th>Nilai</th><th>Nilai di file</th>
          <th>Ditemukan</th><th>Palsu</th><th>Waktu</th><th>Tanggal</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        <div><b class="small">Deteksi per jenis cacat</b>
          <div class="tablewrap"><table class="reptable"><thead><tr><th>Jenis</th><th>Ditemukan</th><th>%</th></tr></thead>
          <tbody>${typeRows || '<tr><td colspan="3" class="muted small c">–</td></tr>'}</tbody></table></div>
          <p class="muted small">Jenis dengan persentase rendah perlu dibahas ulang di kelas.</p></div>
      </div>`;
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
    if (app.isPar && app.isPar()) {
      // Scan sejajar las: posisi sepanjang las dari pembacaan alat; sizing 6 dB = panjang melintang las
      const type = S.indType;
      const Lx = z.y1 != null && z.y2 != null ? Math.abs(z.y2 - z.y1) : null;
      const yAlong = r ? r.x : S.probeX;
      const planar = (UT.INDICATION_TYPES.find((x) => x.id === type) || {}).planar;
      const ev = UT.evaluateASME({ pctDAC: r ? r.pct : null, dacExists: app.dac.points.length > 0, type, length: Lx, t: app.spec.T });
      rows.push({
        y1: yAlong - 1, y2: yAlong + 1, depth: r ? r.depth : null,
        x: Lx != null ? (z.y1 + z.y2) / 2 : S.probeY, pctDAC: r ? r.pct : null,
        type, verdict: planar || ev.verdict === 'tolak' ? 'tolak' : 'terima',
        note: `scan sejajar${Lx != null ? `, panjang melintang ${Lx.toFixed(1)} mm` : ''}${r ? '' : ', tidak ada echo di gate'}`,
      });
      renderRows();
      return;
    }
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

  // Data laporan (proyek, prosedur, peralatan) disimpan di S.reportInfo (ikut tersimpan di sesi)
  function syncRepInfo() {
    S.reportInfo = S.reportInfo || {};
    document.querySelectorAll('#repInfo [data-ri]').forEach((el) => { el.value = S.reportInfo[el.dataset.ri] || ''; });
  }
  $('repInfo').addEventListener('input', (e) => {
    const k = e.target.dataset.ri;
    if (!k) return;
    S.reportInfo = S.reportInfo || {};
    S.reportInfo[k] = e.target.value.slice(0, 80);
  });
  syncRepInfo();

  /** Deskripsi benda uji untuk laporan sesuai jenisnya. */
  function specimenDesc() {
    const sp = app.spec;
    const bevel = (UT.BEVEL_TYPES.find((b) => b.id === S.bevelType) || {}).name || S.bevelType;
    if (sp.type === 'tubular') {
      const J = sp.J;
      return `Sambungan tubular ${J.type}: chord Ø${(2 * J.R).toFixed(1)} × ${J.Tc} mm, brace Ø${(2 * J.r).toFixed(1)} × ${J.tb} mm${J.type === 'T' ? '' : `, θ = ${J.theta}°`}${J.type === 'K' ? `, gap ${J.gap} mm` : ''}`;
    }
    if (sp.type === 'las') {
      const geo = S.geom === 'pipa' ? `Pipa OD ${S.OD} mm, las ${S.seam ? 'memanjang (seam)' : 'girth'}` : 'Pelat, las lurus';
      return `${geo}; bevel ${bevel}, ½ sudut ${S.bevelHalf}°, root gap ${S.rootGap} mm, T = ${sp.T} mm`;
    }
    return (UT.SPECIMENS.find((x) => x.id === S.specimen) || {}).name || sp.name;
  }

  function reportData() {
    const ref = UT.dacRefGain(app.dac);
    const sp = app.spec;
    const tub = sp.type === 'tubular';
    return {
      info: Object.assign({}, S.reportInfo || {}),
      specimenDesc: specimenDesc(),
      standard: UT.codeFull(S.code),
      technique: S.technique === 'paut' ? 'Phased Array' : S.technique === 'tofd' ? 'TOFD' : 'UT konvensional (pulse-echo)',
      awsB: S.code === 'aws' || S.code === 'aws-cyc' ? S.awsB : null,
      sketch: { kind: tub ? 'tubular' : 'linear', length: sp.yLen || UT.CONFIG.weldLength, r: tub ? sp.J.r : null,
        half: tub ? 20 : sp.weld ? sp.weld.capHalf : 10, rows: rows.slice() },
      student: $('inStudent').value.trim(),
      date: new Date().toLocaleString('id-ID'),
      mode: exam ? 'Ujian' : activity === 'tutorial' ? 'Tutorial' : 'Latihan',
      code: exam ? exam.code : S.scenario === 'acak' ? S.randSeed : '',
      level: exam ? exam.level.name : '',
      specimen: { T: app.spec.T, bevel: S.bevelHalf, material: C.material.name },
      probe: { angle: S.angle, freq: S.freq, crystal: S.crystal },
      cal: { xValue: S.xValue, angleUser: S.angleUser, zero: S.zero, velocity: S.velocity },
      dac: {
        refGain: ref, scanGain: ref == null ? null : ref + 6,
        points: app.dac.points.map((p) => ({ sp: p.sp, pct: Math.pow(10, (p.db + ref) / 20) })),
      },
      indications: rows.slice(),
      result: exam && exam.submitted ? exam.result : null,
      record: exam && exam.submitted ? exam.record : null,
    };
  }

  function printReport() {
    const html = UT.trHTML ? UT.trHTML(UT.buildReportHTML(reportData())) : UT.buildReportHTML(reportData());
    const w = window.open('', '_blank');
    if (!w) { downloadReport(); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  function saveFile(content, type, filename) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const safeName = (s) => (s || 'siswa').replace(/[^\w\-]+/g, '_');
  UT.saveFile = saveFile;
  UT.safeName = safeName;

  function downloadReport() {
    saveFile(UT.trHTML ? UT.trHTML(UT.buildReportHTML(reportData())) : UT.buildReportHTML(reportData()), 'text/html', `laporan-ut-${safeName($('inStudent').value.trim())}.html`);
  }

  function saveResult() {
    if (!exam || !exam.record) return;
    saveFile(JSON.stringify(exam.record, null, 1), 'application/json',
      `hasil-ujian-${safeName(exam.record.student)}-${exam.code}.json`);
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
    else if (a === 'packMake') {
      readExamOpts();
      const code = Math.max(1, Math.round(parseFloat($('examCode').value) || examCode));
      const lv = panel.querySelector('input[name=lvl]:checked');
      const pk = UT.examPackCode({ code, level: lv ? lv.value : examLevel, specimen: examOpt.specimen, count: examOpt.count, minutes: examOpt.minutes, custom: examOpt.source === 'kustom' ? S.custom : null });
      $('exPack').value = pk;
      $('exPackMsg').textContent = 'Bagikan kode paket ini ke siswa; siswa menempelnya lalu menekan “Pakai paket”.';
      if (navigator.clipboard) navigator.clipboard.writeText(pk).catch(() => {});
    } else if (a === 'packUse') {
      try {
        const pk = UT.examPackFrom($('exPack').value);
        examCode = pk.code; examLevel = pk.level;
        Object.assign(examOpt, { specimen: pk.specimen, count: pk.count, minutes: pk.minutes, source: pk.custom ? 'kustom' : 'acak' });
        if (pk.custom) S.custom = pk.custom;
        renderPanel();
        $('exPackMsg').textContent = 'Paket ujian dipakai. Tekan “Mulai ujian”.';
      } catch (err) { $('exPackMsg').textContent = err.message; }
    }
    else if (a === 'submitExam') submitExam();
    else if (a === 'cancelExam') { if (window.confirm('Batalkan ujian?')) cancelExam(); }
    else if (a === 'newExam') { exam = null; examCode = UT.randomExamCode(app.rand); unlockAll(); renderPanel(); }
    else if (a === 'print') printReport();
    else if (a === 'saveResult') saveResult();
    else if (a === 'rekapCsv') saveFile(UT.classCSV(filteredEntries()), 'text/csv', 'rekap-nilai-ut.csv');
    else if (a === 'rekapClear') { if (window.confirm('Hapus semua data rekap di browser ini?')) { rekap.length = 0; saveRekap(); renderPanel(); } }
    else if (a === 'rekapDel') { const i = +b.dataset.i; rekap.splice(i, 1); saveRekap(); renderPanel(); }
  });
  panel.addEventListener('change', (e) => {
    if (e.target.name === 'lvl') examLevel = e.target.value;
    if (e.target.id === 'rekapFiles') importFiles(e.target.files);
    if (e.target.id === 'rekapCode') { rekapFilter = e.target.value; renderPanel(); }
  });
  panel.addEventListener('dragover', (e) => { if (activity === 'rekap') { e.preventDefault(); panel.classList.add('drop'); } });
  panel.addEventListener('dragleave', () => panel.classList.remove('drop'));
  panel.addEventListener('drop', (e) => {
    if (activity !== 'rekap') return;
    e.preventDefault();
    panel.classList.remove('drop');
    importFiles(e.dataTransfer.files);
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

  // ================================================================ simpan & buka sesi
  UT.SESSION_TYPE = 'ut-simulator/sesi';
  /** Data sesi: pengaturan, kebenaran probe, kalibrasi, DAC, sizing, dan laporan. */
  function sessionData() {
    const st = {};
    Object.keys(S).forEach((k) => { const v = S[k]; if (typeof v !== 'function') st[k] = v; });
    return {
      type: UT.SESSION_TYPE, version: C.version, savedAt: new Date().toISOString(),
      S: JSON.parse(JSON.stringify(st)), H: Object.assign({}, app.H), training: !!app.training,
      dac: JSON.parse(JSON.stringify(app.dac)), sizing: Object.assign({}, app.sizing),
      rows: JSON.parse(JSON.stringify(rows)), student: $('inStudent').value,
    };
  }
  function restoreSession(o) {
    if (!o || o.type !== UT.SESSION_TYPE || !o.S) throw new Error('bukan file sesi simulator');
    const keep = new Set(Object.keys(C.defaults).concat(Object.keys(S)));
    Object.keys(o.S).forEach((k) => { if (keep.has(k)) S[k] = o.S[k]; });
    app.training = !!o.training;
    app.setH(o.H);
    app.dac = o.dac && Array.isArray(o.dac.points) ? o.dac : UT.dacCreate();
    Object.assign(app.sizing, o.sizing || {});
    rows.length = 0;
    (Array.isArray(o.rows) ? o.rows : []).slice(0, 50).forEach((r) => rows.push(r));
    rowsLocked = false;
    $('inStudent').value = o.student || '';
    syncRepInfo();
    app.rebuild();
    app.syncControls();
    app.renderDac();
    app.renderSizing();
    renderRows();
  }
  const examRunning = () => exam && !exam.submitted;
  $('btnSave').addEventListener('click', () => {
    if (examRunning()) { window.alert('Sesi tidak bisa disimpan saat ujian berjalan.'); return; }
    saveFile(JSON.stringify(sessionData(), null, 1), 'application/json', `sesi-ut-${safeName($('inStudent').value.trim())}.json`);
  });
  $('btnOpen').addEventListener('click', () => {
    if (examRunning()) { window.alert('Sesi tidak bisa dibuka saat ujian berjalan.'); return; }
    $('inSession').click();
  });
  $('inSession').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (activity !== 'bebas') setActivity('bebas');
      restoreSession(o);
    } catch (err) { window.alert(`${f.name}: ${err.message}`); }
  });

  UT.edu = {
    sessionData, restoreSession,
    reportRows: () => rows,
    reportHTML: () => UT.buildReportHTML(reportData()),
    get activity() { return activity; },
    get exam() { return exam; },
    setActivity,
  };

  renderTabs();
  renderRows();
})();
