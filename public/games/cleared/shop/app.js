/*
  Enhanced shop builder with:
  - Settings (coin name/symbol/starter, work name/message)
  - Item manager (edit/delete)
  - Full reset restores default settings, regular reset keeps settings
*/

const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));

/* Default settings */
const DEFAULT_SETTINGS = {
  coinName: 'Coins',
  coinSymbol: '¢',
  starter: 100,
  workName: 'Work',
  workMessage: 'Worked {secs}s and earned {gained}{symbol}'
};

/* Data models in-memory */
let state = {
  coins: DEFAULT_SETTINGS.starter,
  shop: [],
  inventory: [], // {id, templateId, usesLeft (null=infinite)}
  settings: {...DEFAULT_SETTINGS}
};

const uid = (n=6) => Math.random().toString(36).slice(2,2+n);

function saveState(){
  localStorage.setItem('shopgame_v1', JSON.stringify(state));
}
function loadState(){
  const s = localStorage.getItem('shopgame_v1');
  if(s){
    try { state = JSON.parse(s); } catch(e){}
  }
}
loadState();

/* UI nodes */
const coinCount = qs('#coin-count');
const coinNameEl = qs('#coin-name');
const coinSymbolEl = qs('#coin-symbol');
const shopList = qs('#shop-list');
const invList = qs('#inv-list');

const btnNewItem = qs('#btn-new-item');
const btnManage = qs('#btn-manage');
const btnSettings = qs('#btn-settings');
const btnReset = qs('#btn-reset');
const btnFullReset = qs('#btn-full-reset');
const modalCreate = qs('#modal-create');
const modalManager = qs('#modal-manager');
const modalSettings = qs('#modal-settings');
const modalBackdrop = qs('#modal-backdrop');
const formCreate = qs('#form-create');
const usesList = qs('#uses-list');
const addUseBtn = qs('#add-use');
const cancelCreate = qs('#cancel-create');

const sheet = qs('#detail-sheet');
const detailContent = qs('#detail-content');
const btnBuy = qs('#btn-buy');
const btnUse = qs('#btn-use');
const btnClose = qs('#btn-close');

const modalWork = qs('#modal-work');
const btnWork = qs('#btn-work');
const workRange = qs('#work-seconds');
const workSecLabel = qs('#work-sec-label');
const workEst = qs('#work-est');
const startWork = qs('#start-work');
const cancelWork = qs('#cancel-work');

const modalUse = qs('#modal-use');
const useContent = qs('#use-content');
const performUse = qs('#perform-use');
const cancelUse = qs('#cancel-use');

const managerList = qs('#manager-list');

const formSettings = qs('#form-settings');
const cancelSettings = qs('#cancel-settings');

const toast = qs('#toast');

let selected = { area:null, id:null }; // area: shop | inv

/* Helpers */
function showModal(el){
  modalBackdrop.classList.remove('hidden');
  el.classList.remove('hidden');
}
function hideModal(el){
  el.classList.add('hidden');
  modalBackdrop.classList.add('hidden');
}
function showSheet(){
  sheet.classList.remove('hidden');
}
function hideSheet(){
  sheet.classList.add('hidden');
  selected = { area:null, id:null };
}
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  toast.classList.remove('hidden');
  setTimeout(()=>{ toast.classList.remove('show'); toast.classList.add('hidden'); }, 1600);
}
function formatUses(u){
  return (u===0||u===null)?'∞':String(u);
}

/* Apply settings to UI */
function applySettingsToUI(){
  coinNameEl.textContent = state.settings.coinName || DEFAULT_SETTINGS.coinName;
  coinSymbolEl.textContent = state.settings.coinSymbol || DEFAULT_SETTINGS.coinSymbol;
  coinCount.textContent = state.coins;
  btnWork.textContent = state.settings.workName || DEFAULT_SETTINGS.workName;
  // ensure the modal's start button matches the configured work name as well
  if(startWork) startWork.textContent = state.settings.workName || DEFAULT_SETTINGS.workName;
}
applySettingsToUI();

