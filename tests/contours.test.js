import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterize,boundaries,solidCell} from '../scripts/core.js';
import {traceContours,smoothBoundaries,offsetMask} from '../scripts/contours.js';
function mask(w,h,solid){const p=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(solid(x,y))p.set([0,0,0,255],(y*w+x)*4);return rasterize(p,w,h,256,128);}
function closed(segments){const degrees=new Map();for(const s of segments)for(const p of [s.slice(0,2),s.slice(2)]){const k=p.join(',');degrees.set(k,(degrees.get(k)??0)+1);}assert.ok([...degrees.values()].every(n=>n%2===0));}
test('curved room becomes fewer diagonal walls with closed inner and outer outlines',()=>{
 const m=mask(80,80,(x,y)=>{const r=Math.hypot(x-40,y-40);return r<34&&r>28;});
 const raw=boundaries(m),smooth=smoothBoundaries(m,1);
 assert.equal(traceContours(m).length,2);assert.ok(smooth.length<raw.length/3);assert.ok(smooth.some(s=>s[0]!==s[2]&&s[1]!==s[3]));closed(smooth);
});
test('smoothing off returns exact legacy geometry',()=>{const m=mask(20,20,(x,y)=>x<y);assert.deepEqual(smoothBoundaries(m,0),boundaries(m));});
test('small holes, disconnected islands, thin barriers and diagonal contacts survive',()=>{
 for(const m of [mask(3,3,(x,y)=>x!==1||y!==1),mask(3,1,x=>x!==1),mask(2,2,(x,y)=>x===y),mask(50,20,x=>x===25)]) {
  const s=smoothBoundaries(m,2);assert.equal(s.length,boundaries(m).length);closed(s);
 }
});
test('diagonal wall strip retains both sides instead of dissolving into an open line',()=>{
 const m=mask(40,40,(x,y)=>Math.abs(x-y)<2),s=smoothBoundaries(m,1);
 closed(s);assert.ok(s.length>=4);assert.ok(s.length<boundaries(m).length);
});
test('doors in ring outlines stay open after smoothing',()=>{
 const m=mask(80,80,(x,y)=>{const r=Math.hypot(x-40,y-40);return r<34&&r>28&&!(x>40&&y>37&&y<43);});
 assert.equal(traceContours(m).length,1);const s=smoothBoundaries(m,1);closed(s);
 // Horizontal ray through doorway from room center must not cross any wall.
 assert.ok(!s.some(([x1,y1,x2,y2])=>x1>0&&x2>0&&((y1<0&&y2>0)||(y2<0&&y1>0))));
});
test('invalid smoothing is rejected',()=>assert.throws(()=>smoothBoundaries(mask(2,2,()=>true),3),/smoothing/));

test('positive wall margin widens the open room and updates collision occupancy',()=>{
 const m=mask(30,30,(x,y)=>x>=3&&x<27&&y>=3&&y<27&&!(x>=10&&x<20&&y>=10&&y<20));
 const wider=offsetMask(m,1);assert.equal(solidCell(m,9,15),true);assert.equal(solidCell(wider,9,15),false);assert.equal(solidCell(wider,8,15),true);
 assert.equal(traceContours(wider).length,2);closed(smoothBoundaries(wider,1));
});
test('negative margin thickens walls and zero preserves exact occupancy',()=>{
 const m=mask(20,20,(x,y)=>x>=7&&x<13&&y>=7&&y<13);
 assert.equal(offsetMask(m,0),m);const thick=offsetMask(m,-1);assert.equal(solidCell(thick,6,10),true);assert.equal(solidCell(thick,5,10),false);
});
test('margin preserves thin barriers instead of removing them',()=>{
 const m=offsetMask(mask(20,20,(x,y)=>x===10&&y>2&&y<17),1);assert.equal(traceContours(m).length,1);assert.ok(solidCell(m,10,10));
});
test('thickening preserves a narrow doorway',()=>{
 const m=mask(30,30,(x,y)=>x>=3&&x<27&&y>=3&&y<27&&!(x>=9&&x<21&&y>=9&&y<21)&&!(x>=20&&y===15));
 assert.equal(traceContours(offsetMask(m,-1)).length,traceContours(m).length);
});
