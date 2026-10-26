import { translations } from './translations.js';

class DentistGame {
  constructor() {
    this.selectedTool = null;
    this.teethContainer = document.getElementById('teeth-container');
    this.isInteracting = false;
    this.currentLanguage = 'en';
    this.setupLanguageSelector();
    this.setupTools();
    this.initializeTeeth();
    this.setupDragHandling();
    this.setupKeyboardControls();
    this.setupLabelToggle();
  }

  setupLanguageSelector() {
    const languageSelect = document.getElementById('language-select');
    languageSelect.addEventListener('change', (e) => {
      this.currentLanguage = e.target.value;
      this.updateLabels();
    });
  }

  updateLabels() {
    const toolLabels = document.querySelectorAll('.tool-label');
    toolLabels.forEach(label => {
      const originalText = label.getAttribute('data-original-text') || label.textContent;
      label.setAttribute('data-original-text', originalText);
      // Check if translation exists before using it
      const translation = translations[this.currentLanguage]?.[originalText];
      if (translation) {
        label.textContent = translation;
      }
    });

    // Update toggle button text
    const toggleButton = document.getElementById('toggle-labels');
    const showNames = translations[this.currentLanguage]?.["Show Names"] || "Show Names";
    const hideNames = translations[this.currentLanguage]?.["Hide Names"] || "Hide Names";
    toggleButton.textContent = toggleButton.textContent === "Show Names" ? showNames : hideNames;
  }

  setupTools() {
    const tools = document.querySelectorAll('.tool');
    tools.forEach(tool => {
      tool.addEventListener('click', () => {
        if (tool.dataset.tool === 'restart') {
          this.initializeTeeth();
          return;
        }
        tools.forEach(t => t.classList.remove('selected'));
        tool.classList.add('selected');
        this.selectedTool = tool.dataset.tool;
      });
    });
  }

  setupKeyboardControls() {
    // Add keyboard navigation
    let currentFocus = -1;
    const teeth = this.teethContainer.getElementsByClassName('tooth');
    
    document.addEventListener('keydown', (e) => {
      if (!teeth.length) return;
      
      switch(e.key) {
        case 'ArrowRight':
          currentFocus = (currentFocus < 0) ? 0 : Math.min(currentFocus + 1, teeth.length - 1);
          this.focusTooth(teeth[currentFocus]);
          break;
        case 'ArrowLeft':
          currentFocus = (currentFocus < 0) ? teeth.length - 1 : Math.max(currentFocus - 1, 0);
          this.focusTooth(teeth[currentFocus]);
          break;
        case 'Enter':
        case ' ':
          if (currentFocus >= 0) {
            this.handleToothClick(teeth[currentFocus]);
          }
          break;
        // Number keys 1-9 for tool selection
        default:
          if (/^[1-9]$/.test(e.key)) {
            const toolIndex = parseInt(e.key) - 1;
            const tools = document.querySelectorAll('.tool');
            if (tools[toolIndex]) {
              tools.forEach(t => t.classList.remove('selected'));
              tools[toolIndex].classList.add('selected');
              this.selectedTool = tools[toolIndex].dataset.tool;
            }
          }
      }
    });

    // Remove initial focus setup - only focus when keyboard is used
  }

  focusTooth(tooth) {
    // Remove focus from all teeth
    const teeth = this.teethContainer.getElementsByClassName('tooth');
    Array.from(teeth).forEach(t => {
      t.classList.remove('focused');
      t.setAttribute('tabindex', '-1');
    });
    
    // Add focus to current tooth
    if (tooth) {
      tooth.classList.add('focused');
      tooth.setAttribute('tabindex', '0');
      tooth.focus();
    }
  }

