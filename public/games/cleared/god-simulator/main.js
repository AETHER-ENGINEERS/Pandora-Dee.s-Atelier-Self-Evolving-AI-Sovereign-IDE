/*
Mini God Sandbox
No external libs used. Single-screen mobile-friendly canvas experience.
*/

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d', {alpha:true});
let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function resize(){
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.floor(r.width * DPR);
  canvas.height = Math.floor(r.height * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);
resize();

/* UI elements */
const createBtn = document.getElementById('createBtn');
const modal = document.getElementById('modal');
const emojiInput = document.getElementById('emoji');
const babyEmojiInput = document.getElementById('babyEmoji');
const nameInput = document.getElementById('nameInput');
const typeSelect = document.getElementById('typeSelect');
const animalOptions = document.getElementById('animalOptions');
const foodOptions = document.getElementById('foodOptions');
const dietSelect = document.getElementById('dietSelect');
const makesMeat = document.getElementById('makesMeat');
const meatChoiceWrap = document.getElementById('meatChoice');
const meatProduced = document.getElementById('meatProduced');
const foodType = document.getElementById('foodType');
const saveCreate = document.getElementById('saveCreate');
const cancelCreate = document.getElementById('cancelCreate');
const spawnPicker = document.getElementById('spawnPicker');
const spawnBtn = document.getElementById('spawnBtn');
const manageBtn = document.getElementById('manageBtn');
const manageModal = document.getElementById('manageModal');
const manageList = document.getElementById('manageList');
const closeManage = document.getElementById('closeManage');

// Settings UI
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const minCooldownInput = document.getElementById('minCooldown');
const maxCooldownInput = document.getElementById('maxCooldown');
const protectLastTwoCheckbox = document.getElementById('protectLastTwo');
const saveSettingsBtn = document.getElementById('saveSettings');
const cancelSettingsBtn = document.getElementById('cancelSettings');

 // runtime settings (ms)
 let minCooldownMs = 5000;
 let maxCooldownMs = 30000;
 let protectLastTwo = false;
 // new timing settings (ms)
 let babyGrowthMs = 60000; // time for baby -> adult by default
 let minLifeMs = 180000;   // minimum lifetime
 let maxLifeMs = 300000;   // maximum lifetime

// load/save settings
function loadSettings(){
  try{
    const s = JSON.parse(localStorage.getItem('mini_god_settings_v1') || '{}');
    if(typeof s.minCooldownSec === 'number') minCooldownMs = Math.max(0, s.minCooldownSec*1000);
    if(typeof s.maxCooldownSec === 'number') maxCooldownMs = Math.max(0, s.maxCooldownSec*1000);
    if(typeof s.protectLastTwo === 'boolean') protectLastTwo = s.protectLastTwo;
    // new settings
    if(typeof s.babyGrowthSec === 'number') babyGrowthMs = Math.max(0, s.babyGrowthSec*1000);
    if(typeof s.minLifeSec === 'number') minLifeMs = Math.max(0, s.minLifeSec*1000);
    if(typeof s.maxLifeSec === 'number') maxLifeMs = Math.max(0, s.maxLifeSec*1000);
  }catch(e){}
  // update UI inputs if present
  if(minCooldownInput) minCooldownInput.value = Math.round(minCooldownMs/1000);
  if(maxCooldownInput) maxCooldownInput.value = Math.round(maxCooldownMs/1000);
  if(protectLastTwoCheckbox) protectLastTwoCheckbox.checked = !!protectLastTwo;
  if(document.getElementById('babyGrowth')) document.getElementById('babyGrowth').value = Math.round(babyGrowthMs/1000);
  if(document.getElementById('minLife')) document.getElementById('minLife').value = Math.round(minLifeMs/1000);
  if(document.getElementById('maxLife')) document.getElementById('maxLife').value = Math.round(maxLifeMs/1000);
}
function saveSettings(){
  try{
    const obj = {
      minCooldownSec: Math.max(0, Number(minCooldownInput.value) || 0),
      maxCooldownSec: Math.max(0, Number(maxCooldownInput.value) || 0),
      babyGrowthSec: Math.max(0, Number(document.getElementById('babyGrowth')?.value) || 0),
      minLifeSec: Math.max(0, Number(document.getElementById('minLife')?.value) || 0),
      maxLifeSec: Math.max(0, Number(document.getElementById('maxLife')?.value) || 0),
      protectLastTwo: !!protectLastTwoCheckbox.checked
    };
    localStorage.setItem('mini_god_settings_v1', JSON.stringify(obj));
    // apply
    minCooldownMs = obj.minCooldownSec*1000;
    maxCooldownMs = obj.maxCooldownSec*1000;
    babyGrowthMs = obj.babyGrowthSec*1000 || babyGrowthMs;
    minLifeMs = obj.minLifeSec*1000 || minLifeMs;
    maxLifeMs = obj.maxLifeSec*1000 || maxLifeMs;
    protectLastTwo = obj.protectLastTwo;
  }catch(e){}
}

// open/close settings
settingsBtn.addEventListener('click', ()=>{
  loadSettings();
  settingsModal.classList.remove('hidden');
});
cancelSettingsBtn.addEventListener('click', ()=>{ settingsModal.classList.add('hidden'); });
saveSettingsBtn.addEventListener('click', ()=>{
  saveSettings();
  settingsModal.classList.add('hidden');
});

// initialize settings from storage
loadSettings();

/* persistence for prototypes */
function loadPrototypes(){
  try{
    const raw = localStorage.getItem('mini_god_prototypes_v1');
    const meta = localStorage.getItem('mini_god_meta_v1');
    if(raw){
      const parsed = JSON.parse(raw);
      if(meta){
        const m = JSON.parse(meta);
        idCounter = typeof m.idCounter === 'number' ? m.idCounter : idCounter;
      }
      return parsed;
    }
  }catch(e){}
  return [];
}
function savePrototypes(){
  try{
    localStorage.setItem('mini_god_prototypes_v1', JSON.stringify(prototypes));
    localStorage.setItem('mini_god_meta_v1', JSON.stringify({ idCounter }));
  }catch(e){}
}

let idCounter = 1;
let prototypes = loadPrototypes(); // saved creations (persisted)
let animals = []; // active animals
let foods = []; // active foods

/* Helpers */
const rand = (a,b)=>(a + Math.random()*(b-a));
const rndInt = (a,b)=>Math.floor(rand(a,b+1));
const now = ()=>Date.now();

function refreshSpawnPicker(){
  spawnPicker.innerHTML = '<option value="">Select a created item...</option>';
  prototypes.forEach((p,i)=>{
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.emoji} ${p.name} (${p.type})`;
    spawnPicker.appendChild(opt);
  });
  spawnBtn.disabled = prototypes.length===0;
  // update meatProduced options too
  meatProduced.innerHTML = '<option value="">(none available)</option>';
  prototypes.filter(p=>p.type==='food' && p.foodType==='meat')
    .forEach(p=>{
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.emoji} ${p.name}`;
      meatProduced.appendChild(o);
    });
}

