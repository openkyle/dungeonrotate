import test from 'node:test';
import assert from 'node:assert/strict';
import {readMask} from '../scripts/mask.js';
function imageHarness() {
 globalThis.Image=class {naturalWidth=1;naturalHeight=1;set src(value){queueMicrotask(()=>this.onload?.());}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([0,0,0,255])})})})};
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

test('20-megapixel masks scan bounded chunks and preserve a single dark pixel at the far edge',async()=>{
 const width=5000,height=4000;let sx=0,sy=0,maxRead=0,clears=0,draws=0;
 globalThis.Image=class {naturalWidth=width;naturalHeight=height;set src(value){queueMicrotask(()=>this.onload?.());}};
 const surface={width:0,height:0,getContext:()=>({
  clearRect(){clears++;},drawImage(image,x,y,w,h,dx,dy,dw,dh){sx=x;sy=y;draws++;assert.equal(w,dw);assert.equal(h,dh);},
  getImageData(x,y,w,h){
   maxRead=Math.max(maxRead,w*h);assert.ok(surface.width<=1024);assert.ok(surface.height<=256);
   const data=new Uint8ClampedArray(w*h*4);data.fill(255);
   if(sx+w===width && sy+h===height)data.set([0,0,0,255],data.length-4);
   return {data};
  }
 })};
 globalThis.document={createElement:()=>surface};
 const result=await readMask('large_Mask.webp',128,128);
 assert.equal(result.sourceWidth,width);assert.equal(result.sourceHeight,height);
 assert.equal(result.mask.w,128);assert.deepEqual(result.mask.runs.at(-1),[127,128]);
 assert.equal(result.segments.length,4);assert.ok(maxRead<=1024*256);assert.equal(clears,draws);assert.ok(draws>1);assert.equal(surface.width,1);
});
