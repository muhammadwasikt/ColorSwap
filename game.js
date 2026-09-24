(() => {
"use strict";
const COLORS=["red","yellow","green","blue","purple","cyan"], LEVEL_COUNT=100, SAVE_KEY="chromatic-shift-save-v3", MAX_MISTAKES=3;
const state={screen:"home",currentLevel:1,board:[],specials:[],blockers:[],selected:null,score:0,moves:0,target:0,cleared:0,successfulMoves:0,minSuccessfulMoves:0,iceBroken:0,chainsBroken:0,specialsCreated:0,combo:0,mistakes:0,busy:false,boosterMode:null,pendingBooster:null,daily:false,dailyDate:null,audioCtx:null,save:loadSave()};
const $=id=>document.getElementById(id);
let gestureStart=null,skipClick=false;
const el={home:$("homeScreen"),map:$("mapScreen"),game:$("gameScreen"),result:$("resultScreen"),back:$("backButton"),play:$("playButton"),daily:$("dailyButton"),levelMap:$("levelMap"),board:$("board"),coin:$("coinCount"),homeLevel:$("homeLevel"),homeStars:$("homeStars"),homeBest:$("homeBest"),mapProgress:$("mapProgress"),level:$("levelNumber"),difficulty:$("difficultyText"),comboMeter:$("comboMeter"),score:$("scoreValue"),objective:$("objectiveText"),objectiveLabel:$("objectiveLabel"),objectiveValue:$("objectiveValue"),bar:$("objectiveBar"),moves:$("movesValue"),mistakes:$("mistakesValue"),ice:$("iceValue"),chain:$("chainValue"),special:$("specialValue"),resultBadge:$("resultBadge"),resultTitle:$("resultTitle"),resultStars:$("resultStars"),resultScore:$("resultScore"),resultCoins:$("resultCoins"),resultBest:$("resultBest"),next:$("nextLevelButton"),replay:$("replayButton"),mapButton:$("mapButton"),toast:$("toast"),tutorial:$("tutorial"),tutorialButton:$("tutorialButton"),shuffle:$("shuffleCount"),hammer:$("hammerCount"),bomb:$("colorBombCount"),boosterModal:$("boosterModal"),boosterTitle:$("boosterModalTitle"),boosterText:$("boosterModalText"),boosterConfirm:$("boosterConfirm"),boosterCancel:$("boosterCancel"),dailyCard:$("dailyCard"),dailyStatus:$("dailyStatus")};
function loadSave(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");if(s&&s.version>=2)return{version:3,unlocked:s.unlocked||1,stars:s.stars||{},best:s.best||{},coins:Number.isFinite(s.coins)?s.coins:50,boosters:{shuffle:s.boosters?.shuffle??2,hammer:s.boosters?.hammer??1,colorbomb:s.boosters?.colorbomb??1},tutorialSeen:!!s.tutorialSeen,dailyCompleted:s.dailyCompleted||{},dailyBest:s.dailyBest||{}}}catch(e){}return{version:3,unlocked:1,stars:{},best:{},coins:50,boosters:{shuffle:2,hammer:1,colorbomb:1},tutorialSeen:false,dailyCompleted:{},dailyBest:{}}}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state.save))}catch(e){}}
function totalStars(){return Object.values(state.save.stars).reduce((a,b)=>a+b,0)}
function completedCount(){return Object.keys(state.save.stars).length}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function toast(msg){el.toast.textContent=msg;el.toast.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.toast.classList.remove("show"),1500)}
function todayKey(){return new Date().toISOString().slice(0,10)}
function dailyLevel(){const d=todayKey().split("-").map(Number);return 100+((d[0]*37+d[1]*17+d[2]*13)%1000)}
function dailyCfg(){const seed=dailyLevel();return{level:seed,size:8,colors:6,moves:24,target:150,minSuccessfulMoves:14,difficulty:"Daily",ice:12,chains:8,specialGoal:3,mode:"daily",seed}}
function config(level){
 const tier=level<=10?0:level<=25?1:level<=45?2:level<=65?3:level<=85?4:5;
 const colors=tier===0?4:tier===1?5:6;
 const moves=[32,30,28,27,25,23][tier];
 const target=100+tier*15+Math.floor(level*1.7);
 const minSuccessfulMoves=Math.min(moves-3,17+Math.floor(level/6));
 const ice=level<6?0:Math.min(20,Math.floor((level-3)/4)+(tier>=2?4:0));
 const chains=level<18?0:Math.min(14,Math.floor((level-15)/7)+(tier>=3?3:0));
 const specialGoal=level<12?0:Math.min(6,1+Math.floor((level-12)/18));
 return{level,size:8,colors,moves,target,minSuccessfulMoves,ice,chains,specialGoal,difficulty:tier===0?"Warm-up":tier===1?"Flow":tier===2?"Tactical":tier===3?"Expert":tier===4?"Master":"Nightmare",mode:"level",seed:(level*2654435761)>>>0};
}
function rng(seed){let t=seed>>>0;return()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296}}
function createsMatch(board,color,size,index){const x=index%size,y=Math.floor(index/size);return(x>=2&&board[index-1]===color&&board[index-2]===color)||(y>=2&&board[index-size]===color&&board[index-size*2]===color)}
function placementIndexes(count,seed,avoid=[]){const r=rng(seed),out=[],used=new Set(avoid);while(out.length<count&&used.size<64){const i=Math.floor(r()*64);if(!used.has(i)){used.add(i);out.push(i)}}return out}
function makeBoard(cfg){const random=rng(cfg.seed),board=[];for(let i=0;i<64;i++){let c,guard=0;do{c=COLORS[Math.floor(random()*cfg.colors)];guard++}while(guard<20&&createsMatch(board,c,8,i));board.push(c)}return board}
function setupBlockers(cfg){const blockers=new Array(64).fill(null),used=[];placementIndexes(cfg.ice,cfg.seed^0x51f15e,[]).forEach(i=>{blockers[i]="ice";used.push(i)});placementIndexes(cfg.chains,cfg.seed^0xa71ce,used).forEach(i=>{blockers[i]="chain"});return blockers}
function adjacent(a,b){return Math.abs((a%8)-(b%8))+Math.abs(Math.floor(a/8)-Math.floor(b/8))===1}
function getGroups(board){
 const groups=[];
 for(let y=0;y<8;y++){let x=0;while(x<8){const color=board[y*8+x];let end=x+1;while(end<8&&board[y*8+end]===color)end++;if(color&&end-x>=3){const cells=[];for(let k=x;k<end;k++)cells.push(y*8+k);groups.push({cells,dir:"h",len:cells.length,color})}x=end}}
 for(let x=0;x<8;x++){let y=0;while(y<8){const color=board[y*8+x];let end=y+1;while(end<8&&board[end*8+x]===color)end++;if(color&&end-y>=3){const cells=[];for(let k=y;k<end;k++)cells.push(k*8+x);groups.push({cells,dir:"v",len:cells.length,color})}y=end}}
 return groups
}
function matchedSet(groups){const s=new Set();groups.forEach(g=>g.cells.forEach(i=>s.add(i)));return [...s]}
function renderBoard(falling=false){
 el.board.innerHTML="";
 state.board.forEach((color,i)=>{const b=document.createElement("button"),sp=state.specials[i],block=state.blockers[i];b.className="tile"+(state.selected===i?" selected":"")+(block?" blocked "+block:"")+(sp?" special "+sp:"")+(falling?" falling":"");b.dataset.color=color;b.setAttribute("aria-label",`Tile ${i+1}, ${color}${sp?" "+sp:""}${block?" "+block:""}`);if(sp==="lineH")b.innerHTML='<span class="special-mark">↔</span>';else if(sp==="lineV")b.innerHTML='<span class="special-mark">↕</span>';else if(sp==="bomb")b.innerHTML='<span class="special-mark">✦</span>';if(block)b.innerHTML+=(block==="ice"?'<span class="blocker-mark">❄</span>':'<span class="blocker-mark chain-mark">⛓</span>');b.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;gestureStart={i,x:e.clientX,y:e.clientY};b.setPointerCapture?.(e.pointerId)});
 b.addEventListener("pointerup",e=>{if(!gestureStart||gestureStart.i!==i)return;const dx=e.clientX-gestureStart.x,dy=e.clientY-gestureStart.y,dist=Math.hypot(dx,dy);if(dist>22){const horizontal=Math.abs(dx)>=Math.abs(dy),step=horizontal?(dx>0?1:-1):(dy>0?8:-8),target=i+step;if(target>=0&&target<64&&adjacent(i,target)){skipClick=true;tileClick(target);setTimeout(()=>skipClick=false,120)}}gestureStart=null});
 b.addEventListener("click",()=>{if(skipClick){skipClick=false;return}tileClick(i)});el.board.appendChild(b)})
}
function playSound(type){
 if(!window.AudioContext&&!window.webkitAudioContext)return;try{const C=window.AudioContext||window.webkitAudioContext,ctx=state.audioCtx||(state.audioCtx=new C());if(ctx.state==="suspended")ctx.resume();const master=ctx.createGain();master.gain.value=.22;master.connect(ctx.destination);const presets={tap:[[420,.055,"sine",0]],swap:[[260,.08,"triangle",0],[390,.07,"sine",.025]],match:[[520,.09,"sine",0],[780,.11,"sine",.035]],combo:[[620,.10,"triangle",0],[930,.12,"sine",.05],[1240,.14,"sine",.10]],special:[[680,.09,"square",0],[1020,.13,"triangle",.06],[1360,.17,"sine",.12]],win:[[523,.14,"sine",0],[659,.16,"sine",.10],[784,.22,"triangle",.22],[1047,.30,"sine",.36]],fail:[[220,.14,"sawtooth",0],[150,.24,"triangle",.08]],booster:[[700,.10,"square",0],[980,.14,"triangle",.07]]};const now=ctx.currentTime;(presets[type]||presets.tap).forEach(([freq,dur,wave,delay])=>{const o=ctx.createOscillator(),g=ctx.createGain(),t=now+delay;o.type=wave;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*1.35,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.85,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.03)});if(navigator.vibrate)navigator.vibrate(type==="match"?10:type==="combo"?[10,20,15]:type==="special"?[12,20,18]:type==="win"?[15,35,25]:type==="fail"?35:6)}catch(e){}
}
function blockerStats(){el.ice.textContent=state.iceBroken;el.chain.textContent=state.chainsBroken;el.special.textContent=state.specialsCreated}
function objectiveComplete(cfg){return state.cleared>=cfg.target&&state.successfulMoves>=cfg.minSuccessfulMoves&&state.iceBroken>=cfg.ice&&state.chainsBroken>=cfg.chains&&state.specialsCreated>=cfg.specialGoal}
function updateGame(){
 const cfg=state.daily?dailyCfg():config(state.currentLevel),targetDone=state.cleared>=cfg.target;
 const progress=Math.min(1,(state.cleared/cfg.target)*.62+(state.iceBroken/Math.max(1,cfg.ice))*.15+(state.chainsBroken/Math.max(1,cfg.chains))*.13+(state.specialsCreated/Math.max(1,cfg.specialGoal))*.10);
 el.level.textContent=state.daily?"★":state.currentLevel;el.difficulty.textContent=cfg.difficulty;if(el.comboMeter){el.comboMeter.innerHTML=`COMBO ×<b>${Math.max(1,state.combo)}</b>`;el.comboMeter.classList.toggle("hot",state.combo>=2)}el.objective.textContent=objectiveComplete(cfg)?"ALL OBJECTIVES COMPLETE":`Clear ${cfg.target} tiles • ${cfg.minSuccessfulMoves} good swaps`;el.objectiveLabel.textContent=targetDone?"BONUS GOALS":"TARGET";el.objectiveValue.textContent=targetDone?`${Math.min(state.successfulMoves,cfg.minSuccessfulMoves)}/${cfg.minSuccessfulMoves}`:`${Math.min(state.cleared,cfg.target)}/${cfg.target}`;el.bar.style.width=(Math.min(1,progress)*100)+"%";el.score.textContent=state.score.toLocaleString();el.moves.textContent=state.moves;el.mistakes.textContent=`${state.mistakes} / ${MAX_MISTAKES}`;el.coin.textContent=state.save.coins;el.shuffle.textContent=state.save.boosters.shuffle;el.hammer.textContent=state.save.boosters.hammer;el.bomb.textContent=state.save.boosters.colorbomb;blockerStats()
}
function startLevel(level,daily=false){
 if(!daily&&(level<1||level>LEVEL_COUNT||level>state.save.unlocked))return;const cfg=daily?dailyCfg():config(level);state.currentLevel=level;state.daily=daily;state.dailyDate=daily?todayKey():null;state.board=makeBoard(cfg);state.specials=new Array(64).fill(null);state.blockers=setupBlockers(cfg);state.selected=null;state.score=0;state.moves=cfg.moves;state.target=cfg.target;state.cleared=0;state.successfulMoves=0;state.minSuccessfulMoves=cfg.minSuccessfulMoves;state.iceBroken=0;state.chainsBroken=0;state.specialsCreated=0;state.combo=0;state.mistakes=0;state.busy=false;state.boosterMode=null;showScreen("game");updateGame();renderBoard()
}
function damageBlocker(i){if(state.blockers[i]==="ice"){state.blockers[i]=null;state.iceBroken++;return true}if(state.blockers[i]==="chain"){state.blockers[i]=null;state.chainsBroken++;return true}return false}
function specialBlast(index,queue){
 const sp=state.specials[index];if(!sp)return;
 if(sp==="lineH")for(let x=0;x<8;x++)queue.add(Math.floor(index/8)*8+x);
 else if(sp==="lineV")for(let y=0;y<8;y++)queue.add(y*8+(index%8));
 else if(sp==="bomb"){const color=state.board[index];for(let i=0;i<64;i++)if(state.board[i]===color)queue.add(i)}
}
function specialCombo(a,b,queue){
 const sa=state.specials[a],sb=state.specials[b];if(!sa||!sb)return false;
 if(sa==="bomb"&&sb==="bomb"){for(let i=0;i<64;i++)queue.add(i);return true}
 if(sa==="bomb"||sb==="bomb"){const idx=sa==="bomb"?b:a;for(let y=Math.max(0,Math.floor(idx/8)-1);y<=Math.min(7,Math.floor(idx/8)+1);y++)for(let x=0;x<8;x++)queue.add(y*8+x);for(let x=Math.max(0,idx%8-1);x<=Math.min(7,idx%8+1);x++)for(let y=0;y<8;y++)queue.add(y*8+x);return true}
 specialBlast(a,queue);specialBlast(b,queue);return true
}
async function animateSwap(a,b){
 const first=el.board.children[a],second=el.board.children[b];if(!first||!second)return;
 const dx=b%8-a%8,dy=Math.floor(b/8)-Math.floor(a/8);
 first.style.setProperty("--sx",dx);first.style.setProperty("--sy",dy);
 second.style.setProperty("--sx",-dx);second.style.setProperty("--sy",-dy);
 first.classList.add("swapping");second.classList.add("swapping");await wait(175);
}
function chooseSpecial(groups,anchor){
 let chosen=null;
 for(const g of groups){
  if(g.len>=5){chosen={index:g.cells.includes(anchor)?anchor:g.cells[Math.floor(g.cells.length/2)],type:"bomb"};break}
  if(g.len===4&&!chosen)chosen={index:g.cells.includes(anchor)?anchor:g.cells[Math.floor(g.cells.length/2)],type:g.dir==="h"?"lineH":"lineV"}
 }
 return chosen
}
function spawnBurst(index){
 const node=el.board.children[index];if(!node)return;
 const boardRect=el.board.getBoundingClientRect(),rect=node.getBoundingClientRect(),host=el.board.parentElement;
 const baseX=rect.left-boardRect.left+rect.width/2,baseY=rect.top-boardRect.top+rect.height/2;
 for(let n=0;n<4;n++){
  const p=document.createElement("i");p.className="fx-particle";p.dataset.color=state.board[index]||"purple";p.style.left=baseX+"px";p.style.top=baseY+"px";
  const angle=(Math.PI*2*n/4)+Math.random()*.5,speed=18+Math.random()*28;p.style.setProperty("--px",Math.cos(angle)*speed+"px");p.style.setProperty("--py",Math.sin(angle)*speed+"px");host.appendChild(p);setTimeout(()=>p.remove(),650)
 }
}
async function resolve(initialGroups,anchor=null){
 let groups=initialGroups;
 while(groups.length){
  state.combo++;playSound(state.combo>=2?"combo":"match");
  const matched=matchedSet(groups),special=chooseSpecial(groups,anchor),queue=new Set(matched);
  if(special){queue.delete(special.index);state.specials[special.index]=special.type;state.specialsCreated++;playSound("special")}
  const pending=[...queue],expanded=new Set(queue);
  for(let p=0;p<pending.length;p++){const idx=pending[p];if(state.specials[idx]){const before=expanded.size;specialBlast(idx,expanded);if(expanded.size>before)expanded.forEach(v=>{if(!pending.includes(v))pending.push(v)})}}
  expanded.forEach(i=>{if(el.board.children[i]){spawnBurst(i);el.board.children[i].classList.add("clearing")}});
  el.board.classList.remove("blast");void el.board.offsetWidth;el.board.classList.add("blast");
  await wait(310);
  expanded.forEach(i=>{if(state.board[i]){state.cleared++;state.score+=100*state.combo;state.board[i]=null;if(state.specials[i])state.specials[i]=null;damageBlocker(i)}});
  gravity();renderBoard(true);updateGame();await wait(360);groups=getGroups(state.board);anchor=null
 }
 if(state.combo>=4)toast("UNSTOPPABLE!");else if(state.combo===3)toast("SUPER COMBO!");else if(state.combo===2)toast("COMBO!")
}
function gravity(){
 const cfg=state.daily?dailyCfg():config(state.currentLevel),random=rng((Date.now()^state.score^cfg.seed)>>>0);
 for(let x=0;x<8;x++){
  const cells=[];
  for(let y=7;y>=0;y--){const i=y*8+x;if(state.board[i])cells.push({color:state.board[i],special:state.specials[i]})}
  while(cells.length<8)cells.push({color:COLORS[Math.floor(random()*cfg.colors)],special:null});
  for(let y=7;y>=0;y--){const i=y*8+x,v=cells[7-y];state.board[i]=v.color;state.specials[i]=v.special||null}
 }
}
async async function tileClick(i){
 if(state.busy)return;if(state.boosterMode){useBoosterOnTile(i);return}
 if(state.blockers[i]==="chain"){toast("Break the chain first.");playSound("fail");return}
 if(state.selected===null){state.selected=i;playSound("tap");renderBoard();return}
 if(i===state.selected){state.selected=null;renderBoard();return}
 if(!adjacent(state.selected,i)){state.selected=i;renderBoard();return}
 const a=state.selected,b=i;if(state.blockers[a]==="chain"||state.blockers[b]==="chain"){state.selected=null;renderBoard();toast("Chained gems cannot move.");return}
 state.selected=null;state.combo=0;state.busy=true;playSound("swap");await animateSwap(a,b);[state.board[a],state.board[b]]=[state.board[b],state.board[a]];[state.specials[a],state.specials[b]]=[state.specials[b],state.specials[a]];renderBoard();await wait(40);
 let groups=getGroups(state.board);
 const specialSwap=state.specials[a]&&state.specials[b];
 if(specialSwap){const queue=new Set();specialCombo(a,b,queue);groups=[{cells:[...queue],dir:"h",len:Math.max(5,queue.size),color:state.board[a]}]}
 if(!groups.length){[state.board[a],state.board[b]]=[state.board[b],state.board[a]];[state.specials[a],state.specials[b]]=[state.specials[b],state.specials[a]];state.mistakes++;renderBoard();updateGame();playSound("fail");if(state.mistakes>=MAX_MISTAKES){state.busy=false;finish(false);return}state.busy=false;toast(`Wrong swap! ${MAX_MISTAKES-state.mistakes} left.`);return}
 state.moves--;state.successfulMoves++;await resolve(groups,b);state.busy=false;updateGame();const cfg=state.daily?dailyCfg():config(state.currentLevel);if(objectiveComplete(cfg))finish(true);else if(state.moves<=0)finish(false)
}
function finish(won){
 if(state.busy)return;playSound(won?"win":"fail");state.busy=true;const cfg=state.daily?dailyCfg():config(state.currentLevel),stars=won?(state.moves>=Math.ceil(cfg.moves*.45)?3:state.moves>=Math.ceil(cfg.moves*.22)?2:1):0,best=Math.max(state.daily?(state.save.dailyBest[state.dailyDate]||0):(state.save.best[state.currentLevel]||0),state.score),reward=won?25+stars*15+Math.min(50,state.combo*4)+(state.daily?25:0):0;
 if(won){if(state.daily){state.save.dailyCompleted[state.dailyDate]=true;state.save.dailyBest[state.dailyDate]=best}else{state.save.stars[state.currentLevel]=Math.max(state.save.stars[state.currentLevel]||0,stars);state.save.best[state.currentLevel]=best;state.save.unlocked=Math.max(state.save.unlocked,Math.min(LEVEL_COUNT,state.currentLevel+1))}state.save.coins+=reward;if(stars===3)state.save.boosters.shuffle=Math.min(5,state.save.boosters.shuffle+1);save()}
 setTimeout(()=>{state.busy=false;showResult(won,stars,best,reward)},300)
}
function showResult(won,stars,best,reward){
 showScreen("result");el.resultBadge.textContent=state.daily?(won?"DAILY CHALLENGE COMPLETE":"DAILY CHALLENGE FAILED"):(won?"LEVEL COMPLETE":"LEVEL FAILED");el.resultTitle.textContent=state.daily?(won?"Daily champion.":"Come back tomorrow."):(won?(stars===3?"Perfect shift.":stars===2?"Great work.":"Level cleared."):"One more shift.");el.resultStars.className="stars"+(stars===3?" three":stars===2?" two":"");el.resultStars.textContent=won?"★".repeat(stars)+"☆".repeat(3-stars):"☆☆☆";el.resultScore.textContent=state.score.toLocaleString();el.resultCoins.textContent="+"+reward;el.resultBest.textContent=best.toLocaleString();el.next.textContent=state.daily?"BACK TO MAP →":(won&&state.currentLevel<LEVEL_COUNT?"NEXT LEVEL →":"BACK TO MAP →");el.next.disabled=false;el.next.style.opacity="1";el.coin.textContent=state.save.coins
}
function showScreen(screen){
 state.screen=screen;[el.home,el.map,el.game,el.result].forEach(x=>x.classList.add("hidden"));({home:el.home,map:el.map,game:el.game,result:el.result})[screen].classList.remove("hidden");el.back.classList.toggle("hidden",screen==="home"||screen==="map");el.coin.textContent=state.save.coins;
 if(screen==="home"){el.homeLevel.textContent=state.save.unlocked;el.homeStars.textContent=totalStars();el.homeBest.textContent=Math.max(0,...Object.values(state.save.best),0).toLocaleString();const done=!!state.save.dailyCompleted[todayKey()];el.dailyStatus.textContent=done?"COMPLETED TODAY":"NEW CHALLENGE";el.dailyCard.classList.toggle("completed",done)}
}
function showMap(){
 showScreen("map");el.levelMap.innerHTML="";
 for(let i=1;i<=LEVEL_COUNT;i++){const unlocked=i<=state.save.unlocked,stars=state.save.stars[i]||0,b=document.createElement("button");b.className="level-node"+(stars?" completed":"")+(i===state.save.unlocked?" current":"")+(unlocked?"":" locked");b.disabled=!unlocked;b.innerHTML=unlocked?`<span class="num">${i}</span>${stars?`<span class="stars">${"★".repeat(stars)+"☆".repeat(3-stars)}</span>`:'<span class="not-played">NOT PLAYED</span>'}<span class="difficulty">${config(i).difficulty}</span>`:'<span class="lock">🔒</span><span class="num">'+i+"</span>";b.addEventListener("click",()=>startLevel(i));el.levelMap.appendChild(b)}
 el.mapProgress.textContent=completedCount()+" / "+LEVEL_COUNT
}
function askBooster(type){
 if(state.save.boosters[type]<=0){toast("No boosters left.");return}
 state.pendingBooster=type;const copy={shuffle:["Shuffle","Rearrange the board without spending a move."],hammer:["Hammer","Remove one tile and weaken any blocker on it."],colorbomb:["Color Bomb","Choose a gem and clear every gem of its color."]}[type];el.boosterTitle.textContent=copy[0];el.boosterText.textContent=copy[1];el.boosterModal.classList.remove("hidden")
}
function useBooster(type){
 if(!type||state.busy||state.save.boosters[type]<=0)return;state.save.boosters[type]--;save();state.pendingBooster=null;el.boosterModal.classList.add("hidden");
 if(type==="shuffle"){let next,tries=0;do{next=state.board.slice().sort(()=>Math.random()-.5);tries++}while(getGroups(next).length&&tries<30);state.board=next;toast("Board shuffled.")}else{state.boosterMode=type;toast(type==="hammer"?"Tap a gem to hammer it.":"Tap a gem to choose its color.")}
 updateGame();playSound("booster")
}
function useBoosterOnTile(index){
 const type=state.boosterMode;if(!type)return;
 if(type==="hammer"){const cfg=state.daily?dailyCfg():config(state.currentLevel);state.board[index]=COLORS[Math.floor(Math.random()*cfg.colors)];if(state.blockers[index])damageBlocker(index);state.boosterMode=null;renderBoard();playSound("booster");toast("Hammer smash!")}
 else{const color=state.board[index],removed=state.board.filter(c=>c===color).length;for(let i=0;i<64;i++)if(state.board[i]===color){state.board[i]=null;state.specials[i]=null;damageBlocker(i)}gravity();state.cleared+=removed;state.score+=removed*100;state.boosterMode=null;renderBoard(true);updateGame();playSound("booster");toast(`${removed} ${color} gems cleared.`);const cfg=state.daily?dailyCfg():config(state.currentLevel);if(objectiveComplete(cfg))finish(true)}
}
function handlePlay(){
 if(state.busy)return;
 state.busy=true;
 try{showMap()}finally{state.busy=false}
}
el.play.addEventListener("click",handlePlay);
el.play.addEventListener("pointerup",e=>{if(e.pointerType!=="mouse"){e.preventDefault();handlePlay()}});
el.play.addEventListener("touchend",e=>{e.preventDefault();handlePlay()});el.back.addEventListener("click",()=>state.screen==="game"||state.screen==="result"?showMap():showScreen("home"));el.mapButton.addEventListener("click",showMap);el.replay.addEventListener("click",()=>startLevel(state.currentLevel,state.daily));el.next.addEventListener("click",()=>state.daily?showMap():(state.currentLevel<LEVEL_COUNT&&state.save.unlocked>state.currentLevel?startLevel(state.currentLevel+1):showMap()));el.daily.addEventListener("click",()=>{if(state.save.dailyCompleted[todayKey()]){toast("Daily challenge completed. Come back tomorrow.");return}startLevel(dailyLevel(),true)});el.tutorialButton.addEventListener("click",()=>{state.save.tutorialSeen=true;save();el.tutorial.classList.add("hidden")});el.boosterCancel.addEventListener("click",()=>{state.pendingBooster=null;el.boosterModal.classList.add("hidden")});el.boosterConfirm.addEventListener("click",()=>useBooster(state.pendingBooster));document.querySelectorAll(".booster").forEach(b=>b.addEventListener("click",()=>askBooster(b.dataset.booster)));if(!state.save.tutorialSeen)el.tutorial.classList.remove("hidden");showScreen("home");
})();