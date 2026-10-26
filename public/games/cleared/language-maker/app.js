import { load, save } from './storage.js';

const $ = sel => document.querySelector(sel);
const wordListEl = $('#wordList');
const letterListEl = $('#letterList');
const wordForm = $('#wordForm');
const letterForm = $('#letterForm');
const inputText = $('#inputText');
const outputText = $('#outputText');

const reverseDirEl = document.getElementById('reverseDir');
const reverseSpeechEl = document.getElementById('reverseSpeech');

let state = load();

// Ensure defaults for settings
state.settings = state.settings || { reverse: false, reverseSpeech: false };

// Sync UI
reverseDirEl.checked = !!state.settings.reverse;
reverseSpeechEl.checked = !!state.settings.reverseSpeech;

// Utils
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function render() {
  renderList(wordListEl, state.words, true);
  renderList(letterListEl, state.letters, false);
}

function renderList(root, items, isWord) {
  root.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = item.id;

    const from = document.createElement('input');
    from.value = item.from;
    from.inputMode = isWord ? 'text' : 'text';
    from.maxLength = isWord ? 256 : 2;
    from.ariaLabel = isWord ? 'from word' : 'from letter';

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';

    const to = document.createElement('input');
    to.value = item.to;
    to.maxLength = isWord ? 256 : 4;
    to.ariaLabel = isWord ? 'to word' : 'to letter (upper)';

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (!isWord) {
      const toLower = document.createElement('input');
      toLower.value = item.toLower ?? '';
      toLower.maxLength = 4;
      toLower.ariaLabel = 'to letter (lowercase)';
      toLower.placeholder = 'lower';
      
      li.append(from, arrow, to, toLower, actions);
      
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn mini';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => {
        const newFrom = from.value.trim();
        const newTo = to.value;
        const newToLower = toLower.value;
        if (!newFrom) return;
        if ([...newFrom].length !== 1) { alert('Letter "from" must be 1 character.'); return; }
        if (!newTo && !newToLower) { alert('Provide at least one of UPPER or lower outputs.'); return; }
        if (newTo && ([...newTo].length < 1 || [...newTo].length > 4)) { alert('"to" must be 1–4 characters.'); return; }
        if (newToLower && ([...newToLower].length < 1 || [...newToLower].length > 4)) { alert('"to (lower)" must be 1–4 characters.'); return; }
        updateItem(item.id, { from: newFrom, to: newTo, toLower: newToLower || undefined }, false);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn mini';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteItem(item.id, false));

      actions.append(saveBtn, delBtn);
      root.appendChild(li);
      return;
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn mini';
    saveBtn.textContent = 'Save';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn mini';
    delBtn.textContent = 'Delete';

    saveBtn.addEventListener('click', () => {
      const newFrom = from.value.trim();
      const newTo = to.value;
      if (!newFrom) return;
      if (!isWord && [...newFrom].length !== 1) { alert('Letter "from" must be 1 character.'); return; }
      if (!isWord && ([...newTo].length < 1 || [...newTo].length > 4)) { alert('Letter "to" must be 1–4 characters.'); return; }
      updateItem(item.id, { from: newFrom, to: newTo }, isWord);
    });

    delBtn.addEventListener('click', () => {
      deleteItem(item.id, isWord);
    });

    actions.append(saveBtn, delBtn);
    li.append(from, arrow, to, actions);
    root.appendChild(li);
  });
}

function updateItem(id, changes, isWord) {
  const list = isWord ? state.words : state.letters;
  const idx = list.findIndex(x => x.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...changes };
    persist();
  }
}

function deleteItem(id, isWord) {
  const key = isWord ? 'words' : 'letters';
  state[key] = state[key].filter(x => x.id !== id);
  persist();
}

function persist() {
  save(state);
  render();
}

function addWord(from, to) {
  state.words.push({ id: uid(), from: from.trim(), to });
  persist();
}

function addLetter(from, to, toLower) {
  state.letters.push({ id: uid(), from, to, toLower: toLower || undefined });
  persist();
}

