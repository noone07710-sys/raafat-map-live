/**
 * RAAFAT graphite map, sampled directly from the approved reference (#363636).
 * Never tint the base land at different zoom levels. Preserve every source
 * symbol layout, original Arabic/English text, POI and road geometry.
 */
const C=Object.freeze({
  background:"#363636",
  land:"#363636",
  landMuted:"#363636",
  district:"#363636",
  park:"#363636",
  forest:"#363636",
  water:"#3a4649",
  waterEdge:"#5a696b",
  building:"#434343",
  buildingOutline:"#515151",
  road:"#858585",
  secondaryRoad:"#747474",
  highway:"#a2a2a2",
  casing:"#393939",
  boundary:"#555b5c",
  neutral:"#535758",
  name:"#d9dcd9",
  nameStrong:"#eff0ec",
  roadName:"#c7cdca",
  poi:"#d1d6d1",
  halo:"#363636"
});

const DAY=Object.freeze({
  background:"#f5f2ec",
  land:"#f5f2ec",
  landMuted:"#f1eee6",
  district:"#f1ece6",
  park:"#e4eee0",
  forest:"#e1ece2",
  water:"#cee6e6",
  waterEdge:"#a6cdd0",
  building:"#e4dfd7",
  buildingOutline:"#c6bfb6",
  road:"#d4d2cb",
  secondaryRoad:"#c3c0b9",
  highway:"#e3bb8e",
  casing:"#e3ded4",
  boundary:"#c5b9ab",
  neutral:"#c1b9ac",
  name:"#4c5350",
  nameStrong:"#313c39",
  roadName:"#596661",
  poi:"#61736e",
  halo:"#f5f2ec"
});
function colorize(layer,output,palette=C){
 const next={...layer,paint:{...(layer.paint||{})}};
 const paint=next.paint;
 const source=String(layer["source-layer"]||"").toLowerCase();
 const id=String(layer.id||"").toLowerCase();
 const key=source+" "+id;
 if(layer.type==="background"){
   paint["background-color"]=palette.background;
   paint["background-opacity"]=1;
   delete paint["background-pattern"];
 }else if(layer.type==="fill"){
   if(!("fill-pattern" in paint)){
     let color=palette.land;
     if(/water|ocean|lake/.test(key))color=palette.water;
     else if(/forest|wood/.test(key))color=palette.forest;
     else if(/park|grass|garden|nature/.test(key))color=palette.park;
     else if(/building/.test(key))color=palette.building;
     else if(/residential|industrial|commercial/.test(key))color=palette.district;
     else if(/landcover|landuse/.test(key))color=palette.landMuted;
     paint["fill-color"]=color;
   }
   if(/building/.test(key)&&"fill-outline-color" in paint)
     paint["fill-outline-color"]=palette.buildingOutline;
 }else if(layer.type==="fill-extrusion"){
   paint["fill-extrusion-color"]=palette.building;
 }else if(layer.type==="line"){
   const road=/^(transportation|roads|road)$/.test(source)&&!/rail|ferry/.test(id);
   if(road){
     const casing=/casing|case|outline/.test(id);
     const major=/motorway|trunk|primary|highway|main/.test(id);
     paint["line-color"]=casing?palette.casing:major?palette.highway:
       /secondary|tertiary/.test(id)?palette.secondaryRoad:palette.road;
   }else if(/waterway|river|stream/.test(key)){
     paint["line-color"]=palette.waterEdge;
   }else if(/boundary|admin/.test(key)){
     paint["line-color"]=palette.boundary;
   }else if("line-color" in paint){
     paint["line-color"]=palette.neutral;
   }
 }else if(layer.type==="symbol"&&layer.layout?.["text-field"]!==undefined){
   const road=/road|transportation_name|street/.test(key);
   const place=/place|city|town|capital|state|village/.test(key);
   const poi=/poi|shop|landmark|amenity|business/.test(key);
   paint["text-color"]=place?palette.nameStrong:road?palette.roadName:poi?palette.poi:palette.name;
   paint["text-halo-color"]=palette.halo;
   paint["text-halo-width"]=place?1.55:1.25;
   paint["text-halo-blur"]=.12;
 }
 output.push(next);
}

