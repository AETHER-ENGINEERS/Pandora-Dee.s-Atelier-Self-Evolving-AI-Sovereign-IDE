// Import Three.js (not strictly needed for this current Div-based approach,
// but kept as per prompt mentioning possibility of 3D libraries)
// import * as THREE from 'three'; // Keeping this commented out for now

const gameArea = document.getElementById('game-area');
const selectedObjectNameSpan = document.getElementById('selected-object-name');
// Get reference to the new pattern display span
const selectedObjectPatternSpan = document.getElementById('selected-object-pattern');

const actionSelect = document.getElementById('action-select');
const applyActionButton = document.getElementById('apply-action-button');
const newObjectShapeSelect = document.getElementById('new-object-shape');
const newObjectNameInput = document.getElementById('new-object-name');
const newObjectColorInput = document.getElementById('new-object-color');
// Get reference to the new pattern select input
const newObjectPatternSelect = document.getElementById('new-object-pattern');
// Get reference to the new pattern color input
const newObjectPatternColorInput = document.getElementById('new-object-pattern-color');
// Get references to the new pattern color source radio buttons
const patternColorDarkerRadio = document.getElementById('pattern-color-darker');
const patternColorLighterRadio = document.getElementById('pattern-color-lighter'); // Get lighter radio
const patternColorCustomRadio = document.getElementById('pattern-color-custom');

const addObjectButton = document.getElementById('add-object-button'); // Get reference to the button

// Display Text controls
const displayTextControlsDiv = document.getElementById('display-text-controls');
const displayTextInput = document.getElementById('display-text-input');
const displayTextDurationInput = document.getElementById('display-text-duration');

// Get new elements for toggling the creator section
const addObjectCreatorDiv = document.getElementById('add-object-creator');
const toggleAddObjectButton = document.getElementById('toggle-add-object');

// Get new elements for the mixer section
const objectMixerDiv = document.getElementById('object-mixer');
const toggleMixerButton = document.getElementById('toggle-mixer');
const mixerObject1Select = document.getElementById('mixer-object1');
const mixerObject2Select = document.getElementById('mixer-object2');
const mixerLogicRadios = document.querySelectorAll('input[name="mixer-logic"]');
const mixObjectsButton = document.getElementById('mix-objects-button');
// Get the new input for mixed object name
const mixedObjectNameInput = document.getElementById('mixed-object-name');

// Get references to the new randomize buttons
const randomizeActionButton = document.getElementById('randomize-action-button');
const randomizeAddObjectButton = document.getElementById('randomize-add-object-button');
const randomizeMixerButton = document.getElementById('randomize-mixer-button');

// Get new elements for Randomize Action Manager
const actionRandomizerManagerDiv = document.getElementById('action-randomizer-manager');
const toggleActionManagerButton = document.getElementById('toggle-action-manager');
const actionRandomizerOptionsDiv = document.getElementById('action-randomizer-options');

// Get new elements for Randomize Mixer Manager
const mixerRandomizerManagerDiv = document.getElementById('mixer-randomizer-manager');
const toggleMixerManagerButton = document.getElementById('toggle-mixer-manager');
const mixerRandomizerOptionsDiv = document.getElementById('mixer-randomizer-options');

// Get new elements for Name Randomizer Manager
const nameRandomizerManagerDiv = document.getElementById('name-randomizer-manager');
const toggleNameManagerButton = document.getElementById('toggle-name-manager');
const nameRandomizerOptionsDiv = document.getElementById('name-randomizer-options');
// Get references for the new custom character input and button
const customCharInput = document.getElementById('custom-char-input');
const addCustomCharButton = document.getElementById('add-custom-char-button');
 // Get references for the new min/max length inputs
const minNameLengthInput = document.getElementById('min-name-length');
const maxNameLengthInput = document.getElementById('max-name-length');
// Get reference for the new remove-on-mix toggle
const removeOnMixCheckbox = document.getElementById('remove-on-mix');


// State variables
let selectedObject = null;
let objects = [];
// Counters for naming new objects of specific types when name is not provided
let boxCounter = 0;
let sphereCounter = 0;
let coneCounter = 0;
let starCounter = 0;
let mixedCounter = 0;

// State variables for randomizer managers
let allowedRandomActions = new Set();
let allowedMixerObjects = new Set();
// State variable for allowed characters in random names
let allowedRandomChars = new Set();
// Store characters added manually by the user
let customAddedChars = new Set();

// Default min/max name length
let minNameLength = 3;
let maxNameLength = 12;


// Define the base set of possible characters for random names
const baseChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+[]{}|;:',.<>?/~`-=";


// Drag state variables
let isDragging = false;
let dragObject = null;
let startPointerX = 0;
let startPointerY = 0;
let startTranslateX = 0;
let startTranslateY = 0;
let startObjectVisualLeftInGameArea = 0;
let startObjectVisualTopInGameArea = 0;
let startObjectVisualWidth = 0;
let startObjectVisualHeight = 0;

