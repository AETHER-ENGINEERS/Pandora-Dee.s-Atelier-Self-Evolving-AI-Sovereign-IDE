const DEFAULTS = {
  bodyColor: '#ffd36b',
  bodyColor2: '#ffecd6',
  bodyMode: 'solid',
  eyeColor: '#2b2b2b',
  eyeColor2: '#000000',
  eyeMode: 'solid',
  mouthColor: '#2b2b2b',
  mouthColor2: '#000000',
  mouthMode: 'solid',
  eyeState: 'open',
  mouthExpression: 'smile',
  patterns: [], // default none
  itemBg: '#ffffff',
  itemBg2: '#eeeeee',
  itemBgMode: 'solid',
  patternLimit: 2,
  accessoryLimit: 3,
  heartEmoji: '❤️',
  theme: 'light',
  heartFloatDelay: 700, // default ms
  heartDelayUnit: 'ms' // 'ms' or 's'
};

const accessoryTypes = [
  {id:'triangleEars', name:'Triangle Ears'},
  {id:'circleEars', name:'Circle Ears'},
  {id:'longEars', name:'Long Ears'},
  {id:'horn1', name:'1 Horn'},
  {id:'horn2', name:'2 Horns'},
  {id:'horn3', name:'3 Horns'},
  {id:'nose', name:'Nose'},
  {id:'tailThin', name:'Thin Tail'},
  {id:'tailThick', name:'Thick Tail'},
  {id:'tailCircle', name:'Circle Tail'},
  {id:'ant1', name:'1 Antenna'},
  {id:'ant2', name:'2 Antennas'},
  {id:'wings', name:'Wings'},
  {id:'cloud', name:'Cloud Base'},
  {id:'flower', name:'Flower'},
  {id:'honeycomb', name:'Honeycomb'}
];

const patternTypes = [
  {id:'leftSpot', name:'Left Spot'},
  {id:'rightSpot', name:'Right Spot'},
  {id:'stripes', name:'Stripes'},
  {id:'mouthSpot', name:'Mouth Spot'},
  {id:'faceSpot', name:'Face Spot'},
];

let state = {
  bodyColor: DEFAULTS.bodyColor,
  bodyColor2: DEFAULTS.bodyColor2,
  bodyMode: DEFAULTS.bodyMode,
  eyeColor: DEFAULTS.eyeColor,
  eyeColor2: DEFAULTS.eyeColor2,
  eyeMode: DEFAULTS.eyeMode,
  mouthColor: DEFAULTS.mouthColor,
  mouthColor2: DEFAULTS.mouthColor2,
  mouthMode: DEFAULTS.mouthMode,
  eyeState: DEFAULTS.eyeState,
  mouthExpression: DEFAULTS.mouthExpression,
  accessories: [], // {type, color}
  patterns: [], // {type, color}
  items: [], // {emoji, anim, bgColor or bgFill}
  itemBg: DEFAULTS.itemBg,
  itemBg2: DEFAULTS.itemBg2,
  itemBgMode: DEFAULTS.itemBgMode,
  // settings mirrored into state for runtime enforcement
  patternLimit: DEFAULTS.patternLimit,
  accessoryLimit: DEFAULTS.accessoryLimit,
  heartEmoji: DEFAULTS.heartEmoji,
  theme: DEFAULTS.theme
};

const PRESET_COLORS = [
  '#ffffff','#f2f2f2','#cccccc','#8a8a8a','#000000',
  '#ff4d4d','#ff8a1a','#ffdd57','#7ed957','#2bd6c5',
  '#00d4ff','#bfe8ff','#5aa0ff','#7a5cff','#bf5aff',
  '#ff6fcf','#4b2b1f','#8b5a3c','#d9b99b','#ffecd6' // peach -> cream tone
];

