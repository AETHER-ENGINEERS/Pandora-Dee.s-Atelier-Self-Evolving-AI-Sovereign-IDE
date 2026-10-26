// Game state variables
let recipes = new Map(); // Map<string, string> key: sorted emoji pair (e.g., "🍎+🍌"), value: result emoji (e.g., "🍉")
let inventory = new Map(); // Map<string, number> key: emoji, value: count
let selectedCraftItems = []; // Array of emojis currently selected for crafting

// Array to store patch sets, including the default one
let patchSets = [];

// Probability weights (higher means more likely)
// These will apply to ALL sets unless we move them into the set object
const weights = {
    common: 12, // Target approx 40%
    uncommon: 6, // Target approx 20%
    rare: 3,     // Target approx 10%
    nothing: 9  // Target approx 30% (Total weight = 12+6+3+9 = 30)
};

// Game specific state
let totalDirtPatches = 0; // Keep track of the total number of patches generated
let dugPatchesCount = 0; // Keep track of how many patches have been dug


// --- DOM Elements ---
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');

// Default Patch Set Inputs
const defaultPatchSetInputs = document.getElementById('default-patch-set-inputs');
const commonInput = document.getElementById('common-emojis'); // This is now the default common input
const uncommonInput = document.getElementById('uncommon-emojis'); // This is now the default uncommon input
const rareInput = document.getElementById('rare-emojis'); // This is now the default rare input
const defaultDirtEmojiInput = document.getElementById('default-dirt-emoji'); // New default dirt input
const defaultHoleEmojiInput = document.getElementById('default-hole-emoji'); // New default hole input

// Additional Patch Sets Elements
const addPatchSetButton = document.getElementById('add-patch-set-button');
const dynamicPatchSetsContainer = document.getElementById('dynamic-patch-sets-container');

// Other Setup Elements
const recipesInput = document.getElementById('initial-recipes');
const startGameButton = document.getElementById('start-game-button');

// Game Screen Elements
const gameArea = document.getElementById('game-area');
const inventoryList = document.getElementById('inventory-list');
const selectedCraftItemsDiv = document.getElementById('selected-craft-items');
const craftButton = document.getElementById('craft-button');
const craftingFeedback = document.getElementById('crafting-feedback');
const showAddRecipeButton = document.getElementById('show-add-recipe-button');
const addRecipeForm = document.getElementById('add-recipe-form');
const newRecipeInput = document.getElementById('new-recipe-input');
const addRecipeButton = document.getElementById('add-recipe-button');
const cancelAddRecipeButton = document.getElementById('cancel-add-recipe-button');
const currentRecipesList = document.getElementById('current-recipes');
const resetGameButton = document.getElementById('reset-game-button');


// --- Audio Context (for sound effects) ---
let audioContext;
let digSoundBuffer;
let craftSuccessSoundBuffer;
let craftFailSoundBuffer;

async function initAudio() {
    // Create context only on a user gesture (like Start Game button)
    if (!audioContext) {
         try {
            // Check if context is available before creating
            if (window.AudioContext || window.webkitAudioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                 // Resume context if suspended (needed for some browsers on iOS/Android)
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                // Load sounds asynchronously
                digSoundBuffer = await loadSound('dig.mp3');
                craftSuccessSoundBuffer = await loadSound('craft_success.mp3');
                craftFailSoundBuffer = await loadSound('craft_fail.mp3');
                 console.log("Audio initialized and sounds loaded.");
            } else {
                console.warn('Web Audio API not supported.');
                audioContext = null; // Ensure it's null if not supported
            }
        } catch (e) {
            console.error('Web Audio API initialization or audio loading failed:', e);
            audioContext = null; // Ensure it's null if not supported or failed
        }
    } else if (audioContext && audioContext.state === 'suspended') {
         // If context already exists but is suspended, try to resume it
         try {
             await audioContext.resume();
              console.log("Audio context resumed.");
         } catch (e) {
             console.error("Failed to resume audio context:", e);
         }
    }
}

