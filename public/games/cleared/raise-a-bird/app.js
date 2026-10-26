const $ = (selector) => document.querySelector(selector);
const setupView = $('#setup-view');
const gameView = $('#game-view');
const previewEgg = $('#preview-egg');
const creature = $('#creature');
const effectLayer = $('#effect-layer');
const careDock = $('#care-dock');
const careControls = $('#care-controls');
const sleepButton = $('#sleep-button');
const dayChip = $('#day-chip');
const newBirdButton = $('#new-bird-button');
const foodOffering = $('#food-offering');
let actionTimer;
let hatchTimer;
let day = 1;
let hatchDay = 5;
let growDay = 14;
let stage = 'egg';
let busy = false;
let sleeping = false;
let sleepTimer;
let settings = {};

function setColorVariables(target, values) {
  for (const [name, value] of Object.entries(values)) target.style.setProperty(name, value);
}
function previewColors() {
  const egg = $('#egg-color').value;
  const eggSpots = $('#egg-spot-color').value;
  setColorVariables(previewEgg, {'--shell':egg,'--shell-spots':eggSpots});
  previewEgg.classList.toggle('no-spots', !$('#egg-spots').checked);
}
$('#egg-color').addEventListener('input', previewColors);
$('#egg-spot-color').addEventListener('input', previewColors);
$('#egg-spots').addEventListener('change', () => {
  previewColors();
  $('#egg-spot-row').hidden = !$('#egg-spots').checked;
});
$('#body-spots').addEventListener('change', () => { $('#body-spot-row').hidden = !$('#body-spots').checked; });
const colorPresets = {
  meadow: ['#f1c979','#c78355','#f3d66c','#7eaa87','#df855a','#a65d48'],
  lagoon: ['#a8d6c2','#527c75','#8fcbd0','#4e8d92','#df9b57','#35777c'],
  berry: ['#d7a6bf','#8d597a','#e9a2ad','#b87493','#e58b65','#865471'],
  citrus: ['#f0b46d','#bd694f','#ffe276','#8dac58','#d8754f','#b55a45']
};
document.querySelectorAll('.preset-swatch').forEach(button => button.addEventListener('click', () => {
  const [egg, eggSpot, chick, bird, beak, bodySpot] = colorPresets[button.dataset.preset];
  $('#egg-color').value = egg;
  $('#egg-spot-color').value = eggSpot;
  $('#chick-color').value = chick;
  $('#bird-color').value = bird;
  $('#beak-color').value = beak;
  $('#body-spot-color').value = bodySpot;
  previewColors();
}));
$('#hatch-day').addEventListener('change', () => {
  const minimumGrow = Number($('#hatch-day').value) + 1;
  for (const option of $('#grow-day').options) option.disabled = Number(option.value) < minimumGrow;
  if (Number($('#grow-day').value) < minimumGrow) $('#grow-day').value = [...$('#grow-day').options].find(option => !option.disabled).value;
});
previewColors();

