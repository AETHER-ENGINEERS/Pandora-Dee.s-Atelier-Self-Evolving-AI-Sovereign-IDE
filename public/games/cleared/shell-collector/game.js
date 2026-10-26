class Shell {
    constructor() {
        this.shape = this.generateShape();
        this.colors = this.generateColor();
        this.quality = Math.floor(Math.random() * 50) + 50; // 50-100
        this.cleanliness = Math.floor(Math.random() * 50) + 50; // 50-100
        this.description = this.generateDescription();
        this.imageSvg = this.generateShellSvg();
    }

    generateShape() {
        const shapes = ['triangle', 'spiral', 'conch', 'scallop', 'clam'];
        return shapes[Math.floor(Math.random() * shapes.length)];
    }

    generateColor() {
        const colors = [
            '#FFC107', // Amber
            '#FF5722', // Deep Orange
            '#2196F3', // Blue
            '#4CAF50', // Green
            '#9C27B0', // Purple
            '#FF9800', // Orange
            '#795548', // Brown
            '#607D8B', // Blue Grey
            '#F44336', // Red
            '#E91E63', // Pink
            '#673AB7', // Deep Purple
            '#3F51B5', // Indigo
            '#00BCD4', // Cyan
            '#009688', // Teal
            '#8BC34A', // Light Green
            '#FFEB3B', // Yellow
            '#FF4081', // Pink Accent
            '#00E676'  // Green Accent
        ];

        // 10% chance of two-color shell
        if (Math.random() < 0.1) {
            const firstColor = colors[Math.floor(Math.random() * colors.length)];
            let secondColor;
            do {
                secondColor = colors[Math.floor(Math.random() * colors.length)];
            } while (secondColor === firstColor);
            return [firstColor, secondColor];
        }

        return [colors[Math.floor(Math.random() * colors.length)]];
    }

    generateDescription() {
        const descriptions = {
            'triangle': 'A sharp, angular shell with crisp edges and a geometric charm.',
            'spiral': 'A mesmerizing spiral shell with elegant, twisting curves.',
            'conch': 'A large, majestic shell with a deep, resonant interior.',
            'scallop': 'A delicate shell with graceful, fan-like ridges.',
            'clam': 'A robust shell with smooth, rounded surfaces.'
        };
        return descriptions[this.shape];
    }

    generateShellSvg() {
        const svgs = {
            'triangle': (color1, color2) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                ${color2 ? `<polygon points="50,10 10,90 90,90" fill="url(#bicolor)" stroke="black" stroke-width="2"/>
                <defs>
                    <linearGradient id="bicolor" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${color1}"/>
                        <stop offset="100%" stop-color="${color2}"/>
                    </linearGradient>
                </defs>` : `<polygon points="50,10 10,90 90,90" fill="${color1}" stroke="black" stroke-width="2"/>`}
            </svg>`,
            'spiral': (color1, color2) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                ${color2 ? `<path d="M50,50 C70,30 80,40 70,60 S50,80 40,70 S30,50 50,50" 
                      fill="url(#bicolor)" stroke="black" stroke-width="2"/>
                <defs>
                    <linearGradient id="bicolor" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${color1}"/>
                        <stop offset="100%" stop-color="${color2}"/>
                    </linearGradient>
                </defs>` : `<path d="M50,50 C70,30 80,40 70,60 S50,80 40,70 S30,50 50,50" 
                      fill="${color1}" stroke="black" stroke-width="2"/>`}
            </svg>`,
            'conch': (color1, color2) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                ${color2 ? `<path d="M50,50 C70,30 80,50 70,70 S50,90 40,80 S30,60 50,50" 
                      fill="url(#bicolor)" stroke="black" stroke-width="2"/>
                <defs>
                    <linearGradient id="bicolor" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${color1}"/>
                        <stop offset="100%" stop-color="${color2}"/>
                    </linearGradient>
                </defs>` : `<path d="M50,50 C70,30 80,50 70,70 S50,90 40,80 S30,60 50,50" 
                      fill="${color1}" stroke="black" stroke-width="2"/>`}
            </svg>`,
            'scallop': (color1, color2) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                ${color2 ? `<path d="M50,20 Q70,50 50,80 Q30,50 50,20" 
                      fill="url(#bicolor)" stroke="black" stroke-width="2"/>
                <defs>
                    <linearGradient id="bicolor" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${color1}"/>
                        <stop offset="100%" stop-color="${color2}"/>
                    </linearGradient>
                </defs>` : `<path d="M50,20 Q70,50 50,80 Q30,50 50,20" 
                      fill="${color1}" stroke="black" stroke-width="2"/>`}
            </svg>`,
            'clam': (color1, color2) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                ${color2 ? `<ellipse cx="50" cy="50" rx="40" ry="30" 
                         fill="url(#bicolor)" stroke="black" stroke-width="2"/>
                <defs>
                    <linearGradient id="bicolor" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${color1}"/>
                        <stop offset="100%" stop-color="${color2}"/>
                    </linearGradient>
                </defs>` : `<ellipse cx="50" cy="50" rx="40" ry="30" 
                         fill="${color1}" stroke="black" stroke-width="2"/>`}
            </svg>`
        };
        return svgs[this.shape](this.colors[0], this.colors[1]);
    }

    calculateValue() {
        // Calculate the base value based on quality and cleanliness (between 0 and 100)
        const baseValue = Math.floor((this.quality + this.cleanliness) / 2);
        
        // Scale the value to be between 1 and 20
        const scaledValue = Math.max(1, Math.min(20, Math.floor(baseValue / 5)));
        
        return scaledValue;
    }
}

class ShellCollectorGame {
    constructor() {
        this.coins = 5; // Start with 5 coins
        this.collection = [];
        this.initializeEventListeners();
        this.updateCoinDisplay(); // Initialize coin display
    }

    initializeEventListeners() {
        document.getElementById('look-for-shells').addEventListener('click', () => this.lookForShells());
        document.getElementById('collection-btn').addEventListener('click', () => this.showCollection());
        document.getElementById('polish-shell').addEventListener('click', () => this.showPolishModal());
        document.getElementById('sell-shell').addEventListener('click', () => this.showSellModal());
        document.getElementById('close-collection').addEventListener('click', this.closeModal);
        document.getElementById('close-polish').addEventListener('click', this.closeModal);
        document.getElementById('close-sell').addEventListener('click', this.closeModal);
    }

    lookForShells() {
        if (this.coins < 5) {
            alert('Not enough coins to look for shells! You need 5 coins.');
            return;
        }

        this.coins -= 5; // Deduct 5 coins for looking for shells
        this.updateCoinDisplay();

        const shellFindModal = document.getElementById('shell-find-modal');
        const shellOptions = document.getElementById('shell-options');
        shellOptions.innerHTML = '';

        // Generate 3 random shells
        for (let i = 0; i < 3; i++) {
            const shell = new Shell();
            const shellCard = this.createShellCard(shell, true);
            shellCard.addEventListener('click', () => this.selectShell(shell, shellFindModal));
            shellOptions.appendChild(shellCard);
        }

        shellFindModal.classList.remove('hidden');
    }

    selectShell(shell, modal) {
        this.collection.push(shell);
        modal.classList.add('hidden');
        this.updateCoinDisplay();
    }

    showCollection() {
        const collectionModal = document.getElementById('collection-modal');
        const collectedShells = document.getElementById('collected-shells');
        collectedShells.innerHTML = '';

        this.collection.forEach(shell => {
            const shellCard = this.createShellCard(shell);
            collectedShells.appendChild(shellCard);
        });

        collectionModal.classList.remove('hidden');
    }

    showPolishModal() {
        if (this.coins < 5) {
            alert('Not enough coins to polish a shell!');
            return;
        }

        const polishModal = document.getElementById('polish-shell-options');
        polishModal.innerHTML = '';

        this.collection.forEach((shell, index) => {
            const shellCard = this.createShellCard(shell);
            shellCard.addEventListener('click', () => this.polishShell(index));
            polishModal.appendChild(shellCard);
        });

        document.getElementById('polish-modal').classList.remove('hidden');
    }

    polishShell(index) {
        this.coins -= 5;
        const shell = this.collection[index];
        shell.quality = Math.min(100, shell.quality + 10);
        shell.cleanliness = Math.min(100, shell.cleanliness + 10);
        this.updateCoinDisplay();
        this.closeModal();
    }

    showSellModal() {
        const sellModal = document.getElementById('sell-shell-options');
        sellModal.innerHTML = '';

        this.collection.forEach((shell, index) => {
            const shellCard = this.createShellCard(shell);
            shellCard.addEventListener('click', () => this.sellShell(index));
            sellModal.appendChild(shellCard);
        });

        document.getElementById('sell-modal').classList.remove('hidden');
    }

    sellShell(index) {
        const shell = this.collection[index];
        const shellValue = shell.calculateValue();
        
        if (confirm(`Are you sure you want to sell this ${shell.shape} shell for ${shellValue} coins?`)) {
            this.coins += shellValue;
            this.collection.splice(index, 1);
            this.updateCoinDisplay();
            this.closeModal();
        }
    }

    createShellCard(shell, isNewShell = false) {
        const shellCard = document.createElement('div');
        shellCard.classList.add('shell-card');
        
        // Handle single or multi-color backgrounds
        if (shell.colors.length === 1) {
            shellCard.style.backgroundColor = shell.colors[0];
        } else {
            shellCard.style.background = `linear-gradient(to right, ${shell.colors[0]}, ${shell.colors[1]})`;
        }

        shellCard.innerHTML = `
            <div class="shell-svg">${shell.imageSvg}</div>
            <div>${shell.shape}</div>
            <div class="shell-description">${shell.description}</div>
            ${!isNewShell ? `
                <div class="shell-progress-container">
                    <div class="progress-label">Quality</div>
                    <div class="shell-progress quality-progress">
                        <div class="shell-progress-fill quality-bar" style="width: ${shell.quality}%"></div>
                    </div>
                    <div class="progress-label">Cleanliness</div>
                    <div class="shell-progress cleanliness-progress">
                        <div class="shell-progress-fill cleanliness-bar" style="width: ${shell.cleanliness}%"></div>
                    </div>
                </div>
            ` : ''}
        `;
        return shellCard;
    }

    updateCoinDisplay() {
        document.getElementById('coin-amount').textContent = this.coins;
    }

    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
    }
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    window.game = new ShellCollectorGame();
});