// Utility functions
function darkenHexColor(hex, percent) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r = Math.max(0, Math.floor(r * (1 - percent / 100)));
    g = Math.max(0, Math.floor(g * (1 - percent / 100)));
    b = Math.max(0, Math.floor(b * (1 - percent / 100)));

    const toHex = (c) => c.toString(16).padStart(2, '0');

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lightenHexColor(hex, percent) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    // Corrected the Math.min call for the blue component
    r = Math.min(255, Math.floor(r * (1 + percent / 100)));
    g = Math.min(255, Math.floor(g * (1 + percent / 100)));
    b = Math.min(255, Math.floor(b * (1 + percent / 100)));

    const toHex = (c) => c.toString(16).padStart(2, '0');

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHexColors(hex1, hex2) {
    if (!hex1 || hex1.length !== 7 || !hex2 || hex2.length !== 7) {
        console.warn("Invalid hex colors provided for mixing.");
        return hex1 || '#808080';
    }

    let r1 = parseInt(hex1.slice(1, 3), 16);
    let g1 = parseInt(hex1.slice(3, 5), 16);
    let b1 = parseInt(hex1.slice(5, 7), 16);

    let r2 = parseInt(hex2.slice(1, 3), 16);
    let g2 = parseInt(hex2.slice(3, 5), 16);
    let b2 = parseInt(hex2.slice(5, 7), 16);

    let r = Math.floor((r1 + r2) / 2);
    let g = Math.floor((g1 + g2) / 2);
    let b = Math.floor((b1 + b2) / 2);

    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    const toHex = (c) => c.toString(16).padStart(2, '0');

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getRandomHexColor() {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

 // Function to generate a random name based on allowed tokens and length (tokens may be multi-char)
function generateRandomName() {
    // Use the current values from the inputs, parsing them as integers (these are token counts)
    let currentMinLength = parseInt(minNameLengthInput.value) || 0;
    let currentMaxLength = parseInt(maxNameLengthInput.value) || 0;

    // Basic validation: Ensure min is not negative, max is not negative, and max >= min
    currentMinLength = Math.max(0, currentMinLength);
    currentMaxLength = Math.max(0, currentMaxLength);
    if (currentMaxLength < currentMinLength) {
         currentMaxLength = currentMinLength; // Ensure max is at least min
         maxNameLengthInput.value = currentMaxLength; // Update input field
    }

    const tokenCount = (currentMaxLength === currentMinLength) ? currentMinLength : Math.floor(Math.random() * (currentMaxLength - currentMinLength + 1)) + currentMinLength;

    if (allowedRandomChars.size === 0) {
        console.warn("No characters/tokens allowed for random names. Using a default name.");
        return `Random ${Math.random().toString(36).substr(2, 4)}`;
    }

    const availableTokens = Array.from(allowedRandomChars); // tokens may be multi-character
    let randomName = '';
    for (let i = 0; i < tokenCount; i++) {
        const randomIndex = Math.floor(Math.random() * availableTokens.length);
        randomName += availableTokens[randomIndex];
    }
    return randomName;
}

// Object management
function createObject(name, type, color, pattern, patternColor, patternColorSource, x, y) {
    const objectDiv = document.createElement('div');
    objectDiv.classList.add('object');
    objectDiv.dataset.name = name;
    objectDiv.dataset.type = type;
    objectDiv.dataset.color = color;
    objectDiv.dataset.pattern = pattern;
    objectDiv.dataset.id = `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    objectDiv.dataset.patternColorSource = patternColorSource;
    objectDiv.dataset.patternColor = patternColor;

    objectDiv.dataset.eatCount = '0';

    if (type === 'sphere') {
        objectDiv.classList.add('sphere');
    } else if (type === 'cone') {
        objectDiv.classList.add('cone');
    } else if (type === 'star') {
        objectDiv.classList.add('star');
    }
    else {
        objectDiv.classList.add('box');
    }

    objectDiv.style.setProperty('--object-color', color);
    objectDiv.style.setProperty('--object-pattern-color', patternColor);

    objectDiv.dataset.initialX = x;
    objectDiv.dataset.initialY = y;
    objectDiv.style.left = `${x}px`;
    objectDiv.style.top = `${y}px`;

    objectDiv.dataset.translateX = '0';
    objectDiv.dataset.translateY = '0';
    objectDiv.dataset.rotate = '0';
    objectDiv.dataset.scale = '1';

    objectDiv.style.setProperty('--translate-x', '0px');
    objectDiv.style.setProperty('--translate-y', '0px');
    objectDiv.style.setProperty('--rotate', '0deg');
    objectDiv.style.setProperty('--scale', '1');

    objectDiv.dataset.broken = 'false';

    gameArea.appendChild(objectDiv);
    objects.push(objectDiv);

    updateMixerObjectSelects();
    populateMixerRandomizerOptions(); // Update mixer manager options when object is added

    return objectDiv;
}

// Selection logic
function selectObject(objectDiv) {
    if (selectedObject && selectedObject !== objectDiv) {
        selectedObject.classList.remove('selected');
    }

    if (objectDiv) {
        selectedObject = objectDiv;
        selectedObject.classList.add('selected');

        selectedObjectNameSpan.textContent = objectDiv.dataset.name;
        selectedObjectPatternSpan.textContent = objectDiv.dataset.pattern.charAt(0).toUpperCase() + objectDiv.dataset.pattern.slice(1);
    } else {
        selectedObject = null;
        selectedObjectNameSpan.textContent = 'None';
        selectedObjectPatternSpan.textContent = 'None';
    }
}

// Event listeners
gameArea.addEventListener('pointerdown', (event) => {
    const objectTarget = event.target.closest('.object');
    const pieceTarget = event.target.closest('.piece');

    if (event.target.classList.contains('sucking-in')) {
        event.preventDefault();
        return;
    }

    if (pieceTarget) {
        event.preventDefault();
        event.stopPropagation();
        const parentObject = objects.find(obj => obj.dataset.id === pieceTarget.dataset.parentObjectId);
        if (parentObject) {
            selectObject(parentObject);
        }
        return;
    }

    if (objectTarget) {
        event.preventDefault();

        if (objectTarget.classList.contains('shaking')) {
            return;
        }
        if (objectTarget.dataset.broken === 'true') {
            return;
        }
        if (objectTarget.classList.contains('sucking-in')) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        if (objectTarget === selectedObject) {
            isDragging = true;
            dragObject = objectTarget;
            startPointerX = event.clientX;
            startPointerY = event.clientY;
            startTranslateX = parseFloat(dragObject.dataset.translateX || '0');
            startTranslateY = parseFloat(dragObject.dataset.translateY || '0');

            const gameAreaRect = gameArea.getBoundingClientRect();
            const dragObjectRect = dragObject.getBoundingClientRect();
            startObjectVisualLeftInGameArea = dragObjectRect.left - gameAreaRect.left;
            startObjectVisualTopInGameArea = dragObjectRect.top - gameAreaRect.top;
            startObjectVisualWidth = dragObjectRect.width;
            startObjectVisualHeight = dragObjectRect.height;

            dragObject.classList.add('is-dragging');

            document.addEventListener('pointermove', onPointerMove, { capture: true });
            document.addEventListener('pointerup', onPointerUp, { capture: true });
            dragObject.setPointerCapture(event.pointerId);
        } else {
            selectObject(objectTarget);
        }
    } else {
        console.log("POINTERDOWN: Target is game area background.");
    }
});

function onPointerMove(event) {
    if (!isDragging || !dragObject) {
        return;
    }

    event.preventDefault();

    const gameAreaRect = gameArea.getBoundingClientRect();
    const areaWidth = gameAreaRect.width;
    const areaHeight = gameAreaRect.height;

    const rawDeltaX = event.clientX - startPointerX;
    const rawDeltaY = event.clientY - startPointerY;

    let desiredVisualX_gameArea = startObjectVisualLeftInGameArea + rawDeltaX;
    let desiredVisualY_gameArea = startObjectVisualTopInGameArea + rawDeltaY;

    const clampedVisualX_gameArea = Math.max(0, Math.min(desiredVisualX_gameArea, areaWidth - startObjectVisualWidth));
    const clampedVisualY_gameArea = Math.max(0, Math.min(desiredVisualY_gameArea, areaHeight - startObjectVisualHeight));

    const finalTranslateX = clampedVisualX_gameArea - dragObject.offsetLeft;
    const finalTranslateY = clampedVisualY_gameArea - dragObject.offsetTop;

    dragObject.dataset.translateX = finalTranslateX;
    dragObject.dataset.translateY = finalTranslateY;

    dragObject.style.setProperty('--translate-x', `${finalTranslateX}px`);
    dragObject.style.setProperty('--translate-y', `${finalTranslateY}px`);
}

function onPointerUp(event) {
    if (!isDragging || !dragObject) {
        return;
    }

    event.preventDefault();

    dragObject.releasePointerCapture(event.pointerId);

    dragObject.classList.remove('is-dragging');

    isDragging = false;
    startObjectVisualLeftInGameArea = 0;
    startObjectVisualTopInGameArea = 0;
    startObjectVisualWidth = 0;
    startObjectVisualHeight = 0;
    dragObject = null;

    document.removeEventListener('pointermove', onPointerMove, { capture: true });
    document.removeEventListener('pointerup', onPointerUp, { capture: true });
}

gameArea.addEventListener('click', (event) => {
    if (!event.target.closest('.object') && !event.target.closest('.piece')) {
        if (selectedObject && !isDragging) {
            event.preventDefault();

            const gameAreaRect = gameArea.getBoundingClientRect();
            const objectRect = selectedObject.getBoundingClientRect();

            const tapX_gameArea = event.clientX - gameAreaRect.left;
            const tapY_gameArea = event.clientY - gameAreaRect.top;

            const desiredVisualX_gameArea = tapX_gameArea - objectRect.width / 2;
            const desiredVisualY_gameArea = tapY_gameArea - objectRect.height / 2;

            const buffer = 10;
            const areaWidth = gameAreaRect.width;
            const areaHeight = gameAreaRect.height;
            const objectWidth = objectRect.width;
            const objectHeight = objectRect.height;

            const clampMinX = buffer;
            const clampMinY = buffer;
            const clampMaxX = areaWidth - objectWidth - buffer;
            const clampMaxY = areaHeight - objectHeight - buffer;

            let clampedVisualX_gameArea = desiredVisualX_gameArea;
            let clampedVisualY_gameArea = desiredVisualY_gameArea;

            if (clampMaxX >= clampMinX) {
                clampedVisualX_gameArea = Math.max(clampMinX, Math.min(desiredVisualX_gameArea, clampMaxX));
            } else {
                clampedVisualX_gameArea = (areaWidth - objectWidth) / 2;
            }
            if (clampMaxY >= clampMinY) {
                clampedVisualY_gameArea = Math.max(clampMinY, Math.min(desiredVisualY_gameArea, clampMaxY));
            } else {
                clampedVisualY_gameArea = (areaHeight - objectHeight) / 2;
            }

            const newTranslateX = clampedVisualX_gameArea - selectedObject.offsetLeft;
            const newTranslateY = clampedVisualY_gameArea - selectedObject.offsetTop;

            selectedObject.dataset.translateX = newTranslateX;
            selectedObject.dataset.translateY = newTranslateY;

            selectedObject.style.setProperty('--translate-x', `${newTranslateX}px`);
            selectedObject.style.setProperty('--translate-y', `${newTranslateY}px`);
        } else {
            // Do not deselect if clicking game area background
            // selectObject(null); // Keep object selected when clicking background
        }
    } else {
        console.log("CLICK: On object or piece.");
    }
});

// Actions
function applyAction(action, targetObject) {
    if (!targetObject) {
        console.warn("No object selected to apply action.");
        return;
    }

    // State-based exclusions (apply only if the action is NOT 'fix' for a broken object etc.)
    if (targetObject.dataset.broken === 'true' && action !== 'fix' && action !== 'remove') {
        console.warn(`Cannot apply action '${action}' to a broken object.`);
        alert(`Cannot apply action '${action}' to a broken object. Use 'Fix' first or 'Remove'.`);
        return;
    }

    if (targetObject.dataset.broken !== 'true' && action === 'fix') {
        console.warn("Object is not broken.");
        alert("Object is not broken.");
        return;
    }

    if (targetObject.classList.contains('shaking') && action === 'shake') {
        console.warn("Object is already shaking.");
        alert("Object is already shaking.");
        return;
    }

    if (targetObject.classList.contains('sucking-in')) {
        console.warn(`Cannot apply action '${action}' to object while it is mixing.`);
        alert(`Cannot apply action '${action}' to object while it is mixing.`);
        return;
    }


    let currentRotate = parseFloat(targetObject.dataset.rotate || '0');
    let currentScale = parseFloat(targetObject.dataset.scale || '1');
    let currentTranslateX = parseFloat(targetObject.dataset.translateX || '0');
    let currentTranslateY = parseFloat(targetObject.dataset.translateY || '0');

    switch (action) {
        case 'changeColor':
            if (targetObject.dataset.broken !== 'true') {
                const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                const patternColorSource = targetObject.dataset.patternColorSource || 'darker';

                targetObject.style.setProperty('--object-color', randomColor);

                let newPatternColor = targetObject.dataset.patternColor;

                if (patternColorSource === 'darker') {
                    newPatternColor = darkenHexColor(randomColor, 40);
                } else if (patternColorSource === 'lighter') {
                    newPatternColor = lightenHexColor(randomColor, 40);
                } else if (patternColorSource === 'custom') {
                    // Keep the custom pattern color if the source is custom
                    newPatternColor = targetObject.dataset.patternColor;
                } else if (patternColorSource === 'mixed') {
                     // If source was mixed, recalculate mixed pattern color based on new base color and old mixed pattern color
                     const oldMixedPatternColor = targetObject.dataset.patternColor; // This is the color that was mixed
                     newPatternColor = mixHexColors(randomColor, oldMixedPatternColor);
                } else {
                    // Default to darker if source is unknown
                     newPatternColor = darkenHexColor(randomColor, 40);
                }

                // If the pattern source wasn't custom or mixed, update the dataset.patternColor
                 if (patternColorSource !== 'custom' && patternColorSource !== 'mixed') {
                     targetObject.dataset.patternColor = newPatternColor;
                 }
                targetObject.style.setProperty('--object-pattern-color', newPatternColor);
            }
            break;
        case 'rotate':
            currentRotate = (currentRotate + 45) % 360;
            targetObject.dataset.rotate = currentRotate;
            targetObject.style.setProperty('--rotate', `${currentRotate}deg`);
            break;
        case 'scaleUp':
            currentScale = Math.min(currentScale * 1.2, 3);
            targetObject.dataset.scale = currentScale;
            targetObject.style.setProperty('--scale', currentScale);
            break;
        case 'scaleDown':
            currentScale = Math.max(currentScale * 0.8, 0.5);
            targetObject.dataset.scale = currentScale;
            targetObject.style.setProperty('--scale', currentScale);
            break;
        case 'moveRandom':
            const gameAreaRect = gameArea.getBoundingClientRect();
            const objectRect = targetObject.getBoundingClientRect();

            const buffer = 10;
            const areaWidth = gameAreaRect.width;
            const areaHeight = gameAreaRect.height;
            const objectWidth = objectRect.width;
            const objectHeight = objectRect.height;

            const maxVisualX_gameArea = areaWidth - objectWidth - buffer;
            const maxVisualY_gameArea = areaHeight - objectHeight - buffer;
            const minVisualX_gameArea = buffer;
            const minVisualY_gameArea = buffer;

            if (maxVisualX_gameArea < minVisualX_gameArea || maxVisualY_gameArea < minVisualY_gameArea) {
                console.warn(`Game area too small for object ${targetObject.dataset.name} (size ${objectWidth}x${objectHeight}) to move randomly.`);
                alert(`Game area too small for object ${targetObject.dataset.name} to move randomly.`);
                return;
            }

            const randomVisualX_gameArea = Math.random() * (maxVisualX_gameArea - minVisualX_gameArea) + minVisualX_gameArea;
            const randomVisualY_gameArea = Math.random() * (maxVisualY_gameArea - minVisualY_gameArea) + minVisualY_gameArea;

            const finalNewTranslateX = randomVisualX_gameArea - targetObject.offsetLeft;
            const finalNewTranslateY = randomVisualY_gameArea - targetObject.offsetTop;

            targetObject.dataset.translateX = finalNewTranslateX;
            targetObject.dataset.translateY = finalNewTranslateY;
            targetObject.style.setProperty('--translate-x', `${finalNewTranslateX}px`);
            targetObject.style.setProperty('--translate-y', `${finalNewTranslateY}px`);
            break;
        case 'resetTransform':
            if (targetObject.dataset.broken !== 'true') {
                const initialColor = targetObject.dataset.color;
                targetObject.style.setProperty('--object-color', initialColor);

                const patternColorSource = targetObject.dataset.patternColorSource || 'darker';
                let resetPatternColor = targetObject.dataset.patternColor;

                if (patternColorSource === 'darker') {
                    resetPatternColor = darkenHexColor(initialColor, 40);
                } else if (patternColorSource === 'lighter') {
                    resetPatternColor = lightenHexColor(initialColor, 40);
                } else if (patternColorSource === 'custom') {
                    // Keep the custom pattern color
                    resetPatternColor = targetObject.dataset.patternColor;
                } else if (patternColorSource === 'mixed') {
                     // Cannot reliably reset mixed pattern color without knowing original components
                     // Keep the current mixed pattern color or set to a default? Let's keep current.
                     resetPatternColor = targetObject.dataset.patternColor;
                } else {
                    // Default to darker
                    resetPatternColor = darkenHexColor(initialColor, 40);
                }

                // If the pattern source wasn't custom or mixed, update the dataset.patternColor
                 if (patternColorSource !== 'custom' && patternColorSource !== 'mixed') {
                      targetObject.dataset.patternColor = resetPatternColor;
                 }
                targetObject.style.setProperty('--object-pattern-color', resetPatternColor);


                targetObject.dataset.translateX = '0';
                targetObject.dataset.translateY = '0';
                targetObject.dataset.rotate = '0';
                targetObject.dataset.scale = '1';

                targetObject.style.setProperty('--translate-x', '0px');
                targetObject.style.setProperty('--translate-y', '0px');
                targetObject.style.setProperty('--rotate', '0deg');
                targetObject.style.setProperty('--scale', '1');
            }
            break;
        case 'break':
            breakObject(targetObject);
            break;
        case 'fix':
            fixObject(targetObject);
            break;
        case 'remove':
            removeObject(targetObject);
            break;
        case 'eat':
            eatObject(targetObject);
            break;
        case 'shake':
            shakeObject(targetObject);
            break;
        case 'hop':
            // Simple hop animation: translate up then back
            if (targetObject.dataset.broken === 'true' || targetObject.classList.contains('sucking-in')) break;
            {
                const jump = -30;
                const origY = parseFloat(targetObject.dataset.translateY || '0');
                const up = origY + jump;
                targetObject.dataset.translateY = up;
                targetObject.style.setProperty('--translate-y', `${up}px`);
                setTimeout(() => {
                    targetObject.dataset.translateY = origY;
                    targetObject.style.setProperty('--translate-y', `${origY}px`);
                }, 300);
            }
            break;
        case 'squeeze':
            // Shrink then expand
            if (targetObject.dataset.broken === 'true' || targetObject.classList.contains('sucking-in')) break;
            {
                const origScale = parseFloat(targetObject.dataset.scale || '1');
                const small = Math.max(0.2, origScale * 0.5);
                targetObject.dataset.scale = small;
                targetObject.style.setProperty('--scale', `${small}`);
                setTimeout(() => {
                    targetObject.dataset.scale = origScale;
                    targetObject.style.setProperty('--scale', `${origScale}`);
                }, 350);
            }
            break;
        case 'displayText':
            // Show text above the object for specified seconds
            if (targetObject.dataset.broken === 'true' || targetObject.classList.contains('sucking-in')) break;
            {
                // Fetch values from controls (if available), otherwise prompt
                let text = '';
                let duration = 3;
                if (typeof displayTextInput !== 'undefined' && displayTextInput && typeof displayTextDurationInput !== 'undefined' && displayTextDurationInput) {
                    text = displayTextInput.value.trim();
                    duration = parseFloat(displayTextDurationInput.value) || 0;
                } else {
                    text = prompt("Enter text or emoji(s):", "") || "";
                    duration = parseFloat(prompt("Seconds to display:", "3")) || 0;
                }

                if (!text) break;

                // Create display element
                const displayEl = document.createElement('div');
                displayEl.classList.add('object-text-display');

                // Determine if it's emoji-only (heuristic: no typical alphanumeric/punct characters)
                const onlyEmoji = [...text].every(ch => {
                    return !/[\w\s.,!?'"\(\)<>:;@#\$%\^&\*\-\+=\[\]{}\\\/`~]/.test(ch);
                });

                if (onlyEmoji) {
                    displayEl.classList.add('emoji-only');
                } else {
                    displayEl.classList.add('bubble');
                }

                displayEl.textContent = text;

                // Position relative to object (use object's center)
                const objRect = targetObject.getBoundingClientRect();
                const gameRect = gameArea.getBoundingClientRect();

                const centerX = objRect.left - gameRect.left + objRect.width / 2;
                const topY = objRect.top - gameRect.top;

                displayEl.style.left = `${centerX}px`;
                displayEl.style.top = `${topY}px`;

                gameArea.appendChild(displayEl);

                // Remove after duration (seconds)
                const removeAfter = Math.max(0, duration) * 1000;
                if (removeAfter === 0) {
                    setTimeout(() => displayEl.remove(), 3000);
                } else {
                    setTimeout(() => displayEl.remove(), removeAfter);
                }
            }
            break;
        default:
            console.warn("Unknown action:", action);
    }
}

