class Hairball {
  constructor(x, y, color, size = 20) {
    this.element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.element.setAttribute("class", "hairball");
    this.element.setAttribute("width", size);
    this.element.setAttribute("height", size);
    this.element.setAttribute("viewBox", "0 0 100 100");
    
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "40");
    circle.setAttribute("fill", color);
    
    // Add fuzzy effect with random paths
    for (let i = 0; i < 8; i++) {
      const fuzz = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const angle = (i / 8) * Math.PI * 2;
      const fx = 50 + Math.cos(angle) * 35;
      const fy = 50 + Math.sin(angle) * 35;
      fuzz.setAttribute("cx", fx);
      fuzz.setAttribute("cy", fy);
      fuzz.setAttribute("r", "15");
      fuzz.setAttribute("fill", color);
      this.element.appendChild(fuzz);
    }
    
    // Add eyes
    const leftEye = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    leftEye.setAttribute("cx", "35");
    leftEye.setAttribute("cy", "40");
    leftEye.setAttribute("r", "8");
    leftEye.setAttribute("fill", "white");
    
    const rightEye = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rightEye.setAttribute("cx", "65");
    rightEye.setAttribute("cy", "40");
    rightEye.setAttribute("r", "8");
    rightEye.setAttribute("fill", "white");
    
    const leftPupil = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    leftPupil.setAttribute("cx", "35");
    leftPupil.setAttribute("cy", "40");
    leftPupil.setAttribute("r", "4");
    leftPupil.setAttribute("fill", "black");
    
    const rightPupil = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rightPupil.setAttribute("cx", "65");
    rightPupil.setAttribute("cy", "40");
    rightPupil.setAttribute("r", "4");
    rightPupil.setAttribute("fill", "black");
    
    this.element.appendChild(circle);
    this.element.appendChild(leftEye);
    this.element.appendChild(rightEye);
    this.element.appendChild(leftPupil);
    this.element.appendChild(rightPupil);
    
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.size = size;
    this.defaultSize = 20; // Add this line to store the default size
    
    this.setupDragging();
  }

  setupDragging() {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    
    const dragStart = (e) => {
      currentX = parseFloat(this.element.style.left);
      currentY = parseFloat(this.element.style.top);
      
      if (e.type === "touchstart") {
        initialX = e.touches[0].clientX - currentX;
        initialY = e.touches[0].clientY - currentY;
      } else {
        initialX = e.clientX - currentX;
        initialY = e.clientY - currentY;
      }
      
      if (e.target.closest('.hairball') === this.element) {
        isDragging = true;
      }
    };
    
    const drag = (e) => {
      if (isDragging) {
        e.preventDefault();
        
        if (e.type === "touchmove") {
          currentX = e.touches[0].clientX - initialX;
          currentY = e.touches[0].clientY - initialY;
        } else {
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;
        }

        this.element.style.left = `${currentX}px`;
        this.element.style.top = `${currentY}px`;
        
        // Check if hairball is in mixing area
        const mixingArea = document.getElementById('mixing-area');
        const hairballRect = this.element.getBoundingClientRect();
        const mixingAreaRect = mixingArea.getBoundingClientRect();
        
        if (game.isColliding(hairballRect, mixingAreaRect)) {
          if (!this.element.classList.contains('selected')) {
            game.toggleHairballSelection(this.element);
          }
        } else {
          if (this.element.classList.contains('selected')) {
            game.toggleHairballSelection(this.element);
          }
        }

        // Check collision with food while dragging hairball
        const foods = document.querySelectorAll('.food');
        foods.forEach(food => {
          const foodRect = food.getBoundingClientRect();
          if (game.isColliding(hairballRect, foodRect)) {
            game.feedHairball(this, food);
          }
        });
      }
    };
    
    const dragEnd = () => {
      isDragging = false;
    };
    
    this.element.addEventListener("touchstart", dragStart, { passive: false });
    this.element.addEventListener("touchend", dragEnd, { passive: false });
    this.element.addEventListener("touchmove", drag, { passive: false });
    
    this.element.addEventListener("mousedown", dragStart, false);
    this.element.addEventListener("mouseup", dragEnd, false);
    this.element.addEventListener("mousemove", drag, false);
  }
}

