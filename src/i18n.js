/*
 * Pilihan bahasa tampilan: Indonesia (asli) atau Inggris.
 *
 * Cara kerja: teks antarmuka tetap ditulis dalam bahasa Indonesia di kode. Saat bahasa Inggris
 * dipilih, setiap node teks, atribut (placeholder/title), teks kanvas (fillText) dan dialog
 * diterjemahkan lewat:
 *   1) kamus kalimat utuh (teks statis, pelajaran, skenario, …),
 *   2) pola (regex) untuk teks berisi angka,
 *   3) penggantian frasa (batas kata) sebagai cadangan untuk teks dinamis lainnya.
 * Teks asli disimpan sehingga bahasa bisa diganti bolak-balik tanpa memuat ulang halaman.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

  // ------------------------------------------------------------------ kamus kalimat utuh
  const D = {
    // kepala & panel
    'Simulator UT Las': 'Weld UT Simulator',
    'Cara pakai': 'How to use',
    'Tentang': 'About',
    'Simulator edukasi Ultrasonic Testing untuk inspeksi las, berjalan sepenuhnya di browser tanpa server. Semua data (laporan, rekap kelas) hanya tersimpan di perangkat pengguna.': 'An educational Ultrasonic Testing simulator for weld inspection, running entirely in the browser without a server. All data (reports, class summaries) is stored only on the user’s device.',
    'Cakupan': 'Scope',
    'Model & batasan (penting untuk instruktur)': 'Model & limitations (important for instructors)',
    'Nilai amplitudo bersifat kualitatif (proporsi antar-reflektor dibuat realistis, belum divalidasi terhadap alat tertentu). Faktor material dan rugi kopling permukaan lengkung juga kualitatif.': 'Amplitude values are qualitative (ratios between reflectors are made realistic but not validated against a specific instrument). Material factors and curved-surface coupling loss are also qualitative.',
    'Simulator ini': 'This simulator',
    'tidak menggantikan': 'does not replace',
    'latihan dengan alat dan spesimen nyata, dan laporan yang dihasilkan bukan dokumen inspeksi resmi.': 'practice with real equipment and specimens, and the reports it produces are not official inspection documents.',
    'Anisotropi las austenitik dimodelkan sederhana (arah energi berbelok mengikuti orientasi butir kolumnar). Fokus Phased Array hanya di bidang aktif; delay law dihitung untuk kontak langsung tanpa wedge.': 'Austenitic weld anisotropy is modelled simply (the energy direction bends following the columnar grain orientation). Phased Array focusing is in the active plane only; delay laws are computed for direct contact without a wedge.',
    'Tidak dimodelkan: konversi mode penuh, pemisahan berkas (beam splitting) di las austenitik, kekasaran permukaan korosi selain kemiringan.': 'Not modelled: full mode conversion, beam splitting in austenitic welds, corrosion surface roughness other than slope.',
    'Tabel kelas AWS D1.1 disusun untuk edukasi; cocokkan dengan edisi standar yang berlaku sebelum dipakai.': 'The AWS D1.1 class table is compiled for education; check it against the applicable edition of the code before use.',
    'Dasar': 'Basics',
    'Geser probe': 'Move the probe',
    'dengan mouse/jari pada penampang atau tampak atas, atau klik penampang lalu tekan': 'with the mouse/finger on the cross-section or top view, or click the cross-section and press',
    '(melintang las) dan': '(across the weld) and',
    '(sepanjang las). Tahan': '(along the weld). Hold',
    'untuk langkah 5 mm.': 'for 5 mm steps.',
    'Cari posisi probe yang memberi': 'Find the probe position giving the',
    'amplitudo maksimum': 'maximum amplitude',
    ', lalu atur': ', then set',
    'agar melingkupi echo.': 'to enclose the echo.',
    'Arahkan kursor ke A-scan untuk melihat titik yang sesuai di sepanjang berkas.': 'Hover over the A-scan to see the matching point along the beam.',
    'Matikan “Tampilkan cacat” untuk berlatih tanpa melihat cacat.': 'Turn off “Show flaws” to practise without seeing the flaws.',
    'Alur kalibrasi (tombol “Probe baru”)': 'Calibration workflow (“New probe” button)',
    'Blok IIW V1 (atau V2) – probe index:': 'IIW V1 block (or V2) – probe index:',
    'arahkan probe ke R100 (V2: R25/R50), cari echo maksimum, baca jarak depan probe ke tanda pusat → isi': 'aim the probe at R100 (V2: R25/R50), find the maximum echo, read the distance from the probe front to the centre mark → enter',
    'Range/zero:': 'Range/zero:',
    'atur': 'set',
    '(dan velocity) sampai echo R100 tepat di 100 mm dan 200 mm. Pada V2: menghadap R25 → 25, 100, 175 mm; menghadap R50 → 50, 125, 200 mm.': '(and velocity) until the R100 echo is exactly at 100 mm and 200 mm. On V2: facing R25 → 25, 100, 175 mm; facing R50 → 50, 125, 200 mm.',
    'Sudut:': 'Angle:',
    'balik probe ke arah lubang Ø50 (V1 sisi A; 70°–80° pakai Ø1,5 di sisi B; V2 pakai Ø5), cari echo maksimum, baca skala sudut pada tanda index → isi': 'turn the probe towards the Ø50 hole (V1 face A; 70°–80° use Ø1.5 on face B; V2 uses Ø5), find the maximum echo, read the angle scale at the index mark → enter',
    'sudut terukur': 'measured angle',
    'Blok ASME – DAC:': 'ASME block – DAC:',
    'maksimalkan echo SDH ¼T, ½T, ¾T lalu lanjutkan lewat leg 2 (¾T → 5/4T, ½T → 6/4T, ¼T → 7/4T) agar DAC mencakup satu skip penuh. Rekam setiap titik tanpa mengubah gain. Lalu “Gain = reference” dan “Gain scanning +6 dB”.': 'maximise the ¼T, ½T, ¾T SDH echoes, then continue via leg 2 (¾T → 5/4T, ½T → 6/4T, ¼T → 7/4T) so the DAC covers one full skip. Record each point without changing the gain. Then “Gain = reference” and “Scanning gain +6 dB”.',
    'Las:': 'Weld:',
    'scan, evaluasi %DAC, ukur panjang dengan 6 dB drop, pilih interpretasi, lihat hasil evaluasi ASME.': 'scan, evaluate %DAC, size the length with 6 dB drop, choose the interpretation, read the ASME evaluation.',
    'Teknik': 'Techniques',
    'UT konvensional': 'Conventional UT',
    ': A-scan + rekam B-scan; pada': ': A-scan + B-scan recording; on the',
    ': C-scan peta tebal.': ': C-scan thickness map.',
    ': S-scan 40–70° atau E-scan, dengan pilihan fokus; klik gambar untuk memilih sudut/berkas A-scan.': ': S-scan 40–70° or E-scan, with focusing options; click the image to choose the A-scan angle/beam.',
    ': D-scan sepanjang las; klik gambar untuk memasang penanda kedalaman A/B dan mengukur tinggi cacat.': ': D-scan along the weld; click the image to place depth markers A/B and measure flaw height.',
    'Pipa & material': 'Pipes & materials',
    'Pilih': 'Choose',
    'Geometri: Pipa': 'Geometry: Pipe',
    'lalu sambungan': 'then the joint',
    'girth': 'girth',
    '(posisi jam) atau': '(clock positions) or',
    'memanjang': 'longitudinal',
    '(penampang keliling, sudut maksimum menurut t/D). Wedge datar pada pipa kecil kehilangan banyak energi; centang': '(circumferential section, maximum angle given by t/D). A flat wedge on a small pipe loses a lot of energy; tick',
    'Wedge dikontur': 'Contoured wedge',
    'dan buat DAC pada': 'and build the DAC on a',
    'blok lengkung': 'curved block',
    '. Untuk': '. For',
    'baja austenitik': 'austenitic steel',
    ', bandingkan gelombang geser (SW) dengan longitudinal (LW) dan amati pembelokan berkas di logam las.': ', compare shear (SW) with longitudinal (LW) waves and observe beam skewing in the weld metal.',
    'Tutorial & ujian': 'Tutorials & exams',
    'untuk latihan terpandu, atau': 'for guided practice, or',
    'untuk soal acak dengan penilaian otomatis. Catat indikasi di kartu': 'for random tasks with automatic grading. Record indications on the',
    ', lalu cetak atau unduh laporannya. Setelah ujian, unduh': 'card, then print or download the report. After an exam, download the',
    'file hasil': 'result file',
    '; instruktur mengimpornya di tab': '; the instructor imports it in the',
    // bilah aktivitas & tab
    'Aktivitas:': 'Activity:',
    'Bebas': 'Free',
    'Tutorial': 'Tutorial',
    'Ujian': 'Exam',
    'Rekap kelas': 'Class summary',
    'Benda uji:': 'Test piece:',
    'Teknik:': 'Technique:',
    'Las (benda uji)': 'Weld (test piece)',
    'Blok IIW V1': 'IIW V1 block',
    'Blok V2': 'V2 block',
    'Blok kalibrasi dasar ASME': 'ASME basic calibration block',
    'Pelat korosi': 'Corroded plate',
    'Phased Array (S-scan)': 'Phased Array',
    '✓ Probe ideal, terkalibrasi': '✓ Ideal probe, calibrated',
    'Probe latihan – kalibrasi di blok IIW': 'Training probe – calibrate on the IIW block',
    '✓ Probe latihan terkalibrasi': '✓ Training probe calibrated',
    // penampang & legenda
    'Tampilan scanning (penampang las)': 'Scanning view (weld cross-section)',
    'Tampilan scanning (Blok kalibrasi dasar ASME)': 'Scanning view (ASME basic calibration block)',
    'Tampilan scanning (Pelat korosi)': 'Scanning view (corroded plate)',
    'Tampilan scanning (Blok IIW V1)': 'Scanning view (IIW V1 block)',
    'Tampilan scanning (Blok V2)': 'Scanning view (V2 block)',
    'Tampak atas': 'Top view',
    '– seret untuk menggeser probe sepanjang las (skala y dipadatkan)': '– drag to move the probe along the weld (y scale compressed)',
    'Tanda index (X-value)': 'Index mark (X-value)',
    'Exit point sebenarnya (mode guru)': 'True exit point (teacher mode)',
    'Berkas −6 dB': 'Beam −6 dB',
    'Gate A (menurut alat)': 'Gate A (per instrument)',
    'Posisi echo menurut alat': 'Echo position per instrument',
    'Kursor A-scan': 'A-scan cursor',
    'Cacat (mode guru)': 'Flaw (teacher mode)',
    // A-scan & pembacaan
    'Rekam sepanjang las (y)': 'Record along the weld (y)',
    'Rekam melintang (x)': 'Record across (x)',
    'Rekam sepanjang las (arah berkas)': 'Record along the weld (beam direction)',
    'Klik gambar untuk memindahkan probe.': 'Click the image to move the probe.',
    'Tutup': 'Close',
    'Amplitudo': 'Amplitude',
    'Terhadap DAC': 'Relative to DAC',
    'belum ada DAC': 'no DAC yet',
    'di luar DAC': 'outside DAC',
    'Sound path (SP)': 'Sound path (SP)',
    'Kedalaman': 'Depth',
    'Jarak permukaan': 'Surface distance',
    'Posisi thd sumbu las': 'Position from weld axis',
    'Posisi x pada blok': 'x position on block',
    'Tanda index pada blok': 'Index mark on block',
    'Leg': 'Leg',
    'Posisi probe (y)': 'Probe position (y)',
    'Saturasi >100% FSH – turunkan gain': 'Saturation >100% FSH – reduce gain',
    'Waktu (kursor)': 'Time (cursor)',
    'Kedalaman (kursor)': 'Depth (cursor)',
    'Penanda A': 'Marker A',
    'Penanda B': 'Marker B',
    'Tinggi |B − A|': 'Height |B − A|',
    'Lateral / back wall': 'Lateral / back wall',
    'Rating AWS (d)': 'AWS rating (d)',
    'b belum direkam': 'b not recorded',
    'C-scan': 'C-scan',
    'Rekam peta tebal (seluruh pelat)': 'Record thickness map (whole plate)',
    'Tebal = SP echo pertama yang melewati level Gate A (atur gate & gain dulu). Klik peta untuk memindahkan probe; ↑ ↓ menggeser y.': 'Thickness = SP of the first echo above the Gate A level (set gate & gain first). Click the map to move the probe; ↑ ↓ moves y.',
    'Sudut A-scan': 'A-scan angle',
    'Fokus (kedalaman)': 'Focus (depth)',
    'tanpa fokus': 'no focus',
    'Sudut': 'Angle',
    'Berkas': 'Beam',
    'TOFD D-scan': 'TOFD D-scan',
    'PCS otomatis (⅔T)': 'Auto PCS (⅔T)',
    'Hapus penanda': 'Clear markers',
    'Klik gambar: pindahkan probe ke posisi y tersebut dan pasang penanda kedalaman A/B.': 'Click the image: move the probe to that y position and place depth markers A/B.',
    'tidak tersedia untuk scan sejajar las.': 'not available for scanning parallel to the weld.',
    'hanya untuk benda uji las.': 'only for weld test pieces.',
    // evaluasi
    'Evaluasi ASME: Tidak dapat dievaluasi': 'ASME evaluation: Cannot be evaluated',
    'Evaluasi ASME: Perlu sizing': 'ASME evaluation: Sizing required',
    'Evaluasi ASME: Dapat diterima': 'ASME evaluation: Acceptable',
    'Evaluasi ASME: Ditolak': 'ASME evaluation: Rejected',
    'Evaluasi ASME: Abaikan': 'ASME evaluation: Ignore',
    'Evaluasi AWS D1.1: Tidak dapat dievaluasi': 'AWS D1.1 evaluation: Cannot be evaluated',
    'Evaluasi AWS D1.1: Perlu sizing': 'AWS D1.1 evaluation: Sizing required',
    'Evaluasi AWS D1.1: Dapat diterima': 'AWS D1.1 evaluation: Acceptable',
    'Evaluasi AWS D1.1: Ditolak': 'AWS D1.1 evaluation: Rejected',
    'Belum ada DAC – buat DAC di blok kalibrasi dasar ASME.': 'No DAC yet – build a DAC on the ASME basic calibration block.',
    'Di bawah 20% DAC: tidak perlu diselidiki.': 'Below 20% DAC: no investigation needed.',
    '≥ 20% DAC tetapi tidak melebihi reference level: selidiki jenisnya, dapat diterima.': '≥ 20% DAC but not above the reference level: investigate its type, acceptable.',
    'SP echo di luar rentang DAC. Rekam titik DAC sampai SP ini (mis. SDH lewat leg 2: 5/4T, 7/4T). DAC tidak boleh diekstrapolasi.': 'Echo SP is outside the DAC range. Record DAC points up to this SP (e.g. SDHs via leg 2: 5/4T, 7/4T). The DAC must not be extrapolated.',
    'Belum ada reference level b. Rekam echo lubang Ø1,5 mm pada blok IIW V1 (sisi B) di kartu DAC.': 'No reference level b yet. Record the Ø1.5 mm hole echo on the IIW V1 block (face B) on the DAC card.',
    // kartu benda uji
    'Benda uji': 'Test piece',
    'Material': 'Material',
    'Baja karbon': 'Carbon steel',
    'Baja tahan karat austenitik': 'Austenitic stainless steel',
    'Anisotropi logam las (pembelokan berkas)': 'Weld metal anisotropy (beam skewing)',
    'Tebal pelat T (mm)': 'Plate thickness T (mm)',
    'Geometri': 'Geometry',
    'Pelat (las lurus)': 'Plate (straight weld)',
    'Pipa': 'Pipe',
    'Sambungan pipa': 'Pipe joint',
    'Girth (melingkar)': 'Girth (circumferential)',
    'Memanjang (seam)': 'Longitudinal (seam)',
    'Jenis bevel': 'Bevel type',
    'V tunggal': 'Single V',
    'X (V ganda)': 'X (double V)',
    'U': 'U',
    'Sudut bevel (½ sudut)': 'Bevel angle (½ angle)',
    'Root gap (mm)': 'Root gap (mm)',
    'Cap (reinforcement) ada': 'Cap (reinforcement) present',
    'Root bead (penetrasi) ada': 'Root bead (penetration) present',
    'Sisi pemindaian blok': 'Block scanning face',
    'Blok lengkung (diameter = OD pipa)': 'Curved block (diameter = pipe OD)',
    'Diameter luar pipa OD': 'Pipe outside diameter OD',
    'Skenario cacat hanya berlaku pada benda uji las.': 'Flaw scenarios apply to weld test pieces only.',
    // probe
    'Probe': 'Probe',
    'Sudut nominal': 'Nominal angle',
    'Jenis probe 0°': '0° probe type',
    'Tunggal (single)': 'Single',
    'Dual (TR)': 'Dual (TR)',
    'Frekuensi': 'Frequency',
    'Ukuran kristal': 'Crystal size',
    'Mode gelombang': 'Wave mode',
    'Geser / shear (SW)': 'Shear (SW)',
    'Longitudinal (LW)': 'Longitudinal (LW)',
    'Arah scan': 'Scan direction',
    'Tegak lurus las (cacat memanjang)': 'Perpendicular to weld (longitudinal flaws)',
    'Sejajar las (cacat melintang)': 'Parallel to weld (transverse flaws)',
    'Wedge dikontur sesuai diameter': 'Wedge contoured to the diameter',
    'Arah berkas': 'Beam direction',
    '→ kanan': '→ right',
    '← kiri': '← left',
    // flaw detector & gate
    'Flaw detector': 'Flaw detector',
    'Gain': 'Gain',
    'Range (mm SP)': 'Range (mm SP)',
    'Delay tampilan (mm SP)': 'Display delay (mm SP)',
    'Tampilan sinyal': 'Signal display',
    'Full wave (rektifikasi)': 'Full wave (rectified)',
    'RF': 'RF',
    'Awal (mm SP)': 'Start (mm SP)',
    'Lebar (mm SP)': 'Width (mm SP)',
    'Level (% FSH)': 'Level (% FSH)',
    'Pembacaan muncul bila echo di dalam gate melewati level gate.': 'Readings appear when an echo inside the gate exceeds the gate level.',
    // kalibrasi
    'Kalibrasi probe & alat': 'Probe & instrument calibration',
    'X-value: depan probe → index (mm)': 'X-value: probe front → index (mm)',
    'Sudut terukur (°)': 'Measured angle (°)',
    'Zero / probe delay (µs)': 'Zero / probe delay (µs)',
    'Velocity (m/s)': 'Velocity (m/s)',
    'Probe baru (belum dikalibrasi)': 'New probe (uncalibrated)',
    'Isi nilai sebenarnya': 'Fill in true values',
    'Status per parameter tampil di mode guru.': 'Per-parameter status is shown in teacher mode.',
    'Kalibrasi probe dilakukan di blok IIW V1 atau V2, DAC di blok kalibrasi ASME.': 'Probe calibration is done on the IIW V1 or V2 block, the DAC on the ASME calibration block.',
    'Pembacaan pada blok': 'Readings on the block',
    'Skala sudut pada tanda index:': 'Angle scale at the index mark:',
    // DAC
    'DAC (ASME) · referensi AWS': 'DAC (ASME) · AWS reference',
    'Belum ada titik. Buka': 'No points yet. Open the',
    ', maksimalkan echo SDH, lalu rekam.': ', maximise the SDH echo, then record.',
    'Rekam titik (puncak gate)': 'Record point (gate peak)',
    'Hapus terakhir': 'Delete last',
    'Hapus semua': 'Delete all',
    'Gain = reference': 'Gain = reference',
    'Gain scanning (+6 dB)': 'Scanning gain (+6 dB)',
    'Tampilkan kurva DAC di A-scan': 'Show DAC curve on the A-scan',
    'TCG (Time Corrected Gain)': 'TCG (Time Corrected Gain)',
    'TCG menambah gain menurut jarak sesuai DAC: SDH referensi di kedalaman mana pun tampil 80% pada reference level, sehingga kurva DAC menjadi garis datar.': 'TCG adds gain with distance according to the DAC: the reference SDH at any depth is displayed at 80% at the reference level, so the DAC curve becomes a flat line.',
    'AWS D1.1 – reference level b': 'AWS D1.1 – reference level b',
    'Di': 'On the',
    'Blok IIW V1 sisi B': 'IIW V1 block face B',
    ', maksimalkan echo lubang Ø1,5 mm, pastikan di dalam Gate A, lalu rekam. b = gain yang membuat echo itu tepat di garis referensi 50% FSH.': ', maximise the Ø1.5 mm hole echo, make sure it is inside Gate A, then record. b = the gain that puts that echo exactly on the 50% FSH reference line.',
    'Rekam b (puncak gate)': 'Record b (gate peak)',
    'b =': 'b =',
    '– (belum direkam)': '– (not recorded)',
    'Tidak ada echo yang melewati level gate. Untuk echo lemah (mis. lewat leg 2) turunkan level gate.': 'No echo exceeds the gate level. For weak echoes (e.g. via leg 2) lower the gate level.',
    'Echo jenuh (≥ 100%). Turunkan gain lalu rekam lagi.': 'Echo saturated (≥ 100%). Reduce the gain and record again.',
    'Reference AWS direkam pada blok IIW V1 (lubang Ø1,5 mm, sisi B).': 'The AWS reference is recorded on the IIW V1 block (Ø1.5 mm hole, face B).',
    'Tidak ada echo di dalam Gate A.': 'No echo inside Gate A.',
    // sizing
    'Sizing & evaluasi': 'Sizing & evaluation',
    'Panjang – 6 dB drop': 'Length – 6 dB drop',
    'Maksimalkan echo, tekan “puncak gate = 80%”, geser probe sepanjang las sampai echo turun ke 40%, lalu tandai. Ulangi ke arah sebaliknya.': 'Maximise the echo, press “gate peak = 80%”, move the probe along the weld until the echo drops to 40%, then mark. Repeat in the other direction.',
    'Tandai ujung 1': 'Mark end 1',
    'Tandai ujung 2': 'Mark end 2',
    'Panjang:': 'Length:',
    'Tinggi – 6 dB drop': 'Height – 6 dB drop',
    'Geser probe maju/mundur dari posisi maksimum sampai echo turun 6 dB, tandai kedalaman tepi atas dan bawah.': 'Move the probe forward/back from the maximum position until the echo drops 6 dB, mark the depth of the upper and lower edges.',
    'Tandai tepi atas': 'Mark upper edge',
    'Tandai tepi bawah': 'Mark lower edge',
    'Tinggi:': 'Height:',
    'Acuan evaluasi': 'Evaluation code',
    'ASME Sec. VIII Div. 1 App. 12': 'ASME Sec. VIII Div. 1 App. 12',
    'AWS D1.1 (struktur, beban statis)': 'AWS D1.1 (structural, static loading)',
    'Interpretasi indikasi': 'Indication interpretation',
    'Reset sizing': 'Reset sizing',
    'Atur gain: puncak gate = 80%': 'Set gain: gate peak = 80%',
    // laporan
    'Laporan indikasi': 'Indication report',
    'Nama pemeriksa': 'Examiner name',
    'nama siswa': 'student name',
    '+ Tambah dari pembacaan saat ini': '+ Add from current reading',
    '+ Baris kosong': '+ Empty row',
    'Cetak / simpan PDF': 'Print / save PDF',
    'Unduh laporan (.html)': 'Download report (.html)',
    '“Tambah dari pembacaan” mengambil ujung-ujung hasil sizing (atau posisi probe), kedalaman, posisi, dan %DAC dari puncak gate, serta interpretasi yang dipilih. Semua kolom bisa diedit.': '“Add from reading” takes the sizing end points (or probe position), depth, position and %DAC from the gate peak, plus the selected interpretation. All columns can be edited.',
    'y awal': 'y start',
    'y akhir': 'y end',
    'Panjang': 'Length',
    'Posisi x': 'x position',
    'Interpretasi': 'Interpretation',
    'Keputusan': 'Decision',
    'Catatan': 'Notes',
    'Belum ada indikasi.': 'No indications yet.',
    'terima': 'accept',
    'tolak': 'reject',
    'Diterima': 'Accepted',
    'Ditolak': 'Rejected',
    'hapus': 'delete',
    // rencana scan
    'Rencana scan & cakupan': 'Scan plan & coverage',
    'Tampilkan cakupan di penampang': 'Show coverage on the cross-section',
    'Sudut:': 'Angles:',
    'Sisi probe': 'Probe side',
    'Kiri saja': 'Left only',
    'Kanan saja': 'Right only',
    'Kedua sisi': 'Both sides',
    'Leg 1 saja': 'Leg 1 only',
    'Leg 1–2': 'Leg 1–2',
    'Jarak exit point min (mm)': 'Min exit point distance (mm)',
    'Jarak maks (mm)': 'Max distance (mm)',
    'Zona HAZ (mm)': 'HAZ zone (mm)',
    'Zona pemeriksaan = logam las + HAZ (sesuaikan dengan prosedur). Warna:': 'Examination zone = weld metal + HAZ (adjust to the procedure). Colours:',
    'tercakup 1 setup,': 'covered by 1 set-up,',
    '≥ 2 setup,': '≥ 2 set-ups,',
    'tidak tercakup. Cakupan geometris belum menjamin deteksi: cacat planar perlu berkas yang mengenainya cukup tegak lurus, jadi scan dari dua sisi tetap dianjurkan.': 'not covered. Geometric coverage does not guarantee detection: planar flaws need a beam hitting them nearly perpendicularly, so scanning from both sides is still recommended.',
    'Pilih minimal satu sudut.': 'Choose at least one angle.',
    // cacat & tampilan
    'Cacat & tampilan': 'Flaws & display',
    'Skenario cacat': 'Flaw scenario',
    'Kode soal': 'Task code',
    'Jumlah cacat': 'Number of flaws',
    'Acak ulang': 'Re-randomise',
    'Tampilkan cacat & exit point sebenarnya (mode guru)': 'Show flaws & true exit point (teacher mode)',
    'Tampilkan berkas & sinar': 'Show beam & ray',
    'Noise butir material': 'Material grain noise',
    // catatan ASME
    'Catatan ASME': 'ASME notes',
    'Frekuensi nominal probe untuk pemeriksaan las umumnya 1–5 MHz (ASME Sec. V Art. 4).': 'Nominal probe frequency for weld examination is generally 1–5 MHz (ASME Sec. V Art. 4).',
    'Berkas sudut diarahkan kira-kira tegak lurus sumbu las, dari dua arah bila memungkinkan.': 'The angle beam is directed approximately perpendicular to the weld axis, from two directions where possible.',
    'Blok kalibrasi dasar: SDH pada ¼T, ½T, ¾T. Diameter SDH mengikuti tebal (≤ 25 mm: 2,5 mm; 25–50 mm: 3 mm). Di simulator, tebal blok = tebal las.': 'Basic calibration block: SDHs at ¼T, ½T, ¾T. SDH diameter depends on thickness (≤ 25 mm: 2.5 mm; 25–50 mm: 3 mm). In the simulator, block thickness = weld thickness.',
    'Primary reference level: gain yang membuat titik DAC tertinggi berada di 80% FSH. Pemindaian dilakukan minimal 2× (+6 dB) di atas reference level.': 'Primary reference level: the gain that puts the highest DAC point at 80% FSH. Scanning is done at least 2× (+6 dB) above the reference level.',
    'App. 12: indikasi > 20% reference level diselidiki. Retak, lack of fusion, dan incomplete penetration tidak diterima berapa pun panjangnya. Indikasi lain ditolak bila melebihi reference level': 'App. 12: indications > 20% of the reference level are investigated. Cracks, lack of fusion and incomplete penetration are unacceptable regardless of length. Other indications are rejected if they exceed the reference level',
    'dan': 'and',
    'panjangnya > 6 mm (t ≤ 19 mm), > t/3 (19–57 mm), atau > 19 mm (t > 57 mm).': 'their length is > 6 mm (t ≤ 19 mm), > t/3 (19–57 mm), or > 19 mm (t > 57 mm).',
    'Permukaan lengkung: untuk diameter ≤ 20 in (≈ 508 mm) dipakai blok kalibrasi lengkung; satu blok berdiameter D berlaku untuk permukaan 0,9–1,5 × D.': 'Curved surfaces: for diameters ≤ 20 in (≈ 508 mm) a curved calibration block is used; a block of diameter D is valid for surfaces of 0.9–1.5 × D.',
    'Las austenitik: butir kolumnar kasar di logam las menyebabkan noise dan atenuasi tinggi, terutama untuk gelombang geser; probe gelombang longitudinal (LW) umumnya lebih sesuai.': 'Austenitic welds: coarse columnar grains in the weld metal cause high noise and attenuation, especially for shear waves; longitudinal-wave (LW) probes are generally more suitable.',
    'Koreksi transfer (perbedaan kekasaran permukaan/atenuasi blok vs benda uji) belum dimodelkan, kecuali rugi kopling pada permukaan lengkung.': 'Transfer correction (surface roughness/attenuation difference between block and test piece) is not modelled, except coupling loss on curved surfaces.',
    'Model fisika disederhanakan untuk keperluan edukasi dan tidak menggantikan latihan dengan alat serta spesimen nyata. Dimensi blok IIW disederhanakan.': 'The physics model is simplified for education and does not replace practice with real equipment and specimens. IIW block dimensions are simplified.',
    // tutorial
    'Pilih pelajaran lalu tekan': 'Choose a lesson and press',
    'Mulai': 'Start',
    '. Setiap langkah dicek otomatis; tombol': '. Each step is checked automatically; the',
    'Lanjut': 'Next',
    'aktif setelah langkah berhasil.': 'button becomes active once the step succeeds.',
    'Ulangi': 'Restart',
    'Kembali': 'Back',
    'Petunjuk': 'Hint',
    'Periksa': 'Check',
    'Jawab pertanyaan di atas': 'Answer the question above',
    '✓ Berhasil – klik Lanjut': '✓ Done – click Next',
    '⏳ Menunggu…': '⏳ Waiting…',
    '✓ Benar': '✓ Correct',
    '✗ Belum tepat, periksa pembacaan alat': '✗ Not quite, check the instrument reading',
    // ujian
    'Cacat acak dirahasiakan; mode guru terkunci sampai jawaban dikirim.': 'Random flaws are hidden; teacher mode is locked until the answers are submitted.',
    'Kode baru': 'New code',
    'Kode yang sama menghasilkan soal yang sama. Instruktur bisa membagikan satu kode ke semua siswa.': 'The same code gives the same task. An instructor can share one code with all students.',
    'Nama': 'Name',
    'Mulai ujian': 'Start exam',
    'Mode ujian: cacat dirahasiakan sampai jawaban dikirim.': 'Exam mode: flaws are hidden until the answers are submitted.',
    'Ujian berjalan': 'Exam in progress',
    'kode': 'code',
    '· tingkat': '· level',
    'jumlah cacat dirahasiakan': 'number of flaws hidden',
    'Kirim jawaban': 'Submit answers',
    'Batalkan': 'Cancel',
    'Scan seluruh panjang las (geser probe sepanjang las dengan ↑ ↓ atau tampak atas) dari kedua sisi.': 'Scan the full weld length (move the probe along the weld with ↑ ↓ or the top view) from both sides.',
    'Untuk setiap indikasi ≥ 20% DAC: ukur panjang (6 dB drop), tentukan interpretasi, lalu “+ Tambah dari pembacaan” di Laporan indikasi. Periksa keputusan terima/tolak.': 'For every indication ≥ 20% DAC: size the length (6 dB drop), choose the interpretation, then “+ Add from reading” in the Indication report. Check the accept/reject decision.',
    'Echo geometri (akar las, kaki cap) bukan cacat, jangan dilaporkan.': 'Geometric echoes (weld root, cap toe) are not flaws; do not report them.',
    'Hasil ujian': 'Exam result',
    'Cetak laporan': 'Print report',
    'Unduh hasil (.json)': 'Download result (.json)',
    'Ujian baru': 'New exam',
    'Serahkan file hasil (.json) atau laporan (.html) ke instruktur. Instruktur mengimpornya di tab': 'Hand the result file (.json) or report (.html) to the instructor, who imports it in the',
    'Cacat sebenarnya': 'Actual flaw',
    'Lokasi': 'Location',
    'Laporan': 'Report',
    'Total': 'Total',
    'terlewat': 'missed',
    'tidak dilaporkan (terlewat)': 'not reported (missed)',
    'Cacat kini ditampilkan (mode guru). Geser probe untuk mempelajari echo yang terlewat.': 'Flaws are now shown (teacher mode). Move the probe to study the missed echoes.',
    'Laporan indikasi masih kosong. Tetap kirim?': 'The indication report is empty. Submit anyway?',
    'Batalkan ujian?': 'Cancel the exam?',
    // rekap
    'Impor file hasil…': 'Import result files…',
    'semua': 'all',
    'Unduh CSV': 'Download CSV',
    'Seret file ke panel ini atau pakai tombol impor. Nilai': 'Drop files on this panel or use the import button. Scores are',
    'dihitung ulang': 'recalculated',
    'dari kode soal dan laporan indikasi; kolom “Nilai di file” menandai bila angka di file berbeda. Data tersimpan hanya di browser ini.': 'from the task code and the indication report; the “Score in file” column flags when the number in the file differs. Data is stored only in this browser.',
    'Siswa': 'Students',
    'Rata-rata': 'Mean',
    'Median': 'Median',
    'Min – maks': 'Min – max',
    'Cacat ditemukan': 'Flaws found',
    'Indikasi palsu': 'False calls',
    'Kode': 'Code',
    'Tingkat': 'Level',
    'Nilai': 'Score',
    'Nilai di file': 'Score in file',
    'Ditemukan': 'Found',
    'Palsu': 'False',
    'Waktu': 'Time',
    'Tanggal': 'Date',
    'Belum ada hasil. Impor file hasil ujian (.json) atau laporan (.html) dari siswa.': 'No results yet. Import exam result files (.json) or reports (.html) from students.',
    'Deteksi per jenis cacat': 'Detection per flaw type',
    'Jenis': 'Type',
    'Jenis dengan persentase rendah perlu dibahas ulang di kelas.': 'Types with low percentages should be revisited in class.',
    'cocok': 'match',
    'berbeda': 'differs',
    'tanpa nilai': 'no score',
    // jenis indikasi
    'Retak (crack)': 'Crack',
    'Retak': 'Crack',
    'Lack of fusion': 'Lack of fusion',
    'Incomplete penetration': 'Incomplete penetration',
    'Slag inclusion': 'Slag inclusion',
    'Porositas': 'Porosity',
    'Undercut': 'Undercut',
    'Lainnya': 'Other',
    'Lainnya / belum diketahui': 'Other / unknown',
    // kanvas
    'sumbu las': 'weld axis',
    'pusat R100': 'R100 centre',
    'T (dasar)': 'T (bottom)',
    '2T (atas)': '2T (top)',
    'kedalaman tanpa dilipat (mm)': 'unfolded depth (mm)',
    'waktu (µs)': 'time (µs)',
    'posisi sepanjang las y (mm)': 'position along weld y (mm)',
    'posisi exit point x (mm)': 'exit point position x (mm)',
    'kedalaman (mm)': 'depth (mm)',
    'Berkas tidak mengenai dinding dalam pipa (sudut terlalu besar untuk t/D ini)': 'The beam does not reach the inner pipe wall (angle too large for this t/D)',
    // panel Tentang (cakupan & model)
    'UT konvensional probe sudut, probe lurus 0° tunggal & dual (A-scan, B-scan, C-scan peta tebal), Phased Array S-scan & E-scan dengan fokus, TOFD.': 'Conventional UT with angle probes, single & dual 0° straight-beam probes (A-scan, B-scan, C-scan thickness map), Phased Array S-scan & E-scan with focusing, TOFD.',
    'Las pelat (bevel V, X, U), pipa (las girth & memanjang), sambungan tubular T/Y/K/X, pelat korosi; baja karbon dan austenitik (dengan pembelokan berkas); gelombang geser & longitudinal.': 'Plate welds (V, X, U bevels), pipes (girth & longitudinal welds), T/Y/K/X tubular joints, corroded plate; carbon and austenitic steel (with beam skewing); shear & longitudinal waves.',
    'Sambungan tubular: geometri 3D dan sudut dihedral lokal Ψ dihitung tepat, tetapi simulasi UT memakai penampang lokal 2D (chord dianggap lurus secara lokal, tanpa skew berkas 3D). Evaluasi memakai %DAC (ASME) atau rating AWS; kriteria tubular Class R/X belum dimasukkan.': 'Tubular joints: the 3D geometry and local dihedral angle Ψ are computed exactly, but the UT simulation uses a 2D local section (chord treated as locally straight, no 3D beam skew). Evaluation uses %DAC (ASME) or the AWS rating; the tubular Class R/X criteria are not included.',
    'Kalibrasi dengan blok IIW V1 (dua sisi), V2 (sisi atas & miring), dan blok kalibrasi dasar ASME (DAC/TCG).': 'Calibration with the IIW V1 block (two faces), V2 (top & slanted faces) and the ASME basic calibration block (DAC/TCG).',
    'Scan tegak lurus dan sejajar las; 14 jenis skenario cacat (termasuk laminasi logam induk) + cacat acak; rencana scan & peta cakupan.': 'Scanning perpendicular and parallel to the weld; 14 flaw scenarios (including base-metal lamination) + random flaws; scan plan & coverage map.',
    'Evaluasi menurut ASME Sec. VIII Div. 1 App. 12 atau AWS D1.1, tutorial 17 pelajaran, ujian (termasuk ujian praktik lengkap) & rekap kelas. Bisa dipakai tanpa internet setelah sekali dibuka lewat http(s). Tampilan bahasa Indonesia atau Inggris.': 'Evaluation to ASME Sec. VIII Div. 1 App. 12 or AWS D1.1, 17 tutorial lessons, exams (including a full practical exam) & class summary. Works offline after being opened once over http(s). Indonesian or English interface.',
    'Penampang 2D: lintasan sinar dengan pantulan di permukaan datar atau lengkung; amplitudo dari penjumlahan koheren titik-titik permukaan cacat (Huygens/Kirchhoff), profil berkas Gaussian, atenuasi, dan penyebaran berkas.': '2D cross-section: ray paths with reflections at flat or curved surfaces; amplitude from the coherent sum of flaw surface points (Huygens/Kirchhoff), Gaussian beam profile, attenuation and beam spreading.',
    'Dimensi blok V1/V2 diturunkan dari skala sudut pada blok fisik; blok kalibrasi ASME disederhanakan (tebal blok = tebal las).': 'V1/V2 block dimensions are derived from the angle scales on the physical blocks; the ASME calibration block is simplified (block thickness = weld thickness).',
    // bantuan blok & info
    'Echo R100 seharusnya di 100 mm dan 200 mm. Cek sudut 35°–76° dengan lubang Ø50.': 'The R100 echo should be at 100 mm and 200 mm. Check angles 35°–76° with the Ø50 hole.',
    'Menghadap R25 (berkas ←): echo 25, 100, 175 mm. Menghadap R50 (berkas →): echo 50, 125, 200 mm. Sudut > 65° dicek dari sisi miring. Probe miniatur: wedge boleh menggantung di tepi blok.': 'Facing R25 (beam ←): echoes at 25, 100, 175 mm. Facing R50 (beam →): echoes at 50, 125, 200 mm. Angles > 65° are checked from the slanted face. Miniature probe: the wedge may overhang the block edge.',
    'Sisi B: cek sudut 70°–80° dengan lubang Ø1,5 (15 mm dari permukaan). Untuk R100 dan Ø50 pakai sisi A.': 'Face B: check angles 70°–80° with the Ø1.5 hole (15 mm below the surface). For R100 and Ø50 use face A.',
    'Rekam DAC: maksimalkan tiap echo SDH. Gunakan “puncak gate = 80%” hanya untuk titik pertama, lalu jangan ubah gain saat merekam titik berikutnya.': 'Recording the DAC: maximise each SDH echo. Use “gate peak = 80%” only for the first point, then do not change the gain while recording the next points.',
    'Sisi atas – R25/R50, Ø5 skala 35°–65°': 'Top face – R25/R50, Ø5 scale 35°–65°',
    'Sisi miring – Ø5 skala 65°–75°': 'Slanted face – Ø5 scale 65°–75°',
    'Sisi A – R100, Ø50, skala 35°–76°': 'Face A – R100, Ø50, scale 35°–76°',
    'Sisi B – Ø1,5, skala 70°–80°': 'Face B – Ø1.5, scale 70°–80°',
    'Blok V2 sisi atas · R25 & R50 sepusat, lubang Ø5': 'V2 block top face · concentric R25 & R50, Ø5 hole',
    'Blok V2 sisi miring · R25 & R50 sepusat, lubang Ø5': 'V2 block slanted face · concentric R25 & R50, Ø5 hole',
    'Scan sejajar las': 'Scanning parallel to the weld',
    'Cap masih ada: probe tidak bisa diletakkan di atas las.': 'The cap is still present: the probe cannot be placed on the weld.',
    'Dari samping las, berkas sejajar tidak mengenai cacat di tengah las. Hilangkan centang “Cap” (cap digerinda rata) untuk scan di atas las.': 'From beside the weld a parallel beam does not hit flaws in the weld centre. Untick “Cap” (cap ground flush) to scan on top of the weld.',
    'Berkas searah sumbu las untuk mencari cacat melintang. ← → menggeser probe sepanjang las, ↑ ↓ menggeser probe melintang las.': 'Beam along the weld axis to find transverse flaws. ← → moves the probe along the weld, ↑ ↓ moves it across the weld.',
    'Tampilan scanning (penampang memanjang – scan sejajar las)': 'Scanning view (longitudinal section – scanning parallel to the weld)',
    'scan sejajar las': 'parallel scan',
    '⚠ Nilai kalibrasi alat diubah': '⚠ Instrument calibration values changed',
    '⚠ Probe latihan belum terkalibrasi': '⚠ Training probe not calibrated',
    'DAC dibuat pada blok datar. Untuk diameter ≤ 20 in (≈ 508 mm) ASME mensyaratkan blok kalibrasi lengkung.': 'The DAC was made on a flat block. For diameters ≤ 20 in (≈ 508 mm) ASME requires a curved calibration block.',
    'Kondisi wedge (datar/dikontur) berbeda dengan saat DAC dibuat.': 'Wedge condition (flat/contoured) differs from when the DAC was made.',
    'DAC dibuat dengan material/mode gelombang lain.': 'The DAC was made with another material/wave mode.',
    // ujian
    'Kalibrasi probe di': 'Calibrate the probe on the',
    'Blok IIW': 'IIW block',
    '(X-value, zero, sudut).': '(X-value, zero, angle).',
    'DAC sudah disediakan; gain diatur ke gain scanning (reference + 6 dB).': 'The DAC is provided; the gain is set to the scanning gain (reference + 6 dB).',
    'Buat DAC di': 'Build a DAC on the',
    'Blok kalibrasi ASME': 'ASME calibration block',
    ', lalu atur gain scanning (+6 dB).': ', then set the scanning gain (+6 dB).',
    'Proses ikut dinilai (30%)': 'The process is graded too (30%)',
    ': nilai kalibrasi di alat (X-value, sudut, zero, velocity), kurva DAC, dan gain scanning saat jawaban dikirim. Biarkan gain pada gain scanning ketika mengirim.': ': the instrument calibration values (X-value, angle, zero, velocity), the DAC curve and the scanning gain at submission. Leave the gain at the scanning gain when submitting.',
    'Ujian sedang berjalan. Batalkan ujian?': 'An exam is in progress. Cancel the exam?',
    'tidak ada echo di gate saat dicatat': 'no echo in the gate when recorded',
    'Tidak ada indikasi yang dilaporkan.': 'No indications reported.',
    'Belum ada DAC.': 'No DAC yet.',
    'data proses tidak ada': 'no process data',
    // laporan cetak
    'Laporan Inspeksi Ultrasonik (UT) – Las': 'Ultrasonic Testing (UT) Inspection Report – Weld',
    'Acuan': 'Code',
    'Amplitudo pada reference level': 'Amplitude at reference level',
    'Dibuat dengan simulator edukasi. Model fisika disederhanakan; laporan ini bukan dokumen inspeksi resmi.': 'Produced with an educational simulator. The physics model is simplified; this report is not an official inspection document.',
    'Hasil penilaian': 'Grading result',
    'Indikasi': 'Indications',
    'Kalibrasi alat': 'Instrument calibration',
    'Kedalaman (mm)': 'Depth (mm)',
    'Panjang (mm)': 'Length (mm)',
    'Pemeriksa': 'Examiner',
    'Penilai / instruktur': 'Grader / instructor',
    'Posisi thd sumbu las (mm)': 'Position from weld axis (mm)',
    'Reference level': 'Reference level',
    'Titik DAC (blok kalibrasi dasar ASME)': 'DAC points (ASME basic calibration block)',
    'y (mm)': 'y (mm)',
    'y akhir (mm)': 'y end (mm)',
    'y awal (mm)': 'y start (mm)',
    'Deteksi /40': 'Detection /40',
    'Lokasi /15': 'Location /15',
    'Panjang /15': 'Length /15',
    'Jenis /15': 'Type /15',
    'Keputusan /15': 'Decision /15',
    'Nilai:': 'Score:',
    'Tanpa cacat (hanya geometri las)': 'No flaw (weld geometry only)',
    // sambungan tubular
    'Sambungan tubular': 'Tubular joint',
    'Jenis sambungan': 'Joint type',
    'Chord OD (mm)': 'Chord OD (mm)',
    'Tebal chord (mm)': 'Chord wall (mm)',
    'Brace OD (mm)': 'Brace OD (mm)',
    'Tebal brace (mm)': 'Brace wall (mm)',
    'Sudut brace θ (°)': 'Brace angle θ (°)',
    'Gap K (mm)': 'K gap (mm)',
    'Posisi keliling φ:': 'Circumferential position φ:',
    'Brace dan chord berporos saling memotong; φ = 0° di heel (sisi tumpul), 180° di toe (sisi lancip). Simulasi memakai penampang lokal di posisi φ dengan chord dianggap lurus secara lokal; pembelokan berkas keluar bidang (3D) tidak dimodelkan. Pada K, brace kedua hanya muncul di penampang dekat heel (daerah gap); pada X, brace di sisi bawah chord diperiksa terpisah dengan cara yang sama.': 'Brace and chord axes intersect; φ = 0° at the heel (obtuse side), 180° at the toe (acute side). The simulation uses the local section at position φ with the chord treated as locally straight; out-of-plane (3D) beam skew is not modelled. For K joints the second brace only appears in sections near the heel (gap region); for X joints the brace on the underside of the chord is examined separately in the same way.',
    'T (brace tegak lurus)': 'T (perpendicular brace)',
    'Y (brace miring)': 'Y (inclined brace)',
    'K (dua brace, ada gap)': 'K (two braces with a gap)',
    'X (brace di kedua sisi chord)': 'X (braces on both sides of the chord)',
    'Tanpa cacat (hanya geometri)': 'No flaw (geometry only)',
    'Las tubular sehat. Echo yang muncul berasal dari akar las, kaki las, dan bagian chord.': 'Sound tubular weld. The echoes come from the weld root, weld toe and the chord.',
    'LOF sisi brace (daerah heel)': 'LOF on brace side (heel zone)',
    'Tidak menyatu pada muka bevel brace di daerah heel. Paling jelas bila berkas tegak lurus muka bevel (lihat sudut yang disarankan).': 'Lack of fusion on the brace bevel face in the heel zone. Clearest when the beam is perpendicular to the bevel face (see the suggested angle).',
    'LOF sisi chord (daerah sisi)': 'LOF on chord side (side zone)',
    'Tidak menyatu pada permukaan chord di daerah sisi/saddle. Bidangnya mengikuti permukaan chord sehingga orientasinya berubah menurut Ψ.': 'Lack of fusion on the chord surface in the side/saddle zone. Its plane follows the chord surface, so its orientation changes with Ψ.',
    'Akar tidak tertembus (daerah toe)': 'Incomplete root penetration (toe zone)',
    'Akar las tidak tertembus di daerah toe yang sempit (Ψ lancip): daerah tersulit untuk dilas dan diperiksa.': 'Incomplete root penetration in the narrow toe zone (acute Ψ): the hardest area to weld and to examine.',
    'Retak kaki las sisi brace (hot spot)': 'Brace-side weld toe crack (hot spot)',
    'Retak lelah yang berawal di kaki las pada permukaan brace dan menjalar ke dinding brace; bersama permukaan luar brace membentuk corner trap (terlihat lewat leg 2). Retak di kaki las sisi chord sulit dijangkau berkas dari brace dan biasanya diperiksa dengan MT.': 'A fatigue crack starting at the weld toe on the brace surface and growing into the brace wall; with the outer brace surface it forms a corner trap (seen via leg 2). Chord-side toe cracks are hard to reach with a beam from the brace and are usually examined with MT.',
    'Porositas di logam las': 'Porosity in the weld metal',
    'Kumpulan pori di logam las; echo lemah dan berpuncak banyak.': 'A cluster of pores in the weld metal; weak echoes with many peaks.',
    'Campuran (LOF brace + retak kaki + porositas)': 'Mixed (brace LOF + toe crack + porosity)',
    'Beberapa cacat di posisi keliling yang berbeda. Scan seluruh keliling brace dan catat posisi φ setiap indikasi.': 'Several flaws at different circumferential positions. Scan the whole brace circumference and record the φ position of each indication.',
    'Tampilan scanning (penampang lokal sambungan tubular)': 'Scanning view (local section of tubular joint)',
    'Tampilan 3D sambungan': '3D view of the joint',
    '– klik atau seret di garis las untuk memilih posisi keliling φ': '– click or drag on the weld line to choose the circumferential position φ',
    'Rekam keliling brace (φ)': 'Record around the brace (φ)',
    'brace': 'brace',
    'chord': 'chord',
  };
  const matEN = (s) => s.replace('Baja karbon', 'Carbon steel').replace('Baja tahan karat austenitik', 'Austenitic stainless steel');

  // Teks per id (tanpa mengulang kalimat Indonesia di sini): diisi dari data aplikasi saat dimuat
  const SCEN_EN = {
    none: ['No flaw (weld geometry only)', 'Sound weld. The echoes come from geometry: the root and the cap toe. Learn their positions so they are not mistaken for flaws.'],
    'lof-kiri': ['Lack of sidewall fusion – left side', 'Lack of fusion on the left bevel face. Clearest when the beam is perpendicular to the bevel: from a probe on the left via leg 2, or from a probe on the right via leg 1 (if reachable).'],
    'lof-kanan': ['Lack of sidewall fusion – right side', 'Lack of fusion on the right bevel face. Try scanning from both sides of the weld and compare the amplitudes.'],
    ip: ['Incomplete penetration (IP / LOP)', 'The weld root is not penetrated. Both root faces form a corner reflector (corner trap) at the bottom of the plate → strong echo, especially with a 45° probe. Outside the IP region the normal root echo remains.'],
    porositas: ['Porosity (cluster)', 'A cluster of small gas pores. Weak, broad echoes with many peaks; the amplitude changes quickly as the probe moves.'],
    slag: ['Slag inclusion', 'Slag trapped in the weld. Medium, jagged echo whose shape changes as the probe is moved or rotated.'],
    crack: ['Longitudinal crack in the weld centre', 'Almost vertical crack. Its faces are parallel to the beam so the specular reflection is weak; mainly diffraction echoes from the crack tips are seen.'],
    'root-crack': ['Root crack', 'A crack starting at the weld root. Together with the plate bottom it forms a corner trap → strong echo at depth ≈ T, easily confused with the root geometry echo.'],
    melintang: ['Transverse crack (perpendicular to the weld axis)', 'Transverse weld crack. Almost invisible from scans perpendicular to the weld because the crack plane is parallel to the beam. Use “Scan direction: parallel to weld” (the cap must be ground flush) to detect it.'],
    undercut: ['Undercut at the weld toe (left)', 'A shallow groove at the weld toe on the surface. The echo appears via leg 2 at depth ≈ 0 at the toe position, easily confused with the cap toe geometry echo.'],
    'toe-crack': ['Toe crack (left)', 'A crack starting at the weld toe and growing into the HAZ. Together with the top surface it forms a corner trap → strong echo via leg 2 at depth ≈ 0.'],
    laminasi: ['Lamination in the base metal (left)', 'A layered separation in the plate, parallel to the surface. Check the base metal with a 0° straight beam: the lamination echo appears before the back wall and the back wall disappears. Laminations also block angle-probe beams.'],
    'laminasi-lof': ['Lamination + LOF (beam shadowing)', 'Left LOF with a lamination in the base metal between the probe and the weld. From the left the angle beam is blocked by the lamination so the LOF looks weak or disappears; inspect from the right or check the base metal first with a 0° probe.'],
    campuran: ['Mixed (right LOF + porosity + slag)', 'Several flaws at once. Practise telling flaw types apart by position, echo shape and behaviour as the probe moves from both sides.'],
    acak: ['Random (practice, repeatable with a code)', 'Random flaws along the weld. Their type, position and size are determined by the task code, so they can be repeated or shared.'],
  };
  const LEVEL_EN = {
    mudah: ['Easy', '1 flaw · ideal (calibrated) probe · DAC provided.'],
    sedang: ['Medium', '2 flaws · ideal probe · build your own DAC on the ASME calibration block.'],
    sulit: ['Hard', '3 flaws · probe must be calibrated on the IIW block · build your own DAC.'],
    praktik: ['Full practical', '2 flaws · full workflow like a practical exam: probe calibration, DAC, scanning gain, scanning, report. The process is graded too (30%).'],
  };

  // ------------------------------------------------------------------ pola untuk teks berisi angka
  const P = [
    [/^Langkah (\d+) \/ (\d+) · (.+)$/, (m, a, b, c) => `Step ${a} / ${b} · ${tr(c)}`],
    [/^jam (\d+)(:\d+)?$/, (m, h, mm) => `${h}${mm || ''} o’clock`],
    [/^(.*) \(jam (\d+:\d+)\)$/, (m, a, h) => `${a} (${h} o’clock)`],
    [/^merekam… (\d+)%$/, (m, p) => `recording… ${p}%`],
    [/^menghitung… (\d+)%$/, (m, p) => `computing… ${p}%`],
    [/^posisi: (.+)$/, (m, a) => `position: ${a}`],
    [/^(\d+(?:\.\d+)?) mm \(kiri\)$/, (m, a) => `${a} mm (left)`],
    [/^(.+) \(kiri\)$/, (m, a) => `${a} (left)`],
    [/^(.+) \(kanan\)$/, (m, a) => `${a} (right)`],
    [/^Penampang di y = (.+) mm · tebal nominal (.+) mm(.*)$/, (m, a, b, c) => `Section at y = ${a} mm · nominal thickness ${b} mm${c ? ' · bottom profile hidden (teacher mode off)' : ''}`],
    [/^(\d+(?:\.\d+)?)° \(sudut bevel total (.+)°\)$/, (m, a, b) => `${a}° (total bevel angle ${b}°)`],
    [/^Titik (\d+): (.+)$/, (m, a, b) => `Point ${a}: ${tr(b)}`],
    [/^Ukur panjang \((.+)\)$/, (m, a) => `Measure length (${a})`],
    [/^Atur puncak ke (\d+)%$/, (m, a) => `Set the peak to ${a}%`],
    [/^Echo R(\d+) maksimum$/, (m, a) => `Maximum R${a} echo`],
    [/^Arahkan ke lubang Ø(\d+)$/, (m, a) => `Aim at the Ø${a} hole`],
    [/^Menghadap R(\d+)$/, (m, a) => `Facing R${a}`],
    [/^Cek sudut dengan Ø(\d+)$/, (m, a) => `Angle check with Ø${a}`],
    [/^Pipa OD (.+) mm$/, (m, a) => `Pipe OD ${a} mm`],
    [/^SP (.+) mm → (.+)% pada gain reference$/, (m, a, b) => `SP ${a} mm → ${b}% at reference gain`],
    [/^Jenis probe 0°$/, () => '0° probe type'],
    [/^Simulator UT Las (v[\d.]+) · (.+)$/, (m, v, r) => `Weld UT Simulator ${v} · ${tr(r)}`],
    [/^\(arahkan berkas (.) ke (.+)\)$/, (m, a, b) => `(point the beam ${a} at ${b})`],
    [/^Blok IIW V1 \(ISO 2400\): 300 × 100 mm, R100, Ø50 \(pusat 35 mm dari ujung, 27 mm dari sisi A\), Ø1,5 \(15 mm dari sisi B\)\. Dimensi lubang diturunkan dari skala sudut pada blok\. (.+)$/,
      (m, mat) => `IIW V1 block (ISO 2400): 300 × 100 mm, R100, Ø50 (centre 35 mm from the end, 27 mm from face A), Ø1.5 (15 mm from face B). Hole positions are derived from the angle scales on the block. ${matEN(mat)}`],
    [/^Blok V2 \(ISO 7963\): R25 dan R50 sepusat di sisi atas, panjang 75 mm, lubang Ø5 sedalam 20 mm di bawah titik pusat, sisi miring (\S+)° menyinggung R25 \(lubang (\S+) mm dari sisi miring\)\. (.+)$/,
      (m, a, d, mat) => `V2 block (ISO 7963): concentric R25 and R50 on the top face, length 75 mm, Ø5 hole 20 mm below the centre point, slanted face at ${a}° tangent to R25 (hole ${d} mm from the slanted face). ${matEN(mat)}`],
    [/^(.+)\. Pipa OD (\S+) mm, keliling (\S+) mm \(jam 12 di y = 0\)\.$/, (m, mat, od, c) => `${matEN(mat)}. Pipe OD ${od} mm, circumference ${c} mm (12 o’clock at y = 0).`],
    [/^(.+)\. Panjang las (\S+) mm\.$/, (m, mat, l) => `${matEN(mat)}. Weld length ${l} mm.`],
    [/^Tebal blok = T = (\S+) mm\. SDH Ø(\S+) mm pada kedalaman (.+?) mm\.( Blok lengkung D = (\S+) mm\.)? (.+)$/,
      (m, t, d, z, c, od, mat) => `Block thickness = T = ${t} mm. SDH Ø${d} mm at depths ${z} mm.${c ? ` Curved block D = ${od} mm.` : ''} ${matEN(mat)}`],
    [/^Sudut (\S+)° > (\S+)°: berkas tidak mengenai dinding dalam \(t\/D = (\S+)\)$/, (m, a, b, c) => `Angle ${a}° > ${b}°: the beam does not reach the inner wall (t/D = ${c})`],
    [/^Dinding dalam dicapai di SP (\S+) mm, (\S+) mm \(busur\) dari exit point · sudut maks (\S+)°$/, (m, a, b, c) => `Inner wall reached at SP ${a} mm, ${b} mm (arc) from the exit point · max angle ${c}°`],
    [/^Blok V1 sisi (A|B) · 300 × 100 mm$/, (m, f) => `V1 block face ${f} · 300 × 100 mm`],
    [/^Muka depan probe → tanda pusat (.+):$/, (m, a) => `Probe front → centre mark ${a}:`],
    [/^Sisi miring: cek sudut 65°–75° dengan lubang Ø5 \(jarak ≈ (\S+) mm dari permukaan\)\. Tanda 0 tepat di atas lubang\.$/, (m, a) => `Slanted face: check angles 65°–75° with the Ø5 hole (≈ ${a} mm below the surface). The 0 mark is directly above the hole.`],
    [/^Blok lengkung D = (\S+) mm hanya berlaku untuk permukaan (\S+) mm\.$/, (m, a, b) => `A curved block D = ${a} mm is only valid for surfaces of ${b} mm.`],
    [/^kode (\d+) · (.+) · waktu (.+)$/, (m, c, l, t) => `code ${c} · ${tr(l)} · time ${t}`],
    [/^· T = (\S+) mm · 1 cacat · ⏱$/, (m, t) => `· T = ${t} mm · 1 flaw · ⏱`],
    [/^· T = (\S+) mm · jumlah cacat dirahasiakan · ⏱$/, (m, t) => `· T = ${t} mm · number of flaws hidden · ⏱`],
    [/^Kirim (\d+) indikasi untuk dinilai\?$/, (m, n) => `Submit ${n} indication(s) for grading?`],
    [/^(.+): tidak bisa dibaca$/, (m, f) => `${f}: could not be read`],
    [/^ujung (\d+)$/, (m, n) => `end ${n}`],
    [/^Penampang memanjang las di x = (\S+) mm \((logam las|logam induk, di samping las)\)$/, (m, x, w) => `Longitudinal weld section at x = ${x} mm (${w === 'logam las' ? 'weld metal' : 'base metal, beside the weld'})`],
    [/^(.+): tidak dapat diterima berapa pun panjangnya\.$/, (m, a) => `${tr(a)}: unacceptable regardless of length.`],
    [/^Panjang (\S+) mm ([>≤]) batas (\S+) mm \(t = (\S+) mm\): (tidak dapat diterima|dapat diterima)\.$/, (m, a, op, b, t, v) => `Length ${a} mm ${op} limit ${b} mm (t = ${t} mm): ${v === 'dapat diterima' ? 'acceptable' : 'unacceptable'}.`],
    [/^Melebihi reference level: ukur panjang \(6 dB drop\)\. Batas panjang untuk t = (\S+) mm adalah (\S+) mm\.$/, (m, t, l) => `Above the reference level: size the length (6 dB drop). The length limit for t = ${t} mm is ${l} mm.`],
    [/^Tampilan scanning \(penampang keliling pipa OD (\S+), las memanjang\)$/, (m, a) => `Scanning view (circumferential section of pipe OD ${a}, longitudinal weld)`],
    [/^Tampilan scanning \(penampang aksial dinding pipa OD (\S+)\)$/, (m, a) => `Scanning view (axial section of pipe wall OD ${a})`],
    [/^(\d+) titik · reference level$/, (m, n) => `${n} points · reference level`],
    [/^Penampang lokal di φ = (\S+)° · zona (\S+) · sudut dihedral Ψ = (\S+)°$/, (m, a, z, p) => `Local section at φ = ${a}° · ${zoneEN(z)} zone · dihedral angle Ψ = ${p}°`],
    [/^Ψ = (\S+)° \((\S+)\) · sudut ideal: muka bevel brace ≈ (\S+)° \(leg 2\), muka chord ≈ (\S+)° \(leg 1\)$/, (m, p, z, a, b) => `Ψ = ${p}° (${zoneEN(z)}) · ideal angles: brace bevel face ≈ ${a}° (leg 2), chord face ≈ ${b}° (leg 1)`],
    [/^φ (\S+)° · (\S+) · Ψ (\S+)°$/, (m, a, z, p) => `φ ${a}° · ${zoneEN(z)} · Ψ ${p}°`],
    [/^(\S+)° \((\S+), Ψ = (\S+)°\)$/, (m, a, z, p) => `${a}° (${zoneEN(z)}, Ψ = ${p}°)`],
    [/^(heel|toe|sisi|crown|saddle) (\d+)°$/, (m, z, a) => `${zoneEN(z)} ${a}°`],
    [/^Sambungan (T|Y|K|X) · (.+)$/, (m, t, r) => `${t} joint · ${r}`],
    [/^Sambungan tubular (T|Y|K|X)$/, (m, t) => `Tubular joint ${t}`],
    [/^(.+)\. Tebal pelat T = tebal brace \(untuk blok DAC\)\. Keliling brace (\S+) mm \(φ = 0° di heel\)\.$/, (m, mat, c) => `${matEN(mat)}. Plate thickness T = brace wall (for the DAC block). Brace circumference ${c} mm (φ = 0° at the heel).`],
  ];
  const zoneEN = (z) => ({ sisi: 'side' }[z] || z);

  // ------------------------------------------------------------------ frasa (cadangan teks dinamis)
  const PH = [
    ['acuan ASME Sec. V Art. 4', 'ASME Sec. V Art. 4 reference'],
    ['lintasan berkas 2D + model amplitudo semi-analitik', '2D beam paths + semi-analytical amplitude model'],
    ['Gelombang geser', 'Shear wave'], ['Gelombang longitudinal', 'Longitudinal wave'],
    ['sebaran berkas', 'beam spread'], ['celah tepi wedge', 'wedge edge gap'], ['rugi kopling', 'coupling loss'],
    ['nilai sebenarnya', 'true values'], ['probe lurus', 'straight beam'], ['probe dual TR', 'dual TR probe'],
    ['Probe lurus', 'Straight beam'], ['back wall di', 'back wall at'],
    ['Panjang las', 'weld length'], ['Baja karbon', 'Carbon steel'], ['Baja tahan karat austenitik', 'Austenitic stainless steel'],
    ['keliling', 'circumference'], ['Tebal blok', 'Block thickness'], ['pada kedalaman', 'at depths'],
    ['Muka depan probe → tanda pusat', 'Probe front → centre mark'], ['arahkan berkas', 'point the beam'],
    ['seharusnya di', 'should be at'], ['Cek sudut', 'Check angle'], ['dengan lubang', 'with the hole'],
    ['Sisi atas', 'Top face'], ['Sisi miring', 'Slanted face'], ['Sisi A', 'Face A'], ['Sisi B', 'Face B'],
    ['sisi atas', 'top face'], ['sisi miring', 'slanted face'], ['sisi A', 'face A'], ['sisi B', 'face B'],
    ['skala', 'scale'], ['sepusat', 'concentric'], ['lubang', 'hole'], ['Blok V1', 'V1 block'], ['Blok V2', 'V2 block'], ['Blok IIW V1', 'IIW V1 block'],
    ['Rekam DAC: maksimalkan tiap echo SDH. Gunakan “puncak gate = 80%” hanya untuk titik pertama, lalu jangan ubah gain saat merekam titik berikutnya.', 'Record DAC: maximise each SDH echo. Use “gate peak = 80%” only for the first point, then do not change the gain while recording the next points.'],
    ['titik · reference level', 'points · reference level'], ['scanning ≥', 'scanning ≥'],
    ['elemen', 'elements'], ['klik sektor untuk memilih sudut', 'click the sector to choose the angle'],
    ['maks', 'max'], ['delay law', 'delay law'], ['fokus', 'focus'],
    ['SP fokus', 'focal SP'], ['near field', 'near field'], ['tidak efektif', 'not effective'],
    ['aperture aktif', 'active aperture'], ['digeser 1 elemen', 'shifted by 1 element'], ['klik gambar untuk memilih berkas', 'click the image to choose a beam'],
    ['exit point berkas', 'beam exit point'], ['berkas', 'beams'],
    ['Dinding dalam dicapai di', 'Inner wall reached at'], ['dari exit point', 'from the exit point'], ['sudut maks', 'max angle'], ['busur', 'arc'],
    ['berkas tidak mengenai dinding dalam', 'beam does not reach the inner wall'],
    ['Tampilan scanning', 'Scanning view'], ['penampang keliling pipa', 'circumferential section of pipe'], ['las memanjang', 'longitudinal weld'],
    ['penampang aksial dinding pipa', 'axial section of pipe wall'], ['Pipa', 'Pipe'], ['las girth', 'girth weld'],
    ['Cakupan zona pemeriksaan', 'Examination zone coverage'], ['ada daerah merah tidak tercakup', 'red areas not covered'],
    ['Per sudut', 'Per angle'], ['Jarak exit point', 'Exit point distance'], ['sampai tepi zona seberang lewat leg 2', 'to the far zone edge via leg 2'],
    ['DAC dihapus', 'DAC deleted'], ['Buat ulang DAC di blok kalibrasi ASME', 'Rebuild the DAC on the ASME calibration block'],
    ['Reference AWS (b) juga dihapus', 'AWS reference (b) also deleted'],
    ['probe berubah', 'probe changed'], ['probe diganti', 'probe replaced'], ['material berubah', 'material changed'],
    ['mode gelombang berubah', 'wave mode changed'], ['tebal benda uji berubah', 'test piece thickness changed'],
    ['sudut', 'angle'], ['frekuensi', 'frequency'], ['ukuran kristal', 'crystal size'], ['jenis', 'type'],
    ['Melebihi reference level: ukur panjang', 'Above reference level: size the length'], ['Batas panjang untuk', 'Length limit for'], ['adalah', 'is'],
    ['tidak dapat diterima berapa pun panjangnya', 'unacceptable regardless of length'],
    ['tidak dapat diterima', 'unacceptable'], ['dapat diterima', 'acceptable'], ['batas', 'limit'],
    ['periksa juga jarak antar-indikasi', 'also check the spacing between indications'],
    ['diskontinuitas besar', 'large discontinuity'], ['diskontinuitas sedang', 'medium discontinuity'],
    ['diskontinuitas kecil', 'small discontinuity'], ['diskontinuitas minor', 'minor discontinuity'],
    ['Ditolak berapa pun panjangnya', 'Rejected regardless of length'], ['Dapat diterima berapa pun panjang dan lokasinya', 'Acceptable regardless of length and location'],
    ['Ukur panjang', 'Size the length'], ['ditolak bila', 'rejected if'], ['ditolak', 'rejected'],
    ['setengah tebal bagian tengah', 'middle half of thickness'], ['seperempat tebal atas/bawah', 'top/bottom quarter of thickness'],
    ['Kelas', 'Class'], ['kelas', 'class'],
    ['Untuk tebal', 'For thickness'], ['tabel AWS memakai probe', 'the AWS table uses'], ['Ganti sudut probe', 'Change the probe angle'],
    ['di luar rentang tabel simulator', 'outside the simulator table range'], ['Tebal', 'Thickness'],
    ['rata-rata per cacat', 'mean per flaw'], ['indikasi palsu', 'false calls'], ['laporan', 'report'], ['proses', 'process'],
    ['Proses', 'Process'], ['kalibrasi', 'calibration'], ['gain scanning', 'scanning gain'],
    ['Nilai akhir', 'Final score'], ['Nilai', 'Score'], ['waktu', 'time'], ['tingkat', 'level'],
    ['Indikasi palsu (−10 poin per indikasi)', 'False calls (−10 points each)'],
    ['kedalaman meleset', 'depth off by'], ['posisi melintang meleset', 'transverse position off by'],
    ['ujung-ujung meleset rata-rata', 'end points off by on average'], ['jenis sebenarnya', 'actual type'],
    ['keputusan seharusnya', 'decision should be'], ['diterima', 'accepted'],
    ['kurva DAC meleset rata-rata', 'DAC curve off by on average'], ['DAC tidak mencakup rentang leg 1–2', 'DAC does not cover the leg 1–2 range'],
    ['DAC tidak dibuat (minimal 2 titik)', 'no DAC built (at least 2 points)'], ['seharusnya', 'should be'],
    ['sebenarnya', 'actual'], ['zero meleset', 'zero off by'], ['cacat', 'flaws'], ['Deteksi', 'Detection'], ['Lokasi', 'Location'],
    ['Panjang', 'Length'], ['Jenis', 'Type'], ['Keputusan', 'Decision'], ['kedalaman', 'depth'],
    ['Kedalaman', 'Depth'], ['posisi', 'position'], ['tebal', 'thickness'], ['Tinggi', 'Height'],
    ['kiri', 'left'], ['kanan', 'right'], ['pada', 'at'],
    ['Mudah', 'Easy'], ['Sedang', 'Medium'], ['Sulit', 'Hard'], ['Praktik lengkap', 'Full practical'],
    ['Kalibrasi', 'Calibration'], ['Proses ikut dinilai', 'The process is graded too'],
    ['1 cacat', '1 flaw'], ['jumlah cacat dirahasiakan', 'number of flaws hidden'],
    ['tidak ada echo di gate', 'no echo in the gate'], ['file diimpor', 'file(s) imported'], ['duplikat dilewati', 'duplicates skipped'],
    ['dikurangi', 'minus'], ['untuk', 'for'], ['kode soal', 'task code'], ['siswa', 'student'],
    ['ukuran sambungan berubah', 'joint size changed'],
    ['menit', 'min'], ['dari', 'of'],
  ];

  // ------------------------------------------------------------------ mesin
  let lang = 'id';
  try { lang = g.localStorage && g.localStorage.getItem('ut-lang') === 'en' ? 'en' : 'id'; } catch (e) { /* */ }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let PHRE = null, PHMAP = null;
  function buildPhrases() {
    PHMAP = new Map(PH);
    const keys = PH.map((p) => p[0]).sort((a, b) => b.length - a.length).map(esc);
    PHRE = new RegExp(`(?<![A-Za-zÀ-ÿ])(${keys.join('|')})(?![A-Za-zÀ-ÿ])`, 'g');
  }
  const cache = new Map();

  /** Terjemahkan satu teks (dipakai juga oleh modul lain). */
  function tr(s) {
    if (lang !== 'en' || s == null) return s;
    const str = String(s);
    const n = norm(str);
    if (!n || !/[A-Za-z]/.test(n)) return str;
    let r = cache.get(n);
    if (r === undefined) {
      r = D[n];
      if (r == null) {
        for (const [re, fn] of P) { const m = n.match(re); if (m) { r = fn(...m); break; } }
      }
      if (r == null) {
        if (!PHRE) buildPhrases();
        r = n.replace(PHRE, (m) => PHMAP.get(m));
      }
      cache.set(n, r);
    }
    // pertahankan spasi di awal/akhir node teks
    const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
    return lead + r + trail;
  }
  UT.tr = tr;
  UT.lang = () => lang;

  /** Tambahkan pasangan kalimat (Indonesia → Inggris) ke kamus. */
  function addPair(id, en) { if (id && en) D[norm(id)] = en; }

  /** Isi kamus dari data aplikasi (pelajaran, skenario, tingkat ujian) per id/posisi. */
  function seedFromData() {
    const L = UT.LESSONS_EN || {};
    (UT.LESSONS || []).forEach((l) => {
      const e = L[l.id];
      if (!e) return;
      addPair(l.title, e[0]);
      addPair(l.desc, e[1]);
      addPair(`– ${l.desc}`, `– ${e[1]}`);
      l.steps.forEach((s, i) => {
        const t = e[2][i];
        if (!t) return;
        addPair(s.title, t[0]); addPair(s.text, t[1]);
        if (s.hint && t[2]) addPair(s.hint, t[2]);
        if (s.quiz && t[3]) addPair(s.quiz.label, t[3]);
      });
    });
    (UT.SCENARIOS || []).forEach((s) => { const e = SCEN_EN[s.id]; if (e) { addPair(s.name, e[0]); addPair(s.desc, e[1]); } });
    (UT.EXAM_LEVELS || []).forEach((l) => { const e = LEVEL_EN[l.id]; if (e) { addPair(l.name, e[0]); addPair(l.desc, e[1]); } });
    cache.clear();
  }

  // ---- DOM: node teks & atribut, teks asli disimpan untuk kembali ke bahasa Indonesia
  const orig = new WeakMap();
  /** Terjemahan Inggris tanpa memandang bahasa aktif (untuk mengenali teks yang sudah diterjemahkan). */
  const trEN = (s) => { const l = lang; lang = 'en'; const r = tr(s); lang = l; return r; };
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function trText(node) {
    let o = orig.get(node);
    const cur = node.nodeValue;
    if (o === undefined || (cur !== o && cur !== trEN(o))) { o = cur; orig.set(node, o); }
    const want = lang === 'en' ? tr(o) : o;
    if (cur !== want) node.nodeValue = want;
  }
  function trAttrs(el) {
    ATTRS.forEach((a) => {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      const key = `data-i18n-${a}`;
      const cur = el.getAttribute(a);
      let o = el.getAttribute(key);
      if (o == null || (cur !== o && cur !== trEN(o))) { o = cur; el.setAttribute(key, o); }
      const want = lang === 'en' ? tr(o) : o;
      if (cur !== want) el.setAttribute(a, want);
    });
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
    trAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
  }

  function applyAll() {
    document.documentElement.lang = lang;
    document.title = lang === 'en' ? 'Weld UT Simulator' : 'Simulator UT Las';
    walk(document.body);
    const b = document.getElementById('btnLang');
    if (b) { b.textContent = lang === 'en' ? 'ID' : 'EN'; orig.set(b.firstChild, b.textContent); }
    if (UT.app && UT.app.forceSim) UT.app.forceSim();
    g.dispatchEvent(new Event('resize'));
  }

  /** Ganti bahasa ('id' | 'en'). */
  UT.setLang = function (l) {
    lang = l === 'en' ? 'en' : 'id';
    try { g.localStorage.setItem('ut-lang', lang); } catch (e) { /* */ }
    cache.clear();
    applyAll();
  };

  /** Terjemahkan dokumen HTML lengkap (laporan cetak/unduh). */
  UT.trHTML = function (html) {
    if (lang !== 'en' || typeof DOMParser === 'undefined') return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { if (n.parentNode && n.parentNode.tagName !== 'SCRIPT') n.nodeValue = tr(n.nodeValue); }
    doc.documentElement.lang = 'en';
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  };

  if (typeof document === 'undefined') { UT._i18nSeed = seedFromData; return; }

  // ---- kanvas & dialog
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y, mw) {
    return mw === undefined ? fillText.call(this, lang === 'en' ? tr(t) : t, x, y) : fillText.call(this, lang === 'en' ? tr(t) : t, x, y, mw);
  };
  const measure = CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function (t) { return measure.call(this, lang === 'en' ? tr(t) : t); };
  const conf = g.confirm, al = g.alert;
  g.confirm = (m) => conf.call(g, tr(m));
  g.alert = (m) => al.call(g, tr(m));

  function start() {
    seedFromData();
    new MutationObserver((ms) => {
      if (lang !== 'en') {
        // tetap catat teks asli baru agar bisa diterjemahkan nanti
        return;
      }
      ms.forEach((m) => {
        if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') trAttrs(m.target);
        else m.addedNodes.forEach((nd) => walk(nd));
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const b = document.getElementById('btnLang');
    if (b) b.addEventListener('click', () => UT.setLang(lang === 'en' ? 'id' : 'en'));
    applyAll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
