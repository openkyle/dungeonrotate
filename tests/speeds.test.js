import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_SPEEDS,validateSpeeds,stepSpeed,rotationSpeeds,createSpeedMenuClass} from "../scripts/speeds.js";
test("custom levels handle exact and intermediate speeds and clamp endpoints",()=>{
 const speeds=[.1,.5,1,2,3,4,6,10];
 assert.deepEqual(validateSpeeds(speeds),speeds);
 assert.equal(stepSpeed(.5,1,speeds),1);assert.equal(stepSpeed(.7,-1,speeds),.5);
 assert.equal(stepSpeed(.7,1,speeds),1);assert.equal(stepSpeed(10,1,speeds),10);
 assert.equal(stepSpeed(.1,-1,speeds),.1);
});
test("invalid custom levels are rejected and invalid saved data falls back",()=>{
 for(const values of [[1], [...DEFAULT_SPEEDS.slice(0,7),NaN], [1,1,2,3,4,5,6,7], [.1,.2,.3,.4,.5,.6,.7,11]])assert.throws(()=>validateSpeeds(values));
 globalThis.game={settings:{get:()=>[1]}};assert.deepEqual(rotationSpeeds(),DEFAULT_SPEEDS);
});
test("speed menu validates before saving and restricts writes to GM",async()=>{
 globalThis.FormApplication=class {async close(){this.closed=true;}};
 let saved=null,error='';globalThis.game={user:{isGM:true},settings:{set:async(ns,key,value)=>saved=value}};
 globalThis.ui={notifications:{info:()=>{},error:m=>error=m}};
 const C=createSpeedMenuClass(),menu=new C();
 const data=Object.fromEntries(DEFAULT_SPEEDS.map((v,i)=>[`level${i+1}`,String(v*10)]));
 await menu._updateObject(null,data);assert.deepEqual(saved,[1,2,3,4,5,6,7,8]);assert.equal(menu.closed,true);
 saved=null;await menu._updateObject(null,{...data,level8:'1'});assert.equal(saved,null);assert.match(error,/increasing/);
 game.user.isGM=false;await menu._updateObject(null,data);assert.equal(saved,null);assert.match(error,/GM/);
});