createBtn.addEventListener('click', ()=>openCreate());
function openCreate(editProto=null){
  modal.classList.remove('hidden');
  // reset
  emojiInput.value = editProto?.emoji || '';
  babyEmojiInput.value = editProto?.babyEmoji || '';
  nameInput.value = editProto?.name || '';
  typeSelect.value = editProto?.type || 'animal';
  dietSelect.value = editProto?.diet || 'meat';
  makesMeat.checked = !!editProto?.makesMeat;
  meatProduced.value = editProto?.meatProduced || '';
  foodType.value = editProto?.foodType || 'meat';
  updateOptions();
  saveCreate.onclick = ()=>saveCreation(editProto);
}
cancelCreate.addEventListener('click', ()=>{ modal.classList.add('hidden'); });

typeSelect.addEventListener('change', updateOptions);
makesMeat.addEventListener('change', ()=>{ meatChoiceWrap.classList.toggle('hidden', !makesMeat.checked); });
function updateOptions(){
  const t = typeSelect.value;
  animalOptions.classList.toggle('hidden', t!=='animal');
  foodOptions.classList.toggle('hidden', t!=='food');
  meatChoiceWrap.classList.toggle('hidden', !makesMeat.checked);
}

function saveCreation(editProto){
  const emoji = emojiInput.value.trim() || '❓';
  const name = nameInput.value.trim() || 'Unnamed';
  const type = typeSelect.value;
  if(editProto){
    editProto.emoji=emoji; editProto.babyEmoji = babyEmojiInput.value.trim() || null; editProto.name=name; editProto.type=type;
    if(type==='animal'){ editProto.diet=dietSelect.value; editProto.makesMeat=makesMeat.checked; editProto.meatProduced=meatProduced.value||null; }
    if(type==='food'){ editProto.foodType=foodType.value; }
  }else{
    const p = { id: 'p'+(idCounter++), emoji, babyEmoji: babyEmojiInput.value.trim() || null, name, type };
    if(type==='animal'){ p.diet=dietSelect.value; p.makesMeat=makesMeat.checked; p.meatProduced=meatProduced.value||null; }
    if(type==='food'){ p.foodType=foodType.value; }
    prototypes.push(p);
  }
  savePrototypes();
  refreshSpawnPicker();
  modal.classList.add('hidden');
}

