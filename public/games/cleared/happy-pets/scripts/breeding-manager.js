import { HappyThing } from './happy-thing.js';

export class BreedingManager {
  constructor(game) {
    this.game = game;
    this.breedingSlots = [
      document.getElementById('breeding-slot-1'),
      document.getElementById('breeding-slot-2')
    ];
    this.breedBtn = document.getElementById('breed-btn');
    this.selectedThings = [null, null];
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.breedBtn.addEventListener('click', () => this.breed());
  }

  checkBreedingSlot(thing, rect) {
    let foundSlot = false;
    for (let i = 0; i < this.breedingSlots.length; i++) {
      const slotRect = this.breedingSlots[i].getBoundingClientRect();
      if (this.isOverlapping(rect, slotRect)) {
        // Remove thing from other slot if it was there
        const otherSlot = (i + 1) % 2;
        if (this.selectedThings[otherSlot] === thing) {
          this.selectedThings[otherSlot] = null;
        }
        this.selectedThings[i] = thing;
        foundSlot = true;
        break;
      }
    }
    
    // If the thing wasn't placed in any slot, remove it from both slots
    if (!foundSlot) {
      if (this.selectedThings[0] === thing) this.selectedThings[0] = null;
      if (this.selectedThings[1] === thing) this.selectedThings[1] = null;
    }
    
    this.updateBreedingUI();
    return foundSlot;
  }

  updateBreedingUI() {
    const bothSlotsOccupied = this.selectedThings[0] && this.selectedThings[1];
    const bothMature = bothSlotsOccupied && 
                      this.selectedThings[0].sizeLevel >= 5 && 
                      this.selectedThings[1].sizeLevel >= 5;
    
    this.breedBtn.classList.toggle('hidden', !bothMature);
  }

  breed() {
    if (!this.selectedThings[0] || !this.selectedThings[1]) return;
    if (this.selectedThings[0].sizeLevel < 5 || this.selectedThings[1].sizeLevel < 5) return;

    const parent1 = this.selectedThings[0];
    const parent2 = this.selectedThings[1];
    
    // Generate a random ratio between 0 and 1
    // This will determine how much each parent's traits are inherited
    const mixRatio = Math.random();
    
    // Mix the colors based on the ratio
    const babyColor = this.mixColors(parent1.color, parent2.color, mixRatio);
    const babyPatternColor = this.mixColors(parent1.patternColor, parent2.patternColor, mixRatio);
    
    const baby = new HappyThing({
      color: babyColor,
      patternColor: babyPatternColor,
      hasPattern: Math.random() > 0.3,
      size: 30
    });

    this.game.addHappyThing(baby);
    
    // Reset breeding zone
    this.selectedThings = [null, null];
    this.updateBreedingUI();
  }

  mixColors(color1, color2, ratio) {
    try {
      const hsl1 = this.parseHSL(color1);
      const hsl2 = this.parseHSL(color2);
      
      // Handle color wrapping for hue
      let h1 = hsl1.h;
      let h2 = hsl2.h;
      
      // Ensure we take the shortest path around the color wheel
      if (Math.abs(h2 - h1) > 180) {
        if (h2 > h1) {
          h1 += 360;
        } else {
          h2 += 360;
        }
      }
      
      // If ratio < 0.5, color will be closer to parent1
      // If ratio > 0.5, color will be closer to parent2
      // If ratio = 0.5, color will be exactly in between
      const h = (h1 + (h2 - h1) * ratio) % 360;
      const s = hsl1.s + (hsl2.s - hsl1.s) * ratio;
      const l = hsl1.l + (hsl2.l - hsl1.l) * ratio;
      
      return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    } catch (e) {
      // Fallback in case of parsing errors
      return `hsl(${Math.round(Math.random() * 360)}, 70%, 50%)`;
    }
  }

  parseHSL(color) {
    try {
      // Handle both space and comma-separated formats
      const matches = color.match(/hsl\((\d+)[,\s]+(\d+)%[,\s]+(\d+)%\)/);
      if (!matches) {
        throw new Error('Invalid HSL format');
      }
      return {
        h: parseInt(matches[1]),
        s: parseInt(matches[2]),
        l: parseInt(matches[3])
      };
    } catch (e) {
      // Return default values if parsing fails
      return {
        h: Math.round(Math.random() * 360),
        s: 70,
        l: 50
      };
    }
  }

  isOverlapping(rect1, rect2) {
    return !(rect1.right < rect2.left || 
             rect1.left > rect2.right || 
             rect1.bottom < rect2.top || 
             rect1.top > rect2.bottom);
  }
}