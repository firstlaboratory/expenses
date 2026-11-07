import { FIREBASE_CONFIG } from './firebase-config.js';

// ================= constants & helpers =================
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const LKEY = 'kharcha_v1';
const MODES = ['UPI', 'Card', 'Cash', 'Bank'];
const DEFAULT_CATS = [['Food','🍛','#e8833a'],['Groceries','🛒','#43a047'],['Transport','⛽','#1e88e5'],['Shopping','🛍️','#8e24aa'],['Bills','💡','#fb8c00'],['Rent','🏠','#6d4c41'],['Health','💊','#e53935'],['Entertainment','🎬','#00acc1'],['Travel','✈️','#3949ab'],['Stay','🏨','#5e35b1'],['Education','📚','#546e7a'],['Gifts','🎁','#d81b60'],['Investments','📈','#00897b'],['Other','📦','#9e9e9e']];
const KEYWORDS = [['Food',/swiggy|zomato|restaurant|cafe|bakery|food|dominos|kfc|mcdonald|starbucks|biryani|mess\b/],['Groceries',/bigbasket|blinkit|zepto|dmart|grocer|supermarket|instamart|more retail|reliance fresh|jiomart|vegetable/],['Transport',/uber|\bola\b|rapido|petrol|fuel|hpcl|bpcl|iocl|indian oil|shell|fastag|metro|irctc|redbus|parking|toll/],['Shopping',/amazon|flipkart|myntra|ajio|meesho|nykaa|croma|decathlon/],['Bills',/electricity|tneb|tangedco|airtel|\bjio\b|vodafone|bsnl|recharge|broadband|\bgas\b|bill|dth/],['Health',/pharm|apollo|medic|hospital|clinic|\blab\b|diagnos|1mg|netmeds/],['Entertainment',/netflix|hotstar|prime video|spotify|bookmyshow|pvr|inox|youtube/],['Stay',/oyo|hotel|resort|airbnb|homestay|lodge|treebo|fabhotel/],['Travel',/makemytrip|goibibo|indigo|air india|vistara|akasa|booking\.com|cleartrip|ixigo/],['Education',/udemy|coursera|school|college|tuition|books/],['Rent',/\brent\b|nobroker/]];
const DEFAULT_INC = [['Salary','💼','#2e7d32'],['Interest','🏦','#00897b'],['Refund','↩️','#5c6bc0'],['Cashback','🎉','#f9a825'],['Gift received','🎁','#ec407a'],['Other income','💰','#7cb342']];
const INC_KEYWORDS = [['Salary',/salary|\bsal\b|payroll|wages/],['Interest',/int\.? ?pd|interest|int\.? ?coll/],['Refund',/refund|reversal|\brev\b|rfnd/],['Cashback',/cashback|cash back|reward/]];
const OWN_IN_RE = /self transfer|own account|sweep|fd clos|fd prem|redemption|mutual fund|zerodha|groww|upstox|kuvera|indmoney/i;
const INVEST_RE = /us market|us stocks?|vested|nasdaq|invest|\bsip\b|mutual ?fund|\bmf\b|stocks?\b|equity|zerodha|groww|upstox|kuvera|indmoney|paytm money|\bnps\b|\bppf\b|\bfd\b|\brd\b|fixed deposit|recurring deposit|\bsgb\b/i;
const INSTR = [['US stocks','🇺🇸','#1565c0',/us market|us stocks?|us shares?|us equit|vested|nasdaq|nyse|s&p ?500|international|global fund/i],['Mutual funds / SIP','🪙','#00897b',/\bsip\b|mutual ?fund|\bmf\b|kuvera|paytm money|coin by/i],['Indian stocks','📊','#3949ab',/indian stocks?|indian market|\bnse\b|\bbse\b|nifty|sensex|zerodha|groww|upstox|indmoney|angel|stocks?\b|equity|shares?\b/i],['FD / RD','🏦','#8d6e63',/\bfd\b|\brd\b|fixed deposit|recurring deposit/i],['PPF / NPS','🛡️','#8e24aa',/\bppf\b|\bnps\b/i],['Gold bonds','🥇','#f9a825',/\bsgb\b|gold bond/i]].map(([name, icon, color, re]) => ({ name, icon, color, re }));
const INSTR_OTHER = { name: 'Other investments', icon: '📈', color: '#26a69a' };
const instrOf = e => (INSTR.find(i => i.re.test(e.note) || i.re.test(e.cat)) || INSTR_OTHER).name;
const OWE_OUT = 'Paid for friend', OWE_IN = 'Friend paid back';   // money fronted for friends: not my spend / income
const isFriend = e => e.cat === OWE_OUT || e.cat === OWE_IN;
// A split expense counts only my share as spending; each friend's share is treated as "paid for friend".
const hasSplit = e => !isInc(e) && !e.trip && Array.isArray(e.split) && e.split.length > 0;
const myShare = e => hasSplit(e) ? r2(e.amount - e.split.reduce((t, s) => t + s.amount, 0)) : e.amount;
function expand(list) {
  const out = [];
  list.forEach(e => {
    if (!hasSplit(e) || isFriend(e)) { out.push(e); return; }
    const m = myShare(e); if (m > 0) out.push({ ...e, amount: m, _mine: true });
    e.split.forEach(sp => out.push({ ...e, amount: sp.amount, cat: OWE_OUT, who: sp.who, _share: true }));
  });
  return out;
}
const own = () => expand(S.expenses);
const TRANSFER_RE = /credit ?card|cc ?(bill|pay)|^cc\s|\bcc\b.*autopay|si-tad|cred club|\bcred\b|card ?payment|self transfer|own account/i;

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const money = v => inr.format(Math.round(v * 100) / 100);
const short = v => v >= 1e5 ? '₹' + (v / 1e5).toFixed(v >= 1e6 ? 0 : 1) + 'L' : v >= 1e3 ? '₹' + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : '₹' + Math.round(v);
const r2 = v => Math.round(v * 100) / 100;
const sum = a => a.reduce((t, e) => t + e.amount, 0);
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const mk = d => d.slice(0, 7);
function shiftMonth(m, k) { let [y, mo] = m.split('-').map(Number); mo += k; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return y + '-' + pad(mo); }
function monthLabel(m, s) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', s ? { month: 'short' } : { month: 'long', year: 'numeric' }); }
function niceDate(d) { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function dayLabel(d) { if (d === today()) return 'Today'; const y = new Date(); y.setDate(y.getDate() - 1); if (d === ymd(y)) return 'Yesterday'; const [yy, m, dd] = d.split('-').map(Number); return new Date(yy, m - 1, dd).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
let tt; function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), ms); }

// ================= state =================
const blankMeta = () => ({ categories: DEFAULT_CATS.map(([name, icon, color]) => ({ name, icon, color, budget: 0 })), incCats: DEFAULT_INC.map(([name, icon, color]) => ({ name, icon, color })), people: ['Me'], rules: [], lastPerson: 'Me', name: '' });
let S = { ...blankMeta(), expenses: [], trips: [] };
let TE = {};                       // tripId -> [expenses]
let user = null, fb = null, cloud = false, authKnown = false, pending = 0;
let unsubs = [], tripUnsubs = {}, migrated = false;
let month = mk(today()), view = 'add', curTrip = null;
let selCat = 'Food', selInc = 'Salary', selType = 'out', selMode = 'UPI', edit = null; // edit = {id, trip}

// Accepts any saved shape (v1 with category ids, v3, cloud docs) and returns names-based data.
function normalize(b) {
  const out = { ...blankMeta(), expenses: [], trips: [], tripExp: {} };
  if (!b || typeof b !== 'object') return out;
  const idMap = {};
  if (Array.isArray(b.categories) && b.categories.length) out.categories = b.categories.filter(c => c && c.name).map(c => { const n = String(c.name).slice(0, 24); if (c.id) idMap[c.id] = n; return { name: n, icon: c.icon || '🏷️', color: c.color || '#9e9e9e', budget: +c.budget || 0 }; });
  if (Array.isArray(b.incCats) && b.incCats.length) out.incCats = b.incCats.filter(c => c && c.name).map(c => ({ name: String(c.name).slice(0, 24), icon: c.icon || '💰', color: c.color || '#7cb342' }));
  const cn = c => idMap[c] || c || 'Other';
  if (Array.isArray(b.people) && b.people.length) out.people = b.people.map(String);
  if (b.lastPerson) out.lastPerson = String(b.lastPerson);
  if (b.name) out.name = String(b.name);
  if (!out.categories.some(c => INVEST_RE.test(c.name))) { const i = out.categories.findIndex(c => c.name === 'Other'); out.categories.splice(i < 0 ? out.categories.length : i, 0, { name: 'Investments', icon: '📈', color: '#00897b', budget: 0 }); }
  if (!out.categories.some(c => c.name === OWE_OUT)) { const i = out.categories.findIndex(c => c.name === 'Other'); out.categories.splice(i < 0 ? out.categories.length : i, 0, { name: OWE_OUT, icon: '🤝', color: '#8d6e63', budget: 0 }); }
  if (!out.incCats.some(c => c.name === OWE_IN)) out.incCats.push({ name: OWE_IN, icon: '🔁', color: '#8d6e63' });
  out.rules = (Array.isArray(b.rules) ? b.rules : []).filter(r => r && r.k).map(r => ({ k: String(r.k), cat: cn(r.cat) }));
  const splitOf_ = e => Array.isArray(e.split) && e.split.length ? { split: e.split.filter(x => x && x.who && +x.amount > 0).map(x => ({ who: String(x.who), amount: r2(+x.amount), ...(+x.shares ? { shares: +x.shares } : {}) })), splitBy: e.splitBy === 'amount' ? 'amount' : 'shares', meShares: +e.meShares >= 0 ? +e.meShares : 1 } : {};
  const splitOf = splitOf_;
  const fixE = e => ({ id: String(e.id || uid()), ts: +e.ts || Date.now(), date: String(e.date), amount: r2(+e.amount), cat: cn(e.cat), mode: MODES.includes(e.mode) ? e.mode : 'UPI', person: String(e.person || 'Me'), note: String(e.note || ''), ...(e.type === 'in' ? { type: 'in' } : {}), ...(e.who ? { who: String(e.who) } : {}), ...splitOf(e) });
  const ok = e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && +e.amount > 0;
  out.expenses = (b.expenses || []).filter(ok).map(fixE);
  (b.trips || []).forEach(t => {
    if (!t) return;
    const id = String(t.id || uid());
    out.trips.push({ id, name: String(t.name || 'Trip'), start: t.start || '', end: t.end || '', budget: +t.budget || 0, members: Array.isArray(t.members) && t.members.length ? t.members.map(String) : ['Me'] });
    const list = (b.tripExp && b.tripExp[t.id]) || t.expenses || [];
    out.tripExp[id] = list.filter(ok).map(e => ({ ...fixE(e), trip: id }));
  });
  return out;
}
function loadLocal() { try { const raw = localStorage.getItem(LKEY); return raw ? normalize(JSON.parse(raw)) : null; } catch (e) { return null; } }
const metaOf = o => ({ categories: o.categories, incCats: o.incCats, people: o.people, rules: o.rules, lastPerson: o.lastPerson, name: o.name || '' });
function saveLocal() { if (cloud) return; try { localStorage.setItem(LKEY, JSON.stringify({ v: 3, ...metaOf(S), expenses: S.expenses, trips: S.trips, tripExp: TE })); } catch (e) { toast('Could not save — storage may be full'); } }
function useLocal() { const L = loadLocal() || normalize(null); TE = L.tripExp; delete L.tripExp; S = L; }

const cat = n => S.categories.find(c => c.name === n) || S.incCats.find(c => c.name === n) || [...INSTR, INSTR_OTHER].find(c => c.name === n) || { name: n || 'Other', icon: '🏷️', color: '#9e9e9e', budget: 0 };
const trip = id => S.trips.find(t => t.id === id);
const tripByName = n => S.trips.find(t => t.name.toLowerCase() === String(n).trim().toLowerCase());
const tripExp = id => TE[id] || [];
const allExp = () => S.expenses.concat(...Object.values(TE));
const isInc = e => e.type === 'in';
const inMonth = m => own().filter(e => mk(e.date) === m && !isInc(e) && !isFriend(e));          // spending only
const incMonth = m => own().filter(e => mk(e.date) === m && isInc(e) && !isFriend(e));          // income only
const isRefund = e => isInc(e) && /refund|cashback/i.test(e.cat);
const findExp = (id, t) => (t ? tripExp(t) : S.expenses).find(e => e.id === id);
const meIn = t => (t && t.names && user && t.names[user.uid]) || myName();
const myName = () => S.name || (user && (user.displayName || (user.email || '').split('@')[0])) || S.people[0] || 'Me';
const sig = e => e.date + '|' + e.amount + '|' + (e.note || '').toLowerCase();
function ensureIncCat(n) { n = String(n || 'Other income').trim().slice(0, 24) || 'Other income'; if (!S.incCats.some(c => c.name.toLowerCase() === n.toLowerCase())) { S.incCats.push({ name: n, icon: '💰', color: '#7cb342' }); return true; } return false; }
function ensureCat(n) { n = String(n || 'Other').trim().slice(0, 24) || 'Other'; if (!S.categories.some(c => c.name.toLowerCase() === n.toLowerCase())) { S.categories.push({ name: n, icon: '🏷️', color: '#9e9e9e', budget: 0 }); return true; } return false; }
const catName = n => ([...S.categories, ...S.incCats].find(c => c.name.toLowerCase() === String(n).trim().toLowerCase()) || {}).name || String(n).trim();

