const CACHE='gestione-srl-v26-desktop-fullwidth';
const ASSETS=['./','./index.html','./styles.css?v=26','./mobile.css?v=20','./app.js?v=13','./manifest.json','./icon.svg','./supabase-config.js','./supabase-sync.js','./gestione-srl-auth.js','./expense-accounting-fix.js','./balance-inps.js'];
const CLOUD_SCRIPTS=`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="./supabase-config.js?v=17"></script><script src="./expense-accounting-fix.js?v=24"></script><script src="./supabase-sync.js?v=25"></script><script src="./gestione-srl-auth.js?v=17"></script><script src="./balance-inps.js?v=21"></script>`;
const MOBILE_STYLE='<link rel="stylesheet" href="./mobile.css?v=20" />';

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

function enhanceHtml(html){
  if(!html.includes('mobile.css')) html=html.replace('</head>',`${MOBILE_STYLE}</head>`);
  if(!html.includes('gestione-srl-auth.js')) {
    html=html.replace('</body>',`${CLOUD_SCRIPTS}</body>`);
  } else {
    html=html.replace(/<script src="\.\/expense-accounting-fix\.js\?v=\d+"><\/script>/g,'');
    html=html.replace('</body>','<script src="./expense-accounting-fix.js?v=24"></script></body>');
    if(!html.includes('balance-inps.js')) html=html.replace('</body>','<script src="./balance-inps.js?v=21"></script></body>');
  }
  return html;
}

async function enhancedIndex(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;
    const html=enhanceHtml(await response.text());
    const enhanced=new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    const copy=enhanced.clone();
    caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
    return enhanced;
  }catch(_e){
    const cached=await caches.match('./index.html');
    if(!cached) throw _e;
    const html=enhanceHtml(await cached.text());
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