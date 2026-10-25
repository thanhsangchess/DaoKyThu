/* Đảo Kỳ Thủ — Journey UX v2. No new currencies or progress schema.
   First-time stars and full-region bonuses remain deterministic and one-time.
   Reuses the original classroom exercise functions via vqcAdventureNavigator.
*/
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const nav=()=>window.vqcAdventureNavigator;
 const REGION_SCREEN=['vqcAdventurePlay','vqcForestScreen','vqcCanyonScreen','vqcCrystalScreen','vqcVolcanoScreen'];
 const TASK_OVERLAYS=[
  {overlay:'captureOverlay',dialog:'.capture-dialog',region:2,kind:'capture'},
  {overlay:'freeCaptureOverlay',dialog:'.freecapture-dialog',region:2,kind:'freecapture'},
  {overlay:'defenseOverlay',dialog:'.defense-dialog',region:3,kind:null},
  {overlay:'escapeOverlay',dialog:'.escape-dialog',region:4,kind:null}
 ];
 let ready=false,selectedTabs={},lastTaskId='',celebration=null,regionPicker=null,questBar=null;
 const pendingRegionRewards=[],announcedRegions=new Set();let victoryDialog=null,victoryReturnFocus=null;

 const node=(tag,cl,text)=>{
  const el=document.createElement(tag);
  if(cl)el.className=cl;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 const button=(text,fn,cl)=>{
  const el=node('button','vqc-journey-button '+(cl||''),text);
  el.type='button';el.addEventListener('click',fn);return el;
 };
 const details=()=>nav()?.snapshot();
 const isWorld=()=>details()?.active===true;
 const playScreen=region=>$(REGION_SCREEN[region]);
 const activeOverlay=()=>TASK_OVERLAYS.find(o=>$(o.overlay)?.classList.contains('open'))||null;

 function format(n){return new Intl.NumberFormat('vi-VN').format(n);}
 function completion(region){const s=details();return s?.regions?.[region];}
 function nextRegion(region){
  const next=region+1;
  if(next>=5){nav()?.map();sync();return;}
  openRegion(next);
 }
 function openRegion(region){
  if(!isWorld())return;
  hidePicker();
  celebration=null;
  nav()?.go(region);
  if(region===1)selectedTabs[1]='forest';
  sync();
 }
 const MILESTONES=[
  {ratio:.25,icon:'🥉',name:'Khởi đầu'},
  {ratio:.50,icon:'🥈',name:'Tiến bộ'},
  {ratio:.75,icon:'🥇',name:'Vững vàng'},
  {ratio:1,icon:'🏆',name:'Chinh phục'}
 ];
 const reachedMilestone=info=>MILESTONES.find(m=>info&&info.completed===Math.ceil(info.total*m.ratio));
 function milestonePanel(info){
  const grid=node('div','vqc-journey-milestones');
  grid.setAttribute('aria-label','Các mốc tiến độ học tập; không cộng thêm xu ngoài phần thưởng cuối vùng');
  for(const step of MILESTONES){
   const threshold=Math.ceil(info.total*step.ratio);
   const yes=info.completed>=threshold;
   const item=node('div','vqc-journey-milestone'+(yes?' is-earned':''));
   item.append(node('span','vqc-journey-milestone__icon',yes?step.icon:'🔒'));
   const txt=node('span','vqc-journey-milestone__copy');
   txt.append(node('strong','',step.name),node('small','',threshold+'/'+info.total+' bài'+(yes?' · Đã đạt':'')));
   item.append(txt);grid.append(item);
  }
  return grid;
 }
 function rewardText(region){
  if(!region)return 'Chọn một vùng để bắt đầu.';
  if(region.rewarded)return '✅ Đã nhận '+format(region.coins)+' xu, rương và huy hiệu '+region.badge+'.';
  const remaining=region.total-region.completed;
  return 'Hoàn thành '+remaining+' bài nữa để nhận '+format(region.coins)+' xu, rương và huy hiệu '+region.badge+'.';
 }
 function ensureHeader(){
  const world=$('vqcModeWorld'),toolbar=world?.querySelector('.vqc-adventure-toolbar');
  if(!world||!toolbar)return null;
  let header=$('vqcJourneyHeader');
  if(header)return header;
  header=node('section','vqc-journey-header');
  header.id='vqcJourneyHeader';
  const title=node('div','vqc-journey-header__title');
  title.append(node('strong','', '🧭 Hành trình của em'),
   node('span','', 'Chọn vùng, học theo dạng bài và theo dõi thành tích'));
  const actions=node('div','vqc-journey-header__actions');
  actions.append(
   button('🗺️ Bản đồ',()=>{nav()?.map();sync();},'vqc-journey-subtle'),
   button('🏅 Phần thưởng',()=>{document.querySelector('#vqcCoinWalletOpen')?.click();},'vqc-journey-subtle'));
  const heading=node('div','vqc-journey-heading');
  heading.append(title,actions);
  header.append(heading);
  const regions=node('div','vqc-journey-regions');
  regions.id='vqcJourneyRegions';
  regions.setAttribute('aria-label','Chuyển vùng khám phá');
  header.append(regions);
  const reward=node('div','vqc-journey-reward');
  reward.id='vqcJourneyReward';
  reward.setAttribute('aria-live','polite');
  header.append(reward);
  toolbar.insertAdjacentElement('afterend',header);
  return header;
 }
 function renderRegionBar(snapshot){
  const container=$('vqcJourneyRegions');if(!container)return;
  container.replaceChildren();
  for(const info of snapshot.regions){
   const item=button(info.icon+' Vùng '+(info.index+1),()=>openRegion(info.index),'vqc-journey-region'+(snapshot.region===info.index?' is-active':''));
   const sub=node('small','',info.completed+'/'+info.total+' bài');
   item.append(sub);
   item.setAttribute('aria-pressed',String(snapshot.region===info.index));
   item.setAttribute('aria-label','Vùng '+(info.index+1)+' '+info.name+', '+info.completed+'/'+info.total+' bài hoàn thành');
   container.append(item);
  }
 }
 function renderReward(snapshot){
  const host=$('vqcJourneyReward');if(!host)return;
  host.replaceChildren();
  const intro=snapshot.region===-1;
  const selected=intro?null:snapshot.regions[snapshot.region];
  const heading=node('div','vqc-journey-reward__heading');
  heading.append(node('strong','',intro?'🎁 Phần thưởng đang chờ em':
   selected.icon+' '+selected.name+' · '+selected.completed+'/'+selected.total+' bài'));
  heading.append(node('span','',intro?'⭐ '+format(snapshot.stars)+' sao · 🪙 '+format(snapshot.coins)+' xu':
   '⭐ '+selected.stars+'/'+selected.starsMax+' · 🪙 '+format(selected.coins)+' xu'));
  host.append(heading);
  if(selected){
   const track=node('div','vqc-journey-progress');
   track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');
   track.setAttribute('aria-valuemax',String(selected.total));track.setAttribute('aria-valuenow',String(selected.completed));
   const fill=node('span');fill.style.width=Math.min(100,selected.completed/selected.total*100)+'%';
   track.append(fill);host.append(track);
   host.append(milestonePanel(selected));
   const upcoming=MILESTONES.find(step=>selected.completed<Math.ceil(selected.total*step.ratio));
   if(upcoming){
    const remaining=Math.ceil(selected.total*upcoming.ratio)-selected.completed;
    host.append(node('p','vqc-journey-next-milestone',
     '🎯 Mốc kế tiếp: '+upcoming.name+' · hoàn thành thêm '+remaining+' bài.'));
   }else host.append(node('p','vqc-journey-next-milestone',
    '✓ Em đã chinh phục tất cả các mốc học tập của Vùng này.'));
  }
  const footer=node('div','vqc-journey-reward__footer');
  footer.append(node('p','',intro
   ?'⭐ Mỗi bài đúng lần đầu nhận sao. 🏅 Hoàn thành vùng để nhận xu, huy hiệu và rương. Không có phần thưởng ngẫu nhiên.'
   :rewardText(selected)));
  if(selected?.rewarded){
   footer.append(button('🌍 Sang vùng khác →',()=>nextRegion(snapshot.region),'vqc-journey-primary'));
  }else if(!intro){
   footer.append(button('📚 Chọn bài tiếp',()=>nextLesson(),'vqc-journey-primary'));
  }
  host.append(footer);
 }
 function renderCategoryMenus(snapshot){
  const targets=[{region:2,id:'vqcCanyonScreen'},{region:3,id:'vqcCrystalScreen'},{region:4,id:'vqcVolcanoScreen'}];
  for(const {region,id} of targets){
   const screen=$(id),categories=screen?.querySelector('.vqc-canyon-categories');
   if(!categories)continue;
   let tabs=screen.querySelector('.vqc-journey-tabs');
   if(!tabs){
    tabs=node('div','vqc-journey-tabs');
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','Chọn dạng bài trong vùng');
    categories.insertAdjacentElement('beforebegin',tabs);
   }
   const groups=nav()?.groups(region)||[];
   if(!selectedTabs[region])selectedTabs[region]=groups[0]?.kind;
   tabs.replaceChildren();
   groups.forEach((group,i)=>{
    const selected=selectedTabs[region]===group.kind;
    const label=group.icon+' '+group.title+' · '+group.items.filter(t=>t.done).length+'/'+group.items.length;
    const control=button(label,()=>{
     if(activeOverlay()?.region===region)nav()?.menu();
     selectedTabs[region]=group.kind;renderCategoryMenus({...details(),currentTask:null}); // stay in region
     screen.querySelector('.vqc-journey-tabs')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    },'vqc-journey-tab'+(selected?' is-active':''));
    control.setAttribute('role','tab');
    control.setAttribute('aria-selected',String(selected));
    control.setAttribute('aria-controls',group.kind+'-'+region+'-tasks');
    tabs.append(control);
    const article=categories.children[i];
    if(article){
     article.id=group.kind+'-'+region+'-tasks';
     article.hidden=!selected;
    }
   });
  }
 }
 function renderForestSwitcher(snapshot){
  const game=$('vqcForestGame'),mount=$('vqcForestBoardMount');
  if(!game||!mount)return;
  let toolbar=$('vqcJourneyForestSwitch');
  if(!toolbar){
   toolbar=node('div','vqc-journey-forest-switch');
   toolbar.id='vqcJourneyForestSwitch';
   mount.insertAdjacentElement('beforebegin',toolbar);
  }
  const group=nav()?.groups(1)?.[0];
  if(!group)return;
  toolbar.replaceChildren(node('strong','','⭐ Đổi quân ngay trong thử thách'));
  const items=node('div','vqc-journey-forest-switch__items');
  for(const item of group.items){
   const selected=snapshot.region===1&&snapshot.currentTask?.key===item.key;
   const b=button((item.icon||'♟')+' '+item.label+(item.done?' ✓':''),
     ()=>nav()?.task(1,'forest',item.key),
     'vqc-journey-chip'+(selected?' is-active':''));
   b.setAttribute('aria-pressed',String(selected));
   items.append(b);
  }
  toolbar.append(items);
 }
 function renderHarborMenu(snapshot){
  const screen=$('vqcAdventurePlay'),stages=$('vqcAdventureStages');if(!screen||!stages)return;
  let tabs=$('vqcJourneyHarborTabs');
  if(!tabs){
   tabs=node('div','vqc-journey-tabs');
   tabs.id='vqcJourneyHarborTabs';
   stages.insertAdjacentElement('beforebegin',tabs);
  }
  const groups=nav()?.groups(0)||[];
  if(!selectedTabs[0])selectedTabs[0]=groups[0]?.kind;
  tabs.replaceChildren();
  for(const group of groups){
   const selected=selectedTabs[0]===group.kind;
   const b=button(group.icon+' '+group.title+' · '+group.items.filter(t=>t.done).length+'/'+group.items.length,
    ()=>{selectedTabs[0]=group.kind;renderHarborMenu({...details(),currentTask:null});},'vqc-journey-tab'+(selected?' is-active':''));
   b.setAttribute('aria-pressed',String(selected));
   tabs.append(b);
  }
  for(const stage of stages.children){
   const index=Array.prototype.indexOf.call(stages.children,stage);
   stage.hidden=selectedTabs[0]==='basics'?index>=5:index<5;
  }
 }
 function makeOverlayControls(config){
  const overlay=$(config.overlay),dialog=overlay?.querySelector(config.dialog);
  if(!dialog)return;
  let toolbar=dialog.querySelector('.vqc-journey-taskbar');
  if(!toolbar){
   toolbar=node('section','vqc-journey-taskbar');
   toolbar.setAttribute('aria-label','Điều hướng thử thách đảo kỳ thủ');
   const title=node('div','vqc-journey-taskbar__title','🧭 Chuyển bài không cần thoát');
   const fields=node('div','vqc-journey-taskbar__fields');
   const group=document.createElement('select');group.setAttribute('aria-label','Chọn dạng bài');
   const task=document.createElement('select');task.setAttribute('aria-label','Chọn bài tập');
   group.className='vqc-journey-select';task.className='vqc-journey-select';
   const actions=node('div','vqc-journey-taskbar__actions');
   actions.append(
    button('← Bài trước',()=>{celebration=null;nav()?.previous?.();sync();},'vqc-journey-subtle'),
    button('Bài tiếp →',()=>nextLesson(),'vqc-journey-primary'),
    button('📚 Danh sách bài',()=>{celebration=null;nav()?.menu();sync();},'vqc-journey-subtle'),
    button('🗺️ Đổi vùng',showPicker,'vqc-journey-subtle'));
   fields.append(group,task);
   toolbar.append(title,fields,actions);
   const completionBox=node('div','vqc-journey-completion');completionBox.hidden=true;
   toolbar.append(completionBox);
   toolbar._group=group;toolbar._task=task;toolbar._completion=completionBox;
   group.addEventListener('change',()=>{
    const snap=details();
    const grp=nav()?.groups(snap.region)?.find(x=>x.kind===group.value);
    task.replaceChildren();
    for(const item of grp?.items||[]){
     const opt=document.createElement('option');opt.value=item.key;opt.textContent=item.label+(item.done?' ✓':'');opt.disabled=item.locked;task.append(opt);
    }
    if(grp){
     const first=grp.items.find(x=>!x.done&&!x.locked)||grp.items.find(x=>!x.locked);
     if(first){
      task.value=first.key;
      celebration=null;
      // Switching task category jumps to its first unfinished exercise;
      // the learner never needs to close the current dialog.
      nav()?.task(snap.region,grp.kind,first.key);
      sync();
     }
    }
   });
   task.addEventListener('change',()=>{
    const r=details()?.region;
    if(r<0)return;
    celebration=null;
    nav()?.task(r,group.value,task.value);
    sync();
   });
   const top=dialog.querySelector('.mate-top');
   if(top)top.insertAdjacentElement('afterend',toolbar);
   else dialog.prepend(toolbar);
  }
  return toolbar;
 }
 function renderOverlayBars(snapshot){
  for(const config of TASK_OVERLAYS){
   const overlay=$(config.overlay),bar=makeOverlayControls(config);
   if(!overlay||!bar)continue;
   const visible=snapshot.active&&snapshot.region===config.region&&overlay.classList.contains('open');
   bar.hidden=!visible;
   if(!visible)continue;
   const groups=nav()?.groups(config.region)||[];
   const group=bar._group,task=bar._task;
   const current=snapshot.currentTask;
   const selectedGroup=current?.region===snapshot.region?current.group:groups[0]?.kind;
   group.replaceChildren();
   for(const grp of groups){
    const opt=document.createElement('option');opt.value=grp.kind;opt.textContent=grp.icon+' '+grp.title+' ('+grp.items.filter(i=>i.done).length+'/'+grp.items.length+')';group.append(opt);
   }
   group.value=groups.some(g=>g.kind===selectedGroup)?selectedGroup:groups[0]?.kind||'';
   const grp=groups.find(g=>g.kind===group.value);
   task.replaceChildren();
   for(const item of grp?.items||[]){
    const opt=document.createElement('option');opt.value=item.key;opt.disabled=item.locked;opt.textContent=item.label+(item.done?' ✓':'');task.append(opt);
   }
   if(current?.group===group.value)task.value=current.key;
   renderCompletion(bar._completion,snapshot,config.region);
  }
 }
 function renderCompletion(box,snapshot,region){
  const active=celebration&&celebration.region===region&&snapshot.region===region;
  box.hidden=!active;
  if(!active)return;
  box.replaceChildren();
  const info=snapshot.regions[region];
  const milestone=reachedMilestone(info);
  box.append(node('strong','',info.rewarded?'🏆 Đã chinh phục cả vùng!':
   milestone?milestone.icon+' Đạt mốc '+milestone.name+'! · +'+celebration.stars+' sao':
   '⭐ Hoàn thành '+celebration.label+' · +'+celebration.stars+' sao'));
  box.append(node('p','',info.rewarded?
    '🎁 Đã tự động nhận '+format(info.coins)+' xu, rương và huy hiệu '+info.badge+'.':
    'Đã nhận '+celebration.stars+' sao lần đầu. Tiến độ: '+info.completed+'/'+info.total+' bài. Luyện lại không cộng sao lần nữa.'));
  const actions=node('div','vqc-journey-taskbar__actions');
  actions.append(button(info.rewarded?'🌍 Sang vùng khác →':'📚 Bài chưa làm tiếp →',
    ()=>info.rewarded?nextRegion(region):nextLesson(),'vqc-journey-primary'));
  actions.append(button('🗺️ Chọn vùng',showPicker,'vqc-journey-subtle'));
  box.append(actions);
 }
 function nextLesson(){
  celebration=null;
  const moved=nav()?.next();
  if(!moved){
   const s=details();
   if(s?.region>=0&&s.regions[s.region]?.rewarded)showPicker();
  }
  sync();
 }
 function ensureVictoryDialog(){
  if(victoryDialog)return victoryDialog;
  const root=node('div','vqc-journey-victory');
  root.id='vqcJourneyVictory';root.hidden=true;
  const scrim=node('div','vqc-journey-victory__scrim');
  scrim.addEventListener('click',closeVictory);
  const panel=node('section','vqc-journey-victory__panel');
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-labelledby','vqcJourneyVictoryTitle');
  panel.setAttribute('aria-describedby','vqcJourneyVictoryDescription');
  const header=node('div','vqc-journey-victory__header');
  header.append(node('strong','','🏆 HOÀN THÀNH VÙNG'),
   button('✕ Đóng',closeVictory,'vqc-journey-subtle'));
  const visual=node('div','vqc-journey-victory__visual');
  visual.id='vqcJourneyVictoryIcon';visual.setAttribute('aria-hidden','true');
  const title=node('h2','vqc-journey-victory__title');title.id='vqcJourneyVictoryTitle';
  const description=node('p','vqc-journey-victory__description');description.id='vqcJourneyVictoryDescription';
  const prizes=node('div','vqc-journey-victory__prizes');prizes.id='vqcJourneyVictoryPrizes';
  const earned=node('p','vqc-journey-victory__note',
   'Xu, sao và huy hiệu được tính theo kết quả học tập. Mỗi Vùng nhận thưởng đúng một lần, không cần quay thưởng.');
  const actions=node('div','vqc-journey-victory__actions');actions.id='vqcJourneyVictoryActions';
  panel.append(header,visual,title,description,prizes,earned,actions);
  root.append(scrim,panel);document.body.append(root);
  root.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();closeVictory();}
   if(e.key!=='Tab')return;
   const focusable=Array.from(panel.querySelectorAll('button:not([disabled])'));
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  victoryDialog=root;return root;
 }
 function closeVictory(){
  if(!victoryDialog||victoryDialog.hidden)return;
  victoryDialog.hidden=true;
  if(victoryReturnFocus?.isConnected)victoryReturnFocus.focus();
  victoryReturnFocus=null;
  if(pendingRegionRewards.length)Promise.resolve().then(presentRegionReward);
 }
 function presentRegionReward(){
  if(!isWorld()||!pendingRegionRewards.length)return;
  const region=pendingRegionRewards.shift();
  const snap=details(),info=snap?.regions?.[region];
  if(!info||!info.rewarded){if(pendingRegionRewards.length)presentRegionReward();return;}
  const dialog=ensureVictoryDialog();
  victoryReturnFocus=document.activeElement;
  $('vqcJourneyVictoryIcon').textContent=info.icon;
  $('vqcJourneyVictoryTitle').textContent='Chinh phục '+info.name+'!';
  $('vqcJourneyVictoryDescription').textContent='Em đã hoàn thành '+info.completed+'/'+info.total+
   ' bài trong Vùng '+(region+1)+'. Đây là phần thưởng đã đạt được của em.';
  const prizes=$('vqcJourneyVictoryPrizes');prizes.replaceChildren();
  for(const prize of [
   ['🪙','+'+format(info.coins)+' xu','Thưởng hoàn thành vùng'],
   ['🏅',info.badge,'Huy hiệu vĩnh viễn'],
   ['⭐',format(info.stars)+' sao','Thành tích tích lũy tại vùng'],
   ['🎁','Rương vùng '+(region+1),'Đã mở khóa']
  ]){
   const tile=node('div','vqc-journey-victory__prize');
   tile.append(node('span','vqc-journey-victory__prize-icon',prize[0]));
   const txt=node('span','');
   txt.append(node('strong','',prize[1]),node('small','',prize[2]));
   tile.append(txt);prizes.append(tile);
  }
  const actions=$('vqcJourneyVictoryActions');actions.replaceChildren();
  actions.append(button('🏅 Xem huy hiệu',()=>{
   closeVictory();$('vqcBadgeCollectionOpen')?.click();
  },'vqc-journey-subtle'));
  actions.append(button('📚 Ở lại vùng',closeVictory,'vqc-journey-subtle'));
  actions.append(button(region<4?'🧭 Khám phá vùng tiếp →':'🗺️ Về bản đồ',()=>{
   closeVictory();if(region<4)nextRegion(region);else {nav()?.map();sync();}
  },'vqc-journey-primary'));
  dialog.hidden=false;
  actions.querySelector('.vqc-journey-primary')?.focus();
 }
 function regionCompleted(regions){
  if(!Array.isArray(regions)||!isWorld())return;
  for(const region of regions){
   if(!Number.isInteger(region)||region<0||region>=5||announcedRegions.has(region))continue;
   announcedRegions.add(region);
   pendingRegionRewards.push(region);
  }
  if(!victoryDialog||victoryDialog.hidden)presentRegionReward();
 }
 function makePicker(){
  if(regionPicker)return regionPicker;
  const picker=node('div','vqc-journey-picker');
  picker.id='vqcJourneyPicker';picker.hidden=true;
  const scrim=node('div','vqc-journey-picker__scrim');
  scrim.addEventListener('click',hidePicker);
  const panel=node('section','vqc-journey-picker__panel');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Chọn vùng khám phá');
  const header=node('div','vqc-journey-picker__head');
  header.append(node('strong','','🗺️ Khám phá vùng khác'),
   button('✕',hidePicker,'vqc-journey-subtle'));
  const body=node('div','vqc-journey-picker__body');body.id='vqcJourneyPickerList';
  panel.append(header,body);picker.append(scrim,panel);
  document.body.append(picker);
  picker.addEventListener('keydown',e=>{if(e.key==='Escape')hidePicker();});
  regionPicker=picker;
  return picker;
 }
 function showPicker(){
  if(!isWorld())return;
  const picker=makePicker(),list=$('vqcJourneyPickerList'),snapshot=details();
  list.replaceChildren();
  for(const info of snapshot.regions){
   const b=button(info.icon+' Vùng '+(info.index+1)+' · '+info.name+' · '+info.completed+'/'+info.total+' bài'+
    (info.rewarded?' · 🏅 Đã nhận thưởng':' · 🪙 +'+format(info.coins)+' xu khi hoàn thành'),
    ()=>openRegion(info.index),'vqc-journey-picker__region');
   list.append(b);
  }
  picker.hidden=false;picker.querySelector('.vqc-journey-picker__head button')?.focus();
 }
 function hidePicker(){if(regionPicker)regionPicker.hidden=true;}
 function renderForestReward(snapshot){
  const overlay=$('starRewardOverlay'),card=overlay?.querySelector('.reward-card');
  if(!card)return;
  let links=card.querySelector('.vqc-journey-forest-reward');
  if(!links){
   links=node('div','vqc-journey-forest-reward');
   links.append(button('⭐ Bài nhặt sao tiếp →',()=>{
    if(typeof window.closeStarReward==='function')window.closeStarReward();
    else overlay.classList.remove('open');
    nextLesson();
   },'vqc-journey-primary'),button('🗺️ Chọn vùng',()=>{
    if(typeof window.closeStarReward==='function')window.closeStarReward();
    else overlay.classList.remove('open');
    showPicker();
   },'vqc-journey-subtle'));
   card.append(links);
  }
  links.hidden=!(snapshot.region===1&&snapshot.active);
 }
 function sync(){
  if(!ready||!nav())return;
  const snapshot=details();
  const task=snapshot.currentTask;
  const taskId=task?task.region+':'+task.group+':'+task.key:'';
  if(taskId&&taskId!==lastTaskId){
   if(lastTaskId)celebration=null; // A new exercise must not display the previous reward again.
   selectedTabs[task.region]=task.group;lastTaskId=taskId;
  }
  if(!taskId)lastTaskId='';
  const header=ensureHeader();if(!header)return;
  renderRegionBar(snapshot);renderReward(snapshot);
  renderCategoryMenus(snapshot);renderForestSwitcher(snapshot);renderHarborMenu(snapshot);
  renderOverlayBars(snapshot);
  renderForestReward(snapshot);
 }
 function completed(event){
  if(!isWorld()||!event||event.region<0)return;
  celebration={region:event.region,label:event.label||'nhiệm vụ',stars:event.stars||3};
  sync();
 }
 function init(){
  if(ready)return;
  if(!$('vqcModeWorld')||!nav())return;
  ready=true;ensureHeader();
  // Only observe open/closed states of the five regions and four exercise dialogs.
  const observer=new MutationObserver(()=>{
   if(!ready)return;
   if(sync._queued)return;
   sync._queued=true;
   Promise.resolve().then(()=>{sync._queued=false;sync();});
  });
  for(const id of [...REGION_SCREEN,'vqcAdventureMap','vqcModeWorld',...TASK_OVERLAYS.map(x=>x.overlay),'starRewardOverlay']){
   const target=$(id);if(target)observer.observe(target,{attributes:true,attributeFilter:['class','hidden','aria-hidden']});
  }
  sync();
 }
 window.vqcAdventureUX={
  refresh:sync,completed,regionCompleted,showPicker,next:nextLesson,
  taskStarted:()=>{celebration=null;}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
