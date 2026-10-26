/* Simple message simulator
   - Stores everything in localStorage
   - Supports profile creation, adding people, editing, deleting, cloning
   - Templates with multiple outcomes; chat shows typing and random outcome
   - Group chats where whoever has a template for the message replies
*/

const STORAGE_KEY = 'msgsim_v1';

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {
    me: { emoji:'🙂', color:'#2f8bff' },
    people: [],
    chats: {}, // personId -> array of {from:'me'|'them', text, time, avatarEmoji?, avatarColor?, senderName?}
    groups: [], // {id, name, personIds:[...], messages:[...]}
    mentionAt: true // group mentions require a preceding @
  };
  try { return JSON.parse(raw); } catch(e){ return null; }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* keep emoji as exact string the user entered. Avoid any processing that can split grapheme clusters. */
function setAvatarPreview(elem, emoji, color){
  elem.style.background = color || '#999';
  elem.textContent = (emoji||'').trim() || '';
}

/* initial state */
let state = loadState();
if (!state.groups) state.groups = [];
if (state.mentionAt === undefined) state.mentionAt = true;


// DOM refs
const myEmojiInput = qs('#my-avatar-emoji');
const myColorInput = qs('#my-avatar-color');
const myAvatarPreview = qs('#my-avatar-preview');
const saveMeBtn = qs('#save-me');

const peopleContainer = qs('#people-container');
const addPersonBtn = qs('#add-person');

const groupsContainer = qs('#groups-container');
const newGroupBtn = qs('#new-group');
const mentionAtToggle = qs('#mention-at');

const personModal = qs('#person-modal');
const closeModalBtn = qs('#close-modal');
const modalTitle = qs('#modal-title');
const personEmoji = qs('#person-emoji');
const personColor = qs('#person-color');
const personName = qs('#person-name');
const templatesList = qs('#templates-list');
const addTemplateBtn = qs('#add-template');
const pasteTemplateBtn = qs('#paste-template');
const savePersonBtn = qs('#save-person');
const personAvatarPreview = qs('#person-avatar-preview');
const fallbacksList = qs('#fallbacks-list');
const addFallbackBtn = qs('#add-fallback');

const groupModal = qs('#group-modal');
const closeGroupBtn = qs('#close-group');
const groupModalTitle = qs('#group-modal-title');
const groupNameInput = qs('#group-name');
const membersPicker = qs('#group-members-picker');
const saveGroupBtn = qs('#save-group');

const chatScreen = qs('#chat-screen');
const listScreen = qs('#list-screen');
const backToListBtn = qs('#back-to-list');
const chatAvatars = qs('#chat-avatars');
const chatAvatar = qs('#chat-avatar');
const chatName = qs('#chat-name');
const chatMembers = qs('#chat-members');
const messagesBox = qs('#messages');
const templateSelect = qs('#template-select');
const messageInput = qs('#message-input');
const sendBtn = qs('#send-btn');
const editPersonBtn = qs('#edit-person');
const removePersonBtn = qs('#remove-person');

let editingPersonId = null;
let editingGroupId = null;
let activeChatId = null;   // person id when chatting one-on-one
let activeGroupId = null;  // group id when chatting a group
let activeMessagesRef = null; // the currently displayed messages array

/* ---------- UI wiring ---------- */

function renderMyProfileToInputs(){
  myEmojiInput.value = state.me.emoji || '';
  myColorInput.value = state.me.color || '#2f8bff';
  setAvatarPreview(myAvatarPreview, state.me.emoji, state.me.color);
}
renderMyProfileToInputs();

myEmojiInput.addEventListener('input', e => {
  setAvatarPreview(myAvatarPreview, e.target.value, myColorInput.value);
});
myColorInput.addEventListener('input', e => {
  setAvatarPreview(myAvatarPreview, myEmojiInput.value, e.target.value);
});
saveMeBtn.addEventListener('click', () => {
  state.me.emoji = myEmojiInput.value.trim();
  state.me.color = myColorInput.value;
  saveState();
  renderMyProfileToInputs();
});

