const NATURAL_CAT_COLORS = {
  base: [
    { min: '#000000', max: '#404040' }, // Black variations
    { min: '#F0F0F0', max: '#FFFFFF' }, // White variations
    { min: '#CC7000', max: '#FFA500' }, // Orange/Ginger variations
    { min: '#4A2511', max: '#8B4513' }, // Brown variations
    { min: '#BC9B6A', max: '#D2B48C' }, // Tan variations
    { min: '#404040', max: '#A0A0A0' }, // Gray variations
    { min: '#A0A0A0', max: '#E0E0E0' }, // Silver variations
    { min: '#2A2418', max: '#4A412A' }, // Dark Brown variations
    { min: '#BC8F5E', max: '#DEB887' }  // Light Brown variations
  ],
  eyes: [
    { min: '#006400', max: '#32CD32' }, // Green variations
    { min: '#00008B', max: '#4169E1' }, // Blue variations
    { min: '#4A2511', max: '#8B4513' }, // Brown variations
    { min: '#808080', max: '#C0C0C0' }, // Grey variations
    { min: '#B8860B', max: '#FFD700' }, // Yellow/Golden variations
    { min: '#CC7000', max: '#FFA500' }  // Orange variations
  ],
  nose: [
    { min: '#FFB6C1', max: '#FFC0CB' }, // Pink variations
    { min: '#000000', max: '#404040' }, // Black variations
    { min: '#4A2511', max: '#8B4513' }, // Brown variations
    { min: '#808080', max: '#C0C0C0' }  // Grey variations
  ]
};

function interpolateColor(color1, color2) {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const weight = Math.random();
  
  const r = Math.round(r1 + (r2 - r1) * weight);
  const g = Math.round(g1 + (g2 - g1) * weight);
  const b = Math.round(b1 + (b2 - b1) * weight);
  
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function randomizeColor(allowUnnatural = false) {
  if (allowUnnatural) {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  } else {
    const colorRange = NATURAL_CAT_COLORS.base[Math.floor(Math.random() * NATURAL_CAT_COLORS.base.length)];
    return interpolateColor(colorRange.min, colorRange.max);
  }
}

function randomizeEyeColor(allowUnnatural = false) {
  if (allowUnnatural) {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  } else {
    const colorRange = NATURAL_CAT_COLORS.eyes[Math.floor(Math.random() * NATURAL_CAT_COLORS.eyes.length)];
    return interpolateColor(colorRange.min, colorRange.max);
  }
}

function randomizeNoseColor(allowUnnatural = false) {
  if (allowUnnatural) {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  } else {
    const colorRange = NATURAL_CAT_COLORS.nose[Math.floor(Math.random() * NATURAL_CAT_COLORS.nose.length)];
    return interpolateColor(colorRange.min, colorRange.max);
  }
}

function randomizePattern() {
  const patterns = ['solid', 'tabby', 'spots', 'patches', 'calico', 'socks', 'tortoiseshell', 'siamese', 'tuxedo'];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

function updateCat(num) {
  const container = document.getElementById(`cat${num}`);
  const attributes = getParentAttributes(num);
  CatRenderer.renderCat(container, attributes);
}

function getParentAttributes(num) {
  const pattern = document.getElementById(`pattern${num}`).value;
  const attrs = {
    baseColor: document.getElementById(`color${num}`).value,
    pattern: pattern,
    patternColor: document.getElementById(`patternColor${num}`).value,
    patternColor2: document.getElementById(`patternColor${num}_2`).value,
    eyeColor: document.getElementById(`eyeColor${num}`).value,
    noseColor: document.getElementById(`noseColor${num}`).value,
    hasFaceSpot: document.getElementById(`hasFaceSpot${num}`).checked,
    faceSpotColor: document.getElementById(`faceSpotColor${num}`).value,
    faceSpotTransparent: document.getElementById(`faceSpotTransparent${num}`).checked,
    hasClaws: document.getElementById(`hasClaws${num}`).checked,
    clawColor: document.getElementById(`clawColor${num}`).value,
    generation: parseInt(document.getElementById(`parent${num}Generation`).textContent.split(' ')[1]) || 1
  };
  
  return attrs;
}

function generateKittens() {
  const parent1 = getParentAttributes(1);
  const parent2 = getParentAttributes(2);
  
  // Calculate next generation - take highest parent generation and add 1
  const nextGen = Math.max(parent1.generation, parent2.generation) + 1;
  
  // Generate 3 kittens
  for (let i = 1; i <= 3; i++) {
    const kitten = GeneticMixer.generateKitten(parent1, parent2);
    kitten.generation = nextGen;
    const container = document.getElementById(`kitten${i}`);
    CatRenderer.renderCat(container, kitten);
    
    // Update generation display
    document.getElementById(`kitten${i}Generation`).textContent = `Gen ${nextGen}`;
  }
}

function resetAll() {
  // Reset Parent 1
  document.getElementById('color1').value = '#FFA500';
  document.getElementById('pattern1').value = 'solid';
  document.getElementById('patternColor1').value = '#8B4513';
  document.getElementById('patternColor1_2').value = '#FFA500';
  document.getElementById('eyeColor1').value = '#4CAF50';
  document.getElementById('noseColor1').value = '#FF69B4';
  document.getElementById('hasFaceSpot1').checked = false;
  document.getElementById('faceSpotColor1').value = '#FFFFFF';
  document.getElementById('hasClaws1').checked = false;
  document.getElementById('clawColor1').value = '#E0E0E0';
  
  // Reset Parent 2
  document.getElementById('color2').value = '#FFFFFF';
  document.getElementById('pattern2').value = 'solid';
  document.getElementById('patternColor2').value = '#000000';
  document.getElementById('patternColor2_2').value = '#FFA500';
  document.getElementById('eyeColor2').value = '#87CEEB';
  document.getElementById('noseColor2').value = '#FFB6C1';
  document.getElementById('hasFaceSpot2').checked = false;
  document.getElementById('faceSpotColor2').value = '#FFFFFF';
  document.getElementById('hasClaws2').checked = false;
  document.getElementById('clawColor2').value = '#E0E0E0';
  
  // Reset generations
  document.getElementById('parent1Generation').textContent = 'Gen 1';
  document.getElementById('parent2Generation').textContent = 'Gen 1';
  
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`kitten${i}Generation`).textContent = '';
  }
  
  // Update both cats
  updateCat(1);
  updateCat(2);
}

