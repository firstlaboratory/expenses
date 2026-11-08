import { FIREBASE_CONFIG } from './firebase-config.js';

// ================= constants & helpers =================
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const LKEY = 'kharcha_v1';
const MODES = ['UPI', 'Card', 'Cash', 'Bank'];
const DEFAULT_CATS = [['Food','🍛','#e8833a'],['Groceries','🛒','#43a047'],['Transport','⛽','#1e88e5'],['Shopping','🛍️','#8e24aa'],['Bills','💡','#fb8c00'],['Rent','🏠','#6d4c41'],['House budget','🏡','#a1887f'],['Health','💊','#e53935'],['Entertainment','🎬','#00acc1'],['Travel','✈️','#3949ab'],['Stay','🏨','#5e35b1'],['Education','📚','#546e7a'],['Gifts','🎁','#d81b60'],['Investments','📈','#00897b'],['Other','📦','#9e9e9e']];
const KEYWORDS = [['Food',/swiggy|zomato|restaurant|cafe|bakery|food|dominos|kfc|mcdonald|starbucks|biryani|mess\b/],['Groceries',/bigbasket|blinkit|zepto|dmart|grocer|supermarket|instamart|more retail|reliance fresh|jiomart|vegetable/],['Transport',/uber|\bola\b|rapido|petrol|fuel|hpcl|bpcl|iocl|indian oil|shell|fastag|metro|irctc|redbus|parking|toll/],['Shopping',/amazon|flipkart|myntra|ajio|meesho|nykaa|croma|decathlon/],['Bills',/electricity|tneb|tangedco|airtel|\bjio\b|vodafone|bsnl|recharge|broadband|\bgas\b|bill|dth/],['Health',/pharm|apollo|medic|hospital|clinic|\blab\b|diagnos|1mg|netmeds/],['Entertainment',/netflix|hotstar|prime video|spotify|bookmyshow|pvr|inox|youtube/],['Stay',/oyo|hotel|resort|airbnb|homestay|lodge|treebo|fabhotel/],['Travel',/makemytrip|goibibo|indigo|air india|vistara|akasa|booking\.com|cleartrip|ixigo/],['Education',/udemy|coursera|school|college|tuition|books/],['Rent',/\brent\b|nobroker/]];
const DEFAULT_INC = [['Salary','💼','#2e7d32'],['Interest','🏦','#00897b'],['Refund','↩️','#5c6bc0','refund'],['Cashback','🎉','#f9a825','refund'],['Gift received','🎁','#ec407a'],['Other income','💰','#7cb342']];
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
const catObj = e => (isInc(e) ? S.incCats : S.categories).find(c => c.name === e.cat);
const countsOf = e => { const c = catObj(e); return (c && c.counts) || (isInc(e) ? 'income' : 'spend'); };
// Expands raw entries into what actually counts: my share of splits, friends' shares, refunds netted
// against a category, transfers marked as not counted, and friend paybacks beyond what they owed.
const memberOf = (t, who) => { if (!t || !who) return null; const w = String(who).toLowerCase().trim(), f = w.split(/\s+/)[0]; return t.members.find(m => m.toLowerCase() === w) || t.members.find(m => m.toLowerCase().split(/\s+/)[0] === f) || null; };
const sharedTrip = e => { const t = !isInc(e) && !isFriend(e) && !hasSplit(e) && !e.tripSolo && e.tripLink && trip(e.tripLink); if (!t || t.members.length < 2) return null; const me = memberOf(t, meIn(t)); return me ? { t, me } : null; };
function expand(list, withTrips) {
  const out = [];
  list.forEach(e => {
    const how = isFriend(e) ? '' : countsOf(e);
    if (how === 'skip') { out.push({ ...e, _skip: true }); return; }
    if (how === 'refund' && isInc(e)) { const c = catObj(e); if (c && c.against) { const x = { ...e, cat: c.against, amount: -e.amount, _ref: e.cat }; delete x.type; out.push(x); return; } }
    const st = sharedTrip(e);
    if (st) {   // shared trip cost I paid: only my share is my spending, the rest is owed by each member
      const others = st.t.members.filter(m => m !== st.me), per = r2(e.amount / st.t.members.length);
      out.push({ ...e, amount: r2(e.amount - per * others.length), _mine: true });
      others.forEach(m => out.push({ ...e, amount: per, cat: OWE_OUT, who: m, _share: true }));
      return;
    }
    if (!hasSplit(e) || isFriend(e)) { out.push(e); return; }
    const m = myShare(e); if (m > 0) out.push({ ...e, amount: m, _mine: true });
    e.split.forEach(sp => out.push({ ...e, amount: sp.amount, cat: OWE_OUT, who: sp.who, _share: true }));
  });
  // Trip costs a friend paid for the group: my share is my spending, and I owe it to them.
  if (withTrips) S.trips.forEach(t => {
    const me = memberOf(t, meIn(t)); if (!me || t.members.length < 2) return;
    tripExp(t.id).forEach(x => {
      if (x.link || x.settle || x.solo || isInc(x)) return;
      const payer = memberOf(t, x.person); if (!payer || payer === me) return;
      out.push({ id: x.id, trip: t.id, ts: x.ts, date: x.date, amount: r2(x.amount / t.members.length), cat: x.cat, mode: x.mode, person: S.lastPerson, note: `${x.note || x.cat} (paid by ${payer})`, who: payer, _iOwe: true });
    });
  });
  // Friend ledger: paybacks settle what the friend owes (oldest first); anything beyond that — or marked
  // "for shared costs" — was their share of spending I logged as mine, so it reduces my spending.
  const fr = out.filter(e => (isFriend(e) && e.who) || e._iOwe).sort((a, b) => a.date.localeCompare(b.date) || (isInc(a) - isInc(b)) || a.ts - b.ts), owed = {};
  fr.forEach(e => {
    const w = e.who.toLowerCase();
    if (e._iOwe) { owed[w] = r2((owed[w] || 0) - e.amount); return; }
    if (!isInc(e)) { owed[w] = (owed[w] || 0) + e.amount; return; }
    const settle = e.forShared ? 0 : Math.min(Math.max(owed[w] || 0, 0), e.amount); owed[w] = r2((owed[w] || 0) - settle);
    const extra = r2(e.amount - settle); if (extra > .004) out.push({ ...e, cat: 'Shared costs repaid', amount: extra, _shared: true });
  });
  return out;
}
let ownCache = null;
const own = () => ownCache || (ownCache = expand(S.expenses, true));
function friendLedger() {
  const fr = own().filter(e => (isFriend(e) && e.who) || e._shared || e._iOwe).sort((a, b) => a.date.localeCompare(b.date) || (isInc(a) - isInc(b)) || a.ts - b.ts), L = {};
  fr.forEach(e => {
    const k = e.who.toLowerCase(), f = L[k] || (L[k] = { name: e.who, paid: 0, back: 0, shared: 0, theyPaid: 0, owed: 0, list: [] });
    if (e._shared) { f.shared += e.amount; return; }
    f.list.push(e);
    if (e._iOwe) { f.theyPaid += e.amount; f.owed -= e.amount; }
    else if (!isInc(e)) { f.paid += e.amount; f.owed += e.amount; }
    else { f.back += e.amount; f.owed -= e.forShared ? 0 : Math.min(Math.max(f.owed, 0), e.amount); }
  });
  Object.values(L).forEach(f => { f.owed = r2(f.owed); });
  return L;
}
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
const blankMeta = () => ({ stmts: [], dismissed: [], tax: {}, houseAdded: true, notes: '', categories: DEFAULT_CATS.map(([name, icon, color]) => ({ name, icon, color, budget: 0 })), incCats: DEFAULT_INC.map(([name, icon, color, counts]) => ({ name, icon, color, ...(counts ? { counts } : {}) })), people: ['Me'], rules: [], lastPerson: 'Me', name: '' });
let S = { ...blankMeta(), expenses: [], trips: [] };
let TE = {};                       // tripId -> [expenses]
let user = null, fb = null, cloud = false, authKnown = false, pending = 0;
let unsubs = [], tripUnsubs = {}, migrated = false;
let taxRange = null, month = mk(today()), view = 'add', curTrip = null, tripTab = 'exp', noteLink = null;
let selCat = 'Food', selInc = 'Salary', selType = 'out', selMode = 'UPI', edit = null; // edit = {id, trip}

// Accepts any saved shape (v1 with category ids, v3, cloud docs) and returns names-based data.
function normalize(b) {
  const out = { ...blankMeta(), expenses: [], trips: [], tripExp: {} };
  if (!b || typeof b !== 'object') return out;
  const idMap = {};
  if (Array.isArray(b.categories) && b.categories.length) out.categories = b.categories.filter(c => c && c.name).map(c => { const n = String(c.name).slice(0, 24); if (c.id) idMap[c.id] = n; return { name: n, icon: c.icon || '🏷️', color: c.color || '#9e9e9e', budget: +c.budget || 0, ...(c.counts === 'skip' ? { counts: 'skip' } : {}) }; });
  if (Array.isArray(b.incCats) && b.incCats.length) out.incCats = b.incCats.filter(c => c && c.name).map(c => { const name = String(c.name).slice(0, 24), counts = ['income', 'refund', 'skip'].includes(c.counts) ? c.counts : (/^(refund|cashback)/i.test(name) ? 'refund' : 'income'); return { name, icon: c.icon || '💰', color: c.color || '#7cb342', ...(counts !== 'income' ? { counts } : {}), ...(counts === 'refund' && c.against ? { against: String(c.against) } : {}) }; });
  const cn = c => idMap[c] || c || 'Other';
  if (Array.isArray(b.people) && b.people.length) out.people = b.people.map(String);
  if (b.lastPerson) out.lastPerson = String(b.lastPerson);
  if (b.name) out.name = String(b.name);
  out.notes = typeof b.notes === 'string' ? b.notes : '';
  if (!out.categories.some(c => INVEST_RE.test(c.name))) { const i = out.categories.findIndex(c => c.name === 'Other'); out.categories.splice(i < 0 ? out.categories.length : i, 0, { name: 'Investments', icon: '📈', color: '#00897b', budget: 0 }); }
  if (!out.categories.some(c => c.name === OWE_OUT)) { const i = out.categories.findIndex(c => c.name === 'Other'); out.categories.splice(i < 0 ? out.categories.length : i, 0, { name: OWE_OUT, icon: '🤝', color: '#8d6e63', budget: 0 }); }
  if (!out.incCats.some(c => c.name === OWE_IN)) out.incCats.push({ name: OWE_IN, icon: '🔁', color: '#8d6e63' });
  if (!b.houseAdded && !b.fix && !out.categories.some(c => c.name.toLowerCase() === 'house budget')) { const i = out.categories.findIndex(c => c.name === 'Rent'); out.categories.splice(i < 0 ? 0 : i + 1, 0, { name: 'House budget', icon: '🏡', color: '#a1887f', budget: 0 }); }
  out.houseAdded = true;
  out.stmts = (Array.isArray(b.stmts) ? b.stmts : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.from) && /^\d{4}-\d{2}-\d{2}$/.test(x.to)).map(x => ({ from: x.from, to: x.to, ...(isFinite(+x.opening) && x.opening !== null && x.opening !== '' ? { opening: +x.opening, closing: +x.closing } : {}), n: +x.n || 0 }));
  out.dismissed = (Array.isArray(b.dismissed) ? b.dismissed : []).map(String);
  out.tax = b.tax && typeof b.tax === 'object' ? b.tax : {};
  out.rules = (Array.isArray(b.rules) ? b.rules : []).filter(r => r && r.k).map(r => ({ k: String(r.k), cat: cn(r.cat), ...(r.who ? { who: String(r.who) } : {}) }));
  const splitOf_ = e => Array.isArray(e.split) && e.split.length ? { split: e.split.filter(x => x && x.who && +x.amount > 0).map(x => ({ who: String(x.who), amount: r2(+x.amount), ...(+x.shares ? { shares: +x.shares } : {}) })), splitBy: e.splitBy === 'amount' ? 'amount' : 'shares', meShares: +e.meShares >= 0 ? +e.meShares : 1 } : {};
  const splitOf = splitOf_;
  const fixE = e => ({ id: String(e.id || uid()), ts: +e.ts || Date.now(), date: String(e.date), amount: r2(+e.amount), cat: cn(e.cat), mode: MODES.includes(e.mode) ? e.mode : 'UPI', person: String(e.person || 'Me'), note: String(e.note || ''), ...(e.type === 'in' ? { type: 'in' } : {}), ...(e.who ? { who: String(e.who) } : {}), ...(e.reviewed ? { reviewed: true } : {}), ...(e.forShared ? { forShared: true } : {}), ...(e.tripLink ? { tripLink: String(e.tripLink) } : {}), ...(e.tripSolo ? { tripSolo: true } : {}), ...(e.link ? { link: String(e.link) } : {}), ...(e.solo ? { solo: true } : {}), ...(e.settle ? { settle: true, from: String(e.from || ''), to: String(e.to || '') } : {}), ...splitOf(e) });
  const ok = e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && +e.amount > 0;
  out.expenses = (b.expenses || []).filter(ok).map(fixE);
  (b.trips || []).forEach(t => {
    if (!t) return;
    const id = String(t.id || uid());
    out.trips.push({ id, name: String(t.name || 'Trip'), start: t.start || '', end: t.end || '', budget: +t.budget || 0, notes: String(t.notes || ''), members: Array.isArray(t.members) && t.members.length ? t.members.map(String) : ['Me'] });
    const list = (b.tripExp && b.tripExp[t.id]) || t.expenses || [];
    out.tripExp[id] = list.filter(ok).map(e => ({ ...fixE(e), trip: id }));
  });
  return out;
}
function loadLocal() { try { const raw = localStorage.getItem(LKEY); return raw ? normalize(JSON.parse(raw)) : null; } catch (e) { return null; } }
const metaOf = o => ({ categories: o.categories, incCats: o.incCats, people: o.people, rules: o.rules, lastPerson: o.lastPerson, stmts: o.stmts || [], dismissed: o.dismissed || [], tax: o.tax || {}, houseAdded: true, name: o.name || '', notes: o.notes || '' });
function saveLocal() { if (cloud) return; try { localStorage.setItem(LKEY, JSON.stringify({ v: 3, ...metaOf(S), expenses: S.expenses, trips: S.trips, tripExp: TE })); } catch (e) { toast('Could not save — storage may be full'); } }
function useLocal() { const L = loadLocal() || normalize(null); TE = L.tripExp; delete L.tripExp; S = L; }

