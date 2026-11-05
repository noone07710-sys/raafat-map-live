/**
 * Raafat Signature: deep emerald, warm labels and softly illuminated roads.
 *
 * Styling is paint-only. We intentionally keep ALL upstream OpenFreeMap/CARTO
 * text fields, glyphs, POI icons, filters, layer ordering, min/max zoom and
 * label collision rules unchanged, so the brand theme does not hide places.
 */
const C=Object.freeze({
  backdrop:"#071F27",
  land:"#0D3736",
  landMuted:"#123E3B",
  neighborhoods:"#195046",
  park:"#205E48",
  forest:"#145741",
  water:"#0A3547",
  waterOutline:"#377C82",
  buildings:"#27584D",
  buildingEdge:"#4A8070",
  road:"#E7FFF5",
  secondaryRoad:"#C6EBDD",
  highway:"#FFE8B9",
  roadCasing:"#295E52",
  boundaries:"#669785",
  generic:"#43796F",
  label:"#FFCD8D",
  landmark:"#FFE8BF",
  halo:"#071F27"
});
const width=(major)=>[
  "interpolate",["linear"],["zoom"],
  9,major?1.2:.6,
  12,major?2.2:1.4,
  15,major?4.7:2.4,
  18,major?8:4.3,
  21,major?12:7.5
];
function colorize(layer,all){
 const next={...layer,paint:{...(layer.paint||{})}};
 const paint=next.paint;
 const source=String(layer["source-layer"]||"").toLowerCase();
 const id=String(layer.id||"").toLowerCase();
 const scope=source+" "+id;

 if(layer.type==="background"){
   paint["background-color"]=C.backdrop;
 }else if(layer.type==="fill"){
   if(!("fill-pattern" in paint)){
     let color=C.land;
     if(/water|ocean|lake/.test(scope))color=C.water;
     else if(/forest|wood|tree/.test(scope))color=C.forest;
     else if(/park|grass|garden|nature/.test(scope))color=C.park;
     else if(/building/.test(scope))color=C.buildings;
     else if(/residential|landuse|industrial|commercial/.test(scope))color=C.neighborhoods;
     else if(/landcover|land/.test(scope))color=C.landMuted;
     paint["fill-color"]=color;
   }
   if(/building/.test(scope) && "fill-outline-color" in paint){
     paint["fill-outline-color"]=C.buildingEdge;
   }
 }else if(layer.type==="fill-extrusion"){
   paint["fill-extrusion-color"]=C.buildings;
 }else if(layer.type==="line"){
   const road=/^(transportation|roads|road)$/.test(source)&&!/rail|ferry/.test(id);
   if(road){
     const casing=/casing|case|outline/.test(id);
     const major=/motorway|trunk|primary|highway|main/.test(id);
     if(!casing && !("line-dasharray" in paint)){
       // Low-opacity luminous road underlay; original road stays crisp on top.
       all.push({...next,id:"raafat-glow-"+layer.id,paint:{
         ...paint,
         "line-color":major?"#EDFFF6":"#C2F4DC",
         "line-opacity":major?.24:.10,
         "line-width":width(major),
         "line-blur":major?2.8:2.1
       }});
     }
     paint["line-color"]=casing?C.roadCasing:major?C.highway:
       /secondary|tertiary/.test(id)?C.secondaryRoad:C.road;
     // Keep original widths and visibility thresholds wherever possible.
     paint["line-opacity"]=casing?.72:.94;
   }else if(/waterway|stream|river/.test(scope)){
     paint["line-color"]=C.waterOutline;
   }else if(/boundary|admin/.test(scope)){
     paint["line-color"]=C.boundaries;
   }else if("line-color" in paint){
     paint["line-color"]=C.generic;
   }
 }else if(layer.type==="symbol" && layer.layout?.["text-field"]!==undefined){
   // Crucial: no text-field replacement or zoom limits. Preserve all names,
   // including Arabic businesses, street labels, landmarks and city names.
   const road=/road|transportation_name|street/.test(scope);
   const place=/place|city|town|capital|state|village/.test(scope);
   const poi=/poi|shop|landmark|amenity|business/.test(scope);
   paint["text-color"]=poi?C.landmark:place?"#FFCA88":road?"#F7D3A0":C.label;
   paint["text-halo-color"]=C.halo;
   paint["text-halo-width"]=place?1.75:1.35;
   paint["text-halo-blur"]=.35;
 }
 all.push(next);
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
  raw.name="Raafat Signature — Emerald Royale VIP";
  raw.metadata={...(raw.metadata||{}),"raafat:palette":"emerald-amber-luminous","raafat:source":provider};
  return raw;
}