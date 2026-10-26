class Feesh {
  constructor(color, level = 0, isFeshie = false) {
    this.color = color;
    this.level = level;
    this.isFeshie = isFeshie;
    this.name = this.game.generateRandomName();
  }

  getSellValue() {
    return this.isFeshie ? 8 : (8 + this.level);
  }

  createSVG(size = 100) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size / 2);
    svg.setAttribute("viewBox", "0 0 100 50");

    // Body with pointy ends and skinnier shape
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M10,25 Q50,10 90,25 Q50,40 10,25");
    path.setAttribute("fill", this.color);

    // Black eye
    const eye = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    eye.setAttribute("cx", "65");
    eye.setAttribute("cy", "25");
    eye.setAttribute("r", "3");
    eye.setAttribute("fill", "black");

    svg.appendChild(path);
    svg.appendChild(eye);

    return svg;
  }

  openNameChangeModal(index) {
    this.game.openNameChangeModal(index);
  }
}

class FeeshGame {
  constructor() {
    this.initializeGame();
    this.initializeEventListeners();
    this.updateDisplay();
  }

  initializeGame() {
    this.seacoins = 20;  
    this.feeshCollection = [];
    this.selectedFeeshForBreeding = [];
    this.namingCategories = {
      firstLetterCombos: [
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 
        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
        'Sh', 'Ch', 'Th', 'Ph', 'Wh', 'Br', 'Cl', 'Cr', 'Dr', 'Fl', 'Fr', 
        'Gl', 'Gr', 'Pl', 'Pr', 'Sk', 'Sl', 'Sm', 'Sn', 'Sp', 'St', 'Tr', 
        'Custom'
      ],
      firstVowel: ['a', 'e', 'i', 'o', 'u', 'y'],
      lastLetterCombos: [
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 
        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
        'Sh', 'Ch', 'Th', 'Ph', 'Wh', 'Br', 'Cl', 'Cr', 'Dr', 'Fl', 'Fr', 
        'Gl', 'Gr', 'Pl', 'Pr', 'Sk', 'Sl', 'Sm', 'Sn', 'Sp', 'St', 'Tr', 
        'Custom'
      ],
      lastVowel: ['a', 'e', 'i', 'o', 'u', 'y']
    };
  }

  generateRandomName() {
    const firstLetterSelect = this.selectRandomLetter('firstLetterCombos');
    const firstVowel = this.namingCategories.firstVowel[Math.floor(Math.random() * this.namingCategories.firstVowel.length)];
    const lastLetterSelect = this.selectRandomLetter('lastLetterCombos');
    const lastVowel = this.namingCategories.lastVowel[Math.floor(Math.random() * this.namingCategories.lastVowel.length)];
    
    return `${this.getCapitalizedLetter(firstLetterSelect)}${firstVowel.toLowerCase()}${lastLetterSelect.toLowerCase()}${lastVowel}`;
  }

  selectRandomLetter(category) {
    const letters = this.namingCategories[category];
    const randomIndex = Math.floor(Math.random() * letters.length);
    return letters[randomIndex];
  }

  getCapitalizedLetter(letter) {
    // If 'Custom' is selected, return a random letter instead
    if (letter === 'Custom') {
      const fallbackLetters = this.namingCategories[letter.includes('first') ? 'firstLetterCombos' : 'lastLetterCombos']
        .filter(l => l !== 'Custom');
      letter = fallbackLetters[Math.floor(Math.random() * fallbackLetters.length)];
    }
    return letter.charAt(0).toUpperCase() + letter.slice(1).toLowerCase();
  }

