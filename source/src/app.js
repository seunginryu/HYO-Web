/* HYODOER 졸업전시 웹 — 편지 쓰기 / 방명록 */
(function(){
'use strict';
const A = window.__ASSETS;              // injected: logo, env[3], paper[3], glyph{}, glyphBox{}, star
const COLORS = ['#277BD1','#DAE633','#1E3A5E'];   // 0 블루, 1 라임, 2 네이비
const CNAMES = ['블루','라임','네이비'];
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['logo','star']);
const OWNER = '류승인';
// QR이 가리킬 주소(이 페이지의 공개 링크). 비어 있으면 현재 주소를 씁니다.
const PUBLIC_URL = '__PUBLIC_URL__';
const MAX_STICKERS = 40;
const VIEWER_ONLY = '__VIEWER__' === '1';  // GitHub Pages build: letter viewer only

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const svgURI = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

/* ---------- asset URIs ---------- */
const URI = { logo: svgURI(A.logo), env: A.env.map(svgURI), paper: A.paper.map(svgURI) };
const glyphCache = {};
function glyphURI(g, c){
  const k = g + '|' + c;
  if (!glyphCache[k]) glyphCache[k] = svgURI(A.glyph[g].split('#277BD1').join(COLORS[c]));
  return glyphCache[k];
}
document.querySelectorAll('img[data-asset="logo"]').forEach(i => i.src = URI.logo);

/* background: the designer's pattern image (transparent pattern over #F4F4F4) */
document.documentElement.style.setProperty('--pattern', `url("${A.bg}")`);

/* ---------- utils ---------- */
let toastT;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function sha(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hyodoer:' + s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
}
function today(){ const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('.'); }
const shortDate = s => (s || '').slice(2);

/* envelope (with stickers + date/from) */
function envelopeEl(L, opts = {}){
  const box = el('div', 'envbox c' + L.env);
  const bg = el('img', 'envbg'); bg.src = URI.env[L.env]; bg.alt = ''; box.appendChild(bg);
  (L.stickers || []).forEach(s => box.appendChild(stickerEl(s)));
  if (!opts.blank){
    box.appendChild(el('div', 'envtxt date', escapeHTML(opts.longDate ? L.date : shortDate(L.date))));
    box.appendChild(el('div', 'envtxt from', 'from. ' + escapeHTML(L.from || '')));
  }
  return box;
}
function stickerEl(s){
  const w = el('div', 'stk'); w.style.left = (s.x * 100) + '%'; w.style.top = (s.y * 100) + '%';
  w.style.width = (12 * (s.s || 1)) + '%'; w.style.transform = `translate(-50%,-50%) rotate(${s.r || 0}deg)`;
  const b = A.glyphBox[GLYPHS[s.g]]; w.style.aspectRatio = b[2] + '/' + b[3];
  const i = el('img'); i.src = glyphURI(GLYPHS[s.g], s.c); i.alt = ''; i.draggable = false; w.appendChild(i);
  return w;
}
function paperEl(target, L){
  target.className = 'paper c' + L.paper; target.innerHTML = '';
  const i = el('img'); i.src = URI.paper[L.paper]; i.alt = ''; target.appendChild(i);
  target.appendChild(el('div', 'to', escapeHTML(L.to || '')));
  const body = el('div', 'body'); body.textContent = L.body || ''; target.appendChild(body);
  target.appendChild(el('div', 'fr', escapeHTML(L.from || '')));
  requestAnimationFrame(() => fitText(body));
}
function fitText(box){
  const W = box.clientWidth; if (!W) return;
  let fs = W * 0.11;
  box.style.fontSize = fs + 'px';
  let n = 0;
  while ((box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) && n++ < 60){ fs *= 0.94; box.style.fontSize = fs + 'px'; }
}

/* ---------- compact letter encoding for QR (#name-safe base32) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(bytes){ let out = '', bits = 0, val = 0; for (const b of bytes){ val = (val << 8) | b; bits += 8; while (bits >= 5){ out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function b32dec(str){ const out = []; let bits = 0, val = 0; for (const ch of str){ const v = B32.indexOf(ch); if (v < 0) continue; val = (val << 5) | v; bits += 5; if (bits >= 8){ out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
function u16bytes(s){ const a = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); a[i*2] = c & 255; a[i*2+1] = c >> 8; } return a; }
function bytesU16(a){ let s = ''; for (let i = 0; i + 1 < a.length; i += 2) s += String.fromCharCode(a[i] | (a[i+1] << 8)); return s; }
async function pipe(bytes, stream){ const r = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await r.arrayBuffer()); }
async function encodeLetter(L){
  const st = []; (L.stickers || []).forEach(s => st.push(s.g, s.c, Math.round(s.x * 99), Math.round(s.y * 99), ((Math.round(s.r || 0) % 360) + 360) % 360, Math.round((s.s || 1) * 20)));
  const arr = [L.photoRef ? 3 : 2, L.env, L.paper, L.to, L.body, L.from, L.date.replace(/\./g,'').slice(2), st];
  if (L.photoRef) arr.push(L.photoRef);
  const z = await pipe(u16bytes(JSON.stringify(arr)), new CompressionStream('deflate-raw'));
  return 'L' + b32enc(z);
}
async function decodeLetter(code){
  const raw = await pipe(b32dec(code.slice(1)), new DecompressionStream('deflate-raw'));
  const a = JSON.parse(bytesU16(raw));
  const d = String(a[6]);
  const n = a[0] >= 2 ? 6 : 4, st = [];
  for (let i = 0; i + n - 1 < a[7].length; i += n) st.push({ g: a[7][i], c: a[7][i+1], x: a[7][i+2] / 99, y: a[7][i+3] / 99, r: n === 6 ? a[7][i+4] : 0, s: n === 6 ? a[7][i+5] / 20 : 1 });
  return { env: a[1], paper: a[2], to: a[3], body: a[4], from: a[5], date: '20' + d.slice(0,2) + '.' + d.slice(2,4) + '.' + d.slice(4,6), stickers: st, photoRef: a[0] >= 3 ? a[8] : null };
}

/* ---------- crypto: letter body/photo are encrypted; only the envelope is public ---------- */
const MASTER = __MASTER_KEYS__;           // RSA public key + private key sealed with the master password
const FB = __FIREBASE__;                  // Firebase web config (public by design)
const ADMIN_EMAIL = 'admin@hyodoer.app';
const subtle = crypto.subtle, te = new TextEncoder(), td = new TextDecoder();
const b64e = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pwKey(pw, salt, it, usage){
  const base = await subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}
let masterPub = null;
async function getMasterPub(){ return masterPub || (masterPub = await subtle.importKey('spki', b64d(MASTER.pub), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])); }
async function masterPriv(pw){ // throws if the password is wrong
  const p = MASTER.priv, k = await pwKey(pw, b64d(p.salt), p.it, ['decrypt']);
  const pk8 = await subtle.decrypt({ name: 'AES-GCM', iv: b64d(p.iv) }, k, b64d(p.ct));
  return subtle.importKey('pkcs8', pk8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}
async function sealSecret(obj, pw){
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(JSON.stringify(obj)));
  const salt = crypto.getRandomValues(new Uint8Array(16)), wiv = crypto.getRandomValues(new Uint8Array(12));
  const wk = await subtle.encrypt({ name: 'AES-GCM', iv: wiv }, await pwKey(pw, salt, 120000, ['encrypt']), raw);   // writer's password
  const mk = await subtle.encrypt({ name: 'RSA-OAEP' }, await getMasterPub(), raw);                                   // master password
  return JSON.stringify({ v: 1, iv: b64e(iv), ct: b64e(ct), salt: b64e(salt), wiv: b64e(wiv), wk: b64e(wk), mk: b64e(mk) });
}
async function openWithKey(e, raw){
  const k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return JSON.parse(td.decode(await subtle.decrypt({ name: 'AES-GCM', iv: b64d(e.iv) }, k, b64d(e.ct))));
}
async function openSecret(encStr, pw){ // → { secret, master, priv } or null
  const e = JSON.parse(encStr);
  try { const raw = await subtle.decrypt({ name: 'AES-GCM', iv: b64d(e.wiv) }, await pwKey(pw, b64d(e.salt), 120000, ['decrypt']), b64d(e.wk)); return { secret: await openWithKey(e, raw), master: false }; } catch(_){}
  try { const priv = await masterPriv(pw); return { secret: await openWithKey(e, await subtle.decrypt({ name: 'RSA-OAEP' }, priv, b64d(e.mk))), master: true, priv }; } catch(_){}
  return null;
}
async function openAsMaster(encStr, priv){
  const e = JSON.parse(encStr);
  return openWithKey(e, await subtle.decrypt({ name: 'RSA-OAEP' }, priv, b64d(e.mk)));
}

