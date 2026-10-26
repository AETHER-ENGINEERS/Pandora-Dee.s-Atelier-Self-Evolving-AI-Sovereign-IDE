import { config } from 'config';

class CatGame {
  constructor() {
    this.cats = [];
    this.eggs = [];
    this.selectedParents = [];
    this.currentKittens = [];
    this.food = config.initialFood;
    
    this.addCat(config.defaultCat);
    this.setupEventListeners();
    this.updateFoodDisplay();
  }

  setupEventListeners() {
    document.getElementById('basic-egg').addEventListener('click', () => this.createEgg());
    document.getElementById('breed-btn').addEventListener('click', () => this.breedCats());
    document.getElementById('reroll-kittens').addEventListener('click', () => this.rerollKittens());
    document.getElementById('trade-btn').addEventListener('click', () => this.openTradeMenu());
    document.getElementById('close-trade').addEventListener('click', () => this.closeTradeMenu());
  }

  updateFoodDisplay() {
    document.getElementById('food-count').textContent = this.food;
  }

  addFood(amount) {
    this.food += amount;
    this.updateFoodDisplay();
  }

  openTradeMenu() {
    if (this.selectedParents.length !== 1) return;
    const cat = this.selectedParents[0];
    const menu = document.getElementById('trade-menu');
    
    menu.innerHTML = `
      <h3>Trade Options</h3>
      <button onclick="game.tradeCat()" ${cat ? '' : 'disabled'}>
        Trade Cat (Get ${config.tradeValues.cat} food)
      </button>
      <button onclick="game.tradeExperiments()" 
        ${cat?.experimentsLeft === config.maxExperiments ? '' : 'disabled'}>
        Trade Experiments (${config.tradeValues.experiments} food)
      </button>
      <button onclick="game.tradeSuperExperiments()" 
        ${cat?.superExperimentsLeft === config.maxSuperExperiments ? '' : 'disabled'}>
        Trade Super Experiments (${config.tradeValues.superExperiments} food)
      </button>
    `;
    
    document.getElementById('trade-overlay').style.display = 'block';
    menu.style.display = 'block';
  }

  closeTradeMenu() {
    document.getElementById('trade-overlay').style.display = 'none';
    document.getElementById('trade-menu').style.display = 'none';
  }

  tradeCat() {
    const cat = this.selectedParents[0];
    this.addFood(config.tradeValues.cat);
    this.releaseCat(cat.id);
    this.closeTradeMenu();
  }

  tradeExperiments() {
    const cat = this.selectedParents[0];
    this.addFood(config.tradeValues.experiments);
    cat.experimentsLeft = 0;
    this.updateCatDisplay();
    this.closeTradeMenu();
  }

  tradeSuperExperiments() {
    const cat = this.selectedParents[0];
    this.addFood(config.tradeValues.superExperiments);
    cat.superExperimentsLeft = 0;
    this.updateCatDisplay();
    this.closeTradeMenu();
  }

  addCat(properties) {
    if (this.cats.length >= config.maxCats) return;
    
    const cat = {
      id: Date.now(),
      ...properties,
      experimentsLeft: config.maxExperiments,
      superExperimentsLeft: config.maxSuperExperiments,
      eaten: false
    };
    
    this.cats.push(cat);
    this.updateCatDisplay();
  }

  createCatSVG(cat) {
    return `
      <svg class="cat-svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="30" fill="${cat.headColor}"/> <!-- head -->
        <!-- Left ear - proper triangle shape -->
        <polygon points="30,10 20,30 40,30" fill="${cat.earColor}"/>
        <!-- Right ear - proper triangle shape -->
        <polygon points="70,10 60,30 80,30" fill="${cat.earColor}"/>
        <circle cx="40" cy="45" r="5" fill="${cat.eyeColor}"/> <!-- left eye -->
        <circle cx="60" cy="45" r="5" fill="${cat.eyeColor}"/> <!-- right eye -->
        <polygon points="50,55 45,50 55,50" fill="${cat.earColor}"/> <!-- nose -->
      </svg>
    `;
  }

  createEggSVG() {
    return `
      <svg class="egg-svg" viewBox="0 0 60 80">
        <path d="M30 5 Q60 40 30 75 Q0 40 30 5Z" fill="#fff" stroke="#000"/>
      </svg>
    `;
  }

