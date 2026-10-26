// --- Game State and Data Structures ---
let creature = {
    name: 'My Creature',
    startEmoji: '🥚', // Canonical Day 0 emoji
    stages: [], // Now only stores stages for day > 0
    needs: {}, // Populated dynamically based on care items
    currentNeedLevels: {}, // Current values for each need
    dayUnitName: 'Day' // New: Stores the custom name for 'Day'
};

let careItems = []; // Array of { id, name, emoji, dailyIncrease, decreaseOnUse }
let currentDay = 0;
let gameStarted = false;

// --- DOM Elements ---
const creationMode = document.getElementById('creation-mode');
const gameMode = document.getElementById('game-mode');

// Creature Creation Elements
const creatureNameInput = document.getElementById('creature-name');
const creatureStartEmojiInput = document.getElementById('creature-start-emoji');
const dayUnitNameInput = document.getElementById('day-unit-name'); // New: Day unit name input
const stagesContainer = document.getElementById('stages-container');
const addStageBtn = document.getElementById('add-stage-btn');

// Care Item Creation Elements
const careItemNameInput = document.getElementById('care-item-name');
const careItemEmojiInput = document.getElementById('care-item-emoji');
const careItemDailyIncreaseInput = document.getElementById('care-item-daily-increase');
const careItemDecreaseOnUseInput = document.getElementById('care-item-decrease-on-use');
const addCareItemBtn = document.getElementById('add-care-item-btn');
const careItemsList = document.getElementById('care-items-list');

// Game Mode Elements
const startGameBtn = document.getElementById('start-game-btn');
const gameCreatureNameDisplay = document.getElementById('game-creature-name');
const dayUnitDisplay = document.getElementById('day-unit-display'); // New: Element to display custom day unit
const currentDayDisplay = document.getElementById('current-day-display');
const creatureEmojiDisplay = document.getElementById('creature-emoji');
const needsList = document.getElementById('needs-list');
const careItemsTray = document.getElementById('care-items-tray');
const skipDayBtn = document.getElementById('skip-day-btn');
const skipDayUnitBtn = document.getElementById('skip-day-unit-btn'); // New: Element for "Skip 1 Day" button
const creatureDropTarget = document.getElementById('creature-display');
const resetGameBtn = document.getElementById('reset-game-btn');

// --- Helper Functions ---

function generateUniqueId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

function saveGameState() {
    localStorage.setItem('creature', JSON.stringify(creature));
    localStorage.setItem('careItems', JSON.stringify(careItems));
    localStorage.setItem('currentDay', currentDay);
    localStorage.setItem('gameStarted', gameStarted);
}

function loadGameState() {
    const savedCreature = localStorage.getItem('creature');
    const savedCareItems = localStorage.getItem('careItems');
    const savedCurrentDay = localStorage.getItem('currentDay');
    const savedGameStarted = localStorage.getItem('gameStarted');

    if (savedCreature && savedCareItems && savedCurrentDay && savedGameStarted !== null) {
        // Parse creature and merge with default structure for new properties (like dayUnitName)
        const loadedCreature = JSON.parse(savedCreature);
        creature = { ...creature, ...loadedCreature }; // Merge to retain default for new properties if old save
        
        careItems = JSON.parse(savedCareItems);
        currentDay = parseInt(savedCurrentDay, 10);
        gameStarted = JSON.parse(savedGameStarted);

        if (gameStarted) {
            switchToGameMode();
            renderGameUI();
        } else {
            renderCreationUI();
        }
    } else {
        // Initialize creature.stages as empty if no saved game, as it only stores growth stages
        creature.stages = [];
        renderCreationUI();
    }
}

// --- Creation Mode Functions ---

