/**
 * Google Maps basemap for RA'AFAT's existing Leaflet overlays.
 * Uses the official Maps JavaScript API via the GoogleMutant bridge (0.16.0).
 * Maps of user billboards, cluster pins, location tracking and map clicks
 * remain Leaflet layers, so they keep working without a database migration.
 *
 * Google browser keys are public by design. Restrict the key in Google Cloud
 * to Maps JavaScript API and https://noone07710-sys.github.io/raafat-map-live/*.
 */
const GOOGLE_PLUGIN_URL="https://unpkg.com/leaflet.gridlayer.googlemutant@0.16.0/dist/Leaflet.GoogleMutant.js";
const GOOGLE_STYLE=[
  {elementType:"geometry",stylers:[{color:"#103b37"}]},
  {elementType:"labels.text.fill",stylers:[{color:"#ffd3a3"}]},
  {elementType:"labels.text.stroke",stylers:[{color:"#0a302e"}]},
  {featureType:"landscape",elementType:"geometry",stylers:[{color:"#13453e"}]},
  {featureType:"landscape.natural",elementType:"geometry",stylers:[{color:"#164c42"}]},
  {featureType:"administrative",elementType:"geometry.stroke",stylers:[{color:"#3b7369"},{weight:0.7}]},
  {featureType:"administrative.locality",elementType:"labels.text.fill",stylers:[{color:"#ffc17a"}]},
  {featureType:"poi",elementType:"geometry",stylers:[{color:"#1d4d44"}]},
  {featureType:"poi",elementType:"labels",stylers:[{visibility:"on"}]},
  {featureType:"poi.business",elementType:"labels",stylers:[{visibility:"on"}]},
  {featureType:"poi",elementType:"labels.text.fill",stylers:[{color:"#ffcd9e"}]},
  {featureType:"poi",elementType:"labels.text.stroke",stylers:[{color:"#10362f"}]},
  {featureType:"poi.park",elementType:"geometry",stylers:[{color:"#1b5744"}]},
  {featureType:"road",elementType:"geometry",stylers:[{color:"#bfdcd1"}]},
  {featureType:"road",elementType:"geometry.stroke",stylers:[{color:"#2b645b"}]},
  {featureType:"road.local",elementType:"geometry",stylers:[{color:"#a5c7ba"}]},
  {featureType:"road.arterial",elementType:"geometry",stylers:[{color:"#e4f1e3"}]},
  {featureType:"road.highway",elementType:"geometry",stylers:[{color:"#f8ddb4"}]},
  {featureType:"road.highway",elementType:"geometry.stroke",stylers:[{color:"#a08056"}]},
  {featureType:"road",elementType:"labels.text.fill",stylers:[{color:"#fff1d6"}]},
  {featureType:"road",elementType:"labels.text.stroke",stylers:[{color:"#18423e"}]},
  {featureType:"transit",elementType:"geometry",stylers:[{color:"#38665c"}]},
  {featureType:"water",elementType:"geometry",stylers:[{color:"#073341"}]},
  {featureType:"water",elementType:"labels.text.fill",stylers:[{color:"#a0d9d3"}]}
];
let googlePromise=null,bridgePromise=null;
function addScript(src){
 return new Promise((resolve,reject)=>{
   const tag=document.createElement("script");
   tag.src=src;tag.async=true;tag.crossOrigin="anonymous";
   tag.onload=()=>resolve();
   tag.onerror=()=>reject(new Error("Failed to load "+new URL(src).hostname));
   document.head.append(tag);
 });
}
function loadGoogleApi(key){
 if(window.google?.maps?.Map)return Promise.resolve(window.google.maps);
 if(googlePromise)return googlePromise;
 googlePromise=new Promise((resolve,reject)=>{
   let finished=false;
   const callback="__raafatGoogleMapsLoaded";
   const cleanup=()=>{delete window[callback];clearTimeout(timer)};
   const done=(error)=>{
     if(finished)return;
     finished=true;cleanup();
     if(error)reject(error);else resolve(window.google.maps);
   };
   const timer=setTimeout(()=>done(new Error("Google Maps took too long to load")),16000);
   window[callback]=()=>window.google?.maps?.Map?done():done(new Error("Google Maps API is unavailable"));
   const url=new URL("https://maps.googleapis.com/maps/api/js");
   url.searchParams.set("key",key);
   url.searchParams.set("v","weekly");
   url.searchParams.set("language","ar");
   url.searchParams.set("region","IQ");
   url.searchParams.set("callback",callback);
   addScript(url.toString()).catch(done);
 });
 return googlePromise;
}
async function loadGoogleBridge(){
 if(typeof window.L?.gridLayer?.googleMutant==="function")return;
 if(!bridgePromise)bridgePromise=addScript(GOOGLE_PLUGIN_URL);
 await bridgePromise;
 if(typeof window.L?.gridLayer?.googleMutant!=="function")
   throw new Error("Google Maps Leaflet bridge is missing");
}
export async function createGoogleMapLayer(key){
 if(typeof key!=="string"||key.trim().length<20)throw new Error("Google Maps API key is not configured");
 await loadGoogleApi(key.trim());
 await loadGoogleBridge();
 return window.L.gridLayer.googleMutant({
   type:"roadmap",
   styles:GOOGLE_STYLE,
   maxZoom:21,
   minZoom:2,
   updateWhenIdle:false,
   tileSize:256
 });
}
