const C='wg-v1',F=['./','index.html','app.js','manifest.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F))));
self.addEventListener('fetch',e=>{
  if(e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
