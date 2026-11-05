/**
 * RA'AFAT / SIGNATURE MAP
 * OpenFreeMap vector basemap with CARTO backup and RA'AFAT colors.
 * This contains only public design data. The CARTO key is provided by config.js.
 */
const C = Object.freeze({
  background:"#071F24", terrain:"#0D3435", district:"#123E3C",
  park:"#115044", water:"#082D37", waterEdge:"#286F78",
  building:"#1B4944", buildingOutline:"#2B5B55",
  roadMajor:"#EBFFF7", roadSecondary:"#C7E9E0", roadLocal:"#91C7BA",
  casing:"#174C4C", glow:"#D4FFF6",
  highway:"#FFE0B2", edge:"#609589",
  name:"#F8AF60", nameStrong:"#FFCA84",
  halo:"#071E21"
});
const zoom=(levels)=>["interpolate",["linear"],["zoom"],...levels.flat()];
const roadWidth=(major)=>major
 ? zoom([[7,.6],[10,1.3],[13,2.4],[15,3.6],[18,6.2],[22,9]])
 : zoom([[7,.1],[10,.45],[13,.8],[15,1.6],[18,2.9],[22,5.3]]);
const glowWidth=(major)=>major
 ? zoom([[7,1.8],[10,3.4],[13,6],[15,8],[18,12.5],[22,17]])
 : zoom([[7,.4],[10,1.1],[13,2.2],[15,3.9],[18,6],[22,10]]);

