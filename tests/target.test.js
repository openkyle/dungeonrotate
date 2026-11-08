import test from "node:test";
import assert from "node:assert/strict";
import {matchingMaskPaths,findMatchingMask} from "../scripts/mask.js";
import {TileTargetSession} from "../scripts/target.js";
test("mask convention replaces image extension and preserves directory and encoded names",()=>{
 assert.deepEqual(matchingMaskPaths("https://assets.example.test/maps/Ring%201%263.webp?v=2"),["https://assets.example.test/maps/Ring%201%263_mask.png?v=2","https://assets.example.test/maps/Ring%201%263_Mask.png?v=2","https://assets.example.test/maps/Ring%201%263_mask.webp?v=2","https://assets.example.test/maps/Ring%201%263_Mask.webp?v=2"]);
 assert.deepEqual(matchingMaskPaths("maps/Dungeon.png"),["maps/Dungeon_mask.png","maps/Dungeon_Mask.png"]);
});
test("matching mask prefers lowercase, accepts uppercase suffix, and handles missing files",async()=>{
 assert.equal(await findMatchingMask("maps/Dungeon.webp",async p=>p.includes("_Mask")),"maps/Dungeon_Mask.png");
 assert.equal(await findMatchingMask("maps/Dungeon.webp",async()=>true),"maps/Dungeon_mask.png");
 assert.equal(await findMatchingMask("maps/Dungeon.webp",async()=>false),"");
 assert.equal(await findMatchingMask(null,async()=>true),"");
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
 assert.equal(await findMatchingMask("maps/Ring.webp",async path=>path==="maps/Ring_Mask.webp"),"maps/Ring_Mask.webp");
});