/* ---------- People list ---------- */
function renderPeople(){
  peopleContainer.innerHTML = '';
  state.people.forEach(p => {
    const row = document.createElement('div');
    row.className = 'person-row';
    const info = document.createElement('div');
    info.className = 'person-info';
    info.addEventListener('click', () => openPersonChat(p.id));
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    setAvatarPreview(avatar, p.emoji, p.color);
    const name = document.createElement('div');
    name.className = 'person-name';
    name.textContent = p.name || 'Unnamed';
    info.appendChild(avatar);
    info.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'person-actions';

    const cloneBtn = document.createElement('button');
    cloneBtn.className = 'small-btn';
    cloneBtn.textContent = 'Clone';
    cloneBtn.title = 'Duplicate this person';
    cloneBtn.addEventListener('click', (ev) => { ev.stopPropagation(); clonePerson(p.id); });

    const editBtn = document.createElement('button');
    editBtn.className = 'small-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openPersonModal(p.id); });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'small-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (ev) => { ev.stopPropagation(); removePerson(p.id); });

    actions.appendChild(cloneBtn);
    actions.appendChild(editBtn);
    actions.appendChild(removeBtn);

    row.appendChild(info);
    row.appendChild(actions);
    peopleContainer.appendChild(row);
  });
}

addPersonBtn.addEventListener('click', () => openPersonModal());

function clonePerson(id){
  const p = state.people.find(x => x.id === id);
  if (!p) return;
  const clone = {
    id: uid(),
    name: (p.name || 'Unnamed') + ' clone',
    emoji: p.emoji,
    color: p.color,
    templates: JSON.parse(JSON.stringify(p.templates || [])),
    fallbacks: JSON.parse(JSON.stringify(p.fallbacks || []))
  };
  state.people.push(clone);
  state.chats[clone.id] = [];
  saveState();
  renderPeople();
  renderGroups();
}

function openPersonModal(personId = null){
  editingPersonId = personId;
  personModal.classList.remove('hidden');
  templatesList.innerHTML = '';

  if (personId){
    modalTitle.textContent = 'Edit Person';
    const p = state.people.find(x => x.id === personId);
    personEmoji.value = p.emoji || '';
    personColor.value = p.color || '#f39c12';
    personName.value = p.name || '';
    setAvatarPreview(personAvatarPreview, p.emoji, p.color);
    (p.templates || []).forEach(t => addTemplateRow(t));
    renderFallbacks(p.fallbacks || []);
  } else {
    modalTitle.textContent = 'New Person';
    personEmoji.value = '';
    personColor.value = '#f39c12';
    personName.value = '';
    setAvatarPreview(personAvatarPreview, '', '#f39c12');
    addTemplateRow();
    renderFallbacks([]);
  }
}

function addFallbackRow(val=''){
  const o = document.createElement('div');
  o.className = 'outcome-row';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Fallback reply';
  inp.value = val;
  const del = document.createElement('button');
  del.className = 'small-btn';
  del.textContent = '✕';
  del.addEventListener('click', () => { fallbacksList.removeChild(o); });
  o.appendChild(inp);
  o.appendChild(del);
  fallbacksList.appendChild(o);
}

function renderFallbacks(arr){
  fallbacksList.innerHTML = '';
  if (arr.length === 0) addFallbackRow('');
  else arr.forEach(addFallbackRow);
}

addFallbackBtn.addEventListener('click', () => addFallbackRow(''));
closeModalBtn.addEventListener('click', () => { personModal.classList.add('hidden'); });

personEmoji.addEventListener('input', e => setAvatarPreview(personAvatarPreview, e.target.value, personColor.value));
personColor.addEventListener('input', e => setAvatarPreview(personAvatarPreview, personEmoji.value, e.target.value));

addTemplateBtn.addEventListener('click', () => addTemplateRow());

/* ---------- Template copy / paste ----------
   A template is copied to the system clipboard as a short, portable string so
   it can be pasted into this person's list, any other person, or a whole other
   browser / device (clipboard travels with you). */
const TMPL_MARKER = 'MSGSIMTMPL1:';

function serializeTemplate(t){
  return TMPL_MARKER + JSON.stringify({ ask: t.ask || '', outcomes: t.outcomes || [], after: t.after || [], afterAnywhere: !!t.afterAnywhere });
}

