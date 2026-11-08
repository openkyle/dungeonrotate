import test from "node:test";
import assert from "node:assert/strict";
import {addSceneToggle, createFloatingClass} from "../scripts/floating.js";
import {ID, defaultState} from "../scripts/core.js";
test("scene checkbox uses a native persisted scene-flag field and exact requested label",()=>{
  let markup="",resized=false;
  const target={length:1,first(){return this;},append(value){markup=value;}};
  const html={find:selector=>selector.startsWith("[name")?{length:0}:target};
  addSceneToggle({object:{getFlag:()=>true},setPosition:()=>resized=true},html);
  assert.match(markup,/This scene has Rotating Elements/);assert.match(markup,new RegExp(`name="flags.${ID}.enabled"`));assert.match(markup,/checked/);assert.ok(resized);
});
test("scene configuration rerender does not inject duplicate controls",()=>{
  let appended=false;const html={find:()=>({length:1,append:()=>appended=true})};
  addSceneToggle({},html);assert.equal(appended,false);
});
test("floating view derives two independent controls from current scene settings",()=>{
  globalThis.Application=class {static get defaultOptions(){return {};}};
  globalThis.foundry={utils:{mergeObject:(a,b)=>({...a,...b})}};
  globalThis.canvas={scene:{name:"Any scene",tiles:new Map([["custom",{texture:{src:"arbitrary/user-image.webp"}}]])}};
  globalThis.game={user:{id:"gm"}};
  const state=defaultState();state.slots[0].tileId="custom";state.slots[0].running=true;state.slots[1].direction=-1;
  const C=createFloatingClass({enabled:()=>true,authority:()=>({id:"gm"}),state:()=>state},()=>{});
  const data=new C().getData();assert.equal(data.slots[0].toggle,"pause");assert.equal(data.slots[1].toggle,"start");assert.equal(data.slots[0].imageName,"user-image.webp");assert.equal(data.slots[1].directionText,"Counterclockwise");assert.equal(C.defaultOptions.width,350);
});