// Break/Fix actions
function breakObject(object) {
    if (object.dataset.broken === 'true') {
        console.warn("Object is already broken.");
        return;
    }

    if (object.classList.contains('shaking') || object.classList.contains('sucking-in')) {
        console.warn("Cannot break object while animating.");
        return;
    }

    const gameAreaRect = gameArea.getBoundingClientRect();
    const objectRect = object.getBoundingClientRect();

    const numPieces = 25;
    const baseObjectSize = 50;
    const pieceSize = baseObjectSize / Math.sqrt(numPieces);

    const objectCenterX_gameArea = objectRect.left - gameAreaRect.left + objectRect.width / 2;
    const objectCenterY_gameArea = objectRect.top - gameAreaRect.top + objectRect.height / 2;

    object.dataset.breakTranslateX = object.dataset.translateX;
    object.dataset.breakTranslateY = object.dataset.translateY;
    object.dataset.breakRotate = object.dataset.rotate;
    object.dataset.breakScale = object.dataset.scale;

    object.style.visibility = 'hidden';
    object.dataset.broken = 'true';
    // selectObject(null); // Keep object selected when broken

    const pieces = [];
    const objectId = object.dataset.id;

    const objectColor = object.style.getPropertyValue('--object-color');

    const scaleAtBreak = parseFloat(object.dataset.breakScale || '1');

    for (let i = 0; i < numPieces; i++) {
        const piece = document.createElement('div');
        piece.classList.add('piece');
        piece.style.backgroundColor = objectColor;
        piece.dataset.parentObjectId = objectId;

        piece.style.width = `${pieceSize}px`;
        piece.style.height = `${pieceSize}px`;

        const rows = Math.sqrt(numPieces);
        const cols = Math.sqrt(numPieces);
        const row = Math.floor(i / cols);
        const col = i % cols;

        const pieceVisualLeftInObject = col * pieceSize * scaleAtBreak;
        const pieceVisualTopInObject = row * pieceSize * scaleAtBreak;

        const pieceInitialLeft_gameArea = (objectRect.left - gameAreaRect.left) + pieceVisualLeftInObject;
        const pieceInitialTop_gameArea = (objectRect.top - gameAreaRect.top) + pieceVisualTopInObject;

        piece.style.left = `${pieceInitialLeft_gameArea}px`;
        piece.style.top = `${pieceInitialTop_gameArea}px`;

        gameArea.appendChild(piece);
        pieces.push(piece);

        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 150 + 50;

        const targetScatterX_gameArea = objectCenterX_gameArea + Math.cos(angle) * distance;
        const targetScatterY_gameArea = objectCenterY_gameArea + Math.sin(angle) * distance;

        const pieceInitialLeft = parseFloat(piece.style.left);
        const pieceInitialTop = parseFloat(piece.style.top);

        const targetTranslateX = targetScatterX_gameArea - pieceInitialLeft;
        const targetTranslateY = targetScatterY_gameArea - pieceInitialTop;
        const rotate = Math.random() * 720 - 360;

        piece.dataset.breakTranslateX = targetTranslateX;
        piece.dataset.breakTranslateY = targetTranslateY;
        piece.dataset.breakRotate = rotate;

        setTimeout(() => {
            piece.style.transform = `translate3d(${targetTranslateX}px, ${targetTranslateY}px, 0) rotate(${rotate}deg)`;
        }, 10);

        piece.addEventListener('click', (event) => {
            event.stopPropagation();
            const parentObject = objects.find(obj => obj.dataset.id === piece.dataset.parentObjectId);
            if (parentObject) {
                selectObject(parentObject);
            }
        });
    }

    object._pieces = pieces;
    updateMixerObjectSelects(); // Object might become ineligible for mixing
    populateMixerRandomizerOptions(); // Update mixer manager options
}