  updateCatDisplay() {
    const container = document.getElementById('cats');
    document.getElementById('cat-count').textContent = this.cats.length;
    
    container.innerHTML = this.cats.map(cat => `
      <div class="cat-card ${this.selectedParents.includes(cat) ? 'selected' : ''} ${cat.eaten ? 'fed' : ''}">
        <div class="fed-indicator"></div>
        ${this.createCatSVG(cat)}
        <div>Experiments left: ${cat.experimentsLeft}</div>
        <button onclick="game.feedCat('${cat.id}')" ${this.food > 0 ? '' : 'disabled'}>
          Feed (${cat.eaten ? 'Fed!' : 'Use 1 Food'})
        </button>
        <button onclick="game.experimentCat('${cat.id}')" 
          ${cat.experimentsLeft <= 0 ? 'disabled' : ''}>
          Experiment
        </button>
        <button class="super-experiment" 
          onclick="game.superExperimentCat('${cat.id}')" 
          ${cat.superExperimentsLeft <= 0 ? 'disabled' : ''}>
          SUPER Experiment (${cat.superExperimentsLeft} left)
        </button>
        <button onclick="game.releaseCat('${cat.id}')">Release</button>
        <button onclick="game.toggleParentSelection('${cat.id}')"
          ${this.selectedParents.length >= 2 && !this.selectedParents.includes(cat) ? 'disabled' : ''}>
          ${this.selectedParents.includes(cat) ? 'Deselect' : 'Select'}
        </button>
        <button id="trade-btn" onclick="game.openTradeMenu()">Trade</button>
      </div>
    `).join('');
  }

  experimentCat(id) {
    const cat = this.cats.find(c => c.id.toString() === id);
    if (!cat || cat.experimentsLeft <= 0) return;

    const properties = ['headColor', 'earColor', 'eyeColor'];
    const propertyToChange = properties[Math.floor(Math.random() * properties.length)];
    cat[propertyToChange] = this.varyColor(cat[propertyToChange], cat);
    cat.experimentsLeft--;
    
    cat.eaten = false;
    this.updateCatDisplay();
  }

  releaseCat(id) {
    const numericId = parseInt(id, 10);
    this.cats = this.cats.filter(c => c.id !== numericId);
    this.selectedParents = this.selectedParents.filter(c => c.id !== numericId);
    this.updateCatDisplay();
    document.getElementById('breed-btn').disabled = this.selectedParents.length !== 2;
  }

  toggleParentSelection(id) {
    const cat = this.cats.find(c => c.id.toString() === id);
    if (!cat) return;

    const index = this.selectedParents.indexOf(cat);
    if (index === -1) {
      if (this.selectedParents.length < 2) {
        this.selectedParents.push(cat);
      }
    } else {
      this.selectedParents.splice(index, 1);
    }

    document.getElementById('breed-btn').disabled = this.selectedParents.length !== 2;
    this.updateCatDisplay();
  }

  superExperimentCat(id) {
    const cat = this.cats.find(c => c.id.toString() === id);
    if (!cat || cat.superExperimentsLeft <= 0) return;

    // Modify all properties with increased variation
    ['headColor', 'earColor', 'eyeColor'].forEach(property => {
      cat[property] = this.superVaryColor(cat[property], cat);
    });
    
    cat.superExperimentsLeft--;
    cat.eaten = false;
    this.updateCatDisplay();
  }

