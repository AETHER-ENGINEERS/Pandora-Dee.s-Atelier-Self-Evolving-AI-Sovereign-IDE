/*
Worm Sandbox - single-file main logic
*/

const canvas = document.getElementById('sandbox');
const ctx = canvas.getContext('2d', { alpha: false });
const preview = document.getElementById('preview');
const pctx = preview.getContext('2d');

function resizeCanvas(){
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  draw();
}
window.addEventListener('resize', resizeCanvas);

// UI refs
const createBtn = document.getElementById('createBtn');
const creator = document.getElementById('creator');
const doneCreateBtn = document.getElementById('doneCreateBtn');
const cancelCreateBtn = document.getElementById('cancelCreateBtn');
const wormNameInput = document.getElementById('wormName');
const startLengthInput = document.getElementById('startLength');
const palettesDiv = document.getElementById('palettes');
const addColorBtn = document.getElementById('addColorBtn');
const clearPatternBtn = document.getElementById('clearPatternBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const makeEyeBtn = document.getElementById('makeEyeBtn');
const makeLeftEyeBtn = document.getElementById('makeLeftEyeBtn');
const makeRightEyeBtn = document.getElementById('makeRightEyeBtn');
const twoEyeToggle = document.getElementById('twoEyeToggle');
const patternListDiv = document.getElementById('patternList');
const wormTypeSelect = document.getElementById('wormTypeSelect');
const spawnBtn = document.getElementById('spawnBtn');
const spawnBabyBtn = document.getElementById('spawnBabyBtn');
const spawnTypeSelect = document.getElementById('spawnTypeSelect');
const spawnRandomBtn = document.getElementById('spawnRandomBtn');
const deleteTypeBtn = document.getElementById('deleteTypeBtn');
const spawnFoodBtn = document.getElementById('spawnFoodBtn');
const makeNestBtn = document.getElementById('makeNestBtn');
const layEggBtn = document.getElementById('layEggBtn');
const breedBtn = document.getElementById('breedBtn');
const turnIntoBtn = document.getElementById('turnIntoBtn');
// nest controls
const nestSizeInput = document.getElementById('nestSize');
const nestColorInput = document.getElementById('nestColor');
// new food controls
const foodSizeInput = document.getElementById('foodSize');
const foodColorInput = document.getElementById('foodColor');
// erase button
const eraseBtn = document.getElementById('eraseBtn');

const spawnFoodToggle = spawnFoodBtn;
const clearBtn = document.getElementById('clearBtn');
const foodMakesLonger = document.getElementById('foodMakesLonger');

 // new face & emoji UI refs
 const faceSelector = document.getElementById('faceSelector');
 const faceChangeBtn = document.getElementById('faceChangeBtn');
 const emojiInput = document.getElementById('emojiInput');
 const displayEmojiBtn = document.getElementById('displayEmojiBtn');

 // toggle: whether babies hatched from eggs inherit parent lengths (or choose mixed/both)
 const eggsInheritLength = document.getElementById('eggsInheritLength');
 // how many food / eaten segments a baby needs to become an adult (configurable)
 const babyGrowInput = document.getElementById('babyGrowThreshold');
 function getBabyGrowThreshold(){
   return Math.max(1, Math.floor(Number(babyGrowInput?.value) || 5));
 }
 const babiesGrowOverTime = document.getElementById('babiesGrowOverTime');
 const babyGrowTimeInput = document.getElementById('babyGrowTime');
 const hungerMode = document.getElementById('hungerMode');
 const hungerMinTimeInput = document.getElementById('hungerMinTime');
 const hungerMaxTimeInput = document.getElementById('hungerMaxTime');
 function getBabyGrowTimeMs(){
   return Math.max(1, Number(babyGrowTimeInput?.value) || 60) * 1000;
 }
 function getHungerDelayMs(){
   const first = Math.max(1, Number(hungerMinTimeInput?.value) || 5);
   const second = Math.max(1, Number(hungerMaxTimeInput?.value) || 100);
   const min = Math.min(first, second);
   const max = Math.max(first, second);
   return (min + Math.random() * (max - min)) * 1000;
 }

// snake/worm toggles & creator type select
const snakesEatWorms = document.getElementById('snakesEatWorms');
const snakesInheritColors = document.getElementById('snakesInheritColors');
const entityTypeSelect = document.getElementById('entityTypeSelect');

// insect-related toggles & creator input
const canEatInsects = document.getElementById('canEatInsects');
const wormsInheritFromInsects = document.getElementById('wormsInheritFromInsects');
const legsPerSideInput = document.getElementById('legsPerSide');

// color definitions
const baseNames = [
"red","red-orange","orange","orange-yellow","yellow","yellow-lime","lime","lime-green","green","green-cyan","cyan","cyan-blue","blue","blue-violet","violet","violet-purple","purple","purple-magenta","neon-magenta","magenta","magenta-pink","pink",
  // browns and pink-brown mixes come after the pinks
  "pink-brown","brown-pink","brown","brown-dark","brown-light",
"white","white-grey","grey","black-grey","black"
];
function makeShades(name, color){
  // normalize color to decide exceptions for pure white/black
  const colNorm = (color || '').toString().trim().toLowerCase();
  const isPureWhite = colNorm === '#ffffff';
  const isPureBlack = colNorm === '#000000';

  // For most colors produce five-tier shades: very-light, light, normal, dark, very-dark.
  // For pure white or pure black keep the original three-tier set to avoid redundant extremes.
  if(isPureWhite || isPureBlack){
    return [
      {id:`${name}-light`, label:'L', hex: lighten(color, 0.25)},
      {id:`${name}-normal`, label:'', hex: color},
      {id:`${name}-dark`, label:'D', hex: darken(color, 0.18)}
    ];
  }

  // values chosen to give a noticeable but subtle extra extreme on each end
  const veryLight = lighten(color, 0.40);
  const light = lighten(color, 0.25);
  const normal = color;
  const dark = darken(color, 0.18);
  const veryDark = darken(color, 0.35);

  return [
    {id:`${name}-very-light`, label:'VL', hex: veryLight},
    {id:`${name}-light`,      label:'L',  hex: light},
    {id:`${name}-normal`,     label:'',   hex: normal},
    {id:`${name}-dark`,       label:'D',  hex: dark},
    {id:`${name}-very-dark`,  label:'VD', hex: veryDark}
  ];
}

// chosen hues (approximate)
const hues = {
  red:'#e63946','red-orange':'#ee5a3b','orange':'#f97316','orange-yellow':'#f6b73b','yellow':'#ffd23f','yellow-lime':'#d6e44a','lime':'#b8e986','lime-green':'#8ee07f',
  green:'#2bb673','green-cyan':'#28c8b6','cyan':'#2ac7d4','cyan-blue':'#36a9ff','blue':'#4b6bff','blue-violet':'#6f56ff','violet':'#8b5cf6','violet-purple':'#a94fed',
  purple:'#c368ff','purple-magenta':'#da57ff','neon-magenta':'#FF00F6','magenta':'#ff3fb5','magenta-pink':'#ff63a1','pink':'#ff87b3',
  // pink-brown mix tones — soft blends between pink and brown hues
  'pink-brown':'#d9868b','brown-pink':'#c77d72',
  // browns (light/normal/dark bases for a natural palette)
  'brown-light':'#d6b89a','brown':'#a97149','brown-dark':'#7a4b2b',
  'white':'#ffffff','white-grey':'#f1f1f2','grey':'#bdbdbd','black-grey':'#4a4a4a','black':'#000000'
};

const paletteColors = [];
for(const n of baseNames){
  const shades = makeShades(n, hues[n]);
  paletteColors.push(...shades);
}

// helpers for color light/dark
function hexToRgb(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return {r,g,b}}
function rgbToHex(r,g,b){return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}
function lighten(h,amt){const c=hexToRgb(h);return rgbToHex(Math.min(255,Math.round(c.r+(255-c.r)*amt)),Math.min(255,Math.round(c.g+(255-c.g)*amt)),Math.min(255,Math.round(c.b+(255-c.b)*amt)))}
function darken(h,amt){const c=hexToRgb(h);return rgbToHex(Math.max(0,Math.round(c.r*(1-amt))),Math.max(0,Math.round(c.g*(1-amt))),Math.max(0,Math.round(c.b*(1-amt))))}

// render palette UI
let selectedPaletteIndex = 0;
paletteColors.forEach((col, i)=>{
  const el = document.createElement('div');
  el.className = 'color-swatch';
  el.style.background = col.hex;
  el.title = col.id;
  el.dataset.index = i;
  el.innerText = col.label;
  el.addEventListener('click', ()=> {
    document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
    el.classList.add('selected');
    selectedPaletteIndex = i;
  });
  palettesDiv.appendChild(el);
});
document.querySelector('.color-swatch')?.classList.add('selected');

 // pattern builder
 const pattern = [];
 // creator eye color state (defaults)
 let creatorEyeLeft = '#ffffff';
 let creatorEyeRight = '#ffffff';
 function renderPattern(){
   patternListDiv.innerHTML = '';
   pattern.forEach((p,idx)=>{
     const d = document.createElement('div');
     d.className='pattern-item';
     d.style.background = p.hex;
     d.title = `${p.id} (${idx+1})`;
     d.addEventListener('click', ()=> {
       // remove on click
       pattern.splice(idx,1);
       renderPattern();
       renderPreview();
     });
     patternListDiv.appendChild(d);
   });
   // show small indicators for current eye colors in the palette area (optional visual cue)
 }
 addColorBtn.addEventListener('click', ()=>{
   const col = paletteColors[selectedPaletteIndex];
   pattern.push(col);
   renderPattern();
   renderPreview();
 });
 clearPatternBtn.addEventListener('click', ()=>{pattern.length=0;renderPattern();renderPreview()});
 
 // eye color buttons behavior
 if(makeEyeBtn){
   makeEyeBtn.addEventListener('click', ()=>{
     const col = paletteColors[selectedPaletteIndex].hex;
     creatorEyeLeft = col;
     creatorEyeRight = col;
     renderPreview();
   });
 }
 if(makeLeftEyeBtn){
   makeLeftEyeBtn.addEventListener('click', ()=>{
     const col = paletteColors[selectedPaletteIndex].hex;
     creatorEyeLeft = col;
     renderPreview();
   });
 }
 if(makeRightEyeBtn){
   makeRightEyeBtn.addEventListener('click', ()=>{
     const col = paletteColors[selectedPaletteIndex].hex;
     creatorEyeRight = col;
     renderPreview();
   });
 }
 if(twoEyeToggle){
   twoEyeToggle.addEventListener('change', ()=>{
     const two = twoEyeToggle.checked;
     // show/hide left/right specific buttons depending on toggle
     makeEyeBtn.style.display = two ? 'none' : '';
     makeLeftEyeBtn.style.display = two ? '' : 'none';
     makeRightEyeBtn.style.display = two ? '' : 'none';
   });
 }

 // Randomize creator: choose 1-6 colors, random length 2-20, random type, and random legs if insect
 if(randomizeBtn){
   randomizeBtn.addEventListener('click', ()=>{
     // random type
     const types = ['worm','snake','insect'];
     const chosenType = types[Math.floor(Math.random()*types.length)];
     entityTypeSelect.value = chosenType;

     // random legs for insects
     if(chosenType === 'insect'){
       const legs = 1 + Math.floor(Math.random()*6);
       legsPerSideInput.value = legs;
     }

     // random length 2-20
     const len = 2 + Math.floor(Math.random()*19);
     startLengthInput.value = len;

     // choose 1-6 random colors from paletteColors
     const colorCount = 1 + Math.floor(Math.random()*6);
     pattern.length = 0;
     for(let i=0;i<colorCount;i++){
       const col = paletteColors[Math.floor(Math.random()*paletteColors.length)];
       pattern.push(col);
     }

     // randomize whether there are two different eye colors (50/50)
     const twoEyes = Math.random() < 0.5;
     twoEyeToggle.checked = twoEyes;
     // trigger the change handler to update UI buttons visibility
     twoEyeToggle.dispatchEvent(new Event('change'));

     // pick eye colors: if twoEyes pick two random palette colors, otherwise pick one for both
     const pickColorHex = ()=> paletteColors[Math.floor(Math.random()*paletteColors.length)].hex;
     creatorEyeLeft = pickColorHex();
     creatorEyeRight = twoEyes ? pickColorHex() : creatorEyeLeft;

     renderPattern();
     renderPreview();
   });
 }

 // --- Name randomizer manager & generator ---
 const defaultNameOrders = ['cvcv','vcvc','cvcvc','cvcvcv','vcvcvc','cvvc','vcv','cvc'];
 let nameOrders = [];

 function saveNameOrders(){
   try{
     localStorage.setItem('nameOrders_v1', JSON.stringify(nameOrders));
   }catch(e){ console.warn('saveNameOrders failed', e); }
 }
 function loadNameOrders(){
   nameOrders.length = 0;
   try{
     const raw = localStorage.getItem('nameOrders_v1');
     if(raw){
       const parsed = JSON.parse(raw);
       if(Array.isArray(parsed) && parsed.length>0){
         nameOrders.push(...parsed);
       } else {
         nameOrders.push(...defaultNameOrders);
       }
     } else {
       nameOrders.push(...defaultNameOrders);
     }
   }catch(e){
     console.warn('loadNameOrders failed', e);
     nameOrders.push(...defaultNameOrders);
   }
 }
 function renderNameOrders(){
   nameOrdersList.innerHTML = '';
   nameOrders.forEach((ord, idx)=>{
     const el = document.createElement('div');
     el.className = 'pattern-item';
     el.style.display = 'flex';
     el.style.alignItems = 'center';
     el.style.justifyContent = 'space-between';
     el.style.padding = '6px';
     el.style.minWidth = '80px';
     el.style.borderRadius = '6px';
     el.style.background = '#fff';
     el.style.border = '1px solid #eee';
     el.textContent = ord;
     const del = document.createElement('button');
     del.textContent = 'Delete';
     del.style.marginLeft = '8px';
     del.addEventListener('click', ()=>{
       nameOrders.splice(idx,1);
       saveNameOrders();
       renderNameOrders();
     });
     const wrapper = document.createElement('div');
     wrapper.style.display = 'flex';
     wrapper.style.alignItems = 'center';
     wrapper.appendChild(el);
     wrapper.appendChild(del);
     // clicking the order uses it immediately to generate a name
     el.addEventListener('click', ()=>{
       generateAndSetName(ord);
     });
     nameOrdersList.appendChild(wrapper);
   });
 }

 // generator helpers
 const VOWELS = ['a','e','i','o','u'];
 const CONSONANTS = ['b','c','d','f','g','h','j','k','l','m','n','p','q','r','s','t','v','w','x','y','z'];

 function randomCharFor(symbol){
   if(symbol === 'v') return VOWELS[Math.floor(Math.random()*VOWELS.length)];
   if(symbol === 'c') return CONSONANTS[Math.floor(Math.random()*CONSONANTS.length)];
   return '';
 }

 function generateNameFromPattern(patternStr){
   let out = '';
   for(const ch of patternStr){
     if(ch === 'c' || ch === 'v'){
       out += randomCharFor(ch);
     }
   }
   // capitalize first letter
   if(out.length>0) out = out[0].toUpperCase() + out.slice(1);
   return out;
 }

 function generateAndSetName(patternStr){
   const name = generateNameFromPattern(patternStr);
   wormNameInput.value = name;
   renderPreview();
 }

 // randomize name button behavior
 if(randomizeNameBtn){
   randomizeNameBtn.addEventListener('click', ()=>{
     if(nameOrders.length===0) return;
     const ord = nameOrders[Math.floor(Math.random()*nameOrders.length)];
     generateAndSetName(ord);
   });
 }

 if(addNameOrderBtn){
   addNameOrderBtn.addEventListener('click', ()=>{
     const v = (namePatternInput.value||'').trim().toLowerCase();
     if(!v) return;
     // validate only c and v allowed
     if(!/^[cv]+$/.test(v)){
       alert('Only c and v characters allowed for name orders.');
       return;
     }
     nameOrders.push(v);
     namePatternInput.value = '';
     saveNameOrders();
     renderNameOrders();
   });
 }

 // initialize name orders from storage and render
 loadNameOrders();
 renderNameOrders();

// creator open/close
createBtn.addEventListener('click', ()=>{creator.classList.remove('hidden')});
cancelCreateBtn.addEventListener('click', ()=>{creator.classList.add('hidden')});

/* Persistent worm type storage
   - default types are marked isDefault:true and cannot be deleted
   - custom types are saved to localStorage under 'wormTypes'
*/
const wormTypes = [];
function saveWormTypes(){
  try{
    const toSave = wormTypes.filter(t=>!t.isDefault);
    localStorage.setItem('wormTypes_custom_v1', JSON.stringify(toSave));
  }catch(e){ console.warn('saveWormTypes failed',e); }
}
function loadWormTypes(){
  wormTypes.length = 0;
  // add protected defaults
  wormTypes.push({name:'Default Worm', len:8, pattern:[paletteColors[0]], isDefault:true});
  wormTypes.push({name:'Default Snake', len:6, pattern:[{hex: hues.green}], isSnake:true, isDefault:true});
  wormTypes.push({name:'Default Insect', len:2, pattern:[{hex: '#000000'}], isInsect:true, legsPerSide:3, isDefault:true});
  // load any saved custom types and append
  try{
    const raw = localStorage.getItem('wormTypes_custom_v1');
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)){
        for(const p of parsed){
          // ensure minimal shape and no accidental isDefault; restore saved eye colors if present
          const t = {
            name: p.name || 'Custom',
            len: Math.max(1, Number(p.len) || 3),
            pattern: p.pattern || [{hex:'#ffffff'}],
            isSnake: !!p.isSnake,
            isInsect: !!p.isInsect,
            legsPerSide: p.legsPerSide || 0,
            eyeLeft: p.eyeLeft || '#ffffff',
            eyeRight: p.eyeRight || p.eyeLeft || '#ffffff',
            isDefault: false
          };
          wormTypes.push(t);
        }
      }
    }
  }catch(e){ console.warn('loadWormTypes failed', e); }
}
function updateWormTypeOptions(){
  // preserve previous selection when possible
  const prevIndex = wormTypeSelect.selectedIndex;
  wormTypeSelect.innerHTML = '';
  wormTypes.forEach((t,i)=>{
    const o = document.createElement('option');
    o.value = i;
    o.textContent = t.name + (t.isDefault ? ' (default)' : '');
    wormTypeSelect.appendChild(o);
  });
  // restore selection (fallback to 0)
  const restored = (typeof prevIndex === 'number' && prevIndex >= 0 && prevIndex < wormTypes.length) ? prevIndex : 0;
  wormTypeSelect.selectedIndex = Math.min(restored, Math.max(0, wormTypes.length-1));

  // disable delete button when default selected or nothing selected
  const idx = wormTypeSelect.selectedIndex;
  if(deleteTypeBtn){
    deleteTypeBtn.disabled = !(idx >= 0 && !wormTypes[idx].isDefault);
  }
}

 // create worm/snake type
