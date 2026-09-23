(() => {
"use strict";
const COLORS=["red","yellow","green","blue","purple","cyan"], LEVEL_COUNT=100, SAVE_KEY="chromatic-shift-save-v2", MAX_MISTAKES=3;
const state={screen:"home",currentLevel:1,board:[],selected:null,score:0,moves:0,target:0,cleared:0,combo:0,mistakes:0,busy:false,boosterMode:null,pendingBooster:null,save:loadSave()};
const $=id=>document.getElementById(id);
const el={home:$("homeScreen"),map:$("mapScreen"),game:$("gameScreen"),result:$("resultScreen"),back:$("backButton"),play:$("playButton"),levelMap:$("levelMap"),board:$("board"),coin:$("coinCount"),homeLevel:$("homeLevel"),homeStars:$("homeStars"),homeBest:$("homeBest"),mapProgress:$("mapProgress"),level:$("levelNumber"),objective:$("objectiveText"),score:$("scoreValue"),objectiveLabel:$("objectiveLabel"),objectiveValue:$("objectiveValue"),bar:$("objectiveBar"),moves:$("movesValue"),resultBadge:$("resultBadge"),resultTitle:$("resultTitle"),resultStars:$("resultStars"),resultScore:$("resultScore"),resultCoins:$("resultCoins"),resultBest:$("resultBest"),next:$("nextLevelButton"),replay:$("replayButton"),mapButton:$("mapButton"),toast:$("toast"),tutorial:$("tutorial"),tutorialButton:$("tutorialButton"),shuffle:$("shuffleCount"),hammer:$("hammerCount"),bomb:$("colorBombCount"),boosterModal:$("boosterModal"),boosterTitle:$("boosterModalTitle"),boosterText:$("boosterModalText"),boosterConfirm:$("boosterConfirm"),boosterCancel:$("boosterCancel")};

function loadSave(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");if(s&&s.version===2)return s}catch(e){}return{version:2,unlocked:1,stars:{},best:{},coins:50,boosters:{shuffle:2,hammer:1,colorbomb:1},tutorialSeen:false};}
function save(){localStorage.setItem(SAVE_KEY,JSON.stringify(state.save));}
function totalStars(){return Object.values(state.save.stars).reduce((a,b)=>a+b,0);}
function completedCount(){return Object.keys(state.save.stars).length;}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function toast(msg){el.toast.textContent=msg;el.toast.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.toast.classList.remove("show"),1500);}

function config(level){
 const colors=level<=15?4:level<=40?5:6;
 const moves=Math.max(22,34-Math.floor((level-1)/12)*2);
 const target=46+Math.floor(level*1.55);
 return{level,size:8,colors,moves,target,difficulty:level<=10?"Warm-up":level<=30?"Flow":level<=60?"Focus":level<=85?"Expert":"Master"};
}
function rng(seed){let t=seed>>>0;return()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
function createsMatch(board,color,size,index){const x=index%size,y=Math.floor(index/size);return(x>=2&&board[index-1]===color&&board[index-2]===color)||(y>=2&&board[index-size]===color&&board[index-size*2]===color);}
function makeBoard(cfg){
 const random=rng((0x9e3779b9^(cfg.level*2654435761))>>>0),board=[];
 for(let i=0;i<64;i++){let c,guard=0;do{c=COLORS[Math.floor(random()*cfg.colors)];guard++;}while(guard<20&&createsMatch(board,c,8,i));board.push(c);}
 return board;
}
function adjacent(a,b){return Math.abs((a%8)-(b%8))+Math.abs(Math.floor(a/8)-Math.floor(b/8))===1;}
function matches(board){
 const out=new Set();
 for(let y=0;y<8;y++){let start=0;for(let x=1;x<=8;x++){const same=x<8&&board[y*8+x]===board[y*8+x-1];if(same)continue;if(x-start>=3)for(let k=start;k<x;k++)out.add(y*8+k);start=x;}}
 for(let x=0;x<8;x++){let start=0;for(let y=1;y<=8;y++){const same=y<8&&board[y*8+x]===board[(y-1)*8+x];if(same)continue;if(y-start>=3)for(let k=start;k<y;k++)out.add(k*8+x);start=y;}}
 return Array.from(out);
}
function renderBoard(){
 el.board.innerHTML="";
 state.board.forEach((color,i)=>{const b=document.createElement("button");b.className="tile"+(state.selected===i?" selected":"");b.dataset.color=color;b.setAttribute("aria-label","Tile "+(i+1)+", "+color);b.addEventListener("click",()=>tileClick(i));el.board.appendChild(b);});
}
function playSound(type){
 if(!window.AudioContext&&!window.webkitAudioContext)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext,ctx=state.audioCtx||(state.audioCtx=new C());
  if(ctx.state==="suspended")ctx.resume();
  const o=ctx.createOscillator(),g=ctx.createGain(),now=ctx.currentTime;
  const sets={tap:[420,.045,"sine"],swap:[250,.07,"triangle"],match:[620,.11,"sine"],combo:[880,.16,"triangle"],win:[523,.13,"sine"],fail:[180,.18,"sawtooth"],booster:[720,.12,"square"]};
  const s=sets[type]||sets.tap;o.type=s[2];o.frequency.setValueAtTime(s[0],now);o.frequency.exponentialRampToValueAtTime(s[0]*1.25,now+s[1]);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.055,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+s[1]);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+s[1]+.02);
 }catch(e){}
}
async function tileClick(i){
 if(state.busy)return;
 if(state.boosterMode){useBoosterOnTile(i);return;}
 if(state.selected===null){state.selected=i;playSound("tap");renderBoard();return;}
 if(i===state.selected){state.selected=null;renderBoard();return;}
 if(!adjacent(state.selected,i)){state.selected=i;renderBoard();return;}
 const a=state.selected,b=i;state.selected=null;state.busy=true;playSound("swap");[state.board[a],state.board[b]]=[state.board[b],state.board[a]];renderBoard();await wait(90);
 let found=matches(state.board);
 if(!found.length){
 [state.board[a],state.board[b]]=[state.board[b],state.board[a]];
 state.mistakes++;
 renderBoard();updateGame();playSound("fail");
 if(state.mistakes>=MAX_MISTAKES){state.busy=false;toast("Too many wrong swaps.");finish(false);return;}
 state.busy=false;toast("Wrong swap! "+(MAX_MISTAKES-state.mistakes)+" left.");
 return;
}
 state.moves--;state.combo=0;await resolve(found);state.busy=false;updateGame();
 if(state.cleared>=state.target)finish(true);else if(state.moves<=0)finish(false);
}
async function resolve(found){
 while(found.length){
  state.combo++;
  playSound(state.combo>=2?"combo":"match");
  state.cleared+=found.length;
  state.score+=found.length*100*state.combo;
  found.forEach(i=>{if(el.board.children[i])el.board.children[i].classList.add("clearing");});
  await wait(210);
  const remove=new Set(found),next=new Array(64),count=config(state.currentLevel).colors;
  for(let x=0;x<8;x++){
   const col=[];
   for(let y=7;y>=0;y--){const i=y*8+x;if(!remove.has(i))col.push(state.board[i]);}
   while(col.length<8)col.push(COLORS[Math.floor(Math.random()*count)]);
   for(let y=7;y>=0;y--)next[y*8+x]=col[7-y];
  }
  state.board=next;renderBoard();updateGame();await wait(110);found=matches(state.board);
 }
 if(state.combo>=4)toast("UNSTOPPABLE!");else if(state.combo===3)toast("SUPER COMBO!");else if(state.combo===2)toast("COMBO!");
}
function updateGame(){
 const cfg=config(state.currentLevel),ratio=Math.min(1,state.cleared/state.target);
 el.level.textContent=state.currentLevel;el.objective.textContent="Clear "+state.target+" tiles";el.objectiveLabel.textContent="TARGET";el.objectiveValue.textContent=Math.min(state.cleared,state.target)+" / "+state.target;el.bar.style.width=(ratio*100)+"%";el.score.textContent=state.score.toLocaleString();el.moves.textContent=state.moves;el.mistakes.textContent=state.mistakes+" / "+MAX_MISTAKES;el.coin.textContent=state.save.coins;el.shuffle.textContent=state.save.boosters.shuffle;el.hammer.textContent=state.save.boosters.hammer;el.bomb.textContent=state.save.boosters.colorbomb;
}
function startLevel(level){
 if(level<1||level>LEVEL_COUNT||level>state.save.unlocked)return;
 const cfg=config(level);state.currentLevel=level;state.board=makeBoard(cfg);state.selected=null;state.score=0;state.moves=cfg.moves;state.target=cfg.target;state.cleared=0;state.combo=0;state.mistakes=0;state.busy=false;state.boosterMode=null;showScreen("game");updateGame();renderBoard();
}
function finish(won){
 if(state.busy)return;
 playSound(won?"win":"fail");state.busy=true;
 const cfg=config(state.currentLevel),stars=won?(state.moves>=Math.ceil(cfg.moves*.35)?3:state.moves>=Math.ceil(cfg.moves*.15)?2:1):0,best=Math.max(state.save.best[state.currentLevel]||0,state.score),reward=won?25+stars*15+Math.min(40,state.combo*3):0;
 if(won){state.save.stars[state.currentLevel]=Math.max(state.save.stars[state.currentLevel]||0,stars);state.save.best[state.currentLevel]=best;state.save.unlocked=Math.max(state.save.unlocked,Math.min(LEVEL_COUNT,state.currentLevel+1));state.save.coins+=reward;if(stars===3)state.save.boosters.shuffle=Math.min(5,state.save.boosters.shuffle+1);save();}
 setTimeout(()=>{state.busy=false;showResult(won,stars,best,reward);},300);
}
function showResult(won,stars,best,reward){
 showScreen("result");el.resultBadge.textContent=won?"LEVEL COMPLETE":"LEVEL FAILED";el.resultTitle.textContent=won?(stars===3?"Perfect shift.":stars===2?"Great work.":"Level cleared."):"One more shift.";el.resultStars.className="stars"+(stars===3?" three":stars===2?" two":"");el.resultStars.textContent=won?("★".repeat(stars)+"☆".repeat(3-stars)):"☆☆☆";el.resultScore.textContent=state.score.toLocaleString();el.resultCoins.textContent="+"+reward;el.resultBest.textContent=best.toLocaleString();el.next.textContent=won&&state.currentLevel<LEVEL_COUNT?"NEXT LEVEL →":"BACK TO MAP →";el.next.disabled=!won;el.next.style.opacity=won?"1":".45";el.coin.textContent=state.save.coins;
}
function showScreen(screen){
 state.screen=screen;[el.home,el.map,el.game,el.result].forEach(x=>x.classList.add("hidden"));
 ({home:el.home,map:el.map,game:el.game,result:el.result})[screen].classList.remove("hidden");
 el.back.classList.toggle("hidden",screen==="home"||screen==="map");el.coin.textContent=state.save.coins;
 if(screen==="home"){el.homeLevel.textContent=state.save.unlocked;el.homeStars.textContent=totalStars();el.homeBest.textContent=Math.max(0,...Object.values(state.save.best),0).toLocaleString();}
}
function showMap(){
 showScreen("map");el.levelMap.innerHTML="";
 for(let i=1;i<=LEVEL_COUNT;i++){const unlocked=i<=state.save.unlocked,stars=state.save.stars[i]||0,b=document.createElement("button");b.className="level-node"+(stars?" completed":"")+(i===state.save.unlocked?" current":"")+(unlocked?"":" locked");b.disabled=!unlocked;b.innerHTML=unlocked?'<span class="num">'+i+'</span>'+(stars?'<span class="stars">'+("★".repeat(stars)+ "☆".repeat(3-stars))+'</span>':'<span class="not-played">NOT PLAYED</span>')+'<span class="difficulty">'+config(i).difficulty+"</span>":'<span class="lock">🔒</span><span class="num">'+i+"</span>";b.addEventListener("click",()=>startLevel(i));el.levelMap.appendChild(b);}
 el.mapProgress.textContent=completedCount()+" / "+LEVEL_COUNT;
}
function askBooster(type){
 if(state.save.boosters[type]<=0){toast("No boosters left.");return;}
 state.pendingBooster=type;const copy={shuffle:["Shuffle","Rearrange the board without spending a move."],hammer:["Hammer","Remove one tile and replace it with a fresh tile."],colorbomb:["Color Bomb","Choose a tile and clear every tile of its color."]}[type];el.boosterTitle.textContent=copy[0];el.boosterText.textContent=copy[1];el.boosterModal.classList.remove("hidden");
}
function useBooster(type){
 if(!type||state.busy||state.save.boosters[type]<=0)return;
 state.save.boosters[type]--;save();state.pendingBooster=null;el.boosterModal.classList.add("hidden");
 if(type==="shuffle"){let next,tries=0;do{next=state.board.slice().sort(()=>Math.random()-.5);tries++;}while(matches(next).length&&tries<30);state.board=next;renderBoard();toast("Board shuffled.");}
 else{state.boosterMode=type;toast(type==="hammer"?"Tap a tile to hammer.":"Tap a tile to choose its color.");}
 updateGame();
}
function useBoosterOnTile(index){
 const type=state.boosterMode;if(!type)return;
 if(type==="hammer"){state.board[index]=COLORS[Math.floor(Math.random()*config(state.currentLevel).colors)];state.boosterMode=null;renderBoard();playSound("booster");toast("Tile removed.");}
 else{const color=state.board[index],removed=state.board.filter(c=>c===color).length;state.board=state.board.map(c=>c===color?null:c);const next=new Array(64),count=config(state.currentLevel).colors;for(let x=0;x<8;x++){const col=[];for(let y=7;y>=0;y--){const v=state.board[y*8+x];if(v)col.push(v);}while(col.length<8)col.push(COLORS[Math.floor(Math.random()*count)]);for(let y=7;y>=0;y--)next[y*8+x]=col[7-y];}state.board=next;state.cleared+=removed;state.score+=removed*100;state.boosterMode=null;renderBoard();updateGame();playSound("booster");toast("Color cleared.");if(state.cleared>=state.target)finish(true);}
}
el.play.addEventListener("click",showMap);el.back.addEventListener("click",showMap);el.mapButton.addEventListener("click",showMap);el.replay.addEventListener("click",()=>startLevel(state.currentLevel));el.next.addEventListener("click",()=>state.currentLevel<LEVEL_COUNT&&state.save.unlocked>state.currentLevel?startLevel(state.currentLevel+1):showMap());
el.tutorialButton.addEventListener("click",()=>{state.save.tutorialSeen=true;save();el.tutorial.classList.add("hidden");});
el.boosterCancel.addEventListener("click",()=>{state.pendingBooster=null;el.boosterModal.classList.add("hidden");});el.boosterConfirm.addEventListener("click",()=>useBooster(state.pendingBooster));
document.querySelectorAll(".booster").forEach(b=>b.addEventListener("click",()=>askBooster(b.dataset.booster)));
if(!state.save.tutorialSeen)el.tutorial.classList.remove("hidden");
showScreen("home");
})();