  superVaryColor(color, cat) {
    if(Math.random() < config.superMutationChance) {
      return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    const hex = color.slice(1);
    const rgb = parseInt(hex, 16);
    const variation = config.superColorVariation * (cat?.eaten ? config.foodBoostMultiplier : 1);

    return '#' + [0, 1, 2].map(channel => {
      const val = (rgb >> (16 - channel*8)) & 255;
      const newVal = Math.max(0, Math.min(255, 
        val + (Math.random() - 0.5) * variation
      ));
      return Math.round(newVal).toString(16).padStart(2, '0');
    }).join('');
  }

  varyColor(color, cat) {
    // Check for mutation chance first
    if(Math.random() < config.mutationChance) {
      // Generate completely random color
      return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    const hex = color.slice(1);
    const rgb = parseInt(hex, 16);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;

    const variation = config.colorVariation * (cat?.eaten ? config.foodBoostMultiplier : 1);
    const newR = Math.max(0, Math.min(255, r + (Math.random() - 0.5) * variation));
    const newG = Math.max(0, Math.min(255, g + (Math.random() - 0.5) * variation));
    const newB = Math.max(0, Math.min(255, b + (Math.random() - 0.5) * variation));

    return '#' + (Math.round(newR) << 16 | Math.round(newG) << 8 | Math.round(newB)).toString(16).padStart(6, '0');
  }

  mixColors(color1, color2) {
    const hex1 = color1.slice(1);
    const hex2 = color2.slice(1);
    const rgb1 = parseInt(hex1, 16);
    const rgb2 = parseInt(hex2, 16);
    
    const r1 = (rgb1 >> 16) & 255;
    const g1 = (rgb1 >> 8) & 255;
    const b1 = rgb1 & 255;
    
    const r2 = (rgb2 >> 16) & 255;
    const g2 = (rgb2 >> 8) & 255;
    const b2 = rgb2 & 255;
    
    const ratio = Math.random();
    const r = Math.round(r1 * ratio + r2 * (1 - ratio));
    const g = Math.round(g1 * ratio + g2 * (1 - ratio));
    const b = Math.round(b1 * ratio + b2 * (1 - ratio));
    
    return this.varyColor('#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0'), null);
  }

  generateKitten(parent1, parent2) {
    return {
      headColor: this.mixColors(parent1.headColor, parent2.headColor),
      earColor: this.mixColors(parent1.earColor, parent2.earColor),
      eyeColor: this.mixColors(parent1.eyeColor, parent2.eyeColor)
    };
  }

  breedCats() {
    if (this.selectedParents.length !== 2) return;
    
    this.currentKittens = Array(config.numberOfKittens).fill(null)
      .map(() => this.generateKitten(...this.selectedParents));
    
    this.displayKittens();
    document.getElementById('reroll-kittens').style.display = 'block';
  }

  rerollKittens() {
    if (this.selectedParents.length !== 2) return;
    this.breedCats();
  }

  displayKittens() {
    const container = document.getElementById('kittens');
    container.innerHTML = this.currentKittens.map((kitten, index) => `
      <div class="cat-card">
        ${this.createCatSVG(kitten)}
        <button onclick="game.createEgg(${index})">Create Egg with this Kitten</button>
      </div>
    `).join('');
  }

  createEgg(kittenIndex = null) {
    const properties = kittenIndex !== null ? 
      this.currentKittens[kittenIndex] : 
      config.defaultCat;

    const egg = {
      id: Date.now(),
      properties,
      startTime: Date.now(),
      hatched: false
    };

    this.eggs.push(egg);
    this.updateEggDisplay();
    this.startEggTimer(egg);

    // New code to clear kittens after selection
    if (kittenIndex !== null) {
      this.currentKittens = [];
      this.displayKittens();
      document.getElementById('reroll-kittens').style.display = 'none';
    }
  }

  startEggTimer(egg) {
    const interval = setInterval(() => {
      const progress = Math.min(100, (Date.now() - egg.startTime) / config.eggHatchTime * 100);
      this.updateEggProgress(egg.id, progress);
      
      if (progress >= 100) {
        clearInterval(interval);
        egg.hatched = true;
        this.hatchEgg(egg);
      }
    }, 100);
  }

  updateEggProgress(id, progress) {
    const progressBar = document.querySelector(`#egg-${id} .progress`);
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
  }

  updateEggDisplay() {
    const container = document.getElementById('eggs');
    container.innerHTML = this.eggs.map(egg => `
      <div id="egg-${egg.id}" class="egg-card">
        ${this.createEggSVG()}
        <div class="progress-bar">
          <div class="progress"></div>
        </div>
      </div>
    `).join('');
  }

  hatchEgg(egg) {
    this.addCat(egg.properties);
    this.eggs = this.eggs.filter(e => e.id !== egg.id);
    this.updateEggDisplay();
  }

  feedCat(id) {
    const cat = this.cats.find(c => c.id.toString() === id);
    if (!cat || this.food < 1 || cat.eaten) return;
    
    this.food--;
    cat.eaten = true;
    this.updateFoodDisplay();
    this.updateCatDisplay();
  }
}

window.game = new CatGame();