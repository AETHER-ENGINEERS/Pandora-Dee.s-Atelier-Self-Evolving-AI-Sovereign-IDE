/*
  Mobile-friendly single-screen experience.
  Files: index.html, styles.css, app.js
*/

const qs = (s,el=document)=>el.querySelector(s);
const qsa = (s,el=document)=>Array.from(el.querySelectorAll(s));

/* ---------- Data Model & Persistence ---------- */
const STORAGE_KEY = 'zones_animals_v1';
const DEFAULT = {
  zones: [
    { id: newid(), name: 'Meadow', color: '#eaf8e8' },
    { id: newid(), name: 'Pond', color: '#e8f6ff' },
    { id: newid(), name: 'Forest', color: '#eef9f5' }
  ],
  animals: [
    // sample animal
  ],
  home: []
};

let state = load();

function newid(){ return Math.random().toString(36).slice(2,9); }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) { localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT)); return JSON.parse(JSON.stringify(DEFAULT)); }
  try { return JSON.parse(raw); } catch(e){ return JSON.parse(JSON.stringify(DEFAULT)); }
}

/* ---------- UI & Navigation ---------- */
const screen = qs('#screen');
const tabs = {
  zones: qs('#tab-zones'),
  animals: qs('#tab-animals'),
  enter: qs('#tab-enter'),
  home: qs('#tab-home')
};
Object.values(tabs).forEach(btn=>btn.addEventListener('click', ()=>switchTab(btn)));

function switchTab(btn){
  Object.values(tabs).forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(btn.id === 'tab-zones') renderZones();
  if(btn.id === 'tab-animals') renderAnimals();
  if(btn.id === 'tab-enter') renderEnter();
  if(btn.id === 'tab-home') renderHome();
}
switchTab(tabs.zones);

/* ---------- Render: Zones Tab ---------- */
function renderZones(){
  screen.innerHTML = '';
  const card = el('div','card');
  const header = el('div','header-row');
  header.innerHTML = `<div class="row"><strong>Zones</strong><div class="small" style="margin-left:8px">Create named zones with a color</div></div>`;
  const addBtn = elt('button','btn','Add');
  header.appendChild(addBtn);
  card.appendChild(header);

  const list = el('div','list');
  state.zones.forEach(z=>{
    const item = el('div','item');
    const left = el('div','row');
    const sw = document.createElement('div');
    sw.style.width='36px'; sw.style.height='36px'; sw.style.borderRadius='8px'; sw.style.background=z.color; sw.style.border='1px solid rgba(0,0,0,0.06)';
    left.appendChild(sw);
    const info = el('div');
    info.innerHTML = `<div style="font-weight:700">${escapeHtml(z.name)}</div>`;
    left.appendChild(info);
    item.appendChild(left);

    const controls = el('div','controls');
    const enter = elt('button','btn ghost','Enter');
    enter.addEventListener('click', ()=>enterZone(z.id));
    const edit = elt('button','btn ghost','Edit');
    edit.addEventListener('click', ()=>openZoneEditor(z));
    const del = elt('button','btn ghost','Del');
    del.addEventListener('click', ()=>{
      state.zones = state.zones.filter(x=>x.id!==z.id);
      // remove zone from animals spawn lists
      state.animals.forEach(a => a.spawnZones = (a.spawnZones||[]).filter(id=>id!==z.id));
      save(); renderZones();
    });
    controls.appendChild(enter);
    controls.appendChild(edit);
    controls.appendChild(del);
    item.appendChild(controls);
    list.appendChild(item);
  });

  card.appendChild(list);
  screen.appendChild(card);

  // Add editor area
  const editor = el('div','card');
  editor.innerHTML = `<div class="row"><strong>New Zone</strong><div class="small" style="margin-left:8px">Name & color</div></div>`;
  const inputs = el('div','inputs');
  const name = inputText('zone-name','');
  const color = inputColor('#fff','#cde');
  const create = elt('button','btn','Create');
  create.addEventListener('click', ()=>{
    const n = name.value.trim(); const c = color.value;
    if(!n) return toast('Name required');
    state.zones.push({ id:newid(), name:n, color:c });
    save(); name.value=''; renderZones();
  });
  inputs.appendChild(name);
  inputs.appendChild(color);
  inputs.appendChild(create);
  editor.appendChild(inputs);
  screen.appendChild(editor);

  // helpers
  addBtn.addEventListener('click', ()=>{ name.value=''; color.value='#fff'; renderZones(); window.scrollTo({top:0,behavior:'smooth'}); });
}

function openZoneEditor(zone){
  const modal = quickMenu(`<div style="padding:6px"><div style="font-weight:700">${escapeHtml(zone.name)}</div>
    <div class="small-text">Color</div>
    <input id="zcol" type="color" value="${zone.color}" style="margin-top:8px"/>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="savez" class="btn">Save</button>
      <button id="closez" class="btn ghost">Close</button>
    </div>
  </div>`);
  qs('#savez',modal).addEventListener('click', ()=>{
    zone.color = qs('#zcol',modal).value;
    save(); closeMenu(); renderZones();
  });
  qs('#closez',modal).addEventListener('click', ()=>closeMenu());
}