const cat = n => S.categories.find(c => c.name === n) || S.incCats.find(c => c.name === n) || [...INSTR, INSTR_OTHER].find(c => c.name === n) || { name: n || 'Other', icon: '🏷️', color: '#9e9e9e', budget: 0 };
const trip = id => S.trips.find(t => t.id === id);
const tripByName = n => S.trips.find(t => t.name.toLowerCase() === String(n).trim().toLowerCase());
const tripExp = id => TE[id] || [];
const allExp = () => S.expenses.concat(...Object.values(TE).map(l => l.filter(e => !e.link)));   // trip copies of personal expenses are not separate entries
const isInc = e => e.type === 'in';
const inMonth = m => own().filter(e => mk(e.date) === m && !isInc(e) && !isFriend(e) && !e._skip);          // spending only
const incMonth = m => own().filter(e => mk(e.date) === m && isInc(e) && !isFriend(e) && !e._skip);          // income only
const isRefund = e => isInc(e) && (e._shared || countsOf(e) === 'refund');
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
function strip(e) { const o = { date: e.date, amount: e.amount, cat: e.cat, mode: e.mode, person: e.person, note: e.note || '', ts: e.ts || Date.now() }; if (isInc(e)) o.type = 'in'; if (e.who) o.who = e.who; if (e.reviewed) o.reviewed = true; if (e.forShared && isFriend(e)) o.forShared = true; if (hasSplit(e)) { o.split = e.split; o.splitBy = e.splitBy || 'shares'; o.meShares = e.meShares ?? 1; } if (e.trip) o.trip = e.trip; if (e.tripLink && !e.trip) { o.tripLink = e.tripLink; if (e.tripSolo) o.tripSolo = true; } if (e.link) o.link = e.link; if (e.solo) o.solo = true; if (e.settle) { o.settle = true; o.from = e.from || ''; o.to = e.to || ''; } if (cloud) o.by = user.uid; return o; }
function eRef(e) { const F = fb.F; return e.trip ? F.doc(fb.db, 'trips', e.trip, 'expenses', e.id) : F.doc(fb.db, 'users', user.uid, 'expenses', e.id); }
function collOf(e) { if (!e.trip) return S.expenses; return TE[e.trip] || (TE[e.trip] = []); }
function localPut(e) { const c = collOf(e), i = c.findIndex(x => x.id === e.id); if (i >= 0) c[i] = e; else c.push(e); }
function localDel(e) { const c = collOf(e), i = c.findIndex(x => x.id === e.id); if (i >= 0) c.splice(i, 1); }
function markReviewed(e) { const o = findExp(e.id, e.trip); if (o && o.cat !== e.cat) e.reviewed = true; return e; }
// A personal expense linked to a trip (tripLink) keeps a read-only copy in the trip, so it counts in my
// spending and in the trip's total/settle-up. Edits always go through the personal entry.
function mirrorOps(e, old, deleting) {
  if (e.trip || e.link) return [];
  const ops = [], was = old && old.tripLink, now = !deleting && (!isInc(e) || isFriend(e)) && e.tripLink && trip(e.tripLink) ? e.tripLink : '';
  if (was && was !== now && trip(was)) ops.push(['del', { id: 'L' + e.id, trip: was }]);
  if (now) {
    const t = trip(now), me = meIn(t), base = { id: 'L' + e.id, trip: now, link: e.id, ts: e.ts, date: e.date, amount: e.amount, cat: e.cat, mode: e.mode, person: me, note: e.note || '' };
    if (isFriend(e)) { const f = memberOf(t, e.who) || e.who || ''; ops.push(['put', { ...base, settle: true, ...(isInc(e) ? { from: f, to: me } : { from: me, to: f }) }]); }   // payback between members
    else ops.push(['put', { ...base, ...(e.tripSolo ? { solo: true } : {}) }]);
  }
  return ops;
}
function applyOps(ops, batch) { ops.forEach(([op, m]) => { if (op === 'put') localPut(m); else localDel(m); if (cloud) { const r = eRef(m); if (batch) op === 'put' ? batch.set(r, strip(m)) : batch.delete(r); else track(op === 'put' ? fb.F.setDoc(r, strip(m)) : fb.F.deleteDoc(r)); } }); }
function putExp(e) { const old = findExp(e.id, e.trip); markReviewed(e); localPut(e); if (cloud) track(fb.F.setDoc(eRef(e), strip(e))); applyOps(mirrorOps(e, old)); if (!cloud) saveLocal(); schedule(); }
function delExp(e) { const old = findExp(e.id, e.trip); localDel(e); if (cloud) track(fb.F.deleteDoc(eRef(e))); applyOps(mirrorOps(e, old, true)); if (!cloud) saveLocal(); schedule(); }
function putMany(list, del = false) {
  if (!del) list.forEach(markReviewed);
  const ops = list.map(e => mirrorOps(e, findExp(e.id, e.trip), del));
  list.forEach(del ? localDel : localPut);
  if (cloud) { for (let i = 0; i < list.length; i += 150) { const b = fb.F.writeBatch(fb.db); list.slice(i, i + 150).forEach((e, j) => { del ? b.delete(eRef(e)) : b.set(eRef(e), strip(e)); applyOps(ops[i + j], b); }); track(b.commit()); } }
  else { ops.forEach(o => applyOps(o)); saveLocal(); }
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
// ---------- Quick notes: '' = everyday notes, otherwise a trip id ----------
const notesOf = k => (k ? (trip(k) || {}).notes : S.notes) || '';
function saveNotes(k, text) {
  if (k) { const t = trip(k); if (!t) return; t.notes = text; if (cloud) track(fb.F.updateDoc(fb.F.doc(fb.db, 'trips', k), { notes: text })); else saveLocal(); }
  else { S.notes = text; if (cloud) track(fb.F.setDoc(fb.F.doc(fb.db, 'users', user.uid), { notes: text }, { merge: true })); else saveLocal(); }
}
// Parse one scribbled line: "Tea 40", "Cab 350 Ravi", "✓ Dinner 1,200"
function parseNote(line, t) {
  const raw = line.trim(); if (!raw) return null;
  const done = /^✓/.test(raw), body = raw.replace(/^✓\s*/, '');
  const nums = [...body.matchAll(/(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|₹|\/-)?/gi)];
  const m = nums.pop(), amount = m ? r2(parseFloat(m[1].replace(/,/g, ''))) : 0;
  let note = m ? body.slice(0, m.index) + ' ' + body.slice(m.index + m[0].length) : body;
  let payer = '';
  if (t) { const me = meIn(t);
    for (const n of [...t.members].sort((a, b) => b.length - a.length)) {
      if (n === me) continue;
      const re = new RegExp('(^|[^\\p{L}])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}])', 'iu');
      if (re.test(note)) { payer = n; note = note.replace(re, '$1'); break; }
    } }
  note = note.replace(/\b(paid|by)\b\s*$/i, '').replace(/\s+/g, ' ').replace(/^[\s\-:,·–]+|[\s\-:,·–]+$/g, '');
  return { done, amount, payer, note, raw };
}
const parseAll = k => { const t = k ? trip(k) : null; return notesOf(k).split('\n').map(l => parseNote(l, t)); };
const openNotes = k => parseAll(k).filter(p => p && !p.done && p.amount > 0);
function noteLinesHTML(k) {
  const P = parseAll(k), open = P.filter(p => p && !p.done && p.amount > 0), done = P.some(p => p && p.done);
  const rows = P.map((p, i) => !p ? '' : `<div class="nline ${p.done ? 'done' : ''}"><span>${esc(p.note || '—')}${p.payer ? ` <span class="muted">· ${esc(p.payer)} paid</span>` : ''}</span>${p.amount ? `<b>${money(p.amount)}</b>` : ''}${p.done ? '<span class="muted">added ✓</span>' : p.amount ? `<button class="small" data-act="nadd" data-k="${k}" data-i="${i}">➕ Add</button>` : '<span class="muted">no amount</span>'}</div>`).join('');
  return rows ? `<div class="row" style="margin:10px 0 4px"><span class="label" style="margin:0">To add later</span><b style="text-align:right">${open.length ? open.length + ' · ' + money(sum(open)) : 'all added 🎉'}</b></div>${rows}${done ? `<button class="link" data-act="nclear" data-k="${k}" style="margin-top:8px">🧹 Clear added lines</button>` : ''}` : '';
}
const notesBoxHTML = (k, id, linesId) => { const t = k ? trip(k) : null, fr = t ? t.members.find(n => n !== meIn(t)) : '';
  return `<textarea id="${id}" class="notesTA" data-k="${k}" data-lines="${linesId}" rows="7" placeholder="Jot quickly, one per line:&#10;Tea 40&#10;${fr ? 'Cab 350 ' + esc(fr) : 'Auto 120'}&#10;Dinner 1200">${esc(notesOf(k))}</textarea>
  <div class="muted" style="margin-top:4px">Saves as you type.${t ? " Put a friend's name on the line if they paid." : ''} Tap ➕ Add later to fill in the details.</div>
  <div id="${linesId}">${noteLinesHTML(k)}</div>`; };
async function removeTrip(t) {
  if (cloud) {
    const F = fb.F, ref = F.doc(fb.db, 'trips', t.id);
    if (t.owner && t.owner !== user.uid) { track(F.updateDoc(ref, { memberUids: F.arrayRemove(user.uid) })); }
    else {
      try { const qs = await F.getDocs(F.collection(fb.db, 'trips', t.id, 'expenses')); for (let i = 0; i < qs.docs.length; i += 400) { const b = F.writeBatch(fb.db); qs.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); } await F.deleteDoc(ref); }
      catch (e) { return fail(e); }
    }
  }
  const linked = S.expenses.filter(e => e.tripLink === t.id);
  S.trips = S.trips.filter(x => x.id !== t.id); delete TE[t.id];
  if (linked.length) putMany(linked.map(e => { const x = { ...e }; delete x.tripLink; return x; }));
  saveLocal(); curTrip = null; schedule();
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
  const denied = err => {   // cloud is private to its owner: fall back to this phone instead of an empty app
    if (err && /permission/.test(err.code || '')) { toast('Cloud sync is private to this app\'s owner — using this phone only. Back up with Settings → Save backup file.', 6000); fb.A.signOut(fb.auth).catch(() => {}); return true; }
    return false;
  };
  unsubs.push(F.onSnapshot(metaRef, s => {
    if (s.exists()) { const m = normalize(s.data()); Object.assign(S, metaOf(m)); migrateLocal(false); }
    else if (!s.metadata.fromCache) { const L = loadLocal(); const m = L ? metaOf(L) : { ...blankMeta(), people: [myName()], lastPerson: myName() }; m.name = myName(); Object.assign(S, m); track(F.setDoc(metaRef, m)); migrateLocal(true); }
    schedule();
  }, e => { if (!denied(e)) fail(e); }));
  unsubs.push(F.onSnapshot(F.collection(db, 'users', me, 'expenses'), qs => { S.expenses = qs.docs.map(d => normalizeE(d)); schedule(); }, e => { if (!/permission/.test(e.code || '')) fail(e); }));
  unsubs.push(F.onSnapshot(F.query(F.collection(db, 'trips'), F.where('memberUids', 'array-contains', me)), qs => {
    S.trips = qs.docs.map(d => ({ ...d.data(), id: d.id, members: d.data().members || [] }));
    const ids = new Set(S.trips.map(t => t.id));
    for (const id in tripUnsubs) if (!ids.has(id)) { tripUnsubs[id](); delete tripUnsubs[id]; delete TE[id]; }
    ids.forEach(id => { if (!tripUnsubs[id]) tripUnsubs[id] = F.onSnapshot(F.collection(db, 'trips', id, 'expenses'), q2 => { TE[id] = q2.docs.map(d => ({ ...normalizeE(d), trip: id })); schedule(); }, () => {}); });
    schedule();
  }, e => { if (!/permission/.test(e.code || '')) fail(e); }));
}
function normalizeE(d) { const x = d.data(); return { id: d.id, ts: +x.ts || 0, date: x.date, amount: +x.amount, cat: x.cat || 'Other', mode: x.mode || 'UPI', person: x.person || '', note: x.note || '', by: x.by, ...(x.type === 'in' ? { type: 'in' } : {}), ...(x.who ? { who: x.who } : {}), ...(x.reviewed ? { reviewed: true } : {}), ...(x.forShared ? { forShared: true } : {}), ...(x.tripLink ? { tripLink: x.tripLink } : {}), ...(x.tripSolo ? { tripSolo: true } : {}), ...(x.link ? { link: x.link } : {}), ...(x.solo ? { solo: true } : {}), ...(x.settle ? { settle: true, from: x.from || '', to: x.to || '' } : {}), ...(Array.isArray(x.split) && x.split.length ? { split: x.split, splitBy: x.splitBy || 'shares', meShares: x.meShares ?? 1 } : {}) }; }
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
let rq = 0; function schedule() { ownCache = null; if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }
function go(v) { if (v !== 'add') noteLink = null; if (v !== 'list' && multi) { multi = false; picked.clear(); $('#selBtn').textContent = 'Select'; } view = v; $$('section').forEach(s => s.classList.toggle('on', s.id === 'v-' + v)); $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); window.scrollTo(0, 0); render(); }
$$('nav button').forEach(b => b.onclick = () => { if (b.dataset.v === 'trips' && view === 'trips') curTrip = null; go(b.dataset.v); });
$$('.monthbar button').forEach(b => b.onclick = () => { month = shiftMonth(month, +b.dataset.m * (pmode === 'year' ? 12 : 1)); render(); });
$$('.pseg button').forEach(b => b.onclick = () => { pmode = b.dataset.p; render(); });

