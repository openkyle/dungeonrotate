import test from "node:test";
import assert from "node:assert/strict";
import {RotationController} from "../scripts/controller.js";
import {ID, defaultState, toWorld} from "../scripts/core.js";
class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
  filter(fn) { return [...this.values()].filter(fn); }
  find(fn) { return [...this.values()].find(fn); }
  some(fn) { return [...this.values()].some(fn); }
  map(fn) { return [...this.values()].map(fn); }
}
function apply(doc, change) {
  for(const [path,value] of Object.entries(change)) {
    if(path === "_id") continue;
    const parts=path.split(".");let obj=doc;
    for(const p of parts.slice(0,-1)) obj=obj[p]??={};
    obj[parts.at(-1)]=structuredClone(value);
  }
}
function document(data) { return {...data, toObject(){const {parent,object,...rest}=this;return JSON.parse(JSON.stringify(rest));}, flags:data.flags??{}, getFlag(ns,k){return this.flags[ns]?.[k];}, async update(change){apply(this,change);return this;}, testUserPermission:u=>u?.isGM||u?.id==="p",canUserModify:u=>u?.isGM}; }
function setup() {
  const state=defaultState();state.slots[0].tileId="t1";state.slots[0].running=true;state.slots[0].speed=10;
  state.slots[1].tileId="t2";state.slots[1].running=true;state.slots[1].direction=-1;state.slots[1].speed=5;
  const scene=document({id:"scene",grid:{size:100},dimensions:{sceneX:0,sceneY:0,sceneWidth:5000,sceneHeight:5000},flags:{[ID]:{state,enabled:true}}});
  scene.tiles=new Collection([['t1',document({id:'t1',x:0,y:0,width:1000,height:1000,rotation:0})],['t2',document({id:'t2',x:1500,y:0,width:1000,height:1000,rotation:270})]]);
  scene.tokens=new Collection();scene.notes=new Collection();scene.lights=new Collection();scene.walls=new Collection();scene.calls=[];
  scene.setFlag=async(ns,key,value)=>{scene.flags[ns]??={};scene.flags[ns][key]=structuredClone(value);};
  scene.updateEmbeddedDocuments=async(type,updates,options)=>{
    scene.calls.push({type,updates:structuredClone(updates),options});
    const docs=scene[{Tile:"tiles",Token:"tokens",Wall:"walls",Note:"notes",AmbientLight:"lights"}[type]];
    for(const u of updates) apply(docs.get(u._id),u);
    return updates.map(u=>docs.get(u._id));
  };
  let counter=0;
  scene.createEmbeddedDocuments=async(type,rows,options)=>rows.map(row=>{const id=row._id??`new-${++counter}`;const doc=document({...structuredClone(row),id,_id:id});scene.walls.set(id,doc);return doc;});
  globalThis.CONST={WALL_MOVEMENT_TYPES:{NORMAL:20,NONE:0},WALL_SENSE_TYPES:{NORMAL:20,NONE:0},WALL_DOOR_TYPES:{NONE:0}};
  scene.deleteEmbeddedDocuments=async(type,ids)=>{for(const id of ids) scene.walls.delete(id);};
  const gm={id:"gm",isGM:true,active:true,viewedScene:"scene"},player={id:"p",isGM:false,active:true,viewedScene:"scene"};
  globalThis.game={user:gm,users:new Collection([[gm.id,gm],[player.id,player]]),paused:false,time:{serverTime:1000}};
  globalThis.canvas={scene,ready:true};
  globalThis.foundry={utils:{deepClone:structuredClone,randomID:()=>"request-1"}};
  globalThis.ui={notifications:{warn:()=>{},error:()=>{}}};
  const c=new RotationController();c.last=800;c.owner=scene.id;
  return {c,scene,state,gm,player};
}
function token(scene,id="token") {
  const t=document({id,parent:scene,x:650,y:450,width:1,height:1,object:{checkCollision:()=>false}});scene.tokens.set(id,t);return t;
}
function note(scene) {
  const n=document({id:"note",parent:scene,x:700,y:500,entryId:"journal",pageId:"page",text:"Room 1"});scene.notes.set(n.id,n);return n;
}
test("two tiles rotate in opposite directions without changing placement",async()=>{
  const {c,scene}=setup();await c.tick();assert.equal(scene.tiles.get("t1").rotation,2);assert.equal(scene.tiles.get("t2").rotation,269);assert.equal(scene.tiles.get("t2").x,1500);
});
test("stationary token rides without accumulating round-trip error",async()=>{
  const {c,scene}=setup(),t=token(scene);await c.tick();
  const p=toWorld([200,0],scene.tiles.get("t1"));assert.ok(Math.abs(t.x+50-p[0])<=.5);assert.equal(t.getFlag(ID,"ride").slotId,"a");
  for(let i=0;i<10;i++){game.time.serverTime+=200;await c.tick();}
  assert.deepEqual(t.getFlag(ID,"ride").local,[200,0]);
});
test("player drag becomes local intent, controller commits and acknowledges",async()=>{
  const {c,scene,player}=setup(),t=token(scene);game.user=player;
  const change={x:700,y:450};c.intercept(t,change,{});assert.equal(change.x,undefined);assert.equal(change.y,undefined);apply(t,change);
  game.user=game.users.get("gm");await c.tick();assert.equal(t.getFlag(ID,"ack"),"request-1");assert.deepEqual(t.getFlag(ID,"ride").local,[250,0]);
});
test("native collision rejects request but continues carrying floor",async()=>{
  const {c,scene}=setup(),t=token(scene);t.object.checkCollision=()=>true;
  const change={x:700};c.intercept(t,change,{});apply(t,change);await c.tick();
  assert.equal(t.getFlag(ID,"rejected"),"request-1");assert.deepEqual(t.getFlag(ID,"ride").local,[200,0]);
});
test("stale movement requests cannot teleport a rider on reconnect",async()=>{
  const {c,scene}=setup(),t=token(scene);t.flags[ID]={request:{id:"stale",slotId:"a",local:[400,0],at:-20000,userId:"p"}};
  await c.tick();assert.equal(t.getFlag(ID,"rejected"),"stale");assert.deepEqual(t.getFlag(ID,"ride").local,[200,0]);
});
test("non-owner requests are rejected by authority",async()=>{
  const {c,scene}=setup(),t=token(scene);game.users.set("other",{id:"other",isGM:false});
  t.flags[ID]={request:{id:"forged",slotId:"a",local:[400,0],at:1000,userId:"other"}};await c.tick();assert.equal(t.getFlag(ID,"rejected"),"forged");
});
test("non-authority clients never update documents",async()=>{
  const {c,scene,player}=setup();game.user=player;await c.tick();assert.equal(scene.calls.length,0);
});
test("global pause freezes tile and riders",async()=>{
  const {c,scene}=setup(),t=token(scene);game.paused=true;await c.tick();assert.equal(scene.tiles.get("t1").rotation,0);assert.equal(t.x,650);
});
test("pause and reverse preserve current angle",async()=>{
  const {c,scene}=setup();await c.tick();await c.control(scene,"a","pause");await c.control(scene,"a","reverse");game.time.serverTime+=200;await c.tick();
  assert.equal(scene.tiles.get("t1").rotation,2);assert.equal(c.state().slots[0].direction,-1);
});
test("journal pins ride while preserving journal and page references",async()=>{
  const {c,scene}=setup(),n=note(scene);await c.tick();assert.ok(n.y>500);assert.equal(n.entryId,"journal");assert.equal(n.pageId,"page");assert.deepEqual(n.getFlag(ID,"ride").local,[200,0]);
});
test("manual journal pin move changes floor-relative anchor",async()=>{
  const {c,scene}=setup(),n=note(scene),change={x:750,y:500};c.interceptNote(n,change,{});assert.equal(change.x,undefined);apply(n,change);await c.tick();assert.deepEqual(n.getFlag(ID,"ride").local,[250,0]);
});
test("token opt-out remains supported while old note flags do not suppress automatic discovery",async()=>{
  const {c,scene}=setup(),t=token(scene),n=note(scene);t.flags[ID]={attachment:"none"};n.flags[ID]={attachment:"none"};await c.tick();assert.equal(t.x,650);assert.equal(n.x,700);assert.ok(n.y>500);
});
test("journal pins carry independently of carry-tokens option",async()=>{
  const {c,scene,state}=setup(),t=token(scene),n=note(scene);state.slots[0].carry=false;await c.tick();assert.equal(t.x,650);assert.ok(n.y>500);
});
test("long disconnect clamps catch-up instead of jumping many rotations",async()=>{
  const {c,scene}=setup();game.time.serverTime=100000;await c.tick();assert.equal(scene.tiles.get("t1").rotation,4);
});
test("missing tile is skipped without moving unrelated documents",async()=>{
  const {c,scene,state}=setup();state.slots[0].tileId="missing";
  await assert.rejects(()=>c.tick(),/missing/);assert.equal(scene.calls.length,0);
});
test("wall cleanup preserves unrelated walls",async()=>{
  const {c,scene,state}=setup();state.slots[0].running=false;
  scene.walls.set("owned",document({id:"owned",flags:{[ID]:{wall:{slotId:"a"}}}}));scene.walls.set("hand",document({id:"hand"}));
  await c.remove(scene,"a");assert.equal(scene.walls.has("owned"),false);assert.equal(scene.walls.has("hand"),true);
});
test("serial controller queue recovers after an operation fails",async()=>{
  const {c}=setup();const order=[];const a=c.serial(async()=>{order.push(1);throw Error("expected");});const b=c.serial(async()=>order.push(2));await assert.rejects(a);await b;assert.deepEqual(order,[1,2]);
});
test("requests arriving during a commit are not overwritten by an old acknowledgement",async()=>{
  const {c,scene}=setup(),t=token(scene);const change={x:700};c.intercept(t,change,{});apply(t,change);
  const original=scene.updateEmbeddedDocuments;
  scene.updateEmbeddedDocuments=async(type,updates,options)=>{
    if(type==="Token") t.flags[ID].request={...t.flags[ID].request,id:"newer",local:[300,0]};
    return original(type,updates,options);
  };
  await c.tick();assert.equal(t.getFlag(ID,"request").id,"newer");assert.equal(t.getFlag(ID,"ack"),"request-1");
});

