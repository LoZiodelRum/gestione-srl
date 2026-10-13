const CACHE='gestione-srl-v14-supabase-sync';
const ASSETS=['./','./index.html','./styles.css?v=13','./app.js?v=13','./manifest.json','./icon.svg','./supabase-config.js','./supabase-sync.js'];
const CLOUD_SCRIPTS=`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="./supabase-config.js?v=14"></script><script src="./supabase-sync.js?v=14"></script>`;

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function enhancedIndex(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;
    let html=await response.text();
    if(!html.includes('supabase-sync.js')) html=html.replace('</body>',`${CLOUD_SCRIPTS}</body>`);
    const enhanced=new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    const copy=enhanced.clone();
    caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
    return enhanced;
  }catch(_e){
    const cached=await caches.match('./index.html');
    if(!cached) throw _e;
    let html=await cached.text();
    if(!html.includes('supabase-sync.js')) html=html.replace('</body>',`${CLOUD_SCRIPTS}</body>`);
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  if(event.request.mode==='navigate'){
    event.respondWith(enhancedIndex(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
