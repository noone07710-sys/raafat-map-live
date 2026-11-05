/**
 * Raafat Signature vector basemap.
 * CARTO's official Voyager vector style provides real OSM geometry and labels;
 * we recolor its vector layers at runtime, rather than filtering raster PNGs.
 * This module contains no private credentials.
 */
const COLORS = Object.freeze({
  background: "#003f3e",
  terrain: "#094a47",
  park: "#14524b",
  water: "#082f33",
  building: "#0b5550",
  road: "#e5fff5",
  majorRoad: "#ffffff",
  roadCasing: "#24605b",
  border: "#9ecdc3",
  label: "#f4951a",
  labelBright: "#ffac53",
  labelHalo: "#00302f"
});

const roadWidth = (major, casing) => {
  const scale = major ? [0.75,1.25,2.2,3.6,5.1,7.5] : [0.25,0.55,1.1,1.65,2.9,4.1];
  return ["interpolate",["linear"],["zoom"],
    7,scale[0],10,scale[1],13,scale[2],15,scale[3],18,scale[4],22,scale[5]
  ].map((item,index) => index > 1 && index % 2 === 0 && casing ? item + 1.4 : item);
};

function restyleLayer(input, out) {
  const layer = {...input,paint:{...(input.paint||{})}};
  const name = String(layer.id||"").toLowerCase();
  const sourceLayer = String(layer["source-layer"]||"").toLowerCase();
  const p = layer.paint;

  if(layer.type==="background"){
    p["background-color"]=COLORS.background;
    p["background-opacity"]=1;
  } else if(layer.type==="fill"){
    const isWater = /water|ocean/.test(sourceLayer+" "+name);
    const isBuilding = /building/.test(sourceLayer+" "+name);
    const isPark = /park|landcover|grass|wood|forest/.test(sourceLayer+" "+name);
    p["fill-color"] = isWater ? COLORS.water
      : isBuilding ? COLORS.building : isPark ? COLORS.park : COLORS.terrain;
    p["fill-opacity"]=isBuilding?.56:isWater?.98:isPark?.65:.34;
  } else if(layer.type==="fill-extrusion"){
    p["fill-extrusion-color"]=COLORS.building;
    p["fill-extrusion-opacity"]=.55;
  } else if(layer.type==="line"){
    const isRoad = sourceLayer==="transportation" && !/rail|ferry/.test(name);
    const isBoundary = sourceLayer==="boundary" || /boundary/.test(name);
    const isWater = sourceLayer==="waterway" || /water/.test(name);
    if(isRoad){
      const casing=/casing|case|outline|hatch/.test(name);
      const major=/motorway|trunk|primary|road_pri|road_trunk|road_mot/.test(name);
      p["line-color"]=casing?COLORS.roadCasing:(major?COLORS.majorRoad:COLORS.road);
      p["line-width"]=roadWidth(major,casing);
      p["line-opacity"]=casing?.74:(major?.97:.78);
      if(!casing && /fill/.test(name)){
        const glow={...layer,id:"raafat-glow-"+layer.id,paint:{
          ...p,"line-color":"#f0fff9",
          "line-width":roadWidth(major,true),
          "line-opacity":major?.2:.12,
          "line-blur":2.3
        }};
        out.push(glow);
      }
    }else if(isBoundary){
      p["line-color"]=COLORS.border;
      p["line-opacity"]=.43;
      p["line-width"]=.85;
    }else if(isWater){
      p["line-color"]="#1f6663";
      p["line-opacity"]=.65;
    }else{
      p["line-color"]="#3d766e";
      p["line-opacity"]=.42;
    }
  } else if(layer.type==="symbol"){
    if(layer.layout && layer.layout["text-field"]){
      const isPlace=/place|city|country|state/.test(sourceLayer+" "+name);
      p["text-color"]=isPlace?COLORS.labelBright:COLORS.label;
      p["text-halo-color"]=COLORS.labelHalo;
      p["text-halo-width"]=isPlace?1.8:1.55;
      p["text-halo-blur"]=.5;
      p["text-opacity"]=1;
    }
  }
  out.push(layer);
}

export async function fetchRaafatMapStyle(publicCartoKey) {
  if(!publicCartoKey)throw new Error("CARTO map key is not configured");
  const key=encodeURIComponent(String(publicCartoKey));
  const url="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key="+key;
  const response=await fetch(url,{mode:"cors",credentials:"omit"});
  if(!response.ok)throw new Error("CARTO vector style unavailable (HTTP "+response.status+")");
  const style=await response.json();
  if(!style || style.version!==8 || !Array.isArray(style.layers) || !style.sources){
    throw new Error("Unsupported CARTO vector style response");
  }
  // Keep source URLs from CARTO whenever they already carry their credentials.
  // Some versions use a placeholder; replace it only in that case.
  for(const src of Object.values(style.sources)){
    if(typeof src.url==="string"){
      src.url=src.url.replace(/\{api_key\}/g,"?key="+key);
      if(src.type==="vector" && !src.url.includes("?key=") && src.url.includes("tiles.json")){
        src.url+=(src.url.includes("?")?"&":"?")+"key="+key;
      }
    }
  }
  const layers=[];
  for(const layer of style.layers)restyleLayer(layer,layers);
  style.layers=layers;
  style.name="Raafat Signature — Dark Emerald & Amber";
  style.metadata={...(style.metadata||{}),"raafat:brand":"#003f3e / #f4951a"};
  return style;
}