/* ---------- Render: Animals Tab ---------- */
function renderAnimals(){
  screen.innerHTML='';
  const card = el('div','card');
  const header = el('div','header-row');
  header.innerHTML = `<div class="row"><strong>Animal Types</strong><div class="small" style="margin-left:8px">Create animals and set spawn zones</div></div>`;
  const createBtn = elt('button','btn','New');
  header.appendChild(createBtn);
  card.appendChild(header);

  const list = el('div','list');
  state.animals.forEach(a=>{
    const item = el('div','item');
    const left = el('div','row');
    const pv = animalPreviewElement(a);
    left.appendChild(pv);
    const info = el('div');
    info.innerHTML = `<div style="font-weight:700">${escapeHtml(a.name)}</div><div class="small-text">${(a.spawnZones||[]).map(id=>zoneName(id)).join(', ') || 'No zones'}</div>`;
    left.appendChild(info);
    item.appendChild(left);

    const controls = el('div','controls');
    const edit = elt('button','btn ghost','Edit');
    edit.addEventListener('click', ()=>openAnimalEditor(a));
    const del = elt('button','btn ghost','Del');
    del.addEventListener('click', ()=>{ state.animals = state.animals.filter(x=>x.id!==a.id); save(); renderAnimals(); });
    controls.appendChild(edit); controls.appendChild(del);
    item.appendChild(controls);
    list.appendChild(item);
  });

  card.appendChild(list);
  screen.appendChild(card);

  // new animal form (supports found-in-zones or bred-only animals)
  const form = el('div','card');
  form.innerHTML = `<div class="row"><strong>Create Animal</strong><div class="small" style="margin-left:8px">Pick base emoji, accessory & spawn settings</div></div>`;
  const formInputs = el('div','inputs');
  const name = inputText('aname','');
  name.placeholder='Animal name';
  const base = inputText('abase','');
  base.placeholder='Base emoji (e.g. 🐶)';
  // accessory support: allow multiple accessory rows (emoji + size + position)
  function makeAccessoryRow(acc={emoji:'', size:'medium', pos:'right(on base)', flip:false}) {
    const row = el('div','inline');
    row.style.alignItems='center';
    const accInput = inputText('', acc.emoji || '');
    accInput.placeholder='Accessory emoji';
    accInput.style.minWidth='56px';
    const sizeSel = selectElement([
      'super small',
      'super small-smallest mix',
      'smallest',
      'smallest-small mix',
      'small',
      'small-medium mix',
      'medium',
      'medium-big mix',
      'big',
      'big-super big mix',
      'super big',
      'super big-bigger than base mix',
      'bigger than base'
    ], acc.size || 'medium');
    sizeSel.className = 'accessory-size';
    const posSel = selectElement([
      'left(off base)','left(on base)','middle','right(on base)','right(off base)',
      'top(on base)','top(off base)','bottom(on base)','bottom(off base)','top left(on base)','top left(off base)',
      'top right(on base)','top right(off base)','bottom left(on base)','bottom right(on base)','bottom left(off base)','bottom right(off base)'
    ], acc.pos || 'right(on base)');

    // upside-down toggle
    const flipLabel = document.createElement('label');
    flipLabel.className = 'tag';
    flipLabel.style.display = 'inline-flex';
    flipLabel.style.alignItems = 'center';
    flipLabel.style.gap = '6px';
    const flipInput = document.createElement('input');
    flipInput.type = 'checkbox';
    flipInput.checked = !!acc.flip;
    flipLabel.appendChild(flipInput);
    flipLabel.appendChild(document.createTextNode('Upside'));

    const del = elt('button','btn ghost','−');
    del.style.padding = '6px 8px';
    del.addEventListener('click', ()=>{ row.remove(); updateCreatorAccessoryScroll(); });
    row.appendChild(accInput); row.appendChild(sizeSel); row.appendChild(posSel); row.appendChild(flipLabel); row.appendChild(del);
    return row;
  }
  const accessoriesWrap = el('div');
  accessoriesWrap.innerHTML = `<div class="small-text">Accessories</div>`;
  const accessoriesList = el('div','inputs');
  accessoriesList.style.flexDirection='column';
  accessoriesList.style.gap='6px';
  accessoriesWrap.appendChild(accessoriesList);
  const addAccessoryBtn = elt('button','btn ghost','Add accessory');
  addAccessoryBtn.style.marginTop='6px';
  addAccessoryBtn.addEventListener('click', ()=>{ accessoriesList.appendChild(makeAccessoryRow()); });
  // seed one accessory input by default (keeps backward-like UX)
  accessoriesList.appendChild(makeAccessoryRow());
  accessoriesWrap.appendChild(addAccessoryBtn);

  // spawn type: found in zones OR bred
  const spawnType = selectElement(['found in zones','bred (requires parents)'],'found in zones');
  spawnType.style.minWidth='160px';

  // spawn zones multiselect checkboxes (wrapped so we can hide/show)
  const zonesWrap = el('div');
  zonesWrap.innerHTML = `<div class="small-text">Spawn in zones:</div>`;
  const zoneBox = el('div','select-grid');
  state.zones.forEach(z=>{
    const cb = document.createElement('label');
    cb.className='tag';
    const input = document.createElement('input');
    input.type='checkbox'; input.value=z.id; input.style.marginRight='6px';
    cb.appendChild(input); cb.appendChild(document.createTextNode(' '+z.name));
    zoneBox.appendChild(cb);
  });
  zonesWrap.appendChild(zoneBox);

  // parent selectors for bred type (hidden unless bred selected)
  const parentsWrap = el('div');
  parentsWrap.innerHTML = `<div class="small-text">Parents required</div>`;
  const parentA = selectElement(state.animals.map(a=>a.name), state.animals[0] ? state.animals[0].name : '');
  const parentB = selectElement(state.animals.map(a=>a.name), state.animals[0] ? state.animals[0].name : '');
  parentA.id = 'parent-a-select'; parentB.id = 'parent-b-select';
  // populate value attributes mapping to ids
  function fillParentOptions(sel){
    sel.innerHTML = '';
    state.animals.forEach(a=>{
      const opt = document.createElement('option'); opt.value = a.id; opt.textContent = a.name; sel.appendChild(opt);
    });
  }
  fillParentOptions(parentA); fillParentOptions(parentB);
  parentsWrap.appendChild(parentA); parentsWrap.appendChild(parentB);
  parentsWrap.style.display='none';

  const create = elt('button','btn','Create Animal');
  create.addEventListener('click', ()=>{
    const n = name.value.trim(), b = base.value.trim();
    if(!b) return toast('Base emoji required');
    const acc = accessory.value.trim()||null;
    const sz = sizeSelect.value;
    const pos = posSelect.value;
    const type = spawnType.value === 'bred (requires parents)' ? 'bred' : 'found';
    if(type === 'found'){
      if(!n) return toast('Name required for found animals');
      const spawnZones = Array.from(zoneBox.querySelectorAll('input:checked')).map(i=>i.value);
      state.animals.push({
        id:newid(), name:n, base:b, accessory:acc, accSize:sz, accPos:pos, spawnZones, spawnType:'found', parents:[], likes:[], dislikes:[], relationship:50
      });
    } else {
      // bred template: require two parents selected
      const pa = parentA.value; const pb = parentB.value;
      if(!pa || !pb) return toast('Select two parents');
      // name optional but useful for bred templates
      const nm = name.value.trim() || 'Breedable';
      state.animals.push({
        id:newid(), name:nm, base:b, accessory:acc, accSize:sz, accPos:pos, spawnZones:[], spawnType:'bred', parents:[pa,pb], likes:[], dislikes:[], relationship:50
      });
    }
    save(); name.value=''; base.value=''; accessory.value=''; renderAnimals();
  });

  // toggle visible controls based on spawn type
  spawnType.addEventListener('change', ()=>{
    if(spawnType.value === 'bred (requires parents)'){
      zonesWrap.style.display='none';
      // allow optional naming for bred templates (keep name visible)
      name.style.display='inline-block';
      parentsWrap.style.display='flex';
      // ensure parent lists are current
      fillParentOptions(parentA); fillParentOptions(parentB);
    } else {
      zonesWrap.style.display='';
      name.style.display='inline-block';
      parentsWrap.style.display='none';
    }
  });

  formInputs.appendChild(spawnType);
  formInputs.appendChild(name);
  formInputs.appendChild(base);
  formInputs.appendChild(accessoriesWrap);
  formInputs.appendChild(zonesWrap);
  formInputs.appendChild(parentsWrap);
  formInputs.appendChild(create);
  form.appendChild(formInputs);
  screen.appendChild(form);

  // create handler: collect accessories from accessoriesList
  create.addEventListener('click', ()=>{
    const n = name.value.trim(), b = base.value.trim();
    if(!b) return toast('Base emoji required');
    const type = spawnType.value === 'bred (requires parents)' ? 'bred' : 'found';
    // collect accessories
    const accRows = Array.from(accessoriesList.querySelectorAll('.inline'));
    const accessories = accRows.map(r=>{
      const inputs = r.querySelectorAll('input, select');
      const emoji = inputs[0]?.value.trim() || '';
      const size = inputs[1]?.value || 'medium';
      const pos = inputs[2]?.value || 'right(on base)';
      const flip = inputs[3] && inputs[3].type === 'checkbox' ? !!inputs[3].checked : false;
      return emoji ? { emoji, size, pos, flip } : null;
    }).filter(Boolean);

    const acc0 = accessories[0] || null;

    if(type === 'found'){
      if(!n) return toast('Name required for found animals');
      const spawnZones = Array.from(zoneBox.querySelectorAll('input:checked')).map(i=>i.value);
      state.animals.push({
        id:newid(), name:n, base:b, accessories, accessory: acc0 ? acc0.emoji : null, accSize: acc0 ? acc0.size : null, accPos: acc0 ? acc0.pos : null, spawnZones, spawnType:'found', parents:[], likes:[], dislikes:[], relationship:50
      });
    } else {
      // bred template: require two parents selected
      const pa = parentA.value; const pb = parentB.value;
      if(!pa || !pb) return toast('Select two parents');
      const nm = name.value.trim() || 'Breedable';
      state.animals.push({
        id:newid(), name:nm, base:b, accessories, accessory: acc0 ? acc0.emoji : null, accSize: acc0 ? acc0.size : null, accPos: acc0 ? acc0.pos : null, spawnZones:[], spawnType:'bred', parents:[pa,pb], likes:[], dislikes:[], relationship:50
      });
    }
    save(); name.value=''; base.value=''; // clear accessory rows
    accessoriesList.innerHTML=''; accessoriesList.appendChild(makeAccessoryRow());
    renderAnimals();
  });

}