class CatHairball extends Hairball {
  constructor(x, y, color, size = 20) {
    super(x, y, color, size);
    this.addCatFeatures();
  }

  addCatFeatures() {
    const baseColor = this.element.querySelector('circle').getAttribute('fill');
    
    // Add more prominent pointy ears
    const leftEar = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leftEar.setAttribute("d", "M35,30 L20,5 L45,25 Z");
    leftEar.setAttribute("fill", baseColor);
    
    const rightEar = document.createElementNS("http://www.w3.org/2000/svg", "path");
    rightEar.setAttribute("d", "M65,30 L85,5 L55,25 Z");
    rightEar.setAttribute("fill", baseColor);
    
    // Add pink nose
    const nose = document.createElementNS("http://www.w3.org/2000/svg", "path");
    nose.setAttribute("d", "M47,45 L53,45 L50,50 Z");
    nose.setAttribute("fill", "#ffb6c1");
    
    // Add longer, more curly tail pointing upwards
    const tail = document.createElementNS("http://www.w3.org/2000/svg", "path");
    // Modified path for upward-pointing tail
    tail.setAttribute("d", "M80,50 Q90,30 85,15 Q80,0 95,-5");
    tail.setAttribute("stroke", baseColor);
    tail.setAttribute("stroke-width", "8");
    tail.setAttribute("stroke-linecap", "round");
    tail.setAttribute("fill", "none");
    
    // Insert elements in correct order (behind eyes)
    const eyes = this.element.querySelectorAll('circle[fill="white"]');
    this.element.insertBefore(leftEar, eyes[0]);
    this.element.insertBefore(rightEar, eyes[0]);
    this.element.insertBefore(tail, eyes[0]);
    this.element.appendChild(nose);
  }
}

class FlatHairball {
  constructor(x, y, color, size = 15) {
    this.element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.element.setAttribute("class", "flat-hairball");
    this.element.setAttribute("width", size);
    this.element.setAttribute("height", size * 0.6); // Flatter appearance
    this.element.setAttribute("viewBox", "0 0 100 60"); // Adjusted viewBox for flatter look
    
    // Base oval shape for flat hairball
    const oval = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    oval.setAttribute("cx", "50");
    oval.setAttribute("cy", "30");
    oval.setAttribute("rx", "45");
    oval.setAttribute("ry", "25");
    oval.setAttribute("fill", color);
    
    // Add more fuzz circles for fluffier appearance
    for (let i = 0; i < 12; i++) {
      const fuzz = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const angle = (i / 12) * Math.PI * 2;
      const fx = 50 + Math.cos(angle) * 35;
      const fy = 30 + Math.sin(angle) * 15;
      fuzz.setAttribute("cx", fx);
      fuzz.setAttribute("cy", fy);
      fuzz.setAttribute("r", "12");
      fuzz.setAttribute("fill", color);
      this.element.appendChild(fuzz);
    }
    
    // Additional smaller fuzz for extra fluffiness
    for (let i = 0; i < 8; i++) {
      const smallFuzz = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const angle = ((i + 0.5) / 8) * Math.PI * 2;
      const fx = 50 + Math.cos(angle) * 25;
      const fy = 30 + Math.sin(angle) * 10;
      smallFuzz.setAttribute("cx", fx);
      smallFuzz.setAttribute("cy", fy);
      smallFuzz.setAttribute("r", "8");
      smallFuzz.setAttribute("fill", color);
      this.element.appendChild(smallFuzz);
    }
    
    this.element.appendChild(oval);
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.size = size;
    
    this.setupDragging();
  }

