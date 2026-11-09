/* AGSC Surgical List Log — offline phone web app. All data stays in this browser's IndexedDB. */
'use strict';
const VERSION = '1.0.1';
const $ = s => document.querySelector(s);

const PROCS = ['Hysterectomy, complex lap (35754)','Hysterectomy, complex lap (35753)','Hysterectomy, lap (35751)','Sacrocolpopexy (35597)','Anterior + posterior repair (35573)','Anterior repair (35570)','Posterior repair (35571)','Vault / uterine prolapse, vaginal (35568)','Vault prolapse (35595)','Midurethral sling (35599)','Severe endometriosis resection (35641)','Complicated operative lap (35632)','Operative laparoscopy (35631)','Operative laparoscopy (35637)','Adhesiolysis (30724)','Uterus removal / morcellation (35658)','Operative hysteroscopy (35633)','Diagnostic hysteroscopy (35630)','Endometrial ablation (35616)','Cystoscopy (36812)','Pudendal block (18264)','Pelvic floor Botox','Myomectomy (35649)','EUA (35500)','Other'];
const APPROACH = ['Robotic','Laparoscopic','Vaginal','Hysteroscopic','Cystoscopic','Open','Other'];
const STAY = ['Day case','1 night','2+ nights'];
const SCHED = {AM:['08:00','13:00'], PM:['14:00','20:00'], Full:['08:00','20:00']};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---------- storage ---------- */
const store = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('agsc-list-log', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('lists', {keyPath: 'id'}); r.result.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (name, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(name, mode), s = t.objectStore(name); let out;
      Promise.resolve(fn(s)).then(v => out = v);
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    all: () => tx('lists', 'readonly', s => req(s.getAll())),
    put: rec => tx('lists', 'readwrite', s => { s.put(rec); }),
    putMany: recs => tx('lists', 'readwrite', s => { recs.forEach(r => s.put(r)); }),
    del: id => tx('lists', 'readwrite', s => { s.delete(id); }),
    getMeta: k => tx('meta', 'readonly', s => req(s.get(k))),
    setMeta: (k, v) => tx('meta', 'readwrite', s => { s.put(v, k); }),
  };
})();

/* ---------- state ---------- */
let all = [], editId = null, period = 182;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const mins = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmtDate = d => { const [y, m, dd] = d.split('-'); return `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}`; };
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const status = (el, t, k) => { el.textContent = t; el.className = 'status ' + (k || ''); };
const pref = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------- form ---------- */
function option(list, v) { return list.map(x => { const o = document.createElement('option'); o.textContent = x; if (x === v) o.selected = true; return o; }); }
function field(labelText, el) { const l = document.createElement('label'); l.append(labelText, el); return l; }
function sel(key, list, v) { const s = document.createElement('select'); s.dataset.k = key; s.append(...option(list, v)); return s; }

function caseEl(c = {}) {
  const d = document.createElement('div'); d.className = 'case';
  const h = document.createElement('div'); h.className = 'case-h';
  const b = document.createElement('b'); b.className = 'small';
  const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ghost small'; rm.textContent = 'Remove';
  rm.onclick = () => { d.remove(); renumber(); };
  h.append(b, rm);
  const g = document.createElement('div'); g.className = 'grid';
  const items = document.createElement('input'); items.dataset.k = 'items'; items.placeholder = 'e.g. 36812, 30724'; items.value = c.items || '';
  const m = document.createElement('input'); m.dataset.k = 'mins'; m.type = 'number'; m.min = 0; m.max = 900; m.inputMode = 'numeric'; m.value = c.mins ?? '';
  g.append(
    field('Main procedure', sel('proc', PROCS, c.proc || PROCS[0])),
    field('Approach', sel('approach', APPROACH, c.approach || 'Laparoscopic')),
    field('Your role', sel('role', ['Surgeon', 'Assist'], c.role || 'Surgeon')),
    field('Other MBS items', items),
    field('Skin to skin (min)', m),
    field('Expected stay', sel('stay', STAY, c.stay || 'Day case')),
    field('Gap capped at $3,000', sel('cap', ['No', 'Yes', 'Unsure'], c.cap || 'No')),
    field('Intra-op issue', sel('issue', ['None', 'Minor', 'Major'], c.issue || 'None')),
    field('Converted', sel('conv', ['No', 'To lap', 'To open'], c.conv || 'No')));
  d.append(h, g); $('#cases').appendChild(d); renumber();
}
function renumber() { [...$('#cases').children].forEach((c, i) => c.querySelector('b').textContent = 'Case ' + (i + 1)); }