function fixObject(object) {
    if (object.dataset.broken !== 'true' || !object._pieces || object._pieces.length === 0) {
        console.warn("Object is not broken or has no pieces.");
        if (object._pieces) {
            object._pieces.forEach(piece => piece.remove());
            object._pieces = null;
        }
        delete object.dataset.broken;
        object.style.visibility = 'visible';
        return;
    }

    const pieces = object._pieces;
    const gameAreaRect = gameArea.getBoundingClientRect();

    const translateXAtBreak = parseFloat(object.dataset.breakTranslateX || '0');
    const translateYAtBreak = parseFloat(object.dataset.breakTranslateY || '0');
    const scaleAtBreak = parseFloat(object.dataset.breakScale || '1');

    const objectInitialLeft_gameArea = object.offsetLeft;
    const objectInitialTop_gameArea = object.offsetTop;

    const objectVisualLeftAtBreak_gameArea = objectInitialLeft_gameArea + translateXAtBreak;
    const objectVisualTopAtBreak_gameArea = objectInitialTop_gameArea + translateYAtBreak;

    const baseObjectSize = 50;
    const numPieces = 25;
    const pieceSize = baseObjectSize / Math.sqrt(numPieces);
    const rows = Math.sqrt(numPieces);
    const cols = Math.sqrt(numPieces);

    pieces.forEach(piece => {
        const pieceIndex = pieces.indexOf(piece);
        const row = Math.floor(pieceIndex / cols);
        const col = pieceIndex % cols;

        const pieceTargetVisualLeftInObject = col * pieceSize * scaleAtBreak;
        const pieceTargetVisualTopInObject = row * pieceSize * scaleAtBreak;

        const pieceTargetLeft_gameArea = objectVisualLeftAtBreak_gameArea + pieceTargetVisualLeftInObject;
        const pieceTargetTop_gameArea = objectVisualTopAtBreak_gameArea + pieceTargetVisualTopInObject;

        piece.style.transition = 'none';

        piece.style.left = `${pieceTargetLeft_gameArea}px`;
        piece.style.top = `${pieceTargetTop_gameArea}px`;

        const breakTranslateX = parseFloat(piece.dataset.breakTranslateX || '0');
        const breakTranslateY = parseFloat(piece.dataset.breakTranslateY || '0');
        const breakRotate = parseFloat(piece.dataset.breakRotate || '0');
        piece.style.transform = `translate3d(${breakTranslateX}px, ${breakTranslateY}px, 0) rotate(${breakRotate}deg)`;
        piece.style.opacity = '1';

        requestAnimationFrame(() => {
            piece.style.transition = 'transform 0.5s ease-in-out, opacity 0.5s ease-in-out';
            piece.style.transform = `translate3d(0, 0, 0) rotate(0deg)`;
        });
    });

    setTimeout(() => {
        pieces.forEach(piece => piece.remove());
        object._pieces = null;
        delete object.dataset.broken;

        object.style.visibility = 'visible';

        const restoreTranslateX = object.dataset.breakTranslateX;
        const restoreTranslateY = object.dataset.breakTranslateY;
        const restoreRotate = object.dataset.breakRotate;
        const restoreScale = object.dataset.breakScale;

        object.dataset.translateX = restoreTranslateX;
        object.dataset.translateY = restoreTranslateY;
        object.dataset.rotate = restoreRotate;
        object.dataset.scale = restoreScale;

        object.style.setProperty('--translate-x', `${restoreTranslateX}px`);
        object.style.setProperty('--translate-y', `${restoreTranslateY}px`);
        object.style.setProperty('--rotate', `${restoreRotate}deg`);
        object.style.setProperty('--scale', restoreScale);

        delete object.dataset.breakTranslateX;
        delete object.dataset.breakTranslateY;
        delete object.dataset.breakRotate;
        delete object.dataset.breakScale;

        selectObject(object);
        updateMixerObjectSelects(); // Object might become eligible for mixing again
        populateMixerRandomizerOptions(); // Update mixer manager options
    }, 500);
}

// Remove action
function removeObject(objectToRemove) {
    if (!objectToRemove) return;

    if (objectToRemove._pieces) {
        objectToRemove._pieces.forEach(piece => piece.remove());
        objectToRemove._pieces = null;
    }

    objectToRemove.remove();

    objects = objects.filter(obj => obj !== objectToRemove);

    if (selectedObject === objectToRemove) {
        selectObject(null);
    }

    updateMixerObjectSelects();
    populateMixerRandomizerOptions(); // Update mixer manager options when object is removed
}