async function loadSound(url) {
    if (!audioContext) return null; // Cannot load if context failed or not supported

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        // console.log(`Sound loaded successfully: ${url}`); // Keep console logs quieter unless needed
        return audioBuffer;
    } catch (e) {
        console.error(`Failed to load sound ${url}:`, e);
        return null;
    }
}

function playSound(buffer) {
    // Ensure context is available and running before playing
    if (audioContext && buffer && audioContext.state === 'running') {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
    } else if (audioContext && audioContext.state !== 'running') {
        console.warn('Audio context is not running. Sound playback may be suspended.');
        // Attempt to resume context if possible (though initAudio does this on start)
         if (audioContext.state === 'suspended') {
             audioContext.resume().then(() => {
                 console.log("Attempted to resume suspended audio context.");
                 // Try playing again after resume? Maybe too complex, rely on next user gesture.
             }).catch(e => console.error("Resume failed:", e));
         }
    } else {
        // console.log('Audio context or buffer not available.'); // Keep logs quieter
    }
}


// --- Utility Functions ---

// Parses comma-separated emoji string into a unique array
// If the resulting array is empty after parsing, returns an array with a default emoji.
function parseEmojiString(str, defaultEmoji = '❓') {
    const emojis = Array.from(new Set(str.split(',').map(e => e.trim()).filter(e => e !== '')));
    return emojis.length > 0 ? emojis : [defaultEmoji];
}

// Parses recipe string into a Map
function parseRecipes(str) {
    const recipeMap = new Map();
    const recipeStrings = str.split(' ').map(r => r.trim()).filter(r => r !== '');
    for (const recipeStr of recipeStrings) {
        const parts = recipeStr.split('=');
        if (parts.length === 2) {
            const ingredientsStr = parts[0].trim();
            const result = parts[1].trim();
            const ingredients = ingredientsStr.split('+').map(i => i.trim()).filter(i => i !== '');

            if (ingredients.length === 2 && result !== '') {
                // Store key as sorted ingredients joined by +
                const key = ingredients.sort().join('+');
                if (recipeMap.has(key)) {
                    console.warn(`Duplicate recipe key found, skipping: ${recipeStr}`);
                } else {
                     recipeMap.set(key, result);
                }
            } else {
                console.warn(`Skipping malformed recipe: ${recipeStr}`);
            }
        } else {
             console.warn(`Skipping malformed recipe: ${recipeStr}`);
        }
    }
    return recipeMap;
}

// Formats a recipe key (sorted ingredients) back to a readable string
function formatRecipeKey(key) {
    const [ing1, ing2] = key.split('+');
    return `${ing1} + ${ing2}`;
}

// Updates the displayed list of recipes
function updateRecipeList() {
    currentRecipesList.innerHTML = '';
    // Sort recipes by key for consistent order
    const sortedRecipeKeys = Array.from(recipes.keys()).sort();
    for (const key of sortedRecipeKeys) {
        const result = recipes.get(key);
        const li = document.createElement('li');
        li.textContent = `${formatRecipeKey(key)} = ${result}`;
        currentRecipesList.appendChild(li);
    }
}

// Gets a random emoji from an array
function getRandomEmoji(emojiArray) {
    if (!emojiArray || emojiArray.length === 0) {
        // Return a default or error indicator if the array is empty
        console.warn("Attempted to get random emoji from empty array.");
        return '❓'; // Or some other placeholder
    }
    const randomIndex = Math.floor(Math.random() * emojiArray.length);
    return emojiArray[randomIndex];
}

// --- Patch Set Management ---