function parseTemplate(str){
  if (typeof str !== 'string' || !str.startsWith(TMPL_MARKER)) return null;
  try {
    const obj = JSON.parse(str.slice(TMPL_MARKER.length));
    if (obj && typeof obj === 'object' && typeof obj.ask === 'string' && Array.isArray(obj.outcomes)){
      return {
        ask: obj.ask,
        outcomes: obj.outcomes.map(o => String(o)),
        after: Array.isArray(obj.after) ? obj.after.map(a => String(a)) : [],
        afterAnywhere: !!obj.afterAnywhere
      };
    }
  } catch (e) {}
  return null;
}

function readTemplateRow(row){
  const ask = row.querySelector('input.input-ask').value.trim();
  const afterInput = row.querySelector('input.input-after');
  const after = (afterInput ? afterInput.value.trim() : '');
  const anywhereInput = row.querySelector('input.after-anywhere');
  const anywhere = anywhereInput ? anywhereInput.checked : false;
  const outcomes = Array.from(row.querySelectorAll('.outcomes input[type="text"]'))
    .map(i => i.value.trim()).filter(s => s !== '');
  return { ask, outcomes, after, afterAnywhere: anywhere };
}

async function copyTemplateToClipboard(row){
  const t = readTemplateRow(row);
  try {
    await navigator.clipboard.writeText(serializeTemplate(t));
    flashButton(row._copyBtn, 'Copied!');
  } catch (e) {
    const text = serializeTemplate(t);
    prompt('Copy this template (or send it to someone else):', text);
  }
}

function flashButton(btn, text){
  const old = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = old;
    btn.disabled = false;
  }, 1200);
}

pasteTemplateBtn.addEventListener('click', async () => {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch (e) {
    // Read permission denied or unavailable; let the user paste the string manually.
    text = prompt('Clipboard unavailable. Paste the copied template text here:') || '';
  }
  const t = parseTemplate(text);
  if (!t){
    flashButton(pasteTemplateBtn, 'No template');
    return;
  }
  addTemplateRow(t);
  flashButton(pasteTemplateBtn, 'Pasted!');
});

function addTemplateRow(template = { ask:'', outcomes: [''] }){
  const row = document.createElement('div');
  row.className = 'template-row';

  const askInput = document.createElement('input');
  askInput.className = 'input-ask';
  askInput.type = 'text';
  askInput.placeholder = 'What you might say (comma-separated)';
  askInput.value = template.ask || '';

  const afterInput = document.createElement('input');
  afterInput.className = 'input-after';
  afterInput.type = 'text';
  afterInput.placeholder = 'OR only activates after the NPC says one of these (comma-separated)';
  afterInput.value = (template.after || []).join(', ');

  const anywhereLabel = document.createElement('label');
  anywhereLabel.className = 'after-anywhere-label';
  const anywhereCheck = document.createElement('input');
  anywhereCheck.type = 'checkbox';
  anywhereCheck.className = 'after-anywhere';
  anywhereCheck.checked = !!template.afterAnywhere;
  const anywhereText = document.createElement('span');
  anywhereText.textContent = 'trigger can be anywhere in the chat, not just the last reply';
  anywhereLabel.appendChild(anywhereCheck);
  anywhereLabel.appendChild(anywhereText);

  const outcomesBox = document.createElement('div');
  outcomesBox.className = 'outcomes';

  function addOutcomeInput(val=''){
    const o = document.createElement('div');
    o.className = 'outcome-row';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Outcome reply';
    inp.value = val;
    const del = document.createElement('button');
    del.className = 'small-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => { outcomesBox.removeChild(o); });
    o.appendChild(inp);
    o.appendChild(del);
    outcomesBox.appendChild(o);
  }

  (template.outcomes || []).forEach(addOutcomeInput);
  if ((template.outcomes || []).length === 0) addOutcomeInput('');

  const addOutcomeBtn = document.createElement('button');
  addOutcomeBtn.className = 'small-btn';
  addOutcomeBtn.textContent = '+ outcome';
  addOutcomeBtn.addEventListener('click', () => addOutcomeInput(''));

  const copyBtn = document.createElement('button');
  copyBtn.className = 'small-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy this template (pasteable in any person)';
  copyBtn.addEventListener('click', () => copyTemplateToClipboard(row));
  row._copyBtn = copyBtn;

  const delTemplate = document.createElement('button');
  delTemplate.className = 'small-btn';
  delTemplate.textContent = 'Delete template';
  delTemplate.addEventListener('click', () => {
    templatesList.removeChild(row);
  });

  const rightCol = document.createElement('div');
  rightCol.style.display = 'flex';
  rightCol.style.flexDirection = 'column';
  rightCol.style.gap = '6px';
  rightCol.appendChild(outcomesBox);
  rightCol.appendChild(addOutcomeBtn);
  const actionRow = document.createElement('div');
  actionRow.className = 'row';
  actionRow.appendChild(copyBtn);
  actionRow.appendChild(delTemplate);
  rightCol.appendChild(actionRow);

  const leftCol = document.createElement('div');
  leftCol.style.display = 'flex';
  leftCol.style.flexDirection = 'column';
  leftCol.style.gap = '6px';
  leftCol.style.flex = '1';
  leftCol.appendChild(askInput);
  leftCol.appendChild(afterInput);
  leftCol.appendChild(anywhereLabel);

  row.appendChild(leftCol);
  row.appendChild(rightCol);

  templatesList.appendChild(row);
}

