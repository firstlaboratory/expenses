const CACHE='trickle-v16';
const FILES=['./','./index.html','./app.js','./firebase-config.js','./manifest.json','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:'reload'})).catch(()=>{})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
// Network first, always revalidating the app's own files (GitHub Pages caches them for 10 min),
// falling back to the offline cache. Firebase API traffic is left alone.
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const u=new URL(req.url),own=u.origin===location.origin;
  if(!(own||u.hostname==='www.gstatic.com'||u.hostname==='cdnjs.cloudflare.com'))return;
  const net=own?fetch(u.href,{cache:'no-cache',credentials:'same-origin'}):fetch(req);
  e.respondWith(net.then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(own?u.origin+u.pathname:req,cp));}return r;})
    .catch(()=>caches.match(own?u.origin+u.pathname:req).then(r=>r||caches.match('./index.html'))));
});