function toggleFaceSpot(num) {
  const checkbox = document.getElementById(`hasFaceSpot${num}`);
  checkbox.checked = !checkbox.checked;
  updateCat(num);
}

function toggleFaceSpotTransparency(num) {
  const checkbox = document.getElementById(`faceSpotTransparent${num}`);
  checkbox.checked = !checkbox.checked;
  updateCat(num);
}

function toggleClaws(num) {
  const checkbox = document.getElementById(`hasClaws${num}`);
  checkbox.checked = !checkbox.checked;
  updateCat(num);
}

function randomizeCat(num) {
  const allowUnnatural = document.getElementById('allowUnnaturalColors').checked;
  
  // Set random values
  document.getElementById(`color${num}`).value = randomizeColor(allowUnnatural);
  document.getElementById(`pattern${num}`).value = randomizePattern();
  document.getElementById(`patternColor${num}`).value = randomizeColor(allowUnnatural);
  document.getElementById(`patternColor${num}_2`).value = randomizeColor(allowUnnatural);
  document.getElementById(`eyeColor${num}`).value = randomizeEyeColor(allowUnnatural);
  document.getElementById(`noseColor${num}`).value = randomizeNoseColor(allowUnnatural);
  document.getElementById(`faceSpotColor${num}`).value = randomizeColor(allowUnnatural);
  
  // 40% chance to have a face spot
  document.getElementById(`hasFaceSpot${num}`).checked = Math.random() < 0.4;
  
  // If there's a face spot, 50% chance to make it transparent
  if (document.getElementById(`hasFaceSpot${num}`).checked) {
    document.getElementById(`faceSpotTransparent${num}`).checked = Math.random() < 0.5;
  }
  
  // 50% chance to have claws
  document.getElementById(`hasClaws${num}`).checked = Math.random() < 0.5;
  
  // Set random claw color
  if (allowUnnatural) {
    document.getElementById(`clawColor${num}`).value = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  } else {
    // For natural colors, slightly darker than base color
    const baseColor = document.getElementById(`color${num}`).value;
    const rgb = GeneticMixer.hexToRgb(baseColor);
    const darkerRgb = {
      r: Math.max(0, rgb.r - 32),
      g: Math.max(0, rgb.g - 32),
      b: Math.max(0, rgb.b - 32)
    };
    document.getElementById(`clawColor${num}`).value = GeneticMixer.rgbToHex(darkerRgb);
  }
  
  // Reset to generation 1 when randomizing
  document.getElementById(`parent${num}Generation`).textContent = 'Gen 1';
  
  // Update cat display
  updateCat(num);
}

