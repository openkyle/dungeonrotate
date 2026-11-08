import test from "node:test";
import assert from "node:assert/strict";
import {normalize, rotate, toLocal, toWorld, defaultState, validateState, rasterize, boundaries, solidAt, wallCoordinates, visualAngle, onFloor, parseBands} from "../scripts/core.js";
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
const tile = {x: 100, y: 200, width: 400, height: 200, rotation: 270};
function bitmap(rows) {
  const w = rows[0].length, h = rows.length;
  const pixels = new Uint8ClampedArray(w*h*4);
  rows.forEach((row,y) => [...row].forEach((c,x) => pixels.set(c === "#" ? [0,0,0,255] : [255,255,255,255], (y*w+x)*4)));
  return rasterize(pixels,w,h,256,128);
}
test("world/local round trip across many revolutions and non-square tiles", () => {
  for (const angle of [-720,-90,0,37,270,359,810]) {
    const p = [83.125,-42.5], back = toLocal(toWorld(p,tile,angle),tile,angle);
    near(back[0],p[0]); near(back[1],p[1]);
  }
});
test("positive angles rotate clockwise in screen coordinates", () => { const p=rotate([1,0],90); near(p[0],0);near(p[1],1); });
test("normalization handles negative angles and wrap", () => { assert.equal(normalize(-1),359); assert.equal(normalize(720),0); });
test("defaults have two independent empty slots and carry journal pins", () => {
  const s=defaultState(); assert.equal(s.slots.length,2); assert.equal(s.slots[0].tileId,""); assert.equal(s.slots[1].carryNotes,true);
  s.slots[0].direction=-1; assert.equal(s.slots[1].direction,1);
});
test("duplicate tile and invalid speed rejected", () => {
  const s=defaultState(), tiles=new Map([["t",tile]]); s.slots.forEach(x=>x.tileId="t");
  assert.throws(()=>validateState(s,tiles),/different tile/);
  s.slots[1].tileId="";s.slots[0].speed=NaN;assert.throws(()=>validateState(s,tiles),/Speed/);
});
test("missing, mirrored and overhead tiles rejected", () => {
  const s=defaultState();s.slots[0].tileId="t";
  assert.throws(()=>validateState(s,new Map()),/missing/);
  assert.throws(()=>validateState(s,new Map([["t",{...tile,texture:{scaleX:-1}}]])),/non-overhead/);
  assert.throws(()=>validateState(s,new Map([["t",{...tile,overhead:true}]])),/non-overhead/);
});
test("black rectangle reduces to exactly four boundary segments", () => assert.equal(boundaries(bitmap(["####","####"])).length,4));
test("white mask creates no walls", () => assert.equal(boundaries(bitmap(["....","...."])).length,0));
test("hole and disconnected islands preserve topology", () => {
  assert.equal(boundaries(bitmap(["###","#.#","###"])).length,8);
  assert.equal(boundaries(bitmap(["#.#"])).length,8);
});
test("diagonally touching islands do not become a diagonal opening", () => assert.equal(boundaries(bitmap(["#.",".#"])).length,8));
test("downsampling preserves a single-pixel barrier", () => {
  const p = new Uint8ClampedArray(16*4).fill(255);p.set([0,0,0,255], 5*4);
  const m=rasterize(p,4,4,1,128);assert.equal(boundaries(m).length,4);
});
test("transparent black is open and alpha threshold is explicit", () => {
  const m=rasterize(new Uint8ClampedArray([0,0,0,0,0,0,0,127,0,0,0,128]),3,1,256,128);
  assert.deepEqual(m.runs,[[2,3]]);
});
test("mask queries honor tile dimensions and exterior", () => {
  const m=bitmap(["#."]); assert.equal(solidAt(m,[-100,0],tile),true);assert.equal(solidAt(m,[100,0],tile),false);assert.equal(solidAt(m,[-300,0],tile),false);
});
test("wall coordinates rotate around an existing tile's center", () => {
  assert.deepEqual(wallCoordinates([-.5,0,.5,0],tile,90),[300,100,300,500]);
});
test("shared visual clock caps extrapolation after stale updates", () => {
  const m={angle:359,velocity:10,at:1000}; assert.equal(visualAngle(m,1200,5),1); assert.equal(visualAngle(m,10000,5),3);assert.equal(visualAngle(m,900,5),359);
});
test("radial footprint supports disconnected inner and outer rings", () => {
  const s={footprint:"radial",bands:"0-0.25,0.6-1"};
  assert.equal(onFloor([0,0],tile,s),true);assert.equal(onFloor([100,0],tile,s),false);assert.equal(onFloor([150,0],tile,s),true);
  assert.equal(onFloor([199,99],tile,s),false);
});
test("malformed or reversed radial intervals rejected", () => {
  for(const s of ["", "0.5-0.2", "0-2", "NaN-1", "-1-1"]) assert.throws(()=>parseBands(s),/Radial bands/);
});