/* Manage modal */
manageBtn.addEventListener('click', ()=>{ renderManage(); manageModal.classList.remove('hidden'); });
closeManage.addEventListener('click', ()=>manageModal.classList.add('hidden'));
function renderManage(){
  manageList.innerHTML = '';
  prototypes.forEach(p=>{
    const div = document.createElement('div');
    div.className = 'manage-item';
    div.innerHTML = `<div style="flex:1">${p.emoji} <strong>${p.name}</strong> <span style="color:#777;font-size:13px">(${p.type})</span></div>`;
    const edit = document.createElement('button'); edit.className='smallBtn'; edit.textContent='Edit';
    const del = document.createElement('button'); del.className='smallBtn'; del.textContent='Delete';
    edit.onclick = ()=>{ manageModal.classList.add('hidden'); openCreate(p); };
    del.onclick = ()=>{ prototypes = prototypes.filter(x=>x!==p); savePrototypes(); refreshSpawnPicker(); renderManage(); };
    div.appendChild(edit); div.appendChild(del);
    manageList.appendChild(div);
  });
  if(prototypes.length===0){ manageList.textContent='(no creations yet)'; }
}

/* Spawn logic */
spawnPicker.addEventListener('change', ()=>{
  spawnBtn.disabled = !spawnPicker.value;
});
spawnBtn.addEventListener('click', ()=>{
  const id = spawnPicker.value;
  const proto = prototypes.find(p=>p.id===id);
  if(!proto) return;
  spawnFromProto(proto);
});

/* Entities */
function spawnFromProto(proto, position=null){
  const x = position?.x ?? rand(20, (canvas.clientWidth - 20));
  const y = position?.y ?? rand(20, (canvas.clientHeight - 20));
  if(proto.type==='food'){
    foods.push({
      id: 'f'+(idCounter++), protoId: proto.id, emoji: proto.emoji, name: proto.name,
      foodType: proto.foodType, x,y, size:18, createdAt:now()
    });
  }else{
    animals.push({
      id: 'a'+(idCounter++), protoId: proto.id, emoji: proto.emoji, babyEmoji: proto.babyEmoji || null, name: proto.name,
      species: proto.name, diet: proto.diet, makesMeat: !!proto.makesMeat, meatProduced: proto.meatProduced||null,
      x,y, vx:rand(-0.5,0.5), vy:rand(-0.5,0.5), speed: rand(0.4,1.2),
      adult:true, baby:false, bornAt: now(), breedingCooldown:0, ageLimit: now() + rndInt(minLifeMs, maxLifeMs),
      state:'wandering', target:null, lastAction: now(),
      // prevent immediate actions for 5-30s after spawning
      actionCooldown: now() + rndInt(minCooldownMs, maxCooldownMs)
    });
  }
}

