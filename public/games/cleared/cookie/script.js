class CookieMaker {
    constructor() {
        this.currentDough = {
            ingredients: [],
            color: null,
            cookingTime: 0
        };
        this.finishedCookies = [];
        this.recipes = JSON.parse(localStorage.getItem('cookieRecipes') || '[]');
        this.customIngredients = JSON.parse(localStorage.getItem('customIngredients') || '[]');
        this.brushSize = 3;
        
        this.defaultIngredients = [
            { name: 'Flour', color: '#ffffff' },
            { name: 'Sugar', color: '#ffffff' },
            { name: 'Egg', color: '#ffff66' },
            { name: 'Salt', color: '#ffffff' },
            { name: 'Butter', color: '#fff8dc' },
            { name: 'Milk', color: '#ffffff' },
            { name: 'Cinnamon', color: '#d2691e' },
            { name: 'Milk Chocolate', color: '#8b4513' },
            { name: 'Dark Chocolate', color: '#3c1810' },
            { name: 'White Chocolate', color: '#fffacd' },
            { name: 'Honey', color: '#ffa500' }
        ];
        
        this.defaultNameWords = [
            'choco', 'chocolate', 'chocolaty', 'salt', 'salty', 'crunch', 'crunchy', 
            'honey', 'nut', 'cinnamon', 'cinnamony', 'milk', 'milky', 'butter', 
            'buttery', 'sugar', 'sugary', 'burst', 'yum', 'yumyum', 'yummy', 
            'floury', 'delish', 'sweet', 'sweetie'
        ];
        
        this.customNameWords = JSON.parse(localStorage.getItem('customNameWords') || '[]');
        
        // Add smiley customization properties
        this.smileySettings = JSON.parse(localStorage.getItem('smileySettings') || '{}');
        this.smileyName = this.smileySettings.name || 'Feed the Smiley';
        this.defaultEmoji = this.smileySettings.defaultEmoji || '😊';
        this.eatingEmoji = this.smileySettings.eatingEmoji || '😋';
        this.unhappyEmoji = this.smileySettings.unhappyEmoji || '😞';
        
        // Add order system properties
        this.currentOrder = null;
        this.successMessages = ["Excellent!", "Perfect!", "Good job!", "Nice!", "Delicious!", "Yum!", "Yummy!", "Chef's kiss!"];
        
        this.isDrawing = false;
        this.cookieCanvas = null;
        this.cookieCtx = null;
        
        this.init();
    }
    
    init() {
        this.renderIngredients();
        this.renderNameWords();
        this.renderRecipes();
        this.setupCookieCanvas();
        this.setupEventListeners();
        this.setupSmileySettings();
    }
    
    renderIngredients() {
        const grid = document.getElementById('ingredientsGrid');
        grid.innerHTML = '';
        
        // Render default ingredients
        this.defaultIngredients.forEach(ingredient => {
            this.createIngredientElement(ingredient, false);
        });
        
        // Render custom ingredients
        this.customIngredients.forEach(ingredient => {
            this.createIngredientElement(ingredient, true);
        });
    }
    
    createIngredientElement(ingredient, isCustom) {
        const grid = document.getElementById('ingredientsGrid');
        const div = document.createElement('div');
        div.className = `ingredient ${isCustom ? 'custom' : ''}`;
        div.style.backgroundColor = ingredient.color;
        div.style.color = this.getContrastColor(ingredient.color);
        div.textContent = ingredient.name;
        div.onclick = () => this.addIngredient(ingredient);
        
        if (isCustom) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteCustomIngredient(ingredient);
            };
            div.appendChild(deleteBtn);
        }
        
        grid.appendChild(div);
    }
    
    getContrastColor(hexColor) {
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }
    
    addIngredient(ingredient) {
        this.currentDough.ingredients.push(ingredient);
        
        if (this.currentDough.color === null) {
            this.currentDough.color = ingredient.color;
        } else {
            // Blend colors
            this.currentDough.color = this.blendColors(this.currentDough.color, ingredient.color, 0.1);
        }
        
        this.updateDoughDisplay();
        document.getElementById('cookingControls').style.display = 'block';
    }
    
    blendColors(color1, color2, ratio) {
        const hex1 = color1.substring(1);
        const hex2 = color2.substring(1);
        
        const r1 = parseInt(hex1.substring(0, 2), 16);
        const g1 = parseInt(hex1.substring(2, 4), 16);
        const b1 = parseInt(hex1.substring(4, 6), 16);
        
        const r2 = parseInt(hex2.substring(0, 2), 16);
        const g2 = parseInt(hex2.substring(2, 4), 16);
        const b2 = parseInt(hex2.substring(4, 6), 16);
        
        const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
        const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
        const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    updateDoughDisplay() {
        const dough = document.getElementById('dough');
        if (this.currentDough.ingredients.length > 0) {
            dough.style.display = 'block';
            dough.style.backgroundColor = this.currentDough.color;
        }
    }
    
    setupEventListeners() {
        const cookingSlider = document.getElementById('cookingSlider');
        cookingSlider.oninput = () => {
            document.getElementById('cookingTime').textContent = cookingSlider.value;
        };
        
        const brushSizeSlider = document.getElementById('brushSize');
        brushSizeSlider.oninput = () => {
            this.brushSize = parseInt(brushSizeSlider.value);
            document.getElementById('brushSizeValue').textContent = this.brushSize;
        };
    }
    
    setupSmileySettings() {
        const smileyNameInput = document.getElementById('smileyName');
        const defaultEmojiInput = document.getElementById('defaultEmoji');
        const eatingEmojiInput = document.getElementById('eatingEmoji');
        const unhappyEmojiInput = document.getElementById('unhappyEmoji');
        const smileyTitle = document.getElementById('smileyTitle');
        const smileyFace = document.getElementById('smileyFace');
        
        // Set initial values
        smileyNameInput.value = this.smileyName;
        defaultEmojiInput.value = this.defaultEmoji;
        eatingEmojiInput.value = this.eatingEmoji;
        unhappyEmojiInput.value = this.unhappyEmoji;
        smileyTitle.textContent = this.smileyName;
        smileyFace.textContent = this.defaultEmoji;
        
        // Add event listeners
        smileyNameInput.addEventListener('input', () => {
            this.smileyName = smileyNameInput.value || 'Feed the Smiley';
            smileyTitle.textContent = this.smileyName;
            this.saveSmileySettings();
        });
        
        defaultEmojiInput.addEventListener('input', () => {
            this.defaultEmoji = defaultEmojiInput.value || '😊';
            if (!smileyFace.classList.contains('eating')) {
                smileyFace.textContent = this.defaultEmoji;
            }
            this.saveSmileySettings();
        });
        
        eatingEmojiInput.addEventListener('input', () => {
            this.eatingEmoji = eatingEmojiInput.value || '😋';
            this.saveSmileySettings();
        });
        
        unhappyEmojiInput.addEventListener('input', () => {
            this.unhappyEmoji = unhappyEmojiInput.value || '😞';
            this.saveSmileySettings();
        });
    }
    
    saveSmileySettings() {
        this.smileySettings = {
            name: this.smileyName,
            defaultEmoji: this.defaultEmoji,
            eatingEmoji: this.eatingEmoji,
            unhappyEmoji: this.unhappyEmoji
        };
        localStorage.setItem('smileySettings', JSON.stringify(this.smileySettings));
    }
    
    cookDough() {
        const cookingTime = parseInt(document.getElementById('cookingSlider').value);
        this.currentDough.cookingTime = cookingTime;
        
        // Darken the color based on cooking time - 5% darker for every 5 minutes
        let cookieColor = this.currentDough.color;
        const darkenAmount = (cookingTime / 5) * 0.05; // 5% per 5 minutes
        cookieColor = this.darkenColor(cookieColor, darkenAmount);
        
        // Show cookie canvas
        document.getElementById('cookieSection').style.display = 'block';
        document.getElementById('cookingControls').style.display = 'none';
        
        // Draw base cookie
        this.drawBaseCookie(cookieColor);
    }
    
    darkenColor(color, amount) {
        const hex = color.substring(1);
        const r = Math.round(parseInt(hex.substring(0, 2), 16) * (1 - amount));
        const g = Math.round(parseInt(hex.substring(2, 4), 16) * (1 - amount));
        const b = Math.round(parseInt(hex.substring(4, 6), 16) * (1 - amount));
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    setupCookieCanvas() {
        this.cookieCanvas = document.getElementById('cookieCanvas');
        this.cookieCtx = this.cookieCanvas.getContext('2d');
        
        this.cookieCanvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.cookieCanvas.addEventListener('mousemove', (e) => this.draw(e));
        this.cookieCanvas.addEventListener('mouseup', () => this.stopDrawing());
        this.cookieCanvas.addEventListener('mouseout', () => this.stopDrawing());
        
        // Touch events for mobile
        this.cookieCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrawing(e.touches[0]);
        });
        this.cookieCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.cookieCanvas.addEventListener('touchend', () => this.stopDrawing());
    }
    
    drawBaseCookie(color) {
        this.cookieCtx.clearRect(0, 0, 200, 200);
        this.cookieCtx.fillStyle = color;
        this.cookieCtx.beginPath();
        this.cookieCtx.arc(100, 100, 90, 0, 2 * Math.PI);
        this.cookieCtx.fill();
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        this.draw(e);
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.cookieCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.cookieCtx.fillStyle = document.getElementById('drawColor').value;
        this.cookieCtx.beginPath();
        this.cookieCtx.arc(x, y, this.brushSize, 0, 2 * Math.PI);
        this.cookieCtx.fill();
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    clearDrawing() {
        const cookieColor = this.darkenColor(this.currentDough.color, (this.currentDough.cookingTime / 5) * 0.05);
        this.drawBaseCookie(cookieColor);
    }
    
    finishCookie() {
        // Create cookie image data
        const cookieData = this.cookieCanvas.toDataURL();
        
        this.finishedCookies.push({
            imageData: cookieData,
            recipe: [...this.currentDough.ingredients],
            cookingTime: this.currentDough.cookingTime
        });
        
        this.displayFinishedCookie(cookieData);
        
        // Save recipe
        this.saveRecipe();
        
        // Always show new cookie button after finishing, don't auto-reset
        document.getElementById('newCookieBtn').style.display = 'block';
    }
    
    displayFinishedCookie(imageData) {
        const cookiesDiv = document.getElementById('cookiesMade');
        const cookieImg = document.createElement('div');
        cookieImg.className = 'finished-cookie';
        cookieImg.style.backgroundImage = `url(${imageData})`;
        cookieImg.style.backgroundSize = 'cover';
        cookieImg.draggable = true;
        
        cookieImg.addEventListener('dragstart', (e) => {
            cookieImg.classList.add('dragging');
            e.dataTransfer.setData('text/plain', '');
        });
        
        cookieImg.addEventListener('dragend', () => {
            cookieImg.classList.remove('dragging');
        });
        
        cookiesDiv.appendChild(cookieImg);
        
        this.setupSmileyDropZone();
    }
    
    setupSmileyDropZone() {
        const smiley = document.getElementById('smileyFace');
        
        smiley.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        smiley.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedCookie = document.querySelector('.finished-cookie.dragging');
            if (draggedCookie) {
                this.feedCookieToSmiley(draggedCookie);
            }
        });
    }
    
    feedCookieToSmiley(cookieElement) {
        const smiley = document.getElementById('smileyFace');
        smiley.classList.add('eating');
        
        // Check if there's an active order BEFORE removing the cookie
        let isCorrectOrder = false;
        if (this.currentOrder) {
            const cookieIndex = Array.from(document.getElementById('cookiesMade').children).indexOf(cookieElement);
            const fedCookie = this.finishedCookies[cookieIndex];
            
            if (this.checkOrderMatch(fedCookie)) {
                smiley.textContent = this.eatingEmoji;
                this.showSuccessMessage();
                isCorrectOrder = true;
            } else {
                smiley.textContent = this.unhappyEmoji;
            }
            this.clearOrder();
        } else {
            smiley.textContent = this.eatingEmoji;
        }
        
        cookieElement.remove();
        
        setTimeout(() => {
            smiley.classList.remove('eating');
            smiley.textContent = this.defaultEmoji;
        }, 500);
        
        // Remove from finished cookies array
        const index = Array.from(document.getElementById('cookiesMade').children).indexOf(cookieElement);
        this.finishedCookies.splice(index, 1);
        
        // Check if all cookies are fed - only show new cookie button
        if (this.finishedCookies.length === 0) {
            setTimeout(() => {
                document.getElementById('newCookieBtn').style.display = 'block';
            }, 600);
        }
    }
    
    takeOrder() {
        if (this.recipes.length === 0) {
            alert('You need to make some recipes first!');
            return;
        }
        
        // Select random recipe
        const randomRecipe = this.recipes[Math.floor(Math.random() * this.recipes.length)];
        this.currentOrder = randomRecipe;
        
        // Display order
        const orderSection = document.getElementById('orderSection');
        const orderImage = document.getElementById('orderImage');
        const orderName = document.getElementById('orderName');
        
        orderImage.src = randomRecipe.cookieImage;
        orderName.textContent = randomRecipe.name;
        orderSection.style.display = 'block';
        
        document.getElementById('takeOrderBtn').textContent = 'Cancel Order';
        document.getElementById('takeOrderBtn').onclick = () => this.clearOrder();
    }
    
    clearOrder() {
        this.currentOrder = null;
        document.getElementById('orderSection').style.display = 'none';
        document.getElementById('takeOrderBtn').textContent = 'Take Order';
        document.getElementById('takeOrderBtn').onclick = () => this.takeOrder();
    }
    
    checkOrderMatch(fedCookie) {
        if (!this.currentOrder || !fedCookie) return false;
        
        // Compare cooking time
        if (fedCookie.cookingTime !== this.currentOrder.cookingTime) {
            return false;
        }
        
        // Compare ingredients - count ingredients in fed cookie
        const fedCounts = {};
        fedCookie.recipe.forEach(ingredient => {
            fedCounts[ingredient.name] = (fedCounts[ingredient.name] || 0) + 1;
        });
        
        // Get order ingredient counts
        const orderCounts = this.currentOrder.ingredientCounts || {};
        
        // Check if both have same number of ingredient types
        const fedKeys = Object.keys(fedCounts);
        const orderKeys = Object.keys(orderCounts);
        
        if (fedKeys.length !== orderKeys.length) {
            return false;
        }
        
        // Check if all ingredients and counts match
        return fedKeys.every(key => fedCounts[key] === orderCounts[key]);
    }
    
    showSuccessMessage() {
        const messageElement = document.getElementById('successMessage');
        const randomMessage = this.successMessages[Math.floor(Math.random() * this.successMessages.length)];
        
        messageElement.textContent = randomMessage;
        messageElement.classList.add('show');
        
        setTimeout(() => {
            messageElement.classList.remove('show');
            setTimeout(() => {
                messageElement.textContent = '';
            }, 300);
        }, 2000);
    }
    
    saveRecipe() {
        // Count ingredient quantities
        const ingredientCounts = {};
        this.currentDough.ingredients.forEach(ingredient => {
            const key = ingredient.name;
            ingredientCounts[key] = (ingredientCounts[key] || 0) + 1;
        });
        
        // Check if recipe already exists
        const recipeExists = this.recipes.some(existingRecipe => {
            // Compare cooking time
            if (existingRecipe.cookingTime !== this.currentDough.cookingTime) {
                return false;
            }
            
            // Compare ingredient counts
            const existingCounts = existingRecipe.ingredientCounts || {};
            const currentCounts = ingredientCounts;
            
            // Check if both have same number of ingredient types
            const existingKeys = Object.keys(existingCounts);
            const currentKeys = Object.keys(currentCounts);
            
            if (existingKeys.length !== currentKeys.length) {
                return false;
            }
            
            // Check if all ingredients and counts match
            return existingKeys.every(key => existingCounts[key] === currentCounts[key]);
        });
        
        // Only save if recipe doesn't already exist
        if (!recipeExists) {
            // Create a temporary canvas to generate cookie image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 60;
            tempCanvas.height = 60;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Draw base cookie at smaller size
            const cookieColor = this.darkenColor(this.currentDough.color, (this.currentDough.cookingTime / 5) * 0.05);
            tempCtx.fillStyle = cookieColor;
            tempCtx.beginPath();
            tempCtx.arc(30, 30, 27, 0, 2 * Math.PI);
            tempCtx.fill();
            
            const cookieImageData = tempCanvas.toDataURL();
            
            const recipe = {
                id: Date.now(),
                name: this.generateRandomRecipeName(),
                ingredients: [...this.currentDough.ingredients],
                ingredientCounts: ingredientCounts,
                cookingTime: this.currentDough.cookingTime,
                date: new Date().toLocaleDateString(),
                cookieImage: cookieImageData
            };
            
            this.recipes.push(recipe);
            localStorage.setItem('cookieRecipes', JSON.stringify(this.recipes));
            this.renderRecipes();
        }
    }
    
    generateRandomRecipeName() {
        const allWords = [...this.defaultNameWords, ...this.customNameWords];
        if (allWords.length < 2) {
            return `Recipe ${this.recipes.length + 1}`;
        }
        
        const word1 = allWords[Math.floor(Math.random() * allWords.length)];
        let word2;
        do {
            word2 = allWords[Math.floor(Math.random() * allWords.length)];
        } while (word2 === word1 && allWords.length > 1);
        
        // Capitalize first letter of first word
        const capitalizedWord1 = word1.charAt(0).toUpperCase() + word1.slice(1);
        
        return `${capitalizedWord1} ${word2}`;
    }
    
    renderRecipes() {
        const recipesList = document.getElementById('recipesList');
        recipesList.innerHTML = '';
        
        this.recipes.forEach(recipe => {
            const recipeDiv = document.createElement('div');
            recipeDiv.className = 'recipe';
            
            const recipeHeader = document.createElement('div');
            recipeHeader.className = 'recipe-header';
            
            // Add cookie image if it exists
            if (recipe.cookieImage) {
                const cookieImg = document.createElement('img');
                cookieImg.src = recipe.cookieImage;
                cookieImg.className = 'recipe-cookie-image';
                recipeHeader.appendChild(cookieImg);
            }
            
            const recipeName = document.createElement('div');
            recipeName.className = 'recipe-name';
            
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = recipe.name;
            nameInput.onchange = () => {
                recipe.name = nameInput.value;
                localStorage.setItem('cookieRecipes', JSON.stringify(this.recipes));
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-recipe';
            deleteBtn.textContent = 'Delete';
            deleteBtn.onclick = () => this.deleteRecipe(recipe.id);
            
            recipeName.appendChild(nameInput);
            recipeName.appendChild(deleteBtn);
            recipeHeader.appendChild(recipeName);
            
            // Create ingredients list with quantities
            let ingredientsText = '';
            if (recipe.ingredientCounts) {
                ingredientsText = Object.entries(recipe.ingredientCounts)
                    .map(([name, count]) => `${name} (${count})`)
                    .join(', ');
            } else {
                // Fallback for old recipes without counts
                const counts = {};
                recipe.ingredients.forEach(ingredient => {
                    counts[ingredient.name] = (counts[ingredient.name] || 0) + 1;
                });
                ingredientsText = Object.entries(counts)
                    .map(([name, count]) => `${count}x ${name}`)
                    .join(', ');
            }
            
            const recipeDetails = document.createElement('div');
            recipeDetails.className = 'recipe-details';
            recipeDetails.innerHTML = `
                <div>Ingredients: ${ingredientsText}</div>
                <div>Cooking time: ${recipe.cookingTime} minutes</div>
                <div>Made on: ${recipe.date}</div>
            `;
            
            // Add taste recipe button
            const tasteBtn = document.createElement('button');
            tasteBtn.className = 'taste-btn';
            tasteBtn.textContent = 'Taste Recipe';
            tasteBtn.onclick = () => this.generateTasteDescription(recipe, recipeDiv);
            
            recipeDiv.appendChild(recipeHeader);
            recipeDiv.appendChild(recipeDetails);
            recipeDiv.appendChild(tasteBtn);
            recipesList.appendChild(recipeDiv);
        });
    }
    
    async generateTasteDescription(recipe, recipeDiv) {
        // Check if taste description already exists
        const existingDescription = recipeDiv.querySelector('.taste-description');
        if (existingDescription) {
            existingDescription.remove();
            return;
        }
        
        // Create loading description
        const tasteDiv = document.createElement('div');
        tasteDiv.className = 'taste-description loading';
        tasteDiv.textContent = 'Generating taste description...';
        recipeDiv.appendChild(tasteDiv);
        
        try {
            // Prepare ingredient list
            let ingredientsList = '';
            if (recipe.ingredientCounts) {
                ingredientsList = Object.entries(recipe.ingredientCounts)
                    .map(([name, count]) => `${count}x ${name}`)
                    .join(', ');
            } else {
                const counts = {};
                recipe.ingredients.forEach(ingredient => {
                    counts[ingredient.name] = (counts[ingredient.name] || 0) + 1;
                });
                ingredientsList = Object.entries(counts)
                    .map(([name, count]) => `${count}x ${name}`)
                    .join(', ');
            }
            
            const prompt = `Describe how a cookie would taste and feel with these ingredients: ${ingredientsList}, cooked for ${recipe.cookingTime} minutes. Focus on flavor, texture, and mouthfeel. Keep it under 50 words and make it appetizing.`;
            
            const minutes = Number(recipe.cookingTime) || 0;
            const heat = minutes < 8 ? "soft in the middle" : minutes > 14 ? "darker at the edge" : "baked through";
            tasteDiv.className = 'taste-description';
            tasteDiv.textContent = (ingredientsList || "A plain dough") + ". " + heat.charAt(0).toUpperCase() + heat.slice(1) + ", and the taste is the mix you put in.";
        } catch (error) {
            tasteDiv.className = 'taste-description';
            tasteDiv.textContent = 'Unable to generate taste description at this time.';
        }
    }
    
    deleteRecipe(recipeId) {
        this.recipes = this.recipes.filter(r => r.id !== recipeId);
        localStorage.setItem('cookieRecipes', JSON.stringify(this.recipes));
        this.renderRecipes();
    }
    
    addCustomIngredient() {
        const name = document.getElementById('customName').value.trim();
        const color = document.getElementById('customColor').value;
        
        if (name) {
            const ingredient = { name, color };
            this.customIngredients.push(ingredient);
            localStorage.setItem('customIngredients', JSON.stringify(this.customIngredients));
            
            document.getElementById('customName').value = '';
            document.getElementById('customColor').value = '#ffffff';
            
            this.renderIngredients();
        }
    }
    
    deleteCustomIngredient(ingredientToDelete) {
        this.customIngredients = this.customIngredients.filter(
            ing => ing.name !== ingredientToDelete.name || ing.color !== ingredientToDelete.color
        );
        localStorage.setItem('customIngredients', JSON.stringify(this.customIngredients));
        this.renderIngredients();
    }
    
    renderNameWords() {
        const grid = document.getElementById('nameWordsGrid');
        grid.innerHTML = '';
        
        // Render default name words (non-deleteable)
        this.defaultNameWords.forEach(word => {
            this.createNameWordElement(word, false);
        });
        
        // Render custom name words (deleteable)
        this.customNameWords.forEach(word => {
            this.createNameWordElement(word, true);
        });
    }
    
    createNameWordElement(word, isCustom) {
        const grid = document.getElementById('nameWordsGrid');
        const div = document.createElement('div');
        div.className = 'name-word';
        div.textContent = word;
        
        if (isCustom) {
            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'delete-word-btn';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteCustomWord(word);
            };
            div.appendChild(deleteBtn);
        }
        
        grid.appendChild(div);
    }
    
    addCustomWord() {
        const word = document.getElementById('customWord').value.trim().toLowerCase();
        
        if (word && !this.defaultNameWords.includes(word) && !this.customNameWords.includes(word)) {
            this.customNameWords.push(word);
            localStorage.setItem('customNameWords', JSON.stringify(this.customNameWords));
            
            document.getElementById('customWord').value = '';
            this.renderNameWords();
        }
    }
    
    deleteCustomWord(wordToDelete) {
        this.customNameWords = this.customNameWords.filter(word => word !== wordToDelete);
        localStorage.setItem('customNameWords', JSON.stringify(this.customNameWords));
        this.renderNameWords();
    }
    
    resetForNewCookie() {
        this.currentDough = {
            ingredients: [],
            color: null,
            cookingTime: 0
        };
        
        document.getElementById('dough').style.display = 'none';
        document.getElementById('cookingControls').style.display = 'none';
        document.getElementById('cookieSection').style.display = 'none';
        document.getElementById('newCookieBtn').style.display = 'none';
        document.getElementById('cookingSlider').value = 0;
        document.getElementById('cookingTime').textContent = '0';
        
        // Clear finished cookies display
        document.getElementById('cookiesMade').innerHTML = '';
        this.finishedCookies = [];
        
        // Clear any active order
        this.clearOrder();
    }
}

// Global functions for HTML onclick handlers
let cookieMaker;

function addCustomIngredient() {
    cookieMaker.addCustomIngredient();
}

function addCustomWord() {
    cookieMaker.addCustomWord();
}

function cookDough() {
    cookieMaker.cookDough();
}

function clearDrawing() {
    cookieMaker.clearDrawing();
}

function finishCookie() {
    cookieMaker.finishCookie();
}

function resetForNewCookie() {
    cookieMaker.resetForNewCookie();
}

function takeOrder() {
    cookieMaker.takeOrder();
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    cookieMaker = new CookieMaker();
});