// Function to add input fields for a *growth* stage (day > 0)
function addGrowthStageInput(emoji = '', day = '') {
    const stageId = generateUniqueId();
    const stageDiv = document.createElement('div');
    stageDiv.classList.add('stage-entry');
    stageDiv.dataset.id = stageId;

    // min="1" ensures day is greater than 0 for growth stages
    stageDiv.innerHTML = `
        <label>Day:</label>
        <input type="number" class="stage-day-input" value="${day}" min="1">
        <label>Appearance:</label>
        <input type="text" class="stage-emoji-input" value="${emoji}" maxlength="2">
        <button class="remove-button remove-stage-btn">Remove</button>
    `;
    stagesContainer.appendChild(stageDiv);

    // Add event listener for remove button
    stageDiv.querySelector('.remove-stage-btn').addEventListener('click', () => {
        stageDiv.remove();
        updateGrowthStagesData(); // Update data model after removal
    });

    // Add input event listeners to update data immediately
    stageDiv.querySelector('.stage-day-input').addEventListener('input', updateGrowthStagesData);
    stageDiv.querySelector('.stage-emoji-input').addEventListener('input', updateGrowthStagesData);

    updateGrowthStagesData(); // Update data model after adding
}

// Function to update the creature.stages array from UI inputs (only for day > 0 stages)
function updateGrowthStagesData() {
    const newStages = [];
    const stageEntries = stagesContainer.querySelectorAll('.stage-entry');

    stageEntries.forEach(entry => {
        const dayInput = entry.querySelector('.stage-day-input');
        const emojiInput = entry.querySelector('.stage-emoji-input');

        const day = parseInt(dayInput.value, 10);
        const emoji = emojiInput.value.trim();

        if (!isNaN(day) && day > 0 && emoji) { // Only allow stages with day > 0
            newStages.push({ day, emoji });
        } else if (day <= 0 && emoji) {
            // If user attempts to set day 0 here, give feedback and clear input
            alert("Day must be greater than 0 for growth stages. Use the 'Day 0 Appearance' field for the creature's starting emoji.");
            dayInput.value = '';
            // Don't add this invalid stage to newStages
        }
    });

    // Sort stages by day
    newStages.sort((a, b) => a.day - b.day);

    // Filter out duplicate days, keeping the last one entered
    const uniqueStagesMap = new Map();
    newStages.forEach(stage => uniqueStagesMap.set(stage.day, stage));
    creature.stages = Array.from(uniqueStagesMap.values());

    saveGameState();
}

// Function to render the growth stages in the creation UI
function renderGrowthStagesInCreation() {
    stagesContainer.innerHTML = ''; // Clear existing stages
    creature.stages.forEach(stage => {
        addGrowthStageInput(stage.emoji, stage.day);
    });
}


function addCareItem() {
    const name = careItemNameInput.value.trim();
    const emoji = careItemEmojiInput.value.trim();
    const dailyIncrease = parseInt(careItemDailyIncreaseInput.value, 10);
    const decreaseOnUse = parseInt(careItemDecreaseOnUseInput.value, 10);

    if (!name || !emoji || isNaN(dailyIncrease) || isNaN(decreaseOnUse) || dailyIncrease < 0 || decreaseOnUse < 0) {
        alert('Please fill in all care item fields correctly.');
        return;
    }

    // Check for duplicate care item names
    if (careItems.some(item => item.name.toLowerCase() === name.toLowerCase())) {
        alert('A care item with this name already exists. Please choose a different name.');
        return;
    }

    const newItem = {
        id: generateUniqueId(),
        name,
        emoji,
        dailyIncrease,
        decreaseOnUse
    };
    careItems.push(newItem);
    renderCareItemsList();
    saveGameState(); // Save after adding a care item

    // Clear form
    careItemNameInput.value = '';
    careItemEmojiInput.value = '';
    careItemDailyIncreaseInput.value = '10';
    careItemDecreaseOnUseInput.value = '30';
}