export async function fetchRaafatMapStyle(publicKey,{arabicEnabled=true,theme="night"}={}){
  const palette=theme==="day"?DAY:C;
  // OpenFreeMap has weekly OpenStreetMap-based updates and supports free
  // commercial use without API keys or billing. CARTO remains a fallback.
  const ofmUrl="https://tiles.openfreemap.org/styles/liberty";
  let raw=null;
  let provider="openfreemap";
  try{
    const res=await fetch(ofmUrl,{mode:"cors",credentials:"omit"});
    if(!res.ok)throw new Error("OpenFreeMap HTTP "+res.status);
    raw=await res.json();
    if(raw.version!==8||!Array.isArray(raw.layers)||!raw.sources)
      throw new Error("Invalid OpenFreeMap vector style");
    // When style is passed as an object, normalize relative asset paths since
    // MapLibre cannot infer the remote style base URL.
    const absolute=url=>typeof url==="string"&&!/^(https?:|data:)/i.test(url)
      ? new URL(url,ofmUrl+"/").href : url;
    if(raw.glyphs)raw.glyphs=absolute(raw.glyphs);
    if(raw.sprite){
      if(typeof raw.sprite==="string")raw.sprite=absolute(raw.sprite);
      else if(Array.isArray(raw.sprite))raw.sprite=raw.sprite.map(item=>({...item,url:absolute(item.url)}));
    }
    for(const src of Object.values(raw.sources)){
      if(src.url)src.url=absolute(src.url);
      if(Array.isArray(src.tiles))src.tiles=src.tiles.map(absolute);
    }
  }catch(failure){
    console.warn("OpenFreeMap unavailable. Using CARTO backup:",failure);
    provider="carto";
    if(!publicKey)throw failure;
    const key=encodeURIComponent(String(publicKey));
    const response=await fetch("https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key="+key,{
      mode:"cors",credentials:"omit"
    });
    if(!response.ok)throw new Error("CARTO backup HTTP "+response.status);
    raw=await response.json();
    if(raw.version!==8||!Array.isArray(raw.layers)||!raw.sources)
      throw new Error("Invalid CARTO backup style");
    for(const src of Object.values(raw.sources)){
      if(src.type!=="vector"||typeof src.url!=="string")continue;
      src.url=src.url.replace(/\{api_key\}/g,"?key="+key);
      if(!/[?&]key=/.test(src.url))src.url+=(src.url.includes("?")?"&":"?")+"key="+key;
    }
  }
  // Liberty ships a Natural Earth raster underneath its vector map (z <= 7).
  // That raster has white/light colors and caused the map to turn white when
  // zooming out. Use vector-only cartography over a truly SOLID graphite
  // background instead. Raster hillshade and fade layers cannot wash it out.
  const layers=[{
    id:"raafat-graphite-background",type:"background",
    paint:{"background-color":palette.background,"background-opacity":1}
  }];
  for(const layer of raw.layers){
    if(layer.type==="raster"||layer.type==="hillshade")continue;
    colorize(layer,layers,palette);
  }
  raw.layers=layers;
  raw.name=theme==="day"?"Raafat Daytime • Ivory":"Raafat Graphite • 363636";
  raw.metadata={...(raw.metadata||{}),"raafat:palette":theme==="day"?"day-ivory":"graphite-363636","raafat:source":provider};
  return raw;
}
/* Recolor an already loaded MapLibre basemap without rebuilding the Leaflet map
 * or disturbing GPS routing, clusters, markers or map zoom position. */
export function recolorRaafatMap(renderer,theme="night"){
 if(!renderer||typeof renderer.getStyle!=="function"||typeof renderer.setPaintProperty!=="function")return false;
 const style=renderer.getStyle();
 if(!style||!Array.isArray(style.layers))return false;
 const palette=theme==="day"?DAY:C;
 for(const layer of style.layers){
   const output=[];colorize(layer,output,palette);
   const colors=output[0]?.paint||{};
   const original=layer.paint||{};
   for(const [key,value] of Object.entries(colors)){
     if(/(?:^background-color$|^fill-color$|^fill-outline-color$|^fill-extrusion-color$|^line-color$|^text-color$|^text-halo-color$|^text-halo-width$|^text-halo-blur$)/.test(key)){
       if(JSON.stringify(original[key])===JSON.stringify(value))continue;
       try{renderer.setPaintProperty(layer.id,key,value)}catch(err){
         console.warn("Raafat palette skipped layer:",layer.id,key,err);
       }
     }
   }
 }
 return true;
}
