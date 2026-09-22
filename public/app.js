const $ = id => document.getElementById(id);
let ws, state, selfId, fakeTimers = [];
const nameInput = $('name'), error = $('error');

function connect() { if (ws?.readyState === WebSocket.OPEN) return; ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`); ws.onmessage = e => receive(JSON.parse(e.data)); ws.onclose = () => error.textContent = 'Connection lost. Refresh to reconnect.'; }
function send(message) { connect(); const wait = () => ws.readyState === WebSocket.OPEN ? ws.send(JSON.stringify(message)) : setTimeout(wait, 50); wait(); }
function enter(action) { const name = nameInput.value.trim(); if (!name) return error.textContent = 'Please enter a name first.'; error.textContent = ''; action(name); }
$('create').onclick = () => enter(name => send({ type:'create', name }));
$('join').onclick = () => enter(name => send({ type:'join', name, code: $('code').value.trim().toUpperCase() }));
$('start').onclick = () => send({ type:'start' });
$('reaction').onclick = () => send({ type:'react' });

function receive(message) {
  if (message.type === 'error') { error.textContent = message.message; return; }
  if (message.type === 'tooEarly') { $('status').textContent = 'Too early! You are out for this round.'; $('reaction').disabled = true; return; }
  if (message.type === 'state') { state = message; if (message.selfId) selfId = message.selfId; render(); }
}
function clearFakes(){ fakeTimers.forEach(clearTimeout); fakeTimers=[]; }
function renderPlayers(){ $('players').innerHTML = state.players.map(p => `<li class="${p.id===selfId?'me':''} ${p.locked?'locked':''}">${escapeHtml(p.name)} <span>${p.score} pts${p.locked&&state.phase!=='winner'?' · done':''}</span></li>`).join(''); }
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function scheduleFakes(){ clearFakes(); const signal=$('signal'); for(const at of state.fakeouts||[]){ const delay=at-Date.now(); if(delay>0) fakeTimers.push(setTimeout(()=>{if(state?.phase==='countdown'){signal.textContent='NOT YET!';signal.className='fake';setTimeout(()=>{if(state?.phase==='countdown'){signal.textContent='WAIT';signal.className='';}},420)}},delay)); } }
function render(){
  $('home').hidden=true; $('game').hidden=false; $('room-label').textContent=`ROOM ${state.roomCode}`; renderPlayers();
  const mine=state.players.find(p=>p.id===selfId); const host=selfId===state.hostId; const reaction=$('reaction'); const signal=$('signal');
  $('start').hidden=!(state.phase==='lobby'&&host); $('start').disabled=state.players.length<2;
  if(state.phase==='lobby'){clearFakes();$('title').textContent='Waiting room';$('round-label').textContent=`${state.players.length}/8 players`; $('instruction').textContent=host?'Share the room code, then start when everyone is here.':'Wait for the host to start the 10-round match.'; signal.textContent='READY?'; signal.className=''; reaction.disabled=true; $('status').textContent=host&&state.players.length<2?'At least 2 players are needed.':''; $('results').hidden=true; return;}
  $('start').hidden=true; $('round-label').textContent=state.suddenDeath?'SUDDEN DEATH':`ROUND ${state.round} / 10`;
  if(state.phase==='countdown'){ $('title').textContent=state.suddenDeath?'Sudden death!':'Don’t Tap Yet'; $('instruction').textContent=state.suddenDeath?'Tied leaders only. Wait for the real cue.':'Fake-outs are coming. Wait for the REAL cue!'; signal.textContent='WAIT'; signal.className=''; reaction.disabled=mine?.locked || (state.suddenDeath && !state.players.filter(p=>p.score===Math.max(...state.players.map(x=>x.score))).some(p=>p.id===selfId)); $('status').textContent=mine?.locked?'Too early! You are out for this round.':'Hands off…'; $('results').hidden=true; scheduleFakes(); return; }
  clearFakes();
  if(state.phase==='active'){ $('title').textContent=state.suddenDeath?'Sudden death!':'GO!'; $('instruction').textContent='NOW! Tap as fast as you can.'; signal.textContent='TAP!';signal.className='go';reaction.disabled=mine?.locked; $('status').textContent=mine?.locked?'Reaction recorded!':'GO GO GO!'; $('results').hidden=true; return; }
  if(state.phase==='results'){ $('title').textContent='Round results'; $('instruction').textContent='Next round starts automatically…'; signal.textContent='SCORES'; signal.className=''; reaction.disabled=true; $('status').textContent=''; $('results').hidden=false; const results=state.lastResults||[]; $('results').innerHTML=`<h2>${results.length?'Fastest reactions':'Nobody reacted in time'}</h2>${results.length?'<ol>'+results.map((r,i)=>`<li>${i+1}. ${escapeHtml(r.name)} — +${r.points} (${r.reactionMs} ms)</li>`).join('')+'</ol>':''}`; return; }
  if(state.phase==='winner'){ const winners=state.players.filter(p=>(state.winnerIds||[]).includes(p.id)); $('title').textContent=`${winners.map(p=>p.name).join(', ')} wins!`; $('instruction').textContent=state.suddenDeath?'Fastest valid sudden-death reaction!':'Match complete. Great reactions!'; signal.textContent='🎉'; signal.className='go'; reaction.disabled=true; $('status').textContent=''; $('results').hidden=false; $('results').innerHTML=`<h2>${state.suddenDeath?'Sudden-death winner':'Final scores'}</h2><ol>`+[...state.players].sort((a,b)=>b.score-a.score).map(p=>`<li>${escapeHtml(p.name)} — ${p.score} pts</li>`).join('')+'</ol>'; }
}