/* Simulation */
let lastTick = now();
function tick(){
  const t = now();
  const dt = (t - lastTick)/1000;
  lastTick = t;
  updateAnimals(dt);
  updateFoods(dt);
  render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* Behavior helpers */
function distance(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function findNearestFoodForAnimal(an){
  // returns food object that matches diet (prioritize closest)
  const types = dietToFoodTypes(an.diet);
  let best = null, bestD = 1e9;
  for(const f of foods){
    if(types.includes(f.foodType)){
      const d = distance(an,f);
      if(d < bestD){ best = f; bestD=d; }
    }
  }
  return best;
}
function dietToFoodTypes(d){
  switch(d){
    case 'meat': return ['meat'];
    case 'veggie': return ['veggie'];
    case 'fruit': return ['fruit'];
    case 'meat_veg': return ['meat','veggie'];
    case 'meat_fruit': return ['meat','fruit'];
    case 'fruit_veg': return ['fruit','veggie'];
    case 'all': return ['meat','veggie','fruit'];
    default: return [];
  }
}
function countAdultsOfSpecies(species){
  let c = 0;
  for(const a of animals){
    if(a.species === species && a.adult) c++;
  }
  return c;
}

function findNearestPrey(an){
  if(!an || !an.diet) return null;
  // only predators that have meat in diet
  const wantsMeat = ['meat','meat_veg','meat_fruit','all'].includes(an.diet);
  if(!wantsMeat) return null;
  let best=null,bestD=1e9;
  for(const other of animals){
    if(other === an) continue;
    if(other.species===an.species) continue; // not same species
    if(!other.makesMeat) continue;
    if(other.baby) continue; // babies can't be turned into meat
    // if protect toggle is on, skip hunting any species that currently has <=2 adults
    if(protectLastTwo && countAdultsOfSpecies(other.species) <= 2) continue;
    const d = distance(an, other);
    if(d < bestD){ best=other; bestD=d; }
  }
  return best;
}

/* Update animals */
function updateAnimals(dt){
  const width = canvas.clientWidth, height = canvas.clientHeight;

  // If we're controlling an animal and it has no manual playerTarget, stop its motion immediately
  if(controlling && controlledAnimal && !controlledAnimal.playerTarget){
    controlledAnimal.vx = 0;
    controlledAnimal.vy = 0;
    controlledAnimal.state = 'player';
  }

  for(const an of animals.slice()){
    // when an animal is being player-controlled, skip autonomous AI updates so it stays still unless given commands
    if(controlling && controlledAnimal && an === controlledAnimal) continue;

    // aging and death
    if(now() >= an.ageLimit){
      spawnGhostAndRemove(an);
      continue;
    }
    // baby growth -> when baby matures, switch to adult state and set emoji to the prototype's default emoji
    if(an.baby && (now() - an.bornAt >= babyGrowthMs)){
      an.baby = false;
      an.adult = true;
      // update visible emoji to the species' default (prototype) emoji when grown
      try{
        const proto = prototypes.find(p => p.id === an.protoId);
        if(proto && proto.emoji) an.emoji = proto.emoji;
      }catch(e){}
    }
    // breeding availability update
    if(an.breedingCooldown > 0) an.breedingCooldown = Math.max(0, an.breedingCooldown - dt);

    // handle special states: eating, breeding pauses are represented by state and lastAction timestamps
    if(an.state === 'eating'){
      // eating handled elsewhere by scheduled shrink
      continue;
    }
    if(an.state === 'breeding'){
      // breeding wait handled in schedule
      continue;
    }
    // decide goals occasionally
    if(!an.target || (now() - an.lastAction > 3000)){
      an.target = null;

      // if this animal is under an action cooldown (spawned or recently did something),
      // do not acquire purposeful targets (it can still wander)
      if(an.actionCooldown && now() < an.actionCooldown){
        an.lastAction = now();
      }else{
        // 70% chance look for food
        const foodTarget = Math.random() < 0.7 ? findNearestFoodForAnimal(an) : null;
        if(foodTarget) an.target = { type:'food', id: foodTarget.id };
        else{
          // 25% chance look for same species to breed
          if(an.adult && Math.random() < 0.25){
            let best=null,bd=1e9;
            for(const other of animals){
              if(other === an) continue;
              if(other.species !== an.species) continue;
              if(!other.adult) continue;
              if(other.breedingCooldown>0 || an.breedingCooldown>0) continue;
              const d = distance(an, other);
              if(d < bd){ best=other; bd=d; }
            }
            if(best) an.target = { type:'mate', id: best.id };
          }
        }
        // predators: if wants meat might go after meat-making prey (only if not on cooldown)
        if(!an.target && Math.random() < 0.35){
          const prey = findNearestPrey(an);
          if(prey) an.target = { type:'prey', id: prey.id };
        }
        an.lastAction = now();
      }
    }

    // movement toward current target or random wandering
    let tx = an.x + an.vx*20, ty = an.y + an.vy*20;
    if(an.target){
      if(an.target.type === 'food'){
        const f = foods.find(x=>x.id===an.target.id);
        if(!f){ an.target = null; continue; }
        tx = f.x; ty = f.y;
        // if close enough, start eating
        if(distance(an,f) < 22){
          startEating(an,f);
          continue;
        }
      }else if(an.target.type === 'prey'){
        const prey = animals.find(x=>x.id===an.target.id);
        // skip if invalid or prey can't be converted right now (baby, doesn't produce meat, or is busy)
        if(!prey || prey.baby || !prey.makesMeat || prey.state === 'eating' || prey.state === 'breeding'){ an.target = null; continue; }
        tx = prey.x; ty = prey.y;
        if(distance(an,prey) < 18){
          // convert prey into meat (food) only if predator actively targeted this prey
          // and the prey wasn't itself actively targeting the predator (so they didn't just accidentally bump)
          // also require prey to be in an idle/wandering state (not eating/breeding)
          if(prey.species !== an.species && prey.makesMeat && an.target && an.target.id === prey.id && !(prey.target && prey.target.id === an.id) && prey.state === 'wandering'){
            convertToMeat(prey);
            // predator gets a cooldown after a successful hunt
            an.actionCooldown = now() + rndInt(minCooldownMs, maxCooldownMs);
            an.target = null;
            continue;
          }else{
            an.target = null;
          }
        }
      }else if(an.target.type === 'mate'){
        const mate = animals.find(x=>x.id===an.target.id);
        if(!mate || !mate.adult || mate.breedingCooldown>0 || an.breedingCooldown>0){ an.target=null; continue; }
        tx = mate.x; ty = mate.y;
        if(distance(an,mate) < 18){
          // require mutual targeting (both animals actively chose each other) before breeding
          if(an.target && mate.target && an.target.type === 'mate' && mate.target.type === 'mate' && an.target.id === mate.id && mate.target.id === an.id){
            startBreedingPair(an,mate);
            continue;
          }else{
            // cancel the target if it wasn't a true mutual courtship
            an.target = null;
            continue;
          }
        }
      }
    } else {
      // gentle wandering: small random acceleration
      if(Math.random() < 0.02){
        an.vx += rand(-0.6,0.6);
        an.vy += rand(-0.6,0.6);
        const sp = Math.hypot(an.vx, an.vy);
        if(sp > an.speed) { an.vx = (an.vx/sp)*an.speed; an.vy = (an.vy/sp)*an.speed; }
      }
      tx = an.x + an.vx*30; ty = an.y + an.vy*30;
    }

    // apply simple steering towards tx,ty
    const angle = Math.atan2(ty - an.y, tx - an.x);
    const accel =  (0.6);
    an.vx += Math.cos(angle)*accel*dt*8;
    an.vy += Math.sin(angle)*accel*dt*8;
    // damping & clamp speed
    an.vx *= 0.95; an.vy *= 0.95;
    const sp = Math.hypot(an.vx, an.vy);
    if(sp > an.speed) { an.vx = (an.vx/sp)*an.speed; an.vy = (an.vy/sp)*an.speed; }

    an.x += an.vx * dt * 60;
    an.y += an.vy * dt * 60;
    // bounds
    an.x = Math.max(8, Math.min(canvas.clientWidth-8, an.x));
    an.y = Math.max(8, Math.min(canvas.clientHeight-8, an.y));
  }
}

/* Eating sequence */
function startEating(an, f){
  // prevent multiple eaters on same food
  if(f.beingEaten) return;
  f.beingEaten = true;
  an.state = 'eating';
  // give eater a cooldown after eating
  an.actionCooldown = now() + rndInt(minCooldownMs, maxCooldownMs);
  // animate shrink 5 times every 0.5s, then remove food
  let steps = 5;
  const origSize = f.size;
  const iv = setInterval(()=>{
    steps--;
    f.size = Math.max(2, f.size * 0.8);
    if(steps<=0){
      clearInterval(iv);
      // remove food
      const idx = foods.findIndex(x=>x.id===f.id);
      if(idx>=0) foods.splice(idx,1);
      an.state = 'wandering';
      f.beingEaten = false;
    }
  }, 500);
}

/* Convert animal into meat (becomes a food item) */
function convertToMeat(prey){
  // create food based on prey.meatProduced if available, otherwise create generic meat with emoji 🍖
  let meatProto = null;
  if(prey.meatProduced){
    meatProto = prototypes.find(p=>p.id===prey.meatProduced);
  }
  const emoji = meatProto ? meatProto.emoji : '🍖';
  const name = meatProto ? meatProto.name : (prey.name + ' meat');
  const f = {
    id: 'f'+(idCounter++), protoId: null, emoji, name, foodType:'meat',
    x: prey.x + rand(-6,6), y: prey.y + rand(-6,6), size:20, createdAt: now()
  };
  // remove prey animal
  const idx = animals.findIndex(a=>a.id===prey.id);
  if(idx>=0) animals.splice(idx,1);
  foods.push(f);
}

/* Breeding */
function startBreedingPair(a,b){
  // mark both busy
  a.state = 'breeding'; b.state='breeding';
  a.breedingCooldown = 6; b.breedingCooldown = 6;
  // apply post-breeding cooldowns
  a.actionCooldown = now() + rndInt(minCooldownMs, maxCooldownMs);
  b.actionCooldown = now() + rndInt(minCooldownMs, maxCooldownMs);
  // visual heart and spawn baby after 3s
  setTimeout(()=>{
    a.state='wandering'; b.state='wandering';
    const babyX = (a.x + b.x)/2 + rand(-6,6);
    const babyY = (a.y + b.y)/2 + rand(-6,6);
    const baby = {
      id: 'a'+(idCounter++), protoId: a.protoId, emoji: (a.babyEmoji || a.emoji), babyEmoji: a.babyEmoji || null, name: a.name,
      species: a.species, diet: a.diet, makesMeat: a.makesMeat, meatProduced: a.meatProduced,
      x:babyX,y:babyY,vx:0,vy:0,speed:0.8,
      adult:false, baby:true, bornAt: now(), breedingCooldown:0,
      ageLimit: now() + rndInt(minLifeMs, maxLifeMs), state:'wandering', target:null, lastAction: now()
    };
    animals.push(baby);
  }, 3000);
}

/* Aging death ghost */
function spawnGhostAndRemove(an){
  // floating ghost for animation
  const ghost = { x: an.x, y: an.y, emoji: '👻', alpha:1, start: now() };
  const anim = setInterval(()=>{
    ghost.y -= 6;
    ghost.alpha -= 0.06;
    if(ghost.alpha <= 0){
      clearInterval(anim);
    }
  }, 60);
  // remove animal now
  animals = animals.filter(x=>x.id !== an.id);
  // we won't render this ghost via array, but quick static draw overlay will be shown once using a temporary overlay list
  transientGhosts.push(ghost);
  setTimeout(()=>{ // fade already handled
    const idx = transientGhosts.indexOf(ghost);
    if(idx>=0) transientGhosts.splice(idx,1);
  }, 3000);
}

let transientGhosts = [];

/* Foods update (no complex behavior) */
function updateFoods(dt){
  // Foods are static
}

/* Rendering */
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  // draw foods
  for(const f of foods){
    ctx.font = `${f.size}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline='middle';
    ctx.fillText(f.emoji, f.x, f.y);
  }
  // draw animals
  for(const a of animals){
    ctx.font = `${a.baby?14:20}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(a.emoji, a.x, a.y - (a.baby?0:0));
    // little species text
    ctx.fillStyle = '#333';
    ctx.font = '11px system-ui';
    ctx.fillText(a.name, a.x, a.y + 16);
    ctx.fillStyle = '#000';
    // if breeding show heart overlay (draw in red)
    if(a.state==='breeding'){
      ctx.save();
      const prev = ctx.fillStyle;
      ctx.fillStyle = 'red';
      ctx.font = '18px serif';
      ctx.fillText('❤', a.x, a.y - 18);
      ctx.fillStyle = prev;
      ctx.restore();
    }
  }
  // ghosts
  for(const g of transientGhosts){
    ctx.save();
    ctx.globalAlpha = Math.max(0, g.alpha);
    ctx.font = '22px serif';
    ctx.fillText(g.emoji, g.x, g.y);
    ctx.restore();
  }
  ctx.restore();
}

/* initial UI setup */
refreshSpawnPicker();

/* Play-as-animal controls */
const playBtn = document.getElementById('playBtn');
let controlling = false;
let controlledAnimal = null;

// helper to disable top UI while controlling
function setUIControlDisabled(disabled){
  [createBtn, manageBtn, settingsBtn, spawnPicker, spawnBtn].forEach(el=>{
    if(!el) return;
    el.disabled = disabled;
    el.classList.toggle('muted', disabled);
  });
}

// toggle control mode
playBtn.addEventListener('click', ()=>{
  if(!controlling){
    // enter control mode
    controlling = true;
    playBtn.classList.add('primary');
    playBtn.textContent = 'Stop playing';
    setUIControlDisabled(true);
    // instruct user by briefly highlighting canvas (no explicit text per mobile rules)
  }else{
    // exit control mode and release any controlled animal
    controlling = false;
    playBtn.classList.remove('primary');
    playBtn.textContent = 'Play as animal';
    setUIControlDisabled(false);
    if(controlledAnimal){
      // restore flags
      controlledAnimal.invulnerable = false;
      controlledAnimal.state = 'wandering';
      controlledAnimal.playerTarget = null;
      controlledAnimal = null;
    }
  }
});

// utility: find an animal or food under a point
function pickEntityAt(x,y){
  // animals prioritized
  for(const a of animals){
    const r = (a.baby?10:14);
    if(Math.hypot(a.x-x,a.y-y) <= r) return {type:'animal', obj:a};
  }
  for(const f of foods){
    if(Math.hypot(f.x-x,f.y-y) <= f.size) return {type:'food', obj:f};
  }
  return null;
}

/* Expose click behaviors on canvas: spawn when not controlling, select/control when controlling */
canvas.addEventListener('pointerdown', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);

  if(controlling){
    // if we haven't selected an animal to control yet: pick an animal at tap
    if(!controlledAnimal){
      const picked = pickEntityAt(x,y);
      if(picked && picked.type==='animal'){
        controlledAnimal = picked.obj;
        // make it invulnerable and stop autonomous actions
        controlledAnimal.invulnerable = true;
        controlledAnimal.state = 'player';
        controlledAnimal.playerTarget = null;
      }
      return;
    }

    // we have a controlled animal: interpret the tap as a manual command
    const picked = pickEntityAt(x,y);
    if(picked){
      if(picked.type === 'food'){
        // command to go eat that food when reached
        controlledAnimal.playerTarget = { type:'food', id: picked.obj.id, x: picked.obj.x, y: picked.obj.y };
      }else if(picked.type === 'animal'){
        const target = picked.obj;
        // breeding if same species and both adults
        if(target.species === controlledAnimal.species && target.adult && controlledAnimal.adult){
          controlledAnimal.playerTarget = { type:'mate', id: target.id, x: target.x, y: target.y };
        }else{
          // try hunting if diet allows meat and target makes meat and not same species
          const wantsMeat = ['meat','meat_veg','meat_fruit','all'].includes(controlledAnimal.diet);
          if(wantsMeat && target.makesMeat && target.species !== controlledAnimal.species){
            controlledAnimal.playerTarget = { type:'prey', id: target.id, x: target.x, y: target.y };
          }else{
            // otherwise just move to clicked spot
            controlledAnimal.playerTarget = { type:'move', x, y };
          }
        }
      }
    } else {
      // empty ground: move there
      controlledAnimal.playerTarget = { type:'move', x, y };
    }
    return;
  }

  // not controlling -> original spawn behavior
  const pickedProto = spawnPicker.value;
  if(!pickedProto) return;
  const proto = prototypes.find(p=>p.id===pickedProto);
  if(proto) spawnFromProto(proto, {x,y});
});

