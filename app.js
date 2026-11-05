import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { fetchRaafatMapStyle } from "./brand-map.js";
import { createGoogleMapLayer } from "./google-basemap.js";
import { createAdminDashboard } from "./admin-dashboard.js";
// The ?admin=1 entry URL is only a private UI shortcut; actual authorization uses Supabase Auth + staff RLS.
const ADMIN_ENTRY = new URLSearchParams(window.location.search).get("admin") === "1";

const COMPANY = "شركة رأفت للدعاية والإعلان والتجارة العامة";
const types = {billboard:"بيلبورد",unipole:"يوني بول",led:"شاشة LED",bridge:"إعلان جسر",wall:"جدارية",building:"على بناية / واجهة مبنى",sidewalk:"لوحة رصيف",other:"أخرى"};
const REGIONS = Object.freeze({"صلاح الدين":["تكريت","بيجي","الدور","سامراء","الشرقاط","العلم","بلد"],"كركوك":["كركوك"]});

const CITY_CENTERS = Object.freeze({
  "تكريت":[34.6158,43.6786],
  "بيجي":[34.92915,43.48878],
  "الدور":[34.4560,43.7934],
  "سامراء":[34.1959,43.8857],
  "الشرقاط":[35.5172,43.2281],
  "العلم":[34.709,43.6951],
  "بلد":[34.01485,44.14574],
  "كركوك":[35.4719,44.3954]
});
const sizeKey = s => Number(s.width_m)+"x"+Number(s.height_m);
const statuses = { available:"متاحة",reserved:"محجوزة",booked:"مؤجرة",maintenance:"صيانة"};
const byId = id => document.getElementById(id);
const el = byId;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = value => Number(value).toLocaleString("ar-IQ",{maximumFractionDigits:2});
const number = value => Number(value);
const config = window.RAAFAT_CONFIG || {};
const hasConfig = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || "") && String(config.supabaseAnonKey || "").length > 20;
const db = hasConfig ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
 auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
}) : null;

const state = {
 sites: [], selected: null, editorId: null, staff: false, user: null, map: null,
 markers: null, markerById:new Map(), pick:false, photoUrls: new Map(), busy:false, galleryIndex:0,
 basemap: null, cityLabels: null, cityBeacon: null, fallbackTilesLoaded: false, showFallback: false,
 locationWatchId:null,locationGeneration:0,followLocation:false,lastLocation:null,gpsMarker:null,gpsAccuracy:null,
 staffRole:null,siteSettings:null,googleActive:false
};
let toastTimeout;
let adminDashboard=null;

function toast(message){
 const box = el("toast");
 box.textContent = message;
 box.hidden = false;
 clearTimeout(toastTimeout);
 toastTimeout = setTimeout(() => box.hidden = true, 4500);
}
function alertBanner(message){
 const banner=el("systemAlert");
 banner.hidden = !message; banner.textContent=message || "";
}
function openModal(id){el(id).hidden=false;document.body.classList.add("modal-open")}
function closeModal(id){el(id).hidden=true;document.body.classList.remove("modal-open")}
function actionBusy(b){state.busy=b;el("saveButton").disabled=b;el("saveButton").textContent=b?"جاري الحفظ...":"حفظ القطعة"}
function validCoords(lat,lng){return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180}
function getCoords(str){
 const match=String(str).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,،]\s*(-?\d+(?:\.\d+)?)$/);
 if(!match)return null;
 const lat=Number(match[1]),lng=Number(match[2]);
 return validCoords(lat,lng) ? {latitude:lat,longitude:lng}:null;
}
/**
 * Configure RTL shaping before the vector style loads. This bundled MapLibre
 * 2.x build requires the shaping plugin; without it Arabic glyphs become split.
 */
async function enableArabicMapLabels(){
 const gl=window.maplibregl;
 if(!gl||typeof gl.setRTLTextPlugin!=="function")return false;
 const status=gl.getRTLTextPluginStatus?.();
 if(status==="loaded")return true;
 if(status==="error")return false;
 const url="https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js";
 return new Promise(resolve=>{
   let settled=false;
   const done=success=>{
     if(settled)return;
     settled=true;
     clearTimeout(timer);
     resolve(success);
   };
   const timer=setTimeout(()=>done(false),5000);
   try{
     const attempt=gl.setRTLTextPlugin(url,err=>done(!err),false);
     if(attempt&&typeof attempt.then==="function"){
       attempt.then(()=>done(true),()=>done(false));
     }
   }catch(error){
     console.warn("Arabic map text plugin failed:",error);
     done(false);
   }
 });
}
function finishMapReveal(){
 const cover=el("mapReveal");
 if(!cover||cover.classList.contains("is-ready"))return;
 cover.classList.add("is-ready");
 cover.setAttribute("aria-hidden","true");
 window.setTimeout(()=>{cover.hidden=true;},640);
}
function revealFallbackIfReady(){
 state.showFallback=true;
 if(state.fallbackTilesLoaded){
   finishMapReveal();
 }else{
   // Never leave visitors behind a loading overlay if a tile service stalls.
   window.setTimeout(finishMapReveal,4500);
 }
}
function directionsToSite(site){
 if(!site||!validCoords(Number(site.latitude),Number(site.longitude)))return "";
 const coordinates=Number(site.latitude)+","+Number(site.longitude);
 return "https://www.google.com/maps/dir/?api=1&destination="+
   encodeURIComponent(coordinates)+"&travelmode=driving&dir_action=navigate";
}
/**
 * Only one curated regional beacon appears within the viewport at a time.
 * It is a location highlight, not an administrative-boundary polygon.
 */
/**
 * Premium interactive district beacons over the map.
 * Uses the real city centers as navigation anchors, not invented billboard pins.
 * Every beacon has an Arabic HTML label (no broken vector glyphs) and only
 * visible, non-overlapping markers are mounted at each zoom.
 */
/**
 * Fixed-coordinate VIP district markers.
 * Leaflet anchors each golden dot directly at the city coordinates. Nothing
 * moves the root icon with CSS or when the zoom changes. Only rings animate.
 * Label collision may hide a card, but never moves/removes the geographic dot.
 */
/**
 * Interactive VIP district names with collision-free callouts.
 * Every marker is geographically anchored to its real city coordinate.
 * If two city names would overlap at a distant zoom, we move only the
 * decorative name card and draw a hairline back to the stationary gold dot.
 * We NEVER hide a name merely because of label collision.
 */
