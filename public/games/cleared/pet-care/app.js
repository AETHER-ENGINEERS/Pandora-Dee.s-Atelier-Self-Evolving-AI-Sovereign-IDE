/* Pet game - no external libs. Mobile-first, single-screen friendly. */

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

/* Elements */
const creator = qs('#creator');
const care = qs('#care');
const petPreview = qs('#petPreview');
const btnDone = qs('#btnDone');
const btnReset = qs('#btnReset');

const bodyColorInput = qs('#bodyColor');
const eyeColorInput = qs('#eyeColor');
const pupilColorInput = qs('#pupilColor');
const accEmojiInput = qs('#accEmoji');
const accColorInput = qs('#accColor');
const accPosInput = qs('#accPos');
const accSizeInput = qs('#accSize');

const petCare = qs('#pet');
const petPreviewAccessory = qs('#accessory');
const petCareAccessory = qs('#accessoryCare');

const ageLabel = qs('#age');
const deathAgeLabel = qs('#deathAgeLabel');
const happyLabel = qs('#happiness');
const happinessFill = qs('#happinessFill');
const interactionInput = qs('#interactionInput');
const btnEnter = qs('#btnEnter');
const btnLists = qs('#btnLists');
const listsPanel = qs('#listsPanel');
const btnRestart = qs('#btnRestart');
const btnRestart2 = qs('#btnRestart2');
const deathModal = qs('#deathModal');
const deathMessageEl = qs('#deathMessage');

const lovedList = qs('#lovedList');
const likedList = qs('#likedList');
const neutralList = qs('#neutralList');
const dislikedList = qs('#dislikedList');
const hatedList = qs('#hatedList');

// settings elements
const btnSettings = qs('#btnSettings');
const settingsModal = qs('#settingsModal');
const btnCloseSettings = qs('#btnCloseSettings');
const btnResetSettings = qs('#btnResetSettings');
const deathAgeInput = qs('#deathAgeInput');
const deltaLovedInput = qs('#deltaLoved');
const deltaLikedInput = qs('#deltaLiked');
const deltaNeutralInput = qs('#deltaNeutral');
const deltaDislikedInput = qs('#deltaDisliked');
const deltaHatedInput = qs('#deltaHated');

/* State */
let petConfig = {
  bodyColor: '#ffd166',
  eyeColor: '#ffffff',
  pupilColor: '#222222',
  accessory: '',
  accColor: '#ff0000',
  accPos: 'top',
  accSize: 0.9,
  // per-pet random seed used to randomize classification mapping
  seed: Math.floor(Math.random() * 1e9)
};

let state = {
  age: 0,
  happiness: 0,
  lists: { loved:[], liked:[], neutral:[], disliked:[], hated:[] },
  alive: true
};

// runtime-configurable settings (defaults match previous behaviour)
let settings = {
  deathAge: 100,
  deltas: {
    loved: 10,
    liked: 5,
    neutral: 0,
    disliked: -5,
    hated: -10
  }
};