/* ---------- Animal Editor (missing previously) ---------- */
function openAnimalEditor(animal){
  // build zones checkboxes
  const zonesOpts = state.zones.map(z=>{
    const checked = (animal.spawnZones||[]).includes(z.id) ? 'checked' : '';
    return `<label class="tag"><input type="checkbox" value="${z.id}" style="margin-right:6px" ${checked}/> ${escapeHtml(z.name)}</label>`;
  }).join('');

  // parent options (for bred templates)
  const parentOptions = state.animals.map(a=>`<option value="${a.id}" ${ (animal.parents||[]).includes(a.id) ? 'selected' : '' }>${escapeHtml(a.name)}</option>`).join('');

  // accessories HTML: render existing accessory rows if present, otherwise one blank
  const accs = (animal.accessories && animal.accessories.length) ? animal.accessories : (animal.accessory ? [{emoji:animal.accessory, size:animal.accSize || 'medium', pos:animal.accPos || 'right(on base)', flip: false}] : [{}]);
  const accRowsHtml = accs.map(a=>`<div class="acc-row inline" data-emoji="${escapeHtml(a.emoji||'')}" data-size="${escapeHtml(a.size||'medium')}" data-pos="${escapeHtml(a.pos||'right(on base)')}" data-flip="${a.flip ? '1' : '0'}"></div>`).join('');

  const html = `<div style="padding:8px">
    <div style="font-weight:700">Edit ${escapeHtml(animal.name || 'Animal')}</div>
    <div class="small-text">Modify type, accessories & spawn settings</div>
    <div style="margin-top:8px">
      <label class="small-text">Spawn type</label>
      <select id="edit-spawn-type" style="margin-top:6px;padding:8px;border-radius:8px;border:1px solid #eee">
        <option value="found" ${animal.spawnType !== 'bred' ? 'selected' : ''}>found in zones</option>
        <option value="bred" ${animal.spawnType === 'bred' ? 'selected' : ''}>bred (requires parents)</option>
      </select>
    </div>
    <input id="edit-aname" type="text" value="${escapeHtml(animal.name||'')}" style="margin-top:8px;padding:8px;border-radius:8px;border:1px solid #eee" />
    <input id="edit-abase" type="text" value="${escapeHtml(animal.base||'')}" style="margin-top:8px;padding:8px;border-radius:8px;border:1px solid #eee" />

    <div style="margin-top:8px" class="small-text">Accessories</div>
    <div id="edit-accessories" style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${accRowsHtml}</div>
    <div style="margin-top:6px;display:flex;gap:8px">
      <button id="edit-add-acc" class="btn ghost">Add accessory</button>
    </div>

    <div id="zones-section" class="small-text" style="margin-top:8px">Spawn in zones:</div>
    <div id="zones-grid" class="select-grid" style="margin-top:6px">${zonesOpts}</div>

    <div id="parents-section" style="margin-top:8px;display:${animal.spawnType === 'bred' ? 'block' : 'none'}">
      <div class="small-text">Parents (order not important)</div>
      <select id="parent-a">${parentOptions}</select>
      <select id="parent-b" style="margin-left:6px">${parentOptions}</select>
    </div>

    <div style="margin-top:10px;display:flex;gap:8px">
      <button id="edit-save" class="btn">Save</button>
      <button id="edit-close" class="btn ghost">Close</button>
      <button id="edit-delete" class="btn ghost" style="margin-left:auto">Delete</button>
    </div>
  </div>`;
  const m = quickMenu(html);

  // helper to create accessory row elements inside modal
  function makeAccRow(acc){
    const row = el('div','inline acc-row');
    row.style.gap='8px'; row.style.alignItems='center';
    const emoji = inputText('', acc.emoji || '');
    emoji.placeholder='🎀';
    emoji.style.minWidth='56px';
    const sizeSel = selectElement([
      'super small','super small-smallest mix','smallest','smallest-small mix','small','small-medium mix','medium','medium-big mix','big','big-super big mix','super big','super big-bigger than base mix','bigger than base'
    ], acc.size || 'medium');
    sizeSel.className='accessory-size';
    const posSel = selectElement([
      'left(off base)','left(on base)','middle','right(on base)','right(off base)',
      'top(on base)','top(off base)','bottom(on base)','bottom(off base)','top left(on base)','top left(off base)',
      'top right(on base)','top right(off base)','bottom left(on base)','bottom right(on base)','bottom left(off base)','bottom right(off base)'
    ], acc.pos || 'right(on base)');

    const flipLabel = document.createElement('label');
    flipLabel.className = 'tag';
    flipLabel.style.display = 'inline-flex';
    flipLabel.style.alignItems = 'center';
    flipLabel.style.gap = '6px';
    const flipInput = document.createElement('input');
    flipInput.type = 'checkbox';
    flipInput.checked = !!acc.flip;
    flipLabel.appendChild(flipInput);
    flipLabel.appendChild(document.createTextNode('Upside'));

    const del = elt('button','btn ghost','−');
    del.style.padding='6px 8px';
    del.addEventListener('click', ()=>{ row.remove(); updateEditAccessoryScroll(); });
    row.appendChild(emoji); row.appendChild(sizeSel); row.appendChild(posSel); row.appendChild(flipLabel); row.appendChild(del);
    return row;
  }

  // populate existing placeholder rows with real controls
  const container = qs('#edit-accessories', m);
  // make container scrollable-capable
  container.classList.remove('edit-accessories-scroll');
  // if placeholder divs exist, replace them (including flip state)
  Array.from(container.querySelectorAll('.acc-row')).forEach(ph=>{
    const acc = {
      emoji: ph.getAttribute('data-emoji') || '',
      size: ph.getAttribute('data-size') || 'medium',
      pos: ph.getAttribute('data-pos') || 'right(on base)',
      flip: ph.getAttribute('data-flip') === '1'
    };
    ph.replaceWith(makeAccRow(acc));
  });
  // add button handler
  qs('#edit-add-acc', m).addEventListener('click', ()=>{ container.appendChild(makeAccRow({})); updateEditAccessoryScroll(); });
  // update scroll on load and when rows change
  updateEditAccessoryScroll();
  function updateEditAccessoryScroll(){
    const count = container.querySelectorAll('.acc-row').length;
    if(count >= 3) container.classList.add('edit-accessories-scroll'); else container.classList.remove('edit-accessories-scroll');
  }

  // toggle UI sections based on spawn type
  qs('#edit-spawn-type', m).addEventListener('change', (e)=>{
    const v = e.target.value;
    qs('#zones-section',m).style.display = v === 'found' ? '' : 'none';
    qs('#zones-grid',m).style.display = v === 'found' ? '' : 'none';
    qs('#parents-section',m).style.display = v === 'bred' ? 'block' : 'none';
    qs('#edit-aname',m).style.display = v === 'bred' ? 'none' : 'inline-block';
  });

  qs('#edit-close', m).addEventListener('click', ()=>closeMenu());
  qs('#edit-delete', m).addEventListener('click', ()=>{
    if(confirm('Delete this animal type?')) {
      state.animals = state.animals.filter(x=>x.id !== animal.id);
      save(); closeMenu(); renderAnimals();
    }
  });
  qs('#edit-save', m).addEventListener('click', ()=>{
    const newSpawnType = qs('#edit-spawn-type', m).value;
    const newName = qs('#edit-aname', m).value.trim();
    const newBase = qs('#edit-abase', m).value.trim();
    const checkedZones = Array.from(m.querySelectorAll('#zones-grid input[type="checkbox"]:checked')).map(i=>i.value);
    const pa = qs('#parent-a', m) ? qs('#parent-a', m).value : null;
    const pb = qs('#parent-b', m) ? qs('#parent-b', m).value : null;

    if(newSpawnType === 'found' && (!newName || !newBase)) return toast('Name and base emoji required');
    if(newSpawnType === 'bred' && (!pa || !pb)) return toast('Select two parents');

    // collect accessories from rows
    const accRows = Array.from(container.querySelectorAll('.acc-row'));
    const accessories = accRows.map(r=>{
      const inputs = r.querySelectorAll('input, select');
      const emoji = inputs[0]?.value.trim() || '';
      const size = inputs[1]?.value || 'medium';
      const pos = inputs[2]?.value || 'right(on base)';
      // checkbox is expected at inputs[3]
      const flip = inputs[3] && inputs[3].type === 'checkbox' ? !!inputs[3].checked : false;
      return emoji ? { emoji, size, pos, flip } : null;
    }).filter(Boolean);

    // apply changes
    animal.spawnType = newSpawnType === 'bred' ? 'bred' : 'found';
    if(newSpawnType === 'found') {
      animal.name = newName;
      animal.spawnZones = checkedZones;
      animal.parents = [];
    } else {
      animal.parents = [pa,pb];
      if(newName) animal.name = newName;
      animal.spawnZones = [];
    }
    animal.base = newBase;
    // store accessories array; keep single-accessory fields for backward compatibility too
    animal.accessories = accessories;
    if(accessories.length){
      animal.accessory = accessories[0].emoji;
      animal.accSize = accessories[0].size;
      animal.accPos = accessories[0].pos;
    } else {
      animal.accessory = null;
      animal.accSize = null;
      animal.accPos = null;
    }
    save(); closeMenu(); renderAnimals();
  });
}

