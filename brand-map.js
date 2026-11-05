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
  raw.name="Raafat Graphite • 363636";
  raw.metadata={...(raw.metadata||{}),"raafat:palette":"graphite-363636","raafat:source":provider};
  return raw;
}