test("token attachment stays explicit while notes use automatic eligible floor detection",async()=>{
  const {c,scene,state}=setup(),t=token(scene),n=note(scene);
  scene.tiles.get("t2").x=0;state.slots[0].carry=false;state.slots[0].carryNotes=false;
  t.flags[ID]={attachment:"a"};n.flags[ID]={attachment:"a"};await c.tick();assert.equal(t.x,650);assert.equal(n.getFlag(ID,"ride").slotId,"b");
});
test("automatic overlap chooses B, explicit attachment chooses A",()=>{
  const {c,scene}=setup();scene.tiles.get("t2").x=0;
  assert.equal(c.assigned(scene,c.state(),[500,500],{}).id,"b");
  assert.equal(c.assigned(scene,c.state(),[500,500],{attachment:"a"}).id,"a");
});
test("walls update before tokens and journal pins, then tiles commit the shared clock",async()=>{
  const {c,scene}=setup();token(scene);note(scene);
  scene.walls.set("w",document({id:"w",flags:{[ID]:{wall:{slotId:"a",segment:[-.5,0,.5,0]}}}}));
  await c.tick();assert.deepEqual(scene.calls.map(c=>c.type),["Wall","Token","Note","Tile"]);
});
function light(scene) {
  const l=document({id:"light",parent:scene,x:700,y:500,rotation:90,config:{angle:60,bright:20,dim:40,color:"#ff8800",animation:{type:"torch"}},hidden:false,walls:true});
  scene.lights.set(l.id,l);return l;
}
test("ambient lights move and cone direction rotates while appearance stays intact",async()=>{
  const {c,scene}=setup(),l=light(scene),config=structuredClone(l.config);await c.tick();
  assert.ok(l.y>500);assert.equal(l.rotation,92);assert.deepEqual(l.config,config);assert.equal(l.walls,true);assert.equal(l.getFlag(ID,"ride").rotation,90);
});
test("manual light position and rotation update their floor-relative anchors",async()=>{
  const {c,scene}=setup(),l=light(scene),change={x:750,y:500,rotation:180};
  c.interceptLight(l,change,{});assert.equal(change.rotation,undefined);assert.equal(change.x,undefined);apply(l,change);await c.tick();
  assert.deepEqual(l.getFlag(ID,"ride").local,[250,0]);assert.equal(l.rotation,182);
});
test("legacy light opt-out is ignored; slot carry-light toggle stops carrying",async()=>{
  const {c,scene,state}=setup(),l=light(scene);l.flags[ID]={attachment:"none"};await c.tick();assert.ok(l.y>500);assert.equal(l.rotation,92);
  const y=l.y;scene.flags[ID].state.slots[0].carryLights=false;game.time.serverTime+=200;await c.tick();assert.equal(l.y,y);
});
test("light attachment keeps its angular offset on a tile already rotated 270 degrees",async()=>{
  const {c,scene}=setup(),l=light(scene);l.x=2200;l.y=500;l.rotation=30;l.flags[ID]={attachment:"b"};await c.tick();assert.equal(l.rotation,29);
});
test("disabled scene performs no writes and start requires explicit scene enablement",async()=>{
  const {c,scene}=setup();scene.flags[ID].enabled=false;token(scene);note(scene);light(scene);await c.tick();assert.equal(scene.calls.length,0);
  await assert.rejects(()=>c.control(scene,"a","start"),/This scene has Rotating Elements/);
});
test("manual moves while disabled discard old anchors so re-enabling does not snap back",async()=>{
  const {c,scene}=setup(),t=token(scene),n=note(scene),l=light(scene);await c.tick();scene.flags[ID].enabled=false;
  for(const [doc,intercept] of [[t,c.intercept.bind(c)],[n,c.interceptNote.bind(c)],[l,c.interceptLight.bind(c)]]) {
    const change={x:800,y:500};intercept(doc,change,{});apply(doc,change);assert.equal(doc.getFlag(ID,"ride"),null);
  }
  scene.flags[ID].enabled=true;game.time.serverTime+=200;await c.tick();assert.ok(t.x>790);assert.ok(n.x>790);assert.ok(l.x>790);
});
test("clear-riders handles lights without altering their configuration",async()=>{
  const {c,scene}=setup(),l=light(scene);await c.tick();await c.clearRiders(scene,"a");assert.equal(l.getFlag(ID,"ride"),null);assert.equal(l.config.color,"#ff8800");
});

