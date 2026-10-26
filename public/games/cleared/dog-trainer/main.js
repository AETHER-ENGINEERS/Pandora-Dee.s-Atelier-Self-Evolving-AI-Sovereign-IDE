import { DogRenderer } from './DogRenderer.js';
import { audio } from './AudioManager.js';

const COLORS = ['#8D6E63', '#4E342E', '#424242', '#616161', '#FFF5E1', '#F5F5F5', '#FFCC80', '#A1887F', '#BDBDBD', '#795548'];
const NOSE_COLORS = ['#000000', '#555555', '#3E2723', '#5D4037', '#FFC1CC', '#FFB7C5', '#FF91A4', '#F4C2C2', '#E75480'];
const EYE_COLORS = ['#000000', '#555555', '#3E2723', '#795548', '#A1887F', '#FF0000', '#FF8C00', '#FFD700', '#228B22', '#00CED1', '#4169E1', '#9400D3', '#800080', '#FF00FF', '#FFB6C1', '#FFFFFF'];

const DEFAULT_SKILLS = [
    { name: 'Stamina', exp: 0, level: 1 },
    { name: 'Fetch', exp: 0, level: 1 }
];

const INITIAL_ACTIONS = [
    { id: 'rest', name: 'Rest', emoji: '💤', type: 'clickable', category: 'restore', value: [20, 50], skill: null, sound: 'bark' },
    { id: 'feed', name: 'Feed', emoji: '🍖', type: 'draggable', category: 'restore', value: [20, 50], skill: null, sound: 'eat' },
    { id: 'treat', name: 'Give Treat', emoji: '🤎', type: 'draggable', category: 'restore', value: [10, 30], skill: null, sound: 'eat' },
    { id: 'pet', name: 'Pet', emoji: '🤚', type: 'draggable', category: 'restore', value: [5, 15], skill: null, sound: 'bark' },
    
    { id: 'walk', name: 'Go on Walk', emoji: '🐕‍🦺', type: 'clickable', category: 'training', skill: 'Stamina', reqLevel: 1, energyCost: [10, 30], sound: 'bark' },
    { id: 'short_fetch', name: 'Short Fetch', emoji: '🥎', type: 'draggable', category: 'training', skill: 'Fetch', reqLevel: 1, energyCost: [10, 30], sound: 'bark' }
];

const UNLOCKABLES = [
    { id: 'long_walk', name: 'Long Walk', emoji: '🐕‍🦺', type: 'clickable', category: 'training', skill: 'Stamina', reqLevel: 5, energyCost: [15, 35] },
    { id: 'run_walk', name: 'Running Walk', emoji: '🐕‍🦺', type: 'clickable', category: 'training', skill: 'Stamina', reqLevel: 10, energyCost: [20, 40] },
    { id: 'low_race', name: 'Low Race', emoji: '🐕', type: 'clickable', category: 'training', skill: 'Stamina', reqLevel: 15, energyCost: [25, 45], isComp: true, winChance: 0.5 },
    { id: 'med_race', name: 'Med Race', emoji: '🐕', type: 'clickable', category: 'training', skill: 'Stamina', reqLevel: 20, energyCost: [30, 50], isComp: true, winChance: 0.3 },
    { id: 'high_race', name: 'High Race', emoji: '🐕', type: 'clickable', category: 'training', skill: 'Stamina', reqLevel: 30, energyCost: [35, 60], isComp: true, winChance: 0.15 },

    { id: 'med_fetch', name: 'Medium Fetch', emoji: '🥎', type: 'draggable', category: 'training', skill: 'Fetch', reqLevel: 5, energyCost: [15, 35] },
    { id: 'long_fetch', name: 'Long Fetch', emoji: '🥎', type: 'draggable', category: 'training', skill: 'Fetch', reqLevel: 10, energyCost: [20, 40] },
    { id: 'low_f_comp', name: 'Low Fetch Comp', emoji: '🥎', type: 'clickable', category: 'training', skill: 'Fetch', reqLevel: 15, energyCost: [25, 45], isComp: true, winChance: 0.5 },
    { id: 'med_f_comp', name: 'Med Fetch Comp', emoji: '🥎', type: 'clickable', category: 'training', skill: 'Fetch', reqLevel: 20, energyCost: [30, 50], isComp: true, winChance: 0.3 },
    { id: 'high_f_comp', name: 'High Fetch Comp', emoji: '🥎', type: 'clickable', category: 'training', skill: 'Fetch', reqLevel: 30, energyCost: [35, 60], isComp: true, winChance: 0.15 },
];