// custom presets persistence
const CUSTOM_PRESET_KEY = 'pet_custom_presets_v1';
let customPresets = [];
function loadCustomPresets(){
  try{
    const raw = localStorage.getItem(CUSTOM_PRESET_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if(Array.isArray(parsed)) customPresets = parsed;
    else customPresets = [];
  }catch(e){ customPresets = []; }
}
function saveCustomPresets(){
  try{ localStorage.setItem(CUSTOM_PRESET_KEY, JSON.stringify(customPresets)); }catch(e){}
}

// returns combined preset list (base + custom)
function getAllPresets(){
  return PRESET_COLORS.concat(customPresets || []);
}
function addCustomPreset(color){
  if(!color) return;
  if(!customPresets.includes(color)) customPresets.push(color);
  saveCustomPresets();
  renderBodyPresets();
  renderItemBgPresets();
}
function clearAllCustomPresets(){
  customPresets = [];
  saveCustomPresets();
  renderBodyPresets();
  renderItemBgPresets();
}

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function init(){
  // inputs
  // body color & gradient controls
  $('#bodyColor').addEventListener('input', e => { state.bodyColor = e.target.value; renderAll(); });
  $('#bodyColor2').addEventListener('input', e => { state.bodyColor2 = e.target.value; renderAll(); });
  $('#bodyColorMode').addEventListener('change', e => {
    state.bodyMode = e.target.value;
    const isGrad = state.bodyMode === 'gradient';
    $('#bodyColor2').style.display = isGrad ? 'inline-block' : 'none';
    $('#bodyGradDir').style.display = isGrad ? 'inline-block' : 'none';
    // show/hide second preset row
    const bp2 = $('#bodyPresets2');
    if(bp2) bp2.style.display = isGrad ? 'flex' : 'none';
    renderAll();
  });
  $('#bodyGradDir').addEventListener('change', e => { state.bodyGradDir = e.target.value; renderAll(); });

  // eye color & gradient controls
  $('#eyeColor').addEventListener('input', e => { state.eyeColor = e.target.value; renderAll(); });
  $('#eyeColor2').addEventListener('input', e => { state.eyeColor2 = e.target.value; renderAll(); });
  $('#eyeColorMode').addEventListener('change', e => {
    state.eyeMode = e.target.value;
    const isGrad = state.eyeMode === 'gradient';
    $('#eyeColor2').style.display = isGrad ? 'inline-block' : 'none';
    $('#eyeGradDir').style.display = isGrad ? 'inline-block' : 'none';
    const ep2 = $('#eyePresets2');
    if(ep2) ep2.style.display = isGrad ? 'flex' : 'none';
    renderAll();
  });
  $('#eyeGradDir').addEventListener('change', e => { state.eyeGradDir = e.target.value; renderAll(); });

  // mouth color & gradient controls
  $('#mouthColor').addEventListener('input', e => { state.mouthColor = e.target.value; renderAll(); });
  $('#mouthColor2').addEventListener('input', e => { state.mouthColor2 = e.target.value; renderAll(); });
  $('#mouthColorMode').addEventListener('change', e => {
    state.mouthMode = e.target.value;
    const isGrad = state.mouthMode === 'gradient';
    $('#mouthColor2').style.display = isGrad ? 'inline-block' : 'none';
    $('#mouthGradDir').style.display = isGrad ? 'inline-block' : 'none';
    const mp2 = $('#mouthPresets2');
    if(mp2) mp2.style.display = isGrad ? 'flex' : 'none';
    renderAll();
  });
  $('#mouthGradDir').addEventListener('change', e => { state.mouthGradDir = e.target.value; renderAll(); });

  const eyeStateEl = $('#eyeState');
  if(eyeStateEl){
    eyeStateEl.value = state.eyeState || 'open';
    eyeStateEl.addEventListener('change', e => { state.eyeState = e.target.value; renderAll(); });
  }

  const mouthExprEl = $('#mouthExpression');
  if(mouthExprEl){
    mouthExprEl.value = state.mouthExpression || 'smile';
    mouthExprEl.addEventListener('change', e => { state.mouthExpression = e.target.value; renderAll(); });
  }

  // presets
  // load and render custom color presets
  loadCustomPresets();
  renderBodyPresets();
  renderItemBgPresets();
  // ensure second-row preset visibility matches current modes
  const showIfGrad = (modeSelId, presets2Id) => {
    const sel = $(modeSelId);
    const p2 = $(presets2Id);
    if(sel && p2) p2.style.display = (sel.value === 'gradient') ? 'flex' : 'none';
  };
  showIfGrad('#bodyColorMode','#bodyPresets2');
  showIfGrad('#eyeColorMode','#eyePresets2');
  showIfGrad('#mouthColorMode','#mouthPresets2');
  showIfGrad('#itemBgMode','#itemBgPresets2');

  // theme init is moved to settings; apply saved or default theme
  const savedTheme = localStorage.getItem('pet_theme') || DEFAULTS.theme;
  state.theme = savedTheme;
  document.body.classList.toggle('dark', savedTheme === 'dark');

  // custom preset controls
  $('#addCustomPreset').addEventListener('click', () => {
    const val = $('#newPresetColor').value;
    addCustomPreset(val);
  });
  $('#clearCustomPresets').addEventListener('click', () => {
    clearAllCustomPresets();
  });

  $('#addAccessory').addEventListener('click', addAccessorySlot);
  $('#addPattern').addEventListener('click', addPatternSlot);
  $('#toItems').addEventListener('click', () => showSection('itemsEditor'));

  // settings modal wiring
  const openBtn = $('#openSettings');
  const modal = $('#settingsModal');
  const closeBtn = $('#closeSettings');
  const saveBtn = $('#saveSettings');
  const resetBtn = $('#resetSettings');
  const patternLimitEl = $('#settingPatternLimit');
  const accessoryLimitEl = $('#settingAccessoryLimit');
  const heartEmojiEl = $('#settingHeartEmoji');
  const heartDelayEl = $('#settingHeartDelay');
  const heartDelayUnitEl = $('#settingHeartDelayUnit');
  const themeEl = $('#settingTheme');

  if(openBtn && modal){
    openBtn.addEventListener('click', () => {
      // populate with current state
      patternLimitEl.value = state.patternLimit || DEFAULTS.patternLimit;
      accessoryLimitEl.value = state.accessoryLimit || DEFAULTS.accessoryLimit;
      heartEmojiEl.value = state.heartEmoji || DEFAULTS.heartEmoji;
      heartDelayEl.value = (state.heartFloatDelay != null) ? state.heartFloatDelay : DEFAULTS.heartFloatDelay;
      heartDelayUnitEl.value = state.heartDelayUnit || DEFAULTS.heartDelayUnit || 'ms';
      themeEl.value = state.theme || DEFAULTS.theme;
      modal.classList.remove('hidden');
    });
  }
  if(closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  if(resetBtn) resetBtn.addEventListener('click', () => {
    patternLimitEl.value = DEFAULTS.patternLimit;
    accessoryLimitEl.value = DEFAULTS.accessoryLimit;
    heartEmojiEl.value = DEFAULTS.heartEmoji;
    heartDelayEl.value = DEFAULTS.heartFloatDelay;
    heartDelayUnitEl.value = DEFAULTS.heartDelayUnit || 'ms';
    themeEl.value = DEFAULTS.theme;
  });
  if(saveBtn){
    saveBtn.addEventListener('click', () => {
      const pl = Math.max(0, Math.min(10, parseInt(patternLimitEl.value||0)));
      const al = Math.max(0, Math.min(10, parseInt(accessoryLimitEl.value||0)));
      state.patternLimit = pl;
      state.accessoryLimit = al;
      state.heartEmoji = (heartEmojiEl.value && heartEmojiEl.value.trim()) ? heartEmojiEl.value.trim() : DEFAULTS.heartEmoji;
      // parse and store heart delay (number) and unit
      let dVal = parseFloat(heartDelayEl.value);
      if(isNaN(dVal) || dVal < 0) dVal = DEFAULTS.heartFloatDelay;
      state.heartFloatDelay = dVal;
      state.heartDelayUnit = (heartDelayUnitEl.value === 's') ? 's' : 'ms';
      state.theme = themeEl.value || DEFAULTS.theme;
      try{ localStorage.setItem('pet_theme', state.theme); }catch(e){}
      document.body.classList.toggle('dark', state.theme === 'dark');
      modal.classList.add('hidden');
      // enforce limits (trim arrays if needed)
      if(state.patterns.length > state.patternLimit) state.patterns = state.patterns.slice(0, state.patternLimit);
      if(state.accessories.length > state.accessoryLimit) state.accessories = state.accessories.slice(0, state.accessoryLimit);
      renderPatternSlots();
      renderAccessorySlots();
      renderAll();
    });
  }
  $('#backToCreator').addEventListener('click', () => showSection('creator'));
  $('#doneItems').addEventListener('click', () => showSection('playArea'));
  $('#resetCreator').addEventListener('click', resetCreator);
  $('#backToEditor').addEventListener('click', () => showSection('itemsEditor'));
  $('#startOver').addEventListener('click', fullReset);

  // item background color control + gradient
  $('#itemBg').addEventListener('input', e => { state.itemBg = e.target.value; });
  $('#itemBg2').addEventListener('input', e => { state.itemBg2 = e.target.value; });
  $('#itemBgMode').addEventListener('change', e => {
    state.itemBgMode = e.target.value;
    const isGrad = state.itemBgMode === 'gradient';
    $('#itemBg2').style.display = isGrad ? 'inline-block' : 'none';
    $('#itemBgGradDir').style.display = isGrad ? 'inline-block' : 'none';
    const ip2 = $('#itemBgPresets2');
    if(ip2) ip2.style.display = isGrad ? 'flex' : 'none';
  });
  $('#itemBgGradDir').addEventListener('change', e => { state.itemBgGradDir = e.target.value; });

  $('#addItem').addEventListener('click', () => {
    const emoji = $('#itemEmoji').value.trim() || '🎁';
    const anim = $('#itemAnim').value;
    // persist both solid or gradient data on the item
    const bg = state.itemBg || DEFAULTS.itemBg || '#ffffff';
    const bg2 = state.itemBg2 || DEFAULTS.itemBg2 || '#eeeeee';
    const bgMode = state.itemBgMode || DEFAULTS.itemBgMode || 'solid';
    const bgGradDir = state.itemBgGradDir || '|';
    state.items.push({emoji, anim, bgColor: bg, bgColor2: bg2, bgMode, bgGradDir});
    $('#itemEmoji').value = '';
    renderItemsList();
    renderPlayItems();
  });

  renderPatternSlots();
  renderAccessorySlots();
  renderAll();
  renderItemsList();
  renderPlayItems();
  renderItemBgPresets();
  setupDragDrop();
}

function renderBodyPresets(){
  const wrap = $('#bodyPresets');
  const wrap2 = $('#bodyPresets2'); // for gradient second color
  wrap.innerHTML = '';
  if(wrap2) wrap2.innerHTML = '';

  // helper to create a visible preset button (with optional delete for custom)
  const makePresetEl = (c, isCustom, targetIsSecond) => {
    const holder = document.createElement('div');
    holder.style.position = 'relative';
    holder.style.display = 'inline-block';
    holder.style.marginRight = '6px';

    const b = document.createElement('button');
    b.className = 'smallBtn';
    b.style.background = c;
    b.style.border = '1px solid rgba(0,0,0,0.08)';
    b.style.width = '28px';
    b.style.height = '28px';
    b.title = c;
    b.addEventListener('click', () => {
      if(targetIsSecond){
        state.bodyColor2 = c; $('#bodyColor2').value = c;
      } else {
        state.bodyColor = c; $('#bodyColor').value = c;
      }
      renderAll();
    });
    holder.appendChild(b);

    if(isCustom){
      const del = document.createElement('button');
      del.textContent = '×';
      del.title = 'Remove preset';
      del.style.position = 'absolute';
      del.style.right = '-6px';
      del.style.top = '-6px';
      del.style.width = '14px';
      del.style.height = '14px';
      del.style.padding = '0';
      del.style.borderRadius = '50%';
      del.style.border = '1px solid rgba(0,0,0,0.08)';
      del.style.background = '#fff';
      del.style.fontSize = '10px';
      del.style.lineHeight = '12px';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = customPresets.indexOf(c);
        if(idx >= 0){
          customPresets.splice(idx,1);
          saveCustomPresets();
          renderBodyPresets();
          renderEyePresets();
          renderMouthPresets();
          renderItemBgPresets();
          renderAccessorySlots();
          renderPatternSlots();
        }
      });
      holder.appendChild(del);
    }

    return holder;
  };

  PRESET_COLORS.forEach(c => {
    wrap.appendChild(makePresetEl(c, false, false));
    if(wrap2) wrap2.appendChild(makePresetEl(c, false, true));
  });
  customPresets.forEach(c => {
    wrap.appendChild(makePresetEl(c, true, false));
    if(wrap2) wrap2.appendChild(makePresetEl(c, true, true));
  });

  // also render eye & mouth presets on init
  renderEyePresets();
  renderMouthPresets();
}

 // eye presets
 function renderEyePresets(){
   const wrap = $('#eyePresets');
   const wrap2 = $('#eyePresets2');
   if(!wrap) return;
   wrap.innerHTML = '';
   if(wrap2) wrap2.innerHTML = '';

   const makePresetEl = (c, isCustom, targetIsSecond) => {
     const holder = document.createElement('div');
     holder.style.position = 'relative';
     holder.style.display = 'inline-block';
     holder.style.marginRight = '6px';

     const b = document.createElement('button');
     b.className = 'smallBtn';
     b.style.background = c;
     b.style.border = '1px solid rgba(0,0,0,0.08)';
     b.style.width = '24px';
     b.style.height = '24px';
     b.title = c;
     b.addEventListener('click', () => {
       if(targetIsSecond){
         state.eyeColor2 = c; $('#eyeColor2').value = c;
       } else {
         state.eyeColor = c; $('#eyeColor').value = c;
       }
       renderAll();
     });
     holder.appendChild(b);

     if(isCustom){
       const del = document.createElement('button');
       del.textContent = '×';
       del.title = 'Remove preset';
       del.style.position = 'absolute';
       del.style.right = '-6px';
       del.style.top = '-6px';
       del.style.width = '16px';
       del.style.height = '16px';
       del.style.padding = '0';
       del.style.borderRadius = '50%';
       del.style.border = '1px solid rgba(0,0,0,0.08)';
       del.style.background = '#fff';
       del.style.fontSize = '10px';
       del.addEventListener('click', (ev) => {
         ev.stopPropagation();
         const idx = customPresets.indexOf(c);
         if(idx >= 0){
           customPresets.splice(idx,1);
           saveCustomPresets();
           renderBodyPresets();
           renderEyePresets();
           renderMouthPresets();
           renderItemBgPresets();
           renderAccessorySlots();
           renderPatternSlots();
         }
       });
       holder.appendChild(del);
     }
     return holder;
   };

   getAllPresets().forEach(c => {
     wrap.appendChild(makePresetEl(c, customPresets.includes(c), false));
     if(wrap2) wrap2.appendChild(makePresetEl(c, customPresets.includes(c), true));
   });
 }

 // item background presets
 function renderItemBgPresets(){
   const wrap = $('#itemBgPresets');
   const wrap2 = $('#itemBgPresets2');
   if(!wrap) return;
   wrap.innerHTML = '';
   if(wrap2) wrap2.innerHTML = '';

   const makePresetEl = (c, isCustom, targetIsSecond) => {
     const holder = document.createElement('div');
     holder.style.position = 'relative';
     holder.style.display = 'inline-block';
     holder.style.marginRight = '6px';

     const b = document.createElement('button');
     b.className = 'smallBtn';
     b.style.background = c;
     b.style.border = '1px solid rgba(0,0,0,0.08)';
     b.style.width = '24px';
     b.style.height = '24px';
     b.title = c;
     b.addEventListener('click', () => {
       if(targetIsSecond){
         state.itemBg2 = c; $('#itemBg2').value = c;
       } else {
         state.itemBg = c; $('#itemBg').value = c;
       }
     });
     holder.appendChild(b);

     if(isCustom){
       const del = document.createElement('button');
       del.textContent = '×';
       del.title = 'Remove preset';
       del.style.position = 'absolute';
       del.style.right = '-6px';
       del.style.top = '-6px';
       del.style.width = '16px';
       del.style.height = '16px';
       del.style.padding = '0';
       del.style.borderRadius = '50%';
       del.style.border = '1px solid rgba(0,0,0,0.08)';
       del.style.background = '#fff';
       del.style.fontSize = '10px';
       del.addEventListener('click', (ev) => {
         ev.stopPropagation();
         const idx = customPresets.indexOf(c);
         if(idx >= 0){
           customPresets.splice(idx,1);
           saveCustomPresets();
           renderBodyPresets();
           renderEyePresets();
           renderMouthPresets();
           renderItemBgPresets();
           renderAccessorySlots();
           renderPatternSlots();
         }
       });
       holder.appendChild(del);
     }
     return holder;
   };

   getAllPresets().forEach(c => {
     wrap.appendChild(makePresetEl(c, customPresets.includes(c), false));
     if(wrap2) wrap2.appendChild(makePresetEl(c, customPresets.includes(c), true));
   });
 }

 // mouth presets
 function renderMouthPresets(){
   const wrap = $('#mouthPresets');
   const wrap2 = $('#mouthPresets2');
   if(!wrap) return;
   wrap.innerHTML = '';
   if(wrap2) wrap2.innerHTML = '';

   const makePresetEl = (c, isCustom, targetIsSecond) => {
     const holder = document.createElement('div');
     holder.style.position = 'relative';
     holder.style.display = 'inline-block';
     holder.style.marginRight = '6px';

     const b = document.createElement('button');
     b.className = 'smallBtn';
     b.style.background = c;
     b.style.border = '1px solid rgba(0,0,0,0.08)';
     b.style.width = '24px';
     b.style.height = '24px';
     b.title = c;
     b.addEventListener('click', () => {
       if(targetIsSecond){
         state.mouthColor2 = c; $('#mouthColor2').value = c;
       } else {
         state.mouthColor = c; $('#mouthColor').value = c;
       }
       renderAll();
     });
     holder.appendChild(b);

     if(isCustom){
       const del = document.createElement('button');
       del.textContent = '×';
       del.title = 'Remove preset';
       del.style.position = 'absolute';
       del.style.right = '-6px';
       del.style.top = '-6px';
       del.style.width = '16px';
       del.style.height = '16px';
       del.style.padding = '0';
       del.style.borderRadius = '50%';
       del.style.border = '1px solid rgba(0,0,0,0.08)';
       del.style.background = '#fff';
       del.style.fontSize = '10px';
       del.addEventListener('click', (ev) => {
         ev.stopPropagation();
         const idx = customPresets.indexOf(c);
         if(idx >= 0){
           customPresets.splice(idx,1);
           saveCustomPresets();
           renderBodyPresets();
           renderEyePresets();
           renderMouthPresets();
           renderItemBgPresets();
           renderAccessorySlots();
           renderPatternSlots();
         }
       });
       holder.appendChild(del);
     }
     return holder;
   };

   getAllPresets().forEach(c => {
     wrap.appendChild(makePresetEl(c, customPresets.includes(c), false));
     if(wrap2) wrap2.appendChild(makePresetEl(c, customPresets.includes(c), true));
   });
 }