  openNameChangeModal(index) {
    this.currentNameChangeIndex = index;
    const feesh = this.feeshCollection[index];
    
    // Create modal
    const modal = document.createElement('div');
    modal.classList.add('name-change-modal');
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Change ${feesh.name}'s Name</h2>
        <div class="name-selection">
          <div>
            <label>First Letter/Combo</label>
            <div class="letter-selector">
              <select id="first-letter-select">
                ${this.namingCategories.firstLetterCombos.map(letter => 
                  `<option value="${letter}">${letter}</option>`
                ).join('')}
              </select>
              <button class="randomize-btn" data-type="first-letter">🎲</button>
              ${this.createCustomInputHTML('first-letter')}
            </div>
          </div>
          <div>
            <label>First Vowel</label>
            <div class="letter-selector">
              <select id="first-vowel-select">
                ${this.namingCategories.firstVowel.map(vowel => 
                  `<option value="${vowel}">${vowel}</option>`
                ).join('')}
              </select>
              <button class="randomize-btn" data-type="first-vowel">🎲</button>
            </div>
          </div>
          <div>
            <label>Last Letter/Combo</label>
            <div class="letter-selector">
              <select id="last-letter-select">
                ${this.namingCategories.lastLetterCombos.map(letter => 
                  `<option value="${letter}">${letter}</option>`
                ).join('')}
              </select>
              <button class="randomize-btn" data-type="last-letter">🎲</button>
              ${this.createCustomInputHTML('last-letter')}
            </div>
          </div>
          <div>
            <label>Last Vowel</label>
            <div class="letter-selector">
              <select id="last-vowel-select">
                ${this.namingCategories.lastVowel.map(vowel => 
                  `<option value="${vowel}">${vowel}</option>`
                ).join('')}
              </select>
              <button class="randomize-btn" data-type="last-vowel">🎲</button>
            </div>
          </div>
        </div>
        <button id="confirm-name-change">Confirm</button>
        <button id="cancel-name-change">Cancel</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup event listeners for custom inputs and selects
    this.setupNameChangeModalListeners(modal);
  }

  createCustomInputHTML(type) {
    return `
      <div class="custom-input" style="display: none;">
        <input type="text" id="${type}-custom-input" maxlength="2" 
               placeholder="Custom (max 2 letters)"
               pattern="[a-zA-Z]{1,2}">
      </div>
    `;
  }

