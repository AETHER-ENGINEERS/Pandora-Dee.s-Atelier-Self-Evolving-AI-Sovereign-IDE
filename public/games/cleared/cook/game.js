class Game {
  constructor() {
    this.setupEventListeners();
    this.ingredients = [];
    this.resultEmoji = '';
    this.selectedContainer = '';
    this.sound = new Audio('/Human Eating_Crunch - Sound Effect (HD) (1).wav');
    this.draggedElement = null;
    this.foodAttachedToChopsticks = false;
    this.drinkEmoji = '🥤';  // Default drink emoji
    
    // Recipe book data
    this.recipes = [
      { result: '🥪', ingredients: ['🍞', '🧀', '🥩', '🥬'], container: '🥣' },
      { result: '🥗', ingredients: ['🥬', '🍅'], container: '🥣' },
      { result: '🍜', ingredients: ['🥚', '🥩', '🥬'], container: '🍲' },
      { result: '🍲', ingredients: ['🥩', '🥕', '🧅'], container: '🍲' },
      { result: '🍳', ingredients: ['🥚', '🧀'], container: '🍳' },
      { result: '🥘', ingredients: ['🍚', '🥩', '🥕'], container: '🍲' },
      { result: '🍝', ingredients: ['🍝', '🧀', '🍅'], container: '🍳' },
      { result: '🥣', ingredients: ['🥛', '🥣'], container: '🥣' }
    ];
    
    this.initializeRecipeBook();
  }

  initializeRecipeBook() {
    const recipesList = document.getElementById('recipes-list');
    recipesList.innerHTML = '';
    
    this.recipes.forEach(recipe => {
      const recipeCard = document.createElement('div');
      recipeCard.className = 'recipe-card';
      recipeCard.innerHTML = `
        <div class="recipe-result">${recipe.result}</div>
        <div class="recipe-ingredients">
          ${recipe.ingredients.join(' ')} + ${recipe.container}
        </div>
      `;
      
      recipeCard.addEventListener('click', () => this.loadRecipe(recipe));
      recipesList.appendChild(recipeCard);
    });
  }

  loadRecipe(recipe) {
    document.getElementById('ingredients').value = recipe.ingredients.join('');
    document.getElementById('result').value = recipe.result;
    
    const containerElement = document.querySelector(`.container-option[data-container="${recipe.container}"]`);
    if (containerElement) {
      this.selectContainer(containerElement);
    }
    
    this.startCooking();
  }

  setupEventListeners() {
    document.querySelectorAll('.container-option').forEach(container => {
      container.addEventListener('click', () => this.selectContainer(container));
    });

    document.getElementById('start-cooking').addEventListener('click', () => this.startCooking());
    document.getElementById('next-round').addEventListener('click', () => this.resetGame());

    // Setup drag and drop listeners
    document.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    document.addEventListener('pointermove', this.handlePointerMove.bind(this));
    document.addEventListener('pointerup', this.handlePointerUp.bind(this));

    document.getElementById('toggle-recipes').addEventListener('click', () => {
      const recipesList = document.getElementById('recipes-list');
      recipesList.classList.toggle('hidden');
    });
  }

  selectContainer(containerElement) {
    document.querySelectorAll('.container-option').forEach(c => c.classList.remove('selected'));
    containerElement.classList.add('selected');
    this.selectedContainer = containerElement.dataset.container;
  }

  validateInputs() {
    const ingredientsInput = document.getElementById('ingredients').value.trim();
    const resultInput = document.getElementById('result').value.trim();
    const drinkInput = document.getElementById('drink-input').value.trim();
    
    this.ingredients = Array.from(ingredientsInput);
    
    // Set drink emoji if provided, otherwise keep default
    if (drinkInput) {
      this.drinkEmoji = drinkInput;
    } else {
      this.drinkEmoji = '🥤';
    }
    
    return this.ingredients.length >= 2 && 
           this.ingredients.length <= 6 && 
           resultInput.length === 2 &&
           this.selectedContainer;
  }

  startCooking() {
    if (!this.validateInputs()) {
      alert('Please enter valid inputs (2-6 ingredients, one result emoji, and select a container)');
      return;
    }

    this.resultEmoji = document.getElementById('result').value.trim();
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('cooking-screen').classList.remove('hidden');
    
    const cookingArea = document.getElementById('cooking-area');
    const ingredientsTray = document.getElementById('ingredients-tray');
    
    // Clear previous contents
    cookingArea.innerHTML = '';
    ingredientsTray.innerHTML = '';
    
    // Add container
    const container = document.createElement('div');
    container.className = 'emoji draggable';
    container.textContent = this.selectedContainer;
    container.style.position = 'absolute';
    container.style.left = '50%';
    container.style.top = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    cookingArea.appendChild(container);
    
    // Add ingredients to tray
    this.ingredients.forEach((ingredient, index) => {
      const ingredientEl = document.createElement('div');
      ingredientEl.className = 'emoji ingredient draggable';
      ingredientEl.textContent = ingredient;
      ingredientsTray.appendChild(ingredientEl);
    });
  }

  handlePointerDown(e) {
    const target = e.target;
    if (!target.classList.contains('draggable')) return;
    
    this.draggedElement = target;
    target.style.zIndex = '1000';
    
    // If on eating screen, handle special cases
    if (document.getElementById('eating-screen').classList.contains('hidden')) {
      // Cooking screen logic
      if (target.classList.contains('ingredient')) {
        const container = document.querySelector('#cooking-area .emoji');
        const rect = container.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          target.remove();
          if (document.querySelectorAll('.ingredient').length === 0) {
            this.finishCooking();
          }
        }
      }
    }
  }

  handlePointerMove(e) {
    if (!this.draggedElement) return;
    
    const x = e.clientX;
    const y = e.clientY;
    
    this.draggedElement.style.position = 'fixed';
    this.draggedElement.style.left = x + 'px';
    this.draggedElement.style.top = y + 'px';
    this.draggedElement.style.transform = 'translate(-50%, -50%)';
    
    // Check for chopsticks hovering over food
    if (this.draggedElement.textContent === '🥢') {
      const food = document.getElementById('food');
      const foodRect = food.getBoundingClientRect();
      const chopsticksRect = this.draggedElement.getBoundingClientRect();
      
      if (this.isColliding(chopsticksRect, foodRect) && !this.foodAttachedToChopsticks) {
        this.foodAttachedToChopsticks = true;
      }
    }
    
    // Update food position if attached to chopsticks - keep exact position relative to chopsticks
    if (this.foodAttachedToChopsticks && this.draggedElement.textContent === '🥢') {
      const food = document.getElementById('food');
      const offsetY = 30; // Distance below chopsticks
      food.style.position = 'fixed';
      food.style.left = x + 'px';  // Keep exactly aligned with chopsticks horizontally
      food.style.top = (y + offsetY) + 'px';
      food.style.transform = 'translate(-50%, -50%)';
    }
  }

  handlePointerUp(e) {
    if (!this.draggedElement) return;
    
    const eater = document.getElementById('eater');
    if (eater) {
      const eaterRect = eater.getBoundingClientRect();
      const draggedRect = this.draggedElement.getBoundingClientRect();
      
      if (this.isColliding(draggedRect, eaterRect)) {
        if (this.draggedElement.textContent === '🥤') {
          this.handleDrinking();
        } else if (this.draggedElement.textContent === '🥢' && this.foodAttachedToChopsticks) {
          this.handleEating();
        } else if (this.draggedElement === document.getElementById('food')) {
          this.handleEating();
        }
      }
    }
    
    this.draggedElement.style.zIndex = '';
    this.draggedElement = null;
  }

  isColliding(rect1, rect2) {
    return !(rect1.right < rect2.left || 
             rect1.left > rect2.right || 
             rect1.bottom < rect2.top || 
             rect1.top > rect2.bottom);
  }

  finishCooking() {
    document.getElementById('cooking-screen').classList.add('hidden');
    document.getElementById('eating-screen').classList.remove('hidden');
    
    const food = document.getElementById('food');
    food.textContent = this.resultEmoji;
    food.className = 'emoji draggable';
    
    const drink = document.getElementById('drink');
    drink.textContent = this.drinkEmoji;
  }

  handleDrinking() {
    const eater = document.getElementById('eater');
    const drink = document.getElementById('drink');
    
    eater.textContent = '😮';
    
    setTimeout(() => {
      eater.textContent = '😃';
      drink.remove();
    }, 2000);
  }

  handleEating() {
    const eater = document.getElementById('eater');
    const food = document.getElementById('food');
    
    eater.textContent = '😙';
    food.style.display = 'none';
    this.foodAttachedToChopsticks = false;
    
    this.sound.play();
    this.sound.onended = () => {
      eater.textContent = '😃';
    };
  }

  resetGame() {
    document.getElementById('eating-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('ingredients').value = '';
    document.getElementById('result').value = '';
    document.getElementById('drink-input').value = '';
    document.querySelectorAll('.container-option').forEach(c => c.classList.remove('selected'));
    
    // Reset all state variables
    this.selectedContainer = '';
    this.ingredients = [];
    this.resultEmoji = '';
    this.foodAttachedToChopsticks = false;
    this.drinkEmoji = '🥤';  // Reset to default drink
    
    // Reset positions of elements
    const drink = document.getElementById('drink');
    const chopsticks = document.getElementById('chopsticks');
    const food = document.getElementById('food');
    
    if (drink) {
      drink.textContent = this.drinkEmoji;
      drink.style.position = 'absolute';
      drink.style.left = '30%';
      drink.style.top = '50%';
      drink.style.transform = 'translate(-50%, -50%)';
      drink.style.display = 'block';
    }
    
    if (chopsticks) {
      chopsticks.style.position = 'absolute';
      chopsticks.style.left = '70%';
      chopsticks.style.top = '40%';
      chopsticks.style.transform = 'translate(-50%, -50%)';
    }
    
    if (food) {
      food.style.position = 'absolute';
      food.style.right = '30%';
      food.style.top = '50%';
      food.style.transform = 'translate(50%, -50%)';
      food.style.display = 'block';
    }
  }
}

new Game();