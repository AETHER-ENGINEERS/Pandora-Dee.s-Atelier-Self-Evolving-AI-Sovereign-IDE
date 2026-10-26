const view = document.querySelector('#view');
const picker = document.querySelector('#image-picker');
const accountLabel = document.querySelector('#account-label');
const toast = document.querySelector('#toast');
const state = { screen: 'library', makers: [], user: null, draft: null, step: 0, activeBase: null, activeCategory: null, selectedOption: null, avatarMaker: null, avatarBase: null, avatarChoices: {}, interaction: null, uploadTarget: null, loading: true };
const uid = () => crypto.randomUUID();
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getActiveBase = () => state.draft?.bases.find(base => base.id === state.activeBase) || state.draft?.bases[0];
const getActiveCategory = () => state.draft?.categories.find(category => category.id === state.activeCategory) || state.draft?.categories[0];
const getSelectedOption = () => getActiveCategory()?.options.find(option => option.id === state.selectedOption) || getActiveCategory()?.options[0];
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600); }
const AVATAR_KEY = "sunkissed-avatar-makers";
function readMakers() { try { return JSON.parse(localStorage.getItem(AVATAR_KEY) || "[]"); } catch { return []; } }
function writeMakers(list) { localStorage.setItem(AVATAR_KEY, JSON.stringify(list)); }
async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (path === "/api/makers" && method === "GET") return { makers: readMakers() };
  if (path === "/api/makers" && method === "POST") {
    const maker = JSON.parse(options.body);
    const makers = readMakers().filter((item) => item.id !== maker.id);
    makers.unshift(maker);
    writeMakers(makers);
    return { maker };
  }
  if (path.startsWith("/api/makers/") && method === "DELETE") {
    const id = decodeURIComponent(path.split("/").pop());
    writeMakers(readMakers().filter((item) => item.id !== id));
    return { ok: true };
  }
  throw new Error("That stays on this device.");
}
async function boot() {
  state.user = { username: "this-device" };
  accountLabel.textContent = "Saved on this device";
  try { const result = await api('/api/makers'); state.makers = result.makers || []; }
  catch (error) { console.error(error); state.loadError = error.message; }
  state.loading = false;
  render();
}
function render() {
  if (state.loading) { view.innerHTML = '<div class="loading">Opening your studio…</div>'; return; }
  if (state.screen === 'library') renderLibrary();
  else if (state.screen === 'edit') renderEditor();
  else renderAvatar();
}
function cardImage(maker) {
  const base = maker.bases?.[0];
  if (!base) return '';
  const first = maker.categories?.find(cat => cat.options?.length)?.options[0];
  const overlay = first ? `<img class="layer" src="${escapeHTML(first.url)}" style="left:${first.x}%;top:${first.y}%;width:${first.w}%;height:${first.h}%">` : '';
  return `<img class="base" src="${escapeHTML(base.url)}">${overlay}`;
}
function renderLibrary() {
  const heading = `<div class="page-heading"><div><div class="eyebrow">Your collection</div><h1>Avatar makers</h1></div>${state.makers.length ? '<button class="button button-dark" data-action="new">＋ Create maker</button>' : ''}</div>`;
  if (state.loadError) { view.innerHTML = `${heading}<div class="empty-state"><div class="empty-art">!</div><h2>Couldn’t open your library</h2><p>${escapeHTML(state.loadError)}</p><button class="button button-soft" data-action="reload">Try again</button></div>`; return; }
  if (!state.makers.length) {
    view.innerHTML = `${heading}<div class="empty-state"><div class="empty-art">✳</div><h2>Your next look starts here</h2><p>Build a maker from your photos, then mix and match your avatar.</p><button class="button button-dark" data-action="new">＋ Create your first maker</button>${!state.user ? '<div class="auth-note">Sign in to save makers across sessions.</div>' : ''}</div>`;
    return;
  }
  view.innerHTML = `${heading}<div class="maker-grid">${state.makers.map(maker => `<article class="maker-card" data-action="open-maker" data-id="${escapeHTML(maker.id)}"><button class="delete-maker" title="Delete maker" aria-label="Delete ${escapeHTML(maker.name)}" data-action="delete-maker" data-id="${escapeHTML(maker.id)}">×</button><div class="card-preview">${cardImage(maker)}</div><div class="card-info"><strong>${escapeHTML(maker.name)}</strong><span>${maker.categories?.length || 0} categories · ${maker.bases?.length || 0} bases</span></div></article>`).join('')}</div>`;
}
function stageMarkup(base, option, interactive = true, className = '') {
  if (!base) return `<div class="stage ${className}"><div class="stage-empty"><span>＋</span>Add a base photo to begin</div></div>`;
  const options = Array.isArray(option) ? option : option ? [option] : [];
  const overlays = options.map(item => {
    const handle = interactive ? '<i class="resize-handle" data-resize="true"></i>' : '';
    return `<div class="overlay ${interactive ? 'selected' : ''}" data-option-id="${escapeHTML(item.id)}" style="left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%"><img alt="${escapeHTML(item.name)}" draggable="false" src="${escapeHTML(item.url)}" style="width:100%;height:100%;object-fit:fill">${handle}</div>`;
  }).join('');
  return `<div class="stage ${className}" data-stage="true"><img class="base-image" alt="${escapeHTML(base.name)}" src="${escapeHTML(base.url)}">${overlays}</div>`;
}
function stepTitle() { return ['Choose your bases','Build your categories','Name your maker'][state.step]; }
function renderEditor() {
  const draft = state.draft;
  const base = getActiveBase();
  const category = getActiveCategory();
  const option = getSelectedOption();
  const stepper = `<div class="stepper"><i class="step-dot ${state.step >= 0 ? 'active':''}"></i><i class="step-dot ${state.step >= 1 ? 'active':''}"></i><i class="step-dot ${state.step >= 2 ? 'active':''}"></i></div>`;
  let controls = '';
  if (state.step === 0) {
    controls = `<h2>Choose your base photos</h2><p class="sub">Add the starting looks people can build on. A clear, full-body photo works best.</p><label class="upload-box" data-action="upload-base"><span class="upload-icon">＋</span><span>Upload a base photo</span></label><div class="mini-list">${draft.bases.map(item => `<div class="mini-item ${item.id === state.activeBase?'active':''}"><img src="${escapeHTML(item.url)}" alt=""><button data-action="select-base" data-id="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button><button class="remove" data-action="remove-base" data-id="${escapeHTML(item.id)}" title="Remove">×</button></div>`).join('')}</div><p class="sub">You can add more base choices any time before saving.</p>`;
  } else if (state.step === 1) {
    controls = `<h2>Add the mix and match</h2><p class="sub">Name a category, then add photo options and fit each one on the base.</p><div class="category-tabs">${draft.categories.map(item => `<button class="category-tab ${item.id === category?.id?'active':''}" data-action="select-category" data-id="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`).join('')}<button class="add-category" data-action="add-category">＋ Category</button></div>${category ? `<div class="option-row"><span class="field-label">${escapeHTML(category.name)} options</span><button class="button button-soft button-small" data-action="upload-option">＋ Add photo</button></div><div class="option-grid">${category.options.map(item => `<button class="option-tile ${item.id === option?.id?'active':''}" data-action="select-option" data-id="${escapeHTML(item.id)}"><img src="${escapeHTML(item.url)}" alt=""><span>${escapeHTML(item.name)}</span></button>`).join('')}</div>${option ? `<div class="scale-control"><div class="scale-line"><span>Resize selected photo</span><span>${Math.round(option.w)}%</span></div><input type="range" min="8" max="100" value="${Math.round(option.w)}" data-action="scale-option" aria-label="Resize selected photo"></div><div class="option-name"><label class="field-label" for="option-name">Option name</label><div class="name-row"><input id="option-name" class="text-input" value="${escapeHTML(option.name)}" data-action="rename-option"><button class="button button-soft button-small" data-action="remove-option">Remove</button></div></div>` : '<p class="sub" style="margin-top:12px">Add a photo to this category to start placing options.</p>'}` : '<p class="sub">Create your first category, like Hair, Hats or Tops.</p>'}`;
  } else {
    controls = `<h2>Give it a name</h2><p class="sub">Your maker will be saved to your library, ready to use whenever inspiration hits.</p><label class="field-label" for="maker-name">Maker name</label><input id="maker-name" class="text-input" maxlength="48" placeholder="e.g. Weekend fits" value="${escapeHTML(draft.name || '')}" data-action="maker-name"><div class="maker-summary">${draft.bases.map(baseItem => `<div class="summary-row"><strong>${escapeHTML(baseItem.name)}</strong><span>Base</span></div>`).join('')}${draft.categories.map(cat => `<div class="summary-row"><strong>${escapeHTML(cat.name)}</strong><span>${cat.options.length} ${cat.options.length === 1 ? 'option':'options'}</span></div>`).join('')}</div>${!state.user?'<p class="auth-note">Sign in to save your maker across sessions.</p>':''}`;
  }
  const canNext = state.step === 0 ? draft.bases.length > 0 : state.step === 1 ? draft.categories.length > 0 && draft.categories.every(c => c.options.length > 0) : true;
  view.innerHTML = `<div class="editor-head"><button class="back-button" data-action="editor-back" aria-label="Back">←</button><div><div class="eyebrow">Create a maker · ${state.step+1} of 3</div><h1>${stepTitle()}</h1></div>${stepper}</div><div class="builder-layout"><section class="control-card">${controls}<div class="control-actions"><button class="button button-quiet" data-action="cancel-editor">Cancel</button><button class="button ${state.step===2?'button-lime':'button-dark'}" data-action="next-step" ${canNext?'':'disabled'}>${state.step === 2 ? 'Save maker' : 'Continue →'}</button></div></section><section class="stage-card"><div class="stage-top"><span>Live placement</span><span>${option ? 'Drag to position · corner to resize':''}</span></div>${stageMarkup(base, state.step===1 ? option : null, state.step===1)}<div class="stage-footer">${base ? 'Your layers stay aligned on every base photo':''}</div></section></div>`;
}
function renderAvatar() {
  const maker = state.avatarMaker;
  const base = maker.bases.find(item => item.id === state.avatarBase) || maker.bases[0];
  const selectedOptions = maker.categories.map(category => ({ category, option: category.options.find(item => item.id === state.avatarChoices[category.id]) || null })).filter(row => row.option);
  const categoryControls = maker.categories.map(category => `<div class="category-choice"><h3>${escapeHTML(category.name)}</h3><div class="choice-scroll"><button class="choice-chip ${!state.avatarChoices[category.id]?'active':''}" data-action="choose-avatar-option" data-category="${escapeHTML(category.id)}" data-option="">None</button>${category.options.map(option => `<button class="choice-chip ${state.avatarChoices[category.id] === option.id?'active':''}" data-action="choose-avatar-option" data-category="${escapeHTML(category.id)}" data-option="${escapeHTML(option.id)}"><img src="${escapeHTML(option.url)}" alt="">${escapeHTML(option.name)}</button>`).join('')}</div></div>`).join('');
  view.innerHTML = `<div class="editor-head"><button class="back-button" data-action="avatar-back" aria-label="Back to library">←</button><div><div class="eyebrow">Avatar creator</div><h1>Make your look</h1></div></div><div class="avatar-workspace"><section class="stage-card"><div class="stage-top"><span>Your avatar</span><span>${escapeHTML(maker.name)}</span></div>${stageMarkup(base, selectedOptions.map(({option}) => option), false, 'avatar-stage')}<div class="stage-footer">Preview updates as you choose</div></section><section class="control-card avatar-controls"><div class="maker-hero"><div class="maker-hero-thumb"><img src="${escapeHTML(base.url)}" alt=""></div><div><h2>${escapeHTML(maker.name)}</h2><p>${maker.categories.length} categories to style</p></div></div>${maker.bases.length > 1 ? `<div class="category-choice"><h3>Start with a base</h3><div class="choice-scroll">${maker.bases.map(item=>`<button class="choice-chip ${item.id===base.id?'active':''}" data-action="choose-avatar-base" data-id="${escapeHTML(item.id)}"><img src="${escapeHTML(item.url)}" alt="">${escapeHTML(item.name)}</button>`).join('')}</div></div>`:''}${categoryControls}<div class="download-row"><button class="button button-dark" data-action="download-avatar">↓ Download avatar</button></div></section></div>`;
}
function startEditor() {
  state.draft = { id: uid(), name: '', bases: [], categories: [] }; state.step=0; state.activeBase=null; state.activeCategory=null; state.selectedOption=null; state.screen='edit'; render();
}
function handleUpload(target) { state.uploadTarget = target; picker.value=''; picker.click(); }
async function uploadPickedFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Choose an image file.'); return; }
  if (file.size > 30 * 1024 * 1024) { showToast('Choose an image under 30 MB.'); return; }
  const target = state.uploadTarget;
  showToast('Uploading photo…');
  try {
    const optimized = await optimizeImage(file);
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read that photo."));
      reader.readAsDataURL(optimized);
    });
    if (!url) throw new Error("Could not read that photo.");
    const name = file.name.replace(/\.[^.]+$/, '').slice(0,36) || 'Photo';
    if (target === 'base') {
      const base = { id: uid(), name, url }; state.draft.bases.push(base); state.activeBase=base.id;
    } else {
      const category = getActiveCategory();
      if (!category) return;
      const option = { id: uid(), name, url, x: 33, y: 25, w: 34, h: 34 };
      category.options.push(option); state.selectedOption=option.id;
    }
    render(); showToast('Photo added. Drag it into place.');
  } catch (error) { console.error('Avatar image upload failed:', error); showToast(error.message || 'Could not upload that photo.'); }
}
async function optimizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 2000;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const quality of [0.9, 0.82, 0.72, 0.62]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= 5 * 1024 * 1024) return blob;
  }
  throw new Error('This image is still too large after compression. Try a smaller image.');
}
async function saveMaker() {
  const maker = { ...state.draft, name: state.draft.name.trim(), createdAt: Date.now() };
  if (!maker.name) { showToast('Give your maker a name first.'); document.querySelector('#maker-name')?.focus(); return; }
  if (!maker.bases.length || !maker.categories.length || maker.categories.some(cat => !cat.options.length)) { showToast('Add a base and at least one option for every category.'); return; }
  try {
    const result = await api('/api/makers', { method:'POST', body:JSON.stringify(maker) });
    state.makers.unshift(result.maker || maker); state.screen='library'; state.draft=null; render(); showToast('Maker saved to your library.');
  } catch (error) { showToast(error.message === 'Sign in required' ? 'Sign in to save makers across sessions.' : `Could not save maker: ${error.message}`); }
}
async function deleteMaker(id) {
  try { await api(`/api/makers/${encodeURIComponent(id)}`, {method:'DELETE'}); state.makers=state.makers.filter(maker=>maker.id!==id); render(); showToast('Maker deleted.'); }
  catch(error) { showToast(error.message || 'Could not delete maker.'); }
}
function beginAvatar(maker) {
  state.avatarMaker=maker; state.avatarBase=maker.bases[0]?.id; state.avatarChoices={}; state.screen='avatar'; render();
}
function updateOverlayVisual(option) {
  const el = view.querySelector(`.overlay[data-option-id="${CSS.escape(option.id)}"]`);
  if (el) { el.style.left=`${option.x}%`;el.style.top=`${option.y}%`;el.style.width=`${option.w}%`;el.style.height=`${option.h}%`; }
}
view.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  if (action==='new') startEditor();
  else if (action==='reload') { state.loading=true; render(); state.loadError=null; try {const result=await api('/api/makers');state.makers=result.makers||[];}catch(error){state.loadError=error.message;}state.loading=false;render(); }
  else if (action==='open-maker') { if (event.target.closest('.delete-maker')) return; const maker=state.makers.find(item=>item.id===button.dataset.id);if(maker)beginAvatar(maker); }
  else if (action==='delete-maker') { event.stopPropagation(); if(confirm('Delete this avatar maker?')) await deleteMaker(button.dataset.id); }
  else if (action==='upload-base') handleUpload('base');
  else if (action==='upload-option') handleUpload('option');
  else if (action==='select-base') {state.activeBase=button.dataset.id;render();}
  else if (action==='remove-base') {state.draft.bases=state.draft.bases.filter(item=>item.id!==button.dataset.id);if(state.activeBase===button.dataset.id)state.activeBase=state.draft.bases[0]?.id||null;render();}
  else if (action==='add-category') {const name=prompt('Name this category (for example, Hair or Tops):');if(name?.trim()){const category={id:uid(),name:name.trim().slice(0,32),options:[]};state.draft.categories.push(category);state.activeCategory=category.id;state.selectedOption=null;render();}}
  else if (action==='select-category') {state.activeCategory=button.dataset.id;state.selectedOption=getActiveCategory()?.options[0]?.id||null;render();}
  else if (action==='select-option') {state.selectedOption=button.dataset.id;render();}
  else if (action==='remove-option') {const category=getActiveCategory();category.options=category.options.filter(item=>item.id!==state.selectedOption);state.selectedOption=category.options[0]?.id||null;render();}
  else if (action==='editor-back') {if(state.step>0){state.step--;render();}else{state.screen='library';render();}}
  else if (action==='cancel-editor') {state.screen='library';state.draft=null;render();}
  else if (action==='next-step') {if(state.step<2){state.step++;render();}else await saveMaker();}
  else if (action==='choose-avatar-option') {state.avatarChoices[button.dataset.category]=button.dataset.option||'';render();}
  else if (action==='choose-avatar-base') {state.avatarBase=button.dataset.id;render();}
  else if (action==='avatar-back') {state.screen='library';render();}
  else if (action==='download-avatar') await downloadAvatar();
});
view.addEventListener('input', event => {
  if(event.target.dataset.action==='maker-name') state.draft.name=event.target.value;
  if(event.target.dataset.action==='rename-option') {const option=getSelectedOption();if(option){option.name=event.target.value;const tile=view.querySelector(`.option-tile[data-id="${CSS.escape(option.id)}"] span`);if(tile)tile.textContent=event.target.value;}}
  if(event.target.dataset.action==='scale-option') {const option=getSelectedOption();if(option){const next=Number(event.target.value);const ratio=next/option.w;const nextH=Math.min(100,option.h*ratio);option.x=Math.max(0,Math.min(100-next,option.x-(next-option.w)/2));option.y=Math.max(0,Math.min(100-nextH,option.y-(nextH-option.h)/2));option.w=next;option.h=nextH;updateOverlayVisual(option);const label=view.querySelector('.scale-line span:last-child');if(label)label.textContent=`${next}%`;}}
});
view.addEventListener('pointerdown', event => {
  const stage=view.querySelector('[data-stage]');
  if(!stage || state.screen!=='edit' || state.step!==1) return;
  const handle=event.target.closest('.resize-handle');
  const overlay=event.target.closest('.overlay');
  if(!overlay) return;
  const option=getActiveCategory()?.options.find(item=>item.id===overlay.dataset.optionId); if(!option)return;
  state.selectedOption=option.id;
  const rect=stage.getBoundingClientRect();
  state.interaction={mode:handle?'resize':'drag',option,rect,startX:event.clientX,startY:event.clientY,x:option.x,y:option.y,w:option.w,h:option.h};
  stage.setPointerCapture(event.pointerId); event.preventDefault();
});
view.addEventListener('pointermove', event => {
  const drag=state.interaction; if(!drag)return;
  const dx=(event.clientX-drag.startX)/drag.rect.width*100; const dy=(event.clientY-drag.startY)/drag.rect.height*100; const option=drag.option;
  if(drag.mode==='drag'){option.x=Math.max(0,Math.min(100-option.w,drag.x+dx));option.y=Math.max(0,Math.min(100-option.h,drag.y+dy));}
  else {const nextW=Math.max(8,Math.min(100-drag.x,drag.w+dx));const nextH=Math.max(8,Math.min(100-drag.y,drag.h+dy));option.w=nextW;option.h=nextH;}
  updateOverlayVisual(option);
});
view.addEventListener('pointerup', () => { if(state.interaction){const option=state.interaction.option;state.interaction=null;const label=view.querySelector('.scale-line span:last-child');if(label && getSelectedOption()?.id===option.id)label.textContent=`${Math.round(option.w)}%`;} });
picker.addEventListener('change', () => uploadPickedFile(picker.files?.[0]));
async function loadImage(url) { return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('One of the photos could not be loaded for download.'));image.src=url;}); }
async function downloadAvatar() {
  const maker=state.avatarMaker;const base=maker.bases.find(item=>item.id===state.avatarBase)||maker.bases[0];if(!base)return;
  try {
    showToast('Preparing your avatar…');const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1250;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const baseImage=await loadImage(base.url);const scale=Math.min(canvas.width/baseImage.width,canvas.height/baseImage.height);const bw=baseImage.width*scale,bh=baseImage.height*scale;ctx.drawImage(baseImage,(canvas.width-bw)/2,(canvas.height-bh)/2,bw,bh);
    for(const category of maker.categories){const option=category.options.find(item=>item.id===state.avatarChoices[category.id]);if(!option)continue;const image=await loadImage(option.url);ctx.drawImage(image,canvas.width*option.x/100,canvas.height*option.y/100,canvas.width*option.w/100,canvas.height*option.h/100);}
    const a=document.createElement('a');a.download=`${maker.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-avatar.png`;a.href=canvas.toDataURL('image/png');a.click();showToast('Avatar downloaded.');
  } catch(error) {console.error(error);showToast(error.message||'Could not create the download.');}
}
document.querySelector('#create-maker').addEventListener('click', startEditor);
boot();
