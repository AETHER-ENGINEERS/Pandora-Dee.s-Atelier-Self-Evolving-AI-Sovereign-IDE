const sizes = ['Super tiny', 'Tiny', 'Super small', 'Small', 'Medium', 'Big', 'Super big', 'Gigantic', 'Very gigantic'];
const outcomes = [
  'Object 1 turns into result; object 2 disappears',
  'Object 2 turns into result; object 1 disappears',
  'Both turn into result; neither disappears',
  'Object 1 turns into result; neither disappears',
  'Object 2 turns into result; neither disappears',
  'Result spawns on object 1; object 2 disappears',
  'Result spawns on object 2; object 1 disappears',
  'Result spawns on object 1; neither disappears',
  'Result spawns on object 2; neither disappears',
  'Result spawns on both; neither disappears'
];
const board = document.querySelector('#board');
const objectPopover = document.querySelector('#object-popover');
const spawnPopover = document.querySelector('#spawn-popover');
const mixPopover = document.querySelector('#mix-popover');
const contextMenu = document.querySelector('#context-menu');
const emojiToggle = document.querySelector('#emoji-toggle');
const noRuleToggle = document.querySelector('#no-rule-toggle');
const emojiOnly = localStorage.getItem('mix-things-emoji-only') === 'true';
const noRuleNoticeEnabled = localStorage.getItem('mix-things-no-rule-notice') !== 'false';
const savedState = (() => {
  try { return JSON.parse(localStorage.getItem('mix-things-world') || '{}'); }
  catch { return {}; }
})();
const objectTypes = (Array.isArray(savedState.objectTypes) ? savedState.objectTypes : []).filter(type => type && Number.isInteger(Number(type.id)) && typeof type.name === 'string' && typeof type.emoji === 'string').map(type => ({ ...type, id: Number(type.id), size: Math.max(0, Math.min(8, Number(type.size) || 0)) }));
const recipes = (Array.isArray(savedState.recipes) ? savedState.recipes : []).filter(rule => rule && Number.isInteger(Number(rule.one)) && Number.isInteger(Number(rule.two)) && Number.isInteger(Number(rule.result)) && rule.one !== rule.two).map(rule => ({ ...rule, one: Number(rule.one), two: Number(rule.two), result: Number(rule.result), outcome: Math.max(0, Math.min(9, Number(rule.outcome) || 0)), delay: Math.max(0, Number(rule.delay) || 0) }));
const placed = [];
let nextType = Math.max(0, ...objectTypes.map(type => type.id)) + 1, nextPlaced = 1, topLayer = 10, activeMenuObject = null, toastTimer;

document.querySelector('#object-size').innerHTML = sizes.map((size, i) => '<option value="' + i + '">' + size + '</option>').join('');
document.querySelector('#mix-outcome').innerHTML = outcomes.map((text, i) => '<option value="' + i + '">' + text + '</option>').join('');