/* ---------- Render: Enter Zone (Play) ---------- */
function renderEnter(){
  screen.innerHTML='';
  const header = el('div','header-row card');
  header.innerHTML = `<div class="row"><strong>Enter Zone</strong><div class="small" style="margin-left:8px">Tap a zone to enter</div></div>`;
  const grid = el('div','list');
  state.zones.forEach(z=>{
    const item = el('div','item');
    const left = el('div','row');
    const sw = document.createElement('div');
    sw.style.width='44px'; sw.style.height='44px'; sw.style.borderRadius='8px'; sw.style.background=z.color; sw.style.border='1px solid rgba(0,0,0,0.06)';
    left.appendChild(sw);
    left.appendChild(el('div',null, `<div style="font-weight:700">${escapeHtml(z.name)}</div>`));
    item.appendChild(left);
    const enter = elt('button','btn','Enter');
    enter.addEventListener('click', ()=>enterZone(z.id));
    item.appendChild(enter);
    grid.appendChild(item);
  });
  screen.appendChild(header);
  screen.appendChild(grid);
}

/* ---------- Enter a Zone: background, spawn animals ---------- */
function enterZone(zoneId){
  const zone = state.zones.find(z=>z.id===zoneId);
  if(!zone) return toast('Zone not found');
  screen.innerHTML='';
  const zoneCard = el('div','card');
  const top = el('div','header-row');
  top.innerHTML = `<div class="row"><strong>${escapeHtml(zone.name)}</strong></div>`;
  const backBtn = elt('button','btn ghost','Back');
  backBtn.addEventListener('click', ()=>switchTab(tabs.enter));
  top.appendChild(backBtn);
  zoneCard.appendChild(top);

  const area = el('div','zone-area');
  area.style.background = zone.color;
  area.innerHTML = `<div>Tap an animal to bring it home</div>`;
  zoneCard.appendChild(area);
  screen.appendChild(zoneCard);

  // choose 3 random eligible animals (only those that are found in zones)
  const eligible = state.animals.filter(a => (a.spawnType !== 'bred') && ((a.spawnZones||[]).includes(zoneId)));
  const picks = shuffle(eligible).slice(0,3);
  const animalsWrap = el('div','zone-animals');
  picks.forEach(a=>{
    const sp = el('div','spawned center');
    const pv = animalPreviewElement(a);
    pv.style.fontSize='40px';
    sp.appendChild(pv);
    sp.addEventListener('click', ()=>onSpawnTap(a));
    animalsWrap.appendChild(sp);
  });
  screen.appendChild(animalsWrap);

  function onSpawnTap(animalType){
    // copy to new instance with name prompt
    const givenName = prompt('Name this animal (tap to bring home):', animalType.name) || animalType.name;
    const inst = {
      id:newid(), templateId:animalType.id, nickname:givenName, base:animalType.base, accessory:animalType.accessory, accSize:animalType.accSize, accPos:animalType.accPos, likes:[], dislikes:[], relationship:50
    };
    // add some starter likes/dislikes empty
    state.home.push(inst);
    save();
    toast(`${givenName} brought home`);
    switchTab(tabs.home);
  }
}