doneCreateBtn.addEventListener('click', ()=>{
  const name = wormNameInput.value.trim() || `Worm ${wormTypes.length+1}`;
  const len = Math.max(1, Math.floor(Number(startLengthInput.value) || 5));
  const pat = pattern.slice();
  if(pat.length===0) pat.push(paletteColors[0]);
  const ent = entityTypeSelect.value;
  const isSnake = (ent === 'snake');
  const isInsect = (ent === 'insect');
  const legsPerSide = Math.max(0, Math.min(6, Math.floor(Number(legsPerSideInput.value)||0)));
  // include eye colors chosen in creator
  const eyeL = creatorEyeLeft || '#ffffff';
  const eyeR = creatorEyeRight || creatorEyeLeft || '#ffffff';
  const type = {name, len, pattern:pat, isSnake, isInsect, legsPerSide, eyeLeft: eyeL, eyeRight: eyeR, isDefault:false};
  wormTypes.push(type);
  // persist custom types
  saveWormTypes();
  // select the newly created type so Delete can act on it immediately
  updateWormTypeOptions();
  wormTypeSelect.selectedIndex = wormTypes.length - 1;
  updateWormTypeOptions();
  creator.classList.add('hidden');
});

// Entities in sandbox
const worms = [];
const foods = [];
const nests = [];
const eggs = [];

