/*
 * Laporan inspeksi (HTML mandiri, siap dicetak / disimpan sebagai PDF lewat dialog cetak browser).
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f1 = (v) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(1));

  /**
   * data = {
   *   student, date, mode, code, level,
   *   specimen: { T, bevel, material },
   *   probe: { angle, freq, crystal },
   *   cal: { xValue, angleUser, zero, velocity },
   *   dac: { refGain, scanGain, points:[{sp, pct}] },
   *   indications: [{y1, y2, depth, x, pctDAC, type, verdict, note}],
   *   result: hasil UT.gradeExam (opsional)
   * }
   */
  UT.buildReportHTML = function (d) {
    const rows = d.indications.map((r, i) => {
      const L = r.y1 != null && r.y2 != null ? Math.abs(r.y2 - r.y1) : null;
      return `<tr><td>${i + 1}</td><td>${f1(r.y1)}</td><td>${f1(r.y2)}</td><td>${f1(L)}</td><td>${f1(r.depth)}</td>`
        + `<td>${f1(r.x)}</td><td>${r.pctDAC == null ? '–' : Math.round(r.pctDAC) + '%'}</td>`
        + `<td>${esc(UT.TYPE_NAMES[r.type] || r.type)}</td><td>${r.verdict === 'tolak' ? 'Ditolak' : 'Diterima'}</td><td>${esc(r.note)}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="c">Tidak ada indikasi yang dilaporkan.</td></tr>';

    const dacRows = d.dac && d.dac.points.length
      ? d.dac.points.map((p, i) => `<tr><td>${i + 1}</td><td>${f1(p.sp)}</td><td>${Math.round(p.pct)}%</td></tr>`).join('')
      : '<tr><td colspan="3" class="c">Belum ada DAC.</td></tr>';

    let result = '';
    if (d.result) {
      const R = d.result;
      const det = R.perDefect.map((p, i) => {
        const t = p.truth;
        return `<tr><td>${i + 1}</td><td>${esc(UT.TYPE_NAMES[t.type])}</td><td>${f1(t.y1)}–${f1(t.y2)}</td>`
          + `<td>${f1(t.z1)}–${f1(t.z2)}</td><td>${p.reportIndex == null ? '–' : '#' + (p.reportIndex + 1)}</td>`
          + `<td>${Math.round(p.parts.deteksi)}</td><td>${Math.round(p.parts.lokasi)}</td><td>${Math.round(p.parts.panjang)}</td>`
          + `<td>${Math.round(p.parts.jenis)}</td><td>${Math.round(p.parts.keputusan)}</td><td><b>${Math.round(p.total)}</b></td>`
          + `<td>${esc(p.notes.join('; '))}</td></tr>`;
      }).join('');
      result = `<h2>Hasil penilaian</h2>
        <p class="score">Nilai: <b>${Math.round(R.score)}</b> / 100
        <span>(rata-rata per cacat ${Math.round(R.base)}${R.penalty ? `, dikurangi ${R.penalty} untuk ${R.falseCalls.length} indikasi palsu` : ''})</span></p>
        <table><thead><tr><th>#</th><th>Cacat sebenarnya</th><th>y (mm)</th><th>Kedalaman (mm)</th><th>Laporan</th>
        <th>Deteksi /40</th><th>Lokasi /15</th><th>Panjang /15</th><th>Jenis /15</th><th>Keputusan /15</th><th>Total</th><th>Catatan</th></tr></thead>
        <tbody>${det}</tbody></table>`;
    }

    return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Inspeksi UT – ${esc(d.student || 'siswa')}</title>
<style>
  body { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2933; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 20px 0 6px; border-bottom: 1px solid #ccd3da; padding-bottom: 3px; }
  .meta { color: #52606d; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 24px; }
  .grid div span { color: #52606d; display: inline-block; min-width: 170px; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th, td { border: 1px solid #ccd3da; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eef1f4; font-weight: 600; } td.c { text-align: center; color: #6b7785; }
  .score { font-size: 16px; } .score span { font-size: 13px; color: #52606d; }
  .sign { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sign div { border-top: 1px solid #1f2933; padding-top: 4px; }
  .note { color: #6b7785; font-size: 11px; margin-top: 18px; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
</style></head><body>
<p class="noprint"><button onclick="window.print()">Cetak / simpan PDF</button></p>
<h1>Laporan Inspeksi Ultrasonik (UT) – Las</h1>
<p class="meta">Simulator UT Las v${esc(UT.CONFIG.version)} · ${esc(d.mode)}${d.code ? ` · kode soal ${esc(d.code)}` : ''}${d.level ? ` · tingkat ${esc(d.level)}` : ''} · ${esc(d.date)}</p>
<div class="grid">
  <div><span>Nama pemeriksa</span>${esc(d.student || '–')}</div>
  <div><span>Acuan</span>ASME Sec. V Art. 4 / Sec. VIII Div. 1 App. 12</div>
  <div><span>Benda uji</span>Pelat las bevel V, T = ${esc(d.specimen.T)} mm, ½ sudut bevel ${esc(d.specimen.bevel)}°</div>
  <div><span>Material</span>${esc(d.specimen.material)}</div>
  <div><span>Probe</span>${esc(d.probe.angle)}° nominal · ${esc(d.probe.freq)} MHz · kristal ${esc(d.probe.crystal)} mm</div>
  <div><span>Kalibrasi alat</span>X-value ${f1(d.cal.xValue)} mm · sudut ${f1(d.cal.angleUser)}° · zero ${Number(d.cal.zero).toFixed(2)} µs · v ${esc(d.cal.velocity)} m/s</div>
  <div><span>Reference level</span>${d.dac && d.dac.refGain != null ? f1(d.dac.refGain) + ' dB' : '–'}</div>
  <div><span>Gain scanning</span>${d.dac && d.dac.scanGain != null ? f1(d.dac.scanGain) + ' dB' : '–'}</div>
</div>
<h2>Titik DAC (blok kalibrasi dasar ASME)</h2>
<table><thead><tr><th>#</th><th>SP (mm)</th><th>Amplitudo pada reference level</th></tr></thead><tbody>${dacRows}</tbody></table>
<h2>Indikasi</h2>
<table><thead><tr><th>#</th><th>y awal (mm)</th><th>y akhir (mm)</th><th>Panjang (mm)</th><th>Kedalaman (mm)</th>
<th>Posisi thd sumbu las (mm)</th><th>%DAC</th><th>Interpretasi</th><th>Keputusan</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>
${result}
<div class="sign"><div>Pemeriksa</div><div>Penilai / instruktur</div></div>
<p class="note">Dibuat dengan simulator edukasi. Model fisika disederhanakan; laporan ini bukan dokumen inspeksi resmi.</p>
${d.record ? `<script type="application/json" id="ut-result">${UT.recordForHTML(d.record)}</script>` : ''}
</body></html>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
