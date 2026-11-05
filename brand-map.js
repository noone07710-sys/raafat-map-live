/**
 * RA'AFAT / SIGNATURE MAP
 * Custom CARTO vector style; graceful Arabic label handling and elegant luminous roads.
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
    const isRoad=source==="transportation"&&!/rail|ferry/.test(id);
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
      const road=source==="transportation_name";
      const place=source==="place";
      const majorPlace=place && /city|capital|state/.test(id);
      const poi=source==="poi";
      // MapLibre <6.9 needs an RTL shaping plugin. Avoid scrambled Arabic on
      // browsers that cannot load it; our persistent city labels still use Arabic DOM text.
      layer.layout["text-field"]=arabicEnabled
        ? ["coalesce",["get","name_ar"],["get","name:ar"],["get","name"],["get","name_en"]]
        : ["coalesce",["get","name_en"],["get","name:en"],["get","name"]];
      layer.layout["text-letter-spacing"]=0;
      layer.layout["text-padding"]=road?1.5:3;
      if(road){
        layer.maxzoom=24;
        layer.layout["symbol-spacing"]=170;
        layer.layout["text-max-angle"]=25;
        layer.layout["text-size"]=zoom([[10,10],[13,11],[15,12.5],[18,13.4],[22,15]]);
        layer.layout["text-allow-overlap"]=false;
        layer.layout["text-ignore-placement"]=false;
      }else if(place){
        // Critical place markers are stabilized separately with HTML/Leaflet labels.
        layer.layout["text-size"]=zoom([[5,10],[10,12],[13,13],[17,15],[22,16]]);
        if(majorPlace){layer.maxzoom=24;layer.layout["text-optional"]=true;}
      }else if(poi){
        layer.layout["text-size"]=zoom([[12,8],[15,10],[18,11],[22,12]]);
      }
      paint["text-color"]=majorPlace?C.nameStrong:road?C.name:poi?"#E8AB74":C.name;
      paint["text-halo-color"]=C.halo;
      paint["text-halo-width"]=majorPlace?2.1:road?1.6:1.45;
      paint["text-halo-blur"]=majorPlace?.8:.55;
      paint["text-opacity"]=poi?.82:1;
      if("icon-opacity" in paint){paint["icon-opacity"]=poi?.55:.75;}
    }
  }
  layers.push(layer);
}
export async function fetchRaafatMapStyle(publicKey, {arabicEnabled=true}={}){
  if(!publicKey)throw new Error("CARTO basemap key is missing");
  const key=encodeURIComponent(String(publicKey));
  const response=await fetch("https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key="+key,{
    mode:"cors",credentials:"omit"
  });
  if(!response.ok)throw new Error("CARTO vector style: "+response.status);
  const raw=await response.json();
  if(raw.version!==8||!Array.isArray(raw.layers)||!raw.sources)throw new Error("Invalid vector style data");
  // Preserve CARTO's current served glyph and sprite URLs and protect the tiles token.
  for(const src of Object.values(raw.sources)){
    if(src.type!=="vector"||typeof src.url!=="string")continue;
    src.url=src.url.replace(/\{api_key\}/g,"?key="+key);
    if(!/[?&]key=/.test(src.url))src.url+=(src.url.includes("?")?"&":"?")+"key="+key;
  }
  const layers=[];
  for(const layer of raw.layers)addPremiumLayer(layer,layers,arabicEnabled);
  raw.layers=layers;
  raw.name="RAAFAT Signature • Emerald Nocturne";
  raw.metadata={...(raw.metadata||{}),"raafat:palette":"emerald-amber-luminous"};
  return raw;
}