  setupDragging() {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    
    const dragStart = (e) => {
      currentX = parseFloat(this.element.style.left);
      currentY = parseFloat(this.element.style.top);
      
      if (e.type === "touchstart") {
        initialX = e.touches[0].clientX - currentX;
        initialY = e.touches[0].clientY - currentY;
      } else {
        initialX = e.clientX - currentX;
        initialY = e.clientY - currentY;
      }
      
      if (e.target.closest('.flat-hairball') === this.element) {
        isDragging = true;
      }
    };
    
    const drag = (e) => {
      if (isDragging) {
        e.preventDefault();
        
        if (e.type === "touchmove") {
          currentX = e.touches[0].clientX - initialX;
          currentY = e.touches[0].clientY - initialY;
        } else {
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;
        }

        this.element.style.left = `${currentX}px`;
        this.element.style.top = `${currentY}px`;
        
        // Check collision with living hairballs
        const flatRect = this.element.getBoundingClientRect();
        game.hairballs.forEach(hairball => {
          const hairballRect = hairball.element.getBoundingClientRect();
          if (game.isColliding(flatRect, hairballRect)) {
            game.absorbFlatHairball(hairball, this);
          }
        });
      }
    };
    
    const dragEnd = () => {
      isDragging = false;
    };
    
    this.element.addEventListener("touchstart", dragStart, { passive: false });
    this.element.addEventListener("touchend", dragEnd, { passive: false });
    this.element.addEventListener("touchmove", drag, { passive: false });
    
    this.element.addEventListener("mousedown", dragStart, false);
    this.element.addEventListener("mouseup", dragEnd, false);
    this.element.addEventListener("mousemove", drag, false);
  }
}

class Poop {
  constructor(x, y, hairballColor, hairballSize) {
    this.element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.element.setAttribute("class", "poop");
    
    // Scale poop size based on hairball size
    const basePoopWidth = 15;
    const basePoopHeight = 8;
    const scaleFactor = hairballSize / 20; // 20 is default hairball size
    const poopWidth = basePoopWidth * scaleFactor;
    const poopHeight = basePoopHeight * scaleFactor;
    
    this.element.setAttribute("width", poopWidth);
    this.element.setAttribute("height", poopHeight);
    this.element.setAttribute("viewBox", "0 0 30 16");
    
    // Mix color: 70% brown, 30% hairball color
    const brown = {
      r: 139,
      g: 69,
      b: 19
    };
    
    const hbColor = {
      r: parseInt(hairballColor.slice(1,3), 16),
      g: parseInt(hairballColor.slice(3,5), 16),
      b: parseInt(hairballColor.slice(5,7), 16)
    };
    
    const mixedColor = {
      r: Math.round(brown.r * 0.7 + hbColor.r * 0.3),
      g: Math.round(brown.g * 0.7 + hbColor.g * 0.3),
      b: Math.round(brown.b * 0.7 + hbColor.b * 0.3)
    };
    
    const poopColor = `#${mixedColor.r.toString(16).padStart(2,'0')}${mixedColor.g.toString(16).padStart(2,'0')}${mixedColor.b.toString(16).padStart(2,'0')}`;
    
    // Create squiggly poop shape
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5,8 Q10,4 15,8 T25,8");
    path.setAttribute("stroke", poopColor);
    path.setAttribute("stroke-width", "6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("fill", "none");
    
    this.element.appendChild(path);
    
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    
    // Add click/tap handler to remove poop
    this.element.addEventListener('click', () => this.element.remove());
    this.element.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.element.remove();
    });
  }
}

class Game {
  constructor() {
    this.gameArea = document.getElementById('game-area');
    this.hairballs = new Set();
    this.selectedHairballs = new Set();
    this.flatHairballs = new Set();
    this.foodColors = [
      { color: '#ffd700', name: 'gold' },
      { color: '#ff4444', name: 'red' },
      { color: '#44ff44', name: 'green' },
      { color: '#4444ff', name: 'blue' },
      { color: '#ff44ff', name: 'purple' },
      { color: '#00ffff', name: 'cyan' },
      { color: '#ffffff', name: 'white' },
      { color: '#000000', name: 'black' }
    ];
    
    this.foodSizes = [
      { size: 10, growthFactor: 1 },
      { size: 15, growthFactor: 2 },
      { size: 20, growthFactor: 3 }
    ];
    
    this.setupControls();
    this.defaultHairballSize = 20; // Add default size property
    this.setupAdditionalControls();
    this.allowColorChange = true; // whether foods/sheddings change hairball color
    this.setupColorRandomizer();
    this.setupRandomSpawner();
    this.setupResetButton();
    this.setupShedButton();
    this.setupPooping();
  }
  