savePersonBtn.addEventListener('click', () => {
  const name = personName.value.trim() || 'Unnamed';
  const emoji = personEmoji.value.trim();
  const color = personColor.value;
  const templates = Array.from(templatesList.querySelectorAll('.template-row')).map(r => {
    const ask = r.querySelector('.input-ask').value.trim();
    const after = r.querySelector('.input-after').value;
    const anywhere = r.querySelector('.after-anywhere').checked;
    const outcomes = Array.from(r.querySelectorAll('.outcomes input[type="text"]')).map(i => i.value.trim()).filter(s=>s!=='');
    return {
      ask,
      after: after.split(/[,|]/).map(s => s.trim()).filter(s => s !== ''),
      afterAnywhere: anywhere,
      outcomes
    };
  }).filter(t => t.ask || (t.after && t.after.length > 0) || t.outcomes.length>0);

  const fallbacks = Array.from(fallbacksList.querySelectorAll('input[type="text"]'))
    .map(i => i.value.trim()).filter(s => s !== '');

  if (editingPersonId){
    const p = state.people.find(x => x.id === editingPersonId);
    if (!p) return;
    p.name = name; p.emoji = emoji; p.color = color; p.templates = templates; p.fallbacks = fallbacks;
  } else {
    const id = uid();
    state.people.push({ id, name, emoji, color, templates, fallbacks });
    state.chats[id] = state.chats[id] || [];
  }
  saveState();
  renderPeople();
  renderGroups();
  personModal.classList.add('hidden');
});

function removePerson(id){
  if (!confirm('Remove this person?')) return;
  state.people = state.people.filter(p => p.id !== id);
  delete state.chats[id];
  // also remove them from any groups
  state.groups.forEach(g => g.personIds = g.personIds.filter(pid => pid !== id));
  state.groups = state.groups.filter(g => g.personIds.length >= 1);
  if (activeChatId === id) {
    activeChatId = null;
    backToHome();
  }
  if (activeGroupId){
    const g = state.groups.find(x => x.id === activeGroupId);
    if (!g) { activeGroupId = null; backToHome(); }
    else renderGroupMessages(g);
  }
  saveState();
  renderPeople();
  renderGroups();
}

/* ---------- Groups ---------- */
function renderGroups(){
  groupsContainer.innerHTML = '';
  if (state.groups.length === 0){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No groups yet.';
    groupsContainer.appendChild(empty);
    return;
  }
  state.groups.forEach(g => {
    const row = document.createElement('div');
    row.className = 'group-row';
    const avatars = document.createElement('div');
    avatars.className = 'mini-avatars';
    g.personIds.forEach(pid => {
      const p = state.people.find(x => x.id === pid);
      const a = document.createElement('div');
      a.className = 'avatar mini';
      a.title = p ? p.name : '';
      setAvatarPreview(a, p ? p.emoji : '', p ? p.color : '');
      avatars.appendChild(a);
    });
    const info = document.createElement('div');
    info.className = 'person-info';
    info.addEventListener('click', () => openGroupChat(g.id));
    const name = document.createElement('div');
    name.className = 'person-name';
    name.textContent = g.name || 'Group';
    const sub = document.createElement('div');
    sub.className = 'muted';
    sub.textContent = (state.people.filter(p => g.personIds.includes(p.id)).map(p => p.name).join(', ')) || 'No members';
    info.appendChild(name);
    info.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'person-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'small-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openGroupModal(g.id); });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'small-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (ev) => { ev.stopPropagation(); removeGroup(g.id); });
    actions.appendChild(editBtn);
    actions.appendChild(removeBtn);

    row.appendChild(avatars);
    row.appendChild(info);
    row.appendChild(actions);
    groupsContainer.appendChild(row);
  });
}
renderGroups();