// Eat action
function eatObject(objectToEat) {
    if (!objectToEat) return;

    if (objectToEat.dataset.broken === 'true') {
        console.warn("Cannot eat a broken object.");
        return;
    }

    if (objectToEat.classList.contains('shaking') || objectToEat.classList.contains('sucking-in')) {
        console.warn("Cannot eat object while animating.");
        return;
    }

    let eatCount = parseInt(objectToEat.dataset.eatCount || '0');
    eatCount++;
    objectToEat.dataset.eatCount = eatCount;

    const gameAreaRect = gameArea.getBoundingClientRect();
    const objectRect = objectToEat.getBoundingClientRect();

    const numCrumbs = 15;
    const objectColor = objectToEat.style.getPropertyValue('--object-color');

    for (let i = 0; i < numCrumbs; i++) {
        const crumb = document.createElement('div');
        crumb.classList.add('crumb');
        crumb.style.setProperty('--crumb-color', objectColor);

        const objectCenterX_gameArea = objectRect.left - gameAreaRect.left + objectRect.width / 2;
        const objectCenterY_gameArea = objectRect.top - gameAreaRect.top + objectRect.height / 2;

        const startOffsetX = (Math.random() - 0.5) * objectRect.width * 0.6;
        const startOffsetY = (Math.random() - 0.5) * objectRect.height * 0.6;

        const initialCrumbX_gameArea = objectCenterX_gameArea + startOffsetX;
        const initialCrumbY_gameArea = objectCenterY_gameArea + startOffsetY;

        crumb.style.left = `${initialCrumbX_gameArea}px`;
        crumb.style.top = `${initialCrumbY_gameArea}px`;

        gameArea.appendChild(crumb);

        requestAnimationFrame(() => {
            const fallDistance = Math.random() * 80 + 40;
            const sideDrift = (Math.random() - 0.5) * 50;

            crumb.style.transform = `translate3d(${sideDrift}px, ${fallDistance}px, 0)`;
            crumb.style.opacity = '0';

            setTimeout(() => {
                crumb.remove();
            }, 800);
        });
    }

    if (eatCount >= 3) {
        setTimeout(() => {
            removeObject(objectToEat); // removeObject will update mixers
        }, 100);
    }
}

// Shake action
function shakeObject(object) {
    if (!object) return;

    if (object.classList.contains('shaking')) {
        return;
    }

    if (object.dataset.broken === 'true' || object.classList.contains('sucking-in')) {
        console.warn("Cannot shake object while broken or animating.");
        return;
    }

    object.classList.add('shaking');

    setTimeout(() => {
        object.classList.remove('shaking');
    }, 500);
}

// Mixer functions
function updateMixerObjectSelects() {
    const currentSelection1 = mixerObject1Select.value;
    const currentSelection2 = mixerObject2Select.value;

    mixerObject1Select.innerHTML = '<option value="">-- Select Object 1 --</option>';
    mixerObject2Select.innerHTML = '<option value="">-- Select Object 2 --</option>';

    objects.forEach(obj => {
        // Only include objects that are not broken and not currently animating
        if (obj.dataset.broken === 'true' || obj.classList.contains('shaking') || obj.classList.contains('sucking-in')) {
            return;
        }

        const option1 = document.createElement('option');
        option1.value = obj.dataset.id;
        option1.textContent = `${obj.dataset.name} (${obj.dataset.type})`;
        mixerObject1Select.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = obj.dataset.id;
        option2.textContent = `${obj.dataset.name} (${obj.dataset.type})`;
        mixerObject2Select.appendChild(option2);
    });

    // Restore previous selections if still valid
    if (currentSelection1 && objects.some(obj => obj.dataset.id === currentSelection1 && obj.dataset.broken !== 'true' && !obj.classList.contains('shaking') && !obj.classList.contains('sucking-in'))) {
        mixerObject1Select.value = currentSelection1;
    } else {
        mixerObject1Select.value = "";
    }
    if (currentSelection2 && objects.some(obj => obj.dataset.id === currentSelection2 && obj.dataset.broken !== 'true' && !obj.classList.contains('shaking') && !obj.classList.contains('sucking-in'))) {
        mixerObject2Select.value = currentSelection2;
    } else {
        mixerObject2Select.value = "";
    }
}

function performMix(obj1, obj2, logic, customName = '') {
    let resultShape;
    let resultPattern;
    let resultColor;
    let resultPatternColorSource = 'mixed'; // Mark the source as mixed
    let resultPatternColor;

    if (logic === 'shape1-pattern2') {
        resultShape = obj1.dataset.type;
        resultPattern = obj2.dataset.pattern;
    } else {
        resultShape = obj2.dataset.type;
        resultPattern = obj1.dataset.pattern;
    }

    resultColor = mixHexColors(obj1.dataset.color, obj2.dataset.color);

    const patternColor1 = obj1.dataset.patternColor || obj1.style.getPropertyValue('--object-pattern-color'); // Use style as fallback
    const patternColor2 = obj2.dataset.patternColor || obj2.style.getPropertyValue('--object-pattern-color'); // Use style as fallback

    resultPatternColor = mixHexColors(patternColor1, patternColor2);

    let finalMixedName = customName;
    if (finalMixedName === '') {
        // If no custom name, generate a random one using allowed chars
        finalMixedName = generateRandomName();
         // Fallback if generateRandomName returns empty (e.g., no chars allowed)
        if (finalMixedName === '') {
            mixedCounter++;
            const getBaseName = (obj) => obj.dataset.name.split('(')[0].trim();
            const obj1BaseName = getBaseName(obj1);
            const obj2BaseName = getBaseName(obj2);
            finalMixedName = `Mixed ${mixedCounter} (${obj1BaseName} + ${obj2BaseName})`;
        }
    }

    const gameAreaRect = gameArea.getBoundingClientRect();
    const obj1Rect = obj1.getBoundingClientRect();
    const obj2Rect = obj2.getBoundingClientRect();

    const obj1CenterX_gameArea = obj1Rect.left - gameAreaRect.left + obj1Rect.width / 2;
    const obj1CenterY_gameArea = obj1Rect.top - gameAreaRect.top + obj1Rect.height / 2;
    const obj2CenterX_gameArea = obj2Rect.left - gameAreaRect.left + obj2Rect.width / 2;
    const obj2CenterY_gameArea = obj2Rect.top - gameAreaRect.top + obj2Rect.height / 2;

    const midCenterX_gameArea = (obj1CenterX_gameArea + obj2CenterX_gameArea) / 2;
    const midCenterY_gameArea = (obj1CenterY_gameArea + obj2CenterY_gameArea) / 2;

    const objectSize = 50;
    const newObjX = midCenterX_gameArea - objectSize / 2;
    const newObjY = midCenterY_gameArea - objectSize / 2;

    const buffer = 10;
    const areaWidth = gameAreaRect.width;
    const areaHeight = gameAreaRect.height;
    const newObjectWidth = objectSize;
    const newObjectHeight = objectSize;

    const clampMinX = buffer;
    const clampMinY = buffer;
    const clampMaxX = areaWidth - newObjectWidth - buffer;
    const clampMaxY = areaHeight - newObjectHeight - buffer;

    let clampedNewObjX = newObjX;
    let clampedNewObjY = newObjY;

    if (clampMaxX >= clampMinX) {
        clampedNewObjX = Math.max(clampMinX, Math.min(newObjX, clampMaxX));
    } else {
        clampedNewObjX = (areaWidth - newObjectWidth) / 2;
    }

    if (clampMaxY >= clampMinY) {
        clampedNewObjY = Math.max(clampMinY, Math.min(newObjY, clampMaxY));
    } else {
        clampedNewObjY = (areaHeight - newObjectHeight) / 2;
    }

    const animationDuration = 500;

    selectObject(null);

    const targetTranslateX1 = (clampedNewObjX - obj1.offsetLeft);
    const targetTranslateY1 = (clampedNewObjY - obj1.offsetTop);

    const targetTranslateX2 = (clampedNewObjX - obj2.offsetLeft);
    const targetTranslateY2 = (clampedNewObjY - obj2.offsetTop);

    // Save pre-mix visual state so we can restore if not removing components
    obj1.dataset._preMix_translateX = obj1.dataset.translateX;
    obj1.dataset._preMix_translateY = obj1.dataset.translateY;
    obj1.dataset._preMix_scale = obj1.dataset.scale;
    obj1.dataset._preMix_opacity = obj1.style.opacity || '1';

    obj2.dataset._preMix_translateX = obj2.dataset.translateX;
    obj2.dataset._preMix_translateY = obj2.dataset.translateY;
    obj2.dataset._preMix_scale = obj2.dataset.scale;
    obj2.dataset._preMix_opacity = obj2.style.opacity || '1';

    obj1.classList.add('sucking-in');
    obj2.classList.add('sucking-in');

    obj1.dataset.translateX = targetTranslateX1;
    obj1.dataset.translateY = targetTranslateY1;
    obj1.dataset.scale = '0.1';
    obj1.style.opacity = '0';

    obj1.style.setProperty('--translate-x', `${targetTranslateX1}px`);
    obj1.style.setProperty('--translate-y', `${targetTranslateY1}px`);
    obj1.style.setProperty('--scale', '0.1');

    obj2.dataset.translateX = targetTranslateX2;
    obj2.dataset.translateY = targetTranslateY2;
    obj2.dataset.scale = '0.1';
    obj2.style.opacity = '0';

    obj2.style.setProperty('--translate-x', `${targetTranslateX2}px`);
    obj2.style.setProperty('--translate-y', `${targetTranslateY2}px`);
    obj2.style.setProperty('--scale', '0.1');

    setTimeout(() => {
        const shouldRemove = removeOnMixCheckbox ? removeOnMixCheckbox.checked : true;

        if (shouldRemove) {
            removeObject(obj1); // removeObject will update mixers and populate randomizer
            removeObject(obj2); // removeObject will update mixers and populate randomizer
        } else {
            // Restore visual presence of objects without removing them
            // Remove sucking-in class, restore previous transforms/opacity
            obj1.classList.remove('sucking-in');
            obj2.classList.remove('sucking-in');

            obj1.dataset.translateX = obj1.dataset._preMix_translateX || '0';
            obj1.dataset.translateY = obj1.dataset._preMix_translateY || '0';
            obj1.dataset.scale = obj1.dataset._preMix_scale || '1';
            obj1.style.opacity = obj1.dataset._preMix_opacity || '1';

            obj2.dataset.translateX = obj2.dataset._preMix_translateX || '0';
            obj2.dataset.translateY = obj2.dataset._preMix_translateY || '0';
            obj2.dataset.scale = obj2.dataset._preMix_scale || '1';
            obj2.style.opacity = obj2.dataset._preMix_opacity || '1';

            obj1.style.setProperty('--translate-x', `${obj1.dataset.translateX}px`);
            obj1.style.setProperty('--translate-y', `${obj1.dataset.translateY}px`);
            obj1.style.setProperty('--scale', `${obj1.dataset.scale}`);

            obj2.style.setProperty('--translate-x', `${obj2.dataset.translateX}px`);
            obj2.style.setProperty('--translate-y', `${obj2.dataset.translateY}px`);
            obj2.style.setProperty('--scale', `${obj2.dataset.scale}`);
        }

        const newObjectElement = createObject(finalMixedName, resultShape, resultColor, resultPattern, resultPatternColor, resultPatternColorSource, clampedNewObjX, clampedNewObjY);

        newObjectElement.style.opacity = '0';
        const finalScale = parseFloat(newObjectElement.dataset.scale || '1');
        newObjectElement.style.setProperty('--scale', '0.1');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                newObjectElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out !important';

                newObjectElement.style.opacity = '1';
                newObjectElement.style.setProperty('--scale', finalScale);
                newObjectElement.dataset.scale = finalScale;

                setTimeout(() => {
                    newObjectElement.style.transition = '';
                }, 300);
            });
        });

        mixerObject1Select.value = "";
        mixerObject2Select.value = "";
        mixedObjectNameInput.value = "";
        updateMixerObjectSelects(); // Re-populate selects after objects are removed/added
        populateMixerRandomizerOptions(); // Re-populate randomizer options after objects are removed/added

    }, animationDuration);
}