function render() {
  try { fabBadge(); } catch (e) {}
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
  const c = cat(e.cat), t = (e.trip && trip(e.trip)) || (e.tripLink && trip(e.tripLink)), spl = !e._mine && !e._share && hasSplit(e);
  const sm = multi && view === 'list', on = sm && picked.has(e.id);
  return `<div class="item${on ? ' picked' : ''}" data-id="${esc(e.id)}" data-trip="${e.trip || ''}">${sm ? `<span class="tick">${on ? '✓' : ''}</span>` : ''}<div class="ic" ${sm ? '' : 'data-ic="1"'} style="background:${c.color}22">${c.icon}</div><div class="mid"><div class="t">${esc(e.note || c.name)}</div><div class="s">${esc(c.name)}${e.who ? (isInc(e) ? ' from ' : ' · ') + esc(e.who) : ''}${spl ? ` · <span class="splt">➗ you ${money(myShare(e))}</span>` : e._mine ? ' · your share' : e._share ? ' · split share' : ''}${e.forShared && isInc(e) ? ' · shared costs' : ''}${!isFriend(e) && countsOf(e) === 'skip' ? ' · not counted' : ''} · ${e.mode} · ${esc(e.person)}${t && view !== 'trips' ? ' · ✈ ' + esc(t.name) : ''}${e.settle ? ` · ↔ ${esc(e.from)} paid ${esc(e.to)} back` : ''}${e._iOwe ? ' · your share' : ''}${e.link ? (findExp(e.link, '') ? ' · 🔗 from your expenses' : ' · 🔗 from their expenses') : ''}${e.solo || (e.tripLink && e.tripSolo && view !== 'trips') ? ' · just mine' : ''}${showDay ? ' · ' + dayLabel(e.date) : ''}</div></div><div class="a${isInc(e) ? ' inc' : ''}">${isInc(e) ? '+' : ''}${money(e.amount)}</div></div>`;
}
function groupedHTML(rows) {
  const g = {}; rows.forEach(e => (g[e.date] = g[e.date] || []).push(e));
  return Object.keys(g).sort().reverse().map(d => { const o = sum(g[d].filter(e => !isInc(e) && !e.settle)), i = sum(g[d].filter(e => isInc(e) && !e.settle)); return `<div class="day"><span>${dayLabel(d)}</span><span>${o ? money(o) : ''}${o && i ? ' · ' : ''}${i ? '<span class="inc">+' + money(i) + '</span>' : ''}</span></div><div class="card" style="padding:2px 14px">${g[d].sort((a, b) => b.ts - a.ts).map(e => itemHTML(e)).join('')}</div>`; }).join('');
}
document.addEventListener('click', ev => {
  const it = ev.target.closest('.item[data-id]'); if (!it) return;
  if (longPressed) { longPressed = false; return; }
  if (multi && view === 'list') { togglePick(it.dataset.id); return; }
  const m = findExp(it.dataset.id, it.dataset.trip);
  if (m && m.link) { if (findExp(m.link, '')) return ev.target.closest('[data-ic]') ? openCatSheet(m.link, '') : startEdit(m.link, ''); return toast("This was added from a member's own expenses — they can edit it", 3500); }
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
$('#fFor').addEventListener('change', () => { renderSplit(true); renderAdd(); });
$('#fLink').addEventListener('change', () => $('#soloWrap').classList.toggle('hidden', !$('#fLink').value || selType === 'in' || selCat === OWE_OUT));
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
const ATM_RE = /^(ATW|NWD|EAW)\b|^(ATW|NWD|EAW)-|\bATM\b|CASH WDL|CASH WITHDRAWAL/i;
const needsReview = e => !e.trip && !e.reviewed && !isFriend(e) && !hasSplit(e) && (isInc(e) ? e.cat === 'Other income' : e.cat === 'Other');   // ATM cash lands in Other, so it shows up here too
const reviewQueue = () => S.expenses.filter(needsReview).sort((a, b) => b.date.localeCompare(a.date));
function coverage() {
  const days = new Set(), addRange = (f, t) => { const d = new Date(f + 'T00:00'), end = new Date(t + 'T00:00'); while (d <= end) { days.add(ymd(d)); d.setDate(d.getDate() + 1); } };
  const st = [...(S.stmts || [])].sort((a, b) => a.from.localeCompare(b.from));
  st.forEach((x, i) => { addRange(x.from, x.to); const n = st[i + 1]; if (n && x.closing !== undefined && n.opening !== undefined && Math.abs(x.closing - n.opening) <= .5 && n.from > x.to) addRange(x.to, n.from); });
  const cov = {}; days.forEach(d => cov[d.slice(0, 7)] = (cov[d.slice(0, 7)] || 0) + 1);
  const bm = {}; S.expenses.forEach(e => { if (/^[bi][0-9a-z]+$/.test(e.id)) bm[mk(e.date)] = (bm[mk(e.date)] || 0) + 1; });
  Object.keys(bm).forEach(m => { if (bm[m] >= 5 && !(m in cov)) cov[m] = 99; });
  return cov;
}
// Months with no statement at all, between the first uploaded month and last month.
function missingMonths() {
  const cov = coverage(), ms = Object.keys(cov).sort(); if (!ms.length) return [];
  const last = shiftMonth(mk(today()), -1), out = [];
  for (let m = ms[0]; m <= last; m = shiftMonth(m, 1)) if (!cov[m] && !(S.dismissed || []).includes(m)) out.push({ m });
  return out.reverse();
}
function renderNudges() {
  const q = reviewQueue(), mm = missingMonths(), el = $('#nudges'); let h = '';
  if (mm.length) { const x = mm[0]; h += `<div class="nudge"><div><b>📅 ${monthLabel(x.m)} statement not uploaded</b><div class="muted">Upload it so no spending is missed.${mm.length > 1 ? ` Also missing: ${mm.slice(1, 4).map(y => monthLabel(y.m, true)).join(', ')}${mm.length > 4 ? '…' : ''}.` : ''}</div></div><button class="link" data-dismiss="${x.m}">Not needed</button></div>`; }
  if (q.length) h += `<button class="nudge nudge-btn" id="reviewGo"><div><b>📥 ${q.length} entr${q.length > 1 ? 'ies' : 'y'} to review</b><div class="muted">${q.some(e => ATM_RE.test(e.note)) ? 'Cash withdrawals and unsorted spends' : 'Unsorted spends'} — give them a category</div></div><span class="go">Review ›</span></button>`;
  el.innerHTML = h;
}
$('#nudges').onclick = ev => {
  const d = ev.target.closest('[data-dismiss]'); if (d) { S.dismissed = [...(S.dismissed || []), d.dataset.dismiss]; saveMeta(); toast(`Won't remind about ${monthLabel(d.dataset.dismiss)}`); return; }
  if (ev.target.closest('#reviewGo')) { revSkip = new Set(); openReview(); }
};
let revSkip = new Set();
function openReview() {
  const q = reviewQueue().filter(e => !revSkip.has(e.id));
  if (!q.length) { closeSheet(); toast(reviewQueue().length ? 'Skipped the rest for now' : 'All reviewed 🎉'); return; }
  const e = q[0], atm = ATM_RE.test(e.note), inc = isInc(e), list = (inc ? S.incCats : S.categories).filter(c => c.name !== 'Other' && c.name !== 'Other income' && c.name !== OWE_OUT && c.name !== OWE_IN);
  const key = keyOf(e.note), total = reviewQueue().length;
  const first = atm ? ['House budget', 'Food', 'Groceries', 'Transport'] : [];
  const fi = n => first.indexOf(first.find(f => f.toLowerCase() === n.toLowerCase())), sorted = [...list.filter(c => fi(c.name) >= 0).sort((a, b) => fi(a.name) - fi(b.name)), ...list.filter(c => fi(c.name) < 0)];
  openSheet(`<div class="row" style="align-items:center"><h3>Review · ${total} left</h3><button class="link" data-r="close" style="flex:0 0 auto">Done</button></div>
    <div class="revcard"><div class="t" style="white-space:normal;font-weight:600">${esc(e.note || '(no description)')}</div><div class="muted">${niceDate(e.date)} · ${e.mode}${atm ? ' · cash withdrawal' : ''}</div><div class="big${inc ? ' inc' : ''}" style="font-size:24px;margin-top:4px">${inc ? '+' : ''}${money(e.amount)}</div></div>
    ${atm ? '<p class="muted" style="margin:0 0 8px">Gave the cash to family? Pick 🏡 House budget. Gave it to a friend? Tap 🤝.</p>' : ''}
    <div class="chips">${sorted.map(c => `<button class="chip" data-r="cat" data-c="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>
    ${!atm && key.length > 2 ? `<label class="pvrow" style="border:0;padding:10px 0 0"><input type="checkbox" id="revRem" checked><span class="muted">Apply to all “${esc(e.note)}” entries — now and in future statements</span></label>` : ''}
    <div class="btns" style="margin:12px 0 0"><button data-r="friend">🤝 ${inc ? 'Friend paid back' : 'For a friend'}</button>${inc ? '' : '<button data-r="split">➗ Split</button>'}</div>
    <div class="btns" style="margin:8px 0 0"><button data-r="keep">✓ Keep as ${inc ? 'Other income' : 'Other'}</button><button data-r="skip">Skip ›</button></div>`, ev => {
    const b = ev.target.closest('[data-r]'); if (!b) return;
    const a = b.dataset.r;
    if (a === 'close') return closeSheet();
    if (a === 'skip') { revSkip.add(e.id); return openReview(); }
    if (a === 'keep') { putExp({ ...e, reviewed: true }); return openReview(); }
    if (a === 'friend') return askFriend('Which friend?', `${esc(e.note)} · ${money(e.amount)}`, (n, sh) => { markFriend([e], n, sh); setTimeout(openReview, 50); }, inc);
    if (a === 'split') { closeSheet(); startEdit(e.id, ''); SPL.on = true; renderSplit(true); return; }
    if (a === 'cat') {
      const c = b.dataset.c, rem = $('#revRem') && $('#revRem').checked;
      const same = rem ? reviewQueue().filter(x => x.id !== e.id && keyOf(x.note) === key && isInc(x) === inc) : [];
      putMany([e, ...same].map(x => ({ ...x, cat: c, reviewed: true })));
      if (rem) { setRule(e.note, c); saveMeta(); }
      toast(`${c}${same.length ? ` · ${same.length + 1} entries` : ''}${rem ? ' · applied to all' : ''}`);
      return openReview();
    }
  });
}
function renderAdd() {
  const tv = $('#impTarget').value; $('#impTarget').innerHTML = targetOptions(tv); if (tv && !trip(tv)) $('#impTarget').value = '';
  const fv = $('#fFor').value; $('#fFor').innerHTML = targetOptions(fv);
  if (!S.categories.some(c => c.name === selCat)) selCat = (S.categories[0] || {}).name;
  if (!S.incCats.some(c => c.name === selInc)) selInc = (S.incCats[0] || {}).name;
  const inc = selType === 'in', cur = inc ? selInc : selCat;
  $$('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === selType));
  $('#forWrap').classList.toggle('hidden', inc); if (inc) $('#fFor').value = '';
  const lv = $('#fLink').value; $('#fLink').innerHTML = '<option value="">No</option>' + tripsSorted().map(t => `<option value="${t.id}" ${t.id === lv ? 'selected' : ''}>✈ ${esc(t.name)}</option>`).join('');
  $('#linkWrap').classList.toggle('hidden', (inc && cur !== OWE_IN) || !!$('#fFor').value || !S.trips.length);
  $('#linkLbl').textContent = cur === OWE_IN || cur === OWE_OUT ? 'Payback for a trip?' : 'Also show in a trip';
  $('#soloWrap').classList.toggle('hidden', $('#linkWrap').classList.contains('hidden') || !$('#fLink').value || cur === OWE_IN || cur === OWE_OUT);
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
  renderNudges();
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
$('#manualBtn').onclick = () => { noteLink = null; const on = $('#f').classList.contains('hidden'); if (!on) resetForm(); openForm(on); };
function startEdit(id, t) {
  const e = findExp(id, t); if (!e) return;
  edit = { id, trip: t || '' }; go('add');
  $('#fFor').value = t || ''; $('#amt').value = e.amount; selType = isInc(e) ? 'in' : 'out'; if (isInc(e)) selInc = e.cat; else selCat = e.cat; selMode = e.mode; $('#date').value = e.date; $('#note').value = e.note || ''; $('#who').value = e.who || ''; renderAdd(); $('#fLink').value = e.tripLink || ''; $('#fSolo').checked = !!e.tripSolo; $('#soloWrap').classList.toggle('hidden', !e.tripLink);
  SPL = hasSplit(e) ? { on: true, by: e.splitBy || 'shares', me: e.meShares ?? 1, rows: e.split.map(x => ({ who: x.who, amount: x.amount, shares: x.shares || 1 })) } : { on: false, by: 'shares', me: 1, rows: [] };
  renderAdd(); fillPerson(e.person);
  $('#saveBtn').textContent = 'Update expense'; $('#editBtns').classList.remove('hidden'); openForm(true);
}
function resetForm() { edit = null; selType = 'out'; SPL = { on: false, by: 'shares', me: 1, rows: [] }; const f = $('#fFor').value; $('#f').reset(); $('#fFor').value = f; $('#date').value = today(); $('#saveBtn').textContent = 'Save expense'; $('#editBtns').classList.add('hidden'); }
$('#cancelEdit').onclick = () => { noteLink = null; resetForm(); openForm(false); renderAdd(); };
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
  if ((!inc || data.cat === OWE_IN) && !forT && $('#fLink').value) { data.tripLink = $('#fLink').value; if (!isFriend(data) && $('#fSolo').checked) data.tripSolo = true; }
  if (forT && !inc) { const t = trip(forT); if (t && data.person === meIn(t)) { data.tripLink = forT; data.person = S.people.includes(S.lastPerson) ? S.lastPerson : S.people[0]; return saveForm(data, '', inc); } }
  return saveForm(data, forT, inc);
};
function saveForm(data, forT, inc) {
  let changed = null, e;
  if (edit) {
    const old = findExp(edit.id, edit.trip); if (!old) { resetForm(); return; }
    e = { ...old, ...data }; delete e.trip; delete e.type; if (!data.who) delete e.who; if (!data.tripLink) delete e.tripLink; if (!data.tripSolo) delete e.tripSolo; if (!data.split) { delete e.split; delete e.splitBy; delete e.meShares; } if (inc) e.type = 'in'; if (forT) e.trip = forT;
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
  if (noteLink && !wasEdit) { openForm(false); tickNote(); if (changed) offerRemember(changed); return; }
  if (changed) offerRemember(changed); else if (wasEdit) openForm(false); else $('#amt').focus();
}
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
  const o = sum(xr.filter(e => !isInc(e) && !isInvest(e) && !isFriend(e) && !e._skip)), iv = sum(xr.filter(e => !isInc(e) && isInvest(e) && !isFriend(e) && !e._skip)), i = sum(xr.filter(e => isInc(e) && !isFriend(e) && !e._skip && !e._shared && countsOf(e) === 'income')), fr = sum(xr.filter(e => e.cat === OWE_OUT)) - sum(xr.filter(e => e.cat === OWE_IN));
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
    case 'trip': {
      const spends = sel.filter(e => !isInc(e) || e.cat === OWE_IN); if (!spends.length) return toast('Select spends (or friend paybacks) to add to a trip');
      if (!S.trips.length) return toast('Create a trip first (Trips tab)');
      return openSheet(`<h3>Show ${spends.length} spend${spends.length > 1 ? 's' : ''} in a trip</h3><p class="muted" style="margin-top:2px">They stay in your spending and also count in the trip's total and settle-up. Edit them here — the trip updates too.</p>
        <div class="seg" id="tpSolo" style="margin:12px 0 0"><button type="button" data-solo="0" class="on">Shared with the group</button><button type="button" data-solo="1">Just my cost</button></div>
        <p class="muted" id="tpTxt" style="margin:6px 0 0">Split in the trip's settle-up, e.g. a hotel or cab you paid for everyone.</p>${spends.some(isFriend) ? '<p class="muted" style="margin:6px 0 0">🤝 Friend paybacks are recorded as settling up in the trip.</p>' : ''}
        <div class="chips" style="margin-top:10px">${tripsSorted().map(t => `<button class="chip" data-tp="${t.id}">✈ ${esc(t.name)}</button>`).join('')}<button class="chip" data-tp="">✕ Not in a trip</button></div>`, ev => {
        const so = ev.target.closest('[data-solo]'); if (so) { $$('#tpSolo button').forEach(x => x.classList.toggle('on', x === so)); $('#tpTxt').textContent = so.dataset.solo === '1' ? "Counts in the trip total but isn't split, e.g. your own trek fee or train ticket." : "Split in the trip's settle-up, e.g. a hotel or cab you paid for everyone."; return; }
        const b = ev.target.closest('[data-tp]'); if (!b) return; const id = b.dataset.tp, solo = $('#tpSolo [data-solo="1"]').classList.contains('on');
        putMany(spends.map(e => { const x = { ...e }; if (id) { x.tripLink = id; if (solo && !isFriend(e)) x.tripSolo = true; else delete x.tripSolo; } else { delete x.tripLink; delete x.tripSolo; } return x; })); closeSheet(); setSelMode(false);
        toast(id ? `${spends.length} added to ${trip(id).name}` : 'Removed from trip');
      });
    }
    case 'friend': setSelMode(false); return askFriend('Paid for a friend?', `Spends become “paid for friend”, credits become “friend paid back”. Neither counts in your own spending or income. ${sel.length} selected.`, (n, sh) => markFriend(sel, n, sh), sel.some(isInc));
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
function askFriend(title, sub, done, hasIn) {
  const fs = friends(), L = friendLedger();
  const owes = () => { const f = L[($('#fName').value || '').trim().toLowerCase()]; $('#fOwes').textContent = f ? (f.owed > 0 ? `${f.name} owes you ${money(f.owed)} right now.` : `${f.name} doesn't owe you anything right now.`) : ''; };
  openSheet(`<h3>${title}</h3><p class="muted" style="margin-top:2px">${sub}</p>
    <input id="fName" list="fNames" placeholder="Friend's name" maxlength="30"><datalist id="fNames">${fs.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    ${fs.length ? `<div class="chips" style="margin-top:10px">${fs.slice(0, 8).map(f => `<button class="chip" data-fn="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}
    <div class="muted" id="fOwes" style="margin-top:8px"></div>
    ${hasIn ? `<div class="label">The money they sent is for</div><div class="seg" id="fWhy"><button type="button" data-why="owe" class="on">What they owe</button><button type="button" data-why="shared">Shared costs</button></div>
      <p class="muted" id="fWhyTxt" style="margin:6px 0 0">Pays off what they owe you (loans, tickets you marked 🤝). Anything extra reduces your spending.</p>` : ''}
    <button class="primary" id="fGo">Save</button><button style="width:100%;margin-top:8px" id="fNo">Cancel</button>`, ev => {
    const c = ev.target.closest('[data-fn]'); if (c) { $('#fName').value = c.dataset.fn; owes(); return; }
    const w = ev.target.closest('[data-why]');
    if (w) { $$('#fWhy button').forEach(b => b.classList.toggle('on', b === w)); $('#fWhyTxt').textContent = w.dataset.why === 'owe' ? 'Pays off what they owe you (loans, tickets you marked 🤝). Anything extra reduces your spending.' : "Their share of things you paid and logged as your own spending (e.g. a dinner bill). Reduces your spending; what they owe stays the same."; return; }
    if (ev.target.id === 'fNo') return closeSheet();
    if (ev.target.id !== 'fGo') return;
    const n = $('#fName').value.trim(); if (!n) return toast("Enter your friend's name");
    const shared = !!hasIn && $('#fWhy [data-why=shared]').classList.contains('on');
    closeSheet(); done(n, shared);
  });
  $('#fName').addEventListener('input', owes);
  setTimeout(() => $('#fName').focus(), 60);
}
function markFriend(list, n, shared) {
  putMany(list.map(e => { const x = { ...e, cat: isInc(e) ? OWE_IN : OWE_OUT, who: n }; delete x.split; delete x.splitBy; delete x.meShares; if (isInc(e) && shared) x.forShared = true; else delete x.forShared; return x; }));
  const out = list.filter(e => !isInc(e)).length, back = list.length - out;
  toast(`${out ? `${out} marked as paid for ${n}` : ''}${out && back ? ' · ' : ''}${back ? `${back} as paid back by ${n}` : ''}`, 3500);
}
function bulkCat(sel) {
  const inc = sel.filter(isInc).length;
  if (inc && inc < sel.length) return toast('Select only spending or only income to change category', 3500);
  const list = inc ? S.incCats : S.categories;
  openSheet(`<h3>Category for ${sel.length} entr${sel.length > 1 ? 'ies' : 'y'}</h3><div class="chips" style="margin-top:10px">${list.map(c => `<button class="chip" data-pick="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>`, ev => {
    const b = ev.target.closest('[data-pick]'); if (!b) return;
    if (b.dataset.pick === OWE_OUT || b.dataset.pick === OWE_IN) { setSelMode(false); return askFriend('Which friend?', `${sel.length} entr${sel.length > 1 ? 'ies' : 'y'} · ${money(sum(sel))}`, (n, sh) => markFriend(sel, n, sh), sel.some(isInc)); }
    putMany(sel.map(e => { const x = { ...e, cat: b.dataset.pick }; delete x.who; return x; })); closeSheet(); toast(`Moved ${sel.length} to ${b.dataset.pick}`); setSelMode(false);
  });
}

// ---------- Trips ----------
function settle(t) {
  const all = tripExp(t.id), costs = all.filter(e => !e.settle), ex = costs.filter(e => !e.solo), pays = all.filter(e => e.settle), tot = sum(costs), mem = t.members.length ? t.members : [myName()], share = sum(ex) / mem.length;
  const paid = {}; mem.forEach(p => paid[p] = 0); ex.forEach(e => { const p = memberOf(t, e.person) || e.person; paid[p] = (paid[p] || 0) + e.amount; });
  const net = { ...paid }; let settled = 0;
  pays.forEach(e => { const f = memberOf(t, e.from), to = memberOf(t, e.to); if (f && to && f !== to) { net[f] += e.amount; net[to] -= e.amount; settled += e.amount; } });
  const bal = Object.keys(net).map(p => ({ p, b: r2(net[p] - (mem.includes(p) ? share : 0)) }));
  const cr = bal.filter(x => x.b > .5).sort((a, b) => b.b - a.b).map(x => ({ ...x })), db = bal.filter(x => x.b < -.5).map(x => ({ p: x.p, b: -x.b })).sort((a, b) => b.b - a.b);
  const tx = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) { const v = Math.min(db[i].b, cr[j].b); tx.push([db[i].p, cr[j].p, v]); db[i].b -= v; cr[j].b -= v; if (db[i].b < .5) i++; if (cr[j].b < .5) j++; }
  return { tot, share, paid, bal: Object.fromEntries(bal.map(x => [x.p, x.b])), tx, mem, settled, solo: sum(costs.filter(e => e.solo)), costs };
}
function renderTrips() {
  const t = curTrip && trip(curTrip); // a just-joined trip may arrive a moment later, so keep curTrip
  if (t && tripTab === 'notes' && document.activeElement && document.activeElement.id === 'tripNotes') { $('#noteLines').innerHTML = noteLinesHTML(t.id); return; } // don't steal focus while typing
  $('#tripsBox').innerHTML = t ? tripDetailHTML(t) : tripListHTML();
}
function tripListHTML() {
  const banner = configured && authKnown && !user ? `<div class="banner">Sign in (Settings) to share trips live — everyone on the trip adds expenses from their own phone.</div>` : '';
  const list = tripsSorted();
  return banner + `<button class="primary" data-act="new" style="margin:0 0 12px">＋ New trip</button>` + (list.length ? list.map(t => {
    const ex = tripExp(t.id).filter(e => !e.settle), tot = sum(ex), p = t.budget ? tot / t.budget : 0;
    return `<div class="card trip" data-act="open" data-trip="${t.id}"><div class="row"><div><b style="font-size:16px">✈ ${esc(t.name)}</b><div class="muted">${t.start ? niceDate(t.start) + ' – ' + niceDate(t.end) + ' · ' : ''}${t.members.length} ${t.members.length > 1 ? 'people' : 'person'} · ${ex.length} expenses</div></div><div class="a" style="text-align:right;flex:0 0 auto">${money(tot)}</div></div>${t.budget ? `<div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${barColor(p)}"></i></div>` : ''}</div>`;
  }).join('') : '<div class="empty">No trips yet. Create one, then upload statements or add expenses to it.</div>');
}
function tripDetailHTML(t) {
  const all = tripExp(t.id), st = settle(t), ex = st.costs, p = t.budget ? st.tot / t.budget : 0;
  const byCat = {}; ex.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
  const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  const nOpen = openNotes(t.id).length;
  const tabs = `<div class="seg" id="tripSeg"><button data-act="tab" data-tab="exp" class="${tripTab !== 'notes' ? 'on' : ''}">Expenses</button><button data-act="tab" data-tab="notes" class="${tripTab === 'notes' ? 'on' : ''}">📝 Notes${nOpen ? ` (${nOpen})` : ''}</button></div>`;
  const head = `<button class="link" data-act="back">‹ All trips</button>
  <div class="card"><div class="row" style="align-items:flex-start"><div><h2>✈ ${esc(t.name)}</h2><div class="muted">${t.start ? niceDate(t.start) + ' – ' + niceDate(t.end) + ' · ' : ''}${esc(t.members.join(', '))}</div></div><button class="small" data-act="edit" style="flex:0 0 auto">Edit</button></div>
    <div class="big" style="margin-top:10px">${money(st.tot)}</div><div class="muted">${ex.length} expenses${st.mem.length > 1 ? ' · ' + money(st.share) + ' per person' : ''}</div>
    ${t.budget ? `<div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${barColor(p)}"></i></div><div class="muted" style="margin-top:4px">${Math.round(p * 100)}% of ${money(t.budget)} budget</div>` : ''}</div>${tabs}`;
  if (tripTab === 'notes') return head + `<div class="card">${notesBoxHTML(t.id, 'tripNotes', 'noteLines')}</div>`;
  return head + `
  <div class="card hero"><button class="primary" data-act="upload" style="margin-top:0">📄 Upload statement / CSV</button>
    <div class="btns" style="margin:8px 0 0"><button data-act="add">✎ Add manually</button><button data-act="csv">⬇ Download CSV</button></div>
    ${cloud ? '<button data-act="invite" style="width:100%;margin-top:8px">👥 Invite people</button>' : ''}</div>
  ${st.mem.length > 1 ? `<div class="card"><div class="label" style="margin-top:0">Settle up</div>
    ${Object.keys(st.paid).map(n => { const b = st.bal[n] || 0; return `<div class="settle"><span>${esc(n)} paid ${money(st.paid[n])}</span><b class="${b >= 0 ? 'down' : 'up'}">${Math.abs(b) < .5 ? 'settled ✓' : (b > 0 ? 'gets back ' : 'owes ') + money(Math.abs(b))}</b></div>`; }).join('')}
    <div class="label">Who pays whom</div>${st.tx.length ? st.tx.map(([a, b, v]) => `<div class="settle"><span>${esc(a)} → ${esc(b)}</span><b>${money(v)}</b></div>`).join('') : '<div class="muted">All settled 🎉</div>'}
    <p class="muted" style="margin-bottom:0">Split equally among ${st.mem.length} people.${st.solo ? ` ${money(st.solo)} marked “just mine” isn't split.` : ''}${st.settled ? ` ${money(st.settled)} already paid back.` : ''}</p></div>` : ''}
  ${cats.length ? `<div class="card"><div class="label" style="margin-top:0">By category</div>${cats.map(n => { const c = cat(n); return `<div style="margin:6px 0"><div class="row"><span>${c.icon} ${esc(n)}</span><b style="text-align:right">${money(byCat[n])}</b></div><div class="bar"><i style="width:${byCat[n] / st.tot * 100}%;background:${c.color}"></i></div></div>`; }).join('')}</div>` : ''}
  ${all.length ? groupedHTML(all) : '<div class="empty">No expenses in this trip yet.</div>'}`;
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
    case 'tab': tripTab = a.dataset.tab; return renderTrips();
  }
};
let noteTimer = 0, notePending = null;
function flushNotes() { if (notePending) { clearTimeout(noteTimer); const [k, v] = notePending; notePending = null; noteTimer = 0; saveNotes(k, v); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNotes(); });
document.addEventListener('input', ev => {
  const ta = ev.target; if (!ta.classList || !ta.classList.contains('notesTA')) return;
  const k = ta.dataset.k, v = ta.value; if (k) { const t = trip(k); if (t) t.notes = v; } else S.notes = v;
  const box = document.getElementById(ta.dataset.lines); if (box) box.innerHTML = noteLinesHTML(k);
  notePending = [k, v]; clearTimeout(noteTimer); noteTimer = setTimeout(flushNotes, 700);
});
// Save when leaving the box — a moment later, so a tap on ➕ Add isn't lost to a re-render
document.addEventListener('focusout', ev => { if (ev.target.classList && ev.target.classList.contains('notesTA') && notePending) { clearTimeout(noteTimer); noteTimer = setTimeout(() => { flushNotes(); schedule(); }, 400); } });
document.addEventListener('click', ev => {
  const a = ev.target.closest('[data-act=nadd],[data-act=nclear]'); if (!a) return;
  const k = a.dataset.k || '', fromSheet = !!a.closest('#sheet');
  if (a.dataset.act === 'nadd') { if (fromSheet) closeSheet(); return addFromNote(k, +a.dataset.i, fromSheet); }
  flushNotes(); saveNotes(k, notesOf(k).split('\n').filter(l => !/^\s*✓/.test(l)).join('\n'));
  if (fromSheet) openQuickNotes(k); else renderTrips();
});
function addFromNote(k, i, fromSheet) {
  flushNotes();
  const t = k ? trip(k) : null, line = notesOf(k).split('\n')[i], p = line && parseNote(line, t); if (!p || !p.amount) return;
  resetForm(); go('add'); $('#fFor').value = k;
  selType = 'out'; const c = ruleFor(p.note, 'out'); if (c) selCat = c;
  const td = today(); $('#date').value = t && t.start && (td < t.start || (t.end && td > t.end)) ? t.start : td;
  $('#amt').value = p.amount; $('#note').value = p.note; renderAdd(); fillPerson(t ? (p.payer || meIn(t)) : undefined);
  noteLink = { k, i, raw: line, fromSheet }; openForm(true);
  toast('From your note — add details and save');
}
function tickNote() {
  const L = noteLink; noteLink = null; if (!L || (L.k && !trip(L.k))) return;
  const lines = notesOf(L.k).split('\n'); const i = lines[L.i] === L.raw ? L.i : lines.indexOf(L.raw); if (i < 0) return;
  lines[i] = '✓ ' + lines[i].trim(); saveNotes(L.k, lines.join('\n'));
  if (L.fromSheet) { renderAdd(); openQuickNotes(L.k); } else { curTrip = L.k; tripTab = 'notes'; go('trips'); }
}
// Floating 📝 button on every tab → quick notes for everyday or any trip
function defaultNotesKey() {
  if (view === 'trips' && curTrip && trip(curTrip)) return curTrip;
  const td = today(), on = S.trips.find(t => t.start && t.start <= td && (!t.end || td <= t.end)); return on ? on.id : '';
}
function openQuickNotes(k = defaultNotesKey()) {
  const opts = [['', '🗒 Everyday'], ...tripsSorted().map(t => [t.id, '✈ ' + t.name])];
  openSheet(`<div class="row"><h3 style="margin:0">📝 Quick notes</h3><button class="small" data-x="close" style="flex:0 0 auto">Done</button></div>
    <label style="margin-top:10px">Notes for<select id="qnFor">${opts.map(([v, n]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${esc(n)}${openNotes(v).length ? ` (${openNotes(v).length})` : ''}</option>`).join('')}</select></label>
    <div id="qnBody">${notesBoxHTML(k, 'qnText', 'qnLines')}</div>`, e => { if (e.target.closest('[data-x=close]')) { flushNotes(); closeSheet(); schedule(); } });
  $('#qnFor').onchange = () => { flushNotes(); $('#qnBody').innerHTML = notesBoxHTML($('#qnFor').value, 'qnText', 'qnLines'); };
}
$('#notesFab').onclick = () => openQuickNotes();
function fabBadge() { const n = openNotes('').length + S.trips.reduce((a, t) => a + openNotes(t.id).length, 0); $('#notesFab').dataset.n = n || ''; }
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
const spendIn = k => own().filter(e => e.date.startsWith(k) && !isInc(e) && !isFriend(e) && !e._skip);
const spendNI = k => spendIn(k).filter(e => !isInvest(e));        // spending without investments
const incomeIn = k => own().filter(e => e.date.startsWith(k) && isInc(e) && !isFriend(e) && !e._skip);
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
  renderRecurring();
  renderTax();
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
function recurring() {
  const g = {};
  S.expenses.forEach(e => { if (isInc(e) || isFriend(e) || e.trip || ATM_RE.test(e.note) || countsOf(e) === 'skip') return; const k = keyOf(e.note).replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g, '').replace(/\s+/g, ' ').trim(); if (k.length < 3) return; (g[k] = g[k] || []).push(e); });
  const lastData = S.expenses.map(e => e.date).sort().pop(); if (!lastData) return [];
  const out = [];
  Object.entries(g).forEach(([k, list]) => {
    const pm = {}; list.forEach(e => { const m = mk(e.date); pm[m] = pm[m] || { n: 0, v: 0 }; pm[m].n++; pm[m].v += myShare(e); });
    const ms = Object.keys(pm).sort(); if (ms.length < 2) return;
    if (ms.some(m => pm[m].n > 2)) return;                              // daily habits, not bills
    const vals = ms.map(m => pm[m].v).sort((a, b) => a - b), med = vals[Math.floor(vals.length / 2)];
    const steady = ms.filter(m => Math.abs(pm[m].v - med) <= med * .25).length;
    if (steady < Math.max(2, Math.ceil(ms.length * .7))) return;
    if (ms.length < 3 && shiftMonth(ms[0], 1) !== ms[1]) return;       // two months must be back to back
    const last = list.map(e => e.date).sort().pop();
    if (daysBetween(last, lastData) > 45) return;                        // stopped
    const e0 = list.find(e => e.date === last);
    out.push({ k, name: e0.note.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/ig, '').replace(/\s+/g, ' ').trim(), cat: e0.cat, med: r2(med), months: ms.length, last, inv: isInvest(e0) });
  });
  return out.sort((a, b) => b.med - a.med);
}
function renderRecurring() {
  const r = recurring();
  if (!r.length) { $('#recurBox').innerHTML = '<div class="muted">Bills, rent, subscriptions and SIPs that repeat every month will show up here once you have two or more months of statements.</div>'; return; }
  const spend = r.filter(x => !x.inv), inv = r.filter(x => x.inv), ts = sum(spend.map(x => ({ amount: x.med }))), ti = sum(inv.map(x => ({ amount: x.med })));
  const row = x => { const c = cat(x.cat); return `<div class="settle frow" data-rec="${esc(x.name)}"><span>${c.icon} ${nice(x.name)}<span class="muted"> · ${x.months} months · last ${niceDate(x.last)}</span></span><b>${money(x.med)}</b></div>`; };
  $('#recurBox').innerHTML = `<div class="big" style="font-size:24px">${money(ts)}<span class="muted" style="font-size:14px;font-weight:400"> / month committed</span></div>${ti ? `<div class="muted">+ ${money(ti)} / month regular investments 📈</div>` : ''}
    ${spend.map(row).join('')}${inv.length ? `<div class="label">Regular investments</div>${inv.map(row).join('')}` : ''}<p class="muted" style="margin-bottom:0">Tap one to see all its payments.</p>`;
}
document.addEventListener('click', ev => { const r = ev.target.closest('[data-rec]'); if (r) { go('list'); pmode = 'year'; $('#fType').value = ''; $('#fCat').value = ''; $('#fPerson').value = ''; $('#fSearch').value = r.dataset.rec; render(); } });
// ================= income tax estimate (India, FY Apr–Mar) =================
// Rules per FY come from tax-rules.json (slabs, standard deduction, 87A rebate, cess, capital-gains rates).
// Surcharge (income > ₹50L) is not modelled.
const dateY = d => { const [y, m, dd] = String(d).split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
const fyOf = m => { const [y, mo] = m.split('-').map(Number); return mo >= 4 ? y : y - 1; };
const fyLabel = y => `FY ${y}-${String(y + 1).slice(2)}`;
function slabTax(x, slabs) { let t = 0, lo = 0; for (const [hi, r] of slabs) { const top = hi == null ? Infinity : hi; if (x > lo) t += (Math.min(x, top) - lo) * r; lo = top; } return t; }
// Tax rules live in tax-rules.json (one entry per FY); this copy is the offline fallback.
const BUILTIN_RULES = { updated: '2026-11-07', years: { 2026: { new: { slabs: [[4e5, 0], [8e5, .05], [12e5, .10], [16e5, .15], [20e5, .20], [24e5, .25], [null, .30]], sd: 75000, rebateLimit: 12e5, rebateMax: 60000 }, old: { slabs: [[2.5e5, 0], [5e5, .05], [10e5, .20], [null, .30]], sd: 50000, rebateLimit: 5e5, rebateMax: 12500, c80: 150000, homeLoan: 200000, nps: 50000, savingsInterest: 10000 }, cess: .04, stcg: .20, ltcg: .125, ltcgExempt: 125000, advanceTaxAbove: 10000 } } };
let TAXR = (() => { try { const c = JSON.parse(localStorage.getItem('trickle_taxrules')); if (c && c.years) return c; } catch (e) {} return BUILTIN_RULES; })(), taxFetched = false;
async function fetchTaxRules(manual) {
  try {
    const r = await fetch('tax-rules.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); if (!j || !j.years) throw new Error('bad file');
    const changed = JSON.stringify(j.years) !== JSON.stringify(TAXR.years); TAXR = j; taxFetched = true;
    try { localStorage.setItem('trickle_taxrules', JSON.stringify(j)); } catch (e) {}
    if (manual) toast(changed ? `New tax rules loaded (updated ${dateY(j.updated)}) — recalculated` : `Tax rules are up to date (${dateY(j.updated)})`, 3500);
    if (view === 'stats') renderTax();
  } catch (e) { taxFetched = true; if (manual) toast("Couldn't refresh tax rules — using the saved ones", 3500); }
}
function rulesFor(fy) {
  const ys = Object.keys(TAXR.years).map(Number).sort((a, b) => a - b);
  const use = ys.filter(y => y <= fy).pop() ?? ys[0];
  return { R: TAXR.years[use], year: use, exact: use === fy };
}
function taxCalc(regime, d, R = rulesFor(2026).R) {
  const isNew = regime === 'new', g = isNew ? R.new : R.old, sd = d.gross > 0 ? Math.min(d.gross, g.sd) : 0;
  let ded = 0;
  if (!isNew) ded = Math.min(+d.c80 || 0, g.c80) + (+d.d80 || 0) + (+d.hra || 0) + Math.min(+d.home || 0, g.homeLoan) + Math.min(+d.nps || 0, g.nps) + Math.min(d.interest, g.savingsInterest) + (+d.other || 0);
  const normal = Math.max(0, d.gross - sd + d.dividend + d.interest + d.otherInc - ded);
  const stcg = Math.max(0, +d.stcg || 0), ltcg = Math.max(0, (+d.ltcg || 0) - R.ltcgExempt), total = normal + stcg + (+d.ltcg || 0);
  let slab = slabTax(normal, g.slabs), rebate = 0;
  if (total <= g.rebateLimit) rebate = Math.min(slab, g.rebateMax);
  else if (isNew && normal > g.rebateLimit && slab > normal - g.rebateLimit) rebate = slab - (normal - g.rebateLimit);   // marginal relief just above the limit
  const cg = stcg * R.stcg + ltcg * R.ltcg, base = Math.max(0, slab - rebate) + cg, cess = base * R.cess;
  return { sd, ded, normal, stcg, ltcg, slab: r2(slab), rebate: r2(rebate), cg: r2(cg), cess: r2(cess), tax: Math.round(base + cess) };
}
const TAXPAY_RE = /cbdt|income ?tax|advance ?tax|self ?assess|itns|tin ?2/i;
function taxData(fy, rf, rt) {
  const from = rf || `${fy}-04-01`, to = rt || `${fy + 1}-03-31`, inFy = e => e.date >= from && e.date <= to, all = own().filter(inFy);
  const counted = all.filter(e => isInc(e) && !isFriend(e) && !e._skip && countsOf(e) === 'income');
  const sumC = re => r2(sum(counted.filter(e => re.test(e.cat))));
  const salary = sumC(/salary/i), dividend = sumC(/dividend/i), interest = sumC(/^interest/i), otherInc = r2(sum(counted.filter(e => !/salary|dividend|^interest/i.test(e.cat))));
  const salByMonth = {}; counted.filter(e => /salary/i.test(e.cat)).forEach(e => { const m = mk(e.date); salByMonth[m] = (salByMonth[m] || 0) + e.amount; });
  const months = Object.keys(salByMonth).length;
  const pays = S.expenses.filter(e => inFy(e) && !isInc(e) && (TAXPAY_RE.test(e.note) || /tax/i.test(e.cat) && TAXPAY_RE.test(e.note)));
  return { from, to, salary, months, salByMonth, dividend, interest, otherInc, pays };
}
// ---------- Payslips: monthly gross / TDS / PF / professional tax ----------
const slips = () => ((S.tax || {}).slips || {});
const addMonth = (m, n) => { let [y, mo] = m.split('-').map(Number); mo += n; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return `${y}-${String(mo).padStart(2, '0')}`; };
const monthsIn = (from, to) => { const out = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonth(m, 1)) out.push(m); return out; };
const SLIPK = ['gross', 'tds', 'pf', 'pt'];
const monthName = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };
// Figures for one month: the payslip itself, else spread from a later payslip's year-to-date, else scaled from take-home, else projected from the latest payslip
function monthFig(m, salByMonth) {
  const P = slips(), keys = Object.keys(P).sort(); if (!keys.length) return null;
  if (P[m]) return { ...P[m], src: 'slip' };
  const fy = fyOf(m), fyStart = `${fy}-04`;
  const later = keys.find(k => k > m && fyOf(k) === fy && P[k].ytd);
  if (later) {
    const span = monthsIn(fyStart, addMonth(later, -1)), missing = span.filter(k => !P[k]);
    const o = { src: 'ytd' }; SLIPK.forEach(f => { const known = sum(span.filter(k => P[k]).map(k => ({ amount: +P[k][f] || 0 }))) + (+P[later][f] || 0); o[f] = Math.max(0, ((+P[later].ytd[f] || 0) - known) / (missing.length || 1)); }); return o;
  }
  const gap = k => Math.abs(monthsIn(k < m ? k : m, k < m ? m : k).length), near = keys.reduce((a, k) => gap(k) < gap(a) ? k : a, keys[0]), N = P[near];
  const credit = salByMonth[m];
  if (credit && N.net) { const r = credit / N.net, o = { src: 'scaled' }; SLIPK.forEach(f => o[f] = (+N[f] || 0) * r); return o; }
  if (m >= mk(today())) { const o = { src: 'proj' }; SLIPK.forEach(f => o[f] = +N[f] || 0); return o; }
  return { src: 'none', gross: 0, tds: 0, pf: 0, pt: 0 };
}
function slipTotals(from, to, salByMonth) {
  if (!Object.keys(slips()).length) return null;
  const t = { gross: 0, tds: 0, pf: 0, pt: 0, n: { slip: 0, ytd: 0, scaled: 0, proj: 0, none: 0 } };
  monthsIn(from, to).forEach(m => { const f = monthFig(m, salByMonth); if (!f) return; SLIPK.forEach(k => t[k] += f[k] || 0); t.n[f.src]++; });
  SLIPK.forEach(k => t[k] = Math.round(t[k])); t.pt = Math.min(t.pt, 2500); return t;
}
function taxInputs(fy) { return { ...((S.tax || {})[fy] || {}) }; }
function renderTax() {
  const box = $('#taxBox'); if (!box) return;
  const fy0 = fyOf(pKey().length === 4 ? (pKey() === mk(today()).slice(0, 4) ? mk(today()) : pKey() + '-12') : pKey());
  const custom = !!(taxRange && taxRange.from && taxRange.to && taxRange.from <= taxRange.to);
  const fy = custom ? fyOf(taxRange.to.slice(0, 7)) : fy0, D = custom ? taxData(fy, taxRange.from, taxRange.to) : taxData(fy), I = custom ? {} : taxInputs(fy), FI = taxInputs(fy);
  const span = monthsIn(D.from, D.to).length, now = today(), nowM = mk(now);
  const elapsed = now < D.from ? 0 : now > D.to ? span : monthsIn(D.from, now).length - 1;
  const projTake = D.months ? Math.round(D.salary / D.months * span) : 0;
  const ST = slipTotals(D.from, D.to, D.salByMonth);
  const gross = +I.gross || (ST && ST.gross) || 0, rough = !gross, fromSlip = !+I.gross && ST && ST.gross;
  const tdsAmt = I.tds !== undefined && I.tds !== '' ? +I.tds : ST ? ST.tds : 0;
  const paid = r2(tdsAmt + sum(D.pays.filter(e => (FI.paid || []).includes(e.id))));
  if (ST && !custom) { if (I.c80 === undefined) I.c80 = ST.pf; if (I.other === undefined) I.other = ST.pt; }
  const rangeBar = `<div class="txr"><label>From<input type="date" id="txFrom" value="${D.from}"></label><label>To<input type="date" id="txTo" value="${D.to}"></label>${custom ? '<button class="small" id="txFy">↺ FY</button>' : ''}</div>`;
  const span12 = span === 12 && D.from.slice(5) === '04-01' ? fyLabel(fy) : `${dateY(D.from)} – ${dateY(D.to)}`;
  const d = { gross: gross || projTake, dividend: I.dividend !== undefined && I.dividend !== '' ? +I.dividend : D.dividend, interest: I.interest !== undefined && I.interest !== '' ? +I.interest : D.interest, otherInc: I.otherInc !== undefined && I.otherInc !== '' ? +I.otherInc : 0, stcg: +I.stcg || 0, ltcg: +I.ltcg || 0, c80: +I.c80 || 0, d80: +I.d80 || 0, hra: +I.hra || 0, home: +I.home || 0, nps: +I.nps || 0, other: +I.other || 0 };
  if (!d.gross && !d.dividend && !d.interest) { box.innerHTML = rangeBar + `<div class="muted">${span12}: no salary or income found yet. Upload a payslip or tap <b>Enter details</b>.</div><div class="btns" style="margin:8px 0 0"><button class="small" data-slip="1">📄 Upload payslip</button><button class="small" data-tax="edit">Enter details</button></div>`; return; }
  const RU = rulesFor(fy), N = taxCalc('new', d, RU.R), O = taxCalc('old', d, RU.R), best = N.tax <= O.tax ? 'new' : 'old', B = best === 'new' ? N : O, due = Math.round(B.tax - paid);
  const left = Math.max(0, span - elapsed), perMonth = due > 0 && left ? Math.ceil(due / left / 100) * 100 : 0;
  const row = (a, b, cls = '') => `<div class="settle ${cls}"><span>${a}</span><b>${String(b).replace(/\.\d+$/, '')}</b></div>`;
  box.innerHTML = rangeBar + `<div class="muted">${span12} · estimate${rough ? ' (rough — uses your take-home pay)' : ''}${custom && span !== 12 ? ` · ${span} months, taxed as one year` : ''}</div>
    <div class="big" style="font-size:26px">${money(B.tax)} <span class="muted" style="font-size:14px;font-weight:400">tax ${custom ? 'for this period' : 'for the year'} · ${best} regime</span></div>
    <div class="muted">${best === 'new' ? 'New' : 'Old'} regime saves ${money(Math.abs(O.tax - N.tax))} (new ${money(N.tax)} · old ${money(O.tax)})</div>
    <div class="chk ${due > 0 ? 'bad' : 'ok'}" style="margin-top:10px">${paid ? `Paid ${money(paid)} (TDS${fromSlip || (ST && I.tds === undefined) ? (ST.n.scaled || ST.n.proj ? ', estimated from payslips' : ' from payslips') : ''}${(FI.paid || []).length ? ' + tax payments' : ''}). ` : 'No TDS entered yet. '}${due > 0 ? `<b>${money(due)} more to pay</b>${perMonth ? ` — set aside about ${money(perMonth)} a month` : ''}.${due > (RU.R.advanceTaxAbove || 10000) && elapsed < span ? ' Above ₹10,000, advance tax is due in instalments (15 Jun, 15 Sep, 15 Dec, 15 Mar) unless your employer deducts it.' : ''}` : due < 0 ? `<b>About ${money(-due)} refund</b> when you file.` : '<b>All covered.</b>'}</div>
    ${rough ? `<p class="muted" style="margin:8px 0 0">Your salary credits are take-home (after TDS and PF), so this guess is low. Enter your <b>gross salary</b> from your payslip for a real estimate.</p>` : ''}
    <div class="label">How it's worked out (${best} regime)</div>
    ${row(`Salary ${+I.gross ? '(gross, entered)' : fromSlip ? `(gross · ${[ST.n.slip && ST.n.slip + ' from payslips', ST.n.ytd && ST.n.ytd + ' from year-to-date', ST.n.scaled && ST.n.scaled + ' scaled from take-home', ST.n.proj && ST.n.proj + ' projected'].filter(Boolean).join(', ')})` : `(take-home ${D.months ? `${money(D.salary)} in ${D.months} months → ${money(projTake)}` : ''})`}`, money(d.gross))}
    ${row('− Standard deduction', money(B.sd))}
    ${d.dividend ? row('+ Dividends', money(d.dividend)) : ''}${d.interest ? row('+ Bank interest', money(d.interest)) : ''}${d.otherInc ? row('+ Other taxable income', money(d.otherInc)) : ''}
    ${best === 'old' && B.ded ? row('− Deductions (80C, 80D, HRA…)', money(B.ded)) : ''}
    ${row('Taxable income (slab)', money(B.normal))}${d.stcg ? row('Short-term gains (20%)', money(d.stcg)) : ''}${d.ltcg ? row('Long-term gains (12.5% above ₹1.25L)', money(d.ltcg)) : ''}
    ${row('Slab tax', money(B.slab))}${B.rebate ? row('− Rebate (87A)', money(B.rebate)) : ''}${B.cg ? row('+ Capital gains tax', money(B.cg)) : ''}${row('+ Cess 4%', money(B.cess))}
    ${row(custom ? 'Tax for this period' : 'Tax for the year', money(B.tax), 'tot')}
    <div class="btns" style="margin:10px 0 0"><button class="small" data-slip="1">📄 Upload payslip</button><button class="small" data-tax="edit">${rough ? 'Enter gross & TDS' : 'Edit details'}</button><button class="small" data-taxref="1">⟳ Refresh tax rules</button></div>
    ${Object.keys(slips()).length ? `<div class="muted" style="margin-top:6px">📄 Payslips: ${Object.keys(slips()).sort().map(m => monthName(m)).join(', ')}</div>` : ''}
    <div class="muted" style="margin-top:6px">${RU.exact ? `Using ${fyLabel(fy)} rules` : `⚠ ${fyLabel(fy)} rules not published yet — using ${fyLabel(RU.year)} rules`} · updated ${dateY(TAXR.updated)}</div>
    <p class="muted" style="margin-bottom:0">An estimate, not tax advice — check with your Form 16 / a tax advisor before filing. Surcharge (income over ₹50L) isn't included.</p>`;
  box.dataset.fy = fy;
  if (!taxFetched) fetchTaxRules(false);
}
function openTaxForm(fy) {
  const D = taxData(fy), I = taxInputs(fy), v = k => I[k] ?? '';
  const f = (k, label, hint, ph = '') => `<label>${label}<input type="number" inputmode="decimal" min="0" data-tk="${k}" value="${v(k)}" placeholder="${ph}"></label>${hint ? `<div class="muted" style="font-size:12px;margin-top:2px">${hint}</div>` : ''}`;
  openSheet(`<h3>Tax details · ${fyLabel(fy)}</h3><p class="muted" style="margin-top:2px">Only what Trickle can't see in your statements. Leave anything you don't have blank.</p>
    <div class="label">From your payslip</div>
    ${f('gross', 'Gross salary for the year (₹)', `Monthly gross × 12 + bonus. Your take-home so far: ${money(D.salary)}${D.months ? ` in ${D.months} months` : ''}.`)}
    ${f('tds', 'TDS deducted by employer this year (₹)', 'Total for the year (monthly TDS × 12), or what Form 26AS shows so far.')}
    <div class="label">Found in your statements — change if needed</div>
    ${f('dividend', 'Dividends (₹)', '', String(D.dividend))}${f('interest', 'Savings / FD interest (₹)', '', String(D.interest))}${f('otherInc', 'Other taxable income (₹)', 'Freelance, rent received etc. Gifts from family are not taxable.', '0')}
    ${D.pays.length ? `<div class="label">Tax you paid yourself</div>${D.pays.map(e => `<label class="pvrow" style="padding:8px 0"><input type="checkbox" data-tpaid="${e.id}" ${(I.paid || []).includes(e.id) ? 'checked' : ''}><span class="mid"><span class="t">${esc(e.note)} · ${money(e.amount)}</span><span class="s">${niceDate(e.date)}${e.date.slice(5) <= '07-31' ? ' · probably for last year (ITR due 31 Jul)' : ''}</span></span></label>`).join('')}` : ''}
    <div class="label">Shares & mutual funds (from Zerodha / broker P&L)</div>
    ${f('stcg', 'Short-term gains — equity held < 1 year (₹)', '')}${f('ltcg', 'Long-term gains — equity held > 1 year (₹)', 'The first ₹1.25 lakh is tax-free.')}
    <div class="label">Old regime only</div>
    ${f('c80', '80C — EPF, PPF, ELSS, insurance, tuition (₹)', 'Up to ₹1.5 lakh. Your EPF contribution is on your payslip.')}${f('d80', '80D — health insurance (₹)', '')}${f('hra', 'HRA exemption (₹)', '')}${f('home', 'Home loan interest (₹)', 'Up to ₹2 lakh.')}${f('nps', 'NPS 80CCD(1B) (₹)', 'Up to ₹50,000.')}${f('other', 'Other deductions incl. professional tax (₹)', '')}
    <button class="primary" id="taxSave">Save</button><button style="width:100%;margin-top:8px" id="taxNo">Cancel</button>`, ev => {
    if (ev.target.id === 'taxNo') return closeSheet();
    if (ev.target.id !== 'taxSave') return;
    const o = {}; $$('#sheet [data-tk]').forEach(i => { if (i.value !== '') o[i.dataset.tk] = +i.value; });
    o.paid = $$('#sheet [data-tpaid]').filter(i => i.checked).map(i => i.dataset.tpaid);
    S.tax = { ...(S.tax || {}), [fy]: o }; saveMeta(); closeSheet(); toast('Tax details saved');
  });
}
document.addEventListener('change', ev => { if (ev.target.id === 'txFrom' || ev.target.id === 'txTo') { const f = $('#txFrom').value, t = $('#txTo').value; if (f && t && f <= t) { taxRange = { from: f, to: t }; renderTax(); } else toast('“From” must be before “To”'); } });
document.addEventListener('click', ev => { if (ev.target.id === 'txFy') { taxRange = null; return renderTax(); } if (ev.target.closest('[data-slip]')) { fileTarget = ''; return $('#slipFile').click(); } });
document.addEventListener('click', ev => { if (ev.target.closest('[data-taxref]')) { ev.target.closest('[data-taxref]').textContent = '⟳ Checking…'; return fetchTaxRules(true); } const b = ev.target.closest('[data-tax]'); if (b) openTaxForm(+$('#taxBox').dataset.fy || fyOf(mk(today()))); });
let openFriend = null;
function renderFriends() {
  const L = friendLedger(), fs = Object.values(L).filter(f => f.list.length);
  if (!fs.length) { $('#friendsBox').innerHTML = '<div class="muted">Paid for a friend (e.g. their train ticket) or lent money? In Expenses, select it and tap 🤝 Friend. It won\'t count as your spending, and when they pay you back, mark that credit the same way.</div>'; return; }
  fs.sort((a, b) => b.owed - a.owed || b.paid - a.paid);
  const owed = r2(fs.reduce((t, f) => t + Math.max(0, f.owed), 0)), iOwe = r2(fs.reduce((t, f) => t + Math.max(0, -f.owed), 0)), shared = r2(fs.reduce((t, f) => t + f.shared, 0));
  $('#friendsBox').innerHTML = `<div class="big" style="font-size:24px">${money(owed)}</div><div class="muted">${owed ? 'Friends still owe you' : 'Nobody owes you 🎉'}${iOwe ? ` · <b class="up">you owe ${money(iOwe)}</b>` : ''} · not counted in your spending${shared ? ` · ${money(shared)} paid back for shared costs (reduces your spending)` : ''}</div>
    ${fs.map(f => `<div class="settle frow" data-fr="${esc(f.name)}"><span>🤝 ${esc(f.name)}<span class="muted"> · ${[f.paid ? 'you paid ' + money(f.paid) : '', f.theyPaid ? 'they paid ' + money(f.theyPaid) + ' for you' : '', f.back ? 'got back ' + money(f.back) : ''].filter(Boolean).join(', ')}${f.shared ? ` (${money(f.shared)} for shared costs)` : ''}</span></span><b class="${f.owed > .5 ? 'up' : f.owed < -.5 ? 'warn' : 'down'}">${f.owed > .5 ? 'owes ' + money(f.owed) : f.owed < -.5 ? 'you owe ' + money(-f.owed) : 'settled ✓'}</b></div>${openFriend === f.name ? `<div>${f.list.sort((x, y) => y.date.localeCompare(x.date)).map(e => itemHTML(e, true)).join('')}</div>` : ''}`).join('')}`;
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
  const small = ex.filter(e => e.amount > 0 && e.amount < 200);
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
  const row = (c, i, l) => { const fr = c.name === OWE_OUT || c.name === OWE_IN, inc = l === 'incCats', how = c.counts || (inc ? 'income' : 'spend');
    return `<div class="catwrap" data-l="${l}" data-i="${i}"><div class="catrow"><input class="e" value="${esc(c.icon)}" data-k="icon" maxlength="4"><input value="${esc(c.name)}" data-k="name" maxlength="24"><input type="color" value="${c.color}" data-k="color"><button class="small" data-del="${i}">✕</button></div>
      ${fr ? '<div class="catopt muted">Tracked per friend · not counted</div>' : `<div class="catopt"><select data-k="counts">${(inc ? [['income', 'Counts as income'], ['refund', 'Reduces spending (refund)'], ['skip', 'Not counted (transfer)']] : [['spend', 'Counts as spending'], ['skip', 'Not counted (transfer)']]).map(([v, t]) => `<option value="${v}" ${v === how ? 'selected' : ''}>${t}</option>`).join('')}</select>${inc && how === 'refund' ? `<select data-k="against"><option value="">from all spending</option>${S.categories.filter(x => x.name !== OWE_OUT).map(x => `<option value="${esc(x.name)}" ${x.name === c.against ? 'selected' : ''}>from ${esc(x.name)}</option>`).join('')}</select>` : ''}</div>`}</div>`; };
  $('#incEdit').innerHTML = S.incCats.map((c, i) => row(c, i, 'incCats')).join('');
  $('#catEdit').innerHTML = S.categories.map((c, i) => row(c, i, 'categories')).join('');
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
  el.innerHTML = `<div class="label" style="margin-top:0">Account</div><div class="muted">Cloud sync is private to this app's owner. Everyone else: Trickle works fully on this phone — save a backup file now and then (below) to move to a new phone.</div>
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
  const row = e.target.closest('.catwrap'), k = e.target.dataset.k; if (!row || !k) return;
  const L = S[row.dataset.l], c = L[+row.dataset.i], v = e.target.value.trim(); e.target.blur();
  if (k === 'name') {
    if (c.name === OWE_OUT || c.name === OWE_IN) { toast('This one is built in — change its icon or colour only'); schedule(); return; }
    if (!v || [...S.categories, ...S.incCats].some(o => o !== c && o.name.toLowerCase() === v.toLowerCase())) { toast('Name empty or already used'); schedule(); return; }
    const old = c.name; c.name = v; S.rules.forEach(r => { if (r.cat === old) r.cat = v; }); S.incCats.forEach(x => { if (x.against === old) x.against = v; }); if (selCat === old) selCat = v; if (selInc === old) selInc = v;
    const moved = allExp().filter(x => x.cat === old).map(x => ({ ...x, cat: v })); if (moved.length) putMany(moved);
  } else if (k === 'counts') { if (v === 'spend' || v === 'income') delete c.counts; else c.counts = v; if (v !== 'refund') delete c.against; }
  else if (k === 'against') { if (v) c.against = v; else delete c.against; }
  else c[k] = v || c[k];
  saveMeta();
};
$('#catEdit').onchange = catEditChange; $('#incEdit').onchange = catEditChange;
$('#catEdit').onclick = $('#incEdit').onclick = e => { const b = e.target.closest('[data-del]'); if (!b) return; const L = S[b.closest('.catwrap').dataset.l]; const c = L[+b.dataset.del]; if (c.name === OWE_OUT || c.name === OWE_IN) return toast('This one is built in'); const n = allExp().filter(x => x.cat === c.name).length; if (n) return toast(`Used by ${n} entr${n > 1 ? 'ies' : 'y'} — rename it instead`); if (L.length <= 1) return; L.splice(+b.dataset.del, 1); S.rules = S.rules.filter(r => r.cat !== c.name); saveMeta(); };
$('#addInc').onclick = () => { let n = 'New income', i = 2; while (cat(n).icon !== '🏷️') n = 'New income ' + i++; S.incCats.push({ name: n, icon: '💰', color: '#7cb342' }); saveMeta(); render(); const ins = $$('#incEdit input[data-k=name]'); ins[ins.length - 1].focus(); ins[ins.length - 1].select(); };
$('#addCat').onclick = () => { let n = 'New category', i = 2; while (S.categories.some(c => c.name === n)) n = 'New category ' + i++; S.categories.push({ name: n, icon: '🏷️', color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'), budget: 0 }); saveMeta(); render(); const ins = $$('#catEdit input[data-k=name]'); ins[ins.length - 1].focus(); ins[ins.length - 1].select(); };
$('#wipe').onclick = () => { if (!S.expenses.length) return toast('Nothing to delete'); if (!confirm(`Delete all ${S.expenses.length} personal expenses${cloud ? ' from your account' : ' on this phone'}? Trips are kept. Save a backup first!`)) return; if (prompt('Type DELETE to confirm') !== 'DELETE') return; putMany([...S.expenses], true); toast('Personal expenses deleted'); };

// ---------- category rules & quick change ----------
const keyOf = n => String(n || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
function ruleFor(text, type) { const t = keyOf(text); if (!t) return null; const L = type === 'in' ? S.incCats : S.categories; const r = [...S.rules].sort((a, b) => b.k.length - a.k.length).find(r => r.k && t.includes(r.k) && L.some(c => c.name === r.cat)); return r ? r.cat : null; }
const isIncCat = n => S.incCats.some(c => c.name === n);
function setRule(k, n) { k = keyOf(k); if (k.length < 2) return; const r = S.rules.find(r => r.k === k && isIncCat(r.cat) === isIncCat(n)); if (r) { r.cat = n; delete r.who; } else S.rules.push({ k, cat: n }); }
function ruleRec(text, type) { const t = keyOf(text); if (!t) return null; const L = type === 'in' ? S.incCats : S.categories; return [...S.rules].sort((a, b) => b.k.length - a.k.length).find(r => r.k && t.includes(r.k) && L.some(c => c.name === r.cat)) || null; }
const nameOf = n => String(n || '').replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/\s+/).filter(w => w.length > 2)[0]?.replace(/^./, c => c.toUpperCase()).replace(/\B./g, c => c.toLowerCase()) || String(n).trim();
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
    if (b.dataset.pick === OWE_OUT || b.dataset.pick === OWE_IN) return askFriend('Which friend?', `${esc(e.note || e.cat)} · ${money(e.amount)}`, (n, sh) => markFriend([e], n, sh), isInc(e));
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
$('#expBackup').onclick = () => deliver(`trickle-backup-${today()}.json`, JSON.stringify({ app: 'trickle', v: 3, ...metaOf(S), expenses: S.expenses, trips: S.trips.map(t => ({ id: t.id, name: t.name, start: t.start, end: t.end, budget: t.budget, notes: t.notes || '', members: t.members })), tripExp: TE }), 'application/json');

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
    if (/\.pdf$/.test(name) || file.type === 'application/pdf') return readPayslips([file]);
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
// Checks a bank statement's running balance: every row should equal previous balance − withdrawal + deposit.
function balanceCheck(seq) {
  if (!seq.length) return null;
  const dates = seq.map(x => x.d).sort(), from = dates[0], to = dates[dates.length - 1];
  const wd = r2(seq.reduce((t, x) => t + x.w, 0)), dep = r2(seq.reduce((t, x) => t + x.c, 0));
  if (seq.some(x => x.b === null)) return { from, to, wd, dep, n: seq.length };
  const test = q => { let bad = 0, first = null; for (let i = 1; i < q.length; i++) if (Math.abs(r2(q[i - 1].b - q[i].w + q[i].c) - q[i].b) > .5) { bad++; if (!first) first = q[i].d; } return { bad, first }; };
  let q = seq, t = test(q); const rev = [...seq].reverse(), t2 = test(rev); if (t2.bad < t.bad) { q = rev; t = t2; }
  const opening = r2(q[0].b + q[0].w - q[0].c), closing = q[q.length - 1].b;
  return { from, to, wd, dep, n: q.length, opening, closing, bad: t.bad, firstBad: t.first, sums: Math.abs(r2(opening - wd + dep) - closing) <= .5 };
}
function balanceHTML(b) {
  if (!b) return '';
  let h = '';
  if (b.opening === undefined) h = `<div class="chk">📅 ${niceDate(b.from)} – ${niceDate(b.to)} · ${b.n} transactions. <span class="muted">No balance column, so the totals can't be cross-checked.</span></div>`;
  else if (!b.bad && b.sums) h = `<div class="chk ok">✓ <b>Balance check passed</b><br><span class="muted">${niceDate(b.from)} – ${niceDate(b.to)}: opening ${money(b.opening)} − spent ${money(b.wd)} + received ${money(b.dep)} = closing ${money(b.closing)}. All ${b.n} transactions read.</span></div>`;
  else h = `<div class="chk bad">⚠ <b>Balance doesn't add up</b><br><span class="muted">${b.bad} row${b.bad > 1 ? 's' : ''} don't match the running balance${b.firstBad ? ` (first around ${niceDate(b.firstBad)})` : ''}. A line may be missing or misread — check the statement before importing.</span></div>`;
  const prev = (S.stmts || []).filter(x => x.to < b.from && x.closing !== undefined).sort((a, c) => c.to.localeCompare(a.to))[0];
  if (prev && b.opening !== undefined) {
    const gap = r2(b.opening - prev.closing);
    if (Math.abs(gap) > .5) h += `<div class="chk bad">⚠ <b>Gap since your last statement</b><br><span class="muted">It ended at ${money(prev.closing)} on ${niceDate(prev.to)}, but this one opens at ${money(b.opening)} — ${money(Math.abs(gap))} of transactions between ${niceDate(prev.to)} and ${niceDate(b.from)} are missing.</span></div>`;
    else if (daysBetween(prev.to, b.from) > 1) h += `<div class="chk ok">✓ Continues from your statement ending ${niceDate(prev.to)} (balance matches).</div>`;
  }
  return h;
}
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);
function rowsToExpenses(rows) {
  const low = r => r.map(c => String(c ?? '').toLowerCase().trim());
  const hi = rows.findIndex(r => { const h = low(r); return h.some(c => /date/.test(c)) && h.some(c => /withdrawal|debit|^amount/.test(c)); });
  if (hi < 0) throw new Error('no header row with Date and Withdrawal/Debit/Amount columns');
  const H = low(rows[hi]), col = re => H.findIndex(h => re.test(h)), now = Date.now(), list = [];
  const wcol = col(/withdrawal|debit/), dcol = col(/deposit|credit/), bcol = col(/closing|balance/);
  if (wcol >= 0) {
    let cd = H.findIndex(h => /date/.test(h) && !/value/.test(h)); if (cd < 0) cd = col(/date/);
    const cn = col(/narration|description|particular|remark|detail|transaction/), cr = col(/ref|chq|cheque/);
    const seq = [];
    rows.slice(hi + 1).forEach((r, i) => {
      const d = parseDate(r[cd]), amt = num(r[wcol]), dep = dcol >= 0 ? num(r[dcol]) : 0; if (!d) return;
      if (amt > 0 || dep > 0) seq.push({ d, w: amt > 0 ? amt : 0, c: dep > 0 ? dep : 0, b: bcol >= 0 && String(r[bcol] ?? '').trim() !== '' ? num(r[bcol]) : null });
      const n = String(cn >= 0 ? r[cn] ?? '' : '').trim();
      if (!(amt > 0)) { if (dep > 0) list.push({ id: 'i' + hash(d + '|' + dep + '|' + n + '|' + (cr >= 0 ? r[cr] : '')), ts: now - i, type: 'in', date: d, amount: r2(dep), cat: guessInc(n), mode: guessMode(n), person: '', note: cleanNarration(n), raw: n }); return; }
      list.push({ id: 'b' + hash(d + '|' + amt + '|' + n + '|' + (cr >= 0 ? r[cr] : '')), ts: now - i, date: d, amount: r2(amt), cat: guessCat(n), mode: guessMode(n), person: '', note: cleanNarration(n), raw: n });
    });
    const bal = balanceCheck(seq), hdr = rows.slice(0, hi).map(r => r.join(' ')).join(' ').match(/from\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*to\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
    if (bal && hdr) { const f = parseDate(hdr[1]), t = parseDate(hdr[2]); if (f && t && f <= bal.from && t >= bal.to) { bal.from = f; bal.to = t; } }
    list.forEach(e => { if (isFriend(e) && !e.who) { const r = ruleRec(e.raw || e.note, isInc(e) ? 'in' : ''); e.who = (r && r.who) || nameOf(e.note); } });
    return { kind: 'bank', list, bal };
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
  const linkTo = target && res.kind === 'bank' ? target : '';   // my own bank spends: keep in my spending, show in the trip
  if (linkTo) target = '';
  if (!res.list.length) return toast('No spends found for this trip', 3500);
  const existing = {}; const seen = dest => existing[dest] || (existing[dest] = { ids: new Set((dest && !dest.startsWith('new:') ? tripExp(dest) : dest ? [] : S.expenses).map(x => x.id)), sigs: new Set((dest && !dest.startsWith('new:') ? tripExp(dest) : dest ? [] : S.expenses).map(sig)) });
  const rows = res.list.sort((a, b) => b.date.localeCompare(a.date)).map(e => {
    const dest = destOf(e, target), ex = seen(dest), dup = ex.ids.has(e.id) || ex.sigs.has(sig(e));
    const xfer = res.kind === 'bank' && (isInc(e) ? OWN_IN_RE : TRANSFER_RE).test(e.raw || e.note), out = t && t.start && (e.date < t.start || e.date > (t.end || t.start));
    return { e, dest, dup, on: !dup && !xfer && !out, why: dup ? 'Already added' : xfer ? (isInc(e) ? 'Looks like money from your own account' : 'Looks like a card bill or transfer') : out ? 'Outside trip dates' : '' };
  });
  const people = peopleFor(target || linkTo);
  PV = { kind: res.kind, bal: res.bal, target, linkTo, rows, person: target ? (people.includes(meIn(t)) ? meIn(t) : people[0]) : linkTo ? S.lastPerson : (people.includes(S.lastPerson) ? S.lastPerson : people[0]) };
  const nIn = rows.filter(x => isInc(x.e)).length, nOut = rows.length - nIn;
  openSheet(`<h3>${nOut ? nOut + ' spend' + (nOut > 1 ? 's' : '') : ''}${nOut && nIn ? ' and ' : ''}${nIn ? nIn + ' income' : ''} found</h3>
    ${res.kind === 'bank' && !target && !linkTo ? balanceHTML(res.bal) : ''}
    <div class="muted">Adding to <b>${linkTo ? 'your spending, also shown in ✈ ' + esc(t.name) : t ? '✈ ' + esc(t.name) : res.kind === 'csv' && rows.some(r => r.dest) ? 'personal expenses and trips in the file' : 'personal expenses'}</b>. Untick anything that isn't a real expense.</div>
    ${res.kind === 'bank' && !linkTo ? `<label>${nIn ? 'Paid / received by' : 'Paid by'}<select id="pvPerson">${opts(people, PV.person)}</select></label>` : ''}
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
    if (PV.linkTo) { e.tripLink = PV.linkTo; e.person = S.people.includes(S.lastPerson) ? S.lastPerson : S.people[0]; }
    if (dest) { e.trip = dest; const t = newTrips[Object.keys(newTrips).find(k => newTrips[k].id === dest)] || trip(dest); if (!e.person) e.person = t.members[0] || myName(); if (t && !t.members.includes(e.person)) { t.members.push(e.person); t._dirty = true; } }
    else { delete e.trip; if (!e.person) e.person = S.lastPerson; if (!S.people.includes(e.person)) { S.people.push(e.person); metaChanged = true; } }
    if (isInc(e) ? ensureIncCat(e.cat) : ensureCat(e.cat)) metaChanged = true;
    out.push(e);
  });
  Object.values(newTrips).forEach(t => { const ds = out.filter(e => e.trip === t.id).map(e => e.date).sort(); t.start = ds[0] || ''; t.end = ds[ds.length - 1] || ''; if (!t.members.length) t.members = [myName()]; putTrip(t, true); });
  S.trips.forEach(t => { if (t._dirty) { delete t._dirty; putTrip(t, false); } });
  if (PV.kind === 'bank' && !PV.target && !PV.linkTo && S.lastPerson !== PV.person) { S.lastPerson = PV.person; metaChanged = true; }
  if (metaChanged) saveMeta();
  putMany(out);
  if (PV.kind === 'bank' && PV.bal && !PV.target && !PV.linkTo) { const b = PV.bal; S.stmts = (S.stmts || []).filter(x => !(x.from === b.from && x.to === b.to)); S.stmts.push({ from: b.from, to: b.to, n: b.n, ...(b.opening !== undefined ? { opening: b.opening, closing: b.closing } : {}) }); S.stmts.sort((a, c) => a.from.localeCompare(c.from)); metaChanged = true; }
  if (metaChanged) saveMeta();
  const target = PV.target || PV.linkTo, skipped = PV.rows.length - sel.length; PV = null; closeSheet();
  toast(`Imported ${out.length}${skipped ? `, skipped ${skipped}` : ''}`, 4000);
  if (target) { curTrip = target; go('trips'); } else if (out.some(e => !e.trip)) { month = mk(out.filter(e => !e.trip).map(e => e.date).sort().pop()); go('list'); } else go('trips');
}
function applyFixFile(raw) {
  const b = normalize(raw), byId = new Map(S.expenses.map(e => [e.id, e])), F = ['cat', 'type', 'who', 'forShared', 'note', 'amount', 'date', 'mode', 'split', 'reviewed'];
  const same = (x, y) => F.every(f => JSON.stringify(x[f] ?? null) === JSON.stringify(y[f] ?? null));
  const changed = b.expenses.filter(e => byId.has(e.id) && !same(e, byId.get(e.id))).map(e => { const o = byId.get(e.id), x = { ...o }; F.forEach(f => { if (e[f] === undefined) delete x[f]; else x[f] = e[f]; }); if (!e.split) { delete x.splitBy; delete x.meShares; } else { x.splitBy = e.splitBy; x.meShares = e.meShares; } return x; });
  const added = b.expenses.filter(e => !byId.has(e.id)), removed = new Set((raw.removedCats || []).map(String));
  if (!confirm(`Apply fixes${raw.title ? ' — ' + raw.title : ''}?\n\n• Update ${changed.length} existing entries\n• Add ${added.length} new entries\n• Replace categories and auto-category rules\n\nTip: save a backup first.`)) return;
  const keep = (mine, theirs) => [...theirs, ...mine.filter(c => !theirs.some(t => t.name.toLowerCase() === c.name.toLowerCase()) && !removed.has(c.name))];
  S.categories = keep(S.categories, b.categories); S.incCats = keep(S.incCats, b.incCats); S.rules = b.rules; saveMeta();
  putMany(changed); if (added.length) putMany(added);
  toast(`Fixes applied: ${changed.length} updated${added.length ? `, ${added.length} added` : ''}`, 4500);
}
function restoreBackup(raw) {
  if (!raw || (!Array.isArray(raw.expenses) && !Array.isArray(raw.trips))) return toast('That file isn\'t a Trickle backup', 4000);
  if (raw.fix) return applyFixFile(raw);
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
// Hide the floating notes button while the keyboard is up
document.addEventListener('focusin', e => { if (e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea') && !e.target.closest('#sheet')) document.body.classList.add('typing'); });
document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!a || !a.matches('input,textarea')) document.body.classList.remove('typing'); }, 50));

// ---------- Payslip PDF reader ----------
async function loadPDF() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = PDFJS_URL; s.onload = res; s.onerror = () => rej(new Error('The PDF reader needs internet the first time')); document.head.appendChild(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return window.pdfjsLib;
}
async function pdfLines(file) {
  const L = await loadPDF(), doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, lines = [];
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const tc = await (await doc.getPage(p)).getTextContent(), rows = [];
    tc.items.filter(i => i.str.trim()).forEach(i => { const y = i.transform[5], x = i.transform[4]; let r = rows.find(r => Math.abs(r.y - y) < 3); if (!r) rows.push(r = { y, it: [] }); r.it.push({ x, s: i.str.trim() }); });
    rows.sort((a, b) => b.y - a.y).forEach(r => lines.push(r.it.sort((a, b) => a.x - b.x).map(i => i.s).join(' ')));
  }
  return lines;
}
const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DED_RE = /provident|\bp\.?f\b|vpf|epf|professional|prof\.? ?tax|\bp\.?t\b|income ?tax|\btds\b|deduction|recovery|\besi|\blwf|loan|advance|nps|welfare|insurance premium/i;
function parsePayslip(lines, fname) {
  const text = lines.join('\n'); let month = '';
  const mm = text.match(/pay\s*slip[^\n]{0,30}?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-'’,.]*(\d{4}|\d{2})\b/i) || text.match(/\b(?:month|period)[^\n]{0,15}?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-'’,.]*(\d{4}|\d{2})\b/i) || String(fname).match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_\-]*(\d{4})/i);
  if (mm) { const y = mm[2].length === 2 ? '20' + mm[2] : mm[2]; month = `${y}-${String(MONTHS3.indexOf(mm[1].toLowerCase()) + 1).padStart(2, '0')}`; }
  const N = '(-?\\d[\\d,]*\\.\\d{1,2}|-?\\d{1,3}(?:,\\d{2,3})+|-?\\d+)';
  const pick = re => { for (const l of lines) { const m = l.match(new RegExp('(?:' + re.source + ')\\s*:?\\s*(?:rs\\.?|₹|inr)?\\s*' + N, 'i')); if (m) return num(m[1]); } return 0; };
  let start = lines.findIndex(l => /earnings/i.test(l) && /deductions?/i.test(l)); if (start < 0) start = lines.findIndex(l => /earnings/i.test(l));
  const earn = [], ded = [];
  if (start >= 0) for (const l of lines.slice(start + 1)) {
    if (/gross|total|net\s*pay|net\s*salary|in words/i.test(l) && !/[a-z]{3,}.*\d.*[a-z]{3,}.*\d/i.test(l.replace(/gross|total|earnings|deductions|net|pay|salary/gi, ''))) break;
    const re = new RegExp('([A-Za-z][A-Za-z0-9 .&()/\'’-]*?)\\s*:?\\s+' + N + '(?:\\s+' + N + ')?(?=\\s|$)', 'g'); let m;
    while ((m = re.exec(l))) { const label = m[1].trim(); if (label.length < 2) continue; (DED_RE.test(label) && !/allowance/i.test(label) ? ded : earn).push({ label, amt: num(m[2]), ytd: m[3] !== undefined ? num(m[3]) : null }); }
  }
  const sumF = (L, f) => r2(L.reduce((a, r) => a + (r[f] || 0), 0));
  const of = (re, f) => r2(ded.filter(r => re.test(r.label)).reduce((a, r) => a + (r[f] || 0), 0));
  const TDS = /income ?tax|\btds\b/i, PF = /provident|\bp\.?f\b|vpf|epf/i, PT = /professional|prof\.? ?tax|\bp\.?t\b/i;
  const gross = pick(/gross\s*(?:earnings|salary|pay)|total\s*earnings/) || sumF(earn, 'amt');
  const net = pick(/net\s*(?:pay|salary|amount)|take\s*home/);
  const slip = { gross, tds: of(TDS, 'amt'), pf: of(PF, 'amt'), pt: of(PT, 'amt'), net };
  if (earn.length && earn.every(r => r.ytd !== null)) slip.ytd = { gross: sumF(earn, 'ytd'), tds: of(TDS, 'ytd'), pf: of(PF, 'ytd'), pt: of(PT, 'ytd') };
  return { month, slip, earn, ded };
}
async function readPayslips(files) {
  const got = [];
  for (const f of files) {
    try { const r = parsePayslip(await pdfLines(f), f.name); if (r.slip.gross > 0) got.push({ ...r, name: f.name }); else toast(`Couldn't find pay figures in ${f.name}`); }
    catch (e) { toast(e.message || `Couldn't read ${f.name}`); }
  }
  if (!got.length) return;
  const row = (a, b) => `<div class="settle"><span>${a}</span><b>${b}</b></div>`;
  openSheet(`<h3>📄 Payslip${got.length > 1 ? 's' : ''}</h3><p class="muted" style="margin-top:2px">Only the pay figures are saved — not your PAN, bank or employee details.</p>
    ${got.map((g, i) => `<div class="card" style="margin:10px 0;padding:12px"><label style="margin:0">Month<input type="month" data-sm="${i}" value="${g.month}"></label>
      ${row('Gross pay', money(g.slip.gross))}${row('Income tax (TDS)', money(g.slip.tds))}${row('Provident fund', money(g.slip.pf))}${g.slip.pt ? row('Professional tax', money(g.slip.pt)) : ''}${g.slip.net ? row('Net pay', money(g.slip.net)) : ''}
      ${g.slip.ytd ? `<div class="muted" style="margin-top:6px">Year to date: gross ${money(g.slip.ytd.gross)} · TDS ${money(g.slip.ytd.tds)} · PF ${money(g.slip.ytd.pf)}</div>` : '<div class="muted" style="margin-top:6px">No year-to-date column — other months are estimated from your take-home.</div>'}</div>`).join('')}
    <p class="muted">The tax card will use these for gross salary, TDS, PF (80C) and professional tax. Months without a payslip are filled in from year-to-date totals or your take-home pay. Anything you typed in <b>Enter details</b> for gross or TDS is cleared so the payslip is used.</p>
    <button class="primary" id="slipSave">Save</button><button style="width:100%;margin-top:8px" id="slipNo">Cancel</button>`, ev => {
    if (ev.target.id === 'slipNo') return closeSheet();
    if (ev.target.id !== 'slipSave') return;
    const P = { ...slips() }, fys = new Set();
    for (const [i, g] of got.entries()) { const m = $(`#sheet [data-sm="${i}"]`).value; if (!/^\d{4}-\d{2}$/.test(m)) return toast('Pick the month for each payslip'); P[m] = g.slip; fys.add(fyOf(m)); }
    const T = { ...(S.tax || {}), slips: P }; fys.forEach(fy => { if (T[fy]) { const o = { ...T[fy] }; delete o.gross; delete o.tds; T[fy] = o; } });
    S.tax = T; saveMeta(); closeSheet(); go('stats'); toast(`Payslip${got.length > 1 ? 's' : ''} saved`); setTimeout(() => $('#taxBox')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
  });
}
$('#slipFile').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await readPayslips(fs); };
