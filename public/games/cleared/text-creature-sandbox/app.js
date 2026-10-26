const STORAGE_KEY = 'text-beasts-v1';
let state = loadState();
let editorModel = null;
let editorKind = 'creature';
let selectedSpawnId = null;
let mode = 'idle';
let toastTimer;
const feedingSessions = new Map();
const $ = (selector) => document.querySelector(selector);
const world = $('#world');
const creatureLayer = $('#creature-layer');
const effectsLayer = $('#effects-layer');
const shelf = $('#creature-shelf');
const modal = $('#editor-modal');
const editorStage = $('#editor-stage');
const editorCreature = $('#editor-creature');

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.creatures) && Array.isArray(saved.spawned)) {
      saved.foods = Array.isArray(saved.foods) ? saved.foods : [];
      saved.foodInstances = Array.isArray(saved.foodInstances) ? saved.foodInstances : [];
      saved.creatures.forEach(creature => {
        if (!creature.eatEyeExpression) creature.eatEyeExpression = 'do-not-change';
        if (!creature.eatMouthExpression) creature.eatMouthExpression = 'open-smile';
        if (!creature.eatDuration) creature.eatDuration = 1.2;
        if (!Array.isArray(creature.eyes)) creature.eyes = [];
        if (!Array.isArray(creature.mouths)) creature.mouths = [];
      });
      return saved;
    }
  } catch (error) { console.warn('Could not load saved creatures', error); }
  return { creatures: [], spawned: [], foods: [], foodInstances: [] };
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { showToast('Could not save. Browser storage may be full.'); }
}
function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
}
function setMode(next) {
  mode = mode === next ? 'idle' : next;
  $('#spawn-button').classList.toggle('active', mode === 'spawn');
  $('#give-button').classList.toggle('active', mode === 'expression');
  $('#delete-button').classList.toggle('active', mode === 'delete');
  world.classList.toggle('target-mode', mode !== 'idle');
  if (mode === 'spawn') showToast('Choose a creature from your shelf');
  if (mode === 'expression') showToast('Tap a creature to give it this expression');
  if (mode === 'delete') showToast('Tap an object to remove it');
}
function makePart(type, feature, expression, body) {
  const element = document.createElement('span');
  element.className = type + '-part face-part expression-' + expression;
  element.style.left = feature.x + '%'; element.style.top = feature.y + '%';
  if (type === 'eye' && expression === 'squint') {
    const eyes = body.eyes || [];
    const leftmost = Math.min.apply(null, eyes.map(eye => eye.x));
    const rightmost = Math.max.apply(null, eyes.map(eye => eye.x));
    element.dataset.squint = feature.x <= (leftmost + rightmost) / 2 ? '>' : '<';
  }
  if (type === 'eye' && !['closed', 'down', 'up', 'squint'].includes(expression)) {
    const pupil = document.createElement('span'); pupil.className = 'pupil'; element.append(pupil);
  }
  return element;
}
function fitBodyText(element, maxWidth) {
  element.style.fontSize = '';
  const naturalWidth = element.getBoundingClientRect().width;
  if (naturalWidth > maxWidth && naturalWidth > 0) {
    const baseSize = parseFloat(getComputedStyle(element).fontSize);
    element.style.fontSize = (baseSize * maxWidth / naturalWidth) + 'px';
  }
}
function renderWorld() {
  creatureLayer.replaceChildren();
  for (const instance of state.spawned) {
    const creature = state.creatures.find(item => item.id === instance.templateId);
    if (!creature) continue;
    const element = document.createElement('div');
    element.className = 'creature' + (mode !== 'idle' ? ' target-mode' : '');
    element.dataset.id = instance.id;
    element.style.left = instance.x + '%'; element.style.top = instance.y + '%';
    const body = document.createElement('div'); body.className = 'creature-body'; body.textContent = creature.text; body.style.color = creature.color;
    for (const eye of creature.eyes) body.append(makePart('eye', eye, instance.eyeExpression || 'open', creature));
    for (const mouth of creature.mouths) body.append(makePart('mouth', mouth, instance.mouthExpression || 'neutral', creature));
    element.append(body); creatureLayer.append(element);
    fitBodyText(body, world.clientWidth * 0.84); attachWorldPointer(element, instance);
  }
  for (const instance of state.foodInstances) {
    const food = state.foods.find(item => item.id === instance.templateId);
    if (!food) continue;
    const element = document.createElement('div'); element.className = 'food-object';
    element.dataset.foodId = instance.id; element.style.left = instance.x + '%'; element.style.top = instance.y + '%';
    element.textContent = food.text; element.style.color = food.color;
    creatureLayer.append(element); attachFoodPointer(element, instance, food);
  }
  $('#empty-hint').classList.toggle('hidden', state.spawned.length > 0 || state.foodInstances.length > 0);
  $('#creature-count').textContent = state.spawned.length + ' CREATURES · ' + state.foodInstances.length + ' FOOD';
}
function renderShelf() {
  shelf.replaceChildren();
  if (!state.creatures.length && !state.foods.length) {
    const empty = document.createElement('div'); empty.className = 'shelf-empty'; empty.textContent = 'Your creations will live here.'; shelf.append(empty); $('#shelf-count').textContent = '0'; return;
  }
  const appendCard = (item, kind) => {
    const isFood = kind === 'food';
    const card = document.createElement('div'); card.className = 'shelf-card' + (isFood ? ' food-card' : ''); card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', (isFood ? 'Spawn food ' : 'Spawn ') + item.text);
    const preview = document.createElement('div'); preview.className = isFood ? 'shelf-creature shelf-food' : 'shelf-creature'; preview.textContent = item.text; preview.style.color = item.color; card.append(preview);
    const actions = document.createElement('div'); actions.className = 'shelf-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'edit'; edit.setAttribute('aria-label', 'Edit ' + item.text);
    edit.addEventListener('click', event => { event.stopPropagation(); openEditor(item, kind); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Delete ' + item.text);
    remove.addEventListener('click', event => { event.stopPropagation(); deleteTemplate(item.id, kind); });
    actions.append(edit, remove); card.append(actions);
    const choose = () => isFood ? spawnFood(item.id) : spawnCreature(item.id);
    card.addEventListener('click', choose);
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    shelf.append(card);
  };
  state.creatures.forEach(item => appendCard(item, 'creature'));
  state.foods.forEach(item => appendCard(item, 'food'));
  $('#shelf-count').textContent = String(state.creatures.length + state.foods.length);
}
function renderAll() { renderShelf(); renderWorld(); }
function spawnCreature(templateId) {
  const instance = { id: uid(), templateId: templateId, x: 47 + Math.random() * 6, y: 42 + Math.random() * 9, eyeExpression: 'open', mouthExpression: 'neutral' };
  state.spawned.push(instance); selectedSpawnId = templateId; mode = 'idle';
  $('#spawn-button').classList.remove('active'); world.classList.remove('target-mode');
  persist(); renderAll(); showToast('A new friend has arrived');
}
function spawnFood(templateId) {
  const instance = { id: uid(), templateId: templateId, x: 28 + Math.random() * 45, y: 30 + Math.random() * 35 };
  state.foodInstances.push(instance); mode = 'idle';
  $('#spawn-button').classList.remove('active'); world.classList.remove('target-mode');
  persist(); renderAll(); showToast('Food added to the sandbox');
}
function deleteTemplate(id, kind) {
  if (kind === 'food') {
    const food = state.foods.find(item => item.id === id);
    state.foods = state.foods.filter(item => item.id !== id);
    state.foodInstances = state.foodInstances.filter(item => item.templateId !== id);
    persist(); renderAll(); showToast((food ? food.text : 'Food') + ' removed'); return;
  }
  const creature = state.creatures.find(item => item.id === id);
  state.creatures = state.creatures.filter(item => item.id !== id);
  const removed = state.spawned.filter(item => item.templateId === id);
  removed.forEach(item => clearFeedingSession(item.id));
  state.spawned = state.spawned.filter(item => item.templateId !== id);
  if (selectedSpawnId === id) selectedSpawnId = null;
  persist(); renderAll(); showToast((creature ? creature.text : 'Creature') + ' removed');
}
function attachWorldPointer(element, instance) {
  let startX = 0, startY = 0, originX = 0, originY = 0, dragging = false;
  element.addEventListener('pointerdown', event => {
    if (mode !== 'idle' || event.button !== 0) return;
    event.preventDefault(); element.setPointerCapture(event.pointerId);
    startX = event.clientX; startY = event.clientY; originX = instance.x; originY = instance.y; dragging = true;
  });
  element.addEventListener('pointermove', event => {
    if (!dragging) return;
    const rect = world.getBoundingClientRect();
    instance.x = Math.max(4, Math.min(96, originX + (event.clientX - startX) / rect.width * 100));
    instance.y = Math.max(8, Math.min(91, originY + (event.clientY - startY) / rect.height * 100));
    element.style.left = instance.x + '%'; element.style.top = instance.y + '%';
  });
  const finish = () => { if (dragging) { dragging = false; persist(); } };
  element.addEventListener('pointerup', finish); element.addEventListener('pointercancel', finish);
  element.addEventListener('click', event => {
    if (mode === 'idle') return;
    event.stopPropagation();
    if (mode === 'delete') {
      clearFeedingSession(instance.id);
      state.spawned = state.spawned.filter(item => item.id !== instance.id);
      setMode('idle'); persist(); renderAll(); showToast('Creature deleted');
    } else if (mode === 'expression') {
      clearFeedingSession(instance.id);
      instance.eyeExpression = $('#eye-expression').value;
      instance.mouthExpression = $('#mouth-expression').value;
      setMode('idle'); persist(); renderAll(); showToast('Expression delivered');
    }
  });
}
function attachFoodPointer(element, instance, food) {
  let startX = 0, startY = 0, originX = 0, originY = 0, dragging = false;
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (mode === 'delete') return;
    event.preventDefault(); element.setPointerCapture(event.pointerId);
    startX = event.clientX; startY = event.clientY; originX = instance.x; originY = instance.y; dragging = true;
  });
  element.addEventListener('pointermove', event => {
    if (!dragging) return;
    const rect = world.getBoundingClientRect();
    instance.x = Math.max(2, Math.min(98, originX + (event.clientX - startX) / rect.width * 100));
    instance.y = Math.max(4, Math.min(96, originY + (event.clientY - startY) / rect.height * 100));
    element.style.left = instance.x + '%'; element.style.top = instance.y + '%';
  });
  element.addEventListener('pointerup', event => {
    if (!dragging) return;
    dragging = false;
    const target = findCreatureAt(event.clientX, event.clientY);
    if (target) consumeFood(instance, food, target, event.clientX, event.clientY);
    else persist();
  });
  element.addEventListener('pointercancel', () => { if (dragging) { dragging = false; persist(); } });
  element.addEventListener('click', event => {
    if (mode !== 'delete') return;
    event.stopPropagation(); state.foodInstances = state.foodInstances.filter(item => item.id !== instance.id);
    setMode('idle'); persist(); renderAll(); showToast('Food deleted');
  });
}
function findCreatureAt(x, y) {
  const creatures = Array.from(creatureLayer.querySelectorAll('.creature'));
  return creatures.find(element => {
    const rect = element.getBoundingClientRect();
    return x >= rect.left - 14 && x <= rect.right + 14 && y >= rect.top - 14 && y <= rect.bottom + 14;
  });
}
function showCrumbs(color, clientX, clientY) {
  const rect = world.getBoundingClientRect();
  const originX = (clientX - rect.left) / rect.width * 100;
  const originY = (clientY - rect.top) / rect.height * 100;
  for (let index = 0; index < 8; index++) {
    const crumb = document.createElement('span'); crumb.className = 'crumb'; crumb.style.left = originX + '%'; crumb.style.top = originY + '%'; crumb.style.backgroundColor = color;
    const angle = (Math.PI * 2 * index / 8) + Math.random() * .35;
    const distance = 18 + Math.random() * 34;
    crumb.style.setProperty('--dx', Math.cos(angle) * distance + 'px');
    crumb.style.setProperty('--dy', Math.sin(angle) * distance + 'px');
    crumb.addEventListener('animationend', () => crumb.remove(), { once: true }); effectsLayer.append(crumb);
  }
}
function clearFeedingSession(instanceId) {
  const session = feedingSessions.get(instanceId);
  if (session) clearTimeout(session.timer);
  feedingSessions.delete(instanceId);
  const instance = state.spawned.find(item => item.id === instanceId);
  if (instance) { delete instance.eatingBaseEye; delete instance.eatingBaseMouth; delete instance.eatingUntil; }
}
function finishFeeding(instanceId, session) {
  const current = state.spawned.find(item => item.id === instanceId);
  if (current) {
    current.eyeExpression = session.eye; current.mouthExpression = session.mouth;
    delete current.eatingBaseEye; delete current.eatingBaseMouth; delete current.eatingUntil;
    persist(); renderWorld();
  }
  feedingSessions.delete(instanceId);
}
function feedCreature(instance, creature) {
  let session = feedingSessions.get(instance.id);
  if (!session) {
    session = { eye: instance.eyeExpression || 'open', mouth: instance.mouthExpression || 'neutral', timer: 0 };
    instance.eatingBaseEye = session.eye; instance.eatingBaseMouth = session.mouth;
    feedingSessions.set(instance.id, session);
  } else clearTimeout(session.timer);
  if (creature.eatEyeExpression !== 'do-not-change') instance.eyeExpression = creature.eatEyeExpression;
  if (creature.eatMouthExpression !== 'do-not-change') instance.mouthExpression = creature.eatMouthExpression;
  const duration = Math.max(.1, Math.min(60, Number(creature.eatDuration) || 1.2));
  instance.eatingUntil = Date.now() + duration * 1000;
  session.timer = setTimeout(() => finishFeeding(instance.id, session), duration * 1000);
}
function resumeFeedingSessions() {
  for (const instance of state.spawned) {
    if (!instance.eatingUntil || !instance.eatingBaseEye || !instance.eatingBaseMouth) continue;
    const session = { eye: instance.eatingBaseEye, mouth: instance.eatingBaseMouth, timer: 0 };
    feedingSessions.set(instance.id, session);
    const remaining = instance.eatingUntil - Date.now();
    if (remaining <= 0) finishFeeding(instance.id, session);
    else session.timer = setTimeout(() => finishFeeding(instance.id, session), remaining);
  }
}
function consumeFood(foodInstance, food, creatureElement, clientX, clientY) {
  const creatureInstance = state.spawned.find(item => item.id === creatureElement.dataset.id);
  const creature = creatureInstance && state.creatures.find(item => item.id === creatureInstance.templateId);
  state.foodInstances = state.foodInstances.filter(item => item.id !== foodInstance.id);
  showCrumbs(food.color, clientX, clientY);
  if (creatureInstance && creature) feedCreature(creatureInstance, creature);
  persist(); renderAll(); showToast('Yum!');
}
function newModel(creature) {
  if (creature) return clone(creature);
  return { id: uid(), text: 'hello!', color: '#f3a85c', eyes: [{ x: 34, y: 38 }, { x: 66, y: 38 }], mouths: [{ x: 50, y: 69 }], eatEyeExpression: 'surprised', eatMouthExpression: 'open-smile', eatDuration: 1.2 };
}
function openEditor(item, kind) {
  editorKind = kind || 'creature'; editorModel = newModel(item || null);
  $('#editor-title').textContent = editorKind === 'food' ? 'Food workshop' : 'Creature workshop';
  $('.eyebrow').textContent = editorKind === 'food' ? 'MAKE A LITTLE SNACK' : 'MAKE A NEW FRIEND';
  $('#text-field-label').textContent = editorKind === 'food' ? 'Food words' : 'Their words';
  $('#body-text').value = editorModel.text; $('#body-color').value = editorModel.color;
  const isFood = editorKind === 'food';
  $('#eye-controls').classList.toggle('hidden', isFood); $('#mouth-controls').classList.toggle('hidden', isFood);
  $('#eating-controls').classList.toggle('hidden', isFood);
  $('#editor-stage').classList.toggle('food-editing', isFood);
  $('#stage-tip').textContent = isFood ? 'Food is just the words, in a smaller bite' : 'Drag the face bits around';
  $('#editor-note').textContent = isFood ? 'A little bite, made only of words.' : 'The words are the whole body. Place each feature wherever it feels right.';
  if (!isFood) {
    $('#eat-eye-expression').value = editorModel.eatEyeExpression || 'do-not-change';
    $('#eat-mouth-expression').value = editorModel.eatMouthExpression || 'open-smile';
    $('#eat-duration').value = editorModel.eatDuration || 1.2;
  }
  renderEditor(); modal.classList.remove('hidden'); setMode('idle');
  setTimeout(() => $('#body-text').focus(), 30);
}
function closeEditor() { modal.classList.add('hidden'); editorModel = null; }
function renderEditor() {
  if (!editorModel) return;
  editorModel.text = $('#body-text').value || ' ';
  editorModel.color = $('#body-color').value;
  editorCreature.replaceChildren();
  const body = document.createElement('div'); body.className = editorKind === 'food' ? 'editor-body editor-food-body' : 'editor-body'; body.textContent = editorModel.text; body.style.color = editorModel.color;
  if (editorKind === 'creature') {
    editorModel.eyes.forEach((feature, index) => {
      const eye = document.createElement('span'); eye.className = 'eye-part editor-feature'; eye.style.left = feature.x + '%'; eye.style.top = feature.y + '%';
      eye.innerHTML = '<span class="pupil"></span>'; attachEditorDrag(eye, feature, body); eye.setAttribute('aria-label', 'Eye ' + (index + 1)); body.append(eye);
    });
    editorModel.mouths.forEach((feature, index) => {
      const mouth = document.createElement('span'); mouth.className = 'mouth-part editor-feature'; mouth.style.left = feature.x + '%'; mouth.style.top = feature.y + '%';
      attachEditorDrag(mouth, feature, body); mouth.setAttribute('aria-label', 'Mouth ' + (index + 1)); body.append(mouth);
    });
  }
  editorCreature.append(body);
  fitBodyText(body, editorStage.clientWidth * 0.82);
  if (editorKind === 'creature') {
    $('#eye-count').textContent = editorModel.eyes.length; $('#mouth-count').textContent = editorModel.mouths.length;
  }
}
function attachEditorDrag(element, feature, body) {
  element.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); element.setPointerCapture(event.pointerId); });
  element.addEventListener('pointermove', event => {
    if (!element.hasPointerCapture(event.pointerId)) return;
    const rect = body.getBoundingClientRect();
    feature.x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
    feature.y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
    element.style.left = feature.x + '%'; element.style.top = feature.y + '%';
  });
}
$('#create-button').addEventListener('click', () => openEditor(null, 'creature'));
$('#create-tool').addEventListener('click', () => openEditor(null, 'creature'));
$('#create-food-tool').addEventListener('click', () => openEditor(null, 'food'));
$('#close-editor').addEventListener('click', closeEditor);
$('#cancel-editor').addEventListener('click', closeEditor);
modal.addEventListener('click', event => { if (event.target === modal) closeEditor(); });
$('#body-text').addEventListener('input', renderEditor);
$('#body-color').addEventListener('input', renderEditor);
$('#eat-eye-expression').addEventListener('change', () => { if (editorModel && editorKind === 'creature') editorModel.eatEyeExpression = $('#eat-eye-expression').value; });
$('#eat-mouth-expression').addEventListener('change', () => { if (editorModel && editorKind === 'creature') editorModel.eatMouthExpression = $('#eat-mouth-expression').value; });
$('#eat-duration').addEventListener('input', () => { if (editorModel && editorKind === 'creature') editorModel.eatDuration = Math.max(.1, Math.min(60, Number($('#eat-duration').value) || 1.2)); });
$('#add-eye').addEventListener('click', () => { editorModel.eyes.push({ x: 50, y: 35 }); renderEditor(); });
$('#remove-eye').addEventListener('click', () => { if (editorModel.eyes.length) editorModel.eyes.pop(); renderEditor(); });
$('#add-mouth').addEventListener('click', () => { editorModel.mouths.push({ x: 50, y: 70 }); renderEditor(); });
$('#remove-mouth').addEventListener('click', () => { if (editorModel.mouths.length) editorModel.mouths.pop(); renderEditor(); });
$('#done-button').addEventListener('click', () => {
  const text = $('#body-text').value.trim();
  if (!text) { showToast('Give it some words first'); $('#body-text').focus(); return; }
  editorModel.text = text; editorModel.color = $('#body-color').value;
  if (editorKind === 'creature') {
    editorModel.eatEyeExpression = $('#eat-eye-expression').value;
    editorModel.eatMouthExpression = $('#eat-mouth-expression').value;
    editorModel.eatDuration = Math.max(.1, Math.min(60, Number($('#eat-duration').value) || 1.2));
  }
  const list = editorKind === 'food' ? state.foods : state.creatures;
  const index = list.findIndex(item => item.id === editorModel.id);
  if (index >= 0) list[index] = clone(editorModel); else list.push(clone(editorModel));
  if (editorKind === 'creature') selectedSpawnId = editorModel.id;
  persist(); closeEditor(); renderAll();
  showToast(index >= 0 ? (editorKind === 'food' ? 'Food updated' : 'Creature updated') : (editorKind === 'food' ? 'Food added to your shelf' : 'Creature added to your shelf'));
});
$('#spawn-button').addEventListener('click', () => {
  if (!state.creatures.length) { showToast('Create a creature before spawning one'); return; }
  setMode('spawn');
});
$('#give-button').addEventListener('click', () => setMode('expression'));
$('#delete-button').addEventListener('click', () => setMode('delete'));
world.addEventListener('click', event => { if (mode === 'spawn' && event.target === world) setMode('idle'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeEditor(); });
resumeFeedingSessions();
renderAll();