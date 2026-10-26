function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

export function drawKitten(ctx, x, y, k, opts = {}) {
  const s = k.size;
  const base = k.color.base;
  const dark = k.color.dark;
  const calico = k.pattern === 'calico';

  // white silhouette for calico
  const coat = calico ? '#fbfbf7' : base;

  ctx.save();
  ctx.translate(x, y);

  // tail
  ctx.strokeStyle = coat;
  ctx.lineWidth = s * 0.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.55, s * 0.5);
  ctx.quadraticCurveTo(s * 1.08, s * 0.05, s * 0.9, -s * 0.55);
  ctx.stroke();
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.arc(s * 0.9, -s * 0.58, s * 0.18, 0, Math.PI * 2);
  ctx.fill();

  const bodyY = s * 0.42;
  const headY = -s * 0.32;
  const hr = s * 0.82;

  // ears (behind head)
  ctx.fillStyle = coat;
  ear(ctx, -hr * 0.5, headY - hr * 0.25, hr, true);
  ear(ctx, hr * 0.5, headY - hr * 0.25, hr, true);

  // body
  ctx.fillStyle = coat;
  ellipse(ctx, 0, bodyY, s * 0.78, s * 0.58);
  ctx.fill();
  // front paws
  ellipse(ctx, -s * 0.36, bodyY + s * 0.5, s * 0.2, s * 0.15);
  ctx.fill();
  ellipse(ctx, s * 0.36, bodyY + s * 0.5, s * 0.2, s * 0.15);
  ctx.fill();

  // head
  ctx.beginPath();
  ctx.arc(0, headY, hr, 0, Math.PI * 2);
  ctx.fill();

  // ===== patterns =====
  if (calico) {
    const leftC = k.calico ? base : dark;
    const rightC = k.calico ? dark : base;
    // clip to head for the two big patches
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = leftC;
    ctx.beginPath();
    ctx.arc(-hr * 0.5, headY - hr * 0.05, hr * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rightC;
    ctx.beginPath();
    ctx.arc(hr * 0.5, headY - hr * 0.35, hr * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // body patch
    ctx.restore();
    ctx.fillStyle = leftC;
    ctx.beginPath();
    ctx.arc(s * 0.2, bodyY - s * 0.1, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  if (k.pattern === 'stripes') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = dark;
    ctx.fillRect(-hr * 0.02, headY - hr * 0.8, hr * 0.04, hr * 0.62);
    ctx.fillRect(-hr * 0.3, headY - hr * 0.72, hr * 0.08, hr * 0.4);
    ctx.fillRect(hr * 0.24, headY - hr * 0.72, hr * 0.08, hr * 0.4);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ellipse(ctx, 0, bodyY, s * 0.78, s * 0.58);
    ctx.clip();
    ctx.fillStyle = dark;
    ellipse(ctx, 0, bodyY - s * 0.15, s * 0.6, s * 0.13);
    ctx.fill();
    ellipse(ctx, 0, bodyY + s * 0.1, s * 0.52, s * 0.12);
    ctx.fill();
    ctx.restore();
  }

  if (k.pattern === 'spots') {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(0, bodyY, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-s * 0.34, bodyY - s * 0.05, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.34, bodyY + s * 0.12, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(hr * 0.5, headY + hr * 0.25, hr * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-hr * 0.05, headY - hr * 0.5, hr * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (k.pattern === 'muzzle') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, 0, headY + hr * 0.55, hr * 0.55, hr * 0.42);
    ctx.fill();
    ctx.restore();
    // white inner ears
    ctx.fillStyle = '#ffffff';
    ear(ctx, -hr * 0.5, headY - hr * 0.25, hr, false);
    ear(ctx, hr * 0.5, headY - hr * 0.25, hr, false);
  } else {
    ctx.fillStyle = '#f2b9bd';
    ear(ctx, -hr * 0.5, headY - hr * 0.25, hr, false);
    ear(ctx, hr * 0.5, headY - hr * 0.25, hr, false);
    if (calico || k.pattern === 'none' || k.pattern === 'spots' || k.pattern === 'stripes') {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ellipse(ctx, 0, headY + hr * 0.5, hr * 0.5, hr * 0.36);
      ctx.fill();
    }
  }

  // ===== face =====
  const eye = shadeForFace(dark, coat);
  // eyes
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(-hr * 0.34, headY + hr * 0.05, hr * 0.13, 0, Math.PI * 2);
  ctx.arc(hr * 0.34, headY + hr * 0.05, hr * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-hr * 0.3, headY + hr * 0.0, hr * 0.045, 0, Math.PI * 2);
  ctx.arc(hr * 0.38, headY + hr * 0.0, hr * 0.045, 0, Math.PI * 2);
  ctx.fill();
  // nose
  ctx.fillStyle = '#e88ba0';
  ctx.beginPath();
  ctx.moveTo(-hr * 0.09, headY + hr * 0.28);
  ctx.lineTo(hr * 0.09, headY + hr * 0.28);
  ctx.lineTo(0, headY + hr * 0.4);
  ctx.closePath();
  ctx.fill();
  // mouth
  if (opts.mouthOpen) {
    ctx.fillStyle = '#7a2b33';
    ctx.beginPath();
    ctx.ellipse(0, headY + hr * 0.48, hr * 0.16, hr * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2979a';
    ctx.beginPath();
    ctx.ellipse(0, headY + hr * 0.47, hr * 0.16, hr * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = eye;
    ctx.lineWidth = hr * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, headY + hr * 0.4);
    ctx.quadraticCurveTo(-hr * 0.12, headY + hr * 0.5, -hr * 0.16, headY + hr * 0.46);
    ctx.moveTo(0, headY + hr * 0.4);
    ctx.quadraticCurveTo(hr * 0.12, headY + hr * 0.5, hr * 0.16, headY + hr * 0.46);
    ctx.stroke();
  }
  // whiskers
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = hr * 0.02;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (const dy of [0.25, 0.36, 0.47]) {
      ctx.moveTo(side * hr * 0.5, headY + hr * dy);
      ctx.lineTo(side * hr * 1.0, headY + hr * (dy + 0.06));
    }
  }
  ctx.stroke();

  ctx.restore();
}

function shadeForFace(dark, coat) {
  return '#2b2b2b';
}

function ear(ctx, cx, cy, hr, outer) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - hr * 0.35, cy - hr * 0.1);
  ctx.quadraticCurveTo(cx - hr * 0.42, cy - hr * 0.72, cx, cy - hr * 0.85);
  ctx.quadraticCurveTo(cx + hr * 0.42, cy - hr * 0.72, cx + hr * 0.35, cy - hr * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}