newGroupBtn.addEventListener('click', () => openGroupModal());

function openGroupModal(groupId = null){
  editingGroupId = groupId;
  groupModal.classList.remove('hidden');
  membersPicker.innerHTML = '';

  let selected = new Set();
  if (groupId){
    groupModalTitle.textContent = 'Edit Group';
    const g = state.groups.find(x => x.id === groupId);
    groupNameInput.value = g.name || '';
    (g.personIds||[]).forEach(id => selected.add(id));
    saveGroupBtn.textContent = 'Save';
  } else {
    groupModalTitle.textContent = 'New Group';
    groupNameInput.value = '';
    saveGroupBtn.textContent = 'Create';
  }

  if (state.people.length === 0){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Add some people first.';
    membersPicker.appendChild(empty);
    return;
  }

  state.people.forEach(p => {
    const chip = document.createElement('label');
    chip.className = 'member-chip';
    if (selected.has(p.id)) chip.classList.add('selected');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = p.id;
    cb.checked = selected.has(p.id);
    const avatar = document.createElement('div');
    avatar.className = 'avatar mini';
    setAvatarPreview(avatar, p.emoji, p.color);
    const name = document.createElement('span');
    name.textContent = p.name || 'Unnamed';
    chip.appendChild(cb);
    chip.appendChild(avatar);
    chip.appendChild(name);
    cb.addEventListener('change', () => {
      if (cb.checked) chip.classList.add('selected');
      else chip.classList.remove('selected');
    });
    membersPicker.appendChild(chip);
  });
}
closeGroupBtn.addEventListener('click', () => { groupModal.classList.add('hidden'); });

