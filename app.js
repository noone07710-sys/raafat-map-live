import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const COMPANY = "شركة رأفت للدعاية والإعلان والتجارة العامة";
const types = { billboard:"بيلبورد", unipole:"يوني بول",led:"شاشة LED",bridge:"إعلان جسر",wall:"جدارية",other:"أخرى"};
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
 markers: null, markerById:new Map(), pick:false, photoUrls: new Map(), busy:false
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
function initializeMap(){
 if(!window.L){ alertBanner("تعذر تحميل مكتبة الخريطة. تحقق من اتصال الإنترنت."); return; }
 const L=window.L;
 state.map=L.map("map",{zoomControl:false, preferCanvas:true}).setView([34.61,43.68],9);
 L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{
   attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
   subdomains:"abcd",maxZoom:19
 }).addTo(state.map);
 L.control.zoom({position:"bottomright"}).addTo(state.map);
 state.markers=L.markerClusterGroup
   ? L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:46,chunkedLoading:true})
   : L.layerGroup();
 state.map.addLayer(state.markers);
 state.map.on("click", event=>{
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
}
function zoomAll(defaultOnly=false){
 if(!state.map)return;
 const visible=filteredSites();
 if(visible.length===0||defaultOnly&&visible.length===0){state.map.setView([34.61,43.68],9);return}
 if(visible.length===1)state.map.setView([visible[0].latitude,visible[0].longitude],14);
 else state.map.fitBounds(window.L.latLngBounds(visible.map(s=>[s.latitude,s.longitude])),{padding:[45,45],maxZoom:13});
}
function filteredSites(){
 const query=el("search").value.trim().toLocaleLowerCase();
 const city=el("cityFilter").value;
 const type=el("typeFilter").value;
 const status=el("statusFilter").value;
 return state.sites.filter(s=>
   (!query||[s.name,s.code,s.city,s.area,s.description].some(v=>String(v||"").toLocaleLowerCase().includes(query)))
   &&(!city||s.city===city)
   &&(!type||s.type===type)
   &&(!status||s.status===status)
 );
}
function badge(s){return '<span class="status '+escapeHtml(s.status)+'">'+escapeHtml(statuses[s.status]||s.status)+'</span>'}
function renderFilters(){
 const selected=el("cityFilter").value;
 const cities=[...new Set(state.sites.map(s=>s.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
 el("cityFilter").innerHTML='<option value="">جميع المدن</option>'+cities.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join("");
 el("cityFilter").value=cities.includes(selected)?selected:"";
}
function render(){
 const sites=filteredSites();
 el("allCount").textContent=state.sites.length;
 el("availableCount").textContent=state.sites.filter(s=>s.status==="available").length;
 el("cityCount").textContent=new Set(state.sites.map(s=>s.city)).size;
 el("showingCount").textContent=sites.length+" موقع";
 el("mapCount").textContent=sites.length;
 el("listing").innerHTML=sites.length ? sites.map(s=>
  '<button type="button" class="location-card '+(state.selected===s.id?'active':'')+'" data-site="'+escapeHtml(s.id)+'">'+
   '<div class="card-row"><strong>'+escapeHtml(s.name)+'</strong>'+badge(s)+'</div>'+
   '<small>'+escapeHtml(s.code)+' • '+escapeHtml(s.city)+(s.published?'':' <span class="draft">• مسودة غير منشورة</span>')+'</small>'+
   '<div class="card-meta"><span>'+format(s.width_m)+' × '+format(s.height_m)+' م</span><span>'+escapeHtml(types[s.type]||s.type)+'</span><span>'+escapeHtml(s.area||"")+'</span></div>'+
  '</button>'
 ).join("") : '<div class="empty">لا توجد قطع مطابقة. '+(state.staff?'يمكن إضافة قطعة من زر «إضافة موقع».':'يمكن تغيير خيارات البحث أو العودة لاحقاً.')+'</div>';
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
 state.selected=id;render();
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
   el("siteDetails").innerHTML='<div class="empty detail-empty"><span class="empty-icon">⌖</span>اختر موقعاً من الخريطة أو القائمة لعرض بياناته.</div>';
   return;
 }
 const phone=String(config.whatsappNumber||"").replace(/\D/g,"");
 const whatsapp=phone.length>=10? "https://wa.me/"+phone+"?text="+encodeURIComponent("مرحباً، أستفسر عن القطعة "+site.code+" ("+site.name+") لدى "+COMPANY):null;
 const mapUrl="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(site.latitude+","+site.longitude);
 const editButtons=state.staff?'<div class="admin-actions"><button type="button" class="btn btn-ghost" id="editSite">تعديل</button><button type="button" class="btn danger" id="deleteSite">حذف</button></div>':"";
 const photos=site.site_photos||[];
 const html='<div class="detail-photo" id="detailImage"><div class="detail-placeholder"><b>R.</b>مساحة إعلانية من شبكة رأفت</div></div>'+
  '<h3 class="detail-name">'+escapeHtml(site.name)+'</h3>'+
  '<div class="detail-code">'+escapeHtml(site.code)+' • '+escapeHtml(site.city)+(site.published?'':' • غير منشورة')+'</div>'+
  '<div class="detail-status">'+badge(site)+'</div>'+
  '<div class="detail-table">'+[
   ["المدينة",site.city],["المنطقة",site.area||"غير محددة"],["نوع الإعلان",types[site.type]||site.type],
   ["القياس",format(site.width_m)+" × "+format(site.height_m)+" متر"],
   ["المساحة",format(site.width_m*site.height_m)+" م²"],
   ["عدد الأوجه",site.faces],["الإنارة",site.lighting?"مضاءة":"غير مضاءة"]
  ].map(([label,val])=>'<div class="detail-line"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(val)+'</strong></div>').join("")+'</div>'+
  (site.description?'<p class="detail-description">'+escapeHtml(site.description)+'</p>':"")+
  '<div class="detail-actions"><a class="btn btn-ghost" href="'+mapUrl+'" target="_blank" rel="noopener noreferrer">الاتجاهات ↗</a>'+
  (whatsapp?'<a class="btn btn-primary" href="'+whatsapp+'" target="_blank" rel="noopener noreferrer">استفسار واتساب</a>':"")+'</div>'+
  (photos.length?'<p class="photo-caption">'+photos.length+' صور محفوظة للموقع</p>':"") + editButtons;
 el("siteDetails").innerHTML=html;
 if(state.staff){
  el("editSite").addEventListener("click",()=>openEditor(site));
  el("deleteSite").addEventListener("click",()=>void deleteSite(site));
 }
 if(photos.length){
   const url=await photoUrl(photos[0].storage_path);
   if(url && state.selected===requestId){
     const image=document.createElement("img");
     image.alt="صورة الموقع "+site.name;
     image.loading="lazy";
     image.src=url;
     const box=el("detailImage");
     if(box)box.replaceChildren(image);
   }
 }
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
 el("fCity").value=get("city");
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
 const city=el("fCity").value.trim();
 const area=el("fArea").value.trim();
 const description=el("fDescription").value.trim();
 const coords=getCoords(el("fCoords").value);
 const width_m=number(el("fWidth").value);
 const height_m=number(el("fHeight").value);
 const faces=number(el("fFaces").value);
 if(!code||code.length>40||!name||name.length>140||!city||city.length>80)throw Error("تحقق من رمز القطعة واسم الموقع والمدينة.");
 if(!coords)throw Error("الإحداثيات غير صحيحة، استخدم: latitude, longitude");
 if(!Number.isFinite(width_m)||width_m<=0||width_m>1000||!Number.isFinite(height_m)||height_m<=0||height_m>1000)throw Error("القياس يجب أن يكون أكبر من صفر وأقل من 1000 متر.");
 if(!Number.isInteger(faces)||faces<1||faces>8)throw Error("عدد الأوجه من 1 إلى 8.");
 return {
   code,name,city,area,description,
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
 for(const filter of ["search","cityFilter","statusFilter","typeFilter"]){
  el(filter).addEventListener(filter==="search"?"input":"change",render);
 }
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