function resetForm() {
  editId = null; $('#editing').textContent = '';
  $('#f-date').value = today();
  $('#f-session').value = new Date().getHours() < 14 ? 'AM' : 'PM';
  const h = pref.get('agscHosp'), t = pref.get('agscType');
  if (h) $('#f-hosp').value = h; if (t) $('#f-type').value = t;
  ['start', 'finish', 'booked', 'notes'].forEach(k => $('#f-' + k).value = '');
  $('#f-cancel').value = '0'; $('#f-creason').value = ''; $('#f-delay').value = '';
  $('#cases').innerHTML = ''; caseEl();
}
function readForm() {
  const cases = [...$('#cases').children].map(el => {
    const o = {}; el.querySelectorAll('[data-k]').forEach(i => { o[i.dataset.k] = i.dataset.k === 'mins' ? (i.value === '' ? null : Number(i.value)) : i.value.trim(); }); return o;
  });
  return {
    date: $('#f-date').value, session: $('#f-session').value, hospital: $('#f-hosp').value, type: $('#f-type').value,
    start: $('#f-start').value, finish: $('#f-finish').value,
    booked: $('#f-booked').value === '' ? cases.length : Number($('#f-booked').value),
    cancels: Number($('#f-cancel').value || 0), cancelReason: $('#f-creason').value, delay: $('#f-delay').value,
    notes: $('#f-notes').value.trim(), cases,
  };
}
function fillForm(id) {
  const r = all.find(x => x.id === id); if (!r) return;
  editId = id; $('#editing').textContent = 'Editing ' + fmtDate(r.date) + ' ' + r.session;
  $('#f-date').value = r.date; $('#f-session').value = r.session; $('#f-hosp').value = r.hospital; $('#f-type').value = r.type;
  $('#f-start').value = r.start || ''; $('#f-finish').value = r.finish || ''; $('#f-booked').value = r.booked ?? ''; $('#f-cancel').value = r.cancels ?? 0;
  $('#f-creason').value = r.cancelReason || ''; $('#f-delay').value = r.delay || ''; $('#f-notes').value = r.notes || '';
  $('#cases').innerHTML = ''; (r.cases || []).forEach(c => caseEl(c)); if (!(r.cases || []).length) caseEl();
  show('log'); window.scrollTo({top: 0, behavior: 'smooth'});
}

async function save() {
  const st = $('#status'), r = readForm();
  if (!r.date) return status(st, 'Add the list date.', 'err');
  if (r.start && r.finish && mins(r.finish) <= mins(r.start)) return status(st, 'Last patient out must be after first knife to skin.', 'err');
  if (r.start && ((r.session === 'PM' && mins(r.start) < 12 * 60) || (r.session === 'AM' && mins(r.start) >= 13 * 60)))
    return status(st, `A ${r.start} start doesn't match the ${r.session} session. Check the session or the time.`, 'err');
  const prev = editId && all.find(x => x.id === editId);
  const rec = {...r, id: editId || uid(), createdAt: prev ? prev.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString()};
  $('#save').disabled = true;
  try {
    await store.put(rec);
    pref.set('agscHosp', r.hospital); pref.set('agscType', r.type);
    status(st, 'Saved ' + fmtDate(r.date) + ' ' + r.session + '.', 'ok');
    resetForm(); await reload();
  } catch (e) { status(st, 'Could not save on this phone. Check storage space and try again.', 'err'); }
  $('#save').disabled = false;
}

/* ---------- views ---------- */
function show(v) {
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
  pref.set('agscView', v);
}
const inPeriod = r => !period || (Date.now() - Date.parse(r.date)) / 864e5 <= period;