  setupControls() {
    document.getElementById('spawn-hairball').addEventListener('click', () => {
      const color = document.getElementById('hairball-color').value;
      this.spawnHairball(color);
    });
    
    document.getElementById('spawn-food').addEventListener('click', () => {
      this.spawnFood();
    });
    
    document.getElementById('mix-hairballs').addEventListener('click', () => {
      this.mixSelectedHairballs();
    });
    
    document.getElementById('split-hairballs').addEventListener('click', () => {
      this.splitSelectedHairballs();
    });
    
    this.gameArea.addEventListener('click', (e) => {
      if (e.target.classList.contains('hairball')) {
        this.toggleHairballSelection(e.target);
      }
    });
  }
  
  setupAdditionalControls() {
    document.getElementById('spawn-cat').addEventListener('click', () => {
      const color = document.getElementById('hairball-color').value;
      this.spawnCatHairball(color);
    });
  }
  
  setupColorRandomizer() {
    const colorInput = document.getElementById('hairball-color');
    const foodColorInput = document.getElementById('food-color');
    const allowToggle = document.getElementById('allow-color-change');

    // Hairball color randomizer/invert (existing)
    document.getElementById('randomize-color').addEventListener('click', () => {
      const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
      colorInput.value = randomColor;
    });

    document.getElementById('invert-color').addEventListener('click', () => {
      const currentColor = colorInput.value;
      const r = parseInt(currentColor.slice(1,3), 16);
      const g = parseInt(currentColor.slice(3,5), 16);
      const b = parseInt(currentColor.slice(5,7), 16);
      const invertedColor = '#' + 
        (255-r).toString(16).padStart(2,'0') +
        (255-g).toString(16).padStart(2,'0') +
        (255-b).toString(16).padStart(2,'0');
      colorInput.value = invertedColor;
    });

    // Food color randomize
    document.getElementById('randomize-food-color').addEventListener('click', () => {
      const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
      foodColorInput.value = randomColor;
    });

    // Toggle whether foods/sheddings can change hairball color
    allowToggle.addEventListener('change', (e) => {
      this.allowColorChange = !!e.target.checked;
    });
  }

  setupRandomSpawner() {
    document.getElementById('spawn-random').addEventListener('click', () => {
      const color = document.getElementById('hairball-color').value;
      const isRandomCat = Math.random() < 0.5;
      
      if (isRandomCat) {
        this.spawnCatHairball(color);
      } else {
        this.spawnHairball(color);
      }
    });
  }

  setupResetButton() {
    document.getElementById('reset').addEventListener('click', () => {
      // Clear all hairballs
      this.hairballs.forEach(hairball => {
        hairball.element.remove();
      });
      this.hairballs.clear();
      this.selectedHairballs.clear();

      // Clear all food
      const foods = document.querySelectorAll('.food');
      foods.forEach(food => food.remove());
      
      // Clear all flat hairballs
      this.flatHairballs.forEach(flatHairball => {
        flatHairball.element.remove();
      });
      this.flatHairballs.clear();
    });
  }

  setupShedButton() {
    document.getElementById('shed').addEventListener('click', () => {
      if (this.selectedHairballs.size === 1) {
        const hairball = Array.from(this.selectedHairballs)[0];
        this.shedHairball(hairball);
      }
    });
  }

  setupPooping() {
    this.gameArea.addEventListener('click', (e) => {
      const hairball = e.target.closest('.hairball');
      if (hairball) {
        const rect = hairball.getBoundingClientRect();
        const color = hairball.querySelector('circle').getAttribute('fill');
        
        // Find the hairball object to get its size
        const hairballObj = Array.from(this.hairballs).find(h => h.element === hairball);
        const hairballSize = hairballObj ? hairballObj.size : 20;
        
        // Position poop at the hairball's position but slightly below
        const x = parseFloat(hairball.style.left);
        const y = parseFloat(hairball.style.top) + hairballSize; // Add hairballSize to move it below
        
        const poop = new Poop(x, y, color, hairballSize);
        this.gameArea.appendChild(poop.element);
      }
    });
  }

