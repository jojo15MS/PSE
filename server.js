// Quiz PSE – serveur local, aucune dépendance. Lancer : node server.js
const http=require('http'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||3000, T=+process.env.T||20, PAUSE=+process.env.PAUSE||6; // T = durée d'une question, PAUSE = affichage de la correction
const PIN=process.env.PIN||''; // si défini : le formateur se connecte avec ce code (téléphone, hébergement en ligne)
const CODE=process.env.CODE||String(Math.floor(1000+Math.random()*9000));
let players={},sess=null,seq=0,queue=[],pos=-1,timer=null;const clients=new Set();
const isLocal=r=>/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(r.socket.remoteAddress);
const isTrainer=(r,u)=>PIN?(r.headers['x-pin']===PIN||u.searchParams.get('pin')===PIN):(isLocal(r)&&!r.headers['x-forwarded-for']);
const snap=t=>JSON.stringify({now:Date.now(),T,sess,q:{pos,total:queue.length},...(t?{players:Object.entries(players).map(([id,p])=>({id,name:p.name,r:p.r}))}:{})});
const push=only=>{for(const c of clients)if(!only||c.t)c.res.write('data: '+snap(c.t)+'\n\n')};
function openQ(id){clearTimeout(timer);sess={id,seq:++seq,state:'open',t:Date.now()};for(const p of Object.values(players))delete p.r[id];push();timer=setTimeout(closeQ,T*1000+300)}
function closeQ(){clearTimeout(timer);if(!sess||sess.state!=='open')return;sess={...sess,state:'closed'};
 if(pos>=0&&pos<queue.length-1)timer=setTimeout(()=>{pos++;openQ(queue[pos])},PAUSE*1000);else{queue=[];pos=-1}
 push()}
function stop(){clearTimeout(timer);queue=[];pos=-1;if(sess&&sess.state==='open')sess={...sess,state:'closed'};push()}
const ips=()=>Object.values(os.networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal).map(i=>`http://${i.address}:${PORT}`);
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x'),loc=isTrainer(req,u);
 if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/formateur')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'quiz.html')))}
 if(u.pathname==='/api/info')return send(res,200,{isT:loc,T,urls:ips(),code:loc?CODE:undefined,hasPin:!!PIN});
 if(u.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store',Connection:'keep-alive'});
  const c={res,t:loc&&u.searchParams.get('t')==='1'};clients.add(c);res.write('data: '+snap(c.t)+'\n\n');
  const hb=setInterval(()=>res.write(': hb\n\n'),20000);req.on('close',()=>{clients.delete(c);clearInterval(hb)});return}
 if(req.method!=='POST'||!u.pathname.startsWith('/api/')){res.writeHead(404);return res.end()}
 let b='';req.on('data',d=>b+=d);req.on('end',()=>{let j={};try{j=JSON.parse(b||'{}')}catch(e){}
  const a=u.pathname.slice(5);
  if(a==='join'){const nm=String(j.name||'').trim().slice(0,30);if(!nm)return send(res,400,{err:'Nom manquant'});
   let id=j.uid,p=players[id];
   if(!p){if(!loc&&String(j.code||'').trim()!==CODE)return send(res,403,{err:'Code incorrect'});id=crypto.randomUUID();p=players[id]={name:nm,r:{}}}
   p.name=nm;push(true);return send(res,200,{uid:id,r:p.r})}
  if(a==='answer'){const p=players[j.uid];
   if(!p||!sess||sess.state!=='open'||j.q!==sess.id||p.r[j.q]!==undefined||Date.now()>sess.t+T*1000+500||!Number.isInteger(j.a)||j.a<0||j.a>3)return send(res,409,{err:'Réponse refusée'});
   p.r[j.q]=j.a;push(true);return send(res,200,{});}
  if(!loc)return send(res,403,{err:'Réservé au formateur'});
  if(a==='queue'){const ids=(j.ids||[]).filter(Number.isInteger);if(!ids.length)return send(res,400,{err:'Vide'});queue=ids;pos=0;openQ(ids[0])}
  else if(a==='send'){queue=[];pos=-1;openQ(j.id)}
  else if(a==='next'){if(pos>=0&&pos<queue.length-1){pos++;openQ(queue[pos])}}
  else if(a==='reveal')closeQ();
  else if(a==='stop')stop();
  else if(a==='reset'){clearTimeout(timer);sess=null;queue=[];pos=-1;for(const p of Object.values(players))p.r={};push()}
  send(res,200,{})})
}).listen(PORT,'0.0.0.0',()=>{console.log('\n=== Quiz PSE ===\nFormateur : http://localhost:'+PORT+(PIN?'  (code formateur : '+PIN+')':'')+'\nStagiaires : '+(ips().join('  ou  ')||'(aucun réseau détecté)')+'\nCode de la séance : '+CODE+'\n')});
