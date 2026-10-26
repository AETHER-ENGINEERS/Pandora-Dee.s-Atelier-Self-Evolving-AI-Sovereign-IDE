const app = document.querySelector('#app');
const tones = ['','🏻','🏼','🏽','🏾','🏿'];
const people = {
  woman: ['👩','👩🏻','👩🏼','👩🏽','👩🏾','👩🏿'],
  man: ['👦','👦🏻','👦🏼','👦🏽','👦🏾','👦🏿'],
  person: ['🧑','🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿']
};
const poses = {
  standing: {
    woman: ['🧍‍♀️','🧍🏻‍♀️','🧍🏼‍♀️','🧍🏽‍♀️','🧍🏾‍♀️','🧍🏿‍♀️'],
    man: ['🧍‍♂️','🧍🏻‍♂️','🧍🏼‍♂️','🧍🏽‍♂️','🧍🏾‍♂️','🧍🏿‍♂️'],
    person: ['🧍','🧍🏻','🧍🏼','🧍🏽','🧍🏾','🧍🏿']
  },
  walking: {
    woman: ['🚶‍♀️','🚶🏻‍♀️','🚶🏼‍♀️','🚶🏽‍♀️','🚶🏾‍♀️','🚶🏿‍♀️'],
    man: ['🚶‍♂️','🚶🏻‍♂️','🚶🏼‍♂️','🚶🏽‍♂️','🚶🏾‍♂️','🚶🏿‍♂️'],
    person: ['🚶','🚶🏻','🚶🏼','🚶🏽','🚶🏾','🚶🏿']
  },
  running: {
    woman: ['🏃‍♀️','🏃🏻‍♀️','🏃🏼‍♀️','🏃🏽‍♀️','🏃🏾‍♀️','🏃🏿‍♀️'],
    man: ['🏃‍♂️','🏃🏻‍♂️','🏃🏼‍♂️','🏃🏽‍♂️','🏃🏾‍♂️','🏃🏿‍♂️'],
    person: ['🏃','🏃🏻','🏃🏼','🏃🏽','🏃🏾','🏃🏿']
  },
  bathing: ['🛀','🛀🏻','🛀🏼','🛀🏽','🛀🏾','🛀🏿'],
  sleeping: ['🛌','🛌🏻','🛌🏼','🛌🏽','🛌🏾','🛌🏿']
};
const activities = [
  {id:'eat', name:'Eat', icon:'🍽️', desc:'Take a bite'},
  {id:'drink', name:'Drink', icon:'🥤', desc:'Pour & mix'},
  {id:'sleep', name:'Sleep', icon:'🛏️', desc:'Get cozy'},
  {id:'walk', name:'Walk', icon:'🚶', desc:'Walk or run'},
  {id:'toilet', name:'Toilet', icon:'🚽', desc:'A bathroom break'},
  {id:'bathe', name:'Bathe', icon:'🛁', desc:'Take a bath'},
  {id:'brush', name:'Brush teeth', icon:'🪥', desc:'Give your tooth a scrub'},
  {id:'shop', name:'Shop', icon:'🛒', desc:'Pick, bag & pay'}
];
const drinks = [
  ['Raspberry juice','#e53243'],['Orange juice','#ff871c'],['Lemonade','#efff00'],['Banana juice','#f4e78c'],
  ['Lime juice','#a6d62c'],['Green tea','#a8b842'],['Matcha','#c4d0a9'],['Mint','#75d8b4'],
  ['Blueberry juice','#182c81'],['Grape juice','#8f00bb'],['Taro','#c1a4e0'],['Strawberry','#f08daf'],
  ['Tea','#4c281a'],['Coffee','#74452b'],['Milk chocolate','#8b5a2b'],['Dark chocolate','#3b241a'],
  ['White chocolate','#f3e6b0'],['Milk','#ffffff'],['Soda','#4b2818']
];
const shopSections = [
  {id:'food',name:'Food',icon:'🍎',items:'🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🫐🥝🍅🫒🥥🍋‍🟩🥑🍆🥔🥕🌽🌶🫑🥒🥬🥦🧄🧅🍄🥜🫘🌰🫚🫛🍄‍🟫🍞🥐🥖🫓🥨🥯🥞🧇🧀🍖🍗🥩🥓🍔🍟🍕🌭🥪🌮🌯🫔🥙🧆🥚🥘🍲🥣🥗🍿🧈🧂🥫🍱🍘🍙🍚🍛🍜🍝🍠🍢🍣🦪🍤🍥🥮🍡🎂🍰🧁🥧🍫🍬🍭🍮🍯'},
  {id:'clothes',name:'Clothes',icon:'👕',items:'🎽🥋⛸️🥊🤿👓🕶🥽🥼🦺👔👕👖🧣🧤🧥🧦👗👘🥻🩱🩲🩳👙👚🩴👞👟🥾🥿👠👡🩰👢👑👒🎩🎓🧢🪖⛑️📿💍'},
  {id:'drinks',name:'Drinks',icon:'🥤',items:'🍼🥛☕️🫖🍵🍶🍾🍷🍸🍹🍺🥃🥤🧋🧃🧉'},
  {id:'books',name:'Books & paper',icon:'📚',items:'📔📕📖📗📘📙📚📓📒📃📜📄📰🗞📑📝🗒'},
  {id:'arts',name:'Arts & crafts',icon:'🎨',items:'✏️✒️🖋🖊🖌🖍📌📍📎🖇📏📐✂️🔨🪓⛏️⚒️🛠🪚🔧🪛🔩⚙️🧰🎨🧵🪡🧶🪢'},
  {id:'cleaning',name:'Cleaning & hygiene',icon:'🧼',items:'🪠🪒🧴🧹🧺🧻🪣🧼🪥🧽💧💦'},
  {id:'games',name:'Games & toys',icon:'🎲',items:'⚽️⚾️🥎🏀🏐🏈🏉🎾🎳🏏🏑🏒🥍🏓🏸🥅⛳️🎯🎱🎮🕹🎰🎲🧩♟️🃏🧸🪆🪀🔫'}
];
const cashOptions = ['💵','💷','💶','💴','💰','🪙'];
const paymentOptions = [...cashOptions,'💳'];
const handEmojis = ['✋️','✋🏻','✋🏼','✋🏽','✋🏾','✋🏿'];
const shopState = () => ({phase:'sections',section:null,stock:[],cart:[],bag:[],paymentMethod:null,cashierTone:0,paymentTimeout:null});
const initialAccessories = () => [{emoji:'🧼',left:16,top:70},{emoji:'🧴',left:80,top:71},{emoji:'🧽',left:82,top:42}];
const initial = () => ({screen:'picker', selected:null, activity:null, eatItems:[], eatAnimated:true, biteSize:31, drinkLayers:[], drinkLevel:0, mixed:false, bobaEnabled:false, bobaColor:'#17120f', saveMixOpen:false, asleep:false, lights:true, bathInTub:false, sleepPosition:null, bathPosition:null, accessories:initialAccessories(), walkMeters:0, running:false, moving:false, toiletTimer:null, toiletInterval:null, toiletHold:false, holdTriggered:false, shop:shopState(), drag:null, brushPos:{left:20,top:68}, brushed:0, specks:[true,true,true,true,true,true]});
const state = initial();
const SAVED_MIXES_KEY = 'little-sim-saved-mixes';
function loadSavedMixes() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_MIXES_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&/^#[0-9a-f]{6}$/i.test(item.color)).map(item=>({id:item.id,name:item.name.slice(0,30),color:item.color,bubbly:Boolean(item.bubbly)}));
  } catch { return []; }
}
let savedMixes = loadSavedMixes();
function persistSavedMixes() {
  try { localStorage.setItem(SAVED_MIXES_KEY,JSON.stringify(savedMixes)); }
  catch (error) { console.warn('Could not save drink mixes in this browser.',error); }
}
const getCharacter = (pose='standing') => {
  if (!state.selected) return '';
  const {group,index} = state.selected;
  if (pose === 'bathing' || pose === 'sleeping') return poses[pose][index];
  return poses[pose][group][index];
};
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function topbar(backLabel='', backAction='back') {
  return `<div class="topbar"><div class="brand"><span class="brand-mark">✳</span> little sim</div>${backLabel ? `<button class="plain-button" data-action="${backAction}">← ${backLabel}</button>` : '<span class="eyebrow">a tiny world</span>'}</div>`;
}
function renderPicker() {
  const options = Object.entries(people).flatMap(([group, chars]) => chars.map((emoji,index) => `<button class="character-option ${state.selected?.group===group&&state.selected?.index===index?'selected':''}" data-person="${group}:${index}" aria-label="Choose character ${index+1}">${emoji}</button>`)).join('');
  app.innerHTML = `<div class="shell">${topbar()}<section class="page-heading"><div class="eyebrow">first, pick someone</div><h1>Who are you today?</h1><p>Choose a character to start playing.</p></section><section class="panel"><div class="character-grid">${options}</div><div class="continue-wrap"><button class="primary-button" data-action="continue" ${state.selected?'':'disabled'}>Choose activities&nbsp; →</button></div></section></div>`;
}
function renderActivities() {
  app.innerHTML = `<div class="shell">${topbar('Change character','change-character')}<section class="page-heading"><div class="eyebrow">${state.selected.emoji} &nbsp; your little world</div><h1>What should we do?</h1></section><section class="activities">${activities.map(item=>`<button class="activity-card" data-activity="${item.id}"><span class="activity-icon">${item.icon}</span><strong>${item.name}</strong><small>${item.desc}</small></button>`).join('')}</section></div>`;
}
function simHeader(activity) {
  return `<div class="sim-header"><button class="plain-button" data-action="activities">← Activities</button><div class="sim-title"><span class="activity-icon">${activity.icon}</span><h1>${activity.name}</h1></div><div class="sim-tools"><button class="plain-button reset-button" data-action="reset" aria-label="Reset simulator">↻ <span>Reset</span></button><div class="profile-chip"><span class="profile-face">${state.selected.emoji}</span></div></div></div>`;
}
function renderEat() {
  const food = state.eatItems.map((item,index)=>`<span class="food-item" data-food="${index}" aria-label="Tap to take a bite">${esc(item.emoji)}${item.bites.map(mark=>`<i class="bite" style="left:${mark.x}%;top:${mark.y}%;width:${mark.size}px;height:${mark.size}px"></i>`).join('')}</span>`).join('');
  const bites = state.eatItems.reduce((sum,item)=>sum+item.bites.length,0);
  return `<div class="stage eat-stage ${state.eatAnimated?'':'no-food-animation'}">${state.eatItems.length ? `<div class="eat-count">${bites ? `${bites} ${bites===1?'bite':'bites'}` : 'tap to take a bite'}</div>` : ''}<div class="food-items">${food}</div><div class="eat-options"><button class="soft-button food-animation-toggle ${state.eatAnimated?'active':''}" data-action="toggle-eat-animation" aria-label="Toggle food animation" aria-pressed="${state.eatAnimated}"><span class="eat-animation-label">Animate food</span><b>${state.eatAnimated?'On':'Off'}</b></button><label class="eat-bite-control"><span>Bite size</span><input type="range" min="12" max="68" step="2" value="${state.biteSize}" data-eat-size aria-label="Bite size"><output>${state.biteSize}px</output></label></div><form class="bottom-controls food-input" data-form="food"><input name="food" maxlength="16" autocomplete="off" placeholder="Type an emoji to eat" aria-label="Food emoji"><button type="submit">Add</button></form></div>`;
}
function renderDrink() {
  const menu = drinks.map(([name,color])=>`<button class="drink-choice" data-drink="${esc(name)}"><i class="drink-swatch" style="background:${color}"></i>${name}</button>`).join('');
  const savedMenu = savedMixes.map(recipe=>`<div class="saved-mix-choice"><button class="saved-mix-pour" data-saved-drink="${esc(recipe.id)}"><i class="drink-swatch" style="background:${recipe.color}"></i>${esc(recipe.name)}</button><button class="saved-mix-delete" data-delete-saved-mix="${esc(recipe.id)}" aria-label="Delete ${esc(recipe.name)}">×</button></div>`).join('');
  const saveMixControl = state.mixed&&state.drinkLayers.length===1 ? (state.saveMixOpen ? `<form class="save-mix-form" data-form="saved-mix"><input name="mix-name" maxlength="30" autocomplete="off" placeholder="Name this mix" aria-label="Mix name" required><button type="submit">Save</button></form>` : '<button class="save-mix-trigger" data-action="open-save-mix">Save this mix</button>') : '';
  const bobaControls = `<div class="boba-controls"><button class="boba-toggle ${state.bobaEnabled?'active':''}" data-action="toggle-boba" aria-pressed="${state.bobaEnabled}">Boba ${state.bobaEnabled?'On':'Off'}</button>${state.bobaEnabled?`<label class="boba-color">Pearl color<input type="color" value="${state.bobaColor}" data-boba-color aria-label="Boba pearl color"></label>`:''}</div>`;
  const count = state.drinkLayers.length;
  let bottomValue = 0;
  const layers = state.drinkLayers.map((layer,index)=>{
    const layerBottom = bottomValue;
    bottomValue += layer.amount;
    const heightValue = Math.max(0, Math.min(bottomValue, state.drinkLevel)-layerBottom);
    const height = `${heightValue}%`, bottom = `${layerBottom}%`;
    const bubbly = layer.bubbly || layer.name==='Soda';
    const bubbles = bubbly ? Array.from({length:7},(_,n)=>`<i class="bubble" style="--x:${12+n*12}%;--size:${5+(n%3)*2}px;--speed:${1.05+(n%4)*.26}s;--delay:-${(n%5)*.24}s"></i>`).join('') : '';
    const surface = index===count-1?'top-surface':'';
    return `<div class="liquid-layer ${bubbly?'soda-bubbles':''} ${surface}" style="--height:${height};--color:${layer.color};bottom:${bottom}">${bubbles}</div>`;
  }).join('');
  const pearls = state.bobaEnabled&&state.drinkLevel>0 ? `<div class="boba-pearls" style="--pearl-color:${state.bobaColor}">${Array.from({length:21},()=>'<i></i>').join('')}</div>` : '';
  return `<div class="stage"><div class="drink-layout"><div class="drink-menu">${bobaControls}${menu}${savedMenu}${saveMixControl}</div><div class="cup-wrap"><div class="cup" data-action="drink-cup" role="button" aria-label="Tap cup to take a sip"><div class="cup-top"></div><div class="cup-shape">${layers}${pearls}${count?'':`<span class="cup-empty">your cup</span>`}</div></div><div class="drink-caption">${count ? `${count} ${count===1?'layer':'layers'} in your cup` : 'tap a juice to pour'}</div></div></div>${count>1&&!state.mixed?'<button class="soft-button mix-button" data-action="mix">↗ Mix the layers</button>':''}</div>`;
}
function renderSleep() {
  const char = getCharacter();
  const position = state.sleepPosition ? `left:${state.sleepPosition.left}%;top:${state.sleepPosition.top}%;bottom:auto;transform:translate(-50%,-50%)` : '';
  const draggingCharacter = ['wake','character'].includes(state.drag?.kind) && state.activity==='sleep';
  return `<div class="stage sleep-stage ${state.lights?'':'dark'}"><div class="sleep-window"><span class="moon">☾</span></div>${!state.asleep&&!draggingCharacter?`<div class="sleep-person drop-target" data-drag="character" data-emoji="${char}" style="${position}">${char}</div>`:''}${state.asleep&&!state.lights?'<div class="zzz">💤</div>':''}<div class="bed-emoji drop-target" data-drop="bed" data-drag="${state.asleep?'wake':''}" data-emoji="${state.asleep?poses.sleeping[state.selected.index]:'🛏️'}">${state.asleep?poses.sleeping[state.selected.index]:'🛏️'}</div><button class="lamp-switch" data-action="lights" aria-label="Toggle lights">${state.lights?'💡':'🌙'}</button></div>`;
}
function renderWalk() {
  const walkingPose = state.moving ? (state.running ? 'running' : 'walking') : 'standing';
  return `<div class="walk-stage"><span class="walk-sun"></span><span class="walk-cloud">☁️</span><div class="walk-path"></div><div class="walker ${state.moving?'moving':''}">${getCharacter(walkingPose)}</div><div class="walk-controls"><div class="meter"><strong id="meter-value">${state.walkMeters.toFixed(1)} m</strong><small>walked</small></div><button class="soft-button move-button ${state.moving&&!state.running?'active':''}" data-action="move">${state.moving&&!state.running?'Keep going':'Walk'}&nbsp; ↗</button><button class="soft-button move-button ${state.moving&&state.running?'active':''}" data-action="run">${state.moving&&state.running?'Run mode':'Run'}&nbsp; ⚡</button></div></div>`;
}
function renderToilet() {
  return `<div class="stage toilet-stage"><div class="bathroom-wall"></div><div class="toilet-floor"></div><div class="toilet-emoji">🚽</div><div class="toilet-controls"><button class="primary-button" data-action="toilet">Tap or hold&nbsp; ↓</button></div></div>`;
}
function renderBath() {
  const accessories = state.accessories.map((item,index)=>`<div class="bath-accessory ${['soap','bottle','sponge'][index]}" data-drag="accessory" data-index="${index}" data-emoji="${item.emoji}" style="left:${item.left}%;top:${item.top}%;bottom:auto;right:auto">${item.emoji}</div>`).join('');
  const position = state.bathPosition ? `left:${state.bathPosition.left}%;top:${state.bathPosition.top}%;bottom:auto;transform:translate(-50%,-50%)` : '';
  const draggingCharacter = ['wake','character'].includes(state.drag?.kind) && state.activity==='bathe';
  return `<div class="stage bath-stage"><div class="bath-tile"></div><div class="bathroom-window"></div>${accessories}<div class="bath-tub drop-target" data-drop="tub" data-drag="${state.bathInTub?'wake':''}" data-emoji="${state.bathInTub?poses.bathing[state.selected.index]:'🛁'}">${state.bathInTub?poses.bathing[state.selected.index]:'🛁'}</div>${state.bathInTub||draggingCharacter?'':`<div class="bath-character drop-target" data-drag="character" data-emoji="${getCharacter()}" style="${position}">${getCharacter()}</div>`}</div>`;
}
function renderBrush() {
  const specks = [[-37,-18],[-20,-32],[2,-36],[25,-25],[35,-5],[5,-4]].map(([x,y],index)=>`<i class="tooth-speck ${state.specks[index]?'':'gone'}" style="left:calc(50% + ${x}px);top:calc(46% + ${y}px)"></i>`).join('');
  return `<div class="stage tooth-stage"><div class="tooth-caption">${state.brushed>=6?'✨ sparkling clean':'Drag the toothbrush across the tooth'}</div><div class="tooth">🦷</div><div class="tooth-shine">${state.brushed>=6?'✨':''}</div>${specks}<div class="toothbrush" data-drag="brush" data-emoji="🪥" style="left:${state.brushPos.left}%;top:${state.brushPos.top}%">🪥</div></div>`;
}
function randomStock(section) {
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  const items=Array.from(segmenter.segment(section.items),part=>part.segment);
  for(let index=items.length-1;index>0;index--){
    const other=Math.floor(Math.random()*(index+1));
    [items[index],items[other]]=[items[other],items[index]];
  }
  return items.slice(0,10).map((emoji,index)=>({id:`${section.id}-${Date.now()}-${index}-${Math.random()}`,emoji}));
}
function renderShopSections() {
  return `<div class="stage shop-stage section-stage"><div class="shop-stage-head"><div class="eyebrow">little market</div><h2>Choose a section</h2></div><div class="shop-section-grid">${shopSections.map(section=>`<button class="shop-section-card" data-shop-section="${section.id}"><span>${section.icon}</span><strong>${section.name}</strong></button>`).join('')}</div></div>`;
}
function renderShopBrowse() {
  const section=shopSections.find(item=>item.id===state.shop.section);
  const stock=state.shop.stock.map((item,index)=>`<div class="shop-stock-item" data-drag="shop-stock" data-index="${index}" data-item-id="${item.id}" data-emoji="${item.emoji}" aria-label="Drag ${item.emoji} to the cart">${item.emoji}</div>`).join('');
  const cartPreview=state.shop.cart.slice(-5).map(item=>`<span>${item.emoji}</span>`).join('');
  return `<div class="stage shop-stage"><div class="shop-stage-head browse-head"><button class="plain-button" data-shop-action="sections">← Sections</button><div><div class="eyebrow">${section.name}</div><h2>In stock</h2></div><span class="shop-stock-count">${state.shop.stock.length} items</span></div><div class="shop-stock-grid">${stock}</div><div class="shop-bottom-bar"><div class="shop-cart-drop" data-shop-drop="cart"><span class="cart-emoji">🛒</span><span class="cart-label">Cart <b>${state.shop.cart.length}</b></span><span class="cart-preview">${cartPreview}</span></div><button class="primary-button shop-next" data-shop-action="bag" ${state.shop.cart.length?'':'disabled'}>Bag items&nbsp; →</button></div></div>`;
}
function renderShopBag() {
  const cartItems=state.shop.cart.map(item=>`<div class="shop-bag-item" data-drag="shop-cart" data-item-id="${item.id}" data-emoji="${item.emoji}" aria-label="Drag ${item.emoji} into the bag">${item.emoji}</div>`).join('');
  const bagItems=state.shop.bag.map(item=>`<span>${item.emoji}</span>`).join('');
  return `<div class="stage shop-stage bag-stage"><div class="shop-stage-head"><button class="plain-button" data-shop-action="shop">← Back to shop</button><div class="eyebrow">bag your items</div></div><div class="bagging-row"><div class="bag-cart-items">${cartItems||'<span class="empty-cart">Cart is empty</span>'}</div><div class="shop-bag-drop" data-shop-drop="bag"><span class="bag-emoji">🛍️</span><span class="bag-count">${state.shop.bag.length} bagged</span><span class="bag-preview">${bagItems}</span></div></div><div class="shop-bottom-bar bag-bottom"><span class="bag-progress">${state.shop.cart.length} left in cart</span><button class="primary-button shop-next" data-shop-action="methods" ${state.shop.bag.length&&!state.shop.cart.length?'':'disabled'}>Choose payment&nbsp; →</button></div></div>`;
}
function renderShopMethods() {
  return `<div class="stage shop-stage payment-method-stage"><div class="shop-stage-head"><button class="plain-button" data-shop-action="bag">← Back to bag</button><div class="eyebrow">how would you like to pay?</div></div><div class="payment-method-grid">${paymentOptions.map(icon=>`<button class="payment-method" data-payment="${icon}" aria-label="Pay with ${icon}">${icon}</button>`).join('')}</div></div>`;
}
function renderShopPayment() {
  const method=state.shop.paymentMethod;
  const isCard=method==='💳';
  const cashier=handEmojis[state.shop.cashierTone];
  const customer=handEmojis[state.selected.index];
  const receiving=isCard
    ? `<div class="pay-terminal ${state.shop.phase==='settling'?'receiving':''}" ${state.shop.phase==='payment'?'data-shop-drop="terminal"':''}><span>📟</span>${state.shop.phase==='settling'?`<i>${method}</i>`:''}</div>`
    : `<div class="cashier-hand-drop ${state.shop.phase==='payment'?'drop-active':''}" ${state.shop.phase==='payment'?'data-shop-drop="cashier-hand"':''}><span class="cashier-hand">${cashier}</span>${state.shop.phase==='settling'?`<i>${method}</i>`:''}</div>`;
  const token=state.shop.phase==='payment'?`<span class="payment-token" data-drag="shop-payment" data-emoji="${method}">${method}</span>`:'';
  return `<div class="stage shop-stage payment-stage"><div class="shop-stage-head"><button class="plain-button" data-shop-action="methods">← Payment</button><div class="eyebrow">${isCard?'tap your card':'hand over your payment'}</div></div><div class="payment-counter">${receiving}</div><div class="customer-payment"><span class="customer-hand">${customer}</span>${token}</div>${state.shop.phase==='settling'?'<div class="payment-wait">Processing…</div>':''}</div>`;
}
function renderShopReceipt() {
  return `<div class="stage shop-stage receipt-stage"><div class="receipt-card"><span class="receipt-sparkle">✦</span><h2>Thank you for your purchase!</h2><div class="receipt-items">${state.shop.bag.map(item=>`<span>${item.emoji}</span>`).join('')}</div><div class="receipt-actions"><button class="soft-button" data-shop-action="done">Done</button><button class="primary-button" data-shop-action="again">Shop again</button></div></div></div>`;
}
function renderShop() {
  if(state.shop.phase==='sections')return renderShopSections();
  if(state.shop.phase==='browse')return renderShopBrowse();
  if(state.shop.phase==='bag')return renderShopBag();
  if(state.shop.phase==='methods')return renderShopMethods();
  if(state.shop.phase==='payment'||state.shop.phase==='settling')return renderShopPayment();
  return renderShopReceipt();
}
function renderSimulator() {
  const activity = activities.find(item=>item.id===state.activity);
  let content = '';
  if (state.activity==='eat') content=renderEat();
  if (state.activity==='drink') content=renderDrink();
  if (state.activity==='sleep') content=renderSleep();
  if (state.activity==='walk') content=renderWalk();
  if (state.activity==='toilet') content=renderToilet();
  if (state.activity==='bathe') content=renderBath();
  if (state.activity==='brush') content=renderBrush();
  if (state.activity==='shop') content=renderShop();
  app.innerHTML = `<div class="sim-shell">${simHeader(activity)}<section class="sim-panel">${content}</section></div>`;
}
function render() {
  if (state.screen==='picker') renderPicker();
  else if (state.screen==='activities') renderActivities();
  else renderSimulator();
}
function setActivity(id) {
  if(id==='shop'&&state.shop.phase==='receipt')state.shop=shopState();
  state.activity=id;
  state.screen='simulator';
  render();
}
function resetActivity() {
  if (state.drag?.ghost) state.drag.ghost.remove();
  state.drag=null;
  if (state.activity==='eat') { state.eatItems=[];state.eatAnimated=true;state.biteSize=31; }
  if (state.activity==='drink') { state.drinkLayers=[];state.drinkLevel=0;state.mixed=false;state.bobaEnabled=false;state.bobaColor='#17120f';state.saveMixOpen=false; }
  if (state.activity==='sleep') { state.asleep=false;state.lights=true;state.sleepPosition=null; }
  if (state.activity==='walk') {
    clearInterval(state.walkTimer);state.walkTimer=null;state.walkMeters=0;state.running=false;state.moving=false;
  }
  if (state.activity==='toilet') {
    clearTimeout(state.toiletTimer);clearInterval(state.toiletInterval);
    state.toiletTimer=null;state.toiletInterval=null;state.toiletHold=false;state.holdTriggered=false;
  }
  if (state.activity==='bathe') {
    state.bathInTub=false;state.bathPosition=null;state.accessories=initialAccessories();
  }
  if (state.activity==='shop') {
    clearTimeout(state.shop.paymentTimeout);
    state.shop=shopState();
  }
  if (state.activity==='brush') {
    state.brushPos={left:20,top:68};state.brushed=0;state.specks=[true,true,true,true,true,true];
  }
  renderSimulator();
}
function chooseShopPayment(method) {
  state.shop.paymentMethod=method;
  state.shop.cashierTone=Math.floor(Math.random()*handEmojis.length);
  state.shop.phase='payment';
  renderSimulator();
}
function settleShopPayment() {
  state.shop.phase='settling';
  renderSimulator();
  state.shop.paymentTimeout=setTimeout(()=>{
    state.shop.paymentTimeout=null;
    state.shop.phase='receipt';
    renderSimulator();
  },1000);
}
function handleShopAction(action) {
  if(action==='sections')state.shop.phase='sections';
  else if(action==='shop')state.shop.phase=state.shop.section?'browse':'sections';
  else if(action==='bag')state.shop.phase='bag';
  else if(action==='methods')state.shop.phase='methods';
  else if(action==='payment')state.shop.phase='payment';
  else if(action==='again'){clearTimeout(state.shop.paymentTimeout);state.shop=shopState();}
  else if(action==='done'){clearTimeout(state.shop.paymentTimeout);state.shop=shopState();state.screen='activities';renderActivities();return;}
  renderSimulator();
}
function hexToRgb(hex) { const value=hex.replace('#','');return [0,2,4].map(i=>parseInt(value.slice(i,i+2),16)); }
function rgbToHex(rgb) { return '#'+rgb.map(value=>Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,'0')).join(''); }
function mixDrinks() {
  const total = state.drinkLayers.reduce((sum,layer)=>sum.map((value,index)=>value+hexToRgb(layer.color)[index]*layer.amount),[0,0,0]);
  const bubbly = state.drinkLayers.some(layer=>layer.bubbly||layer.name==='Soda');
  state.drinkLayers=[{name:'Mixed drink',color:rgbToHex(total.map(value=>value/state.drinkLevel)),amount:state.drinkLevel,bubbly}];
  state.mixed=true;
  render();
}
function addPoop() {
  const stage=app.querySelector('.toilet-stage'); if(!stage)return;
  const drop=document.createElement('span');drop.className='poop-drop';drop.textContent='💩';drop.style.setProperty('--x',`${39+Math.random()*22}%`);stage.append(drop);setTimeout(()=>drop.remove(),1000);
}
function addYellowDrop() {
  const stage=app.querySelector('.toilet-stage'); if(!stage)return;
  const drop=document.createElement('span');drop.className='yellow-drop';drop.style.setProperty('--x',`${49+Math.random()*2}%`);stage.append(drop);setTimeout(()=>drop.remove(),550);
}
function addFoam(x,y) {
  const stage=app.querySelector('.tooth-stage'); if(!stage)return;
  const particle=document.createElement('i');particle.className='foam';particle.style.left=`${x}px`;particle.style.top=`${y}px`;
  stage.append(particle);setTimeout(()=>particle.remove(),700);
}
function beginDrag(event,source) {
  const kind=source.dataset.drag;
  if(!kind)return;
  event.preventDefault();
  const emoji=kind==='wake' ? getCharacter() : (source.dataset.emoji || source.textContent.trim());
  const ghost=document.createElement('div');ghost.className=`drag-ghost ${kind==='brush'?'brush':''}`;ghost.textContent=emoji;
  if(state.activity==='bathe')ghost.style.fontSize=getComputedStyle(source).fontSize;
  ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;
  document.body.append(ghost);
  state.drag={kind,source,ghost,pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY,index:Number(source.dataset.index||0),itemId:source.dataset.itemId};
  if(kind==='accessory'||kind==='brush'||kind.startsWith('shop-'))source.style.visibility='hidden';
  if(kind==='wake'||kind==='character'){
    if(kind==='wake'&&state.activity==='sleep')state.asleep=false;
    if(kind==='wake'&&state.activity==='bathe')state.bathInTub=false;
    if(state.activity==='sleep'||state.activity==='bathe')
    renderSimulator();
  }
  if(kind==='brush') brushMove(event.clientX,event.clientY,true);
}
function brushMove(x,y,first=false) {
  const drag=state.drag;if(!drag||drag.kind!=='brush')return;
  drag.ghost.style.left=`${x}px`;drag.ghost.style.top=`${y}px`;
  const stage=app.querySelector('.tooth-stage');const tooth=app.querySelector('.tooth');if(!stage||!tooth)return;
  const rect=tooth.getBoundingClientRect();
  if(x>=rect.left-20&&x<=rect.right+20&&y>=rect.top-20&&y<=rect.bottom+20){
    const next=state.specks.findIndex(Boolean);
    if(next>=0){state.specks[next]=false;state.brushed++;const speck=app.querySelectorAll('.tooth-speck')[next];speck?.classList.add('gone');const shine=app.querySelector('.tooth-shine');if(shine&&state.brushed>=6)shine.textContent='✨';const caption=app.querySelector('.tooth-caption');if(caption&&state.brushed>=6)caption.textContent='✨ sparkling clean';}
    const stageRect=stage.getBoundingClientRect();
    if(!first||Math.hypot(x-drag.lastX,y-drag.lastY)>4)addFoam(x-stageRect.left+(Math.random()*8-4),y-stageRect.top+(Math.random()*8-4));
  }
  drag.lastX=x;drag.lastY=y;
}
function onPointerMove(event) {
  const drag=state.drag;if(!drag)return;
  drag.ghost.style.left=`${event.clientX}px`;drag.ghost.style.top=`${event.clientY}px`;
  if(drag.kind==='brush') brushMove(event.clientX,event.clientY);
}
function onPointerUp(event) {
  if(state.activity==='walk'&&state.moving){state.moving=false;clearInterval(state.walkTimer);state.walkTimer=null;render();}
  if(state.activity==='toilet'&&state.toiletHold){
    clearTimeout(state.toiletTimer);clearInterval(state.toiletInterval);state.toiletTimer=null;state.toiletInterval=null;
    if(!state.holdTriggered)addPoop();state.holdTriggered=false;state.toiletHold=false;
  }
  const drag=state.drag;if(!drag)return;
  drag.ghost.remove();
  if(drag.kind.startsWith('shop-')){
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-shop-drop]')?.dataset.shopDrop;
    let paid=false;
    if(drag.kind==='shop-stock'&&target==='cart'){
      const item=state.shop.stock.find(item=>item.id===drag.itemId);
      if(item){state.shop.stock=state.shop.stock.filter(item=>item.id!==drag.itemId);state.shop.cart.push(item);}
    } else if(drag.kind==='shop-cart'&&target==='bag'){
      const item=state.shop.cart.find(item=>item.id===drag.itemId);
      if(item){state.shop.cart=state.shop.cart.filter(item=>item.id!==drag.itemId);state.shop.bag.push(item);}
    } else if(drag.kind==='shop-payment'&&state.shop.phase==='payment'){
      paid=state.shop.paymentMethod==='💳' ? target==='terminal' : target==='cashier-hand';
    }
    state.drag=null;
    if(paid)settleShopPayment();
    else renderSimulator();
    return;
  }
  const stage=app.querySelector('.stage');
  if(drag.kind==='character'||drag.kind==='wake'){
    if(state.activity==='sleep'){
      const target=app.querySelector('[data-drop="bed"]');const rect=target?.getBoundingClientRect();
      const landed=rect&&event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
      if(drag.kind==='character'&&landed)state.asleep=true;
      else if(drag.kind==='wake'&&landed)state.asleep=true;
      else if(!landed)setCharacterPosition(event,stage,'sleep');
      state.drag=null;
      render();
    } else if(state.activity==='bathe') {
      const target=app.querySelector('[data-drop="tub"]');const rect=target?.getBoundingClientRect();
      const landed=rect&&event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
      if((drag.kind==='character'||drag.kind==='wake')&&landed)state.bathInTub=true;
      else if(!landed)setCharacterPosition(event,stage,'bathe');
      state.drag=null;
      render();
    }
  } else if(drag.kind==='accessory'&&stage) {
    const rect=stage.getBoundingClientRect();
    state.accessories[drag.index].left=Math.max(2,Math.min(92,(event.clientX-rect.left)/rect.width*100));
    state.accessories[drag.index].top=Math.max(3,Math.min(88,(event.clientY-rect.top)/rect.height*100));render();
  } else if(drag.kind==='brush'&&stage) {
    const rect=stage.getBoundingClientRect();state.brushPos.left=Math.max(4,Math.min(88,(event.clientX-rect.left)/rect.width*100));state.brushPos.top=Math.max(10,Math.min(82,(event.clientY-rect.top)/rect.height*100));
    const brush=app.querySelector('.toothbrush');if(brush){brush.style.left=`${state.brushPos.left}%`;brush.style.top=`${state.brushPos.top}%`;brush.style.visibility='';}
  }
  state.drag=null;
}
function setCharacterPosition(event,stage,activity) {
  if(!stage)return;
  const rect=stage.getBoundingClientRect();
  const position={left:Math.max(4,Math.min(96,(event.clientX-rect.left)/rect.width*100)),top:Math.max(8,Math.min(88,(event.clientY-rect.top)/rect.height*100))};
  if(activity==='sleep')state.sleepPosition=position;
  if(activity==='bathe')state.bathPosition=position;
}