function addPersistentCityLabels(){
 if(!state.map||state.cityLabels)return;
 const L=window.L;
 const map=state.map;
 const pane=map.createPane("raafatCities");
 pane.style.zIndex="455";
 pane.style.pointerEvents="auto";
 const group=L.layerGroup().addTo(map);
 const beacons=new Map();
 const cities=Object.entries(CITY_CENTERS);
 cities.forEach(([city,coords],i)=>{
   const governorate=REGIONS["كركوك"].includes(city)?"كركوك":"صلاح الدين";
   const html='<div class="vip-district-beacon" style="--vip-delay:'+((i%5)*.46).toFixed(2)+'s">'+
     '<span class="vip-beacon-wave wave-one" aria-hidden="true"></span>'+
     '<span class="vip-beacon-wave wave-two" aria-hidden="true"></span>'+
     '<span class="vip-beacon-link" aria-hidden="true"></span>'+
     '<span class="vip-beacon-point" aria-hidden="true"><i></i></span>'+
     '<span class="vip-beacon-label" lang="ar" dir="rtl">'+
       '<strong>'+escapeHtml(city)+'</strong>'+
       '<small>'+escapeHtml(governorate)+'</small>'+
     '</span></div>';
   // The gold anchor stays at [lat,lng]. The inner label alone may be offset.
   const icon=L.divIcon({
     className:"vip-district-marker",
     html,iconSize:[144,76],iconAnchor:[72,38]
   });
   const marker=L.marker(coords,{
     icon,pane:"raafatCities",interactive:true,keyboard:true,
     title:"عرض المواقع الإعلانية في "+city,
     riseOnHover:true,riseOffset:200
   });
   marker.on("click",()=>{
     if(state.pick)return;
     el("governorateFilter").value=governorate;
     renderCityOptions();
     el("cityFilter").value=city;
     state.selected=null;
     render();
     zoomAll();
   });
   group.addLayer(marker);
   beacons.set(city,{marker,coords,governorate});
 });
 const update=()=>{
   if(!state.map)return;
   const size=map.getSize();
   const focusedSite=state.sites.find(site=>site.id===state.selected);
   const selectedCity=el("cityFilter").value;
   const focus=focusedSite&&CITY_CENTERS[focusedSite.city]?focusedSite.city:
     CITY_CENTERS[selectedCity]?selectedCity:null;
   const entries=[...beacons].map(([city,data],index)=>({
     city,index,...data,screen:map.latLngToContainerPoint(data.coords)
   }));
   // Deterministic placement order: focused name first, then the city list.
   entries.sort((a,b)=>Number(b.city===focus)-Number(a.city===focus)||a.index-b.index);
   const placed=[];
   const margin=9;
   const candidates=[[0,0]];
   // Search outward only when cards genuinely overlap. The dot never moves.
   for(const radius of [66,102,138,176,215,260]){
     for(let step=0;step<12;step++){
       const angle=(-90+step*30)*Math.PI/180;
       candidates.push([Math.round(Math.cos(angle)*radius),Math.round(Math.sin(angle)*radius)]);
     }
   }
   for(const {city,marker,screen} of entries){
     const dom=marker.getElement();
     if(!dom)continue;
     const label=dom.querySelector(".vip-beacon-label");
     if(!label)continue;
     // A district outside the visible map remains in the Leaflet layer;
     // there is no reason to place its callout over unrelated visible places.
     const onScreen=screen.x>=-16&&screen.x<=size.x+16&&
                    screen.y>=-16&&screen.y<=size.y+16;
     const width=Math.max(108,Math.ceil(label.offsetWidth||116));
     const height=Math.max(49,Math.ceil(label.offsetHeight||52));
     let best=null;
     if(onScreen){
       for(const [dx,dy] of candidates){
         const x=screen.x+dx,y=screen.y+dy;
         const rect={left:x-width/2-margin,right:x+width/2+margin,
           top:y-height/2-margin,bottom:y+height/2+margin};
         const outside=Math.max(0,12-rect.left)+Math.max(0,rect.right-(size.x-12))+
           Math.max(0,12-rect.top)+Math.max(0,rect.bottom-(size.y-12));
         let overlap=0;
         for(const p of placed){
           const w=Math.max(0,Math.min(rect.right,p.right)-Math.max(rect.left,p.left));
           const h=Math.max(0,Math.min(rect.bottom,p.bottom)-Math.max(rect.top,p.top));
           overlap+=w*h;
         }
         // Strongly avoid collisions / clipping, then prefer shorter links.
         const dist=Math.hypot(dx,dy);
         const score=overlap*32+outside*240+dist;
         if(!best||score<best.score)best={dx,dy,rect,score,overlap,outside};
         if(overlap===0&&outside===0&&dist===0)break;
       }
     }
     const dx=best?.dx||0,dy=best?.dy||0;
     if(best)placed.push(best.rect);
     dom.classList.remove("vip-label-muted");
     dom.classList.toggle("vip-district-active",city===focus);
     dom.classList.toggle("vip-card-linked",Math.hypot(dx,dy)>14);
     dom.style.setProperty("--vip-card-x",dx+"px");
     dom.style.setProperty("--vip-card-y",dy+"px");
     dom.style.setProperty("--vip-link-length",Math.hypot(dx,dy).toFixed(1)+"px");
     dom.style.setProperty("--vip-link-angle",Math.atan2(dy,dx)*180/Math.PI+"deg");
     dom.setAttribute("aria-label",city+"، "+(REGIONS["كركوك"].includes(city)?"كركوك":"صلاح الدين"));
   }
   const heading=el("mapRegionLabel");
   if(heading){
     heading.textContent=focus||"";
     heading.hidden=!focus;
   }
 };
 state.cityLabels=group;
 state.updateCityFocus=update;
 map.on("moveend zoomend resize",update);
 update();
}

async function installGoogleBasemap(){
 // Kept behind a configured browser key so we never incur Google charges
 // before the owner finishes quotas, billing and key restrictions.
 try{
   const layer=await createGoogleMapLayer(String(config.googleMapsApiKey||"").trim());
   if(!state.map)return;
   const map=state.map;
   let completed=false;
   const timeout=window.setTimeout(()=>complete(false),14000);
   function complete(success){
     if(completed)return;
     completed=true;clearTimeout(timeout);
     if(!success){
       if(map.hasLayer(layer))map.removeLayer(layer);
       console.warn("Google basemap unavailable; restoring the existing Raafat map.");
       void installRaafatPremiumMap();
       return;
     }
     if(!map.hasLayer(layer))return;
     if(state.basemap&&map.hasLayer(state.basemap))map.removeLayer(state.basemap);
     state.basemap=layer;
     state.googleActive=true;
     map.setMaxZoom(21);
     if(map.getZoom()>21)map.setZoom(21);
     state.cityLabels?.clearLayers();
     state.cityBeacon=null;
     document.body.classList.add("google-map-active");
     finishMapReveal();
   }
   layer.once("load",()=>complete(true));
   layer.once("tileerror",()=>console.warn("Google tiles are still loading."));
   layer.addTo(map);
 }catch(error){
   console.warn("Google Maps could not be started:",error);
   void installRaafatPremiumMap();
 }
}

async function installRaafatPremiumMap(){
 if(!state.map||!window.maplibregl||typeof window.L.maplibreGL!=="function"
    ||(typeof window.maplibregl.supported==="function"&&!window.maplibregl.supported())){
   console.warn("Vector WebGL unavailable; using the branded raster fallback.");
   revealFallbackIfReady();
   return;
 }
 try{
   const arabicEnabled=await enableArabicMapLabels();
   if(!arabicEnabled)console.warn("RTL plugin unavailable. Fallback Latin labels and persistent Arabic city labels are enabled.");
   const style=await fetchRaafatMapStyle(config.cartoApiKey,{arabicEnabled});
   if(!state.map)return;
   const layer=window.L.maplibreGL({style,interactive:false,padding:.12});
   layer.addTo(state.map);
   const renderer=layer.getMaplibreMap?.();
   if(!renderer){
     state.map.removeLayer(layer);
     throw new Error("No MapLibre renderer instance");
   }
   let ready=false;
   const fallback=()=>{
     if(ready)return;
     ready=true;
     clearTimeout(timeout);
     if(state.map?.hasLayer(layer))state.map.removeLayer(layer);
     console.warn("Raafat vector tiles unavailable; fallback remains active.");
     revealFallbackIfReady();
   };
   const timeout=setTimeout(fallback,12000);
   renderer.on("error",event=>{
     // A single missing POI glyph or a transient tile error must not
     // disable the entire branded map. The startup timeout handles failures.
     console.warn("Raafat vector renderer:",event.error||event);
   });
   const onReady=()=>{
     if(ready)return;
     ready=true;
     clearTimeout(timeout);
     if(!state.map)return;
     if(state.basemap&&state.map.hasLayer(state.basemap))state.map.removeLayer(state.basemap);
     state.basemap=layer;
     finishMapReveal();
   };
   renderer.once("load",onReady);
   if(renderer.loaded())onReady();
 }catch(err){
   console.warn("Cannot initialize the premium Raafat map:",err);
   revealFallbackIfReady();
 }
}
/**
 * Visitor live position stays in browser memory only: it is never written to
 * Supabase, the URL, or any external application.
 * Tracking starts exclusively after a visitor presses "موقعي الحالي".
 */
