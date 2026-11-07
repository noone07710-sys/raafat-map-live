// RAAFAT in-site navigation using the open-source Valhalla routing engine.
// Default endpoint is a rate-limited DEMO; production requires a dedicated routing service.
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const goodCoord=p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const roadKm=v=>Number(v)>=1?Number(v).toLocaleString("ar-IQ",{maximumFractionDigits:1})+" كم":Math.round(Number(v)*1000).toLocaleString("ar-IQ")+" م";
const durationLabel=seconds=>{const min=Math.max(1,Math.round(seconds/60));return min>=60?Math.floor(min/60)+" ساعة"+(min%60?" و"+min%60+" دقيقة":""):min+" دقيقة"};
function decodePolyline6(encoded){
 let i=0,lat=0,lon=0;const coordinates=[];
 while(i<encoded.length){
  const numbers=[];
  for(let component=0;component<2;component++){
   let shift=0,result=0,byte;
   do{
    if(i>=encoded.length||shift>35)throw Error("Invalid route geometry");
    byte=encoded.charCodeAt(i++)-63;result|=(byte&31)<<shift;shift+=5;
   }while(byte>=32);
   numbers.push(result&1?~(result>>1):result>>1);
  }
  lat+=numbers[0];lon+=numbers[1];
  coordinates.push([lat/1e6,lon/1e6]);
  if(coordinates.length>120000)throw Error("Route too large");
 }
 return coordinates;
}
// Valhalla maneuver types per official route API; do not reuse OSRM numbering.
const DESTINATION_TYPES=new Set([4,5,6]);
const START_TYPES=new Set([1,2,3]);
const instruction=(m)=>{
 const type=Number(m?.type);
 const road=String(m?.street_names?.[0]||m?.begin_street_names?.[0]||"").trim();
 const onRoad=road?" إلى "+road:"";
 const phrases={
  0:"تابع المسار",1:"ابدأ المسار",2:"ابدأ باتجاه اليمين",3:"ابدأ باتجاه اليسار",
  4:"الوجهة أمامك",5:"الوجهة على يمينك",6:"الوجهة على يسارك",
  7:"واصل على الطريق",8:"تابع بشكل مستقيم",9:"انحرف قليلاً إلى اليمين",
  10:"انعطف يميناً",11:"انعطف يميناً بحدة",12:"استدر إلى الخلف يميناً",
  13:"استدر إلى الخلف يساراً",14:"انعطف يساراً بحدة",15:"انعطف يساراً",
  16:"انحرف قليلاً إلى اليسار",17:"تابع على المنحدر",
  18:"اسلك المنحدر الأيمن",19:"اسلك المنحدر الأيسر",
  20:"اسلك المخرج الأيمن",21:"اسلك المخرج الأيسر",
  22:"تابع بشكل مستقيم",23:"التزم باليمين",24:"التزم باليسار",
  25:"اندمج مع الطريق",26:"ادخل الدوار",27:"اخرج من الدوار",
  28:"اتجه نحو العبّارة",29:"غادر العبّارة",
  37:"اندمج من اليمين",38:"اندمج من اليسار"
 };
 const phrase=phrases[type]||"تابع المسار";
 // Do not tell users they have arrived until GPS independently verifies arrival.
 if(DESTINATION_TYPES.has(type))return phrase;
 return (START_TYPES.has(type)||type===7||type===8||type===22||type===25)?phrase+(road?" على "+road:""):phrase+onRoad;
};
export function createRaafatNavigation({map,getSite,getLocation,toast}){
 const panel=$("raafatRoutePanel"),steps=$("raafatRouteSteps"),status=$("raafatRouteStatus");
 let routeLayer=null,originMarker=null,targetMarker=null,activeSite=null,starting=null;
 let choosing=false,requestId=0,abort=null,watchId=null,lastFix=null,lastRequested=null,requestTime=0;
 let routePoints=[],routeManeuvers=[],routeOffsets=[],totalRouteMeters=0,routeSeconds=0,lastPoint=null,lastBearing=0;
 let arrowMarker=null,following=true,offRouteSince=0,arrivalShown=false,arrivalFixCount=0,manualOrigin=false,routeMode="auto";
 const meters=(a,b)=>map.distance(a,b);
 const bearing=(a,b)=>{
   const lat1=a[0]*Math.PI/180,lat2=b[0]*Math.PI/180,delta=(b[1]-a[1])*Math.PI/180;
   return (Math.atan2(Math.sin(delta)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta))*180/Math.PI+360)%360;
 };
 const safePoint=p=>goodCoord(p)&&Math.abs(p[0])<90;
 function drawArrow(point,heading){
   if(!safePoint(point))return;
   const orientation=Number.isFinite(heading)?heading:lastBearing;
   lastBearing=orientation;
   const html='<span class="raafat-navigation-arrow" style="transform:rotate('+orientation.toFixed(0)+'deg)"><svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><path d="M20 3 L34 34 L20 27 L6 34 Z" fill="#39c5ff" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg></span>';
   if(arrowMarker)arrowMarker.setLatLng(point).setIcon(window.L.divIcon({className:"raafat-route-direction-icon",html,iconSize:[44,44],iconAnchor:[22,22]}));
   else{
     const pane=map.getPane("raafatNavigation")||map.createPane("raafatNavigation");
     pane.style.zIndex="650";pane.style.pointerEvents="none";
     arrowMarker=window.L.marker(point,{pane:"raafatNavigation",interactive:false,keyboard:false,zIndexOffset:1000,icon:window.L.divIcon({className:"raafat-route-direction-icon",html,iconSize:[44,44],iconAnchor:[22,22]})}).addTo(map);
   }
 }
 function closestOnRoute(point){
   if(routePoints.length<2)return null;
   let best=Infinity,index=0,t=0;
   const latitudeScale=Math.cos(point[0]*Math.PI/180);
   for(let i=0;i<routePoints.length-1;i++){
     const a=routePoints[i],b=routePoints[i+1];
     const dx=(b[1]-a[1])*latitudeScale,dy=b[0]-a[0];
     const denominator=dx*dx+dy*dy;
     const projection=denominator?Math.max(0,Math.min(1,((point[1]-a[1])*latitudeScale*dx+(point[0]-a[0])*dy)/denominator)):0;
     const projected=[a[0]+projection*(b[0]-a[0]),a[1]+projection*(b[1]-a[1])];
     const distance=meters(point,projected);
     if(distance<best){best=distance;index=i;t=projection;}
   }
   let remaining=meters(routePoints[index],routePoints[index+1])*(1-t);
   for(let i=index+1;i<routePoints.length-1;i++)remaining+=meters(routePoints[i],routePoints[i+1]);
   return {distance:best,remaining,index,t,progress:Math.max(0,totalRouteMeters-remaining)};
 }
 function updateProgress(point,accuracy=25){
   if(!activeSite||!safePoint(point))return;
   const destination=coordinates(activeSite);
   const straightDistance=meters(point,destination);
   const goodAccuracy=Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=35;
   const snap=closestOnRoute(point);
   const routeDistance=snap?.remaining??Infinity;
   const onRoute=snap&&snap.distance<=Math.max(35,Math.min(accuracy*1.5,70));
   // A single noisy GPS fix must never claim arrival. Require two consecutive good fixes.
   if(goodAccuracy&&straightDistance<=25&&onRoute&&routeDistance<=45){
     arrivalFixCount++;
     if(arrivalFixCount>=2&&!arrivalShown){
       arrivalShown=true;
       $("raafatRouteNext").textContent="وصلت إلى موقع القطعة ✓";
       $("raafatRouteRemaining").textContent="0 م";
       setStatus("تحقق من موقع اللوحة ورمزها أمامك.");
     }
   }else arrivalFixCount=0;
   if(arrivalShown)return;
   if(!snap||!routePoints.length){
     $("raafatRouteNext").textContent="جاري تحديد مسارك…";
     return;
   }
   if(!goodAccuracy||snap.distance>Math.max(100,accuracy*2.5)){
     $("raafatRouteNext").textContent="جاري التحقق من موقعك على الطريق…";
     $("raafatRouteRemaining").textContent=roadKm(routeDistance/1000);
   }else{
     $("raafatRouteRemaining").textContent=roadKm(routeDistance/1000);
     $("raafatRouteDuration").textContent=durationLabel(routeSeconds*Math.max(0,Math.min(1,routeDistance/Math.max(1,totalRouteMeters))));
     // Next maneuver must be ahead on the actual geometry, not merely the next array item.
     let next=null,nextIndex=-1,nextMeters=Infinity;
     for(let i=0;i<routeManeuvers.length;i++){
       const m=routeManeuvers[i],type=Number(m.type);
       if(START_TYPES.has(type)||DESTINATION_TYPES.has(type)||type===0)continue;
       const shapeIndex=Number(m.begin_shape_index);
       if(!Number.isInteger(shapeIndex)||shapeIndex<0||shapeIndex>=routeOffsets.length)continue;
       const distanceToTurn=routeOffsets[shapeIndex]-snap.progress;
       if(distanceToTurn< -Math.max(12,Math.min(accuracy,30)))continue;
       next=m;nextIndex=i;nextMeters=Math.max(0,distanceToTurn);break;
     }
     if(next){
       const remainingText=roadKm(nextMeters/1000);
       $("raafatRouteNext").textContent=(nextMeters>12?"بعد "+remainingText+" • ":"الآن • ")+instruction(next);
       steps.querySelectorAll(".raafat-route-step").forEach(node=>node.classList.toggle("is-next",node.dataset.stepIndex===String(nextIndex)));
     }else{
       $("raafatRouteNext").textContent=routeDistance<=120?"اقتربت من موقع القطعة":"تابع الطريق باتجاه موقع القطعة";
       steps.querySelectorAll(".raafat-route-step").forEach(node=>node.classList.remove("is-next"));
     }
   }
   if(snap.distance>Math.max(90,2*Math.min(accuracy,60))){
     if(!offRouteSince)offRouteSince=Date.now();
     else if(Date.now()-offRouteSince>10000&&Date.now()-requestTime>45000&&!abort){
       offRouteSince=0;setStatus("خرجت عن الطريق، جاري تحديث المسار…");
       void planRoute(point,true);
     }
   }else{
     offRouteSince=0;
     if(!abort)setStatus("");
   }
 }
 function updateGPS(point,accuracy=25,heading=null){
   if(!activeSite||!goodCoord(point))return;
   const old=lastPoint;lastPoint=point.slice();lastFix=point.slice();
   if(!Number.isFinite(heading)||heading<0){
     heading=old&&meters(old,point)>6?bearing(old,point):lastBearing;
   }
   drawArrow(point,heading);
   $("raafatRouteGpsAccuracy").textContent="GPS ±"+Math.round(accuracy)+" م • يتحدث تلقائياً";
   if(following&&watchId!==null&&!choosing){
     if(meters(point,map.getCenter())>16)map.panTo(point,{animate:false});
   }
   updateProgress(point,accuracy);
 }
 const endpoint=String(window.RAAFAT_CONFIG?.routingApiUrl||"https://valhalla1.openstreetmap.de").replace(/\/+$/,"");
 const demo=/^https:\/\/valhalla\d?\.openstreetmap\.de$/i.test(endpoint);
 const setStatus=msg=>{status.textContent=msg;status.hidden=!msg;};
 const navMapArea=map.getContainer().closest(".map-area");
 const visibleNextTurn=(m,distanceMeters)=>{
   const txt=instruction(m);
   return distanceMeters>70 && /وصلت|وجهتك|الوجهة|arriv|destination/i.test(txt)
     ?"تابع المسار حتى موقع القطعة":txt;
 };
 const coordinates=site=>[Number(site.latitude),Number(site.longitude)];
 function cleanRoute(){
  abort?.abort();abort=null;requestId++;
  for(const l of [routeLayer,originMarker,targetMarker])if(l&&map.hasLayer(l))map.removeLayer(l);
  routeLayer=originMarker=targetMarker=null;lastRequested=null;routePoints=[];routeManeuvers=[];routeOffsets=[];totalRouteMeters=0;
 }
 function stopWatch(){if(watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);watchId=null;}
 function clear(){
  cleanRoute();stopWatch();if(arrowMarker&&map.hasLayer(arrowMarker))map.removeLayer(arrowMarker);arrowMarker=null;activeSite=null;starting=null;lastFix=null;lastPoint=null;choosing=false;following=true;offRouteSince=0;arrivalFixCount=0;arrivalShown=false;manualOrigin=false;
  panel.hidden=true;$("raafatRouteChooseStart").hidden=true;
 }
 function setOrigin(point){
  if(!goodCoord(point))return;
  starting=point;
  if(originMarker)originMarker.setLatLng(point);
  else originMarker=window.L.circleMarker(point,{radius:9,fillColor:"#61d8ff",fillOpacity:1,color:"#fff",weight:3,interactive:false}).addTo(map);
 }
 function activateGPS(){
  if(!navigator.geolocation||!window.isSecureContext){
   setStatus("تعذر تحديد GPS؛ حدد بداية الطريق يدوياً.");$("raafatRouteChooseStart").hidden=false;return;
  }
  stopWatch();
  setStatus("جاري طلب موقعك… قد يطلب المتصفح إذن الوصول إلى GPS.");
  watchId=navigator.geolocation.watchPosition(pos=>{
   if(!activeSite)return;
   const point=[Number(pos.coords.latitude),Number(pos.coords.longitude)];
   if(!goodCoord(point))return;
   const accuracy=Number.isFinite(pos.coords.accuracy)?pos.coords.accuracy:50;
   updateGPS(point,accuracy,pos.coords.heading);
   if(!lastRequested&&!abort){void planRoute(point);}
  },err=>{
   setStatus("تعذر تحديد GPS؛ حدد بداية الطريق يدوياً.");$("raafatRouteChooseStart").hidden=false;
   stopWatch();
  },{enableHighAccuracy:true,maximumAge:3000,timeout:20000});
 }
 async function planRoute(from,isReroute=false){
  if(!activeSite||!goodCoord(from))return;
  const dest=coordinates(activeSite);
  if(!goodCoord(dest))return;
  cleanRoute();
  requestTime=Date.now();lastRequested=from.slice();setOrigin(from);
  if(!isReroute){following=true;offRouteSince=0;arrivalShown=false;arrivalFixCount=0;}
  targetMarker=window.L.circleMarker(dest,{radius:10,color:"#fff",weight:3,fillColor:"#edbd76",fillOpacity:1,interactive:false}).addTo(map);
  setStatus("جاري حساب الطريق على شبكة الشوارع…");
  steps.innerHTML="";
  const index=requestId;
  const c=new AbortController();abort=c;
  const timeout=setTimeout(()=>c.abort(),20000);
  const payload={locations:[{lat:from[0],lon:from[1]},{lat:dest[0],lon:dest[1]}],costing:routeMode,units:"km",language:"ar",directions_type:"instructions"};
  try{
   const response=await fetch(endpoint+"/route?json="+encodeURIComponent(JSON.stringify(payload)),{
    method:"GET",signal:c.signal,headers:demo?{"X-Client-Id":"raafat-advertising-map.github.io"}:{}
   });
   if(!response.ok)throw Error(response.status===429?"خدمة المسارات مزدحمة، حاول بعد قليل.":"خدمة المسارات غير متاحة ("+response.status+").");
   const data=await response.json();
   if(index!==requestId||!activeSite)return;
   const leg=data.trip?.legs?.[0],summary=data.trip?.summary;
   if(!leg?.shape||!summary)throw Error("تعذر العثور على مسار طرق لهذه القطعة.");
   const points=decodePolyline6(leg.shape);
   if(points.length<2)throw Error("لم تتوفر بيانات كافية لرسم الطريق.");
   routePoints=points;
   routeManeuvers=Array.isArray(leg.maneuvers)?leg.maneuvers:[];
   routeSeconds=Number(summary.time||leg.summary?.time||0);
   routeOffsets=[0];
   for(let i=1;i<points.length;i++)routeOffsets[i]=routeOffsets[i-1]+meters(points[i-1],points[i]);
   totalRouteMeters=routeOffsets[routeOffsets.length-1]||0;
   routeLayer=window.L.polyline(points,{color:"#f4b95e",opacity:.97,weight:6,lineCap:"round",lineJoin:"round",interactive:false}).addTo(map);
   if(!isReroute)map.fitBounds(routeLayer.getBounds(),{padding:[65,65],maxZoom:16});
   $("raafatRouteDistance").textContent=roadKm(summary.length||leg.summary?.length||0);
   $("raafatRouteDuration").textContent=durationLabel(summary.time||leg.summary?.time||0);
   $("raafatRouteGpsAccuracy").textContent=watchId===null?"نقطة بداية يدوية":"GPS نشط • الموقع يتحدث";
   setStatus("");$("raafatRouteChooseStart").hidden=true;
   const maneuvers=routeManeuvers;
   steps.innerHTML=maneuvers.slice(0,60).map((m,i)=>
    '<li class="raafat-route-step" data-step-index="'+i+'"><span class="raafat-route-number">'+(i+1)+'</span><span><strong>'+esc(instruction(m))+'</strong><small>'+roadKm(m.length||0)+'</small></span></li>').join("")||'<li>اتبع الطريق المرسوم إلى الموقع المحدد.</li>';
   $("raafatRouteNext").textContent="جاري تحديد الانعطاف القادم…";
   updateProgress(lastFix||from);
  }catch(err){
   if(index!==requestId||!activeSite)return;
   $("raafatRouteDistance").textContent="—";$("raafatRouteDuration").textContent="—";
   setStatus("تعذر حساب الطريق. يمكنك إعادة المحاولة.");$("raafatRouteChooseStart").hidden=false;
   steps.innerHTML='<li>لم يتم رسم طريق؛ لن نعرض خطاً مستقيماً على أنه مسار قيادة.</li>';
  }finally{clearTimeout(timeout);if(index===requestId)abort=null;}
 }
 function start(site){
  if(!map||!site)return;
  clear();activeSite=site;panel.hidden=false;following=true;
  $("raafatRouteDestination").textContent=site.code+" • "+site.name;
  $("raafatRouteDistance").textContent="—";$("raafatRouteDuration").textContent="—";
  steps.innerHTML="";$("raafatRouteRemaining").textContent="—";$("raafatRouteNext").textContent="جاري تحديد البداية…";
  setStatus("جاري تحديد موقعك…");$("raafatRouteChooseStart").hidden=false;
  const gps=getLocation();
  if(goodCoord(gps)){setOrigin(gps);void planRoute(gps);}
  activateGPS();
 }
 function chooseStart(){
  if(!activeSite)return;
  choosing=true;
  stopWatch();
  setStatus("اضغط على الخارطة لتحديد البداية.");
  toast("اختر نقطة الانطلاق على الخريطة.");
 }
 function handleMapClick(latlng){
  if(!choosing||!activeSite)return false;
  choosing=false;
  const point=[Number(latlng.lat),Number(latlng.lng)];
  setOrigin(point);drawArrow(point,0);void planRoute(point);
  return true;
 }
 function onLiveLocation(point,accuracy=25,heading=null){
  if(!activeSite||watchId!==null)return;
  if(goodCoord(point)){updateGPS(point,accuracy,heading);if(!lastRequested&&!abort)void planRoute(point);}
 }
 panel.querySelectorAll("[data-route-mode]").forEach(btn=>btn.addEventListener("click",()=>{
   if(!activeSite)return;
   routeMode=btn.dataset.routeMode;
   panel.querySelectorAll("[data-route-mode]").forEach(button=>button.setAttribute("aria-pressed",String(button===btn)));
   const point=lastFix||starting||getLocation();
   if(goodCoord(point))void planRoute(point);
   else activateGPS();
 }));
 $("raafatRouteClose").addEventListener("click",clear);
 $("raafatRouteChooseStart").addEventListener("click",chooseStart);
 $("raafatRouteRefresh").addEventListener("click",()=>{
  const point=lastFix||starting||getLocation();
  if(goodCoord(point))void planRoute(point);
  else activateGPS();
 });
 $("raafatRouteMyLocation").addEventListener("click",()=>{following=true;manualOrigin=false;lastFix=null;activateGPS();});
 $("raafatRouteRecenter").addEventListener("click",()=>{following=true;if(lastFix)map.setView(lastFix,Math.max(16,map.getZoom()),{animate:true});});
 map.on("dragstart",()=>{if(activeSite)following=false;});
 return {start,clear,handleMapClick,isActive:()=>Boolean(activeSite),onLiveLocation};
}