function summary() {
  const L = all.filter(inPeriod), cases = L.flatMap(r => r.cases || []), own = cases.filter(c => c.role === 'Surgeon');
  let used = 0, sched = 0, uN = 0; const late = [];
  L.forEach(r => { const s = SCHED[r.session] || SCHED.AM; if (r.start && r.finish) { used += mins(r.finish) - mins(r.start); sched += mins(s[1]) - mins(s[0]); uN++; } if (r.start) late.push(mins(r.start) - mins(s[0])); });
  const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const booked = L.reduce((a, r) => a + (r.booked || 0), 0), canc = L.reduce((a, r) => a + (r.cancels || 0), 0);
  const rob = own.filter(c => c.approach === 'Robotic').length, cap = own.filter(c => c.cap === 'Yes').length, day = own.filter(c => c.stay === 'Day case').length;
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
  const m = med(late);
  const T = [
    ['Lists logged', L.length, period ? `last ${period === 182 ? '6 months' : period === 365 ? '12 months' : period + ' days'}` : 'all time'],
    ['Cases', cases.length, L.length ? (cases.length / L.length).toFixed(1) + ' per list' : ''],
    ['List time used', pct(used, sched), uN ? `first incision to last out, ${uN} lists` : 'needs start and finish times'],
    ['Median late start', m === null ? '–' : Math.round(m) + ' min', late.length ? `${late.filter(x => x > 15).length} lists over 15 min` : ''],
    ['On-day cancellations', pct(canc, booked), `${canc} of ${booked} booked`],
    ['Robotic', pct(rob, own.length), `of ${own.length} cases as surgeon`],
    ['Gap cap applied', cap, `${pct(cap, own.length)} of your cases`],
    ['Day cases', pct(day, own.length), 'of your cases'],
  ];
  $('#tiles').replaceChildren(...T.map(t => { const d = document.createElement('div'); d.className = 'tile';
    d.innerHTML = '<div class="k"></div><div class="v"></div><div class="s"></div>';
    d.children[0].textContent = t[0]; d.children[1].textContent = t[1]; d.children[2].textContent = t[2]; return d; }));
}