// Event listeners
applyActionButton.addEventListener('click', () => {
    const selectedAction = actionSelect.value;
    if (selectedAction && selectedObject) {
        applyAction(selectedAction, selectedObject);
    } else if (!selectedObject) {
        alert("Please select an object first!");
    } else {
        alert("Please select an action first!");
    }
});

// Show/hide display text controls when Display Text is selected
actionSelect.addEventListener('change', () => {
    if (!displayTextControlsDiv) return;
    if (actionSelect.value === 'displayText') {
        displayTextControlsDiv.classList.remove('hidden');
    } else {
        displayTextControlsDiv.classList.add('hidden');
    }
});

addObjectButton.addEventListener('click', () => {
    const shape = newObjectShapeSelect.value;
    let name = newObjectNameInput.value.trim(); // Use let because we might overwrite it
    const color = newObjectColorInput.value;
    const pattern = newObjectPatternSelect.value;

    const patternColorSource = document.querySelector('input[name="pattern-color-source"]:checked').value;
    let patternColor;
    if (patternColorSource === 'darker') {
        patternColor = darkenHexColor(color, 40);
    } else if (patternColorSource === 'lighter') {
        patternColor = lightenHexColor(color, 40);
    }
    else {
        patternColor = newObjectPatternColorInput.value;
    }

    if (!shape) {
        alert("Please select a shape for the new object!");
        return;
    }

    // Check if the name input was left blank
    if (name === '') {
        // If blank, generate a random name
        name = generateRandomName();
        // Fallback to counter-based name if random generation fails (e.g., no chars allowed)
        if (name === '') {
             switch (shape) {
                 case 'box': boxCounter++; name = `Box ${boxCounter}`; break;
                 case 'sphere': sphereCounter++; name = `Sphere ${sphereCounter}`; break;
                 case 'cone': coneCounter++; name = `Cone ${coneCounter}`; break;
                 case 'star': starCounter++; name = `Star ${starCounter}`; break;
                 default: name = `Object ${objects.length + 1}`;
             }
         }
    } else {
         // If a name was provided, update counters based on shape
         // This maintains expected counter behavior if the user names manually
         switch (shape) {
             case 'box': boxCounter++; break;
             case 'sphere': sphereCounter++; break;
             case 'cone': coneCounter++; break;
             case 'star': starCounter++; break;
         }
    }


    const gameAreaRect = gameArea.getBoundingClientRect();
    const objectSize = 50;
    const buffer = 10;

    const maxVisualX = gameAreaRect.width - objectSize - buffer;
    const maxVisualY = gameAreaRect.height - objectSize - buffer;
    const minVisualX = buffer;
    const minVisualY = buffer;

    if (maxVisualX < minVisualX || maxVisualY < minVisualY) {
        console.warn("Game area too small to add objects.");
        alert("Game area too small to add new objects at standard size.");
        const centerX = (gameAreaRect.width - objectSize) / 2;
        const centerY = (gameAreaRect.height - objectSize) / 2;
        createObject(name, shape, color, pattern, patternColor, patternColorSource, centerX, centerY);

        newObjectNameInput.value = '';
        newObjectShapeSelect.value = '';
        newObjectPatternSelect.value = 'none';
        patternColorDarkerRadio.checked = true;
        newObjectPatternColorInput.value = '#27ad60';

        updateMixerObjectSelects(); // Update selects after adding object
        populateMixerRandomizerOptions(); // Update mixer manager options after adding object
        return;
    }

    const randomVisualX = Math.random() * (maxVisualX - minVisualX) + minVisualX;
    const randomVisualY = Math.random() * (maxVisualY - minVisualY) + minVisualY;

    const divX = randomVisualX;
    const divY = randomVisualY;

    createObject(name, shape, color, pattern, patternColor, patternColorSource, divX, divY);

    newObjectNameInput.value = '';
    newObjectShapeSelect.value = '';
    newObjectPatternSelect.value = 'none';
    patternColorDarkerRadio.checked = true;
    newObjectPatternColorInput.value = '#27ad60';

    updateMixerObjectSelects(); // Update selects after adding object
    populateMixerRandomizerOptions(); // Update mixer manager options after adding object
});

randomizeActionButton.addEventListener('click', handleRandomizeAction);
randomizeAddObjectButton.addEventListener('click', handleRandomizeAddObject);
randomizeMixerButton.addEventListener('click', handleRandomizeMixer);

toggleAddObjectButton.addEventListener('click', () => {
    const isHidden = addObjectCreatorDiv.classList.toggle('hidden');
    toggleAddObjectButton.textContent = isHidden ? 'Show' : 'Hide';
});

toggleMixerButton.addEventListener('click', () => {
    const isHidden = objectMixerDiv.classList.toggle('hidden');
    toggleMixerButton.textContent = isHidden ? 'Show' : 'Hide';
    if (!isHidden) {
        updateMixerObjectSelects();
    }
});

toggleActionManagerButton.addEventListener('click', () => {
    const isHidden = actionRandomizerManagerDiv.classList.toggle('hidden');
    toggleActionManagerButton.textContent = isHidden ? 'Show' : 'Hide';
});

toggleMixerManagerButton.addEventListener('click', () => {
    const isHidden = mixerRandomizerManagerDiv.classList.toggle('hidden');
    toggleMixerManagerButton.textContent = isHidden ? 'Show' : 'Hide';
    if (!isHidden) {
        populateMixerRandomizerOptions(); // Ensure options are up-to-date when shown
    }
});