function maskStub(c) {
 c.readFloor=async()=>null;
 c.readMask=async()=>({mask:{w:1,h:1,runs:[[0,1]]},segments:[[-.5,-.5,.5,-.5]]});
}
test("save automatically creates and replaces only managed walls while retaining running state",async()=>{
 const {c,scene}=setup();maskStub(c);scene.walls.set("hand",document({id:"hand",_id:"hand"}));
 let state=c.state();state.slots[0].maskPath="floor.png";await c.configure(scene,state);
 assert.equal(scene.walls.size,2);assert.equal(c.state().slots[0].running,true);
 await c.configure(scene,c.state());assert.equal(scene.walls.size,2);assert.ok(scene.walls.has("hand"));
 state=c.state();state.slots[0].maskPath="";await c.configure(scene,state);assert.equal(scene.walls.size,1);assert.ok(scene.walls.has("hand"));
});
test("invalid second mask leaves both original configurations intact",async()=>{
 const {c,scene}=setup();maskStub(c);let state=c.state();state.slots[0].maskPath="ok.png";await c.configure(scene,state);
 const before=c.state(),ids=[...scene.walls.keys()];state=c.state();state.slots[1].maskPath="broken.png";
 c.readMask=async path=>{if(path==="broken.png")throw Error("Unreadable mask");return {mask:{w:1,h:1,runs:[[0,1]]},segments:[[-.5,-.5,.5,-.5]]};};
 await assert.rejects(()=>c.configure(scene,state),/Unreadable/);assert.deepEqual(c.state(),before);assert.deepEqual([...scene.walls.keys()],ids);
});
test("failed state save removes staged walls and preserves old ones",async()=>{
 const {c,scene}=setup();maskStub(c);let state=c.state();state.slots[0].maskPath="ok.png";await c.configure(scene,state);
 const before=c.state(),ids=[...scene.walls.keys()],original=scene.setFlag;let fail=true;
 scene.setFlag=async(...args)=>{if(fail){fail=false;throw Error("Save failed");}return original(...args);};
 await assert.rejects(()=>c.configure(scene,c.state()),/Save failed/);assert.deepEqual(c.state(),before);assert.deepEqual([...scene.walls.keys()],ids);
});
test("switching to a different tile pauses that slot and cleans up the prior mask",async()=>{
 const {c,scene}=setup();maskStub(c);scene.tiles.set("third",document({id:"third",x:3000,y:0,width:500,height:500,rotation:0}));
 const state=c.state();state.slots[0].tileId="third";await c.configure(scene,state);assert.equal(c.state().slots[0].running,false);assert.equal(c.state().slots[1].running,true);
});
test("pins and wall-mounted lights are discovered even on solid mask pixels",async()=>{
 const {c,scene,state}=setup(),n=note(scene),l=light(scene);state.slots[0].mask={w:1,h:1,runs:[[0,1]]};await c.tick();
 assert.ok(n.y>500);assert.ok(l.y>500);
});
test("transparent artwork gaps exclude pins and lights from the wrong overlapping ring",()=>{
 const {c,scene,state}=setup();scene.tiles.get("t2").x=0;
 scene.tiles.get("t2").rotation=0;state.slots[1].floor={w:2,h:1,runs:[[0,1]]};
 assert.equal(c.pick(scene,state,[700,500],new Map(),"carryNotes").id,"a");
 assert.equal(c.pick(scene,state,[200,500],new Map(),"carryLights").id,"b");
});