app.addEventListener('click',event=>{
  const person=event.target.closest('[data-person]');
  if(person){const [group,index]=person.dataset.person.split(':');state.selected={group,index:Number(index),emoji:people[group][Number(index)]};renderPicker();return;}
  const activity=event.target.closest('[data-activity]');if(activity){setActivity(activity.dataset.activity);return;}
  const shopSectionButton=event.target.closest('[data-shop-section]');
  if(shopSectionButton){
    const section=shopSections.find(item=>item.id===shopSectionButton.dataset.shopSection);
    if(section){state.shop.section=section.id;state.shop.stock=randomStock(section);state.shop.phase='browse';renderSimulator();}
    return;
  }
  const shopAction=event.target.closest('[data-shop-action]')?.dataset.shopAction;
  if(shopAction){handleShopAction(shopAction);return;}
  const deleteMix=event.target.closest('[data-delete-saved-mix]')?.dataset.deleteSavedMix;
  if(deleteMix){savedMixes=savedMixes.filter(recipe=>recipe.id!==deleteMix);persistSavedMixes();renderSimulator();return;}
  const savedDrink=event.target.closest('[data-saved-drink]')?.dataset.savedDrink;
  if(savedDrink){const recipe=savedMixes.find(item=>item.id===savedDrink);if(recipe&&state.drinkLevel<100){state.drinkLayers.push({name:recipe.name,color:recipe.color,amount:10,bubbly:recipe.bubbly});state.drinkLevel+=10;state.mixed=false;state.saveMixOpen=false;renderSimulator();}return;}
  const payment=event.target.closest('[data-payment]')?.dataset.payment;
  if(payment){chooseShopPayment(payment);return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='continue'){state.screen='activities';renderActivities();}
  else if(action==='back'){state.screen='picker';renderPicker();}
  else if(action==='change-character'){state.screen='picker';renderPicker();}
  else if(action==='activities'){
    if(state.activity==='shop'&&state.shop.phase==='settling'){clearTimeout(state.shop.paymentTimeout);state.shop.paymentTimeout=null;state.shop.phase='payment';}
    state.screen='activities';renderActivities();
  }
  else if(action==='reset')resetActivity();
  else if(action==='toggle-eat-animation'){state.eatAnimated=!state.eatAnimated;renderSimulator();}
  else if(action==='lights'){state.lights=!state.lights;renderSimulator();}
  else if(action==='toggle-boba'){state.bobaEnabled=!state.bobaEnabled;renderSimulator();}
  else if(action==='open-save-mix'){state.saveMixOpen=true;renderSimulator();app.querySelector('input[name="mix-name"]')?.focus();}
  else if(action==='drink-cup'){if(state.drinkLayers.length){const top=state.drinkLayers[state.drinkLayers.length-1];top.amount-=10;if(top.amount<=0)state.drinkLayers.pop();state.drinkLevel=Math.max(0,state.drinkLevel-10);if(!state.drinkLevel){state.drinkLayers=[];state.mixed=false;}renderSimulator();}}
  else if(action==='mix')mixDrinks();
  const drink=event.target.closest('[data-drink]');if(drink){const match=drinks.find(([name])=>name===drink.dataset.drink);if(match&&state.drinkLevel<100){state.drinkLayers.push({name:match[0],color:match[1],amount:10});state.drinkLevel=Math.min(100,state.drinkLevel+10);state.mixed=false;state.saveMixOpen=false;renderSimulator();}return;}
  const food=event.target.closest('[data-food]');if(food){const item=state.eatItems[Number(food.dataset.food)];const box=food.getBoundingClientRect();item.bites.push({x:Math.min(90,Math.max(10,((event.clientX-box.left)/box.width)*100)),y:Math.min(90,Math.max(10,((event.clientY-box.top)/box.height)*100)),size:state.biteSize});renderSimulator();}
});
app.addEventListener('input',event=>{
  const pearlColor=event.target.closest('[data-boba-color]');
  if(pearlColor){state.bobaColor=pearlColor.value;app.querySelector('.boba-pearls')?.style.setProperty('--pearl-color',state.bobaColor);return;}
  const slider=event.target.closest('[data-eat-size]');
  if(!slider)return;
  state.biteSize=Number(slider.value);
  const output=slider.parentElement.querySelector('output');
  if(output)output.textContent=`${state.biteSize}px`;
});
app.addEventListener('submit',event=>{
  const mixForm=event.target.closest('[data-form="saved-mix"]');
  if(mixForm){
    event.preventDefault();
    const name=mixForm.elements['mix-name'].value.trim().slice(0,30);
    if(!name||!state.mixed||state.drinkLayers.length!==1)return;
    const layer=state.drinkLayers[0];
    savedMixes.unshift({id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,name,color:layer.color,bubbly:Boolean(layer.bubbly||layer.name==='Soda')});
    persistSavedMixes();state.saveMixOpen=false;renderSimulator();return;
  }
  const form=event.target.closest('[data-form="food"]');if(!form)return;
  event.preventDefault();const input=form.elements.food;const value=input.value.trim();if(!value)return;
  state.eatItems.push({emoji:value,bites:[]});renderSimulator();app.querySelector('input[name="food"]')?.focus();
});
app.addEventListener('pointerdown',event=>{
  const source=event.target.closest('[data-drag]');if(source&&source.dataset.drag){beginDrag(event,source);return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='move'||action==='run'){
    event.preventDefault();state.running=action==='run';state.moving=true;renderSimulator();
    state.walkTimer=setInterval(()=>{state.walkMeters+=state.running?0.2:0.07;const meter=app.querySelector('#meter-value');if(meter)meter.textContent=`${state.walkMeters.toFixed(1)} m`;},100);
  } else if(action==='toilet'){
    event.preventDefault();state.toiletHold=true;state.holdTriggered=false;
    state.toiletTimer=setTimeout(()=>{state.holdTriggered=true;addYellowDrop();state.toiletInterval=setInterval(addYellowDrop,80);},300);
  }
});
document.addEventListener('pointermove',onPointerMove);
document.addEventListener('pointerup',onPointerUp);
document.addEventListener('pointercancel',onPointerUp);
render();
