/**
 * RAAFAT Calm Gray Map — a quiet, low-contrast daytime vector basemap.
 * Do not change upstream OpenStreetMap place/road data, label text expressions,
 * symbol spacing, zoom ranges or visibility. Only repaint visible layers.
 */
const C=Object.freeze({
  background:"#edf0f1",
  land:"#edf0f1",
  landMuted:"#e9eded",
  district:"#e8eceb",
  park:"#dfeae2",
  forest:"#d4e5db",
  water:"#d5e6ea",
  waterEdge:"#afcdd2",
  building:"#dce2e2",
  buildingOutline:"#cbd4d3",
  road:"#ffffff",
  secondaryRoad:"#fafbfa",
  highway:"#f6f0e3",
  casing:"#d2d9d8",
  boundary:"#a9b9b8",
  neutral:"#b9c7c5",
  name:"#42575b",
  nameStrong:"#27474a",
  roadName:"#5a686a",
  poi:"#596d68",
  halo:"#f6f8f7"
});
function colorize(layer,output){
 const next={...layer,paint:{...(layer.paint||{})}};
 const paint=next.paint;
 const source=String(layer["source-layer"]||"").toLowerCase();
 const id=String(layer.id||"").toLowerCase();
 const key=source+" "+id;
 if(layer.type==="background"){
   paint["background-color"]=C.background;
 }else if(layer.type==="fill"){
   if(!("fill-pattern" in paint)){
     let color=C.land;
     if(/water|ocean|lake/.test(key))color=C.water;
     else if(/forest|wood/.test(key))color=C.forest;
     else if(/park|grass|garden|nature/.test(key))color=C.park;
     else if(/building/.test(key))color=C.building;
     else if(/residential|industrial|commercial/.test(key))color=C.district;
     else if(/landcover|landuse/.test(key))color=C.landMuted;
     paint["fill-color"]=color;
   }
   if(/building/.test(key)&&"fill-outline-color" in paint)
     paint["fill-outline-color"]=C.buildingOutline;
 }else if(layer.type==="fill-extrusion"){
   paint["fill-extrusion-color"]=C.building;
 }else if(layer.type==="line"){
   const road=/^(transportation|roads|road)$/.test(source)&&!/rail|ferry/.test(id);
   if(road){
     const casing=/casing|case|outline/.test(id);
     const major=/motorway|trunk|primary|highway|main/.test(id);
     paint["line-color"]=casing?C.casing:major?C.highway:
       /secondary|tertiary/.test(id)?C.secondaryRoad:C.road;
   }else if(/waterway|river|stream/.test(key)){
     paint["line-color"]=C.waterEdge;
   }else if(/boundary|admin/.test(key)){
     paint["line-color"]=C.boundary;
   }else if("line-color" in paint){
     paint["line-color"]=C.neutral;
   }
 }else if(layer.type==="symbol"&&layer.layout?.["text-field"]!==undefined){
   const road=/road|transportation_name|street/.test(key);
   const place=/place|city|town|capital|state|village/.test(key);
   const poi=/poi|shop|landmark|amenity|business/.test(key);
   paint["text-color"]=place?C.nameStrong:road?C.roadName:poi?C.poi:C.name;
   paint["text-halo-color"]=C.halo;
   paint["text-halo-width"]=place?1.55:1.25;
   paint["text-halo-blur"]=.12;
 }
 output.push(next);
}

export async function fetchRaafatMapStyle(publicKey,{arabicEnabled=true}={}){
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
  const layers=[];
  for(const layer of raw.layers)colorize(layer,layers);
  raw.layers=layers;
  raw.name="Raafat Calm Gray";
  raw.metadata={...(raw.metadata||{}),"raafat:palette":"calm-gray-daylight","raafat:source":provider};
  return raw;
}