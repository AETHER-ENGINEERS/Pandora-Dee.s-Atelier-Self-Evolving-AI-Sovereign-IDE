class DrinkMaker {
  constructor() {
    this.ingredients = [];
    this.maxIngredients = 7; 
    this.isDrinkReady = false;
    this.setupEventListeners();
    this.showNames = false;
  }

  setupEventListeners() {
    const ingredientButtons = document.querySelectorAll('.ingredient-group button');
    ingredientButtons.forEach(button => {
      button.addEventListener('click', () => this.addIngredient(button));
    });

    document.getElementById('mix').addEventListener('click', () => this.mixDrink());
    document.getElementById('reset').addEventListener('click', () => this.reset());
    document.getElementById('drink').addEventListener('click', () => this.drinkBeverage());
    document.getElementById('toggle-names').addEventListener('click', () => this.toggleNames());
  }

  toggleNames() {
    this.showNames = !this.showNames;
    const container = document.querySelector('.ingredients');
    const toggleButton = document.getElementById('toggle-names');
    
    if (this.showNames) {
      container.classList.add('show-names');
      toggleButton.textContent = 'Hide Names';
    } else {
      container.classList.remove('show-names');
      toggleButton.textContent = 'Show Names';
    }
  }

  addIngredient(button) {
    if (this.ingredients.length >= this.maxIngredients) {
      alert('Maximum ingredients reached!');
      return;
    }

    const ingredient = {
      name: button.dataset.name,
      color: button.dataset.color
    };

    this.ingredients.push(ingredient);
    this.updateRecipeList();
    this.updateDrinkButton();
  }

  updateRecipeList() {
    const recipeList = document.getElementById('recipe-list');
    recipeList.innerHTML = this.ingredients
      .map(ing => `<li>${ing.name}</li>`)
      .join('');
  }

  updateDrinkButton() {
    const drinkButton = document.getElementById('drink');
    drinkButton.disabled = !this.isDrinkReady;
  }

  mixDrink() {
    if (this.ingredients.length === 0) {
      alert('Add some ingredients first!');
      return;
    }

    const liquid = document.querySelector('.liquid');
    const bubbles = document.querySelector('.bubbles');
    
    const mixedColor = this.mixColors();
    
    liquid.style.height = '80%';
    liquid.style.background = mixedColor;

    this.createBubbles();
    
    this.isDrinkReady = true;
    this.updateDrinkButton();
  }

  mixColors() {
    if (this.ingredients.length === 0) return 'transparent';

    const hexToRgb = hex => {
      let r = parseInt(hex.slice(1,3), 16);
      let g = parseInt(hex.slice(3,5), 16);
      let b = parseInt(hex.slice(5,7), 16);
      return { r, g, b };
    };

    const milkCount = this.ingredients.filter(i => i.name === 'Milk').length;
    const chocoCount = this.ingredients.filter(i => i.name === 'Chocolate').length;
    const others = this.ingredients.filter(i => i.name !== 'Milk' && i.name !== 'Chocolate');
    
    // Calculate milk/chocolate base blend
    const milkColor = hexToRgb('#FFFFFF');
    const chocoColor = hexToRgb('#6A441C');
    const totalMC = milkCount + chocoCount;
    
    let baseBlend = { r: 0, g: 0, b: 0 };
    if (totalMC > 0) {
      baseBlend.r = (milkColor.r * milkCount + chocoColor.r * chocoCount) / totalMC;
      baseBlend.g = (milkColor.g * milkCount + chocoColor.g * chocoCount) / totalMC;
      baseBlend.b = (milkColor.b * milkCount + chocoColor.b * chocoCount) / totalMC;
    }

    if (others.length === 0) {
      return `rgb(${Math.round(baseBlend.r)},${Math.round(baseBlend.g)},${Math.round(baseBlend.b)})`;
    }

    // Calculate other ingredients average
    const othersAvg = others.reduce((acc, ing) => {
      const rgb = hexToRgb(ing.color);
      acc.r += rgb.r;
      acc.g += rgb.g;
      acc.b += rgb.b;
      return acc;
    }, { r: 0, g: 0, b: 0 });

    othersAvg.r /= others.length;
    othersAvg.g /= others.length;
    othersAvg.b /= others.length;

    // Calculate weighted average based on ingredient counts
    const totalIngredients = this.ingredients.length;
    const baseWeight = totalMC / totalIngredients;
    const othersWeight = others.length / totalIngredients;

    const finalR = baseBlend.r * baseWeight + othersAvg.r * othersWeight;
    const finalG = baseBlend.g * baseWeight + othersAvg.g * othersWeight;
    const finalB = baseBlend.b * baseWeight + othersAvg.b * othersWeight;

    // Adjust for excess milk or chocolate
    const milkRatio = milkCount / totalMC || 0;
    const chocoRatio = chocoCount / totalMC || 0;
    
    return `rgb(${
      Math.round(finalR + (chocoRatio * 50) - (milkRatio * 30))
    },${
      Math.round(finalG + (chocoRatio * 30) - (milkRatio * 20))
    },${
      Math.round(finalB + (chocoRatio * 20) - (milkRatio * 10))
    })`;
  }

  createBubbles() {
    const bubbles = document.querySelector('.bubbles');
    bubbles.innerHTML = '';
    
    const bubbleCount = this.ingredients.some(ing => ing.name === 'Milk') ? 30 : 20;
    
    for (let i = 0; i < bubbleCount; i++) {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.style.left = `${Math.random() * 100}%`;
      bubble.style.width = `${Math.random() * 10 + 5}px`;
      bubble.style.height = bubble.style.width;
      bubble.style.animationDelay = `${Math.random() * 2}s`;
      
      if (this.ingredients.some(ing => ing.name === 'Milk')) {
        bubble.style.background = 'rgba(255, 255, 255, 0.6)';
      }
      
      bubbles.appendChild(bubble);
    }
  }

  drinkBeverage() {
    if (!this.isDrinkReady) return;

    const glass = document.querySelector('.glass');
    const liquid = document.querySelector('.liquid');
    const bubbles = document.querySelector('.bubbles');
    
    glass.classList.add('drinking');
    
    setTimeout(() => {
      liquid.style.background = 'transparent';
      liquid.style.height = '0';
      bubbles.innerHTML = '';
    }, 1000);
    
    this.isDrinkReady = false;
    this.updateDrinkButton();
    this.ingredients = [];
    this.updateRecipeList();
    
    setTimeout(() => {
      glass.classList.remove('drinking');
    }, 2500);
  }

  reset() {
    this.ingredients = [];
    this.isDrinkReady = false;
    this.updateRecipeList();
    this.updateDrinkButton();
    
    const liquid = document.querySelector('.liquid');
    liquid.style.height = '0';
    liquid.style.background = 'transparent';
    
    const bubbles = document.querySelector('.bubbles');
    bubbles.innerHTML = '';
  }

}

new DrinkMaker();