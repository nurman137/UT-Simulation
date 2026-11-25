/*
 * Editor skenario instruktur: menyusun cacat sendiri pada las pelat/pipa, menyimpan/membuka file,
 * dan membagikan lewat kode. Skenario disimpan di S.custom dan dipakai skenario 'kustom'.
 */
(function () {
  'use strict';
  const UT = window.UT;
  const app = UT.app, S = app.S;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let draft = null; // salinan yang sedang diedit (diterapkan dengan tombol Terapkan)

  function msg(t, bad) { const m = $('custMsg'); m.textContent = t || ''; m.className = bad ? 'small bad' : 'small'; }

  function render() {
    if (!draft) draft = UT.cleanCustom(S.custom).map((d) => Object.assign({}, d));
    const opts = (sel) => UT.CUSTOM_TYPES.map((t) => `<option value="${t.id}"${t.id === sel ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    const num = (i, k, v, step) => `<input type="number" step="${step || 0.5}" data-i="${i}" data-k="${k}" value="${v}">`;
    $('customTable').querySelector('tbody').innerHTML = draft.map((d, i) => {
      const t = UT.CUSTOM_TYPES.find((x) => x.id === d.type) || {};
      return `<tr><td><select data-i="${i}" data-k="type">${opts(d.type)}</select></td>
        <td>${t.side ? `<select data-i="${i}" data-k="side"><option value="kiri"${d.side === 'kiri' ? ' selected' : ''}>kiri</option><option value="kanan"${d.side === 'kanan' ? ' selected' : ''}>kanan</option></select>` : '–'}</td>
        <td>${num(i, 'y1', d.y1, 1)}</td><td>${t.point ? '–' : num(i, 'y2', d.y2, 1)}</td>
        <td>${t.z ? num(i, 'z1', d.z1) : '–'}</td><td>${t.z && !t.point ? num(i, 'z2', d.z2) : '–'}</td>
        <td>${t.x ? num(i, 'x', d.x) : '–'}</td>
        <td><button type="button" class="btn" data-del="${i}" aria-label="hapus">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="muted small c">Belum ada cacat. Tekan “+ Tambah cacat”.</td></tr>';
  }
  UT.renderCustomEditor = function () { if (!draft) render(); };

  function apply() {
    // titik (porositas/retak melintang): y2 & z2 mengikuti y1/z1
    draft.forEach((d) => {
      const t = UT.CUSTOM_TYPES.find((x) => x.id === d.type) || {};
      if (t.point) { d.y2 = d.y1 + 1; d.z2 = d.z1 + (d.type === 'transverse' ? Math.max(3, d.z2 - d.z1) : 0.5); }
    });
    S.custom = UT.cleanCustom(draft);
    draft = null;
    app.resetSizing();
    app.rebuild(false);
    app.syncControls();
    render();
    msg(`Skenario diterapkan: ${S.custom.length} cacat.`);
  }

  const tbl = $('customTable');
  tbl.addEventListener('change', (e) => {
    const el = e.target, i = +el.dataset.i, k = el.dataset.k;
    if (!draft || isNaN(i) || !k) return;
    draft[i][k] = k === 'type' || k === 'side' ? el.value : parseFloat(el.value);
    if (k === 'type') render();
    msg('Perubahan belum diterapkan.');
  });
  tbl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !draft) return;
    draft.splice(+b.dataset.del, 1);
    render();
    msg('Perubahan belum diterapkan.');
  });
  $('btnCustAdd').addEventListener('click', () => {
    if (!draft) render();
    if (draft.length >= 8) { msg('Maksimal 8 cacat.', true); return; }
    const last = draft[draft.length - 1];
    const y = last ? Math.min(app.spec.yLen - 40, last.y2 + 25) : 60;
    draft.push({ type: 'slag', side: 'kiri', y1: y, y2: y + 15, z1: app.spec.T * 0.4, z2: app.spec.T * 0.6, x: 0 });
    render();
    msg('Perubahan belum diterapkan.');
  });
  $('btnCustApply').addEventListener('click', apply);
  $('btnCustSave').addEventListener('click', () => {
    const data = { type: 'ut-simulator/skenario', version: UT.CONFIG.version, defects: UT.cleanCustom(draft || S.custom) };
    UT.saveFile(JSON.stringify(data, null, 1), 'application/json', 'skenario-ut.json');
  });
  $('btnCustLoad').addEventListener('click', () => $('inCustFile').click());
  $('inCustFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!o || o.type !== 'ut-simulator/skenario') throw new Error('bukan file skenario simulator');
      draft = UT.cleanCustom(o.defects);
      apply();
    } catch (err) { msg(`${f.name}: ${err.message}`, true); }
  });
  $('btnCustCode').addEventListener('click', async () => {
    const code = UT.customToCode(draft || S.custom);
    try { await navigator.clipboard.writeText(code); msg(`Kode disalin: ${code}`); } catch (e) { msg(`Kode: ${code}`); }
  });
  $('btnCustPaste').addEventListener('click', () => {
    const code = window.prompt(UT.tr ? UT.tr('Tempel kode skenario (UTS1:…)') : 'Tempel kode skenario (UTS1:…)');
    if (!code) return;
    try { draft = UT.customFromCode(code); apply(); } catch (err) { msg(err.message, true); }
  });
})();
