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
const instruction=(m)=>{
 const text=String(m.instruction||"").trim();
 if(text&&/[؀-ۿ]/.test(text))return text;
 const road=m.street_names?.[0]||m.begin_street_names?.[0]||"الطريق";
 const typ=Number(m.type);
 const actions={
  0:"ابدأ باتجاه "+road,1:"تابع باتجاه "+road,2:"اتجه قليلاً إلى اليمين",3:"انعطف يميناً إلى "+road,
  4:"انعطف بحدة يميناً إلى "+road,5:"استدر للخلف إلى اليمين",6:"استدر للخلف إلى اليسار",
  7:"انعطف بحدة يساراً إلى "+road,8:"انعطف يساراً إلى "+road,9:"اتجه قليلاً إلى اليسار",
  10:"تابع مباشرةً على "+road,11:"ادخل الدوار",12:"اخرج من الدوار",13:"وصلت إلى الوجهة",
  14:"وصلت إلى الوجهة",15:"وصلت إلى الوجهة",16:"واصل السير",17:"ادخل الطريق السريع",
  18:"اخرج من الطريق السريع"
 };
 return actions[typ]||"تابع عبر "+road;
};
export function createRaafatNavigation({map,getSite,getLocation,toast}){
 const panel=$("raafatRoutePanel"),steps=$("raafatRouteSteps"),status=$("raafatRouteStatus");
 let routeLayer=null,originMarker=null,targetMarker=null,activeSite=null,starting=null;
 let choosing=false,requestId=0,abort=null,watchId=null,lastFix=null,lastRequested=null,requestTime=0;
 const endpoint=String(window.RAAFAT_CONFIG?.routingApiUrl||"https://valhalla1.openstreetmap.de").replace(/\/+$/,"");
 const demo=/^https:\/\/valhalla\d?\.openstreetmap\.de$/i.test(endpoint);
 const setStatus=msg=>{status.textContent=msg;};
 const coordinates=site=>[Number(site.latitude),Number(site.longitude)];
 function cleanRoute(){
  abort?.abort();abort=null;requestId++;
  for(const l of [routeLayer,originMarker,targetMarker])if(l&&map.hasLayer(l))map.removeLayer(l);
  routeLayer=originMarker=targetMarker=null;lastRequested=null;
 }
 function stopWatch(){if(watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);watchId=null;}
 function clear(){
  cleanRoute();stopWatch();activeSite=null;starting=null;lastFix=null;choosing=false;
  panel.hidden=true;$("raafatRouteChooseStart").hidden=false;
 }
 function setOrigin(point){
  if(!goodCoord(point))return;
  starting=point;
  if(originMarker)originMarker.setLatLng(point);
  else originMarker=window.L.circleMarker(point,{radius:9,fillColor:"#61d8ff",fillOpacity:1,color:"#fff",weight:3,interactive:false}).addTo(map);
 }
 function activateGPS(){
  if(!navigator.geolocation||!window.isSecureContext){
   setStatus("تحديد موقعك يحتاج متصفح HTTPS وإذن الموقع. يمكنك اختيار نقطة البداية من الخارطة.");return;
  }
  stopWatch();
  setStatus("جاري طلب موقعك… قد يطلب المتصفح إذن الوصول إلى GPS.");
  watchId=navigator.geolocation.watchPosition(pos=>{
   if(!activeSite)return;
   const point=[Number(pos.coords.latitude),Number(pos.coords.longitude)];
   if(!goodCoord(point))return;
   lastFix=point;setOrigin(point);
   if(!lastRequested){void planRoute(point);}
   else if(routeLayer){
    // Manual refresh avoids unnecessary requests and demo-service overload.
    $("raafatRouteGpsAccuracy").textContent="GPS ±"+Math.round(pos.coords.accuracy||0)+" م • موقعك يتحدث مباشرة";
   }
  },err=>{
   setStatus(err.code===1?"تم رفض إذن الموقع؛ اختر بداية الطريق يدوياً من الخارطة.":"تعذر تحديد موقعك. حاول من مكان مفتوح أو اختر نقطة البداية يدوياً.");
   stopWatch();
  },{enableHighAccuracy:true,maximumAge:3000,timeout:20000});
 }
 async function planRoute(from){
  if(!activeSite||!goodCoord(from))return;
  const dest=coordinates(activeSite);
  if(!goodCoord(dest))return;
  cleanRoute();
  lastRequested=from.slice();setOrigin(from);
  targetMarker=window.L.circleMarker(dest,{radius:10,color:"#fff",weight:3,fillColor:"#edbd76",fillOpacity:1,interactive:false}).addTo(map);
  setStatus("جاري حساب الطريق على شبكة الشوارع…");
  steps.innerHTML="";
  const index=requestId;
  const c=new AbortController();abort=c;
  const timeout=setTimeout(()=>c.abort(),20000);
  const payload={locations:[{lat:from[0],lon:from[1]},{lat:dest[0],lon:dest[1]}],costing:"auto",units:"km",language:"ar",directions_type:"instructions"};
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
   routeLayer=window.L.polyline(points,{color:"#f4b95e",opacity:.97,weight:6,lineCap:"round",lineJoin:"round",interactive:false}).addTo(map);
   map.fitBounds(routeLayer.getBounds(),{padding:[65,65],maxZoom:16});
   $("raafatRouteDistance").textContent=roadKm(summary.length||leg.summary?.length||0);
   $("raafatRouteDuration").textContent=durationLabel(summary.time||leg.summary?.time||0);
   $("raafatRouteGpsAccuracy").textContent=watchId===null?"نقطة بداية يدوية":"GPS نشط • الموقع يتحدث";
   setStatus("تم حساب طريق القيادة. اتبع تعليمات الطريق مع الانتباه للوحات المرورية الفعلية.");
   const maneuvers=Array.isArray(leg.maneuvers)?leg.maneuvers:[];
   steps.innerHTML=maneuvers.slice(0,60).map((m,i)=>
    '<li class="raafat-route-step"><span class="raafat-route-number">'+(i+1)+'</span><span><strong>'+esc(instruction(m))+'</strong><small>'+roadKm(m.length||0)+'</small></span></li>').join("")||'<li>اتبع الطريق المرسوم إلى الموقع المحدد.</li>';
  }catch(err){
   if(index!==requestId||!activeSite)return;
   $("raafatRouteDistance").textContent="—";$("raafatRouteDuration").textContent="—";
   setStatus(err.name==="AbortError"?"انتهت مهلة خدمة المسارات؛ جرّب مجدداً.":err.message||"تعذر حساب الطريق.");
   steps.innerHTML='<li>لم يتم رسم طريق؛ لن نعرض خطاً مستقيماً على أنه مسار قيادة.</li>';
  }finally{clearTimeout(timeout);if(index===requestId)abort=null;}
 }
 function start(site){
  if(!map||!site)return;
  clear();activeSite=site;panel.hidden=false;
  $("raafatRouteDestination").textContent=site.code+" • "+site.name;
  $("raafatRouteDistance").textContent="—";$("raafatRouteDuration").textContent="—";
  steps.innerHTML="";
  setStatus("اختر نقطة الانطلاق أو اسمح بالوصول لموقعك لحساب طريق القيادة.");
  const gps=getLocation();
  if(goodCoord(gps)){setOrigin(gps);void planRoute(gps);}
  activateGPS();
 }
 function chooseStart(){
  if(!activeSite)return;
  choosing=true;
  stopWatch();
  setStatus("اضغط على مكان بداية رحلتك فوق الخارطة، وسيتم حساب الطريق منه.");
  toast("اختر نقطة الانطلاق على الخريطة.");
 }
 function handleMapClick(latlng){
  if(!choosing||!activeSite)return false;
  choosing=false;
  const point=[Number(latlng.lat),Number(latlng.lng)];
  setOrigin(point);void planRoute(point);
  return true;
 }
 function onLiveLocation(point){if(!activeSite||watchId!==null)return;if(goodCoord(point))lastFix=point;}
 $("raafatRouteClose").addEventListener("click",clear);
 $("raafatRouteChooseStart").addEventListener("click",chooseStart);
 $("raafatRouteRefresh").addEventListener("click",()=>{
  const point=lastFix||starting||getLocation();
  if(goodCoord(point))void planRoute(point);
  else activateGPS();
 });
 $("raafatRouteMyLocation").addEventListener("click",()=>{lastFix=null;activateGPS();});
 return {start,clear,handleMapClick,isActive:()=>Boolean(activeSite),onLiveLocation};
}
