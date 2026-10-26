class Fish {
    constructor(name, bodyColor, tailColor, finColor, eyeColor, size, isAdultInitially) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.name = name || 'Unnamed Fish';
        this.bodyColor = bodyColor;
        this.tailColor = tailColor;
        this.finColor = finColor;
        this.eyeColor = eyeColor;
        this.size = parseFloat(size);
        this.x = Math.random() * 800;
        this.y = Math.random() * 400 + 50;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 1;
        this.flipped = false;
        this.isAdult = isAdultInitially; 
        this.feedCount = 0;
        this.element = this.createElement();
        this.targetFood = null; // New property to store the food element it's chasing
    }

    createElement() {
        const fishDiv = document.createElement('div');
        fishDiv.className = 'fish';
        fishDiv.style.left = this.x + 'px';
        fishDiv.style.top = this.y + 'px';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', 80 * this.size);
        svg.setAttribute('height', 60 * this.size);
        svg.setAttribute('viewBox', '0 0 80 60');

        // Body
        const body = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        body.setAttribute('cx', '35');
        body.setAttribute('cy', '30');
        body.setAttribute('rx', '20');
        body.setAttribute('ry', '12');
        body.setAttribute('fill', this.bodyColor);

        // Tail
        const tail = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        tail.setAttribute('points', '55,30 70,20 70,25 65,30 70,35 70,40');
        tail.setAttribute('fill', this.tailColor);

        // Fins
        const finTop = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        finTop.setAttribute('points', '25,20 35,15 40,25');
        finTop.setAttribute('fill', this.finColor);

        const finBottom = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        finBottom.setAttribute('points', '25,40 35,45 40,35');
        finBottom.setAttribute('fill', this.finColor);

        // Eye
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', '30');
        eye.setAttribute('cy', '25');
        eye.setAttribute('r', '3');
        eye.setAttribute('fill', this.eyeColor);

        svg.appendChild(body);
        svg.appendChild(tail);
        svg.appendChild(finTop);
        svg.appendChild(finBottom);
        svg.appendChild(eye);

        fishDiv.appendChild(svg);
        return fishDiv;
    }

    update() {
        const aquarium = document.getElementById('aquarium');
        const maxX = aquarium.offsetWidth - 80 * this.size;
        const maxY = aquarium.offsetHeight - 60 * this.size;

        if (this.targetFood && this.targetFood.parentNode) { // If there's a target food and it still exists in DOM
            const foodX = parseFloat(this.targetFood.style.left);
            const foodY = parseFloat(this.targetFood.style.top);

            const fishCenterX = this.x + (40 * this.size);
            const fishCenterY = this.y + (30 * this.size);

            const dx = foodX - fishCenterX;
            const dy = foodY - fishCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // If food is within eating range, just wait for collision detection
            if (distance < (50 * this.size)) {
                // Keep moving towards it subtly or stop, for now, just let collision handle it
            } else {
                // Move towards food, increase speed slightly
                const speed = 2.5; // Slightly faster when chasing food
                this.vx = (dx / distance) * speed;
                this.vy = (dy / distance) * speed;
            }
        } else {
            // Random movement if no target food or target food is gone
            this.vx += (Math.random() - 0.5) * 0.2;
            this.vy += (Math.random() - 0.5) * 0.2;

            // Limit speed for random movement
            this.vx = Math.max(-3, Math.min(3, this.vx));
            this.vy = Math.max(-2, Math.min(2, this.vy));
        }

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Update direction based on movement (fixed to face swimming direction)
        if (Math.abs(this.vx) > 0.1) {
            this.flipped = this.vx > 0;
        }

        // Boundary checking
        if (this.x < 0 || this.x > maxX) {
            this.vx *= -1;
            this.x = Math.max(0, Math.min(maxX, this.x));
            if (this.targetFood) this.targetFood = null; // Clear target if hits wall
        }

        if (this.y < 0 || this.y > maxY) {
            this.vy *= -1;
            this.y = Math.max(0, Math.min(maxY, this.y));
            if (this.targetFood) this.targetFood = null; // Clear target if hits wall
        }

        // Update element position
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
        this.element.classList.toggle('flipped', this.flipped);
    }

    checkFoodCollision(food) {
        const fishCenterX = this.x + (40 * this.size);
        const fishCenterY = this.y + (30 * this.size);
        const foodX = parseFloat(food.style.left);
        const foodY = parseFloat(food.style.top);

        const distance = Math.sqrt(
            Math.pow(fishCenterX - foodX, 2) + Math.pow(fishCenterY - foodY, 2)
        );

        return distance < (50 * this.size);
    }

    feed() {
        this.feedCount++;
        if (!this.isAdult && this.feedCount >= 5) {
            this.growToAdult();
        }
        this.targetFood = null; // Clear target after eating
    }

    growToAdult() {
        this.size = Math.min(1.6, this.size * 1.5);
        this.isAdult = true;
        this.element.remove();
        this.element = this.createElement();
        document.getElementById('aquarium').appendChild(this.element);
        aquarium.renderFishInventory(); // Re-render to update inventory and potential visibility
    }
}

