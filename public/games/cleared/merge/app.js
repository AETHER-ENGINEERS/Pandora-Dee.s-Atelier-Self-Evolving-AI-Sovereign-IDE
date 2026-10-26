function uuidv4() { return crypto.randomUUID(); }

class MergeGame {
    constructor() {
        this.elements = new Map();
        this.mixRules = new Map();
        this.workspaceElements = new Map();
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateElementSelectors();
    }

    bindEvents() {
        document.getElementById('add-element-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addElement();
        });

        document.getElementById('add-mix-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addMixRule();
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetGame();
        });

        this.setupDragAndDrop();
    }

    resetGame() {
        if (confirm('Are you sure you want to reset everything? This will clear all elements, mix rules, and workspace items.')) {
            // Clear all data
            this.elements.clear();
            this.mixRules.clear();
            this.workspaceElements.clear();
            
            // Clear UI
            document.getElementById('element-bank').innerHTML = '<p>Drag elements here to start mixing!</p>';
            document.querySelector('.workspace-elements')?.remove();
            document.querySelector('.drop-zone').style.display = 'flex';
            
            // Update selectors
            this.updateElementSelectors();
            
            this.showNotification('Game reset successfully!', 'success');
        }
    }

    addElement() {
        const name = document.getElementById('element-name').value.trim();
        const color = document.getElementById('element-color').value;

        if (this.elements.has(name)) {
            this.showNotification('Element already exists!', 'error');
            return;
        }

        const element = { id: uuidv4(), name, color };
        this.elements.set(name, element);

        this.createElementElement(element);
        this.updateElementSelectors();
        this.clearForm('add-element-form');
        this.showNotification(`Added element: ${name}`, 'success');
    }

    createElementElement(element) {
        const div = document.createElement('div');
        div.className = 'element-item';
        div.draggable = true;
        div.dataset.elementName = element.name;
        div.style.backgroundColor = element.color;
        div.style.color = this.getContrastColor(element.color);
        div.textContent = element.name;

        div.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', element.name);
            div.classList.add('dragging');
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
        });

        document.getElementById('element-bank').appendChild(div);
    }

    updateElementSelectors() {
        const select1 = document.getElementById('element1');
        const select2 = document.getElementById('element2');
        
        const options = Array.from(this.elements.values()).map(el => 
            `<option value="${el.name}">${el.name}</option>`
        ).join('');

        select1.innerHTML = '<option value="">Select first element...</option>' + options;
        select2.innerHTML = '<option value="">Select second element...</option>' + options;
    }

    addMixRule() {
        const elem1 = document.getElementById('element1').value;
        const elem2 = document.getElementById('element2').value;
        const resultName = document.getElementById('result-name').value.trim();
        const resultColor = document.getElementById('result-color').value;

        if (!elem1 || !elem2 || elem1 === elem2) {
            this.showNotification('Please select two different elements!', 'error');
            return;
        }

        if (!this.elements.has(elem1) || !this.elements.has(elem2)) {
            this.showNotification('Invalid elements selected!', 'error');
        }

        const key = this.getMixKey(elem1, elem2);
        const mixRule = {
            elements: [elem1, elem2],
            resultName,
            resultColor
        };

        this.mixRules.set(key, mixRule);
        
        this.clearForm('add-mix-form');
        this.showNotification(`Added mix rule: ${elem1} + ${elem2} = ${resultName}`, 'success');
    }

    getMixKey(elem1, elem2) {
        return [elem1, elem2].sort().join('|');
    }

    setupDragAndDrop() {
        const dropZone = document.querySelector('.drop-zone');
        const workspace = document.querySelector('.workspace');

        workspace.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        workspace.addEventListener('dragleave', (e) => {
            if (!workspace.contains(e.relatedTarget)) {
                dropZone.classList.remove('drag-over');
            }
        });

        workspace.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const elementName = e.dataTransfer.getData('text/plain');
            this.handleDrop(elementName, e);
        });
    }

    handleDrop(elementName, e) {
        const droppedElement = this.elements.get(elementName);
        if (!droppedElement) return;

        if (this.workspaceElements.size === 0) {
            this.workspaceElements.set(elementName, droppedElement);
            this.updateWorkspaceDisplay();
            return;
        }

        if (this.workspaceElements.size === 1) {
            const existingElement = Array.from(this.workspaceElements.values())[0];
            const key = this.getMixKey(existingElement.name, droppedElement.name);
            const mixRule = this.mixRules.get(key);

            if (mixRule) {
                if (!this.elements.has(mixRule.resultName)) {
                    const newElement = { id: uuidv4(), name: mixRule.resultName, color: mixRule.resultColor };
                    this.elements.set(mixRule.resultName, newElement);
                    this.createElementElement(newElement);
                    this.updateElementSelectors();
                }

                const result = this.elements.get(mixRule.resultName);
                this.workspaceElements.clear();
                this.workspaceElements.set(result.name, result);
                this.showNotification(`${existingElement.name} + ${droppedElement.name} = ${result.name}`, 'success');
            } else {
                this.showNotification('No mix rule defined for these elements!', 'error');
                return;
            }
        }

        this.updateWorkspaceDisplay();
    }

    updateWorkspaceDisplay() {
        const dropZone = document.querySelector('.drop-zone');
        const workspace = document.querySelector('.workspace');

        if (this.workspaceElements.size === 0) {
            dropZone.style.display = 'flex';
            const existingDisplay = workspace.querySelector('.workspace-elements');
            if (existingDisplay) existingDisplay.remove();
            return;
        }

        dropZone.style.display = 'none';

        let display = workspace.querySelector('.workspace-elements');
        if (!display) {
            display = document.createElement('div');
            display.className = 'workspace-elements';
            workspace.appendChild(display);
        }

        display.innerHTML = '';
        this.workspaceElements.forEach(element => {
            const div = document.createElement('div');
            div.className = 'element-item';
            div.style.backgroundColor = element.color;
            div.style.color = this.getContrastColor(element.color);
            div.textContent = element.name;
            display.appendChild(div);
        });

        if (this.workspaceElements.size === 1) {
            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear Workspace';
            clearBtn.style.marginLeft = 'auto';
            clearBtn.addEventListener('click', () => {
                this.workspaceElements.clear();
                this.updateWorkspaceDisplay();
            });
            display.appendChild(clearBtn);
        }
    }

    getContrastColor(hexColor) {
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }

    clearForm(formId) {
        document.getElementById(formId).reset();
    }

    showNotification(message, type) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }
}

const game = new MergeGame();