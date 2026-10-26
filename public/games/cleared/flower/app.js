const STORAGE_LIBRARY = 'petal-days-library-v1';
const STORAGE_INTERACTIONS = 'petal-days-interactions-v1';
const STORAGE_CONFIRM_DELETIONS = 'petal-days-confirm-deletions-v1';

const families = [
  ['red', '#e94f52'], ['red-orange', '#f26945'], ['orange', '#f38b38'], ['orange-yellow', '#f5b844'], ['yellow', '#f2d447'], ['yellow-lime', '#cfda43'], ['lime', '#a9ce47'], ['lime-green', '#75bd56'], ['green', '#4c9b62'], ['green-cyan', '#43a992'], ['cyan', '#4bc5c4'], ['cyan-blue', '#44aeca'], ['blue', '#4e82d2'], ['blue-navy', '#4b63bd'], ['navy', '#414d91'], ['navy-violet', '#554b9d'], ['violet', '#7955b8'], ['violet-purple', '#994cb4'], ['purple', '#b04ca6'], ['purple-magenta', '#ce4c9f'], ['magenta', '#e34d91'], ['neon magenta', '#fa4380'], ['neon magenta-pink', '#f44d9f'], ['pink', '#ea7b9e'], ['pink-brown', '#c17f7e'], ['brown', '#8c624e'], ['black', '#282c2a'], ['grey', '#89908b'], ['white', '#fffef9']
].map(([name, hex]) => ({ name, hex }));

function blendHex(a, b, amount) {
  const aa = a.replace('#', '');
  const bb = b.replace('#', '');
  const values = [0, 2, 4].map((offset) => {
    const first = parseInt(aa.slice(offset, offset + 2), 16);
    const second = parseInt(bb.slice(offset, offset + 2), 16);
    return Math.round(first * (1 - amount) + second * amount).toString(16).padStart(2, '0');
  });
  return `#${values.join('')}`;
}

