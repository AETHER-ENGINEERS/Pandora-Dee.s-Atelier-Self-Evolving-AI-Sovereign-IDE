/* ...existing code... */
const windBtn = document.getElementById('windBtn');
const leafInput = document.getElementById('leafInput');
const fruitInput = document.getElementById('fruitInput');
const woodColorInput = document.getElementById('woodColor');
const startBtn = document.getElementById('startBtn');
const creator = document.getElementById('creator');
const game = document.getElementById('game');
const growBtn = document.getElementById('growBtn');
const waterBtn = document.getElementById('waterBtn');
const fertBtn = document.getElementById('fertBtn');
const resetBtn = document.getElementById('resetBtn');
const treeCanvas = document.getElementById('treeCanvas');
const emojiLayer = document.getElementById('emojiLayer');
const particleLayer = document.getElementById('particleLayer');
const fruitsCollectedLabel = document.getElementById('fruitsCollected');
const growthCountLabel = document.getElementById('growthCount');

const ctx = treeCanvas.getContext('2d');

let W, H, centerX, groundY;
function resize() {
  W = treeCanvas.clientWidth;
  H = treeCanvas.clientHeight;
  treeCanvas.width = Math.floor(W * devicePixelRatio);
  treeCanvas.height = Math.floor(H * devicePixelRatio);
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  centerX = W/2;
  groundY = H*0.92;
}
window.addEventListener('resize', resize);
resize();

/* Tree model */
let tree = { nodes: [], woodColor:'#6b4b2a' };
let leafEmojis = ['🌿'];
let leafIndex = 0;
let fruitEmojis = ['🍎'];
let growths = 0;
let fruitsCollected = 0;
let fertilizedTurns = 0;
let baseFruitChance = 0.06;

function seedTree(){
  tree = { nodes: [] , woodColor: woodColorInput.value || '#6b4b2a' };
  // root trunk node: x,y,angle,len,depth,parent
  const start = { x:centerX, y:groundY, angle:-Math.PI/2, len:40, depth:0, parent:null };
  tree.nodes.push(start);
  growths = 0;
  fertileReset();
  fruitsCollected = 0;
  updateStats();
  clearLayer(emojiLayer);
  draw();
}

function fertileReset(){ fertilizedTurns = 0; }

function parseEmojis(str){
  // split into Unicode grapheme clusters roughly by using spread operator
  if(!str) return [];
  return Array.from(str.trim());
}

startBtn.addEventListener('click', ()=>{
  const parsedLeaves = parseEmojis(leafInput.value);
  const parsedFruits = parseEmojis(fruitInput.value);
  if(parsedLeaves.length===0){
    alert('Enter at least one leaf emoji.');
    return;
  }
  // leaf emojis come from leaf input; fruit emojis from fruit input, fallback to last leaf
  leafEmojis = parsedLeaves;
  fruitEmojis = parsedFruits.length>0 ? parsedFruits : [ parsedLeaves[parsedLeaves.length-1] ];
  leafIndex = 0;
  creator.classList.add('hidden');
  game.classList.remove('hidden');
  resize(); // ensure canvas/stage measured correctly before creating seed
  seedTree();
});

/* Growth logic */
function growTree(){
  // choose a parent node to branch from (prefer outermost small depth)
  const parent = pickParentNode();
  const angleJitter = (Math.random()-0.5)*0.9;
  const newAngle = parent.angle + (Math.random() > 0.5 ? 0.5 : -0.5) + angleJitter;
  // use a shorter base length and gentler growth scaling, cap absolute length so branches don't get too long
  const baseLen = parent.len * (0.7 + Math.random()*0.2);
  const effectiveGrowths = Math.min(growths, 5);
  const growthScale = 1 + Math.min(0.3, effectiveGrowths * 0.03);
  const newLen = Math.max(12, Math.min(baseLen * growthScale, 48));
  const newNode = {
    x: parent.x + Math.cos(newAngle) * (parent.len + newLen) * 0.6,
    y: parent.y + Math.sin(newAngle) * (parent.len + newLen) * 0.6,
    angle: newAngle,
    len: newLen,
    depth: parent.depth + 1,
    parent: parent
  };
  // clamp node y so tree cannot grow above a top margin
  const minY = H * 0.12; // top padding limit
  if(newNode.y < minY){
    newNode.y = minY + Math.random()*6;
  }
  tree.nodes.push(newNode);

  // sometimes make fruit
  const fruitChance = baseFruitChance + (fertilizedTurns>0 ? 0.34 : 0);
  if(Math.random() < fruitChance){
    spawnFruitOnNode(newNode);
  }

  // always add a leaf
  spawnLeafOnNode(newNode);

  // small chance for some existing leaves to detach on their own (without wind)
  if(Math.random() < 0.04){
    detachSomeLeaves();
  }

  growths++;
  if(fertilizedTurns>0) fertilizedTurns--;
  updateStats();
  draw();
}