/* ---------- storage: Firebase Firestore (REST) + IndexedDB cache/queue on this computer ---------- */
const FS = `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents`;
const LS_KEY = 'hyodoer.guestbook.v2';
const Store = {
  list: [], pending: [], listeners: [], idb: null, online: false,
  onChange(f){ this.listeners.push(f); },
  emit(){ const all = this.list.concat(this.pending.filter(p => !this.list.some(x => x.id === p.id))); all.sort((a,b) => (b.createdAt||0) - (a.createdAt||0)); this.all = all; this.listeners.forEach(f => f(all)); },
  openIDB(){ return new Promise(res => { try { const r = indexedDB.open('hyodoer', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch(e){ res(null); } }); },
  idbGet(k){ return new Promise(res => { try { const q = this.idb.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch(e){ res(null); } }); },
  idbPut(k, v){ try { this.idb && this.idb.transaction('kv', 'readwrite').objectStore('kv').put(JSON.parse(JSON.stringify(v)), k); } catch(e){} },
  fromDoc(d){
    const f = d.fields || {}, pub = JSON.parse((f.pub && f.pub.stringValue) || '{}');
    return Object.assign(pub, { id: d.name.split('/').pop(), enc: f.enc && f.enc.stringValue, createdAt: +((f.createdAt && f.createdAt.integerValue) || 0) });
  },
  async fetchAll(){
    let out = [], token = '';
    do {
      const r = await fetch(`${FS}/guestbook?pageSize=300&key=${FB.apiKey}` + (token ? '&pageToken=' + token : ''));
      if (!r.ok) throw new Error('list ' + r.status);
      const j = await r.json(); (j.documents || []).forEach(d => out.push(this.fromDoc(d))); token = j.nextPageToken || '';
    } while (token);
    return out;
  },
  async refresh(){
    try { this.list = await this.fetchAll(); this.online = true; this.idbPut(LS_KEY, this.list); this.emit(); await this.flush(); }
    catch(e){ this.online = false; }
  },
  async init(){
    this.idb = await this.openIDB();
    this.list = (await this.idbGet(LS_KEY)) || []; this.pending = (await this.idbGet(LS_KEY + '.pending')) || [];
    this.emit();
    await this.refresh();
    setInterval(() => { if (!document.hidden) this.refresh(); }, 30000);
    addEventListener('online', () => this.refresh());
  },
  async upload(entry){
    const pub = { env: entry.env, date: entry.date, from: entry.from, stickers: entry.stickers };
    const body = { fields: { v: { integerValue: '1' }, pub: { stringValue: JSON.stringify(pub) }, enc: { stringValue: entry.enc }, createdAt: { integerValue: String(entry.createdAt) } } };
    const r = await fetch(`${FS}/guestbook?documentId=${entry.id}&key=${FB.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok && r.status !== 409) throw new Error('create ' + r.status + ' ' + (await r.text()).slice(0, 200));
  },
  async flush(){
    for (const p of this.pending.slice()){
      try { await this.upload(p); this.pending = this.pending.filter(x => x.id !== p.id); if (!this.list.some(x => x.id === p.id)) this.list.push(p); }
      catch(e){ break; }
    }
    this.idbPut(LS_KEY + '.pending', this.pending); this.idbPut(LS_KEY, this.list); this.emit();
  },
  async add(entry){
    this.pending.push(entry); this.idbPut(LS_KEY + '.pending', this.pending); this.emit();
    await this.flush();
    if (this.pending.some(x => x.id === entry.id)) toast('인터넷이 연결되면 자동으로 올라가요. (이 컴퓨터에 임시 저장됨)');
  },
  async adminToken(pw){
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: pw, returnSecureToken: true }) });
    if (!r.ok) throw new Error('auth ' + r.status);
    return (await r.json()).idToken;
  },
  async remove(id, pw){
    const tok = await this.adminToken(pw);
    const r = await fetch(`${FS}/guestbook/${id}?key=${FB.apiKey}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error('delete ' + r.status);
    this.list = this.list.filter(x => x.id !== id); this.pending = this.pending.filter(x => x.id !== id);
    this.idbPut(LS_KEY, this.list); this.idbPut(LS_KEY + '.pending', this.pending); this.emit();
  }
};
Store.all = [];

/* parent-letter photos: encrypted with a random key that only travels inside the QR */
async function uploadLetterPhoto(dataURL){
  const raw = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(dataURL));
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const body = { fields: { enc: { stringValue: JSON.stringify({ iv: b64e(iv), ct: b64e(ct) }) }, createdAt: { integerValue: String(Date.now()) } } };
  const r = await fetch(`${FS}/photos?documentId=${id}&key=${FB.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('photo ' + r.status);
  return [id, b64e(raw)];
}
async function fetchLetterPhoto(ref){
  const r = await fetch(`${FS}/photos/${ref[0]}?key=${FB.apiKey}`);
  if (!r.ok) throw new Error('photo ' + r.status);
  const e = JSON.parse((await r.json()).fields.enc.stringValue);
  const k = await subtle.importKey('raw', b64d(ref[1]), 'AES-GCM', false, ['decrypt']);
  return td.decode(await subtle.decrypt({ name: 'AES-GCM', iv: b64d(e.iv) }, k, b64d(e.ct)));
}

/* ---------- stage scaling & routing ---------- */
const stage = $('#stage');
function fit(){
  const s = Math.min(innerWidth / 1817, innerHeight / 1127);
  const ox = (innerWidth - 1817 * s) / 2, oy = (innerHeight - 1127 * s) / 2;
  stage.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
  // continue the same pattern seamlessly into any letterbox margins
  document.body.style.backgroundSize = `${1817 * s}px ${1126 * s}px`;
  document.body.style.backgroundPosition = `${ox}px ${oy}px`;
  stage._s = s;
}
addEventListener('resize', fit); fit();
function show(id){
  document.body.classList.toggle('intro', id === 'pIntro');
  if (id !== 'pIntro' && typeof ibTimers !== 'undefined'){ ibTimers.forEach(clearInterval); ibTimers = []; }
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === id));
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('on'));
}
function modal(id, on = true){ $('#' + id).classList.toggle('on', on); }
document.querySelectorAll('.home-link').forEach(a => a.addEventListener('click', goHome));

/* ---------- current letter ---------- */
let L, mode;   // mode 'p' = 부모님 편지, 'r' = 류승인 방명록
function newLetter(m){
  mode = m;
  L = { env: null, paper: null, to: m === 'r' ? OWNER : '', body: '', from: '', date: today(), stickers: [], photo: null };
}


/* ================= APP INTRO (앱 소개 페이지) ================= */
const INTRO = [
  { tab: '홈 화면', title: '[메인 홈 화면]', sub: '효도를 기록하고, 다음 효도를 떠올리게 하는 홈',
    points: [
      ['효도 통계 카드', "사용자의 기록을 반영해 효도 횟수와 효도한 기간을\n보여줌으로써 뿌듯함과 '아 효도 해야지' 재이용 유도"],
      ['효도어 스페이스', '부모님께 공유할 만한 정보를 모아두어\n부모님과의 연락을 유도'],
      ['주문 진행 상황 알림 카드', '영상에서 사용한 캐릭터를 이용, 모션을 제작해\n주문자의 주문(효도)의 현재 상황을 알림'] ],
    phones: [ { imgs: ['home_first'], cap: '최초 홈' }, { imgs: ['home_before'], cap: '이용 전', big: true }, { imgs: ['home_after'], cap: '이용 후 · 진행 상황 카드' } ] },
  { tab: '신청 플로우', title: '[신청 플로우]', sub: '부모님의 응답이 와야 넘어가는, 연락이 생기는 신청 과정',
    points: [
      ['사용자의 행동 제한', '부모님의 응답 도착 전까지 다음 단계로의\n이동을 제한하여 부모님과의 연락을 유도'],
      ['효도의 개인화', '편지지를 선택할 수 있게 함으로써\n나만의 효도 경험 제공'],
      ['제한 경험을 효도의 계기로', '응답을 기다리는 동안 부모님에게 편지를 쓸\n기회를 마련하여 또 다른 효도의 계기 마련.\n추후 패키지와 연계하여 부모님께 전달.'] ],
    phones: [ { imgs: ['c3'], cap: '응답 대기 · 다음 단계 잠김' },
      { big: true, seq: [ ['c1','01 부모님 정보 입력'], ['c2_1','02 부모님께 설문 문자 발송'], ['c2','02 부모님과 연락하기'], ['c3','03 응답 대기 중'], ['c3_1','03 기다리는 동안 편지지 고르기'], ['c3_2','03 편지 쓰기'], ['c3_5','03 부모님 응답 도착!'], ['c4','04 최종 확인'], ['c4_1','04 결제'], ['c4_2','신청 완료'] ], hl: [0,0,0,1,2,3,1,0,0,0] },
      { imgs: ['c3_1'], cap: '편지지 고르기' } ] },
  { tab: '주문현황 · 사진 확인', title: '[세탁 현황 사진 보기]', sub: '맡긴 이불이 어디쯤인지, 사진으로 안심하는 주문 내역',
    points: [
      ['단계 확인 다이얼', "세탁기와 '회전'의 컨셉에 맞추어 세탁기의\n다이얼에서 착안해 진행 단계를 알 수 있는 카드 디자인"],
      ['진행 사진', '내가 맡긴 부모님의 세탁물의 세탁 과정을\n실제 사진으로 확인, 신뢰감 구축.\n디폴트 축소형, 터치 시 확대'],
      ['상태별 주문 내역', '신청 중 · 접수된 · 완료된 주문을 탭으로 나눠\n진행 상황을 한눈에 확인'] ],
    phones: [ { imgs: ['d1_2'], cap: '접수된 주문' }, { imgs: ['d2'], cap: '주문 상세 · 단계 다이얼', big: true } ],
    photos: [ ['ph_pickup','수거'], ['ph_wash','세탁 중'], ['ph_pack','포장'], ['ph_ship','배송 중'] ] },
  { tab: '편지 보관함', title: '[편지 보관함]', sub: '신청할 때 쓴 편지와 부모님께 받은 편지를 모아 두는 곳',
    points: [
      ['편지 선택과 펼치는 인터랙션', '신청 단계에서 작성한 편지와, 부모님께 받은 편지를\n온라인에서도 읽을 수 있도록 보관.\n실제 편지가 열리는 모션으로 인터랙션'],
      ['내가 쓴 편지와 받은 편지', '카테고리 분류로 수월하게 편지 확인'] ],
    phones: [ { imgs: ['g1'], cap: '부채꼴로 도는 편지들' },
      { big: true, seq: [ ['g1','편지를 골라요'], ['g1_1','두 번 탭하면'], ['g1_2','봉투가 열리고'], ['g1_3','편지가 나와요'], ['g1_4','편지 읽기'] ], fast: true },
      { seq: [ ['g2','내가 쓴 편지'], ['g3','엄마한테 받은 편지'], ['g4','아빠한테 받은 편지'] ] } ] }
];
const ISIZE = __INTRO_SIZES__;
const isrc = n => 'intro/' + n + '.webp';
let ibIdx = 0, ibTimers = [];
(function(){
  const logo = A.hyoLogo.replace(/#277BD1/g, '#fff');
  $('#ibLogo').innerHTML = logo;
  document.documentElement.style.setProperty('--hyo-symbol', `url("${svgURI(A.hyoSymbol.replace(/#277BD1/g,'#fff'))}")`);
  document.documentElement.style.setProperty('--hyo-symbol-lime', `url("${svgURI(A.hyoSymbol.replace(/#277BD1/g,'#DAE633'))}")`);
  const tabs = $('#ibTabs');
  INTRO.forEach((s, i) => { const b = el('button', 'ib-tab', '<b>0' + (i+1) + '</b>' + s.tab); b.onclick = () => ibShow(i); tabs.appendChild(b); });
})();
function phoneEl(p){
  const w = el('div', 'phone' + (p.big ? ' big' : ''));
  const fr = el('div', 'frame'), scr = el('div', 'scr'); fr.appendChild(scr); w.appendChild(fr);
  const W = p.big ? 310 : 280, H = p.big ? 672 : 607;
  const setImg = n => {
    scr.innerHTML = '';
    const im = el('img'); im.src = isrc(n); im.alt = '';
    const sc = W / ISIZE[n][0], h = ISIZE[n][1] * sc;
    if (h > H + 20 && !p.seq){
      // tall screen: header (top 234px) and tab bar (bottom 166px) stay fixed, only the middle scrolls
      const hd = 234 * sc, nv = 166 * sc, url = `url("${isrc(n)}")`;
      const mid = el('div', 'mid'); mid.style.top = hd + 'px'; mid.style.bottom = nv + 'px';
      im.classList.add('tall'); im.style.top = (-hd) + 'px'; im.style.minHeight = '0';
      im.style.setProperty('--dy', (H - h) + 'px'); im.style.setProperty('--dur', Math.max(10, (h - H) / 40) + 's');
      mid.appendChild(im); scr.appendChild(mid);
      const top = el('div', 'fix-top'); top.style.height = hd + 'px'; top.style.backgroundImage = url;
      const bot = el('div', 'fix-bot'); bot.style.height = nv + 'px'; bot.style.backgroundImage = url;
      scr.append(top, bot);
    } else scr.appendChild(im);
    w.dataset.img = n;
  };
  if (p.seq){
    const cap = el('div', 'stepcap'); w.appendChild(cap);
    const dots = el('div', 'steps'); p.seq.forEach(() => dots.appendChild(el('span'))); w.appendChild(dots);
    const imgs = p.seq.map(([n]) => { const im = el('img'); im.src = isrc(n); im.alt = ''; im.style.opacity = 0; scr.appendChild(im); return im; });
    let k = 0;
    const go = () => {
      imgs.forEach((im, j) => im.style.opacity = j === k ? 1 : 0);
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === k));
      cap.textContent = p.seq[k][1]; w.dataset.img = p.seq[k][0];
      if (p.hl) document.querySelectorAll('#ibBody .ib-pt').forEach((pt, j) => pt.classList.toggle('on', p.hl[k] === j + 1));
      k = (k + 1) % p.seq.length;
    };
    go(); ibTimers.push(setInterval(go, p.fast ? 1600 : 2400));
  } else setImg(p.imgs[0]);
  w.appendChild(el('div', 'cap', escapeHTML(p.cap || '')));
  w.addEventListener('click', () => ibZoom(w.dataset.img));
  return w;
}
function ibShow(i){
  ibIdx = i; ibTimers.forEach(clearInterval); ibTimers = [];
  [...$('#ibTabs').children].forEach((t, j) => t.classList.toggle('on', j === i));
  const s = INTRO[i], sec = el('div', 'ib-sec');
  const tx = el('div', 'ib-text');
  tx.innerHTML = `<div class="ib-sec-title">${s.title}</div><div class="ib-sec-sub">${s.sub}</div>`;
  const pts = el('div', 'ib-points');
  s.points.forEach(([h, p]) => pts.appendChild(el('div', 'ib-pt', `<i></i><h3>${h}</h3><p>${p}</p>`)));
  tx.appendChild(pts); sec.appendChild(tx);
  const ph = el('div', 'ib-phones'); s.phones.forEach(p => ph.appendChild(phoneEl(p)));
  if (s.photos){
    const g = el('div', 'ib-photos');
    s.photos.forEach(([n, l]) => { const d = el('div', 'ib-photo', `<img src="${isrc(n)}" alt="${l}"><span>${l}</span>`); d.onclick = () => ibZoom(n, true); g.appendChild(d); });
    ph.appendChild(g);
  }
  sec.appendChild(ph);
  const body = $('#ibBody'); body.innerHTML = ''; body.appendChild(sec);
}
function ibZoom(n, photo){
  const w = document.querySelector('.ibz-wrap'); w.classList.toggle('photo', !!photo); w.scrollTop = 0;
  $('#ibZoomImg').src = isrc(n); modal('ibZoom');
}
$('#ibZoomClose').addEventListener('click', () => modal('ibZoom', false));
$('#ibZoom').addEventListener('click', e => { if (e.target.id === 'ibZoom') modal('ibZoom', false); });
let ibPreloaded = false;
function openIntro(){
  if (!ibPreloaded){ ibPreloaded = true; Object.keys(ISIZE).forEach(n => { const i = new Image(); i.src = isrc(n); }); }
  show('pIntro'); document.body.classList.add('intro'); ibShow(0);
}
addEventListener('keydown', e => {
  if (!$('#pIntro').classList.contains('on') || $('#ibZoom').classList.contains('on')) return;
  if (e.key === 'ArrowRight') ibShow((ibIdx + 1) % INTRO.length);
  if (e.key === 'ArrowLeft') ibShow((ibIdx + INTRO.length - 1) % INTRO.length);
});

/* ================= HOME: envelope fan ================= */
const SLOTS = [ // [x, y, deg] from the design, top → bottom
  [780.8,-136.1,-0.37],[783,67.25,-8.48],[815.45,275.1,-22.34],[888.8,465.9,-32.96],[1001,640.3,-42.65],
  [1134.9,789.7,-52.16],[1295.9,917.3,-63.72],[1482.7,1005.2,-72.23],[1677,1065.25,-80.33]];
// continue the curve a few slots beyond each end (quadratic extrapolation), so on wide or tall
// screens envelopes slide in and out past the screen edge instead of popping up inside it
const EXT = 4;
(function(){
  const ext = (p0, p1, p2) => { // next slot after p2 following the same curvature
    const d = [0,1,2].map(k => p2[k] - p1[k]), dd = [0,1,2].map(k => (p2[k] - p1[k]) - (p1[k] - p0[k]));
    return [0,1,2].map(k => p2[k] + d[k] + dd[k]);
  };
  for (let i = 0; i < EXT; i++){
    const n = SLOTS.length; SLOTS.push(ext(SLOTS[n-3], SLOTS[n-2], SLOTS[n-1]));
    SLOTS.unshift(ext(SLOTS[2], SLOTS[1], SLOTS[0]));
  }
})();
const SAMPLE_COLORS = [0,1,0,2,1,0,1,0,2,1,2,0];
const fan = $('#fan');
let fanEls = [], fanPhase = EXT, fanItems = [];
function slotAt(p){
  const n = SLOTS.length - 1; p = Math.max(0, Math.min(n, p));
  const i = Math.min(n - 1, Math.floor(p)), t = p - i, a = SLOTS[i], b = SLOTS[i+1];
  return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
}
function buildFan(list){
  fan.innerHTML = ''; fanEls = [];
  const COUNT = SLOTS.length; // 11 positions incl. off-screen ends
  fanItems = [];
  if (list.length === 0){ for (let i = 0; i < COUNT; i++) fanItems.push({ sample: true, env: SAMPLE_COLORS[i % SAMPLE_COLORS.length] }); }
  else {
    list.forEach(x => fanItems.push(x));
    // few entries → fill the rest of the fan with blank envelopes, spread between the real ones
    for (let i = fanItems.length; i < COUNT; i++) fanItems.push({ sample: true, env: SAMPLE_COLORS[i % SAMPLE_COLORS.length] });
    if (list.length < COUNT){
      const reals = fanItems.filter(x => !x.sample), blanks = fanItems.filter(x => x.sample), step = COUNT / reals.length, out = [];
      for (let i = 0; i < COUNT; i++){ const r = Math.floor(i / step); out.push(i === Math.round(r * step) && reals[r] ? reals[r] : (blanks.pop() || reals[0])); }
      fanItems = out;
    }
  }
  fanItems.forEach((it, i) => {
    const w = el('div', 'fenv' + (it.sample ? '' : ' real'));
    w.appendChild(envelopeEl(it, { blank: !!it.sample }));
    w.dataset.i = i;
    if (!it.sample) w.addEventListener('click', () => { if (performance.now() - fanDragEnd > 250) askUnlock(it); });
    fan.appendChild(w); fanEls.push(w);
  });
  placeFan();
}
function placeFan(){
  const total = fanItems.length, span = SLOTS.length - 1;
  fanEls.forEach((w, i) => {
    // newest entry starts at the top; the fan drifts downward
    let p = ((i + fanPhase) % total + total) % total;
    if (p > span){ w.style.visibility = 'hidden'; return; }
    w.style.visibility = '';
    const [x, y, r] = slotAt(p);
    w.style.transform = `translate(${x}px,${y}px) rotate(${r}deg)`;
    w.style.zIndex = 100 - Math.round(p * 2);
  });
}
let lastT = 0, fanPaused = false;
fan.addEventListener('pointerover', () => fanPaused = true);
fan.addEventListener('pointerout', () => fanPaused = false);

/* drag the fan along its arc (with a little momentum on release) */
let fanDrag = null, fanVel = 0, fanDragEnd = -1e9;
fan.addEventListener('pointerdown', e => {
  const w = e.target.closest('.fenv'); if (!w) return;
  e.preventDefault();
  const total = fanItems.length;
  const p = ((+w.dataset.i + fanPhase) % total + total) % total;
  fanDrag = { x: e.clientX, y: e.clientY, phase0: fanPhase, p, moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now() };
  fanVel = 0; fan.classList.add('dragging');
});
function arcStep(p){ // unit tangent of the arc at p and the length of one slot there (stage px)
  const a = slotAt(p - 0.5), b = slotAt(p + 0.5), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len, len];
}
addEventListener('pointermove', e => {
  if (!fanDrag) return;
  const s = stage._s || 1, [tx, ty, len] = arcStep(fanDrag.p);
  const dist = ((e.clientX - fanDrag.x) * tx + (e.clientY - fanDrag.y) * ty) / s;
  if (Math.abs(dist) > 6) fanDrag.moved = true;
  fanPhase = fanDrag.phase0 + dist / len;
  const now = performance.now(), dt = Math.max(1, now - fanDrag.lt);
  const step = (((e.clientX - fanDrag.lx) * tx + (e.clientY - fanDrag.ly) * ty) / s) / len;
  fanVel = fanVel * 0.6 + (step / dt) * 0.4;
  fanDrag.lx = e.clientX; fanDrag.ly = e.clientY; fanDrag.lt = now;
  placeFan();
});
addEventListener('pointerup', () => {
  if (!fanDrag) return;
  if (fanDrag.moved) fanDragEnd = performance.now(); else fanVel = 0;
  if (performance.now() - fanDrag.lt > 80) fanVel = 0; // held still before letting go
  fanDrag = null; fan.classList.remove('dragging');
});

function tick(t){
  const dt = Math.min(64, t - (lastT || t)); lastT = t;
  if ($('#pHome').classList.contains('on') && !document.hidden && !fanDrag){
    if (Math.abs(fanVel) > 0.00002){ fanPhase += fanVel * dt; fanVel *= Math.pow(0.94, dt / 16); placeFan(); }
    else if (!fanPaused){ fanVel = 0; fanPhase += dt / 4200; placeFan(); }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
Store.onChange(list => buildFan(list));

$('#btnIntro').addEventListener('click', openIntro);
$('#btnParent').addEventListener('click', () => startWrite('p'));
$('#btnGuest').addEventListener('click', () => startWrite('r'));
function goHome(){ show('pHome'); }

/* ================= WRITE ================= */
const fTo = $('#fTo'), fBody = $('#fBody'), fFrom = $('#fFrom');
function buildOptions(){
  const eo = $('#envOpts'), po = $('#paperOpts'); eo.innerHTML = po.innerHTML = '';
  [321, 506, 690].forEach((x, c) => {
    const o = el('div', 'opt'); o.style.left = (x - 10) + 'px'; o.style.top = '309px'; o.style.width = '191px';
    o.innerHTML = `<div class="thumb" style="width:171px;height:99px"><img src="${URI.env[c]}" alt=""></div><div class="olabel" style="margin-top:20px">${CNAMES[c]}</div><div class="radio" style="margin-top:16px"></div>`;
    o.addEventListener('click', () => { L.env = c; syncOpts(); });
    eo.appendChild(o);
  });
  [324, 508, 692].forEach((x, c) => {
    const o = el('div', 'opt'); o.style.left = (x - 10) + 'px'; o.style.top = '660px'; o.style.width = '187px';
    o.innerHTML = `<div class="thumb" style="width:167px;height:193px"><img src="${URI.paper[c]}" alt=""></div><div class="olabel" style="margin-top:18px">${CNAMES[c]}</div><div class="radio" style="margin-top:16px"></div>`;
    o.addEventListener('click', () => { L.paper = c; syncOpts(); });
    po.appendChild(o);
  });
}
function syncOpts(){
  [...$('#envOpts').children].forEach((o, i) => o.classList.toggle('sel', L.env === i));
  [...$('#paperOpts').children].forEach((o, i) => o.classList.toggle('sel', L.paper === i));
}
buildOptions();

function startWrite(m){
  newLetter(m);
  $('#wTitle').textContent = m === 'p' ? '부모님께 편지 작성하기' : OWNER + '의 방명록';
  $('#wSub').textContent = m === 'p' ? '부모님께 편지쓰고 큐알로 저장해서 마음을 전하세요!' : '준비하느라 힘들었습니다... 고생한 ' + OWNER + '을 위해 한마디 적어주세요 =3';
  fTo.value = L.to; fTo.readOnly = m === 'r';
  fTo.placeholder = '예) 엄마, 아빠, 부모님';
  fBody.value = ''; fBody.placeholder = m === 'p' ? '부모님께 전하고 싶은 마음을 자유롭게 적어보세요.' : OWNER + '을 위한 글을 자유롭게 적어보세요.';
  fFrom.value = '';
  $('#camBtn').style.display = '';
  setPhoto(null);
  updateCount(); syncOpts(); $('#wErr').classList.remove('show');
  show('pWrite');
  setTimeout(() => (m === 'r' ? fBody : fTo).focus({ preventScroll: true }), 50);
}
function updateCount(){ $('#fCount').textContent = fBody.value.length + '/200자'; }
fBody.addEventListener('input', updateCount);

/* photo (guestbook only) */
$('#camBtn').addEventListener('click', openCamera);
let camStream = null, camShot = null;
async function openCamera(){
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return $('#photoInput').click();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' }, audio: false });
  } catch(e){
    toast('카메라를 쓸 수 없어서 사진 파일을 골라 주세요.');
    return $('#photoInput').click();
  }
  const v = $('#camVideo'); v.srcObject = camStream; await v.play().catch(() => {});
  camShot = null; camState('live'); modal('camModal');
}
function closeCamera(){
  if (camStream){ camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  modal('camModal', false);
}
function camState(s){
  $('#camModal').dataset.state = s;
  $('#camCount').textContent = '';
}
$('#camShoot').addEventListener('click', async () => {
  if ($('#camModal').dataset.state !== 'live') return;
  camState('count');
  for (const n of [3, 2, 1]){ $('#camCount').textContent = n; await new Promise(r => setTimeout(r, 750)); }
  $('#camCount').textContent = '';
  const v = $('#camVideo'), c = document.createElement('canvas');
  const max = 720, s = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
  c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
  const g = c.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); // keep the mirror view the person saw
  g.drawImage(v, 0, 0, c.width, c.height);
  camShot = c.toDataURL('image/jpeg', 0.72);
  if (camShot.length > 180000) camShot = c.toDataURL('image/jpeg', 0.5);
  $('#camPhoto').src = camShot; camState('shot');
  const f = $('#camFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
});
$('#camRetake').addEventListener('click', () => { camShot = null; camState('live'); });
$('#camUse').addEventListener('click', () => { if (camShot) setPhoto(camShot); closeCamera(); });
$('#camFile').addEventListener('click', () => { closeCamera(); $('#photoInput').click(); });
$('#camClose').addEventListener('click', closeCamera);
$('#photoInput').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { setPhoto(await shrinkImage(f, 720, 0.72)); } catch(err){ toast('사진을 불러오지 못했어요.'); }
});
$('#photoDel').addEventListener('click', e => { e.stopPropagation(); setPhoto(null); });
function setPhoto(uri){
  if (L){ L.photo = uri; L.photoRef = null; }
  const p = $('#photoPrev'); p.style.display = uri ? 'block' : 'none'; if (uri) p.querySelector('img').src = uri;
  $('#camBtn').classList.toggle('has', !!uri);
}
function shrinkImage(file, max, q){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let out = c.toDataURL('image/jpeg', q);
      if (out.length > 180000) out = c.toDataURL('image/jpeg', 0.5);
      res(out);
    };
    img.onerror = rej; img.src = url;
  });
}

function writeErr(msg){ const e = $('#wErr'); e.textContent = msg; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 2600); }
$('#toDeco').addEventListener('click', () => {
  L.to = fTo.value.trim(); L.body = fBody.value.trim(); L.from = fFrom.value.trim();
  if (L.env == null) return writeErr('편지봉투를 골라주세요.');
  if (L.paper == null) return writeErr('편지지를 골라주세요.');
  if (!L.to) return writeErr('받는 사람을 적어주세요.');
  if (!L.body) return writeErr('편지 내용을 적어주세요.');
  if (!L.from) return writeErr('보내는 사람을 적어주세요.');
  startDeco();
});

/* ================= DECORATE ================= */
const decoEnv = $('#decoEnv');
let stickerColor = 0;
function startDeco(){
  $('#dSub').textContent = '아래의 영문 이니셜 스티커로 편지봉투를 꾸며보세요!' + (mode === 'r' ? ' 홈화면에 봉투만 공개 됩니다!' : '');
  $('#finish').textContent = mode === 'p' ? '편지 완성하고 큐알 받기' : '편지 완성하고 홈에 띄우기';
  selIdx = -1; renderDecoEnv(); buildSheet();
  show('pDeco');
}
let selIdx = -1;
const ROT_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>';
function renderDecoEnv(){
  decoEnv.innerHTML = '';
  if (selIdx >= L.stickers.length) selIdx = -1;
  const box = envelopeEl(L, { longDate: true }); decoEnv.appendChild(box);
  [...box.querySelectorAll('.stk')].forEach((s, i) => s.addEventListener('pointerdown', e => startMove(e, i)));
  if (selIdx >= 0){
    const st = L.stickers[selIdx], b = A.glyphBox[GLYPHS[st.g]];
    const f = el('div', 'selbox');
    f.style.left = (st.x * 100) + '%'; f.style.top = (st.y * 100) + '%';
    f.style.width = (12 * (st.s || 1)) + '%'; f.style.aspectRatio = b[2] + '/' + b[3];
    f.style.transform = `translate(-50%,-50%) rotate(${st.r || 0}deg)`;
    const h = el('button', 'h-rot', ROT_ICON); h.title = '돌리기 · 크기 조절';
    h.addEventListener('pointerdown', e => startTransform(e, selIdx));
    const x = el('button', 'h-del', '×'); x.title = '삭제';
    x.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); L.stickers.splice(selIdx, 1); selIdx = -1; renderDecoEnv(); });
    const mv = el('div', 'h-move'); mv.addEventListener('pointerdown', e => startMove(e, selIdx));
    f.append(mv, h, x); decoEnv.appendChild(f);
  }
}
// click on empty envelope area → deselect
decoEnv.addEventListener('pointerdown', e => { if (e.target.closest('.selbox, .stk')) return; if (selIdx >= 0){ selIdx = -1; renderDecoEnv(); } });
function startTransform(e, idx){
  e.preventDefault(); e.stopPropagation();
  const st = L.stickers[idx], r = decoEnv.getBoundingClientRect();
  const cx = r.left + st.x * r.width, cy = r.top + st.y * r.height;
  drag = { kind: 'xform', idx, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, r0: st.r || 0, s0: st.s || 1 };
}
// wheel over the selected sticker → resize
decoEnv.addEventListener('wheel', e => {
  if (selIdx < 0 || !e.target.closest('.selbox')) return;
  e.preventDefault();
  const st = L.stickers[selIdx]; st.s = Math.max(0.4, Math.min(3.5, (st.s || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
  renderDecoEnv();
}, { passive: false });
addEventListener('keydown', e => {
  if (!$('#pDeco').classList.contains('on') || selIdx < 0) return;
  if (e.key === 'Delete' || e.key === 'Backspace'){ if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; L.stickers.splice(selIdx, 1); selIdx = -1; renderDecoEnv(); }
});
function buildSheet(){
  const tabs = $('#tabs'); tabs.innerHTML = '';
  [1310.28, 1392.79, 1475.3].forEach((x, c) => {
    const t = el('div', 'tab' + (c === stickerColor ? ' on' : ''));
    t.style.left = (x + 100) + 'px'; t.style.top = (c === stickerColor ? 624 + 18 : 624 + 32) + 'px';
    const i = el('i'); i.style.background = COLORS[c]; t.appendChild(i);
    t.addEventListener('click', () => { stickerColor = c; buildSheet(); });
    tabs.appendChild(t);
  });
  const gl = $('#glyphs'); gl.innerHTML = '';
  GLYPHS.forEach((g, gi) => {
    const b = A.glyphBox[g];
    const d = el('div', 'glyph'); d.style.left = (b[0] + 100) + 'px'; d.style.top = (b[1] + 624) + 'px';
    d.style.width = b[2] + 'px'; d.style.height = b[3] + 'px';
    const im = el('img'); im.src = glyphURI(g, stickerColor); im.alt = g; im.draggable = false; d.appendChild(im);
    d.addEventListener('pointerdown', e => startNew(e, gi));
    gl.appendChild(d);
  });
}
$('#resetBtn').addEventListener('click', () => { L.stickers = []; selIdx = -1; renderDecoEnv(); });

/* drag & drop */
const ghost = $('#dragGhost');
let drag = null;
function stageToEnv(cx, cy){
  const r = decoEnv.getBoundingClientRect();
  return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height, inside: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom };
}
function showGhost(g, c, cx, cy){
  const r = decoEnv.getBoundingClientRect();
  ghost.style.width = (r.width * 0.12) + 'px';
  ghost.querySelector('img').src = glyphURI(GLYPHS[g], c);
  ghost.style.left = cx + 'px'; ghost.style.top = cy + 'px'; ghost.style.display = 'block';
}
function startNew(e, gi){
  e.preventDefault();
  drag = { kind: 'new', g: gi, c: stickerColor, sx: e.clientX, sy: e.clientY, moved: false };
  showGhost(gi, stickerColor, e.clientX, e.clientY);
}
function startMove(e, idx){
  e.preventDefault(); e.stopPropagation();
  const s = L.stickers[idx];
  if (selIdx !== idx){ selIdx = idx; renderDecoEnv(); }
  drag = { kind: 'move', idx, g: s.g, c: s.c, sx: e.clientX, sy: e.clientY, moved: false };
}
addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.kind === 'xform'){
    const st = L.stickers[drag.idx];
    const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx), d = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
    st.r = Math.round(drag.r0 + (a - drag.a0) * 180 / Math.PI);
    if (Math.abs(((st.r % 90) + 90) % 90) < 4 || Math.abs(((st.r % 90) + 90) % 90) > 86) st.r = Math.round(st.r / 90) * 90; // snap to straight
    st.s = Math.max(0.4, Math.min(3.5, drag.s0 * d / drag.d0));
    renderDecoEnv(); return;
  }
  if (drag.kind === 'move'){
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const p = stageToEnv(e.clientX, e.clientY), st = L.stickers[drag.idx];
    st.x = p.x; st.y = p.y;
    const el1 = decoEnv.querySelectorAll('.stk')[drag.idx], sb = decoEnv.querySelector('.selbox');
    [el1, sb].forEach(x => { if (x){ x.style.left = (p.x * 100) + '%'; x.style.top = (p.y * 100) + '%'; x.style.opacity = p.inside ? '' : '0.35'; } });
    return;
  }
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
  ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
});
addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; ghost.style.display = 'none';
  if (d.kind === 'xform'){ renderDecoEnv(); return; }
  const p = stageToEnv(e.clientX, e.clientY);
  const clamp = v => Math.max(0.05, Math.min(0.95, v));
  if (d.kind === 'new'){
    if (L.stickers.length >= MAX_STICKERS){ toast('스티커는 ' + MAX_STICKERS + '개까지 붙일 수 있어요.'); return; }
    if (!d.moved){ // tap → place at a free-ish random spot
      L.stickers.push({ g: d.g, c: d.c, x: 0.12 + Math.random() * 0.76, y: 0.18 + Math.random() * 0.56 });
    } else if (p.inside){
      L.stickers.push({ g: d.g, c: d.c, x: clamp(p.x), y: clamp(p.y) });
    } else return;
    selIdx = L.stickers.length - 1;
  } else if (d.kind === 'xform'){
    // keep as is
  } else {
    if (!d.moved){ renderDecoEnv(); return; }
    if (p.inside){ L.stickers[d.idx].x = clamp(p.x); L.stickers[d.idx].y = clamp(p.y); }
    else { L.stickers.splice(d.idx, 1); selIdx = -1; }  // dragged off the envelope → removed
  }
  renderDecoEnv();
});

$('#backWrite').addEventListener('click', () => show('pWrite'));
$('#finish').addEventListener('click', async () => {
  if (mode === 'p'){ await showQR(); }
  else { $('#pwInput').value = ''; $('#pwErr').classList.remove('show'); modal('pwModal'); setTimeout(() => $('#pwInput').focus(), 50); }
});

/* ================= QR ================= */
async function showQR(){
  const btn = $('#finish'); btn.disabled = true;
  try {
    if (L.photo && !L.photoRef){
      btn.textContent = '사진 올리는 중…';
      try { L.photoRef = await uploadLetterPhoto(L.photo); }
      catch(e){ console.error(e); toast('사진을 올리지 못해서 사진 없이 QR을 만들었어요. (인터넷 연결 확인)'); }
    }
    const code = await encodeLetter(L);
    let base = PUBLIC_URL || (location.href.split('#')[0]);
    const q = qrcode(0, 'L');
    q.addData(base + '#', 'Byte');
    q.addData(code, 'Alphanumeric');
    q.make();
    $('#qrBox').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    $('#gbBtn').dataset.step = '0';
    modal('qrModal');
  } catch(e){
    console.error(e); toast('QR을 만들지 못했어요. 편지 내용을 조금 줄여 주세요.');
  } finally { btn.disabled = false; btn.textContent = mode === 'p' ? '편지 완성하고 큐알 받기' : '편지 완성하고 홈에 띄우기'; }
}
$('#gbBtn').addEventListener('click', () => startWrite('r'));
// '홈으로 돌아가기'를 누를 때마다 방명록 버튼이 한 단계씩 커지고, 최대 크기에서 한 번 더 누르면 홈으로
$('#homeBtn2').addEventListener('click', () => {
  const g = $('#gbBtn'), step = +(g.dataset.step || 0);
  if (step < 3) g.dataset.step = String(step + 1);
  else goHome();
});

/* ================= GUESTBOOK SAVE ================= */
let saving = false;
async function savePw(){
  if (saving) return;
  const pw = $('#pwInput').value.trim();
  const err = $('#pwErr');
  if (pw.length < 4){ err.textContent = '암호는 4자 이상으로 정해주세요.'; err.classList.add('show'); return; }
  saving = true; $('#pwSave').textContent = '저장하는 중…';
  try {
    const entry = {
      id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      env: L.env, from: L.from, date: L.date,
      stickers: L.stickers.map(s => ({ g: s.g, c: s.c, x: +s.x.toFixed(3), y: +s.y.toFixed(3), r: Math.round(s.r || 0), s: +(s.s || 1).toFixed(2) })),
      createdAt: Date.now()
    };
    entry.enc = await sealSecret({ to: L.to, body: L.body, paper: L.paper, photo: L.photo || null }, pw);
    await Store.add(entry);
    fanPhase = EXT;
    goHome();
    toast('방명록이 홈에 걸렸어요!');
  } catch(e){ console.error(e); err.textContent = '저장하지 못했어요. 다시 눌러 주세요.'; err.classList.add('show'); }
  finally { saving = false; $('#pwSave').textContent = '암호 저장 후 홈으로 돌아가기'; }
}
$('#pwSave').addEventListener('click', savePw);
$('#pwInput').addEventListener('keydown', e => { if (e.key === 'Enter') savePw(); });
$('#pwClose').addEventListener('click', () => modal('pwModal', false));

/* ================= GUESTBOOK READ ================= */
let unlockTarget = null;
function askUnlock(entry){
  unlockTarget = entry;
  $('#ulInput').value = ''; $('#ulErr').classList.remove('show');
  $('#ulNote').innerHTML = escapeHTML(shortDate(entry.date)) + ' · from. ' + escapeHTML(entry.from) + '<br><span style="font-size:20px;opacity:.75">편지를 쓴 사람의 암호 또는 마스터 비밀번호로 열 수 있어요.</span>';
  modal('unlockModal'); setTimeout(() => $('#ulInput').focus(), 50);
}
async function tryUnlock(){
  const pw = $('#ulInput').value; if (!pw) return;
  $('#ulGo').textContent = '여는 중…';
  const res = unlockTarget.enc ? await openSecret(unlockTarget.enc, pw) : null;
  $('#ulGo').textContent = '편지 열어보기';
  if (!res){ const e = $('#ulErr'); e.textContent = '암호가 맞지 않아요.'; e.classList.add('show'); return; }
  modal('unlockModal', false);
  openRead(Object.assign({}, unlockTarget, res.secret), res.master ? pw : null);
}
$('#ulGo').addEventListener('click', tryUnlock);
$('#ulInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
$('#ulClose').addEventListener('click', () => modal('unlockModal', false));
function armDelete(btn, id, masterPw, after){
  btn.dataset.armed = ''; btn.textContent = '이 방명록 삭제';
  btn.onclick = async () => {
    if (btn.dataset.armed !== '1'){ btn.dataset.armed = '1'; btn.textContent = '한 번 더 누르면 삭제돼요'; return; }
    btn.textContent = '삭제하는 중…';
    try { await Store.remove(id, masterPw); toast('삭제했어요.'); after && after(); }
    catch(e){ console.error(e); toast('삭제하지 못했어요. 관리자 계정 설정을 확인해 주세요.'); btn.dataset.armed = ''; btn.textContent = '이 방명록 삭제'; }
  };
}
function openRead(entry, masterPw){
  modal('readModal');
  paperEl($('#readPaper'), entry);
  const ph = $('#readPhoto'); if (entry.photo){ ph.src = entry.photo; ph.style.display = 'block'; } else ph.style.display = 'none';
  const del = $('#readDel'); del.style.display = masterPw ? 'block' : 'none';
  if (masterPw) armDelete(del, entry.id, masterPw, () => modal('readModal', false));
}
$('#readClose').addEventListener('click', () => modal('readModal', false));

/* 관리자: Cmd/Ctrl + Shift + B → 마스터 암호 → 전체 편지 보기 / 백업 */
let adminPriv = null, adminPw = null;
addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'B' || e.key === 'b')){
    e.preventDefault(); openAdmin();
  }
});
function openAdmin(){
  adminPriv = null; adminPw = null;
  $('#adInput').value = ''; $('#adErr').classList.remove('show'); $('#adStage').dataset.unlocked = '';
  $('#adCount').textContent = Store.all.length;
  modal('adminModal'); setTimeout(() => $('#adInput').focus(), 50);
}
async function adminUnlock(){
  const pw = $('#adInput').value;
  try { adminPriv = await masterPriv(pw); adminPw = pw; }
  catch(e){ const er = $('#adErr'); er.textContent = '마스터 암호가 아니에요.'; er.classList.add('show'); return; }
  $('#adStage').dataset.unlocked = '1'; $('#adCount').textContent = Store.all.length;
}
$('#adGo').addEventListener('click', adminUnlock);
$('#adInput').addEventListener('keydown', e => { if (e.key === 'Enter') adminUnlock(); });
$('#adClose').addEventListener('click', () => { adminPriv = null; adminPw = null; modal('adminModal', false); });
async function decryptAll(){
  const out = [];
  for (const x of Store.all){ try { out.push(Object.assign({}, x, await openAsMaster(x.enc, adminPriv))); } catch(e){} }
  return out;
}
$('#adExport').addEventListener('click', async () => {
  if (!adminPriv) return;
  const all = (await decryptAll()).map(x => { const c = Object.assign({}, x); delete c.enc; return c; });
  const blob = new Blob([JSON.stringify({ app: 'hyodoer-guestbook', exportedAt: new Date().toISOString(), entries: all }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'hyodoer-방명록-' + today().replace(/\./g, '') + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('백업 파일을 저장했어요. (암호가 풀린 원문이라 잘 보관하세요)');
});
$('#adAll').addEventListener('click', async () => {
  if (!adminPriv) return;
  const grid = $('#allGrid'); grid.innerHTML = '<div class="all-empty">편지를 여는 중…</div>';
  modal('adminModal', false); modal('allModal');
  const all = await decryptAll();
  grid.innerHTML = all.length ? '' : '<div class="all-empty">아직 방명록이 없어요.</div>';
  $('#allCount').textContent = all.length;
  all.forEach(x => {
    const card = el('div', 'all-card');
    const p = el('div'); card.appendChild(p);
    if (x.photo){ const im = el('img', 'all-photo'); im.src = x.photo; card.appendChild(im); }
    const meta = el('div', 'all-meta', escapeHTML(x.date) + ' · from. ' + escapeHTML(x.from));
    const del = el('button', 'all-del'); meta.appendChild(del); card.appendChild(meta);
    armDelete(del, x.id, adminPw, () => card.remove());
    grid.appendChild(card); paperEl(p, x);
  });
});
$('#allClose').addEventListener('click', () => { modal('allModal', false); adminPriv = null; adminPw = null; });
addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal.on').forEach(m => { if (m.id !== 'qrModal') m.classList.remove('on'); }); });

/* ================= MOBILE VIEW (opened from the QR) ================= */
async function route(){
  const h = location.hash.slice(1);
  if (h && h[0] === 'L' && h.length > 8){
    try {
      const letter = await decodeLetter(h);
      $('#viewport').style.display = 'none'; $('#mobile').style.display = 'block';
      document.body.style.overflow = 'auto';
      $('#mTitle').innerHTML = escapeHTML(letter.from) + '의 편지가<br>도착했어요';
      $('#mSub').textContent = 'To. ' + letter.to + ' · ' + letter.date;
      const env = $('#mEnv'); env.innerHTML = ''; env.appendChild(envelopeEl(letter));
      const open = () => {
        env.style.transform = 'translateY(-20px) scale(.9)'; env.style.opacity = '.0';
        setTimeout(() => { env.style.display = 'none'; $('#mOpen').style.display = 'none';
          const p = $('#mPaper'); p.style.display = 'block'; paperEl(p, letter);
          if (letter.photoRef){
            const ph = $('#mPhoto'); ph.style.display = 'block'; ph.classList.add('loading');
            fetchLetterPhoto(letter.photoRef).then(src => { ph.src = src; ph.classList.remove('loading'); })
              .catch(() => { ph.style.display = 'none'; $('#mTip').insertAdjacentHTML('afterbegin', '사진을 불러오지 못했어요. 잠시 후 다시 열어 주세요.<br><br>'); });
          }
          $('#mTip').innerHTML = '편지를 길게 눌러 캡처하거나<br>이 페이지를 즐겨찾기에 저장해 두세요 :)'; }, 450);
      };
      env.onclick = open; $('#mOpen').onclick = open;
      return;
    } catch(e){ console.error(e); }
  }
  if (VIEWER_ONLY){ // no letter in the address → simple landing
    $('#viewport').style.display = 'none'; $('#mobile').style.display = 'block'; document.body.style.overflow = 'auto';
    $('#mTitle').innerHTML = '효도어 편지함';
    $('#mSub').textContent = '전시장에서 받은 QR을 찍으면 이곳에서 편지가 열려요.';
    $('#mEnv').innerHTML = ''; $('#mEnv').appendChild(envelopeEl({ env: 0, stickers: [] }, { blank: true }));
    $('#mOpen').style.display = 'none';
    return;
  }
  $('#mobile').style.display = 'none'; $('#viewport').style.display = '';
}
addEventListener('hashchange', route);
addEventListener('resize', () => { const p = $('#mPaper'); if (p.style.display === 'block') fitText(p.querySelector('.body')); });

route();
if (!VIEWER_ONLY) Store.init();
})();
