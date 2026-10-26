export class DogRenderer {
    static render(config, scale = 1) {
        const {
            bodyColor, headColor, legsColor, snoutColor, earColor, tailColor,
            noseColor, eyeColor, tailShape, earShape, hasSpots, spotsColor,
            snoutLength = 'normal',
            bodyLength = 'medium', // short | medium | long
            bodyWidth = 'medium',  // short | medium | wide
            legLength = 'medium',   // short | medium | long
            earSize = 'medium',     // small | medium | large
            tailSize = 'medium'     // small | medium | large
        } = config;

        // Body size factors
        const lengthFactor = bodyLength === 'short' ? 0.85 : (bodyLength === 'long' ? 1.15 : 1);
        const widthFactor = bodyWidth === 'short' ? 0.85 : (bodyWidth === 'wide' ? 1.15 : 1);

        // Snout positions/sizes adjusted by snoutLength (independent of body length)
        let snout_rx = 20, snout_cx = 40, nose_cx = 30;
        if (snoutLength === 'short') { snout_rx = 12; snout_cx = 45; nose_cx = 38; }
        if (snoutLength === 'long') { snout_rx = 32; snout_cx = 35; nose_cx = 12; }

        const getEarPath = (type, side) => {
            if (type === 'up') return side === 'left' ? 'M 35,35 L 25,5 L 45,25 Z' : 'M 65,35 L 75,5 L 55,25 Z';
            if (type === 'curled') return side === 'left' ? 'M 35,35 Q 20,10 40,25 Z' : 'M 65,35 Q 80,10 60,25 Z';
            if (type === 'down') return side === 'left' ? 'M 35,35 L 20,55 L 45,40 Z' : 'M 65,35 L 80,55 L 55,40 Z';
            return '';
        };

        let leftEar = 'up';
        let rightEar = 'up';
        if (earShape === 'both curled') {
            leftEar = 'curled';
            rightEar = 'curled';
        } else if (earShape === 'left up & right curled') {
            leftEar = 'up';
            rightEar = 'curled';
        } else if (earShape === 'right up & left curled') {
            leftEar = 'curled';
            rightEar = 'up';
        }

        const getTailPath = (type) => {
            if (type === 'long') return 'M 155,75 Q 180,20 170,50';
            if (type === 'short') return 'M 155,75 Q 165,55 175,65';
            if (type === 'poofball') return 'M 155,75 C 175,55 175,95 155,75';
            if (type === 'stub') return 'M 155,75 C 162,68 162,82 155,75';
            if (type === 'curled') return 'M 155,75 Q 190,40 155,45 Q 130,50 145,65';
            return '';
        };

        // Leg sizing: adjust ry and vertical position. short legs should sit closer to body (moved up)
        const legRyBase = legLength === 'short' ? 10 : (legLength === 'long' ? 22 : 15);
        const legCyOffset = legLength === 'short' ? -5 : (legLength === 'long' ? 8 : 0);

        const bodyRx = 60 * widthFactor;
        const bodyRy = 40 * lengthFactor;

        // ensure head color fallback
        const headFill = headColor || bodyColor;

        return `
            <svg viewBox="0 0 200 160" width="${200 * scale}" height="${160 * scale}">
                <!-- Tail (stroke scaled by tailSize) -->
                ${(() => {
                    if (tailShape === 'none') return '';
                    const tailFactor = tailSize === 'small' ? 0.7 : (tailSize === 'large' ? 1.4 : 1);
                    const baseWidth = (tailShape === 'poofball' || tailShape === 'stub') ? (tailShape === 'stub' ? 12 : 20) : 8;
                    return `<path d="${getTailPath(tailShape)}" fill="none" stroke="${tailColor}" stroke-width="${baseWidth * tailFactor}" stroke-linecap="round" />`;
                })()}

                <!-- Legs -->
                <ellipse cx="60" cy="${130 + legCyOffset}" rx="${8 * widthFactor}" ry="${legRyBase}" fill="${legsColor || bodyColor}" />
                <ellipse cx="80" cy="${135 + legCyOffset}" rx="${8 * widthFactor}" ry="${legRyBase}" fill="${legsColor || bodyColor}" />
                <ellipse cx="120" cy="${135 + legCyOffset}" rx="${8 * widthFactor}" ry="${legRyBase}" fill="${legsColor || bodyColor}" />
                <ellipse cx="140" cy="${130 + legCyOffset}" rx="${8 * widthFactor}" ry="${legRyBase}" fill="${legsColor || bodyColor}" />

                <!-- Body -->
                <ellipse cx="100" cy="90" rx="${bodyRx}" ry="${bodyRy}" fill="${bodyColor}" />

                <!-- Body Spots -->
                ${hasSpots ? `
                    <ellipse cx="120" cy="${80 + (lengthFactor-1)*5}" rx="${15 * widthFactor}" ry="${10 * lengthFactor}" fill="${spotsColor}" />
                    <ellipse cx="80" cy="${100 + (lengthFactor-1)*5}" rx="${12 * widthFactor}" ry="${8 * lengthFactor}" fill="${spotsColor}" />
                    <ellipse cx="135" cy="${105 + (lengthFactor-1)*5}" rx="${10 * widthFactor}" ry="${12 * lengthFactor}" fill="${spotsColor}" />
                ` : ''}

                <!-- Ears (scaled by earSize) -->
                ${(() => {
                    const earFactor = earSize === 'small' ? 0.85 : (earSize === 'large' ? 1.25 : 1);
                    // small adjustment to vertically nudge ears so large ears sit a bit lower
                    const earYOffset = earSize === 'small' ? -2 : (earSize === 'large' ? 4 : 0);
                    // center around head (50,50) for scaling and apply Y offset
                    return `<g transform="translate(50 50) translate(0 ${earYOffset}) scale(${earFactor}) translate(-50 -50)">
                                <path d="${getEarPath(leftEar, 'left')}" fill="${hasSpots ? spotsColor : earColor}" />
                            </g>
                            <g transform="translate(50 50) translate(0 ${earYOffset}) scale(${earFactor}) translate(-50 -50)">
                                <path d="${getEarPath(rightEar, 'right')}" fill="${earColor}" />
                            </g>`;
                })()}

                <!-- Head -->
                <circle cx="50" cy="50" r="30" fill="${headFill}" />

                <!-- Head Spot -->
                ${hasSpots ? `<circle cx="42" cy="45" r="12" fill="${spotsColor}" />` : ''}

                <!-- Snout -->
                <ellipse cx="${snout_cx}" cy="65" rx="${snout_rx}" ry="${15 * lengthFactor}" fill="${snoutColor}" />

                <!-- Eyes -->
                <circle cx="42" cy="45" r="4" fill="${eyeColor}" />
                <circle cx="58" cy="45" r="4" fill="${eyeColor}" />

                <!-- Nose -->
                <ellipse cx="${nose_cx}" cy="65" rx="6" ry="4" fill="${noseColor}" />
            </svg>
        `;
    }
}