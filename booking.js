// Customer booking and private tracking for Raafat advertising.
const PACKAGES = Object.freeze({
 A:{size:"120 سم × 2 م",prices:{3:280,6:430,12:670}},
 B:{size:"2 × 3 م",prices:{3:520,6:760,12:1120}},
 C:{size:"2.5 × 3.5 م",prices:{3:760,6:110,12:1800}},
 D:{size:"3 × 4 م",prices:{3:800,6:1300,12:2100}},
 E:{size:"لوحات أسطح وبنايات",prices:{}}
});
const REGIONS={"صلاح الدين":["تكريت","بيجي","الدور","سامراء","الشرقاط","العلم","بلد"],"كركوك":["كركوك"]};
const $=id=>document.getElementById(id);
const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function packageForSite(site){
 if(!site)return null;
 const w=Number(site.width_m),h=Number(site.height_m);
 if((w===1.2&&h===2)||(w===2&&h===1.2))return "A";
 if((w===2&&h===3)||(w===3&&h===2))return "B";
 if((w===2.5&&h===3.5)||(w===3.5&&h===2.5))return "C";
 if((w===3&&h===4)||(w===4&&h===3))return "D";
 return "E";
}
export function setupBookings({db,getState,toast}){
 let busy=false;
 const countries=$("bookingGovernorate"),cities=$("bookingCity"),sites=$("bookingSite"),category=$("bookingCategory"),duration=$("bookingDuration");
 const modal=$("bookingModal");
 const writeCities=()=>{cities.innerHTML=REGIONS[countries.value].map(x=>'<option value="'+safe(x)+'">'+safe(x)+'</option>').join("");writeSites()};
 const writeSites=(selected="")=>{
  const inventory=(getState().sites||[]).filter(s=>s.published&&s.status==="available"&&s.governorate===countries.value&&s.city===cities.value&&packageForSite(s)===category.value);
  sites.innerHTML='<option value="">بدون تحديد قطعة — يحددها الفريق لاحقاً</option>'+inventory.map(s=>'<option value="'+safe(s.id)+'">'+safe(s.code+" — "+s.name)+'</option>').join("");
  if(inventory.some(s=>s.id===selected))sites.value=selected;
 };
 const packageCards=$("bookingPackageCards");
 function renderCards(){
  packageCards.innerHTML=Object.entries(PACKAGES).map(([key,p])=>
   '<button type="button" class="booking-tier-card '+(category.value===key?"selected":"")+'" data-tier="'+key+'" aria-pressed="'+(category.value===key)+'"><span class="booking-tier-top">RAAFAT <b>'+key+'</b></span><strong>فئة '+key+'</strong><small>'+p.size+'</small><span class="booking-tier-bottom">'+(key==="E"?"السعر بعد الكشف":"لوحة ضوئية • وجهان")+'</span></button>').join("");
  packageCards.querySelectorAll("[data-tier]").forEach(btn=>btn.addEventListener("click",()=>{category.value=btn.dataset.tier;writePackage()}));
 }
 const writePackage=()=>{
  const p=PACKAGES[category.value];
  $("bookingPackageInfo").innerHTML=category.value==="E"
   ?'<strong>فئة E • لوحات أسطح وبنايات</strong><p>السعر يُحدّد بعد مراجعة الموقع والتوفر. لا توجد تسعيرة ثابتة لهذه الفئة.</p>'
   :'<strong>فئة '+safe(category.value)+' • '+p.size+'</strong><p>لوحات ضوئية • السعر يشمل الإيجار والتصميم والطباعة والتركيب/التبديل والصيانة • وجهان</p>';
  duration.disabled=category.value==="E";
  duration.required=category.value!=="E";
  $("bookingDurationWrap").hidden=category.value==="E";
  duration.value="3";
  writePrice();writeSites();renderCards();
 };
 const writePrice=()=>{
  const p=PACKAGES[category.value].prices[duration.value];
  $("bookingPrice").textContent=p?"$"+p.toLocaleString("en-US"):"السعر بعد مراجعة الموقع";
  $("bookingPriceNote").textContent=category.value==="C"&&duration.value==="6"?"يرجى تأكيد السعر النهائي لفئة C / 6 أشهر مع الإدارة.":"السعر شامل الخدمات المذكورة، والتأكيد النهائي بعد مراجعة الإدارة.";
 };
 function openBooking(siteId=""){
  $("bookingForm").reset();
  const site=(getState().sites||[]).find(s=>s.id===siteId&&s.published&&s.status==="available");
  category.value=site?packageForSite(site):"A";
  countries.value=site?.governorate||"صلاح الدين";
  writeCities();
  if(site)cities.value=site.city;
  writePackage();
  writeSites(siteId);
  $("bookingResult").hidden=true;
  $("bookingForm").hidden=false;
  $("bookingSend").disabled=false;
  $("bookingPhone").value="";
  modal.hidden=false;document.body.classList.add("booking-open");
 }
 function close(){modal.hidden=true;document.body.classList.remove("booking-open");}
 function trackUrl(token){return location.origin+location.pathname+"#booking="+encodeURIComponent(token);}
 function whatsappLink(result, payload){
  const phone=String(getState().siteSettings?.whatsapp_number||window.RAAFAT_CONFIG?.whatsappNumber||"").replace(/\D/g,"");
  const content="طلب حجز إعلاني جديد - شركة رأفت\nالمرجع: "+result.reference+
  "\nالاسم: "+payload.p_customer_name+"\nالهاتف: "+payload.p_phone+"\nالجهة: "+payload.p_company_name+
  "\nالمحافظة: "+payload.p_governorate+" / "+payload.p_city+
  "\nالفئة: "+payload.p_category+"\nالمدة: "+(payload.p_duration_months||"حسب الاتفاق")+
  "\nالسعر: "+(result.price_usd?"$"+result.price_usd:"بعد الكشف")+
  "\nرابط المتابعة: "+trackUrl(result.tracking_token);
  return "https://"+(phone?"wa.me/"+phone:"api.whatsapp.com/send")+"?text="+encodeURIComponent(content);
 }
 async function submit(event){
  event.preventDefault();if(busy||!db)return;
  const payload={
   p_customer_name:$("bookingName").value.trim(),
   p_phone:$("bookingPhone").value.replace(/\D/g,""),
   p_company_name:$("bookingCompany").value.trim(),
   p_governorate:countries.value,p_city:cities.value,p_category:category.value,
   p_duration_months:category.value==="E"?null:Number(duration.value),
   p_site_id:sites.value||null
  };
  if(!/^\d{11}$/.test(payload.p_phone)){toast("رقم الهاتف يجب أن يتكون من 11 رقماً بالضبط.");return}
  busy=true;$("bookingSend").disabled=true;$("bookingSend").textContent="جاري تثبيت الطلب…";
  try{
   const {data,error}=await db.rpc("submit_booking_request",payload);
   if(error)throw error;
   const result=data?.[0];if(!result)throw Error("لم تُرجع قاعدة البيانات رقم الحجز");
   const url=trackUrl(result.tracking_token);
   $("bookingForm").hidden=true;$("bookingResult").hidden=false;
   $("bookingReference").textContent=result.reference;
   $("bookingResultLink").value=url;
   $("bookingResultMessage").textContent="شكراً لثقتك بشركة رأفت. تم استلام طلبك بنجاح وهو بانتظار مراجعة الإدارة. هذا ليس تأكيداً نهائياً للحجز.";
   $("bookingWhatsApp").href=whatsappLink(result,payload);
   toast("تم إرسال الطلب للإدارة بنجاح.");
  }catch(err){console.error("Booking failed:",err.message);toast("تعذر حفظ طلبك: "+(err.message||"حاول لاحقاً")); }
  finally{busy=false;$("bookingSend").disabled=false;$("bookingSend").textContent="تأكيد إرسال طلب الحجز"}
 }
 async function track(token){
  if(!db)return;
  try{
   const {data,error}=await db.rpc("track_booking_request",{p_token:token});
   if(error)throw error;
   const row=data?.[0];
   $("bookingTrackingContent").innerHTML=row?
     '<div class="tracking-state">'+safe(({pending:"بانتظار مراجعة الإدارة",approved:"تمت الموافقة",rejected:"لم تتم الموافقة",completed:"مكتمل"})[row.status]||row.status)+'</div>'+
     '<h3>'+safe(row.reference)+'</h3><p>'+safe(row.company_name)+'</p>'+
     '<p>'+safe(row.governorate)+" / "+safe(row.city)+'</p>'+
     '<p>فئة '+safe(row.category)+(row.site_code?" • قطعة "+safe(row.site_code):"")+'</p>'+
     '<p>المدة: '+safe(row.duration_months||"تحدد بعد الكشف")+' أشهر</p>'+
     '<p>السعر: '+(row.quoted_price_usd?"$"+safe(row.quoted_price_usd):"بعد مراجعة الموقع")+'</p>':
     '<p>رابط المتابعة غير صالح أو لم يعد متاحاً.</p>';
   $("bookingTracking").hidden=false;
  }catch(err){toast("تعذر تحميل متابعة الحجز.");}
 }
 function hashTrack(){const token=location.hash.match(/^#booking=([0-9a-f-]{36})$/i)?.[1];if(token)void track(token);}
 $("bookNow").addEventListener("click",()=>openBooking());
 document.addEventListener("click",event=>{
  const btn=event.target.closest("[data-book-site]");if(btn)openBooking(btn.dataset.bookSite);
 });
 $("bookingClose").addEventListener("click",close);
 modal.addEventListener("click",event=>{if(event.target===modal)close()});
 countries.addEventListener("change",writeCities);
 cities.addEventListener("change",()=>writeSites());
 category.addEventListener("change",writePackage);
 duration.addEventListener("change",writePrice);
 $("bookingForm").addEventListener("submit",submit);
 $("bookingPhone").addEventListener("input",event=>{event.target.value=event.target.value.replace(/\D/g,"").slice(0,11)});
 $("bookingCopy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("bookingResultLink").value);toast("تم نسخ رابط متابعة الحجز.");}catch{toast("انسخ الرابط يدوياً.")}});
 $("bookingTrackClose").addEventListener("click",()=>$("bookingTracking").hidden=true);
 $("bookingTracking").addEventListener("click",e=>{if(e.target===$("bookingTracking"))$("bookingTracking").hidden=true});
 window.addEventListener("hashchange",hashTrack);
 hashTrack();
 return {openBooking};
}
export function setupAdminBookings({db,getState,toast}){
 const table=$("dashBookingRows"),count=$("dashBookingCount");
 if(!table)return;
 let bookings=[];
 async function load(){
  if(!getState().staff||!db)return;
  count.textContent="جاري تحميل الطلبات…";
  const {data,error}=await db.from("booking_requests").select("id,customer_name,phone,company_name,governorate,city,site_code,category,duration_months,quoted_price_usd,status,created_at,tracking_token").order("created_at",{ascending:false}).limit(150);
  if(error){count.textContent="تعذر تحميل الحجوزات: "+error.message;return}
  bookings=data||[];
  const pending=bookings.filter(b=>b.status==="pending").length;
  $("dashBookingBadge").textContent=pending?String(pending):"";
  count.textContent=bookings.length+" طلب • "+pending+" بانتظار المراجعة";
  table.innerHTML=bookings.length?bookings.map(b=>
   '<tr><td><strong>RF-'+safe(b.id.replace(/-/g,"").slice(0,8).toUpperCase())+'</strong><small>'+new Date(b.created_at).toLocaleString("ar-IQ")+'</small></td>'+
   '<td>'+safe(b.customer_name)+'<small dir="ltr">'+safe(b.phone)+'</small></td>'+
   '<td>'+safe(b.company_name)+'<small>'+safe(b.governorate)+' / '+safe(b.city)+'</small></td>'+
   '<td>'+safe(b.site_code||"غير محددة")+' • '+safe(b.category)+'<small>'+safe(b.duration_months||"كشف موقع")+' أشهر • '+(b.quoted_price_usd?"$"+safe(b.quoted_price_usd):"بعد الكشف")+'</small></td>'+
   '<td>'+safe(({pending:"بانتظار المراجعة",approved:"موافق عليه",rejected:"مرفوض",completed:"مكتمل"})[b.status])+'</td>'+
   '<td><select class="input" data-booking-status="'+safe(b.id)+'"><option value="pending" '+(b.status==="pending"?"selected":"")+'>بانتظار المراجعة</option><option value="approved" '+(b.status==="approved"?"selected":"")+'>موافقة</option><option value="rejected" '+(b.status==="rejected"?"selected":"")+'>رفض</option><option value="completed" '+(b.status==="completed"?"selected":"")+'>مكتمل</option></select>'+
   '<button type="button" data-booking-link="'+safe(b.tracking_token)+'">رابط الزبون</button></td></tr>').join(""):'<tr><td colspan="6">لا توجد طلبات حجز بعد.</td></tr>';
  table.querySelectorAll("[data-booking-status]").forEach(select=>select.addEventListener("change",async()=>{
   const row=bookings.find(b=>b.id===select.dataset.bookingStatus);
   if(!row||!confirm("تأكيد تغيير حالة الطلب؟")){select.value=row?.status||"pending";return}
   const {error}=await db.from("booking_requests").update({status:select.value,updated_at:new Date().toISOString()}).eq("id",row.id);
   if(error){toast("تعذر تحديث الحالة: "+error.message);select.value=row.status;return}
   await load();toast("تم تحديث حالة الحجز.");
  }));
  table.querySelectorAll("[data-booking-link]").forEach(btn=>btn.addEventListener("click",async()=>{
   const url=location.origin+location.pathname+"#booking="+btn.dataset.bookingLink;
   try{await navigator.clipboard.writeText(url);toast("تم نسخ رابط الحجز.");}catch{prompt("رابط الحجز",url)}
  }));
 }
 document.addEventListener("raafat:bookings-tab",()=>void load());
 setInterval(()=>{if(getState().staff&&!$("adminDashboard").hidden)void load()},60000);
 $("dashBookingRefresh").addEventListener("click",()=>void load());
 return {load};
}