class GameState {
    constructor() {
        this.dogConfig = {
            bodyColor: COLORS[0],
            headColor: COLORS[0],
            legsColor: COLORS[0],
            snoutColor: COLORS[3],
            earColor: COLORS[0],
            tailColor: COLORS[0],
            noseColor: '#000000',
            eyeColor: '#000000',
            tailShape: 'long',
            earShape: 'both up',
            snoutLength: 'normal',
            bodyLength: 'medium', // short | medium | long
            bodyWidth: 'medium',  // short | medium | wide
            legLength: 'medium',  // short | medium | long
            // new size controls
            earSize: 'medium',    // small | medium | large
            tailSize: 'medium',   // small | medium | large
            hasSpots: false,
            spotsColor: COLORS[1]
        };
        this.stats = {
            energy: 100,
            skills: JSON.parse(JSON.stringify(DEFAULT_SKILLS))
        };
        this.actions = [...INITIAL_ACTIONS];
        this.unlockables = [...UNLOCKABLES];
        this.currentTab = 'restore';
        this.draggedAction = null;
    }
}

const state = new GameState();

function init() {
    window.renderCreationScreen();
}

window.renderCreationScreen = () => {
    const app = document.getElementById('app');
    let creationScreen = document.querySelector('.creation-screen');
    
    if (!creationScreen) {
        app.innerHTML = `
            <div class="screen creation-screen">
                <div class="preview-box" id="creation-preview"></div>
                <div class="creation-container" id="creation-controls"></div>
            </div>
        `;
        creationScreen = document.querySelector('.creation-screen');
    }

    const controls = document.getElementById('creation-controls');
    controls.innerHTML = `
        ${renderConfigGroup('Body', 'bodyColor', COLORS)}
        ${renderConfigGroup('Head', 'headColor', COLORS)}
        ${renderConfigGroup('Legs', 'legsColor', COLORS)}
        ${renderConfigGroup('Snout', 'snoutColor', COLORS)}
        ${renderConfigGroup('Ears Color', 'earColor', COLORS)}
        ${renderConfigGroup('Tail Color', 'tailColor', COLORS)}
        ${renderConfigGroup('Nose Color', 'noseColor', NOSE_COLORS)}
        ${renderConfigGroup('Eye Color', 'eyeColor', EYE_COLORS)}
        <div class="config-group toggle-group">
            <h3>Show Spots</h3>
            <label class="switch">
                <input type="checkbox" ${state.dogConfig.hasSpots ? 'checked' : ''} onchange="window.updateConfig('hasSpots', this.checked)">
                <span class="slider"></span>
            </label>
        </div>
        ${state.dogConfig.hasSpots ? renderConfigGroup('Spots Color', 'spotsColor', COLORS) : ''}
        <div class="config-group">
            <h3>Tail Shape</h3>
            <div class="shape-grid">
                ${['long', 'short', 'poofball', 'stub', 'curled', 'none'].map(s => `
                    <button class="shape-btn ${state.dogConfig.tailShape === s ? 'active' : ''}" onclick="window.updateConfig('tailShape', '${s}')">${s}</button>
                `).join('')}
            </div>
        </div>

        <div class="config-group">
            <h3>Tail Size</h3>
            <div class="shape-grid">
                ${['small','medium','large'].map(s => `
                    <button class="shape-btn ${state.dogConfig.tailSize === s ? 'active' : ''}" onclick="window.updateConfig('tailSize', '${s}')">${s}</button>
                `).join('')}
            </div>
        </div>

        <div class="config-group">
            <h3>Ear Shape</h3>
            <div class="shape-grid">
                ${['both up', 'both curled', 'left up & right curled', 'right up & left curled'].map(s => `
                    <button class="shape-btn ${state.dogConfig.earShape === s ? 'active' : ''}" onclick="window.updateConfig('earShape', '${s}')">${s}</button>
                `).join('')}
            </div>
        </div>

        <div class="config-group">
            <h3>Ear Size</h3>
            <div class="shape-grid">
                ${['small','medium','large'].map(s => `
                    <button class="shape-btn ${state.dogConfig.earSize === s ? 'active' : ''}" onclick="window.updateConfig('earSize', '${s}')">${s}</button>
                `).join('')}
            </div>
        </div>

        <div class="config-group">
            <h3>Snout Length</h3>
            <div class="shape-grid">
                ${['short', 'normal', 'long'].map(s => `
                    <button class="shape-btn ${state.dogConfig.snoutLength === s ? 'active' : ''}" onclick="window.updateConfig('snoutLength', '${s}')">${s}</button>
                `).join('')}
            </div>
        </div>

        <div class="config-group">
            <h3>Body Size</h3>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <div style="flex:1">
                    <label style="font-size:0.85rem">Length</label>
                    <div class="shape-grid" style="grid-template-columns:repeat(3,1fr);">
                        ${['short','medium','long'].map(s=>`<button class="shape-btn ${state.dogConfig.bodyLength===s?'active':''}" onclick="window.updateConfig('bodyLength','${s}')">${s}</button>`).join('')}
                    </div>
                </div>
                <div style="flex:1">
                    <label style="font-size:0.85rem">Width</label>
                    <div class="shape-grid" style="grid-template-columns:repeat(3,1fr);">
                        ${['short','medium','wide'].map(s=>`<button class="shape-btn ${state.dogConfig.bodyWidth===s?'active':''}" onclick="window.updateConfig('bodyWidth','${s}')">${s}</button>`).join('')}
                    </div>
                </div>
            </div>
            <label style="font-size:0.85rem">Leg Length</label>
            <div class="shape-grid" style="grid-template-columns:repeat(3,1fr);">
                ${['short','medium','long'].map(s=>`<button class="shape-btn ${state.dogConfig.legLength===s?'active':''}" onclick="window.updateConfig('legLength','${s}')">${s}</button>`).join('')}
            </div>
        </div>

        <div class="config-group">
            <h3>Copy Color</h3>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <select id="copy-source" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ddd;">
                    <option value="bodyColor">Body</option>
                    <option value="headColor">Head</option>
                    <option value="legsColor">Legs</option>
                    <option value="snoutColor">Snout</option>
                    <option value="earColor">Ears</option>
                    <option value="tailColor">Tail</option>
                    <option value="spotsColor">Spots</option>
                    <option value="noseColor">Nose</option>
                    <option value="eyeColor">Eyes</option>
                </select>
                <select id="copy-target" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ddd;">
                    <option value="headColor">Head</option>
                    <option value="bodyColor">Body</option>
                    <option value="legsColor">Legs</option>
                    <option value="snoutColor">Snout</option>
                    <option value="earColor">Ears</option>
                    <option value="tailColor">Tail</option>
                    <option value="spotsColor">Spots</option>
                    <option value="noseColor">Nose</option>
                    <option value="eyeColor">Eyes</option>
                    <option value="all">All</option>
                </select>
                <button class="shape-btn" style="flex:0 0 auto;" onclick="window.copySelectedColor()">Copy</button>
            </div>
            <div style="margin-top:8px;">
                <button class="shape-btn" onclick="window.copyColorTo('head')">Quick: Body → Head</button>
                <button class="shape-btn" onclick="window.copyColorTo('legs')">Quick: Body → Legs</button>
                <button class="shape-btn" onclick="window.copyColorTo('all')">Quick: Body → All</button>
            </div>
        </div>

        <button class="start-btn" onclick="window.startGame()">BRING DOG HOME 🐕</button>
    `;
    
    updatePreview();
}