// Add toggle listener for the new Name Randomizer Manager
toggleNameManagerButton.addEventListener('click', () => {
    const isHidden = nameRandomizerManagerDiv.classList.toggle('hidden');
    toggleNameManagerButton.textContent = isHidden ? 'Show' : 'Hide';
    if (!isHidden) {
        populateNameRandomizerOptions(); // Ensure options are up-to-date when shown
    }
});

 // Add listener for the Add Custom Character button
addCustomCharButton.addEventListener('click', () => {
    const charsToAdd = customCharInput.value.trim();
    if (charsToAdd === '') {
        return; // Do nothing if input is empty
    }

    // Treat the entire input string as a single token (so multi-char entries stay together)
    customAddedChars.add(charsToAdd);
    allowedRandomChars.add(charsToAdd);

    customCharInput.value = ''; // Clear the input field
    populateNameRandomizerOptions(); // Refresh the options display
});


mixObjectsButton.addEventListener('click', () => {
    const obj1Id = mixerObject1Select.value;
    const obj2Id = mixerObject2Select.value;
    const customMixedName = mixedObjectNameInput.value.trim();

    if (!obj1Id || !obj2Id) {
        alert("Please select two objects to mix.");
        return;
    }

    if (obj1Id === obj2Id) {
        alert("Please select two DIFFERENT objects to mix.");
        return;
    }

    const object1 = objects.find(obj => obj.dataset.id === obj1Id);
    const object2 = objects.find(obj => obj.dataset.id === obj2Id);

    if (!object1 || !object2) {
        alert("Selected objects not found. Please re-select.");
        updateMixerObjectSelects();
        return;
    }

    if (object1.dataset.broken === 'true' || object2.dataset.broken === 'true' ||
        object1.classList.contains('shaking') || object2.classList.contains('shaking') ||
        object1.classList.contains('sucking-in') || object2.classList.contains('sucking-in')) {
        console.warn("Cannot mix objects while they are broken or animating.");
        alert("Cannot mix objects while they are broken or animating.");
        updateMixerObjectSelects();
        return;
    }

    const selectedLogic = document.querySelector('input[name="mixer-logic"]:checked').value;

    performMix(object1, object2, selectedLogic, customMixedName);
});

// Randomizer Manager Population and State Management
function populateActionRandomizerOptions() {
    actionRandomizerOptionsDiv.innerHTML = ''; // Clear existing options

    const allActions = Array.from(actionSelect.options)
        .map(option => option.value)
        .filter(value => value !== ''); // Exclude the "-- Select Action --" option

    // Initialize allowed actions to include all actions if it's empty
    if (allowedRandomActions.size === 0) {
         allActions.forEach(action => allowedRandomActions.add(action));
    }


    allActions.forEach(action => {
        const label = document.createElement('label');
        label.classList.add('randomizer-option'); // Add a class for styling
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = action;
        input.checked = allowedRandomActions.has(action); // Set checked based on state

        input.addEventListener('change', () => {
            if (input.checked) {
                allowedRandomActions.add(action);
            } else {
                allowedRandomActions.delete(action);
            }
        });

        label.appendChild(input);
        label.appendChild(document.createTextNode(action.charAt(0).toUpperCase() + action.slice(1).replace(/([A-Z])/g, ' $1').trim())); // Make action names readable (e.g., changeColor -> Change Color)
        actionRandomizerOptionsDiv.appendChild(label);
    });
}


function populateMixerRandomizerOptions() {
    mixerRandomizerOptionsDiv.innerHTML = ''; // Clear existing options

    // Get only eligible objects for mixing
    const eligibleObjects = objects.filter(obj =>
        obj.dataset.broken !== 'true' &&
        !obj.classList.contains('shaking') &&
        !obj.classList.contains('sucking-in')
    );

     // Remove IDs from allowedMixerObjects that no longer exist or are ineligible
     allowedMixerObjects.forEach(id => {
         if (!eligibleObjects.some(obj => obj.dataset.id === id)) {
             allowedMixerObjects.delete(id);
         }
     });

    // Initialize allowed objects to include all eligible objects if it's empty or if new objects were added
     const currentAllowedIds = new Set(allowedMixerObjects);
     const eligibleIds = new Set(eligibleObjects.map(obj => obj.dataset.id));

     // Add any new eligible objects to the allowed set by default
     eligibleObjects.forEach(obj => {
         if (!currentAllowedIds.has(obj.dataset.id)) {
             allowedMixerObjects.add(obj.dataset.id);
         }
     });


    eligibleObjects.forEach(obj => {
        const label = document.createElement('label');
        label.classList.add('randomizer-option'); // Add a class for styling
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = obj.dataset.id;
        input.checked = allowedMixerObjects.has(obj.dataset.id); // Set checked based on state

        input.addEventListener('change', () => {
            if (input.checked) {
                allowedMixerObjects.add(obj.dataset.id);
            } else {
                allowedMixerObjects.delete(obj.dataset.id);
            }
        });

        label.appendChild(input);
        label.appendChild(document.createTextNode(`${obj.dataset.name} (${obj.dataset.type})`));
        mixerRandomizerOptionsDiv.appendChild(label);
    });

    // Show a message if no eligible objects are available
    if (eligibleObjects.length === 0) {
        mixerRandomizerOptionsDiv.textContent = "No eligible objects to mix.";
    } else if (eligibleObjects.length === 1) {
        mixerRandomizerOptionsDiv.textContent = "Need at least two eligible objects to mix.";
    }
}

// Function to populate the Name Randomizer Manager options
function populateNameRandomizerOptions() {
    nameRandomizerOptionsDiv.innerHTML = ''; // Clear existing options

    // Combine base characters and custom added characters
    const allDisplayChars = Array.from(new Set([...baseChars.split(''), ...customAddedChars]));

    // Sort characters for consistent display order
    allDisplayChars.sort();

    allDisplayChars.forEach(char => {
        const label = document.createElement('label');
        label.classList.add('randomizer-option'); // Add a class for styling
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = char;
        input.checked = allowedRandomChars.has(char); // Set checked based on state

        input.addEventListener('change', () => {
            if (input.checked) {
                allowedRandomChars.add(char);
            } else {
                allowedRandomChars.delete(char);
            }
        });

        label.appendChild(input);
        label.appendChild(document.createTextNode(char === ' ' ? '[Space]' : char)); // Display space character clearly
        nameRandomizerOptionsDiv.appendChild(label);
    });

    // Set the initial values of the min/max length inputs
    minNameLengthInput.value = minNameLength;
    maxNameLengthInput.value = maxNameLength;
}

// Helper function to check if a character is a letter or number
function isLetterOrNumber(char) {
    return /^[a-zA-Z0-9]$/.test(char);
}


// Modify Randomize Action function to use the manager state
function handleRandomizeAction() {
    if (!selectedObject) {
        alert("Please select an object first!");
        return;
    }

    // Start with actions allowed by the user in the manager
    let potentialActions = Array.from(allowedRandomActions);

    // Define exclusions based ONLY on the selected object's current state
    const objectStateExcludedActions = [];
    if (selectedObject.dataset.broken === 'true') {
        // If broken, can only 'fix' or 'remove'
        objectStateExcludedActions.push(
            'changeColor', 'rotate', 'scaleUp', 'scaleDown',
            'resetTransform', 'moveRandom', 'break', 'eat', 'shake'
        );
    } else {
        // If not broken, we can't 'fix'.
        objectStateExcludedActions.push('fix');
         // If not broken, we *can* potentially break.
    }

    // Exclude shaking if already shaking
     if (selectedObject.classList.contains('shaking')) {
         objectStateExcludedActions.push('shake');
     }
     // Exclude all actions if sucking in
     if (selectedObject.classList.contains('sucking-in')) {
          objectStateExcludedActions.push(
              'changeColor', 'rotate', 'scaleUp', 'scaleDown', 'resetTransform',
              'moveRandom', 'break', 'fix', 'remove', 'eat', 'shake'
          );
     }


    // Filter allowed manager actions by object state exclusions
    const availableActions = potentialActions.filter(action => !objectStateExcludedActions.includes(action));

    if (availableActions.length === 0) {
        console.warn("No applicable actions available for the selected object based on manager settings and current state.");
        alert("No applicable actions available for the selected object based on manager settings and current state.");
        return;
    }

    const randomAction = availableActions[Math.floor(Math.random() * availableActions.length)];

    // Apply the chosen action
    applyAction(randomAction, selectedObject);

    // Visually update the action select dropdown
    actionSelect.value = randomAction;
}

