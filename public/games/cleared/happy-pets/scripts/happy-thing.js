export class HappyThing {
  constructor(options = {}) {
    this.color = options.color || `hsl(${Math.random() * 360}, 70%, 50%)`;
    this.patternColor = options.patternColor || `hsl(${Math.random() * 360}, 70%, 50%)`;
    this.hasPattern = options.hasPattern ?? Math.random() > 0.5;
    this.patternType = options.patternType || (Math.random() > 0.5 ? 'spots' : 'stripes');
    this.sizeLevel = 1;
    // Start with a much smaller base size
    this.baseSize = 20;
    this.size = this.calculateSize();
    
    this.element = this.createElement();
    this.updateSizeLevel();
  }

  calculateSize() {
    // More aggressive growth formula: baseSize + (level * 12)
    // This makes each size increase more noticeable
    return this.baseSize + (this.sizeLevel - 1) * 12;
  }

  createElement() {
    const container = document.createElement('div');
    container.className = 'happy-thing';
    
    // Create size label outside of SVG container to keep it independent
    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'size-level';
    container.appendChild(sizeLabel);
    
    // SVG container that will grow
    const svgContainer = document.createElement('div');
    svgContainer.className = 'svg-container';
    svgContainer.style.width = `${this.size}px`;
    svgContainer.style.height = `${this.size}px`;
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.style.width = '100%';
    svg.style.height = '100%';

    // Body
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '50');
    circle.setAttribute('cy', '60');
    circle.setAttribute('r', '35');
    circle.setAttribute('fill', this.color);

    // Thinner triangle hat - adding it first, before patterns
    const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    triangle.setAttribute('d', 'M50 5 L25 40 L75 40 Z');
    triangle.setAttribute('fill', this.color);

    svg.appendChild(circle);
    svg.appendChild(triangle);

    // Now add patterns on top of the triangle
    if (this.hasPattern) {
      const patternGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      
      if (this.patternType === 'spots') {
        const spotPositions = [
          {cx: 50, cy: 15},  // Top spot
          {cx: 35, cy: 25},  // Left spot
          {cx: 65, cy: 25}   // Right spot
        ];
        
        spotPositions.forEach(pos => {
          const spot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          spot.setAttribute('cx', pos.cx.toString());
          spot.setAttribute('cy', pos.cy.toString());
          spot.setAttribute('r', '4');
          spot.setAttribute('fill', this.patternColor);
          patternGroup.appendChild(spot);
        });
      } else {
        // Three stripes
        const stripes = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        stripes.setAttribute('d', 'M35 15 L65 15 M30 25 L70 25 M35 35 L65 35');
        stripes.setAttribute('stroke', this.patternColor);
        stripes.setAttribute('stroke-width', '3');
        stripes.setAttribute('stroke-linecap', 'round');
        patternGroup.appendChild(stripes);
      }
      svg.appendChild(patternGroup);
    }

    // Happy face elements last, so they're always on top
    const leftEye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    leftEye.setAttribute('cx', '40');
    leftEye.setAttribute('cy', '60');
    leftEye.setAttribute('r', '4');
    leftEye.setAttribute('fill', 'black');

    const rightEye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rightEye.setAttribute('cx', '60');
    rightEye.setAttribute('cy', '60');
    rightEye.setAttribute('r', '4');
    rightEye.setAttribute('fill', 'black');

    const smile = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    smile.setAttribute('d', 'M40,70 Q50,80 60,70');
    smile.setAttribute('fill', 'none');
    smile.setAttribute('stroke', 'black');
    smile.setAttribute('stroke-width', '3');
    smile.setAttribute('stroke-linecap', 'round');

    svg.appendChild(leftEye);
    svg.appendChild(rightEye);
    svg.appendChild(smile);
    svgContainer.appendChild(svg);
    container.appendChild(svgContainer);

    container.style.left = Math.random() * (window.innerWidth - this.size) + 'px';
    container.style.top = Math.random() * (window.innerHeight * 0.7 - this.size) + 'px';

    container.addEventListener('click', () => this.animate());

    return container;
  }

  updateSizeLevel() {
    const sizeLabel = this.element.querySelector('.size-level');
    sizeLabel.textContent = `Size: ${this.sizeLevel}`;
  }

  feed() {
    this.sizeLevel++;
    this.size = this.calculateSize();
    // Update only the SVG container size
    const svgContainer = this.element.querySelector('.svg-container');
    svgContainer.style.width = `${this.size}px`;
    svgContainer.style.height = `${this.size}px`;
    this.updateSizeLevel();
    this.animate();
  }

  canBreed() {
    return this.sizeLevel >= 5;
  }

  animate() {
    const animations = ['jump', 'expand', 'shake'];
    const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
    this.element.style.animation = `${randomAnimation} 0.5s`;
    
    this.element.addEventListener('animationend', () => {
      this.element.style.animation = '';
    }, { once: true });
  }
}