/* Modify update loop so controlled animal follows playerTarget and is immune */
const _orig_updateAnimals = updateAnimals;
updateAnimals = function(dt){
  // if controlled, handle its manual movement first and mark it invulnerable
  if(controlling && controlledAnimal){
    const an = controlledAnimal;
    // keep invulnerable and prevent autonomous target selection by giving actionCooldown
    an.invulnerable = true;
    an.actionCooldown = now() + 1000; // short block so AI doesn't override immediately

    // handle manual target following
    if(an.playerTarget){
      const t = an.playerTarget;
      if(t.type === 'move' || t.type === 'food' || t.type === 'prey' || t.type === 'mate'){
        const tx = t.x, ty = t.y;
        const angle = Math.atan2(ty - an.y, tx - an.x);
        const spd = an.speed || 1;
        an.vx = Math.cos(angle) * spd;
        an.vy = Math.sin(angle) * spd;
        an.x += an.vx * dt * 60;
        an.y += an.vy * dt * 60;
        // bounds
        an.x = Math.max(8, Math.min(canvas.clientWidth-8, an.x));
        an.y = Math.max(8, Math.min(canvas.clientHeight-8, an.y));

        // check arrival
        const dist = Math.hypot(an.x - tx, an.y - ty);
        if(dist < 18){
          // reached destination: handle actions
          if(t.type === 'food'){
            const f = foods.find(x=>x.id===t.id);
            if(f) startEating(an, f);
          }else if(t.type === 'prey'){
            const prey = animals.find(x=>x.id===t.id);
            if(prey && prey.makesMeat && prey.species !== an.species && !prey.baby){
              // ensure prey cannot convert controlled animal: prey can still be converted
              convertToMeat(prey);
              // controlled animal gets cooldown after successful hunt
              an.actionCooldown = now() + rndInt(minCooldownMs, maxCooldownMs);
            }
          }else if(t.type === 'mate'){
            const mate = animals.find(x=>x.id===t.id);
            if(mate && mate.adult && an.adult){
              // force pairing even if mate didn't target back
              startBreedingPair(an, mate);
            }
          }
          // clear manual target after action or arrival
          an.playerTarget = null;
          an.vx = 0; an.vy = 0;
        }
      }
    }
  }

  // run original animal updates but skip autonomous movement for the controlled animal
  // we call original but ensure it doesn't override controlledAnimal position/state
  _orig_updateAnimals(dt);

  // prevent controlled animal from dying or being converted into meat
  if(controlledAnimal){
    controlledAnimal.ageLimit = now() + 1000*60*60; // push far into future while controlling
    controlledAnimal.invulnerable = true;
  }
};

/* Ensure convertToMeat respects invulnerability */
const _orig_convertToMeat = convertToMeat;
convertToMeat = function(prey){
  if(prey.invulnerable) return; // cannot be converted while player controls it
  _orig_convertToMeat(prey);
};

/* Ensure spawn removal on exit of control is clean (if user stops while controlling) */
playBtn.addEventListener('blur', ()=>{
  if(!controlling && controlledAnimal){
    controlledAnimal.invulnerable = false;
    controlledAnimal.playerTarget = null;
    controlledAnimal = null;
  }
});

/* Prevent default gestures on mobile */
document.body.addEventListener('touchmove',(e)=>{}, {passive:false});