function showSection(id){
  ['creator','itemsEditor','playArea'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
  // render corresponding preview into SVGs to ensure fresh
  renderAll();
  renderItemsList();
  renderPlayItems();
}

function resetCreator(){
  state.bodyColor = DEFAULTS.bodyColor;
  state.eyeColor = DEFAULTS.eyeColor;
  state.mouthColor = DEFAULTS.mouthColor;
  state.eyeState = DEFAULTS.eyeState;
  state.mouthExpression = DEFAULTS.mouthExpression;
  state.accessories = [];
  state.patterns = [];
  renderPatternSlots();
  renderAccessorySlots();
  renderAll();
}

function fullReset(){
  state = {
    bodyColor: DEFAULTS.bodyColor,
    eyeColor: DEFAULTS.eyeColor,
    mouthColor: DEFAULTS.mouthColor,
    eyeState: DEFAULTS.eyeState,
    mouthExpression: DEFAULTS.mouthExpression,
    accessories: [],
    patterns: [],
    items: []
  };
  renderPatternSlots();
  renderAccessorySlots();
  renderItemsList();
  renderPlayItems();
  renderAll();
  showSection('creator');
}

function addAccessorySlot(){
  const limit = (state.accessoryLimit != null) ? state.accessoryLimit : DEFAULTS.accessoryLimit;
  if(state.accessories.length >= limit) return;
  state.accessories.push({type:accessoryTypes[0].id, color:'#ccb6ff'});
  renderAccessorySlots();
  renderAll();
}

function addPatternSlot(){
  const limit = (state.patternLimit != null) ? state.patternLimit : DEFAULTS.patternLimit;
  if(state.patterns.length >= limit) return;
  state.patterns.push({type:patternTypes[0].id, color:'#ffffff'});
  renderPatternSlots();
  renderAll();
}

function renderAccessorySlots(){
  const container = $('#accessorySlots');
  container.innerHTML = '';
  state.accessories.forEach((acc, idx) => {
    const row = document.createElement('div');
    row.className = 'accessorySlot';

    const sel = document.createElement('select');
    sel.className = 'select';
    accessoryTypes.forEach(t => {
      const o = document.createElement('option'); o.value = t.id; o.textContent = t.name;
      if(t.id === acc.type) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', e => { acc.type = e.target.value; renderAll(); });

    const colorWrap = document.createElement('div');
    colorWrap.style.display = 'flex';
    colorWrap.style.gap = '6px';
    colorWrap.style.alignItems = 'center';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = acc.color;
    color.className = 'colorPick';
    color.addEventListener('input', e => { acc.color = e.target.value; renderAll(); });

    // small presets for accessory color
    const presets = document.createElement('div');
    presets.style.display = 'flex';
    presets.style.gap = '6px';
    presets.style.marginLeft = '4px';
    getAllPresets().forEach(c => {
      const holder = document.createElement('div');
      holder.style.display = 'inline-block';
      holder.style.position = 'relative';
      holder.style.marginRight = '6px';

      const b = document.createElement('button');
      b.className = 'smallBtn';
      b.style.width = '20px';
      b.style.height = '20px';
      b.style.padding = '0';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => { acc.color = c; color.value = c; renderAll(); });
      holder.appendChild(b);

      if(customPresets.includes(c)){
        const del = document.createElement('button');
        del.textContent = '×';
        del.title = 'Remove preset';
        del.style.position = 'absolute';
        del.style.right = '-6px';
        del.style.top = '-6px';
        del.style.width = '14px';
        del.style.height = '14px';
        del.style.padding = '0';
        del.style.borderRadius = '50%';
        del.style.border = '1px solid rgba(0,0,0,0.08)';
        del.style.background = '#fff';
        del.style.fontSize = '10px';
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const idx = customPresets.indexOf(c);
          if(idx >= 0){
            customPresets.splice(idx,1);
            saveCustomPresets();
            renderBodyPresets();
            renderEyePresets();
            renderMouthPresets();
            renderItemBgPresets();
            renderAccessorySlots();
            renderPatternSlots();
          }
        });
        holder.appendChild(del);
      }

      presets.appendChild(holder);
    });

    const rem = document.createElement('button');
    rem.className = 'removeAcc smallBtn';
    rem.textContent = 'Remove';
    rem.addEventListener('click', () => {
      state.accessories.splice(idx,1);
      renderAccessorySlots();
      renderAll();
    });

    colorWrap.appendChild(color);
    colorWrap.appendChild(presets);

    row.appendChild(sel);
    row.appendChild(colorWrap);
    row.appendChild(rem);
    container.appendChild(row);
  });

  if(state.accessories.length === 0){
    const hint = document.createElement('div');
    hint.style.color = '#666';
    hint.style.fontSize = '13px';
    hint.textContent = 'No accessories yet';
    container.appendChild(hint);
  }
  // disable add according to configured accessory limit
  $('#addAccessory').disabled = state.accessories.length >= ((state.accessoryLimit != null) ? state.accessoryLimit : DEFAULTS.accessoryLimit);
}