function colorsForFamily(family) {
  if (family.name === 'black' || family.name === 'white') return [{ name: family.name, family: family.name, tone: 'base', hex: family.hex }];
  return [
    { name: `Very light ${family.name}`, family: family.name, tone: 'very-light', hex: blendHex(family.hex, '#ffffff', .82) },
    { name: `Light ${family.name}`, family: family.name, tone: 'light', hex: blendHex(family.hex, '#ffffff', .48) },
    { name: family.name, family: family.name, tone: 'base', hex: family.hex },
    { name: `Dark ${family.name}`, family: family.name, tone: 'dark', hex: blendHex(family.hex, '#171a18', .38) },
    { name: `Very dark ${family.name}`, family: family.name, tone: 'very-dark', hex: blendHex(family.hex, '#171a18', .72) }
  ];
}
const allColors = families.flatMap(colorsForFamily);
const findColor = (name) => allColors.find((color) => color.name.toLowerCase() === String(name).toLowerCase()) || allColors.find((color) => color.family === name) || allColors[0];
const makeId = () => globalThis.crypto?.randomUUID?.() || `flower-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const randomInteger = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomTenthStep = () => Number((randomInteger(10, 100) / 10).toFixed(1));
function fertilizerBonusFor(flower) {
  if (Number.isFinite(Number(flower.fertilizerGrowthBonus))) return Number(flower.fertilizerGrowthBonus);
  const growth = Number(flower.growthPerDay) || 3.5;
  const legacyGrowthWithFertilizer = Number(flower.fertilizerGrowthPerDay) || 9;
  return Math.max(0, legacyGrowthWithFertilizer - growth);
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn('Could not save garden data in this browser.', error); }
}

let library = readStorage(STORAGE_LIBRARY, []);
let customInteractions = readStorage(STORAGE_INTERACTIONS, []);
let activeFlower = null;
let flowerSerial = library.length + 1;
let selectedBreedIds = new Set();
let activePickerValues = {};
const pickers = {};
let confirmDeletions = readStorage(STORAGE_CONFIRM_DELETIONS, true) !== false;
let pendingDeletion = null;
let flowerNameMode = 'save';
let flowerToRenameId = null;

function safeColor(color) {
  if (color && typeof color.hex === 'string' && /^#[0-9a-f]{6}$/i.test(color.hex)) return color;
  return findColor(color?.name || color?.family || 'green');
}
function pickerMarkup(id, { multi = false, initial = [], onChange }) {
  pickers[id] = { multi, values: initial.map(safeColor), openFamily: null, onChange };
  const root = document.getElementById(id);
  root.dataset.pickerId = id;
  root.addEventListener('click', (event) => {
    const familyButton = event.target.closest('[data-family]');
    const toneButton = event.target.closest('[data-color-index]');
    const removeButton = event.target.closest('[data-remove-color]');
    if (removeButton) {
      const picker = pickers[id];
      if (picker.values.length <= 1 && picker.multi) return;
      picker.values.splice(Number(removeButton.dataset.removeColor), 1);
      renderPicker(id);
      picker.onChange?.(picker.values.map((color) => ({ ...color })));
      return;
    }
    if (toneButton) {
      const picker = pickers[id];
      const selected = allColors[Number(toneButton.dataset.colorIndex)];
      if (picker.multi) {
        const found = picker.values.findIndex((color) => color.name === selected.name);
        if (found >= 0) {
          if (picker.values.length === 1) return;
          picker.values.splice(found, 1);
        } else picker.values.push(selected);
      } else picker.values = [selected];
      picker.openFamily = null;
      renderPicker(id);
      picker.onChange?.(picker.values.map((color) => ({ ...color })));
      return;
    }
    if (familyButton) {
      const picker = pickers[id];
      const familyName = familyButton.dataset.family;
      const family = families.find((item) => item.name === familyName);
      if (family.name === 'black' || family.name === 'white') {
        const selected = colorsForFamily(family)[0];
        if (picker.multi) {
          const found = picker.values.findIndex((color) => color.name === selected.name);
          if (found >= 0) {
            if (picker.values.length === 1) return;
            picker.values.splice(found, 1);
          } else picker.values.push(selected);
        } else picker.values = [selected];
        picker.openFamily = null;
        renderPicker(id);
        picker.onChange?.(picker.values.map((color) => ({ ...color })));
      } else {
        picker.openFamily = picker.openFamily === familyName ? null : familyName;
        renderPicker(id);
      }
    }
  });
  renderPicker(id);
}
function renderPicker(id) {
  const picker = pickers[id];
  const root = document.getElementById(id);
  const selected = picker.values.map((color, index) => `<span class="color-chip"><i class="chip-swatch" style="background:${color.hex}"></i><span>${escapeHTML(color.name)}</span>${picker.multi ? `<button type="button" class="chip-remove" data-remove-color="${index}" aria-label="Remove ${escapeHTML(color.name)}">×</button>` : ''}</span>`).join('');
  const grid = families.map((family) => {
    const familySelected = picker.values.some((color) => color.family === family.name);
    const expanded = picker.openFamily === family.name;
    return `<button type="button" class="palette-family ${familySelected ? 'selected-family' : ''}" data-family="${escapeHTML(family.name)}" aria-label="${escapeHTML(family.name)}" aria-expanded="${expanded}" title="${escapeHTML(family.name)}" style="background:${family.hex}"></button>`;
  }).join('');
  const shades = picker.openFamily ? colorsForFamily(families.find((family) => family.name === picker.openFamily)).map((color) => {
    const index = allColors.findIndex((entry) => entry.name === color.name);
    const selectedTone = picker.values.some((item) => item.name === color.name);
    const label = color.tone === 'very-light' ? 'Very light' : color.tone === 'very-dark' ? 'Very dark' : color.tone === 'base' ? 'Base' : color.tone[0].toUpperCase() + color.tone.slice(1);
    return `<button type="button" class="shade-option ${selectedTone ? 'selected-tone' : ''}" data-color-index="${index}" title="${escapeHTML(color.name)}"><i style="background:${color.hex}"></i>${label}</button>`;
  }).join('') : '';
  root.innerHTML = `<div class="palette-selected">${selected}</div><div class="palette-grid">${grid}</div>${shades ? `<div class="shade-row">${shades}</div>` : ''}${picker.multi ? '<p class="palette-footnote">Tap a hue, then choose a tone. Colors follow this order.</p>' : ''}`;
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function boundedInput(id, min, max, fallback, step = 1) {
  const value = Number(document.getElementById(id).value);
  const precision = String(step).split('.')[1]?.length || 0;
  const normalized = Number((Math.round((Number.isFinite(value) ? value : fallback) / step) * step).toFixed(precision));
  return Math.min(max, Math.max(min, normalized));
}
function petalLengthFor(flower) {
  return Math.max(1, Math.min(10, Math.round(Number(flower.petalLength) || 5)));
}

function flowerSvg(flower, forceBloom = false, preview = false) {
  const length = preview ? 104 : Math.max(16, Number(flower.stemLength) || 16);
  const baseY = Math.max(278, length + 54);
  const viewHeight = Math.ceil(baseY + 22);
  const topY = baseY - length;
  const bloomed = forceBloom || (Number(flower.day) > 0 && Number(flower.day) >= Number(flower.bloomDay));
  const stem = safeColor(flower.stemColor || findColor('green'));
  const center = safeColor(flower.centerColor || findColor('yellow'));
  const petalOutline = safeColor(flower.petalOutlineColor || findColor('white'));
  const centerOutline = safeColor(flower.centerOutlineColor || findColor('Very light yellow'));
  const stripeColor = safeColor(flower.petalStripeColor || findColor('white'));
  const centerShineColor = safeColor(flower.centerShineColor || findColor('Very light yellow'));
  const hasCenter = flower.hasCenter !== false;
  const hasCenterShine = flower.showCenterShine !== false;
  const hasPetalStripes = flower.showPetalStripes === true;
  const colors = (flower.petalColors?.length ? flower.petalColors : [findColor('pink')]).map(safeColor);
  const amount = Math.max(1, Math.min(50, Number(flower.petalAmount) || 8));
  const petalLengthValue = petalLengthFor(flower);
  const petalLength = 16 + (petalLengthValue - 1) * 7.5;
  const shape = flower.petalShape || 'oval';
  const scale = amount > 18 ? Math.max(.48, 1 - (amount - 18) * .009) : 1;
  let petals = '';
  if (bloomed) {
    for (let index = 0; index < amount; index += 1) {
      const cycleLength = colors.length;
      let colorIndex = index % cycleLength;
      if (flower.petalColorCycle === 'reverse' && cycleLength > 1) {
        const cyclePosition = index % (cycleLength * 2 - 2);
        colorIndex = cyclePosition >= cycleLength
          ? cycleLength * 2 - 2 - cyclePosition
          : cyclePosition;
      }
      const color = colors[colorIndex];
      let shapeSvg = '';
      if (shape === 'triangle') shapeSvg = `<path d="M0 -${petalLength} Q2 -${petalLength * .82} 12 0 L-12 0 Q-2 -${petalLength * .82} 0 -${petalLength}Z"/>`;
      else if (shape === 'rectangle') shapeSvg = `<path d="M-7 0 L-6 -${petalLength * .88} Q0 -${petalLength * .94} 6 -${petalLength * .88} L7 0Z"/>`;
      else shapeSvg = `<ellipse cx="0" cy="${-petalLength / 2}" rx="12" ry="${petalLength / 2}"/>`;
      const petalStroke = flower.showPetalOutlines === false ? 'none' : petalOutline.hex;
      const stripe = hasPetalStripes
        ? `<path d="M0 -1 L0 -${petalLength}" fill="none" stroke="${stripeColor.hex}" stroke-opacity="1" stroke-width="${Math.max(1, petalLength * .045)}" stroke-linecap="round"/>`
        : '';
      petals += `<g transform="rotate(${(360 / amount) * index}) scale(${scale})" fill="${color.hex}" stroke="${petalStroke}" stroke-opacity=".44" stroke-width="1.1">${shapeSvg}${stripe}</g>`;
    }
    if (hasCenter) {
      const centerStroke = flower.showCenterOutline === false ? 'none' : centerOutline.hex;
      const shine = hasCenterShine ? `<circle cx="-4" cy="-4" r="2" fill="${centerShineColor.hex}" opacity=".8"/>` : '';
      petals += `<circle cx="0" cy="0" r="${Math.max(10, Math.min(16, 19 - amount * .1))}" fill="${center.hex}" stroke="${centerStroke}" stroke-width="2"/>${shine}`;
    }
  }
  const leafLeft = topY + length * .47;
  const leafRight = topY + length * .7;
  return `<svg viewBox="0 0 300 ${viewHeight}" role="img" aria-label="${bloomed ? 'A blooming' : 'A growing'} ${escapeHTML(shape)} petal flower"><path d="M150 ${baseY} Q${preview ? 151 : 148} ${(baseY + topY) / 2} 150 ${topY}" fill="none" stroke="${stem.hex}" stroke-width="7" stroke-linecap="round"/><path d="M150 ${leafLeft} Q125 ${leafLeft - 24} 122 ${leafLeft - 13} Q127 ${leafLeft + 4} 150 ${leafLeft + 2}Z" fill="${blendHex(stem.hex, '#ffffff', .16)}"/><path d="M150 ${leafRight} Q176 ${leafRight - 25} 181 ${leafRight - 14} Q176 ${leafRight + 3} 150 ${leafRight + 2}Z" fill="${blendHex(stem.hex, '#ffffff', .12)}"/>${bloomed ? `<g transform="translate(150 ${topY})">${petals}</g>` : ''}<path d="M129 ${baseY} Q150 ${baseY - 5} 171 ${baseY}" fill="none" stroke="${blendHex(stem.hex, '#fff', .18)}" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function paintFlower(target, flower, forceBloom = false, preview = false) {
  if (target.id === 'gardenFlower') {
    const length = Math.max(16, Number(flower.stemLength) || 16);
    const drawingHeight = Math.max(300, Math.ceil(Math.max(278, length + 54) + 22));
    target.style.height = `${drawingHeight}px`;
    document.querySelector('.garden-sky').style.height = `${Math.max(415, drawingHeight + 115)}px`;
  }
  target.innerHTML = flowerSvg(flower, forceBloom, preview);
}
function builderFlower() {
  return {
    petalShape: document.getElementById('petalShape').value,
    petalAmount: boundedInput('petalAmount', 1, 50, 8),
    petalLength: boundedInput('petalLength', 1, 10, 5),
    petalColorCycle: document.getElementById('petalColorCycle').value,
    showPetalOutlines: !document.getElementById('removePetalOutlines').checked,
    showPetalStripes: document.getElementById('addPetalStripes').checked,
    petalColors: pickers.petalPicker.values,
    petalOutlineColor: pickers.petalOutlinePicker.values[0],
    petalStripeColor: pickers.petalStripePicker.values[0],
    stemColor: pickers.stemPicker.values[0],
    centerColor: pickers.centerPicker.values[0],
    centerOutlineColor: pickers.centerOutlinePicker.values[0],
    showCenterOutline: !document.getElementById('removeCenterOutline').checked,
    showCenterShine: !document.getElementById('removeCenterShine').checked,
    centerShineColor: pickers.centerShinePicker.values[0],
    hasCenter: !document.getElementById('removeCenter').checked,
    bloomDay: boundedInput('bloomDay', 1, 100, 7),
    stopDay: boundedInput('stopDay', 10, 300, 24),
    growthPerDay: boundedInput('dailyGrowth', 1, 10, 3.5, .1),
    fertilizerGrowthBonus: boundedInput('fertilizedGrowth', 1, 10, 5, .1),
    day: 999,
    stemLength: 104
  };
}
function updateBuilder() {
  const flower = builderFlower();
  paintFlower(document.getElementById('builderFlower'), flower, true, true);
  const shapeNames = { oval: 'Oval', triangle: 'Long triangle', rectangle: 'Rectangle' };
  document.getElementById('previewShapeLabel').textContent = `${shapeNames[flower.petalShape]} petals`;
  document.getElementById('previewPetalCount').textContent = `${flower.petalAmount} ${flower.petalAmount === 1 ? 'petal' : 'petals'}`;
}
function syncCenterPickerAvailability() {
  const noCenter = document.getElementById('removeCenter').checked;
  const noCenterOutline = document.getElementById('removeCenterOutline').checked;
  const noCenterShine = document.getElementById('removeCenterShine').checked;
  document.getElementById('centerPicker').classList.toggle('picker-disabled', noCenter);
  document.getElementById('centerOutlinePicker').classList.toggle('picker-disabled', noCenter || noCenterOutline);
  document.getElementById('centerShinePicker').classList.toggle('picker-disabled', noCenter || noCenterShine);
}
function syncPetalStripePickerAvailability() {
  document.getElementById('petalStripePicker').classList.toggle('picker-disabled', !document.getElementById('addPetalStripes').checked);
}
function randomizeFlower() {
  const colorCount = randomInteger(1, 5);
  const availableColors = [...allColors];
  pickers.petalPicker.values = Array.from({ length: colorCount }, () => availableColors.splice(randomInteger(0, availableColors.length - 1), 1)[0]);
  pickers.stemPicker.values = [randomItem(allColors)];
  pickers.centerPicker.values = [randomItem(allColors)];
  pickers.petalOutlinePicker.values = [randomItem(allColors)];
  pickers.centerOutlinePicker.values = [randomItem(allColors)];
  pickers.petalStripePicker.values = [randomItem(allColors)];
  pickers.centerShinePicker.values = [randomItem(allColors)];
  ['petalPicker', 'stemPicker', 'centerPicker', 'petalOutlinePicker', 'centerOutlinePicker', 'petalStripePicker', 'centerShinePicker'].forEach(renderPicker);

  document.getElementById('petalShape').value = randomItem(['oval', 'triangle', 'rectangle']);
  document.getElementById('petalAmount').value = randomInteger(1, 50);
  document.getElementById('petalLength').value = randomInteger(1, 10);
  document.getElementById('petalColorCycle').value = randomItem(['repeat', 'reverse']);
  document.getElementById('removePetalOutlines').checked = Math.random() < .5;
  document.getElementById('addPetalStripes').checked = Math.random() < .5;
  document.getElementById('bloomDay').value = randomInteger(1, 100);
  document.getElementById('stopDay').value = randomInteger(10, 300);
  document.getElementById('dailyGrowth').value = randomTenthStep();
  document.getElementById('fertilizedGrowth').value = randomTenthStep();
  document.getElementById('removeCenter').checked = Math.random() < .25;
  document.getElementById('removeCenterOutline').checked = Math.random() < .25;
  document.getElementById('removeCenterShine').checked = Math.random() < .25;
  syncCenterPickerAvailability();
  syncPetalStripePickerAvailability();
  updateBuilder();
}
function makeFlowerFromBuilder() {
  const form = builderFlower();
  return {
    id: makeId(), name: `Flower ${flowerSerial++}`, petalShape: form.petalShape, petalAmount: form.petalAmount, petalLength: form.petalLength,
    petalColorCycle: form.petalColorCycle, showPetalOutlines: form.showPetalOutlines, showPetalStripes: form.showPetalStripes,
    petalColors: form.petalColors.map((color) => ({ ...color })), petalOutlineColor: { ...form.petalOutlineColor },
    petalStripeColor: { ...form.petalStripeColor }, bloomDay: form.bloomDay,
    stopDay: form.stopDay, stemColor: { ...form.stemColor }, centerColor: { ...form.centerColor },
    centerOutlineColor: { ...form.centerOutlineColor }, showCenterOutline: form.showCenterOutline,
    showCenterShine: form.showCenterShine, centerShineColor: { ...form.centerShineColor }, hasCenter: form.hasCenter,
    growthPerDay: form.growthPerDay, fertilizerGrowthBonus: form.fertilizerGrowthBonus, day: 0,
    stemLength: 17, fertilizedDays: 0
  };
}
function setView(view) {
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.getElementById('createView').classList.toggle('hidden', view !== 'create');
  document.getElementById('playView').classList.toggle('hidden', view !== 'play');
  document.getElementById('libraryView').classList.toggle('hidden', view !== 'library');
  if (view === 'library') renderLibrary();
}
function startGrowing(flower) {
  activeFlower = JSON.parse(JSON.stringify(flower));
  activeFlower.growthPerDay = Number(activeFlower.growthPerDay) || 3.4;
  activeFlower.fertilizerGrowthBonus = fertilizerBonusFor(activeFlower);
  document.getElementById('playFlowerName').textContent = activeFlower.name;
  document.getElementById('bloomMilestone').textContent = `Day ${activeFlower.bloomDay}`;
  document.getElementById('stopMilestone').textContent = `Day ${activeFlower.stopDay}`;
  const shapeNames = { oval: 'oval', triangle: 'long triangle', rectangle: 'rectangle' };
  document.getElementById('petalMilestone').textContent = `${activeFlower.petalAmount} ${shapeNames[activeFlower.petalShape]}`;
  document.getElementById('saveFlower').innerHTML = '♡ <span>Save to library</span>';
  renderPlay();
  renderCustomButtons();
  setView('play');
}
function renderPlay() {
  if (!activeFlower) return;
  const bloomed = activeFlower.day > 0 && activeFlower.day >= activeFlower.bloomDay;
  document.getElementById('dayNumber').textContent = activeFlower.day;
  paintFlower(document.getElementById('gardenFlower'), activeFlower);
  document.getElementById('bloomStatus').textContent = bloomed ? `In bloom · ${activeFlower.petalAmount} lovely petals` : activeFlower.day === 0 ? 'A tiny sprout is waking up' : `Growing quietly · blooms on day ${activeFlower.bloomDay}`;
  const maxReached = activeFlower.day >= activeFlower.stopDay;
  document.getElementById('growthReadout').textContent = maxReached ? 'Your stem has reached its full height.' : activeFlower.fertilizedDays > 0 ? `Plant food is helping for ${activeFlower.fertilizedDays} more ${activeFlower.fertilizedDays === 1 ? 'day' : 'days'}.` : 'Your stem is just beginning.';
  const status = document.getElementById('fertilizerStatus');
  status.classList.toggle('hidden', activeFlower.fertilizedDays <= 0);
  if (activeFlower.fertilizedDays > 0) status.textContent = `✧ Plant food is active for ${activeFlower.fertilizedDays} more ${activeFlower.fertilizedDays === 1 ? 'day' : 'days'}.`;
  const growButton = document.getElementById('growButton');
  growButton.querySelector('.grow-sub').textContent = maxReached ? '+1 day' : activeFlower.fertilizedDays ? 'extra growth' : '+1 day';
}
function growOneDay() {
  if (!activeFlower) return;
  activeFlower.day += 1;
  if (activeFlower.day <= activeFlower.stopDay) {
    const dailyGrowth = activeFlower.fertilizedDays > 0
      ? activeFlower.growthPerDay + activeFlower.fertilizerGrowthBonus
      : activeFlower.growthPerDay;
    activeFlower.stemLength += dailyGrowth;
  }
  if (activeFlower.fertilizedDays > 0) activeFlower.fertilizedDays -= 1;
  renderPlay();
}
function addFertilizer() {
  if (!activeFlower) return;
  activeFlower.fertilizedDays = activeFlower.fertilizedDays > 0 ? activeFlower.fertilizedDays + 1 : 5;
  renderPlay();
}
function openFlowerNameDialog(mode, flower = null) {
  flowerNameMode = mode;
  flowerToRenameId = mode === 'rename' ? flower?.id || null : null;
  const input = document.getElementById('flowerNameInput');
  document.getElementById('flowerNameHeading').textContent = mode === 'rename' ? 'Rename your flower' : 'Name your flower';
  document.getElementById('flowerNameIntro').textContent = mode === 'rename'
    ? 'Choose a new name for this flower.'
    : 'Give this bloom a name for your library, or leave it blank.';
  document.getElementById('saveFlowerName').innerHTML = mode === 'rename' ? 'Save name <span>↗</span>' : 'Save flower <span>↗</span>';
  input.value = mode === 'rename' ? flower?.name || '' : '';
  input.placeholder = mode === 'rename' ? 'Flower name' : 'e.g. Sunny';
  document.getElementById('flowerNameDialog').showModal();
  input.focus();
}
function saveFlowerName() {
  const name = document.getElementById('flowerNameInput').value.trim();
  if (flowerNameMode === 'rename') {
    if (!name) {
      document.getElementById('flowerNameInput').focus();
      return;
    }
    const flower = library.find((entry) => entry.id === flowerToRenameId);
    if (flower) {
      flower.name = name;
      writeStorage(STORAGE_LIBRARY, library);
      renderLibrary();
    }
    document.getElementById('flowerNameDialog').close();
    return;
  }
  if (!activeFlower) return;
  if (name) {
    activeFlower.name = name;
    document.getElementById('playFlowerName').textContent = name;
  }
  document.getElementById('flowerNameDialog').close();
  saveFlowerToLibrary();
}
function saveFlower() {
  if (!activeFlower) return;
  openFlowerNameDialog('save');
}
function saveFlowerToLibrary() {
  if (!activeFlower) return;
  const snapshot = JSON.parse(JSON.stringify(activeFlower));
  snapshot.id = makeId();
  snapshot.name = activeFlower.name || `Flower ${flowerSerial++}`;
  snapshot.savedAt = Date.now();
  library.unshift(snapshot);
  writeStorage(STORAGE_LIBRARY, library);
  updateLibraryCount();
  const button = document.getElementById('saveFlower');
  button.innerHTML = '♥ <span>Saved to library</span>';
  button.classList.add('saved');
}
function setConfirmDeletions(value) {
  confirmDeletions = value;
  writeStorage(STORAGE_CONFIRM_DELETIONS, confirmDeletions);
  document.querySelectorAll('.confirm-deletions-toggle').forEach((input) => {
    input.checked = confirmDeletions;
  });
}
function deleteLibraryFlower(id) {
  library = library.filter((entry) => entry.id !== id);
  writeStorage(STORAGE_LIBRARY, library);
  renderLibrary();
}
function deleteCustomInteraction(id) {
  customInteractions = customInteractions.filter((entry) => entry.id !== id);
  writeStorage(STORAGE_INTERACTIONS, customInteractions);
  renderCustomButtons();
  renderCustomInteractionManager();
}
function requestDeletion(type, id, name) {
  if (!confirmDeletions) {
    if (type === 'flower') deleteLibraryFlower(id);
    else deleteCustomInteraction(id);
    return;
  }
  pendingDeletion = { type, id };
  document.getElementById('deleteConfirmMessage').textContent = `Are you sure you would like to delete ${name}?`;
  document.getElementById('deleteConfirmDialog').showModal();
}
function finishDeletion(confirmed) {
  const deletion = pendingDeletion;
  pendingDeletion = null;
  document.getElementById('deleteConfirmDialog').close();
  if (!confirmed || !deletion) return;
  if (deletion.type === 'flower') deleteLibraryFlower(deletion.id);
  else deleteCustomInteraction(deletion.id);
}
function renderCustomButtons() {
  const root = document.getElementById('actionButtons');
  root.querySelectorAll('.custom-interaction-button').forEach((button) => button.remove());
  customInteractions.forEach((interaction) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-button custom-interaction-button';
    button.dataset.customId = interaction.id;
    button.innerHTML = `<span class="action-icon" style="color:${safeColor(interaction.color).hex}">✦</span><span>${escapeHTML(interaction.name)}</span>`;
    root.insertBefore(button, document.getElementById('openInteraction'));
  });
}
function renderCustomInteractionManager() {
  const root = document.getElementById('customInteractionList');
  if (!root) return;
  if (!customInteractions.length) {
    root.innerHTML = '<div class="custom-interaction-empty">No custom interactions yet.</div>';
  } else {
    root.innerHTML = customInteractions.map((interaction) => `<div class="custom-interaction-row"><span>${escapeHTML(interaction.name)}</span><button class="small-button delete-interaction" type="button" data-custom-delete="${escapeHTML(interaction.id)}" aria-label="Delete ${escapeHTML(interaction.name)}">Delete</button></div>`).join('');
  }
  document.querySelectorAll('.confirm-deletions-toggle').forEach((input) => {
    input.checked = confirmDeletions;
  });
}
function triggerParticles(animation, color, effect = 'none') {
  const layer = document.getElementById('particleLayer');
  if (!layer) return;
  if (effect === 'fertilize') addFertilizer();
  const count = animation === 'water' || animation === 'fertilizer' ? 13 : 10;
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement('i');
    particle.className = `particle ${animation === 'water' ? 'splash' : animation === 'fertilizer' ? 'fertilizer' : animation === 'up' ? 'float-up' : animation === 'fade-up' ? 'fade-up' : 'sparkle'}`;
    particle.style.setProperty('--particle', safeColor(color).hex);
    particle.style.setProperty('--left', `${8 + Math.random() * 84}%`);
    particle.style.setProperty('--delay', `${Math.random() * .75}s`);
    particle.style.setProperty('--duration', `${1.35 + Math.random() * .55}s`);
    layer.appendChild(particle);
    if (animation === 'water') {
      const mark = document.createElement('i');
      mark.className = 'splash-mark';
      mark.style.setProperty('--left', particle.style.getPropertyValue('--left'));
      mark.style.setProperty('--particle', safeColor(color).hex);
      mark.style.setProperty('--delay', `${1.05 + Math.random() * .65}s`);
      layer.appendChild(mark);
    }
    window.setTimeout(() => particle.remove(), 3000);
    if (animation === 'water') window.setTimeout(() => layer.querySelector('.splash-mark')?.remove(), 3200);
  }
}
function performAction(action, custom = null) {
  if (action === 'water') triggerParticles('water', findColor('cyan-blue'));
  else if (action === 'fertilize') {
    addFertilizer();
    triggerParticles('fertilizer', findColor('white'));
  } else if (custom) triggerParticles(custom.animation, custom.color, custom.effect);
}