function createPatchSetInputs(common = '', uncommon = '', rare = '', dirt = '🟫', hole = '🕳️') {
    const setDiv = document.createElement('div');
    setDiv.classList.add('patch-set-block');
    setDiv.innerHTML = `
        <button class="remove-set-button">×</button>
        <label>Common Emojis (separated by commas):</label>
        <input type="text" class="set-common-emojis" value="${common}">
        <label>Uncommon Emojis (separated by commas):</label>
        <input type="text" class="set-uncommon-emojis" value="${uncommon}">
        <label>Rare Emojis (separated by commas):</label>
        <input type="text" class="set-rare-emojis" value="${rare}">
        <label>Dirt Patch Emojis (separated by commas):</label>
        <input type="text" class="set-dirt-emoji" value="${dirt}">
        <label>Dug Hole Emojis (separated by commas):</label>
        <input type="text" class="set-hole-emoji" value="${hole}">
    `;

    // Add event listener to the remove button
    setDiv.querySelector('.remove-set-button').addEventListener('click', () => {
        setDiv.remove(); // Remove the whole input block
    });

    return setDiv;
}

function addPatchSetInputs() {
    const newSetDiv = createPatchSetInputs();
    dynamicPatchSetsContainer.appendChild(newSetDiv);
}


// --- Game Logic ---

function startGame() {
    // Clear previous patch sets
    patchSets = [];

    // 1. Parse Default Patch Set
    const defaultSet = {
        common: parseEmojiString(commonInput.value),
        uncommon: parseEmojiString(uncommonInput.value),
        rare: parseEmojiString(rareInput.value),
        dirtVisuals: parseEmojiString(defaultDirtEmojiInput.value, '🟫'), // Use 🟫 as default
        holeVisuals: parseEmojiString(defaultHoleEmojiInput.value, '🕳️') // Use 🕳️ as default
    };
    // Add default weights to the set object (optional, keeping global for now)
    // defaultSet.weights = weights;
    patchSets.push(defaultSet);

    // 2. Parse Additional Patch Sets
    dynamicPatchSetsContainer.querySelectorAll('.patch-set-block').forEach((setBlock, index) => {
        const common = parseEmojiString(setBlock.querySelector('.set-common-emojis').value);
        const uncommon = parseEmojiString(setBlock.querySelector('.set-uncommon-emojis').value);
        const rare = parseEmojiString(setBlock.querySelector('.set-rare-emojis').value);
        const dirt = parseEmojiString(setBlock.querySelector('.set-dirt-emoji').value, '🟫');
        const hole = parseEmojiString(setBlock.querySelector('.set-hole-emoji').value, '🕳️');

        const newSet = { common, uncommon, rare, dirtVisuals: dirt, holeVisuals: hole };
         // Add default weights to the set object (optional, keeping global for now)
        // newSet.weights = weights;

        // Prevent adding sets with no findable emojis? Or allow 'visuals only' sets?
        // Let's allow them for now.

        patchSets.push(newSet);
    });

    // If somehow no patch sets were defined (shouldn't happen with a default), add a minimal fallback
     if (patchSets.length === 0) {
         console.warn("No patch sets defined, using minimal fallback.");
         patchSets.push({
             common: parseEmojiString('🍎'),
             uncommon: [],
             rare: [],
             dirtVisuals: parseEmojiString('🟫'),
             holeVisuals: parseEmojiString('🕳️')
         });
     }


    // Only parse initial recipes ONCE at the start of the game
    recipes = parseRecipes(recipesInput.value); // Initialize recipes from input

    inventory.clear();
    selectedCraftItems = [];
    updateInventoryDisplay();
    updateSelectedCraftItemsDisplay();
    updateCraftButtonState();
    updateRecipeList(); // Display initial recipes
    craftingFeedback.textContent = '';

    console.log("Defined Patch Sets:", patchSets);
    console.log("Recipes:", Array.from(recipes.entries()));

    // Generate game grid
    generateGameGrid();

    // Hide setup, show game
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    // Initialize audio on user gesture
    initAudio();
}