function addPremiumLayer(original, layers, arabicEnabled){
  const layer={...original,layout:{...(original.layout||{})},paint:{...(original.paint||{})}};
  const type=layer.type;
  const source=String(layer["source-layer"]||"").toLowerCase();
  const id=String(layer.id||"").toLowerCase();
  const paint=layer.paint;
  if(type==="background"){
    paint["background-color"]=C.background;
    paint["background-opacity"]=1;
  }else if(type==="fill"){
    const water=/water|ocean/.test(source+" "+id);
    const park=/park|landcover|grass|forest|wood/.test(source+" "+id);
    const building=/building/.test(source+" "+id);
    const residential=/residential/.test(id);
    paint["fill-color"]=water?C.water:park?C.park:building?C.building:residential?C.district:C.terrain;
    paint["fill-opacity"]=water?1:building?.85:park?.68:residential?.55:.53;
    if(building){paint["fill-outline-color"]=C.buildingOutline}
    if("fill-pattern" in paint)delete paint["fill-pattern"];
  }else if(type==="fill-extrusion"){
    paint["fill-extrusion-color"]=C.building;
    paint["fill-extrusion-opacity"]=.6;
  }else if(type==="line"){
    const isRoad=/^(transportation|roads|road)$/.test(source)&&!/rail|ferry/.test(id);
    const highway=/motorway|trunk|primary|highway/.test(id);
    const major=highway||/secondary|road_pri|road_mot/.test(id);
    const casing=/casing|case|outline|hatch/.test(id);
    const water=/waterway|water/.test(source);
    if(isRoad){
      // Soft luminous underlay, ahead of the sharp road centreline.
      if(!casing){
        layers.push({...layer,id:"raafat-ambient-"+layer.id,
          paint:{...paint,"line-color":major?C.glow:C.roadSecondary,
            "line-width":glowWidth(major),"line-opacity":major?.2:.085,
            "line-blur":major?3.9:2.3},
          layout:{...layer.layout}});
      }
      paint["line-color"]=casing?C.casing:highway?C.highway:major?C.roadMajor:C.roadLocal;
      paint["line-opacity"]=casing?.62:major?.93:.68;
      paint["line-width"]=casing?glowWidth(major):roadWidth(major);
      delete paint["line-dasharray"];
      paint["line-blur"]=casing?.45:.18;
    }else if(water){
      paint["line-color"]=C.waterEdge;
      paint["line-opacity"]=.74;
      paint["line-width"]=zoom([[7,.5],[12,1.1],[16,2.8],[20,5]]);
    }else{
      paint["line-color"]=C.edge;
      paint["line-opacity"]=.34;
      paint["line-width"]=.8;
    }
  }else if(type==="symbol"){
    if(layer.layout["text-field"]!==undefined){
      const road=/^(transportation_name|road_labels|roads_labels)$/.test(source)||/road[-_]label/.test(id);
      const place=/^(place|places)$/.test(source);
      const majorPlace=place && /city|capital|state/.test(id);
      const poi=/^(poi|pois|point_of_interest)$/.test(source)||/poi|landmark|shop|amenity/.test(id);
      // MapLibre <6.9 needs an RTL shaping plugin. Avoid scrambled Arabic on
      // browsers that cannot load it; our persistent city labels still use Arabic DOM text.
      layer.layout["text-field"]=arabicEnabled
        ? ["coalesce",["get","name_ar"],["get","name:ar"],["get","name"],["get","name_en"]]
        : ["coalesce",["get","name_en"],["get","name:en"],["get","name"]];
      layer.layout["text-letter-spacing"]=0;
      layer.layout["text-padding"]=road?1.5:3;
      if(road){
        layer.maxzoom=24;
        layer.layout["symbol-spacing"]=225;
        layer.minzoom=Math.max(Number(layer.minzoom)||0,13);
        layer.layout["text-max-angle"]=25;
        layer.layout["text-size"]=zoom([[10,10],[13,11],[15,12.5],[18,13.4],[22,15]]);
        layer.layout["text-allow-overlap"]=false;
        layer.layout["text-ignore-placement"]=false;
      }else if(place){
        // Critical place markers are stabilized separately with HTML/Leaflet labels.
        layer.layout["text-size"]=zoom([[5,10],[10,12],[13,13],[17,15],[22,16]]);
        if(majorPlace){layer.maxzoom=24;layer.layout["text-optional"]=true;}
      }else if(poi){
        // Keep real nearby shops, clinics, schools and landmarks legible.
        layer.minzoom=Math.max(13,Math.min(Number(layer.minzoom)||14.5,14.5));
        layer.maxzoom=24;
        layer.layout["text-size"]=zoom([[12,10],[14,11],[16,12.5],[18,13.5],[22,15]]);
        layer.layout["text-max-width"]=10;
        layer.layout["text-padding"]=4;
        layer.layout["text-allow-overlap"]=false;
        layer.layout["text-ignore-placement"]=false;
        layer.layout["text-optional"]=true;
      }
      paint["text-color"]=majorPlace?C.nameStrong:road?C.name:poi?"#F2D5B2":C.name;
      paint["text-halo-color"]=C.halo;
      paint["text-halo-width"]=majorPlace?2.1:road?1.6:1.45;
      paint["text-halo-blur"]=majorPlace?.8:.55;
      paint["text-opacity"]=poi?.94:road?.86:1;
      if("icon-opacity" in paint){paint["icon-opacity"]=poi?.75:.75;}
    }
  }
  layers.push(layer);
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
  for(const layer of raw.layers)addPremiumLayer(layer,layers,arabicEnabled);
  // Highlight verified OSM landmarks even when the supplied CARTO style hides POI names.
  // The source may use the legacy 'poi' schema or current Protomaps 'pois' schema.
  const sourceLayers=new Set(raw.layers.map(layer=>layer["source-layer"]).filter(Boolean));
  const vector=Object.entries(raw.sources).find(([,src])=>src.type==="vector");
  const modern=vector && /\/v2\//.test(String(vector[1].url||""));
  const poiLayer=sourceLayers.has("pois")?"pois":sourceLayers.has("poi")?"poi":modern?"pois":null;
  if(vector&&poiLayer){
    const name=arabicEnabled
      ? ["coalesce",["get","name:ar"],["get","name_ar"],["get","name"],["get","name:en"]]
      : ["coalesce",["get","name:en"],["get","name_en"],["get","name"]];
    const textFont=raw.layers.find(layer=>layer.type==="symbol"&&layer.layout?.["text-font"])?.layout?.["text-font"]||
      ["Open Sans Regular"];
    layers.push({
      id:"raafat-recognizable-landmarks",type:"symbol",
      source:vector[0],"source-layer":poiLayer,minzoom:12.5,maxzoom:24,
      filter:["all",["has","name"],
        ["match",["get","kind"],
          ["hospital","clinic","school","university","college","supermarket",
           "marketplace","police","townhall","bank","fuel","hotel","station",
           "mosque","place_of_worship","pharmacy","bus_station"],true,false]],
      layout:{"text-field":name,"text-font":textFont,
        "text-size":zoom([[12,10],[14,11],[17,12],[20,13]]),
        "text-max-width":10,"text-padding":6,
        "text-allow-overlap":false,"text-ignore-placement":false,
        "text-optional":true,"symbol-placement":"point"},
      paint:{"text-color":"#FFD399","text-opacity":.96,
        "text-halo-color":C.halo,"text-halo-width":1.65,"text-halo-blur":.45}
    });
  }
  raw.layers=layers;
  raw.name="RAAFAT Signature • Emerald Nocturne";
  raw.metadata={...(raw.metadata||{}),"raafat:palette":"emerald-amber-luminous","raafat:source":provider};
  return raw;
}