function updateLiveLocationUI(message=""){
 const tracking=state.locationWatchId!==null;
 const follow=tracking&&state.followLocation;
 const button=el("locateMe");
 button.classList.toggle("is-tracking",tracking);
 button.classList.toggle("is-following",follow);
 button.setAttribute("aria-pressed",String(tracking));
 button.title=tracking?(follow?"تتبع موقعي بشكل مباشر":"إعادة توسيط الخريطة على موقعي"):"عرض موقعي على الخريطة";
 el("locationButtonText").textContent=tracking?(follow?"جارٍ تتبع موقعي":"توسيط موقعي"):"موقعي الحالي";
 el("stopLocation").hidden=!tracking;
 const status=el("locationStatus");
 status.textContent=message;
 status.hidden=!message;
}
function stopLiveLocationTracking(){
 state.locationGeneration++;
 if(state.locationWatchId!==null && navigator.geolocation){
   navigator.geolocation.clearWatch(state.locationWatchId);
 }
 state.locationWatchId=null;
 state.followLocation=false;
 state.lastLocation=null;
 if(state.map){
   if(state.gpsMarker)state.map.removeLayer(state.gpsMarker);
   if(state.gpsAccuracy)state.map.removeLayer(state.gpsAccuracy);
 }
 state.gpsMarker=null;
 state.gpsAccuracy=null;
 updateLiveLocationUI("");
}
function startLiveLocationTracking(){
 if(!state.map){toast("الخريطة غير متاحة حالياً.");return;}
 if(!window.isSecureContext || !navigator.geolocation){
   toast("تحديد الموقع يحتاج متصفحاً يدعم GPS واتصال HTTPS.");
   return;
 }
 if(state.locationWatchId!==null){
   state.followLocation=true;
   if(state.lastLocation)state.map.flyTo(state.lastLocation,Math.max(16,state.map.getZoom()),{animate:true,duration:.6});
   updateLiveLocationUI(state.lastLocation?"تحديث الموقع مباشر":"جاري تحديد الموقع…");
   return;
 }
 state.followLocation=true;
 const generation=++state.locationGeneration;
 const pane=state.map.getPane("raafatGps")||state.map.createPane("raafatGps");
 pane.style.zIndex="625";
 updateLiveLocationUI("جاري طلب إذن الموقع…");
 const onPosition=position=>{
   if(generation!==state.locationGeneration||!state.map)return;
   const coords=position.coords;
   const lat=Number(coords.latitude),lng=Number(coords.longitude);
   if(!validCoords(lat,lng))return;
   const point=[lat,lng];
   const firstFix=!state.gpsMarker;
   const accuracy=Number.isFinite(coords.accuracy)?Math.max(5,coords.accuracy):100;
   if(firstFix){
     state.gpsAccuracy=window.L.circle(point,{
       radius:Math.min(accuracy,15000),color:"#69d8ff",weight:1,
       opacity:.65,fillColor:"#69d8ff",fillOpacity:.10,
       interactive:false,pane:"raafatGps"
     }).addTo(state.map);
     state.gpsMarker=window.L.marker(point,{
       pane:"raafatGps",interactive:false,keyboard:false,
       icon:window.L.divIcon({
         className:"raafat-gps-icon",
         html:'<div class="raafat-gps-point"><span></span></div>',
         iconSize:[32,32],iconAnchor:[16,16]
       })
     }).addTo(state.map);
   }else{
     state.gpsMarker.setLatLng(point);
     state.gpsAccuracy.setLatLng(point).setRadius(Math.min(accuracy,15000));
   }
   state.lastLocation=point;
   if(state.followLocation){
     if(firstFix){
       state.map.flyTo(point,Math.max(16,state.map.getZoom()),{animate:true,duration:.65});
     }else if(state.map.distance(state.map.getCenter(),point)>25){
       state.map.panTo(point,{animate:true,duration:.35});
     }
   }
   const formatted=accuracy>=1000?"±"+(accuracy/1000).toFixed(1)+" كم":"±"+Math.round(accuracy)+" م";
   updateLiveLocationUI("موقع مباشر • الدقة "+formatted);
 };
 const onError=error=>{
   if(generation!==state.locationGeneration)return;
   const message=error.code===1?
      "السماح بالموقع مرفوض. فعّله من إعدادات المتصفح.":
      error.code===2?"تعذّر تحديد الموقع. تأكد من تشغيل GPS.":"ننتظر إشارة الموقع من الجهاز…";
   if(error.code===1)stopLiveLocationTracking();
   updateLiveLocationUI(message);
 };
 try{
   state.locationWatchId=navigator.geolocation.watchPosition(onPosition,onError,{
     enableHighAccuracy:true,maximumAge:1000,timeout:20000
   });
   updateLiveLocationUI("بانتظار إشارة الموقع…");
 }catch(error){
   stopLiveLocationTracking();
   toast("تعذّر بدء تحديد الموقع من المتصفح.");
 }
}

function initializeMap(){
 if(!window.L){alertBanner("تعذر تحميل مكتبة الخريطة. تحقق من اتصال الإنترنت.");finishMapReveal();return;}
 const L=window.L;
 state.map=L.map("map",{zoomControl:false,preferCanvas:true,minZoom:2,maxZoom:22})
   .setView(CITY_CENTERS["تكريت"],11);
 // Show the same detailed standard cartography visitors see on OpenStreetMap.
 // Keep labels and POIs intact; do not rewrite vector symbol layers.
 const osm=window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
   attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
   maxNativeZoom:19,
   maxZoom:22,
   minZoom:2,
   keepBuffer:2,
   updateWhenIdle:true,
   className:"osm-standard-tile"
 });
 osm.on("load",()=>{
   state.fallbackTilesLoaded=true;
   // Keep the formal loading screen until the custom map is ready.
   if(state.showFallback)finishMapReveal();
 });
 osm.on("tileerror",event=>{
   console.warn("Standard OSM tiles unavailable:",event);
 });
 osm.addTo(state.map);
 state.basemap=osm;
 document.body.classList.remove("osm-standard-map");
 document.body.classList.add("raafat-signature-map");
 // Show original OpenStreetMap tiles only when premium vector map fails.
 window.setTimeout(()=>{
   if(!state.map||state.basemap!==osm)return;
   revealFallbackIfReady();
 },14000);
 L.control.zoom({position:"bottomright"}).addTo(state.map);
 state.markers=L.markerClusterGroup
   ? L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:42,chunkedLoading:true,disableClusteringAtZoom:16})
   : L.layerGroup();
 state.map.addLayer(state.markers);
 addPersistentCityLabels();
 state.map.on("click",event=>{
   if(!state.pick)return;
   const {lat,lng}=event.latlng;
   el("fCoords").value=lat.toFixed(7)+", "+lng.toFixed(7);
   state.pick=false;el("mapPicking").hidden=true;
   openModal("siteModal");
   toast("تم تحديد الإحداثيات؛ راجعها قبل الحفظ.");
 });
 el("mapHome").addEventListener("click",()=>zoomAll(true));
 // Consent is requested only by the location button, never during page load.
 window.L.DomEvent.disableClickPropagation(el("liveLocationControl"));
 window.L.DomEvent.disableScrollPropagation(el("liveLocationControl"));
 el("locateMe").addEventListener("click",startLiveLocationTracking);
 el("stopLocation").addEventListener("click",stopLiveLocationTracking);
 state.map.on("dragstart",()=>{
   if(state.locationWatchId!==null){
     state.followLocation=false;
     updateLiveLocationUI("الموقع مستمر • اضغط لتوسيط الخريطة");
   }
 });
 window.addEventListener("pagehide",stopLiveLocationTracking,{once:true});
 el("mapSiteDetails").addEventListener("click",()=>{
   el("siteDetails").scrollIntoView({behavior:"smooth",block:"nearest"});
 });
 el("cancelPick").addEventListener("click",()=>{
   state.pick=false;el("mapPicking").hidden=true;openModal("siteModal");
 });
 // The older emerald custom style is back; OSM stays intact as fallback.
 void installRaafatPremiumMap();
}

