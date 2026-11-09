import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { fetchRaafatMapStyle, recolorRaafatMap } from "./brand-map.js";
import { createGoogleMapLayer } from "./google-basemap.js";
import { createAdminDashboard } from "./admin-dashboard.js";
import { setupBookings, setupAdminBookings, packageForSite } from "./booking.js";
import { createRaafatNavigation } from "./routing.js";
import { raafatConfirm, raafatVerify } from "./ui-dialog.js";
import {enhanceAdminSelects} from "./admin-dropdown.js";
// The ?admin=1 entry URL is only a private UI shortcut; actual authorization uses Supabase Auth + staff RLS.
const ADMIN_ENTRY = new URLSearchParams(window.location.search).get("admin") === "1";

const COMPANY = "شركة رأفت للدعاية والإعلان والتجارة العامة";
/* Stable self-contained SVG iconography (independent of installed fonts). */
const RAAFAT_UI_ICONS=Object.freeze({"pin":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/></svg>","calendar":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"15\" rx=\"3\"/><path d=\"M7.5 3.5v4M16.5 3.5v4M3.5 10h17m-12 5 2.3 2.2 4.6-4.8\"/></svg>","arrow":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M18 12H6m6-6-6 6 6 6\"/></svg>","route":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m4 16 16-12-5 16-3.2-7-7.8 3Z\"/></svg>","message":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 11.5a8.5 8.5 0 0 1-12 7.6L3 21l1.9-5A8.5 8.5 0 1 1 20 11.5Z\"/><path d=\"M8.5 11.8h7\"/></svg>","copy":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2\"/></svg>","direct":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"5\" cy=\"19\" r=\"2.5\"/><circle cx=\"19\" cy=\"5\" r=\"2.5\"/><path d=\"m7.5 16.5 9-9\" stroke-dasharray=\"3 3\"/></svg>","close":"<svg class=\"raafat-ui-svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.85\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6 6 18\"/></svg>"});
const raafatIcon=name=>'<span class="raafat-inline-icon" aria-hidden="true">'+(RAAFAT_UI_ICONS[name]||"")+'</span>';

const types = {billboard:"بيلبورد",unipole:"يوني بول",led:"شاشة LED",bridge:"إعلان جسر",wall:"جدارية",building:"على بناية / واجهة مبنى",sidewalk:"لوحة رصيف",other:"أخرى"};
const REGIONS = Object.freeze({"صلاح الدين":["تكريت","بيجي","الدور","سامراء","الشرقاط","العلم","بلد","مناطق أخرى في صلاح الدين"],"كركوك":["كركوك","الحويجة","داقوق","الدبس","مناطق أخرى في كركوك"]});