function generateGameGrid() {
    gameArea.innerHTML = ''; // Clear previous grid
    // Determine grid size - maybe a fixed number of cells or responsive?
    // Let's create a reasonable number, e.g., 50-100 patches
    const numberOfPatches = 70; // Can adjust this
    totalDirtPatches = numberOfPatches; // Set total count
    dugPatchesCount = 0; // Reset dug count

    for (let i = 0; i < numberOfPatches; i++) {
        const patch = document.createElement('div');
        patch.classList.add('dirt-patch');

        // Randomly select a patch set for this patch
        const randomSetIndex = Math.floor(Math.random() * patchSets.length);
        const selectedSet = patchSets[randomSetIndex];

        // Store the index so we know which set it belongs to when dug
        patch.dataset.setIndex = randomSetIndex;

        // Set the initial visual emoji based on the selected set's dirt visuals
        patch.textContent = getRandomEmoji(selectedSet.dirtVisuals);

        patch.dataset.index = i; // Store index if needed later (e.g., to reveal specific patch)
        patch.addEventListener('click', handlePatchClick);
        gameArea.appendChild(patch);
    }
     console.log(`Generated ${totalDirtPatches} dirt patches using ${patchSets.length} patch sets.`);
}

function handlePatchClick(event) {
    const patch = event.target;
    if (patch.classList.contains('dug-patch')) {
        return; // Don't dig if already dug
    }

    // Mark as dug
    patch.classList.add('dug-patch');
    patch.removeEventListener('click', handlePatchClick);

    // Play dig sound
    playSound(digSoundBuffer);

    // Get the patch set assigned to this patch
    const setIndex = parseInt(patch.dataset.setIndex, 10);
    const patchSet = patchSets[setIndex];

    if (!patchSet) {
        console.error(`Patch clicked with invalid set index: ${setIndex}`);
         patch.textContent = '❌'; // Indicate error
         dugPatchesCount++; // Still count as dug
         if (dugPatchesCount >= totalDirtPatches) {
            setTimeout(generateGameGrid, 500);
         }
         return; // Stop processing
    }

    // Determine what is found using the emoji pools from this specific patch set
    const foundItem = determineFoundItem(patchSet.common, patchSet.uncommon, patchSet.rare, weights);

    if (foundItem) {
        // Display emoji in the patch
        patch.textContent = foundItem;

        // Add to inventory
        inventory.set(foundItem, (inventory.get(foundItem) || 0) + 1);
        updateInventoryDisplay(); // Update display to show new item
    } else {
        // Display nothing (or a visual cue for empty)
        // Use a random customized hole emoji from the patch's set
        patch.textContent = getRandomEmoji(patchSet.holeVisuals);
    }

    // Increment dug count and check if all patches are dug
    dugPatchesCount++;
    if (dugPatchesCount >= totalDirtPatches) {
        console.log("All patches dug. Regenerating grid.");
        // Wait a moment before regenerating if desired, or do it immediately
        // For now, regenerate immediately:
        setTimeout(generateGameGrid, 500); // Add a small delay for effect
    }
}

// Modified to accept specific emoji pools and weights
function determineFoundItem(commonPool, uncommonPool, rarePool, probabilityWeights) {
    const possibleItems = [];

    // Add common emojis based on weight
    commonPool.forEach(emoji => {
        for (let i = 0; i < probabilityWeights.common; i++) {
            possibleItems.push(emoji);
        }
    });

    // Add uncommon emojis based on weight
    uncommonPool.forEach(emoji => {
        for (let i = 0; i < probabilityWeights.uncommon; i++) {
            possibleItems.push(emoji);
        }
    });

    // Add rare emojis based on weight
    rarePool.forEach(emoji => {
        for (let i = 0; i < probabilityWeights.rare; i++) {
            possibleItems.push(emoji);
        }
    });

    // Add 'nothing' based on weight (use a special marker like null or unique string)
    for (let i = 0; i < probabilityWeights.nothing; i++) {
        possibleItems.push(null); // Use null to represent finding nothing
    }

     // If somehow no possible items were added (e.g., all pools were empty), return null
     if (possibleItems.length === 0) {
         console.warn("determineFoundItem: No possible items generated.");
         return null; // Ensure finding nothing if pools are empty
     }

    // Pick a random item from the weighted list
    const randomIndex = Math.floor(Math.random() * possibleItems.length);
    return possibleItems[randomIndex];
}

