const CACHE='trickle-v12';
const FILES=['./','./index.html','./app.js','./firebase-config.js','./manifest.json','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(f).catch(()=>{})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
// Network first (so updates show up), cache fallback when offline.
// Only the app's own files and its script CDNs are handled; Firebase API traffic is left alone.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(!(u.origin===location.origin||u.hostname==='www.gstatic.com'||u.hostname==='cdnjs.cloudflare.com'))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return r;})
    .catch(()=>caches.match(e.request,{ignoreSearch:u.origin===location.origin}).then(r=>r||caches.match('./index.html'))));
});