  spawnHairball(color) {
    const x = Math.random() * (this.gameArea.clientWidth - 50);
    const y = Math.random() * (this.gameArea.clientHeight - 50) + 60;
    const hairball = new Hairball(x, y, color);
    this.gameArea.appendChild(hairball.element);
    this.hairballs.add(hairball);
  }
  
  spawnFood() {
    const food = document.createElement('div');
    food.className = 'food';

    // Use selected food color if provided, otherwise fall back to random type
    const selectedFoodColorInput = document.getElementById('food-color');
    const chosenColor = selectedFoodColorInput ? selectedFoodColorInput.value : null;
    const randomFoodType = this.foodColors[Math.floor(Math.random() * this.foodColors.length)];
    const colorToUse = chosenColor || randomFoodType.color;

    const randomFoodSize = this.foodSizes[Math.floor(Math.random() * this.foodSizes.length)];
    
    food.style.backgroundColor = colorToUse;
    food.dataset.foodColor = colorToUse;
    food.style.width = `${randomFoodSize.size}px`;
    food.style.height = `${randomFoodSize.size}px`;
    food.dataset.growthFactor = randomFoodSize.growthFactor;
    
    // Add border for white food to make it visible
    if (colorToUse === '#ffffff') {
      food.style.border = '1px solid #666';
    }
    
    food.style.left = `${Math.random() * (this.gameArea.clientWidth - 20)}px`;
    food.style.top = `${Math.random() * (this.gameArea.clientHeight - 20) + 60}px`;
    
    this.setupFoodDragging(food);
    this.gameArea.appendChild(food);
  }

  setupFoodDragging(food) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    
    const dragStart = (e) => {
      currentX = parseFloat(food.style.left) || 0;
      currentY = parseFloat(food.style.top) || 0;
      
      if (e.type === "touchstart") {
        initialX = e.touches[0].clientX - currentX;
        initialY = e.touches[0].clientY - currentY;
      } else {
        initialX = e.clientX - currentX;
        initialY = e.clientY - currentY;
      }
      
      if (e.target === food) {
        isDragging = true;
      }
    };
    
    const drag = (e) => {
      if (isDragging) {
        e.preventDefault();
        
        if (e.type === "touchmove") {
          currentX = e.touches[0].clientX - initialX;
          currentY = e.touches[0].clientY - initialY;
        } else {
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;
        }

        food.style.left = `${currentX}px`;
        food.style.top = `${currentY}px`;
        
        this.checkFoodCollision(food);
      }
    };
    
    const dragEnd = () => {
      isDragging = false;
    };
    
    food.addEventListener("touchstart", dragStart, { passive: false });
    food.addEventListener("touchend", dragEnd, { passive: false });
    food.addEventListener("touchmove", drag, { passive: false });
    