function pickParentNode(){
  // bias to top/mid nodes: random pick weighted by smaller depth
  const weights = tree.nodes.map(n => 1/(1+n.depth));
  const sum = weights.reduce((a,b)=>a+b,0);
  let r = Math.random()*sum;
  for(let i=0;i<tree.nodes.length;i++){
    r -= weights[i];
    if(r<=0) return tree.nodes[i];
  }
  return tree.nodes[0];
}

/* UI elements as DOM emojis */
function spawnLeafOnNode(node){
  const el = document.createElement('div');
  el.className = 'leaf';
  const emoji = leafEmojis[leafIndex % leafEmojis.length];
  leafIndex++;
  el.textContent = emoji;
  positionElement(el, node.x + (Math.random()-0.5)*6, node.y + (Math.random()-0.5)*6, node.angle);
  emojiLayer.appendChild(el);
}

function spawnFruitOnNode(node){
  const el = document.createElement('div');
  el.className = 'fruit';
  const emoji = fruitEmojis[Math.floor(Math.random()*fruitEmojis.length)];
  el.textContent = emoji;
  positionElement(el, node.x + (Math.random()-0.3)*10, node.y + (Math.random()-0.3)*10, node.angle || 0);
  // make tappable to pick
  el.addEventListener('pointerdown', (e)=>{
    e.stopPropagation();
    pickFruit(el);
  }, {passive:true});
  emojiLayer.appendChild(el);
}

function pickFruit(el){
  // small pop animation
  el.style.transition = 'transform 220ms ease, opacity 220ms ease';
  el.style.transform = 'scale(0.2) translateY(-8px)';
  el.style.opacity = '0';
  setTimeout(()=>el.remove(), 240);
  fruitsCollected++;
  updateStats();
}

function positionElement(el, x, y, angle){
  el.style.left = (x - 12) + 'px';
  el.style.top = (y - 12) + 'px';
  // set rotation via CSS variable so CSS animations can rotate/override it
  el.style.setProperty('--rot', `${angle*0.45}rad`);
}

/* Particles for water/fertilize */
function clearLayer(layer){ while(layer.firstChild) layer.removeChild(layer.firstChild); }

function emitRain(color='#2ea7ff', count=18){
  const startX = centerX;
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.background = color;
    const sx = startX + (Math.random()-0.5)*120;
    p.style.left = sx + 'px';
    p.style.top = (-10 + Math.random()*20) + 'px';
    particleLayer.appendChild(p);
    // animate to bottom of tree (groundY)
    const dur = 800 + Math.random()*500;
    const tx = sx + (Math.random()-0.5)*80;
    const ty = groundY + 6 + Math.random()*10;
    animateParticle(p, tx, ty, dur, ()=>{
      p.style.transition = 'opacity 300ms';
      p.style.opacity = '0';
      setTimeout(()=>p.remove(), 350);
    });
  }
}

function animateParticle(el, tx, ty, dur, done){
  el.animate([
    { transform: `translate(0px,0px)`, opacity:1 },
    { transform: `translate(${tx - parseFloat(el.style.left)}px, ${ty - parseFloat(el.style.top)}px)`, opacity:1 }
  ], { duration: dur, easing:'cubic-bezier(.2,.6,.2,1)' });
  setTimeout(done, dur);
}

/* Drawing trunk/branches */
function draw(){
  ctx.clearRect(0,0,W,H);
  // draw ground stump
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = tree.woodColor || '#6b4b2a';
  // draw nodes as connected segments
  ctx.lineWidth = 8;
  for(const n of tree.nodes){
    if(n.parent){
      const lw = Math.max(1, 12 - n.depth);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(n.parent.x, n.parent.y);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
    } else {
      // root trunk short line upward
      ctx.beginPath();
      ctx.lineWidth = 12;
      ctx.moveTo(n.x, n.y);
      ctx.lineTo(n.x + Math.cos(n.angle)*n.len, n.y + Math.sin(n.angle)*n.len);
      ctx.stroke();
    }
  }
}

