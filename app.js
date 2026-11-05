import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { fetchRaafatMapStyle } from "./brand-map.js";

const COMPANY = "شركة رأفت للدعاية والإعلان والتجارة العامة";
const types = {billboard:"بيلبورد",unipole:"يوني بول",led:"شاشة LED",bridge:"إعلان جسر",wall:"جدارية",building:"على بناية / واجهة مبنى",sidewalk:"لوحة رصيف",other:"أخرى"};
const REGIONS = Object.freeze({"صلاح الدين":["تكريت","بيجي","الدور","سامراء","الشرقاط","العلم"],"كركوك":["كركوك"]});

const CITY_CENTERS = Object.freeze({
  "تكريت":[34.6158,43.6786],
  "بيجي":[34.92915,43.48878],
  "الدور":[34.45835,43.7958],
  "سامراء":[34.1959,43.8857],
  "الشرقاط":[35.5172,43.2281],
  "العلم":[34.709,43.6951],
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
 basemap: null, cityLabels: null
};
let toastTimeout;

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
   const timer=setTimeout(()=>done(false),10000);
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
function addPersistentCityLabels(){
 if(!state.map||state.cityLabels)return;
 const L=window.L;
 const pane=state.map.createPane("raafatCities");
 pane.style.zIndex="435";
 pane.style.pointerEvents="none";
 const labels=L.layerGroup().addTo(state.map);
 for(const [city,coords] of Object.entries(CITY_CENTERS)){
   const marker=L.marker(coords,{
     pane:"raafatCities",interactive:false,
     icon:L.divIcon({
       className:"raafat-city-icon",
       html:'<span class="raafat-city-name" lang="ar" dir="rtl">'+escapeHtml(city)+'</span>',
       iconSize:[0,0],iconAnchor:[0,0]
     })
   });
   labels.addLayer(marker);
 }
 state.cityLabels=labels;
 const update=()=>{
   state.map.getContainer().classList.toggle("raafat-city-zoom",
     state.map.getZoom()>=10);
 };
 state.map.on("zoomend",update);
 update();
}
async function installRaafatPremiumMap(){
 if(!state.map||!window.maplibregl||typeof window.L.maplibreGL!=="function"
    ||(typeof window.maplibregl.supported==="function"&&!window.maplibregl.supported())){
   console.warn("Vector WebGL unavailable; using the dark branded fallback map.");
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
   };
   const timeout=setTimeout(fallback,18000);
   renderer.on("error",event=>{
     console.warn("Raafat vector renderer:",event.error||event);
     if(!renderer.loaded())fallback();
   });
   const onReady=()=>{
     if(ready)return;
     ready=true;
     clearTimeout(timeout);
     if(!state.map)return;
     if(state.basemap&&state.map.hasLayer(state.basemap))state.map.removeLayer(state.basemap);
     state.basemap=layer;
   };
   renderer.once("load",onReady);
   if(renderer.loaded())onReady();
 }catch(err){
   console.warn("Cannot initialize the premium Raafat map:",err);
 }
}
function initializeMap(){
 if(!window.L){alertBanner("تعذر تحميل مكتبة الخريطة. تحقق من اتصال الإنترنت.");return;}
 const L=window.L;
 state.map=L.map("map",{zoomControl:false,preferCanvas:true,minZoom:2,maxZoom:22})
   .setView(CITY_CENTERS["تكريت"],11);
 const key=encodeURIComponent(String(config.cartoApiKey||""));
 const fallback=L.tileLayer(
   "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key="+key,{
   attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
   subdomains:"abcd",maxNativeZoom:19,maxZoom:22,keepBuffer:3,
   className:"raafat-fallback-tile"
 });
 fallback.addTo(state.map);
 state.basemap=fallback;
 L.control.zoom({position:"bottomright"}).addTo(state.map);
 state.markers=L.markerClusterGroup
   ? L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:46,chunkedLoading:true})
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
 el("cancelPick").addEventListener("click",()=>{
   state.pick=false;el("mapPicking").hidden=true;openModal("siteModal");
 });
 void installRaafatPremiumMap();
}