/* Helpers */
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function updatePreviewFromInputs(){
  petConfig.bodyColor = bodyColorInput.value;
  petConfig.eyeColor = eyeColorInput.value;
  petConfig.pupilColor = pupilColorInput.value;
  petConfig.accessory = accEmojiInput.value.trim().slice(0,2);
  petConfig.accColor = accColorInput.value;
  petConfig.accPos = accPosInput.value;
  petConfig.accSize = parseFloat(accSizeInput.value) || 0.9;
  renderPet(petPreview, petPreviewAccessory, petConfig);
}
function renderPet(petEl, accessoryEl, cfg){
  petEl.style.background = cfg.bodyColor;
  petEl.querySelectorAll('.eye').forEach(e=>{
    e.style.background = cfg.eyeColor;
  });
  petEl.querySelectorAll('.pupil').forEach(p=>{
    p.style.background = cfg.pupilColor;
  });

  // accessory styling & placement
  if(!cfg.accessory){
    accessoryEl.style.display = 'none';
    accessoryEl.textContent = '';
    accessoryEl.style.backgroundImage = '';
    return;
  }
  accessoryEl.style.display = 'flex';
  accessoryEl.textContent = ''; // we will render a monochrome shape instead of showing the color emoji glyph

  const sizeBase = petEl.clientWidth || 84;
  const size = Math.round(sizeBase * cfg.accSize);
  accessoryEl.style.width = size + 'px';
  accessoryEl.style.height = size + 'px';
  accessoryEl.style.borderRadius = '0'; // let shape match glyph bounds
  accessoryEl.style.background = 'transparent';
  accessoryEl.style.alignItems = 'center';
  accessoryEl.style.justifyContent = 'center';
  accessoryEl.style.transform = 'translate(0,0) scale(1)';
  accessoryEl.style.boxShadow = 'none';
  accessoryEl.style.pointerEvents = 'none';

  // position offset mapping
  // primary offset for cardinal positions, slightly smaller diagonals so they sit closer to the body
  const offset = Math.round(sizeBase * 0.42);
  const diagOffset = Math.round(sizeBase * 0.32);
  const pos = cfg.accPos;
  accessoryEl.style.top = '50%';
  accessoryEl.style.left = '50%';
  accessoryEl.style.right = 'auto';
  accessoryEl.style.bottom = 'auto';
  accessoryEl.style.transform = 'translate(-50%, -50%)';

  switch(pos){
    case 'top': accessoryEl.style.transform = `translate(-50%,-${offset + size/2}px)`; break;
    case 'bottom': accessoryEl.style.transform = `translate(-50%,${offset - size/2}px)`; break;
    case 'left': accessoryEl.style.transform = `translate(-${offset + size/2}px,-50%)`; break;
    case 'right': accessoryEl.style.transform = `translate(${offset - size/2}px,-50%)`; break;
    case 'top-left': accessoryEl.style.transform = `translate(-${diagOffset + size/2}px,-${diagOffset + size/2}px)`; break;
    case 'top-right': accessoryEl.style.transform = `translate(${diagOffset - size/2}px,-${diagOffset + size/2}px)`; break;
    case 'bottom-left': accessoryEl.style.transform = `translate(-${diagOffset + size/2}px,${diagOffset - size/2}px)`; break;
    case 'bottom-right': accessoryEl.style.transform = `translate(${diagOffset - size/2}px,${diagOffset - size/2}px)`; break;
    default: break;
  }

  // Draw the emoji as a monochrome mask on a canvas, then tint it with the chosen color.
  // This produces a solid-colored shape that follows the emoji silhouette instead of showing the original multicolor glyph on a colored box.
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0,0,size,size);

    // draw emoji in black centered
    const fontSize = Math.round(size * 0.9);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // use a fallback stack to try and get a glyph that renders consistently; the glyph may be color but we'll extract alpha
    ctx.font = `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(cfg.accessory, size/2, size/2);

    // extract image data and create a new canvas where shape is filled with accColor using alpha as mask
    const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    // create mask canvas
    const maskCanvas = document.createElement('canvas');
    const mctx = maskCanvas.getContext('2d');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;

    // put the drawn emoji bitmap into mask canvas (it preserves alpha)
    mctx.putImageData(imgData, 0, 0);

    // create final canvas and fill with chosen color, then use destination-in to keep only emoji alpha
    const finalCanvas = document.createElement('canvas');
    const fctx = finalCanvas.getContext('2d');
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height;
    fctx.scale(1,1);
    // fill with chosen color
    fctx.fillStyle = cfg.accColor;
    fctx.fillRect(0,0,finalCanvas.width,finalCanvas.height);
    // use mask
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas, 0, 0);

    // set as background image (no extra colored box)
    const dataUrl = finalCanvas.toDataURL();
    accessoryEl.style.backgroundImage = `url("${dataUrl}")`;
    accessoryEl.style.backgroundSize = 'contain';
    accessoryEl.style.backgroundRepeat = 'no-repeat';
    accessoryEl.style.backgroundPosition = 'center';
    accessoryEl.textContent = ''; // ensure no text fallback
  } catch (err) {
    // Fallback: show a simple colored circle if canvas fails
    accessoryEl.style.background = cfg.accColor;
    accessoryEl.textContent = cfg.accessory;
    accessoryEl.style.color = '#fff';
  }
}

/* Creator wiring */
[bodyColorInput, eyeColorInput, pupilColorInput, accEmojiInput, accColorInput, accPosInput, accSizeInput]
.forEach(i => i.addEventListener('input', updatePreviewFromInputs));

btnReset.addEventListener('click',()=>{
  bodyColorInput.value = '#ffd166';
  eyeColorInput.value = '#ffffff';
  pupilColorInput.value = '#222222';
  accEmojiInput.value = '';
  accColorInput.value = '#ff0000';
  accPosInput.value = 'top';
  accSizeInput.value = '0.9';
  updatePreviewFromInputs();
});

btnDone.addEventListener('click',()=>{
  // finalize config
  updatePreviewFromInputs();
  // assign a fresh random seed for this pet so mappings differ per pet
  petConfig.seed = Date.now() ^ Math.floor(Math.random() * 1e9);
  // copy to pet area
  renderPet(petCare, petCareAccessory, petConfig);
  // initial values
  state.age = 0;
  state.happiness = 0;
  state.lists = { loved:[], liked:[], neutral:[], disliked:[], hated:[] };
  state.alive = true;
  updateUI();
  creator.classList.add('hidden');
  care.classList.remove('hidden');
  interactionInput.focus();
});

/* Care area logic */

function updateUI(){
  ageLabel.textContent = state.age;
  happyLabel.textContent = state.happiness;
  happinessFill.style.width = (state.happiness)+'%';
  // scale pet with age: base 1 -> grows every 5 ages
  // start much smaller and grow noticeably with age, but stop growing after age 30
  const cappedAge = Math.min(state.age, 30);
  const growthSteps = Math.floor(cappedAge / 5);
  const baseScale = 0.36; // much smaller initial size in play mode
  const scale = baseScale + (growthSteps * 0.12);
  petCare.style.transform = `scale(${scale})`;
  petPreviewAccessory && renderPet(petCare, petCareAccessory, petConfig);
  // lists
  lovedList.innerHTML = state.lists.loved.map(i=>`<li>${escapeHtml(i)}</li>`).join('');
  likedList.innerHTML = state.lists.liked.map(i=>`<li>${escapeHtml(i)}</li>`).join('');
  neutralList.innerHTML = state.lists.neutral.map(i=>`<li>${escapeHtml(i)}</li>`).join('');
  dislikedList.innerHTML = state.lists.disliked.map(i=>`<li>${escapeHtml(i)}</li>`).join('');
  hatedList.innerHTML = state.lists.hated.map(i=>`<li>${escapeHtml(i)}</li>`).join('');
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function evaluateInput(text){
  // Deterministic classification based on a simple hash of the input,
  // but use runtime-configurable deltas from settings.
  const t = String(text).trim();
  if(!t) return {category:'neutral', delta: settings.deltas.neutral};
  // simple keywords: love/like/dislike/hate overrides
  const lower = t.toLowerCase();
  if(/\b(love|luv|<3|❤️|💖|😍)\b/.test(lower)) return {category:'loved', delta: settings.deltas.loved};
  if(/\b(like|nice|good|👍|🙂)\b/.test(lower)) return {category:'liked', delta: settings.deltas.liked};
  if(/\b(dislike|meh|ok|okay|neutral)\b/.test(lower)) return {category:'neutral', delta: settings.deltas.neutral};
  if(/\b(hate|bad|awful|👎|😡)\b/.test(lower)) return {category:'hated', delta: settings.deltas.hated};
  if(/\b(disgust|dont|don't|no)\b/.test(lower)) return {category:'disliked', delta: settings.deltas.disliked};

  // otherwise use a small hash combined with the pet's random seed to pick one of the five categories
  let h = 0;
  for(let i=0;i<t.length;i++){ h = ((h<<5)-h) + t.charCodeAt(i); h |= 0; }
  const mixed = Math.abs(h ^ (petConfig && petConfig.seed ? petConfig.seed : 0));
  const idx = mixed % 5;
  const map = [
    {category:'loved', delta: settings.deltas.loved},
    {category:'liked', delta: settings.deltas.liked},
    {category:'neutral', delta: settings.deltas.neutral},
    {category:'disliked', delta: settings.deltas.disliked},
    {category:'hated', delta: settings.deltas.hated}
  ];
  return map[idx];
}

function addToList(category, text){
  // don't add duplicates (exact match) to a list
  if (state.lists[category].includes(text)) return false;
  state.lists[category].unshift(text);
  // cap per list
  if(state.lists[category].length > 40) state.lists[category].pop();
  return true;
}

function checkDeath(){
  if(state.age >= settings.deathAge){
    state.alive = false;
    let msg = deathMessageFor(state.happiness);
    deathMessageEl.textContent = msg;
    deathModal.classList.remove('hidden');
    btnRestart.classList.remove('hidden');
  }
}

function deathMessageFor(h){
  if(h <= 10) return "it had the worst life ever.";
  if(h <= 20) return "it had a bad life.";
  if(h <= 30) return "it's life wasn't great.";
  if(h <= 40) return "it's life wasn't the best, but it was okay.";
  if(h <= 50) return "it had a standard life.";
  if(h <= 60) return "it had a good life.";
  if(h <= 70) return "it had a pretty good life!";
  if(h <= 80) return "it had a great life!";
  if(h <= 90) return "it had an amazing life!";
  return "it had the best life ever!";
}

btnEnter.addEventListener('click', doEnter);
interactionInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') doEnter(); });

function doEnter(){
  if(!state.alive) return;
  const text = interactionInput.value.trim();
  if(!text) return;
  const res = evaluateInput(text);
  // try to add; if the exact text already exists in that category, ignore adding but still apply effects
  addToList(res.category, text); // we don't need the return value for applying age/happiness

  // always update happiness/age even for repeated items
  state.happiness = clamp(state.happiness + res.delta, 0, 100);
  state.age = clamp(state.age + 1, 0, 100);
  updateUI();
  checkDeath();
  interactionInput.value = '';
  interactionInput.focus();
}

btnLists.addEventListener('click',()=>{
  listsPanel.classList.toggle('hidden');
});

function restart(){
  // hide death UI
  deathModal.classList.add('hidden');
  // show creator, hide care area
  creator.classList.remove('hidden');
  care.classList.add('hidden');
  // hide restart controls
  btnRestart.classList.add('hidden');
  // hide any accessory preview in the large pet area
  if (petPreviewAccessory) petPreviewAccessory.style.display = 'none';
  // reset game state so user can start fresh without reload
  state.age = 0;
  state.happiness = 0;
  state.lists = { loved:[], liked:[], neutral:[], disliked:[], hated:[] };
  state.alive = true;
  // ensure modal restart button inside modal stays hidden (if it was shown)
  if (btnRestart2) btnRestart2.classList.add('hidden');
  updateUI();
  // ensure inputs focus is cleared so creator isn't unexpectedly focused
  interactionInput.value = '';
}

/* restart handlers */
btnRestart.addEventListener('click', restart);
btnRestart2.addEventListener('click', restart);

/* Settings wiring */
btnSettings && btnSettings.addEventListener('click', ()=>{
  // populate inputs with current settings
  deathAgeInput.value = settings.deathAge;
  deltaLovedInput.value = settings.deltas.loved;
  deltaLikedInput.value = settings.deltas.liked;
  deltaNeutralInput.value = settings.deltas.neutral;
  deltaDislikedInput.value = settings.deltas.disliked;
  deltaHatedInput.value = settings.deltas.hated;
  settingsModal.classList.remove('hidden');
});

btnCloseSettings && btnCloseSettings.addEventListener('click', ()=>{
  // commit settings
  settings.deathAge = clamp(parseInt(deathAgeInput.value) || settings.deathAge, 1, 9999);
  settings.deltas.loved = parseInt(deltaLovedInput.value) || settings.deltas.loved;
  settings.deltas.liked = parseInt(deltaLikedInput.value) || settings.deltas.liked;
  settings.deltas.neutral = parseInt(deltaNeutralInput.value) || settings.deltas.neutral;
  settings.deltas.disliked = parseInt(deltaDislikedInput.value) || settings.deltas.disliked;
  settings.deltas.hated = parseInt(deltaHatedInput.value) || settings.deltas.hated;
  // update UI label for death age and any dependent visuals
  deathAgeLabel && (deathAgeLabel.textContent = settings.deathAge);
  settingsModal.classList.add('hidden');
  updateUI();
});

btnResetSettings && btnResetSettings.addEventListener('click', ()=>{
  settings = {
    deathAge: 100,
    deltas: { loved:10, liked:5, neutral:0, disliked:-5, hated:-10 }
  };
  deathAgeInput.value = settings.deathAge;
  deltaLovedInput.value = settings.deltas.loved;
  deltaLikedInput.value = settings.deltas.liked;
  deltaNeutralInput.value = settings.deltas.neutral;
  deltaDislikedInput.value = settings.deltas.disliked;
  deltaHatedInput.value = settings.deltas.hated;
  deathAgeLabel && (deathAgeLabel.textContent = settings.deathAge);
  settingsModal.classList.add('hidden');
  updateUI();
});

/* Initialize */
deathAgeLabel && (deathAgeLabel.textContent = settings.deathAge);
updatePreviewFromInputs();
updateUI();