function clearHungerTimer(worm){
  if(worm?.hungerTimer){
    clearTimeout(worm.hungerTimer);
    worm.hungerTimer = null;
  }
}

function scheduleHunger(worm){
  clearHungerTimer(worm);
  if(!hungerMode?.checked || !worm || worm.hungry) return;
  worm.hungerTimer = setTimeout(()=>{
    worm.hungerTimer = null;
    if(!hungerMode.checked || !worms.includes(worm)) return;
    worm.hungry = true;
    draw();
  }, getHungerDelayMs());
}

function clearHungerAfterEating(worm){
  if(!worm) return;
  worm.hungry = false;
  if(hungerMode?.checked) scheduleHunger(worm);
}

function matureBaby(worm){
  if(!worm?.baby) return;
  worm.baby = false;
  worm.adult = true;
  if(worm.growthTimer){
    clearTimeout(worm.growthTimer);
    worm.growthTimer = null;
  }
  setAdultSizes(worm);
}

function scheduleBabyGrowth(worm){
  if(worm?.growthTimer){
    clearTimeout(worm.growthTimer);
    worm.growthTimer = null;
  }
  if(!babiesGrowOverTime?.checked || !worm?.baby) return;
  worm.growthTimer = setTimeout(()=>{
    worm.growthTimer = null;
    if(!babiesGrowOverTime.checked || !worms.includes(worm) || !worm.baby) return;
    matureBaby(worm);
    draw();
  }, getBabyGrowTimeMs());
}

function clearCreatureTimers(worm){
  clearHungerTimer(worm);
  if(worm?.growthTimer){
    clearTimeout(worm.growthTimer);
    worm.growthTimer = null;
  }
}

if(hungerMode){
  hungerMode.addEventListener('change', ()=>{
    for(const worm of worms){
      if(hungerMode.checked){
        scheduleHunger(worm);
      } else {
        clearHungerTimer(worm);
        worm.hungry = false;
      }
    }
    draw();
  });
}

for(const input of [hungerMinTimeInput, hungerMaxTimeInput]){
  input?.addEventListener('change', ()=>{
    if(!hungerMode?.checked) return;
    for(const worm of worms) scheduleHunger(worm);
  });
}

if(babiesGrowOverTime){
  babiesGrowOverTime.addEventListener('change', ()=>{
    for(const worm of worms){
      if(babiesGrowOverTime.checked){
        scheduleBabyGrowth(worm);
      } else if(worm.growthTimer){
        clearTimeout(worm.growthTimer);
        worm.growthTimer = null;
      }
    }
  });
}

babyGrowTimeInput?.addEventListener('change', ()=>{
  if(!babiesGrowOverTime?.checked) return;
  for(const worm of worms) scheduleBabyGrowth(worm);
});

// spawn worm
spawnBtn.addEventListener('click', ()=>{
  const idx = wormTypeSelect.selectedIndex;
  if(idx<0) return;
  const type = wormTypes[idx];
  spawnWorm(type);
});

if(spawnBabyBtn){
  spawnBabyBtn.addEventListener('click', ()=>{
    const idx = wormTypeSelect.selectedIndex;
    if(idx<0) return;
    const type = wormTypes[idx];
    // spawn as baby (not hatched from egg)
    spawnWorm(type, undefined, undefined, true, false, null);
  });
}

// spawn random species filtered by selected spawn type
if(spawnRandomBtn){
  spawnRandomBtn.addEventListener('click', ()=>{
    const filter = (spawnTypeSelect && spawnTypeSelect.value) ? spawnTypeSelect.value : 'all';
    // filter wormTypes according to selection
    const candidates = wormTypes.filter(t=>{
      if(filter === 'all') return true;
      if(filter === 'worm') return !t.isSnake && !t.isInsect;
      if(filter === 'snake') return !!t.isSnake;
      if(filter === 'insect') return !!t.isInsect;
      return true;
    });
    if(candidates.length === 0) return;
    const choice = candidates[Math.floor(Math.random()*candidates.length)];
    // spawn at a random nearby position inside the canvas bounds
    const margin = 40;
    const x = margin + Math.random() * Math.max(0, canvas.width - margin*2);
    const y = margin + Math.random() * Math.max(0, canvas.height - margin*2);
    spawnWorm(choice, x, y, false);
  });
}

function spawnWorm(type, x=canvas.width/2, y=canvas.height/2, baby=false, fromEgg=false, parentLengths=null){
  // type may contain isSnake / isInsect flags (set when created)
  const circles = [];
  // insect characteristics: very small, babies start with 2 circles, all circles same size
  const isInsect = !!type.isInsect;
  // Determine base radius based strictly on baby/adult state so babies remain small regardless of count
  const baseRadius = isInsect ? (baby ? 4 : 8) : (baby ? (type.isSnake ? 14 : 10) : (type.isSnake ? 26 : 18));
  const shrink = isInsect ? 1.0 : (type.isSnake ? 0.94 : 0.92);

  // Determine number of segments (count)
  let count;
  if(isInsect){
    // insects: adults type.len; babies normally 2, but eggs can override via the toggle
    if(baby){
      if(fromEgg && eggsInheritLength && eggsInheritLength.checked && Array.isArray(parentLengths) && parentLengths.length > 0){
        // sanitize to positive ints
        const valid = parentLengths
          .map(n => Math.max(1, Math.floor(Number(n))))
          .filter(n => Number.isFinite(n));

        if(valid.length === 1){
          count = valid[0];
        } else {
          const aL = valid[0];
          const bL = valid[1];
          const pick = Math.random();

          if(pick < 1/3){
            count = aL;
          } else if(pick < 2/3){
            count = bL;
          } else {
            const minL = Math.min(aL, bL);
            const maxL = Math.max(aL, bL);

            // mixed is only possible when there is at least a gap of 2 (so an interior value exists)
            if(maxL - minL > 1){
              // choose an interior integer between (minL+1 .. maxL-1)
              count = minL + 1 + Math.floor(Math.random() * (maxL - minL - 1));
            } else {
              // fallback when mixed not possible: pick one parent randomly
              count = (Math.random() < 0.5) ? aL : bL;
            }
          }
        }
      } else {
        // not from egg or toggle off
        count = 2;
      }
    } else {
      // adult spawn
      count = type.len;
    }
  } else {
    if(baby){
      // baby creatures:
      // - if hatched from egg AND toggle enabled AND parentLengths provided -> inherit/choose mixed length
      if(fromEgg && eggsInheritLength && eggsInheritLength.checked && Array.isArray(parentLengths) && parentLengths.length > 0){
        if(parentLengths.length === 1){
          count = parentLengths[0];
        } else {
          // two parent lengths available: randomly pick parent A, parent B, or mixed (if possible)
          const aL = parentLengths[0];
          const bL = parentLengths[1];
          const pick = Math.random();
          if(pick < 1/3){
            count = aL;
          } else if(pick < 2/3){
            count = bL;
          } else {
            const minL = Math.min(aL, bL);
            const maxL = Math.max(aL, bL);
            // mixed is only possible when there is at least a gap of 2 (so an interior value exists)
            if(maxL - minL > 1){
              // choose an interior integer between (minL+1 .. maxL-1)
              count = minL + 1 + Math.floor(Math.random() * (maxL - minL - 1));
            } else {
              // fallback when mixed not possible: pick one parent randomly
              count = (Math.random() < 0.5) ? aL : bL;
            }
          }
        }
      } else {
        // not from egg or toggle off: spawned babies should be the species adult length per the request
        count = type.len;
      }
    } else {
      // adult spawn
      count = type.len;
    }
  }

  let r = baseRadius;
  for(let i=0;i<count;i++){
    const color = type.pattern[i % type.pattern.length].hex;
    // for insects all circles same size: do not shrink if insect
    circles.push({x:x, y:y + i*(r*1.05), r: r, color});
    if(!isInsect) r = r * shrink;
  }
  const id = Math.random().toString(36).slice(2,9);
  const worm = {
    id, name:type.name, circles, type, baby, adult:!baby, feedCount:0,
    hungry:false, hungerTimer:null, growthTimer:null,
    face: 'open', // default face expression
    mouth: (type && type.mouth) ? type.mouth : 'none', // mouth state: none|smile|neutral|frown|open-smile|open-neutral|open-frown|surprised
    emoji: '',     // emoji string to display above head
    isSnake: !!type.isSnake,
    isInsect: isInsect,
    legsPerSide: type.isInsect ? (Number.isFinite(type.legsPerSide) ? type.legsPerSide : 3) : 0,
    // per-instance eye colors derived from type (allow instance override in future)
    eyeLeft: (type.eyeLeft || '#ffffff'),
    eyeRight: (type.eyeRight || type.eyeLeft || '#ffffff')
  };
  worms.push(worm);

  if(!worm.baby) setAdultSizes(worm);
  scheduleHunger(worm);
  scheduleBabyGrowth(worm);

  draw();
  return worm;
}