/* Rendering */
function render() {
  coinCount.textContent = state.coins;
  applySettingsToUI();

  // shop
  shopList.innerHTML = '';
  state.shop.forEach(it => {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = it.id;
    el.innerHTML = `<div class="title"><div style="font-size:20px">${it.emoji||'📦'}</div><div>${escapeHtml(it.name)}</div></div>
      <div class="desc">${escapeHtml(it.desc||'')}</div>
      <div style="font-size:13px;color:var(--muted)">Uses: ${formatUses(it.uses)} · Price: ${it.price}${state.settings.coinSymbol}</div>`;
    el.addEventListener('click', ()=>selectItem('shop', it.id));
    shopList.appendChild(el);
  });

  // inventory
  invList.innerHTML = '';
  state.inventory.forEach(itm => {
    const tpl = state.shop.find(s => s.id === itm.templateId);
    if(!tpl) return;
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = itm.id;
    el.innerHTML = `<div class="title"><div style="font-size:20px">${tpl.emoji||'📦'}</div><div>${escapeHtml(tpl.name)}</div></div>
      <div style="font-size:13px;color:var(--muted)">Uses left: ${itm.usesLeft===null?'∞':itm.usesLeft}</div>`;
    el.addEventListener('click', ()=>selectItem('inv', itm.id));
    invList.appendChild(el);
  });

  saveState();
}