const CITY_CENTERS = Object.freeze({
  "تكريت":[34.6158,43.6786],
  "بيجي":[34.92915,43.48878],
  "الدور":[34.4560,43.7934],
  "سامراء":[34.1959,43.8857],
  "الشرقاط":[35.5172,43.2281],
  "العلم":[34.709,43.6951],
  "بلد":[34.01485,44.14574],
  "كركوك":[35.4719,44.3954],"الحويجة":[35.32332,43.78241],"داقوق":[35.13792,44.44638],"الدبس":[35.67482,44.07067]
});
const sizeKey = s => Number(s.width_m)+"x"+Number(s.height_m);
const statuses = { available:"متاحة",reserved:"محجوزة",booked:"مؤجرة",maintenance:"صيانة"};
const STANDARD_PACKAGES=Object.freeze({A:[1.2,2],B:[2,3],C:[2.5,3.5],D:[3,4]});
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
 markers: null, markerById:new Map(), mobilePinnedMarkers:[], pick:false, photoUrls: new Map(), busy:false, galleryIndex:0,
 basemap: null, cityLabels: null, cityBeacon: null, fallbackTilesLoaded: false, showFallback: false,
 locationWatchId:null,locationGeneration:0,followLocation:false,lastLocation:null,gpsMarker:null,gpsAccuracy:null,
 gpsFixTime:0,gpsFixAccuracy:Infinity,gpsFixHeading:null,gpsFixSpeed:null,nearestFirst:false,nearestLastRefresh:0,
 staffRole:null,staffName:"",siteSettings:null,googleActive:false,
 vipDirectLink:null,vipDirectLinkEnabled:false
};
let toastTimeout;
let adminDashboard=null;
let bookingController=null;
let navigationController=null;
let siteFormDirty=false;
function visualTheme(){return document.documentElement.dataset.raafatTheme==="day"?"day":"night";}
function setVisualTheme(mode,{save=false}={}){
 const next=mode==="day"?"day":"night";
 document.documentElement.dataset.raafatTheme=next;
 if(save){
   try{localStorage.setItem("raafat-visual-theme",next);}catch(err){console.warn("Preference storage unavailable",err);}
 }
 const button=el("raafatThemeToggle");
 if(button){
   const nextLabel=next==="day"?"تفعيل المظهر الليلي":"تفعيل المظهر النهاري";
   button.setAttribute("aria-label",nextLabel);
   button.setAttribute("data-tip",nextLabel);
   button.setAttribute("aria-pressed",String(next==="day"));
 }
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute("content",next==="day"?"#faf7f2":"#062727");
 try{const renderer=state.basemap?.getMaplibreMap?.();
   if(renderer?.isStyleLoaded?.())recolorRaafatMap(renderer,next);
 }catch(error){console.warn("Unable to switch live map palette:",error);}
 window.requestAnimationFrame(()=>state.map?.invalidateSize({pan:false}));
}


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
function canNavigateToSite(site){
 return Boolean(site&&validCoords(Number(site.latitude),Number(site.longitude)));
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
/**
 * Accurate district badges: each badge is centered on its actual coordinates.
 * No collision solver, no label displacements, no zoom-specific positioning.
 * At distant zoom the badges become compact, without changing their anchor.
 */
function addPersistentCityLabels(){
 if(!state.map||state.cityLabels)return;
 const L=window.L;
 const map=state.map;
 const pane=map.createPane("raafatCities");
 pane.style.zIndex="455";
 pane.style.pointerEvents="auto";
 const group=L.layerGroup().addTo(map);
 const markers=new Map();
 Object.entries(CITY_CENTERS).forEach(([city,coords],index)=>{
   const governorate=REGIONS["كركوك"].includes(city)?"كركوك":"صلاح الدين";
   const html='<div class="vip-district-beacon" style="--vip-delay:'+((index%5)*.46).toFixed(2)+'s">'+
     '<span class="vip-beacon-wave wave-one" aria-hidden="true"></span>'+
     '<span class="vip-beacon-wave wave-two" aria-hidden="true"></span>'+
     '<span class="vip-beacon-point" aria-hidden="true"><i></i></span>'+
     '<span class="vip-beacon-label" lang="ar" dir="rtl">'+
       '<strong>'+escapeHtml(city)+'</strong>'+
       '<small>'+escapeHtml(governorate)+'</small>'+
     '</span></div>';
   const icon=L.divIcon({
     className:"vip-district-marker",html,
     iconSize:[144,76],iconAnchor:[72,38]
   });
   const marker=L.marker(coords,{
     icon,pane:"raafatCities",interactive:true,keyboard:true,
     title:"عرض مواقع "+city,riseOnHover:true,riseOffset:200
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
   marker.addTo(group);
   markers.set(city,marker);
 });
 const update=()=>{
   if(!state.map)return;
   const chosen=el("cityFilter").value;
   const selected=state.sites.find(site=>site.id===state.selected);
   const focus=selected&&CITY_CENTERS[selected.city]?selected.city:
     CITY_CENTERS[chosen]?chosen:null;
   const zoom=map.getZoom();
   const host=map.getContainer();
   host.classList.toggle("vip-zoom-far",zoom<=9);
   host.classList.toggle("vip-zoom-mid",zoom>9&&zoom<=11);
   markers.forEach((marker,city)=>{
     const dom=marker.getElement();
     if(!dom)return;
     dom.classList.toggle("vip-district-active",city===focus);
     dom.classList.remove("vip-label-muted","vip-card-linked");
     // Reset any previously computed offset; every name is anchored to its city.
     dom.style.removeProperty("--vip-card-x");
     dom.style.removeProperty("--vip-card-y");
     dom.style.removeProperty("--vip-link-length");
     dom.style.removeProperty("--vip-link-angle");
   });
   const heading=el("mapRegionLabel");
   if(heading){
     heading.textContent=focus||"";
     heading.hidden=!focus;
   }
 };
 state.cityLabels=group;
 state.updateCityFocus=update;
 map.on("zoomend moveend resize",update);
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
   const style=await fetchRaafatMapStyle(config.cartoApiKey,{arabicEnabled,theme:visualTheme()});
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
     recolorRaafatMap(renderer,visualTheme());
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
let locationFreshnessTimer=null;
function updateLiveLocationUI(message=""){
 const tracking=state.locationWatchId!==null;
 const age=Date.now()-Number(state.gpsFixTime||0);
 const live=Boolean(tracking&&state.gpsFixTime&&age>=0&&age<=12000&&Number(state.gpsFixAccuracy)<=150);
 const button=el("mapHome");
 if(button){
   button.classList.toggle("is-tracking",tracking);
   button.classList.toggle("is-following",tracking&&state.followLocation);
   button.classList.toggle("is-realtime",live);
   button.setAttribute("aria-pressed",String(tracking));
   button.title=live?"REALTIME • موقعك يتحدث ±"+Math.round(state.gpsFixAccuracy)+" م":tracking?"GPS يعمل • بانتظار إشارة حديثة":"تحديد موقعي على الخارطة";
   button.setAttribute("aria-label",button.title);
 }
 const status=el("locationStatus");
 if(status){
   status.textContent=message;
   status.hidden=!message||!/(جاري|بانتظار|تعذّر|مرفوض|غير دقيقة|ضعيفة|ننتظر|إشارة)/.test(message);
 }
}
function stopLiveLocationTracking(){
 if(locationFreshnessTimer!==null){clearInterval(locationFreshnessTimer);locationFreshnessTimer=null;}
 state.gpsFixTime=0;state.gpsFixAccuracy=Infinity;state.gpsFixHeading=null;state.gpsFixSpeed=null;
 state.nearestFirst=false;state.nearestLastRefresh=0;
 state.locationGeneration++;
 if(state.locationWatchId!==null && navigator.geolocation){
   navigator.geolocation.clearWatch(state.locationWatchId);
 }
 state.locationWatchId=null;
 state.followLocation=false;
 state.lastLocation=null;
 state.vipDirectLinkEnabled=false;
 updateVipDirectLink();
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
   state.followLocation=false;
   if(state.lastLocation)state.map.flyTo(state.lastLocation,Math.max(16,state.map.getZoom()),{animate:true,duration:.6});
   updateLiveLocationUI(state.lastLocation?"تحديث الموقع مباشر":"جاري تحديد الموقع…");
   return;
 }
 state.followLocation=true;
 const generation=++state.locationGeneration;
 const pane=state.map.getPane("raafatGps")||state.map.createPane("raafatGps");
 pane.style.zIndex="625";pane.style.pointerEvents="none";
 updateLiveLocationUI("جاري طلب إذن الموقع…");
 const onPosition=position=>{
   if(generation!==state.locationGeneration||!state.map)return;
   const coords=position.coords;
   const lat=Number(coords.latitude),lng=Number(coords.longitude);
   if(!validCoords(lat,lng))return;
   const point=[lat,lng];
   const firstFix=!state.gpsMarker;
   const age=Date.now()-Number(position.timestamp);
   if(!Number.isFinite(age)||age>15000||age < -5000){updateLiveLocationUI("ننتظر قراءة GPS حديثة");return;}
   const accuracy=Number.isFinite(coords.accuracy)?Math.max(1,coords.accuracy):Infinity;
   if(!Number.isFinite(accuracy)||accuracy>500){
     updateLiveLocationUI("إشارة الموقع غير دقيقة — انتقل لمكان مفتوح");
     return;
   }
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
   state.gpsFixTime=Number(position.timestamp);
   state.gpsFixAccuracy=accuracy;
   state.gpsFixHeading=coords.heading;
   state.gpsFixSpeed=coords.speed;
   navigationController?.onLiveLocation(point,accuracy,coords.heading,coords.speed,Number(position.timestamp));
   updateVipDirectLink();
   if(state.nearestFirst&&!navigationController?.isActive()
      &&!bookingController?.isSelecting()
      &&Date.now()-state.nearestLastRefresh>=20000){
     state.nearestLastRefresh=Date.now();
     render();
   }
   if(state.followLocation){
     if(firstFix)state.map.flyTo(point,Math.max(16,state.map.getZoom()),{animate:true,duration:.65});
     // Locator recenters once only: never pull the map away while the user is choosing billboards.
     state.followLocation=false;
   }
   const formatted=accuracy>=1000?"±"+(accuracy/1000).toFixed(1)+" كم":"±"+Math.round(accuracy)+" م";
   updateLiveLocationUI("");
 };
 const onError=error=>{
   if(generation!==state.locationGeneration)return;
   state.gpsFixTime=0;
   const message=error.code===1?
      "السماح بالموقع مرفوض. فعّله من إعدادات المتصفح.":
      error.code===2?"تعذّر تحديد الموقع. تأكد من تشغيل GPS.":"ننتظر إشارة الموقع من الجهاز…";
   if(error.code===1)stopLiveLocationTracking();
   updateLiveLocationUI(message);
   toast(message);
 };
 try{
   state.locationWatchId=navigator.geolocation.watchPosition(onPosition,onError,{
     enableHighAccuracy:true,maximumAge:0,timeout:20000
   });
   if(locationFreshnessTimer!==null)clearInterval(locationFreshnessTimer);
   locationFreshnessTimer=setInterval(()=>{
     if(state.locationWatchId===null)return;
     const age=Date.now()-Number(state.gpsFixTime||0);
     const stale=!state.gpsFixTime||age>12000||age < -5000;
      if(stale)updateVipDirectLink();
      updateLiveLocationUI(stale?"بانتظار تحديث GPS":state.gpsFixAccuracy>150?"إشارة الموقع غير دقيقة — انتقل لمكان مفتوح":"");
   },4000);
   updateLiveLocationUI("بانتظار إشارة الموقع…");
 }catch(error){
   stopLiveLocationTracking();
   toast("تعذّر بدء تحديد الموقع من المتصفح.");
 }
}

function initializeMap(){
 if(!window.L){alertBanner("تعذر تحميل مكتبة الخريطة. تحقق من اتصال الإنترنت.");finishMapReveal();return;}
 const L=window.L;
 state.map=L.map("map",{zoomControl:false,preferCanvas:true,minZoom:2,maxZoom:22,scrollWheelZoom:true,wheelPxPerZoomLevel:85})
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
 const compactMap=window.matchMedia("(max-width:850px)").matches;
 state.markers=L.markerClusterGroup
   ? L.markerClusterGroup({
      showCoverageOnHover:false,
      maxClusterRadius:compactMap?55:42,
      chunkedLoading:true,
      spiderfyOnMaxZoom:true,
      zoomToBoundsOnClick:true,
      disableClusteringAtZoom:compactMap?18:16
     })
   : L.layerGroup();
 state.map.addLayer(state.markers);
 addPersistentCityLabels();
 state.map.on("click",event=>{
   if(state.pick){
     const {lat,lng}=event.latlng;
     el("fCoords").value=lat.toFixed(7)+", "+lng.toFixed(7);
     state.pick=false;el("mapPicking").hidden=true;
     openModal("siteModal");
     toast("تم تحديد الإحداثيات؛ راجعها قبل الحفظ.");
     return;
   }
   if(navigationController?.handleMapClick(event.latlng))return;
   if(bookingController?.isSelecting()){bookingController.clearOnEmptyMap();return;}
    if(navigationController?.isActive())return;
   clearSelectedSite();
 });
 // The only visible GPS control is the bottom crosshair.
 window.L.DomEvent.disableClickPropagation(el("mapHome"));
 el("mapHome").addEventListener("click",()=>{
   if(navigationController?.isActive())navigationController.recenter();
   else startLiveLocationTracking();
 });
 state.map.on("mousedown touchstart",()=>{if(state.locationWatchId!==null)state.followLocation=false;});
 state.map.on("dragstart",()=>{
   if(state.locationWatchId!==null){
     state.followLocation=false;
     updateLiveLocationUI("الموقع مستمر • اضغط لتوسيط الخريطة");
   }
 });
 window.addEventListener("pagehide",stopLiveLocationTracking,{once:true});
 el("mapNavigationToggle").addEventListener("click",()=>{
   if(navigationController?.isActive()){
     navigationController.clear();
     return;
   }
   const site=state.sites.find(s=>s.id===state.selected);
   if(site&&canNavigateToSite(site))navigationController?.start(site);
 });
 window.L.DomEvent.disableClickPropagation(el("mapNavigationToggle"));
 window.L.DomEvent.disableScrollPropagation(el("mapNavigationToggle"));
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
     const bounds=window.L.latLngBounds(REGIONS["صلاح الدين"].map(name=>CITY_CENTERS[name]).filter(Boolean));
     state.map.fitBounds(bounds,{padding:[50,58],maxZoom:10,animate:true});
     return;
   }
   const focus=CITY_CENTERS[city]||CITY_CENTERS[governorate==="صلاح الدين"?"تكريت":"كركوك"];
   const zoom=city?14:12;
   state.map.setView(focus,zoom);
   return;
 }
 if(visible.length===1)state.map.setView([visible[0].latitude,visible[0].longitude],14);
 else state.map.fitBounds(window.L.latLngBounds(visible.map(s=>[s.latitude,s.longitude])),{padding:[45,45],maxZoom:14});
}

// Approximate proximity requires a fresh, consented GPS fix.
// Never use cached or unreliable positions for a "nearest" ranking.
function freshGpsForListing(){
 const age=Date.now()-Number(state.gpsFixTime||0);
 return state.map&&state.lastLocation&&age>=0&&age<=15000
   &&Number.isFinite(state.gpsFixAccuracy)&&state.gpsFixAccuracy<=150
   ?state.lastLocation:null;
}
function straightLineMeters(site,origin){
 return state.map.distance(origin,[Number(site.latitude),Number(site.longitude)]);
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
 el("fCity").dispatchEvent(new Event("raafat-select-sync"));
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
 const active=el("cityFilter").value,activeGov=el("governorateFilter").value;
 const parts=[];
 for(const [gov,cities] of Object.entries(REGIONS)){
   const total=state.sites.filter(s=>s.governorate===gov).length;
   const open=activeGov===gov;
   parts.push('<details class="region-group" data-region="'+escapeHtml(gov)+'" '+(open?'open':'')+'>'+
     '<summary><span class="region-group-title"><span class="region-group-icon" aria-hidden="true">'+RAAFAT_UI_ICONS.pin+'</span><strong>محافظة '+escapeHtml(gov)+'</strong></span><span class="region-group-trailing"><b>'+total+' قطعة</b><span class="region-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></span></summary>'+
     '<div class="region-group-cities">'+cities.map(city=>{
      const count=state.sites.filter(s=>s.governorate===gov&&s.city===city).length;
      return '<button class="city-chip '+(active===city?'active':'')+'" type="button" data-city="'+escapeHtml(city)+'" data-governorate="'+escapeHtml(gov)+'"><span>'+escapeHtml(city)+'</span><b>'+count+'</b></button>';
     }).join('')+'</div></details>');
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
 const eligible=filteredSites();
 const position=state.nearestFirst?freshGpsForListing():null;
 if(state.nearestFirst&&!position)state.nearestFirst=false;
 const sites=position
   ?[...eligible].sort((a,b)=>straightLineMeters(a,position)-straightLineMeters(b,position))
   :eligible;
 // A board hidden by filtering must not remain highlighted or keep routing.
 if(state.selected&&!sites.some(site=>site.id===state.selected)){
   navigationController?.clear();
   state.selected=null;
 }
 el("showAvailableOnly")?.setAttribute("aria-pressed",String(el("statusFilter").value==="available"));
 el("sortByNearest")?.setAttribute("aria-pressed",String(state.nearestFirst));
 el("allCount").textContent=state.sites.length;
 el("availableCount").textContent=state.sites.filter(s=>s.status==="available").length;
 el("cityCount").textContent=Object.values(REGIONS).flat().length;
 el("showingCount").textContent=sites.length+" قطعة";
 el("mapCount").textContent=sites.length;
 el("listing").innerHTML=sites.length ? sites.map(s=>
  '<button type="button" class="location-card '+(state.selected===s.id?'active':'')+'" data-site="'+escapeHtml(s.id)+'">'+
   '<div class="card-row"><strong>'+escapeHtml(s.name)+'</strong>'+badge(s)+'</div>'+
   '<small><span class="listing-category-tag category-'+(packageForSite(s)||"custom")+'">'+(packageForSite(s)?"فئة "+packageForSite(s):"قياس خاص")+'</span> '+escapeHtml(s.code)+' • '+escapeHtml(s.governorate||"صلاح الدين")+' / '+escapeHtml(s.city)+(s.published?'':' <span class="draft">• مسودة غير منشورة</span>')+'</small>'+
   '<div class="card-meta"><span>'+format(s.width_m)+' × '+format(s.height_m)+' م</span><span>'+escapeHtml(types[s.type]||s.type)+'</span><span>'+escapeHtml(s.area||s.landmark||"")+'</span></div>'+
   (position?'<small class="listing-straight-distance">≈ '+format(straightLineMeters(s,position)/1000)+' كم بخط مستقيم</small>':'')+
  '</button>'
 ).join("") : '<div class="empty">لا توجد قطع مطابقة. '+(state.staff?'يمكن إضافة قطعة من زر «إضافة موقع».':'غيّر الفلاتر لعرض قطع أخرى.')+'</div>';
 el("listing").querySelectorAll("[data-site]").forEach(button=>button.addEventListener("click",()=>{
   if(bookingController?.handleSiteSelection(button.dataset.site))return;
   if(state.selected===button.dataset.site){clearSelectedSite();return;}
   selectSite(button.dataset.site);
   // On a phone, show the actual site specifications instead of leaving
   // the visitor at the list after they select an advertising site.
   if(window.matchMedia("(max-width: 850px)").matches){
     window.setTimeout(()=>el("siteDetails").scrollIntoView({behavior:"smooth",block:"start"}),120);
   }
 }));
 renderMarkers(sites);
 updateMapSiteCTA();
 state.updateCityFocus?.();
 void renderDetail();
}
function renderMarkers(sites){
 if(!state.map)return;
 // Keep chosen billboard pins above a mobile cluster without changing coordinates.
 for(const layer of state.mobilePinnedMarkers){
   if(state.map.hasLayer(layer))state.map.removeLayer(layer);
 }
 state.mobilePinnedMarkers=[];
 state.markers.clearLayers();state.markerById.clear();
 const compactMap=window.matchMedia("(max-width:850px)").matches;
 for(const s of sites){
   const L=window.L;
   const safeStatus = statuses[s.status] ? s.status : "available";
   const highlighted=state.selected===s.id;
   const bookingSelected=Boolean(bookingController?.isSelected(s.id));
   const category=packageForSite(s)||"custom";
   const marker=L.marker([s.latitude,s.longitude],{
     bubblingMouseEvents:false,
     icon:L.divIcon({
       className:"raafat-premium-site-icon",
       html:'<div class="site-pin category-'+category+' '+safeStatus+(highlighted?" selected":"")+(bookingSelected?" booking-picked":"")+'">'+
         '<i class="vip-pin-aura" aria-hidden="true"></i><span class="pin-category-letter">'+(category==="custom"?"◆":category)+'</span>'+
         '<i class="pin-status-dot" aria-hidden="true"></i></div>',
       iconSize:[36,39],iconAnchor:[18,35]
     }),
     title:(category==="custom"?"قياس خاص":"فئة "+category)+" • لوحة "+s.code+" — "+(statuses[s.status]||"")
   });
   marker.on("click",()=>{
     state.followLocation=false;
     if(bookingController?.handleSiteSelection(s.id))return;
     if(state.selected===s.id){navigationController?.clear();clearSelectedSite();return;}
     selectSite(s.id);
   });
   // Mobile has a dedicated details panel; tooltips cover nearby map pins on touch.
   if(!window.matchMedia("(max-width:850px)").matches){
     marker.bindTooltip(escapeHtml(s.code)+" — "+escapeHtml(s.name),{direction:"top"});
   }
   if(compactMap&&(highlighted||bookingSelected)){
     marker.addTo(state.map);
     state.mobilePinnedMarkers.push(marker);
   }else state.markers.addLayer(marker);
   state.markerById.set(s.id,marker);
 }
}
/**
 * Optional visual connection only — a straight line, NEVER road routing.
 * Only shows after the visitor has explicitly enabled browser location.
 * GPS coordinates are used in memory, not persisted or shared.
 */
function updateVipDirectLink(){
 if(!state.map)return;
 const site=state.sites.find(s=>s.id===state.selected);
  const age=Date.now()-Number(state.gpsFixTime||0);
  const accurateGps=age>=0&&age<=15000&&Number.isFinite(state.gpsFixAccuracy)&&state.gpsFixAccuracy<=150;
  if(!state.vipDirectLinkEnabled||!site||!state.lastLocation||!accurateGps){
   if(state.vipDirectLink){
     state.map.removeLayer(state.vipDirectLink);
     state.vipDirectLink=null;
   }
   return;
 }
 const points=[state.lastLocation,[Number(site.latitude),Number(site.longitude)]];
 if(!points[1].every(Number.isFinite))return;
 if(state.vipDirectLink){
   state.vipDirectLink.setLatLngs(points);
 }else{
   state.vipDirectLink=window.L.polyline(points,{
     color:"#ffc27e",opacity:.88,weight:3,
     dashArray:"8,13",interactive:false,className:"vip-straight-connection"
   }).addTo(state.map);
 }
}

function updateNavigationToggle(){
 const toggle=el("mapNavigationToggle");
 if(!toggle)return;
 const site=state.sites.find(s=>s.id===state.selected);
 const active=Boolean(navigationController?.isActive());
 toggle.hidden=!active&&!canNavigateToSite(site);
 toggle.classList.toggle("is-active",active);
 toggle.setAttribute("aria-pressed",String(active));
 toggle.setAttribute("aria-label",active?"إلغاء الاتجاهات":"ابدأ الاتجاهات إلى القطعة");
 toggle.title=active?"إلغاء الاتجاهات":"الاتجاهات إلى القطعة";
}
function updateMapSiteCTA(){
 updateNavigationToggle();
 const card=el("mapSiteCTA");
 const site=state.sites.find(s=>s.id===state.selected);
 if(!site){card.hidden=true;updateVipDirectLink();return;}
 if(!canNavigateToSite(site)){card.hidden=true;return;}
 const label=el("mapSiteStatus");
 label.textContent="• "+(statuses[site.status]||site.status);
 label.className="vip-site-state "+(statuses[site.status]?site.status:"available");
 el("mapSiteTitle").textContent=site.code+" · "+site.name;
 card.hidden=false;
 updateVipDirectLink();
}
function clearSelectedSite(){
 if(!state.selected)return;
 navigationController?.clear();
 state.selected=null;
 state.galleryIndex=0;
 state.vipDirectLinkEnabled=false;
 if(!state.staff && location.hash.startsWith("#site="))history.replaceState(null,"",location.pathname+location.search);
 render();
}
function selectSite(id){
 const site=state.sites.find(s=>s.id===id);
 if(!site)return;
 if(state.selected!==id){
   navigationController?.clear();
   state.galleryIndex=0;
   state.vipDirectLinkEnabled=false;
   updateVipDirectLink();
 }
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
/**
 * Lightweight regional overview using the city-coordinate orientation.
 * This is an abstract location diagram, not a second basemap or route.
 * It never contacts a map provider or shares GPS with a server.
 */
function vipOverviewRadar(site){
 const places=Object.entries(CITY_CENTERS);
 const lats=places.map(([,p])=>p[0]);
 const lons=places.map(([,p])=>p[1]);
 const minLat=Math.min(...lats)-.12,maxLat=Math.max(...lats)+.12;
 const minLon=Math.min(...lons)-.12,maxLon=Math.max(...lons)+.12;
 const position=(lat,lon)=>{
   const x=Math.max(5,Math.min(95,((lon-minLon)/(maxLon-minLon))*82+9));
   const y=Math.max(6,Math.min(94,((maxLat-lat)/(maxLat-minLat))*80+10));
   return [x.toFixed(2),y.toFixed(2)];
 };
 const markers=places.map(([city,coords])=>{
   const [x,y]=position(coords[0],coords[1]);
   return '<span class="vip-overview-dot '+(site.city===city?"is-city":"")+
     '" title="'+escapeHtml(city)+'" style="left:'+x+'%;top:'+y+'%"></span>';
 }).join("");
 const lat=Number(site.latitude),lon=Number(site.longitude);
 const [sx,sy]=Number.isFinite(lat)&&Number.isFinite(lon)?
   position(lat,lon):position(...(CITY_CENTERS[site.city]||CITY_CENTERS["تكريت"]));
 return '<section class="vip-overview-card" aria-label="مخطط تقريبي لموقع اللوحة ضمن شبكة المدن">'+
   '<div class="vip-overview-heading"><div><small>RAAFAT REGIONAL RADAR</small>'+
   '<strong>موقع القطعة ضمن شبكة المدن</strong></div>'+
   '<span>عرض تقريبي</span></div>'+
   '<div class="vip-overview-grid" role="img" aria-label="المواقع النسبية لمراكز المدن وموقع القطعة المحددة">'+
   '<div class="vip-overview-sweep" aria-hidden="true"></div>'+markers+
   '<span class="vip-overview-site" style="left:'+sx+'%;top:'+sy+'%" aria-hidden="true"></span>'+
   '</div><div class="vip-overview-foot"><span><i></i> موقع القطعة</span>'+
   '<span>مراكز المدن • '+places.length+' مواقع</span></div></section>';
}

async function renderDetail(){
 const requestId=state.selected;
 const site=state.sites.find(s=>s.id===requestId);
 if(!site){
   el("siteDetails").innerHTML='<div class="empty detail-empty"><span class="empty-icon" aria-hidden="true"><svg class="raafat-target-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1.75v4M12 18.25v4M1.75 12h4M18.25 12h4"/></svg></span>اختر قطعة لعرض تفاصيلها.</div>';
   return;
 }
 const phone=String(state.siteSettings?.whatsapp_number||config.whatsappNumber||"").replace(/\D/g,"");
 const whatsapp=phone.length>=10? "https://wa.me/"+phone+"?text="+encodeURIComponent((state.siteSettings?.contact_message||"مرحباً، أود الاستفسار عن موقع إعلاني.")+"\nالقطعة: "+site.code+" - "+site.name):null;
 const routeIsAvailable=canNavigateToSite(site);
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
 const category=packageForSite(site)||"custom";
 const dims=format(site.width_m)+" × "+format(site.height_m);
 const statusText=statuses[site.status]||site.status;
 const areaText=[site.governorate||"صلاح الدين",site.city,site.area].filter(Boolean).join(" • ");
 const safeCode=escapeHtml(site.code);
 const safeName=escapeHtml(site.name);
 const safeArea=escapeHtml(areaText);
 const safeType=escapeHtml(types[site.type]||site.type);
 const photoHero=photosAvailable.length
   ?'<div class="vip-site-hero-photo">'+mainImage+'</div>'
   :'<div class="vip-site-hero-fallback"><img src="./assets/raafat-logo.png" alt="" loading="lazy"><strong>معاينة الموقع الإعلاني</strong><small>لا توجد صورة مرفوعة لهذه القطعة بعد</small></div>';
 const html=
   '<article class="vip-site-detail">'+
    '<div class="vip-site-hero '+(photosAvailable.length?'has-photo':'no-photo')+'">'+
      photoHero+
      '<div class="vip-site-hero-shade"></div>'+
      '<div class="vip-site-hero-top"><span class="vip-detail-ref">RAAFAT / '+safeCode+'</span><span class="vip-detail-class category-'+category+'">'+(category==="custom"?"SPECIAL":"CLASS "+category)+'</span></div>'+
      '<div class="vip-site-hero-bottom"><span class="vip-hero-caption">موقع إعلاني معتمد</span><h3>'+safeName+'</h3><p>'+safeArea+'</p></div>'+
    '</div>'+
    (thumbnails?'<div class="vip-site-gallery">'+thumbnails+'</div>':'')+
    '<div class="vip-site-overview">'+
      '<div class="vip-site-status-row"><span class="detail-category-tag category-'+category+'">'+(category==="custom"?"قياس خاص":"فئة "+category)+'</span>'+badge(site)+(site.published?'':'<span class="draft">غير منشورة</span>')+'</div>'+
      '<div class="vip-site-intro"><span class="vip-section-eyebrow">ADVERTISING LOCATION</span><h4>'+safeName+'</h4><p>'+safeArea+'</p></div>'+
      '<div class="vip-site-metric-grid">'+
        '<div class="vip-site-metric"><small>قياس اللوحة</small><strong dir="ltr">'+dims+' <em>م</em></strong></div>'+
        '<div class="vip-site-metric"><small>المساحة</small><strong dir="ltr">'+format(site.width_m*site.height_m)+' <em>م²</em></strong></div>'+
        '<div class="vip-site-metric"><small>عدد الأوجه</small><strong>'+escapeHtml(site.faces||1)+'</strong></div>'+
        '<div class="vip-site-metric"><small>نوع الإعلان</small><strong>'+safeType+'</strong></div>'+
      '</div>'+
      '<div class="vip-site-action-stack">'+
        '<button class="btn btn-primary vip-site-book-button" type="button" data-book-site="'+escapeHtml(site.id)+'" '+(site.status!=="available"||category==="custom"?'disabled title="'+(category==="custom"?"القطعة تحتاج تسعيراً خاصاً":"هذه القطعة غير متاحة")+'"':'')+'>'+raafatIcon("calendar")+'<strong class="raafat-site-book-text">احجز الموقع الإعلاني</strong>'+raafatIcon("arrow")+'</button>'+
        '<div class="vip-site-action-grid"><button type="button" class="btn btn-ghost" id="raafatStartDirections" aria-label="الاتجاهات الداخلية إلى هذه القطعة">'+raafatIcon("route")+'<span>الاتجاهات</span></button>'+
          (whatsapp?'<a class="btn btn-ghost" href="'+whatsapp+'" target="_blank" rel="noopener noreferrer">'+raafatIcon("message")+'<span>استفسار واتساب</span></a>':
          '<button type="button" class="btn btn-ghost" id="copyInquiry">'+raafatIcon("copy")+'<span>نسخ للاستفسار</span></button>')+'</div>'+
      '</div>'+
      '<details class="vip-site-specification"><summary><span><b>المواصفات الكاملة</b><small>العنوان والأبعاد والتجهيزات</small></span><span class="vip-spec-arrow" aria-hidden="true"><svg class="vip-spec-chevron-svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary>'+
        '<div class="vip-site-spec-grid">'+metaRows.map(([label,val])=>'<div class="vip-site-spec-cell"><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(val)+'</strong></div>').join("")+'</div>'+
      '</details>'+
      (site.description?'<div class="vip-site-description"><span class="vip-section-eyebrow">ABOUT THE LOCATION</span><strong>وصف الموقع</strong><p>'+escapeHtml(site.description)+'</p></div>':"")+
      '<div class="vip-site-secondary-actions"><button type="button" class="btn btn-ghost vip-copy-link" id="copySiteLink">'+raafatIcon("copy")+'<span>نسخ رابط القطعة</span></button>'+
      '<button type="button" class="btn btn-ghost vip-direct-route-button" id="vipDirectRoute" title="خط مستقيم تقريبي وليس مسار قيادة">'+raafatIcon("direct")+'<span>خط مباشر من موقعي</span></button></div>'+
      (state.staff?'<div class="admin-actions"><button type="button" class="btn btn-ghost" id="editSite">تعديل البيانات</button>'+(state.staffRole==="admin"?'<button type="button" class="btn danger" id="deleteSite">حذف القطعة</button>':"")+'</div>':"")+
      (state.staff&&photos.length?'<div class="photo-management"><div class="spec-heading">إدارة صور القطعة</div>'+photos.map((photo,i)=>'<button class="btn btn-ghost" type="button" data-remove-photo="'+escapeHtml(photo.id)+'">حذف صورة '+(i+1)+'</button>').join("")+'</div>':"")+
    '</div>'+
   '</article>';
 el("siteDetails").innerHTML=html;
 el("raafatStartDirections")?.addEventListener("click",()=>{if(routeIsAvailable)navigationController?.start(site);else toast("إحداثيات القطعة غير صالحة.")});
 el("vipDirectRoute")?.addEventListener("click",()=>{
   const age=Date.now()-Number(state.gpsFixTime||0);
   if(!state.lastLocation||age<0||age>15000||state.gpsFixAccuracy>150){
     toast("لازم تضغط «موقعي الحالي» وتسمح للموقع أولاً. هذا خط مستقيم توضيحي وليس مسار قيادة.");
     return;
   }
   state.vipDirectLinkEnabled=!state.vipDirectLinkEnabled;
   updateVipDirectLink();
   el("vipDirectRoute").innerHTML=raafatIcon(state.vipDirectLinkEnabled?"close":"direct")+'<span>'+(state.vipDirectLinkEnabled?"إخفاء الخط المباشر":"خط مباشر من موقعي (ليس مساراً)")+'</span>';
   if(state.vipDirectLinkEnabled){
     toast("ظهر خط مستقيم تقريبي؛ استخدم زر الاتجاهات لمسار القيادة الحقيقي.");
   }
 });
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
   el("deleteSite")?.addEventListener("click",()=>void deleteSite(site));
   el("siteDetails").querySelectorAll("[data-remove-photo]").forEach(btn=>btn.addEventListener("click",()=>void removePhoto(site,btn.dataset.removePhoto)));
 }
}
async function removePhoto(site,photoId){
 if(!state.staff||!db)return;
 const photo=(site.site_photos||[]).find(p=>p.id===photoId);
 if(!photo)return;
 if(!(await raafatConfirm({title:"حذف صورة اللوحة",message:"سيتم حذف الصورة من معرض القطعة نهائياً.",danger:true,confirmText:"حذف الصورة"})))return;
 try{
   // A database failure must never leave a broken image reference.
  const {data,error:dbError}=await db.from("site_photos").delete().eq("id",photo.id).select("id").maybeSingle();
  if(dbError)throw dbError;
  if(!data)throw Error("تعذّر حذف سجل الصورة");
  state.photoUrls.delete(photo.storage_path);
  const {error:storageError}=await db.storage.from("site-photos").remove([photo.storage_path]);
  await loadSites();
  if(storageError){console.warn("Orphaned image cleanup:",storageError.message);toast("تم حذف الصورة من الموقع، وسيُعاد تنظيف ملفها لاحقاً.");}
  else{
    if(state.staffRole==="admin"){
      const ack=await db.rpc("acknowledge_photo_cleanup",{p_paths:[photo.storage_path]});
      if(ack.error)console.warn("Photo cleanup acknowledgement:",ack.error.message);
    }
    toast("تم حذف الصورة من الموقع.");
  }
  document.dispatchEvent(new CustomEvent("raafat:activity-changed"));
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
 state.staffRole=null;state.staffName="";
 if(state.user){
  const {data,error}=await db.from("staff_members").select("role,display_name").eq("user_id",state.user.id).maybeSingle();
  if(!error && data && ["admin","editor"].includes(data.role)){state.staff=true;state.staffRole=data.role;state.staffName=data.display_name||"";}
 }
 refreshAdmin();
  syncLiveChannels();
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
let siteLoadSequence=0;
let inventoryChannel=null,adminBookingChannel=null,inventoryReloadTimer=null;
function scheduleInventoryReload(){
 clearTimeout(inventoryReloadTimer);
 inventoryReloadTimer=setTimeout(()=>{if(!document.hidden)void loadSites();},650);
}
function syncLiveChannels(){
 if(!db)return;
 if(!inventoryChannel){
  inventoryChannel=db.channel("raafat-inventory")
   .on("postgres_changes",{event:"*",schema:"public",table:"sites"},scheduleInventoryReload)
   .on("postgres_changes",{event:"*",schema:"public",table:"site_photos"},scheduleInventoryReload)
   .subscribe(status=>{if(status==="SUBSCRIBED")scheduleInventoryReload();});
 }
 if(state.staffRole==="admin"&&!adminBookingChannel){
  adminBookingChannel=db.channel("raafat-bookings-admin")
   .on("postgres_changes",{event:"*",schema:"public",table:"booking_requests"},event=>{
     if(event.eventType==="INSERT")toast("وصل طلب حجز جديد • راجع لوحة الإدارة");
     document.dispatchEvent(new CustomEvent("raafat:bookings-tab"));
   }).subscribe();
 }else if(state.staffRole!=="admin"&&adminBookingChannel){
  void db.removeChannel(adminBookingChannel);adminBookingChannel=null;
 }
}
async function loadSites(){
 if(!db)return;
 const currentRequest=++siteLoadSequence;
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
  if(currentRequest!==siteLoadSequence)return;
   state.sites=items;
   if(state.selected&&!items.some(s=>s.id===state.selected))state.selected=null;
  renderFilters();render();
   adminDashboard?.render();
   bookingController?.refreshSelection();
   const hash=location.hash.startsWith("#site=")?decodeURIComponent(location.hash.slice(6)):null;
  if(hash&&state.sites.some(site=>site.id===hash))selectSite(hash);
  alertBanner("");
 }catch(error){
  if(currentRequest!==siteLoadSequence)return;
   if(!state.sites.length){renderFilters();render();adminDashboard?.render();}
   alertBanner("تعذّر تحديث البيانات. المعروض آخر بيانات تم تحميلها بنجاح.");
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
 const originalClass=site?.package_class==="E"?"E":site?(packageForSite(site)||"E"):"A";
 el("fPackageClass").value=originalClass;
 el("fStatus").disabled=state.staffRole!=="admin";
 el("fPublished").disabled=state.staffRole!=="admin";
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
 updatePackageHint();
 el("fFaces").value=get("faces",1);
 el("fLighting").value=String(get("lighting",false));
 el("fDescription").value=get("description");
 el("fCoords").value=site?site.latitude+", "+site.longitude:"";
 el("fPublished").checked=Boolean(get("published",false));
 el("siteModal").querySelectorAll("select").forEach(select=>select.dispatchEvent(new Event("raafat-select-sync")));
 openModal("siteModal");
}
function updatePackageHint({selectionChanged=false}={}){
 const selected=el("fPackageClass").value;
 const width=el("fWidth"),height=el("fHeight");
 const fixed=STANDARD_PACKAGES[selected];
 width.readOnly=Boolean(fixed);
 height.readOnly=Boolean(fixed);
 width.classList.toggle("raafat-fixed-size",Boolean(fixed));
 height.classList.toggle("raafat-fixed-size",Boolean(fixed));
 if(fixed){
   width.value=String(fixed[0]);
   height.value=String(fixed[1]);
   el("fPackageHint").textContent="الفئة "+selected+" • القياس ثابت: "+fixed[0]+" × "+fixed[1]+" متر، ولا يحتاج إدخاله يدوياً.";
 }else{
   if(selectionChanged){width.value="";height.value="";}
   el("fPackageHint").textContent="الفئة E • أدخل العرض والارتفاع بالمتر حسب قياس موقع الإعلان.";
 }
 el("fDimensionHint").textContent=fixed
   ?"القياسات محسوبة تلقائياً من الفئة المختارة."
   :"القياسات هنا فقط قابلة للتعديل، وتُحسب المساحة من العرض × الارتفاع.";
}
function sitePayload(){
 const requestedClass=el("fPackageClass").value;
 const preset=STANDARD_PACKAGES[requestedClass];
 if(!preset&&requestedClass!=="E")throw Error("اختر فئة إعلانية صحيحة.");
 const rawCode=el("fCode").value.trim();
 const effectiveClass=requestedClass;
 const code=/^\d+$/.test(rawCode)?(effectiveClass||"X")+"-"+rawCode:rawCode;
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
 const width_m=preset?preset[0]:number(el("fWidth").value);
 const height_m=preset?preset[1]:number(el("fHeight").value);
 const faces=number(el("fFaces").value);
 if(!code||code.length>40||!name||name.length>140||!city||city.length>80)throw Error("تحقق من رمز القطعة واسم الموقع والمدينة.");
 if(!REGIONS[governorate]||!REGIONS[governorate].includes(city))throw Error("المحافظة والمدينة غير متطابقتين.");
 if(street.length>200||landmark.length>200||facing.length>140||material.length>140)throw Error("بعض التفاصيل أطول من الحد المسموح.");
 if(!coords)throw Error("الإحداثيات غير صحيحة، استخدم: latitude, longitude");
 if(!Number.isFinite(width_m)||width_m<=0||width_m>1000||!Number.isFinite(height_m)||height_m<=0||height_m>1000)throw Error("القياس يجب أن يكون أكبر من صفر وأقل من 1000 متر.");
 if(!Number.isInteger(faces)||faces<1||faces>8)throw Error("عدد الأوجه من 1 إلى 8.");
 return {
   code,name,governorate,city,area,street,landmark,facing,material,description,
   package_class:requestedClass,
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
   siteFormDirty=false;
   closeModal("siteModal");
   state.editorId=null;
   await loadSites();
   selectSite(data.id);
   document.dispatchEvent(new CustomEvent("raafat:activity-changed"));
   toast(photoErrors.length?"تم حفظ القطعة، لكن بعض الصور لم تُرفع: "+photoErrors.join(" | "):"تم حفظ القطعة والصور بنجاح.");
 }catch(error){
   console.error("Save failed:",error.message);
   if(/Set your staff display name|Admin name and admin permission required/i.test(error.message||"")){
   toast("لازم تحفظ اسمك من لوحة الإدارة قبل إضافة أو تعديل القطع.");
   adminDashboard?.open();
 }else toast(error.code==="23505"?"رمز القطعة مستخدم مسبقاً. اختر رمزاً مختلفاً.":"تعذر الحفظ: "+(error.message||"تحقق من البيانات والصلاحيات."));
 }finally{actionBusy(false)}
}
async function cleanPendingPhotoFiles({silent=true}={}){
 if(!db||state.staffRole!=="admin")return;
 try{
  const {data,error}=await db.from("photo_cleanup_queue").select("storage_path").order("created_at").limit(75);
  if(error)throw error;
  const paths=(data||[]).map(row=>row.storage_path).filter(Boolean);
  if(!paths.length)return;
  const removed=await db.storage.from("site-photos").remove(paths);
  if(removed.error)throw removed.error;
  const ack=await db.rpc("acknowledge_photo_cleanup",{p_paths:paths});
  if(ack.error)throw ack.error;
  if(!silent)toast("تم تنظيف ملفات الصور المحذوفة.");
 }catch(error){
  console.warn("Pending photo cleanup deferred:",error.message);
  if(!silent)toast("تم الحذف من قاعدة البيانات؛ تنظيف بعض ملفات الصور معلّق لإعادة المحاولة.");
 }
}
async function deleteSite(site){
 if(state.staffRole!=="admin"||!db)return;
 if(!state.staffName?.trim()){
  toast("سجّل اسمك من لوحة الإدارة قبل الحذف النهائي.");adminDashboard?.open();return;
 }
 const confirmed=await raafatVerify({title:"حذف القطعة نهائياً",message:"سيتم حذف الموقع من المنصة ولا يمكن استرجاعه. اكتب رمز القطعة حتى نضمن عدم الحذف بالخطأ.",detail:"أي حجز فعّال مرتبط بالقطعة يجب معالجته أولاً.",expected:site.code});
 if(!confirmed)return;
 try{
  const {data,error}=await db.rpc("hard_delete_site",{p_site_id:site.id});
  if(error)throw error;
  if(state.selected===site.id){state.selected=null;history.replaceState(null,"",location.pathname+location.search);}
  await loadSites();
  document.dispatchEvent(new CustomEvent("raafat:activity-changed"));
  await cleanPendingPhotoFiles({silent:false});
  toast("تم حذف القطعة "+(data?.code||site.code)+" نهائياً وتسجيل العملية.");
 }catch(error){
  console.warn("Delete site:",error.message);
  const active=/active booking|booking first|حجز/i.test(error.message||"");
  toast(active?"القطعة مرتبطة بحجز فعّال. احذف الحجز أو سوِّ وضعه أولاً، ثم احذف القطعة.":"تعذر حذف القطعة: "+(error.message||"خطأ غير معروف"));
 }
}
async function signIn(event){
 event.preventDefault();
 if(!db){toast("يجب ربط Supabase أولاً.");return;}
 const email=el("email").value.trim(), password=el("password").value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password){toast("أدخل البريد الإلكتروني وكلمة المرور أولاً.");return;}
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
  if(state.staffRole==="admin")void cleanPendingPhotoFiles();
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
 state.user=null;state.staff=false;state.staffRole=null;state.staffName="";state.selected=null;state.photoUrls.clear();
 refreshAdmin();await loadSites();toast("تم تسجيل الخروج.");
}
function events(){
 el("showAvailableOnly")?.addEventListener("click",()=>{
   const filter=el("statusFilter");
   filter.value=filter.value==="available"?"":"available";
   render();zoomAll();
 });
 el("sortByNearest")?.addEventListener("click",()=>{
   if(state.nearestFirst){state.nearestFirst=false;render();return;}
   if(!freshGpsForListing()){
     toast("فعّل أيقونة تحديد الموقع بالخارطة، وانتظر إشارة GPS دقيقة، ثم اضغط الأقرب إليّ.");
     return;
   }
   state.nearestFirst=true;state.nearestLastRefresh=Date.now();
   render();
 });
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
 // Search is debounced so the map doesn't jump and rebuild on each keypress.
 let searchDebounce=null;
 el("search").addEventListener("input",()=>{
   clearTimeout(searchDebounce);
   searchDebounce=setTimeout(()=>{
     render();
     if(!navigationController?.isActive()&&!bookingController?.isSelecting())zoomAll();
   },260);
 });
 for(const filter of ["cityFilter","statusFilter","typeFilter","sizeFilter"]){
   el(filter).addEventListener("change",()=>{render();zoomAll()});
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
 el("fPackageClass").addEventListener("change",()=>{updatePackageHint({selectionChanged:true});siteFormDirty=true;});
 ["fWidth","fHeight"].forEach(id=>el(id).addEventListener("input",()=>updatePackageHint()));
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
 async function requestCloseSiteModal(){
   if(siteFormDirty&&!(await raafatConfirm({title:"الخروج من تحرير القطعة",message:"عندك تغييرات ما محفوظة بعد. تريد تغلق النموذج وتفقد التغييرات؟",danger:true,confirmText:"تجاهل التغييرات"})))return;
   siteFormDirty=false;closeModal("siteModal");
 }
 el("siteForm").addEventListener("input",()=>{siteFormDirty=true;});
 el("fPhotos").addEventListener("change",()=>{
   const count=el("fPhotos").files?.length||0;
   el("photoInfo").textContent=count?("تم اختيار "+count+" صورة • تُرفع بعد حفظ القطعة."):"اختر صوراً لإضافتها إلى معرض القطعة.";
 });
 el("siteForm").addEventListener("change",()=>{siteFormDirty=true;});
 document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>{
   if(button.dataset.close==="siteModal")requestCloseSiteModal();else closeModal(button.dataset.close);
 }));
 document.querySelectorAll(".modal-backdrop").forEach(modal=>{
   if(modal.id==="siteModal"||modal.id==="bookingModal")return;
   modal.addEventListener("click",e=>{if(e.target===modal)closeModal(modal.id)});
 });
 document.addEventListener("keydown",e=>{
   if(e.key==="Escape"){state.pick=false;el("mapPicking").hidden=true;
   for(const id of ["loginModal","passwordModal"])closeModal(id);
   if(!el("siteModal").hidden)requestCloseSiteModal();}
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
 setVisualTheme(visualTheme());
 el("raafatThemeToggle")?.addEventListener("click",()=>{
   setVisualTheme(visualTheme()==="day"?"night":"day",{save:true});
 });
 adminDashboard=createAdminDashboard({db,getState:()=>state,toast,openEditor,deleteSite,loadSites,selectSite,applySettings:applySiteSettings});
 bookingController=setupBookings({db,getState:()=>state,toast});
 document.addEventListener("raafat:booking-selection-changed",()=>render());
 document.addEventListener("raafat:inventory-refresh",()=>scheduleInventoryReload());
 setupAdminBookings({db,getState:()=>state,toast});
 initializeCatalogLayout();
 initializeMap();events();
 enhanceAdminSelects(el("siteModal"));
 if(state.map){
   try{
     navigationController=createRaafatNavigation({
       map:state.map,
       getSite:()=>state.sites.find(s=>s.id===state.selected),
       getLocation:()=>state.lastLocation,
       hasSharedGps:()=>state.locationWatchId!==null,
       getSharedGpsFix:()=>({
         point:state.lastLocation,
         accuracy:state.gpsFixAccuracy,
         heading:state.gpsFixHeading,
         speed:state.gpsFixSpeed,
         timestamp:state.gpsFixTime
       }),
       toast,
       onChange:updateNavigationToggle
     });
   }catch(error){
     console.error("Raafat navigation startup failed:",error);
     // Keep the catalogue, map pins and scrolling usable even if routing fails.
     navigationController=null;
   }
 }
 window.addEventListener("orientationchange",()=>setTimeout(()=>state.map?.invalidateSize({pan:false}),250));
 window.addEventListener("resize",()=>setTimeout(()=>state.map?.invalidateSize({pan:false}),100));
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden){
      scheduleInventoryReload();
      if(state.staffRole==="admin")document.dispatchEvent(new CustomEvent("raafat:bookings-tab"));
    }
  });
  window.setInterval(()=>{if(db&&!document.hidden)scheduleInventoryReload();},120000);
 if(!db){
  alertBanner("النظام لم يُربط بعد بقاعدة Supabase. يجب إعداد مشروع الشركة وملف config.js قبل نشره للزبائن.");
  el("listing").innerHTML='<div class="empty">لا توجد مواقع فعلية محمّلة. لن نعرض مواقع تجريبية على أنها قطع الشركة.</div>';
  render();
  return;
 }
 await authCheck();
 if(state.staffRole==="admin")void cleanPendingPhotoFiles();
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