function renderCareItemsList() {
    careItemsList.innerHTML = '';
    if (careItems.length === 0) {
        careItemsList.innerHTML = '<li style="text-align: center; color: #777;">No care items added yet.</li>';
        return;
    }
    careItems.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><strong>${item.name}</strong> (${item.emoji}) - Needs +${item.dailyIncrease}/${creature.dayUnitName.toLowerCase()}, Use: -${item.decreaseOnUse}</span>
            <button class="remove-button" data-id="${item.id}">Remove</button>
        `;
        careItemsList.appendChild(li);
    });

    careItemsList.querySelectorAll('.remove-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const idToRemove = e.target.dataset.id;
            careItems = careItems.filter(item => item.id !== idToRemove);
            renderCareItemsList();
            saveGameState(); // Save after removing a care item
        });
    });
}

function renderCreationUI() {
    creationMode.classList.remove('hidden');
    gameMode.classList.add('hidden');

    creatureNameInput.value = creature.name === 'My Creature' ? '' : creature.name;
    creatureStartEmojiInput.value = creature.startEmoji; // Always load from creature.startEmoji
    dayUnitNameInput.value = creature.dayUnitName; // New: Load day unit name
    renderGrowthStagesInCreation(); // Render only growth stages (day > 0)
    renderCareItemsList();
}


// --- Game Mode Functions ---

function startGame() {
    // Validate creature and care items
    const creatureName = creatureNameInput.value.trim();
    const startEmoji = creatureStartEmojiInput.value.trim();
    const customDayUnit = dayUnitNameInput.value.trim();

    if (!startEmoji) {
        alert('Please set a starting emoji for your creature (Day 0 Appearance).');
        return;
    }
    if (careItems.length === 0) {
        alert('Please add at least one care item to play the game.');
        return;
    }

    creature.name = creatureName || 'My Creature';
    creature.startEmoji = startEmoji; // Ensure the current value from input is saved
    creature.dayUnitName = customDayUnit || 'Day'; // Ensure custom day unit is saved

    // Initialize current need levels for all care items
    creature.currentNeedLevels = {};
    careItems.forEach(item => {
        creature.currentNeedLevels[item.id] = 0; // Start all needs at 0
    });

    currentDay = 0;
    gameStarted = true;
    switchToGameMode();
    renderGameUI();
    saveGameState();
}

function switchToGameMode() {
    creationMode.classList.add('hidden');
    gameMode.classList.remove('hidden');
}

function renderGameUI() {
    gameCreatureNameDisplay.textContent = creature.name;
    dayUnitDisplay.textContent = creature.dayUnitName; // Update day unit display
    currentDayDisplay.textContent = currentDay;
    skipDayUnitBtn.textContent = creature.dayUnitName; // Update "Skip 1 Day" button text

    // Determine current creature emoji
    let currentEmoji = creature.startEmoji; // Start with Day 0 emoji
    // Find the latest applicable growth stage (creature.stages is already sorted by day)
    for (const stage of creature.stages) {
        if (currentDay >= stage.day) {
            currentEmoji = stage.emoji;
        } else {
            // Since stages are sorted, if currentDay is less than this stage's day,
            // it will be less than all subsequent stages' days too.
            break;
        }
    }
    creatureEmojiDisplay.textContent = currentEmoji;

    // Render needs
    needsList.innerHTML = '';
    if (Object.keys(creature.currentNeedLevels).length === 0) {
        needsList.innerHTML = '<li>No needs defined yet. Add care items in creation mode.</li>';
    } else {
        careItems.forEach(item => {
            const needLevel = creature.currentNeedLevels[item.id] || 0;
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${item.emoji} ${item.name}:</span>
                <span class="need-value">${needLevel}</span>
            `;
            needsList.appendChild(li);
        });
    }

    // Render draggable care items
    careItemsTray.innerHTML = '<h3>Care Items</h3>'; // Clear and re-add title
    if (careItems.length === 0) {
        const noItemsMessage = document.createElement('p');
        noItemsMessage.textContent = 'No care items available.';
        noItemsMessage.style.textAlign = 'center';
        noItemsMessage.style.color = '#777';
        careItemsTray.appendChild(noItemsMessage);
    } else {
        careItems.forEach(item => {
            const div = document.createElement('div');
            div.classList.add('draggable-item');
            div.setAttribute('draggable', true);
            div.dataset.careItemId = item.id;
            div.innerHTML = `
                ${item.emoji}
                <span class="item-name-tag">${item.name}</span>
            `;
            careItemsTray.appendChild(div);
        });
    }

    addDragDropListeners();
    saveGameState();
}