  setupDragHandling() {
    // Mouse events with proper event handling
    this.teethContainer.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent text selection
      this.isInteracting = true;
      const tooth = e.target.closest('.tooth');
      if (tooth) {
        this.handleToothClick(tooth);
      }
    });

    document.addEventListener('mouseup', () => {
      this.isInteracting = false;
    });

    this.teethContainer.addEventListener('mousemove', (e) => {
      if (this.isInteracting) {
        const tooth = e.target.closest('.tooth');
        if (tooth) {
          this.handleToothClick(tooth);
        }
      }
    });

    // Touch events with proper event handling
    this.teethContainer.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isInteracting = true;
      const touch = e.touches[0];
      const tooth = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tooth');
      if (tooth) {
        this.handleToothClick(tooth);
      }
    }, { passive: false });

    this.teethContainer.addEventListener('touchmove', (e) => {
      if (this.isInteracting) {
        e.preventDefault();
        const touch = e.touches[0];
        const tooth = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tooth');
        if (tooth) {
          this.handleToothClick(tooth);
        }
      }
    }, { passive: false });

    document.addEventListener('touchend', () => {
      this.isInteracting = false;
    });

    // Gamepad support with improved polling
    let gamepadInterval;
    window.addEventListener("gamepadconnected", (e) => {
      console.log("Gamepad connected:", e.gamepad);
      gamepadInterval = setInterval(() => {
        const gamepad = navigator.getGamepads()[e.gamepad.index];
        if (gamepad) {
          this.handleGamepadInput(gamepad);
        }
      }, 16); // ~60fps polling
    });

    window.addEventListener("gamepaddisconnected", (e) => {
      console.log("Gamepad disconnected:", e.gamepad);
      if (gamepadInterval) {
        clearInterval(gamepadInterval);
      }
    });
  }

  handleGamepadInput(gamepad) {
    // A button for interaction
    if (gamepad.buttons[0].pressed) {
      this.isInteracting = true;
      const hoveredElement = document.querySelector('.tooth.focused') || document.querySelector(':hover');
      if (hoveredElement?.closest('.tooth')) {
        this.handleToothClick(hoveredElement.closest('.tooth'));
      }
    } else {
      this.isInteracting = false;
    }

    // D-pad or analog stick navigation
    const teeth = this.teethContainer.getElementsByClassName('tooth');
    const currentFocus = Array.from(teeth).findIndex(tooth => tooth.classList.contains('focused'));
    
    if (gamepad.axes[0] > 0.5 || gamepad.buttons[15]?.pressed) { // Right
      const nextIndex = Math.min(currentFocus + 1, teeth.length - 1);
      this.focusTooth(teeth[nextIndex]);
    } else if (gamepad.axes[0] < -0.5 || gamepad.buttons[14]?.pressed) { // Left
      const prevIndex = Math.max(currentFocus - 1, 0);
      this.focusTooth(teeth[prevIndex]);
    }
  }

  getRandomColor() {
    const colors = [
      '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', 
      '#ffeb99', 
      '#ffe066', 
      '#ffd700', 
      '#ffcc00', 
      '#e6b800', 
      '#d4b483', 
      '#c19a6b', 
      '#8b4513', 
      '#654321', 
      '#5c4033', 
      '#964b00', 
      '#a0522d', 
      '#6b4423', 
      '#ffa07a', 
      '#ff7f50', 
      '#ff8c00', 
      '#ff6b35', 
      '#e67300', 
      '#97a663', 
      '#c7c729', 
      '#a1b56c', 
      '#739959', 
      '#527047', 
      '#8da07a', 
      '#87a96b', 
      '#6b8e23', 
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  createTooth() {
    const tooth = document.createElement('div');
    tooth.className = 'tooth';
    
    const rand = Math.random();
    if (rand < 0.2) { // 20% chance for empty
      tooth.classList.add('empty');
      tooth.style.backgroundColor = 'transparent';
    } else {
      // Add bacteria to 40% of non-empty teeth
      if (Math.random() < 0.4) {
        const bacteriaCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < bacteriaCount; i++) {
          const bacteria = document.createElement('div');
          bacteria.className = 'bacteria';
          bacteria.textContent = '🦠';
          tooth.appendChild(bacteria);
        }
      }
      
      // Regular tooth
      tooth.style.backgroundColor = this.getRandomColor();
      
      // 25% chance for cavities
      if (Math.random() < 0.25) {
        const numCavities = Math.floor(Math.random() * 5) + 1;
        for (let i = 0; i < numCavities; i++) {
          const cavity = document.createElement('div');
          cavity.className = 'cavity';
          // 30% chance for green cavity with glow
          if (Math.random() < 0.3) {
            cavity.style.backgroundColor = 'rgba(34, 139, 34, 0.7)';
            cavity.classList.add('green-glow');
          } else {
            const brownShades = [
              'rgba(139, 69, 19, 0.7)',
              'rgba(160, 82, 45, 0.7)',
              'rgba(165, 42, 42, 0.7)',
              'rgba(128, 70, 27, 0.7)',
              'rgba(101, 67, 33, 0.7)',
            ];
            cavity.style.backgroundColor = brownShades[Math.floor(Math.random() * brownShades.length)];
          }
          tooth.appendChild(cavity);
        }
      }

      // 30% chance for damage
      if (Math.random() < 0.3) {
        if (Math.random() < 0.5) { 
          const hole = document.createElement('div');
          hole.className = 'hole';
          tooth.appendChild(hole);
        } else {
          const crack = document.createElement('div');
          crack.className = 'crack';
          const orientations = ['diagonal', 'reverse-diagonal', 'vertical'];
          crack.classList.add(orientations[Math.floor(Math.random() * orientations.length)]);
          tooth.appendChild(crack);
        }
      }
      
      // 20% chance for crooked tooth
      if (Math.random() < 0.2) {
        tooth.classList.add('crooked');
        // 50% chance for left or right tilt
        if (Math.random() < 0.5) {
          tooth.classList.add('left-tilt');
        }
      }
    }

    // Add green glow effect to some teeth
    if (Math.random() < 0.2 && !tooth.classList.contains('empty')) {
      tooth.classList.add('green-glow-effect');
    }

    tooth.addEventListener('click', () => this.handleToothClick(tooth));
    return tooth;
  }

  initializeTeeth() {
    this.teethContainer.innerHTML = '';
    
    // 15% chance that all teeth will be braced
    const allBraced = Math.random() < 0.15;
    
    for (let i = 0; i < 9; i++) {
      const tooth = this.createTooth();
      
      // If allBraced is true, add braces to non-empty teeth
      if (allBraced && !tooth.classList.contains('empty')) {
        tooth.classList.add('braced');
        // Remove any crooked classes when braced
        tooth.classList.remove('crooked', 'left-tilt');
      } else if (!tooth.classList.contains('empty') && Math.random() < 0.1) {
        // 10% chance for individual braces if not all-braced
        tooth.classList.add('braced');
        // Remove any crooked classes when braced
        tooth.classList.remove('crooked', 'left-tilt');
      }
      
      this.teethContainer.appendChild(tooth);
    }
  }

  handleToothClick(tooth) {
    if (!this.selectedTool) return;

    const isMetallic = tooth.classList.contains('silver') || 
                      tooth.classList.contains('gold') || 
                      tooth.classList.contains('bronze');
    const isRandomMetallic = tooth.classList.contains('random-silver') || 
                            tooth.classList.contains('random-gold') || 
                            tooth.classList.contains('random-bronze');

    switch (this.selectedTool) {
      case 'random':
        // Clear existing state regardless of empty status
        tooth.innerHTML = '';
        tooth.className = 'tooth';
        tooth.style.backgroundColor = this.getRandomColor();
        
        // Random chance for various effects
        if (Math.random() < 0.3) { // 30% chance for damage
          if (Math.random() < 0.5) {
            const hole = document.createElement('div');
            hole.className = 'hole';
            tooth.appendChild(hole);
          } else {
            const crack = document.createElement('div');
            crack.className = 'crack';
            const orientations = ['diagonal', 'reverse-diagonal', 'vertical'];
            crack.classList.add(orientations[Math.floor(Math.random() * orientations.length)]);
            tooth.appendChild(crack);
          }
        }

        if (Math.random() < 0.25) { // 25% chance for cavities
          const numCavities = Math.floor(Math.random() * 5) + 1;
          for (let i = 0; i < numCavities; i++) {
            const cavity = document.createElement('div');
            cavity.className = 'cavity';
            if (Math.random() < 0.3) {
              cavity.style.backgroundColor = 'rgba(34, 139, 34, 0.7)';
              cavity.classList.add('green-glow');
            } else {
              const brownShades = [
                'rgba(139, 69, 19, 0.7)',
                'rgba(160, 82, 45, 0.7)',
                'rgba(165, 42, 42, 0.7)',
                'rgba(128, 70, 27, 0.7)',
                'rgba(101, 67, 33, 0.7)',
              ];
              cavity.style.backgroundColor = brownShades[Math.floor(Math.random() * brownShades.length)];
            }
            tooth.appendChild(cavity);
          }
        }

        if (Math.random() < 0.2) { // 20% chance for bacteria
          const bacteriaCount = Math.floor(Math.random() * 3) + 1;
          for (let i = 0; i < bacteriaCount; i++) {
            const bacteria = document.createElement('div');
            bacteria.className = 'bacteria';
            bacteria.textContent = '🦠';
            tooth.appendChild(bacteria);
          }
        }

        if (Math.random() < 0.2) { // 20% chance for crooked
          tooth.classList.add('crooked');
          if (Math.random() < 0.5) {
            tooth.classList.add('left-tilt');
          }
        }

        if (Math.random() < 0.2) { // 20% chance for braces
          tooth.classList.add('braced');
        }

        if (Math.random() < 0.2) { // 20% chance for green glow
          tooth.classList.add('green-glow-effect');
        }

        // 15% chance for empty tooth
        if (Math.random() < 0.15) {
          tooth.innerHTML = '';
          tooth.className = 'tooth empty';
          tooth.style.backgroundColor = 'transparent';
          tooth.style.background = '';
        }
        break;

      case 'color-random':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          // Only change the color, preserve all other properties
          tooth.style.backgroundColor = this.getRandomColor();
          
          // If the tooth was shiny, maintain the gradient effect
          if (tooth.classList.contains('shiny')) {
            const color = tooth.style.backgroundColor;
            const lightenedColor = this.lightenColor(color, 30);
            tooth.style.background = `linear-gradient(45deg, ${color}, ${lightenedColor})`;
          }
        }
        break;

      case 'normal':
        if (tooth.classList.contains('empty')) {
          tooth.classList.remove('empty', 'silver', 'gold', 'bronze');
          tooth.style.backgroundColor = '#ffffff';
          tooth.style.background = '#ffffff';
        }
        break;

      case 'brush':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          tooth.style.backgroundColor = '#ffffff';
        }
        break;
      
      case 'hammer':
        tooth.innerHTML = '';
        tooth.style.backgroundColor = 'transparent';
        tooth.style.background = '';
        tooth.classList.remove('silver', 'gold', 'bronze', 'random-silver', 'random-gold', 'random-bronze', 'shiny');
        tooth.classList.add('empty');
        break;
      
      case 'silver':
        if (tooth.classList.contains('empty')) {
          tooth.classList.remove('empty', 'gold', 'bronze');
          tooth.classList.add('silver');
          tooth.style.backgroundColor = '#c0c0c0';
        }
        break;
      
      case 'gold':
        if (tooth.classList.contains('empty')) {
          tooth.classList.remove('empty', 'silver', 'bronze');
          tooth.classList.add('gold');
          tooth.style.backgroundColor = '#ffd700';
        }
        break;
      
      case 'bronze':
        if (tooth.classList.contains('empty')) {
          tooth.classList.remove('empty', 'silver', 'gold');
          tooth.classList.add('bronze');
          tooth.style.backgroundColor = '#cd7f32';
        }
        break;
      
      case 'water':
        const waterBacteria = tooth.getElementsByClassName('bacteria');
        while (waterBacteria.length > 0) {
          waterBacteria[0].remove();
        }
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20);
        }
        break;
      
      case 'blood':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          const darkerColor = this.makeColorDarker(color);
          tooth.style.backgroundColor = darkerColor;
        }
        break;
      
      case 'syringe':
        if (!isMetallic) {
          const hole = tooth.querySelector('.hole');
          const crack = tooth.querySelector('.crack');
          if (hole) {
            hole.remove();
          }
          if (crack) {
            crack.remove();
          }
        }
        break;

      case 'shine':
        if (!tooth.classList.contains('empty')) {
          const color = tooth.style.backgroundColor;
          const lightenedColor = this.lightenColor(color, 30);
          tooth.style.background = `linear-gradient(45deg, ${color}, ${lightenedColor})`;
          tooth.classList.add('shiny');
        }
        break;

      case 'heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#ff0000');
        }
        break;

      case 'orange-heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#ff8c00');
        }
        break;

      case 'yellow-heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#ffff00');
        }
        break;

      case 'green-heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#00ff00');
        }
        break;

      case 'blue-heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#0000ff');
        }
        break;

      case 'purple-heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#800080');
        }
        break;

      case 'brown-heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#8b4513');
        }
        break;

      case 'pink-heart':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 20, '#ff69b4');  
        }
        break;

      case 'single-brace':
        if (!tooth.classList.contains('empty')) {
          tooth.classList.add('braced');
          if (tooth.classList.contains('crooked')) {
            tooth.classList.remove('crooked', 'left-tilt');
            tooth.style.transform = ''; // Reset rotation
          }
        }
        break;

      case 'all-braces':
        const allTeeth = this.teethContainer.getElementsByClassName('tooth');
        Array.from(allTeeth).forEach(t => {
          if (!t.classList.contains('empty')) {
            t.classList.add('braced');
            if (t.classList.contains('crooked')) {
              t.classList.remove('crooked', 'left-tilt');
              t.style.transform = ''; // Reset rotation
            }
          }
        });
        break;

      case 'cut-brace':
        if (!tooth.classList.contains('empty')) {
          tooth.classList.remove('braced');
        }
        break;

      case 'cavity-remover':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          const cavities = tooth.getElementsByClassName('cavity');
          while (cavities.length > 0) {
            cavities[0].remove();
          }
        }
        break;

      case 'root-canal':
        const rootCanalBacteria = tooth.getElementsByClassName('bacteria');
        while (rootCanalBacteria.length > 0) {
          rootCanalBacteria[0].remove();
        }
        if (!tooth.classList.contains('empty') && !isMetallic && !tooth.querySelector('.root-canal')) {
          const root = document.createElement('div');
          root.className = 'root-canal';
          
          // Add pulsing effect
          setTimeout(() => {
            root.classList.add('root-canal-active');
          }, 500);
          
          tooth.appendChild(root);
          
          // Remove any cavities
          const cavities = tooth.getElementsByClassName('cavity');
          while (cavities.length > 0) {
            cavities[0].remove();
          }
          
          // Remove any cracks or holes
          const cracks = tooth.getElementsByClassName('crack');
          const holes = tooth.getElementsByClassName('hole');
          while (cracks.length > 0) cracks[0].remove();
          while (holes.length > 0) holes[0].remove();
          
          // Gradually whiten the tooth
          const currentColor = tooth.style.backgroundColor;
          tooth.style.transition = 'background-color 0.5s ease-in-out';
          setTimeout(() => {
            tooth.style.backgroundColor = this.lightenColor(currentColor, 70);
          }, 300);
        }
        break;

      case 'razor':
        if (!tooth.classList.contains('empty') && !isMetallic) {
          // Remove cavities
          const cavities = tooth.getElementsByClassName('cavity');
          while (cavities.length > 0) {
            cavities[0].remove();
          }
          
          // Whiten the tooth slightly
          const color = tooth.style.backgroundColor;
          tooth.style.backgroundColor = this.lightenColor(color, 25);
        }
        break;

      case 'flashlight':
        tooth.classList.add('flashlight-active');
        // Remove the active class after 2 seconds
        setTimeout(() => {
          tooth.classList.remove('flashlight-active');
        }, 2000);
        break;

      case 'bacteria-remover':
        const bacteria = tooth.getElementsByClassName('bacteria');
        while (bacteria.length > 0) {
          bacteria[0].remove();
        }
        break;

      case 'breath':
        if (!tooth.classList.contains('empty')) {
          tooth.classList.remove('green-glow-effect');
          const cavities = tooth.getElementsByClassName('cavity');
          Array.from(cavities).forEach(cavity => {
            cavity.classList.remove('green-glow');
          });
        }
        break;

      default:
        break;
    }
  }

  makeColorDarker(color) {
    // Extract RGB values
    const rgb = color.match(/\d+/g).map(Number);
    
    // Darken each component by reducing its value by 20%
    const darkerRgb = rgb.map(value => {
      return Math.max(0, value - (value * 0.2));
    });
    
    return `rgb(${Math.round(darkerRgb[0])},${Math.round(darkerRgb[1])},${Math.round(darkerRgb[2])})`;
  }

  lightenColor(color, amount, baseColor) {
    // If color is in rgba/rgb format or a color name
    if (color.startsWith('rgb')) {
      const rgb = color.match(/\d+/g).map(Number);
      const baseRgb = this.hexToRgb(baseColor || '#ffffff');
      
      const adjustedRgb = rgb.map((value, index) => {
        const baseValue = baseRgb[index];
        const adjusted = value + (baseValue - value) * (amount / 100);
        return Math.min(255, Math.max(0, adjusted));
      });
      
      return `rgb(${adjustedRgb.join(',')})`;
    }
    
    // Default fallback
    return color;
  }

  darkenColor(color, amount) {
    return this.lightenColor(color, -amount);
  }

  hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Parse hex to RGB
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    
    return [r, g, b];
  }

  adjustColor(color, amount) {
    const rgb = color.match(/\d+/g).map(Number);
    const adjustedRgb = rgb.map(value => {
      const adjusted = value + amount;
      return Math.min(255, Math.max(0, adjusted));
    });
    return `rgb(${adjustedRgb.join(',')})`;
  }

  setupLabelToggle() {
    const toolsContainer = document.getElementById('tools');
    const toggleButton = document.getElementById('toggle-labels');
    
    toggleButton.addEventListener('click', () => {
      toolsContainer.classList.toggle('show-labels');
      const isShowing = toolsContainer.classList.contains('show-labels');
      const newText = isShowing ? 
        translations[this.currentLanguage]["Hide Names"] : 
        translations[this.currentLanguage]["Show Names"];
      toggleButton.textContent = newText;
    });
  }

}

new DentistGame();