class Aquarium {
    constructor() {
        this.fish = [];
        this.foods = [];
        this.animationId = null;
        this.currentInventoryFilter = 'all'; // 'all', 'adults', 'babies', 'specific'
        this.selectedSpecificFishId = null;
        this.namingPatterns = this.loadNamingPatterns(); // Load patterns here

        this.inventoryButtons = [
            document.getElementById('view-all-fish'),
            document.getElementById('view-adults'),
            document.getElementById('view-babies'),
            document.getElementById('view-specific-fish-btn')
        ];

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startAnimation();
        this.renderFishInventory(); // Initial render of the fish list and aquarium visibility
    }

    setupEventListeners() {
        // Modal controls
        const addFishBtn = document.getElementById('add-fish-btn');
        const breedFishBtn = document.getElementById('breed-fish-btn');
        const sellFishBtn = document.getElementById('sell-fish-btn');
        const addFishModal = document.getElementById('add-fish-modal');
        const breedFishModal = document.getElementById('breed-fish-modal');
        const sellFishModal = document.getElementById('sell-fish-modal');
        const closeBtns = document.querySelectorAll('.close');

        addFishBtn.addEventListener('click', () => {
            addFishModal.style.display = 'block';
            this.updatePreview();
        });

        breedFishBtn.addEventListener('click', () => {
            this.setupBreedingModal();
            breedFishModal.style.display = 'block';
        });

        sellFishBtn.addEventListener('click', () => {
            this.setupSellingModal();
            sellFishModal.style.display = 'block';
        });

        closeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        // Color preview updates
        const colorInputs = ['body-color', 'tail-color', 'fin-color', 'eye-color'];
        colorInputs.forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.updatePreview());
        });

        document.getElementById('fish-size').addEventListener('change', () => {
            this.toggleCustomSize();
            this.updatePreview();
        });

        document.getElementById('custom-size').addEventListener('input', () => this.updatePreview());

        // Create fish
        document.getElementById('create-fish').addEventListener('click', () => this.createFish());

        // Randomize fish creator colors, size, and name
        document.getElementById('randomize-fish').addEventListener('click', () => {
            document.getElementById('body-color').value = getRandomColor();
            document.getElementById('tail-color').value = getRandomColor();
            document.getElementById('fin-color').value = getRandomColor();
            document.getElementById('eye-color').value = getRandomColor();
            document.getElementById('fish-name').value = this.generateRandomFishNameForAquarium(); // Set random name using aquarium's patterns

            const sizeSelect = document.getElementById('fish-size');
            const customSizeInput = document.getElementById('custom-size');
            
            if (Math.random() < 0.8) { // 80% chance to pick a preset size
                sizeSelect.value = getRandomSize();
            } else { // 20% chance for a custom random size
                sizeSelect.value = 'custom';
                const randomCustomSize = (Math.random() * (2.0 - 0.3) + 0.3).toFixed(1);
                customSizeInput.value = randomCustomSize;
            }
            this.toggleCustomSize(); // Ensure custom size input visibility is correct
            this.updatePreview();
        });

        // Breed fish
        document.getElementById('breed-button').addEventListener('click', () => this.breedFish());

        // Sell fish
        document.getElementById('fish-to-sell-select').addEventListener('change', () => {
            const sellButton = document.getElementById('sell-button');
            sellButton.disabled = !document.getElementById('fish-to-sell-select').value;
        });
        document.getElementById('sell-button').addEventListener('click', () => this.sellFish());

        // Parent selection
        document.getElementById('parent1-select').addEventListener('change', () => this.updateBreedingPreview());
        document.getElementById('parent2-select').addEventListener('change', () => this.updateBreedingPreview());

        // Food dropping
        document.getElementById('aquarium').addEventListener('click', (e) => this.dropFood(e));

        // Inventory view controls
        this.inventoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filterId = btn.id.replace('view-', '').replace('-btn', '');
                this.currentInventoryFilter = filterId.replace('specific-fish', 'specific');
                this.selectedSpecificFishId = null;
                this.renderFishInventory();
            });
        });

        document.getElementById('specific-fish-select').addEventListener('change', (e) => {
            this.selectedSpecificFishId = e.target.value;
            this.renderFishInventory();
        });

        // New: Manage Patterns button
        const managePatternsBtn = document.getElementById('manage-patterns-btn');
        const managePatternsModal = document.getElementById('manage-patterns-modal');

        managePatternsBtn.addEventListener('click', () => {
            this.setupManagePatternsModal();
            managePatternsModal.style.display = 'block';
        });
    }

    toggleCustomSize() {
        const sizeSelect = document.getElementById('fish-size');
        const customSizeInput = document.getElementById('custom-size');
        
        if (sizeSelect.value === 'custom') {
            customSizeInput.style.display = 'block';
        } else {
            customSizeInput.style.display = 'none';
        }
    }

    updatePreview() {
        const bodyColor = document.getElementById('body-color').value;
        const tailColor = document.getElementById('tail-color').value;
        const finColor = document.getElementById('fin-color').value;
        const eyeColor = document.getElementById('eye-color').value;
        const sizeSelect = document.getElementById('fish-size');
        const customSizeInput = document.getElementById('custom-size');
        
        let size;
        if (sizeSelect.value === 'custom') {
            size = parseFloat(customSizeInput.value) || 1.0;
        } else {
            size = parseFloat(sizeSelect.value);
        }

        const svg = document.getElementById('preview-fish');
        // Scale the SVG content
        svg.setAttribute('width', 80 * size);
        svg.setAttribute('height', 60 * size);
        // It's better to scale the SVG elements within if viewBox is fixed, or use CSS transform
        // For simplicity, we apply a transform to the whole SVG for immediate visual feedback.
        // The actual fish element uses fixed size SVG with CSS scaling.
        svg.style.transform = `scale(${size})`;
        svg.style.transformOrigin = 'center center'; // Scale from center
        svg.querySelector('.body').setAttribute('fill', bodyColor);
        svg.querySelector('.tail').setAttribute('fill', tailColor);
        svg.querySelectorAll('.fin-top, .fin-bottom').forEach(fin => {
            fin.setAttribute('fill', finColor);
        });
        svg.querySelector('.eye').setAttribute('fill', eyeColor);
    }

    createFish() {
        const name = document.getElementById('fish-name').value || 'Unnamed Fish';
        const bodyColor = document.getElementById('body-color').value;
        const tailColor = document.getElementById('tail-color').value;
        const finColor = document.getElementById('fin-color').value;
        const eyeColor = document.getElementById('eye-color').value;
        const sizeSelect = document.getElementById('fish-size');
        const customSizeInput = document.getElementById('custom-size');
        
        let size;
        if (sizeSelect.value === 'custom') {
            size = parseFloat(customSizeInput.value) || 1.0;
        } else {
            size = parseFloat(sizeSelect.value);
        }

        // Manually created or randomized fish are always adults
        const fish = new Fish(name, bodyColor, tailColor, finColor, eyeColor, size, true); 
        this.addFish(fish);

        // Reset form
        document.getElementById('fish-name').value = '';
        document.getElementById('add-fish-modal').style.display = 'none';
    }

    addFish(fish) {
        this.fish.push(fish);
        document.getElementById('aquarium').appendChild(fish.element);
        this.renderFishInventory(); // Re-render to update inventory and potential visibility
    }

    setupBreedingModal() {
        const parent1Select = document.getElementById('parent1-select');
        const parent2Select = document.getElementById('parent2-select');

        // Clear existing options
        parent1Select.innerHTML = '<option value="">Select fish...</option>';
        parent2Select.innerHTML = '<option value="">Select fish...</option>';

        // Add adult fish
        const adultFish = this.fish.filter(fish => fish.isAdult);
        adultFish.forEach(fish => {
            const option1 = document.createElement('option');
            option1.value = fish.id;
            option1.textContent = fish.name;
            parent1Select.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = fish.id;
            option2.textContent = fish.name;
            parent2Select.appendChild(option2);
        });

        this.updateBreedingPreview();
    }

    updateBreedingPreview() {
        const parent1Id = document.getElementById('parent1-select').value;
        const parent2Id = document.getElementById('parent2-select').value;
        const breedButton = document.getElementById('breed-button');

        const parent1 = this.fish.find(f => f.id === parent1Id);
        const parent2 = this.fish.find(f => f.id === parent2Id);

        if (parent1) {
            this.createFishPreview('parent1-preview', parent1);
        } else {
            document.getElementById('parent1-preview').innerHTML = '';
        }

        if (parent2) {
            this.createFishPreview('parent2-preview', parent2);
        } else {
            document.getElementById('parent2-preview').innerHTML = '';
        }

        breedButton.disabled = !parent1 || !parent2 || parent1.id === parent2.id;
    }

    createFishPreview(containerId, fish) {
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <svg width="60" height="45" viewBox="0 0 80 60">
                <ellipse cx="35" cy="30" rx="20" ry="12" fill="${fish.bodyColor}"/>
                <polygon points="55,30 70,20 70,25 65,30 70,35 70,40" fill="${fish.tailColor}"/>
                <polygon points="25,20 35,15 40,25" fill="${fish.finColor}"/>
                <polygon points="25,40 35,45 40,35" fill="${fish.finColor}"/>
                <circle cx="30" cy="25" r="3" fill="${fish.eyeColor}"/>
            </svg>
            <div style="font-size: 12px; margin-top: 5px;">${fish.name}</div>
        `;
    }

    breedFish() {
        const parent1Id = document.getElementById('parent1-select').value;
        const parent2Id = document.getElementById('parent2-select').value;
        const babyNameInput = document.getElementById('baby-fish-name').value;

        const parent1 = this.fish.find(f => f.id === parent1Id);
        const parent2 = this.fish.find(f => f.id === parent2Id);

        if (!parent1 || !parent2) return;

        // Mix colors
        const mixColor = (color1, color2) => {
            const hex1 = color1.replace('#', '');
            const hex2 = color2.replace('#', '');
            
            const r1 = parseInt(hex1.substr(0, 2), 16);
            const g1 = parseInt(hex1.substr(2, 2), 16);
            const b1 = parseInt(hex1.substr(4, 2), 16);
            
            const r2 = parseInt(hex2.substr(0, 2), 16);
            const g2 = parseInt(hex2.substr(2, 2), 16);
            const b2 = parseInt(hex2.substr(4, 2), 16);
            
            const r = Math.floor((r1 + r2) / 2);
            const g = Math.floor((g1 + g2) / 2);
            const b = Math.floor((b1 + b2) / 2);
            
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        };

        const babyName = babyNameInput.trim() !== '' ? babyNameInput.trim() : this.generateRandomFishNameForAquarium();
        const babyBodyColor = mixColor(parent1.bodyColor, parent2.bodyColor);
        const babyTailColor = mixColor(parent1.tailColor, parent2.tailColor);
        const babyFinColor = mixColor(parent1.finColor, parent2.finColor);
        const babyEyeColor = mixColor(parent1.eyeColor, parent2.eyeColor);
        const babySize = Math.max(0.3, (parent1.size + parent2.size) / 4); // Smaller baby

        // Bred fish are always babies initially, regardless of calculated size
        const baby = new Fish(babyName, babyBodyColor, babyTailColor, babyFinColor, babyEyeColor, babySize, false); 
        this.addFish(baby);

        document.getElementById('breed-fish-modal').style.display = 'none';
        document.getElementById('baby-fish-name').value = ''; // Clear baby name input
    }

    setupSellingModal() {
        const fishToSellSelect = document.getElementById('fish-to-sell-select');
        const sellButton = document.getElementById('sell-button');

        // Clear existing options
        fishToSellSelect.innerHTML = '<option value="">Select fish...</option>';

        // Add all current fish to the dropdown
        this.fish.forEach(fish => {
            const option = document.createElement('option');
            option.value = fish.id;
            option.textContent = fish.name;
            fishToSellSelect.appendChild(option);
        });

        sellButton.disabled = true; // Disable until a fish is selected
    }

    sellFish() {
        const fishIdToSell = document.getElementById('fish-to-sell-select').value;
        if (!fishIdToSell) return;

        const fishIndex = this.fish.findIndex(f => f.id === fishIdToSell);
        if (fishIndex > -1) {
            const fish = this.fish[fishIndex];
            fish.element.remove(); // Remove fish from aquarium DOM
            this.fish.splice(fishIndex, 1); // Remove fish from array
            this.renderFishInventory(); // Update inventory display and aquarium visibility
        }

        document.getElementById('sell-fish-modal').style.display = 'none';
    }

    dropFood(e) {
        const aquariumEl = document.getElementById('aquarium');
        const rect = aquariumEl.getBoundingClientRect();
        const foodX = e.clientX - rect.left;
        const foodY = e.clientY - rect.top;

        const food = document.createElement('div');
        food.className = 'food';
        food.style.left = foodX + 'px';
        food.style.top = foodY + 'px';

        const fallDistance = aquariumEl.clientHeight - foodY - 8; // 8 is food height
        food.style.setProperty('--fall-distance', `${fallDistance}px`);
        
        aquariumEl.appendChild(food);
        this.foods.push(food);

        let closestFish = null;
        let minDistance = Infinity;

        // Find the closest visible fish that is not currently targeting another food item
        this.fish.forEach(fish => {
            if (fish.element.style.display !== 'none' && !fish.targetFood) {
                const fishCenterX = fish.x + (40 * fish.size);
                const fishCenterY = fish.y + (30 * fish.size);
                
                const dx = foodX - fishCenterX;
                const dy = foodY - fishCenterY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < minDistance) {
                    minDistance = distance;
                    closestFish = fish;
                }
            }
        });

        if (closestFish) {
            closestFish.targetFood = food; // Assign this specific food to the fish's target
            food._targetingFishId = closestFish.id; // Mark the food with which fish targets it
        }

        // Add a listener for when the food animation ends (falls to bottom)
        food.addEventListener('animationend', () => {
            if (food.parentNode) { // If food still exists (not eaten)
                // If this food was targeted by a fish, clear that fish's target
                if (food._targetingFishId) {
                    const targetingFish = this.fish.find(f => f.id === food._targetingFishId);
                    // Ensure the fish's target is actually this food before clearing
                    if (targetingFish && targetingFish.targetFood === food) {
                        targetingFish.targetFood = null;
                    }
                }
                food.remove();
                // Remove from this.foods array as well
                this.foods = this.foods.filter(f => f !== food);
            }
        });
    }

    checkFoodCollisions() {
        this.foods = this.foods.filter(food => {
            // If food already removed from DOM (e.g., eaten by a fish not currently processed)
            if (!food.parentNode) {
                return false; // Filter out already removed food
            }

            let eaten = false;
            for (const fish of this.fish) {
                // Only check collision for visible fish
                if (fish.element.style.display !== 'none' && fish.checkFoodCollision(food)) {
                    fish.feed(); // This sets fish.targetFood = null;
                    food.remove();
                    eaten = true;
                    break; // Food is eaten, no other fish needs to check this food
                }
            }
            return !eaten; // Keep food in the array if it was not eaten
        });
    }

    renderFishInventory() {
        const fishCountSpan = document.getElementById('fish-count');
        const fishInventoryDiv = document.getElementById('fish-inventory');
        const specificFishSelect = document.getElementById('specific-fish-select');

        // Update active view button
        this.inventoryButtons.forEach(btn => btn.classList.remove('active-view'));
        if (this.currentInventoryFilter === 'all') {
            document.getElementById('view-all-fish').classList.add('active-view');
        } else if (this.currentInventoryFilter === 'adults') {
            document.getElementById('view-adults').classList.add('active-view');
        } else if (this.currentInventoryFilter === 'babies') {
            document.getElementById('view-babies').classList.add('active-view');
        } else if (this.currentInventoryFilter === 'specific') {
            document.getElementById('view-specific-fish-btn').classList.add('active-view');
        }

        // Populate specific fish select
        specificFishSelect.innerHTML = '<option value="">Select a fish...</option>';
        this.fish.forEach(fish => {
            const option = document.createElement('option');
            option.value = fish.id;
            option.textContent = fish.name;
            specificFishSelect.appendChild(option);
        });
        // Re-select the previously selected fish if it still exists
        if (this.selectedSpecificFishId && this.fish.some(f => f.id === this.selectedSpecificFishId)) {
            specificFishSelect.value = this.selectedSpecificFishId;
        } else {
            this.selectedSpecificFishId = null; // Clear if selected fish was sold/removed
            specificFishSelect.value = '';
        }
        specificFishSelect.disabled = (this.currentInventoryFilter !== 'specific' || this.fish.length === 0);

        // Filter fish for display in the inventory list AND for visibility in the aquarium
        let visibleFishInAquarium = []; // This will hold the fish objects that should be visible
        let filteredFishForInventory = []; // This will hold the fish objects for the inventory card display

        if (this.currentInventoryFilter === 'all') {
            visibleFishInAquarium = this.fish;
            filteredFishForInventory = this.fish;
        } else if (this.currentInventoryFilter === 'adults') {
            visibleFishInAquarium = this.fish.filter(fish => fish.isAdult);
            filteredFishForInventory = visibleFishInAquarium;
        } else if (this.currentInventoryFilter === 'babies') {
            visibleFishInAquarium = this.fish.filter(fish => !fish.isAdult);
            filteredFishForInventory = visibleFishInAquarium;
        } else if (this.currentInventoryFilter === 'specific') {
            visibleFishInAquarium = this.fish.filter(fish => fish.id === this.selectedSpecificFishId);
            filteredFishForInventory = visibleFishInAquarium; // Specific fish will be in both
        }

        // Update fish visibility in the aquarium
        this.fish.forEach(fish => {
            if (visibleFishInAquarium.includes(fish)) {
                fish.element.style.display = ''; // Make visible
            } else {
                fish.element.style.display = 'none'; // Hide
                fish.targetFood = null; // Clear any target food if fish becomes invisible
            }
        });

        // Update fish count and render inventory cards
        fishCountSpan.textContent = filteredFishForInventory.length;
        fishInventoryDiv.innerHTML = ''; // Clear existing cards

        filteredFishForInventory.forEach(fish => {
            const card = document.createElement('div');
            card.className = 'fish-card';
            
            card.innerHTML = `
                <svg width="64" height="48" viewBox="0 0 80 60">
                    <ellipse cx="35" cy="30" rx="20" ry="12" fill="${fish.bodyColor}"/>
                    <polygon points="55,30 70,20 70,25 65,30 70,35 70,40" fill="${fish.tailColor}"/>
                    <polygon points="25,20 35,15 40,25" fill="${fish.finColor}"/>
                    <polygon points="25,40 35,45 40,35" fill="${fish.finColor}"/>
                    <circle cx="30" cy="25" r="3" fill="${fish.eyeColor}"/>
                </svg>
                <div class="fish-info">
                    <div class="name">${fish.name}</div>
                    <div class="details">
                        Size: ${fish.size.toFixed(1)} | ${fish.isAdult ? 'Adult' : `Baby (${fish.feedCount}/5 feeds)`}
                    </div>
                </div>
            `;
            
            fishInventoryDiv.appendChild(card);
        });
    }

    // Helper function to generate a random name based on a given pattern
    _generateNameFromPattern(pattern) {
        const vowels = 'aeiou';
        const consonants = 'bcdfghjklmnpqrstvwxyz';
        const getRandomChar = (charSet) => charSet[Math.floor(Math.random() * charSet.length)];

        let name = '';
        for (const char of pattern.toLowerCase()) {
            if (char === 'v') {
                name += getRandomChar(vowels);
            } else if (char === 'n') {
                name += getRandomChar(consonants);
            }
        }
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    // Method to be called by the global generateRandomFishName function
    generateRandomFishNameForAquarium() {
        if (this.namingPatterns.length === 0) {
            return 'Unnamed Fish'; // Fallback if no patterns are defined
        }
        const randomPattern = this.namingPatterns[Math.floor(Math.random() * this.namingPatterns.length)];
        return this._generateNameFromPattern(randomPattern);
    }

    saveNamingPatterns() {
        localStorage.setItem('fishNamingPatterns', JSON.stringify(this.namingPatterns));
    }

    loadNamingPatterns() {
        const storedPatterns = localStorage.getItem('fishNamingPatterns');
        if (storedPatterns) {
            return JSON.parse(storedPatterns);
        }
        return ['nvnv', 'vnvn']; // Default patterns
    }

    setupManagePatternsModal() {
        this.renderNamingPatterns();
        const newPatternInput = document.getElementById('new-pattern-input');
        const addPatternBtn = document.getElementById('add-pattern-btn');

        // Ensure listeners are added only once or properly managed
        // A simpler way for a single modal is to add and remove a temporary handler or clear the input
        addPatternBtn.onclick = () => this.addNamingPattern(newPatternInput.value); // Use onclick to easily replace handler
        newPatternInput.value = ''; // Clear input field when modal opens
    }

    renderNamingPatterns() {
        const currentPatternsList = document.getElementById('current-patterns-list');
        currentPatternsList.innerHTML = ''; // Clear existing list

        if (this.namingPatterns.length === 0) {
            currentPatternsList.innerHTML = '<p>No custom naming patterns added yet.</p>';
        }

        this.namingPatterns.forEach(pattern => {
            const patternDiv = document.createElement('div');
            patternDiv.className = 'pattern-item';
            patternDiv.innerHTML = `
                <span>${pattern}</span>
                <button class="btn secondary remove-pattern-btn" data-pattern="${pattern}">Remove</button>
            `;
            currentPatternsList.appendChild(patternDiv);
        });

        // Add event listeners to newly created remove buttons
        currentPatternsList.querySelectorAll('.remove-pattern-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const patternToRemove = e.target.dataset.pattern;
                this.removeNamingPattern(patternToRemove);
            });
        });
    }

    addNamingPattern(pattern) {
        const cleanPattern = pattern.toLowerCase().trim();
        // Validate pattern: only 'n' or 'v' and not empty
        if (!cleanPattern || !/^[nv]+$/.test(cleanPattern)) {
            alert("Invalid pattern. Please use only 'n' for non-vowel and 'v' for vowel characters (e.g., 'vnvn').");
            return;
        }
        // Check for duplicates
        if (this.namingPatterns.includes(cleanPattern)) {
            alert(`Pattern '${cleanPattern}' already exists.`);
            return;
        }

        this.namingPatterns.push(cleanPattern);
        this.saveNamingPatterns();
        this.renderNamingPatterns(); // Re-render the list
        document.getElementById('new-pattern-input').value = ''; // Clear input
        alert(`Pattern '${cleanPattern}' added successfully!`);
    }

    removeNamingPattern(pattern) {
        const initialLength = this.namingPatterns.length;
        this.namingPatterns = this.namingPatterns.filter(p => p !== pattern);
        if (this.namingPatterns.length < initialLength) {
            this.saveNamingPatterns();
            this.renderNamingPatterns(); // Re-render the list
            alert(`Pattern '${pattern}' removed.`);
        }
    }

    animate() {
        this.fish.forEach(fish => fish.update()); // All fish objects update their internal state (position, velocity)
        this.checkFoodCollisions();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    startAnimation() {
        this.animate();
    }
}

// Helper function to generate a random hex color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Helper function to get a random preset size
function getRandomSize() {
    const sizes = ["0.5", "0.7", "1", "1.3", "1.6"];
    const randomIndex = Math.floor(Math.random() * sizes.length);
    return sizes[randomIndex];
}

// Helper function to generate a random fish name based on a pattern
// This global function now delegates to the Aquarium instance
function generateRandomFishName() {
    return aquarium.generateRandomFishNameForAquarium();
}

// Initialize the aquarium when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.aquarium = new Aquarium();
});