function cloneFlower(flower) {
  return JSON.parse(JSON.stringify(flower));
}
function renderLibrary() {
  const root = document.getElementById('libraryContent');
  updateLibraryCount();
  if (!library.length) {
    root.innerHTML = `<div class="empty-library"><div class="empty-flower">✿</div><h2>Your garden has room to grow</h2><p>Save a flower you’ve made and it will be waiting here.</p><button class="button button-primary" id="emptyCreate">Make your first flower <span>↗</span></button></div>`;
    document.getElementById('emptyCreate').addEventListener('click', () => setView('create'));
    return;
  }
  root.innerHTML = `<div class="library-toolbar"><span><strong>${library.length}</strong> ${library.length === 1 ? 'flower' : 'flowers'} in your patch</span><label class="delete-confirm-toggle"><input class="confirm-deletions-toggle" type="checkbox" ${confirmDeletions ? 'checked' : ''}> Confirm before deleting</label><button class="button button-outline" id="openBreed">✧ Breed blooms</button></div><div class="library-grid">${library.map((flower) => {
    const bloom = flower.day > 0 && flower.day >= flower.bloomDay;
    return `<article class="flower-card" data-flower-id="${escapeHTML(flower.id)}"><span class="bloom-badge">${bloom ? '✿ Bloomed' : `Day ${flower.day}`}</span><div class="flower-card-art"><div class="flower-art">${flowerSvg(flower)}</div></div><div class="flower-card-info"><h2 class="flower-card-title">${escapeHTML(flower.name || 'Garden flower')}</h2><div class="flower-card-meta"><span>Day ${flower.day}</span><span>·</span><span>${flower.petalAmount} petals</span><span>·</span><span>${escapeHTML(flower.petalColors.map((color) => safeColor(color).name).join(' / '))}</span></div><div class="flower-card-actions"><button class="small-button take-care" data-library-action="care">Take care</button><button class="small-button rename-flower" data-library-action="rename">Rename</button><button class="small-button delete-flower" data-library-action="delete" aria-label="Delete ${escapeHTML(flower.name || 'flower')}">Delete</button></div></div></article>`;
  }).join('')}</div>`;
  document.getElementById('openBreed').addEventListener('click', openBreedDialog);
  root.querySelector('.confirm-deletions-toggle').addEventListener('change', (event) => setConfirmDeletions(event.target.checked));
  root.querySelectorAll('[data-library-action]').forEach((button) => button.addEventListener('click', () => {
    const card = button.closest('.flower-card');
    const flower = library.find((entry) => entry.id === card.dataset.flowerId);
    if (button.dataset.libraryAction === 'care' && flower) startGrowing(cloneFlower(flower));
    if (button.dataset.libraryAction === 'rename' && flower) openFlowerNameDialog('rename', flower);
    if (button.dataset.libraryAction === 'delete' && flower) requestDeletion('flower', flower.id, flower.name || 'this flower');
  }));
}
function updateLibraryCount() {
  document.getElementById('libraryCount').textContent = library.length;
}
function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}
function mixColors(a, b) {
  const mixed = rgb(safeColor(a).hex).map((value, index) => Math.round((value + rgb(safeColor(b).hex)[index]) / 2));
  const hex = `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  return { name: 'Blended color', family: 'blend', tone: 'mixed', hex };
}
function inheritColor(first, second) {
  const method = Math.floor(Math.random() * 3);
  return method === 0 ? safeColor(first) : method === 1 ? safeColor(second) : mixColors(first, second);
}
function inheritCenter(first, second) {
  const firstHasCenter = first.hasCenter !== false;
  const secondHasCenter = second.hasCenter !== false;
  const method = Math.floor(Math.random() * 3);
  if (method === 0) return { hasCenter: firstHasCenter, centerColor: safeColor(first.centerColor) };
  if (method === 1) return { hasCenter: secondHasCenter, centerColor: safeColor(second.centerColor) };
  if (firstHasCenter && secondHasCenter) return { hasCenter: true, centerColor: mixColors(first.centerColor, second.centerColor) };
  const inherited = firstHasCenter ? first : secondHasCenter ? second : null;
  return { hasCenter: Boolean(inherited), centerColor: safeColor(inherited?.centerColor || findColor('yellow')) };
}
function mixNumber(first, second) {
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  if (high - low <= 1) return randomItem([first, second]);
  return Math.floor(Math.random() * (high - low - 1)) + low + 1;
}
function mixedPetalLength(first, second) {
  const firstLength = petalLengthFor(first);
  const secondLength = petalLengthFor(second);
  if (Math.abs(firstLength - secondLength) <= 1) return null;
  return mixNumber(firstLength, secondLength);
}
function petalColorsForChild(first, second) {
  const multiFirst = first.petalColors.length > 1;
  const multiSecond = second.petalColors.length > 1;
  const mode = randomItem(['random-parent', 'blend', 'cross']);
  if (mode === 'random-parent') return cloneFlower(randomItem([first, second])).petalColors;
  let count;
  if (mode === 'blend') count = randomItem([first, second]).petalColors.length;
  else if (multiFirst && !multiSecond) count = first.petalColors.length;
  else if (multiSecond && !multiFirst) count = second.petalColors.length;
  else if (multiFirst && multiSecond) count = randomItem([first, second]).petalColors.length;
  else count = 2;
  count = Math.max(2, Math.min(12, count));
  if (mode === 'blend') {
    const firstColors = first.petalColors;
    const secondColors = second.petalColors;
    return Array.from({ length: count }, (_, index) => mixColors(firstColors[index % firstColors.length], secondColors[(index + 1) % secondColors.length]));
  }
  const firstStarts = Math.random() < .5;
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return safeColor((firstStarts ? first : second).petalColors[0]);
    if (index === 1) return safeColor((firstStarts ? second : first).petalColors[0]);
    const parent = randomItem([first, second]);
    const colorIndex = Math.floor(index / 2);
    return safeColor(parent.petalColors[colorIndex % parent.petalColors.length]);
  });
}
function breedFlowers(first, second) {
  const center = inheritCenter(first, second);
  const child = {
    id: makeId(), name: `Flower ${flowerSerial++}`,
    petalShape: randomItem([first, second]).petalShape,
    petalAmount: Math.min(50, randomItem([first.petalAmount, second.petalAmount, mixNumber(first.petalAmount, second.petalAmount)])),
    petalLength: randomItem([
      petalLengthFor(first),
      petalLengthFor(second),
      mixedPetalLength(first, second)
    ].filter(Number.isInteger)),
    petalColors: petalColorsForChild(first, second),
    petalColorCycle: randomItem([first.petalColorCycle || 'repeat', second.petalColorCycle || 'repeat']),
    showPetalOutlines: randomItem([first.showPetalOutlines !== false, second.showPetalOutlines !== false]),
    petalOutlineColor: inheritColor(first.petalOutlineColor || findColor('white'), second.petalOutlineColor || findColor('white')),
    showPetalStripes: randomItem([first.showPetalStripes === true, second.showPetalStripes === true]),
    petalStripeColor: inheritColor(first.petalStripeColor || findColor('white'), second.petalStripeColor || findColor('white')),
    stemColor: inheritColor(first.stemColor, second.stemColor),
    centerOutlineColor: inheritColor(first.centerOutlineColor || findColor('Very light yellow'), second.centerOutlineColor || findColor('Very light yellow')),
    showCenterOutline: randomItem([first.showCenterOutline !== false, second.showCenterOutline !== false]),
    centerShineColor: inheritColor(first.centerShineColor || findColor('Very light yellow'), second.centerShineColor || findColor('Very light yellow')),
    showCenterShine: randomItem([first.showCenterShine !== false, second.showCenterShine !== false]),
    ...center,
    bloomDay: randomItem([first.bloomDay, second.bloomDay, mixNumber(first.bloomDay, second.bloomDay)]),
    stopDay: randomItem([first.stopDay, second.stopDay, mixNumber(first.stopDay, second.stopDay)]),
    growthPerDay: randomItem([first.growthPerDay || 3.5, second.growthPerDay || 3.5]),
    fertilizerGrowthBonus: randomItem([fertilizerBonusFor(first), fertilizerBonusFor(second)]),
    day: 0, stemLength: 17, fertilizedDays: 0
  };
  return child;
}
function openBreedDialog() {
  selectedBreedIds = new Set();
  renderBreedChoices();
  document.getElementById('breedDialog').showModal();
}
function renderBreedChoices() {
  const root = document.getElementById('breedChoices');
  const bloomedFlowers = library.filter((flower) => flower.day > 0 && flower.day >= flower.bloomDay);
  if (bloomedFlowers.length < 2) {
    root.innerHTML = `<div class="breed-empty">Two bloomed flowers are needed to grow a seed.<br>Keep tending your flowers and save them once they open.</div>`;
    document.getElementById('breedButton').disabled = true;
    return;
  }
  root.innerHTML = bloomedFlowers.map((flower) => `<label class="breed-choice ${selectedBreedIds.has(flower.id) ? 'selected' : ''}"><input type="checkbox" value="${escapeHTML(flower.id)}" ${selectedBreedIds.has(flower.id) ? 'checked' : ''}><span class="breed-choice-preview"><span class="flower-art">${flowerSvg(flower)}</span></span><span class="breed-choice-copy"><strong>${escapeHTML(flower.name)}</strong><span>Day ${flower.day} · ${flower.petalAmount} petals</span></span></label>`).join('');
  root.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => {
    if (input.checked && selectedBreedIds.size >= 2) input.checked = false;
    else if (input.checked) selectedBreedIds.add(input.value);
    else selectedBreedIds.delete(input.value);
    renderBreedChoices();
  }));
  document.getElementById('breedButton').disabled = selectedBreedIds.size !== 2;
}

pickerMarkup('petalPicker', { multi: true, initial: [findColor('pink')], onChange: updateBuilder });
pickerMarkup('petalOutlinePicker', { initial: [findColor('white')], onChange: updateBuilder });
pickerMarkup('petalStripePicker', { initial: [findColor('white')], onChange: updateBuilder });
pickerMarkup('stemPicker', { initial: [findColor('green')], onChange: updateBuilder });
pickerMarkup('centerPicker', { initial: [findColor('yellow')], onChange: updateBuilder });
pickerMarkup('centerOutlinePicker', { initial: [findColor('Very light yellow')], onChange: updateBuilder });
pickerMarkup('centerShinePicker', { initial: [findColor('Very light yellow')], onChange: updateBuilder });
pickerMarkup('particlePicker', { initial: [findColor('cyan-blue')], onChange: () => {} });
syncCenterPickerAvailability();
syncPetalStripePickerAvailability();
updateBuilder();
updateLibraryCount();

document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.getElementById('libraryCreate').addEventListener('click', () => setView('create'));
document.getElementById('playButton').addEventListener('click', () => startGrowing(makeFlowerFromBuilder()));
document.getElementById('randomizeButton').addEventListener('click', randomizeFlower);
document.getElementById('backToCreate').addEventListener('click', () => setView('create'));
document.getElementById('saveFlower').addEventListener('click', saveFlower);
document.getElementById('growButton').addEventListener('click', growOneDay);
document.getElementById('petalShape').addEventListener('change', updateBuilder);
document.getElementById('petalAmount').addEventListener('input', updateBuilder);
document.getElementById('petalLength').addEventListener('input', updateBuilder);
document.getElementById('petalColorCycle').addEventListener('change', updateBuilder);
document.getElementById('removePetalOutlines').addEventListener('change', updateBuilder);
document.getElementById('addPetalStripes').addEventListener('change', () => {
  syncPetalStripePickerAvailability();
  updateBuilder();
});
document.getElementById('removeCenterOutline').addEventListener('change', () => {
  syncCenterPickerAvailability();
  updateBuilder();
});
document.getElementById('removeCenterShine').addEventListener('change', () => {
  syncCenterPickerAvailability();
  updateBuilder();
});
document.getElementById('bloomDay').addEventListener('input', updateBuilder);
document.getElementById('stopDay').addEventListener('input', updateBuilder);
document.getElementById('removeCenter').addEventListener('change', () => {
  syncCenterPickerAvailability();
  updateBuilder();
});
document.getElementById('actionButtons').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action) performAction(button.dataset.action);
  else if (button.dataset.customId) performAction('custom', customInteractions.find((interaction) => interaction.id === button.dataset.customId));
  else if (button.id === 'openInteraction') {
    renderCustomInteractionManager();
    document.getElementById('interactionDialog').showModal();
  }
});
document.getElementById('createInteraction').addEventListener('click', () => {
  const name = document.getElementById('interactionName').value.trim();
  if (!name) {
    document.getElementById('interactionName').focus();
    return;
  }
  const interaction = {
    id: makeId(), name, color: { ...pickers.particlePicker.values[0] },
    effect: document.getElementById('interactionEffect').value,
    animation: document.getElementById('interactionAnimation').value
  };
  customInteractions.push(interaction);
  writeStorage(STORAGE_INTERACTIONS, customInteractions);
  renderCustomButtons();
  renderCustomInteractionManager();
  document.getElementById('interactionName').value = '';
  document.getElementById('interactionDialog').close();
});
document.getElementById('customInteractionList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-custom-delete]');
  if (!button) return;
  const interaction = customInteractions.find((entry) => entry.id === button.dataset.customDelete);
  if (interaction) requestDeletion('interaction', interaction.id, interaction.name);
});
document.querySelectorAll('.confirm-deletions-toggle').forEach((input) => {
  input.checked = confirmDeletions;
  input.addEventListener('change', (event) => setConfirmDeletions(event.target.checked));
});
document.getElementById('saveFlowerName').addEventListener('click', saveFlowerName);
document.getElementById('cancelDelete').addEventListener('click', () => finishDeletion(false));
document.getElementById('confirmDelete').addEventListener('click', () => finishDeletion(true));
document.getElementById('breedButton').addEventListener('click', () => {
  if (selectedBreedIds.size !== 2) return;
  const [first, second] = [...selectedBreedIds].map((id) => library.find((flower) => flower.id === id));
  if (!first || !second) return;
  document.getElementById('breedDialog').close();
  startGrowing(breedFlowers(first, second));
});