function renderConfigGroup(label, key, colorList) {
    const isCustom = !colorList.includes(state.dogConfig[key]);
    return `
        <div class="config-group">
            <h3>${label}</h3>
            <div class="color-grid">
                ${colorList.map(c => `
                    <div class="color-swatch ${state.dogConfig[key] === c ? 'active' : ''}" 
                         style="background: ${c}" 
                         onclick="window.updateConfig('${key}', '${c}')"></div>
                `).join('')}
                <div class="color-swatch custom-color-container ${isCustom ? 'active' : ''}" title="Custom Color">
                    <input type="color" value="${state.dogConfig[key]}" onchange="window.updateConfig('${key}', this.value)">
                </div>
            </div>
        </div>
    `;
}

window.copyColorTo = (target) => {
    const bodyCol = state.dogConfig.bodyColor;
    if (target === 'head') state.dogConfig.headColor = bodyCol;
    else if (target === 'legs') state.dogConfig.legsColor = bodyCol;
    else if (target === 'all') {
        state.dogConfig.headColor = bodyCol;
        state.dogConfig.legsColor = bodyCol;
        state.dogConfig.snoutColor = bodyCol;
        state.dogConfig.earColor = bodyCol;
        state.dogConfig.tailColor = bodyCol;
        state.dogConfig.spotsColor = bodyCol;
        state.dogConfig.noseColor = bodyCol;
        state.dogConfig.eyeColor = bodyCol;
    }
    window.renderCreationScreen();
};