/* ---------- Home Tab (manage animals you own) ---------- */
function renderHome(){
  screen.innerHTML='';
  const header = el('div','header-row card');
  header.innerHTML = `<div class="row"><strong>Home</strong><div class="small" style="margin-left:8px">Tap an animal for options</div></div>`;
  const clearBtn = elt('button','btn ghost','Clear all');
  clearBtn.addEventListener('click', ()=>{ if(confirm('Release all animals?')){ state.home=[]; save(); renderHome(); }});
  header.appendChild(clearBtn);
  screen.appendChild(header);

  const listWrap = el('div','home-list');
  state.home.forEach((h, idx)=>{
    const t = state.animals.find(a=>a.id===h.templateId) || {};
    const box = el('div','item');
    box.style.width='30%'; box.style.minWidth='120px'; box.style.flex='0 0 auto';

    // Use the exact same preview element as used in the animals/creator views.
    const pv = animalPreviewElement({...t, base:h.base, accessory:h.accessory, accSize:h.accSize, accPos:h.accPos});
    // don't override pv styles so accessory positioning and sizing remain consistent
    const nameLine = el('div',null,`<div style="font-weight:700">${escapeHtml(h.nickname)}</div>`);
    box.appendChild(pv);
    box.appendChild(nameLine);

    const rel = el('div','badge'); rel.textContent = `❤ ${h.relationship ?? 50}`;
    box.appendChild(rel);

    box.addEventListener('click', ()=>openHomeMenu(h, idx));
    listWrap.appendChild(box);
  });
  screen.appendChild(listWrap);

  if(state.home.length===0){
    const empty = el('div','card center');
    empty.style.padding = '28px';
    empty.innerHTML = `<div class="small-text">No animals at home. Enter a zone to bring some home.</div>`;
    screen.appendChild(empty);
  }
}

