const KEY = "wordloom-generators-v1";
const kinds = [["sound","Letter / syllable"],["random-group","Random group"],["two-groups","Two chosen groups"],["space","Space"],["caps","Caps"],["parrot-1","Parrot 1"],["parrot-2","Parrot 2"],["inverted-1","Inverted parrot 1"],["inverted-2","Inverted parrot 2"],["coin","Coin flip"],["type-based","Type based"],["repeat-start","Repeat start"],["repeat-end","Repeat end"],["cutout","Cutout"],["cut-prev-1","Cutout previous 1"],["cut-prev-2","Cutout previous 2"],["cut-last-1","Cutout last 1"],["cut-last-2","Cutout last 2"],["cut-start-1","Cutout start 1"],["cut-start-2","Cutout start 2"],["reposition-1","Reposition 1"],["reposition-2","Reposition 2"]];
const $ = s => document.querySelector(s);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
const fresh = () => ({id:uid(),name:"",groups:[],types:[],structures:[],capitalizeFirst:false});
const esc = v => String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const parseValues = v => String(v||"").split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
let saved=[]; try { const data=JSON.parse(localStorage.getItem(KEY)||"[]"); if(Array.isArray(data)) saved=data.filter(x=>x&&x.id&&Array.isArray(x.groups)&&Array.isArray(x.structures)); } catch {}
let current=fresh(), isSaved=false, generated="", generatedType="", toastTimer;
function persist(){localStorage.setItem(KEY,JSON.stringify(saved));}
function toast(text){const el=$("#toast");el.textContent=text;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1800);}
function render(){
  $("#generator-name").value=current.name;$("#crumb-name").textContent=current.name||"Untitled";$("#generator-count").textContent=saved.length;$("#capitalize-first").checked=current.capitalizeFirst===true;
  $("#save-generator").innerHTML=(isSaved?"Save changes":"Finish generator")+' <span aria-hidden="true">↗</span>';
  $("#copy-generator").hidden=!isSaved;$("#delete-generator").hidden=!isSaved;
  renderLibrary();renderGroups();renderTypes();renderStructures();renderTypeSelect();
  $("#generated-word").textContent=generated||"—";$("#generated-word").classList.remove("error-word");$("#generated-meta").textContent=generated?(generatedType?"Generated as "+generatedType:"Just made"):"Ready when you are";
  $("#generate-button").disabled=!current.structures.length;
}
function renderLibrary(){
  const host=$("#generator-list");if(!saved.length){host.innerHTML='<div class="library-empty">Your saved generators<br>will live here.</div>';return;}
  host.innerHTML=saved.map(item=>'<button class="generator-item '+(isSaved&&item.id===current.id?'active':'')+'" data-generator="'+esc(item.id)+'" type="button"><span class="generator-glyph">'+esc((item.name||"w").trim().charAt(0).toLowerCase()||"w")+'</span><span class="generator-label">'+esc(item.name||"Untitled generator")+'</span></button>').join("");
}
function renderGroups(){
  $("#groups-empty").hidden=!!current.groups.length;
  $("#groups").innerHTML=current.groups.map(g=>{const n=parseValues(g.values).length;return '<article class="group-card" data-group="'+esc(g.id)+'"><div class="group-card-head"><input class="group-name" data-field="name" value="'+esc(g.name)+'" placeholder="Group name" aria-label="Group name"><span class="group-count">'+n+' '+(n===1?'SOUND':'SOUNDS')+'</span><button class="icon-button remove-group" type="button" aria-label="Delete group">×</button></div><textarea class="group-values" data-field="values" placeholder="Enter sounds separated by commas or new lines" aria-label="Letters or syllables">'+esc(g.values)+'</textarea></article>';}).join("");
}
function renderTypes(){ $("#type-chips").innerHTML=current.types.map((t,i)=>'<span class="type-chip">'+esc(t)+'<button type="button" data-remove-type="'+i+'" aria-label="Remove '+esc(t)+'">×</button></span>').join(""); }
function renderStructures(){
  $("#structure-count").textContent=current.structures.length+' '+(current.structures.length===1?'STEP':'STEPS');
  const groupOpts=current.groups.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.name||"Untitled group")+'</option>').join("");
  $("#structures").innerHTML=current.structures.map((s,i)=>{
    const kind=s.kind||"sound";let config="";
    if(kind==="sound") config='<select class="structure-config group-select" data-slot="primary" aria-label="Sound group"><option value="">Choose a group</option>'+groupOpts+'</select>';
    else if(kind==="two-groups") config='<div class="two-group-config"><select class="structure-config group-select" data-slot="primary" aria-label="First chosen group"><option value="">First group</option>'+groupOpts+'</select><select class="structure-config group-select" data-slot="secondary" aria-label="Second chosen group"><option value="">Second group</option>'+groupOpts+'</select></div>';
    else if(kind==="type-based") config='<div class="type-config"><span class="condition-note">Previous step applies when:</span>'+(current.types.length?current.types.map((t,j)=>'<label class="type-option"><input type="checkbox" data-type-index="'+j+'" '+((s.types||[]).includes(t)?'checked':'')+'>'+esc(t)+'</label>').join(""):'<span class="empty-hint">Add types above first</span>')+'</div>';
    else {const note=kind==="coin"?"50% chance previous step":kind==="random-group"?"Chooses a group":kind==="space"?"Inserts a space":kind.startsWith("cut-")||kind==="cutout"||kind.startsWith("reposition-")?"Edits the word":"Edits previous sound";config='<span class="config-note">'+note+'</span>';}
    return '<div class="structure-row" data-structure="'+esc(s.id)+'"><span class="step-number">'+String(i+1).padStart(2,"0")+'</span><select class="structure-kind" aria-label="Structure '+(i+1)+'">'+kinds.map(([v,label])=>'<option value="'+v+'" '+(kind===v?'selected':'')+'>'+label+'</option>').join("")+'</select>'+config+'<button class="icon-button remove-structure" type="button" aria-label="Remove structure">×</button></div>';
  }).join("");
  current.structures.filter(s=>s.kind==="sound"||s.kind==="two-groups").forEach(s=>{const row=[...document.querySelectorAll(".structure-row")].find(el=>el.dataset.structure===s.id);if(row)row.querySelectorAll(".group-select").forEach(select=>{select.value=select.dataset.slot==="secondary"?(s.groupId2||""):(s.groupId||"");});});
}
function renderTypeSelect(){ $("#type-select").innerHTML='<option value="all">All types</option>'+current.types.map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join(""); }
function save(){current.name=current.name.trim()||"Untitled generator";const i=saved.findIndex(x=>x.id===current.id);if(i<0)saved.push(JSON.parse(JSON.stringify(current)));else saved[i]=JSON.parse(JSON.stringify(current));isSaved=true;persist();render();toast("Generator saved");}
$("#generator-name").addEventListener("input",e=>{current.name=e.target.value;$("#crumb-name").textContent=current.name||"Untitled";const item=[...document.querySelectorAll(".generator-item")].find(x=>x.dataset.generator===current.id);if(item)item.querySelector(".generator-label").textContent=current.name||"Untitled generator";});
$("#new-generator").addEventListener("click",()=>{current=fresh();isSaved=false;generated="";generatedType="";render();$("#generator-name").focus();});
$("#save-generator").addEventListener("click",save);
$("#capitalize-first").addEventListener("change",e=>{current.capitalizeFirst=e.target.checked;});
$("#copy-generator").addEventListener("click",()=>{const copy=JSON.parse(JSON.stringify(current));copy.id=uid();copy.name=(current.name||"Untitled generator")+" copy";saved.push(copy);persist();current=JSON.parse(JSON.stringify(copy));isSaved=true;generated="";render();toast("Copy created");});
$("#delete-generator").addEventListener("click",()=>{if(!isSaved)return;saved=saved.filter(x=>x.id!==current.id);persist();if(saved.length){current=JSON.parse(JSON.stringify(saved[0]));isSaved=true;}else{current=fresh();isSaved=false;}generated="";generatedType="";render();toast("Generator deleted");});
$("#generator-list").addEventListener("click",e=>{const b=e.target.closest("[data-generator]");if(!b)return;const item=saved.find(x=>x.id===b.dataset.generator);if(item){current=JSON.parse(JSON.stringify(item));isSaved=true;generated="";generatedType="";render();}});
$("#add-group").addEventListener("click",()=>{current.groups.push({id:uid(),name:"Group "+(current.groups.length+1),values:""});renderGroups();renderStructures();});
$("#groups").addEventListener("input",e=>{const card=e.target.closest("[data-group]");if(!card)return;const group=current.groups.find(g=>g.id===card.dataset.group);if(!group)return;group[e.target.dataset.field]=e.target.value;if(e.target.dataset.field==="values"){const n=parseValues(e.target.value).length;card.querySelector(".group-count").textContent=n+" "+(n===1?"SOUND":"SOUNDS");}});
$("#groups").addEventListener("click",e=>{const b=e.target.closest(".remove-group");if(!b)return;const id=b.closest("[data-group]").dataset.group;current.groups=current.groups.filter(g=>g.id!==id);current.structures.forEach(s=>{if(s.groupId===id)s.groupId="";if(s.groupId2===id)s.groupId2="";});renderGroups();renderStructures();});
$("#type-form").addEventListener("submit",e=>{e.preventDefault();const input=$("#type-input"),t=input.value.trim();if(!t||current.types.some(x=>x.toLowerCase()===t.toLowerCase()))return;current.types.push(t);input.value="";renderTypes();renderStructures();renderTypeSelect();});
$("#type-chips").addEventListener("click",e=>{const b=e.target.closest("[data-remove-type]");if(!b)return;const [removed]=current.types.splice(Number(b.dataset.removeType),1);current.structures.forEach(s=>s.types=(s.types||[]).filter(t=>t!==removed));renderTypes();renderStructures();renderTypeSelect();});
$("#add-structure").addEventListener("click",()=>{current.structures.push({id:uid(),kind:"sound",groupId:current.groups[0]?.id||"",groupId2:current.groups[1]?.id||"",types:[]});renderStructures();});
$("#structures").addEventListener("change",e=>{const row=e.target.closest("[data-structure]");if(!row)return;const s=current.structures.find(x=>x.id===row.dataset.structure);if(!s)return;if(e.target.matches(".structure-kind")){s.kind=e.target.value;if(s.kind==="sound"&&!s.groupId)s.groupId=current.groups[0]?.id||"";if(s.kind==="two-groups"){s.groupId||=current.groups[0]?.id||"";s.groupId2||=current.groups[1]?.id||current.groups[0]?.id||"";}renderStructures();}else if(e.target.matches(".group-select")){if(e.target.dataset.slot==="secondary")s.groupId2=e.target.value;else s.groupId=e.target.value;}else if(e.target.matches("[data-type-index]")){const t=current.types[Number(e.target.dataset.typeIndex)];s.types||=[];if(e.target.checked&&!s.types.includes(t))s.types.push(t);if(!e.target.checked)s.types=s.types.filter(x=>x!==t);}});
$("#structures").addEventListener("click",e=>{const b=e.target.closest(".remove-structure");if(!b)return;const id=b.closest("[data-structure]").dataset.structure;current.structures=current.structures.filter(s=>s.id!==id);renderStructures();});
function random(a){return a[Math.floor(Math.random()*a.length)];}
function removeAt(tokens,pos){let offset=0;for(let i=0;i<tokens.length;i++){if(pos<offset+tokens[i].length){const j=pos-offset;tokens[i]=tokens[i].slice(0,j)+tokens[i].slice(j+1);return;}offset+=tokens[i].length;}}
function insertAt(tokens,ch,pos){let offset=0;for(let i=0;i<tokens.length;i++){if(pos<=offset+tokens[i].length){const j=pos-offset;tokens[i]=tokens[i].slice(0,j)+ch+tokens[i].slice(j);return;}offset+=tokens[i].length;}tokens.push(ch);}
function trimToken(tokens,index,fromEnd){if(index<0||!tokens[index])return;tokens[index]=fromEnd?tokens[index].slice(0,-1):tokens[index].slice(1);}
function soundIndex(tokens,fromStart=false){for(let i=fromStart?0:tokens.length-1;fromStart?i<tokens.length:i>=0;i+=fromStart?1:-1)if(tokens[i]&&tokens[i].trim())return i;return -1;}
function generate(){
  const selection=$("#type-select").value,type=selection==="all"?(current.types.length?random(current.types):""):selection,tokens=[],gates=new Map();
  current.structures.forEach((s,i)=>{if(s.kind!=="coin"&&s.kind!=="type-based")return;let target=i-1;while(target>=0&&["coin","type-based"].includes(current.structures[target].kind))target--;if(target>=0){const a=gates.get(target)||[];a.push(s);gates.set(target,a);}});
  const blocked=i=>(gates.get(i)||[]).some(rule=>rule.kind==="coin"?Math.random()>=.5:!type||!(rule.types||[]).includes(type));
  for(let i=0;i<current.structures.length;i++){
    const s=current.structures[i],k=s.kind;if(k==="coin"||k==="type-based"||blocked(i))continue;
    if(k==="sound"||k==="random-group"||k==="two-groups"){
      let sounds=[];
      if(k==="sound"){const group=current.groups.find(g=>g.id===s.groupId);sounds=group?parseValues(group.values):[];}
      else if(k==="random-group"){const available=current.groups.map(g=>parseValues(g.values)).filter(values=>values.length);sounds=available.length?random(available):[];}
      else{const choices=[s.groupId,s.groupId2].map(id=>current.groups.find(g=>g.id===id)).filter(Boolean).map(g=>parseValues(g.values)).filter(values=>values.length);sounds=choices.length?random(choices):[];}
      if(!sounds.length)return{error:"Add a sound to the selected group(s) first."};tokens.push(random(sounds).toLowerCase());
    }else if(k==="space")tokens.push(" ");
    else if(k==="caps"){const at=soundIndex(tokens);if(at>=0)tokens[at]=tokens[at].toUpperCase();}
    else if(k==="parrot-1"){const at=soundIndex(tokens);if(at>=0)tokens.push(tokens[at]);}
    else if(k==="parrot-2"){const word=tokens.join("");if(word)tokens.push(word);}
    else if(k==="inverted-1"){const at=soundIndex(tokens);if(at>=0)tokens.push([...tokens[at]].reverse().join(""));}
    else if(k==="inverted-2"){const word=tokens.join("");if(word)tokens.push([...word].reverse().join(""));}
    else if(k==="repeat-start"){const at=soundIndex(tokens,true);if(at>=0)tokens.push(tokens[at]);}
    else if(k==="repeat-end"){const at=soundIndex(tokens);if(at>=0)tokens.push(tokens[at]);}
    else if(k==="cutout"){const chars=[...tokens.join("")].map((ch,pos)=>({ch,pos})).filter(x=>/[^\s]/.test(x.ch));if(chars.length)removeAt(tokens,random(chars).pos);}
    else if(k==="cut-prev-1"||k==="cut-last-1")trimToken(tokens,soundIndex(tokens),true);
    else if(k==="cut-prev-2"||k==="cut-last-2")trimToken(tokens,soundIndex(tokens),false);
    else if(k==="cut-start-1")trimToken(tokens,soundIndex(tokens,true),true);
    else if(k==="cut-start-2")trimToken(tokens,soundIndex(tokens,true),false);
    else if(k==="reposition-1"||k==="reposition-2"){
      const chars=[...tokens.join("")].map((ch,pos)=>({ch,pos})).filter(x=>/[^\s]/.test(x.ch));if(chars.length){let moving=random(chars);if(k==="reposition-1"){const prev=soundIndex(tokens);if(prev>=0){const local=[...tokens[prev]].map((ch,pos)=>({ch,pos})).filter(x=>/[^\s]/.test(x.ch)).at(-1);if(local)moving={ch:local.ch,pos:tokens.slice(0,prev).join("").length+local.pos};}}removeAt(tokens,moving.pos);insertAt(tokens,moving.ch,Math.floor(Math.random()*(tokens.join("").length+1)));}
    }
  }
  const characters=[...tokens.join("")];
  if(current.capitalizeFirst){const first=characters.findIndex(character=>/[^\s]/.test(character));if(first>=0)characters[first]=characters[first].toUpperCase();}
  return{word:characters.join(""),type};
}
$("#open-manual").addEventListener("click",()=>$("#manual-dialog").showModal());
$("#close-manual").addEventListener("click",()=>$("#manual-dialog").close());
$("#manual-dialog").addEventListener("click",e=>{if(e.target===$("#manual-dialog"))$("#manual-dialog").close();});
$("#generate-button").addEventListener("click",()=>{const result=generate();if(result.error){generated="";$("#generated-word").textContent=result.error;$("#generated-word").classList.add("error-word");$("#generated-meta").textContent="Check your sound groups";return;}generated=result.word;generatedType=result.type;$("#generated-word").classList.remove("error-word");$("#generated-word").textContent=generated||"—";$("#generated-meta").textContent=generated?(generatedType?"Generated as "+generatedType:"Just made"):"No sounds were produced";});
render();