    food.addEventListener("mousedown", dragStart, false);
    food.addEventListener("mouseup", dragEnd, false);
    food.addEventListener("mousemove", drag, false);
  }
  
  checkFoodCollision(food) {
    const foodRect = food.getBoundingClientRect();
    
    this.hairballs.forEach(hairball => {
      const hairballRect = hairball.element.getBoundingClientRect();
      
      if (this.isColliding(foodRect, hairballRect)) {
        this.feedHairball(hairball, food);
      }
    });
  }

  feedHairball(hairball, food) {
    const foodColor = food.dataset.foodColor;
    const currentColor = hairball.element.querySelector('circle').getAttribute('fill');
    const growthFactor = parseInt(food.dataset.growthFactor) || 1;

    // Only change color if allowed
    const newColor = this.allowColorChange ? this.mixColors(currentColor, foodColor) : currentColor;
    
    // Update all the colored elements of the hairball (respecting toggle)
    const circles = hairball.element.querySelectorAll('circle');
    circles.forEach(circle => {
      if (circle.getAttribute('fill') !== 'white' && 
          circle.getAttribute('fill') !== 'black') {
        circle.setAttribute('fill', newColor);
      }
    });
    
    // Update cat features only if color changes are allowed
    if (hairball instanceof CatHairball && this.allowColorChange) {
      const catFeatures = hairball.element.querySelectorAll('path');
      catFeatures.forEach(feature => {
        if (feature.getAttribute('fill') === currentColor) {
          feature.setAttribute('fill', newColor);
        }
        if (feature.getAttribute('stroke') === currentColor) {
          feature.setAttribute('stroke', newColor);
        }
      });
    }
    
    food.remove();
    // Growth is now based on the food's growth factor
    hairball.size += (2 * growthFactor);
    hairball.element.style.width = `${hairball.size}px`;
    hairball.element.style.height = `${hairball.size}px`;
  }

  isColliding(rect1, rect2) {
    return !(rect1.right < rect2.left || 
             rect1.left > rect2.right || 
             rect1.bottom < rect2.top || 
             rect1.top > rect2.bottom);
  }
  
  toggleHairballSelection(element) {
    element.classList.toggle('selected');
    const hairball = Array.from(this.hairballs).find(h => h.element === element);
    
    if (element.classList.contains('selected')) {
      this.selectedHairballs.add(hairball);
    } else {
      this.selectedHairballs.delete(hairball);
    }
  }
  
  mixSelectedHairballs() {
    if (this.selectedHairballs.size >= 2) {
      const selectedArray = Array.from(this.selectedHairballs);
      
      // Calculate average position
      const avgX = selectedArray.reduce((sum, h) => sum + parseFloat(h.element.style.left), 0) / selectedArray.length;
      const avgY = selectedArray.reduce((sum, h) => sum + parseFloat(h.element.style.top), 0) / selectedArray.length;
      
      // Mix all colors
      const colors = selectedArray.map(h => h.element.querySelector('circle').getAttribute('fill'));
      const mixedColor = this.mixMultipleColors(colors);
      
      // Create bigger hairball based on number of mixed hairballs
      const maxSize = Math.max(...selectedArray.map(h => h.size));
      const sizeIncrease = (selectedArray.length - 1) * 5; // More hairballs = bigger increase
      const newSize = maxSize + sizeIncrease;

      // Determine if result should be a cat or normal hairball
      const catCount = selectedArray.filter(h => h instanceof CatHairball).length;
      const normalCount = selectedArray.length - catCount;
      
      let mixedHairball;
      if (catCount > normalCount) {
        // More cats, result is a cat
        mixedHairball = new CatHairball(avgX, avgY, mixedColor, newSize);
      } else if (normalCount > catCount) {
        // More normal hairballs, result is normal
        mixedHairball = new Hairball(avgX, avgY, mixedColor, newSize);
      } else {
        // Equal amounts, random choice
        mixedHairball = Math.random() < 0.5 ? 
          new CatHairball(avgX, avgY, mixedColor, newSize) :
          new Hairball(avgX, avgY, mixedColor, newSize);
      }
      
      // Remove old hairballs
      selectedArray.forEach(hairball => {
        hairball.element.remove();
        this.hairballs.delete(hairball);
      });
      this.selectedHairballs.clear();
      
      // Add new hairball
      this.gameArea.appendChild(mixedHairball.element);
      this.hairballs.add(mixedHairball);
    }
  }

  splitSelectedHairballs() {
    const selectedArray = Array.from(this.selectedHairballs);
    
    if (selectedArray.length === 1) {
      // Single hairball split case
      const hairball = selectedArray[0];
      
      // Check if hairball is large enough (more than default size)
      if (hairball.size <= this.defaultHairballSize) {
        alert('Hairball must be larger than the default size to split!');
        return;
      }

      // Get original position
      const originalX = parseFloat(hairball.element.style.left);
      const originalY = parseFloat(hairball.element.style.top);
      
      // Get original color and create weighted mix with random color
      const originalColor = hairball.element.querySelector('circle').getAttribute('fill');
      const randomColor = this.foodColors[Math.floor(Math.random() * this.foodColors.length)].color;
      
      // Convert colors to RGB for weighted mixing
      const origRGB = {
        r: parseInt(originalColor.slice(1,3), 16),
        g: parseInt(originalColor.slice(3,5), 16),
        b: parseInt(originalColor.slice(5,7), 16)
      };
      
      const randRGB = {
        r: parseInt(randomColor.slice(1,3), 16),
        g: parseInt(randomColor.slice(3,5), 16),
        b: parseInt(randomColor.slice(5,7), 16)
      };
      
      // Mix colors with 70% original, 30% random
      const mixedColor = {
        r: Math.round(origRGB.r * 0.7 + randRGB.r * 0.3),
        g: Math.round(origRGB.g * 0.7 + randRGB.g * 0.3),
        b: Math.round(origRGB.b * 0.7 + randRGB.b * 0.3)
      };
      
      const weightedMixedColor = `#${mixedColor.r.toString(16).padStart(2,'0')}${mixedColor.g.toString(16).padStart(2,'0')}${mixedColor.b.toString(16).padStart(2,'0')}`;
      
      // Create new smaller hairball (75% of default size)
      const newSize = Math.round(this.defaultHairballSize * 0.75);
      
      // Determine if the new hairball should be a cat based on original
      let newHairball;
      if (hairball instanceof CatHairball) {
        newHairball = new CatHairball(
          originalX + 20,
          originalY + 20,
          weightedMixedColor,
          newSize
        );
      } else {
        newHairball = new Hairball(
          originalX + 20,
          originalY + 20,
          weightedMixedColor,
          newSize
        );
      }
      
      this.gameArea.appendChild(newHairball.element);
      this.hairballs.add(newHairball);
      
      // Shrink original hairball
      hairball.size = Math.max(this.defaultHairballSize, hairball.size - 10);
      hairball.element.style.width = `${hairball.size}px`;
      hairball.element.style.height = `${hairball.size}px`;
      hairball.element.classList.remove('selected');
      
      this.selectedHairballs.clear();
    } else if (this.selectedHairballs.size >= 2) {
      // Original multiple hairball split logic
      const allLargeEnough = selectedArray.every(h => h.size > this.defaultHairballSize);
      
      if (!allLargeEnough) {
        alert('All selected hairballs must be larger than the default size to split!');
        return;
      }

      // Calculate average position
      const avgX = selectedArray.reduce((sum, h) => sum + parseFloat(h.element.style.left), 0) / selectedArray.length;
      const avgY = selectedArray.reduce((sum, h) => sum + parseFloat(h.element.style.top), 0) / selectedArray.length;
      
      // Mix all colors
      const colors = selectedArray.map(h => h.element.querySelector('circle').getAttribute('fill'));
      const mixedColor = this.mixMultipleColors(colors);

      // Determine if result should be a cat or normal hairball (same logic as mixing)
      const catCount = selectedArray.filter(h => h instanceof CatHairball).length;
      const normalCount = selectedArray.length - catCount;
      
      let newHairball;
      if (catCount > normalCount) {
        // More cats, result is a cat
        newHairball = new CatHairball(avgX, avgY, mixedColor, this.defaultHairballSize);
      } else if (normalCount > catCount) {
        // More normal hairballs, result is normal
        newHairball = new Hairball(avgX, avgY, mixedColor, this.defaultHairballSize);
      } else {
        // Equal amounts, random choice
        newHairball = Math.random() < 0.5 ? 
          new CatHairball(avgX, avgY, mixedColor, this.defaultHairballSize) :
          new Hairball(avgX, avgY, mixedColor, this.defaultHairballSize);
      }
      
      this.gameArea.appendChild(newHairball.element);
      this.hairballs.add(newHairball);
      
      // Shrink original hairballs slightly
      selectedArray.forEach(hairball => {
        hairball.size = Math.max(this.defaultHairballSize, hairball.size - 5);
        hairball.element.style.width = `${hairball.size}px`;
        hairball.element.style.height = `${hairball.size}px`;
        hairball.element.classList.remove('selected');
      });
      
      this.selectedHairballs.clear();
    }
  }

  mixMultipleColors(colors) {
    // Convert all colors to RGB and calculate average
    const rgbColors = colors.map(color => ({
      r: parseInt(color.slice(1,3), 16),
      g: parseInt(color.slice(3,5), 16),
      b: parseInt(color.slice(5,7), 16)
    }));
    
    const avgColor = {
      r: Math.round(rgbColors.reduce((sum, c) => sum + c.r, 0) / colors.length),
      g: Math.round(rgbColors.reduce((sum, c) => sum + c.g, 0) / colors.length),
      b: Math.round(rgbColors.reduce((sum, c) => sum + c.b, 0) / colors.length)
    };
    
    return `#${avgColor.r.toString(16).padStart(2,'0')}${avgColor.g.toString(16).padStart(2,'0')}${avgColor.b.toString(16).padStart(2,'0')}`;
  }
  
  mixColors(color1, color2) {
    return this.mixMultipleColors([color1, color2]);
  }
  
  spawnCatHairball(color) {
    const x = Math.random() * (this.gameArea.clientWidth - 50);
    const y = Math.random() * (this.gameArea.clientHeight - 50) + 60;
    const catHairball = new CatHairball(x, y, color);
    this.gameArea.appendChild(catHairball.element);
    this.hairballs.add(catHairball);
  }

  shedHairball(hairball) {
    // Check if hairball is large enough
    if (hairball.size <= this.defaultHairballSize) {
      alert('Hairball must be larger than default size to shed!');
      return;
    }

    // Reduce original hairball size
    hairball.size = Math.max(this.defaultHairballSize, hairball.size - 5);
    hairball.element.style.width = `${hairball.size}px`;
    hairball.element.style.height = `${hairball.size}px`;
    hairball.element.classList.remove('selected');
    this.selectedHairballs.clear();

    // Get original color and position
    const color = hairball.element.querySelector('circle').getAttribute('fill');
    const x = parseFloat(hairball.element.style.left);
    const y = parseFloat(hairball.element.style.top);

    // Create flat hairball slightly offset
    const flatHairball = new FlatHairball(x + 20, y + 20, color);
    this.gameArea.appendChild(flatHairball.element);
    this.flatHairballs.add(flatHairball);
  }

  absorbFlatHairball(livingHairball, flatHairball) {
    // Get colors for mixing
    const flatColor = flatHairball.element.querySelector('ellipse').getAttribute('fill');
    const livingColor = livingHairball.element.querySelector('circle').getAttribute('fill');

    // Only change color if allowed
    const newColor = this.allowColorChange ? this.mixColors(livingColor, flatColor) : livingColor;

    // Update living hairball color (respect toggle)
    const circles = livingHairball.element.querySelectorAll('circle');
    circles.forEach(circle => {
      if (circle.getAttribute('fill') !== 'white' && 
          circle.getAttribute('fill') !== 'black') {
        circle.setAttribute('fill', newColor);
      }
    });

    // Update cat features if it's a cat and color changes allowed
    if (livingHairball instanceof CatHairball && this.allowColorChange) {
      const catFeatures = livingHairball.element.querySelectorAll('path');
      catFeatures.forEach(feature => {
        if (feature.getAttribute('fill') === livingColor) {
          feature.setAttribute('fill', newColor);
        }
        if (feature.getAttribute('stroke') === livingColor) {
          feature.setAttribute('stroke', newColor);
        }
      });
    }

    // Increase living hairball size
    livingHairball.size += 3;
    livingHairball.element.style.width = `${livingHairball.size}px`;
    livingHairball.element.style.height = `${livingHairball.size}px`;

    // Remove flat hairball
    flatHairball.element.remove();
    this.flatHairballs.delete(flatHairball);
  }
}

// Start the game
const game = new Game();