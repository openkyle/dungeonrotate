import {solidCell, boundaries} from "./core.js";
const key = p => `${p[0]},${p[1]}`;
const equal = (a,b) => a[0] === b[0] && a[1] === b[1];
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area = p => p.reduce((sum,a,i) => {const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
/** Directed cell edges keep solid material on the right, including around holes. */
export function traceContours(mask) {
  const edges=[], outgoing=new Map();
  function add(a,b,d) {const e={a,b,d,used:false};edges.push(e);const k=key(a);if(!outgoing.has(k))outgoing.set(k,[]);outgoing.get(k).push(e);}
  for(let y=0;y<mask.h;y++) for(let x=0;x<mask.w;x++) if(solidCell(mask,x,y)) {
    if(!solidCell(mask,x,y-1))add([x,y],[x+1,y],0);
    if(!solidCell(mask,x+1,y))add([x+1,y],[x+1,y+1],1);
    if(!solidCell(mask,x,y+1))add([x+1,y+1],[x,y+1],2);
    if(!solidCell(mask,x-1,y))add([x,y+1],[x,y],3);
  }
  const loops=[];
  for(const first of edges) {
    if(first.used)continue;
    const points=[];let edge=first;
    do {
      edge.used=true;points.push(edge.a);
      if(equal(edge.b,first.a))break;
      const candidates=(outgoing.get(key(edge.b))??[]).filter(e=>!e.used);
      // Right turn separates diagonally touching solid islands at a saddle.
      const rank=d=>({1:0,0:1,3:2,2:3})[d];
      candidates.sort((a,b)=>rank((a.d-edge.d+4)%4)-rank((b.d-edge.d+4)%4));
      edge=candidates[0];
      if(!edge)throw Error("Mask contour could not be closed.");
    } while(true);
    loops.push(points.filter((p,i)=>cross(points[(i+points.length-1)%points.length],p,points[(i+1)%points.length])!==0));
  }
  return loops;
}
function distance2(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
  const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;
  return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
}
function simplifyOpen(points,tolerance) {
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
  while(stack.length) {
    const [a,b]=stack.pop();let far=-1,max=tolerance*tolerance;
    for(let i=a+1;i<b;i++){const d=distance2(points[i],points[a],points[b]);if(d>max){far=i;max=d;}}
    if(far>=0){keep.add(far);stack.push([a,far],[far,b]);}
  }
  return points.filter((_,i)=>keep.has(i));
}
function simplifyClosed(points,tolerance) {
  if(points.length<=4)return points; // Preserve tiny islands and rectangular barriers.
  let split=1;
  for(let i=2;i<points.length;i++)if(distance2(points[i],points[0],points[0])>distance2(points[split],points[0],points[0]))split=i;
  const a=simplifyOpen(points.slice(0,split+1),tolerance);
  const b=simplifyOpen([...points.slice(split),points[0]],tolerance);
  const result=[...a.slice(0,-1),...b.slice(0,-1)];
  // Never erase a small hole/island or invert its winding.
  if(result.length<3 || area(result)*area(points)<=0 || Math.abs(area(result))<Math.abs(area(points))*.5)return points;
  return result;
}
function intersects(a,b,c,d) {
  if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))return false;
  return cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0;
}
function averageContour(points,strength,contacts) {
  if(points.length<=4)return points;
  // Sample by arc length, not by corner count: straight edges must carry the
  // same weight as stair steps. Average cyclically so the closing seam is smooth.
  const samples=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],n=Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1]);
    for(let j=0;j<n;j++)samples.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);
  }
  const radius=Math.min(Math.floor(samples.length/8),strength===.5?1:strength===1?3:5);
  if(!radius)return points;
  const averaged=samples.map((p,i)=> {
    if([...contacts].some(k=>{const q=k.split(",").map(Number);return Math.hypot(p[0]-q[0],p[1]-q[1])<=radius+1;}))return p;
    const sum=[0,0];
    for(let j=-radius;j<=radius;j++){const q=samples[(i+j+samples.length)%samples.length];sum[0]+=q[0];sum[1]+=q[1];}
    return sum.map(v=>v/(radius*2+1));
  });
  const anchors=samples.flatMap((p,i)=>contacts.has(key(p))?[i]:[]);
  let result;
  if(anchors.length) {
    result=[];
    for(let i=0;i<anchors.length;i++) {
      const a=anchors[i],b=anchors[(i+1)%anchors.length];
      const arc=b>a?averaged.slice(a,b+1):[...averaged.slice(a),...averaged.slice(0,b+1)];
      result.push(...simplifyOpen(arc,strength===.5?.25:.5).slice(0,-1));
    }
  } else result=simplifyClosed(averaged,strength===.5?.25:.5);
  if(area(result)*area(points)<=0||Math.abs(area(result))<Math.abs(area(points))*.5)return points;
  return result;
}
/** Average small edge details, then fit closed diagonal wall segments. */
export function smoothBoundaries(mask,tolerance=1) {
  if(!tolerance)return boundaries(mask);
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>2)throw Error("Invalid wall smoothing.");
  const original=traceContours(mask),counts=new Map();
  for(const p of original)for(const v of p)counts.set(key(v),(counts.get(key(v))??0)+1);
  const contacts=new Set([...counts].filter(([,n])=>n>1).map(([k])=>k));
  const loops=original.map(p=>averageContour(p,tolerance,contacts));
  const segments=loops.flatMap((p,loop)=>p.map((a,i)=>({a,b:p[(i+1)%p.length],loop,i,n:p.length})));
  // Avoid quadratic work on pathological noisy masks; normal wall-count validation
  // reports overly complex masks afterward.
  if(segments.length>2400)return boundaries(mask);
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++) {
    const a=segments[i],b=segments[j];
    if(a.loop===b.loop && (Math.abs(a.i-b.i)===1||Math.abs(a.i-b.i)===a.n-1))continue;
    if(!intersects(a.a,a.b,b.a,b.b))continue;
    // Retain pre-existing corner contacts between separate islands.
    if([a.a,a.b].some(p=>contacts.has(key(p)) && [b.a,b.b].some(q=>equal(p,q))))continue;
    return boundaries(mask); // Crossing contours would change connectivity: keep exact geometry.
  }
  return segments.map(({a,b})=>[a[0]/mask.w-.5,a[1]/mask.h-.5,b[0]/mask.w-.5,b[1]/mask.h-.5]);
}