function setEmojiOnly(enabled) {
  board.classList.toggle('emoji-only', enabled);
  emojiToggle.setAttribute('aria-pressed', String(enabled));
  localStorage.setItem('mix-things-emoji-only', String(enabled));
}
function setNoRuleNotice(enabled) {
  noRuleToggle.setAttribute('aria-pressed', String(enabled));
  localStorage.setItem('mix-things-no-rule-notice', String(enabled));
}
function showPanel(panel) {
  objectPopover.hidden = panel !== objectPopover;
  spawnPopover.hidden = panel !== spawnPopover;
  mixPopover.hidden = panel !== mixPopover;
  contextMenu.hidden = true;
  if (panel === objectPopover) setTimeout(() => document.querySelector('#object-name').focus(), 0);
}
function notify(text) {
  const region = document.querySelector('#toast-region');
  region.replaceChildren();
  const message = document.createElement('div'); message.className = 'toast-message'; message.textContent = text; region.append(message);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => region.replaceChildren(), 2200);
}
function refreshCounts() {
  document.querySelector('#object-count').textContent = placed.length + ' ' + (placed.length === 1 ? 'object' : 'objects');
  document.querySelector('#mix-count').textContent = recipes.length;
  document.querySelector('#empty-state').hidden = placed.length > 0;
}
function saveState() {
  localStorage.setItem('mix-things-world', JSON.stringify({ objectTypes, recipes, objects: placed.map(item => ({ typeId: item.typeId, x: item.x, y: item.y, z: Number(item.node.style.zIndex) || 1 })) }));
}
function refreshMixSelects() {
  const options = objectTypes.map(type => '<option value="' + type.id + '">' + escapeHTML(type.emoji) + ' ' + escapeHTML(type.name) + '</option>').join('');
  for (const selector of ['#mix-one', '#mix-two', '#mix-result']) {
    const el = document.querySelector(selector), previous = el.value;
    el.innerHTML = options;
    if (objectTypes.some(type => String(type.id) === previous)) el.value = previous;
    el.disabled = objectTypes.length === 0;
  }
  updateMixPreview();
}
function refreshSpawnList() {
  const list = document.querySelector('#spawn-list'); list.replaceChildren();
  if (!objectTypes.length) {
    const empty = document.createElement('div'); empty.className = 'spawn-empty'; empty.append('Create an object first, then you can spawn copies anytime. ');
    const create = document.createElement('button'); create.type = 'button'; create.textContent = 'Create object';
    create.addEventListener('click', () => showPanel(objectPopover)); empty.append(create); list.append(empty); return;
  }
  for (const type of objectTypes) {
    const row = document.createElement('div'); row.className = 'spawn-row';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'spawn-option'; button.setAttribute('aria-label', 'Spawn ' + type.name);
    const emoji = document.createElement('span'); emoji.className = 'spawn-option-emoji'; emoji.textContent = type.emoji;
    const name = document.createElement('span'); name.className = 'spawn-option-name'; name.textContent = type.name;
    button.append(emoji, name);
    button.addEventListener('click', () => {
      const rect = board.getBoundingClientRect();
      addObject(type, rect.width * (.25 + Math.random() * .5), rect.height * (.25 + Math.random() * .5));
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'spawn-delete'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Delete ' + type.name + ' spawner');
    remove.addEventListener('click', () => confirmDeleteType(type, row));
    row.append(button, remove); list.append(row);
  }
}
function confirmDeleteType(type, row) {
  row.replaceChildren(); row.classList.add('spawn-delete-confirm');
  const message = document.createElement('span'); message.textContent = 'Remove ' + type.name + ', its copies, and related rules?';
  const keep = document.createElement('button'); keep.type = 'button'; keep.textContent = 'Keep'; keep.addEventListener('click', refreshSpawnList);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.className = 'confirm-delete';
  remove.addEventListener('click', () => {
    const typeIndex = objectTypes.findIndex(item => item.id === type.id);
    if (typeIndex < 0) return;
    objectTypes.splice(typeIndex, 1);
    for (let i = placed.length - 1; i >= 0; i--) {
      if (placed[i].typeId === type.id) { placed[i].node.remove(); placed.splice(i, 1); }
    }
    for (let i = recipes.length - 1; i >= 0; i--) {
      const rule = recipes[i];
      if (rule.one === type.id || rule.two === type.id || rule.result === type.id) recipes.splice(i, 1);
    }
    refreshMixSelects(); refreshSpawnList(); refreshSavedRules(); refreshCounts(); saveState();
  });
  row.append(message, keep, remove);
}
function refreshSavedRules() {
  const list = document.querySelector('#saved-rule-list'); list.replaceChildren();
  document.querySelector('#saved-rule-count').textContent = recipes.length;
  if (!recipes.length) { const empty = document.createElement('div'); empty.className = 'rules-empty'; empty.textContent = 'No saved rules yet'; list.append(empty); return; }
  recipes.forEach((rule, index) => {
    const row = document.createElement('div'); row.className = 'saved-rule';
    const description = document.createElement('div'); description.className = 'saved-rule-description';
    const first = typeFor(rule.one), second = typeFor(rule.two), result = typeFor(rule.result);
    const title = document.createElement('span'); title.className = 'saved-rule-title';
    title.textContent = (first ? first.emoji + ' ' + first.name : 'Unknown') + ' + ' + (second ? second.emoji + ' ' + second.name : 'Unknown') + ' → ' + (result ? result.emoji + ' ' + result.name : 'Unknown');
    const detail = document.createElement('span'); detail.className = 'saved-rule-detail';
    detail.textContent = (rule.delay === 0 ? 'Instant' : rule.delay + ' sec') + ' · ' + outcomes[rule.outcome];
    description.append(title, detail);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'rule-delete'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Delete mix rule');
    remove.addEventListener('click', () => { recipes.splice(index, 1); refreshSavedRules(); refreshCounts(); saveState(); });
    row.append(description, remove); list.append(row);
  });
}
function escapeHTML(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function typeFor(id) { return objectTypes.find(item => item.id === Number(id)); }
function updateMixPreview() {
  const first = typeFor(document.querySelector('#mix-one').value), second = typeFor(document.querySelector('#mix-two').value);
  document.querySelector('#preview-one').textContent = first ? first.emoji : '✦';
  document.querySelector('#preview-two').textContent = second ? second.emoji : '✦';
}
function addObject(type, x, y) {
  const node = document.createElement('div');
  node.className = 'play-object'; node.dataset.typeId = type.id; node.dataset.size = type.size; node.style.left = x + 'px'; node.style.top = y + 'px'; node.style.zIndex = ++topLayer;
  node.setAttribute('aria-label', type.name + ', drag to move');
  const emoji = document.createElement('span'); emoji.className = 'object-emoji'; emoji.textContent = type.emoji;
  const name = document.createElement('span'); name.className = 'object-name'; name.textContent = type.name;
  node.append(emoji, name); board.append(node);
  const item = { id: nextPlaced++, typeId: type.id, x, y, node, busy: false };
  placed.push(item); attachObjectEvents(item); refreshCounts(); saveState(); return item;
}
function attachObjectEvents(item) {
  const node = item.node;
  node.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); node.setPointerCapture(event.pointerId); node.classList.add('dragging');
    const move = e => {
      const bounds = board.getBoundingClientRect();
      item.x = Math.max(42, Math.min(bounds.width - 42, e.clientX - bounds.left));
      item.y = Math.max(45, Math.min(bounds.height - 42, e.clientY - bounds.top));
      node.style.left = item.x + 'px'; node.style.top = item.y + 'px';
    };
    const up = () => {
      node.classList.remove('dragging');
      node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up);
      saveState();
      const target = findOverlap(item);
      if (target) beginMix(item, target);
    };
    node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
  });
  node.addEventListener('dblclick', event => { event.preventDefault(); openContext(item, event.clientX, event.clientY); });
  let lastTap = 0;
  node.addEventListener('pointerup', event => {
    if (event.pointerType === 'mouse') return;
    const now = Date.now();
    if (now - lastTap < 340) openContext(item, event.clientX, event.clientY);
    lastTap = now;
  });
}
function findOverlap(item) {
  const a = item.node.getBoundingClientRect();
  for (const other of [...placed].reverse()) {
    if (other === item || other.busy) continue;
    const b = other.node.getBoundingClientRect();
    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) return other;
  }
  return null;
}
function beginMix(a, b) {
  if (a.busy || b.busy) return;
  const recipe = recipes.find(rule => (rule.one === a.typeId && rule.two === b.typeId) || (rule.one === b.typeId && rule.two === a.typeId));
  if (!recipe) { if (noRuleToggle.getAttribute('aria-pressed') === 'true') notify('No mix rule for those two yet'); return; }
  a.busy = b.busy = true; a.node.classList.add('mix-pulse'); b.node.classList.add('mix-pulse');
  for (const target of [a.node, b.node]) {
    const progress = document.createElement('span'); progress.className = 'mix-progress';
    const bar = document.createElement('i'); bar.style.setProperty('--duration', Math.max(recipe.delay, .14) + 's'); progress.append(bar); target.append(progress);
  }
  showMixToast(typeFor(a.typeId).name + ' + ' + typeFor(b.typeId).name + '…');
  setTimeout(() => applyOutcome(a, b, recipe), recipe.delay * 1000);
}
function showMixToast(text) {
  const toast = document.querySelector('#mix-toast'); toast.textContent = text; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1700);
}
function removePlaced(item) {
  item.node.remove(); const i = placed.indexOf(item); if (i >= 0) placed.splice(i, 1);
  saveState();
}
function transform(item, type) {
  item.typeId = type.id; item.busy = false; item.node.classList.remove('mix-pulse'); item.node.querySelector('.mix-progress')?.remove();
  item.node.dataset.typeId = type.id; item.node.dataset.size = type.size; item.node.setAttribute('aria-label', type.name + ', drag to move');
  item.node.querySelector('.object-emoji').textContent = type.emoji; item.node.querySelector('.object-name').textContent = type.name;
  saveState();
}
function spawn(type, x, y) { return addObject(type, x, y); }
function clearBusy(item) { item.busy = false; item.node.classList.remove('mix-pulse'); item.node.querySelector('.mix-progress')?.remove(); }
function applyOutcome(a, b, recipe) {
  if (!placed.includes(a) || !placed.includes(b)) return;
  const first = a.typeId === recipe.one ? a : b;
  const second = first === a ? b : a;
  const result = typeFor(recipe.result), mode = recipe.outcome;
  if (!result) { clearBusy(a); clearBusy(b); return; }
  switch (mode) {
    case 0: transform(first, result); removePlaced(second); break;
    case 1: transform(second, result); removePlaced(first); break;
    case 2: transform(first, result); transform(second, result); break;
    case 3: transform(first, result); clearBusy(second); break;
    case 4: transform(second, result); clearBusy(first); break;
    case 5: spawn(result, first.x, first.y); removePlaced(second); clearBusy(first); break;
    case 6: spawn(result, second.x, second.y); removePlaced(first); clearBusy(second); break;
    case 7: spawn(result, first.x, first.y); clearBusy(first); clearBusy(second); break;
    case 8: spawn(result, second.x, second.y); clearBusy(first); clearBusy(second); break;
    case 9: spawn(result, first.x, first.y); spawn(result, second.x, second.y); clearBusy(first); clearBusy(second); break;
  }
  refreshCounts(); showMixToast('Made ' + result.name + ' ' + result.emoji);
}
function openContext(item, x, y) {
  activeMenuObject = item; document.querySelector('#context-title').textContent = (typeFor(item.typeId)?.emoji || '') + ' ' + (typeFor(item.typeId)?.name || '');
  contextMenu.hidden = false;
  const width = 190, height = 226;
  contextMenu.style.left = Math.max(8, Math.min(innerWidth - width - 8, x)) + 'px';
  contextMenu.style.top = Math.max(8, Math.min(innerHeight - height - 8, y)) + 'px';
  objectPopover.hidden = true; spawnPopover.hidden = true; mixPopover.hidden = true;
}
function applyLayer(action) {
  if (!activeMenuObject) return;
  const ordered = [...placed].sort((a, b) => Number(a.node.style.zIndex) - Number(b.node.style.zIndex));
  const i = ordered.indexOf(activeMenuObject);
  if (action === 'delete') { removePlaced(activeMenuObject); refreshCounts(); }
  else if (action === 'raise' && i < ordered.length - 1) [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
  else if (action === 'lower' && i > 0) [ordered[i], ordered[i - 1]] = [ordered[i - 1], ordered[i]];
  else if (action === 'top') { ordered.splice(i, 1); ordered.push(activeMenuObject); }
  else if (action === 'bottom') { ordered.splice(i, 1); ordered.unshift(activeMenuObject); }
  ordered.forEach((item, index) => item.node.style.zIndex = index + 1); topLayer = ordered.length + 1;
  contextMenu.hidden = true; activeMenuObject = null;
  saveState();
}

document.querySelector('#add-object').addEventListener('click', () => showPanel(objectPopover));
document.querySelector('#spawn-objects').addEventListener('click', () => { refreshSpawnList(); showPanel(spawnPopover); });
document.querySelector('#empty-create').addEventListener('click', () => showPanel(objectPopover));
document.querySelector('#add-mix').addEventListener('click', () => { refreshMixSelects(); refreshSavedRules(); showPanel(mixPopover); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { document.getElementById(button.dataset.close).hidden = true; }));
document.querySelector('#object-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget), name = String(data.get('name')).trim(), emoji = String(data.get('emoji')).trim();
  if (!name || !emoji) return;
  const type = { id: nextType++, name, emoji, size: Number(data.get('size')) }; objectTypes.push(type); refreshMixSelects(); refreshSpawnList();
  const rect = board.getBoundingClientRect(); const x = rect.width * (.25 + Math.random() * .5); const y = rect.height * (.25 + Math.random() * .5);
  addObject(type, x, y); event.currentTarget.reset(); document.querySelector('#object-emoji').value = '✨'; document.querySelector('#object-size').value = '4'; objectPopover.hidden = true;
});
document.querySelector('#mix-form').addEventListener('submit', event => {
  event.preventDefault(); const one = Number(document.querySelector('#mix-one').value), two = Number(document.querySelector('#mix-two').value), result = Number(document.querySelector('#mix-result').value);
  const error = document.querySelector('#mix-error'); error.hidden = true;
  if (!one || !two || !result) { error.textContent = 'Create at least one object first.'; error.hidden = false; return; }
  if (one === two) { error.textContent = 'Choose two different objects.'; error.hidden = false; return; }
  if (recipes.some(rule => (rule.one === one && rule.two === two) || (rule.one === two && rule.two === one))) { error.textContent = 'A mix rule for that pair already exists.'; error.hidden = false; return; }
  const delay = Math.max(0, Number(document.querySelector('#mix-delay').value) || 0);
  recipes.push({ one, two, result, outcome: Number(document.querySelector('#mix-outcome').value), delay });
  refreshSavedRules(); refreshCounts(); saveState(); mixPopover.hidden = true; notify('Mix rule saved');
});
for (const id of ['#mix-one', '#mix-two']) document.querySelector(id).addEventListener('change', updateMixPreview);
contextMenu.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) applyLayer(button.dataset.action); });
document.addEventListener('pointerdown', event => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target) && !event.target.closest('.play-object')) contextMenu.hidden = true;
  if (!objectPopover.hidden && !objectPopover.contains(event.target) && !event.target.closest('#add-object') && !event.target.closest('#empty-create')) objectPopover.hidden = true;
  if (!spawnPopover.hidden && !spawnPopover.contains(event.target) && !event.target.closest('#spawn-objects')) spawnPopover.hidden = true;
  if (!mixPopover.hidden && !mixPopover.contains(event.target) && !event.target.closest('#add-mix')) mixPopover.hidden = true;
});
window.addEventListener('resize', () => { contextMenu.hidden = true; });
emojiToggle.addEventListener('click', () => setEmojiOnly(emojiToggle.getAttribute('aria-pressed') !== 'true'));
noRuleToggle.addEventListener('click', () => setNoRuleNotice(noRuleToggle.getAttribute('aria-pressed') !== 'true'));
setEmojiOnly(emojiOnly);
setNoRuleNotice(noRuleNoticeEnabled);
const savedObjects = Array.isArray(savedState.objects) ? savedState.objects : [];
const boardBounds = board.getBoundingClientRect();
for (const saved of savedObjects) {
  const type = typeFor(saved.typeId), x = Number(saved.x), y = Number(saved.y);
  if (!type || !Number.isFinite(x) || !Number.isFinite(y)) continue;
  const item = addObject(type, Math.max(42, Math.min(boardBounds.width - 42, x)), Math.max(45, Math.min(boardBounds.height - 42, y)));
  const layer = Math.max(1, Number(saved.z) || topLayer); item.node.style.zIndex = layer; topLayer = Math.max(topLayer, layer);
}
refreshCounts(); refreshMixSelects(); refreshSpawnList(); refreshSavedRules(); saveState();