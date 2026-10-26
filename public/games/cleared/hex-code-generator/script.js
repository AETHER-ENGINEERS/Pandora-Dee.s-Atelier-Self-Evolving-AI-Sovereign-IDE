// Minimal random hex generator with copy-on-tap and accessible updates.
// No external libs required.

const swatch = document.getElementById('swatch');
const hexBtn = document.getElementById('hexBtn');
const genBtn = document.getElementById('generate');
const copyBtn = document.getElementById('copy');

function randomHex() {
  const n = Math.floor(Math.random() * 0xffffff);
  return '#' + n.toString(16).padStart(6, '0').toUpperCase();
}

function updateUI(hex) {
  swatch.style.background = hex;
  // choose readable text color (black/white) based on luminance
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const luminance = (0.2126*r + 0.7152*g + 0.0722*b);
  const textColor = luminance > 150 ? '#111' : '#fff';
  hexBtn.textContent = hex;
  hexBtn.style.color = textColor;
  hexBtn.style.background = 'transparent';
  // Set outline for visibility on very similar backgrounds
  hexBtn.style.textShadow = luminance > 150 ? 'none' : '0 1px 1px rgba(0,0,0,0.25)';
  document.body.style.background = '';
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    flashMessage('Copied');
  } catch (e) {
    // fallback: select text button temporarily
    flashMessage('Copy failed');
  }
}

function flashMessage(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '6vh',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.78)',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '10px',
    fontSize: '14px',
    zIndex: 9999,
    opacity: '0',
    transition: 'opacity 160ms ease'
  });
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.style.opacity = '1');
  setTimeout(()=> {
    el.style.opacity = '0';
    setTimeout(()=> el.remove(), 200);
  }, 900);
}

// initial color
let current = randomHex();
updateUI(current);

// interactions
genBtn.addEventListener('click', ()=> {
  current = randomHex();
  updateUI(current);
});

copyBtn.addEventListener('click', ()=> copyToClipboard(current));

// allow tapping hex text to copy as well
hexBtn.addEventListener('click', ()=> copyToClipboard(current));

// keyboard: space/enter on generate
genBtn.addEventListener('keyup', (e)=> {
  if (e.key === 'Enter' || e.key === ' ') genBtn.click();
});

// quick tap on swatch also generates (touch-friendly)
swatch.addEventListener('click', ()=> {
  current = randomHex();
  updateUI(current);
});

// accessibility: allow left/right arrow to change color
document.addEventListener('keydown', (e)=> {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    current = randomHex();
    updateUI(current);
  }
});