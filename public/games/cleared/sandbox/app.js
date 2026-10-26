// Cleared edition: the sandbox stays on this device. The websim room is not opened.
let room = null;
let currentUserId = null;
const LS_KEY = 'emoji_sandbox_chars';

const sandbox = document.getElementById('sandbox');
const modal = document.getElementById('modal');
const overlay = document.getElementById('overlay');
const emoteMenu = document.getElementById('emoteMenu');
const createBtn = document.getElementById('createBtn');
const createEmoteBtn = document.getElementById('createEmoteBtn');
const spawnBtn = document.getElementById('spawnBtn');
const spawnBabyBtn = document.getElementById('spawnBabyBtn');
const clearBtn = document.getElementById('clearBtn');
const autoMoveBtn = document.getElementById('autoMoveBtn');
const randomEmoteBtn = document.getElementById('randomEmoteBtn');

// characters: array of { id, name, color, face, faces: [{name, emoji}] , selected}
let characters = [];
// emotes: array of custom emote sequences
let emotes = [];
// spawned: array of { el, char, x, y, vx, vy, state, face key }
let spawned = [];
let autoMove = false;
let randomEmote = false;
const DEFAULT_TEXT = '#000000';

function isFoodLike(char) {
  return char.type === 'food' || char.type === 'prop';
}

const OVERLAY_POS = ['center', 'top', 'bottom', 'left', 'right'];
const POS_ICONS = { center: '◎', top: '▲', bottom: '▼', left: '◀', right: '▶' };
const POS_LABELS = { center: 'Middle', top: 'Above', bottom: 'Below', left: 'Left', right: 'Right' };
const EMOJI_SIZES = [
  ['superTiny', 'Super tiny', 0.3],
  ['tiny', 'Tiny', 0.45],
  ['small', 'Small', 0.6],
  ['somewhatSmall', 'Somewhat small', 0.8],
  ['medium', 'Default / medium', 1],
  ['somewhatBig', 'Somewhat big', 1.25],
  ['big', 'Big', 1.5],
  ['huge', 'Huge', 1.8],
  ['superHuge', 'Super huge', 2.2],
];

function emojiSizeScale(size) {
  return (EMOJI_SIZES.find(([value]) => value === size) || EMOJI_SIZES[4])[2];
}

