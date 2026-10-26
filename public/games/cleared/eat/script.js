document.addEventListener('DOMContentLoaded', () => {
    const inputScreen = document.getElementById('input-screen');
    const eatingScreen = document.getElementById('eating-screen');
    const doneBtn = document.getElementById('done-btn');
    const resetBtn = document.getElementById('reset-btn');
    const defaultsBtn = document.getElementById('defaults-btn');
    const mainEmoji = document.getElementById('main-emoji');
    const foodContainer = document.getElementById('food-container');
    const revertToggle = document.getElementById('revert-toggle');

    // Create audio element for the eating sound
    const eatingSound = new Audio('Human Eating_Crunch - Sound Effect (HD) (1).wav');

    const eaterInput = document.querySelector('.eater-emoji');
    const foodInputs = document.querySelectorAll('.food-emoji');
    const reactionInputs = document.querySelectorAll('.reaction-input');
    const copyFoodBtns = document.querySelectorAll('.copy-food-btn');
    const copyReactionBtns = document.querySelectorAll('.copy-reaction-btn');

    const suggestionBtn = document.getElementById('suggestion-btn');
    const copySuggestionBtn = document.getElementById('copy-suggestion-btn');
    const suggestionDisplay = document.getElementById('suggestion-display');

    // Function to extract valid input (emojis, letters, numbers, symbols)
    function extractValidInput(input) {
        // Regex to match emojis and other characters
        const regex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\w\s\p{P}\p{S}]/gu;
        const matches = input.value.match(regex) || [];
        return matches;
    }

    // Function to get a random item from an array
    function getRandomItem(array) {
        return array.length > 0 
            ? array[Math.floor(Math.random() * array.length)] 
            : '😃';
    }

    // Copy food to all other food inputs
    copyFoodBtns.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            const sourceFoodInput = foodInputs[index];
            const sourceFood = sourceFoodInput.value;
            
            foodInputs.forEach((input, inputIndex) => {
                if (inputIndex !== index) {
                    input.value = sourceFood;
                }
            });
        });
    });

    // Copy reaction to all other reaction inputs
    copyReactionBtns.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            const sourceReactionInput = reactionInputs[index];
            const sourceReaction = sourceReactionInput.value;
            
            reactionInputs.forEach((input, inputIndex) => {
                if (inputIndex !== index) {
                    input.value = sourceReaction;
                }
            });
        });
    });

    // Reset function
    resetBtn.addEventListener('click', () => {
        // Clear all input fields
        [eaterInput, ...foodInputs, ...reactionInputs].forEach(input => {
            input.value = '';
        });
    });

    defaultsBtn.addEventListener('click', () => {
        eaterInput.value = '😃';
        
        // Default foods
        const defaultFoods = ['🍎', '🍌', '🍕', '🍦'];
        foodInputs.forEach((input, index) => {
            input.value = defaultFoods[index] || '';
        });

        // Default reactions
        reactionInputs.forEach(input => {
            input.value = '😋';
        });
    });

    // Original food emoji list
    let foodEmojiList = ['🍓', '🍒', '🍎', '🍉', '🍑', '🍊', '🥭', '🍍', '🍌', '🍋', '🍈', '🍏', '🍐', '🥝', '🫒', '🫐', '🍇', '🥥', '🍅', '🌶️', '🥕', '🧅', '🌽', '🥦', '🥒', '🥬', '🫑', '🥑', '🍠', '🍆', '🧄', '🥔', '🌰', '🥜', '🍞', '🫓', '🥐', '🥖', '🥯', '🧇', '🥞', '🍳', '🥚', '🧀', '🥓', '🥩', '🍗', '🍖', '🍔', '🌭', '🥪', '🥨', '🍟', '🍕', '🫔', '🌮', '🌯', '🥙', '🧆', '🥘', '🍝', '🥫', '🫕', '🥣', '🥗', '🍲', '🍛', '🍜', '🍣', '🍤', '🥡', '🍚', '🍱', '🥟', '🍢', '🍙', '🍘', '🍥', '🍡', '🥠', '🥮', '🍧', '🍨', '🍦', '🥧', '🍰', '🍮', '🎂', '🧁', '🍭', '🍬', '🍫', '🍩', '🍪', '🍯', '🍿', '🥤', '🧋', '🧃', '🥛', '🍵', '☕', '🧉', '🍺', '🍷', '🥃', '🍸', '🍹', '🍶', '🐟', '🐠', '🦐', '🦞', '🦀', '🦑', '🐙', '🦪'];

    // Get Food Suggestion
    suggestionBtn.addEventListener('click', () => {
        // Select 4 random unique food emojis
        const suggestedFoods = [];
        while (suggestedFoods.length < 4) {
            const randomFood = getRandomItem(foodEmojiList);
            if (!suggestedFoods.includes(randomFood)) {
                suggestedFoods.push(randomFood);
            }
        }

        // Display suggested foods
        suggestionDisplay.innerHTML = suggestedFoods.map(food => `<span>${food}</span>`).join('');

        // Store suggested foods as a dataset for later use
        suggestionDisplay.dataset.suggestedFoods = JSON.stringify(suggestedFoods);
    });

    // New button to copy suggestion to foods
    copySuggestionBtn.addEventListener('click', () => {
        // Retrieve suggested foods from dataset
        const suggestedFoods = JSON.parse(suggestionDisplay.dataset.suggestedFoods || '[]');

        // Copy suggested foods to food inputs
        foodInputs.forEach((input, index) => {
            input.value = suggestedFoods[index] || '';
        });
    });

    // Get custom suggestion pool input and button
    const customSuggestionInput = document.getElementById('custom-suggestion-input');
    const updateSuggestionPoolBtn = document.getElementById('update-suggestion-pool-btn');

    // Function to extract valid input (emojis, letters, numbers, symbols)
    function extractValidCharacters(input) {
        // Regex to match emojis and other characters
        const regex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\w\s\p{P}\p{S}]/gu;
        const matches = input.match(regex) || [];
        return matches;
    }

    // Update suggestion pool button event listener
    updateSuggestionPoolBtn.addEventListener('click', () => {
        const customInput = customSuggestionInput.value;
        const customCharacters = extractValidCharacters(customInput);

        // If custom input is empty or invalid, use the original list
        foodEmojiList = customCharacters.length > 0 
            ? customCharacters 
            : ['🍓', '🍒', '🍎', '🍉', '🍑', '🍊', '🥭', '🍍', '🍌', '🍋', '🍈', '🍏', '🍐', '🥝', '🫒', '🫐', '🍇', '🥥', '🍅', '🌶️', '🥕', '🧅', '🌽', '🥦', '🥒', '🥬', '🫑', '🥑', '🍠', '🍆', '🧄', '🥔', '🌰', '🥜', '🍞', '🫓', '🥐', '🥖', '🥯', '🧇', '🥞', '🍳', '🥚', '🧀', '🥓', '🥩', '🍗', '🍖', '🍔', '🌭', '🥪', '🥨', '🍟', '🍕', '🫔', '🌮', '🌯', '🥙', '🧆', '🥘', '🍝', '🥫', '🫕', '🥣', '🥗', '🍲', '🍛', '🍜', '🍣', '🍤', '🥡', '🍚', '🍱', '🥟', '🍢', '🍙', '🍘', '🍥', '🍡', '🥠', '🥮', '🍧', '🍨', '🍦', '🥧', '🍰', '🍮', '🎂', '🧁', '🍭', '🍬', '🍫', '🍩', '🍪', '🍯', '🍿', '🥤', '🧋', '🧃', '🥛', '🍵', '☕', '🧉', '🍺', '🍷', '🥃', '🍸', '🍹', '🍶', '🐟', '🐠', '🦐', '🦞', '🦀', '🦑', '🐙', '🦪'];

        // Optional: Clear the input after updating
        customSuggestionInput.value = '';

        // Optionally, provide feedback
        alert(customCharacters.length > 0 
            ? `Updated suggestion pool with ${customCharacters.length} characters` 
            : 'Reverted to default suggestion pool');
    });

    function setupFoodItemInteraction(foodItem) {
        let isEating = false;

        const startEating = (e) => {
            e.preventDefault(); 
            isEating = true;
            eatFood(foodItem);
        };

        const continueEating = (e) => {
            if (isEating) {
                e.preventDefault();
                // Find the element under the current touch/pointer
                const elementAtPoint = document.elementFromPoint(
                    e.touches ? e.touches[0].clientX : e.clientX, 
                    e.touches ? e.touches[0].clientY : e.clientY
                );

                // Check if the element is a food item
                if (elementAtPoint && elementAtPoint.classList.contains('food-item')) {
                    eatFood(elementAtPoint);
                }
            }
        };

        const stopEating = () => {
            isEating = false;
        };

        // Comprehensive event listeners for both touch and pointer events
        foodItem.addEventListener('touchstart', startEating, { passive: false });
        foodItem.addEventListener('touchmove', continueEating, { passive: false });
        foodItem.addEventListener('touchend', stopEating);
        foodItem.addEventListener('touchcancel', stopEating);

        foodItem.addEventListener('pointerdown', startEating);
        foodItem.addEventListener('pointermove', continueEating);
        foodItem.addEventListener('pointerup', stopEating);
        foodItem.addEventListener('pointerleave', stopEating);
    }

    doneBtn.addEventListener('click', () => {
        const foods = Array.from(foodInputs).map(extractValidInput);
        const reactions = Array.from(reactionInputs).map(extractValidInput);
        const eaterEmojis = extractValidInput(eaterInput);

        const foodsValid = foods.every(arr => arr.length > 0);
        const reactionsValid = reactions.every(arr => arr.length > 0);

        if (!foodsValid || !reactionsValid) {
            alert('Please enter at least one item for each food and reaction!');
            return;
        }

        mainEmoji.textContent = getRandomItem(eaterEmojis.length > 0 ? eaterEmojis : ['😃']);

        inputScreen.classList.add('hidden');
        eatingScreen.classList.remove('hidden');

        foods.forEach((foodOptions, index) => {
            const foodItem = document.createElement('div');
            foodItem.classList.add('food-item');
            
            const food = getRandomItem(foodOptions);
            foodItem.textContent = food;

            const reactionOptions = reactions[index];
            const reaction = getRandomItem(reactionOptions);
            foodItem.dataset.reaction = reaction;

            setupFoodItemInteraction(foodItem);
            foodContainer.appendChild(foodItem);
        });
    });

    function eatFood(foodItem) {
        // Play eating sound
        eatingSound.currentTime = 0; // Reset sound to start
        eatingSound.play();

        mainEmoji.textContent = foodItem.dataset.reaction;

        foodItem.remove();

        if (revertToggle.checked) {
            // Revert to eater emoji slightly before sound completely ends
            eatingSound.ontimeupdate = () => {
                if (eatingSound.currentTime >= eatingSound.duration * 0.9) {
                    const eaterEmojis = extractValidInput(eaterInput);
                    mainEmoji.textContent = getRandomItem(eaterEmojis.length > 0 ? eaterEmojis : ['😃']);
                    
                    // Remove the event listener to prevent multiple triggers
                    eatingSound.ontimeupdate = null;
                }
            };
        }

        if (foodContainer.children.length === 0) {
            setTimeout(() => {
                foodContainer.innerHTML = '';
                eatingScreen.classList.add('hidden');
                inputScreen.classList.remove('hidden');
            }, 1000);
        }
    }
});