// spawning food and interactions
let mode = null; // 'food','nest','layEgg','drag'
spawnFoodBtn.addEventListener('click', ()=>{mode = (mode==='food')?null:'food'; updateModeButtons()});
makeNestBtn.addEventListener('click', ()=>{mode = (mode==='nest')?null:'nest'; updateModeButtons()});
layEggBtn.addEventListener('click', ()=>{mode = (mode==='layEgg')?null:'layEgg'; updateModeButtons()});
breedBtn.addEventListener('click', ()=>{mode = (mode==='breed')?null:'breed'; updateModeButtons()});
turnIntoBtn.addEventListener('click', ()=>{ mode = (mode==='turn')?null:'turn'; updateModeButtons(); });

// face and emoji mode toggles
faceChangeBtn.addEventListener('click', ()=>{ mode = (mode==='face')?null:'face'; updateModeButtons(); });
displayEmojiBtn.addEventListener('click', ()=>{ mode = (mode==='emoji')?null:'emoji'; updateModeButtons(); });

// erase button toggles erase mode
if(eraseBtn){
  eraseBtn.addEventListener('click', ()=>{ mode = (mode==='erase')?null:'erase'; updateModeButtons(); });
}

function updateModeButtons(){
  spawnFoodBtn.style.background = mode==='food'?'#eef6ff':'';
  makeNestBtn.style.background = mode==='nest'?'#eef6ff':'';
  layEggBtn.style.background = mode==='layEgg'?'#eef6ff':'';
  breedBtn.style.background = mode==='breed'?'#eef6ff':'';
  turnIntoBtn.style.background = mode==='turn'?'#eef6ff':'';
  faceChangeBtn.style.background = mode==='face'?'#eef6ff':'';
  displayEmojiBtn.style.background = mode==='emoji'?'#eef6ff':'';
  if(eraseBtn) eraseBtn.style.background = mode==='erase'?'#feecec':'';
}

// mouse/touch handling for canvas
let dragging = null; // {worm, which:'head'|'tail'|'body', index}
let dragOffset = {x:0,y:0};
function getPointerPos(e){
  const rect = canvas.getBoundingClientRect();
  const p = (e.touches?e.touches[0]:e);
  return {x: (p.clientX - rect.left) * (canvas.width/rect.width), y: (p.clientY - rect.top) * (canvas.height/rect.height)};
}