function updateDay() {
  $('#day-label').textContent = 'Day ' + day;
  if (stage === 'egg') {
    $('#age-label').textContent = 'A little beginning';
    $('#bird-name').textContent = 'Someone’s in there.';
    $('#day-hint').textContent = 'Your egg is warm. Give it another day.';
  } else if (stage === 'chick') {
    $('#age-label').textContent = 'Freshly hatched';
    $('#bird-name').textContent = 'A new little friend.';
    $('#day-hint').textContent = 'Good things grow with a little care.';
  } else {
    $('#age-label').textContent = 'All grown up';
    $('#bird-name').textContent = 'Look at you now.';
    $('#day-hint').textContent = 'Still your little bird, just a bit bigger.';
  }
}
function setStage(next) {
  stage = next;
  if (stage === 'egg') {
    creature.className = 'creature egg' + (settings.eggSpots ? '' : ' no-spots');
    creature.replaceChildren();
    creature.setAttribute('aria-label', 'An egg');
    setColorVariables(creature, {'--shell':settings.egg,'--shell-spots':settings.eggSpot});
    careDock.hidden = true;
  } else {
    const grown = stage === 'bird';
    creature.className = 'creature ' + (grown ? 'bird' : 'chick') + (settings.bodySpots ? '' : ' no-spots');
    creature.innerHTML = '<div class="body-shape"></div><div class="wing-shape"></div><div class="head-shape"></div><div class="eye"></div><div class="beak-shape"></div><div class="leg leg-left"></div><div class="leg leg-right"></div>';
    creature.setAttribute('aria-label', grown ? 'Your grown bird' : 'Your chick');
    setColorVariables(creature, {'--body':grown ? settings.bird : settings.chick,'--body-spots':settings.bodySpot,'--beak':settings.beak});
    careDock.hidden = false;
    $('#care-prompt').textContent = grown ? 'Your bird still loves a little care.' : 'What shall we do together?';
  }
  updateDay();
}
function clearRunState() {
  window.clearTimeout(actionTimer);
  window.clearTimeout(hatchTimer);
  window.clearInterval(sleepTimer);
  sleeping = false;
  busy = false;
  careControls.classList.remove('busy');
  $('#advance-button').disabled = false;
  creature.classList.remove('pecking','hopping','sleeping','closed-eyes','cracked');
  foodOffering.hidden = true;
  foodOffering.classList.remove('grown');
  effectLayer.replaceChildren();
  sleepButton.classList.remove('active');
  sleepButton.innerHTML = '<span class="care-icon">☾</span>Sleep';
}
function startGame() {
  clearRunState();
  settings = {
    egg:$('#egg-color').value, eggSpot:$('#egg-spot-color').value, eggSpots:$('#egg-spots').checked,
    chick:$('#chick-color').value, bird:$('#bird-color').value, beak:$('#beak-color').value,
    bodySpots:$('#body-spots').checked, bodySpot:$('#body-spot-color').value
  };
  hatchDay = Number($('#hatch-day').value);
  growDay = Number($('#grow-day').value);
  setupView.hidden = true;
  gameView.hidden = false;
  dayChip.hidden = false;
  newBirdButton.hidden = false;
  day = 1;
  setStage('egg');
}
$('#start-button').addEventListener('click', startGame);
$('#surprise-button').addEventListener('click', () => {
  const randomColor = () => {
    const hue = Math.random() * 360;
    const saturation = 48 + Math.random() * 32;
    const lightness = 43 + Math.random() * 29;
    const chroma = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
    const section = hue / 60;
    const secondary = chroma * (1 - Math.abs(section % 2 - 1));
    const offset = lightness / 100 - chroma / 2;
    const rgb = section < 1 ? [chroma,secondary,0] : section < 2 ? [secondary,chroma,0] : section < 3 ? [0,chroma,secondary] : section < 4 ? [0,secondary,chroma] : section < 5 ? [secondary,0,chroma] : [chroma,0,secondary];
    return '#' + rgb.map(value => Math.round((value + offset) * 255).toString(16).padStart(2,'0')).join('');
  };
  $('#egg-color').value = randomColor();
  $('#egg-spot-color').value = randomColor();
  $('#chick-color').value = randomColor();
  $('#bird-color').value = randomColor();
  $('#beak-color').value = randomColor();
  $('#body-spot-color').value = randomColor();
  const hatchOptions = [...$('#hatch-day').options].map(option => option.value);
  $('#hatch-day').value = hatchOptions[Math.floor(Math.random() * hatchOptions.length)];
  $('#hatch-day').dispatchEvent(new Event('change'));
  const growOptions = [...$('#grow-day').options].filter(option => Number(option.value) > Number($('#hatch-day').value));
  $('#grow-day').value = growOptions[Math.floor(Math.random() * growOptions.length)].value;
  $('#egg-spots').checked = Math.random() < .5;
  $('#body-spots').checked = Math.random() < .5;
  $('#egg-spot-row').hidden = !$('#egg-spots').checked;
  $('#body-spot-row').hidden = !$('#body-spots').checked;
  previewColors();
  startGame();
});
newBirdButton.addEventListener('click', () => {
  clearRunState();
  setupView.hidden = false;
  gameView.hidden = true;
  dayChip.hidden = true;
  newBirdButton.hidden = true;
});
$('#advance-button').addEventListener('click', () => {
  if (busy) return;
  day++;
  if (stage === 'egg' && day >= hatchDay) {
    creature.classList.add('cracked');
    hatchTimer = window.setTimeout(() => { if (stage === 'egg') setStage('chick'); }, 850);
  } else if (stage === 'chick' && day >= growDay) {
    setStage('bird');
  } else updateDay();
});
function floatEffect(symbol, extraClass='') {
  const item = document.createElement('span');
  item.className = 'effect ' + extraClass;
  item.textContent = symbol;
  effectLayer.append(item);
  window.setTimeout(() => item.remove(), 1600);
}
function setBusy(value) {
  busy = value;
  careControls.classList.toggle('busy', value);
  $('#advance-button').disabled = value;
}
function runAction(action, food='') {
  if (busy || sleeping || stage === 'egg') return;
  if (action === 'feed' && !food.trim()) {
    $('#food-input').focus();
    $('#food-input').placeholder = 'Pick a snack first…';
    return;
  }
  setBusy(true);
  if (action === 'feed') {
    creature.classList.add('pecking');
    foodOffering.querySelector('.food-name').textContent = food.trim();
    foodOffering.classList.toggle('grown', stage === 'bird');
    foodOffering.hidden = false;
    $('#care-prompt').textContent = 'Peck, peck… ' + food.trim() + '!';
    actionTimer = window.setTimeout(() => {
      creature.classList.remove('pecking');
      foodOffering.hidden = true;
      $('#care-prompt').textContent = 'That hit the spot.';
      floatEffect('♡');
      setBusy(false);
      $('#food-input').value = '';
    }, 3000);
  } else if (action === 'clean') {
    $('#care-prompt').textContent = 'Fresh as a daisy.';
    for (let i=0;i<12;i++) {
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.style.left = (34 + Math.random()*32) + '%';
      bubble.style.top = (32 + Math.random()*20) + '%';
      bubble.style.setProperty('--drift', (Math.random()*46-23) + 'px');
      bubble.style.animationDelay = (Math.random()*.55) + 's';
      bubbleLayerAppend(bubble);
    }
    actionTimer = window.setTimeout(() => setBusy(false), 1600);
  } else if (action === 'pet') {
    $('#care-prompt').textContent = 'A little love goes a long way.';
    floatEffect('❤️');
    actionTimer = window.setTimeout(() => setBusy(false), 1100);
  } else if (action === 'play') {
    $('#care-prompt').textContent = 'Wheee!';
    creature.classList.add('hopping');
    actionTimer = window.setTimeout(() => {
      creature.classList.remove('hopping');
      $('#care-prompt').textContent = 'That was fun!';
      floatEffect('😁');
      setBusy(false);
    }, 1350);
  }
}
function bubbleLayerAppend(bubble) { effectLayer.append(bubble); window.setTimeout(() => bubble.remove(), 1800); }
$('#feed-form').addEventListener('submit', event => { event.preventDefault(); runAction('feed', $('#food-input').value); });
document.querySelectorAll('.care-button[data-action]').forEach(button => button.addEventListener('click', () => runAction(button.dataset.action)));
sleepButton.addEventListener('click', () => {
  if (sleeping) {
    sleeping = false;
    clearInterval(sleepTimer);
    creature.classList.remove('sleeping','closed-eyes');
    sleepButton.classList.remove('active');
    sleepButton.innerHTML = '<span class="care-icon">☾</span>Sleep';
    $('#care-prompt').textContent = 'Good morning, little one.';
    return;
  }
  if (busy || stage === 'egg') return;
  sleeping = true;
  creature.classList.add('sleeping','closed-eyes');
  sleepButton.classList.add('active');
  sleepButton.innerHTML = '<span class="care-icon">☀</span>Wake up';
  $('#care-prompt').textContent = 'Shhh… sweet dreams.';
  sleepTimer = window.setInterval(() => floatEffect('Z'), 1450);
  floatEffect('Z');
});
updateDay();