/* ---------- Home animal actions ---------- */
function openHomeMenu(animal, index){
  const menu = el('div','menu card');
  menu.innerHTML = `<div style="font-weight:700">${escapeHtml(animal.nickname)}</div><div class="small-text">Relationship: ${animal.relationship}</div>`;
  const actions = el('div','inputs');
  const feedBtn = elt('button','btn','Feed');
  const actBtn = elt('button','btn ghost','Perform Action');
  const breedBtn = elt('button','btn','Breed');
  const releaseBtn = elt('button','btn ghost','Release');
  actions.appendChild(feedBtn); actions.appendChild(actBtn); actions.appendChild(breedBtn); actions.appendChild(releaseBtn);
  menu.appendChild(actions);
  document.body.appendChild(menu);

  feedBtn.addEventListener('click', ()=>{ closeFloating(); openFeedMenu(animal); });
  actBtn.addEventListener('click', ()=>{ closeFloating(); openActionMenu(animal); });
  breedBtn.addEventListener('click', ()=>{ closeFloating(); openBreedMenu(animal, index); });
  releaseBtn.addEventListener('click', ()=>{ if(confirm('Release this animal?')){ state.home.splice(index,1); save(); closeFloating(); renderHome(); }});
  function closeFloating(){ if(menu && menu.parentNode) menu.remove(); }
  // tap outside to close
  setTimeout(()=>document.addEventListener('click', outside));
  function outside(e){ if(!menu.contains(e.target)) { closeFloating(); document.removeEventListener('click', outside); } }
}

/* Feed Menu */
function openFeedMenu(animal){
  // helper to detect emoji-like entries (Extended Pictographic)
  const isEmoji = s => /\p{Extended_Pictographic}/u.test(String(s));
  const likes = (animal.likes || []).filter(isEmoji);
  const dislikes = (animal.dislikes || []).filter(isEmoji);
  const likesList = likes.length ? likes.join(' ') : 'None';
  const dislikesList = dislikes.length ? dislikes.join(' ') : 'None';
  const m = quickMenu(`<div style="padding:8px">
    <div style="font-weight:700">Feed ${escapeHtml(animal.nickname)}</div>
    <div class="small-text">Enter an emoji to feed</div>
    <div class="small-text" style="margin-top:8px"><strong>Likes:</strong> ${escapeHtml(likesList)}</div>
    <div class="small-text"><strong>Dislikes:</strong> ${escapeHtml(dislikesList)}</div>
    <input id="feed-emoji" type="text" placeholder="🍎" style="margin-top:8px;padding:8px;border-radius:8px;border:1px solid #eee" />
    <div style="margin-top:10px;display:flex;gap:8px">
      <button id="feed-go" class="btn">Feed</button>
      <button id="feed-close" class="btn ghost">Close</button>
    </div>
  </div>`);
  qs('#feed-go',m).addEventListener('click', ()=>{
    const val = qs('#feed-emoji',m).value.trim();
    if(!val) return toast('Enter emoji');
    applyLikeDislike(animal, val, true);
    closeMenu();
    save(); renderHome();
  });
  qs('#feed-close',m).addEventListener('click', ()=>closeMenu());
}

