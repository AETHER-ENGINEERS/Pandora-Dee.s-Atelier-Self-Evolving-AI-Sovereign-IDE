import { HappyThing } from './happy-thing.js';

export class AdoptionManager {
  constructor(game) {
    this.game = game;
    this.adoptionRoom = document.getElementById('adoption-room');
    this.slots = document.querySelectorAll('.adoption-slot');
    this.currentOptions = [];
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.slots.forEach(slot => {
      slot.addEventListener('click', () => {
        const index = parseInt(slot.dataset.slot);
        this.adoptThing(index);
      });
    });
  }

  showAdoptionRoom() {
    this.adoptionRoom.classList.remove('hidden');
    this.generateOptions();
  }

  generateOptions() {
    this.currentOptions = [];
    this.slots.forEach(slot => {
      slot.innerHTML = '';
      const thing = new HappyThing();
      this.currentOptions.push(thing);
      slot.appendChild(thing.element.cloneNode(true));
    });
  }

  adoptThing(index) {
    const adopted = this.currentOptions[index];
    this.game.addHappyThing(adopted);
    this.adoptionRoom.classList.add('hidden');
  }
}