// --- Inventory Display and Selection ---

function updateInventoryDisplay() {
    inventoryList.innerHTML = ''; // Clear current display

    // Temporary array to build the list of all individual emojis
    const allInventoryEmojis = [];
    // Use Array.from(inventory.keys()).sort() to process keys in consistent order
    const sortedEmojis = Array.from(inventory.keys()).sort();

    for (const emoji of sortedEmojis) {
        const count = inventory.get(emoji) || 0; // Ensure count is at least 0
        for (let i = 0; i < count; i++) {
            allInventoryEmojis.push(emoji);
        }
    }

    // Sort the final flat list to ensure all same emojis are grouped,
    // which helps the visual selection logic below.
    allInventoryEmojis.sort();

    // This map tracks how many visual selections of each emoji we need to apply
    const selectedCountMap = new Map();
    selectedCraftItems.forEach(emoji => {
        selectedCountMap.set(emoji, (selectedCountMap.get(emoji) || 0) + 1);
    });

    // This map tracks how many visual selections of each emoji we've already applied
    const currentVisualSelectionCount = new Map();

    // Create items for each individual emoji
    for (const emoji of allInventoryEmojis) {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('inventory-item');
        itemDiv.dataset.emoji = emoji;
        itemDiv.textContent = emoji; // Just the emoji
        itemDiv.addEventListener('click', handleInventoryItemClick);

        // Check if this emoji should be visually selected based on selectedCraftItems
        const requiredSelections = selectedCountMap.get(emoji) || 0;
        const currentSelections = currentVisualSelectionCount.get(emoji) || 0;

        if (currentSelections < requiredSelections) {
             itemDiv.classList.add('selected');
             currentVisualSelectionCount.set(emoji, currentSelections + 1);
        }

        inventoryList.appendChild(itemDiv);
    }
}

function handleInventoryItemClick(event) {
    const itemDiv = event.target.closest('.inventory-item');
    if (!itemDiv) return; // Should not happen if event listener is on itemDiv

    const emoji = itemDiv.dataset.emoji;

    // Check if this specific itemDiv is already selected
    if (itemDiv.classList.contains('selected')) {
        // Item is currently selected, deselect THIS specific itemDiv
        itemDiv.classList.remove('selected');
        // Remove the FIRST instance of this emoji from selectedCraftItems array state
        const indexToRemove = selectedCraftItems.findIndex(item => item === emoji);
        if (indexToRemove !== -1) {
            selectedCraftItems.splice(indexToRemove, 1);
        }
    } else {
        // Item is not selected, select it if less than 2 are selected
        if (selectedCraftItems.length < 2) {
            itemDiv.classList.add('selected');
            selectedCraftItems.push(emoji);
        }
    }

    // Update crafting displays based on new selection state
    updateSelectedCraftItemsDisplay();
    updateCraftButtonState();

    // updateInventoryDisplay is called after inventory changes (dig, craft).
    // Visual selection is managed directly on click here.
}


function updateSelectedCraftItemsDisplay() {
    selectedCraftItemsDiv.innerHTML = ''; // Clear current display
    if (selectedCraftItems.length === 0) {
        selectedCraftItemsDiv.innerHTML = '<p>Select 2 items from inventory to craft.</p>';
    } else {
        selectedCraftItems.forEach(emoji => {
            const itemSpan = document.createElement('span');
            itemSpan.classList.add('item');
            itemSpan.textContent = emoji;
            selectedCraftItemsDiv.appendChild(itemSpan);
        });
    }
}

function updateCraftButtonState() {
    craftButton.disabled = selectedCraftItems.length !== 2;
    craftingFeedback.textContent = ''; // Clear feedback on selection change
}