// Translation pipeline: words first (whole words), then letters
function translate(text) {
  if (!text) return '';
  let out = text;

  if (!state.settings.reverse) {
    if (state.words.length) {
      const map = Object.create(null);
      state.words.forEach(w => { map[w.from.toLowerCase()] = w.to; });
      const sorted = [...new Set(Object.keys(map))].sort((a, b) => b.length - a.length);
      const re = new RegExp('\\b(' + sorted.map(k => esc(k)).join('|') + ')\\b', 'gi');
      out = out.replace(re, m => adjustWordCase(map[m.toLowerCase()] ?? m, m));
    }
    if (state.letters.length) {
      out = translateLettersForward(out, state.letters);
    }
  } else {
    if (state.letters.length) {
      out = translateLettersReverse(out, state.letters);
    }
    if (state.words.length) {
      const map = Object.create(null);
      state.words.forEach(w => { map[w.to.toLowerCase()] = w.from; });
      const sorted = [...new Set(Object.keys(map))].sort((a, b) => b.length - a.length);
      if (sorted.length) {
        const re = new RegExp('\\b(' + sorted.map(k => esc(k)).join('|') + ')\\b', 'gi');
        out = out.replace(re, m => adjustWordCase(map[m.toLowerCase()] ?? m, m));
      }
    }
  }

  if (state.settings.reverseSpeech) out = reverseWordOrder(out);
  return out;
}

function translateLettersForward(text, letters) {
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const rule = letters.find(r => ch.toLowerCase() === r.from.toLowerCase());
    if (!rule) { res += ch; continue; }
    const out = adjustLetterCase(rule.to || '', ch, rule.toLower);
    res += out;
  }
  return res;
}

function translateLettersReverse(text, letters) {
  const patterns = [];
  letters.forEach(({ from, to, toLower }) => {
    if (to) patterns.push({ val: to, from, len: [...to].length });
    if (toLower) patterns.push({ val: toLower, from, len: [...toLower].length });
  });
  patterns.sort((a, b) => b.len - a.len);
  let res = '', i = 0;
  while (i < text.length) {
    let matched = false;
    for (const p of patterns) {
      const sample = text.slice(i, i + p.len);
      if (sample.toLowerCase() === p.val.toLowerCase()) {
        res += adjustLetterCase(p.from, sample);
        i += p.len; matched = true; break;
      }
    }
    if (!matched) { res += text[i]; i++; }
  }
  return res;
}

function adjustWordCase(target, sample) {
  const isUpper = sample === sample.toUpperCase();
  const isLower = sample === sample.toLowerCase();
  const isCap = /^[A-Z][a-z]+$/.test(sample);
  if (isUpper) return target.toUpperCase();
  if (isLower) return target.toLowerCase();
  if (isCap) return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
  return target;
}

function adjustLetterCase(target, sample, lowerOverride) {
  const base = target || lowerOverride || '';
  const isUpper = sample === sample.toUpperCase();
  return isUpper ? base.toUpperCase() : (lowerOverride ?? base.toLowerCase());
}

// Event wiring
wordForm.addEventListener('submit', e => {
  e.preventDefault();
  const from = $('#wordFrom').value.trim();
  const to = $('#wordTo').value;
  if (!from) return;
  addWord(from, to);
  $('#wordFrom').value = '';
  $('#wordTo').value = '';
});

letterForm.addEventListener('submit', e => {
  e.preventDefault();
  const from = $('#letterFrom').value;
  const to = $('#letterTo').value;
  const toLower = $('#letterToLower').value;
  if ([...from].length !== 1) { alert('"from" must be 1 character.'); return; }
  if (!to && !toLower) { alert('Provide at least one of UPPER or lower outputs.'); return; }
  if (to && ([...to].length < 1 || [...to].length > 4)) { alert('"to" must be 1–4 characters.'); return; }
  if (toLower && ([...toLower].length < 1 || [...toLower].length > 4)) { alert('"to (lower)" must be 1–4 characters.'); return; }
  addLetter(from, to, toLower);
  $('#letterFrom').value = '';
  $('#letterTo').value = '';
  $('#letterToLower').value = '';
});

reverseDirEl.addEventListener('change', () => {
  state.settings.reverse = reverseDirEl.checked;
  persist();
  outputText.textContent = translate(inputText.value);
});

reverseSpeechEl.addEventListener('change', () => {
  state.settings.reverseSpeech = reverseSpeechEl.checked;
  persist();
  outputText.textContent = translate(inputText.value);
});

$('#translateBtn').addEventListener('click', () => {
  outputText.textContent = translate(inputText.value);
});

$('#clearBtn').addEventListener('click', () => {
  inputText.value = '';
  outputText.textContent = '';
  inputText.focus();
});

$('#copyBtn').addEventListener('click', async () => {
  const text = outputText.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flash('#copyBtn');
  } catch {
    // Fallback: select and copy
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
    flash('#copyBtn');
  }
});

// Live translate on input with a small debounce
let t;
inputText.addEventListener('input', () => {
  clearTimeout(t);
  t = setTimeout(() => {
    outputText.textContent = translate(inputText.value);
  }, 120);
});

function flash(sel) {
  const el = document.querySelector(sel);
  el.style.opacity = '0.6';
  setTimeout(() => { el.style.opacity = '1'; }, 160);
}

// Initial render
render();