function createSizePicker(value, onChange) {
  const select = document.createElement('select');
  select.title = 'Emoji size';
  EMOJI_SIZES.forEach(([size, label]) => {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = EMOJI_SIZES.some(([size]) => size === value) ? value : 'medium';
  select.onchange = () => onChange(select.value);
  return select;
}

function rotStyle(r, rl, flip) {
  if (flip) return 'rotate(180deg)';
  if (rl) return 'rotate(-90deg)';
  if (r) return 'rotate(90deg)';
  return '';
}

function normFaceDef(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    if (!v.trim()) return null;
    return { emoji: v.trim(), textColor: DEFAULT_TEXT, size: 'medium', rotate: false, rotateLeft: false, rotateFlip: false, overlays: [] };
  }
  return {
    emoji: v.emoji || '',
    textColor: v.textColor || DEFAULT_TEXT,
    size: v.size || 'medium',
    rotate: !!v.rotate,
    rotateLeft: !!v.rotateLeft,
    rotateFlip: !!v.rotateFlip,
    overlays: v.overlays || [],
  };
}

function overlayPosStyle(pos) {
  switch (pos) {
    case 'top': return { left: '50%', top: '16%' };
    case 'bottom': return { left: '50%', top: '84%' };
    case 'left': return { left: '14%', top: '50%' };
    case 'right': return { left: '86%', top: '50%' };
    default: return { left: '50%', top: '50%' };
  }
}

const COLLECTION = 'emoji_sandbox_save';
const LS_KEY_EMOTES = 'emoji_sandbox_emotes';

const EMOTE_TYPES = [
  ['dance', 'Dance'],
  ['jump', 'Jump'],
  ['shake', 'Shake'],
  ['eat', 'Eat'],
  ['sleep', 'Sleep'],
  ['spin', 'Spin'],
  ['squeeze', 'Squeeze (small→big)'],
  ['reverseSqueeze', 'Reverse squeeze (big→small)'],
  ['goUp', 'Go up'],
  ['goDown', 'Go down'],
  ['goLeft', 'Go left'],
  ['goRight', 'Go right'],
];
const STEP_LABELS = {
  dance: 'Dance', jump: 'Jump', shake: 'Shake', eat: 'Eat', sleep: 'Sleep', spin: 'Spin',
  squeeze: 'Squeeze', reverseSqueeze: 'Reverse squeeze',
  goUp: 'Go up', goDown: 'Go down', goLeft: 'Go left', goRight: 'Go right',
};
const SUB_LABELS = { eat: 'Eat', sleep: 'Sleep' };
const STEP_BASE = {
  jump: 0.5, eat: 1.6, sleep: 3, spin: 0.7,
  squeeze: 0.7, reverseSqueeze: 0.7,
  goUp: 0.6, goDown: 0.6, goLeft: 0.6, goRight: 0.6,
};

function normEmote(e) {
  return {
    id: e.id,
    name: e.name,
    emoji: e.emoji || '✨',
    speed: e.speed || 1,
    loop: !!e.loop,
    anims: (e.anims || []).map((st) => ({
      type: st.type,
      sub: st.sub || null,
      duration: st.duration != null ? st.duration : 1,
      unit: st.unit === 'ms' ? 'ms' : 's',
      crumbColor: st.crumbColor || '#8b5a2b',
      zColor: st.zColor || DEFAULT_TEXT,
      zText: st.zText || 'Z',
      zDir: st.zDir || 't',
      changeFace: st.changeFace !== false,
    })),
  };
}

async function getUserId() {
  try {
    if (!window.websim) return;
    const u = await window.websim.getCurrentUser();
    currentUserId = u ? u.id : null;
  } catch (e) {
    currentUserId = null;
  }
}

async function loadData() {
  if (!currentUserId) {
    try { characters = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) {}
    try { emotes = (JSON.parse(localStorage.getItem(LS_KEY_EMOTES) || '[]')).map(normEmote); } catch (e) {}
    return;
  }
  try {
    const list = await room.collection(COLLECTION).filter({ id: currentUserId }).getList();
    if (list && list.length) {
      if (list[0].characters) characters = list[0].characters;
      if (list[0].emotes) emotes = list[0].emotes.map(normEmote);
    }
  } catch (e) {
    try { characters = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e2) {}
    try { emotes = (JSON.parse(localStorage.getItem(LS_KEY_EMOTES) || '[]')).map(normEmote); } catch (e2) {}
  }
}

async function saveData() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(characters)); } catch (e) {}
  try { localStorage.setItem(LS_KEY_EMOTES, JSON.stringify(emotes)); } catch (e) {}
  if (!currentUserId || !room) return;
  try {
    await room.collection(COLLECTION).upsert({
      id: currentUserId,
      characters,
      emotes,
    });
  } catch (e) {
    console.error(e);
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function cloneCharacter(c) {
  const base = c.name.replace(/\s+\d+$/, '');
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let max = 1;
  characters.forEach((x) => {
    const m = x.name.match(new RegExp('^' + esc + '\\s+(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  const copy = JSON.parse(JSON.stringify(c));
  copy.id = uid();
  copy.name = base + ' ' + (max + 1);
  characters.push(copy);
  saveData();
}

function deleteCharacter(c) {
  const i = characters.indexOf(c);
  if (i !== -1) characters.splice(i, 1);
  spawned.filter((s) => s.char === c).forEach((s) => removeSpawned(s));
  saveData();
}

// ---------- Create modal ----------
function openCreate(existing) {
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  modal.innerHTML = '';
  modal.appendChild(createForm(existing));
}

function createForm(existing) {
  const editing = !!existing;
  const draft = editing ? {
    name: existing.name,
    color: existing.color,
    backgroundEnabled: existing.backgroundEnabled !== false,
    type: existing.type,
    face: existing.face,
    rotate: !!existing.rotate,
    rotateLeft: !!existing.rotateLeft,
    rotateFlip: !!existing.rotateFlip,
    faceSize: existing.faceSize || 'medium',
    textColor: existing.textColor || DEFAULT_TEXT,
    faces: (existing.faces || []).map(f => ({ ...f })),
    overlays: (existing.overlays || []).map(o => ({ ...o })),
    eatFace: normFaceDef(existing.eatFace) || { emoji: '', textColor: DEFAULT_TEXT, rotate: false, rotateLeft: false, rotateFlip: false, overlays: [] },
    sleepFace: normFaceDef(existing.sleepFace) || { emoji: '', textColor: DEFAULT_TEXT, rotate: false, rotateLeft: false, rotateFlip: false, overlays: [] },
    emoteFaces: { ...(existing.emoteFaces || {}) },
  } : {
    name: '',
    color: '#e74c3c',
    backgroundEnabled: true,
    type: 'character',
    face: '🙂',
    rotate: false,
    rotateLeft: false,
    rotateFlip: false,
    faceSize: 'medium',
    textColor: DEFAULT_TEXT,
    faces: [],
    overlays: [],
    eatFace: { emoji: '', textColor: DEFAULT_TEXT, rotate: false, rotateLeft: false, rotateFlip: false, overlays: [] },
    sleepFace: { emoji: '', textColor: DEFAULT_TEXT, rotate: false, rotateLeft: false, rotateFlip: false, overlays: [] },
    emoteFaces: {},
  };

  const wrap = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = editing ? 'Edit Character' : 'Create Character';
  wrap.appendChild(title);

  const nameField = document.createElement('div');
  nameField.className = 'field';
  nameField.innerHTML = '<label>Name</label>';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Character name';
  nameField.appendChild(nameInput);
  wrap.appendChild(nameField);

  const typeField = document.createElement('div');
  typeField.className = 'field';
  typeField.innerHTML = '<label>Type</label>';
  const typeRow = document.createElement('div');
  typeRow.className = 'type-row';
  const charType = document.createElement('button');
  charType.type = 'button';
  charType.className = 'type-btn';
  charType.textContent = 'Character';
  const foodType = document.createElement('button');
  foodType.type = 'button';
  foodType.className = 'type-btn';
  foodType.textContent = 'Food';
  const propType = document.createElement('button');
  propType.type = 'button';
  propType.className = 'type-btn';
  propType.textContent = 'Prop';
  charType.onclick = () => { draft.type = 'character'; setTypeActive(); };
  foodType.onclick = () => { draft.type = 'food'; setTypeActive(); };
  propType.onclick = () => { draft.type = 'prop'; setTypeActive(); };
  typeRow.appendChild(charType);
  typeRow.appendChild(foodType);
  typeRow.appendChild(propType);
  typeField.appendChild(typeRow);
  wrap.appendChild(typeField);
  const setTypeActive = () => {
    charType.classList.toggle('active', draft.type === 'character');
    foodType.classList.toggle('active', draft.type === 'food');
    propType.classList.toggle('active', draft.type === 'prop');
    refreshLabels();
  };

  const colorField = document.createElement('div');
  colorField.className = 'field';
  colorField.innerHTML = '<label>Base color</label>';
  const colorRow = document.createElement('div');
  colorRow.className = 'color-row';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = draft.color;
  const preview = document.createElement('div');
  preview.className = 'preview';
  colorRow.appendChild(colorInput);
  colorRow.appendChild(preview);
  colorField.appendChild(colorRow);
  const backgroundToggle = document.createElement('label');
  backgroundToggle.className = 'f-toggle';
  const backgroundInput = document.createElement('input');
  backgroundInput.type = 'checkbox';
  backgroundInput.checked = draft.backgroundEnabled;
  const backgroundText = document.createElement('span');
  backgroundText.textContent = 'Colored background';
  backgroundToggle.appendChild(backgroundInput);
  backgroundToggle.appendChild(backgroundText);
  colorField.appendChild(backgroundToggle);
  wrap.appendChild(colorField);

  const faceField = document.createElement('div');
  faceField.className = 'field';
  const faceLabel = document.createElement('label');
  faceLabel.id = 'mainFaceLabel';
  const faceInput = document.createElement('input');
  faceInput.type = 'text';
  faceInput.placeholder = 'e.g. 🙂 or ^_^';
  faceField.appendChild(faceLabel);
  faceField.appendChild(faceInput);
  faceField.appendChild(faceOpts(draft, refreshAll, 'faceSize'));
  const mainOverlays = document.createElement('div');
  mainOverlays.className = 'face-overlays';
  faceField.appendChild(mainOverlays);
  wrap.appendChild(faceField);

  const eatField = document.createElement('div');
  eatField.className = 'field';
  const eatLabel = document.createElement('label');
  eatLabel.innerHTML = 'Eat face <span class="opt-hint">(optional — empty uses the selected face)</span>';
  const eatInput = document.createElement('input');
  eatInput.type = 'text';
  eatInput.value = draft.eatFace.emoji;
  eatInput.placeholder = 'e.g. 😋 (optional)';
  const eatOpts = document.createElement('div');
  eatOpts.className = 'face-opts';
  const eatOvWrap = document.createElement('div');
  eatOvWrap.className = 'face-overlays';
  eatField.appendChild(eatLabel);
  eatField.appendChild(eatInput);
  eatField.appendChild(eatOpts);
  eatField.appendChild(eatOvWrap);
  wrap.appendChild(eatField);

  const sleepField = document.createElement('div');
  sleepField.className = 'field';
  const sleepLabel = document.createElement('label');
  sleepLabel.innerHTML = 'Sleep face <span class="opt-hint">(optional — empty uses the selected face)</span>';
  const sleepInput = document.createElement('input');
  sleepInput.type = 'text';
  sleepInput.value = draft.sleepFace.emoji;
  sleepInput.placeholder = 'e.g. 😴 (optional)';
  const sleepOpts = document.createElement('div');
  sleepOpts.className = 'face-opts';
  const sleepOvWrap = document.createElement('div');
  sleepOvWrap.className = 'face-overlays';
  sleepField.appendChild(sleepLabel);
  sleepField.appendChild(sleepInput);
  sleepField.appendChild(sleepOpts);
  sleepField.appendChild(sleepOvWrap);
  wrap.appendChild(sleepField);

  const emoteFaceField = document.createElement('div');
  emoteFaceField.className = 'field';
  const emoteFaceLabel = document.createElement('label');
  emoteFaceLabel.innerHTML = 'Custom emote faces <span class="opt-hint">(face shown during that emote)</span>';
  const emoteFaceList = document.createElement('div');
  emoteFaceList.className = 'face-list';
  emoteFaceField.appendChild(emoteFaceLabel);
  emoteFaceField.appendChild(emoteFaceList);
  wrap.appendChild(emoteFaceField);

  function renderEmoteFaces() {
    emoteFaceList.innerHTML = '';
    if (!emotes.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-msg';
      empty.textContent = 'No custom emotes yet.';
      emoteFaceList.appendChild(empty);
      return;
    }
    emotes.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'face-row emote-face-row';
      const name = document.createElement('div');
      name.className = 'fname';
      name.textContent = e.emoji + ' ' + e.name;
      const tgl = document.createElement('label');
      tgl.className = 'f-toggle';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const stored = draft.emoteFaces && draft.emoteFaces[e.id];
      const hasFace = !!stored;
      cb.checked = hasFace;
      const sp = document.createElement('span');
      sp.textContent = 'Face';
      tgl.appendChild(cb);
      tgl.appendChild(sp);
      const fd = (typeof stored === 'object' && stored)
        ? stored
        : { emoji: typeof stored === 'string' ? stored : '', textColor: DEFAULT_TEXT, size: 'medium', rotate: false, rotateLeft: false, rotateFlip: false, overlays: [] };
      const faceIn = document.createElement('input');
      faceIn.type = 'text';
      faceIn.className = 'emote-face-input';
      faceIn.placeholder = 'e.g. 😜 (optional)';
      faceIn.value = fd.emoji || '';
      faceIn.style.display = hasFace ? '' : 'none';
      faceIn.oninput = () => { fd.emoji = faceIn.value.trim(); };
      const optsWrap = document.createElement('div');
      optsWrap.className = 'emote-face-opts';
      optsWrap.style.display = hasFace ? '' : 'none';
      optsWrap.appendChild(faceOpts(fd, refreshAll));
      optsWrap.appendChild(overlayChips(fd));
      cb.onchange = () => {
        faceIn.style.display = cb.checked ? '' : 'none';
        optsWrap.style.display = cb.checked ? '' : 'none';
        if (cb.checked) draft.emoteFaces[e.id] = fd;
        else delete draft.emoteFaces[e.id];
      };
      row.appendChild(name);
      row.appendChild(tgl);
      row.appendChild(faceIn);
      row.appendChild(optsWrap);
      emoteFaceList.appendChild(row);
    });
  }

  const facesField = document.createElement('div');
  facesField.className = 'field';
  const extraLabel = document.createElement('label');
  extraLabel.id = 'extraFaceLabel';
  const faceList = document.createElement('div');
  faceList.className = 'face-list';
  facesField.appendChild(extraLabel);
  facesField.appendChild(faceList);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'm-btn small';
  addBtn.style.background = '#e6d2a4';
  addBtn.textContent = '';
  facesField.appendChild(addBtn);
  wrap.appendChild(facesField);

  const singular = () => isFoodLike(draft) ? 'type' : 'face';
  const plural = () => isFoodLike(draft) ? 'types' : 'faces';
  function refreshLabels() {
    faceLabel.textContent = `Main ${singular()} (emojis / symbols) + style`;
    extraLabel.textContent = `Extra ${plural()}`;
    addBtn.textContent = `＋ Add ${singular()}`;
  }

  function refreshMainPreview() {
    preview.innerHTML = '';
    const pspan = (text, color, rotate, rotateLeft, flip, size) => {
      const sp = document.createElement('span');
      sp.textContent = text;
      sp.style.color = color || DEFAULT_TEXT;
      sp.style.fontSize = (28 * emojiSizeScale(size)) + 'px';
      sp.style.transform = 'translate(-50%,-50%) ' + rotStyle(rotate, rotateLeft, flip);
      return sp;
    };
    preview.appendChild(pspan(draft.face || '🙂', draft.textColor, draft.rotate, draft.rotateLeft, draft.rotateFlip, draft.faceSize));
    (draft.overlays || []).forEach((ov) => {
      const sp = pspan(ov.emoji, ov.textColor, ov.rotate, ov.rotateLeft, ov.rotateFlip, ov.size);
      const p = overlayPosStyle(ov.pos);
      sp.style.left = p.left;
      sp.style.top = p.top;
      preview.appendChild(sp);
    });
  }

  function faceOpts(obj, onChange, sizeKey = 'size') {
    const row = document.createElement('div');
    row.className = 'face-opts';
    const rot = document.createElement('label');
    rot.className = 'f-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!obj.rotate;
    const sp = document.createElement('span');
    sp.textContent = 'Rotate right';
    rot.appendChild(cb);
    rot.appendChild(sp);
    cb.onchange = () => { obj.rotate = cb.checked; onChange(); };
    const rotl = document.createElement('label');
    rotl.className = 'f-toggle';
    const cbl = document.createElement('input');
    cbl.type = 'checkbox';
    cbl.checked = !!obj.rotateLeft;
    const spl = document.createElement('span');
    spl.textContent = 'Rotate left';
    rotl.appendChild(cbl);
    rotl.appendChild(spl);
    cbl.onchange = () => { obj.rotateLeft = cbl.checked; onChange(); };
    const flip = document.createElement('label');
    flip.className = 'f-toggle';
    const cbf = document.createElement('input');
    cbf.type = 'checkbox';
    cbf.checked = !!obj.rotateFlip;
    const spf = document.createElement('span');
    spf.textContent = 'Upside down';
    flip.appendChild(cbf);
    flip.appendChild(spf);
    cbf.onchange = () => { obj.rotateFlip = cbf.checked; onChange(); };
    const sizeLabel = document.createElement('label');
    sizeLabel.className = 'size-picker';
    const sizeText = document.createElement('span');
    sizeText.textContent = 'Size';
    const sizeSelect = createSizePicker(obj[sizeKey], (value) => { obj[sizeKey] = value; onChange(); });
    sizeLabel.appendChild(sizeText);
    sizeLabel.appendChild(sizeSelect);
    const col = document.createElement('input');
    col.type = 'color';
    col.value = obj.textColor || DEFAULT_TEXT;
    col.title = 'Face text color';
    col.oninput = () => { obj.textColor = col.value; onChange(); };
    row.appendChild(rot);
    row.appendChild(rotl);
    row.appendChild(flip);
    row.appendChild(sizeLabel);
    row.appendChild(col);
    return row;
  }

  function overlayChips(faceObj) {
    const box = document.createElement('div');
    box.className = 'face-overlays';
    const label = document.createElement('span');
    label.className = 'ov-label';
    label.textContent = 'Overlays:';
    box.appendChild(label);
    (faceObj.overlays || []).forEach((ov, i) => {
      const chip = document.createElement('div');
      chip.className = 'ov-chip';
      const pos = ov.pos || 'center';
      const txt = document.createElement('span');
      txt.textContent = ov.emoji;
      txt.style.color = ov.textColor || DEFAULT_TEXT;
      txt.style.fontSize = (18 * emojiSizeScale(ov.size)) + 'px';
      txt.style.transform = rotStyle(ov.rotate, ov.rotateLeft, ov.rotateFlip);
      chip.appendChild(txt);
      const sizeSelect = createSizePicker(ov.size, (value) => { ov.size = value; refreshAll(); });
      sizeSelect.className = 'ov-size';
      sizeSelect.onclick = (e) => e.stopPropagation();
      chip.appendChild(sizeSelect);
      const rotBtn = document.createElement('button');
      rotBtn.type = 'button';
      rotBtn.className = 'ov-rot' + (ov.rotate ? ' on' : '');
      rotBtn.textContent = '↻';
      rotBtn.title = 'Rotate right';
      rotBtn.onclick = (e) => {
        e.stopPropagation();
        ov.rotate = !ov.rotate;
        refreshAll();
      };
      chip.appendChild(rotBtn);
      const rotlBtn = document.createElement('button');
      rotlBtn.type = 'button';
      rotlBtn.className = 'ov-rot' + (ov.rotateLeft ? ' on' : '');
      rotlBtn.textContent = '↺';
      rotlBtn.title = 'Rotate left';
      rotlBtn.onclick = (e) => {
        e.stopPropagation();
        ov.rotateLeft = !ov.rotateLeft;
        refreshAll();
      };
      chip.appendChild(rotlBtn);
      const flipBtn = document.createElement('button');
      flipBtn.type = 'button';
      flipBtn.className = 'ov-rot' + (ov.rotateFlip ? ' on' : '');
      flipBtn.textContent = '⇅';
      flipBtn.title = 'Upside down';
      flipBtn.onclick = (e) => {
        e.stopPropagation();
        ov.rotateFlip = !ov.rotateFlip;
        refreshAll();
      };
      chip.appendChild(flipBtn);
      const ovCol = document.createElement('input');
      ovCol.type = 'color';
      ovCol.className = 'ov-col';
      ovCol.value = ov.textColor || DEFAULT_TEXT;
      ovCol.title = 'Overlay text color';
      ovCol.oninput = (e) => { e.stopPropagation(); ov.textColor = ovCol.value; refreshAll(); };
      ovCol.onclick = (e) => e.stopPropagation();
      chip.appendChild(ovCol);
      const posBtn = document.createElement('button');
      posBtn.type = 'button';
      posBtn.className = 'ov-pos';
      posBtn.textContent = POS_ICONS[pos];
      posBtn.title = 'Position: ' + POS_LABELS[pos];
      posBtn.onclick = (e) => {
        e.stopPropagation();
        const cur = OVERLAY_POS.indexOf(pos);
        ov.pos = OVERLAY_POS[(cur + 1) % OVERLAY_POS.length];
        refreshAll();
      };
      chip.appendChild(posBtn);
      chip.onclick = () => {
        const ne = prompt('Overlay emoji / symbols:', ov.emoji);
        if (ne === null) return;
        ov.emoji = ne.trim();
        refreshAll();
      };
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'ov-x';
      x.textContent = '✕';
      x.title = 'Remove overlay';
      x.onclick = (e) => { e.stopPropagation(); faceObj.overlays.splice(i, 1); refreshAll(); };
      chip.appendChild(x);
      box.appendChild(chip);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'ov-add';
    add.textContent = '＋ Overlay';
    add.onclick = () => {
      const oe = prompt('Overlay emoji / symbols:');
      if (!oe) return;
      if (!faceObj.overlays) faceObj.overlays = [];
      faceObj.overlays.push({ emoji: oe, size: 'medium', rotate: false, rotateLeft: false, rotateFlip: false, textColor: DEFAULT_TEXT, pos: 'center' });
      refreshAll();
    };
    box.appendChild(add);
    return box;
  }

  function refreshAll() {
    preview.classList.toggle('no-background', !draft.backgroundEnabled);
    preview.style.background = draft.backgroundEnabled ? colorInput.value : 'transparent';
    refreshMainPreview();
    mainOverlays.innerHTML = '';
    mainOverlays.appendChild(overlayChips(draft));
    eatOvWrap.innerHTML = '';
    sleepOvWrap.innerHTML = '';
    eatOvWrap.appendChild(overlayChips(draft.eatFace));
    sleepOvWrap.appendChild(overlayChips(draft.sleepFace));
    renderEmoteFaces();
    faceList.innerHTML = '';
    draft.faces.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'face-row';
      const nm = document.createElement('div');
      nm.className = 'fname';
      nm.textContent = f.name;
      const em = document.createElement('div');
      em.className = 'femoji';
      em.style.transform = rotStyle(f.rotate, f.rotateLeft, f.rotateFlip);
      em.style.color = f.textColor || DEFAULT_TEXT;
      em.style.fontSize = (20 * emojiSizeScale(f.size)) + 'px';
      em.textContent = f.emoji;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'f-edit';
      edit.textContent = '✎';
      edit.title = 'Edit';
      edit.onclick = () => {
        const nn = prompt('Name:', f.name);
        if (nn === null) return;
        const ne = prompt('Emoji / symbols:', f.emoji);
        if (ne === null) return;
        f.name = nn.trim();
        f.emoji = ne.trim();
        refreshAll();
      };
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'f-del';
      del.textContent = '✕';
      del.title = 'Delete';
      del.onclick = () => { draft.faces.splice(i, 1); refreshAll(); };
      row.appendChild(nm);
      row.appendChild(em);
      row.appendChild(edit);
      row.appendChild(del);
      row.appendChild(faceOpts(f, () => { em.style.fontSize = (20 * emojiSizeScale(f.size)) + 'px'; }));
      row.appendChild(overlayChips(f));
      faceList.appendChild(row);
    });
  }

  colorInput.oninput = () => { draft.color = colorInput.value; refreshAll(); };
  backgroundInput.onchange = () => { draft.backgroundEnabled = backgroundInput.checked; refreshAll(); };
  faceInput.oninput = () => { draft.face = faceInput.value.trim() || '🙂'; refreshAll(); };
  eatInput.oninput = () => { draft.eatFace.emoji = eatInput.value.trim(); refreshAll(); };
  sleepInput.oninput = () => { draft.sleepFace.emoji = sleepInput.value.trim(); refreshAll(); };
  nameInput.oninput = () => { draft.name = nameInput.value.trim(); };

  eatOpts.appendChild(faceOpts(draft.eatFace, refreshAll));
  sleepOpts.appendChild(faceOpts(draft.sleepFace, refreshAll));

  addBtn.onclick = () => {
    const fname = prompt(`${singular().replace(/^./, c => c.toUpperCase())} name:`);
    if (!fname) return;
    const femoji = prompt(`${singular().replace(/^./, c => c.toUpperCase())} emoji / symbols:`);
    if (!femoji) return;
    draft.faces.push({ name: fname, emoji: femoji, size: 'medium', rotate: false, rotateLeft: false, rotateFlip: false, textColor: DEFAULT_TEXT, overlays: [] });
    refreshAll();
  };

  const btns = document.createElement('div');
  btns.className = 'modal-btns';
  const cancel = document.createElement('button');
  cancel.className = 'm-btn ghost';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeCreate;
  const save = document.createElement('button');
  save.className = 'm-btn primary';
  save.textContent = editing ? 'Save' : 'Create';
  save.onclick = () => {
    if (!draft.name) { nameInput.focus(); return; }
    const data = {
      id: editing ? existing.id : uid(),
      name: draft.name,
      color: draft.color,
      backgroundEnabled: draft.backgroundEnabled,
      type: draft.type,
      face: draft.face || '🙂',
      faceSize: draft.faceSize || 'medium',
      rotate: draft.rotate,
      rotateLeft: draft.rotateLeft,
      rotateFlip: draft.rotateFlip,
      textColor: draft.textColor,
      faces: draft.faces,
      overlays: draft.overlays,
      eatFace: draft.eatFace.emoji ? draft.eatFace : null,
      sleepFace: draft.sleepFace.emoji ? draft.sleepFace : null,
      emoteFaces: draft.emoteFaces,
    };
    if (editing) {
      Object.assign(existing, data);
      spawned.forEach((sp) => {
        if (sp.char === existing) refreshSpawnedVisual(sp);
      });
    } else {
      characters.push(data);
    }
    saveData();
    closeCreate();
  };
  btns.appendChild(cancel);
  btns.appendChild(save);
  wrap.appendChild(btns);

  refreshAll();
  setTypeActive();
  return wrap;
}

function closeCreate() {
  modal.classList.add('hidden');
  overlay.classList.add('hidden');
}

// ---------- Emote builder ----------
function openCreateEmote(existing) {
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  modal.innerHTML = '';
  modal.appendChild(createEmoteForm(existing));
}

function createEmoteForm(existing) {
  const editing = !!existing;
  const draft = editing ? JSON.parse(JSON.stringify(existing)) : { name: '', emoji: '✨', speed: 1, loop: false, anims: [] };

  const wrap = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = editing ? 'Edit Emote' : 'Create Emote';
  wrap.appendChild(title);

  const nameField = document.createElement('div');
  nameField.className = 'field';
  nameField.innerHTML = '<label>Name</label>';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Emote name';
  nameInput.value = draft.name;
  nameField.appendChild(nameInput);
  wrap.appendChild(nameField);

  const emojiField = document.createElement('div');
  emojiField.className = 'field';
  emojiField.innerHTML = '<label>Emoji <span class="opt-hint">(shown in the menu)</span></label>';
  const emojiInput = document.createElement('input');
  emojiInput.type = 'text';
  emojiInput.placeholder = 'e.g. 🎉';
  emojiInput.value = draft.emoji;
  emojiField.appendChild(emojiInput);
  wrap.appendChild(emojiField);

  const speedField = document.createElement('div');
  speedField.className = 'field';
  speedField.innerHTML = '<label>Animation speed</label>';
  const speedRow = document.createElement('div');
  speedRow.className = 'dur-row';
  const speedInput = document.createElement('input');
  speedInput.type = 'number';
  speedInput.min = '0.1';
  speedInput.step = '0.1';
  speedInput.value = draft.speed;
  const speedX = document.createElement('div');
  speedX.className = 'speed-x';
  speedX.textContent = '×';
  speedRow.appendChild(speedInput);
  speedRow.appendChild(speedX);
  speedField.appendChild(speedRow);
  wrap.appendChild(speedField);

  const loopField = document.createElement('div');
  loopField.className = 'field';
  const loopLabel = document.createElement('label');
  loopLabel.className = 'f-toggle';
  const loopInput = document.createElement('input');
  loopInput.type = 'checkbox';
  loopInput.checked = !!draft.loop;
  const loopText = document.createElement('span');
  loopText.textContent = 'Loop';
  loopLabel.appendChild(loopInput);
  loopLabel.appendChild(loopText);
  loopField.appendChild(loopLabel);
  wrap.appendChild(loopField);

  const animsField = document.createElement('div');
  animsField.className = 'field';
  const animsLabel = document.createElement('label');
  animsLabel.innerHTML = 'Animations <span class="opt-hint">(play in order)</span>';
  const animList = document.createElement('div');
  animList.className = 'estep-list';
  animsField.appendChild(animsLabel);
  animsField.appendChild(animList);
  const addAnimBtn = document.createElement('button');
  addAnimBtn.type = 'button';
  addAnimBtn.className = 'm-btn small';
  addAnimBtn.style.background = '#e6d2a4';
  addAnimBtn.textContent = '＋ Add animation';
  animsField.appendChild(addAnimBtn);
  wrap.appendChild(animsField);

  const stepPanel = document.createElement('div');
  stepPanel.className = 'hidden';
  wrap.appendChild(stepPanel);

  const defaultStep = () => ({ type: 'dance', sub: null, duration: 1, unit: 's', crumbColor: '#8b5a2b', zColor: DEFAULT_TEXT, zText: 'Z', zDir: 't', changeFace: true });
  let editIndex = -1;

  function renderList() {
    animList.innerHTML = '';
    if (!draft.anims.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-msg';
      empty.textContent = 'No animations yet.';
      animList.appendChild(empty);
      return;
    }
    draft.anims.forEach((st, i) => {
      const row = document.createElement('div');
      row.className = 'estep-row';
      const num = document.createElement('div');
      num.className = 'estep-num';
      num.textContent = i + 1;
      const info = document.createElement('div');
      info.className = 'estep-info';
      const t = document.createElement('div');
      t.textContent = STEP_LABELS[st.type] || st.type;
      info.appendChild(t);
      const extra = [];
      if (st.sub) extra.push('during: ' + SUB_LABELS[st.sub]);
      if (st.type === 'dance' || st.type === 'shake' || st.type === 'sleep') extra.push(st.unit === 'ms' ? st.duration + ' ms' : st.duration + ' s');
      if (extra.length) {
        const sub = document.createElement('div');
        sub.className = 'estep-sub';
        sub.textContent = extra.join(' · ');
        info.appendChild(sub);
      }
      const btns = document.createElement('div');
      btns.className = 'estep-btns';
      const mk = (icon, ttl, fn, del) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 's-btn' + (del ? ' del' : '');
        b.textContent = icon;
        b.title = ttl;
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        return b;
      };
      btns.appendChild(mk('↑', 'Move up', () => { if (i > 0) { draft.anims.splice(i - 1, 0, draft.anims.splice(i, 1)[0]); renderList(); } }));
      btns.appendChild(mk('↓', 'Move down', () => { if (i < draft.anims.length - 1) { draft.anims.splice(i + 1, 0, draft.anims.splice(i, 1)[0]); renderList(); } }));
      btns.appendChild(mk('✎', 'Edit', () => openStepEditor(st, i)));
      btns.appendChild(mk('✕', 'Delete', () => { draft.anims.splice(i, 1); renderList(); }, true));
      row.appendChild(num);
      row.appendChild(info);
      row.appendChild(btns);
      animList.appendChild(row);
    });
  }

  function openStepEditor(st, idx) {
    editIndex = idx;
    stepPanel.innerHTML = '';
    stepPanel.classList.remove('hidden');
    const stDraft = { ...st };

    const typeField = document.createElement('div');
    typeField.className = 'field';
    typeField.innerHTML = '<label>Animation</label>';
    const typeSelect = document.createElement('select');
    EMOTE_TYPES.forEach(([val, lab]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = lab;
      typeSelect.appendChild(o);
    });
    typeSelect.value = stDraft.type;
    typeField.appendChild(typeSelect);

    const subField = document.createElement('div');
    subField.className = 'field';
    subField.innerHTML = '<label>During this animation <span class="opt-hint">(optional)</span></label>';
    const subSelect = document.createElement('select');
    [['', 'None'], ['eat', 'Eat'], ['sleep', 'Sleep']].forEach(([val, lab]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = lab;
      subSelect.appendChild(o);
    });
    subSelect.value = stDraft.sub || '';
    subField.appendChild(subSelect);

    const durField = document.createElement('div');
    durField.className = 'field';
    durField.innerHTML = '<label>Duration</label>';
    const durRow = document.createElement('div');
    durRow.className = 'dur-row';
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.min = '0.1';
    durInput.step = '0.1';
    durInput.value = stDraft.unit === 'ms' ? stDraft.duration : (stDraft.duration || 1);
    const unitSelect = document.createElement('select');
    [['s', 'Seconds'], ['ms', 'Milliseconds']].forEach(([val, lab]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = lab;
      unitSelect.appendChild(o);
    });
    unitSelect.value = stDraft.unit === 'ms' ? 'ms' : 's';
    durRow.appendChild(durInput);
    durRow.appendChild(unitSelect);
    durField.appendChild(durRow);

    const crumbField = document.createElement('div');
    crumbField.className = 'field';
    crumbField.innerHTML = '<label>Crumb color</label>';
    const crumbRow = document.createElement('div');
    crumbRow.className = 'color-row';
    const crumbInput = document.createElement('input');
    crumbInput.type = 'color';
    crumbInput.value = stDraft.crumbColor || '#8b5a2b';
    crumbRow.appendChild(crumbInput);
    crumbField.appendChild(crumbRow);

    const zField = document.createElement('div');
    zField.className = 'field';
    zField.innerHTML = '<label>Z particles</label>';
    const zColorRow = document.createElement('div');
    zColorRow.className = 'color-row';
    const zColorLabel = document.createElement('label');
    zColorLabel.textContent = 'Z color';
    const zColorInput = document.createElement('input');
    zColorInput.type = 'color';
    zColorInput.value = stDraft.zColor || DEFAULT_TEXT;
    zColorRow.appendChild(zColorLabel);
    zColorRow.appendChild(zColorInput);
    const zTextInput = document.createElement('input');
    zTextInput.type = 'text';
    zTextInput.placeholder = 'Symbol (e.g. Z)';
    zTextInput.value = stDraft.zText || 'Z';
    const zDirLabel = document.createElement('label');
    zDirLabel.textContent = 'Origin';
    const zDirSelect = document.createElement('select');
    [['tl', 'Top left'], ['t', 'Top'], ['tr', 'Top right']].forEach(([val, lab]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = lab;
      zDirSelect.appendChild(o);
    });
    zDirSelect.value = stDraft.zDir || 't';
    const zDirRow = document.createElement('div');
    zDirRow.className = 'dur-row';
    zDirRow.appendChild(zDirLabel);
    zDirRow.appendChild(zDirSelect);
    zField.appendChild(zColorRow);
    zField.appendChild(zTextInput);
    zField.appendChild(zDirRow);

    const faceField = document.createElement('div');
    faceField.className = 'field';
    const faceLabel = document.createElement('label');
    faceLabel.className = 'f-toggle';
    const faceToggle = document.createElement('input');
    faceToggle.type = 'checkbox';
    faceToggle.checked = stDraft.changeFace !== false;
    const faceText = document.createElement('span');
    faceText.textContent = 'Change face';
    faceLabel.appendChild(faceToggle);
    faceLabel.appendChild(faceText);
    faceField.appendChild(faceLabel);

    function refreshOpts() {
      durField.classList.toggle('hidden', !(stDraft.type === 'dance' || stDraft.type === 'shake' || stDraft.type === 'sleep'));
      crumbField.classList.toggle('hidden', !(stDraft.type === 'eat' || stDraft.sub === 'eat'));
      zField.classList.toggle('hidden', !(stDraft.type === 'sleep' || stDraft.sub === 'sleep'));
      faceField.classList.toggle('hidden', !(stDraft.type === 'eat' || stDraft.type === 'sleep' || stDraft.sub === 'eat' || stDraft.sub === 'sleep'));
    }
    typeSelect.onchange = () => { stDraft.type = typeSelect.value; refreshOpts(); };
    subSelect.onchange = () => { stDraft.sub = subSelect.value || null; refreshOpts(); };

    stepPanel.appendChild(typeField);
    stepPanel.appendChild(subField);
    stepPanel.appendChild(durField);
    stepPanel.appendChild(crumbField);
    stepPanel.appendChild(zField);
    stepPanel.appendChild(faceField);

    const btns = document.createElement('div');
    btns.className = 'modal-btns';
    const cancelB = document.createElement('button');
    cancelB.type = 'button';
    cancelB.className = 'm-btn ghost';
    cancelB.textContent = 'Cancel';
    cancelB.onclick = closeStepEditor;
    const saveB = document.createElement('button');
    saveB.type = 'button';
    saveB.className = 'm-btn primary';
    saveB.textContent = 'Save animation';
    saveB.onclick = () => {
      st.type = stDraft.type;
      st.sub = stDraft.sub || null;
      if (stDraft.type === 'dance' || stDraft.type === 'shake' || stDraft.type === 'sleep') {
        let v = parseFloat(durInput.value);
        if (!isFinite(v) || v <= 0) v = unitSelect.value === 'ms' ? 1000 : 1;
        st.duration = v;
        st.unit = unitSelect.value;
      }
      st.crumbColor = crumbInput.value || '#8b5a2b';
      st.zColor = zColorInput.value || DEFAULT_TEXT;
      st.zText = zTextInput.value.trim() || 'Z';
      st.zDir = zDirSelect.value;
      st.changeFace = faceToggle.checked;
      if (editIndex === -1) draft.anims.push(st);
      renderList();
      closeStepEditor();
    };
    btns.appendChild(cancelB);
    btns.appendChild(saveB);
    stepPanel.appendChild(btns);

    refreshOpts();
  }

  function closeStepEditor() {
    stepPanel.innerHTML = '';
    stepPanel.classList.add('hidden');
  }

  addAnimBtn.onclick = () => openStepEditor(defaultStep(), -1);

  nameInput.oninput = () => { draft.name = nameInput.value.trim(); };
  emojiInput.oninput = () => { draft.emoji = emojiInput.value.trim(); };
  speedInput.oninput = () => { draft.speed = parseFloat(speedInput.value) || 1; };
  loopInput.onchange = () => { draft.loop = loopInput.checked; };

  const btns = document.createElement('div');
  btns.className = 'modal-btns';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'm-btn ghost';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeCreate;
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'm-btn primary';
  save.textContent = editing ? 'Save' : 'Create';
  save.onclick = () => {
    if (!draft.name) { nameInput.focus(); return; }
    if (!draft.anims.length) { addAnimBtn.focus(); return; }
    const data = {
      id: editing ? existing.id : uid(),
      name: draft.name.trim(),
      emoji: draft.emoji || '✨',
      speed: Math.max(0.05, draft.speed || 1),
      loop: !!draft.loop,
      anims: draft.anims,
    };
    if (editing) {
      Object.assign(existing, normEmote(data));
      spawned.forEach((s) => { if (s._seq && s._seq.emote === existing) playEmote(s, existing); });
    } else {
      emotes.push(normEmote(data));
    }
    saveData();
    closeCreate();
  };
  btns.appendChild(cancel);
  btns.appendChild(save);
  wrap.appendChild(btns);

  renderList();
  return wrap;
}

function openEmoteManager() {
  hideEmoteMenu();
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  const render = () => {
    modal.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = 'Emotes';
    modal.appendChild(title);
    if (!emotes.length) {
      const msg = document.createElement('div');
      msg.className = 'empty-msg';
      msg.textContent = 'No emotes yet — create one!';
      modal.appendChild(msg);
    } else {
      const list = document.createElement('div');
      list.className = 'spawn-list';
emotes.forEach((em) => {
        const item = document.createElement('div');
        item.className = 'spawn-item';
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.textContent = em.emoji;
        const label = document.createElement('div');
        label.className = 'sname';
        label.textContent = em.name;
        const acts = document.createElement('div');
        acts.className = 'spawn-actions';
        const editB = document.createElement('button');
        editB.className = 's-btn';
        editB.textContent = '✎';
        editB.title = 'Edit';
        editB.onclick = (ev) => { ev.stopPropagation(); openCreateEmote(em); };
        const delB = document.createElement('button');
        delB.className = 's-btn del';
        delB.textContent = '✕';
        delB.title = 'Delete';
        delB.onclick = (ev) => {
          ev.stopPropagation();
          if (confirm('Delete "' + em.name + '"?')) { deleteEmote(em); render(); }
        };
        acts.appendChild(editB);
        acts.appendChild(delB);
        item.appendChild(dot);
        item.appendChild(label);
        item.appendChild(acts);
        list.appendChild(item);
      });
      modal.appendChild(list);
    }
    const btns = document.createElement('div');
    btns.className = 'modal-btns';
    const newB = document.createElement('button');
    newB.className = 'm-btn primary';
    newB.textContent = 'New emote';
    newB.onclick = () => openCreateEmote();
    const close = document.createElement('button');
    close.className = 'm-btn ghost';
    close.textContent = 'Close';
    close.onclick = closeCreate;
    btns.appendChild(newB);
    btns.appendChild(close);
    modal.appendChild(btns);
  };
  render();
}

function deleteEmote(e) {
  const i = emotes.indexOf(e);
  if (i !== -1) emotes.splice(i, 1);
  spawned.forEach((s) => { if (s._seq && s._seq.emote === e) emoteStop(s); });
  saveData();
}

// ---------- Spawn modal ----------
function openSpawn(baby) {
  const showList = () => {
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = baby ? 'Spawn Baby' : 'Spawn Character';
    modal.appendChild(title);
    if (characters.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'empty-msg';
      msg.textContent = 'No characters yet — create one first!';
      modal.appendChild(msg);
      const btns = document.createElement('div');
      btns.className = 'modal-btns';
      const cancel = document.createElement('button');
      cancel.className = 'm-btn ghost';
      cancel.textContent = 'Close';
      cancel.onclick = closeCreate;
      btns.appendChild(cancel);
      modal.appendChild(btns);
      return;
    }
    const list = document.createElement('div');
    list.className = 'spawn-list';
    characters.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'spawn-item';
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.classList.toggle('no-background', c.backgroundEnabled === false);
      dot.style.background = c.backgroundEnabled === false ? 'transparent' : c.color;
      dot.textContent = c.face;
      const label = document.createElement('div');
      label.className = 'sname';
      label.textContent = c.name;
      const acts = document.createElement('div');
      acts.className = 'spawn-actions';
      const editB = document.createElement('button');
      editB.className = 's-btn';
      editB.textContent = '✎';
      editB.title = 'Edit';
      editB.onclick = (e) => { e.stopPropagation(); openCreate(c); };
      const cloneB = document.createElement('button');
      cloneB.className = 's-btn';
      cloneB.textContent = '⧉';
      cloneB.title = 'Clone';
      cloneB.onclick = (e) => { e.stopPropagation(); cloneCharacter(c); showList(); };
      const delB = document.createElement('button');
      delB.className = 's-btn del';
      delB.textContent = '✕';
      delB.title = 'Delete';
      delB.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete "' + c.name + '"?')) {
          deleteCharacter(c);
          showList();
        }
      };
      acts.appendChild(editB);
      acts.appendChild(cloneB);
      acts.appendChild(delB);
      item.appendChild(dot);
      item.appendChild(label);
      item.appendChild(acts);
      item.onclick = () => {
        spawnCharacter(c, baby);
        closeCreate();
      };
      list.appendChild(item);
    });
    modal.appendChild(list);
    const btns = document.createElement('div');
    btns.className = 'modal-btns';
    const cancel = document.createElement('button');
    cancel.className = 'm-btn ghost';
    cancel.textContent = 'Close';
    cancel.onclick = closeCreate;
    btns.appendChild(cancel);
    modal.appendChild(btns);
  };
  showList();
}

