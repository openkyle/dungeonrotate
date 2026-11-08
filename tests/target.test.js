import test from "node:test";
import assert from "node:assert/strict";
import {matchingMaskPaths,findMatchingMask} from "../scripts/mask.js";
import {TileTargetSession} from "../scripts/target.js";
test("mask convention replaces image extension and preserves directory and encoded names",()=>{
 assert.deepEqual(matchingMaskPaths("https://assets.example.test/maps/Ring%201%263.webp?v=2"),["https://assets.example.test/maps/Ring%201%263_mask.png?v=2","https://assets.example.test/maps/Ring%201%263_Mask.png?v=2","https://assets.example.test/maps/Ring%201%263_mask.webp?v=2","https://assets.example.test/maps/Ring%201%263_Mask.webp?v=2"]);
 assert.deepEqual(matchingMaskPaths("maps/Dungeon.png"),["maps/Dungeon_mask.png","maps/Dungeon_Mask.png"]);
});
test("matching mask prefers lowercase, accepts uppercase suffix, and handles missing files",async()=>{
 assert.equal(await findMatchingMask("maps/Dungeon.webp",async()=>["maps/Dungeon_Mask.png"]),"maps/Dungeon_Mask.png");
 assert.equal(await findMatchingMask("maps/Dungeon.webp",async()=>["maps/Dungeon_Mask.png","maps/Dungeon_mask.png"]),"maps/Dungeon_mask.png");
 assert.equal(await findMatchingMask("maps/Dungeon.webp",async()=>[]),"");
 assert.equal(await findMatchingMask(null,async()=>["maps/Dungeon_Mask.png","maps/Dungeon_mask.png"]),"");
});
function setup() {
 let id=0;const hooks=new Map(),keys=new Map(),calls=[];
 globalThis.Hooks={on:(type,fn)=>{hooks.set(++id,{type,fn});return id;},off:(type,id)=>hooks.delete(id)};
 globalThis.window={addEventListener:(type,fn)=>keys.set(type,fn),removeEventListener:type=>keys.delete(type)};
 globalThis.canvas={tiles:{activate:()=>calls.push("tiles"),releaseAll:()=>calls.push("release")}};
 globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
 return {hooks,keys,calls,emit:(type,...args)=>{for(const h of [...hooks.values()])if(h.type===type)h.fn(...args);}};
}
test("target switches layer then accepts only the next controlled tile in the correct scene",()=>{
 const env=setup();let result=null;
 new TileTargetSession("scene",doc=>result=doc).start();assert.deepEqual(env.calls,["tiles","release"]);
 env.emit("controlTile",{document:{id:"wrong",parent:{id:"other"}}},true);assert.equal(result,null);
 env.emit("controlTile",{document:{id:"right",parent:{id:"scene"}}},false);assert.equal(result,null);
 env.emit("controlTile",{document:{id:"right",parent:{id:"scene"}}},true);assert.equal(result.id,"right");assert.equal(env.hooks.size,0);assert.equal(env.keys.size,0);assert.equal(TileTargetSession.active,null);
});
test("Escape and scene teardown cancel targeting without picking a tile",()=>{
 const env=setup();let cancelled=0,picked=0;
 new TileTargetSession("scene",()=>picked++,()=>cancelled++).start();env.keys.get("keydown")({key:"Escape",preventDefault:()=>{}});
 assert.equal(cancelled,1);assert.equal(picked,0);assert.equal(env.hooks.size,0);
 new TileTargetSession("scene",()=>picked++,()=>cancelled++).start();env.emit("canvasTearDown");assert.equal(cancelled,2);assert.equal(env.keys.size,0);
});
test("a second target session cancels the first and leaves only one active selection",()=>{
 const env=setup();let cancelled=0;
 new TileTargetSession("scene",()=>{},()=>cancelled++).start();const second=new TileTargetSession("scene",()=>{}).start();
 assert.equal(cancelled,1);assert.equal(env.hooks.size,2);second.finish();assert.equal(env.hooks.size,0);
});

test("automatic discovery accepts WebP masks matching WebP artwork",async()=>{
 assert.equal(await findMatchingMask("maps/Ring.webp",async()=>["maps/Ring_Mask.webp"]),"maps/Ring_Mask.webp");
});

test("mask lookup compares encoded paths and ignores unrelated directories",async()=>{
 assert.equal(await findMatchingMask("maps/Ring%201%263.webp?v=2",async()=>["other/Ring 1&3_mask.png","maps/Ring 1&3_Mask.webp"]),"maps/Ring 1&3_Mask.webp");
});
test("directory lookup failure is optional and never falls back to image probes",async()=>{
 globalThis.Image=class {constructor(){throw Error("Must not probe an image");}};
 assert.equal(await findMatchingMask("maps/Ring.webp",async()=>{throw Error("No browse access");}),"");
});
test("native file picker browses the inferred storage directory once without opening a window",async()=>{
 let calls=0;
 globalThis.FilePicker=class {
  constructor(options){assert.equal(options.current,"https://assets.example.test/library/Ring.webp");this.activeSource="forgevtt";this.target="library";}
  static async browse(source,target){calls++;assert.equal(source,"forgevtt");assert.equal(target,"library");return {files:["https://assets.example.test/library/Ring_Mask.webp"]};}
 };
 assert.equal(await findMatchingMask("https://assets.example.test/library/Ring.webp"),"https://assets.example.test/library/Ring_Mask.webp");assert.equal(calls,1);
});

test("target restores Token Controls after picking and Escape, but not during scene teardown",()=>{
 const env=setup();canvas.scene={id:"scene"};
 const tokens={activate(){env.calls.push("tokens");canvas.activeLayer=tokens;}};
 canvas.activeLayer=tokens;canvas.tiles.activate=()=>{canvas.activeLayer=canvas.tiles;};
 new TileTargetSession("scene",()=>{}).start();env.emit("controlTile",{document:{id:"tile",parent:{id:"scene"}}},true);
 assert.equal(canvas.activeLayer,tokens);
 new TileTargetSession("scene",()=>{}).start();env.keys.get("keydown")({key:"Escape",preventDefault(){}});assert.equal(canvas.activeLayer,tokens);
 new TileTargetSession("scene",()=>{}).start();env.emit("canvasTearDown");assert.equal(canvas.activeLayer,canvas.tiles);
});
test("target cancellation does not override a layer the user chose manually",()=>{
 const env=setup();canvas.scene={id:"scene"};canvas.activeLayer={activate(){throw Error("Unexpected layer restore");}};
 canvas.tiles.activate=()=>{canvas.activeLayer=canvas.tiles;};const session=new TileTargetSession("scene",()=>{}).start();
 const lighting={};canvas.activeLayer=lighting;session.cancel();assert.equal(canvas.activeLayer,lighting);
});