function handleCraftClick() {
    if (selectedCraftItems.length !== 2) {
        return; // Should be disabled
    }

    const [item1, item2] = selectedCraftItems;
    const recipeKey = [item1, item2].sort().join('+');
    const resultEmoji = recipes.get(recipeKey);

    // Re-building the map based on selectedCraftItems for local check consistency
    // This map counts how many of each item *currently selected* are needed
    const tempSelectedCountMap = new Map();
    selectedCraftItems.forEach(emoji => {
        tempSelectedCountMap.set(emoji, (tempSelectedCountMap.get(emoji) || 0) + 1);
    });

    // Check if the actual inventory has AT LEAST the number of *currently selected* items
    // (e.g., if crafting 🍎+🍎, we need 2 apples; if crafting 🍎+🍌, we need 1 apple and 1 banana)
     const checkHasItem1 = (inventory.get(item1) || 0) >= (tempSelectedCountMap.get(item1) || 0);
     const checkHasItem2 = (inventory.get(item2) || 0) >= (tempSelectedCountMap.get(item2) || 0);


    if (!checkHasItem1 || !checkHasItem2) {
         console.warn("Inventory mismatch during craft attempt:", { item1, count1: inventory.get(item1), selectedCount1: tempSelectedCountMap.get(item1), item2, count2: inventory.get(item2), selectedCount2: tempSelectedCountMap.get(item2) });
         craftingFeedback.textContent = "Inventory mismatch! Not enough items remain.";
         playSound(craftFailSoundBuffer);
         resetCraftingSelection(); // Clear selection as state is inconsistent
         updateInventoryDisplay(); // Re-render inventory to reflect correct counts
         return;
    }

    // Deduct items from inventory based on the contents of selectedCraftItems
    selectedCraftItems.forEach(itemToDeduct => {
         const currentCount = inventory.get(itemToDeduct) || 0;
         inventory.set(itemToDeduct, currentCount - 1);
         if ((inventory.get(itemToDeduct) || 0) <= 0) {
             inventory.delete(itemToDeduct);
         }
    });


    if (resultEmoji) {
        // Recipe found - add result to inventory
        inventory.set(resultEmoji, (inventory.get(resultEmoji) || 0) + 1);
        craftingFeedback.textContent = `Crafted ${resultEmoji}!`;
        playSound(craftSuccessSoundBuffer);
    } else {
        // No recipe - items are consumed
        craftingFeedback.textContent = "Cannot craft with these items. Items consumed."; // Indicate items are consumed
        playSound(craftFailSoundBuffer);
    }

    // Clear selection and update displays
    resetCraftingSelection();
    updateInventoryDisplay(); // Re-render inventory to show new counts/items
}