function renderPatternSlots(){
  const container = $('#patternSlots');
  container.innerHTML = '';
  state.patterns.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'accessorySlot';

    const sel = document.createElement('select');
    sel.className = 'select';
    patternTypes.forEach(t => {
      const o = document.createElement('option'); o.value = t.id; o.textContent = t.name;
      if(t.id === p.type) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', e => { p.type = e.target.value; renderAll(); });

    const colorWrap = document.createElement('div');
    colorWrap.style.display = 'flex';
    colorWrap.style.gap = '6px';
    colorWrap.style.alignItems = 'center';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = p.color;
    color.className = 'colorPick';
    color.addEventListener('input', e => { p.color = e.target.value; renderAll(); });

    // small presets for pattern color
    const presets = document.createElement('div');
    presets.style.display = 'flex';
    presets.style.gap = '6px';
    getAllPresets().forEach(c => {
      const holder = document.createElement('div');
      holder.style.display = 'inline-block';
      holder.style.position = 'relative';
      holder.style.marginRight = '6px';

      const b = document.createElement('button');
      b.className = 'smallBtn';
      b.style.width = '20px';
      b.style.height = '20px';
      b.style.padding = '0';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => { p.color = c; color.value = c; renderAll(); });
      holder.appendChild(b);

      if(customPresets.includes(c)){
        const del = document.createElement('button');
        del.textContent = '×';
        del.title = 'Remove preset';
        del.style.position = 'absolute';
        del.style.right = '-6px';
        del.style.top = '-6px';
        del.style.width = '14px';
        del.style.height = '14px';
        del.style.padding = '0';
        del.style.borderRadius = '50%';
        del.style.border = '1px solid rgba(0,0,0,0.08)';
        del.style.background = '#fff';
        del.style.fontSize = '10px';
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const idx = customPresets.indexOf(c);
          if(idx >= 0){
            customPresets.splice(idx,1);
            saveCustomPresets();
            renderBodyPresets();
            renderEyePresets();
            renderMouthPresets();
            renderItemBgPresets();
            renderAccessorySlots();
            renderPatternSlots();
          }
        });
        holder.appendChild(del);
      }

      presets.appendChild(holder);
    });

    const rem = document.createElement('button');
    rem.className = 'removeAcc smallBtn';
    rem.textContent = 'Remove';
    rem.addEventListener('click', () => {
      state.patterns.splice(idx,1);
      renderPatternSlots();
      renderAll();
    });

    colorWrap.appendChild(color);
    colorWrap.appendChild(presets);

    row.appendChild(sel);
    row.appendChild(colorWrap);
    row.appendChild(rem);
    container.appendChild(row);
  });

  if(state.patterns.length === 0){
    const hint = document.createElement('div');
    hint.style.color = '#666';
    hint.style.fontSize = '13px';
    hint.textContent = 'No patterns yet';
    container.appendChild(hint);
  }
  $('#addPattern').disabled = state.patterns.length >= ((state.patternLimit != null) ? state.patternLimit : DEFAULTS.patternLimit);
}

function renderAll(){
  renderPetSVG($('#petSVG'), state);
  renderPetSVG($('#petSVG_items'), state);
  renderPetSVG($('#petSVG_play'), state);
}