test("Start while globally paused warns and rotation begins after unpause at default slow speed",async()=>{
 const {c,scene,state}=setup();state.slots[0].running=false;state.slots[0].speed=.5;
 let warning="";ui.notifications.warn=message=>warning=message;game.paused=true;
 await c.control(scene,"a","start");assert.match(warning,/Foundry is paused/);
 game.time.serverTime+=200;await c.tick();assert.equal(scene.tiles.get("t1").rotation,0);
 game.paused=false;
 for(let i=0;i<50;i++){game.time.serverTime+=200;await c.tick();}
 assert.ok(Math.abs(scene.tiles.get("t1").rotation-5)<.00001);
});
test("Start reports an existing engine failure instead of silently arming a stopped engine",async()=>{
 const {c,scene,state}=setup();state.slots[0].running=false;c.failure=true;c.lastError="Update denied";
 await assert.rejects(()=>c.control(scene,"a","start"),/Update denied.*Resume engine/);assert.equal(state.slots[0].running,false);
});
test("rotation batches suppress sheet rerenders without keeping carried tokens in native animation",async()=>{
 const {c,scene}=setup();token(scene);note(scene);await c.tick();
 assert.ok(scene.calls.every(call=>call.options.render===false));
 const call=scene.calls.find(call=>call.type==="Token");assert.equal(call.options.animate,false);assert.equal(call.options.animation.duration,0);
});
test("drag animation retains its remaining duration across subsequent floor ticks",async()=>{
 const {c,scene}=setup(),t=token(scene),change={x:750};
 c.intercept(t,change,{animation:{duration:1000}});apply(t,change);await c.tick();
 assert.equal(scene.calls.find(call=>call.type==="Token").options.animation.duration,1000);
 assert.equal(t.getFlag(ID,"ride").animationUntil,2000);
 scene.calls=[];game.time.serverTime+=200;await c.tick();
 assert.equal(scene.calls.find(call=>call.type==="Token").options.animation.duration,800);
 game.time.serverTime=2200;scene.calls=[];await c.tick();
 assert.equal(t.getFlag(ID,"ride").animationUntil,undefined);
 assert.equal(scene.calls.find(call=>call.type==="Token").options.animation.duration,0);
});
test("explicit nonanimated movement is respected",async()=>{
 const {c,scene}=setup(),t=token(scene),change={x:750};c.intercept(t,change,{animate:false});apply(t,change);await c.tick();
 assert.equal(scene.calls.find(call=>call.type==="Token").options.animate,false);
});
test("selected tile still receives smooth frame rendering",()=>{
 const {c,scene}=setup(),t=scene.tiles.get("t1");t.object={controlled:true,mesh:{rotation:0}};t.flags[ID]={motion:{angle:10,velocity:1,at:800}};
 c.draw();assert.ok(Math.abs(t.object.mesh.rotation-10.2*Math.PI/180)<.00001);
});