function renderLists() {
  const el = $('#lists');
  if (!all.length) { el.innerHTML = '<p class="muted small">No lists yet. Log your first list on the Log tab.</p>'; return; }
  el.replaceChildren(...all.map(r => {
    const d = document.createElement('div'); d.className = 'li';
    const cs = r.cases || [];
    const head = document.createElement('div'); head.className = 'row';
    const b = document.createElement('b'); b.textContent = fmtDate(r.date) + ' · ' + r.session;
    const p = document.createElement('span'); p.className = 'pill'; p.textContent = r.hospital + ' · ' + r.type;
    head.append(b, p);
    if (cs.some(c => c.approach === 'Robotic')) { const rp = document.createElement('span'); rp.className = 'pill rob'; rp.textContent = 'robotic'; head.append(rp); }
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${cs.length} case${cs.length === 1 ? '' : 's'}${r.start ? ` · ${r.start}–${r.finish || '?'}` : ''}${r.cancels ? ` · ${r.cancels} cancelled (${r.cancelReason || 'no reason'})` : ''}${r.delay ? ` · late: ${r.delay}` : ''}${cs.length ? ' — ' + cs.map(c => (c.proc || '').replace(/ \(\d+\)$/, '')).join(', ') : ''}`;
    const acts = document.createElement('div'); acts.className = 'row';
    const drawActs = () => {
      const e = document.createElement('button'); e.type = 'button'; e.className = 'ghost small'; e.textContent = 'Edit'; e.onclick = () => fillForm(r.id);
      const x = document.createElement('button'); x.type = 'button'; x.className = 'danger small'; x.textContent = 'Delete';
      x.onclick = () => {
        const c = document.createElement('div'); c.className = 'confirm';
        const q = document.createElement('span'); q.textContent = 'Delete this list?';
        const y = document.createElement('button'); y.type = 'button'; y.className = 'danger small'; y.textContent = 'Delete';
        const n = document.createElement('button'); n.type = 'button'; n.className = 'ghost small'; n.textContent = 'Keep';
        y.onclick = async () => { await store.del(r.id); await reload(); };
        n.onclick = drawActs; c.append(q, y, n); acts.replaceChildren(c);
      };
      acts.replaceChildren(e, x);
    };
    drawActs();
    d.append(head, meta, acts); return d;
  }));
}

async function backupNote() {
  const last = await store.getMeta('lastBackup');
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
  const el = $('#backupNote');
  el.hidden = !(all.length && (days === null || days > 30));
  el.textContent = days === null ? `${all.length} list${all.length === 1 ? '' : 's'} not backed up yet. Save a backup on the Data tab.` : `Last backup ${days} days ago. Save a new one on the Data tab.`;
  $('#stats').textContent = `${all.length} lists, ${all.reduce((a, r) => a + (r.cases || []).length, 0)} cases stored. ${last ? 'Last backup ' + fmtDate(last.slice(0, 10)) + '.' : 'No backup yet.'}`;
}

async function reload() {
  all = await store.all();
  all.sort((a, b) => (b.date + (b.session === 'PM' ? '1' : '0')).localeCompare(a.date + (a.session === 'PM' ? '1' : '0')));
  renderLists(); summary(); backupNote();
}

/* ---------- export, backup, restore ---------- */
function toCSV() {
  const h = ['date','session','hospital','list','first_incision','last_out','booked','cancelled','cancel_reason','late_cause','case','procedure','approach','role','other_items','skin_to_skin_min','stay','gap_capped','issue','converted','notes'];
  const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = [h.join(',')];
  [...all].reverse().forEach(r => (r.cases && r.cases.length ? r.cases : [{}]).forEach((c, i) =>
    rows.push([r.date, r.session, r.hospital, r.type, r.start, r.finish, r.booked, r.cancels, r.cancelReason, r.delay, i + 1, c.proc, c.approach, c.role, c.items, c.mins, c.stay, c.cap, c.issue, c.conv, r.notes].map(q).join(','))));
  return rows.join('\n');
}
async function deliver(name, text, type) {
  const file = new File([text], name, {type});
  if (navigator.canShare && navigator.canShare({files: [file]})) {
    try { await navigator.share({files: [file], title: name}); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'downloaded';
}
async function exportCSV() {
  const st = $('#dataStatus');
  if (!all.length) return status(st, 'Nothing to export yet.', 'err');
  const r = await deliver(`agsc-surgical-lists-${today()}.csv`, toCSV(), 'text/csv');
  status(st, r === 'cancelled' ? 'Export cancelled.' : 'CSV exported.', r === 'cancelled' ? '' : 'ok');
}
async function saveBackup() {
  const st = $('#dataStatus');
  const body = JSON.stringify({app: 'agsc-list-log', version: VERSION, exportedAt: new Date().toISOString(), lists: all}, null, 1);
  const r = await deliver(`agsc-list-log-backup-${today()}.json`, body, 'application/json');
  if (r === 'cancelled') return status(st, 'Backup cancelled.');
  await store.setMeta('lastBackup', new Date().toISOString());
  status(st, 'Backup saved. Keep the file somewhere safe, such as iCloud Drive.', 'ok'); backupNote();
}
async function restore(file) {
  const st = $('#dataStatus');
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'agsc-list-log' || !Array.isArray(data.lists)) throw new Error('not a backup');
    const byId = new Map(all.map(r => [r.id, r]));
    const take = data.lists.filter(r => r && r.id && r.date && (!byId.has(r.id) || (r.updatedAt || '') > (byId.get(r.id).updatedAt || '')));
    await store.putMany(take); await reload();
    status(st, `Restored ${take.length} list${take.length === 1 ? '' : 's'}; ${data.lists.length - take.length} were already up to date.`, 'ok');
  } catch (e) { status(st, 'That file is not a List Log backup.', 'err'); }
}

/* ---------- start ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.view));
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  period = Number(b.dataset.p); pref.set('agscPeriod', period);
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); summary();
});
document.querySelectorAll('.now').forEach(b => b.onclick = () => { $('#' + b.dataset.now).value = nowHM(); });
$('#addCase').onclick = () => caseEl();
$('#reset').onclick = () => { resetForm(); status($('#status'), ''); };
$('#save').onclick = save;
$('#csv').onclick = exportCSV;
$('#backup').onclick = saveBackup;
$('#restore').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };
$('#ver').textContent = VERSION;
{ const p = pref.get('agscPeriod'); if (p !== null) { period = Number(p); document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', Number(x.dataset.p) === period)); } }
show(pref.get('agscView') || 'log');
resetForm();
reload().catch(() => { $('#lists').innerHTML = '<p class="small">This browser is blocking storage. Open the app from the home screen, not a private tab.</p>'; });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