// ---------- Spawning & physics ----------
// ---------- Spawning & physics ----------

function spawnCharacter(char, baby) {
  const isFood = isFoodLike(char);
  const size = baby ? 45 : (isFood ? 58 : 90);
  const el = document.createElement('div');
  el.className = 'character';
  el.style.background = char.backgroundEnabled === false ? 'transparent' : char.color;
  el.classList.toggle('no-background', char.backgroundEnabled === false);
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = char.face;
  label.style.color = char.textColor || DEFAULT_TEXT;
  label.style.fontSize = ((baby ? 15 : (isFood ? 20 : 30)) * emojiSizeScale(char.faceSize)) + 'px';
  label.style.transform = rotStyle(char.rotate, char.rotateLeft, char.rotateFlip);
  el.appendChild(label);
  const ovLayer = document.createElement('div');
  ovLayer.className = 'ov-layer';
  el.appendChild(ovLayer);

  const bw = sandbox.clientWidth;
  const bh = sandbox.clientHeight;
  const x = size / 2 + Math.random() * Math.max(0, bw - size);
  const y = size / 2 + Math.random() * Math.max(0, bh - size);

  const s = {
    el, char, ovLayer,
    w: size, h: size,
    x, y,
    vx: (Math.random() - 0.5) * 1.6,
    vy: (Math.random() - 0.5) * 1.6,
    repeatEmote: null,
    dragging: false,
    baby: !!baby,
    curFace: char,
    face: char.face,
    nextRandom: Date.now() + 3000 + Math.random() * 4000,
    nextDecision: Date.now(),
  };
  el.style.left = s.x + 'px';
  el.style.top = s.y + 'px';

  sandbox.appendChild(el);
  spawned.push(s);
  renderOverlays(s);

  makeDraggable(s);
  bindDblClick(s);

  el.addEventListener('dblclick', (e) => { e.stopPropagation(); openEmoteMenu(s, e); });
  el.addEventListener('touchstart', (e) => {
    // approximate double-tap
    const now = Date.now();
    if (s._lastTap && now - s._lastTap < 350) {
      e.preventDefault();
      openEmoteMenu(s, { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, stopPropagation(){} });
      s._lastTap = 0;
    } else {
      s._lastTap = now;
    }
  }, { passive: false });

  return s;
}