function renderPetSVG(svgEl, st){
  // Clear
  while(svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const NS = 'http://www.w3.org/2000/svg';

  // defs for animations
  const defs = document.createElementNS(NS,'defs');
  svgEl.appendChild(defs);

  // body (support solid or gradient)
  const body = document.createElementNS(NS,'circle');
  body.setAttribute('cx',0);
  body.setAttribute('cy',0);
  body.setAttribute('r',80);
  body.setAttribute('id','petBody');
  if(st.bodyMode === 'gradient'){
    const gid = 'gradBody';
    // create gradient in defs (per-svg)
    const lg = document.createElementNS(NS,'linearGradient');
    lg.setAttribute('id', gid);
    const dir = st.bodyGradDir || '|';
    // map dir to x1,y1 x2,y2
    if(dir === '|'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
    else if(dir === '_'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','0'); lg.setAttribute('y2','1'); }
    else if(dir === '\\'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1'); }
    else if(dir === '/'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','1'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
    const s1 = document.createElementNS(NS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', st.bodyColor || DEFAULTS.bodyColor);
    const s2 = document.createElementNS(NS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', st.bodyColor2 || DEFAULTS.bodyColor2);
    lg.appendChild(s1); lg.appendChild(s2);
    defs.appendChild(lg);
    body.setAttribute('fill', `url(#${gid})`);
  } else {
    body.setAttribute('fill', st.bodyColor || DEFAULTS.bodyColor);
  }
  svgEl.appendChild(body);

  // patterns (render behind facial features but above body)
  st.patterns.forEach(p => {
    drawPattern(svgEl, p);
  });

  // eyes (open or closed states) - support gradient fill if selected
  const applyEyeFill = (shapeEl) => {
    if(st.eyeMode === 'gradient'){
      const gid = 'gradEye';
      const lg = document.createElementNS(NS,'linearGradient');
      lg.setAttribute('id', gid);
      const dir = st.eyeGradDir || '|';
      if(dir === '|'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
      else if(dir === '_'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','0'); lg.setAttribute('y2','1'); }
      else if(dir === '\\'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1'); }
      else if(dir === '/'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','1'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
      const s1 = document.createElementNS(NS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', st.eyeColor || DEFAULTS.eyeColor);
      const s2 = document.createElementNS(NS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', st.eyeColor2 || DEFAULTS.eyeColor2);
      lg.appendChild(s1); lg.appendChild(s2);
      defs.appendChild(lg);
      shapeEl.setAttribute('fill', `url(#${gid})`);
    } else {
      shapeEl.setAttribute('fill', st.eyeColor || DEFAULTS.eyeColor);
    }
  };

  if(!st.eyeState || st.eyeState === 'open'){
    const leftEye = document.createElementNS(NS,'circle');
    leftEye.setAttribute('cx', -28);
    leftEye.setAttribute('cy', -10);
    leftEye.setAttribute('r',10);
    applyEyeFill(leftEye);
    svgEl.appendChild(leftEye);

    const rightEye = document.createElementNS(NS,'circle');
    rightEye.setAttribute('cx', 28);
    rightEye.setAttribute('cy', -10);
    rightEye.setAttribute('r',10);
    applyEyeFill(rightEye);
    svgEl.appendChild(rightEye);
  } else {
    // draw closed-eye strokes for the closed sides
    const makeClosed = (cx, cy, flip)=> {
      const p = document.createElementNS(NS,'path');
      // gentle arc line for a closed eye
      const d = `M ${cx-12} ${cy} q 12 ${flip?8:8} 24 0`;
      p.setAttribute('d', d);
      p.setAttribute('stroke', st.eyeColor);
      p.setAttribute('stroke-width', 6);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap','round');
      svgEl.appendChild(p);
    };
    if(st.eyeState === 'leftClosed' || st.eyeState === 'bothClosed'){
      makeClosed(-28, -6, false);
    } else {
      const leftEye = document.createElementNS(NS,'circle');
      leftEye.setAttribute('cx', -28);
      leftEye.setAttribute('cy', -10);
      leftEye.setAttribute('r',10);
      applyEyeFill(leftEye);
      svgEl.appendChild(leftEye);
    }

    if(st.eyeState === 'rightClosed' || st.eyeState === 'bothClosed'){
      makeClosed(28, -6, true);
    } else {
      const rightEye = document.createElementNS(NS,'circle');
      rightEye.setAttribute('cx', 28);
      rightEye.setAttribute('cy', -10);
      rightEye.setAttribute('r',10);
      applyEyeFill(rightEye);
      svgEl.appendChild(rightEye);
    }
  }

  // mouth (various expressions)
  switch((st.mouthExpression || 'smile')){
    case 'smile': {
      const mouth = document.createElementNS(NS,'path');
      mouth.setAttribute('d','M -28 20 Q 0 36 28 20');
      mouth.setAttribute('stroke-width',6);
      mouth.setAttribute('fill','none');
      mouth.setAttribute('stroke-linecap','round');
      // support gradient stroke or solid
      if(st.mouthMode === 'gradient'){
        const gid = 'gradMouth';
        const lg = document.createElementNS(NS,'linearGradient');
        lg.setAttribute('id', gid);
        const dir = st.mouthGradDir || '|';
        if(dir === '|'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','0'); lg.setAttribute('y2','1'); }
        else if(dir === '_'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        else if(dir === '\\'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1'); }
        else if(dir === '/'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','1'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        const s1 = document.createElementNS(NS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', st.mouthColor || DEFAULTS.mouthColor);
        const s2 = document.createElementNS(NS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', st.mouthColor2 || DEFAULTS.mouthColor2);
        lg.appendChild(s1); lg.appendChild(s2);
        defs.appendChild(lg);
        mouth.setAttribute('stroke', `url(#${gid})`);
      } else {
        mouth.setAttribute('stroke', st.mouthColor || DEFAULTS.mouthColor);
      }
      svgEl.appendChild(mouth);
      break;
    }
    case 'neutral': {
      const mouth = document.createElementNS(NS,'line');
      mouth.setAttribute('x1', -22); mouth.setAttribute('y1', 26);
      mouth.setAttribute('x2', 22); mouth.setAttribute('y2', 26);
      mouth.setAttribute('stroke-width',6);
      mouth.setAttribute('stroke-linecap','round');
      if(st.mouthMode === 'gradient'){
        const gid = 'gradMouth';
        const lg = document.createElementNS(NS,'linearGradient');
        lg.setAttribute('id', gid);
        const dir = st.mouthGradDir || '|';
        if(dir === '|'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','0'); lg.setAttribute('y2','1'); }
        else if(dir === '_'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        else if(dir === '\\'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1'); }
        else if(dir === '/'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','1'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        const s1 = document.createElementNS(NS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', st.mouthColor || DEFAULTS.mouthColor);
        const s2 = document.createElementNS(NS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', st.mouthColor2 || DEFAULTS.mouthColor2);
        lg.appendChild(s1); lg.appendChild(s2);
        defs.appendChild(lg);
        mouth.setAttribute('stroke', `url(#${gid})`);
      } else {
        mouth.setAttribute('stroke', st.mouthColor || DEFAULTS.mouthColor);
      }
      svgEl.appendChild(mouth);
      break;
    }
    case 'frown': {
      const mouth = document.createElementNS(NS,'path');
      mouth.setAttribute('d','M -28 30 Q 0 12 28 30');
      mouth.setAttribute('stroke-width',6);
      mouth.setAttribute('fill','none');
      mouth.setAttribute('stroke-linecap','round');
      if(st.mouthMode === 'gradient'){
        const gid = 'gradMouth';
        const lg = document.createElementNS(NS,'linearGradient');
        lg.setAttribute('id', gid);
        const dir = st.mouthGradDir || '|';
        if(dir === '|'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','0'); lg.setAttribute('y2','1'); }
        else if(dir === '_'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        else if(dir === '\\'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1'); }
        else if(dir === '/'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','1'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        const s1 = document.createElementNS(NS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', st.mouthColor || DEFAULTS.mouthColor);
        const s2 = document.createElementNS(NS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', st.mouthColor2 || DEFAULTS.mouthColor2);
        lg.appendChild(s1); lg.appendChild(s2);
        defs.appendChild(lg);
        mouth.setAttribute('stroke', `url(#${gid})`);
      } else {
        mouth.setAttribute('stroke', st.mouthColor || DEFAULTS.mouthColor);
      }
      svgEl.appendChild(mouth);
      break;
    }
    case 'open': {
      const om = document.createElementNS(NS,'ellipse');
      om.setAttribute('cx', 0);
      om.setAttribute('cy', 26);
      om.setAttribute('rx', 12);
      om.setAttribute('ry', 14);
      // fill can be gradient or solid
      if(st.mouthMode === 'gradient'){
        const gid = 'gradMouth';
        const lg = document.createElementNS(NS,'linearGradient');
        lg.setAttribute('id', gid);
        const dir = st.mouthGradDir || '|';
        if(dir === '|'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','0'); lg.setAttribute('y2','1'); }
        else if(dir === '_'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        else if(dir === '\\'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1'); }
        else if(dir === '/'){ lg.setAttribute('x1','0'); lg.setAttribute('y1','1'); lg.setAttribute('x2','1'); lg.setAttribute('y2','0'); }
        const s1 = document.createElementNS(NS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', st.mouthColor || DEFAULTS.mouthColor);
        const s2 = document.createElementNS(NS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', st.mouthColor2 || DEFAULTS.mouthColor2);
        lg.appendChild(s1); lg.appendChild(s2);
        defs.appendChild(lg);
        om.setAttribute('fill', `url(#${gid})`);
      } else {
        om.setAttribute('fill', st.mouthColor);
      }
      svgEl.appendChild(om);
      break;
    }
    default: {
      const mouth = document.createElementNS(NS,'path');
      mouth.setAttribute('d','M -28 20 Q 0 36 28 20');
      mouth.setAttribute('stroke', st.mouthColor);
      mouth.setAttribute('stroke-width',6);
      mouth.setAttribute('fill','none');
      mouth.setAttribute('stroke-linecap','round');
      svgEl.appendChild(mouth);
    }
  }

  // accessories render
  st.accessories.forEach(acc => {
    drawAccessory(svgEl, acc);
  });

  // wrap group for animations (apply transform origins if needed)
  // Ensure pet has an id element to target when animating in play mode
  svgEl.setAttribute('data-outline','pet');

  // item background presets: when items are created we still store simple bg color;
  // gradient item backgrounds are not persisted in items list in this change (keeps complexity lower)

  // add transparent hit circle for drag drop ease
  const hit = document.createElementNS(NS,'circle');
  hit.setAttribute('cx',0); hit.setAttribute('cy',0); hit.setAttribute('r',95); hit.setAttribute('fill','transparent'); hit.setAttribute('id','petHit');
  svgEl.appendChild(hit);
}

function drawPattern(svgEl, p){
  const NS = 'http://www.w3.org/2000/svg';
  switch(p.type){
    case 'leftSpot': {
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx', -30); c.setAttribute('cy', -8); c.setAttribute('r',34);
      c.setAttribute('fill', p.color);
      svgEl.appendChild(c);
      break;
    }
    case 'rightSpot': {
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx', 30); c.setAttribute('cy', -8); c.setAttribute('r',34);
      c.setAttribute('fill', p.color);
      svgEl.appendChild(c);
      break;
    }
    case 'stripes': {
      // three equal straight lines: left, center, right (same size)
      const lineLeft = document.createElementNS(NS,'line'); lineLeft.setAttribute('x1', -36); lineLeft.setAttribute('y1', -72); lineLeft.setAttribute('x2', -36); lineLeft.setAttribute('y2', -40);
      const lineMid = document.createElementNS(NS,'line'); lineMid.setAttribute('x1', 0); lineMid.setAttribute('y1', -72); lineMid.setAttribute('x2', 0); lineMid.setAttribute('y2', -40);
      const lineRight = document.createElementNS(NS,'line'); lineRight.setAttribute('x1', 36); lineRight.setAttribute('y1', -72); lineRight.setAttribute('x2', 36); lineRight.setAttribute('y2', -40);
      [lineLeft, lineMid, lineRight].forEach(l => {
        l.setAttribute('stroke', p.color);
        l.setAttribute('stroke-width', 8);
        l.setAttribute('stroke-linecap', 'round');
        svgEl.appendChild(l);
      });
      break;
    }
    case 'mouthSpot': {
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx', 0); c.setAttribute('cy', 26); c.setAttribute('r',24);
      c.setAttribute('fill', p.color);
      svgEl.appendChild(c);
      break;
    }
    case 'faceSpot': {
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx', 0); c.setAttribute('cy', 0); c.setAttribute('r',64);
      c.setAttribute('fill', p.color);
      svgEl.appendChild(c);
      break;
    }
    default: break;
  }
}

function drawAccessory(svgEl, acc){
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS,'g');
  g.setAttribute('fill', acc.color);
  g.setAttribute('stroke','none');

  switch(acc.type){
    case 'triangleEars': {
      // taller, narrower ears with the point upward
      const le = document.createElementNS(NS,'polygon');
      le.setAttribute('points','-50 -100 -70 -40 -30 -40');
      const re = document.createElementNS(NS,'polygon');
      re.setAttribute('points','50 -100 70 -40 30 -40');
      g.appendChild(le); g.appendChild(re);
      break;
    }
    case 'circleEars': {
      // moved closer to the head and slightly smaller to sit against the body
      const le = document.createElementNS(NS,'circle'); le.setAttribute('cx',-60); le.setAttribute('cy',-60); le.setAttribute('r',18);
      const re = document.createElementNS(NS,'circle'); re.setAttribute('cx',60); re.setAttribute('cy',-60); re.setAttribute('r',18);
      g.appendChild(le); g.appendChild(re);
      break;
    }
    case 'horn1': {
      const h = document.createElementNS(NS,'polygon'); h.setAttribute('points','0 -105 -12 -60 12 -60'); g.appendChild(h);
      break;
    }
    case 'horn2': {
      // horns moved closer together (tighter x positions)
      const l = document.createElementNS(NS,'polygon'); l.setAttribute('points','-38 -86 -54 -60 -26 -60');
      const r = document.createElementNS(NS,'polygon'); r.setAttribute('points','38 -86 26 -60 54 -60');
      g.appendChild(l); g.appendChild(r);
      break;
    }
    case 'horn3': {
      const c = document.createElementNS(NS,'polygon'); c.setAttribute('points','0 -110 -10 -70 10 -70');
      // outer horns tightened toward center for a closer cluster
      const l = document.createElementNS(NS,'polygon'); l.setAttribute('points','-40 -88 -54 -60 -26 -60');
      const r = document.createElementNS(NS,'polygon'); r.setAttribute('points','40 -88 26 -60 54 -60');
      g.appendChild(c); g.appendChild(l); g.appendChild(r);
      break;
    }
    case 'nose': {
      const n = document.createElementNS(NS,'circle'); n.setAttribute('cx',0); n.setAttribute('cy',8); n.setAttribute('r',6); g.appendChild(n);
      break;
    }
    case 'tailThin': {
      // moved closer to the body: start x reduced and control deltas tightened
      const t = document.createElementNS(NS,'path');
      t.setAttribute('d','M 68 36 q 28 8 48 34');
      t.setAttribute('fill','none');
      t.setAttribute('stroke',acc.color);
      t.setAttribute('stroke-width',6);
      t.setAttribute('stroke-linecap','round');
      svgEl.appendChild(t);
      return;
    }
    case 'tailThick': {
      // thicker tail moved closer: start x reduced and curves adjusted for tighter attachment
      const t = document.createElementNS(NS,'path');
      t.setAttribute('d','M 68 34 q 40 10 56 36 q -5 7 -10 9 q -30 -30 -50 -38');
      t.setAttribute('fill',acc.color);
      svgEl.appendChild(t);
      return;
    }
    case 'ant1': {
      const a = document.createElementNS(NS,'path'); a.setAttribute('d','M 0 -80 q -6 -30 -20 -44'); a.setAttribute('fill','none'); a.setAttribute('stroke',acc.color); a.setAttribute('stroke-width',6); a.setAttribute('stroke-linecap','round');
      const k = document.createElementNS(NS,'circle'); k.setAttribute('cx',-20); k.setAttribute('cy',-124); k.setAttribute('r',6); k.setAttribute('fill',acc.color);
      svgEl.appendChild(a); svgEl.appendChild(k); return;
    }
    case 'ant2': {
      // two antenna paths with tip circles positioned at the actual path ends so they touch
      const a1 = document.createElementNS(NS,'path'); a1.setAttribute('d','M -18 -76 q -16 -28 -36 -34'); a1.setAttribute('fill','none'); a1.setAttribute('stroke',acc.color); a1.setAttribute('stroke-width',5); a1.setAttribute('stroke-linecap','round');
      const a2 = document.createElementNS(NS,'path'); a2.setAttribute('d','M 18 -76 q 16 -28 36 -34'); a2.setAttribute('fill','none'); a2.setAttribute('stroke',acc.color); a2.setAttribute('stroke-width',5); a2.setAttribute('stroke-linecap','round');
      // endpoints based on the path control deltas: (-18-36, -76-34) and (18+36, -76-34)
      const k1 = document.createElementNS(NS,'circle'); k1.setAttribute('cx',-54); k1.setAttribute('cy',-110); k1.setAttribute('r',5); k1.setAttribute('fill',acc.color);
      const k2 = document.createElementNS(NS,'circle'); k2.setAttribute('cx',54); k2.setAttribute('cy',-110); k2.setAttribute('r',5); k2.setAttribute('fill',acc.color);
      svgEl.appendChild(a1); svgEl.appendChild(a2); svgEl.appendChild(k1); svgEl.appendChild(k2); return;
    }
    case 'wings': {
      // wing-like shapes moved a bit outward and reshaped for a clearer wing silhouette
      const lw = document.createElementNS(NS,'path');
      lw.setAttribute('d','M -70 -10 q -48 -36 -80 -10 q 32 40 64 52 q 8 -12 16 -22 z');
      lw.setAttribute('fill', acc.color);
      const rw = document.createElementNS(NS,'path');
      rw.setAttribute('d','M 70 -10 q 48 -36 80 -10 q -32 40 -64 52 q -8 -12 -16 -22 z');
      rw.setAttribute('fill', acc.color);
      svgEl.appendChild(lw);
      svgEl.appendChild(rw);
      return;
    }
    case 'longEars': {
      // very long oval ears positioned higher and closer to the head so they align with the top of the body
      const le = document.createElementNS(NS,'ellipse');
      le.setAttribute('cx', -46);
      le.setAttribute('cy', -92); // raised further up towards the top of head
      le.setAttribute('rx', 12);
      le.setAttribute('ry', 62); // slightly longer
      le.setAttribute('transform', 'rotate(-12 -46 -92)');
      le.setAttribute('fill', acc.color);

      const re = document.createElementNS(NS,'ellipse');
      re.setAttribute('cx', 46);
      re.setAttribute('cy', -92); // raised further up towards the top of head
      re.setAttribute('rx', 12);
      re.setAttribute('ry', 62); // slightly longer
      re.setAttribute('transform', 'rotate(12 46 -92)');
      re.setAttribute('fill', acc.color);

      svgEl.appendChild(le);
      svgEl.appendChild(re);
      return;
    }
    case 'tailCircle': {
      // circle tail: larger puff placed closer to the body for better visual attachment
      const base = document.createElementNS(NS,'circle');
      base.setAttribute('cx', 84); // moved closer to body
      base.setAttribute('cy', 34); // moved upward toward body
      base.setAttribute('r', 18);  // larger
      base.setAttribute('fill', acc.color);
      const inner = document.createElementNS(NS,'circle');
      inner.setAttribute('cx', 88);
      inner.setAttribute('cy', 30);
      inner.setAttribute('r', 7);
      inner.setAttribute('fill', 'rgba(255,255,255,0.12)');

      svgEl.appendChild(base);
      svgEl.appendChild(inner);
      return;
    }
    case 'cloud': {
      // cluster of soft circles underneath the pet to look like a cloud base
      // positions chosen to sit at the bottom of the body (y ~ 62..84)
      const circles = [
        {cx:-54, cy:72, r:18},
        {cx:-28, cy:80, r:22},
        {cx:0, cy:84, r:26},
        {cx:30, cy:78, r:20},
        {cx:56, cy:70, r:16},
        // a few small front puffs for depth
        {cx:-10, cy:66, r:12},
        {cx:28, cy:68, r:10}
      ];
      circles.forEach((c,i) => {
        const circ = document.createElementNS(NS,'circle');
        circ.setAttribute('cx', c.cx);
        circ.setAttribute('cy', c.cy);
        circ.setAttribute('r', c.r);
        // slightly layered: lighter inner highlights for some circles
        if(i === 2 || i === 1){
          circ.setAttribute('fill', acc.color);
        } else {
          circ.setAttribute('fill', acc.color);
        }
        svgEl.appendChild(circ);
      });
      // subtle inner shine
      const shine = document.createElementNS(NS,'ellipse');
      shine.setAttribute('cx', 8);
      shine.setAttribute('cy', 76);
      shine.setAttribute('rx', 24);
      shine.setAttribute('ry', 10);
      shine.setAttribute('fill', 'rgba(255,255,255,0.12)');
      svgEl.appendChild(shine);
      return;
    }
    case 'flower': {
      // larger layered petals similar to 🌸 placed on the top-center of the forehead
      const petalCount = 7; // slightly more petals for a fuller look
      const petalRadiusX = 18; // increased horizontal petal size
      const petalRadiusY = 12; // increased vertical petal size
      const centerX = 0;
      const centerY = -70; // moved slightly higher to sit on the top of the head
      // draw petals rotated around center with a bit more spread
      for(let i=0;i<petalCount;i++){
        const angle = (i / petalCount) * Math.PI * 2;
        const px = centerX + Math.cos(angle) * 12; // increased radial offset
        const py = centerY + Math.sin(angle) * 8;  // increased radial offset
        const petal = document.createElementNS(NS,'ellipse');
        petal.setAttribute('cx', px);
        petal.setAttribute('cy', py);
        petal.setAttribute('rx', petalRadiusX);
        petal.setAttribute('ry', petalRadiusY);
        // rotate petal to face outward
        const deg = (angle * 180 / Math.PI);
        petal.setAttribute('transform', `rotate(${deg} ${px} ${py})`);
        // slightly lighter stroke for definition
        petal.setAttribute('fill', acc.color);
        petal.setAttribute('stroke', 'rgba(0,0,0,0.06)');
        petal.setAttribute('stroke-width', 0.6);
        svgEl.appendChild(petal);
      }
      // center circle scaled up for balance with larger petals
      const center = document.createElementNS(NS,'circle');
      center.setAttribute('cx', centerX);
      center.setAttribute('cy', centerY);
      center.setAttribute('r', 9);
      // pick a contrasting center: if acc.color is dark, use a light center, otherwise a warm yellow
      // (simple luminance check)
      const col = acc.color || '#ff89b5';
      const hex = col.replace('#','');
      let r = parseInt(hex.substring(0,2),16);
      let g = parseInt(hex.substring(2,4),16);
      let b = parseInt(hex.substring(4,6),16);
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      center.setAttribute('fill', lum < 90 ? '#ffe28a' : '#ffd06a');
      center.setAttribute('stroke', 'rgba(0,0,0,0.06)');
      center.setAttribute('stroke-width', 0.8);
      svgEl.appendChild(center);
      return;
    }

    case 'honeycomb': {
      // three small octagon shapes arranged as a honeycomb cluster on the forehead
      // slight spacing is applied so edges do not touch, making the honeycomb pattern clear
      const makeOct = (cx, cy, s) => {
        // approximate octagon points around center (s controls half-width)
        // these offsets create a regular-ish octagon shape
        const o = [
          [cx - s, cy - Math.floor(s/3)],
          [cx - s, cy + Math.floor(s/3)],
          [cx - Math.floor(s/3), cy + s],
          [cx + Math.floor(s/3), cy + s],
          [cx + s, cy + Math.floor(s/3)],
          [cx + s, cy - Math.floor(s/3)],
          [cx + Math.floor(s/3), cy - s],
          [cx - Math.floor(s/3), cy - s]
        ];
        const poly = document.createElementNS(NS,'polygon');
        poly.setAttribute('points', o.map(p => p.join(',')).join(' '));
        poly.setAttribute('fill', acc.color);
        poly.setAttribute('stroke', 'rgba(0,0,0,0.06)');
        poly.setAttribute('stroke-width', 0.5);
        poly.setAttribute('stroke-linejoin','round');
        svgEl.appendChild(poly);
      };

      // positions: two on top row, one centered below them; placed on the forehead area
      const size = 10; // octagon half-width (slightly smaller)
      const spacing = 6; // horizontal spacing between top pair
      // moved down to forehead area (around y -44 .. -28)
      const topY = -44;
      const bottomY = -28;
      const leftX = - (size + Math.floor(spacing/2));
      const rightX = +(size + Math.floor(spacing/2));
      makeOct(leftX, topY, size);
      makeOct(rightX, topY, size);
      makeOct(0, bottomY, size);
      return;
    }
    default: break;
  }

  svgEl.appendChild(g);
}

/* Items list rendering for editor */
/* helper: produce CSS background string for an item (supports solid or gradient) */
function getItemCssBg(it){
  if(!it) return '#ffffff';
  if(it.bgMode === 'gradient'){
    // map gradient direction tokens to CSS angle
    const dir = it.bgGradDir || '|';
    let angle = '180deg'; // default vertical top->bottom
    if(dir === '|') angle = '90deg';       // left -> right
    else if(dir === '_') angle = '180deg'; // top -> bottom
    else if(dir === '\\') angle = '135deg';// tl -> br
    else if(dir === '/') angle = '45deg';  // bl -> tr
    const c1 = it.bgColor || '#ffffff';
    const c2 = it.bgColor2 || '#eeeeee';
    return `linear-gradient(${angle}, ${c1}, ${c2})`;
  } else {
    return it.bgColor || '#ffffff';
  }
}

function renderItemsList(){
  const list = $('#itemsList');
  list.innerHTML = '';
  state.items.forEach((it, idx) => {
    const card = document.createElement('div'); card.className='itemCard';
    card.textContent = it.emoji;
    // apply background (supports gradient or solid)
    card.style.background = getItemCssBg(it);
    const meta = document.createElement('div'); meta.style.fontSize='11px'; meta.style.color='#666'; meta.style.marginLeft='6px'; meta.textContent = it.anim;
    // remove button
    const rem = document.createElement('button'); rem.textContent='✕'; rem.className='smallBtn'; rem.addEventListener('click', () => { state.items.splice(idx,1); renderItemsList(); renderPlayItems(); });
    const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px';
    wrap.appendChild(card); wrap.appendChild(meta); wrap.appendChild(rem);
    list.appendChild(wrap);
  });
  if(state.items.length===0){
    const h = document.createElement('div'); h.style.color='#666'; h.style.fontSize='13px'; h.textContent='No items yet';
    list.appendChild(h);
  }
}

/* Play items (draggables) */
function renderPlayItems(){
  const list = $('#playItems');
  list.innerHTML = '';
  state.items.forEach((it, idx) => {
    const card = document.createElement('div'); card.className='itemCard'; card.textContent = it.emoji;
    // support gradient or solid background for play items
    card.style.background = getItemCssBg(it);
    card.draggable = true;
    card.dataset.index = idx;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      // ensure the browser uses the element itself as the drag image (keeps full opacity)
      try {
        e.dataTransfer.setDragImage(card, Math.floor(card.offsetWidth/2), Math.floor(card.offsetHeight/2));
      } catch (err) {
        // some environments may throw; ignore silently
      }
      card.dataset._prevOpacity = card.style.opacity || '';
      card.style.opacity = '1';
    });
    card.addEventListener('dragend', e => {
      card.style.opacity = card.dataset._prevOpacity || '';
      delete card.dataset._prevOpacity;
    });
    // touch support: make a longpress to pick up (fallback to pointer events)
    enableTouchDrag(card);
    list.appendChild(card);
  });
  if(state.items.length===0){
    const h = document.createElement('div'); h.style.color='#666'; h.style.fontSize='13px'; h.textContent='No items';
    list.appendChild(h);
  }
}

/* Drag/drop handling onto pet */
function setupDragDrop(){
  const petSVGs = [$('#petSVG_play'), $('#petSVG_items'), $('#petSVG')];
  petSVGs.forEach(svgel => {
    if(!svgel) return;
    svgel.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    svgel.addEventListener('drop', e => {
      e.preventDefault();
      const idx = Number(e.dataTransfer.getData('text/plain'));
      if(Number.isFinite(idx)) {
        triggerItemOnPet(state.items[idx]);
      }
    });

    // pointer/touch drop: support pointer up with data stored on window during touch drag
    svgel.addEventListener('pointerup', e => {
      if(window._touchDragItem != null){
        triggerItemOnPet(window._touchDragItem);
        window._touchDragItem = null;
      }
    });

    // pat / heart on play area: only act on the play SVG
    if(svgel.id === 'petSVG_play'){
      svgel.addEventListener('pointerdown', e => {
        // compute click position relative to svg bounding rect
        const rect = svgel.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        spawnHeartAt(x, y, svgel);
      });
    }
  });
}

function triggerItemOnPet(item){
  if(!item) return;
  // apply animation to petSVG_play's group elements by manipulating transform/scale
  const svg = $('#petSVG_play');
  if(!svg) return;
  // create a wrapper group around contents
  let wrap = svg.querySelector('#animWrap');
  if(wrap) wrap.remove();
  const NS = 'http://www.w3.org/2000/svg';
  wrap = document.createElementNS(NS,'g');
  wrap.setAttribute('id','animWrap');
  // move current children into wrap
  const children = Array.from(svg.childNodes);
  children.forEach(n => wrap.appendChild(n));
  svg.appendChild(wrap);

  // show transient emoji flying to pet center
  const emoji = document.createElement('div');
  emoji.className='itemCard';
  emoji.style.position='absolute';
  emoji.style.zIndex = 30;
  emoji.style.left = '12px';
  emoji.style.top = '12px';
  emoji.style.transition = 'transform 500ms linear, opacity 500ms';
  emoji.style.pointerEvents = 'none';
  emoji.style.background = getItemCssBg(item);
  emoji.textContent = item.emoji;
  document.body.appendChild(emoji);

  // compute the center of svg on screen
  const rect = svg.getBoundingClientRect();
  const targetX = rect.left + rect.width/2 - 22;
  const targetY = rect.top + rect.height/2 - 22;
  // animate toward center
  requestAnimationFrame(() => {
    emoji.style.transform = `translate(${targetX - 12}px, ${targetY - 12}px) scale(1.4)`;
    emoji.style.opacity = '0.95';
  });

  setTimeout(()=> {
    emoji.style.opacity = '0';
    // remove after fade
    setTimeout(()=> emoji.remove(), 400);
  }, 550);

  // apply animation on the wrap based on item.anim
  switch(item.anim){
    case 'jump':
      animateJump(wrap);
      break;
    case 'shake':
      animateShake(wrap);
      break;
    case 'expand':
      animateScale(wrap, 1.18, 300);
      break;
    case 'shrink':
      animateScale(wrap, 0.8, 300);
      break;
    default: break;
  }

  // after animation, restore svg children (unwrap)
  setTimeout(()=> {
    // move children back to svg root
    const inner = Array.from(wrap.childNodes);
    inner.forEach(n => svg.appendChild(n));
    wrap.remove();
  }, 700);
}

function animateJump(node){
  node.style.transition = 'transform 260ms cubic-bezier(.2,.9,.3,1)';
  node.style.transformOrigin = '50% 50%';
  node.style.transform = 'translateY(-32px)';
  setTimeout(()=>{ node.style.transform='translateY(0)'; }, 260);
}

function animateShake(node){
  node.style.transition = 'transform 120ms';
  node.style.transformOrigin = '50% 50%';
  node.style.transform = 'translateX(-10px)';
  setTimeout(()=>{ node.style.transform='translateX(10px)'; }, 120);
  setTimeout(()=>{ node.style.transform='translateX(-6px)'; }, 240);
  setTimeout(()=>{ node.style.transform='translateX(6px)'; }, 360);
  setTimeout(()=>{ node.style.transform='translateX(0)'; }, 480);
}

function animateScale(node, scale, dur){
  node.style.transition = `transform ${dur}ms cubic-bezier(.2,.9,.3,1)`;
  node.style.transformOrigin = '50% 50%';
  node.style.transform = `scale(${scale})`;
  setTimeout(()=>{ node.style.transform = 'scale(1)'; }, dur);
}

 // Spawn a heart emoji visual at given coords inside the svg's rect
 function spawnHeartAt(x, y, svgEl){
   const heart = document.createElement('div');
   heart.className = 'patHeart';
   heart.textContent = state.heartEmoji || DEFAULTS.heartEmoji;
   heart.style.position = 'absolute';
   heart.style.pointerEvents = 'none';
   // ensure the heart sits above panels/modals
   heart.style.zIndex = '9999';
   heart.style.fontSize = '22px';
   heart.style.opacity = '0';
   heart.style.transform = 'translate(-50%,-50%) scale(0.8)';
   document.body.appendChild(heart);
   const rect = svgEl.getBoundingClientRect();
   // account for page scroll so positioning is accurate in all contexts
   const scrollX = window.scrollX || window.pageXOffset || 0;
   const scrollY = window.scrollY || window.pageYOffset || 0;
   // position center of heart at the clicked point
   heart.style.left = `${Math.round(rect.left + scrollX + x)}px`;
   heart.style.top = `${Math.round(rect.top + scrollY + y)}px`;
 
   // animate: pop up and float/fade
   requestAnimationFrame(()=> {
     heart.style.transition = 'transform 360ms cubic-bezier(.2,.9,.3,1), opacity 600ms';
     heart.style.opacity = '1';
     heart.style.transform = 'translate(-50%,-60%) scale(1.2)';
   });
   // compute delay in ms (support seconds unit)
   const rawDelay = (state.heartFloatDelay != null) ? Number(state.heartFloatDelay) : DEFAULTS.heartFloatDelay;
   const delayMs = (state.heartDelayUnit === 's') ? Math.round(rawDelay * 1000) : Math.round(rawDelay || DEFAULTS.heartFloatDelay);
   setTimeout(()=> {
     heart.style.opacity = '0';
     heart.style.transform = 'translate(-50%,-120%) scale(1.0)';
     setTimeout(()=> heart.remove(), 700);
   }, delayMs);
 }

/* Touch drag support: make item element fire pointerdown and move stored item until pointerup over svg */
function enableTouchDrag(el){
  let active = false;
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    active = true;
    const idx = Number(el.dataset.index);
    window._touchDragItem = state.items[idx];
    el.dataset._prevOpacity = el.style.opacity || '';
    el.style.opacity = '1';
  });
  el.addEventListener('pointerup', e => {
    active = false;
    if(window._touchDragItem) {
      // if released over pet play svg, trigger will be handled by pointerup on svg
      // otherwise clear
      setTimeout(()=> window._touchDragItem = null, 10);
    }
    el.style.opacity = el.dataset._prevOpacity || '';
    delete el.dataset._prevOpacity;
    el.releasePointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointercancel', e => {
    active = false;
    window._touchDragItem = null;
    el.style.opacity = el.dataset._prevOpacity || '';
    delete el.dataset._prevOpacity;
  });
}

/* initialize */
init();