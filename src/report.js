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
  /** Sketsa lokasi indikasi (SVG): tampak atas las, sumbu mendatar = sepanjang las (atau φ untuk tubular). */
  UT.reportSketchSVG = function (sk) {
    if (!sk) return '';
    const W = 680, H = 170, L = 40, R = 16, top = 22, mid = 88, sx = (W - L - R) / (sk.kind === 'tubular' ? 360 : sk.length);
    const pos = (y) => L + (sk.kind === 'tubular' ? (y / sk.r) * (180 / Math.PI) : y) * sx;
    const xs = 2.2; // px per mm melintang
    const band = sk.half * xs;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="10">`;
    s += `<rect x="${L}" y="${mid - band}" width="${W - L - R}" height="${2 * band}" fill="#e7dcc6" stroke="#9c8357"/>`;
    s += `<line x1="${L}" y1="${mid}" x2="${W - R}" y2="${mid}" stroke="#6b7785" stroke-dasharray="5 4"/>`;
    const ticks = sk.kind === 'tubular' ? [0, 90, 180, 270, 360] : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * sk.length));
    ticks.forEach((t) => {
      const x = sk.kind === 'tubular' ? L + t * sx : L + t * sx;
      s += `<line x1="${x}" y1="${H - 30}" x2="${x}" y2="${H - 24}" stroke="#52606d"/><text x="${x}" y="${H - 12}" text-anchor="middle" fill="#52606d">${t}${sk.kind === 'tubular' ? '°' : ''}</text>`;
    });
    s += `<text x="${L}" y="${top - 8}" fill="#52606d">${sk.kind === 'tubular' ? 'posisi keliling φ (heel 0°, toe 180°)' : 'y sepanjang las (mm)'} · atas: sisi kiri / brace, bawah: sisi kanan / chord</text>`;
    (sk.rows || []).forEach((r, i) => {
      if (r.y1 == null && r.y2 == null) return;
      const a = r.y1 != null ? r.y1 : r.y2, b = r.y2 != null ? r.y2 : r.y1;
      const x1 = pos(Math.min(a, b)), x2 = Math.max(x1 + 3, pos(Math.max(a, b)));
      const yc = mid + Math.max(-60, Math.min(60, (r.x || 0) * xs));
      const col = r.verdict === 'tolak' ? '#d62828' : '#0077cc';
      s += `<rect x="${x1}" y="${yc - 5}" width="${x2 - x1}" height="10" fill="${col}" fill-opacity="0.35" stroke="${col}"/>`;
      s += `<text x="${(x1 + x2) / 2}" y="${yc - 8}" text-anchor="middle" fill="${col}" font-weight="bold">#${i + 1}</text>`;
    });
    return s + '</svg>';
  };

  UT.buildReportHTML = function (d) {
    const info = d.info || {};
    const iv = (k) => esc(info[k] || '–');
    const conclusion = d.indications.length
      ? (d.indications.some((r) => r.verdict === 'tolak')
        ? `DITOLAK – ${d.indications.filter((r) => r.verdict === 'tolak').length} indikasi tidak dapat diterima.`
        : `DITERIMA – ${d.indications.length} indikasi tercatat, semuanya dapat diterima.`)
      : 'DITERIMA – tidak ada indikasi yang perlu dilaporkan.';
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
<h2>1. Informasi umum</h2>
<div class="grid">
  <div><span>Proyek / klien</span>${iv('proyek')}</div>
  <div><span>No. laporan</span>${iv('noLaporan')}</div>
  <div><span>Lokasi pemeriksaan</span>${iv('lokasi')}</div>
  <div><span>Tanggal</span>${esc(d.date)}</div>
  <div><span>Nama pemeriksa</span>${esc(d.student || '–')}</div>
  <div><span>Level pemeriksa</span>${iv('level')}</div>
</div>
<h2>2. Benda uji</h2>
<div class="grid">
  <div><span>Identitas / no. sambungan</span>${iv('idBenda')}</div>
  <div><span>Uraian</span>${esc(d.specimenDesc || '–')}</div>
  <div><span>Material</span>${esc(d.specimen.material)}</div>
  <div><span>Tebal (T)</span>${esc(d.specimen.T)} mm</div>
  <div><span>Kondisi permukaan</span>${iv('permukaan')}</div>
  <div><span>Suhu permukaan</span>${info.suhu ? esc(info.suhu) + ' °C' : '–'}</div>
</div>
<h2>3. Prosedur &amp; acuan</h2>
<div class="grid">
  <div><span>No. prosedur</span>${iv('noProsedur')}</div>
  <div><span>Acuan / kriteria</span>${esc(d.standard || 'ASME Sec. V Art. 4 / Sec. VIII Div. 1 App. 12')}</div>
  <div><span>Teknik</span>${esc(d.technique || 'UT konvensional (pulse-echo)')}</div>
</div>
<h2>4. Peralatan</h2>
<div class="grid">
  <div><span>Flaw detector</span>${iv('alat')}</div>
  <div><span>No. seri alat</span>${iv('noSeri')}</div>
  <div><span>Probe</span>${esc(d.probe.angle)}° nominal · ${esc(d.probe.freq)} MHz · kristal ${esc(d.probe.crystal)} mm</div>
  <div><span>Couplant</span>${iv('couplant')}</div>
</div>
<h2>5. Kalibrasi</h2>
<div class="grid">
  <div><span>Kalibrasi alat</span>X-value ${f1(d.cal.xValue)} mm · sudut ${f1(d.cal.angleUser)}° · zero ${Number(d.cal.zero).toFixed(2)} µs · v ${esc(d.cal.velocity)} m/s</div>
  <div><span>Blok kalibrasi</span>IIW V1/V2 (probe), blok kalibrasi dasar ASME (DAC)</div>
  <div><span>Reference level</span>${d.dac && d.dac.refGain != null ? f1(d.dac.refGain) + ' dB' : '–'}</div>
  <div><span>Gain scanning</span>${d.dac && d.dac.scanGain != null ? f1(d.dac.scanGain) + ' dB' : '–'}</div>
  ${d.awsB != null ? `<div><span>AWS reference level b</span>${f1(d.awsB)} dB</div>` : ''}
</div>
<h2>Titik DAC (blok kalibrasi dasar ASME)</h2>
<table><thead><tr><th>#</th><th>SP (mm)</th><th>Amplitudo pada reference level</th></tr></thead><tbody>${dacRows}</tbody></table>
<h2>6. Indikasi</h2>
<table><thead><tr><th>#</th><th>y awal (mm)</th><th>y akhir (mm)</th><th>Panjang (mm)</th><th>Kedalaman (mm)</th>
<th>Posisi thd sumbu las (mm)</th><th>%DAC</th><th>Interpretasi</th><th>Keputusan</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>
<h2>7. Sketsa lokasi indikasi</h2>
${UT.reportSketchSVG(d.sketch)}
<h2>8. Kesimpulan</h2>
<p><b>${esc(conclusion)}</b></p>
${result}
<div class="sign"><div>Pemeriksa</div><div>Penilai / instruktur</div></div>
<p class="note">Dibuat dengan simulator edukasi. Model fisika disederhanakan; laporan ini bukan dokumen inspeksi resmi.</p>
${d.record ? `<script type="application/json" id="ut-result">${UT.recordForHTML(d.record)}</script>` : ''}
</body></html>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