canvas.addEventListener('pointerdown', (ev)=>{
  const p = getPointerPos(ev);
  if(mode==='food'){
    const r = Math.max(2, Math.min(64, Math.round(Number(foodSizeInput.value) || 8)));
    const color = (foodColorInput.value || '#7bd389');
    foods.push({x:p.x,y:p.y,r:r, color: color});
    // keep mode='food' so multiple foods can be placed until the user toggles the button
    updateModeButtons(); draw(); return;
  }
  if(mode==='nest'){ // tap worm head
    const hit = findWormAt(p);
    if(hit){
      // use user-selected nest size and color (fallback to defaults)
      let nestR = Math.max(4, Math.min(240, Math.round(Number(nestSizeInput?.value) || 48)));
      const colorHex = (nestColorInput?.value) || '#ffd24a';
      // create nest with explicit color stored so drawing can respect it
      nests.push({x:hit.circles[0].x,y:hit.circles[0].y,r:nestR, color: colorHex});
      mode=null; updateModeButtons(); draw();
    }
    return;
  }
  if(mode==='breed'){
    const hit = findWormAt(p);
    if(hit){
      // breed selection: store first selection or complete pair
      if(!canvas.__breedFirst){
        canvas.__breedFirst = hit;
        // highlight by temporarily storing a flag (visual highlight not implemented; selection persisted)
      } else if(canvas.__breedFirst && canvas.__breedFirst !== hit){
        const a = canvas.__breedFirst, b = hit;
        // only same species may breed
        if(a.isInsect === b.isInsect && a.isSnake === b.isSnake){
          // create a pending one-time cross for both parents that will be consumed when either lays an egg
          const mix = createMixedPattern(a, b);

          // determine child eye colors: randomly choose between
          // 1) mixed eyes (average each corresponding eye),
          // 2) left from A / right from B,
          // 3) right from A / left from B
          function blendHexLocal(h1, h2){
            const c1 = hexToRgb(h1||'#ffffff');
            const c2 = hexToRgb(h2||'#ffffff');
            return rgbToHex(Math.round((c1.r + c2.r)/2), Math.round((c1.g + c2.g)/2), Math.round((c1.b + c2.b)/2));
          }
          const seed = Math.random();
          let childEyeLeft, childEyeRight;
          if(seed < 1/3){
            // mixed: average each eye pair
            childEyeLeft = blendHexLocal(a.eyeLeft || (a.type && a.type.eyeLeft) || '#ffffff', b.eyeLeft || (b.type && b.type.eyeLeft) || '#ffffff');
            childEyeRight = blendHexLocal(
              a.eyeRight || (a.type && a.type.eyeRight) || a.eyeLeft || (a.type && a.type.eyeLeft) || '#ffffff',
              b.eyeRight || (b.type && b.type.eyeRight) || b.eyeLeft || (b.type && b.type.eyeLeft) || '#ffffff'
            );
          } else if(seed < 2/3){
            // left from A, right from B
            childEyeLeft = a.eyeLeft || (a.type && a.type.eyeLeft) || '#ffffff';
            childEyeRight = b.eyeRight || (b.type && b.type.eyeRight) || b.eyeLeft || (b.type && b.type.eyeLeft) || '#ffffff';
          } else {
            // right from A, left from B
            childEyeLeft = b.eyeLeft || (b.type && b.type.eyeLeft) || '#ffffff';
            childEyeRight = a.eyeRight || (a.type && a.type.eyeRight) || a.eyeLeft || (a.type && a.type.eyeLeft) || '#ffffff';
          }

          // store pending breed object referencing partner, mixed pattern, and computed eye colors; consumed on egg-laying
          a.pendingBreed = {partnerId: b.id, pattern: mix, eyeLeft: childEyeLeft, eyeRight: childEyeRight};
          b.pendingBreed = {partnerId: a.id, pattern: mix, eyeLeft: childEyeLeft, eyeRight: childEyeRight};
        }
        // clear first selection and exit breed mode
        canvas.__breedFirst = null;
        mode = null; updateModeButtons(); draw();
      }
    }
    return;
  }

  if(mode === 'turn'){
    const hit = findWormAt(p);
    if(hit){
      // prompt user for a name for the new species
      const defaultName = `${hit.name || 'Creature'} Species`;
      const chosenName = prompt('Name new species:', defaultName);
      if(chosenName !== null){
        // build a pattern from the creature's visible segment colors in-order, collapsing consecutive duplicates
        const colors = [];
        for(const seg of hit.circles){
          const c = seg.color || '#ffffff';
          if(colors.length === 0 || colors[colors.length-1] !== c){
            colors.push({hex: c});
          }
        }
        // allow any pattern length (no artificial 6-color cap) and ensure at least one color
        const pattern = colors.slice();
        if(pattern.length === 0) pattern.push({hex: '#ffffff'});

        const len = Math.max(1, hit.circles.length || (hit.type && hit.type.len) || 3);
        const type = {
          name: chosenName,
          len: len,
          pattern: pattern,
          isSnake: !!hit.isSnake,
          isInsect: !!hit.isInsect,
          legsPerSide: hit.legsPerSide || 0,
          // preserve instance eye colors when turning into a species
          eyeLeft: hit.eyeLeft || hit.type?.eyeLeft || '#ffffff',
          eyeRight: hit.eyeRight || hit.type?.eyeRight || hit.eyeLeft || '#ffffff',
          isDefault: false
        };
        wormTypes.push(type);
        saveWormTypes();
        updateWormTypeOptions();
        // select the newly created type
        wormTypeSelect.selectedIndex = wormTypes.length - 1;
        updateWormTypeOptions();
      }
      mode = null; updateModeButtons(); draw();
    }
    return;
  }

  if(mode==='layEgg'){
    const hit = findWormAt(p);
    if(hit){
      const tail = hit.circles[hit.circles.length-1];
      // store the parent's type on the egg so hatched babies inherit colors/pattern
      // eggs from snakes bigger, insects smaller
      const eggR = hit.isInsect ? 6 : (hit.isSnake ? 28 : 10);

      // prepare egg type and capture parent lengths BEFORE consuming pendingBreed so we preserve both parents' sizes
      let eggType;
      const parentLengths = [];

      if(hit.pendingBreed && Array.isArray(hit.pendingBreed.pattern)){
        // create a shallow copy of parent's type with mixed pattern and inherited eyes applied
        eggType = Object.assign({}, hit.type, {
          pattern: hit.pendingBreed.pattern.slice(),
          eyeLeft: hit.pendingBreed.eyeLeft || hit.type?.eyeLeft,
          eyeRight: hit.pendingBreed.eyeRight || hit.type?.eyeRight
        });

        // capture both parents' current lengths for inheritance/mixing logic
        const partner = worms.find(w=>w.id === hit.pendingBreed.partnerId);
        parentLengths.push(hit.circles.length);
        parentLengths.push(partner ? partner.circles.length : hit.circles.length);

        // consume both parents' pending breed if partner still exists
        if(partner){
          delete partner.pendingBreed;
        }
        delete hit.pendingBreed;
      } else {
        eggType = hit.type;
        // single parent egg
        parentLengths.push(hit.circles.length);
      }

      eggs.push({x: tail.x, y: tail.y, r: eggR, parentId: hit.id, hatched:false, type: eggType, parentLengths});
      mode=null; updateModeButtons(); draw();
    }
    return;
  }

  // face mode: tap worm to set face
  if(mode==='face'){
    const hit = findWormAt(p);
    if(hit){
      // set face expression and mouth (mouthSelector is global)
      hit.face = faceSelector.value || 'open';
      hit.mouth = (mouthSelector && mouthSelector.value) ? mouthSelector.value : (hit.mouth || 'none');
      mode = null; updateModeButtons(); draw();
    }
    return;
  }

  // emoji mode: tap worm to set emoji (empty string removes)
  if(mode==='emoji'){
    const hit = findWormAt(p);
    if(hit){
      hit.emoji = (emojiInput.value || '').trim();
      mode = null; updateModeButtons(); draw();
    }
    return;
  }

  // check eggs first
  const egg = eggs.find(e=>pointInCircle(p,e));
  if(egg){ hatchEgg(egg); draw(); return; }

  // erase mode: remove any matching entity under pointer (foods, nests, eggs, worm segments)
  if(mode === 'erase'){
    // foods
    const fi = foods.findIndex(f=>pointInCircle(p,f));
    if(fi >= 0){ foods.splice(fi,1); draw(); updateModeButtons(); return; }
    // nests
    const ni = nests.findIndex(n=>pointInCircle(p,n));
    if(ni >= 0){ nests.splice(ni,1); draw(); updateModeButtons(); return; }
    // eggs
    const ei = eggs.findIndex(e=>pointInCircle(p,e));
    if(ei >= 0){ eggs.splice(ei,1); draw(); updateModeButtons(); return; }
    // worm segments: remove specific segment if tapped; if a worm loses all segments remove worm entirely
    for(const w of worms.slice()){
      for(let si = w.circles.length - 1; si >= 0; si--){
        if(pointInCircle(p, w.circles[si])){
          w.circles.splice(si,1);
          if(w.circles.length === 0){
            const wi = worms.indexOf(w);
            if(wi >= 0){
              clearCreatureTimers(w);
              worms.splice(wi,1);
            }
          }
          draw();
          updateModeButtons();
          return;
        }
      }
    }
    // nothing erased
    updateModeButtons();
    return;
  }

  // drag head or tail or body
  for(const w of worms){
    const head = w.circles[0];
    const tail = w.circles[w.circles.length-1];
    if(pointInCircle(p, head)){ startDrag(w, 'head', 0, p); return; }
    if(pointInCircle(p, tail)){ startDrag(w, 'tail', w.circles.length-1, p); return; }
    // allow dragging body segments
    for(let i=0;i<w.circles.length;i++){
      if(pointInCircle(p, w.circles[i])){ startDrag(w, 'body', i, p); return; }
    }
  }
});

function startDrag(worm, which, index, p){
  dragging = {worm, which, index};
  const c = worm.circles[index];
  dragOffset.x = c.x - p.x;
  dragOffset.y = c.y - p.y;
}

canvas.addEventListener('pointermove', (ev)=>{
  if(!dragging) return;
  const p = getPointerPos(ev);
  const targetX = p.x + dragOffset.x;
  const targetY = p.y + dragOffset.y;
  const w = dragging.worm;
  if(dragging.which==='head'){
    // move head; follow by rest (simple follow)
    const head = w.circles[0];
    head.x = targetX; head.y = targetY;
    // propagate positions down the body
    for(let i=1;i<w.circles.length;i++){
      const cur = w.circles[i];
      const prev = w.circles[i-1];
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      const dist = Math.hypot(dx,dy) || 0.001;
      const targetDist = (prev.r + cur.r)*0.98;
      const k = (dist - targetDist)/dist;
      cur.x -= dx * k;
      cur.y -= dy * k;
    }
    // eating check: foods
    const eatenFoodIndex = foods.findIndex(f=>pointInCircle({x:head.x,y:head.y}, f));
    if(eatenFoodIndex>=0){
      const f = foods.splice(eatenFoodIndex,1)[0];
      clearHungerAfterEating(w);
      if(foodMakesLonger.checked && !w.baby){
        // add one circle at tail (insects keep uniform size, others shrink)
        const tail = w.circles[w.circles.length-1];
        const newR = tail.r * (w.isInsect ? 1.0 : 0.92);
        const nx = tail.x + (Math.random()-0.5)*6;
        const ny = tail.y + (Math.random()-0.5)*6;
        w.circles.push({x:nx,y:ny,r:newR,color: w.type.pattern[(w.circles.length)%w.type.pattern.length].hex});
      } else if(w.baby && !babiesGrowOverTime.checked){
        // feed baby
        w.feedCount++;
        if(w.feedCount >= getBabyGrowThreshold()){
          matureBaby(w);
        }
      }
    }

    // predators eating logic: only allow valid predator->prey interactions
    // Predators must not be insects. Snakes can eat non-snake worms when snakesEatWorms is enabled.
    // Non-insect predators (snakes or worms that are not insects) can eat insects when canEatInsects is enabled.
    if(!w.isInsect){
      for(const other of [...worms]){
        if(other === w) continue; // don't eat self

        // If other is an insect: only allow if insect-eating toggle is on and predator isn't an insect
        if(other.isInsect){
          if(!(canEatInsects && canEatInsects.checked)) continue;
        } else {
          // other is a worm/snake: only allow if predator is a snake AND the target is NOT a snake, and the snakes-eat-worms toggle is on
          if(!(w.isSnake && snakesEatWorms.checked && !other.isSnake)) continue;
        }

        // iterate segments, allow eating any body circles
        for(let si = other.circles.length-1; si>=0; si--){
          const seg = other.circles[si];
          if(pointInCircle({x:head.x,y:head.y}, seg)){
            // remove segment from other worm/insect
            other.circles.splice(si,1);
            clearHungerAfterEating(w);

            // If predator is a baby, count eaten segments toward maturation (same threshold as food)
            if(w.baby && !babiesGrowOverTime.checked){
              w.feedCount = (w.feedCount || 0) + 1;
              if(w.feedCount >= getBabyGrowThreshold()){
                matureBaby(w);
              }
            }

            // if food->growth toggle, add to predator tail as a new segment (matching color & scaled radius)
            if(foodMakesLonger.checked && !w.baby){
              const tail = w.circles[w.circles.length-1];
              const newR = tail.r * (w.isInsect ? 1.0 : 0.92);
              const nx = tail.x + (Math.random()-0.5)*6;
              const ny = tail.y + (Math.random()-0.5)*6;
              // choose color: predators may inherit eaten segment color based on toggles
              let chosenColor = w.type.pattern[(w.circles.length)%w.type.pattern.length].hex;
              if(other.isInsect){
                if(wormsInheritFromInsects && wormsInheritFromInsects.checked){
                  chosenColor = seg.color;
                }
              } else {
                if(snakesInheritColors && snakesInheritColors.checked && w.isSnake){
                  chosenColor = seg.color;
                }
              }
              w.circles.push({x:nx,y:ny,r:newR,color: chosenColor});
            } else {
              // eaten segments are consumed directly; do not spawn separate food items
            }
            // if the other has no segments left, remove the worm/insect entirely
            if(other.circles.length===0){
              const oi = worms.indexOf(other);
              if(oi>=0){
                clearCreatureTimers(other);
                worms.splice(oi,1);
              }
            }
            // break to avoid multiple eats at same pointer move for same segment
            break;
          }
        }
      }
    }
  } else if(dragging.which==='tail'){
    const tail = w.circles[w.circles.length-1];
    tail.x = targetX; tail.y = targetY;
    // optionally ease neighbors
    for(let i=w.circles.length-2;i>=0;i--){
      const cur = w.circles[i];
      const next = w.circles[i+1];
      const dx = cur.x - next.x, dy = cur.y - next.y;
      const dist = Math.hypot(dx,dy) || 0.001;
      const targetDist = (cur.r + next.r)*0.98;
      const k = (dist - targetDist)/dist;
      cur.x -= dx * k * 0.25;
      cur.y -= dy * k * 0.25;
    }
  } else {
    // body segment direct move
    const seg = w.circles[dragging.index];
    seg.x = targetX; seg.y = targetY;
  }
  draw();
});