// ---------- Dragging ----------
function makeDraggable(s) {
  let offX = 0, offY = 0, moved = false;
  const onDown = (e) => {
    if (e.type === 'touchstart') return; // handled by touch flow
    e.preventDefault();
    moved = false;
    offX = e.clientX - s.x;
    offY = e.clientY - s.y;
    s.dragging = true;
    s.el.classList.add('dragging');
    const onMove = (me) => {
      moved = true;
      moveTo(s, me.clientX - offX, me.clientY - offY);
    };
    const onUp = () => {
      s.dragging = false;
      s.el.classList.remove('dragging');
      if (!moved) {
        // treat as click -> could open emote on single click? no, keep double
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dropFoodOn(s);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  s.el.addEventListener('mousedown', onDown);

  s.el.addEventListener('touchstart', () => {}, { passive: false });
  s.el.addEventListener('touchmove', (e) => {
    s.el._touchDrag = true;
    e.preventDefault();
    const t = e.touches[0];
    moveTo(s, t.clientX, t.clientY);
  }, { passive: false });
  s.el.addEventListener('touchend', () => {
    s.el._touchDrag = false;
    dropFoodOn(s);
  });
}

function moveTo(s, x, y) {
  s.x = x;
  s.y = y;
  s.el.style.left = x + 'px';
  s.el.style.top = y + 'px';
}

// ---------- Double click -> emote menu ----------
function bindDblClick(s) {
  s.el._dbl = () => openEmoteMenu(s, { clientX: 0, clientY: 0, stopPropagation(){} });
}

function setFace(s, faceDef) {
  s.curFace = faceDef;
  const label = s.el.querySelector('.label');
  label.textContent = faceDef.emoji;
  label.style.transform = rotStyle(faceDef.rotate, faceDef.rotateLeft, faceDef.rotateFlip);
  label.style.color = faceDef.textColor || DEFAULT_TEXT;
  label.style.fontSize = ((s.baby ? 15 : (isFoodLike(s.char) ? 20 : 30)) * emojiSizeScale(faceDef.size || 'medium')) + 'px';
  renderOverlays(s);
}

function tempFaceDef(s, emoji) {
  return {
    emoji,
    textColor: s.char.textColor || DEFAULT_TEXT,
    rotate: s.char.rotate,
    rotateLeft: s.char.rotateLeft,
    rotateFlip: s.char.rotateFlip,
    size: s.char.faceSize || 'medium',
    overlays: s.char.overlays || [],
  };
}

function specialFaceDef(s, key) {
  const v = s.char[key];
  if (!v) return null;
  if (typeof v === 'string') {
    if (!v) return null;
    return { emoji: v, textColor: s.char.textColor || DEFAULT_TEXT, size: 'medium', rotate: s.char.rotate, rotateLeft: s.char.rotateLeft, rotateFlip: s.char.rotateFlip, overlays: s.char.overlays || [] };
  }
  if (!v.emoji) return null;
  return { emoji: v.emoji, textColor: v.textColor || DEFAULT_TEXT, size: v.size || 'medium', rotate: !!v.rotate, rotateLeft: !!v.rotateLeft, rotateFlip: !!v.rotateFlip, overlays: v.overlays || [] };
}

function mainFaceDef(s) {
  return {
    emoji: s.char.face,
    textColor: s.char.textColor,
    size: s.char.faceSize || 'medium',
    rotate: s.char.rotate,
    rotateLeft: s.char.rotateLeft,
    rotateFlip: s.char.rotateFlip,
    overlays: s.char.overlays,
  };
}

function clearFaceTimer(s) {
  if (s._faceTimer) { clearTimeout(s._faceTimer); s._faceTimer = null; }
}

function restoreFace(s) {
  clearFaceTimer(s);
  if (s._prevFace) {
    setFace(s, s._prevFace);
    s._prevFace = null;
  } else {
    setFace(s, mainFaceDef(s));
  }
}

function resetFaceOverride(s) {
  clearFaceTimer(s);
  s._prevFace = null;
}

function renderOverlays(s) {
  if (!s.ovLayer) return;
  s.ovLayer.innerHTML = '';
  ((s.curFace || s.char).overlays || []).forEach((ov) => {
    const ovEl = document.createElement('div');
    ovEl.className = 'overlay';
    ovEl.textContent = ov.emoji;
    ovEl.style.color = ov.textColor || DEFAULT_TEXT;
    ovEl.style.fontSize = ((s.baby ? 15 : (isFoodLike(s.char) ? 20 : 30)) * emojiSizeScale(ov.size)) + 'px';
    const p = overlayPosStyle(ov.pos);
    ovEl.style.left = p.left;
    ovEl.style.top = p.top;
    ovEl.style.transform = 'translate(-50%,-50%) ' + rotStyle(ov.rotate, ov.rotateLeft, ov.rotateFlip);
    s.ovLayer.appendChild(ovEl);
  });
}

function refreshSpawnedVisual(s) {
  const size = s.baby ? 45 : (isFoodLike(s.char) ? 58 : 90);
  s.w = size;
  s.h = size;
  s.el.style.width = size + 'px';
  s.el.style.height = size + 'px';
  s.el.style.background = s.char.backgroundEnabled === false ? 'transparent' : s.char.color;
  s.el.classList.toggle('no-background', s.char.backgroundEnabled === false);
  const label = s.el.querySelector('.label');
  if (label) {
    label.textContent = s.char.face;
    label.style.color = s.char.textColor || DEFAULT_TEXT;
    label.style.fontSize = ((s.baby ? 15 : (isFoodLike(s.char) ? 20 : 30)) * emojiSizeScale(s.char.faceSize)) + 'px';
    label.style.transform = rotStyle(s.char.rotate, s.char.rotateLeft, s.char.rotateFlip);
  }
  s.curFace = s.char;
  renderOverlays(s);
}

function openEmoteMenu(s, ev) {
  if (ev.stopPropagation) ev.stopPropagation();
  emoteMenu.innerHTML = '';
  emoteMenu.classList.remove('hidden');

  // faces section
  const faceItems = [];
  faceItems.push({
    icon: s.char.face,
    label: 'Main face',
    action: () => { resetFaceOverride(s); setFace(s, mainFaceDef(s)); },
  });
  s.char.faces.forEach((f) => {
    faceItems.push({ icon: f.emoji, name: f.name, action: () => { resetFaceOverride(s); setFace(s, f); } });
  });

  if (faceItems.length > 1) {
    const sec = document.createElement('div');
    sec.className = 'emote-section';
    sec.textContent = 'Faces';
    emoteMenu.appendChild(sec);
  }
  faceItems.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'emote-item';
    const ic = document.createElement('div');
    ic.className = 'e-icon';
    ic.textContent = f.icon;
    const lbl = document.createElement('div');
    lbl.textContent = f.name || f.label;
    item.appendChild(ic);
    item.appendChild(lbl);
    item.onclick = () => { f.action(); hideEmoteMenu(); };
    emoteMenu.appendChild(item);
  });

  const sep = document.createElement('div');
  sep.className = 'emote-sep';
  emoteMenu.appendChild(sep);

  const sec2 = document.createElement('div');
  sec2.className = 'emote-section';
  sec2.textContent = 'Actions';
  emoteMenu.appendChild(sec2);

  const actions = [
    { icon: '💃', label: 'Dance', action: () => emoteDance(s) },
    { icon: '🪩', label: 'Slow dance', action: () => emoteSlowDance(s) },
    { icon: '🦘', label: 'Jump', action: () => emoteJump(s) },
    { icon: '🌀', label: 'Shake', action: () => emoteShake(s) },
    { icon: '🍪', label: 'Eat', action: () => emoteEat(s) },
    { icon: '😴', label: 'Sleep', action: () => emoteSleep(s) },
    { icon: '🔁', label: 'Spin', action: () => emoteSpin(s) },
  ];
  if (s.baby) actions.push({ icon: '🌱', label: 'Grow', action: () => emoteGrow(s) });
  actions.push({ icon: '🗑', label: 'Delete', action: () => removeSpawned(s) });
  actions.forEach((a) => {
    const item = document.createElement('div');
    item.className = 'emote-item';
    const ic = document.createElement('div');
    ic.className = 'e-icon';
    ic.textContent = a.icon;
    const lbl = document.createElement('div');
    lbl.textContent = a.label;
    item.appendChild(ic);
    item.appendChild(lbl);
    item.onclick = () => { a.action(); hideEmoteMenu(); };
    emoteMenu.appendChild(item);
  });

  const sepE = document.createElement('div');
  sepE.className = 'emote-sep';
  emoteMenu.appendChild(sepE);

  const secE = document.createElement('div');
  secE.className = 'emote-section';
  secE.textContent = 'Emotes';
  emoteMenu.appendChild(secE);

  emotes.forEach((e) => {
    const item = document.createElement('div');
    item.className = 'emote-item';
    const ic = document.createElement('div');
    ic.className = 'e-icon';
    ic.textContent = e.emoji;
    const lbl = document.createElement('div');
    lbl.textContent = e.name;
    item.appendChild(ic);
    item.appendChild(lbl);
    item.onclick = () => { playEmote(s, e); hideEmoteMenu(); };
    emoteMenu.appendChild(item);
  });

  const mgr = document.createElement('div');
  mgr.className = 'emote-item';
  const mic = document.createElement('div');
  mic.className = 'e-icon';
  mic.textContent = '⚙';
  const mlbl = document.createElement('div');
  mlbl.textContent = 'Edit emotes';
  mgr.appendChild(mic);
  mgr.appendChild(mlbl);
  mgr.onclick = () => { openEmoteManager(); };
  emoteMenu.appendChild(mgr);

  const sep2 = document.createElement('div');
  sep2.className = 'emote-sep';
  emoteMenu.appendChild(sep2);

  const stop = document.createElement('div');
  stop.className = 'emote-item';
  const sic = document.createElement('div');
  sic.className = 'e-icon';
  sic.textContent = '⏹';
  const slbl = document.createElement('div');
  slbl.textContent = 'Stop';
  stop.appendChild(sic);
  stop.appendChild(slbl);
  stop.onclick = () => { emoteStop(s); hideEmoteMenu(); };
  emoteMenu.appendChild(stop);

  // position menu
  const mw = emoteMenu.offsetWidth;
  const mh = emoteMenu.offsetHeight;
  let px = ev.clientX, py = ev.clientY;
  const maxX = window.innerWidth - mw - 8;
  const maxY = window.innerHeight - 72 - mh - 8;
  if (px > maxX) px = maxX;
  if (py > maxY) py = maxY;
  if (px < 8) px = 8;
  if (py < 8) py = 8;
  emoteMenu.style.left = px + 'px';
  emoteMenu.style.top = py + 'px';
}

function hideEmoteMenu() {
  emoteMenu.classList.add('hidden');
}

// ---------- Emotes ----------
function stopRepeat(s) {
  s.el.classList.remove('emote-dance');
  s.el.classList.remove('emote-slowdance');
  s.el.classList.remove('emote-shake');
  s.el.classList.remove('emote-jump');
  s.el.classList.remove('emote-spin');
  s.el.getAnimations().forEach((a) => a.cancel());
  s.el.querySelectorAll('.float').forEach((f) => f.remove());
  s.repeatEmote = null;
  stopSeq(s);
}function emoteDance(s) {
  stopRepeat(s);
  s.repeatEmote = 'dance';
  s.el.classList.add('emote-dance');
}

function emoteSlowDance(s) {
  stopRepeat(s);
  s.repeatEmote = 'slowdance';
  s.el.classList.add('emote-slowdance');
}

function emoteShake(s) {
  stopRepeat(s);
  s.repeatEmote = 'shake';
  s.el.classList.add('emote-shake');
}

function emoteJump(s) {
  stopRepeat(s);
  s.el.classList.remove('emote-jump');
  void s.el.offsetWidth;
  s.el.classList.add('emote-jump');
}

function emoteEat(s) {
  stopRepeat(s);
  clearFaceTimer(s);
  if (!s._prevFace) s._prevFace = s.curFace && s.curFace.emoji !== undefined ? s.curFace : mainFaceDef(s);
  const eatFd = specialFaceDef(s, 'eatFace');
  if (eatFd) setFace(s, eatFd);
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      const crumb = document.createElement('div');
      crumb.className = 'crumb';
      const sx = (Math.random() - 0.5) * 60;
      const sy = (Math.random() - 0.5) * 40;
      crumb.style.left = (s.x + sx) + 'px';
      crumb.style.top = (s.y + sy) + 'px';
      crumb.style.animationDuration = (0.7 + Math.random() * 0.6) + 's';
      crumb.style.animationDelay = (Math.random() * 0.15) + 's';
      // start at top of char, fall down
      sandbox.appendChild(crumb);
      crumb.addEventListener('animationend', () => crumb.remove());
    }, i * 120);
  }
  s._faceTimer = setTimeout(() => restoreFace(s), 1500);
}

