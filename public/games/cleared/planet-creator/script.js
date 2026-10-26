class PlanetCreator {
  constructor() {
    this.defaultValues = {
      size: 100,
      groundCoverage: 30,
      rings: 0,
      moons: 0,
      speed: 5,
      oceanColor: '#1E90FF',
      groundColor: '#2E7D32',
      ringColor: '#4ECDC4',
      moonColor: '#9E9E9E',
      cloudCoverage: 20,
      cloudColor: '#FFFFFF'
    };
    
    this.planetElement = document.getElementById('planet');
    this.isScrolling = false;
    this.scrollTimeout = null;
    this.setupControls();
    this.updatePlanet();
    this.animate();
    this.updateSliderValues(); // Initialize slider values
  }

  setupControls() {
    const controls = [
      'size', 'groundCoverage', 'rings', 'moons', 'speed',
      'oceanColor', 'groundColor', 'ringColor', 'moonColor',
      'cloudCoverage', 'cloudColor' // Add new controls
    ];
    
    // Add reset button listener
    document.getElementById('resetAll').addEventListener('click', () => {
      if (!this.isScrolling) {
        this.resetToDefaults();
      }
    });
    
    // Add scroll event listener to controls container
    const controlsContainer = document.querySelector('.controls');
    controlsContainer.addEventListener('scroll', () => {
      this.isScrolling = true;
      
      // Disable all inputs while scrolling
      controls.forEach(control => {
        document.getElementById(control).disabled = true;
      });
      document.getElementById('randomizeGround').disabled = true;

      // Clear existing timeout
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
      }

      // Set new timeout
      this.scrollTimeout = setTimeout(() => {
        this.isScrolling = false;
        // Re-enable all inputs after scrolling stops
        controls.forEach(control => {
          document.getElementById(control).disabled = false;
        });
        document.getElementById('randomizeGround').disabled = false;
      }, 150);
    });

    // Setup regular control listeners
    controls.forEach(control => {
      document.getElementById(control).addEventListener('input', () => {
        if (!this.isScrolling) {
          this.updatePlanet();
          this.updateSliderValues();
        }
      });
    });

    document.getElementById('randomizeGround').addEventListener('click', () => {
      if (!this.isScrolling) {
        this.updatePlanet(true);
      }
    });
  }

  resetToDefaults() {
    // Reset all inputs to their default values
    Object.entries(this.defaultValues).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = value;
      }
    });
    
    // Update the planet with default values
    this.updatePlanet();
    this.updateSliderValues();
  }

  getValues() {
    return {
      size: document.getElementById('size').value,
      groundCoverage: document.getElementById('groundCoverage').value,
      rings: document.getElementById('rings').value,
      moons: document.getElementById('moons').value,
      speed: document.getElementById('speed').value,
      oceanColor: document.getElementById('oceanColor').value,
      groundColor: document.getElementById('groundColor').value,
      ringColor: document.getElementById('ringColor').value,
      moonColor: document.getElementById('moonColor').value,
      cloudCoverage: document.getElementById('cloudCoverage').value,
      cloudColor: document.getElementById('cloudColor').value
    };
  }

  createPlanetSVG(values) {
    const size = values.size;
    const coverage = values.groundCoverage;
    
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <defs>
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" result="noise"/>
            <feColorMatrix type="saturate" values="0" in="noise" result="grayscale"/>
            <feBlend in="SourceGraphic" in2="grayscale" mode="multiply"/>
          </filter>
          <filter id="cloudNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="5" result="noise"/>
            <feGaussianBlur in="noise" stdDeviation="2" result="blur"/>
            <feColorMatrix 
              type="matrix" 
              values="0 0 0 0 ${this.hexToRgb(values.cloudColor).r / 255}
                      0 0 0 0 ${this.hexToRgb(values.cloudColor).g / 255}
                      0 0 0 0 ${this.hexToRgb(values.cloudColor).b / 255}
                      0 0 0 0.7 0"
            />
            <feComponentTransfer>
              <feFuncA type="linear" slope="2" intercept="-0.3"/>
            </feComponentTransfer>
          </filter>
          <clipPath id="groundMask">
            ${this.generateGroundPath(size, coverage)}
          </clipPath>
          <clipPath id="cloudMask">
            ${this.generateCloudPath(size, values.cloudCoverage)}
          </clipPath>
        </defs>
        
        <!-- Ocean (base circle) -->
        <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${values.oceanColor}"/>
        
        <!-- Ground layers -->
        <g clip-path="url(#groundMask)">
          <!-- Base ground -->
          <circle 
            cx="${size/2}" 
            cy="${size/2}" 
            r="${size/2}" 
            fill="${values.groundColor}"
          />
          
          <!-- Terrain detail -->
          <circle 
            cx="${size/2}" 
            cy="${size/2}" 
            r="${size/2}" 
            fill="${this.adjustColor(values.groundColor, -20)}"
            filter="url(#noise)"
            opacity="0.4"
          />
          
          <!-- Highlights -->
          <circle 
            cx="${size/2}" 
            cy="${size/2}" 
            r="${size/2}" 
            fill="${this.adjustColor(values.groundColor, 20)}"
            filter="url(#noise)"
            opacity="0.2"
          />
        </g>

        <!-- Cloud layer -->
        <g clip-path="url(#cloudMask)" opacity="0.7">
          <circle 
            cx="${size/2}" 
            cy="${size/2}" 
            r="${size/2}" 
            fill="${values.cloudColor}"
            filter="url(#cloudNoise)"
          />
        </g>
      </svg>
    `;
  }

  hexToRgb(hex) {
    // Remove the # if it exists
    hex = hex.replace('#', '');
    
    // Parse the hex color
    const bigint = parseInt(hex, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  generateGroundPath(size, coverage) {
    const paths = [];
    const numContinents = 5;
    const maxCoverage = (coverage / 100) * size;
    
    for (let i = 0; i < numContinents; i++) {
      const continentPath = this.generateContinent(
        size,
        maxCoverage,
        Math.random() * size,
        Math.random() * size,
        (coverage / 100) * size * 0.5
      );
      paths.push(continentPath);
    }
    
    return paths.join(' ');
  }

  generateContinent(size, coverage, centerX, centerY, radius) {
    const points = [];
    const numPoints = 24;
    const baseRadius = radius * (coverage / size);
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const variance = Math.random() * 0.4 + 0.8;
      const currentRadius = baseRadius * variance;
      const x = centerX + Math.cos(angle) * currentRadius;
      const y = centerY + Math.sin(angle) * currentRadius;
      
      if (i === 0) {
        points.push(`M ${x} ${y}`);
      } else {
        const controlX = centerX + Math.cos(angle - Math.PI/numPoints) * currentRadius * 1.2;
        const controlY = centerY + Math.sin(angle - Math.PI/numPoints) * currentRadius * 1.2;
        points.push(`Q ${controlX} ${controlY} ${x} ${y}`);
      }
    }
    
    points.push('Z');
    return `<path d="${points.join(' ')}" />`;
  }

  generateCloudPath(size, coverage) {
    const paths = [];
    const numClouds = 8;
    const maxCoverage = (coverage / 100) * size;
    
    for (let i = 0; i < numClouds; i++) {
      const cloudPath = this.generateCloud(
        size,
        maxCoverage,
        Math.random() * size,
        Math.random() * size,
        (coverage / 100) * size * 0.6
      );
      paths.push(cloudPath);
    }
    
    return paths.join(' ');
  }

  generateCloud(size, coverage, centerX, centerY, radius) {
    const points = [];
    const numPoints = 32; // More points for smoother clouds
    const baseRadius = radius * (coverage / size);
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const variance = Math.random() * 0.5 + 0.75; // More variance for bumpier clouds
      const currentRadius = baseRadius * variance;
      const x = centerX + Math.cos(angle) * currentRadius;
      const y = centerY + Math.sin(angle) * currentRadius;
      
      if (i === 0) {
        points.push(`M ${x} ${y}`);
      } else {
        const controlX = centerX + Math.cos(angle - Math.PI/numPoints) * currentRadius * 1.3;
        const controlY = centerY + Math.sin(angle - Math.PI/numPoints) * currentRadius * 1.3;
        points.push(`Q ${controlX} ${controlY} ${x} ${y}`);
      }
    }
    
    points.push('Z');
    return `<path d="${points.join(' ')}" />`;
  }

  updatePlanet(groundOnly = false) {
    const values = this.getValues();
    
    if (groundOnly) {
      const core = this.planetElement.querySelector('.planet-core');
      if (core) {
        core.innerHTML = this.createPlanetSVG(values);
        return;
      }
    }

    this.planetElement.innerHTML = '';

    const core = document.createElement('div');
    core.className = 'planet-core';
    core.style.width = `${values.size}px`;
    core.style.height = `${values.size}px`;
    core.innerHTML = this.createPlanetSVG(values);
    this.planetElement.appendChild(core);

    for (let i = 0; i < values.rings; i++) {
      const ring = document.createElement('div');
      ring.className = 'ring';
      const ringSize = Number(values.size) + (i + 1) * 40;
      ring.style.width = `${ringSize}px`;
      ring.style.height = `${ringSize}px`;
      ring.style.borderColor = values.ringColor;
      ring.style.top = '50%';
      ring.style.left = '50%';
      this.planetElement.appendChild(ring);
    }

    for (let i = 0; i < values.moons; i++) {
      const moon = document.createElement('div');
      moon.className = 'moon';
      const moonSize = values.size * 0.2;
      moon.style.width = `${moonSize}px`;
      moon.style.height = `${moonSize}px`;
      moon.style.backgroundColor = values.moonColor;
      moon.style.top = '50%';
      moon.style.left = '50%';
      moon.dataset.angle = (360 / values.moons) * i;
      moon.dataset.distance = Number(values.size) + 100;
      this.planetElement.appendChild(moon);
    }
  }

  updateSliderValues() {
    const values = this.getValues();
    
    // Update size value
    document.getElementById('sizeValue').textContent = `${Math.round((values.size - 50) / 1.5)}%`;
    
    // Update ground coverage value
    document.getElementById('groundCoverageValue').textContent = `${values.groundCoverage}%`;
    
    // Update rings value (no percentage)
    document.getElementById('ringsValue').textContent = values.rings;
    
    // Update moons value (no percentage)
    document.getElementById('moonsValue').textContent = values.moons;
    
    // Update speed value
    document.getElementById('speedValue').textContent = `${Math.round(values.speed * 5)}%`;
    
    // Update cloud coverage value
    document.getElementById('cloudCoverageValue').textContent = `${values.cloudCoverage}%`;
  }

  animate() {
    const values = this.getValues();
    const moons = this.planetElement.querySelectorAll('.moon');
    
    moons.forEach(moon => {
      const angle = Number(moon.dataset.angle);
      const distance = Number(moon.dataset.distance);
      moon.dataset.angle = (angle + Number(values.speed) * 0.5) % 360;
      
      const radians = angle * (Math.PI / 180);
      const x = Math.cos(radians) * distance;
      const y = Math.sin(radians) * distance;
      
      moon.style.transform = `translate(${x}px, ${y}px)`;
    });

    requestAnimationFrame(() => this.animate());
  }
}

new PlanetCreator();