function zoomAll(defaultOnly=false){
 if(!state.map)return;
 const visible=filteredSites();
 if(!visible.length){
   const city=el("cityFilter").value;
   const governorate=el("governorateFilter").value;
   const focus=CITY_CENTERS[city]||CITY_CENTERS[governorate==="كركوك"?"كركوك":"تكريت"];
   const zoom=city?14:governorate==="كركوك"?12:11;
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
function render(){
 renderCityChips();
 const sites=filteredSites();
 el("allCount").textContent=state.sites.length;
 el("availableCount").textContent=state.sites.filter(s=>s.status==="available").length;
 el("cityCount").textContent=new Set(state.sites.map(s=>s.city)).size;
 el("showingCount").textContent=sites.length+" قطعة";
 el("mapCount").textContent=sites.length;
 el("listing").innerHTML=sites.length ? sites.map(s=>
  '<button type="button" class="location-card '+(state.selected===s.id?'active':'')+'" data-site="'+escapeHtml(s.id)+'">'+
   '<div class="card-row"><strong>'+escapeHtml(s.name)+'</strong>'+badge(s)+'</div>'+
   '<small>'+escapeHtml(s.code)+' • '+escapeHtml(s.governorate||"صلاح الدين")+' / '+escapeHtml(s.city)+(s.published?'':' <span class="draft">• مسودة غير منشورة</span>')+'</small>'+
   '<div class="card-meta"><span>'+format(s.width_m)+' × '+format(s.height_m)+' م</span><span>'+escapeHtml(types[s.type]||s.type)+'</span><span>'+escapeHtml(s.area||s.landmark||"")+'</span></div>'+
  '</button>'
 ).join("") : '<div class="empty">لا توجد قطع مطابقة. '+(state.staff?'يمكن إضافة قطعة من زر «إضافة موقع».':'غيّر الفلاتر لعرض قطع أخرى.')+'</div>';
 el("listing").querySelectorAll("[data-site]").forEach(button=>button.addEventListener("click",()=>selectSite(button.dataset.site)));
 renderMarkers(sites);
 if(state.selected && !sites.some(s=>s.id===state.selected))state.selected=null;
 void renderDetail();
}
function renderMarkers(sites){
 if(!state.map)return;
 state.markers.clearLayers();state.markerById.clear();
 for(const s of sites){
   const L=window.L;
   const safeStatus = statuses[s.status] ? s.status : "available";
   const marker=L.marker([s.latitude,s.longitude],{
     icon:L.divIcon({className:"",html:'<div class="site-pin '+safeStatus+(state.selected===s.id?" selected":"")+'"><span></span></div>',iconSize:[29,29],iconAnchor:[15,27]})
   });
   marker.on("click",()=>selectSite(s.id));
   marker.bindTooltip(escapeHtml(s.code)+" — "+escapeHtml(s.name),{direction:"top"});
   state.markers.addLayer(marker);
   state.markerById.set(s.id,marker);
 }
}
function selectSite(id){
 const site=state.sites.find(s=>s.id===id);
 if(!site)return;
 if(state.selected!==id)state.galleryIndex=0;
 state.selected=id;render();
 if(!state.staff)history.replaceState(null,"","#site="+encodeURIComponent(id));
 if(state.map){state.map.setView([site.latitude,site.longitude],Math.max(14,state.map.getZoom()),{animate:true})}
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
 const phone=String(config.whatsappNumber||"").replace(/\D/g,"");
 const whatsapp=phone.length>=10? "https://wa.me/"+phone+"?text="+encodeURIComponent("مرحباً، أرغب بالاستفسار عن القطعة "+site.code+" ("+site.name+") لدى "+COMPANY):null;
 const mapUrl="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(site.latitude+","+site.longitude);
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
   '<h3 class="detail-name">'+escapeHtml(site.name)+'</h3>'+
   '<div class="detail-location">⌖ '+escapeHtml(site.governorate||"صلاح الدين")+' / '+escapeHtml(site.city)+(site.area?' / '+escapeHtml(site.area):"")+'</div>'+
   '<div class="detail-status">'+badge(site)+(site.published?'':' <span class="draft">• غير منشور</span>')+'</div>'+
   '<div class="spec-heading">المواصفات والتفاصيل</div>'+
   '<div class="detail-table">'+metaRows.map(([label,val])=>'<div class="detail-line"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(val)+'</strong></div>').join("")+'</div>'+
   (site.description?'<div class="spec-heading">وصف الموقع</div><p class="detail-description">'+escapeHtml(site.description)+'</p>':"")+
   '<div class="detail-actions"><a class="btn btn-ghost" href="'+mapUrl+'" target="_blank" rel="noopener noreferrer">⌖ الاتجاهات على الخريطة</a>'+
   (whatsapp?'<a class="btn btn-primary" href="'+whatsapp+'" target="_blank" rel="noopener noreferrer">طلب عرض سعر</a>':
   '<button type="button" class="btn btn-primary" id="copyInquiry">نسخ بيانات للاستفسار</button>')+'</div>'+
   ''+
   (state.staff?'<div class="admin-actions"><button type="button" class="btn btn-ghost" id="editSite">تعديل البيانات</button><button type="button" class="btn danger" id="deleteSite">حذف القطعة</button></div>':"")+
   (state.staff&&photos.length?'<div class="photo-management"><div class="spec-heading">إدارة صور القطعة</div>'+photos.map((photo,i)=>'<button class="btn btn-ghost" type="button" data-remove-photo="'+escapeHtml(photo.id)+'">حذف صورة '+(i+1)+'</button>').join("")+'</div>':"");
 el("siteDetails").innerHTML=html;
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
 el("loginButton").hidden=state.staff;
 el("logoutButton").hidden=!state.user;
}
async function authCheck(){
 if(!db)return;
 const {data:auth}=await db.auth.getUser();
 state.user=auth?.user||null;
 state.staff=false;
 if(state.user){
  const {data,error}=await db.from("staff_members").select("role").eq("user_id",state.user.id).maybeSingle();
  if(!error && data && ["admin","editor"].includes(data.role))state.staff=true;
 }
 refreshAdmin();
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
  const hash=location.hash.startsWith("#site=")?decodeURIComponent(location.hash.slice(6)):null;
  if(hash&&state.sites.some(site=>site.id===hash))selectSite(hash);
  alertBanner("");
 }catch(error){
  state.sites=[];renderFilters();render();
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
  toast("مرحباً بك في لوحة إدارة شركة رأفت.");
 }catch(error){toast(error.message||"تعذر تسجيل الدخول.")}
 finally{button.disabled=false}
}
async function registerFirstAdmin(){
 if(!db){toast("اتصال Supabase غير مهيأ.");return;}
 const email=el("email").value.trim(), password=el("password").value;
 if(!email || !el("email").checkValidity()){toast("أدخل البريد الإلكتروني بصورة صحيحة.");return;}
 if(password.length<12){toast("اختَر كلمة مرور لا تقل عن 12 حرفاً.");return;}
 const button=el("registerAdmin");
 button.disabled=true;
 try{
   const redirectTo=window.location.origin+window.location.pathname;
   const {data,error}=await db.auth.signUp({
     email,
     password,
     options: { emailRedirectTo:redirectTo }
   });
   if(error)throw error;
   el("password").value="";
   if(data.session){
     // A pre-confirmed signup must not acquire admin privileges automatically.
     // The database bootstrap grants it only on a verified-email transition.
     await db.auth.signOut();
     toast("تم إنشاء الحساب، لكن يجب التأكد من إعداد تأكيد البريد في Supabase قبل منح صلاحيات الإدارة.");
   }else{
     toast("إذا كان البريد مؤهلاً، ستصلك رسالة تفعيل. افتح الرابط من بريدك، ثم سجّل دخولك.");
   }
 }catch(error){
   console.error("First admin signup failed:",error.message);
   toast("تعذر إنشاء الحساب: "+(error.message||"تحقق من بريدك وإعدادات Supabase."));
 }finally{button.disabled=false}
}
async function signOut(){
 if(!db)return;
 try{await db.auth.signOut()}catch(e){console.warn(e)}
 state.user=null;state.staff=false;state.selected=null;state.photoUrls.clear();
 refreshAdmin();await loadSites();toast("تم تسجيل الخروج.");
}
function events(){
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
 el("logoutButton").addEventListener("click",()=>void signOut());
 el("siteForm").addEventListener("submit",saveSite);
 el("loginForm").addEventListener("submit",signIn);
 el("registerAdmin").addEventListener("click",()=>void registerFirstAdmin());
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
   for(const id of ["loginModal","siteModal"])closeModal(id)}
 });
}
async function main(){
 initializeMap();events();
 if(!db){
  alertBanner("النظام لم يُربط بعد بقاعدة Supabase. يجب إعداد مشروع الشركة وملف config.js قبل نشره للزبائن.");
  el("listing").innerHTML='<div class="empty">لا توجد مواقع فعلية محمّلة. لن نعرض مواقع تجريبية على أنها قطع الشركة.</div>';
  render();
  return;
 }
 await authCheck();
 await loadSites();
}
void main();