function emoteSleep(s) {
  stopRepeat(s);
  clearFaceTimer(s);
  if (!s._prevFace) s._prevFace = s.curFace && s.curFace.emoji !== undefined ? s.curFace : mainFaceDef(s);
  const sleepFd = specialFaceDef(s, 'sleepFace');
  if (sleepFd) setFace(s, sleepFd);
  s.repeatEmote = 'sleep';
  const spawnZ = () => {
    if (s.repeatEmote !== 'sleep') return;
    const z = document.createElement('div');
    z.className = 'float';
    z.textContent = 'Z';
    z.style.left = (s.x + 25 + Math.random() * 25) + 'px';
    z.style.top = (s.y - 15) + 'px';
    sandbox.appendChild(z);
    z.addEventListener('animationend', () => z.remove());
  };
  spawnZ();
  s._sleepTimer = setInterval(spawnZ, 500);
}

function emoteSpin(s) {
  stopRepeat(s);
  const el = s.el;
  el.classList.remove('emote-dance', 'emote-shake');
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(
    [
      { transform: 'translate(-50%, -50%) rotate(0deg)' },
      { transform: 'translate(-50%, -50%) rotate(360deg)' },
    ],
    { duration: 700, iterations: 1, easing: 'linear' }
  );
}

function emoteGrow(s) {
  if (!s.baby) return;
  if (s._sleepTimer) { clearInterval(s._sleepTimer); s._sleepTimer = null; }
  stopRepeat(s);
  clearFaceTimer(s);
  const isFood = isFoodLike(s.char);
  const size = isFood ? 58 : 90;
  s.baby = false;
  s.w = size;
  s.h = size;
  s.el.style.width = size + 'px';
  s.el.style.height = size + 'px';
  const label = s.el.querySelector('.label');
  label.style.fontSize = ((isFood ? 20 : 30) * emojiSizeScale(s.char.faceSize)) + 'px';
  renderOverlays(s);
  s.el.classList.remove('emote-grow');
  void s.el.offsetWidth;
  s.el.classList.add('emote-grow');
  setTimeout(() => s.el.classList.remove('emote-grow'), 500);
}

