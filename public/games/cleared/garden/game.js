// Game state
let gameState = {
    mode: 'sandbox',
    coins: 100,
    selectedSlot: null,
    plants: {},
    careEmojis: {
        water: '💦',
        fertilize: '🫙',
        weed: '🌾',
        bug: '🪰'
    },
    plantEmojis: {
        planted: '🌱',
        growing: '🌿',
        grown: '🌷'
    }
};

// Initialize game
class GardenGame {
    constructor() {
        this.initializeGrid();
        this.bindEvents();
        this.updateDisplay();
        this.startGrowthCycle();
    }

    initializeGrid() {
        const garden = document.getElementById('garden-grid');
        for (let i = 0; i < 24; i++) {
            const slot = document.createElement('div');
            slot.className = 'garden-slot';
            slot.dataset.slotId = i;
            slot.addEventListener('click', () => this.selectSlot(i));
            garden.appendChild(slot);
        }
    }

    bindEvents() {
        // Mode switching
        document.getElementById('sandbox-mode').addEventListener('click', () => this.switchMode('sandbox'));
        document.getElementById('challenge-mode').addEventListener('click', () => this.switchMode('challenge'));

        // Plant button
        document.getElementById('plant-btn').addEventListener('click', () => this.showPlantModal());

        // Care buttons
        document.querySelectorAll('.care-btn').forEach(btn => {
            btn.addEventListener('click', () => this.useCare(btn.dataset.action));
        });

        // Harvest button
        document.getElementById('harvest-btn').addEventListener('click', () => this.harvestPlant());

        // Modal events
        document.getElementById('confirm-plant').addEventListener('click', () => this.plantSeed());
        document.getElementById('cancel-plant').addEventListener('click', () => this.closeModal('plant-modal'));
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('close-settings').addEventListener('click', () => this.closeModal('settings-modal'));
        document.getElementById('settings-btn').addEventListener('click', () => this.showSettingsModal());
    }

    switchMode(mode) {
        gameState.mode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${mode}-mode`).classList.add('active');
        
        if (mode === 'sandbox') {
            gameState.coins = Infinity;
        } else {
            gameState.coins = 100;
        }
        this.updateDisplay();
        this.showNotification(`Switched to ${mode} mode`, 'success');
    }

    selectSlot(slotId) {
        const slot = document.querySelector(`[data-slot-id="${slotId}"]`);
        
        // Clear previous selection
        document.querySelectorAll('.garden-slot').forEach(s => s.classList.remove('selected'));
        
        // Toggle selection
        if (gameState.selectedSlot === slotId) {
            gameState.selectedSlot = null;
            document.getElementById('harvest-btn').disabled = true;
        } else {
            gameState.selectedSlot = slotId;
            slot.classList.add('selected');
            const plant = gameState.plants[slotId];
            if (plant && plant.stage === 'grown') {
                document.getElementById('harvest-btn').disabled = false;
            }
        }
    }

    showPlantModal() {
        if (gameState.selectedSlot === null) {
            this.showNotification('Please select a garden slot first!', 'warning');
            return;
        }
        
        if (gameState.plants[gameState.selectedSlot]) {
            this.showNotification('This slot already has a plant!', 'warning');
            return;
        }
        
        document.getElementById('plant-modal').classList.remove('hidden');
    }

    plantSeed() {
        const planted = document.getElementById('planted-emoji').value;
        const growing = document.getElementById('growing-emoji').value;
        const grown = document.getElementById('grown-emoji').value;

        if (!planted || !growing || !grown) {
            this.showNotification('Please enter all emoji stages!', 'error');
            return;
        }

        // Update plant emojis
        gameState.plantEmojis = { planted, growing, grown };

        // Plant the seed
        gameState.plants[gameState.selectedSlot] = {
            stage: 'planted',
            plantedTime: Date.now(),
            needsWater: false,
            needsWeed: false,
            needsBug: false,
            waterLevel: 100,
            fertilized: false
        };

        this.closeModal('plant-modal');
        this.updateGarden();
    }

    useCare(action) {
        const slotId = gameState.selectedSlot;
        if (slotId === null) {
            this.showNotification('Please select a plant first!', 'warning');
            return;
        }

        const plant = gameState.plants[slotId];
        if (!plant) {
            this.showNotification('No plant in selected slot!', 'warning');
            return;
        }

        // Check if action is needed in challenge mode
        if (gameState.mode === 'challenge') {
            const costs = { water: 5, fertilize: 20, weed: 10, bug: 15 };
            const needsMap = { water: 'needsWater', weed: 'needsWeed', bug: 'needsBug' };
            
            if (action !== 'fertilize' && !plant[needsMap[action]]) {
                this.showNotification(`Plant doesn't need ${action} right now!`, 'warning');
                return;
            }