window.copySelectedColor = () => {
    const src = document.getElementById('copy-source').value;
    const tgt = document.getElementById('copy-target').value;
    const value = state.dogConfig[src];
    if (!value) return;
    if (tgt === 'all') {
        const keys = ['bodyColor','headColor','legsColor','snoutColor','earColor','tailColor','spotsColor','noseColor','eyeColor'];
        keys.forEach(k => state.dogConfig[k] = value);
    } else {
        state.dogConfig[tgt] = value;
    }
    window.renderCreationScreen();
};

function updatePreview() {
    const preview = document.getElementById('creation-preview');
    if (preview) {
        preview.innerHTML = DogRenderer.render(state.dogConfig, 1.2);
    }
}

window.updateConfig = (key, val) => {
    state.dogConfig[key] = val;
    window.renderCreationScreen();
};

window.startGame = () => {
    audio.play('dog_bark.mp3');
    window.renderGameScreen();
};

window.renderGameScreen = () => {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="screen game-screen">
            <div class="stats-bar">
                <div class="stat-item">
                    <span class="stat-label">Energy</span>
                    <div class="progress-bg"><div class="progress-fill energy-fill" style="width: ${state.stats.energy}%"></div></div>
                    <span style="font-size: 0.7rem; width: 30px">${Math.round(state.stats.energy)}%</span>
                </div>
                ${state.stats.skills.map(skill => `
                    <div class="stat-item">
                        <span class="stat-label">${skill.name} (L${skill.level})</span>
                        <div class="progress-bg"><div class="progress-fill exp-fill" style="width: ${skill.exp}%"></div></div>
                        <span style="font-size: 0.7rem; width: 30px">${skill.exp}%</span>
                    </div>
                `).join('')}
            </div>

            <div class="game-world" id="game-world">
                <div class="dog-display" id="dog-actor">
                    ${DogRenderer.render(state.dogConfig, 1.5)}
                </div>
            </div>

            <div class="actions-panel">
                <div class="action-tabs">
                    <button class="tab-btn ${state.currentTab === 'restore' ? 'active' : ''}" onclick="window.setTab('restore')">Care</button>
                    <button class="tab-btn ${state.currentTab === 'training' ? 'active' : ''}" onclick="window.setTab('training')">Train</button>
                    <button class="tab-btn" onclick="window.showCustomModal()">⚙️</button>
                </div>
                <div class="actions-list">
                    ${renderActions()}
                </div>
            </div>
        </div>
    `;
    setupDragEvents();
}

function renderActions() {
    const visibleActions = [
        ...state.actions.filter(a => a.category === state.currentTab),
        ...state.unlockables.filter(a => {
            if (a.category !== state.currentTab) return false;
            const skill = state.stats.skills.find(s => s.name === a.skill);
            return skill && skill.level >= a.reqLevel;
        })
    ];

    // Deduplicate visible actions (in case we added unlockables already)
    const uniqueActions = [];
    const ids = new Set();
    visibleActions.forEach(a => {
        if (!ids.has(a.id)) {
            uniqueActions.push(a);
            ids.add(a.id);
        }
    });

    return uniqueActions.map(action => `
        <div class="action-card ${action.type}" 
             data-id="${action.id}"
             ${action.type === 'clickable' ? `onclick="window.handleAction('${action.id}')"` : ''}
             ${action.type === 'draggable' ? `onpointerdown="window.startDrag(event, '${action.id}')"` : ''}>
            <div class="emoji">${action.emoji}</div>
            <div>${action.name}</div>
        </div>
    `).join('');
}

window.setTab = (t) => {
    state.currentTab = t;
    window.renderGameScreen();
};

window.handleAction = (id) => {
    const action = [...state.actions, ...state.unlockables].find(a => a.id === id);
    if (!action) return;

    if (action.category === 'training') {
        if (state.stats.energy <= 0) {
            showToast("Dog is too tired!");
            return;
        }
        
        // Competitions
        if (action.isComp) {
            const skill = state.stats.skills.find(s => s.name === action.skill);
            const diff = skill.level - action.reqLevel;
            const winChance = Math.min(0.95, action.winChance + (diff * 0.02));
            const won = Math.random() < winChance;
            showCompetitionResult(action, won);
            if (!won) {
                applyActionEffects(action, 0.5); // Half exp for losing
                return;
            }
        }
        applyActionEffects(action);
    } else {
        applyActionEffects(action);
    }
    
    animateDog();
};

function applyActionEffects(action, multiplier = 1) {
    const soundFile = action.sound === 'eat' ? 'dog_eat.mp3' : 'dog_bark.mp3';
    
    if (action.category === 'restore') {
        const gain = Math.floor(Math.random() * (action.value[1] - action.value[0] + 1)) + action.value[0];
        state.stats.energy = Math.min(100, state.stats.energy + gain);
        showFloatingText(`+${gain} Energy`, '#e67e22');
        audio.play(soundFile);
    } else if (action.category === 'training') {
        const cost = action.energyCost ? (Math.floor(Math.random() * (action.energyCost[1] - action.energyCost[0] + 1)) + action.energyCost[0]) : 15;
        state.stats.energy = Math.max(0, state.stats.energy - cost);
        
        const skill = state.stats.skills.find(s => s.name === action.skill);
        if (skill) {
            // Exp calculation: 10% base. If unlockable, +5% * (rank)
            let expGain = 10;
            const unlockIndex = state.unlockables.filter(u => u.skill === skill.name).findIndex(u => u.id === action.id);
            if (unlockIndex !== -1) {
                expGain += 5 * (unlockIndex + 1);
            }
            expGain *= multiplier;

            skill.exp += expGain;
            if (skill.exp >= 100) {
                skill.exp = 0;
                skill.level++;
                audio.play('level_up.mp3');
                showToast(`${skill.name} Leveled Up to ${skill.level}!`);
            }
            showFloatingText(`+${expGain}% ${skill.name} Exp`, '#2ecc71');
        }
        audio.play(soundFile);
    }
    window.renderGameScreen();
}

function animateDog() {
    const actor = document.getElementById('dog-actor');
    actor.classList.remove('bounce');
    void actor.offsetWidth;
    actor.classList.add('bounce');
}

// Dragging Logic
window.startDrag = (e, id) => {
    // Prevent default browser behavior like scrolling
    e.preventDefault();
    
    state.draggedAction = [...state.actions, ...state.unlockables].find(a => a.id === id);
    if (!state.draggedAction) return;

    const ghost = document.createElement('div');
    ghost.id = 'drag-ghost';
    ghost.className = 'drag-ghost';
    ghost.innerText = state.draggedAction.emoji;
    document.body.appendChild(ghost);
    
    const moveGhost = (pe) => {
        const x = pe.clientX || (pe.touches && pe.touches[0].clientX);
        const y = pe.clientY || (pe.touches && pe.touches[0].clientY);
        ghost.style.left = `${x - 25}px`;
        ghost.style.top = `${y - 25}px`;
    };
    
    moveGhost(e);
    
    const onMove = (pe) => moveGhost(pe);
    const onUp = (pe) => {
        const dogActor = document.getElementById('dog-actor');
        const x = pe.clientX || (pe.changedTouches && pe.changedTouches[0].clientX);
        const y = pe.clientY || (pe.changedTouches && pe.changedTouches[0].clientY);

        if (dogActor && state.draggedAction) {
            const dogRect = dogActor.getBoundingClientRect();
            if (x >= dogRect.left && x <= dogRect.right &&
                y >= dogRect.top && y <= dogRect.bottom) {
                window.handleAction(state.draggedAction.id);
            }
        }
        if (ghost && ghost.parentNode) ghost.remove();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        state.draggedAction = null;
    };
    
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
};

function setupDragEvents() {} // Placeholder for potential logic

// Competition Result
function showCompetitionResult(action, won) {
    if (won) audio.play('race_win.mp3');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const title = won ? 'VICTORY! 🏆' : 'DEFEAT 🥈';
    const defaultMsg = won ? `Your dog won the ${action.name}.` : `Your dog did not win the ${action.name}.`;
    const msg = (won ? action.winMsg : action.loseMsg) || defaultMsg;

    overlay.innerHTML = `
        <div class="modal-content result-popup">
            <h2>${title}</h2>
            <p>${msg}</p>
            <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">OK</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// Customization Modals
window.showCustomModal = () => {
    let overlay = document.querySelector('.modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div class="modal-content">
            <h3>Management</h3>
            <div class="btn-row">
                <button class="btn-primary" onclick="window.showAddSkill()">Add Skill</button>
                <button class="btn-primary" onclick="window.showAddAction()">Add Action</button>
            </div>
            <div class="btn-row">
                <button class="btn-primary" onclick="window.showManageList('skills')">Manage Stats</button>
                <button class="btn-primary" onclick="window.showManageList('actions')">Manage Actions</button>
            </div>
            <button class="btn-primary" style="width: 100%; margin-top: 10px; background: #8e44ad;" onclick="window.renderCreationScreen()">Edit Dog Visuals</button>
            <button class="btn-secondary" style="width: 100%; margin-top: 10px" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        </div>
    `;
};

window.showManageList = (type) => {
    const list = type === 'skills' ? state.stats.skills : [...state.actions, ...state.unlockables];
    const overlay = document.querySelector('.modal-overlay');
    overlay.innerHTML = `
        <div class="modal-content">
            <h3>Manage ${type === 'skills' ? 'Stats' : 'Actions'}</h3>
            <div style="display:flex; flex-direction:column; gap:5px; max-height:300px; overflow-y:auto; margin-bottom:15px;">
                ${list.map((item, idx) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f0f0f0; padding:8px; border-radius:5px;">
                        <span>${item.emoji || ''} ${item.name} ${type === 'skills' ? '(L'+item.level+')' : ''}</span>
                        <div style="display:flex; gap:5px;">
                            <button onclick="window.editItem('${type}', ${idx})" style="padding:2px 8px; font-size:12px;">Edit</button>
                            <button onclick="window.deleteItem('${type}', ${idx})" style="padding:2px 8px; font-size:12px; background:#e74c3c; color:white; border:none; border-radius:3px;">X</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn-secondary" style="width: 100%" onclick="window.showCustomModal()">Back</button>
        </div>
    `;
};

window.deleteItem = (type, idx) => {
    if (!confirm('Are you sure?')) return;
    if (type === 'skills') {
        state.stats.skills.splice(idx, 1);
    } else {
        const all = [...state.actions, ...state.unlockables];
        const removed = all.splice(idx, 1)[0];
        state.actions = state.actions.filter(a => a.id !== removed.id);
        state.unlockables = state.unlockables.filter(a => a.id !== removed.id);
    }
    window.showManageList(type);
    window.renderGameScreen();
};

window.editItem = (type, idx) => {
    if (type === 'skills') {
        const skill = state.stats.skills[idx];
        document.querySelector('.modal-overlay').innerHTML = `
            <div class="modal-content">
                <h3>Edit Skill</h3>
                <div class="custom-form">
                    <label>Name</label>
                    <input type="text" id="edit-skill-name" value="${skill.name}">
                    <label>Level</label>
                    <input type="number" id="edit-skill-level" value="${skill.level}">
                    <label>Exp %</label>
                    <input type="number" id="edit-skill-exp" value="${skill.exp}">
                    <button class="btn-primary" onclick="window.saveEditedSkill(${idx})">Save</button>
                    <button class="btn-secondary" onclick="window.showManageList('skills')">Cancel</button>
                </div>
            </div>
        `;
    } else {
        const all = [...state.actions, ...state.unlockables];
        const act = all[idx];
        window.showAddAction(act, idx);
    }
};

window.saveEditedSkill = (idx) => {
    const skill = state.stats.skills[idx];
    skill.name = document.getElementById('edit-skill-name').value;
    skill.level = parseInt(document.getElementById('edit-skill-level').value) || 1;
    skill.exp = parseInt(document.getElementById('edit-skill-exp').value) || 0;
    window.renderGameScreen();
    window.showManageList('skills');
};

window.showAddSkill = () => {
    document.querySelector('.modal-overlay').innerHTML = `
        <div class="modal-content">
            <h3>Create New Skill</h3>
            <div class="custom-form">
                <input type="text" id="skill-name" placeholder="Skill Name (e.g. Agility)">
                <button class="btn-primary" onclick="window.saveSkill()">Create</button>
                <button class="btn-secondary" onclick="window.showCustomModal()">Back</button>
            </div>
        </div>
    `;
};

window.saveSkill = () => {
    const name = document.getElementById('skill-name').value;
    if (name) {
        state.stats.skills.push({ name, exp: 0, level: 1 });
        window.renderGameScreen();
        document.querySelector('.modal-overlay').remove();
    }
};

window.showAddAction = (editingAct = null, editingIdx = null) => {
    document.querySelector('.modal-overlay').innerHTML = `
        <div class="modal-content">
            <h3>${editingAct ? 'Edit' : 'Create New'} Action</h3>
            <div class="custom-form">
                <input type="text" id="act-name" placeholder="Action Name" value="${editingAct ? editingAct.name : ''}">
                <input type="text" id="act-emoji" placeholder="Emoji (e.g. 🦴)" value="${editingAct ? editingAct.emoji : ''}">
                <select id="act-cat">
                    <option value="restore" ${editingAct?.category === 'restore' ? 'selected' : ''}>Care / Energy</option>
                    <option value="training" ${editingAct?.category === 'training' ? 'selected' : ''}>Training</option>
                </select>
                <select id="act-type">
                    <option value="clickable" ${editingAct?.type === 'clickable' ? 'selected' : ''}>Clickable</option>
                    <option value="draggable" ${editingAct?.type === 'draggable' ? 'selected' : ''}>Draggable</option>
                </select>
                <select id="act-sound">
                    <option value="bark" ${editingAct?.sound === 'bark' ? 'selected' : ''}>Sound: Bark 🐕</option>
                    <option value="eat" ${editingAct?.sound === 'eat' ? 'selected' : ''}>Sound: Eating 🍖</option>
                </select>
                <div id="training-fields" style="display:${editingAct?.category === 'training' ? 'block' : 'none'}">
                    <select id="act-skill">
                        ${state.stats.skills.map(s => `<option value="${s.name}" ${editingAct?.skill === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                    <select id="act-init">
                        <option value="init" ${state.actions.some(a => a.id === editingAct?.id) ? 'selected' : ''}>Initial</option>
                        <option value="unlock" ${state.unlockables.some(a => a.id === editingAct?.id) ? 'selected' : ''}>Unlockable</option>
                    </select>
                    <input type="number" id="act-lvl" placeholder="Level required" value="${editingAct ? (editingAct.reqLevel || 0) : 1}">
                    
                    <div class="comp-toggle-row" style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" id="act-is-comp" style="width:auto" ${editingAct?.isComp ? 'checked' : ''}>
                        <label for="act-is-comp">Is Competition?</label>
                    </div>

                    <div id="comp-fields" style="display:${editingAct?.isComp ? 'block' : 'none'}; margin-top:10px; border-left: 2px solid #ddd; padding-left: 10px;">
                        <input type="number" id="act-win-chance" placeholder="Initial Win Chance %" value="${editingAct ? (editingAct.winChance * 100) : 50}">
                        <input type="text" id="act-win-msg" placeholder="Win Message (e.g. 1st Place!)" value="${editingAct?.winMsg || ''}">
                        <input type="text" id="act-lose-msg" placeholder="Lose Message (e.g. Nice try!)" value="${editingAct?.loseMsg || ''}">
                    </div>
                </div>
                <button class="btn-primary" onclick="window.saveAction(${editingIdx !== null ? editingIdx : null})">${editingAct ? 'Save' : 'Create'}</button>
                <button class="btn-secondary" onclick="${editingAct ? 'window.showManageList(\'actions\')' : 'window.showCustomModal()'}">Back</button>
            </div>
        </div>
    `;
    
    const catSelect = document.getElementById('act-cat');
    const trainFields = document.getElementById('training-fields');
    const compCheck = document.getElementById('act-is-comp');
    const compFields = document.getElementById('comp-fields');

    catSelect.onchange = () => {
        trainFields.style.display = catSelect.value === 'training' ? 'block' : 'none';
    };
    compCheck.onchange = () => {
        compFields.style.display = compCheck.checked ? 'block' : 'none';
    };
};

window.saveAction = (editingIdx = null) => {
    const name = document.getElementById('act-name').value;
    const emoji = document.getElementById('act-emoji').value;
    const cat = document.getElementById('act-cat').value;
    const type = document.getElementById('act-type').value;
    const sound = document.getElementById('act-sound').value;
    const skill = document.getElementById('act-skill').value;
    const isInit = document.getElementById('act-init').value === 'init';
    const reqLevel = parseInt(document.getElementById('act-lvl').value) || 1;
    const isComp = document.getElementById('act-is-comp').checked;
    const winChance = (parseInt(document.getElementById('act-win-chance').value) || 50) / 100;
    const winMsg = document.getElementById('act-win-msg').value;
    const loseMsg = document.getElementById('act-lose-msg').value;

    if (name && emoji) {
        const action = {
            id: editingIdx !== null ? [...state.actions, ...state.unlockables][editingIdx].id : 'custom_' + Date.now(),
            name,
            emoji,
            type,
            category: cat,
            sound,
            value: [20, 40],
            energyCost: [15, 30],
            skill: cat === 'training' ? skill : null,
            reqLevel: cat === 'training' ? reqLevel : 0,
            isComp: cat === 'training' ? isComp : false,
            winChance: isComp ? winChance : 0,
            winMsg: winMsg || null,
            loseMsg: loseMsg || null
        };

        if (editingIdx !== null) {
            const all = [...state.actions, ...state.unlockables];
            const oldId = all[editingIdx].id;
            state.actions = state.actions.filter(a => a.id !== oldId);
            state.unlockables = state.unlockables.filter(a => a.id !== oldId);
        }

        if (cat === 'restore' || isInit) {
            state.actions.push(action);
        } else {
            state.unlockables.push(action);
        }
        
        window.renderGameScreen();
        if (editingIdx !== null) {
            window.showManageList('actions');
        } else {
            document.querySelector('.modal-overlay').remove();
        }
    }
};

// Utilities
function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '220px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(0,0,0,0.8)';
    toast.style.color = 'white';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '20px';
    toast.style.zIndex = '3000';
    toast.style.fontSize = '0.9rem';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function showFloatingText(text, color) {
    const world = document.getElementById('game-world');
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;
    el.style.color = color;
    el.style.left = '50%';
    el.style.top = '40%';
    world.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

init();