function randomOneShot(s) {
  const options = [];
  if (s.char.faces && s.char.faces.length) {
    s.char.faces.forEach((f) => options.push(() => emoteFaceBrief(s, f.emoji)));
  }
  options.push(() => emoteDanceBrief(s));
  options.push(() => emoteSlowDanceBrief(s));
  options.push(() => emoteJump(s));
  options.push(() => emoteShakeBrief(s));
  options.push(() => emoteEat(s));
  options.push(() => emoteSleepBrief(s));
  options.push(() => emoteSpin(s));
  options[Math.floor(Math.random() * options.length)]();
}

function emoteFaceBrief(s, emoji) {
  stopRepeat(s);
  clearFaceTimer(s);
  if (!s._prevFace) s._prevFace = s.curFace && s.curFace.emoji !== undefined ? s.curFace : mainFaceDef(s);
  setFace(s, tempFaceDef(s, emoji));
  s._faceTimer = setTimeout(() => restoreFace(s), 1600 + Math.random() * 1000);
}

function emoteDanceBrief(s) {
  stopRepeat(s);
  s.repeatEmote = 'dance';
  s.el.classList.add('emote-dance');
  setTimeout(() => {
    if (s.repeatEmote === 'dance') {
      s.el.classList.remove('emote-dance');
      s.repeatEmote = null;
    }
  }, 1200);
}

