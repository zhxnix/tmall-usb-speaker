/* Lightweight floor navigation derived from the scene's actual furniture bounds.
 * Moving actors reserve the aisle and validate every step; no clock-based teleporting.
 */
(function(){
  'use strict';
  window.createShopNavigation=function(){
    const limits={minX:-4.15,maxX:4.15,minZ:-8.85,maxZ:8.90},cell=.05;
    const cols=Math.ceil((limits.maxX-limits.minX)/cell)+1,rows=Math.ceil((limits.maxZ-limits.minZ)/cell)+1,total=cols*rows;
    const gridX=new Float64Array(total),gridZ=new Float64Array(total);
    for(let i=0;i<total;i++){gridX[i]=limits.minX+(i%cols)*cell;gridZ[i]=limits.minZ+Math.floor(i/cols)*cell;}
    const walkHeight=[.04,2.20],noActors=[];
    const catSamples=[[-.13,.12,.06,.32],[0,.14,.06,.33],[.13,.12,.10,.36],[.23,.12,.20,.43]];
    // findPath is synchronous. Reset all scratch state before each search;
    // returned waypoints are independent arrays, never views into these buffers.
    const searchCosts=new Float64Array(total),searchParents=new Int32Array(total),searchDone=new Uint8Array(total);
    const searchHeap=[],heapItems=[];let heapItemsUsed=0;
    let obstacles=[],cache=new Map();
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    function inside(x,z,r){return x-r>=limits.minX&&x+r<=limits.maxX&&z-r>=limits.minZ&&z+r<=limits.maxZ;}
    function hitsCircle(x,z,r,o){const dx=x-clamp(x,o.minX,o.maxX),dz=z-clamp(z,o.minZ,o.maxZ);return dx*dx+dz*dz<r*r-1e-9;}
    function free(x,z,r,extras=noActors,height=null,checkBounds=true){
      if(checkBounds&&!inside(x,z,r))return false;
      for(const o of obstacles){
        if(height&&(height[0]>=o.maxY-.002||height[1]<=o.minY+.002))continue;
        if(hitsCircle(x,z,r,o))return false;
      }
      for(const a of extras){if(a.visible===false)continue;const d=r+a.radius+.045,dx=x-a.x,dz=z-a.z;if(dx*dx+dz*dz<d*d)return false;}
      return true;
    }
    function pointSegmentDistanceSquared(x,z,ax,az,bx,bz){
      const dx=bx-ax,dz=bz-az,length=dx*dx+dz*dz;
      const t=length?clamp(((x-ax)*dx+(z-az)*dz)/length,0,1):0;
      const ex=x-ax-dx*t,ez=z-az-dz*t;return ex*ex+ez*ez;
    }
    function segmentRectDistanceSquared(ax,az,bx,bz,o){
      const dx=bx-ax,dz=bz-az;let entry=0,exit=1,intersects=true;
      for(const axis of [[ax,dx,o.minX,o.maxX],[az,dz,o.minZ,o.maxZ]]){
        if(Math.abs(axis[1])<1e-12){if(axis[0]<axis[2]||axis[0]>axis[3]){intersects=false;break;}}
        else{const a=(axis[2]-axis[0])/axis[1],b=(axis[3]-axis[0])/axis[1];entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));if(entry>exit){intersects=false;break;}}
      }
      if(intersects)return 0;
      const adx=ax-clamp(ax,o.minX,o.maxX),adz=az-clamp(az,o.minZ,o.maxZ);
      const bdx=bx-clamp(bx,o.minX,o.maxX),bdz=bz-clamp(bz,o.minZ,o.maxZ);
      let distance=Math.min(adx*adx+adz*adz,bdx*bdx+bdz*bdz);
      for(const x of [o.minX,o.maxX])for(const z of [o.minZ,o.maxZ])distance=Math.min(distance,pointSegmentDistanceSquared(x,z,ax,az,bx,bz));
      return distance;
    }
    function actorsSegmentFree(ax,az,bx,bz,r,extras){
      for(const a of extras){if(a.visible===false)continue;const radius=r+a.radius+.045;if(pointSegmentDistanceSquared(a.x,a.z,ax,az,bx,bz)<radius*radius)return false;}
      return true;
    }
    function clearSegment(ax,az,bx,bz,r,extras){
      if(!inside(ax,az,r)||!inside(bx,bz,r))return false;
      // Use the complete swept circle, not samples every 3.5 cm. A long route
      // used to miss a thin corner intersection that its first short step hit,
      // then deterministically selected the same unusable route forever.
      for(const o of obstacles){
        if(walkHeight[0]>=o.maxY-.002||walkHeight[1]<=o.minY+.002)continue;
        if(segmentRectDistanceSquared(ax,az,bx,bz,o)<r*r-1e-9)return false;
      }
      return actorsSegmentFree(ax,az,bx,bz,r,extras);
    }
    function segment(a,b,r,extras=noActors){return clearSegment(a[0],a[1],b[0],b[1],r,extras);}
    function xy(index){return[gridX[index],gridZ[index]];}
    function cellIndex(x,z){const ix=Math.round((x-limits.minX)/cell),iz=Math.round((z-limits.minZ)/cell);return ix<0||ix>=cols||iz<0||iz>=rows?-1:iz*cols+ix;}
    function occupancyGrid(r){
      const key=r.toFixed(3);let grid=cache.get(key);if(!grid){grid=new Int8Array(total);grid.fill(-1);cache.set(key,grid);}
      return grid;
    }
    function gridFree(index,r,extras,grid){
      if(index<0||index>=total)return false;
      const x=gridX[index],z=gridZ[index];if(grid[index]<0)grid[index]=free(x,z,r,noActors,walkHeight)?1:0;
      if(!grid[index])return false;
      for(const a of extras){if(a.visible===false)continue;const d=r+a.radius+.045;if(Math.hypot(x-a.x,z-a.z)<d)return false;}
      return true;
    }
    function gridEdgeFree(a,b,r,extras,grid){
      const first=Math.min(a,b),last=Math.max(a,b),dx=(last%cols)-(first%cols),dz=Math.floor(last/cols)-Math.floor(first/cols);
      const direction=dz===0?0:dx===0?1:dx>0?2:3,key=first*4+direction;
      if(!grid.edges)grid.edges=new Uint8Array(total*4);
      if(!grid.edges[key])grid.edges[key]=clearSegment(gridX[first],gridZ[first],gridX[last],gridZ[last],r,noActors)?2:1;
      return grid.edges[key]===2&&actorsSegmentFree(gridX[a],gridZ[a],gridX[b],gridZ[b],r,extras);
    }
    function nearest(point,r,extras,grid){
      const centre=cellIndex(point[0],point[1]);if(centre<0)return-1;
      let best=-1,distance=Infinity;
      for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
        const index=centre+dz*cols+dx;
        if(index<0||index>=total||Math.abs(index%cols-centre%cols)>3||!gridFree(index,r,extras,grid))continue;
        const x=gridX[index],z=gridZ[index],d=Math.hypot(x-point[0],z-point[1]);
        if(d<distance&&clearSegment(point[0],point[1],x,z,r,extras)){best=index;distance=d;}
      }
      return best;
    }
    function push(heap,item){let i=heap.length;heap.push(item);while(i>0){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;}
    function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
    function heapItem(i,g,f){let item=heapItems[heapItemsUsed];if(!item){item={i:0,g:0,f:0};heapItems.push(item);}heapItemsUsed++;item.i=i;item.g=g;item.f=f;return item;}
    function findPath(start,end,r,extras=noActors){
      if(!free(start[0],start[1],r,extras,walkHeight)||!free(end[0],end[1],r,extras,walkHeight))return null;
      if(segment(start,end,r,extras))return[start.slice(),end.slice()];
      const grid=occupancyGrid(r),a=nearest(start,r,extras,grid),b=nearest(end,r,extras,grid);if(a<0||b<0)return null;
      const g=searchCosts,parent=searchParents,done=searchDone,heap=searchHeap;
      g.fill(Infinity);parent.fill(-1);done.fill(0);heap.length=0;heapItemsUsed=0;
      const goalX=gridX[b],goalZ=gridZ[b];g[a]=0;push(heap,heapItem(a,0,Math.hypot(gridX[a]-goalX,gridZ[a]-goalZ)));
      let found=false,visits=0;
      while(heap.length&&visits++<45000){
        const cur=pop(heap),i=cur.i;if(done[i]||cur.g!==g[i])continue;if(i===b){found=true;break;}done[i]=1;
        const x=i%cols,z=Math.floor(i/cols);
        for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dz)continue;if(x+dx<0||x+dx>=cols||z+dz<0||z+dz>=rows)continue;
          const n=i+dz*cols+dx;if(done[n]||!gridFree(n,r,extras,grid))continue;
          if(dx&&dz&&(!gridFree(i+dx,r,extras,grid)||!gridFree(i+dz*cols,r,extras,grid)))continue;
          if(!gridEdgeFree(i,n,r,extras,grid))continue;
          const cost=g[i]+cell*(dx&&dz?Math.SQRT2:1);if(cost>=g[n])continue;
          g[n]=cost;parent[n]=i;push(heap,heapItem(n,cost,cost+Math.hypot(gridX[n]-goalX,gridZ[n]-goalZ)));
        }
      }
      if(!found)return null;
      const raw=[end.slice()];for(let i=b;i!==-1;i=parent[i]){raw.push(xy(i));if(i===a)break;}raw.push(start.slice());raw.reverse();
      const result=[raw[0]];let i=0;
      while(i<raw.length-1){let j=raw.length-1;while(j>i+1&&!segment(raw[i],raw[j],r,extras))j--;result.push(raw[j]);i=j;}
      return result;
    }
    function intersections(box,tolerance=.014){
      const hits=[];
      for(const o of obstacles){if(o.navigationOnly)continue;const x=Math.min(box.max.x,o.maxX)-Math.max(box.min.x,o.minX),y=Math.min(box.max.y,o.maxY)-Math.max(box.min.y,o.minY),z=Math.min(box.max.z,o.maxZ)-Math.max(box.min.z,o.minZ);if(x>tolerance&&y>tolerance&&z>tolerance)hits.push({name:o.name,overlap:[x,y,z]});}
      return hits;
    }
    return {
      setObstacles(list){obstacles=list;cache.clear();},
      free,segment,findPath,inside,intersections,
      catPoseFree(x,y,z,yaw,extras=noActors){
        if(!inside(x,z,.13))return false;
        const c=Math.cos(yaw),s=Math.sin(yaw);
        for(const p of catSamples){
          if(!free(x+s*p[0],z+c*p[0],p[1],extras,[y+p[2],y+p[3]],false))return false;
        }
        return true;
      },
      obstacles(){return obstacles.map(o=>Object.assign({},o));}
    };
  };
})();