/* escaping */
function escapeHtml(s=''){ return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

/* Selection & detail panel */
function selectItem(area, id){
  selected = { area, id };
  if(area==='shop'){
    const it = state.shop.find(s=>s.id===id);
    if(!it) return;
    detailContent.innerHTML = `<div style="font-size:28px">${it.emoji||'📦'}</div>
      <div style="font-weight:700;margin-top:6px">${escapeHtml(it.name)}</div>
      <div style="color:var(--muted);margin-top:6px">${escapeHtml(it.desc||'')}</div>
      <div style="margin-top:8px">Default uses: ${formatUses(it.uses)}</div>
      <div style="margin-top:4px">Price: ${it.price}${state.settings.coinSymbol}</div>`;
    btnBuy.style.display='inline-block';
    btnUse.style.display='none';
    showSheet();
  } else if(area==='inv'){
    const itm = state.inventory.find(i=>i.id===id);
    if(!itm) return;
    const tpl = state.shop.find(s=>s.id===itm.templateId);
    if(!tpl) return;
    detailContent.innerHTML = `<div style="font-size:28px">${tpl.emoji||'📦'}</div>
      <div style="font-weight:700;margin-top:6px">${escapeHtml(tpl.name)}</div>
      <div style="color:var(--muted);margin-top:6px">${escapeHtml(tpl.desc||'')}</div>
      <div style="margin-top:8px">Uses left: ${itm.usesLeft===null?'∞':itm.usesLeft}</div>
      <div style="margin-top:8px"><strong>Uses/actions:</strong></div>
      <div id="detail-uses"></div>`;
    const detailUses = qs('#detail-uses');
    tpl.usesList.forEach((u, idx) => {
      const d = document.createElement('div');
      d.style.marginTop='6px';
      d.innerHTML = `<div style="font-weight:700">${escapeHtml(u.name)}</div><div style="color:var(--muted)">${u.outcomes.map(o => escapeHtml(o.text)).join(' • ')}</div>`;
      detailUses.appendChild(d);
    });
    btnBuy.style.display='none';
    btnUse.style.display='inline-block';
    showSheet();
  }
}

/* Buy logic */
btnBuy.addEventListener('click', ()=>{
  if(!selected || selected.area !== 'shop') return;
  const it = state.shop.find(s=>s.id===selected.id);
  if(!it) return;
  if(state.coins < it.price){ showToast('Not enough ' + state.settings.coinName); return; }
  state.coins -= it.price;
  const invId = uid(8);
  state.inventory.push({
    id: invId,
    templateId: it.id,
    usesLeft: it.uses===0 ? null : it.uses
  });
  showToast('Purchased');
  hideSheet();
  render();
});

/* Use logic */
btnUse.addEventListener('click', ()=>{
  if(!selected || selected.area !== 'inv') return;
  const itm = state.inventory.find(i=>i.id===selected.id);
  if(!itm) return;
  const tpl = state.shop.find(s=>s.id===itm.templateId);
  if(!tpl) return;
  // show modal with uses list
  useContent.innerHTML = tpl.usesList.map((u,idx)=>`<label style="display:block;margin:6px 0"><input type="radio" name="use-select" value="${idx}" ${idx===0?'checked':''}/> ${escapeHtml(u.name)}</label>`).join('');
  showModal(modalUse);
});

performUse.addEventListener('click', ()=>{
  const sel = modalUse.querySelector('input[name="use-select"]:checked');
  if(!sel){ hideModal(modalUse); return; }
  const idx = Number(sel.value);
  const itm = state.inventory.find(i=>i.id===selected.id);
  const tpl = state.shop.find(s=>s.id===itm.templateId);
  const useDef = tpl.usesList[idx];
  // pick random outcome
  const outcome = weightedPick(useDef.outcomes);
  // apply money change
  if(outcome.moneyChange && outcome.moneyChange !== 0){
    const val = outcome.moneyChange * (outcome.deltaType === 'dec' ? -1 : 1);
    state.coins += val;
    showToast(`${outcome.text} (${val>0?'+':''}${val}${state.settings.coinSymbol})`);
  } else {
    showToast(outcome.text);
  }
  // decrement uses
  if(itm.usesLeft !== null){
    itm.usesLeft = Math.max(0, itm.usesLeft - 1);
    if(itm.usesLeft === 0){
      // remove from inventory
      state.inventory = state.inventory.filter(i=>i.id!==itm.id);
      hideModal(modalUse);
      hideSheet();
      render();
      return;
    }
  }
  hideModal(modalUse);
  render();
});

/* Weighted pick helper (equal weights for now) */
function weightedPick(arr){
  // arr of {text, moneyChange, deltaType}
  const i = Math.floor(Math.random()*arr.length);
  return arr[i];
}

/* Work logic */
function updateWorkPreview(){
  workSecLabel.textContent = workRange.value;
  const secs = Number(workRange.value);
  workEst.textContent = String(Math.max(3, secs - 3));
}
btnWork.addEventListener('click', ()=>{
  updateWorkPreview();
  // make sure the modal's start button reflects the current work name
  if(startWork) startWork.textContent = state.settings.workName || DEFAULT_SETTINGS.workName;
  showModal(modalWork);
});
workRange.addEventListener('input', updateWorkPreview);
cancelWork.addEventListener('click', ()=> hideModal(modalWork));
startWork.addEventListener('click', ()=>{
  const secs = Number(workRange.value);
  const gained = Math.max(3, secs - 3);

  startWork.disabled = true;
  cancelWork.disabled = true;
  workRange.disabled = true;

  let remaining = secs;
  workSecLabel.textContent = String(remaining);

  const iv = setInterval(()=>{
    remaining--;
    workSecLabel.textContent = String(Math.max(0, remaining));
    if(remaining <= 0){
      clearInterval(iv);
      state.coins += gained;
      startWork.disabled = false;
      cancelWork.disabled = false;
      workRange.disabled = false;
      hideModal(modalWork);
      const msgTemplate = state.settings.workMessage || DEFAULT_SETTINGS.workMessage;
      const msg = msgTemplate.replace('{secs}', String(secs)).replace('{gained}', String(gained)).replace('{symbol}', state.settings.coinSymbol || DEFAULT_SETTINGS.coinSymbol);
      showToast(msg);
      render();
    }
  }, 1000);
});

/* Create item UI builder (also used for editing) */
btnNewItem.addEventListener('click', ()=> {
  formCreate.reset();
  formCreate.dataset.editId = '';
  qs('#create-title').textContent = 'Create Shop Item';
  usesList.innerHTML = '';
  addUseBlock();
  showModal(modalCreate);
});

cancelCreate.addEventListener('click', ()=> hideModal(modalCreate));
modalBackdrop.addEventListener('click', ()=>{
  hideModal(modalCreate); hideModal(modalWork); hideModal(modalUse); hideModal(modalManager); hideModal(modalSettings);
});

addUseBtn.addEventListener('click', addUseBlock);

function addUseBlock(data = null){
  const id = uid();
  const block = document.createElement('div');
  block.className = 'use-block';
  block.dataset.id = id;
  block.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong>Use</strong>
      <button class="btn small remove-use">Remove</button>
    </div>
    <label>Use name<input name="use-name" required /></label>
    <div class="use-outcomes"></div>
    <button class="btn add-outcome" type="button">+ Add Outcome</button>
  `;
  usesList.appendChild(block);

  const outcomesEl = block.querySelector('.use-outcomes');
  const btnAddOutcome = block.querySelector('.add-outcome');
  const btnRemove = block.querySelector('.remove-use');
  btnRemove.addEventListener('click', ()=>{ block.remove(); });

  btnAddOutcome.addEventListener('click', ()=>{
    const oel = document.createElement('div');
    oel.className = 'outcome-row';
    oel.innerHTML = `<input name="out-text" placeholder="Outcome text" required/>
      <input name="out-money" type="number" placeholder="0" value="0" />
      <select name="out-type"><option value="inc">+ Money</option><option value="dec">- Money</option></select>
      <button class="btn remove-outcome">✕</button>`;
    outcomesEl.appendChild(oel);
    oel.querySelector('.remove-outcome').addEventListener('click', ()=> oel.remove());
  });

  if(data){
    block.querySelector('input[name="use-name"]').value = data.name||'';
    (data.outcomes||[]).forEach(o=>{
      btnAddOutcome.click();
      const last = outcomesEl.lastElementChild;
      last.querySelector('input[name="out-text"]').value = o.text||'';
      last.querySelector('input[name="out-money"]').value = o.moneyChange||0;
      last.querySelector('select[name="out-type"]').value = o.deltaType||'inc';
    });
  } else {
    btnAddOutcome.click();
  }
}

/* Form submit - build or edit item */
formCreate.addEventListener('submit', (ev)=>{
  ev.preventDefault();
  const fd = new FormData(formCreate);
  const name = (fd.get('name') || '').trim();
  const emoji = (fd.get('emoji') || '').trim() || '📦';
  const desc = (fd.get('desc') || '').trim();
  let uses = Number(fd.get('uses'));
  if(Number.isNaN(uses)) uses = 0;
  const price = Math.max(0, Number(fd.get('price')) || 0);

  const usesBlocks = Array.from(usesList.querySelectorAll('.use-block'));
  const usesArr = usesBlocks.map(b=>{
    const uname = (b.querySelector('input[name="use-name"]').value || '').trim() || 'Use';
    const outs = Array.from(b.querySelectorAll('.outcome-row')).map(o=>{
      const text = (o.querySelector('input[name="out-text"]').value || '').trim() || 'Nothing happens';
      const moneyChange = Number(o.querySelector('input[name="out-money"]').value) || 0;
      const deltaType = o.querySelector('select[name="out-type"]').value || 'inc';
      return { text, moneyChange, deltaType };
    });
    return { name: uname, outcomes: outs.length?outs:[{text:'Nothing happens',moneyChange:0,deltaType:'inc'}] };
  });

  const editId = formCreate.dataset.editId;
  if(editId){
    // update existing
    const it = state.shop.find(s=>s.id===editId);
    if(it){
      it.name = name; it.emoji = emoji; it.desc = desc; it.uses = uses; it.price = price; it.usesList = usesArr;
      showToast('Item updated');
    }
  } else {
    const item = { id: uid(8), name, emoji, desc, uses, price, usesList: usesArr };
    state.shop.push(item);
    showToast('Item created');
  }
  formCreate.dataset.editId = '';
  hideModal(modalCreate);
  render();
  populateManager();
});

/* sheet close */
btnClose.addEventListener('click', hideSheet);

/* Modal use cancel */
cancelUse.addEventListener('click', ()=> hideModal(modalUse));

/* Item manager: populate and wire */
function populateManager(){
  managerList.innerHTML = '';
  state.shop.forEach(it=>{
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '6px 0';
    row.innerHTML = `<div><strong>${escapeHtml(it.name)}</strong> <span style="color:var(--muted)">${escapeHtml(it.desc||'')}</span></div>
      <div style="display:flex;gap:8px"><button class="btn edit-item">Edit</button><button class="btn" style="background:#fff;border:1px solid #f2c0c0;color:var(--danger)" data-id="${it.id}">Delete</button></div>`;
    row.querySelector('.edit-item').addEventListener('click', ()=>{
      // open create modal prefilled for edit
      formCreate.reset();
      usesList.innerHTML = '';
      formCreate.dataset.editId = it.id;
      qs('#create-title').textContent = 'Edit Item';
      formCreate.querySelector('input[name="name"]').value = it.name;
      formCreate.querySelector('input[name="emoji"]').value = it.emoji;
      formCreate.querySelector('input[name="desc"]').value = it.desc || '';
      formCreate.querySelector('input[name="uses"]').value = it.uses;
      formCreate.querySelector('input[name="price"]').value = it.price;
      (it.usesList||[]).forEach(u => addUseBlock(u));
      showModal(modalCreate);
    });
    row.querySelector('button[data-id]').addEventListener('click', (e)=>{
      const id = e.currentTarget.getAttribute('data-id');
      if(!confirm('Delete this item?')) return;
      // remove item and all inventory instances of it
      state.shop = state.shop.filter(s=>s.id!==id);
      state.inventory = state.inventory.filter(inv => inv.templateId !== id);
      populateManager();
      render();
      showToast('Item deleted');
    });
    managerList.appendChild(row);
  });
}

/* Manager open/close wiring */
qs('#close-manager').addEventListener('click', ()=> hideModal(modalManager));
if(btnManage) btnManage.addEventListener('click', ()=> { populateManager(); showModal(modalManager); });

/* Settings wiring */
formSettings.addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(formSettings);
  state.settings.coinName = (fd.get('coinName') || '').trim() || DEFAULT_SETTINGS.coinName;
  state.settings.coinSymbol = (fd.get('coinSymbol') || '').trim() || DEFAULT_SETTINGS.coinSymbol;
  const starter = Number(fd.get('starter'));
  if(!Number.isNaN(starter)) state.settings.starter = starter;
  state.settings.workName = (fd.get('workName') || '').trim() || DEFAULT_SETTINGS.workName;
  state.settings.workMessage = (fd.get('workMessage') || '').trim() || DEFAULT_SETTINGS.workMessage;
  // If user changed starter, don't auto-change current coins; starter only applies on full reset
  saveState();
  applySettingsToUI();
  hideModal(modalSettings);
  showToast('Settings saved');
});
qs('#cancel-settings').addEventListener('click', ()=> hideModal(modalSettings));
if(btnSettings) btnSettings.addEventListener('click', ()=>{
  // prefill form
  formSettings.reset();
  formSettings.querySelector('input[name="coinName"]').value = state.settings.coinName;
  formSettings.querySelector('input[name="coinSymbol"]').value = state.settings.coinSymbol;
  formSettings.querySelector('input[name="starter"]').value = state.settings.starter;
  formSettings.querySelector('input[name="workName"]').value = state.settings.workName;
  formSettings.querySelector('input[name="workMessage"]').value = state.settings.workMessage;
  showModal(modalSettings);
});

/* Init demo only if shop empty */
if(state.shop.length === 0){
  state.shop.push({
    id: uid(8),
    name: 'Lucky Coin',
    emoji: '🪙',
    desc: 'Toss for small chance to win coins',
    uses: 3,
    price: 25,
    usesList: [
      { name: 'Toss', outcomes: [
        {text: 'Heads! You gain coins', moneyChange: 10, deltaType: 'inc'},
        {text: 'Tails. You lose a bit', moneyChange: 3, deltaType: 'dec'},
        {text: 'Nothing happened', moneyChange: 0, deltaType: 'inc'}
      ]}
    ]
  });
  state.shop.push({
    id: uid(8),
    name: 'Mysterious Box',
    emoji: '🎁',
    desc: 'Open for random reward',
    uses: 1,
    price: 60,
    usesList: [
      { name: 'Open', outcomes: [
        {text:'Found treasure! +50', moneyChange:50, deltaType:'inc'},
        {text:'It was empty', moneyChange:0, deltaType:'inc'},
        {text:'Trick! -10', moneyChange:10, deltaType:'dec'}
      ]}
    ]
  });
}

/* Reset helpers */
function resetKeepShop(){
  // keep shop & settings, reset coins and inventory to current settings.starter
  const starterVal = (state.settings && state.settings.starter != null) ? state.settings.starter : DEFAULT_SETTINGS.starter;
  const starter = Number(starterVal);
  state.coins = Number.isNaN(starter) ? DEFAULT_SETTINGS.starter : starter;
  state.inventory = [];
  saveState();
  render();
  showToast('Reset: coins and inventory restored.');
}
function fullReset(){
  // clear everything including shop and localStorage, and restore default settings
  state.settings = {...DEFAULT_SETTINGS};
  state.coins = Number(state.settings.starter);
  state.inventory = [];
  state.shop = [];
  localStorage.removeItem('shopgame_v1');
  saveState();
  render();
  showToast('Full reset: shop cleared and settings restored.');
}

/* button wiring for resets */
if(btnReset){
  btnReset.addEventListener('click', ()=>{
    if(confirm('Reset coins to starter amount and clear inventory?')) resetKeepShop();
  });
}
if(btnFullReset){
  btnFullReset.addEventListener('click', ()=>{
    if(confirm('Fully reset and remove all shop items and settings?')) fullReset();
  });
}

/* Initial wiring */
applySettingsToUI();
render();
populateManager();