function emoteSlowDanceBrief(s) {
  stopRepeat(s);
  s.repeatEmote = 'slowdance';
  s.el.classList.add('emote-slowdance');
  setTimeout(() => {
    if (s.repeatEmote === 'slowdance') {
      s.el.classList.remove('emote-slowdance');
      s.repeatEmote = null;
    }
  }, 1200);
}

function emoteShakeBrief(s) {
  stopRepeat(s);
  s.repeatEmote = 'shake';
  s.el.classList.add('emote-shake');
  setTimeout(() => {
    if (s.repeatEmote === 'shake') {
      s.el.classList.remove('emote-shake');
      s.repeatEmote = null;
    }
  }, 1000);
}

function emoteSleepBrief(s) {
  emoteSleep(s);
  setTimeout(() => emoteStop(s), 2000 + Math.random() * 1500);
}

function emoteStop(s) {
  if (s._sleepTimer) { clearInterval(s._sleepTimer); s._sleepTimer = null; }
  stopRepeat(s);
  restoreFace(s);
  s.nextRandom = Date.now() + 3000 + Math.random() * 5000;
}

// ---------- Custom emote sequence engine ----------
function emoteFaceFor(s, emote) {
  if (!emote || !s.char || !s.char.emoteFaces) return null;
  const v = s.char.emoteFaces[emote.id];
  if (!v) return null;
  if (typeof v === 'string') {
    if (!v) return null;
    return { emoji: v, textColor: s.char.textColor || DEFAULT_TEXT, size: 'medium', rotate: s.char.rotate, rotateLeft: s.char.rotateLeft, rotateFlip: s.char.rotateFlip, overlays: s.char.overlays || [] };
  }
  if (!v.emoji) return null;
  return { emoji: v.emoji, textColor: v.textColor || DEFAULT_TEXT, size: v.size || 'medium', rotate: !!v.rotate, rotateLeft: !!v.rotateLeft, rotateFlip: !!v.rotateFlip, overlays: v.overlays || [] };
}

function playEmote(s, emote) {
  const startedFace = s.curFace && s.curFace.emoji !== undefined ? s.curFace : mainFaceDef(s);
  const emoteFace = emoteFaceFor(s, emote);
  emoteStop(s);
  if (emoteFace) {
    setFace(s, emoteFace);
    s._prevFace = startedFace;
  } else if (startedFace) {
    setFace(s, startedFace);
    s._prevFace = startedFace;
  }
  s._seq = { emote, index: 0, active: true, anims: [], timers: [], particles: [] };
  s.customEmote = true;
  advanceSeq(s);
}

function stopSeq(s) {
  if (s._seq) {
    clearSeqVisuals(s, s._seq);
    s._seq = null;
  }
  s.customEmote = false;
}

function clearSeqVisuals(s, seq) {
  if (seq) {
    seq.active = false;
    seq.anims.forEach((a) => { try { a.cancel(); } catch (e) {} });
    seq.timers.forEach((t) => clearTimeout(t));
    seq.particles.forEach((p) => p.remove());
    seq.anims = [];
    seq.timers = [];
    seq.particles = [];
  }
  s.el.classList.remove('emote-dance', 'emote-shake');
  s.el.style.animationDuration = '';
}

function advanceSeq(s) {
  const seq = s._seq;
  if (!seq || !seq.active) return;
  clearSeqVisuals(s, seq);
  seq.active = true;
  const anims = seq.emote.anims || [];
  if (!anims.length) { finishSeq(s); return; }
  if (seq.index >= anims.length) {
    if (seq.emote.loop) seq.index = 0;
    else { finishSeq(s); return; }
  }
  const step = anims[seq.index++];
  const spd = Math.max(0.05, seq.emote.speed || 1);
  const dur = stepDur(step) / spd;
  applyStep(s, seq, step, dur);
  seq.timers.push(setTimeout(() => advanceSeq(s), dur * 1000));
}

function finishSeq(s) {
  const seq = s._seq;
  if (!seq) return;
  clearSeqVisuals(s, seq);
  s._seq = null;
  s.customEmote = false;
  restoreFace(s);
}

function stepDur(step) {
  if (step.type === 'dance' || step.type === 'shake' || step.type === 'sleep') {
    const v = step.unit === 'ms' ? (step.duration || 1000) / 1000 : (step.duration || 1);
    return Math.max(0.1, v);
  }
  return STEP_BASE[step.type] || 0.6;
}