/** Positive margin expands open room space; negative margin thickens solid walls. */
export function offsetMask(mask, margin = 0) {
  if(![-2,-1,0,1,2].includes(margin))throw Error("Invalid wall margin.");
  if(!margin)return mask;
  const radius=Math.abs(margin),grow=margin<0,runs=[];
  for(let y=0;y<mask.h;y++) {
    const row=[];let start=-1;
    for(let x=0;x<=mask.w;x++) {
      let solid=false;
      if(x<mask.w) {
        solid=!grow;
        outer: for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++) {
          if(dx*dx+dy*dy>radius*radius)continue;
          const occupied=solidCell(mask,x+dx,y+dy);
          if(grow?occupied:!occupied){solid=grow;break outer;}
        }
      }
      if(solid&&start<0)start=x;
      if(!solid&&start>=0){row.push(start,x);start=-1;}
    }
    runs.push(row);
  }
  const desired={w:mask.w,h:mask.h,runs};
  const cells=Array.from({length:mask.w*mask.h},(_,i)=>solidCell(mask,i%mask.w,Math.floor(i/mask.w)));
  const at=(x,y)=>x>=0&&y>=0&&x<mask.w&&y<mask.h?cells[y*mask.w+x]:false;
  function components(x,y,solid,diagonal) {
    const points=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&at(x+dx,y+dy)===solid)points.push([dx,dy]);
    let count=0;
    while(points.length) {
      count++;const stack=[points.pop()];
      while(stack.length) {const a=stack.pop();for(let i=points.length-1;i>=0;i--) {
        const b=points[i],dx=Math.abs(a[0]-b[0]),dy=Math.abs(a[1]-b[1]);
        if(diagonal?Math.max(dx,dy)===1:dx+dy===1)stack.push(...points.splice(i,1));
      }}
    }
    return count;
  }
  // Only flip simple boundary pixels. Thin barriers, tiny islands and narrow
  // openings keep their original edge where a full margin would break them.
  for(let pass=0;pass<4;pass++) {
    let changed=false;
    for(let y=0;y<mask.h;y++)for(let x=0;x<mask.w;x++) {
      const target=solidCell(desired,x,y);
      if(at(x,y)===target)continue;
      if(!target && ![-1,0].some(dx=>[-1,0].some(dy=>
        at(x+dx,y+dy)&&at(x+dx+1,y+dy)&&at(x+dx,y+dy+1)&&at(x+dx+1,y+dy+1))))continue;
      if(components(x,y,true,false)!==1||components(x,y,false,true)!==1)continue;
      cells[y*mask.w+x]=target;changed=true;
    }
    if(!changed)break;
  }
  const protectedRuns=[];
  for(let y=0;y<mask.h;y++) {
    const row=[];let start=-1;
    for(let x=0;x<=mask.w;x++) {
      const solid=x<mask.w&&cells[y*mask.w+x];
      if(solid&&start<0)start=x;
      if(!solid&&start>=0){row.push(start,x);start=-1;}
    }
    protectedRuns.push(row);
  }
  return {w:mask.w,h:mask.h,runs:protectedRuns};
}