/* Action Menu (words, variable effect 1-10) */
function openActionMenu(animal){
  // helper to detect emoji-like entries (Extended Pictographic)
  const isEmoji = s => /\p{Extended_Pictographic}/u.test(String(s));
  // action menu shows non-emoji (word) likes/dislikes only
  const likes = (animal.likes || []).filter(s => !isEmoji(s));
  const dislikes = (animal.dislikes || []).filter(s => !isEmoji(s));
  const likesList = likes.length ? likes.join(', ') : 'None';
  const dislikesList = dislikes.length ? dislikes.join(', ') : 'None';
  const m = quickMenu(`<div style="padding:8px">
    <div style="font-weight:700">Perform action for ${escapeHtml(animal.nickname)}</div>
    <div class="small-text">Enter a word (e.g. dance)</div>
    <div class="small-text" style="margin-top:8px"><strong>Likes:</strong> ${escapeHtml(likesList)}</div>
    <div class="small-text"><strong>Dislikes:</strong> ${escapeHtml(dislikesList)}</div>
    <input id="act-word" type="text" placeholder="dance" style="margin-top:8px;padding:8px;border-radius:8px;border:1px solid #eee" />
    <div style="margin-top:10px;display:flex;gap:8px">
      <button id="act-go" class="btn">Do</button>
      <button id="act-close" class="btn ghost">Close</button>
    </div>
  </div>`);
  qs('#act-go',m).addEventListener('click', ()=>{
    const w = qs('#act-word',m).value.trim();
    if(!w) return toast('Enter word');
    // randomly decide like/dislike if not known; effect 1-10
    const amt = Math.floor(Math.random()*10)+1;
    applyLikeDislikeWord(animal, w, amt);
    closeMenu(); save(); renderHome();
  });
  qs('#act-close',m).addEventListener('click', ()=>closeMenu());
}

/* Breed Menu */
function openBreedMenu(animal, index){
  if(state.home.length < 2) return toast('Need another animal at home to breed');
  const others = state.home.filter(h=>h.id !== animal.id);
  const list = others.map(h=>`<option value="${h.id}">${escapeHtml(h.nickname)}</option>`).join('');
  const m = quickMenu(`<div style="padding:8px">
    <div style="font-weight:700">Breed ${escapeHtml(animal.nickname)}</div>
    <div class="small-text">Select partner</div>
    <select id="breed-select" style="margin-top:8px;padding:8px;border-radius:8px;border:1px solid #eee">${list}</select>
    <input id="breed-name" type="text" placeholder="Offspring name" style="margin-top:8px;padding:8px;border-radius:8px;border:1px solid #eee" />
    <div style="margin-top:10px;display:flex;gap:8px">
      <button id="breed-go" class="btn">Breed</button>
      <button id="breed-close" class="btn ghost">Close</button>
    </div>
  </div>`);
  qs('#breed-go',m).addEventListener('click', ()=>{
    const pid = qs('#breed-select',m).value;
    const partner = state.home.find(h=>h.id===pid);
    if(!partner) return toast('Partner missing');
    const name = qs('#breed-name',m).value.trim() || 'Baby';
    // offspring: base of one, accessory of other
    // check for breedable templates that match the two parents (order-insensitive)
    const paTemplate = animal.templateId;
    const pbTemplate = partner.templateId;
    const breedables = state.animals.filter(t=>{
      return t.spawnType === 'bred' && Array.isArray(t.parents) &&
        ((t.parents[0] === paTemplate && t.parents[1] === pbTemplate) || (t.parents[0] === pbTemplate && t.parents[1] === paTemplate));
    });
    if(breedables.length){
      // pick one at random if multiple templates exist for this parent pair
      const breedable = breedables[Math.floor(Math.random() * breedables.length)];
      const child = {
        id:newid(),
        templateId: breedable.id,
        nickname: name,
        base: breedable.base,
        accessory: breedable.accessory,
        accSize: breedable.accSize,
        accPos: breedable.accPos,
        likes: [], dislikes: [], relationship:50
      };
      state.home.push(child);
      save(); closeMenu(); renderHome(); toast(`${name} created (breedable)`); return;
    }

    // fallback mixed child (original behavior)
    const child = {
      id:newid(),
      templateId: animal.templateId,
      nickname: name,
      base: animal.base,
      accessory: partner.accessory || animal.accessory,
      accSize: partner.accSize || animal.accSize,
      accPos: partner.accPos || animal.accPos,
      likes: [], dislikes: [], relationship:50
    };
    state.home.push(child);
    save(); closeMenu(); renderHome(); toast(`${name} created`);
  });
  qs('#breed-close',m).addEventListener('click', ()=>closeMenu());
}

/* ---------- Helpers for likes/dislikes ---------- */
function applyLikeDislike(animal, emoji, isFeed){
  // check lists
  animal.likes = animal.likes || []; animal.dislikes = animal.dislikes || [];
  if(animal.likes.includes(emoji)){ animal.relationship = clamp((animal.relationship||50)+5,0,100); toast('Liked (+5)'); return; }
  if(animal.dislikes.includes(emoji)){ animal.relationship = clamp((animal.relationship||50)-5,0,100); toast('Disliked (-5)'); return; }
  // not known: randomly decide like/dislike then apply
  const like = Math.random() < 0.5;
  if(like) { animal.likes.push(emoji); animal.relationship = clamp((animal.relationship||50)+5,0,100); toast('Now likes (+5)'); }
  else { animal.dislikes.push(emoji); animal.relationship = clamp((animal.relationship||50)-5,0,100); toast('Now dislikes (-5)'); }
}

function applyLikeDislikeWord(animal, word, amt){
  animal.likes = animal.likes || []; animal.dislikes = animal.dislikes || [];
  if(animal.likes.includes(word)){ animal.relationship = clamp((animal.relationship||50)+amt,0,100); toast(`Liked (+${amt})`); return; }
  if(animal.dislikes.includes(word)){ animal.relationship = clamp((animal.relationship||50)-amt,0,100); toast(`Disliked (-${amt})`); return; }
  const like = Math.random() < 0.5;
  if(like){ animal.likes.push(word); animal.relationship = clamp((animal.relationship||50)+amt,0,100); toast(`Now likes (+${amt})`); }
  else { animal.dislikes.push(word); animal.relationship = clamp((animal.relationship||50)-amt,0,100); toast(`Now dislikes (-${amt})`); }
}