function resetCraftingSelection() {
    // Remove 'selected' class from all inventory items before clearing the array
    // We need to find the specific elements that were selected.
    // Since we don't store element references in selectedCraftItems,
    // we can iterate through the *current* DOM items and remove the class.
    document.querySelectorAll('#inventory-list .inventory-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    selectedCraftItems = []; // Clear the state array
    updateSelectedCraftItemsDisplay();
    updateCraftButtonState();
    // updateInventoryDisplay() is called after craft anyway, which rebuilds list.
    // If craft failed *after* item consumption (current logic), list is rebuilt.
    // If craft feedback needs clearing on deselection without crafting,
    // updateCraftButtonState already does that.
}


// --- Add Recipe Functionality ---

function showAddRecipeForm() {
    addRecipeForm.classList.remove('hidden');
    showAddRecipeButton.classList.add('hidden');
    newRecipeInput.value = ''; // Clear input
    craftingFeedback.textContent = ''; // Clear feedback when showing form
    newRecipeInput.focus();
}

function hideAddRecipeForm() {
    addRecipeForm.classList.add('hidden');
    showAddRecipeButton.classList.remove('hidden');
    // craftingFeedback.textContent = ''; // Keep success/fail feedback visible until next action
}

function handleAddRecipe() {
    const recipeStr = newRecipeInput.value.trim();
    if (recipeStr === '') {
        craftingFeedback.textContent = 'Please enter a recipe.';
        playSound(craftFailSoundBuffer); // Play fail sound for invalid input
        return;
    }

    const parts = recipeStr.split('=');
    if (parts.length !== 2) {
         craftingFeedback.textContent = 'Invalid format. Use emoji1+emoji2=result.';
         playSound(craftFailSoundBuffer); // Play fail sound for invalid input
         return;
    }

    const ingredientsStr = parts[0].trim();
    const result = parts[1].trim();
    const ingredients = ingredientsStr.split('+').map(i => i.trim()).filter(i => i !== '');

    if (ingredients.length !== 2 || ingredients[0] === '' || ingredients[1] === '' || result === '') {
        craftingFeedback.textContent = 'Invalid format. Use emoji1+emoji2=result.';
        playSound(craftFailSoundBuffer); // Play fail sound for invalid input
        return;
    }

    const key = ingredients.sort().join('+');

    if (recipes.has(key)) {
         craftingFeedback.textContent = 'Recipe already exists.';
         playSound(craftFailSoundBuffer); // Play fail sound for existing recipe
         return;
    }

    recipes.set(key, result);
    updateRecipeList();
    craftingFeedback.textContent = `Recipe added: ${formatRecipeKey(key)} = ${result}`;
    playSound(craftSuccessSoundBuffer); // Play success sound for adding recipe
    hideAddRecipeForm(); // Hide form after successful add
}


// --- Reset Game Functionality ---
function resetGame() {
    // Clear game state
    inventory.clear();
    selectedCraftItems = [];
    // Do NOT clear recipes, allow player to keep learned/added recipes
    craftingFeedback.textContent = '';

    // Reset patch sets state (clear dynamic inputs and array)
    patchSets = []; // Clear the array
    dynamicPatchSetsContainer.innerHTML = ''; // Clear dynamically added inputs

    // Reset game area state
    totalDirtPatches = 0;
    dugPatchesCount = 0;

    // Reset DOM
    gameArea.innerHTML = ''; // Clear dirt patches
    inventoryList.innerHTML = ''; // Clear inventory display
    selectedCraftItemsDiv.innerHTML = '<p>Select 2 items from inventory to craft.</p>'; // Reset craft selection display
    // currentRecipesList stays as is (contains added recipes)
    addRecipeForm.classList.add('hidden'); // Hide add recipe form
    showAddRecipeButton.classList.remove('hidden'); // Show add recipe button
    newRecipeInput.value = ''; // Clear add recipe input


    // Show setup screen, hide game screen
    setupScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');

    // Setup input values are kept as they were when the reset button was clicked.
    // Player can modify them before starting again.

    // Audio context might be suspended, will be resumed by startGame if needed.
    console.log("Game state reset.");
}


// --- Event Listeners ---
startGameButton.addEventListener('click', startGame);
craftButton.addEventListener('click', handleCraftClick);
showAddRecipeButton.addEventListener('click', showAddRecipeForm);
addRecipeButton.addEventListener('click', handleAddRecipe);
cancelAddRecipeButton.addEventListener('click', hideAddRecipeForm);
// Add listener for reset button
resetGameButton.addEventListener('click', resetGame);
// Add listener for add patch set button
addPatchSetButton.addEventListener('click', addPatchSetInputs);


// Optional: Allow pressing Enter in new recipe input
newRecipeInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission if it were a form
        handleAddRecipe();
    }
});


// Initial setup display
setupScreen.classList.remove('hidden');
gameScreen.classList.add('hidden');

// Initialize visual emoji inputs with defaults (already set in HTML value)
// No longer needed as they are part of the default patch set inputs

// Initial population of the recipes list on load
// Recipes are parsed in startGame, but the list is updated there.
// We might want to parse the default recipes and show them on load too.
// Let's add a call to updateRecipeList() after parsing initial recipes on load.
// Need to parse recipes on load first.
recipes = parseRecipes(recipesInput.value); // Parse initial recipes on load
updateRecipeList(); // Display initial recipes on load