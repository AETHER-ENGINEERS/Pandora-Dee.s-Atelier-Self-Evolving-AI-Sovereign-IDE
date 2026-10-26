class OreoMaker {
    constructor() {
        this.stack = [];
        this.customFlavors = [];
        this.initializeElements();
        this.bindEvents();
        this.updateDisplay();
    }

    initializeElements() {
        this.oreoStack = document.getElementById('oreoStack');
        this.oreoName = document.getElementById('oreoName');
        this.addTopCookieBtn = document.getElementById('addTopCookie');
        this.addBottomCookieBtn = document.getElementById('addBottomCookie');
        this.addCreamBtn = document.getElementById('addCream');
        this.removeLastBtn = document.getElementById('removeLast');
        this.resetBtn = document.getElementById('resetOreo');
        this.eatBtn = document.getElementById('eatOreo');
        
        // Custom flavor elements
        this.flavorType = document.getElementById('flavorType');
        this.flavorName = document.getElementById('flavorName');
        this.flavorCode = document.getElementById('flavorCode');
        this.flavorColor = document.getElementById('flavorColor');
        this.addCustomBtn = document.getElementById('addCustom');
        
        // Background color picker
        this.backgroundColor = document.getElementById('backgroundColor');
        
        // Mix ingredients elements
        this.mixType = document.getElementById('mixType');
        this.ingredient1 = document.getElementById('ingredient1');
        this.ingredient2 = document.getElementById('ingredient2');
        this.mixName = document.getElementById('mixName');
        this.mixCode = document.getElementById('mixCode');
        this.mixIngredientsBtn = document.getElementById('mixIngredients');
    }

    bindEvents() {
        this.addTopCookieBtn.addEventListener('click', () => this.addPiece('cookie-top'));
        this.addBottomCookieBtn.addEventListener('click', () => this.addPiece('cookie-bottom'));
        this.addCreamBtn.addEventListener('click', () => this.addPiece('cream'));
        this.removeLastBtn.addEventListener('click', () => this.removeLast());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.eatBtn.addEventListener('click', () => this.eatOreo());
        
        // Custom flavor events
        this.addCustomBtn.addEventListener('click', () => this.addCustomFlavor());
        
        // Background color event
        this.backgroundColor.addEventListener('change', () => {
            const newColor = this.backgroundColor.value;
            document.body.style.backgroundColor = newColor;
            document.querySelector('#app').style.backgroundColor = newColor;
        });
        
        // Mix ingredients events
        this.mixType.addEventListener('change', () => this.updateIngredientOptions());
        this.mixIngredientsBtn.addEventListener('click', () => this.mixIngredients());
        
        // Initial ingredient options
        this.updateIngredientOptions();
    }

    eatOreo() {
        if (this.stack.length === 0) return;

        const colors = this.getOreoColors();
        this.createCrumbs(colors);
        
        this.stack = [];
        this.updateDisplay();
    }

    getOreoColors() {
        const colors = [];
        this.stack.forEach(piece => {
            if (piece === 'cookie-top' || piece === 'cookie-bottom') {
                colors.push('#2c1810');
            } else if (piece === 'cream') {
                colors.push('#f5f5dc');
            } else if (typeof piece === 'object' && piece.variant === 'bottom') {
                const flavor = this.customFlavors.find(f => f.id === piece.id);
                if (flavor) colors.push(flavor.color);
            } else if (piece.startsWith('custom-')) {
                const flavor = this.customFlavors.find(f => f.id === piece);
                if (flavor) colors.push(flavor.color);
            }
        });
        return colors;
    }

    createCrumbs(colors) {
        if (colors.length === 0) return;

        const display = document.querySelector('.oreo-display');
        const rect = display.getBoundingClientRect();
        
        for (let i = 0; i < 30; i++) {
            const crumb = document.createElement('div');
            crumb.className = 'crumb';
            crumb.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            
            // Position relative to the oreo display
            const startX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 100;
            const startY = rect.top + rect.height / 2;
            
            crumb.style.left = startX + 'px';
            crumb.style.top = startY + 'px';
            
            // Random size variation
            const size = 4 + Math.random() * 8;
            crumb.style.width = size + 'px';
            crumb.style.height = size + 'px';
            
            document.body.appendChild(crumb);
            
            // Animate falling
            const fallSpeed = 3 + Math.random() * 2;
            const horizontalDrift = (Math.random() - 0.5) * 2;
            
            let currentY = startY;
            let currentX = startX;
            
            const fallInterval = setInterval(() => {
                currentY += fallSpeed;
                currentX += horizontalDrift;
                
                crumb.style.top = currentY + 'px';
                crumb.style.left = currentX + 'px';
                
                // Remove when off screen
                if (currentY > window.innerHeight + 50) {
                    clearInterval(fallInterval);
                    crumb.remove();
                }
            }, 16);
        }
    }

    addCustomFlavor() {
        const type = this.flavorType.value;
        const name = this.flavorName.value.trim();
        const code = this.flavorCode.value.trim();
        const color = this.flavorColor.value;
        
        if (!name || !code) return;
        
        const flavor = {
            type,
            name,
            code,
            color,
            id: `custom-${Date.now()}`
        };
        
        this.customFlavors.push(flavor);
        
        // Create a new button instead of adding to stack
        this.createCustomButton(flavor);
        
        // Clear inputs
        this.flavorName.value = '';
        this.flavorCode.value = '';
    }

    createCustomButton(flavor) {
        if (flavor.type === 'cookie') {
            // Create top cookie button
            const topBtn = document.createElement('button');
            topBtn.textContent = `${flavor.name} Top (${flavor.code})`;
            topBtn.className = 'add-btn';
            topBtn.style.backgroundColor = flavor.color;
            topBtn.style.color = this.getContrastColor(flavor.color);
            topBtn.dataset.flavorId = flavor.id;
            topBtn.addEventListener('click', () => this.addPiece(flavor.id));
            
            // Create bottom cookie button
            const bottomBtn = document.createElement('button');
            bottomBtn.textContent = `${flavor.name} Bottom (${flavor.code})`;
            bottomBtn.className = 'add-btn';
            bottomBtn.style.backgroundColor = flavor.color;
            bottomBtn.style.color = this.getContrastColor(flavor.color);
            bottomBtn.style.borderRadius = '15px 15px 50px 50px';
            bottomBtn.dataset.flavorId = flavor.id;
            bottomBtn.addEventListener('click', () => this.addPiece(`${flavor.id}-bottom`));
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'X';
            deleteBtn.className = 'remove-btn';
            deleteBtn.style.padding = '0.5rem';
            deleteBtn.style.marginLeft = '0.5rem';
            deleteBtn.addEventListener('click', () => this.removeCustomFlavor(flavor));
            
            const controls = document.querySelector('.controls');
            const topContainer = document.createElement('div');
            topContainer.style.display = 'inline-flex';
            topContainer.style.alignItems = 'center';
            topContainer.style.margin = '0.25rem';
            topContainer.appendChild(topBtn);
            if (flavor.type === 'cookie') {
                topContainer.appendChild(deleteBtn);
            }
            controls.appendChild(topContainer);
            
            if (flavor.type === 'cookie') {
                const bottomContainer = document.createElement('div');
                bottomContainer.style.display = 'inline-flex';
                bottomContainer.style.alignItems = 'center';
                bottomContainer.style.margin = '0.25rem';
                bottomBtn.style.borderRadius = '15px 15px 50px 50px';
                bottomContainer.appendChild(bottomBtn);
                bottomContainer.appendChild(deleteBtn.cloneNode(true));
                controls.appendChild(bottomContainer);
            }
        } else {
            const button = document.createElement('button');
            button.textContent = `${flavor.name} (${flavor.code})`;
            button.className = 'add-btn';
            button.style.backgroundColor = flavor.color;
            button.style.color = this.getContrastColor(flavor.color);
            button.dataset.flavorId = flavor.id;
            button.addEventListener('click', () => this.addPiece(flavor.id));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'X';
            deleteBtn.className = 'remove-btn';
            deleteBtn.style.padding = '0.5rem';
            deleteBtn.style.marginLeft = '0.5rem';
            deleteBtn.addEventListener('click', () => this.removeCustomFlavor(flavor));
            
            const container = document.createElement('div');
            container.style.display = 'inline-flex';
            container.style.alignItems = 'center';
            container.style.margin = '0.25rem';
            container.appendChild(button);
            container.appendChild(deleteBtn);
            
            const controls = document.querySelector('.controls');
            controls.appendChild(container);
        }
    }

    removeCustomFlavor(flavor) {
        // Remove from customFlavors array
        this.customFlavors = this.customFlavors.filter(f => f.id !== flavor.id);
        
        // Remove any instances from stack
        this.stack = this.stack.filter(piece => 
            piece !== flavor.id && 
            piece !== `${flavor.id}-bottom`
        );
        
        // Remove buttons
        const buttons = document.querySelectorAll(`[data-flavor-id="${flavor.id}"]`);
        buttons.forEach(btn => {
            if (btn.parentElement) {
                btn.parentElement.remove();
            } else {
                btn.remove();
            }
        });
        
        this.updateDisplay();
    }

    getContrastColor(hexcolor) {
        // Convert hex to RGB
        const r = parseInt(hexcolor.substr(1, 2), 16);
        const g = parseInt(hexcolor.substr(3, 2), 16);
        const b = parseInt(hexcolor.substr(5, 2), 16);
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    addPiece(type) {
        let finalType = type;
        
        // Handle bottom cookie variants
        if (type.includes('-bottom')) {
            const flavorId = type.replace('-bottom', '');
            const flavor = this.customFlavors.find(f => f.id === flavorId);
            if (flavor) {
                finalType = { id: flavor.id, variant: 'bottom', color: flavor.color };
            }
        }
        
        this.stack.push(finalType);
        this.updateDisplay();
    }

    removeLast() {
        if (this.stack.length > 0) {
            this.stack.pop();
            this.updateDisplay();
        }
    }

    reset() {
        this.stack = [];
        this.updateDisplay();
    }

    updateIngredientOptions() {
        const type = this.mixType.value;
        const ingredients = this.customFlavors.filter(f => f.type === type);
        
        [this.ingredient1, this.ingredient2].forEach(select => {
            select.innerHTML = '<option value="">Select ingredient</option>';
            
            // Add base ingredients first
            if (type === 'cookie') {
                const baseCookieOption = document.createElement('option');
                baseCookieOption.value = 'cookie-base';
                baseCookieOption.textContent = 'Cookie (o)';
                select.appendChild(baseCookieOption);
            } else if (type === 'cream') {
                const baseCreamOption = document.createElement('option');
                baseCreamOption.value = 'cream-base';
                baseCreamOption.textContent = 'Cream (re)';
                select.appendChild(baseCreamOption);
            }
            
            // Add custom flavors
            ingredients.forEach(ingredient => {
                const option = document.createElement('option');
                option.value = ingredient.id;
                option.textContent = `${ingredient.name} (${ingredient.code})`;
                select.appendChild(option);
            });
        });
    }

    mixIngredients() {
        const type = this.mixType.value;
        const ing1Id = this.ingredient1.value;
        const ing2Id = this.ingredient2.value;
        const name = this.mixName.value.trim();
        const code = this.mixCode.value.trim();
        
        if (!ing1Id || !ing2Id || !name || !code) return;
        
        let ing1, ing2;
        
        // Handle base ingredients
        if (ing1Id === 'cookie-base') {
            ing1 = { color: '#2c1810' };
        } else if (ing1Id === 'cream-base') {
            ing1 = { color: '#f5f5dc' };
        } else {
            ing1 = this.customFlavors.find(f => f.id === ing1Id);
        }
        
        if (ing2Id === 'cookie-base') {
            ing2 = { color: '#2c1810' };
        } else if (ing2Id === 'cream-base') {
            ing2 = { color: '#f5f5dc' };
        } else {
            ing2 = this.customFlavors.find(f => f.id === ing2Id);
        }
        
        if (!ing1 || !ing2) return;
        
        // Mix colors
        const color1 = ing1.color;
        const color2 = ing2.color;
        const mixedColor = this.mixColors(color1, color2);
        
        const mixedFlavor = {
            type,
            name,
            code,
            color: mixedColor,
            id: `custom-mix-${Date.now()}`
        };
        
        this.customFlavors.push(mixedFlavor);
        this.createCustomButton(mixedFlavor);
        
        // Clear inputs
        this.mixName.value = '';
        this.mixCode.value = '';
    }

    mixColors(color1, color2) {
        // Convert hex to RGB
        const r1 = parseInt(color1.substr(1, 2), 16);
        const g1 = parseInt(color1.substr(3, 2), 16);
        const b1 = parseInt(color1.substr(5, 2), 16);
        
        const r2 = parseInt(color2.substr(1, 2), 16);
        const g2 = parseInt(color2.substr(3, 2), 16);
        const b2 = parseInt(color2.substr(5, 2), 16);
        
        // Average the colors
        const r = Math.round((r1 + r2) / 2);
        const g = Math.round((g1 + g2) / 2);
        const b = Math.round((b1 + b2) / 2);
        
        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    updateDisplay() {
        this.oreoStack.innerHTML = '';
        
        this.stack.forEach((piece, index) => {
            const div = document.createElement('div');
            div.className = 'oreo-piece';
            
            if (piece === 'cookie-top') {
                div.classList.add('cookie-top');
            } else if (piece === 'cookie-bottom') {
                div.classList.add('cookie-bottom');
            } else if (piece === 'cream') {
                div.classList.add('cream');
            } else if (typeof piece === 'object' && piece.variant === 'bottom') {
                div.classList.add('cookie-bottom');
                div.style.backgroundColor = piece.color;
                div.dataset.custom = 'cookie-bottom';
            } else if (piece.startsWith('custom-')) {
                const flavor = this.customFlavors.find(f => f.id === piece);
                if (flavor) {
                    if (flavor.type === 'cookie') {
                        div.classList.add('cookie-top');
                        div.style.backgroundColor = flavor.color;
                        div.dataset.custom = 'cookie-top';
                    } else {
                        div.classList.add('cream');
                        div.style.backgroundColor = flavor.color;
                        div.dataset.custom = 'cream';
                    }
                }
            }
            
            this.oreoStack.appendChild(div);
        });

        this.updateName();
    }

    updateName() {
        let name = '';
        this.stack.forEach(piece => {
            if (piece === 'cookie-top' || piece === 'cookie-bottom') {
                name += 'o';
            } else if (piece === 'cream') {
                name += 're';
            } else if (typeof piece === 'object' && piece.variant === 'bottom') {
                const flavor = this.customFlavors.find(f => f.id === piece.id);
                if (flavor) {
                    name += flavor.code;
                }
            } else if (piece.startsWith('custom-')) {
                const flavor = this.customFlavors.find(f => f.id === piece);
                if (flavor) {
                    name += flavor.code;
                }
            }
        });
        this.oreoName.textContent = name || 'empty';
    }
}

new OreoMaker();