function setAsParent(kittenNum, parentNum) {
  const kittenContainer = document.getElementById(`kitten${kittenNum}`);
  const svg = kittenContainer.querySelector('svg');
  if (!svg) return; // Exit if no kitten exists
  
  // Get generation from kitten
  const kittenGeneration = document.getElementById(`kitten${kittenNum}Generation`).textContent;
  
  // Get computed styles from SVG elements
  const body = svg.querySelector('path');
  const baseColor = body.getAttribute('fill');
  
  const eyes = svg.querySelectorAll('circle');
  const eyeColor = eyes[0].getAttribute('fill');
  
  // Find nose path using the actual shape data
  const nose = Array.from(svg.querySelectorAll('path')).find(p => 
    p.getAttribute('d').startsWith('M50 48')
  );
  const noseColor = nose?.getAttribute('fill') || '#FFB6C1'; // Default to pink if not found

  const faceSpot = Array.from(svg.querySelectorAll('path')).find(p => 
    p.getAttribute('d').includes('M50 55')
  );
  const hasFaceSpot = !!faceSpot;
  const faceSpotColor = faceSpot ? faceSpot.getAttribute('fill') : '#FFFFFF';
  const faceSpotTransparent = faceSpot ? faceSpot.getAttribute('opacity') === '0.5' : false;
  
  // Check if kitten has claws by looking for the specific claw paths
  const clawPaths = svg.querySelectorAll('g:last-child path[stroke]');
  const hasClaws = clawPaths && clawPaths.length > 0 && clawPaths[0].getAttribute('d').includes('M30 77'); // Check for front paw claw pattern
  let clawColor = '#E0E0E0';
  
  if (hasClaws) {
    const clawElement = clawPaths[0];
    if (clawElement) {
      clawColor = clawElement.getAttribute('stroke');
    }
  }
  
  // Pattern detection logic
  let patternType = 'solid';
  let patternColor = baseColor;
  let patternColor2 = baseColor;
  
  // Check for pattern group
  const patternGroup = svg.querySelector('g');
  if (patternGroup) {
    const firstChild = patternGroup.firstChild;
    
    if (firstChild) {
      const pathD = firstChild.getAttribute('d');
      const isStroke = firstChild.getAttribute('stroke');
      
      // Detect pattern based on characteristics
      if (isStroke && pathD.includes('Q50 35')) {
        patternType = 'tabby';
        patternColor = firstChild.getAttribute('stroke');
      } else if (firstChild.tagName === 'circle') {
        patternType = 'spots';
        patternColor = firstChild.getAttribute('fill');
      } else if (pathD && pathD.includes('Q40 30')) {
        patternType = 'patches';
        patternColor = firstChild.getAttribute('fill');
      } else if (pathD && pathD.includes('Q15 20')) {
        patternType = 'calico';
        patternColor = firstChild.getAttribute('fill');
        patternColor2 = patternGroup.children[1].getAttribute('fill');
      } else if (pathD && pathD.includes('Q30 65')) {
        patternType = 'socks';
        patternColor = firstChild.getAttribute('fill');
      } else if (pathD && (pathD.includes('Q30 20') && patternGroup.children.length >= 5)) {
        patternType = 'tortoiseshell';
        patternColor = firstChild.getAttribute('fill');
      } else if (pathD && pathD.includes('Q50 25')) {
        patternType = 'siamese';
        patternColor = firstChild.getAttribute('fill');
      } else if (pathD && pathD.includes('Q50 45')) {
        patternType = 'tuxedo';
        patternColor = firstChild.getAttribute('fill');
      }
    }
  }
  
  // Set parent controls
  document.getElementById(`color${parentNum}`).value = baseColor;
  document.getElementById(`pattern${parentNum}`).value = patternType;
  document.getElementById(`patternColor${parentNum}`).value = patternColor;
  document.getElementById(`patternColor${parentNum}_2`).value = patternColor2;
  document.getElementById(`eyeColor${parentNum}`).value = eyeColor;
  document.getElementById(`noseColor${parentNum}`).value = noseColor;
  document.getElementById(`hasFaceSpot${parentNum}`).checked = hasFaceSpot;
  document.getElementById(`faceSpotColor${parentNum}`).value = faceSpotColor;
  document.getElementById(`faceSpotTransparent${parentNum}`).checked = faceSpotTransparent;
  
  // Set claws based on kitten's state
  document.getElementById(`hasClaws${parentNum}`).checked = hasClaws;
  document.getElementById(`clawColor${parentNum}`).value = hasClaws ? clawColor : '#E0E0E0';
  
  // Set generation
  document.getElementById(`parent${parentNum}Generation`).textContent = kittenGeneration;
  
  // Update parent cat
  updateCat(parentNum);
}

function randomizeColors(num) {
  const allowUnnatural = document.getElementById('allowUnnaturalColors').checked;
  
  // Set random colors while preserving pattern and other attributes
  document.getElementById(`color${num}`).value = randomizeColor(allowUnnatural);
  document.getElementById(`patternColor${num}`).value = randomizeColor(allowUnnatural);
  document.getElementById(`patternColor${num}_2`).value = randomizeColor(allowUnnatural);
  document.getElementById(`eyeColor${num}`).value = randomizeEyeColor(allowUnnatural);
  document.getElementById(`noseColor${num}`).value = randomizeNoseColor(allowUnnatural);
  document.getElementById(`faceSpotColor${num}`).value = randomizeColor(allowUnnatural);
  
  // If the cat has claws, randomize claw color
  if (document.getElementById(`hasClaws${num}`).checked) {
    if (allowUnnatural) {
      document.getElementById(`clawColor${num}`).value = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    } else {
      // For natural colors, slightly darker than base color
      const baseColor = document.getElementById(`color${num}`).value;
      const rgb = GeneticMixer.hexToRgb(baseColor);
      const darkerRgb = {
        r: Math.max(0, rgb.r - 32),
        g: Math.max(0, rgb.g - 32),
        b: Math.max(0, rgb.b - 32)
      };
      document.getElementById(`clawColor${num}`).value = GeneticMixer.rgbToHex(darkerRgb);
    }
  }
  
  // Update cat display
  updateCat(num);
}

// Initial render of parent cats
updateCat(1);
updateCat(2);