// ================= data writes (local or cloud) =================
function track(p) { pending++; schedule(); return p.catch(fail).finally(() => { pending--; schedule(); }); }
function fail(err) { console.error(err); const c = err && err.code || ''; toast(/permission/.test(c) ? 'Not allowed — check Firestore rules' : 'Sync error: ' + (c || err.message), 4500); }
function strip(e) { const o = { date: e.date, amount: e.amount, cat: e.cat, mode: e.mode, person: e.person, note: e.note || '', ts: e.ts || Date.now() }; if (isInc(e)) o.type = 'in'; if (e.who) o.who = e.who; if (hasSplit(e)) { o.split = e.split; o.splitBy = e.splitBy || 'shares'; o.meShares = e.meShares ?? 1; } if (e.trip) o.trip = e.trip; if (cloud) o.by = user.uid; return o; }
function eRef(e) { const F = fb.F; return e.trip ? F.doc(fb.db, 'trips', e.trip, 'expenses', e.id) : F.doc(fb.db, 'users', user.uid, 'expenses', e.id); }
function collOf(e) { if (!e.trip) return S.expenses; return TE[e.trip] || (TE[e.trip] = []); }
function localPut(e) { const c = collOf(e), i = c.findIndex(x => x.id === e.id); if (i >= 0) c[i] = e; else c.push(e); }
function localDel(e) { const c = collOf(e), i = c.findIndex(x => x.id === e.id); if (i >= 0) c.splice(i, 1); }
function putExp(e) { localPut(e); if (cloud) track(fb.F.setDoc(eRef(e), strip(e))); else saveLocal(); schedule(); }
function delExp(e) { localDel(e); if (cloud) track(fb.F.deleteDoc(eRef(e))); else saveLocal(); schedule(); }
function putMany(list, del = false) {
  list.forEach(del ? localDel : localPut);
  if (cloud) { for (let i = 0; i < list.length; i += 400) { const b = fb.F.writeBatch(fb.db); list.slice(i, i + 400).forEach(e => del ? b.delete(eRef(e)) : b.set(eRef(e), strip(e))); track(b.commit()); } }
  else saveLocal();
  schedule();
}
function saveMeta() { if (cloud) track(fb.F.setDoc(fb.F.doc(fb.db, 'users', user.uid), metaOf(S), { merge: true })); else saveLocal(); schedule(); }
function newTripId() { return cloud ? fb.F.doc(fb.F.collection(fb.db, 'trips')).id : uid(); }
function putTrip(t, isNew) {
  const i = S.trips.findIndex(x => x.id === t.id); if (i >= 0) S.trips[i] = { ...S.trips[i], ...t }; else S.trips.push(t);
  if (!TE[t.id]) TE[t.id] = [];
  if (cloud) {
    const ref = fb.F.doc(fb.db, 'trips', t.id), d = { name: t.name, start: t.start || '', end: t.end || '', budget: +t.budget || 0, members: t.members };
    if (isNew) { const full = { ...d, owner: user.uid, memberUids: [user.uid], names: { [user.uid]: myName() }, created: Date.now() }; Object.assign(S.trips.find(x => x.id === t.id), full); track(fb.F.setDoc(ref, full)); }
    else track(fb.F.updateDoc(ref, d));
  } else saveLocal();
  schedule();
}
async function removeTrip(t) {
  if (cloud) {
    const F = fb.F, ref = F.doc(fb.db, 'trips', t.id);
    if (t.owner && t.owner !== user.uid) { track(F.updateDoc(ref, { memberUids: F.arrayRemove(user.uid) })); }
    else {
      try { const qs = await F.getDocs(F.collection(fb.db, 'trips', t.id, 'expenses')); for (let i = 0; i < qs.docs.length; i += 400) { const b = F.writeBatch(fb.db); qs.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); } await F.deleteDoc(ref); }
      catch (e) { return fail(e); }
    }
  }
  S.trips = S.trips.filter(x => x.id !== t.id); delete TE[t.id]; saveLocal(); curTrip = null; schedule();
}

// ================= Firebase =================
const configured = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);
async function initFirebase() {
  if (!configured) { authKnown = true; return; }
  try {
    const [appM, A, F] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    const auth = A.getAuth(app);
    let db; try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); } catch (e) { db = F.getFirestore(app); }
    if (window.__TRICKLE_EMU) { A.connectAuthEmulator(auth, window.__TRICKLE_EMU.auth, { disableWarnings: true }); F.connectFirestoreEmulator(db, ...window.__TRICKLE_EMU.fs); }
    fb = { A, F, auth, db };
    A.getRedirectResult(auth).catch(e => toast(authMsg(e), 4500));
    A.onAuthStateChanged(auth, onUser);
  } catch (e) { console.error(e); authKnown = true; toast('Offline — sign-in unavailable, using this phone', 4000); schedule(); }
}
function stopCloud() { unsubs.forEach(u => u()); unsubs = []; Object.values(tripUnsubs).forEach(u => u()); tripUnsubs = {}; }
function onUser(u) {
  stopCloud(); user = u; migrated = false; authKnown = true;
  if (u) { cloud = true; S = { ...blankMeta(), people: [myName()], lastPerson: myName(), expenses: [], trips: [] }; TE = {}; startCloud(); }
  else { cloud = false; useLocal(); }
  handleJoin();
  schedule();
}
function startCloud() {
  const F = fb.F, db = fb.db, me = user.uid, metaRef = F.doc(db, 'users', me);
  unsubs.push(F.onSnapshot(metaRef, s => {
    if (s.exists()) { const m = normalize(s.data()); Object.assign(S, metaOf(m)); migrateLocal(false); }
    else if (!s.metadata.fromCache) { const L = loadLocal(); const m = L ? metaOf(L) : { ...blankMeta(), people: [myName()], lastPerson: myName() }; m.name = myName(); Object.assign(S, m); track(F.setDoc(metaRef, m)); migrateLocal(true); }
    schedule();
  }, fail));
  unsubs.push(F.onSnapshot(F.collection(db, 'users', me, 'expenses'), qs => { S.expenses = qs.docs.map(d => normalizeE(d)); schedule(); }, fail));
  unsubs.push(F.onSnapshot(F.query(F.collection(db, 'trips'), F.where('memberUids', 'array-contains', me)), qs => {
    S.trips = qs.docs.map(d => ({ ...d.data(), id: d.id, members: d.data().members || [] }));
    const ids = new Set(S.trips.map(t => t.id));
    for (const id in tripUnsubs) if (!ids.has(id)) { tripUnsubs[id](); delete tripUnsubs[id]; delete TE[id]; }
    ids.forEach(id => { if (!tripUnsubs[id]) tripUnsubs[id] = F.onSnapshot(F.collection(db, 'trips', id, 'expenses'), q2 => { TE[id] = q2.docs.map(d => ({ ...normalizeE(d), trip: id })); schedule(); }, () => {}); });
    schedule();
  }, fail));
}
function normalizeE(d) { const x = d.data(); return { id: d.id, ts: +x.ts || 0, date: x.date, amount: +x.amount, cat: x.cat || 'Other', mode: x.mode || 'UPI', person: x.person || '', note: x.note || '', by: x.by, ...(x.type === 'in' ? { type: 'in' } : {}), ...(x.who ? { who: x.who } : {}), ...(Array.isArray(x.split) && x.split.length ? { split: x.split, splitBy: x.splitBy || 'shares', meShares: x.meShares ?? 1 } : {}) }; }
function migrateLocal(fresh) {
  if (migrated) return; migrated = true;
  const L = loadLocal(); if (!L) return;
  const tripCount = L.trips.length, n = L.expenses.length + tripCount;
  if (!n) { localStorage.removeItem(LKEY); return; }
  if (!fresh && !confirm(`This phone has ${L.expenses.length} expenses and ${tripCount} trips saved before you signed in. Add them to your account?`)) return;
  if (!fresh) { L.categories.forEach(c => { if (!S.categories.some(x => x.name === c.name)) S.categories.push(c); }); L.incCats.forEach(c => { if (!S.incCats.some(x => x.name === c.name)) S.incCats.push(c); }); L.rules.forEach(r => { if (!S.rules.some(x => x.k === r.k)) S.rules.push(r); }); saveMeta(); }
  putMany(L.expenses);
  L.trips.forEach(t => { const id = newTripId(); putTrip({ ...t, id }, true); putMany((L.tripExp[t.id] || []).map(e => ({ ...e, trip: id }))); });
  try { localStorage.setItem(LKEY + '_backup', localStorage.getItem(LKEY)); localStorage.removeItem(LKEY); } catch (e) {}
  toast('This phone\'s data was added to your account', 3500);
}
function authMsg(e) {
  const c = (e && e.code) || '';
  return ({ 'auth/invalid-credential': 'Wrong email or password', 'auth/wrong-password': 'Wrong email or password', 'auth/user-not-found': 'No account with that email — tap Create account', 'auth/email-already-in-use': 'That email already has an account — tap Sign in', 'auth/weak-password': 'Password needs at least 6 characters', 'auth/invalid-email': 'That email doesn\'t look right', 'auth/unauthorized-domain': 'This site isn\'t in Firebase → Authentication → Authorized domains', 'auth/network-request-failed': 'No internet connection', 'auth/too-many-requests': 'Too many tries — wait a minute', 'auth/operation-not-allowed': 'Turn on this sign-in method in Firebase → Authentication' })[c] || ('Sign-in failed: ' + (c || e.message));
}
async function googleSignIn() {
  const p = new fb.A.GoogleAuthProvider();
  try { await fb.A.signInWithPopup(fb.auth, p); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) fb.A.signInWithRedirect(fb.auth, p);
    else if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) toast(authMsg(e), 4500);
  }
}

// ---- joining a shared trip via ?join=<tripId> ----
const joinId = new URLSearchParams(location.search).get('join');
let joinDone = false;
async function handleJoin() {
  if (!joinId || joinDone) return;
  if (!user) { go('settings'); toast('Sign in to join the trip', 4000); return; }
  joinDone = true;
  const F = fb.F, ref = F.doc(fb.db, 'trips', joinId);
  let s; try { s = await F.getDoc(ref); } catch (e) { return fail(e); }
  history.replaceState(null, '', location.pathname);
  if (!s.exists()) return toast('That trip no longer exists', 4000);
  const t = s.data();
  if ((t.memberUids || []).includes(user.uid)) { curTrip = joinId; go('trips'); return; }
  const claimed = new Set(Object.values(t.names || {})), free = (t.members || []).filter(m => !claimed.has(m));
  openSheet(`<h3>Join “${esc(t.name)}”?</h3><p class="muted">${t.start ? niceDate(t.start) + ' – ' + niceDate(t.end) + ' · ' : ''}${esc((t.members || []).join(', '))}</p>
    <label>Which one are you?<select id="jName">${free.map(m => `<option>${esc(m)}</option>`).join('')}<option value="__new">Someone new</option></select></label>
    <input id="jNew" placeholder="Your name" value="${esc(myName())}" class="${free.length ? 'hidden' : ''}">
    <button class="primary" id="jGo">Join trip</button><button style="width:100%;margin-top:8px" id="jNo">Not now</button>`, ev => {
    if (ev.target.id === 'jNo') return closeSheet();
    if (ev.target.id !== 'jGo') return;
    const sel = $('#jName').value, name = (sel === '__new' ? $('#jNew').value : sel).trim();
    if (!name) return toast('Enter your name');
    closeSheet();
    track(F.updateDoc(ref, { memberUids: F.arrayUnion(user.uid), members: F.arrayUnion(name), ['names.' + user.uid]: name }).then(() => { curTrip = joinId; go('trips'); toast('You joined ' + t.name); }));
  });
  $('#jName').onchange = () => $('#jNew').classList.toggle('hidden', $('#jName').value !== '__new');
}

// ================= rendering =================
let rq = 0; function schedule() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }
function go(v) { if (v !== 'list' && multi) { multi = false; picked.clear(); $('#selBtn').textContent = 'Select'; } view = v; $$('section').forEach(s => s.classList.toggle('on', s.id === 'v-' + v)); $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); window.scrollTo(0, 0); render(); }
$$('nav button').forEach(b => b.onclick = () => { if (b.dataset.v === 'trips' && view === 'trips') curTrip = null; go(b.dataset.v); });
$$('.monthbar button').forEach(b => b.onclick = () => { month = shiftMonth(month, +b.dataset.m * (pmode === 'year' ? 12 : 1)); render(); });
$$('.pseg button').forEach(b => b.onclick = () => { pmode = b.dataset.p; render(); });

function render() {
  $('#sync').textContent = !configured ? 'On this phone' : authKnown && !fb ? 'Offline · this phone only' : !authKnown ? 'Connecting…' : !user ? 'Not signed in · this phone only' : !navigator.onLine ? 'Offline · will sync' : pending ? 'Saving…' : '✓ Synced';
  $$('.mlabel').forEach(e => e.textContent = pmode === 'year' ? month.slice(0, 4) : monthLabel(month));
  $$('.pseg button').forEach(b => b.classList.toggle('on', b.dataset.p === pmode));
  renderSelBar();
  ({ add: renderAdd, list: renderList, trips: renderTrips, stats: renderStats, settings: renderSettings })[view]();
}
window.addEventListener('online', schedule); window.addEventListener('offline', schedule);

