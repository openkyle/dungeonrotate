import test from 'node:test';
import assert from 'node:assert/strict';
import {readMask} from '../scripts/mask.js';
function imageHarness() {
 globalThis.Image=class {naturalWidth=1;naturalHeight=1;set src(value){queueMicrotask(()=>this.onload?.());}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([0,0,0,255])})})})};
}
test('WebP mask URLs load without the old PNG filename rejection',async()=>{
 imageHarness();const result=await readMask('https://assets.example.test/Ring_Mask.webp',128,128);assert.equal(result.segments.length,4);
});
test('image URLs without extensions are allowed and decoded normally',async()=>{
 imageHarness();const result=await readMask('https://assets.example.test/image?id=123',128,128);assert.equal(result.segments.length,4);
});
test('empty mask errors explain the missing field rather than demanding a particular picker',async()=>{
 await assert.rejects(()=>readMask('',128,128),/No wall mask is selected/);
});
