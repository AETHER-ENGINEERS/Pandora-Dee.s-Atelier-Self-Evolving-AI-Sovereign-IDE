class GeneticMixer {
  static mixColors(color1, color2) {
    // Convert hex to RGB
    const rgb1 = this.hexToRgb(color1);
    const rgb2 = this.hexToRgb(color2);
    
    // Mix colors with random weight
    const weight = Math.random();
    const mixed = {
      r: Math.round(rgb1.r * weight + rgb2.r * (1 - weight)),
      g: Math.round(rgb1.g * weight + rgb2.g * (1 - weight)),
      b: Math.round(rgb1.b * weight + rgb2.b * (1 - weight))
    };
    
    return this.rgbToHex(mixed);
  }
  
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  static rgbToHex({r, g, b}) {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
  
  static mixPattern(pattern1, pattern2) {
    // 50% chance to inherit from either parent
    return Math.random() < 0.5 ? pattern1 : pattern2;
  }
  
  static generateKitten(parent1, parent2) {
    const pattern = this.mixPattern(parent1.pattern, parent2.pattern);
    const baseColor = this.mixColors(parent1.baseColor, parent2.baseColor);
    
    // Handle calico pattern colors separately
    const patternColor = pattern === 'solid' ? baseColor : this.mixColors(parent1.patternColor, parent2.patternColor);
    const patternColor2 = pattern === 'calico' ? 
      this.mixColors(parent1.patternColor2 || parent1.patternColor, parent2.patternColor2 || parent2.patternColor) : 
      patternColor;
    
    // 50% chance to inherit face spot and transparency from either parent
    const hasFaceSpot = Math.random() < 0.5 ? parent1.hasFaceSpot : parent2.hasFaceSpot;
    const faceSpotTransparent = Math.random() < 0.5 ? parent1.faceSpotTransparent : parent2.faceSpotTransparent;
    
    // Claw inheritance logic
    let hasClaws = false;
    if (parent1.hasClaws && parent2.hasClaws) {
      // Both parents have claws - kitten definitely has claws
      hasClaws = true;
    } else if (parent1.hasClaws || parent2.hasClaws) {
      // One parent has claws - 50% chance
      hasClaws = Math.random() < 0.5;
    }
    // If neither parent has claws, hasClaws remains false
    
    return {
      baseColor: baseColor,
      pattern: pattern,
      patternColor: patternColor,
      patternColor2: patternColor2,
      eyeColor: this.mixColors(parent1.eyeColor, parent2.eyeColor),
      noseColor: this.mixColors(parent1.noseColor, parent2.noseColor),
      hasFaceSpot: hasFaceSpot,
      faceSpotColor: this.mixColors(parent1.faceSpotColor, parent2.faceSpotColor),
      faceSpotTransparent: faceSpotTransparent,
      hasClaws: hasClaws,
      clawColor: this.mixColors(parent1.clawColor, parent2.clawColor)
    };
  }
}