canvas.addEventListener('pointerup', ()=> { dragging = null; });

 // helpers
 function pointInCircle(p, c){ return Math.hypot(p.x - c.x, p.y - c.y) <= (c.r || 0) + 6; }
 function findWormAt(p){
   for(const w of worms){
     if(pointInCircle(p, w.circles[0])) return w;
   }
   return null;
 }

 // createMixedPattern: produce an array of hex colors mixing the two parents per rules:
 // - randomly choose which parent dictates pattern length (50/50)
 // - for each index i up to chosen length, if both parents have a color at i blend them (average RGB),
 //   otherwise use the existing parent's color
 function createMixedPattern(a, b){
   const pa = a.type.pattern.map(p=>p.hex);
   const pb = b.type.pattern.map(p=>p.hex);
   // choose which parent's length to take (random)
   const chooseA = (Math.random() < 0.5);
   const len = chooseA ? pa.length : pb.length;
   const out = [];
   for(let i=0;i<len;i++){
     const ca = pa[i % pa.length];
     const cb = pb[i % pb.length];
     if(ca && cb){
       out.push(blendHex(ca, cb));
     } else {
       out.push(ca || cb || '#ffffff');
     }
   }
   return out.map(h=>({hex:h}));
 }

 // blend two hex colors by averaging RGB components
 function blendHex(h1, h2){
   const c1 = hexToRgb(h1);
   const c2 = hexToRgb(h2);
   const r = Math.round((c1.r + c2.r)/2);
   const g = Math.round((c1.g + c2.g)/2);
   const b = Math.round((c1.b + c2.b)/2);
   return rgbToHex(r,g,b);
 }

 // setAdultSizes: apply adult radii scaling to a worm instance based on its type
 // this central helper lets both eggs (hatchEgg) and direct-spawned babies end up with correct adult sizes when they mature.
 function setAdultSizes(w){
   if(!w) return;
   const baseRadius = w.isInsect ? 8 : (w.isSnake ? 26 : 18);
   const shrink = w.isInsect ? 1.0 : (w.isSnake ? 0.94 : 0.92);
   let r = baseRadius;
   for(let i=0;i<w.circles.length;i++){
     w.circles[i].r = r;
     r *= shrink;
   }
 }

 // helper to convert #rrggbb to rgba(...) with alpha
 function hexToRgba(hex, a){
   const c = hexToRgb(hex);
   return `rgba(${c.r},${c.g},${c.b},${a})`;
 }

 // eggs
 function hatchEgg(egg){
  if(egg.hatched) return;
  egg.hatched = true;
  // determine type to inherit (from egg.type if present, fallback to first worm type)
  const parentType = egg.type || (wormTypes[0] || {name:'Worm', len:3, pattern:[{hex:'#ffffff'}]});
  // spawn a baby that uses the parent's pattern/colors
  const baby = spawnWorm(parentType, egg.x, egg.y, true, true, egg.parentLengths || null);

  // ensure baby segments use parent's pattern colors
  for(let i=0;i<baby.circles.length;i++){
    baby.circles[i].color = parentType.pattern[i % parentType.pattern.length].hex;
  }

  // remove egg after hatch
  const idx = eggs.indexOf(egg);
  if(idx>=0) eggs.splice(idx,1);
}

  // delete selected custom type
if(deleteTypeBtn){
  deleteTypeBtn.addEventListener('click', ()=>{
    const idx = wormTypeSelect.selectedIndex;
    if(idx<0) return;
    const t = wormTypes[idx];
    if(t && !t.isDefault){
      wormTypes.splice(idx,1);
      saveWormTypes();
      updateWormTypeOptions();
      draw();
    }
  });

  // ensure delete button state updates when user changes selection
  wormTypeSelect.addEventListener('change', updateWormTypeOptions);
}

// clear
clearBtn.addEventListener('click', ()=>{
  for(const worm of worms) clearCreatureTimers(worm);
  worms.length=0; foods.length=0; nests.length=0; eggs.length=0; draw();
});