saveGroupBtn.addEventListener('click', () => {
  const selectedIds = Array.from(membersPicker.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
  if (selectedIds.length < 2){
    alert('Select at least 2 people for a group.');
    return;
  }
  const name = groupNameInput.value.trim() || 'Group';
  if (editingGroupId){
    const g = state.groups.find(x => x.id === editingGroupId);
    if (g){ g.name = name; g.personIds = selectedIds; }
  } else {
    state.groups.push({ id: uid(), name, personIds: selectedIds, messages: [] });
  }
  saveState();
  renderGroups();
  groupModal.classList.add('hidden');
  if (activeGroupId && editingGroupId){
    const g = state.groups.find(x => x.id === activeGroupId);
    if (g) renderGroupMessages(g);
  }
});

function renderMentionToggle(){
  mentionAtToggle.checked = state.mentionAt;
}
mentionAtToggle.addEventListener('change', () => {
  state.mentionAt = mentionAtToggle.checked;
  saveState();
});
renderMentionToggle();

function removeGroup(id){
  if (!confirm('Remove this group?')) return;
  state.groups = state.groups.filter(g => g.id !== id);
  if (activeGroupId === id){
    activeGroupId = null;
    backToHome();
  }
  saveState();
  renderGroups();
}

/* ---------- Chat ---------- */
function openPersonChat(personId){
  activeGroupId = null;
  activeChatId = personId;
  const p = state.people.find(x => x.id === personId);
  if (!p) return;
  listScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  // rebuild avatar area: single avatar
  chatAvatars.innerHTML = '';
  const a = document.createElement('div');
  a.className = 'avatar';
  setAvatarPreview(a, p.emoji, p.color);
  chatAvatars.appendChild(a);
  chatName.textContent = p.name || 'Unnamed';
  chatMembers.textContent = '';
  templateSelect.style.display = '';
  renderPersonMessages(personId);
  rebuildTemplateSelect(p);
}

function openGroupChat(groupId){
  activeChatId = null;
  activeGroupId = groupId;
  const g = state.groups.find(x => x.id === groupId);
  if (!g) return;
  listScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  // rebuild avatars: stack of participants
  chatAvatars.innerHTML = '';
  g.personIds.forEach(pid => {
    const p = state.people.find(x => x.id === pid);
    const a = document.createElement('div');
    a.className = 'avatar mini';
    a.title = p ? p.name : '';
    setAvatarPreview(a, p ? p.emoji : '', p ? p.color : '');
    chatAvatars.appendChild(a);
  });
  chatName.textContent = g.name || 'Group';
  chatMembers.textContent = g.personIds.map(pid => (state.people.find(x=>x.id===pid)||{}).name || '').join(', ');
  templateSelect.style.display = 'none';
  renderGroupMessages(g);
}

backToListBtn.addEventListener('click', () => {
  activeChatId = null;
  activeGroupId = null;
  backToHome();
});

function backToHome(){
  chatScreen.classList.add('hidden');
  listScreen.classList.remove('hidden');
  renderPeople();
  renderGroups();
}

editPersonBtn.addEventListener('click', () => {
  if (activeChatId){ openPersonModal(activeChatId); return; }
  if (activeGroupId){ openGroupModal(activeGroupId); return; }
});

removePersonBtn.addEventListener('click', () => {
  if (activeChatId){ removePerson(activeChatId); return; }
  if (activeGroupId){ removeGroup(activeGroupId); return; }
});

/* ---------- render messages ---------- */
function renderPersonMessages(personId){
  messagesBox.innerHTML = '';
  const chat = state.chats[personId] || [];
  activeMessagesRef = chat;
  chat.forEach((m,i) => appendMessageRow(m, i));
  scrollToBottom();
}

function renderGroupMessages(group){
  messagesBox.innerHTML = '';
  activeMessagesRef = group.messages || [];
  activeMessagesRef.forEach((m,i) => appendMessageRow(m, i));
  scrollToBottom();
}

function scrollToBottom(){
  requestAnimationFrame(()=> messagesBox.scrollTop = messagesBox.scrollHeight);
}

function appendMessageRow(msg, idx){
  const row = document.createElement('div');
  row.className = 'msg-row ' + (msg.from === 'me' ? 'right' : 'left');
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  setAvatarPreview(avatar, msg.avatarEmoji, msg.avatarColor);

  const bubbleWrap = document.createElement('div');
  bubbleWrap.className = 'bubble-wrap';

  if (msg.from === 'them' && msg.senderName){
    const label = document.createElement('div');
    label.className = 'sender-label';
    label.textContent = msg.senderName;
    bubbleWrap.appendChild(label);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (msg.from === 'me' ? 'me' : 'them');
  bubble.textContent = msg.text;
  bubbleWrap.appendChild(bubble);

  // delete on click
  bubble.addEventListener('click', (e) => {
    if (!confirm('Delete this message?')) return;
    if (activeMessagesRef && idx >= 0 && idx < activeMessagesRef.length){
      activeMessagesRef.splice(idx, 1);
      saveState();
      if (activeChatId) renderPersonMessages(activeChatId);
      else if (activeGroupId){ const g = state.groups.find(x=>x.id===activeGroupId); if (g) renderGroupMessages(g); }
    }
  });

  if (msg.from === 'me'){
    row.appendChild(bubbleWrap);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubbleWrap);
  }
  messagesBox.appendChild(row);
}

/* ---------- composer ---------- */
function rebuildTemplateSelect(person){
  templateSelect.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— templates —';
  templateSelect.appendChild(noneOpt);
  (person.templates || []).forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = t.ask || `(template ${i+1})`;
    templateSelect.appendChild(opt);
  });
}