function zoomAll(defaultOnly=false){
 if(!state.map)return;
 const visible=filteredSites();
 if(!visible.length){
   const city=el("cityFilter").value;
   const governorate=el("governorateFilter").value;
   if(!city&&!governorate){
     // Premium regional network overview; no invented billboard sites.
     const bounds=window.L.latLngBounds(Object.values(CITY_CENTERS));
     state.map.fitBounds(bounds,{padding:[58,68],maxZoom:9,animate:true});
     return;
   }
   if(!city&&governorate==="صلاح الدين"){
     const bounds=window.L.latLngBounds(REGIONS["صلاح الدين"].map(name=>CITY_CENTERS[name]));
     state.map.fitBounds(bounds,{padding:[50,58],maxZoom:10,animate:true});
     return;
   }
   const focus=CITY_CENTERS[city]||CITY_CENTERS["كركوك"];
   const zoom=city?14:12;
   state.map.setView(focus,zoom);
   return;
 }
 if(visible.length===1)state.map.setView([visible[0].latitude,visible[0].longitude],14);
 else state.map.fitBounds(window.L.latLngBounds(visible.map(s=>[s.latitude,s.longitude])),{padding:[45,45],maxZoom:14});
}

function filteredSites(){
 const query=el("search").value.trim().toLocaleLowerCase();
 const gov=el("governorateFilter").value;
 const city=el("cityFilter").value;
 const type=el("typeFilter").value;
 const status=el("statusFilter").value;
 const size=el("sizeFilter").value;
 return state.sites.filter(s=>
   (!query||[s.name,s.code,s.city,s.governorate,s.area,s.street,s.landmark,s.description].some(v=>String(v||"").toLocaleLowerCase().includes(query)))
   && (!gov||s.governorate===gov)
   && (!city||s.city===city)
   && (!type||s.type===type)
   && (!status||s.status===status)
   && (!size||sizeKey(s)===size)
 );
}
function badge(s){
 return '<span class="status '+escapeHtml(s.status)+'">'+escapeHtml(statuses[s.status]||s.status)+'</span>';
}
function renderCityOptions(){
 const gov=el("governorateFilter").value;
 const current=el("cityFilter").value;
 const cities=gov?(REGIONS[gov]||[]):Object.values(REGIONS).flat();
 el("cityFilter").innerHTML='<option value="">جميع المدن</option>'+
   cities.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join("");
 el("cityFilter").value=cities.includes(current)?current:"";
}
function renderAdminCities(selectedCity=""){
 const gov=el("fGovernorate").value;
 const cities=REGIONS[gov]||[];
 el("fCity").innerHTML=cities.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join("");
 el("fCity").value=cities.includes(selectedCity)?selectedCity:(cities[0]||"");
}
function renderFilters(){
 renderCityOptions();
 const selectedSize=el("sizeFilter").value;
 const dims=[...new Map(state.sites.map(s=>[sizeKey(s),s])).entries()]
   .sort((a,b)=>(Number(a[1].width_m)*Number(a[1].height_m))-(Number(b[1].width_m)*Number(b[1].height_m)));
 el("sizeFilter").innerHTML='<option value="">جميع القياسات</option>'+
   dims.map(([key,s])=>'<option value="'+escapeHtml(key)+'">'+format(s.width_m)+' × '+format(s.height_m)+' م</option>').join("");
 el("sizeFilter").value=dims.some(([key])=>key===selectedSize)?selectedSize:"";
}
function renderCityChips(){
 const active=el("cityFilter").value;
 const parts=[];
 for(const [gov,cities] of Object.entries(REGIONS)){
   for(const city of cities){
     const count=state.sites.filter(s=>s.governorate===gov&&s.city===city).length;
     parts.push('<button class="city-chip '+(active===city?'active':'')+'" type="button" data-city="'+escapeHtml(city)+'" data-governorate="'+escapeHtml(gov)+'" title="'+escapeHtml(gov)+'">'+
       '<span>'+escapeHtml(city)+'</span><b>'+count+'</b></button>');
   }
 }
 el("cityChips").innerHTML=parts.join("");
 el("cityChips").querySelectorAll("[data-city]").forEach(btn=>btn.addEventListener("click",()=>{
   const wasActive=el("cityFilter").value===btn.dataset.city;
   el("governorateFilter").value=wasActive?"":btn.dataset.governorate;
   renderCityOptions();
   el("cityFilter").value=wasActive?"":btn.dataset.city;
   render();
   zoomAll();
 }));
}
function initializeCatalogLayout(){
 const filters=el("advancedFilters");
 if(!filters)return;
 const mobile=window.matchMedia("(max-width: 850px)");
 filters.open=!mobile.matches;
 const handleChange=event=>{filters.open=!event.matches;};
 if(typeof mobile.addEventListener==="function"){
   mobile.addEventListener("change",handleChange);
 }else if(typeof mobile.addListener==="function"){
   mobile.addListener(handleChange);
 }
}
function render(){
 renderCityChips();
 const sites=filteredSites();
 el("allCount").textContent=state.sites.length;
 el("availableCount").textContent=state.sites.filter(s=>s.status==="available").length;
 el("cityCount").textContent=Object.values(REGIONS).flat().length;
 el("showingCount").textContent=sites.length+" قطعة";
 el("mapCount").textContent=sites.length;
 el("listing").innerHTML=sites.length ? sites.map(s=>
  '<button type="button" class="location-card '+(state.selected===s.id?'active':'')+'" data-site="'+escapeHtml(s.id)+'">'+
   '<div class="card-row"><strong>'+escapeHtml(s.name)+'</strong>'+badge(s)+'</div>'+
   '<small>'+escapeHtml(s.code)+' • '+escapeHtml(s.governorate||"صلاح الدين")+' / '+escapeHtml(s.city)+(s.published?'':' <span class="draft">• مسودة غير منشورة</span>')+'</small>'+
   '<div class="card-meta"><span>'+format(s.width_m)+' × '+format(s.height_m)+' م</span><span>'+escapeHtml(types[s.type]||s.type)+'</span><span>'+escapeHtml(s.area||s.landmark||"")+'</span></div>'+
  '</button>'
 ).join("") : '<div class="empty">لا توجد قطع مطابقة. '+(state.staff?'يمكن إضافة قطعة من زر «إضافة موقع».':'غيّر الفلاتر لعرض قطع أخرى.')+'</div>';
 el("listing").querySelectorAll("[data-site]").forEach(button=>button.addEventListener("click",()=>{
   selectSite(button.dataset.site);
   // On a phone, show the actual site specifications instead of leaving
   // the visitor at the list after they select an advertising site.
   if(window.matchMedia("(max-width: 850px)").matches){
     window.setTimeout(()=>el("siteDetails").scrollIntoView({behavior:"smooth",block:"start"}),120);
   }
 }));
 renderMarkers(sites);
 if(state.selected && !sites.some(s=>s.id===state.selected))state.selected=null;
 updateMapSiteCTA();
 state.updateCityFocus?.();
 void renderDetail();
}
function renderMarkers(sites){
 if(!state.map)return;
 state.markers.clearLayers();state.markerById.clear();
 for(const s of sites){
   const L=window.L;
   const safeStatus = statuses[s.status] ? s.status : "available";
   const highlighted=state.selected===s.id;
   const marker=L.marker([s.latitude,s.longitude],{
     icon:L.divIcon({
       className:"raafat-premium-site-icon",
       html:'<div class="site-pin '+safeStatus+(highlighted?" selected":"")+'"><i class="vip-pin-aura" aria-hidden="true"></i><span></span></div>',
       iconSize:[29,29],iconAnchor:[15,27]
     }),
     title:"لوحة "+s.code+" — "+(statuses[s.status]||"")
   });
   marker.on("click",()=>selectSite(s.id));
   marker.bindTooltip(escapeHtml(s.code)+" — "+escapeHtml(s.name),{direction:"top"});
   state.markers.addLayer(marker);
   state.markerById.set(s.id,marker);
 }
}
function updateMapSiteCTA(){
 const card=el("mapSiteCTA");
 const site=state.sites.find(s=>s.id===state.selected);
 if(!site){card.hidden=true;return;}
 const link=directionsToSite(site);
 if(!link){card.hidden=true;return;}
 const label=el("mapSiteStatus");
 label.textContent="• "+(statuses[site.status]||site.status);
 label.className="vip-site-state "+(statuses[site.status]?site.status:"available");
 el("mapSiteTitle").textContent=site.code+" · "+site.name;
 el("mapSiteDirections").href=link;
 el("mapSiteDirections").setAttribute("aria-label","الاتجاهات إلى "+site.name);
 card.hidden=false;
}
function selectSite(id){
 const site=state.sites.find(s=>s.id===id);
 if(!site)return;
 if(state.selected!==id)state.galleryIndex=0;
 if(state.locationWatchId!==null){
   state.followLocation=false;
   updateLiveLocationUI("الموقع مستمر • اضغط لتوسيط الخريطة");
 }
 state.selected=id;render();
 if(!state.staff)history.replaceState(null,"","#site="+encodeURIComponent(id));
 if(state.map){
   const target=[Number(site.latitude),Number(site.longitude)];
   const zoom=Math.max(14,Math.min(17,state.map.getZoom()));
   if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){
     state.map.setView(target,zoom,{animate:false});
   }else{
     state.map.flyTo(target,zoom,{animate:true,duration:.82,easeLinearity:.25});
   }
 }
}
async function photoUrl(path){
 if(!path||!db)return null;
 const cached=state.photoUrls.get(path);
 if(cached && cached.expires>Date.now())return cached.url;
 const {data,error}=await db.storage.from("site-photos").createSignedUrl(path,3600);
 if(error||!data?.signedUrl)return null;
 state.photoUrls.set(path,{url:data.signedUrl,expires:Date.now()+50*60*1000});
 return data.signedUrl;
}
async function renderDetail(){
 const requestId=state.selected;
 const site=state.sites.find(s=>s.id===requestId);
 if(!site){
   el("siteDetails").innerHTML='<div class="empty detail-empty"><span class="empty-icon">⌖</span>اختر قطعة لعرض تفاصيلها.</div>';
   return;
 }
 const phone=String(state.siteSettings?.whatsapp_number||config.whatsappNumber||"").replace(/\D/g,"");
 const whatsapp=phone.length>=10? "https://wa.me/"+phone+"?text="+encodeURIComponent((state.siteSettings?.contact_message||"مرحباً، أود الاستفسار عن موقع إعلاني.")+"\nالقطعة: "+site.code+" - "+site.name):null;
 const directionsUrl=directionsToSite(site);
 const photos=Array.isArray(site.site_photos)?site.site_photos:[];
 const imageLinks=await Promise.all(photos.map(p=>photoUrl(p.storage_path)));
 if(state.selected!==requestId)return;
 const photosAvailable=imageLinks.filter(Boolean);
 state.galleryIndex=Math.min(state.galleryIndex,Math.max(0,photosAvailable.length-1));
 const mainImage=photosAvailable.length?
    '<a href="'+escapeHtml(photosAvailable[state.galleryIndex])+'" target="_blank" rel="noopener noreferrer" title="فتح الصورة بالحجم الكامل"><img src="'+escapeHtml(photosAvailable[state.galleryIndex])+'" alt="صورة اللوحة الإعلانية '+escapeHtml(site.code)+'" loading="lazy"></a>':
    '<div class="detail-placeholder"><b>R.</b>لا تتوفر صورة لهذه القطعة</div>';
 const thumbnails=photosAvailable.length>1?
   '<div class="photo-gallery">'+photosAvailable.map((u,i)=>
      '<button class="photo-thumb '+(state.galleryIndex===i?'active':'')+'" type="button" data-photo-index="'+i+'" aria-label="عرض صورة رقم '+(i+1)+'"><img src="'+escapeHtml(u)+'" loading="lazy" alt="صورة '+(i+1)+'"></button>'
   ).join("")+'</div>':"";
 const metaRows=[
   ["رقم القطعة",site.code],["المحافظة",site.governorate||"صلاح الدين"],
   ["المدينة / القضاء",site.city],["المنطقة / الحي",site.area||"—"],
   ["الشارع",site.street||"—"],["أقرب معلم",site.landmark||"—"],
   ["نوع الإعلان",types[site.type]||site.type],
   ["العرض",format(site.width_m)+" متر"],["الارتفاع",format(site.height_m)+" متر"],
   ["المساحة الإعلانية",format(site.width_m*site.height_m)+" م²"],
   ["عدد الأوجه",site.faces],["الإنارة",site.lighting?"مضاءة":"غير مضاءة"],
   ["اتجاه مواجهة الإعلان",site.facing||"—"],["الخامة / المادة",site.material||"—"]
 ];
 const html=
   '<div class="details-pill"><span>تفاصيل الموقع</span><span>'+escapeHtml(site.code)+'</span></div>'+
   '<div class="detail-photo">'+mainImage+'</div>'+thumbnails+
   '<div class="vip-detail-facts" aria-label="معلومات القطعة المختصرة">'+
     '<div><small>القياس</small><strong>'+format(site.width_m)+' × '+format(site.height_m)+' م</strong></div>'+
     '<div><small>نوع الإعلان</small><strong>'+escapeHtml(types[site.type]||site.type)+'</strong></div>'+
     '<div><small>عدد الأوجه</small><strong>'+escapeHtml(site.faces||1)+'</strong></div>'+
   '</div>'+
   '<h3 class="detail-name">'+escapeHtml(site.name)+'</h3>'+
   '<div class="detail-location">⌖ '+escapeHtml(site.governorate||"صلاح الدين")+' / '+escapeHtml(site.city)+(site.area?' / '+escapeHtml(site.area):"")+'</div>'+
   '<div class="detail-status">'+badge(site)+(site.published?'':' <span class="draft">• غير منشور</span>')+'</div>'+
   '<div class="spec-heading">المواصفات والتفاصيل</div>'+
   '<div class="detail-table">'+metaRows.map(([label,val])=>'<div class="detail-line"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(val)+'</strong></div>').join("")+'</div>'+
   (site.description?'<div class="spec-heading">وصف الموقع</div><p class="detail-description">'+escapeHtml(site.description)+'</p>':"")+
   '<div class="detail-actions"><a class="btn btn-primary" href="'+directionsUrl+'" target="_blank" rel="noopener noreferrer" aria-label="بدء الملاحة إلى القطعة المحددة">↗ اتجه إلى القطعة</a>'+
   (whatsapp?'<a class="btn btn-ghost" href="'+whatsapp+'" target="_blank" rel="noopener noreferrer">طلب عرض سعر</a>':
   '<button type="button" class="btn btn-ghost" id="copyInquiry">نسخ بيانات للاستفسار</button>')+
   '<button type="button" class="btn btn-ghost vip-copy-link" id="copySiteLink">⧉ نسخ رابط القطعة</button></div>'+
   ''+
   (state.staff?'<div class="admin-actions"><button type="button" class="btn btn-ghost" id="editSite">تعديل البيانات</button><button type="button" class="btn danger" id="deleteSite">حذف القطعة</button></div>':"")+
   (state.staff&&photos.length?'<div class="photo-management"><div class="spec-heading">إدارة صور القطعة</div>'+photos.map((photo,i)=>'<button class="btn btn-ghost" type="button" data-remove-photo="'+escapeHtml(photo.id)+'">حذف صورة '+(i+1)+'</button>').join("")+'</div>':"");
 el("siteDetails").innerHTML=html;
 el("copySiteLink")?.addEventListener("click",async()=>{
   const url=location.origin+location.pathname+"#site="+encodeURIComponent(site.id);
   try{
     if(!navigator.clipboard?.writeText)throw Error("clipboard unavailable");
     await navigator.clipboard.writeText(url);
     toast("تم نسخ رابط القطعة بنجاح.");
   }catch(error){
     toast("انسخ رابط القطعة من شريط العنوان بعد اختيارها.");
   }
 });
 el("siteDetails").querySelectorAll("[data-photo-index]").forEach(btn=>btn.addEventListener("click",()=>{
   state.galleryIndex=Number(btn.dataset.photoIndex);
   void renderDetail();
 }));
 if(!whatsapp){
   el("copyInquiry").addEventListener("click",async()=>{
     const summary=COMPANY+"\nاستفسار عن قطعة إعلانية\nالرمز: "+site.code+"\nالموقع: "+(site.governorate||"صلاح الدين")+" / "+site.city+" / "+(site.area||"")+
       "\nالقياس: "+format(site.width_m)+" × "+format(site.height_m)+" متر\nالرابط: "+location.origin+location.pathname+"#site="+encodeURIComponent(site.id);
     try{await navigator.clipboard.writeText(summary);toast("تم نسخ تفاصيل القطعة. أرسلها لفريق المبيعات.");}
     catch(e){toast("تعذر النسخ التلقائي؛ يمكنك نسخ الرمز: "+site.code);}
   });
 }
 if(state.staff){
   el("editSite").addEventListener("click",()=>openEditor(site));
   el("deleteSite").addEventListener("click",()=>void deleteSite(site));
   el("siteDetails").querySelectorAll("[data-remove-photo]").forEach(btn=>btn.addEventListener("click",()=>void removePhoto(site,btn.dataset.removePhoto)));
 }
}
async function removePhoto(site,photoId){
 if(!state.staff||!db)return;
 const photo=(site.site_photos||[]).find(p=>p.id===photoId);
 if(!photo||!confirm("حذف هذه الصورة من موقع القطعة نهائياً؟"))return;
 try{
   const {error:storageError}=await db.storage.from("site-photos").remove([photo.storage_path]);
   if(storageError)throw storageError;
   const {error:dbError}=await db.from("site_photos").delete().eq("id",photo.id);
   if(dbError)throw dbError;
   state.photoUrls.delete(photo.storage_path);
   await loadSites();
   toast("تم حذف الصورة من الموقع.");
 }catch(e){toast("تعذر حذف الصورة: "+(e.message||"خطأ غير معروف"));}
}
function refreshAdmin(){
 el("staffTag").hidden=!state.staff;
 el("newSite").hidden=!state.staff;
 el("manageDashboard").hidden=!state.staff;
 el("loginButton").hidden=state.staff||!ADMIN_ENTRY;
 el("changePasswordButton").hidden=!state.staff;
 el("logoutButton").hidden=!state.user;
}
async function authCheck(){
 if(!db)return;
 const {data:auth}=await db.auth.getUser();
 state.user=auth?.user||null;
 state.staff=false;
 state.staffRole=null;
 if(state.user){
  const {data,error}=await db.from("staff_members").select("role").eq("user_id",state.user.id).maybeSingle();
  if(!error && data && ["admin","editor"].includes(data.role)){state.staff=true;state.staffRole=data.role;}
 }
 refreshAdmin();
}
function applySiteSettings(data){
 if(!data)return;
 state.siteSettings=data;
 el("catalogTitle").textContent=data.headline||"المواقع الإعلانية";
 el("cityChipsWrap").hidden=data.show_city_chips===false;
 el("catalogStats").hidden=data.show_statistics===false;
 document.body.classList.toggle("no-map-glow",data.show_map_glow===false);
 if(state.map && !state.selected && !location.hash.startsWith("#site=") && !el("cityFilter").value){
   const city=CITY_CENTERS[data.map_start_city]?data.map_start_city:"تكريت";
   state.map.setView(CITY_CENTERS[city],11,{animate:false});
 }
 void renderDetail();
}
async function loadSiteSettings(){
 if(!db)return;
 try{
   const {data,error}=await db.from("site_settings").select("*").eq("id",true).maybeSingle();
   if(error)throw error;
   if(data)applySiteSettings(data);
 }catch(err){
   console.warn("Optional company settings were not loaded:",err.message);
 }
}
async function loadSites(){
 if(!db)return;
 try{
  const items=[];
  for(let page=0;page<100;page++){
    const low=page*1000;
    const {data,error}=await db.from("sites")
      .select("*,site_photos(id,storage_path)")
      .order("created_at",{ascending:false})
      .range(low,low+999);
    if(error)throw error;
    items.push(...(data||[]));
    if(!data || data.length<1000)break;
  }
  state.sites=items;
  if(state.selected&&!items.some(s=>s.id===state.selected))state.selected=null;
  renderFilters();render();
  adminDashboard?.render();
  const hash=location.hash.startsWith("#site=")?decodeURIComponent(location.hash.slice(6)):null;
  if(hash&&state.sites.some(site=>site.id===hash))selectSite(hash);
  alertBanner("");
 }catch(error){
  state.sites=[];renderFilters();render();adminDashboard?.render();
  alertBanner("تعذر الاتصال بقاعدة البيانات. تحقق من الإعدادات واتصال الإنترنت وصلاحيات Supabase.");
  console.error("Site fetch failed:",error.message);
 }
}
function openEditor(site=null){
 if(!state.staff){toast("هذا الإجراء للموظفين المصرح لهم فقط.");return;}
 state.editorId=site?.id||null;
 el("siteForm").reset();
 el("formTitle").textContent=site?"تعديل قطعة إعلانية":"إضافة موقع إعلاني";
 el("photoInfo").textContent=site?"الصور القديمة ستبقى. الصور الجديدة تُضاف عند الحفظ.":"الصور الجديدة تُرفع بعد حفظ موقع القطعة.";
 const get=(field,defaultValue="") => site?.[field]??defaultValue;
 el("fCode").value=get("code");
 el("fName").value=get("name");
 el("fGovernorate").value=get("governorate","صلاح الدين");
 renderAdminCities(get("city"));
 el("fStreet").value=get("street");
 el("fLandmark").value=get("landmark");
 el("fFacing").value=get("facing");
 el("fMaterial").value=get("material");
 el("fArea").value=get("area");
 el("fType").value=get("type","billboard");
 el("fStatus").value=get("status","available");
 el("fWidth").value=get("width_m");
 el("fHeight").value=get("height_m");
 el("fFaces").value=get("faces",1);
 el("fLighting").value=String(get("lighting",false));
 el("fDescription").value=get("description");
 el("fCoords").value=site?site.latitude+", "+site.longitude:"";
 el("fPublished").checked=Boolean(get("published",false));
 openModal("siteModal");
}
function sitePayload(){
 const code=el("fCode").value.trim();
 const name=el("fName").value.trim();
 const governorate=el("fGovernorate").value;
 const city=el("fCity").value.trim();
 const area=el("fArea").value.trim();
 const street=el("fStreet").value.trim();
 const landmark=el("fLandmark").value.trim();
 const facing=el("fFacing").value.trim();
 const material=el("fMaterial").value.trim();
 const description=el("fDescription").value.trim();
 const coords=getCoords(el("fCoords").value);
 const width_m=number(el("fWidth").value);
 const height_m=number(el("fHeight").value);
 const faces=number(el("fFaces").value);
 if(!code||code.length>40||!name||name.length>140||!city||city.length>80)throw Error("تحقق من رمز القطعة واسم الموقع والمدينة.");
 if(!REGIONS[governorate]||!REGIONS[governorate].includes(city))throw Error("المحافظة والمدينة غير متطابقتين.");
 if(street.length>200||landmark.length>200||facing.length>140||material.length>140)throw Error("بعض التفاصيل أطول من الحد المسموح.");
 if(!coords)throw Error("الإحداثيات غير صحيحة، استخدم: latitude, longitude");
 if(!Number.isFinite(width_m)||width_m<=0||width_m>1000||!Number.isFinite(height_m)||height_m<=0||height_m>1000)throw Error("القياس يجب أن يكون أكبر من صفر وأقل من 1000 متر.");
 if(!Number.isInteger(faces)||faces<1||faces>8)throw Error("عدد الأوجه من 1 إلى 8.");
 return {
   code,name,governorate,city,area,street,landmark,facing,material,description,
   type:el("fType").value,status:el("fStatus").value,
   width_m,height_m,faces,lighting:el("fLighting").value==="true",
   ...coords,published:el("fPublished").checked
 };
}
async function uploadPhotos(siteId, files){
 const accepted=["image/jpeg","image/png","image/webp"];
 const errors=[];
 for(const file of files){
  if(!accepted.includes(file.type) || file.size>5*1024*1024){errors.push("الصورة "+file.name+" يجب أن تكون JPG/PNG/WebP وتحت 5 ميغابايت.");continue;}
  const ext=file.type==="image/jpeg"?"jpg":file.type==="image/png"?"png":"webp";
  const path=siteId+"/"+crypto.randomUUID()+"."+ext;
  const uploaded=await db.storage.from("site-photos").upload(path,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
  if(uploaded.error){errors.push("تعذر رفع الصورة "+file.name);continue;}
  const linked=await db.from("site_photos").insert({site_id:siteId,storage_path:path});
  if(linked.error){
    await db.storage.from("site-photos").remove([path]);
    errors.push("تعذر تسجيل الصورة "+file.name);
  }
 }
 return errors;
}
async function saveSite(event){
 event.preventDefault();
 if(state.busy||!db||!state.staff)return;
 let payload;
 try{payload=sitePayload()}catch(e){toast(e.message);return;}
 const files=[...el("fPhotos").files];
 if(files.length>12){toast("يمكن رفع حتى 12 صورة في كل مرة.");return;}
 actionBusy(true);
 try{
   const query=state.editorId?
     db.from("sites").update(payload).eq("id",state.editorId):
     db.from("sites").insert(payload);
   const {data,error}=await query.select("id").single();
   if(error)throw error;
   const photoErrors=await uploadPhotos(data.id,files);
   closeModal("siteModal");
   state.editorId=null;
   await loadSites();
   selectSite(data.id);
   toast(photoErrors.length?"تم حفظ القطعة، لكن بعض الصور لم تُرفع: "+photoErrors.join(" | "):"تم حفظ القطعة والصور بنجاح.");
 }catch(error){
   console.error("Save failed:",error.message);
   toast(error.code==="23505"?"رمز القطعة مستخدم مسبقاً. اختر رمزاً مختلفاً.":"تعذر الحفظ: "+(error.message||"تحقق من البيانات والصلاحيات."));
 }finally{actionBusy(false)}
}
async function deleteSite(site){
 if(!state.staff||!db)return;
 if(!confirm("هل تريد حذف القطعة "+site.code+" نهائياً؟ لا يمكن التراجع."))return;
 try{
  const paths=(site.site_photos||[]).map(p=>p.storage_path);
  const {error}=await db.from("sites").delete().eq("id",site.id);
  if(error)throw error;
  if(paths.length){
    const result=await db.storage.from("site-photos").remove(paths);
    if(result.error)console.warn("Orphaned photo cleanup:",result.error.message);
  }
  state.selected=null;
  await loadSites();
  toast("تم حذف القطعة.");
 }catch(error){toast("تعذر حذف الموقع: "+error.message)}
}
async function signIn(event){
 event.preventDefault();
 if(!db){toast("يجب ربط Supabase أولاً.");return;}
 const email=el("email").value.trim(), password=el("password").value;
 const button=el("loginForm").querySelector('button[type="submit"]');
 button.disabled=true;
 try{
  const {error}=await db.auth.signInWithPassword({email,password});
  if(error)throw error;
  await authCheck();
  if(!state.staff){
    await db.auth.signOut();
    state.user=null;
    refreshAdmin();
    throw new Error("الحساب غير مخوّل للإدارة. يجب إضافة المستخدم إلى staff_members.");
  }
  el("password").value="";
  closeModal("loginModal");
  await loadSites();
  adminDashboard?.open();
  toast("مرحباً بك في لوحة إدارة شركة رأفت.");
 }catch(error){
  const wrong=/invalid login credentials|invalid_credentials/i.test(String(error.message||""));
  toast(wrong?"البريد الإلكتروني أو كلمة المرور غير صحيحين.":error.message||"تعذر تسجيل الدخول.");
 }
 finally{button.disabled=false}
}
async function requestAdminPasswordReset(){
 if(!db){toast("الخدمة غير متاحة حالياً.");return;}
 const email=el("email").value.trim();
 if(!email||!el("email").checkValidity()){
   toast("أدخل البريد الإلكتروني أولاً.");return;
 }
 const btn=el("requestPasswordReset");
 btn.disabled=true;
 try{
   const {error}=await db.auth.resetPasswordForEmail(email,{
     redirectTo:window.location.origin+window.location.pathname
   });
   if(error)throw error;
   toast("إذا كان البريد مسجلاً، ستصلك رسالة لاستعادة كلمة المرور.");
 }catch(err){
   toast("تعذّر إرسال الرسالة. راجع إعدادات بريد Supabase (SMTP).");
   console.warn("Recovery email request failed:",err.message);
 }finally{btn.disabled=false;}
}
async function changeAdminPassword(event){
 event.preventDefault();
 if(!db||!state.staff){toast("هذه الخدمة متاحة للإدارة فقط.");return;}
 const pw=el("newAdminPassword").value;
 const confirm=el("confirmAdminPassword").value;
 if(pw.length<14){toast("اختَر كلمة مرور من 14 حرفاً على الأقل.");return;}
 if(pw!==confirm){toast("تأكيد كلمة المرور غير مطابق.");return;}
 const button=el("changePasswordForm").querySelector('button[type="submit"]');
 button.disabled=true;
 try{
   const {error}=await db.auth.updateUser({password:pw});
   if(error)throw error;
   el("changePasswordForm").reset();
   closeModal("passwordModal");
   toast("تم تغيير كلمة المرور بنجاح.");
 }catch(error){toast("تعذر تغيير كلمة المرور: "+(error.message||"حاول مجدداً."));}
 finally{button.disabled=false;}
}
async function signOut(){
 if(!db)return;
 try{await db.auth.signOut()}catch(e){console.warn(e)}
 adminDashboard?.close();
 state.user=null;state.staff=false;state.staffRole=null;state.selected=null;state.photoUrls.clear();
 refreshAdmin();await loadSites();toast("تم تسجيل الخروج.");
}
function events(){
 const network=el("vipCoverage");
 const legendButton=el("vipLegendToggle");
 const legend=el("vipLegend");
 network.addEventListener("click",()=>{
   state.selected=null;
   for(const id of ["search","governorateFilter","cityFilter","statusFilter","typeFilter","sizeFilter"]){
     el(id).value="";
   }
   renderCityOptions();render();
   if(state.map){
     state.map.fitBounds(window.L.latLngBounds(Object.values(CITY_CENTERS)),{
       padding:[58,74],maxZoom:9,animate:!window.matchMedia("(prefers-reduced-motion: reduce)").matches
     });
   }
   legend.hidden=true;
   legendButton.setAttribute("aria-expanded","false");
 });
 legendButton.addEventListener("click",()=>{
   const open=legend.hidden;
   legend.hidden=!open;
   legendButton.setAttribute("aria-expanded",String(open));
 });
 for(const filter of ["search","cityFilter","statusFilter","typeFilter","sizeFilter"]){
  el(filter).addEventListener(filter==="search"?"input":"change",()=>{render();zoomAll()});
 }
 el("governorateFilter").addEventListener("change",()=>{renderCityOptions();render();zoomAll()});
 el("fGovernorate").addEventListener("change",()=>renderAdminCities());
 el("clearFilters").addEventListener("click",()=>{
  for(const id of ["search","governorateFilter","cityFilter","statusFilter","typeFilter","sizeFilter"])el(id).value="";
  renderCityOptions();render();zoomAll();
 });
 el("newSite").addEventListener("click",()=>openEditor());
 el("loginButton").addEventListener("click",()=>openModal("loginModal"));
 el("manageDashboard").addEventListener("click",()=>adminDashboard?.open());
 el("logoutButton").addEventListener("click",()=>void signOut());
 el("siteForm").addEventListener("submit",saveSite);
 el("loginForm").addEventListener("submit",signIn);
 el("changePasswordButton").addEventListener("click",()=>{if(state.staff)openModal("passwordModal")});
 el("changePasswordForm").addEventListener("submit",changeAdminPassword);
 el("requestPasswordReset").addEventListener("click",()=>void requestAdminPasswordReset());
 el("pickMap").addEventListener("click",()=>{
   if(!state.map){toast("الخريطة غير متاحة.");return;}
   state.pick=true;
   closeModal("siteModal");
   el("mapPicking").hidden=false;
   toast("حدد النقطة على الخريطة؛ ثم سيعود نموذج الإدخال.");
 });
 el("getGPS").addEventListener("click",()=>{
   if(!navigator.geolocation){toast("جهازك لا يدعم تحديد الموقع.");return;}
   navigator.geolocation.getCurrentPosition(pos=>{
     el("fCoords").value=pos.coords.latitude.toFixed(7)+", "+pos.coords.longitude.toFixed(7);
     if(state.map)state.map.setView([pos.coords.latitude,pos.coords.longitude],16);
     toast("تم تحديد موقع GPS بدقة تقريبية ±"+Math.round(pos.coords.accuracy)+" متر. تحقق من النقطة.");
   },err=>toast("تعذر تحديد الموقع. تحقق من صلاحيات GPS وHTTPS: "+err.message),
   {enableHighAccuracy:true,maximumAge:0,timeout:20000});
 });
 document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>closeModal(button.dataset.close)));
 document.querySelectorAll(".modal-backdrop").forEach(modal=>{
   modal.addEventListener("click",e=>{if(e.target===modal)closeModal(modal.id)});
 });
 document.addEventListener("keydown",e=>{
   if(e.key==="Escape"){state.pick=false;el("mapPicking").hidden=true;
   for(const id of ["loginModal","siteModal","passwordModal"])closeModal(id)}
 });
}
async function main(){
 // Listen without blocking the auth callback; Supabase handles recovery tokens.
 if(db){
   db.auth.onAuthStateChange((event)=>{
     if(event==="PASSWORD_RECOVERY"){
       setTimeout(async()=>{
         await authCheck();
         if(state.staff){
           closeModal("loginModal");
           openModal("passwordModal");
         }else{
           toast("رابط الاستعادة لا يخص حساب إدارة معتمداً.");
         }
       },0);
     }
   });
 }
 adminDashboard=createAdminDashboard({db,getState:()=>state,toast,openEditor,loadSites,selectSite,applySettings:applySiteSettings});
 initializeCatalogLayout();
 initializeMap();events();
 window.addEventListener("orientationchange",()=>setTimeout(()=>state.map?.invalidateSize({pan:false}),250));
 window.addEventListener("resize",()=>setTimeout(()=>state.map?.invalidateSize({pan:false}),100));
 if(!db){
  alertBanner("النظام لم يُربط بعد بقاعدة Supabase. يجب إعداد مشروع الشركة وملف config.js قبل نشره للزبائن.");
  el("listing").innerHTML='<div class="empty">لا توجد مواقع فعلية محمّلة. لن نعرض مواقع تجريبية على أنها قطع الشركة.</div>';
  render();
  return;
 }
 await authCheck();
 await loadSiteSettings();
 if(ADMIN_ENTRY&&!state.staff)openModal("loginModal");
 await loadSites();
 // An empty inventory is not a blank map: introduce the service areas.
 if(!state.sites.length&&!state.selected&&!location.hash.startsWith("#site=")
    &&!el("governorateFilter").value&&!el("cityFilter").value){
   zoomAll(true);
 }
 adminDashboard?.render();
}
void main();
