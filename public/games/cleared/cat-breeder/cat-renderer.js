class CatRenderer {
  static renderCat(container, options) {
    const { 
      baseColor, pattern, patternColor, patternColor2, eyeColor, noseColor, 
      hasFaceSpot, faceSpotColor, faceSpotTransparent, hasClaws, clawColor = '#E0E0E0' 
    } = options;
    
    // Clear previous content
    container.innerHTML = '';
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    
    // Base cat shape
    const catBody = document.createElementNS("http://www.w3.org/2000/svg", "path");
    catBody.setAttribute("d", "M50 80 C20 80 10 60 10 40 C10 20 30 10 50 10 C70 10 90 20 90 40 C90 60 80 80 50 80");
    catBody.setAttribute("fill", baseColor);
    
    // Ears
    const leftEar = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leftEar.setAttribute("d", "M30 20 L20 5 L40 15 Z");
    leftEar.setAttribute("fill", pattern === 'calico' ? patternColor : baseColor);
    
    const rightEar = document.createElementNS("http://www.w3.org/2000/svg", "path");
    rightEar.setAttribute("d", "M70 20 L80 5 L60 15 Z");
    rightEar.setAttribute("fill", pattern === 'calico' ? patternColor2 : baseColor);
    
    // Face spot (if enabled)
    let faceSpot = null;
    if (hasFaceSpot) {
      faceSpot = document.createElementNS("http://www.w3.org/2000/svg", "path");
      faceSpot.setAttribute("d", "M50 55 C40 55 35 45 35 40 C35 35 40 30 50 30 C60 30 65 35 65 40 C65 45 60 55 50 55");
      faceSpot.setAttribute("fill", faceSpotColor);
      faceSpot.setAttribute("opacity", faceSpotTransparent ? "0.5" : "1.0"); 
    }
    
    // Eyes
    const leftEye = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    leftEye.setAttribute("cx", "35");
    leftEye.setAttribute("cy", "35");
    leftEye.setAttribute("r", "5");
    leftEye.setAttribute("fill", eyeColor);
    
    const rightEye = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rightEye.setAttribute("cx", "65");
    rightEye.setAttribute("cy", "35");
    rightEye.setAttribute("r", "5");
    rightEye.setAttribute("fill", eyeColor);
    
    // Add pattern
    let patternElement;
    switch(pattern) {
      case 'tabby':
        patternElement = this.createTabbyPattern(patternColor);
        break;
      case 'spots':
        patternElement = this.createSpotsPattern(patternColor);
        break;
      case 'patches':
        patternElement = this.createPatchesPattern(patternColor);
        break;
      case 'calico':
        patternElement = this.createCalicoPattern(patternColor, patternColor2);
        break;
      case 'socks':
        patternElement = this.createSocksPattern(patternColor);
        break;
      case 'tortoiseshell':
        patternElement = this.createTortoiseshellPattern(patternColor);
        break;
      case 'siamese':
        patternElement = this.createSiamesePattern(patternColor);
        break;
      case 'tuxedo':
        patternElement = this.createTuxedoPattern(patternColor);
        break;
      default:
        patternElement = null;
    }
    
    // Add nose
    const nose = document.createElementNS("http://www.w3.org/2000/svg", "path");
    nose.setAttribute("d", "M50 48 L47 45 L53 45 Z");  
    nose.setAttribute("fill", noseColor);
    
    svg.appendChild(catBody);
    if (patternElement) svg.appendChild(patternElement);
    if (faceSpot) svg.appendChild(faceSpot);
    svg.appendChild(leftEar);
    svg.appendChild(rightEar);
    svg.appendChild(leftEye);
    svg.appendChild(rightEye);
    svg.appendChild(nose);
    
    // Add claws if enabled
    if (hasClaws) {
      const claws = document.createElementNS("http://www.w3.org/2000/svg", "g");
      
      // Front paw claws
      const frontClaws = [
        "M30 77 L28 81", // Left front paw, left claw
        "M35 77 L35 81", // Left front paw, middle claw
        "M40 77 L42 81", // Left front paw, right claw
        "M60 77 L58 81", // Right front paw, left claw
        "M65 77 L65 81", // Right front paw, middle claw
        "M70 77 L72 81"  // Right front paw, right claw
      ];
      
      frontClaws.forEach(d => {
        const claw = document.createElementNS("http://www.w3.org/2000/svg", "path");
        claw.setAttribute("d", d);
        claw.setAttribute("stroke", clawColor);
        claw.setAttribute("stroke-width", "2");
        claws.appendChild(claw);
      });
      
      svg.appendChild(claws);
    }
    
    container.appendChild(svg);
  }
  
  static createTabbyPattern(color) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Stripes
    const stripes = [
      "M30 30 Q50 35 70 30",
      "M25 40 Q50 45 75 40",
      "M20 50 Q50 55 80 50",
      "M25 60 Q50 65 75 60"
    ];
    
    stripes.forEach(d => {
      const stripe = document.createElementNS("http://www.w3.org/2000/svg", "path");
      stripe.setAttribute("d", d);
      stripe.setAttribute("stroke", color);
      stripe.setAttribute("fill", "none");
      stripe.setAttribute("stroke-width", "2");
      g.appendChild(stripe);
    });
    
    return g;
  }
  
  static createSpotsPattern(color) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    const spots = [
      [40, 30, 4],
      [60, 30, 4],
      [35, 45, 5],
      [65, 45, 5],
      [50, 55, 6],
      [30, 60, 4],
      [70, 60, 4]
    ];
    
    spots.forEach(([cx, cy, r]) => {
      const spot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      spot.setAttribute("cx", cx);
      spot.setAttribute("cy", cy);
      spot.setAttribute("r", r);
      spot.setAttribute("fill", color);
      g.appendChild(spot);
    });
    
    return g;
  }
  
  static createPatchesPattern(color) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    const patches = [
      "M30 20 Q40 30 30 40 Q20 30 30 20",
      "M70 30 Q80 40 70 50 Q60 40 70 30",
      "M40 50 Q50 60 40 70 Q30 60 40 50"
    ];
    
    patches.forEach(d => {
      const patch = document.createElementNS("http://www.w3.org/2000/svg", "path");
      patch.setAttribute("d", d);
      patch.setAttribute("fill", color);
      g.appendChild(patch);
    });
    
    return g;
  }
  
  static createCalicoPattern(leftColor, rightColor) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Left side patch (around ear and head)
    const leftPatch = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leftPatch.setAttribute("d", "M10 40 Q15 20 30 15 Q40 12 45 20 Q50 30 40 45 Q30 50 20 45 Q10 40 10 40");
    leftPatch.setAttribute("fill", leftColor);
    
    // Right side patch (around ear and head)
    const rightPatch = document.createElementNS("http://www.w3.org/2000/svg", "path");
    rightPatch.setAttribute("d", "M90 40 Q85 20 70 15 Q60 12 55 20 Q50 30 60 45 Q70 50 80 45 Q90 40 90 40");
    rightPatch.setAttribute("fill", rightColor);
    
    g.appendChild(leftPatch);
    g.appendChild(rightPatch);
    
    return g;
  }

  static createSocksPattern(color) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Paws/socks
    const socks = [
      "M25 75 Q30 65 35 75 Q40 65 45 75 L35 80 Z", // Left front paw
      "M55 75 Q60 65 65 75 Q70 65 75 75 L65 80 Z", // Right front paw
      "M15 65 Q20 55 25 65 Q30 55 35 65 L25 70 Z", // Left back paw
      "M65 65 Q70 55 75 65 Q80 55 85 65 L75 70 Z"  // Right back paw
    ];
    
    socks.forEach(d => {
      const sock = document.createElementNS("http://www.w3.org/2000/svg", "path");
      sock.setAttribute("d", d);
      sock.setAttribute("fill", color);
      g.appendChild(sock);
    });
    
    return g;
  }

  static createTortoiseshellPattern(color) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    const patches = [
      "M20 30 Q30 20 40 30 Q35 40 20 30",
      "M60 25 Q70 20 75 30 Q65 40 60 25",
      "M30 45 Q40 40 45 50 Q35 55 30 45",
      "M55 45 Q65 40 70 50 Q60 55 55 45",
      "M45 60 Q55 55 60 65 Q50 70 45 60"
    ];
    
    patches.forEach(d => {
      const patch = document.createElementNS("http://www.w3.org/2000/svg", "path");
      patch.setAttribute("d", d);
      patch.setAttribute("fill", color);
      patch.setAttribute("opacity", "0.7");
      g.appendChild(patch);
    });
    
    return g;
  }

  static createSiamesePattern(color) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Face mask
    const mask = document.createElementNS("http://www.w3.org/2000/svg", "path");
    mask.setAttribute("d", "M30 20 Q50 25 70 20 Q75 30 75 40 Q70 50 50 55 Q30 50 25 40 Q25 30 30 20");
    mask.setAttribute("fill", color);
    
    // Paws
    const paws = document.createElementNS("http://www.w3.org/2000/svg", "path");
    paws.setAttribute("d", "M20 70 Q30 75 40 70 M60 70 Q70 75 80 70");
    paws.setAttribute("stroke", color);
    paws.setAttribute("stroke-width", "5");
    
    // Tail tip
    const tail = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tail.setAttribute("d", "M85 60 Q90 65 85 70 Q80 65 85 60");
    tail.setAttribute("fill", color);
    
    g.appendChild(mask);
    g.appendChild(paws);
    g.appendChild(tail);
    
    return g;
  }

  static createTuxedoPattern(color) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Chest patch
    const chest = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chest.setAttribute("d", "M40 40 Q50 45 60 40 Q65 50 50 70 Q35 50 40 40");
    chest.setAttribute("fill", color);
    
    // Belly patch
    const belly = document.createElementNS("http://www.w3.org/2000/svg", "path");
    belly.setAttribute("d", "M45 65 Q50 70 55 65 Q60 75 50 80 Q40 75 45 65");
    belly.setAttribute("fill", color);
    
    // Paw tips
    const paws = document.createElementNS("http://www.w3.org/2000/svg", "path");
    paws.setAttribute("d", "M25 75 L35 75 M65 75 L75 75");
    paws.setAttribute("stroke", color);
    paws.setAttribute("stroke-width", "3");
    
    g.appendChild(chest);
    g.appendChild(belly);
    g.appendChild(paws);
    
    return g;
  }
}