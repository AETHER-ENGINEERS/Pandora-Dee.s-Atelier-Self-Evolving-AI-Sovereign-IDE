import { HappyThing } from './happy-thing.js';
import { AdoptionManager } from './adoption-manager.js';
import { BreedingManager } from './breeding-manager.js';
import { DragManager } from './drag-manager.js';

class Game {
  constructor() {
    this.happyThings = [];
    this.dragManager = new DragManager();
    this.adoptionManager = new AdoptionManager(this);
    this.breedingManager = new BreedingManager(this);
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('adopt-btn').addEventListener('click', () => {
      this.adoptionManager.showAdoptionRoom();
    });

    document.getElementById('spawn-food').addEventListener('click', () => {
      this.spawnFood();
    });

    document.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('happy-thing')) {
        const thing = this.happyThings.find(t => t.element === e.target);
        if (thing) {
          this.breedingManager.checkBreedingSlot(thing, e.target.getBoundingClientRect());
        }
      }
    });
  }

  isOverlapping(point, rect) {
    return point.x >= rect.left && point.x <= rect.right &&
           point.y >= rect.top && point.y <= rect.bottom;
  }

  addHappyThing(thing) {
    this.happyThings.push(thing);
    document.getElementById('main-room').appendChild(thing.element);
    this.dragManager.makeDraggable(thing.element);
    
    thing.element.addEventListener('dragend', (e) => {
      this.breedingManager.checkBreedingSlot(thing, e.target.getBoundingClientRect());
    });
  }

  spawnFood() {
    const food = document.createElement('div');
    food.className = 'food-dot';
    food.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
    food.style.left = Math.random() * (window.innerWidth - 10) + 'px';
    food.style.top = Math.random() * (window.innerHeight * 0.7 - 10) + 'px';
    
    document.getElementById('main-room').appendChild(food);
    this.dragManager.makeDraggable(food);

    food.addEventListener('dragend', (e) => {
      const foodRect = food.getBoundingClientRect();
      const foodCenter = {
        x: foodRect.left + foodRect.width / 2,
        y: foodRect.top + foodRect.height / 2
      };

      for (const thing of this.happyThings) {
        const thingElement = thing.element;
        const thingRect = thingElement.getBoundingClientRect();
        if (this.isOverlapping(foodCenter, thingRect)) {
          thing.feed();
          food.remove();
          break;
        }
      }
    });
  }
}

const game = new Game();