  setupNameChangeModalListeners(modal) {
    // Add randomization event listeners
    document.querySelectorAll('.randomize-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectType = btn.dataset.type;
        let targetSelect, sourceArray;
        
        switch(selectType) {
          case 'first-letter':
            targetSelect = document.getElementById('first-letter-select');
            sourceArray = this.namingCategories.firstLetterCombos;
            break;
          case 'first-vowel':
            targetSelect = document.getElementById('first-vowel-select');
            sourceArray = this.namingCategories.firstVowel;
            break;
          case 'last-letter':
            targetSelect = document.getElementById('last-letter-select');
            sourceArray = this.namingCategories.lastLetterCombos;
            break;
          case 'last-vowel':
            targetSelect = document.getElementById('last-vowel-select');
            sourceArray = this.namingCategories.lastVowel;
            break;
        }
        
        // Select a random option
        const randomIndex = Math.floor(Math.random() * sourceArray.length);
        targetSelect.value = sourceArray[randomIndex];
      });
    });

    // Custom input display logic
    const firstLetterSelect = modal.querySelector('#first-letter-select');
    const lastLetterSelect = modal.querySelector('#last-letter-select');
    const firstLetterCustomInput = modal.querySelector('#first-letter-custom-input');
    const lastLetterCustomInput = modal.querySelector('#last-letter-custom-input');

    this.setupCustomInputToggle(firstLetterSelect, firstLetterCustomInput);
    this.setupCustomInputToggle(lastLetterSelect, lastLetterCustomInput);
    
    // Add event listeners for confirm and cancel
    document.getElementById('confirm-name-change').addEventListener('click', () => {
      const firstLetter = this.getSelectedLetterValue(firstLetterSelect, firstLetterCustomInput);
      const firstVowel = document.getElementById('first-vowel-select').value;
      const lastLetter = this.getSelectedLetterValue(lastLetterSelect, lastLetterCustomInput);
      const lastVowel = document.getElementById('last-vowel-select').value;
      
      // Capitalize first letter, make second letter lowercase
      const newName = `${this.getCapitalizedLetter(firstLetter)}${firstVowel.toLowerCase()}${lastLetter.toLowerCase()}${lastVowel}`;
      
      this.feeshCollection[this.currentNameChangeIndex].name = newName;
      
      document.body.removeChild(modal);
      this.updateDisplay();
    });
    
    document.getElementById('cancel-name-change').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  setupCustomInputToggle(select, customInput) {
    const customInputDiv = customInput.closest('.custom-input');
    select.addEventListener('change', () => {
      if (select.value === 'Custom') {
        customInputDiv.style.display = 'block';
      } else {
        customInputDiv.style.display = 'none';
      }
    });
  }

  getSelectedLetterValue(select, customInput) {
    if (select.value === 'Custom') {
      // Validate custom input
      const customValue = customInput.value.trim();
      return customValue.length > 0 && customValue.length <= 2 ? customValue : select.options[1].value;
    }
    return select.value;
  }

  initializeEventListeners() {
    const buyFeeshBtn = document.getElementById('buy-feesh-btn');
    const breedBtn = document.getElementById('breed-btn');
    const restartBtn = document.getElementById('restart-btn');
    
    if (buyFeeshBtn) {
      buyFeeshBtn.addEventListener('click', () => this.buyFeesh());
    }
    
    if (breedBtn) {
      breedBtn.addEventListener('click', () => this.breedFeesh());
    }
    
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restartGame());
    }
  }
  
  restartGame() {
    // Confirm restart
    const confirmRestart = confirm('Are you sure you want to restart the game? All progress will be lost.');
    
    if (confirmRestart) {
      // Reset game state
      this.initializeGame();
      this.updateDisplay();
    }
  }
  
  buyFeesh() {
    if (this.seacoins >= 5) {
      const randomColor = this.generateRandomColor();
      const newFeesh = new Feesh(randomColor);
      this.feeshCollection.push(newFeesh);
      this.seacoins -= 5;
      this.updateDisplay();
    }
  }
  
  breedFeesh() {
    if (this.selectedFeeshForBreeding.length === 2 && this.seacoins >= 3) {
      const parent1 = this.selectedFeeshForBreeding[0];
      const parent2 = this.selectedFeeshForBreeding[1];
      
      // New naming logic for Feshies with no repeating letters
      const firstLetter = parent1.name.substring(0, 2);  // Take first 2 chars for first letter/combo
      const firstVowel = this.extractFirstVowel(parent1.name);
      const lastLetter = parent2.name.substring(parent2.name.length - 2);  // Take last 2 chars for last letter/combo
      const lastVowel = this.extractLastVowel(parent2.name);
      
      // Remove repeating letters
      let babyName = this.removeRepeatingLetters(`${firstLetter}${firstVowel}${lastLetter.toLowerCase()}${lastVowel}`);
      
      const parentColor1 = parent1.color;
      const parentColor2 = parent2.color;
      const babyColor = this.mixColors(parentColor1, parentColor2);
      
      const babyFeesh = new Feesh(babyColor, 0, true);
      babyFeesh.name = babyName;  // Override the randomly generated name
      
      this.feeshCollection.push(babyFeesh);
      this.seacoins -= 3;
      
      this.selectedFeeshForBreeding = [];
      this.updateDisplay();
    }
  }

  removeRepeatingLetters(name) {
    // Convert to lowercase for comparison
    let processedName = name.toLowerCase();
    let uniqueLetters = [];
    let finalName = '';

    for (let char of processedName) {
      if (!uniqueLetters.includes(char)) {
        uniqueLetters.push(char);
        finalName += char;
      }
    }

    // Capitalize first letter
    return finalName.charAt(0).toUpperCase() + finalName.slice(1);
  }

  extractFirstVowel(name) {
    const vowels = ['a', 'e', 'i', 'o', 'u', 'y'];
    for (let char of name.toLowerCase()) {
      if (vowels.includes(char)) {
        return char;
      }
    }
    return 'a';  // Default to 'a' if no vowel found
  }

  extractLastVowel(name) {
    const vowels = ['a', 'e', 'i', 'o', 'u', 'y'];
    for (let i = name.length - 1; i >= 0; i--) {
      if (vowels.includes(name[i].toLowerCase())) {
        return name[i].toLowerCase();
      }
    }
    return 'a';  // Default to 'a' if no vowel found
  }

  createFeeshActions(feesh, index) {
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('feesh-actions');
    
    const sellBtn = document.createElement('button');
    sellBtn.textContent = `Sell (${feesh.getSellValue()} Seacoins)`;
    sellBtn.classList.add('sell-btn');
    sellBtn.addEventListener('click', () => this.sellFeesh(index));
    
    // Disable sell button if total feesh count is less than 3
    if (this.feeshCollection.length < 3) {
      sellBtn.disabled = true;
    }
    
    const feedBtn = document.createElement('button');
    feedBtn.textContent = 'Feed (3 Seacoins)';
    feedBtn.classList.add('feed-btn');
    feedBtn.addEventListener('click', () => this.feedFeesh(index));
    
    // Disable feed button only if not enough seacoins
    if (this.seacoins < 3) {
      feedBtn.disabled = true;
    }
    
    actionsDiv.appendChild(sellBtn);
    actionsDiv.appendChild(feedBtn);
    
    return actionsDiv;
  }
  
  sellFeesh(index) {
    // Only allow selling if there are at least 3 Feesh
    if (this.feeshCollection.length >= 3) {
      const feesh = this.feeshCollection[index];
      this.seacoins += feesh.getSellValue();
      this.feeshCollection.splice(index, 1);
      this.updateDisplay();
    }
  }
  
  feedFeesh(index) {
    const feesh = this.feeshCollection[index];
    // Allow feeding if seacoins >= 3, and either it's a regular Feesh or a Feshie
    if (this.seacoins >= 3) {
      if (feesh.isFeshie) {
        // Transform Feshie into a regular Feesh
        feesh.isFeshie = false;
        feesh.level = 0;
      } else {
        // Regular Feesh leveling up
        feesh.level++;
      }
      this.seacoins -= 3;
      this.updateDisplay();
    }
  }
  
  updateDisplay() {
    const feeshList = document.getElementById('feesh-list');
    const breedSelection = document.getElementById('breed-selection');
    const seacoinCount = document.getElementById('seacoin-count');
    const breedBtn = document.getElementById('breed-btn');
    
    if (!feeshList || !breedSelection || !seacoinCount || !breedBtn) {
      console.error('One or more required DOM elements are missing');
      return;
    }
    
    // Clear existing displays
    feeshList.innerHTML = '';
    breedSelection.innerHTML = '';
    
    // Display Feesh collection
    this.feeshCollection.forEach((feesh, index) => {
      const feeshEl = document.createElement('div');
      feeshEl.classList.add('feesh');
      feeshEl.dataset.index = index;  // Add data attribute to help with selection
      
      // Add Feshie class for smaller size
      if (feesh.isFeshie) {
        feeshEl.classList.add('feshie');
      }
      
      // Create SVG Feesh
      const feeshSvg = feesh.createSVG(feesh.isFeshie ? 70 : 100);
      feeshEl.appendChild(feeshSvg);
      
      // Add level text (only for non-Feshies)
      if (!feesh.isFeshie) {
        const levelText = document.createElement('div');
        levelText.textContent = `Lvl ${feesh.level}`;
        feeshEl.appendChild(levelText);
      }
      
      // Add name display
      const nameDiv = document.createElement('div');
      nameDiv.textContent = feesh.name;
      feeshEl.appendChild(nameDiv);
      
      // Add name change button
      const changeNameBtn = document.createElement('button');
      changeNameBtn.textContent = 'Change Name';
      changeNameBtn.addEventListener('click', () => feesh.openNameChangeModal(index));
      feeshEl.appendChild(changeNameBtn);
      
      // Add action buttons
      const actionsDiv = this.createFeeshActions(feesh, index);
      feeshEl.appendChild(actionsDiv);
      
      feeshEl.addEventListener('click', () => this.selectFeeshForBreeding(index));
      feeshList.appendChild(feeshEl);
      
      // Reapply selected state if needed
      if (this.selectedFeeshForBreeding.includes(feesh)) {
        feeshEl.classList.add('feesh-selected');
      }
    });
    
    // Update seacoins
    seacoinCount.textContent = this.seacoins;
    
    // Enable/disable breed button
    breedBtn.disabled = !(this.selectedFeeshForBreeding.length === 2 && this.seacoins >= 3);
  }
  
  selectFeeshForBreeding(index) {
    // Ensure index is valid
    if (index < 0 || index >= this.feeshCollection.length) {
      console.error('Invalid feesh index');
      return;
    }
    
    const feesh = this.feeshCollection[index];
    const feeshEls = document.querySelectorAll('.feesh');
    
    if (this.selectedFeeshForBreeding.includes(feesh)) {
      // Deselect if already selected
      this.selectedFeeshForBreeding = this.selectedFeeshForBreeding.filter(f => f !== feesh);
      feeshEls[index].classList.remove('feesh-selected');
    } else if (this.selectedFeeshForBreeding.length < 2) {
      // Select if less than 2 are already selected
      this.selectedFeeshForBreeding.push(feesh);
      feeshEls[index].classList.add('feesh-selected');
    }
    
    this.updateDisplay();
  }
  
  generateRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r},${g},${b})`;
  }
  
  mixColors(color1, color2) {
    const rgb1 = color1.match(/\d+/g).map(Number);
    const rgb2 = color2.match(/\d+/g).map(Number);
    
    const mixedRgb = rgb1.map((val, i) => Math.floor((val + rgb2[i]) / 2));
    return `rgb(${mixedRgb[0]},${mixedRgb[1]},${mixedRgb[2]})`;
  }
}

// Initialize the game
window.addEventListener('DOMContentLoaded', () => {
  const game = new FeeshGame();
  // Assign game to Feesh prototype to allow name generation
  Feesh.prototype.game = game;
  window.game = game;
});