test("reset returns tile, token, journal and directional light to their saved starting orientation",async()=>{
 const {c,scene}=setup(),t=token(scene),n=note(scene),l=light(scene);const original=[t.x,t.y,n.x,n.y,l.x,l.y,l.rotation];
 await c.tick();game.time.serverTime+=200;await c.tick();await c.control(scene,"a","reset");
 assert.equal(scene.tiles.get("t1").rotation,0);assert.equal(c.state().slots[0].running,false);
 assert.deepEqual([t.x,t.y,n.x,n.y,l.x,l.y,l.rotation],original);
 assert.equal(scene.tiles.get("t2").rotation,268);
});
test("new manual walls attach by floor and retain door settings while rotating",async()=>{
 const {c,scene}=setup();const coords=[600,500,700,500],f=c.manualWallAttachment(scene,coords);
 assert.equal(f.source,"manual");assert.equal(f.tileId,"t1");
 const w=document({id:"door",c:coords,door:1,ds:1,flags:{[ID]:{wall:f}}});scene.walls.set(w.id,w);
 await c.tick();assert.notDeepEqual(w.c,coords);assert.equal(w.door,1);assert.equal(w.ds,1);
 await c.control(scene,"a","reset");assert.deepEqual(w.c,coords);
});
test("mask rebuild preserves hand drawn walls and reset baseline",async()=>{
 const {c,scene}=setup();await c.tick();const f=c.manualWallAttachment(scene,[600,500,700,500]);
 scene.walls.set("manual",document({id:"manual",c:[600,500,700,500],flags:{[ID]:{wall:f}}}));
 c.readFloor=async()=>null;await c.configure(scene,c.state());assert.ok(scene.walls.has("manual"));assert.equal(c.state().slots[0].startRotation,0);
});
test("new walls outside rotating floors remain static",()=>{
 const {c,scene}=setup();assert.equal(c.manualWallAttachment(scene,[4000,4000,4100,4000]),null);
});
test("manual walls remain with original tile if slot is reassigned",async()=>{
 const {c,scene,state}=setup();const coords=[600,500,700,500],f=c.manualWallAttachment(scene,coords);
 scene.walls.set("manual",document({id:"manual",c:coords,flags:{[ID]:{wall:f}}}));
 state.slots[0].tileId="";await c.tick();assert.deepEqual(scene.walls.get("manual").c,coords);
});