function skipDay() {
    currentDay++;
    careItems.forEach(item => {
        creature.currentNeedLevels[item.id] += item.dailyIncrease;
    });
    renderGameUI();
}

function useCareItem(itemId) {
    const item = careItems.find(i => i.id === itemId);
    if (item) {
        // The Math.max(0, ...) ensures the need level does not go below zero,
        // effectively "filling the need all the way" if the decrease amount is greater than the current need.
        creature.currentNeedLevels[item.id] = Math.max(0, creature.currentNeedLevels[item.id] - item.decreaseOnUse);
        renderGameUI();
        saveGameState(); // Save after using item
    }
}

function resetGame() {
    if (confirm('Are you sure you want to reset the game? All progress will be lost.')) {
        localStorage.clear();
        creature = {
            name: 'My Creature',
            startEmoji: '🥚', // Reset to default emoji
            stages: [], // Reset to empty array for growth stages
            needs: {},
            currentNeedLevels: {},
            dayUnitName: 'Day' // Reset to default day unit name
        };
        careItems = [];
        currentDay = 0;
        gameStarted = false;
        renderCreationUI();
        alert('Game has been reset. You can now create a new game.');
    }
}

// --- Drag and Drop Logic ---
let draggedItem = null;

function addDragDropListeners() {
    // Remove existing listeners to prevent duplicates
    document.querySelectorAll('.draggable-item').forEach(item => {
        item.removeEventListener('dragstart', handleDragStart);
        item.removeEventListener('dragend', handleDragEnd);
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
    });

    creatureDropTarget.removeEventListener('dragenter', handleDragEnter);
    creatureDropTarget.removeEventListener('dragover', handleDragOver);
    creatureDropTarget.removeEventListener('dragleave', handleDragLeave);
    creatureDropTarget.removeEventListener('drop', handleDrop);

    creatureDropTarget.addEventListener('dragenter', handleDragEnter);
    creatureDropTarget.addEventListener('dragover', handleDragOver);
    creatureDropTarget.addEventListener('dragleave', handleDragLeave);
    creatureDropTarget.addEventListener('drop', handleDrop);
}

function handleDragStart(e) {
    draggedItem = e.target;
    e.dataTransfer.setData('text/plain', e.target.dataset.careItemId);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
    draggedItem = null;
}

function handleDragEnter(e) {
    e.preventDefault();
    creatureDropTarget.classList.add('drag-over');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragLeave() {
    creatureDropTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    creatureDropTarget.classList.remove('drag-over');
    const careItemId = e.dataTransfer.getData('text/plain');
    if (careItemId) {
        useCareItem(careItemId);
    }
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadGameState);

creatureNameInput.addEventListener('input', (e) => {
    creature.name = e.target.value.trim();
    saveGameState();
});

creatureStartEmojiInput.addEventListener('input', (e) => {
    creature.startEmoji = e.target.value.trim(); // Directly update startEmoji
    saveGameState(); // Save immediately
});

dayUnitNameInput.addEventListener('input', (e) => { // New: Event listener for day unit name
    creature.dayUnitName = e.target.value.trim();
    saveGameState();
    // Re-render care items list in creation mode to update day unit name in description
    renderCareItemsList(); 
    // If in game mode, update immediately
    if (gameStarted) {
        dayUnitDisplay.textContent = creature.dayUnitName;
        skipDayUnitBtn.textContent = creature.dayUnitName;
    }
});

addStageBtn.addEventListener('click', () => addGrowthStageInput());
addCareItemBtn.addEventListener('click', addCareItem);
startGameBtn.addEventListener('click', startGame);
skipDayBtn.addEventListener('click', skipDay);
resetGameBtn.addEventListener('click', resetGame);

// Initial render for creation mode
if (!gameStarted) {
    renderCreationUI();
}