templateSelect.addEventListener('change', () => {
  const idx = templateSelect.value;
  if (idx === '') { messageInput.value = ''; return; }
  const p = state.people.find(x => x.id === activeChatId);
  if (!p) return;
  const t = p.templates[Number(idx)];
  if (t) messageInput.value = t.ask || '';
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

/* ---------- template matching ----------
   The reply picks the MOST SPECIFIC template that matches the full message.
   - A variant only matches as a whole word / phrase (so "ok" never triggers inside "okay").
   - Longer (more specific) matches win over shorter ones found inside them
     ("how are you" beats "how").
   - If several match at the same specificity, one is chosen at random.
*/

// Does `variant` appear in `lowerText` as a standalone word/phrase?
function isPhrase(lowerText, variant){
  if (!variant) return false;
  let from = 0;
  while (true){
    const i = lowerText.indexOf(variant, from);
    if (i === -1) return false;
    const before = i > 0 ? lowerText[i-1] : '';
    const afterIdx = i + variant.length;
    const after = afterIdx < lowerText.length ? lowerText[afterIdx] : '';
    const beforeWordBoundary = /[a-z0-9]/.test(before);
    const afterWordBoundary = /[a-z0-9]/.test(after);
    if (!beforeWordBoundary && !afterWordBoundary) return true;
    from = i + 1;
  }
}

// Does `@variant` appear in `text` as a standalone mention (preceded by @)?
function isAtMention(lowerText, variant){
  if (!variant) return false;
  let from = 0;
  while (true){
    const i = lowerText.indexOf('@' + variant, from);
    if (i === -1) return false;
    const before = i > 0 ? lowerText[i-1] : '';
    const afterIdx = i + 1 + variant.length;
    const after = afterIdx < lowerText.length ? lowerText[afterIdx] : '';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = i + 1;
  }
}

function templateVariants(t){
  return (t.ask || '').split(/[,|]/).map(s => s.trim()).filter(v => v !== '').map(v => v.toLowerCase());
}

// The text of the NPC's most recent (non-typing) reply in this chat.
function lastNpcText(store){
  for (let i = (store||[]).length - 1; i >= 0; i--){
    if (store[i].from === 'them' && store[i].text !== '...') return store[i].text || '';
  }
  return '';
}

// A template armed by "after" only fires when an NPC reply matches one of its after-outcomes.
// By default it must be the NPC's most recent reply; with afterAnywhere it can be anywhere in the chat.
function armedOutcomeTemplate(person, store){
  const last = lastNpcText(store).toLowerCase();
  const allNpc = (store || []).filter(m => m.from === 'them' && m.text !== '...').map(m => (m.text || '').toLowerCase());
  const armed = (person.templates || []).filter(t => {
    const after = t.after || [];
    if (after.length === 0) return false;
    if (t.afterAnywhere){
      return allNpc.some(n => n !== '' && after.some(a => isPhrase(n, a.toLowerCase())));
    }
    return last !== '' && after.some(a => isPhrase(last, a.toLowerCase()));
  });
  if (armed.length === 0) return null;
  return armed[Math.floor(Math.random() * armed.length)];
}

// Returns the most specific match length for a person against `text`, or null if none.
function personMatchLength(person, text, store){
  const lowerText = text.toLowerCase();
  let best = -1;
  for (const t of person.templates || []){
    for (const v of templateVariants(t)){
      if (isPhrase(lowerText, v)){
        if (v.length > best) best = v.length;
      }
    }
  }
  return best === -1 ? null : best;
}

// Chooses a single matching template for a person, respecting specificity + randomness on ties.
// Outcome-triggered ("after") templates take priority, then ask-matching ones.
function pickTemplateForPerson(person, text, store){
  // 1) templates activated by what the NPC just said
  const armed = armedOutcomeTemplate(person, store);
  if (armed) return armed;

  // 2) templates activated by what the user said
  const lowerText = text.toLowerCase();
  let bestLen = -1;
  let bestTemplates = [];
  for (const t of person.templates || []){
    if ((t.after || []).length > 0) continue; // handled above
    const lens = templateVariants(t).filter(v => isPhrase(lowerText, v)).map(v => v.length);
    if (lens.length === 0) continue;
    const maxLen = Math.max(...lens);
    if (maxLen > bestLen){ bestLen = maxLen; bestTemplates = [t]; }
    else if (maxLen === bestLen){ bestTemplates.push(t); }
  }
  if (bestTemplates.length === 0) return null;
  return bestTemplates[Math.floor(Math.random() * bestTemplates.length)];
}

// Chooses who replies in a group. Mentioning a member's name restricts to them.
function chooseResponder(personIds, text, store){
  const lowerText = text.toLowerCase();
  const participants = state.people.filter(p => personIds.includes(p.id));

  // mention override: only triggers on @Name when @ is required
  const mentionCheck = state.mentionAt ? isAtMention : isPhrase;
  const mentioned = participants.filter(p => p.name && mentionCheck(lowerText, p.name.toLowerCase()));

  const pool = mentioned.length ? mentioned : participants;
  // An armed (outcome-triggered) member is eligible and takes priority over plain ask matches.
  const armedPool = pool.filter(p => armedOutcomeTemplate(p, store));
  if (armedPool.length > 0) return armedPool[Math.floor(Math.random() * armedPool.length)];

  const candidates = pool.filter(p => personMatchLength(p, text) !== null);
  if (candidates.length === 0) return null;

  let bestLen = -1;
  let bestPeople = [];
  for (const p of candidates){
    const len = personMatchLength(p, text);
    if (len > bestLen){ bestLen = len; bestPeople = [p]; }
    else if (len === bestLen){ bestPeople.push(p); }
  }
  if (bestPeople.length === 0) return null;
  return bestPeople[Math.floor(Math.random() * bestPeople.length)];
}

function makeTypingMessage(person){
  return { from:'them', text:'...', time:Date.now(), avatarEmoji: person.emoji, avatarColor: person.color, senderName: person.name };
}

function scheduleReply(store, responder, outcomes){
  const typing = makeTypingMessage(responder);
  store.push(typing);
  saveState();
  appendRowFromTail(store, typing);

  const delay = 800 + Math.random()*1200;
  setTimeout(() => {
    for (let i = store.length -1; i>=0; i--){
      if (store[i].from === 'them' && store[i].text === '...'){
        store.splice(i,1);
        break;
      }
    }
    const chosen = outcomes[Math.floor(Math.random()*outcomes.length)];
    const themMsg = { from:'them', text: chosen, time:Date.now(), avatarEmoji: responder.emoji, avatarColor: responder.color, senderName: responder.name };
    store.push(themMsg);
    saveState();
    rerenderActive();
  }, delay);
}

function rerenderActive(){
  if (activeChatId) renderPersonMessages(activeChatId);
  else if (activeGroupId){
    const g = state.groups.find(x => x.id === activeGroupId);
    if (g) renderGroupMessages(g);
  }
}

function appendRowFromTail(store, msg){
  // after pushing we append just the last element's row
  appendMessageRow(msg, store.length - 1);
  scrollToBottom();
}

function sendMessage(){
  const text = messageInput.value.trim();
  if (!text) return;

  // Determine context: single person or group
  let responder = null;
  let outcomes = null;
  let store = null;

  if (activeChatId){
    const p = state.people.find(x => x.id === activeChatId);
    if (!p) return;
    store = state.chats[activeChatId] = state.chats[activeChatId] || [];
    const template = pickTemplateForPerson(p, text, store);
    if (template && template.outcomes && template.outcomes.length){
      responder = p;
      outcomes = template.outcomes;
    } else if (p.fallbacks && p.fallbacks.length){
      responder = p;
      outcomes = p.fallbacks;
    } else return;
  } else if (activeGroupId){
    const g = state.groups.find(x => x.id === activeGroupId);
    if (!g) return;
    store = g.messages;
    let chooser = chooseResponder(g.personIds, text, store);
    if (!chooser){
      // no template matched — any member with fallbacks may reply
      const participants = state.people.filter(pp => g.personIds.includes(pp.id));
      const fbPeople = participants.filter(pp => (pp.fallbacks || []).length);
      chooser = fbPeople.length ? fbPeople[Math.floor(Math.random()*fbPeople.length)] : null;
    }
    if (!chooser) return;
    const template = pickTemplateForPerson(chooser, text, store);
    if (template && template.outcomes && template.outcomes.length){
      responder = chooser;
      outcomes = template.outcomes;
    } else if (chooser.fallbacks && chooser.fallbacks.length){
      responder = chooser;
      outcomes = chooser.fallbacks;
    } else return;
  } else {
    return;
  }

  const meMsg = { from:'me', text, time:Date.now(), avatarEmoji: state.me.emoji, avatarColor: state.me.color };
  store.push(meMsg);
  appendRowFromTail(store, meMsg);
  messageInput.value = '';
  saveState();

  scheduleReply(store, responder, outcomes);
}

/* init existing chats and groups */
function initChats(){
  state.people.forEach(p => {
    state.chats[p.id] = state.chats[p.id] || [];
  });
  state.groups.forEach(g => {
    g.messages = g.messages || [];
    g.personIds = (g.personIds || []).filter(pid => state.people.some(p => p.id === pid));
  });
  saveState();
}
initChats();

/* initial render */
renderPeople();
renderGroups();