function applyStep(s, seq, step, dur) {
  const spd = Math.max(0.05, seq.emote.speed || 1);
  const ms = dur * 1000;
  switch (step.type) {
    case 'dance':
      s.el.classList.add('emote-dance');
      s.el.style.animationDuration = (0.35 / spd) + 's';
      break;
    case 'shake':
      s.el.classList.add('emote-shake');
      s.el.style.animationDuration = (0.06 / spd) + 's';
      break;
    case 'jump':
      seq.anims.push(s.el.animate(kfJump(s), { duration: ms, easing: 'ease-in-out' }));
      break;
    case 'spin':
      seq.anims.push(s.el.animate(kfSpin(), { duration: ms, easing: 'linear' }));
      break;
    case 'squeeze':
      seq.anims.push(s.el.animate(kfSqueeze(), { duration: ms, easing: 'ease-in-out' }));
      break;
    case 'reverseSqueeze':
      seq.anims.push(s.el.animate(kfReverseSqueeze(), { duration: ms, easing: 'ease-in-out' }));
      break;
    case 'goUp': seq.anims.push(s.el.animate(kfGo(s, 'up'), { duration: ms, easing: 'ease-in-out' })); break;
    case 'goDown': seq.anims.push(s.el.animate(kfGo(s, 'down'), { duration: ms, easing: 'ease-in-out' })); break;
    case 'goLeft': seq.anims.push(s.el.animate(kfGo(s, 'left'), { duration: ms, easing: 'ease-in-out' })); break;
    case 'goRight': seq.anims.push(s.el.animate(kfGo(s, 'right'), { duration: ms, easing: 'ease-in-out' })); break;
  }
  const eatOn = step.type === 'eat' || step.sub === 'eat';
  const sleepOn = step.type === 'sleep' || step.sub === 'sleep';
  if (eatOn) spawnCrumbsSeq(s, seq, dur, step.crumbColor);
  if (sleepOn) spawnZsSeq(s, seq, dur, step);
  if (eatOn || sleepOn) {
    if (step.changeFace !== false) setSeqFace(s, eatOn ? 'eatFace' : 'sleepFace');
  }
}

function setSeqFace(s, kind) {
  if (!s._prevFace) s._prevFace = s.curFace && s.curFace.emoji !== undefined ? s.curFace : mainFaceDef(s);
  const fd = specialFaceDef(s, kind);
  if (fd) setFace(s, fd);
}

function kfJump(s) {
  const dist = -Math.max(40, s.h * 1.4);
  return [
    { transform: 'translate(-50%,-50%) translateY(0)' },
    { transform: 'translate(-50%,-50%) translateY(' + dist + 'px)', offset: 0.5 },
    { transform: 'translate(-50%,-50%) translateY(0)' },
  ];
}
function kfSpin() {
  return [
    { transform: 'translate(-50%,-50%) rotate(0deg)' },
    { transform: 'translate(-50%,-50%) rotate(360deg)' },
  ];
}
function kfSqueeze() {
  return [
    { transform: 'translate(-50%,-50%) scale(1)' },
    { transform: 'translate(-50%,-50%) scale(0.45)', offset: 0.5 },
    { transform: 'translate(-50%,-50%) scale(1)' },
  ];
}
function kfReverseSqueeze() {
  return [
    { transform: 'translate(-50%,-50%) scale(1)' },
    { transform: 'translate(-50%,-50%) scale(1.35)', offset: 0.5 },
    { transform: 'translate(-50%,-50%) scale(1)' },
  ];
}
function kfGo(s, dir) {
  const dist = Math.max(30, s.h * 0.9);
  const m = dir === 'up' ? 'translateY(-' + dist + 'px)'
    : dir === 'down' ? 'translateY(' + dist + 'px)'
    : dir === 'left' ? 'translateX(-' + dist + 'px)'
    : 'translateX(' + dist + 'px)';
  return [
    { transform: 'translate(-50%,-50%)' },
    { transform: 'translate(-50%,-50%) ' + m, offset: 0.5 },
    { transform: 'translate(-50%,-50%)' },
  ];
}

function spawnCrumbsSeq(s, seq, dur, color) {
  const count = Math.max(1, Math.round(dur * 8));
  for (let i = 0; i < count; i++) {
    const t = (i / count) * dur * 1000;
    seq.timers.push(setTimeout(() => spawnCrumb(s, seq, color), t));
  }
}

function spawnCrumb(s, seq, color) {
  if (s._seq !== seq) return;
  const crumb = document.createElement('div');
  crumb.className = 'crumb';
  crumb.style.left = (s.x + (Math.random() - 0.5) * 60) + 'px';
  crumb.style.top = (s.y + (Math.random() - 0.5) * 40) + 'px';
  crumb.style.background = color || '#8b5a2b';
  crumb.style.animationDuration = (0.7 + Math.random() * 0.6) + 's';
  sandbox.appendChild(crumb);
  seq.particles.push(crumb);
  crumb.addEventListener('animationend', () => crumb.remove());
}

function spawnZsSeq(s, seq, dur, step) {
  const interval = 420;
  const count = Math.max(1, Math.round((dur * 1000) / interval));
  for (let i = 0; i < count; i++) {
    seq.timers.push(setTimeout(() => spawnZ(s, seq, step), i * interval));
  }
}

function spawnZ(s, seq, step) {
  if (s._seq !== seq) return;
  const z = document.createElement('div');
  z.className = 'float';
  z.textContent = step.zText || 'Z';
  z.style.color = step.zColor || DEFAULT_TEXT;
  const dir = step.zDir || 't';
  let left;
  if (dir === 'tl') left = s.x - 32 - Math.random() * 20;
  else if (dir === 'tr') left = s.x + 32 + Math.random() * 20;
  else left = s.x - 14 + Math.random() * 28;
  const top = s.y - 18 - Math.random() * 22;
  z.style.left = left + 'px';
  z.style.top = top + 'px';
  sandbox.appendChild(z);
  seq.particles.push(z);
  z.addEventListener('animationend', () => z.remove());
}

// ---------- Animation loop ----------
function tick() {
  const now = Date.now();
  for (const s of spawned) {
    if (s.dragging) continue;
    if (!autoMove) {
      s.el.style.left = s.x + 'px';
      s.el.style.top = s.y + 'px';
    }
    if (s.repeatEmote === 'sleep') continue;
    if (autoMove && !isFoodLike(s.char)) {
      if (now >= s.nextDecision) {
        if (Math.random() < 0.3) {
          s.vx = 0; s.vy = 0;
          s.nextDecision = now + 1500 + Math.random() * 3000;
        } else {
          const ang = Math.random() * Math.PI * 2;
          const spd = 0.4 + Math.random() * 1.0;
          s.vx = Math.cos(ang) * spd;
          s.vy = Math.sin(ang) * spd;
          s.nextDecision = now + 1000 + Math.random() * 3000;
        }
      }
      s.x += s.vx;
      s.y += s.vy;
      const bw = sandbox.clientWidth;
      const bh = sandbox.clientHeight;
      let hit = false;
      if (s.x < s.w / 2) { s.x = s.w / 2; hit = true; }
      if (s.x > bw - s.w / 2) { s.x = bw - s.w / 2; hit = true; }
      if (s.y < s.h / 2) { s.y = s.h / 2; hit = true; }
      if (s.y > bh - s.h / 2) { s.y = bh - s.h / 2; hit = true; }
      if (hit) {
        let ang = Math.random() * Math.PI * 2;
        let nx = Math.cos(ang), ny = Math.sin(ang);
        if (s.x <= s.w / 2) nx = Math.abs(nx);
        if (s.x >= bw - s.w / 2) nx = -Math.abs(nx);
        if (s.y <= s.h / 2) ny = Math.abs(ny);
        if (s.y >= bh - s.h / 2) ny = -Math.abs(ny);
        const spd = 0.4 + Math.random() * 1.0;
        s.vx = nx * spd;
        s.vy = ny * spd;
        s.nextDecision = now + 1000 + Math.random() * 3000;
      }
    }
    if (autoMove && randomEmote && !s.repeatEmote && !s.customEmote && now > s.nextRandom) {
      randomOneShot(s);
      s.nextRandom = now + 3000 + Math.random() * 5000;
    }
    s.el.style.left = s.x + 'px';
    s.el.style.top = s.y + 'px';
  }
  requestAnimationFrame(tick);
}

// ---------- Clear ----------
function removeSpawned(s) {
  if (s._sleepTimer) clearInterval(s._sleepTimer);
  s.el.remove();
  const i = spawned.indexOf(s);
  if (i !== -1) spawned.splice(i, 1);
}

function dropFoodOn(s) {
  if (s.char.type !== 'food') return;
  const r = s.el.getBoundingClientRect();
  for (const o of spawned) {
    if (o === s || o.char.type === 'food' || o.char.type === 'prop') continue;
    const r2 = o.el.getBoundingClientRect();
    const overlap = !(r.right < r2.left || r.left > r2.right || r.bottom < r2.top || r.top > r2.bottom);
    if (overlap) {
      removeSpawned(s);
      emoteEat(o);
      return;
    }
  }
}

function clearSandbox() {
  spawned.forEach((s) => {
    if (s._sleepTimer) clearInterval(s._sleepTimer);
    s.el.remove();
  });
  spawned = [];
  sandbox.querySelectorAll('.crumb, .float').forEach((n) => n.remove());
}

// ---------- Wire up buttons ----------
createBtn.onclick = () => { hideEmoteMenu(); openCreate(); };
createEmoteBtn.onclick = () => { hideEmoteMenu(); openCreateEmote(); };
spawnBtn.onclick = () => { hideEmoteMenu(); openSpawn(); };
spawnBabyBtn.onclick = () => { hideEmoteMenu(); openSpawn(true); };
clearBtn.onclick = () => { hideEmoteMenu(); clearSandbox(); };

autoMoveBtn.onclick = () => {
  autoMove = !autoMove;
  if (!autoMove) randomEmote = false;
  refreshToggles();
};

randomEmoteBtn.onclick = () => {
  if (!autoMove) { autoMove = true; }
  randomEmote = !randomEmote;
  refreshToggles();
};

function refreshToggles() {
  autoMoveBtn.classList.toggle('on', autoMove);
  autoMoveBtn.classList.toggle('off', !autoMove);
  randomEmoteBtn.classList.toggle('on', randomEmote && autoMove);
  randomEmoteBtn.classList.toggle('off', !(randomEmote && autoMove));
}

overlay.onclick = () => {
  closeCreate();
  hideEmoteMenu();
};

document.addEventListener('pointerdown', (e) => {
  // hide emote menu when clicking outside
  if (!emoteMenu.contains(e.target) && !emoteMenu.classList.contains('hidden') && !e.target.closest('.character')) {
    // allow clicks on character to reopen? just hide on outside
  }
});

// ---------- Init ----------
async function init() {
  await getUserId();
  await loadData();
  refreshToggles();
  requestAnimationFrame(tick);
}

init();
