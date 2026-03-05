import fs from 'node:fs'

const outPath = new URL('../public/crawler.html', import.meta.url)

const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>monitor.tierimfokus.ch Endpoint-Status</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
    .wrap{max-width:1100px;margin:0 auto}
    h1{margin:0 0 8px}
    p{color:#a9bfd8}
    .links{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 16px}
    .links a{display:inline-block;border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:999px;text-decoration:none;color:#dbeafe}
    button{margin:6px 0 14px;border:1px solid #4b5563;border-radius:8px;padding:6px 10px;background:#22364f;color:#e8effa;cursor:pointer}
    table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #334155;border-radius:12px;overflow:hidden}
    td,th{border-bottom:1px solid #1f2937;padding:10px;vertical-align:top;text-align:left}
    th{background:#1b2433;color:#dbeafe;font-weight:700}
    tr:hover td{background:#172133}
    .ok{color:#22c55e;font-weight:700}.warn{color:#f59e0b;font-weight:700}.err{color:#ef4444;font-weight:700}
    code{background:#1f2937;border:1px solid #334155;color:#dbeafe;padding:1px 5px;border-radius:6px}
    small{color:#94a3b8}
  </style>
</head>
<body>
  <main class="wrap">
    <h1>monitor.tierimfokus.ch Endpoint-Status</h1>
    <p>Debug-Seite für API-Endpunkte. Prüft sowohl <strong>native</strong> Pfade als auch <strong>Netlify Functions</strong>.</p>
    <nav class="links">
      <a href="/review.html">Review</a>
      <a href="/">App</a>
      <a href="/user-input.html">User-Input</a>
    </nav>
    <button onclick="runChecks()">Neu prüfen</button>
    <table>
      <thead>
        <tr><th>Endpoint</th><th>Method</th><th>Status</th><th>Detail</th></tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
    <p><small>Primärziel ist jetzt <code>/api/*</code> (netlify-frei). Der Netlify-Check bleibt nur als Migrations-Indikator sichtbar.</small></p>
  </main>
<script>
const checks=[
  {path:'/api/home-data',method:'GET'},
  {path:'/api/feedback-submit',method:'POST',body:{id:'debug',vote:'up'}},
  {path:'/api/review-decision',method:'POST',body:{id:'debug',status:'approved'}},
  {path:'/api/review-fastlane-tag',method:'POST',body:{id:'debug',fastlane:true}},
  {path:'/api/review-status?id=ch-parliament-business-de:20213835-de',method:'GET'},
  // Legacy check for migration visibility
  {path:'/.netlify/functions/home-data',method:'GET'},
]
const esc=(s='')=>String(s).replace(/[&<>]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[ch]))
async function one(c){
  try{
    const res=await fetch(c.path,{method:c.method,headers:{'content-type':'application/json'},body:c.body?JSON.stringify(c.body):undefined})
    const txt=await res.text()
    return {ok:res.ok,status:res.status,detail:txt.slice(0,240)}
  }catch(e){
    return {ok:false,status:'ERR',detail:String(e&&e.message||e).slice(0,240)}
  }
}
async function runChecks(){
  const tb=document.getElementById('rows');tb.innerHTML=''
  for(const c of checks){
    const r=await one(c)
    const cls=r.ok?'ok':(String(r.status).startsWith('4')?'warn':'err')
    const tr=document.createElement('tr')
    tr.innerHTML=\`<td>\${esc(c.path)}</td><td>\${esc(c.method)}</td><td class="\${cls}">\${esc(r.status)}</td><td>\${esc(r.detail)}</td>\`
    tb.appendChild(tr)
  }
}
runChecks()
</script>
</body>
</html>`

fs.writeFileSync(outPath, html)
console.log(`Crawler-Seite erzeugt: ${outPath.pathname}`)