/* Controls */
growBtn.addEventListener('click', ()=>{ growTree(); });

waterBtn.addEventListener('click', ()=>{
  emitRain('#2ea7ff', 20);
});

fertBtn.addEventListener('click', ()=>{
  // fertilize: white + yellow specks and boost fruit chance for 5 grows
  emitRain('#fff6b2', 18);
  emitRain('#ffffff', 6);
  fertilizedTurns = 5;
});

resetBtn.addEventListener('click', ()=>{
  creator.classList.remove('hidden');
  game.classList.add('hidden');
  resize(); // refresh sizing after returning to creator
});

/* Stats update */
function updateStats(){
  fruitsCollectedLabel.textContent = `Fruits: ${fruitsCollected}`;
  growthCountLabel.textContent = `Growths: ${growths}`;
}

/* init */
resize();
draw();

function detachSomeLeaves(){
  const leaves = Array.from(emojiLayer.querySelectorAll('.leaf'));
  // pick a subset (~6-8% per existing leaf) to detach (slightly more common)
  const toDetach = leaves.filter(()=> Math.random() < 0.08);
  toDetach.forEach((leaf, idx) => {
    setTimeout(()=>{
      leaf.classList.add('falling');
      // mark as fallen (stay in DOM) instead of removing immediately
      leaf.classList.add('fallen');
      // non-wind drops fall downwards with slight horizontal jitter and gentle rotation (no strong left blow)
      const curLeft = parseFloat(leaf.style.left || 0);
      const jitterX = (Math.random()-0.5) * 20; // small left/right jitter
      const targetTop = Math.min(groundY - 18 + Math.random()*8, H - 30);
      leaf.style.top = targetTop + 'px';
      leaf.style.left = (curLeft + jitterX) + 'px';
      leaf.style.transform = `rotate(${(Math.random()-0.5)*0.8}rad)`;
      // do NOT remove here; leaf remains until wind blows it away
    }, idx * 60);
  });
}

function makeFruitsFallAndEnlarge(){
  const fruits = Array.from(emojiLayer.querySelectorAll('.fruit'));
  // always shake leaves, even if there are no fruits
  const leaves = Array.from(emojiLayer.querySelectorAll('.leaf'));
  if(leaves.length){
    leaves.forEach(l => l.classList.add('shake'));
    setTimeout(()=> leaves.forEach(l => l.classList.remove('shake')), 900);
  }
  // if there are fruits, make them bigger and fall
  fruits.forEach((f, i) => {
    f.classList.add('shake'); // quick shake visual
    f.classList.add('big');
    // ensure pointer events remain active
    f.style.pointerEvents = 'auto';
    // compute fall target (groundY minus offset)
    const curTop = parseFloat(f.style.top || 0);
    const target = Math.min(groundY - 28 + Math.random()*6, H - 30);
    f.classList.add('falling');
    // small stagger
    setTimeout(()=>{
      f.style.top = target + 'px';
      // add slight horizontal drift
      const drift = (Math.random()-0.5)*40;
      f.style.transform = `translateX(${drift}px)`;
    }, i*60);
    // remove shake class after animation
    setTimeout(()=> f.classList.remove('shake'), 1000 + i*60);
  });
 
  // blow any leaves that previously fell (marked .fallen) to the right immediately during wind
  const fallenLeaves = Array.from(emojiLayer.querySelectorAll('.leaf.fallen'));
  fallenLeaves.forEach((leaf, idx) => {
    setTimeout(()=>{
      leaf.classList.add('shake');
      // move right off-screen
      leaf.style.left = (W + 80 + Math.random()*60) + 'px';
      leaf.style.opacity = '0';
      // remove after animation completes
      setTimeout(()=> leaf.remove(), 1100);
    }, idx * 60);
  });

  // after wind, fruits remain with bigger hitbox for a short window (ease picking)
  setTimeout(()=> {
    // gradually reduce the temporary "big" hitbox while keeping fruits fallen on the ground
    fruits.forEach((f, i) => {
      setTimeout(()=>{
        f.classList.remove('big');
        // keep f.classList.contains('falling') so fruit remains at its dropped position
        // leave transform so small drift remains; pointer events stay enabled for picking
      }, i*80);
    });
  }, 4500);
}

windBtn.addEventListener('click', ()=>{
  makeFruitsFallAndEnlarge();
});