const tripsSorted = () => [...S.trips].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
const targetOptions = sel => `<option value="">Personal expenses</option>` + tripsSorted().map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>✈ ${esc(t.name)}</option>`).join('');
const peopleFor = t => t ? (trip(t) || {}).members || [myName()] : S.people;
const opts = (list, sel) => list.map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('');

function itemHTML(e, showDay) {
  const c = cat(e.cat), t = e.trip && trip(e.trip), spl = !e._mine && !e._share && hasSplit(e);
  const sm = multi && view === 'list', on = sm && picked.has(e.id);
  return `<div class="item${on ? ' picked' : ''}" data-id="${esc(e.id)}" data-trip="${e.trip || ''}">${sm ? `<span class="tick">${on ? '✓' : ''}</span>` : ''}<div class="ic" ${sm ? '' : 'data-ic="1"'} style="background:${c.color}22">${c.icon}</div><div class="mid"><div class="t">${esc(e.note || c.name)}</div><div class="s">${esc(c.name)}${e.who ? (isInc(e) ? ' from ' : ' · ') + esc(e.who) : ''}${spl ? ` · <span class="splt">➗ you ${money(myShare(e))}</span>` : e._mine ? ' · your share' : e._share ? ' · split share' : ''} · ${e.mode} · ${esc(e.person)}${t && view !== 'trips' ? ' · ✈ ' + esc(t.name) : ''}${showDay ? ' · ' + dayLabel(e.date) : ''}</div></div><div class="a${isInc(e) ? ' inc' : ''}">${isInc(e) ? '+' : ''}${money(e.amount)}</div></div>`;
}
function groupedHTML(rows) {
  const g = {}; rows.forEach(e => (g[e.date] = g[e.date] || []).push(e));
  return Object.keys(g).sort().reverse().map(d => { const o = sum(g[d].filter(e => !isInc(e))), i = sum(g[d].filter(isInc)); return `<div class="day"><span>${dayLabel(d)}</span><span>${o ? money(o) : ''}${o && i ? ' · ' : ''}${i ? '<span class="inc">+' + money(i) + '</span>' : ''}</span></div><div class="card" style="padding:2px 14px">${g[d].sort((a, b) => b.ts - a.ts).map(e => itemHTML(e)).join('')}</div>`; }).join('');
}
document.addEventListener('click', ev => {
  const it = ev.target.closest('.item[data-id]'); if (!it) return;
  if (longPressed) { longPressed = false; return; }
  if (multi && view === 'list') { togglePick(it.dataset.id); return; }
  if (ev.target.closest('[data-ic]')) openCatSheet(it.dataset.id, it.dataset.trip); else startEdit(it.dataset.id, it.dataset.trip);
});

// ---------- Add ----------
let SPL = { on: false, by: 'shares', me: 1, rows: [] };
const splitAllowed = () => selType !== 'in' && !$('#fFor').value && selCat !== OWE_OUT;
function splitCalc() {
  const total = parseFloat($('#amt').value) || 0, rows = SPL.rows;
  if (SPL.by === 'shares') { const n = SPL.me + rows.reduce((t, r) => t + (r.shares || 0), 0); const per = n ? total / n : 0; rows.forEach(r => r.amount = r2(per * (r.shares || 0))); }
  const others = rows.reduce((t, r) => t + (r.amount || 0), 0);
  return { total, others: r2(others), me: r2(total - others) };
}
function renderSplit(full) {
  const ok = splitAllowed(); $('#splitWrap').classList.toggle('hidden', !ok); if (!ok) return;
  $('#splitTgl').classList.toggle('on', SPL.on); $('#splitBody').classList.toggle('hidden', !SPL.on);
  if (!SPL.on) return;
  if (full) {
    if (!SPL.rows.length) SPL.rows.push({ who: '', shares: 1, amount: 0 });
    $$('#splitSeg button').forEach(b => b.classList.toggle('on', b.dataset.by === SPL.by));
    $('#splitList').innerHTML = `<datalist id="splFr">${friends().map(f => `<option value="${esc(f)}">`).join('')}</datalist>
      <div class="srow"><span class="sname">Me</span>${SPL.by === 'shares' ? stepper('me', SPL.me) : '<span class="muted sval" id="spMe"></span>'}<span class="samt" id="spMeAmt"></span><span class="sx"></span></div>
      ${SPL.rows.map((r, i) => `<div class="srow"><input class="sname" data-si="${i}" data-sk="who" list="splFr" placeholder="Friend's name" value="${esc(r.who)}" maxlength="30">${SPL.by === 'shares' ? stepper(i, r.shares) : `<input class="sval" type="number" inputmode="decimal" min="0" step="0.01" data-si="${i}" data-sk="amount" value="${r.amount || ''}" placeholder="₹">`}<span class="samt" data-sa="${i}"></span><button type="button" class="sx" data-sdel="${i}" aria-label="Remove">✕</button></div>`).join('')}`;
  }
  const c = splitCalc();
  if ($('#spMeAmt')) $('#spMeAmt').textContent = money(Math.max(0, c.me));
  SPL.rows.forEach((r, i) => { const el = $(`[data-sa="${i}"]`); if (el) el.textContent = SPL.by === 'shares' ? money(r.amount) : ''; });
  $('#splitSum').innerHTML = !c.total ? 'Enter the amount above' : c.me < 0 ? `<span class="up">Friends' shares are ${money(-c.me)} more than the total</span>` : `You pay <b>${money(c.me)}</b> · friends owe you <b>${money(c.others)}</b>`;
}
const stepper = (i, v) => `<span class="step"><button type="button" data-sstep="${i}" data-d="-1">−</button><b>${v}</b><button type="button" data-sstep="${i}" data-d="1">+</button></span>`;
$('#splitTgl').onclick = () => { SPL.on = !SPL.on; renderSplit(true); };
$('#splitSeg').onclick = e => { const b = e.target.closest('[data-by]'); if (!b) return; if (b.dataset.by === 'amount' && SPL.by === 'shares') splitCalc(); SPL.by = b.dataset.by; renderSplit(true); };
$('#splitAdd').onclick = () => { SPL.rows.push({ who: '', shares: 1, amount: 0 }); renderSplit(true); const ins = $$('#splitList input.sname'); ins[ins.length - 1].focus(); };
$('#splitList').addEventListener('click', e => {
  const st = e.target.closest('[data-sstep]'), del = e.target.closest('[data-sdel]');
  if (st) { const i = st.dataset.sstep, d = +st.dataset.d; if (i === 'me') SPL.me = Math.max(0, SPL.me + d); else SPL.rows[+i].shares = Math.max(1, (SPL.rows[+i].shares || 1) + d); renderSplit(true); }
  if (del) { SPL.rows.splice(+del.dataset.sdel, 1); if (!SPL.rows.length) SPL.on = false; renderSplit(true); }
});
$('#splitList').addEventListener('input', e => { const i = e.target.dataset.si; if (i === undefined) return; const r = SPL.rows[+i]; if (e.target.dataset.sk === 'who') r.who = e.target.value; else r.amount = r2(parseFloat(e.target.value) || 0); renderSplit(false); });
$('#amt').addEventListener('input', () => renderSplit(false));
$('#fFor').addEventListener('change', () => renderSplit(true));
function splitFromForm() {
  if (!SPL.on || !splitAllowed()) return { ok: true, data: null };
  const c = splitCalc(), rows = SPL.rows.map(r => ({ ...r, who: r.who.trim() })).filter(r => r.who || r.amount);
  if (!rows.length) return { ok: true, data: null };
  if (rows.some(r => !r.who)) return { ok: false, msg: "Enter each friend's name" };
  if (new Set(rows.map(r => r.who.toLowerCase())).size < rows.length) return { ok: false, msg: 'Each friend only once' };
  if (rows.some(r => !(r.amount > 0))) return { ok: false, msg: SPL.by === 'shares' ? 'Each friend needs at least 1 share' : 'Enter an amount for each friend' };
  if (c.me < 0) return { ok: false, msg: "Friends' shares are more than the total" };
  return { ok: true, data: { split: rows.map(r => ({ who: r.who, amount: r.amount, ...(SPL.by === 'shares' ? { shares: r.shares } : {}) })), splitBy: SPL.by, meShares: SPL.me } };
}
function renderAdd() {
  const tv = $('#impTarget').value; $('#impTarget').innerHTML = targetOptions(tv); if (tv && !trip(tv)) $('#impTarget').value = '';
  const fv = $('#fFor').value; $('#fFor').innerHTML = targetOptions(fv);
  if (!S.categories.some(c => c.name === selCat)) selCat = (S.categories[0] || {}).name;
  if (!S.incCats.some(c => c.name === selInc)) selInc = (S.incCats[0] || {}).name;
  const inc = selType === 'in', cur = inc ? selInc : selCat;
  $$('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === selType));
  $('#forWrap').classList.toggle('hidden', inc); if (inc) $('#fFor').value = '';
  $('#personLbl').textContent = inc ? 'Received by' : 'Paid by';
  $('#amtSign').textContent = inc ? '+₹' : '₹';
  $('#note').placeholder = inc ? 'Where is it from?' : 'What was it for?';
  const fr = cur === OWE_OUT || cur === OWE_IN; $('#whoWrap').classList.toggle('hidden', !fr);
  if (fr) { $('#whoLbl').textContent = inc ? 'Which friend paid you back?' : 'Which friend is this for?'; $('#whoList').innerHTML = friends().map(f => `<option value="${esc(f)}">`).join(''); }
  $('#catChips').innerHTML = (inc ? S.incCats : S.categories).map(c => `<button type="button" class="chip ${c.name === cur ? 'sel' : ''}" data-c="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join('');
  $('#modeChips').innerHTML = MODES.map(m => `<button type="button" class="chip ${m === selMode ? 'sel' : ''}" data-mode="${m}">${m}</button>`).join('');
  fillPerson();
  renderSplit(true);
  if (!$('#date').value) $('#date').value = today();
  renderFact($('#factAdd'), factMonth());
  const r = allExp().sort((a, b) => b.ts - a.ts).slice(0, 6);
  $('#recent').innerHTML = r.length ? r.map(e => itemHTML(e, true)).join('') : '<div class="empty">Nothing yet. Upload a statement or add an expense.</div>';
}
function fillPerson(force) {
  const t = $('#fFor').value, list = peopleFor(t), cur = force || $('#person').value;
  const me = meIn(trip(t)), pick = list.includes(cur) ? cur : t ? (list.includes(me) ? me : list[0]) : (list.includes(S.lastPerson) ? S.lastPerson : list[0]);
  $('#person').innerHTML = opts(list, pick);
}
$('#fFor').onchange = () => fillPerson();
$('#catChips').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { if (selType === 'in') selInc = b.dataset.c; else selCat = b.dataset.c; renderAdd(); } };
$('#typeSeg').onclick = e => { const b = e.target.closest('[data-t]'); if (b && !edit) { selType = b.dataset.t; renderAdd(); fillPerson(); } };
$('#modeChips').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { selMode = b.dataset.mode; renderAdd(); } };
function openForm(on = true) { $('#f').classList.toggle('hidden', !on); $('#manualBtn').textContent = on ? '✕ Close form' : '✎ Add manually'; if (on) setTimeout(() => $('#amt').focus(), 50); }
$('#manualBtn').onclick = () => { const on = $('#f').classList.contains('hidden'); if (!on) resetForm(); openForm(on); };
function startEdit(id, t) {
  const e = findExp(id, t); if (!e) return;
  edit = { id, trip: t || '' }; go('add');
  $('#fFor').value = t || ''; $('#amt').value = e.amount; selType = isInc(e) ? 'in' : 'out'; if (isInc(e)) selInc = e.cat; else selCat = e.cat; selMode = e.mode; $('#date').value = e.date; $('#note').value = e.note || ''; $('#who').value = e.who || '';
  SPL = hasSplit(e) ? { on: true, by: e.splitBy || 'shares', me: e.meShares ?? 1, rows: e.split.map(x => ({ who: x.who, amount: x.amount, shares: x.shares || 1 })) } : { on: false, by: 'shares', me: 1, rows: [] };
  renderAdd(); fillPerson(e.person);
  $('#saveBtn').textContent = 'Update expense'; $('#editBtns').classList.remove('hidden'); openForm(true);
}
function resetForm() { edit = null; selType = 'out'; SPL = { on: false, by: 'shares', me: 1, rows: [] }; const f = $('#fFor').value; $('#f').reset(); $('#fFor').value = f; $('#date').value = today(); $('#saveBtn').textContent = 'Save expense'; $('#editBtns').classList.add('hidden'); }
$('#cancelEdit').onclick = () => { resetForm(); openForm(false); renderAdd(); };
$('#delBtn').onclick = () => { const e = edit && findExp(edit.id, edit.trip); if (!e || !confirm('Delete this expense?')) return; delExp(e); resetForm(); openForm(false); toast('Deleted'); };
$('#note').addEventListener('change', () => { if (edit) return; const r = ruleFor($('#note').value, selType); if (r) { if (selType === 'in') selInc = r; else selCat = r; renderAdd(); } });
$('#f').onsubmit = ev => {
  ev.preventDefault();
  const amount = parseFloat($('#amt').value); if (!(amount > 0)) return toast('Enter an amount');
  const inc = selType === 'in', forT = inc ? '' : $('#fFor').value;
  const data = { amount: r2(amount), cat: inc ? selInc : selCat, mode: selMode, date: $('#date').value || today(), person: $('#person').value, note: $('#note').value.trim() };
  const who = $('#who').value.trim();
  if (data.cat === OWE_OUT || data.cat === OWE_IN) { if (!who) { $('#who').focus(); return toast("Enter your friend's name"); } data.who = who; }
  const sp = splitFromForm(); if (!sp.ok) return toast(sp.msg, 3500); if (sp.data) Object.assign(data, sp.data);
  let changed = null, e;
  if (edit) {
    const old = findExp(edit.id, edit.trip); if (!old) { resetForm(); return; }
    e = { ...old, ...data }; delete e.trip; delete e.type; if (!data.who) delete e.who; if (!data.split) { delete e.split; delete e.splitBy; delete e.meShares; } if (inc) e.type = 'in'; if (forT) e.trip = forT;
    if ((old.trip || '') !== forT) delExp(old);
    if (old.cat !== data.cat && !isFriend(e)) changed = e;
    putExp(e); toast(data.split ? `Updated · your share ${money(myShare(e))}` : 'Updated');
  } else {
    e = { id: uid(), ts: Date.now(), ...data }; if (inc) e.type = 'in'; if (forT) e.trip = forT;
    putExp(e); toast(data.split ? `Saved · your share ${money(myShare(e))}` : (inc ? 'Income saved +' : 'Saved ') + money(e.amount));
  }
  if (!forT && S.lastPerson !== data.person) { S.lastPerson = data.person; saveMeta(); }
  if (!forT && !inc) budgetCheck(data.cat, mk(data.date));
  const wasEdit = !!edit; resetForm();
  if (changed) offerRemember(changed); else if (wasEdit) openForm(false); else $('#amt').focus();
};
function budgetCheck(n, m) { const c = cat(n); if (!c.budget) return; const sp = sum(inMonth(m).filter(e => e.cat === n)); const p = sp / c.budget; if (p >= 1) toast(`⚠️ ${c.name} is over budget: ${money(sp)} of ${money(c.budget)}`, 4000); else if (p >= .8) toast(`${c.name} at ${Math.round(p * 100)}% of budget`, 3500); }

// ---------- Expenses list ----------
function renderList() {
  const fp = $('#fPerson').value, fc = $('#fCat').value;
  $('#fPerson').innerHTML = '<option value="">Everyone</option>' + opts(S.people, fp); $('#fPerson').value = fp;
  $('#fCat').innerHTML = '<option value="">All categories</option><optgroup label="Spending">' + S.categories.map(c => `<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join('') + '</optgroup><optgroup label="Income">' + S.incCats.map(c => `<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join('') + '</optgroup>'; $('#fCat').value = fc;
  const ft = $('#fType').value;
  const q = $('#fSearch').value.trim().toLowerCase();
  const rows = S.expenses.filter(e => e.date.startsWith(pKey()) && (!ft || (ft === 'in') === isInc(e))).filter(e => (!fp || e.person === fp) && (!fc || e.cat === fc) && (!q || (e.note || '').toLowerCase().includes(q) || e.cat.toLowerCase().includes(q)));
  listRows = rows; picked.forEach(id => { if (!rows.some(e => e.id === id)) picked.delete(id); }); renderSelBar();
  const xr = expand(rows);
  const o = sum(xr.filter(e => !isInc(e) && !isInvest(e) && !isFriend(e))), iv = sum(xr.filter(e => !isInc(e) && isInvest(e) && !isFriend(e))), i = sum(xr.filter(e => isInc(e) && !isFriend(e))), fr = sum(xr.filter(e => e.cat === OWE_OUT)) - sum(xr.filter(e => e.cat === OWE_IN));
  $('#listSum').innerHTML = rows.length ? `${rows.length} entr${rows.length > 1 ? 'ies' : 'y'}${o ? ' · spent ' + money(o) : ''}${iv ? ' · invested ' + money(iv) : ''}${xr.some(isFriend) ? ' · friends ' + (fr >= 0 ? '' : '−') + money(Math.abs(fr)) : ''}${i ? ` · <span class="inc">received +${money(i)}</span>` : ''}` : '';
  $('#list').innerHTML = rows.length ? groupedHTML(rows) : `<div class="empty">Nothing here for this ${perWord(pKey())}.</div>`;
}
['#fPerson', '#fCat', '#fType'].forEach(s => $(s).onchange = renderList); $('#fSearch').oninput = renderList;

// ---------- multi-select (Expenses list) ----------
let multi = false, picked = new Set(), listRows = [], longPressed = false, lpTimer = 0;
function setSelMode(on) { multi = on; if (!on) picked.clear(); $('#selBtn').textContent = on ? 'Cancel' : 'Select'; renderList(); }
function togglePick(id) { if (picked.has(id)) picked.delete(id); else picked.add(id); renderList(); }
function renderSelBar() {
  const show = multi && view === 'list'; $('#selBar').classList.toggle('hidden', !show); document.body.classList.toggle('selecting', show);
  if (!show) return;
  const sel = listRows.filter(e => picked.has(e.id));
  $('#selCount').innerHTML = sel.length ? `<b>${sel.length} selected</b><span class="muted"> · ${money(sum(sel))}</span>` : '<span class="muted">Tap entries to select</span>';
  $$('#selBar [data-bulk]').forEach(b => { if (b.dataset.bulk !== 'all') b.disabled = !sel.length; });
  $('#selBar [data-bulk=all]').textContent = sel.length === listRows.length && listRows.length ? 'None' : 'All';
}
$('#selBtn').onclick = () => setSelMode(!multi);
$('#list').addEventListener('pointerdown', ev => {
  const it = ev.target.closest('.item[data-id]'); if (!it || multi) return;
  clearTimeout(lpTimer); lpTimer = setTimeout(() => { longPressed = true; multi = true; picked.add(it.dataset.id); $('#selBtn').textContent = 'Cancel'; renderList(); if (navigator.vibrate) navigator.vibrate(30); }, 550);
});
['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach(t => $('#list').addEventListener(t, () => clearTimeout(lpTimer), true));
window.addEventListener('scroll', () => clearTimeout(lpTimer), { passive: true });
$('#selBar').onclick = ev => {
  const b = ev.target.closest('[data-bulk]'); if (!b || b.disabled) return;
  const sel = listRows.filter(e => picked.has(e.id));
  switch (b.dataset.bulk) {
    case 'all': if (picked.size === listRows.length) picked.clear(); else listRows.forEach(e => picked.add(e.id)); return renderList();
    case 'note': return bulkNote(sel);
    case 'cat': return bulkCat(sel);
    case 'friend': setSelMode(false); return askFriend('Paid for a friend?', `Spends become “paid for friend”, credits become “friend paid back”. Neither counts in your own spending or income. ${sel.length} selected.`, n => markFriend(sel, n));
    case 'del': if (!confirm(`Delete ${sel.length} entr${sel.length > 1 ? 'ies' : 'y'}?`)) return; putMany(sel, true); toast(`Deleted ${sel.length}`); return setSelMode(false);
  }
};
function bulkNote(sel) {
  const same = sel.every(e => e.note === sel[0].note) ? sel[0].note : '';
  openSheet(`<h3>Note for ${sel.length} entr${sel.length > 1 ? 'ies' : 'y'}</h3>
    <input id="bNote" value="${esc(same)}" placeholder="e.g. US MARKET" maxlength="120">
    <div class="seg" style="margin:12px 0 0"><button type="button" data-how="replace" class="on">Replace note</button><button type="button" data-how="add">Add to note</button></div>
    <p class="muted" id="bHow" style="margin:6px 0 0">The old note is replaced. Bank details are kept in the original statement.</p>
    <button class="primary" id="bGo">Save note</button><button style="width:100%;margin-top:8px" id="bNo">Cancel</button>`, ev => {
    const h = ev.target.closest('[data-how]');
    if (h) { $$('#sheet [data-how]').forEach(x => x.classList.toggle('on', x === h)); $('#bHow').textContent = h.dataset.how === 'add' ? 'Added after the existing note, e.g. "ZERODHA · US MARKET".' : 'The old note is replaced. Bank details are kept in the original statement.'; return; }
    if (ev.target.id === 'bNo') return closeSheet();
    if (ev.target.id !== 'bGo') return;
    const v = $('#bNote').value.trim(), add = $('#sheet [data-how=add]').classList.contains('on');
    if (!v && add) return toast('Type a note to add');
    putMany(sel.map(e => ({ ...e, note: add && e.note ? (e.note.includes(v) ? e.note : e.note + ' · ' + v) : v })));
    closeSheet(); toast(`Note saved on ${sel.length} entr${sel.length > 1 ? 'ies' : 'y'}`); setSelMode(false);
  });
  setTimeout(() => { const i = $('#bNote'); i.focus(); i.select(); }, 60);
}
// ---------- paid for friends ----------
function friends() { const c = {}; allExp().forEach(e => { if (e.who) c[e.who] = (c[e.who] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a]); }
function askFriend(title, sub, done) {
  const fs = friends();
  openSheet(`<h3>${title}</h3><p class="muted" style="margin-top:2px">${sub}</p>
    <input id="fName" list="fNames" placeholder="Friend's name" maxlength="30"><datalist id="fNames">${fs.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    ${fs.length ? `<div class="chips" style="margin-top:10px">${fs.slice(0, 8).map(f => `<button class="chip" data-fn="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}
    <button class="primary" id="fGo">Save</button><button style="width:100%;margin-top:8px" id="fNo">Cancel</button>`, ev => {
    const c = ev.target.closest('[data-fn]'); if (c) { $('#fName').value = c.dataset.fn; return; }
    if (ev.target.id === 'fNo') return closeSheet();
    if (ev.target.id !== 'fGo') return;
    const n = $('#fName').value.trim(); if (!n) return toast("Enter your friend's name");
    closeSheet(); done(n);
  });
  setTimeout(() => $('#fName').focus(), 60);
}
function markFriend(list, n) {
  putMany(list.map(e => { const x = { ...e, cat: isInc(e) ? OWE_IN : OWE_OUT, who: n }; delete x.split; delete x.splitBy; delete x.meShares; return x; }));
  const out = list.filter(e => !isInc(e)).length, back = list.length - out;
  toast(`${out ? `${out} marked as paid for ${n}` : ''}${out && back ? ' · ' : ''}${back ? `${back} as paid back by ${n}` : ''}`, 3500);
}
function bulkCat(sel) {
  const inc = sel.filter(isInc).length;
  if (inc && inc < sel.length) return toast('Select only spending or only income to change category', 3500);
  const list = inc ? S.incCats : S.categories;
  openSheet(`<h3>Category for ${sel.length} entr${sel.length > 1 ? 'ies' : 'y'}</h3><div class="chips" style="margin-top:10px">${list.map(c => `<button class="chip" data-pick="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>`, ev => {
    const b = ev.target.closest('[data-pick]'); if (!b) return;
    if (b.dataset.pick === OWE_OUT || b.dataset.pick === OWE_IN) { setSelMode(false); return askFriend('Which friend?', `${sel.length} entr${sel.length > 1 ? 'ies' : 'y'} · ${money(sum(sel))}`, n => markFriend(sel, n)); }
    putMany(sel.map(e => { const x = { ...e, cat: b.dataset.pick }; delete x.who; return x; })); closeSheet(); toast(`Moved ${sel.length} to ${b.dataset.pick}`); setSelMode(false);
  });
}

// ---------- Trips ----------
function settle(t) {
  const ex = tripExp(t.id), tot = sum(ex), mem = t.members.length ? t.members : [myName()], share = tot / mem.length;
  const paid = {}; mem.forEach(p => paid[p] = 0); ex.forEach(e => paid[e.person] = (paid[e.person] || 0) + e.amount);
  const bal = Object.keys(paid).map(p => ({ p, b: paid[p] - (mem.includes(p) ? share : 0) }));
  const cr = bal.filter(x => x.b > .5).sort((a, b) => b.b - a.b).map(x => ({ ...x })), db = bal.filter(x => x.b < -.5).map(x => ({ p: x.p, b: -x.b })).sort((a, b) => b.b - a.b);
  const tx = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) { const v = Math.min(db[i].b, cr[j].b); tx.push([db[i].p, cr[j].p, v]); db[i].b -= v; cr[j].b -= v; if (db[i].b < .5) i++; if (cr[j].b < .5) j++; }
  return { tot, share, paid, tx, mem };
}
function renderTrips() {
  const t = curTrip && trip(curTrip); // a just-joined trip may arrive a moment later, so keep curTrip
  $('#tripsBox').innerHTML = t ? tripDetailHTML(t) : tripListHTML();
}
function tripListHTML() {
  const banner = configured && authKnown && !user ? `<div class="banner">Sign in (Settings) to share trips live — everyone on the trip adds expenses from their own phone.</div>` : '';
  const list = tripsSorted();
  return banner + `<button class="primary" data-act="new" style="margin:0 0 12px">＋ New trip</button>` + (list.length ? list.map(t => {
    const ex = tripExp(t.id), tot = sum(ex), p = t.budget ? tot / t.budget : 0;
    return `<div class="card trip" data-act="open" data-trip="${t.id}"><div class="row"><div><b style="font-size:16px">✈ ${esc(t.name)}</b><div class="muted">${t.start ? niceDate(t.start) + ' – ' + niceDate(t.end) + ' · ' : ''}${t.members.length} ${t.members.length > 1 ? 'people' : 'person'} · ${ex.length} expenses</div></div><div class="a" style="text-align:right;flex:0 0 auto">${money(tot)}</div></div>${t.budget ? `<div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${barColor(p)}"></i></div>` : ''}</div>`;
  }).join('') : '<div class="empty">No trips yet. Create one, then upload statements or add expenses to it.</div>');
}
function tripDetailHTML(t) {
  const ex = tripExp(t.id), st = settle(t), p = t.budget ? st.tot / t.budget : 0;
  const byCat = {}; ex.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
  const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  return `<button class="link" data-act="back">‹ All trips</button>
  <div class="card"><div class="row" style="align-items:flex-start"><div><h2>✈ ${esc(t.name)}</h2><div class="muted">${t.start ? niceDate(t.start) + ' – ' + niceDate(t.end) + ' · ' : ''}${esc(t.members.join(', '))}</div></div><button class="small" data-act="edit" style="flex:0 0 auto">Edit</button></div>
    <div class="big" style="margin-top:10px">${money(st.tot)}</div><div class="muted">${ex.length} expenses${st.mem.length > 1 ? ' · ' + money(st.share) + ' per person' : ''}</div>
    ${t.budget ? `<div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${barColor(p)}"></i></div><div class="muted" style="margin-top:4px">${Math.round(p * 100)}% of ${money(t.budget)} budget</div>` : ''}</div>
  <div class="card hero"><button class="primary" data-act="upload" style="margin-top:0">📄 Upload statement / CSV</button>
    <div class="btns" style="margin:8px 0 0"><button data-act="add">✎ Add manually</button><button data-act="csv">⬇ Download CSV</button></div>
    ${cloud ? '<button data-act="invite" style="width:100%;margin-top:8px">👥 Invite people</button>' : ''}</div>
  ${st.mem.length > 1 ? `<div class="card"><div class="label" style="margin-top:0">Settle up</div>
    ${Object.keys(st.paid).map(n => `<div class="settle"><span>${esc(n)} paid ${money(st.paid[n])}</span><b class="${st.paid[n] - (st.mem.includes(n) ? st.share : 0) >= 0 ? 'down' : 'up'}">${(st.paid[n] - (st.mem.includes(n) ? st.share : 0)) >= 0 ? '+' : '−'}${money(Math.abs(st.paid[n] - (st.mem.includes(n) ? st.share : 0)))}</b></div>`).join('')}
    <div class="label">Who pays whom</div>${st.tx.length ? st.tx.map(([a, b, v]) => `<div class="settle"><span>${esc(a)} → ${esc(b)}</span><b>${money(v)}</b></div>`).join('') : '<div class="muted">All settled 🎉</div>'}
    <p class="muted" style="margin-bottom:0">Split equally among ${st.mem.length} people.</p></div>` : ''}
  ${cats.length ? `<div class="card"><div class="label" style="margin-top:0">By category</div>${cats.map(n => { const c = cat(n); return `<div style="margin:6px 0"><div class="row"><span>${c.icon} ${esc(n)}</span><b style="text-align:right">${money(byCat[n])}</b></div><div class="bar"><i style="width:${byCat[n] / st.tot * 100}%;background:${c.color}"></i></div></div>`; }).join('')}</div>` : ''}
  ${ex.length ? groupedHTML(ex) : '<div class="empty">No expenses in this trip yet.</div>'}`;
}
$('#tripsBox').onclick = ev => {
  const a = ev.target.closest('[data-act]'); if (!a) return;
  const t = curTrip && trip(curTrip);
  switch (a.dataset.act) {
    case 'new': return openTripForm(null);
    case 'open': curTrip = a.dataset.trip; window.scrollTo(0, 0); return renderTrips();
    case 'back': curTrip = null; return renderTrips();
    case 'edit': return openTripForm(t);
    case 'upload': fileTarget = t.id; return $('#impFile').click();
    case 'add': resetForm(); go('add'); $('#fFor').value = t.id; fillPerson(); return openForm(true);
    case 'csv': return exportCSV(tripExp(t.id).map(e => ({ ...e, trip: t.id })), 'trickle-' + t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    case 'invite': return invite(t);
  }
};
async function invite(t) {
  const url = location.origin + location.pathname + '?join=' + t.id;
  const text = `Join our trip “${t.name}” on Trickle to add and see trip expenses together:`;
  if (navigator.share) { try { await navigator.share({ title: 'Trickle trip', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Invite link copied'); } catch (e) { prompt('Copy this invite link:', url); }
}
function openTripForm(t) {
  const isOwner = !cloud || !t || t.owner === user.uid;
  openSheet(`<h3>${t ? 'Edit trip' : 'New trip'}</h3>
    <label>Trip name<input id="tName" value="${esc(t ? t.name : '')}" placeholder="e.g. Kerala Dec 2026" maxlength="40"></label>
    <div class="row"><label>Start<input type="date" id="tStart" value="${t ? t.start : ''}"></label><label>End<input type="date" id="tEnd" value="${t ? t.end : ''}"></label></div>
    <label>People on this trip (comma separated)<input id="tMem" value="${esc(t ? t.members.join(', ') : (cloud ? myName() : S.people.join(', ')))}"></label>
    <p class="muted" style="margin:4px 0 0">Add friends by name even if they don't use Trickle${cloud ? ' — or invite them to join after saving' : ''}.</p>
    <label>Trip budget (optional)<input type="number" inputmode="numeric" id="tBud" value="${t && t.budget ? t.budget : ''}" placeholder="No limit"></label>
    <button class="primary" id="tSave">Save trip</button>
    ${t ? `<button class="danger" id="tDel" style="width:100%;margin-top:8px">${isOwner ? 'Delete trip' : 'Leave trip'}</button>` : ''}`, ev => {
    if (ev.target.id === 'tDel') {
      const n = tripExp(t.id).length;
      if (!confirm(isOwner ? `Delete “${t.name}” and its ${n} expenses for everyone?` : `Leave “${t.name}”? You can rejoin with the invite link.`)) return;
      closeSheet(); removeTrip(t); toast(isOwner ? 'Trip deleted' : 'Left trip'); return;
    }
    if (ev.target.id !== 'tSave') return;
    const name = $('#tName').value.trim(); if (!name) return toast('Give the trip a name');
    const members = [...new Set($('#tMem').value.split(',').map(s => s.trim()).filter(Boolean))];
    if (!members.length) return toast('Add at least one person');
    const start = $('#tStart').value, end = $('#tEnd').value || start;
    if (start && end < start) return toast('End date is before start');
    const d = { name, start, end, members, budget: Math.max(0, parseFloat($('#tBud').value) || 0) };
    closeSheet();
    if (t) putTrip({ ...t, ...d }, false); else { const id = newTripId(); putTrip({ id, ...d }, true); curTrip = id; }
    go('trips'); toast('Trip saved');
  });
}

// ---------- Stats & budgets ----------
function barColor(p) { return p >= 1 ? css('--bad') : p >= .8 ? css('--warn') : css('--good'); }
function canvasCtx(cv) { const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); return { x, w, h }; }
// ---------- period helpers (month or year view) ----------
let pmode = 'month';
const dSel = { out: null, in: null, inv: null };               // category picked on each donut
const pKey = () => pmode === 'year' ? month.slice(0, 4) : month;
const isYearKey = k => k.length === 4;
const prevKey = k => isYearKey(k) ? String(+k - 1) : shiftMonth(k, -1);
const spendIn = k => own().filter(e => e.date.startsWith(k) && !isInc(e) && !isFriend(e));
const spendNI = k => spendIn(k).filter(e => !isInvest(e));        // spending without investments
const incomeIn = k => own().filter(e => e.date.startsWith(k) && isInc(e) && !isFriend(e));
function daysIn(k) {
  const t = today();
  if (isYearKey(k)) { if (k === t.slice(0, 4)) return Math.max(1, Math.round((new Date(t + 'T00:00') - new Date(k + '-01-01T00:00')) / 864e5) + 1); return (+k % 4 === 0 && (+k % 100 !== 0 || +k % 400 === 0)) ? 366 : 365; }
  if (k === mk(t)) return new Date().getDate();
  const [y, mo] = k.split('-').map(Number); return new Date(y, mo, 0).getDate();
}
const perWord = k => isYearKey(k) ? 'year' : 'month';

function renderStats() {
  const k = pKey(), Y = isYearKey(k), all = spendIn(k), ex = all.filter(e => !isInvest(e)), invested = sum(all.filter(isInvest)), tot = sum(ex), prev = sum(spendNI(prevKey(k)));
  const incs = incomeIn(k), refunds = sum(incs.filter(isRefund)), income = sum(incs.filter(e => !isRefund(e))), net = tot - refunds, saved = income - net;
  const days = daysIn(k), diff = prev ? (tot - prev) / prev : null;
  $('#statTop').innerHTML = `<div class="quad"><div><div class="muted">Income</div><b class="inc">${money(income)}</b></div><div><div class="muted">Spent</div><b>${money(net)}</b></div><div><div class="muted">📈 Invested</div><b style="color:#00897b">${money(invested)}</b></div><div><div class="muted">${saved >= 0 ? 'Saved' : 'Overspent'}</div><b class="${saved >= 0 ? 'down' : 'up'}">${money(Math.abs(saved))}</b></div></div>
    ${income ? `<div class="bar split" style="margin-top:10px"><i style="width:${Math.min(100, net / income * 100)}%;background:${barColor(net / income)}"></i><i style="width:${Math.max(0, Math.min(100 - net / income * 100, invested / income * 100))}%;background:#00897b"></i></div><div class="muted" style="margin-top:6px">${saved >= 0 ? `You saved ${Math.round(saved / income * 100)}% of your income${invested ? ` — ${Math.round(invested / income * 100)}% went into investments` : ''}` : `Spending is ${money(-saved)} more than income`}</div>` : `<div class="muted" style="margin-top:6px">Add income (or upload a statement) to see savings.${invested ? ` You invested ${money(invested)} — nice!` : ''}</div>`}
    <div class="muted" style="margin-top:4px">${ex.length} expenses · ${money(Math.round(net / days))}/day avg${Y ? ` · ${money(Math.round(net / Math.max(1, days / 30.44)))}/month avg` : ''}${refunds ? ` · ${money(refunds)} refunds/cashback deducted` : ''}${diff !== null ? ` · <span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(Math.round(diff * 100))}%</span> vs last ${perWord(k)}` : ''}</div>`;
  donut($('#donut'), $('#legend'), $('#outDetail'), ex, S.categories, 'out');
  donut($('#incDonut'), $('#incLegend'), $('#inDetail'), incs.filter(e => !isRefund(e)), S.incCats, 'in');
  renderInvest(k, all.filter(isInvest), income);
  renderFriends();
  renderBars(k);
  renderFact($('#factStats'), k);
  renderBudgets(all, Y ? 12 : 1);
  const grp = key => { const t = {}; ex.forEach(e => t[e[key]] = (t[e[key]] || 0) + e.amount); const ks = Object.keys(t).sort((a, b) => t[b] - t[a]); return ks.length ? ks.map(n => `<div style="margin:6px 0"><div class="row"><span>${esc(n)}</span><b style="text-align:right">${money(t[n])}</b></div><div class="bar"><i style="width:${t[n] / tot * 100}%;background:var(--accent)"></i></div></div>`).join('') : '<div class="muted">No data</div>'; };
  $('#byPerson').innerHTML = grp('person'); $('#byMode').innerHTML = grp('mode');
}

// Bar chart: last 6 months (month view) or Jan–Dec (year view); follows the category picked on a donut.
function renderBars(k) {
  const Y = isYearKey(k), ms = Y ? [...Array(12)].map((_, i) => k + '-' + pad(i + 1)) : [...Array(6)].map((_, i) => shiftMonth(k, i - 5));
  const co = dSel.out, ci = !co && dSel.in;
  let vals, ivals;
  if (co) { vals = ms.map(m => sum(spendNI(m).filter(e => e.cat === co))); ivals = ms.map(() => 0); }
  else if (ci) { vals = ms.map(() => 0); ivals = ms.map(m => sum(incomeIn(m).filter(e => e.cat === ci))); }
  else { vals = ms.map(m => sum(spendNI(m)) - sum(incomeIn(m).filter(isRefund))); ivals = ms.map(m => sum(incomeIn(m).filter(e => !isRefund(e)))); }
  const both = !co && !ci && ivals.some(v => v), onlyInc = !!ci, mx = Math.max(...vals, ...ivals, 1);
  const c = co || ci, ic = c && cat(c);
  $('#barsTitle').innerHTML = (c ? `${ic.icon} ${esc(c)} · ` : '') + (Y ? `${k}, month by month` : 'Last 6 months');
  const cv = $('#bars'), B = canvasCtx(cv); cv._ms = ms;
  if (B.w > 20) {
    const n = ms.length, bw = B.w / n, top = 18, bot = 20, ch = B.h - top - bot, hi = ms.indexOf(month);
    const bar = (x0, w0, v, col) => { const bh = Math.max(0, v) / mx * ch; B.x.fillStyle = col; B.x.beginPath(); B.x.roundRect ? B.x.roundRect(x0, top + ch - bh, w0, bh, [3, 3, 0, 0]) : B.x.rect(x0, top + ch - bh, w0, bh); B.x.fill(); return bh; };
    ms.forEach((m, i) => {
      const x0 = i * bw, on = i === hi;
      let bh;
      if (both) { bar(x0 + bw * .16, bw * .32, ivals[i], css('--good')); bh = bar(x0 + bw * .52, bw * .32, vals[i], on ? css('--accent') : css('--muted')); }
      else if (onlyInc) bh = bar(x0 + bw * .2, bw * .6, ivals[i], on ? css('--good') : css('--line'));
      else bh = bar(x0 + bw * .2, bw * .6, vals[i], co ? (on ? ic.color : ic.color + '77') : on ? css('--accent') : css('--line'));
      const v = onlyInc ? ivals[i] : vals[i];
      if (!both && v > 0 && n <= 6) { B.x.fillStyle = css('--text'); B.x.font = '11px system-ui'; B.x.textAlign = 'center'; B.x.fillText(short(v), x0 + bw / 2, top + ch - bh - 5); }
      B.x.fillStyle = on ? css('--text') : css('--muted'); B.x.font = (on ? '600 ' : '') + '11px system-ui'; B.x.textAlign = 'center';
      B.x.fillText(Y ? monthLabel(m, true).slice(0, 3) : monthLabel(m, true), x0 + bw / 2, B.h - 6);
    });
  }
  $('#barsKey').innerHTML = (both ? '<span><span class="dot" style="background:var(--good)"></span>Income</span><span><span class="dot" style="background:var(--accent)"></span>Spent</span>' : '') + (Y ? '<span style="margin-left:auto">Tap a month to open it</span>' : '');
}
$('#bars').addEventListener('click', ev => {
  if (pmode !== 'year') return; const cv = ev.currentTarget, ms = cv._ms; if (!ms) return;
  const i = Math.floor((ev.clientX - cv.getBoundingClientRect().left) / (cv.clientWidth / ms.length));
  if (ms[i]) { month = ms[i]; pmode = 'month'; render(); toast(monthLabel(month)); }
});

// Interactive donut: tap a slice or legend row to focus that category; tap again (or the centre) to clear.
function donut(cv, legend, detail, ex, list, key) {
  const tot = sum(ex);
  const byCat = list.map(c => ({ c, v: sum(ex.filter(e => e.cat === c.name)) })).concat([...new Set(ex.map(e => e.cat))].filter(n => !list.some(c => c.name === n)).map(n => ({ c: cat(n), v: sum(ex.filter(e => e.cat === n)) }))).filter(o => o.v > 0).sort((a, b) => b.v - a.v);
  let sel = dSel[key]; if (sel && !byCat.some(o => o.c.name === sel)) sel = dSel[key] = null;
  const { x, w, h } = canvasCtx(cv); cv.dataset.k = key;
  if (w > 20) {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4, r = R - 7, ri = r * .62; let a = -Math.PI / 2; const slices = [];
    if (!tot) { x.beginPath(); x.arc(cx, cy, r, 0, 2 * Math.PI); x.arc(cx, cy, ri, 0, 2 * Math.PI, true); x.fillStyle = css('--line'); x.fill('evenodd'); }
    byCat.forEach(o => {
      const d = o.v / tot * 2 * Math.PI, on = sel === o.c.name, ro = on ? R : r;
      x.globalAlpha = sel && !on ? .22 : 1; x.beginPath(); x.arc(cx, cy, ro, a, a + d); x.arc(cx, cy, ri, a + d, a, true); x.closePath(); x.fillStyle = o.c.color; x.fill();
      slices.push({ name: o.c.name, a0: a, a1: a + d }); a += d;
    });
    x.globalAlpha = 1; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (sel) { const o = byCat.find(o => o.c.name === sel); x.fillStyle = css('--text'); x.font = '700 18px system-ui'; x.fillText(short(o.v), cx, cy - 8); x.fillStyle = css('--muted'); x.font = '12px system-ui'; x.fillText((o.c.name.length > 14 ? o.c.name.slice(0, 13) + '…' : o.c.name) + ' · ' + Math.round(o.v / tot * 100) + '%', cx, cy + 12); }
    else { x.fillStyle = css('--text'); x.font = '700 18px system-ui'; x.fillText(short(tot), cx, cy); }
    cv._g = { cx, cy, r: R, ri, slices };
  }
  legend.innerHTML = byCat.map(o => { const cl = 'lg' + (sel === o.c.name ? ' on' : sel ? ' dim' : ''), d = `data-dc="${esc(o.c.name)}" data-dk="${key}"`; return `<span class="${cl}" ${d}><span class="dot" style="background:${o.c.color}"></span>${o.c.icon} ${esc(o.c.name)}</span><span class="${cl} muted" ${d}>${Math.round(o.v / tot * 100)}%</span><b class="${cl}" ${d}>${money(o.v)}</b>`; }).join('') || `<span class="muted">No data for this ${perWord(pKey())}</span>`;
  legend.classList.toggle('picking', !!byCat.length);
  if (!sel) { detail.innerHTML = byCat.length ? '<div class="muted" style="margin-top:8px">Tap a slice or category to see just that.</div>' : ''; return; }
  const rows = ex.filter(e => e.cat === sel).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts), c = list.find(x => x.name === sel) || cat(sel);
  const bud = key === 'out' && c.budget ? c.budget * (isYearKey(pKey()) ? 12 : 1) : 0;
  detail.innerHTML = `<div class="dhead"><b>${c.icon} ${esc(sel)} · ${rows.length} entr${rows.length > 1 ? 'ies' : 'y'}</b><button class="link" data-dclear="${key}">Clear ✕</button></div>
    ${bud ? `<div class="muted">${money(sum(rows))} of ${money(bud)} budget</div><div class="bar"><i style="width:${Math.min(100, sum(rows) / bud * 100)}%;background:${barColor(sum(rows) / bud)}"></i></div>` : ''}
    <div>${rows.slice(0, 40).map(e => itemHTML(e, true)).join('')}</div>${rows.length > 40 ? `<div class="muted">…and ${rows.length - 40} more (see Expenses tab)</div>` : ''}`;
}
let openFriend = null;
function renderFriends() {
  const fe = own().filter(e => isFriend(e) && e.who);
  if (!fe.length) { $('#friendsBox').innerHTML = '<div class="muted">Paid for a friend (e.g. their train ticket)? In Expenses, select it and tap 🤝 Friend. It won\'t count as your spending, and when they pay you back, mark that credit the same way.</div>'; return; }
  const by = {}; fe.forEach(e => { const b = by[e.who] || (by[e.who] = { paid: 0, back: 0, list: [] }); if (e.cat === OWE_OUT) b.paid += e.amount; else b.back += e.amount; b.list.push(e); });
  const names = Object.keys(by).sort((a, b) => (by[b].paid - by[b].back) - (by[a].paid - by[a].back));
  const owed = names.reduce((t, n) => t + Math.max(0, by[n].paid - by[n].back), 0), iOwe = names.reduce((t, n) => t + Math.max(0, by[n].back - by[n].paid), 0);
  $('#friendsBox').innerHTML = `<div class="big" style="font-size:24px">${money(owed)}</div><div class="muted">${owed ? 'Friends still owe you' : 'All settled 🎉'}${iOwe ? ` · you owe back ${money(iOwe)}` : ''} · not counted in your spending</div>
    ${names.map(n => { const b = by[n], bal = r2(b.paid - b.back); return `<div class="settle frow" data-fr="${esc(n)}"><span>🤝 ${esc(n)}<span class="muted"> · paid ${money(b.paid)}${b.back ? ', got back ' + money(b.back) : ''}</span></span><b class="${bal > 0 ? 'up' : 'down'}">${bal > 0 ? 'owes ' + money(bal) : bal < 0 ? 'you owe ' + money(-bal) : 'settled ✓'}</b></div>${openFriend === n ? `<div>${b.list.sort((x, y) => y.date.localeCompare(x.date)).map(e => itemHTML(e, true)).join('')}</div>` : ''}`; }).join('')}`;
}
document.addEventListener('click', ev => { const r = ev.target.closest('[data-fr]'); if (r) { openFriend = openFriend === r.dataset.fr ? null : r.dataset.fr; renderFriends(); } });
function renderInvest(k, inv, income) {
  const Y = isYearKey(k), tot = sum(inv), ever = sum(S.expenses.filter(e => !isInc(e) && isInvest(e)));
  if (!ever) { $('#invSummary').innerHTML = '<div class="muted">Nothing yet. SIPs, mutual funds, stocks, FD/RD, PPF or NPS debits in your statement land here automatically — or add them under 📈 Investments.</div>'; $('#invBody').classList.add('hidden'); return; }
  $('#invBody').classList.remove('hidden');
  $('#invSummary').innerHTML = `<div class="quad"><div><div class="muted">This ${perWord(k)}</div><b style="color:#00897b">${money(tot)}</b></div><div><div class="muted">All time</div><b>${money(ever)}</b></div></div>${income && tot ? `<div class="muted" style="margin-top:6px">${Math.round(tot / income * 100)}% of your income went into investments${tot / income >= .2 ? ' — superb! 🎯' : tot / income >= .1 ? ' — good going 👍' : ' — try to nudge it towards 20%'}</div>` : ''}`;
  donut($('#invDonut'), $('#invLegend'), $('#invDetail'), inv.map(e => ({ ...e, cat: instrOf(e) })), [...INSTR, INSTR_OTHER], 'inv');
  const ms = Y ? [...Array(12)].map((_, i) => k + '-' + pad(i + 1)) : [...Array(6)].map((_, i) => shiftMonth(k, i - 5));
  const vals = ms.map(m => sum(spendIn(m).filter(isInvest).filter(e => !dSel.inv || instrOf(e) === dSel.inv))), mx = Math.max(...vals, 1);
  $('#invBarsTitle').textContent = (dSel.inv ? dSel.inv + ' · ' : '') + (Y ? 'Invested each month' : 'Invested — last 6 months');
  const B = canvasCtx($('#invBars'));
  if (B.w > 20) {
    const n = ms.length, bw = B.w / n, top = 16, ch = B.h - top - 20, hi = ms.indexOf(month);
    ms.forEach((m, i) => {
      const v = vals[i], bh = v / mx * ch, x0 = i * bw + bw * .2;
      B.x.fillStyle = i === hi ? '#00897b' : '#00897b66'; B.x.beginPath(); B.x.roundRect ? B.x.roundRect(x0, top + ch - bh, bw * .6, bh, [3, 3, 0, 0]) : B.x.rect(x0, top + ch - bh, bw * .6, bh); B.x.fill();
      B.x.textAlign = 'center'; B.x.font = '11px system-ui';
      if (v > 0 && n <= 6) { B.x.fillStyle = css('--text'); B.x.fillText(short(v), i * bw + bw / 2, top + ch - bh - 4); }
      B.x.fillStyle = i === hi ? css('--text') : css('--muted'); B.x.fillText(monthLabel(m, true).slice(0, 3), i * bw + bw / 2, B.h - 5);
    });
  }
}
function pickCat(key, name) { dSel[key] = dSel[key] === name ? null : name; if (key === 'out' && dSel.out) dSel.in = null; if (key === 'in' && dSel.in) dSel.out = null; renderStats(); }
['#donut', '#incDonut', '#invDonut'].forEach(id => $(id).addEventListener('click', ev => {
  const cv = ev.currentTarget, g = cv._g; if (!g) return;
  const r = cv.getBoundingClientRect(), dx = ev.clientX - r.left - g.cx, dy = ev.clientY - r.top - g.cy, d = Math.hypot(dx, dy);
  if (d < g.ri) { if (dSel[cv.dataset.k]) { dSel[cv.dataset.k] = null; renderStats(); } return; }
  if (d > g.r + 6) return;
  let a = Math.atan2(dy, dx); if (a < -Math.PI / 2) a += 2 * Math.PI;
  const s = g.slices.find(s => a >= s.a0 && a < s.a1); if (s) pickCat(cv.dataset.k, s.name);
}));
document.addEventListener('click', ev => {
  const l = ev.target.closest('[data-dc]'); if (l) return pickCat(l.dataset.dk, l.dataset.dc);
  const c = ev.target.closest('[data-dclear]'); if (c) { dSel[c.dataset.dclear] = null; renderStats(); }
});

// ---------- fun facts ----------
let factIdx = Math.floor(Math.random() * 50);
const nice = n => esc(String(n || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()));
const isInvest = e => INVEST_RE.test(e.cat) || INVEST_RE.test(e.note);
function funFacts(m) {
  const all = spendIn(m), inv = all.filter(isInvest), ex = all.filter(e => !isInvest(e)), tot = sum(ex), F = [], Y = isYearKey(m), per = 'this ' + perWord(m);
  // Investments are good money moves: never suggest cutting them — cheer them instead.
  if (inv.length) F.push(`📈 You put <b>${money(sum(inv))}</b> into investments ${per}. Future-you just sent a thank-you note! Keep it automatic so it happens before the spending does.`);
  if (ex.length < 3) return F;
  const prev = sum(spendIn(prevKey(m)).filter(e => !isInvest(e)));
  const days = daysIn(m), daily = tot / days;
  const food = ex.filter(e => /swiggy|zomato/i.test(e.note));
  if (food.length >= 2) F.push(`🛵 You ordered from Swiggy/Zomato <b>${food.length} times</b> (${money(sum(food))}). Your delivery partner may know your address better than your relatives! Cook just twice a week and save about <b>${money(Math.round(sum(food) * .4))}</b> a month.`);
  const chai = Math.round(tot / 15);
  F.push(`☕ ${Y ? 'This year' : 'This month'}'s spending = <b>${chai.toLocaleString('en-IN')} cups</b> of ₹15 chai. That's one chai a day for <b>${(chai / 365).toFixed(1)} years</b>! Skipping one "small treat" a day adds up fast.`);
  const big = ex.reduce((a, b) => b.amount > a.amount ? b : a);
  F.push(`💸 Biggest splurge: <b>${money(big.amount)}</b> on ${nice(big.note || big.cat)}. Hope it sparked joy ✨ Next time, try the 24-hour rule — if you still want it tomorrow, go ahead.`);
  const small = ex.filter(e => e.amount < 200);
  if (small.length >= 5) F.push(`💧 <b>${small.length} tiny spends</b> under ₹200 added up to <b>${money(sum(small))}</b>. That's exactly how money trickles away — drop by drop. Try a daily limit for small stuff!`);
  F.push(`😴 You spend about <b>${money(Math.round(daily))} a day</b> — even on days you stayed home in pyjamas. Your wallet works night shifts! One no-spend day a week saves ~<b>${money(Math.round(daily * 4))}</b> a month.`);
  const isWk = e => { const d = new Date(e.date + 'T00:00').getDay(); return d === 0 || d === 6; };
  const wk = ex.filter(isWk), wkAvg = sum(wk) / (days * 2 / 7), wdAvg = sum(ex.filter(e => !isWk(e))) / (days * 5 / 7);
  if (wk.length && wdAvg && wkAvg > wdAvg * 1.3) F.push(`🎉 Weekend-you spends <b>${Math.round((wkAvg / wdAvg - 1) * 100)}% more</b> per day than weekday-you. Saturday-you buys, Monday-you pays! Plan one free weekend outing — beach, park or a long walk.`);
  if (prev && tot > prev * 1.1) F.push(`🚰 Spending is <b>up ${Math.round((tot / prev - 1) * 100)}%</b> from last ${perWord(m)}. Your money is trickling faster than usual — time to tighten the tap!`);
  if (prev && tot < prev * .9) F.push(`🏆 Spending is <b>down ${Math.round((1 - tot / prev) * 100)}%</b> from last ${perWord(m)} — your wallet is doing a happy dance! Move the ${money(prev - tot)} you saved into savings before it escapes.`);
  const cnt = {}; ex.forEach(e => { const k = keyOf(e.note); if (k.length > 2) { cnt[k] = cnt[k] || { n: 0, v: 0, name: e.note }; cnt[k].n++; cnt[k].v += e.amount; } });
  const top = Object.values(cnt).sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 3) F.push(`📍 ${nice(top.name)} is your most visited place: <b>${top.n} times</b>, ${money(top.v)}. At this point, ask them for a loyalty discount 😄`);
  const byC = {}; ex.forEach(e => byC[e.cat] = (byC[e.cat] || 0) + e.amount); const tc = Object.keys(byC).sort((a, b) => byC[b] - byC[a])[0];
  F.push(`✂️ ${cat(tc).icon} ${esc(tc)} is your biggest category (${money(byC[tc])}). Cutting it by just 10% saves <b>${money(Math.round(byC[tc] * .1 * (Y ? 1 : 12)))} a year</b> — a weekend getaway, for free!`);
  const upi = ex.filter(e => e.mode === 'UPI');
  if (upi.length / ex.length > .6) F.push(`📱 <b>${Math.round(upi.length / ex.length * 100)}%</b> of your spends were UPI. Scan, pay, forget — the holy trinity! Check your UPI history weekly so "just ₹50" doesn't quietly become ₹5,000.`);
  const fuel = ex.filter(e => /petrol|fuel|hpcl|bpcl|iocl|indian oil|shell/i.test(e.note));
  if (fuel.length) F.push(`⛽ Your vehicle ate <b>${money(sum(fuel))}</b> of fuel ${per} — it's eating better than some of us! Gentle acceleration and correct tyre pressure stretch every litre.`);
  const incs = incomeIn(m), income = sum(incs.filter(e => !isRefund(e))), net = tot - sum(incs.filter(isRefund));
  if (income > 0) { const sv = income - net; if (sv > 0) { const yr = Y ? sv : sv * 12; F.push(`🏦 You saved <b>${money(sv)}</b> ${per}${inv.length ? ` (including ${money(sum(inv))} invested — nice!)` : ''}.${Y ? '' : ` Keep it up and that's <b>${money(yr)}</b> in a year`} — ${Math.max(1, Math.floor(yr / 25000))} Goa trip${yr >= 50000 ? 's' : ''}' worth (but invest most of it 😉).`); }
    else if (sum(inv)) F.push(`🚨 Spending ate up all your income ${per} — even before counting the ${money(sum(inv))} you invested. Protect the investing, trim the wants: 50% needs, 30% wants, 20% savings.`); else F.push(`🚨 You spent <b>${money(-sv)} more</b> than you earned. Your wallet has filed a complaint! Try the 50-30-20 rule: 50% needs, 30% wants, 20% savings.`); }
  return F;
}
// Home screen uses the latest month that has spending (e.g. last month's statement).
const factMonth = () => mk(S.expenses.filter(e => !isInc(e)).map(e => e.date).sort().pop() || today());
function renderFact(el, m) {
  const F = funFacts(m);
  if (!F.length) { el.innerHTML = '<div class="fact-h"><b>😄 Fun fact</b></div><div class="muted">Upload a statement or add a few expenses and I\'ll roast your spending (nicely).</div>'; return; }
  el.innerHTML = `<div class="fact-h"><b>😄 Fun fact</b><button class="link" data-fact="1">Another ↻</button></div><div class="fact">${F[factIdx % F.length]}</div>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-fact]')) { factIdx++; renderFact(e.target.closest('.card'), view === 'stats' ? pKey() : factMonth()); } });

function renderBudgets(ex, mult = 1) {
  if ($('#budgetList').contains(document.activeElement)) return;
  let tb = 0, ts = 0;
  $('#budgetTitle').textContent = mult > 1 ? 'Budgets this year (monthly × 12)' : 'Monthly budgets';
  $('#budgetList').innerHTML = S.categories.map((c, i) => {
    if (c.name === OWE_OUT) return '';
    const sp = sum(ex.filter(e => e.cat === c.name)), cb = c.budget * mult; if (cb) { tb += cb; ts += sp; } const p = cb ? sp / cb : 0;
    return `<div style="margin:12px 0"><div class="row" style="align-items:center"><div style="flex:2">${c.icon} <b>${esc(c.name)}</b><div class="muted">${money(sp)}${cb ? ` · ${sp <= cb ? money(cb - sp) + ' left' : money(sp - cb) + ' over'}` : ''}</div></div><input type="number" inputmode="numeric" min="0" step="100" value="${c.budget || ''}" placeholder="No limit" data-b="${i}" style="flex:1;margin:0"></div>${cb ? `<div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${barColor(p)}"></i></div>` : ''}</div>`;
  }).join('');
  const p = tb ? ts / tb : 0;
  $('#budgetTotal').innerHTML = tb ? `<div class="big" style="font-size:22px">${money(ts)} <span class="muted">of ${money(tb)}</span></div><div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${barColor(p)}"></i></div>` : '';
}
$('#budgetList').onchange = e => { const i = e.target.closest('[data-b]'); if (!i) return; S.categories[+i.dataset.b].budget = Math.max(0, parseFloat(i.value) || 0); i.blur(); saveMeta(); toast('Budget saved'); };
window.addEventListener('resize', () => { if (view === 'stats') renderStats(); });

// ---------- Settings ----------
function renderSettings() {
  if ($('#v-settings').contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  renderAccount();
  $('#peopleList').innerHTML = S.people.map((p, i) => `<span class="pill">${esc(p)}${S.people.length > 1 ? `<button data-rp="${i}" aria-label="Remove">×</button>` : ''}</span>`).join('');
  $('#incEdit').innerHTML = S.incCats.map((c, i) => `<div class="catrow" data-l="incCats" data-i="${i}"><input class="e" value="${esc(c.icon)}" data-k="icon" maxlength="4"><input value="${esc(c.name)}" data-k="name" maxlength="24"><input type="color" value="${c.color}" data-k="color"><button class="small" data-del="${i}">✕</button></div>`).join('');
  $('#catEdit').innerHTML = S.categories.map((c, i) => `<div class="catrow" data-l="categories" data-i="${i}"><input class="e" value="${esc(c.icon)}" data-k="icon" maxlength="4"><input value="${esc(c.name)}" data-k="name" maxlength="24"><input type="color" value="${c.color}" data-k="color"><button class="small" data-del="${i}">✕</button></div>`).join('');
  $('#ruleList').innerHTML = S.rules.length ? S.rules.map((r, i) => { const c = cat(r.cat); return `<div class="rule"><span>“${esc(r.k)}”</span><span>→ ${c.icon} ${esc(c.name)}</span><button class="small" data-rr="${i}" aria-label="Delete rule">✕</button></div>`; }).join('') : '<div class="muted">No rules yet.</div>';
  $('#ruleCat').innerHTML = '<optgroup label="Spending">' + S.categories.map(c => `<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join('') + '</optgroup><optgroup label="Income">' + S.incCats.map(c => `<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join('') + '</optgroup>';
}
function renderAccount() {
  const el = $('#account');
  if (!configured) { el.innerHTML = '<div class="label" style="margin-top:0">Account</div><div class="muted">Cloud sync isn\'t set up. Data stays on this phone.</div>'; return; }
  if (!fb || !authKnown) { el.innerHTML = `<div class="label" style="margin-top:0">Account</div><div class="muted">${authKnown ? 'Sign-in unavailable (offline). Data is saved on this phone.' : 'Connecting…'}</div>`; return; }
  if (user) {
    el.innerHTML = `<div class="label" style="margin-top:0">Account</div><div>Signed in as <b>${esc(user.email || user.displayName || 'you')}</b></div><div class="muted">Everything syncs to your account. On a new phone, just sign in.</div>
      <label>Your name in trips<input id="myName" value="${esc(myName())}" maxlength="30"></label>
      <button id="signOut" style="width:100%;margin-top:12px">Sign out</button>`;
    return;
  }
  el.innerHTML = `<div class="label" style="margin-top:0">Account</div><div class="muted">Sign in to back up automatically, use Trickle on any phone, and share trips live.</div>
    <button class="gbtn" id="gSign"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
    <div class="label" style="text-align:center">or with email</div>
    <input id="aEmail" type="email" placeholder="Email" autocomplete="email"><input id="aPass" type="password" placeholder="Password (6+ characters)" autocomplete="current-password">
    <div class="btns" style="margin:10px 0 0"><button id="aIn">Sign in</button><button id="aUp">Create account</button></div>
    <button class="link" id="aReset" style="margin-top:6px">Forgot password?</button>`;
}
$('#account').onclick = async ev => {
  const id = ev.target.closest('button') && ev.target.closest('button').id; if (!id || !fb) return;
  const A = fb.A, em = () => ($('#aEmail').value || '').trim(), pw = () => $('#aPass').value || '';
  try {
    if (id === 'gSign') await googleSignIn();
    else if (id === 'aIn') { if (!em() || !pw()) return toast('Enter email and password'); await A.signInWithEmailAndPassword(fb.auth, em(), pw()); }
    else if (id === 'aUp') { if (!em() || !pw()) return toast('Enter email and password'); await A.createUserWithEmailAndPassword(fb.auth, em(), pw()); toast('Account created'); }
    else if (id === 'aReset') { if (!em()) return toast('Type your email first'); await A.sendPasswordResetEmail(fb.auth, em()); toast('Reset link sent to ' + em(), 4000); }
    else if (id === 'signOut') { if (confirm('Sign out? Your data stays safe in your account.')) await A.signOut(fb.auth); }
  } catch (e) { toast(authMsg(e), 4500); }
};
$('#account').onchange = ev => { if (ev.target.id === 'myName') { const v = ev.target.value.trim(); if (v) { S.name = v; ev.target.blur(); saveMeta(); toast('Name saved'); } } };
$('#addPerson').onclick = () => { const n = $('#newPerson').value.trim(); if (!n) return; if (S.people.some(p => p.toLowerCase() === n.toLowerCase())) return toast('Already added'); S.people.push(n); $('#newPerson').value = ''; saveMeta(); };
$('#peopleList').onclick = e => { const b = e.target.closest('[data-rp]'); if (!b) return; const p = S.people[+b.dataset.rp]; if (!confirm(`Remove ${p}? Their past expenses stay.`)) return; S.people.splice(+b.dataset.rp, 1); if (S.lastPerson === p) S.lastPerson = S.people[0]; saveMeta(); };
const catEditChange = e => {
  const row = e.target.closest('.catrow'), k = e.target.dataset.k; if (!row || !k) return;
  const L = S[row.dataset.l], c = L[+row.dataset.i], v = e.target.value.trim(); e.target.blur();
  if (k === 'name') {
    if (c.name === OWE_OUT || c.name === OWE_IN) { toast('This one is built in — change its icon or colour only'); schedule(); return; }
    if (!v || [...S.categories, ...S.incCats].some(o => o !== c && o.name.toLowerCase() === v.toLowerCase())) { toast('Name empty or already used'); schedule(); return; }
    const old = c.name; c.name = v; S.rules.forEach(r => { if (r.cat === old) r.cat = v; }); if (selCat === old) selCat = v; if (selInc === old) selInc = v;
    const moved = allExp().filter(x => x.cat === old).map(x => ({ ...x, cat: v })); if (moved.length) putMany(moved);
  } else c[k] = v || c[k];
  saveMeta();
};
$('#catEdit').onchange = catEditChange; $('#incEdit').onchange = catEditChange;
$('#catEdit').onclick = $('#incEdit').onclick = e => { const b = e.target.closest('[data-del]'); if (!b) return; const L = S[b.closest('.catrow').dataset.l]; const c = L[+b.dataset.del]; if (c.name === OWE_OUT || c.name === OWE_IN) return toast('This one is built in'); const n = allExp().filter(x => x.cat === c.name).length; if (n) return toast(`Used by ${n} entr${n > 1 ? 'ies' : 'y'} — rename it instead`); if (L.length <= 1) return; L.splice(+b.dataset.del, 1); S.rules = S.rules.filter(r => r.cat !== c.name); saveMeta(); };
$('#addInc').onclick = () => { let n = 'New income', i = 2; while (cat(n).icon !== '🏷️') n = 'New income ' + i++; S.incCats.push({ name: n, icon: '💰', color: '#7cb342' }); saveMeta(); render(); const ins = $$('#incEdit input[data-k=name]'); ins[ins.length - 1].focus(); ins[ins.length - 1].select(); };
$('#addCat').onclick = () => { let n = 'New category', i = 2; while (S.categories.some(c => c.name === n)) n = 'New category ' + i++; S.categories.push({ name: n, icon: '🏷️', color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'), budget: 0 }); saveMeta(); render(); const ins = $$('#catEdit input[data-k=name]'); ins[ins.length - 1].focus(); ins[ins.length - 1].select(); };
$('#wipe').onclick = () => { if (!S.expenses.length) return toast('Nothing to delete'); if (!confirm(`Delete all ${S.expenses.length} personal expenses${cloud ? ' from your account' : ' on this phone'}? Trips are kept. Save a backup first!`)) return; if (prompt('Type DELETE to confirm') !== 'DELETE') return; putMany([...S.expenses], true); toast('Personal expenses deleted'); };

// ---------- category rules & quick change ----------
const keyOf = n => String(n || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
function ruleFor(text, type) { const t = keyOf(text); if (!t) return null; const L = type === 'in' ? S.incCats : S.categories; const r = [...S.rules].sort((a, b) => b.k.length - a.k.length).find(r => r.k && t.includes(r.k) && L.some(c => c.name === r.cat)); return r ? r.cat : null; }
function setRule(k, n) { k = keyOf(k); if (k.length < 2) return; const r = S.rules.find(r => r.k === k); if (r) r.cat = n; else S.rules.push({ k, cat: n }); }
function guessCat(text) { const r = ruleFor(text); if (r) return r; const t = String(text).toLowerCase(); if (INVEST_RE.test(t)) { const c = S.categories.find(c => INVEST_RE.test(c.name)); if (c) return c.name; } for (const [n, re] of KEYWORDS) if (re.test(t) && S.categories.some(c => c.name === n)) return n; return S.categories.some(c => c.name === 'Other') ? 'Other' : S.categories[0].name; }
function guessInc(text) { const r = ruleFor(text, 'in'); if (r) return r; const t = String(text).toLowerCase(); for (const [n, re] of INC_KEYWORDS) if (re.test(t) && S.incCats.some(c => c.name === n)) return n; return S.incCats.some(c => c.name === 'Other income') ? 'Other income' : S.incCats[0].name; }
function guessMode(t) { t = String(t).toUpperCase(); if (/^UPI|\bUPI\b/.test(t)) return 'UPI'; if (/^POS|\bPOS\b|CARD|^ME DC|^VPS|^IPS/.test(t)) return 'Card'; if (/^ATW|^NWD|^EAW|ATM|CASH/.test(t)) return 'Cash'; return 'Bank'; }
function cleanNarration(n) { const p = n.split('-'); if (/^UPI/i.test(n) && p.length > 1 && p[1].trim()) return p[1].trim().slice(0, 60); return n.replace(/^(POS|ME DC|VPS|IPS)\s+[\dX*]+\s+/i, '').replace(/\s+/g, ' ').trim().slice(0, 60); }

let sheetHandler = null;
function openSheet(html, onClick) { $('#sheet').innerHTML = html; sheetHandler = onClick; $('#sheetBg').classList.add('on'); }
function closeSheet() { $('#sheetBg').classList.remove('on'); sheetHandler = null; }
$('#sheetBg').onclick = e => { if (e.target.id === 'sheetBg') closeSheet(); };
$('#sheet').onclick = e => { if (sheetHandler) sheetHandler(e); };
function openCatSheet(id, t) {
  const e = findExp(id, t); if (!e) return;
  openSheet(`<h3>Change category</h3><div class="muted" style="margin-bottom:12px">${esc(e.note || e.cat)} · ${money(e.amount)}</div><div class="chips">${(isInc(e) ? S.incCats : S.categories).map(c => `<button class="chip ${c.name === e.cat ? 'sel' : ''}" data-pick="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>`, ev => {
    const b = ev.target.closest('[data-pick]'); if (!b) return; if (b.dataset.pick === e.cat) return closeSheet();
    if (b.dataset.pick === OWE_OUT || b.dataset.pick === OWE_IN) return askFriend('Which friend?', `${esc(e.note || e.cat)} · ${money(e.amount)}`, n => markFriend([e], n));
    const ne = { ...e, cat: b.dataset.pick }; delete ne.who; putExp(ne); offerRemember(ne);
  });
}
function offerRemember(e) {
  const k = keyOf(e.note), c = cat(e.cat);
  if (k.length < 2) { closeSheet(); toast(`Moved to ${c.name}`); return; }
  const similar = allExp().filter(x => x.id !== e.id && x.cat !== e.cat && isInc(x) === isInc(e) && keyOf(x.note) === k);
  openSheet(`<h3>Moved to ${c.icon} ${esc(c.name)}</h3><p class="muted">Do the same for “${esc(e.note)}” from now on?${similar.length ? ` There ${similar.length > 1 ? 'are' : 'is'} also ${similar.length} other expense${similar.length > 1 ? 's' : ''} with this name.` : ''}</p>
    <button class="primary" data-a="all">${similar.length ? `Move ${similar.length} more & remember` : 'Remember for future'}</button><button style="width:100%;margin-top:8px" data-a="one">Just this one</button>`, ev => {
    const a = ev.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'all') { if (similar.length) putMany(similar.map(x => ({ ...x, cat: e.cat }))); setRule(e.note, e.cat); saveMeta(); toast(similar.length ? `Moved ${similar.length + 1} expenses · rule saved` : 'Rule saved'); }
    closeSheet();
  });
}
$('#addRule').onclick = () => {
  const k = keyOf($('#ruleKey').value), n = $('#ruleCat').value; if (k.length < 2) return toast('Enter a word (2+ letters)');
  setRule(k, n); const wantInc = S.incCats.some(c => c.name === n); const m = allExp().filter(x => keyOf(x.note).includes(k) && x.cat !== n && isInc(x) === wantInc);
  if (m.length && confirm(`Also move ${m.length} existing expense${m.length > 1 ? 's' : ''} matching “${k}”?`)) putMany(m.map(x => ({ ...x, cat: n })));
  $('#ruleKey').value = ''; saveMeta(); toast('Rule added');
};
$('#ruleList').onclick = e => { const b = e.target.closest('[data-rr]'); if (!b) return; S.rules.splice(+b.dataset.rr, 1); saveMeta(); };

// ================= export =================
async function deliver(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const csvCell = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function exportCSV(list, base) {
  if (!list.length) return toast('Nothing to download yet');
  const rows = [['Date', 'Type', 'Amount', 'Category', 'Mode', 'PaidBy', 'Note', 'Friend', 'Split', 'Trip', 'Id'], ...[...list].sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, isInc(e) ? 'Income' : 'Expense', e.amount, e.cat, e.mode, e.person, e.note, e.who || '', hasSplit(e) ? e.split.map(x => x.who + '=' + x.amount).join('; ') : '', e.trip ? (trip(e.trip) || {}).name || '' : '', e.id])];
  deliver(`${base}-${today()}.csv`, '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
}
$('#dlCsv').onclick = () => exportCSV(S.expenses.concat(...Object.entries(TE).map(([id, l]) => l.map(e => ({ ...e, trip: id })))), 'trickle');
$('#expBackup').onclick = () => deliver(`trickle-backup-${today()}.json`, JSON.stringify({ app: 'trickle', v: 3, ...metaOf(S), expenses: S.expenses, trips: S.trips.map(t => ({ id: t.id, name: t.name, start: t.start, end: t.end, budget: t.budget, members: t.members })), tripExp: TE }), 'application/json');

// ================= import =================
let fileTarget = '';
$('#uploadBtn').onclick = () => { fileTarget = $('#impTarget').value; $('#impFile').click(); };
$('#impFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f, fileTarget); };
function parseCSV(t, d = ',') { const out = []; let row = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; } else if (ch === '"') q = true; else if (ch === d) { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; } else f += ch; } if (f || row.length) { row.push(f); out.push(row); } return out.map(r => r.map(c => c.trim())); }
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDate(s) {
  s = String(s ?? '').trim(); let m;
  if (m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if (m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/)) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; if (+m[2] > 12) return null; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  if (m = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3})[a-z]*[\s\-\/,]+(\d{2,4})/)) { const mo = MON[m[2].toLowerCase()]; if (!mo) return null; const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(mo)}-${pad(m[1])}`; }
  return null;
}
const num = s => { const v = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(v) ? 0 : v; };
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = XLSX_URL; s.onload = res; s.onerror = () => rej(new Error('Excel reader needs internet the first time')); document.head.appendChild(s); });
  return window.XLSX;
}
async function readExcel(file) { const X = await loadXLSX(); const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); const ws = wb.Sheets[wb.SheetNames[0]]; return X.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'dd/mm/yyyy', defval: '' }).map(r => r.map(c => String(c ?? '').trim())); }
async function importFile(file, target) {
  try {
    let rows; const name = file.name.toLowerCase();
    if (/\.xlsx?$/.test(name)) rows = await readExcel(file);
    else {
      const text = (await file.text()).replace(/^﻿/, '');
      if (/^\s*[{[]/.test(text)) return restoreBackup(JSON.parse(text));
      if (/^\s*</.test(text)) rows = await readExcel(file);
      else { const head = text.slice(0, 3000); rows = parseCSV(text, (head.match(/\t/g) || []).length > (head.match(/,/g) || []).length ? '\t' : ','); }
    }
    const res = rowsToExpenses(rows);
    if (!res.list.length) return toast('No spends found in that file', 3500);
    showPreview(res, target);
  } catch (err) { console.error(err); toast('Could not read file: ' + err.message, 5000); }
}
function rowsToExpenses(rows) {
  const low = r => r.map(c => String(c ?? '').toLowerCase().trim());
  const hi = rows.findIndex(r => { const h = low(r); return h.some(c => /date/.test(c)) && h.some(c => /withdrawal|debit|^amount/.test(c)); });
  if (hi < 0) throw new Error('no header row with Date and Withdrawal/Debit/Amount columns');
  const H = low(rows[hi]), col = re => H.findIndex(h => re.test(h)), now = Date.now(), list = [];
  const wcol = col(/withdrawal|debit/), dcol = col(/deposit|credit/);
  if (wcol >= 0) {
    let cd = H.findIndex(h => /date/.test(h) && !/value/.test(h)); if (cd < 0) cd = col(/date/);
    const cn = col(/narration|description|particular|remark|detail|transaction/), cr = col(/ref|chq|cheque/);
    rows.slice(hi + 1).forEach((r, i) => {
      const d = parseDate(r[cd]), amt = num(r[wcol]), dep = dcol >= 0 ? num(r[dcol]) : 0; if (!d) return;
      const n = String(cn >= 0 ? r[cn] ?? '' : '').trim();
      if (!(amt > 0)) { if (dep > 0) list.push({ id: 'i' + hash(d + '|' + dep + '|' + n + '|' + (cr >= 0 ? r[cr] : '')), ts: now - i, type: 'in', date: d, amount: r2(dep), cat: guessInc(n), mode: guessMode(n), person: '', note: cleanNarration(n), raw: n }); return; }
      list.push({ id: 'b' + hash(d + '|' + amt + '|' + n + '|' + (cr >= 0 ? r[cr] : '')), ts: now - i, date: d, amount: r2(amt), cat: guessCat(n), mode: guessMode(n), person: '', note: cleanNarration(n), raw: n });
    });
    return { kind: 'bank', list };
  }
  const cty = col(/^type$/), cd = col(/^date$/), ca = col(/^amount/), cc = col(/categ/), cm = col(/mode/), cp = col(/paid ?by|person/), cn = col(/note|desc/), ct = col(/^trip$/), ci = col(/^id$/), cw = col(/^friend$/), cs = col(/^split$/);
  rows.slice(hi + 1).forEach((r, i) => {
    const d = parseDate(r[cd]), amt = num(r[ca]); if (!d || !(amt > 0)) return;
    const note = cn >= 0 ? String(r[cn] || '') : '', inc = cty >= 0 && /^in/i.test(r[cty] || '');
    list.push({ id: (ci >= 0 && r[ci]) || 'c' + hash(d + '|' + amt + '|' + note), ts: now - i, ...(inc ? { type: 'in' } : {}), date: d, amount: r2(amt), cat: cc >= 0 && r[cc] ? catName(r[cc]) : inc ? guessInc(note) : guessCat(note), mode: MODES.includes(r[cm]) ? r[cm] : 'UPI', person: cp >= 0 ? String(r[cp] || '') : '', note, ...(cw >= 0 && r[cw] ? { who: String(r[cw]).trim() } : {}), ...(cs >= 0 && r[cs] ? { split: String(r[cs]).split(';').map(x => x.split('=')).filter(x => x.length === 2 && x[0].trim() && +x[1] > 0).map(([w, a]) => ({ who: w.trim(), amount: r2(+a) })), splitBy: 'amount', meShares: 1 } : {}), tripName: ct >= 0 ? String(r[ct] || '').trim() : '' });
  });
  return { kind: 'csv', list };
}
let PV = null;
function destOf(e, target) { if (target) return target; if (e.tripName) { const t = tripByName(e.tripName); return t ? t.id : 'new:' + e.tripName; } return ''; }
function showPreview(res, target) {
  const t = target && trip(target);
  if (target) res.list = res.list.filter(e => !isInc(e));
  if (!res.list.length) return toast('No spends found for this trip', 3500);
  const existing = {}; const seen = dest => existing[dest] || (existing[dest] = { ids: new Set((dest && !dest.startsWith('new:') ? tripExp(dest) : dest ? [] : S.expenses).map(x => x.id)), sigs: new Set((dest && !dest.startsWith('new:') ? tripExp(dest) : dest ? [] : S.expenses).map(sig)) });
  const rows = res.list.sort((a, b) => b.date.localeCompare(a.date)).map(e => {
    const dest = destOf(e, target), ex = seen(dest), dup = ex.ids.has(e.id) || ex.sigs.has(sig(e));
    const xfer = res.kind === 'bank' && (isInc(e) ? OWN_IN_RE : TRANSFER_RE).test(e.raw || e.note), out = t && t.start && (e.date < t.start || e.date > (t.end || t.start));
    return { e, dest, dup, on: !dup && !xfer && !out, why: dup ? 'Already added' : xfer ? (isInc(e) ? 'Looks like money from your own account' : 'Looks like a card bill or transfer') : out ? 'Outside trip dates' : '' };
  });
  const people = peopleFor(target);
  PV = { kind: res.kind, target, rows, person: target ? (people.includes(meIn(t)) ? meIn(t) : people[0]) : (people.includes(S.lastPerson) ? S.lastPerson : people[0]) };
  const nIn = rows.filter(x => isInc(x.e)).length, nOut = rows.length - nIn;
  openSheet(`<h3>${nOut ? nOut + ' spend' + (nOut > 1 ? 's' : '') : ''}${nOut && nIn ? ' and ' : ''}${nIn ? nIn + ' income' : ''} found</h3>
    <div class="muted">Adding to <b>${t ? '✈ ' + esc(t.name) : res.kind === 'csv' && rows.some(r => r.dest) ? 'personal expenses and trips in the file' : 'personal expenses'}</b>. Untick anything that isn't a real expense.</div>
    ${res.kind === 'bank' ? `<label>${nIn ? 'Paid / received by' : 'Paid by'}<select id="pvPerson">${opts(people, PV.person)}</select></label>` : ''}
    <div class="seg pvf" style="margin:12px 0 0"><button type="button" data-f="all" class="on">All <span></span></button><button type="button" data-f="on">To import <span></span></button><button type="button" data-f="off">Skipped <span></span></button></div>
    <div class="pv">${rows.map((x, i) => { const c = cat(x.e.cat); return `<label class="pvrow ${x.on ? '' : 'off'}"><input type="checkbox" data-i="${i}" ${x.on ? 'checked' : ''} ${x.dup ? 'disabled' : ''}><span class="ic" style="background:${c.color}22;width:30px;height:30px;font-size:15px">${c.icon}</span><span class="mid"><span class="t">${esc(x.e.note || c.name)}</span><span class="s">${niceDate(x.e.date)} · ${esc(c.name)}${x.e.tripName && !target ? ' · ✈ ' + esc(x.e.tripName) : ''}${x.why ? ` · <span class="why">${x.why}</span>` : ''}</span></span><span class="a${isInc(x.e) ? ' inc' : ''}">${isInc(x.e) ? '+' : ''}${money(x.e.amount)}</span></label>`; }).join('')}</div>
    <button class="primary" id="pvGo"></button><button style="width:100%;margin-top:8px" id="pvCancel">Cancel</button>`, ev => {
    const f = ev.target.closest('[data-f]');
    if (f) { $$('#sheet [data-f]').forEach(b => b.classList.toggle('on', b === f)); $$('#sheet .pvrow').forEach((r, i) => r.classList.toggle('hidden', f.dataset.f !== 'all' && (f.dataset.f === 'on') !== PV.rows[i].on)); return; }
    if (ev.target.id === 'pvCancel') { PV = null; return closeSheet(); }
    if (ev.target.id === 'pvGo') return doImport();
  });
  $('#sheet').onchange = ev => { if (ev.target.id === 'pvPerson') PV.person = ev.target.value; const i = ev.target.dataset.i; if (i !== undefined) { PV.rows[+i].on = ev.target.checked; ev.target.closest('.pvrow').classList.toggle('off', !ev.target.checked); pvButton(); } };
  pvButton();
}
function pvButton() { const cnt = { all: PV.rows.length, on: PV.rows.filter(x => x.on).length }; cnt.off = cnt.all - cnt.on; $$('#sheet [data-f]').forEach(b => b.querySelector('span').textContent = cnt[b.dataset.f]); const sel = PV.rows.filter(x => x.on), o = sum(sel.filter(x => !isInc(x.e)).map(x => x.e)), i = sum(sel.filter(x => isInc(x.e)).map(x => x.e)); const b = $('#pvGo'); b.disabled = !sel.length; b.textContent = sel.length ? `Import ${sel.length}${o ? ' · −' + money(o) : ''}${i ? ' · +' + money(i) : ''}` : 'Nothing selected'; }
function doImport() {
  const sel = PV.rows.filter(x => x.on); if (!sel.length) return;
  let metaChanged = false; const newTrips = {}, out = [];
  sel.forEach(({ e: src, dest }) => {
    const e = { ...src }; delete e.raw; delete e.tripName;
    if (dest.startsWith('new:')) { const name = dest.slice(4); if (!newTrips[name]) { newTrips[name] = { id: newTripId(), name, start: '', end: '', budget: 0, members: [] }; } dest = newTrips[name].id; }
    if (PV.kind === 'bank') e.person = PV.person;
    if (dest) { e.trip = dest; const t = newTrips[Object.keys(newTrips).find(k => newTrips[k].id === dest)] || trip(dest); if (!e.person) e.person = t.members[0] || myName(); if (t && !t.members.includes(e.person)) { t.members.push(e.person); t._dirty = true; } }
    else { delete e.trip; if (!e.person) e.person = S.lastPerson; if (!S.people.includes(e.person)) { S.people.push(e.person); metaChanged = true; } }
    if (isInc(e) ? ensureIncCat(e.cat) : ensureCat(e.cat)) metaChanged = true;
    out.push(e);
  });
  Object.values(newTrips).forEach(t => { const ds = out.filter(e => e.trip === t.id).map(e => e.date).sort(); t.start = ds[0] || ''; t.end = ds[ds.length - 1] || ''; if (!t.members.length) t.members = [myName()]; putTrip(t, true); });
  S.trips.forEach(t => { if (t._dirty) { delete t._dirty; putTrip(t, false); } });
  if (PV.kind === 'bank' && !PV.target && S.lastPerson !== PV.person) { S.lastPerson = PV.person; metaChanged = true; }
  if (metaChanged) saveMeta();
  putMany(out);
  const target = PV.target, skipped = PV.rows.length - sel.length; PV = null; closeSheet();
  toast(`Imported ${out.length}${skipped ? `, skipped ${skipped}` : ''}`, 4000);
  if (target) { curTrip = target; go('trips'); } else if (out.some(e => !e.trip)) { month = mk(out.filter(e => !e.trip).map(e => e.date).sort().pop()); go('list'); } else go('trips');
}
function restoreBackup(raw) {
  if (!raw || (!Array.isArray(raw.expenses) && !Array.isArray(raw.trips))) return toast('That file isn\'t a Trickle backup', 4000);
  const b = normalize(raw), tripN = b.trips.length, expN = b.expenses.length + Object.values(b.tripExp).reduce((n, l) => n + l.length, 0);
  if (!confirm(`Restore backup: ${expN} expenses and ${tripN} trips? Existing entries are kept and duplicates skipped.`)) return;
  b.categories.forEach(c => { if (!S.categories.some(x => x.name.toLowerCase() === c.name.toLowerCase())) S.categories.push(c); });
  b.incCats.forEach(c => { if (!S.incCats.some(x => x.name.toLowerCase() === c.name.toLowerCase())) S.incCats.push(c); });
  b.rules.forEach(r => { if (!S.rules.some(x => x.k === r.k)) S.rules.push(r); });
  b.people.forEach(p => { if (!S.people.includes(p)) S.people.push(p); });
  saveMeta();
  const ids = new Set(S.expenses.map(e => e.id)), sigs = new Set(S.expenses.map(sig));
  const add = b.expenses.filter(e => !ids.has(e.id) && !sigs.has(sig(e))); putMany(add);
  let tAdd = 0;
  b.trips.forEach(t => {
    let mine = trip(t.id) || tripByName(t.name);
    if (!mine) { mine = { ...t, id: newTripId() }; putTrip(mine, true); }
    const have = tripExp(mine.id), hid = new Set(have.map(e => e.id)), hs = new Set(have.map(sig));
    const list = (b.tripExp[t.id] || []).filter(e => !hid.has(e.id) && !hs.has(sig(e))).map(e => ({ ...e, trip: mine.id }));
    tAdd += list.length; putMany(list);
  });
  toast(`Restored ${add.length + tAdd} expenses`, 4000);
}

// ================= boot =================
useLocal();
render();
initFirebase();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) {
  // When a new version of the app is installed, reload once so the new files are used straight away.
  const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}));
}