            if (gameState.coins < costs[action]) {
                this.showNotification('Not enough coins!', 'error');
                return;
            }

            gameState.coins -= costs[action];
        }

        // Show care effect
        this.showCareEffect(slotId, action);

        // Apply care action
        switch (action) {
            case 'water':
                plant.waterLevel = 100;
                plant.needsWater = false;
                break;
            case 'fertilize':
                plant.fertilized = true;
                plant.growthBoost = true;
                break;
            case 'weed':
                plant.needsWeed = false;
                break;
            case 'bug':
                plant.needsBug = false;
                break;
        }

        this.updateGarden();
        this.updateDisplay();
    }

    showCareEffect(slotId, action) {
        const slot = document.querySelector(`[data-slot-id="${slotId}"]`);
        const effect = document.createElement('div');
        effect.className = 'care-effect';
        effect.textContent = gameState.careEmojis[action];
        effect.style.left = '50%';
        effect.style.top = '50%';
        effect.style.transform = 'translate(-50%, -50%)';
        slot.appendChild(effect);
        
        setTimeout(() => effect.remove(), 1000);
    }

    harvestPlant() {
        const slotId = gameState.selectedSlot;
        const plant = gameState.plants[slotId];
        
        if (!plant || plant.stage !== 'grown') {
            this.showNotification('Plant not ready for harvest!', 'warning');
            return;
        }

        // Calculate harvest value
        let value = 50;
        if (plant.fertilized) value += 20;
        
        if (gameState.mode === 'challenge') {
            gameState.coins += value;
            this.showNotification(`Harvested! Earned ${value} coins`, 'success');
        } else {
            this.showNotification('Harvested successfully!', 'success');
        }

        delete gameState.plants[slotId];
        this.selectSlot(null);
        this.updateGarden();
        this.updateDisplay();
    }

    updateGarden() {
        document.querySelectorAll('.garden-slot').forEach((slot, index) => {
            const plant = gameState.plants[index];
            if (plant) {
                const emoji = gameState.plantEmojis[plant.stage];
                slot.textContent = emoji;
                slot.className = 'garden-slot';
                
                if (plant.needsWater) slot.classList.add('needs-water');
                if (plant.needsWeed) slot.classList.add('needs-weed');
                if (plant.needsBug) slot.classList.add('needs-bug');
            } else {
                slot.textContent = '';
                slot.className = 'garden-slot';
            }
        });
    }

    updateDisplay() {
        document.getElementById('coins').textContent = gameState.mode === 'sandbox' ? '∞' : gameState.coins;
        
        // Update care button emojis
        document.querySelectorAll('.care-btn').forEach(btn => {
            const action = btn.dataset.action;
            btn.textContent = `${gameState.careEmojis[action]} ${action.charAt(0).toUpperCase() + action.slice(1)}`;
        });
    }

    startGrowthCycle() {
        setInterval(() => {
            Object.entries(gameState.plants).forEach(([slotId, plant]) => {
                const now = Date.now();
                const age = now - plant.plantedTime;
                
                // Update stage based on age
                if (age > 30000 && plant.stage === 'planted') {
                    plant.stage = 'growing';
                }
                if (age > 60000 && plant.stage === 'growing') {
                    plant.stage = 'grown';
                }

                // Random needs
                if (Math.random() < 0.01) plant.needsWater = true;
                if (Math.random() < 0.005) plant.needsWeed = true;
                if (Math.random() < 0.005) plant.needsBug = true;

                // Water decreases
                plant.waterLevel = Math.max(0, plant.waterLevel - 1);
                if (plant.waterLevel < 30) plant.needsWater = true;
            });
            
            this.updateGarden();
        }, 1000);
    }

    showSettingsModal() {
        document.getElementById('water-emoji').value = gameState.careEmojis.water;
        document.getElementById('fertilize-emoji').value = gameState.careEmojis.fertilize;
        document.getElementById('weed-emoji').value = gameState.careEmojis.weed;
        document.getElementById('bug-emoji').value = gameState.careEmojis.bug;
        document.getElementById('settings-modal').classList.remove('hidden');
    }

    saveSettings() {
        gameState.careEmojis = {
            water: document.getElementById('water-emoji').value || '💦',
            fertilize: document.getElementById('fertilize-emoji').value || '🫙',
            weed: document.getElementById('weed-emoji').value || '🌾',
            bug: document.getElementById('bug-emoji').value || '🪰'
        };
        
        this.closeModal('settings-modal');
        this.updateDisplay();
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
    }
}

// Initialize the game
new GardenGame();