// drawing loop
function draw(){
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // nests
  for(const n of nests){
    ctx.beginPath();
    // use stored nest color if present (apply slight transparency)
    const fillColor = n.color ? hexToRgba(n.color, 0.95) : 'rgba(255,214,74,0.95)';
    ctx.fillStyle = fillColor;
    ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
  }
  // foods
  for(const f of foods){
    ctx.beginPath();
    const fillColor = f.color || '#7bd389';
    ctx.fillStyle = fillColor;
    ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill();
    // stroke slightly darker than fill
    ctx.strokeStyle = shade(fillColor, -0.2);
    ctx.lineWidth = 1; ctx.stroke();
  }
  // eggs
  for(const e of eggs){
    ctx.beginPath(); ctx.fillStyle = '#fff2d6'; ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#e6c46f'; ctx.stroke();
  }
  // worms (draw back-to-front: tail to head so head on top)
  for(const w of worms){
    for(let i=w.circles.length-1;i>=0;i--){
      const c = w.circles[i];
      // circle
      ctx.beginPath(); ctx.fillStyle = c.color; ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = shade(c.color, -0.2); ctx.lineWidth = 1; ctx.stroke();
      // slight size reduction per segment already encoded
    }
    // eyes on head (render according to face expression)
    const head = w.circles[0];
    const eyeR = Math.max(2.5, head.r*0.22);
    // separate eyes horizontally a bit more so they don't sit too close
    const gap = head.r * 0.6;
    const leftX = head.x - gap*0.5;
    const rightX = head.x + gap*0.5;
    const eyeY = head.y - head.r*0.18;
    // determine per-eye fill colors (use instance then type fallback)
    const eyeFillLeft = w.eyeLeft || (w.type && (w.type.eyeLeft || '#ffffff')) || '#ffffff';
    const eyeFillRight = w.eyeRight || (w.type && (w.type.eyeRight || w.type.eyeLeft || '#ffffff')) || '#ffffff';

    // if snake, draw a tongue pointing forward based on head->next segment,
    // but only when the creature has no mouth set (tongue hidden when mouth != 'none')
    if(w.isSnake && w.circles.length>1 && (w.mouth === 'none' || !w.mouth)){
      const next = w.circles[1];
      let dx = head.x - next.x;
      let dy = head.y - next.y;
      const mag = Math.hypot(dx,dy) || 1;
      dx /= mag; dy /= mag;
      // tongue length proportionally extended a bit farther out from the head
      const tlen = head.r * 1.6;
      const tx = head.x + dx * tlen;
      const ty = head.y + dy * tlen;
      ctx.strokeStyle = '#b71c1c';
      ctx.lineWidth = Math.max(2, head.r*0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      // tongue starts a bit offset from the head surface so it appears to protrude
      ctx.moveTo(head.x + dx * (head.r * 0.6), head.y + dy * (head.r * 0.6));
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // little fork tips
      ctx.beginPath();
      const perpX = -dy, perpY = dx;
      const fork = head.r*0.25;
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + perpX*fork, ty + perpY*fork);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - perpX*fork, ty - perpY*fork);
      ctx.stroke();
    }

    ctx.fillStyle = '#fff';
    // helper to draw closed/open/wink shapes
    // pupilScale lets us make pupils smaller for "scared" eyes
    function drawOpenEye(cx, cy, r, fillColor, pupilScale = 0.6){
      ctx.beginPath(); ctx.fillStyle = fillColor; ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      // dark pupil (scale can be reduced for scared/small pupils)
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx,cy,r * (pupilScale),0,Math.PI*2); ctx.fill();

      // outline eyes when the eye fill matches the head color so they remain visible
      try{
        const eyeHex = (fillColor||'').toString().trim().toLowerCase();
        const headHex = (head.color || (w.type && w.type.pattern && w.type.pattern[0] && w.type.pattern[0].hex) || '').toString().trim().toLowerCase();
        if(eyeHex && headHex && eyeHex === headHex){
          ctx.lineWidth = Math.max(1, r*0.12);
          ctx.strokeStyle = '#000';
          ctx.beginPath();
          ctx.arc(cx,cy,r + Math.max(1, r*0.08), 0, Math.PI*2);
          ctx.stroke();
        }
      }catch(e){
        // ignore any casing/format issues
      }
    }
    // drawClosedEye now accepts an explicit stroke color so closed-eye strokes can use the eye color
    function drawClosedEye(cx, cy, r, smile=0, strokeColor='#000'){
      ctx.beginPath();
      const w = r*1.6;
      const h = Math.max(1, r*0.45);
      if(smile===0){
        ctx.moveTo(cx - w/2, cy);
        ctx.lineTo(cx + w/2, cy);
      } else {
        const sign = smile>0? -1:1;
        ctx.quadraticCurveTo(cx, cy + sign*h, cx + w/2, cy);
        ctx.moveTo(cx - w/2, cy);
        ctx.quadraticCurveTo(cx, cy + sign*h, cx + w/2, cy);
      }
      ctx.lineWidth = Math.max(1, r*0.18);
      ctx.strokeStyle = strokeColor || '#000';
      ctx.stroke();
    }

    // draw a chevron-like eye: '>' or '<'
    function drawPainEye(cx, cy, r, dir = '>', strokeColor='#000'){ // dir '>' draws chevron pointing right, '<' points left
      const len = r * 1.4;
      const off = r * 0.35;
      ctx.beginPath();
      if(dir === '>'){
        ctx.moveTo(cx - len/2, cy - off);
        ctx.lineTo(cx + len/2, cy);
        ctx.lineTo(cx - len/2, cy + off);
      } else {
        ctx.moveTo(cx + len/2, cy - off);
        ctx.lineTo(cx - len/2, cy);
        ctx.lineTo(cx + len/2, cy + off);
      }
      ctx.lineWidth = Math.max(1.5, r*0.22);
      ctx.lineCap = 'round';
      ctx.strokeStyle = strokeColor || '#000';
      ctx.stroke();
    }

    // decide per-eye drawing based on face
    const face = w.face || 'open';

    // determine if the head's primary color is true black (#000000)
    const headColorNormalized = (head.color || (w.type && w.type.pattern && w.type.pattern[0] && w.type.pattern[0].hex) || '').toString().trim().toLowerCase();
    const headIsPureBlack = headColorNormalized === '#000000';

    // choose stroke colors for closed-eye rendering: if head is pure black, use the eye fill colors so closed eyes remain visible
    const closedStrokeLeft = headIsPureBlack ? (eyeFillLeft || '#fff') : '#000';
    const closedStrokeRight = headIsPureBlack ? (eyeFillRight || '#fff') : '#000';

    // helper to mask half of an eye circle by clipping then filling with head color
    function maskEyeHalf(cx, cy, r, which, headFill){
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1, 0, Math.PI*2);
      ctx.clip();
      ctx.beginPath();
      if(which === 'top'){
        // fill the top half (y <= cy)
        ctx.rect(cx - r - 4, cy - r - 4, r*2 + 8, r + 4);
      } else {
        // bottom half (y >= cy)
        ctx.rect(cx - r - 4, cy, r*2 + 8, r + 4);
      }
      ctx.fillStyle = headFill;
      ctx.fill();
      ctx.restore();
    }

    // small helper to draw tear lines under an eye
    function drawTears(cx, cy, r, color = '#4aa3ff'){
      const len1 = r * 1.35;
      const len2 = r * 0.9;
      const gap = r * 0.18;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, r*0.12);
      ctx.lineCap = 'round';
      // three small streaks under each eye with slight horizontal offsets
      ctx.beginPath();
      ctx.moveTo(cx - gap, cy + r*0.4);
      ctx.lineTo(cx - gap, cy + r*0.4 + len1);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy + r*0.45);
      ctx.lineTo(cx, cy + r*0.45 + len2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + gap, cy + r*0.42);
      ctx.lineTo(cx + gap, cy + r*0.42 + len1);
      ctx.stroke();
    }

    // determine head fill color for masking (use instance head color or first pattern color)
    const headFillColor = (head.color || (w.type && w.type.pattern && w.type.pattern[0] && w.type.pattern[0].hex) || '#ffffff');

    if(face === 'open'){
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight);
    } else if(face === 'scared'){
      // scared/surprised eyes: keep open eyeball but use much smaller pupils
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft, 0.35);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight, 0.35);
    } else if(face === 'big-pupils'){
      // big pupils: open eyes with enlarged pupils (kept below full-eye size)
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft, 0.85);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight, 0.85);
    } else if(face === 'crying'){
      // open eyes with blue tear streaks beneath
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight);
      drawTears(leftX, eyeY, eyeR);
      drawTears(rightX, eyeY, eyeR);
    } else if(face === 'closed-crying'){
      // sad closed eyes with tears
      drawClosedEye(leftX, eyeY, eyeR, -1, closedStrokeLeft);
      drawClosedEye(rightX, eyeY, eyeR, -1, closedStrokeRight);
      drawTears(leftX, eyeY, eyeR);
      drawTears(rightX, eyeY, eyeR);
    } else if(face === 'closed'){
      drawClosedEye(leftX, eyeY, eyeR, 0, closedStrokeLeft);
      drawClosedEye(rightX, eyeY, eyeR, 0, closedStrokeRight);
    } else if(face === 'left-wink'){
      drawClosedEye(leftX, eyeY, eyeR, 1, closedStrokeLeft);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight);
    } else if(face === 'right-wink'){
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft);
      drawClosedEye(rightX, eyeY, eyeR, 1, closedStrokeRight);
    } else if(face === 'happy-closed'){
      drawClosedEye(leftX, eyeY, eyeR, 1, closedStrokeLeft);
      drawClosedEye(rightX, eyeY, eyeR, 1, closedStrokeRight);
    } else if(face === 'sad-closed'){
      drawClosedEye(leftX, eyeY, eyeR, -1, closedStrokeLeft);
      drawClosedEye(rightX, eyeY, eyeR, -1, closedStrokeRight);
    } else if(face === 'pain-laughter'){
      // left eye shows '>' and right eye shows '<' for the "> <" effect
      drawPainEye(leftX, eyeY, eyeR, '>', closedStrokeLeft);
      drawPainEye(rightX, eyeY, eyeR, '<', closedStrokeRight);
    } else if(face === 'bored'){
      // bored: draw eyes but mask/hide the top half so only lower semicircles remain
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight);
      maskEyeHalf(leftX, eyeY, eyeR, 'top', headFillColor);
      maskEyeHalf(rightX, eyeY, eyeR, 'top', headFillColor);
    } else if(face === 'happy'){
      // happy: draw eyes but mask/hide the bottom half so only upper semicircles remain
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight);
      maskEyeHalf(leftX, eyeY, eyeR, 'bottom', headFillColor);
      maskEyeHalf(rightX, eyeY, eyeR, 'bottom', headFillColor);
    } else {
      drawOpenEye(leftX, eyeY, eyeR, eyeFillLeft);
      drawOpenEye(rightX, eyeY, eyeR, eyeFillRight);
    }

    // draw mouth
    (function drawMouthFor(w){
      const head = w.circles[0];
      if(!head) return;
      const mx = head.x;
      const my = head.y + head.r * 0.35;
      const mw = Math.max(6, head.r * 0.8);
      const mh = Math.max(2, head.r * 0.28);
      const m = w.mouth || (w.type && w.type.mouth) || 'none';

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // determine head color behaviors
      const headColorNormalized = (head.color || (w.type && w.type.pattern && w.type.pattern[0] && w.type.pattern[0].hex) || '').toString().trim().toLowerCase();
      const headIsPureBlack = headColorNormalized === '#000000';
      const headIsPureWhite = headColorNormalized === '#ffffff';

      // default mouth color behavior: uses eye color when head is black, otherwise black
      let mouthStroke = headIsPureBlack ? (w.eyeLeft || '#fff') : '#000';
      let mouthFill = headIsPureBlack ? (w.eyeLeft || '#fff') : '#000';

      // teeth variants: white fill with black outline; do not switch to eye color for black head
      const isTeeth = typeof m === 'string' && m.indexOf('teeth-') === 0;
      if(isTeeth){
        mouthFill = '#ffffff';
        mouthStroke = '#000';
      }

      // apply stroke/fill
      ctx.strokeStyle = mouthStroke;
      ctx.fillStyle = mouthFill;

      if(m === 'none') return;

      if(m === 'smile'){
        // raise the closed smile noticeably higher on the face
        ctx.lineWidth = Math.max(1, head.r * 0.12);
        ctx.beginPath();
        ctx.arc(mx, my - mh*0.6, mw*0.5, Math.PI*0.15, Math.PI*0.85, false);
        ctx.stroke();
      } else if(m === 'neutral'){
        ctx.lineWidth = Math.max(1, head.r * 0.12);
        ctx.beginPath();
        ctx.moveTo(mx - mw*0.35, my);
        ctx.lineTo(mx + mw*0.35, my);
        ctx.stroke();
      } else if(m === 'frown'){
        // lower the closed frown further down the face
        ctx.lineWidth = Math.max(1, head.r * 0.12);
        ctx.beginPath();
        ctx.arc(mx, my + mh*1.2, mw*0.5, Math.PI*1.15, Math.PI*1.85, false);
        ctx.stroke();
      } else if(m === 'open-smile' || m === 'teeth-smile'){
        ctx.lineWidth = Math.max(1, head.r * 0.08);
        const rx = mw*0.45;
        const ry = mh*1.2;
        // top-half ellipse (open smile)
        ctx.beginPath();
        ctx.ellipse(mx, my, rx, ry, 0, 0, Math.PI, false);
        ctx.fill();
        // if teeth variant, add outline so teeth are visible on any head background
        if(isTeeth){
          ctx.lineWidth = Math.max(1, head.r * 0.08);
          ctx.strokeStyle = mouthStroke;
          ctx.stroke();
          // also draw the straight/chord edge across the open mouth so teeth have an outlined straight part
          ctx.beginPath();
          ctx.moveTo(mx - rx, my);
          ctx.lineTo(mx + rx, my);
          ctx.stroke();
        }
      } else if(m === 'open-neutral' || m === 'teeth-neutral'){
        // make open-neutral shorter (less tall) and wider (wider ellipse)
        ctx.beginPath();
        const rxN = Math.max(4, mw * 0.45);
        const ryN = Math.max(2, mh * 0.6);
        ctx.ellipse(mx, my, rxN, ryN, 0, 0, Math.PI*2);
        ctx.fill();
        if(isTeeth){
          ctx.lineWidth = Math.max(1, head.r * 0.06);
          ctx.strokeStyle = mouthStroke;
          ctx.stroke();
        }
      } else if(m === 'open-frown' || m === 'teeth-frown'){
        ctx.lineWidth = Math.max(1, head.r * 0.08);
        const rxF = mw*0.45;
        const ryF = mh*1.1;
        // bottom-half ellipse (open frown)
        ctx.beginPath();
        ctx.ellipse(mx, my + mh*0.6, rxF, ryF, 0, Math.PI, Math.PI*2, false);
        ctx.fill();
        if(isTeeth){
          ctx.lineWidth = Math.max(1, head.r * 0.08);
          ctx.strokeStyle = mouthStroke;
          ctx.stroke();
          // outline the straight/chord edge across the open frown
          ctx.beginPath();
          // endpoints of the arc lie at (mx - rxF, my + mh*0.6) and (mx + rxF, my + mh*0.6)
          ctx.moveTo(mx - rxF, my + mh*0.6);
          ctx.lineTo(mx + rxF, my + mh*0.6);
          ctx.stroke();
        }
      } else if(m === 'surprised'){
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(3, head.r * 0.22), 0, Math.PI*2);
        ctx.fill();
      }
    })(w);

    // draw legs for insects/creatures that have legs (on all body circles except the head)
    if(w.legsPerSide && w.legsPerSide>0){
      for(let i=1;i<w.circles.length;i++){ // skip head index 0
        const seg = w.circles[i];
        const legCount = w.legsPerSide;

        // compute local tangent direction for this segment so legs rotate with body motion
        // prefer vector from previous to next segment when possible, otherwise use previous->current
        let tangentX = 0, tangentY = -1;
        if(w.circles[i+1] && w.circles[i-1]){
          tangentX = w.circles[i+1].x - w.circles[i-1].x;
          tangentY = w.circles[i+1].y - w.circles[i-1].y;
        } else if(w.circles[i-1]){
          tangentX = seg.x - w.circles[i-1].x;
          tangentY = seg.y - w.circles[i-1].y;
        } else if(w.circles[i+1]){
          tangentX = w.circles[i+1].x - seg.x;
          tangentY = w.circles[i+1].y - seg.y;
        }
        const magT = Math.hypot(tangentX, tangentY) || 1;
        tangentX /= magT; tangentY /= magT;
        // perpendicular (points outward for side = 1 or inward for side = -1)
        const perpX = -tangentY;
        const perpY = tangentX;

        for(let side=-1; side<=1; side+=2){
          for(let li=0; li<legCount; li++){
            // base distribution along the body axis (-0.5 .. 0.5)
            const tNorm = (legCount===1) ? 0 : (li/(legCount-1)) - 0.5;

            // increase lateral spread when there are more than 3 legs per side
            const spread = 1 + Math.max(0, legCount - 3) * 0.4; // each extra leg increases spread

            // start point moved outward toward the surface so leg appears attached near the edge
            // tangent offset scaled by spread so legs are more separated along body for high counts
            const startX = seg.x + perpX * (side * seg.r * 0.65) + tangentX * (tNorm * seg.r * 0.35 * spread);
            const startY = seg.y + perpY * (side * seg.r * 0.65) + tangentY * (tNorm * seg.r * 0.35 * spread);

            // end point pushed well outside the circle to make legs almost completely external,
            // with tangent offset also scaled by spread so the leg endpoints follow the increased separation
            const reach = seg.r * 1.9; // extend further beyond outer edge
            const endX = seg.x + perpX * (side * reach) + tangentX * (tNorm * seg.r * 1.2 * spread);
            const endY = seg.y + perpY * (side * reach) + tangentY * (tNorm * seg.r * 1.2 * spread);

            ctx.beginPath();
            ctx.strokeStyle = shade(seg.color, -0.6);
            ctx.lineWidth = Math.max(1, seg.r*0.09);
            ctx.lineCap = 'round';
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
          }
        }
      }
    }

    // status labels sit above the head and stack when more than one is active
    const labelFontSize = Math.max(10, Math.round(head.r * 0.4));
    const labelHeight = labelFontSize + 6;
    const drawStatusLabel = (label, bottom, fill, textColor)=>{
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const padH = 6;
      const padV = 3;
      const pillW = ctx.measureText(label).width + padH * 2;
      const pillH = labelHeight;
      const px = head.x - pillW/2;
      const py = bottom - pillH;
      ctx.fillStyle = fill;
      roundRect(ctx, px, py, pillW, pillH, pillH/2, true, false);
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 1;
      roundRect(ctx, px, py, pillW, pillH, pillH/2, false, true);
      ctx.fillStyle = textColor;
      ctx.fillText(label, head.x, py + pillH - padV - 1);
    };
    const labelBottom = head.y - head.r - 6;
    if(w.hungry){
      drawStatusLabel('hungry', labelBottom, '#fff0d6', '#8a4b08');
    }
    if(w.pendingBreed){
      const bredBottom = labelBottom - (w.hungry ? labelHeight + 3 : 0);
      drawStatusLabel('bred', bredBottom, 'rgba(255,255,255,0.95)', '#333');
    }

    // emoji display above head (follows head)
    if(w.emoji){
      ctx.font = `${Math.max(12, head.r*0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(w.emoji, head.x, head.y - head.r - 4);
    }

    // helper to draw rounded rect (filled/stroked)
    function roundRect(ctx, x, y, w, h, r, fill, stroke){
      if(r===undefined) r=4;
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.arcTo(x+w, y, x+w, y+h, r);
      ctx.arcTo(x+w, y+h, x, y+h, r);
      ctx.arcTo(x, y+h, x, y, r);
      ctx.arcTo(x, y, x+w, y, r);
      ctx.closePath();
      if(fill) ctx.fill();
      if(stroke) ctx.stroke();
    }
  }
}

// preview rendering
function renderPreview(){
  pctx.clearRect(0,0,preview.width,preview.height);
  const cx = preview.width/2, cy = preview.height/2;
  const len = Number(startLengthInput.value)||8;
  const r0 = 22;
  let r = r0;
  for(let i=0;i<len;i++){
    const col = (pattern[i % pattern.length] || paletteColors[0]).hex;
    pctx.beginPath(); pctx.fillStyle=col; pctx.arc(cx, cy + i*(r*0.85) - (len*r*0.4), r,0,Math.PI*2); pctx.fill();
    r*=0.92;
  }
  // larger eyes in preview - use creator eye colors
  const eyeFillL = creatorEyeLeft || '#ffffff';
  const eyeFillR = creatorEyeRight || creatorEyeLeft || '#ffffff';
  pctx.beginPath(); pctx.fillStyle=eyeFillL; pctx.arc(cx - r0*0.26, cy - (r0*0.4), 7,0,Math.PI*2); pctx.fill();
  pctx.beginPath(); pctx.fillStyle=eyeFillR; pctx.arc(cx - r0*0.26 + r0*0.34, cy - (r0*0.4), 7,0,Math.PI*2); pctx.fill();
  pctx.fillStyle='#000'; pctx.beginPath(); pctx.arc(cx - r0*0.26, cy - (r0*0.4),3.5,0,Math.PI*2); pctx.fill();
  pctx.beginPath(); pctx.arc(cx - r0*0.26 + r0*0.34, cy - (r0*0.4),3.5,0,Math.PI*2); pctx.fill();
}
renderPreview();

// utility shade generator
function shade(hex, percent){
  const c = hexToRgb(hex);
  const f = (p,v)=>Math.max(0,Math.min(255,Math.round(v*(1+percent))));
  return rgbToHex(f(percent,c.r), f(percent,c.g), f(percent,c.b));
}

 // load defaults + any saved custom types, then render UI
loadWormTypes();
updateWormTypeOptions();
resizeCanvas();
draw();