// Modify Randomize Mixer function to use the manager state
function handleRandomizeMixer() {
    // Get eligible objects based on current state AND manager settings
    const potentialMixObjects = objects.filter(obj =>
        obj.dataset.broken !== 'true' &&
        !obj.classList.contains('shaking') &&
        !obj.classList.contains('sucking-in') &&
        allowedMixerObjects.has(obj.dataset.id) // Filter by manager allowed objects
    );

    if (potentialMixObjects.length < 2) {
        alert("You need at least two non-broken, non-animating objects selected in the Randomize Mixer Manager to mix.");
        populateMixerRandomizerOptions(); // Update options display if state changed
        return;
    }

    let randomIndex1 = Math.floor(Math.random() * potentialMixObjects.length);
    let randomIndex2;
    do {
        randomIndex2 = Math.floor(Math.random() * potentialMixObjects.length);
    } while (randomIndex1 === randomIndex2);

    const object1 = potentialMixObjects[randomIndex1];
    const object2 = potentialMixObjects[randomIndex2];

    const logics = ['shape1-pattern2', 'shape2-pattern1'];
    const randomLogic = logics[Math.floor(Math.random() * logics.length)];

    // Generate a random name for the mixed object
    const randomMixedName = generateRandomName();


    // Visually update the mixer select dropdowns and logic radios
    mixerObject1Select.value = object1.dataset.id;
    mixerObject2Select.value = object2.dataset.id;
    mixedObjectNameInput.value = randomMixedName; // Set the generated random name
    const logicRadio = document.querySelector(`input[name="mixer-logic"][value="${randomLogic}"]`);
    if (logicRadio) {
        logicRadio.checked = true;
    }

    performMix(object1, object2, randomLogic, randomMixedName);
}


function handleRandomizeAddObject() {
    const shapes = ['box', 'sphere', 'cone', 'star'];
    const patterns = ['none', 'stripes', 'spots', 'specks'];
    const patternColorSources = ['darker', 'lighter', 'custom'];

    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
    const randomPattern = patterns[Math.floor(Math.random() * patterns.length)];
    const randomColor = getRandomHexColor();
    const randomPatternColorSource = patternColorSources[Math.floor(Math.random() * patternColorSources.length)];

    let randomPatternColorValue;

    if (randomPatternColorSource === 'darker') {
        randomPatternColorValue = darkenHexColor(randomColor, 40);
    } else if (randomPatternColorSource === 'lighter') {
        randomPatternColorValue = lightenHexColor(randomColor, 40);
    } else {
        randomPatternColorValue = getRandomHexColor();
    }

    // Generate a random name using the allowed characters
    const randomName = generateRandomName();

    const gameAreaRect = gameArea.getBoundingClientRect();
    const objectSize = 50;
    const buffer = 10;

    const maxVisualX = gameAreaRect.width - objectSize - buffer;
    const maxVisualY = gameAreaRect.height - objectSize - buffer;
    const minVisualX = buffer;
    const minVisualY = buffer;

    if (maxVisualX < minVisualX || maxVisualY < minVisualY) {
        console.warn("Game area too small to add objects.");
        alert("Game area too small to add new objects at standard size.");
        const centerX = (gameAreaRect.width - objectSize) / 2;
        const centerY = (gameAreaRect.height - objectSize) / 2;
        createObject(randomName, randomShape, randomColor, randomPattern, randomPatternColorValue, randomPatternColorSource, centerX, centerY);

        updateMixerObjectSelects();
        populateMixerRandomizerOptions();
        return;
    }

    const randomVisualX = Math.random() * (maxVisualX - minVisualX) + minVisualX;
    const randomVisualY = Math.random() * (maxVisualY - minVisualY) + minVisualY;

    const divX = randomVisualX;
    const divY = randomVisualY;

    createObject(randomName, randomShape, randomColor, randomPattern, randomPatternColorValue, randomPatternColorSource, divX, divY);

    updateMixerObjectSelects();
    populateMixerRandomizerOptions();
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    const gameAreaRect = gameArea.getBoundingClientRect();
    const areaWidth = gameAreaRect.width;
    const areaHeight = gameAreaRect.height;
    const objectSize = 50;
    const buffer = 10;

    if (areaWidth < objectSize + buffer * 2 || areaHeight < objectSize + buffer * 2) {
        console.warn("Game area too small for initial objects.");
        alert("Game area too small to place initial objects.");
        updateMixerObjectSelects();
        populateActionRandomizerOptions();
        populateMixerRandomizerOptions(); // Ensure populated even if no objects
        // Initialize allowed random chars with letters and numbers on load
        Array.from(baseChars).forEach(char => {
             if (isLetterOrNumber(char)) {
                 allowedRandomChars.add(char);
             }
         });
        populateNameRandomizerOptions(); // Ensure populated even if no objects

        return;
    }

    const initialObjects = [
        { name: 'Box 1', type: 'box', color: '#e74c3c', pattern: 'spots', patternColorSource: 'darker', x: areaWidth * 0.25, y: areaHeight * 0.33 },
        { name: 'Sphere 1', type: 'sphere', color: '#f39c12', pattern: 'stripes', patternColorSource: 'darker', x: areaWidth * 0.5, y: areaHeight * 0.5 },
        { name: 'Cone 1', type: 'cone', color: '#9b59b6', pattern: 'specks', patternColorSource: 'darker', x: areaWidth * 0.75, y: areaHeight * 0.66 },
        { name: 'Star 1', type: 'star', color: '#3498db', pattern: 'none', patternColorSource: 'darker', x: areaWidth * 0.1, y: areaHeight * 0.8 }
    ];

    initialObjects.forEach(obj => {
        const targetCenterX = obj.x;
        const targetCenterY = obj.y;

        const targetVisualX = targetCenterX - objectSize / 2;
        const targetVisualY = targetCenterY - objectSize / 2;

        const clampMinX = buffer;
        const clampMinY = buffer;
        const clampMaxX = areaWidth - objectSize - buffer;
        const clampMaxY = areaHeight - objectSize - buffer;

        let clampedVisualX = targetVisualX;
        let clampedVisualY = targetVisualY;

        if (clampMaxX >= clampMinX) {
            clampedVisualX = Math.max(clampMinX, Math.min(targetVisualX, clampMaxX));
        } else {
            clampedVisualX = (areaWidth - objectSize) / 2;
        }
        if (clampMaxY >= clampMinY) {
            clampedVisualY = Math.max(clampMinY, Math.min(targetVisualY, clampMaxY));
        } else {
            clampedVisualY = (areaHeight - objectSize) / 2;
        }

        const divX = clampedVisualX;
        const divY = clampedVisualY;

        let initialPatternColor;
        if (obj.pattern === 'none') {
             // If no pattern, pattern color doesn't apply visually via background-image
             // but we store a default based on the source if needed later.
             if (obj.patternColorSource === 'lighter') {
                 initialPatternColor = lightenHexColor(obj.color, 40);
             } else if (obj.patternColorSource === 'custom') {
                 // For initial objects with 'none' pattern and 'custom' source, use a default custom color
                 initialPatternColor = '#27ad60'; // Or some other default
             }
             else {
                 initialPatternColor = darkenHexColor(obj.color, 40);
             }
        }
        else {
            // Pattern exists, calculate color based on source
            if (obj.patternColorSource === 'darker') {
                initialPatternColor = darkenHexColor(obj.color, 40);
            } else if (obj.patternColorSource === 'lighter') {
                initialPatternColor = lightenHexColor(obj.color, 40);
            }
            else { // 'custom' source
                // For initial objects with a pattern and 'custom' source, use a default custom color
                initialPatternColor = '#27ad60'; // Or some other default
            }
        }


        createObject(obj.name, obj.type, obj.color, obj.pattern, initialPatternColor, obj.patternColorSource, divX, divY);
        switch (obj.type) {
            case 'box': boxCounter++; break;
            case 'sphere': sphereCounter++; break;
            case 'cone': coneCounter++; break;
            case 'star': starCounter++; break;
        }
    });

    updateMixerObjectSelects();
    populateActionRandomizerOptions(); // Populate action manager on load
    populateMixerRandomizerOptions(); // Populate mixer manager on load

    // Initialize allowed random chars with letters and numbers on load
    Array.from(baseChars).forEach(char => {
        if (isLetterOrNumber(char)) {
            allowedRandomChars.add(char);
        }
    });
    populateNameRandomizerOptions(); // Populate name manager on load


    window.addEventListener('resize', () => {
        // Re-evaluate object positions and potentially update mixer options on resize
        // (This is a simplified resize handler. A full implementation would re-calculate
        // and potentially update all object positions relative to the new gameArea size).
        updateMixerObjectSelects();
        populateMixerRandomizerOptions(); // Mixer options depend on eligible objects
    });

    // Initial state for toggles (default to visible)
    actionRandomizerManagerDiv.classList.remove('hidden');
    toggleActionManagerButton.textContent = 'Hide';
    mixerRandomizerManagerDiv.classList.remove('hidden');
    toggleMixerManagerButton.textContent = 'Hide';
    nameRandomizerManagerDiv.classList.remove('hidden'); // Show name manager by default
    toggleNameManagerButton.textContent = 'Hide'; // Set toggle text to hide
});