/* ---------- Small utilities ---------- */
function animalPreviewElement(a){
  const wrap = el('div','preview center');
  const base = document.createElement('div');
  base.textContent = a.base || '❓';
  base.style.fontSize = '40px';
  base.style.lineHeight='1';
  wrap.appendChild(base);

  // size mapping (normalized)
  const sizeMap = {
    'super small': 0.35,
    'super small-smallest mix': 0.325,
    'smallest': 0.3,
    'smallest-small mix': 0.425,
    'small': 0.5,
    'small-medium mix': 0.625,
    'medium': 0.75,
    'medium-big mix': 0.925,
    'big': 1.1,
    'big-super big mix': 1.35,
    'super big': 1.6,
    'super big-bigger than base mix': 1.8,
    'bigger than base': 2
  };

  // position map
  const posMap = {
    'middle':[50,50,'translate(-50%,-50%)'],
    'left(on base)':[18,50,'translate(-50%,-50%)'],
    'right(on base)':[82,50,'translate(-50%,-50%)'],
    'left(off base)':[0,50,'translate(-50%,-50%)'],
    'right(off base)':[100,50,'translate(-50%,-50%)'],
    'top(on base)':[50,12,'translate(-50%,-50%)'],
    'top(off base)':[50,4,'translate(-50%,-50%)'],
    'bottom(on base)':[50,88,'translate(-50%,-50%)'],
    'bottom(off base)':[50,100,'translate(-50%,-50%)'],
    'top left(on base)':[22,18,'translate(-50%,-50%)'],
    'top left(off base)':[4,4,'translate(-50%,-50%)'],
    'top right(on base)':[78,18,'translate(-50%,-50%)'],
    'top right(off base)':[96,4,'translate(-50%,-50%)'],
    'bottom left(on base)':[22,82,'translate(-50%,-50%)'],
    'bottom right(on base)':[78,82,'translate(-50%,-50%)'],
    'bottom left(off base)':[4,96,'translate(-50%,-50%)'],
    'bottom right(off base)':[96,96,'translate(-50%,-50%)']
  };

  // gather accessories: prefer accessories array, fall back to single fields for older data
  const accList = Array.isArray(a.accessories) && a.accessories.length ? a.accessories
    : (a.accessory ? [{emoji:a.accessory, size:a.accSize||'medium', pos:a.accPos||'right(on base)'}] : []);

  accList.forEach(accData=>{
    if(!accData || !accData.emoji) return;
    const acc = document.createElement('div');
    acc.className='accessory';
    acc.textContent = accData.emoji;

    const scale = sizeMap[String(accData.size || '').toLowerCase()] || 0.7;
    acc.style.fontSize = (40*scale)+'px';

    const rawPos = String(accData.pos || '').trim();
    const pos = (rawPos === '' ? 'right(on base)' : rawPos).toLowerCase().replace(/\s+/g,' ');
    const p = posMap[pos] || [82,50,'translate(-50%,-50%)'];
    const flip = !!accData.flip;
    acc.style.left = p[0] + '%'; acc.style.top = p[1] + '%'; acc.style.transform = p[2] + (flip ? ' rotate(180deg)' : '');

    wrap.appendChild(acc);
  });

  return wrap;
}

function selectElement(options, defaultVal){
  const s = document.createElement('select');
  options.forEach(o=>{
    const op = document.createElement('option'); op.value = o; op.textContent = o; s.appendChild(op);
  });
  s.value = defaultVal || options[0];
  return s;
}
function inputText(id, val=''){ const i=document.createElement('input'); i.type='text'; i.id=id; i.value=val; return i; }
function inputColor(val, placeholder){ const i=document.createElement('input'); i.type='color'; i.value=val||'#ffffff'; return i; }
function elt(tag, cls, txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt) e.textContent=txt; return e; }
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html) e.innerHTML=html; return e; }

function toast(txt){
  const t = el('div','card center');
  t.style.position='fixed'; t.style.left='8px'; t.style.right='8px'; t.style.bottom='140px'; t.style.zIndex=9999;
  t.innerHTML = `<div>${escapeHtml(txt)}</div>`;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),1400);
}

function quickMenu(innerHtml){
  closeMenu();
  const m = el('div','menu card');
  m.innerHTML = innerHtml;
  document.body.appendChild(m);
  return m;
}
function closeMenu(){ const el = document.querySelector('.menu'); if(el) el.remove(); }

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function shuffle(arr){ return arr.slice().sort(()=>Math.random()-0.5); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function zoneName(id){ const z = state.zones.find(z=>z.id===id); return z ? z.name : id; }

/* ---------- Init: seed some sample animals if none exist ---------- */
if(state.animals.length===0){
  state.animals.push({
    id:newid(), name:'Bunny', base:'🐰', accessories:[{emoji:'🎀', size:'small', pos:'top right(on base)'}], accessory:'🎀', accSize:'small', accPos:'top right(on base)', spawnZones: [state.zones[0].id], spawnType:'found', likes:['🥕'], dislikes:[], relationship:50
  });
  state.animals.push({
    id:newid(), name:'Frog', base:'🐸', accessories:[{emoji:'🧢', size:'small', pos:'top(on base)'}], accessory:'🧢', accSize:'small', accPos:'top(on base)', spawnZones: [state.zones[1].id], spawnType:'found', likes:[], dislikes:[], relationship:50
  });
  state.animals.push({
    id:newid(), name:'Fox', base:'🦊', accessories:[], accessory:null, accSize:'small', accPos:'right(on base)', spawnZones: [state.zones[2].id], spawnType:'found', likes:[], dislikes:[], relationship:50
  });
  save();
}

/* ensure safe back button behavior */
window.addEventListener('hashchange', ()=>{ /* no-op */ });

/* End of file */