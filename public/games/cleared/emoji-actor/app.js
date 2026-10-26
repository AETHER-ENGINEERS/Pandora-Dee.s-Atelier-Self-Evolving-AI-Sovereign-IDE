const STORAGE_KEY = 'little-actor-v1';
const faces = ['🙂','😀','😃','😄','😁','😆','🥹','😊','😇','😍','🥰','😘','😋','😜','🤪','🤔','🫡','🤭','🤗','😎','🥳','😴','🥱','😮','😳','🥺','😢','😭','😤','😡','🤯','🤖','👻','👽','🐱','🐶','🐸','🐼','🦊','🐻','🐰','🐵','🦄','🐣','🌝','⭐','🌻','🍓','🍕','💖','🔥','✨','🎉','🌈','💌','🧸'];
const defaults = { emoji: '🙂', interactions: [] };
let state = loadState();
let editingId = null;
let reactionTimer = null;
const $ = (id) => document.getElementById(id);
const character = $('character');

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved.emoji === 'string' && Array.isArray(saved.interactions)) return saved;
  } catch (error) { console.warn('Could not load saved character.', error); }
  return structuredClone(defaults);
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('savedStatus').textContent = 'Saved'; }
  catch (error) { $('savedStatus').textContent = 'Not saved'; console.warn('Could not save character.', error); }
}
function render() {
  character.textContent = state.emoji;
  $('interactionCount').textContent = state.interactions.length;
  $('emptyNote').classList.toggle('hidden', state.interactions.length > 0);
  $('playEmpty').classList.toggle('hidden', state.interactions.length > 0);
  $('interactionList').replaceChildren(...state.interactions.map((item) => {
    const card = document.createElement('article'); card.className = 'interaction-card';
    const icon = document.createElement('span'); icon.className = 'card-emoji'; icon.textContent = item.emojis[0] || item.emojiRules?.[0]?.emoji || '✦';
    const copy = document.createElement('div'); copy.className = 'card-copy';
    const name = document.createElement('div'); name.className = 'card-name'; name.textContent = item.name;
    const meta = document.createElement('div'); meta.className = 'card-meta';
    const textCount = item.texts.length + (item.texts.length === 1 ? ' line' : ' lines');
    meta.textContent = [item.emojis.length ? item.emojis.join(' ') : item.emojiRules?.length ? item.emojiRules.length + ' text-linked' : 'no emoji', item.texts.length ? textCount : 'no text', item.duration === 0 ? 'until next' : item.duration + 's'].join(' · ');
    copy.append(name, meta);
    const actions = document.createElement('div'); actions.className = 'card-actions';
    actions.append(makeIconButton('Edit interaction', '↗', () => openForm(item.id)), makeIconButton('Delete interaction', '×', () => deleteInteraction(item.id)));
    card.append(icon, copy, actions); return card;
  }));
  $('playList').replaceChildren(...state.interactions.map((item) => {
    const button = document.createElement('button'); button.className = 'play-button'; button.type = 'button';
    const icon = document.createElement('span'); icon.className = 'card-emoji'; icon.textContent = item.emojis[0] || item.emojiRules?.[0]?.emoji || '✦';
    const name = document.createElement('span'); name.className = 'card-name'; name.textContent = item.name;
    const arrow = document.createElement('span'); arrow.className = 'play-arrow'; arrow.textContent = '↗';
    button.append(icon, name, arrow); button.addEventListener('click', () => playInteraction(item)); return button;
  }));
}
function makeIconButton(label, text, handler) { const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button'; button.setAttribute('aria-label', label); button.textContent = text; button.addEventListener('click', handler); return button; }
function deleteInteraction(id) { state.interactions = state.interactions.filter((item) => item.id !== id); persist(); render(); }
function playInteraction(item) {
  clearTimeout(reactionTimer);
  const text = item.texts.length ? item.texts[Math.floor(Math.random() * item.texts.length)] : '';
  const rules = item.emojiRules || [];
  const linkedEmojis = new Set(rules.map((rule) => rule.emoji));
  const matchingEmojis = rules.filter((rule) => rule.text === text).map((rule) => rule.emoji);
  const generalEmojis = item.emojis.filter((emoji) => !linkedEmojis.has(emoji));
  const choices = matchingEmojis.length ? matchingEmojis : generalEmojis;
  const emoji = choices.length ? choices[Math.floor(Math.random() * choices.length)] : '';
  character.textContent = emoji || state.emoji; $('reactionText').textContent = text; $('stageHint').textContent = item.name;
  if (emoji && item.duration > 0) reactionTimer = setTimeout(() => { character.textContent = state.emoji; }, item.duration * 1000);
}
function setMode(mode) {
  const playing = mode === 'play';
  $('editMode').classList.toggle('active', !playing); $('playMode').classList.toggle('active', playing);
  $('editMode').setAttribute('aria-selected', String(!playing)); $('playMode').setAttribute('aria-selected', String(playing));
  $('editorView').classList.toggle('hidden', playing); $('playView').classList.toggle('hidden', !playing);
  $('sectionTitle').textContent = playing ? 'Choose a moment' : 'Interactions';
  if (!playing) { clearTimeout(reactionTimer); character.textContent = state.emoji; $('reactionText').textContent = ''; $('stageHint').textContent = 'Choose an emoji to get started'; }
}
function openForm(id = null) {
  editingId = id; const item = state.interactions.find((entry) => entry.id === id);
  $('formTitle').textContent = item ? 'Edit interaction' : 'New interaction';
  $('saveInteraction').innerHTML = item ? 'Save changes <span>↗</span>' : 'Save interaction <span>↗</span>';
  $('interactionName').value = item?.name || ''; $('reactionEmojis').value = item?.emojis.join(', ') || '';
  $('reactionTexts').value = item?.texts.join('. ') || ''; $('emojiRules').value = item?.emojiRules?.map((rule) => rule.text + ' = ' + rule.emoji).join('\n') || ''; $('reactionDuration').value = item?.duration ?? 2;
  $('interactionDialog').showModal(); $('interactionName').focus();
}
$('editMode').addEventListener('click', () => setMode('edit'));
$('playMode').addEventListener('click', () => setMode('play'));
$('addInteraction').addEventListener('click', () => openForm());
character.addEventListener('click', () => { if (!$('playView').classList.contains('hidden')) return; renderEmojiGrid(); $('customEmoji').value = state.emoji; $('emojiDialog').showModal(); $('customEmoji').focus(); });
$('applyCustomEmoji').addEventListener('click', () => { const value = $('customEmoji').value.trim(); const emoji = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(value)][0]?.segment : [...value][0]; if (!emoji) return; state.emoji = emoji; persist(); render(); $('emojiDialog').close(); });
$('customEmoji').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('applyCustomEmoji').click(); } });
function renderEmojiGrid() {
  $('emojiGrid').replaceChildren(...faces.map((face) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'emoji-option'; button.textContent = face; button.setAttribute('aria-label', face); button.addEventListener('click', () => { state.emoji = face; persist(); render(); $('emojiDialog').close(); }); return button; }));
}
$('interactionForm').addEventListener('submit', (event) => {
  event.preventDefault(); const name = $('interactionName').value.trim(); if (!name) return;
  const duration = Math.max(0, Number($('reactionDuration').value) || 0);
  const item = { id: editingId || crypto.randomUUID(), name, emojis: splitValues($('reactionEmojis').value, ','), texts: splitValues($('reactionTexts').value, '.'), emojiRules: parseEmojiRules($('emojiRules').value), duration };
  if (editingId) state.interactions = state.interactions.map((entry) => entry.id === editingId ? item : entry); else state.interactions.push(item);
  persist(); render(); $('interactionDialog').close();
});
function parseEmojiRules(value) {
  return value.split('\n').flatMap((line) => {
    const equals = line.indexOf('=');
    if (equals < 0) return [];
    const text = line.slice(0, equals).trim();
    return splitValues(line.slice(equals + 1), ',').map((emoji) => ({ text, emoji })).filter((rule) => rule.text);
  });
}
function splitValues(value, separator) {
  if (separator !== '.') return value.split(separator).map((part) => part.trim()).filter(Boolean);
  const parts = [];
  let current = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '.') { current += value[i]; continue; }
    let run = 1;
    while (value[i + run] === '.') run++;
    current += '.'.repeat(run - 1);
    parts.push(current.trim());
    current = '';
    i += run - 1;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}
document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => $('emojiDialog').close()));
document.querySelectorAll('.close-form').forEach((button) => button.addEventListener('click', () => $('interactionDialog').close()));
$('emojiDialog').addEventListener('click', (event) => { if (event.target === $('emojiDialog')) $('emojiDialog').close(); });
$('interactionDialog').addEventListener('click', (event) => { if (event.target === $('interactionDialog')) $('interactionDialog').close(); });
render();