test("verified GM drag bypasses native walls and solid mask destinations",async()=>{
 const {c,scene,state,gm}=setup(),t=token(scene);state.slots[0].mask={w:1,h:1,runs:[[0,1]]};
 t.flags[ID]={ride:{slotId:"a",local:[200,0]}};
 t.object.checkCollision=()=>{throw Error("GM move must not test walls");};
 const change={x:750};c.intercept(t,change,{});apply(t,change);c.observeTokenRequest(t,change,gm.id);
 await c.tick();assert.deepEqual(t.getFlag(ID,"ride").local,[300,0]);assert.equal(t.getFlag(ID,"rejected"),undefined);
});
test("player cannot gain GM bypass by putting a GM id in the request",async()=>{
 const {c,scene,player}=setup(),t=token(scene);t.object.checkCollision=()=>true;
 const change={x:750};c.intercept(t,change,{});apply(t,change);c.observeTokenRequest(t,change,player.id);
 await c.tick();assert.equal(t.getFlag(ID,"rejected"),"request-1");
});
test("player drags retain wall blocking when processed by GM",async()=>{
 const {c,scene,player,gm}=setup(),t=token(scene);t.object.checkCollision=()=>true;game.user=player;
 const change={x:750};c.intercept(t,change,{});apply(t,change);c.observeTokenRequest(t,change,player.id);game.user=gm;
 await c.tick();assert.equal(t.getFlag(ID,"rejected"),"request-1");
});

test("speed controls step through eight levels, preserve running and direction, and update the shared clock",async()=>{
 const {c,scene,state}=setup();state.slots[0].speed=.1;state.slots[0].direction=-1;
 for(let level=2;level<=8;level++) {await c.control(scene,"a","speedUp");assert.equal(c.state().slots[0].speed,level/10);}
 await c.control(scene,"a","speedUp");assert.equal(c.state().slots[0].speed,.8);
 assert.equal(scene.tiles.get("t1").getFlag(ID,"motion").velocity,-.8);
 assert.equal(c.state().slots[0].running,true);assert.equal(c.state().slots[1].speed,5);
 for(let level=7;level>=1;level--) {await c.control(scene,"a","speedDown");assert.equal(c.state().slots[0].speed,level/10);}
 await c.control(scene,"a","speedDown");assert.equal(c.state().slots[0].speed,.1);
 game.paused=true;await c.control(scene,"a","speedUp");assert.equal(scene.tiles.get("t1").getFlag(ID,"motion").velocity,0);
});
