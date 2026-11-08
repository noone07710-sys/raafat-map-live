// Customer booking and private tracking for Raafat advertising.
const PACKAGES = Object.freeze({
 A:{size:"عرض ١٢٠ سم • ارتفاع ٢ م",prices:{3:280,6:430,12:670}},
 B:{size:"عرض ٢ م • ارتفاع ٣ م",prices:{3:520,6:760,12:1120}},
 C:{size:"عرض ٢٫٥ م • ارتفاع ٣٫٥ م",prices:{3:760,6:1100,12:1800}},
 D:{size:"عرض ٣ م • ارتفاع ٤ م",prices:{3:800,6:1300,12:2100}},
 E:{size:"إعلانات الأسطح • تسعيرة المتر المربع",prices:{1:15,3:12,6:9,12:6}}
});
const REGIONS={"صلاح الدين":["تكريت","بيجي","الدور","سامراء","الشرقاط","العلم","بلد","مناطق أخرى في صلاح الدين"],"كركوك":["كركوك","الحويجة","داقوق","الدبس","مناطق أخرى في كركوك"]};
const $=id=>document.getElementById(id);
const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function packageForSite(site){
 if(!site)return null;
 if(site.package_class==="E")return "E";
 const w=Number(site.width_m),h=Number(site.height_m);
 if((w===1.2&&h===2)||(w===2&&h===1.2))return "A";
 if((w===2&&h===3)||(w===3&&h===2))return "B";
 if((w===2.5&&h===3.5)||(w===3.5&&h===2.5))return "C";
 if((w===3&&h===4)||(w===4&&h===3))return "D";
 return null; // Custom dimensions need an explicit category E.
}

export function setupBookings({db,getState,toast}){
 const countries=$("bookingGovernorate"),cities=$("bookingCity"),sites=$("bookingSite"),category=$("bookingCategory"),duration=$("bookingDuration");
 const modal=$("bookingModal"),bar=$("bookingMapPicker"),chosen=new Map(),eArea=$("bookingEArea");
 let busy=false,selecting=false,dirty=false,currentCategory='A',beforeMapSelection=null;
 const available=s=>s?.published&&s.status==="available";
 const inventory=()=>getState().sites||[];
 const validSite=id=>inventory().find(s=>s.id===id&&available(s)&&packageForSite(s)===category.value);
 const picked=()=>Array.from(chosen.values());
 const money=v=>"$"+Number(v).toLocaleString("en-US");
 const restoreScroll=()=>document.body.classList.toggle("booking-open",!modal.hidden);
 function writeCities(){
   const options=REGIONS[countries.value]||[];
   cities.innerHTML=options.map(x=>'<option value="'+safe(x)+'">'+safe(x)+'</option>').join("");
   writeSites();
 }
 function writeSites(){
   const options=inventory().filter(s=>available(s)&&s.governorate===countries.value&&s.city===cities.value&&packageForSite(s)===category.value);
   sites.innerHTML='<option value="">+ أضف قطعة من هذه المدينة</option>'+options.map(s=>
     '<option value="'+safe(s.id)+'" '+(chosen.has(s.id)?"disabled":"")+'>'+safe(s.code+" — "+s.name)+(chosen.has(s.id)?" ✓":"")+'</option>').join("");
 }
 function renderCards(){
   $("bookingPackageCards").innerHTML=Object.entries(PACKAGES).map(([key,p])=>
     '<button type="button" class="booking-tier-card '+(category.value===key?"selected":"")+'" data-tier="'+key+'" aria-pressed="'+(category.value===key)+'">'+
     '<span class="booking-tier-top">RAAFAT <b>'+key+'</b></span><strong>فئة '+key+'</strong><small>'+safe(p.size)+'</small>'+
     '<span class="booking-tier-bottom">'+(key==="E"?"من $6 / م² شهرياً":"لوحة ضوئية • وجهان")+'</span></button>').join("");
   $("bookingPackageCards").querySelectorAll("[data-tier]").forEach(btn=>btn.addEventListener("click",()=>changeCategory(btn.dataset.tier)));
 }
 function writePackage(){
   const p=PACKAGES[category.value];
   $("bookingPackageInfo").innerHTML=category.value==="E"
     ?'<strong>فئة E • لوحات الأسطح</strong><p>سعر المتر المربع شهرياً حسب المدة: شهر $15، 3 أشهر $12، 6 أشهر $9، 12 شهراً $6. الإجمالي = المساحة × السعر الشهري × عدد الأشهر.</p>'
     :'<strong>فئة '+category.value+' • '+safe(p.size)+'</strong><p>لوحات ضوئية، والسعر يشمل الإيجار والتصميم والطباعة والتبديل والصيانة • وجهان.</p>';
   if(category.value!=="E"&&duration.value==="1")duration.value="3";
   duration.disabled=false;duration.required=true;
   $("bookingDurationWrap").hidden=false;
   $("bookingOneMonth").hidden=category.value!=="E";
   $("bookingOneMonth").disabled=category.value!=="E";
   $("bookingEAreaWrap").hidden=category.value!=="E";
   updateEAreaField();
   renderCards();
   writeSites();
   renderSelection();
 }
 function updateEAreaField(){
   const isE=category.value==="E";
   const selectedCount=picked().length;
   $("bookingEAreaWrap").hidden=!isE||selectedCount>0;
   eArea.required=isE&&selectedCount===0;
 }
 function categoryTotal(){
   const arr=picked(),term=Number(duration.value),rate=PACKAGES[category.value].prices[term];
   if(!rate)return null;
   if(category.value!=="E")return rate*Math.max(arr.length,1);
   const area=arr.length?arr.reduce((n,site)=>n+Number(site.width_m)*Number(site.height_m),0):Number(eArea.value);
   if(!Number.isFinite(area)||area<=0)return null;
   return Math.ceil(area*rate*term);
 }
 function changeCategory(key){
   if(key===currentCategory)return;
   if(chosen.size && !confirm("تغيير الفئة يمسح القطع المحددة حالياً. هل تريد المتابعة؟")){category.value=currentCategory;renderCards();return;}
   category.value=key;currentCategory=key;chosen.clear();dirty=true;writePackage();
 }
 function renderSelection(){
   for(const [id,old] of chosen){
    const current=validSite(id);
    if(!current)chosen.delete(id);
    else if(current!==old)chosen.set(id,current);
  }
   const arr=picked();
   $("bookingSelectedSites").innerHTML=arr.length?arr.map(s=>
     '<div class="booking-site-chip"><span class="booking-site-chip-code">'+safe(s.code)+'</span>'+
     '<div class="booking-site-chip-info"><strong>'+safe(s.name)+'</strong><small>'+safe(s.governorate)+' / '+safe(s.city)+' • '+safe(s.area||"")+'</small></div>'+
     '<button type="button" data-remove-booking-site="'+safe(s.id)+'" aria-label="إزالة القطعة '+safe(s.code)+'">×</button></div>').join("")
     :'<div class="booking-no-sites">لم تحدد أي قطعة بعد • بإمكانك إرسال طلب عام ويختار الفريق المواقع المناسبة لك.</div>';
   $("bookingSelectedCount").textContent=arr.length+" قطعة محددة";
   $("bookingMapCount").textContent=arr.length+" قطعة محددة";
   $("bookingSummaryCount").textContent=arr.length?String(arr.length):"1 (طلب عام)";
   updateEAreaField();
   const unit=PACKAGES[category.value].prices[duration.value],total=categoryTotal();
   $("bookingPriceLabel").textContent=category.value==="E"?"الإجمالي حسب المساحة":arr.length>1?"السعر الإجمالي لـ "+arr.length+" قطع":"سعر الباقة";
   $("bookingPrice").textContent=total===null?"أدخل المساحة بالمتر المربع":money(total);
   $("bookingSummaryPrice").textContent=total===null?"أدخل المساحة":money(total);
   $("bookingPriceNote").textContent=category.value==="E"?
     "سعر المتر المربع "+money(unit||0)+" شهرياً × "+duration.value+" أشهر × المساحة المحددة. التأكيد بعد مراجعة الإدارة.":
     arr.length>1&&unit?"سعر القطعة "+money(unit)+" × "+arr.length+" قطع • تأكيد التوفر بعد مراجعة الإدارة.":
     "الأسعار تشمل الخدمات المبينة، والتأكيد النهائي بعد مراجعة الإدارة.";
   writeSites();
   document.dispatchEvent(new CustomEvent("raafat:booking-selection-changed"));
 }
 function addOrRemove(id){
   const s=validSite(id);
   if(!s){toast("هذه القطعة غير متاحة أو ليست من الفئة "+category.value+". اختر قطعة متاحة من نفس الفئة.");return false;}
   if(chosen.has(id))chosen.delete(id);
   else {
     if(chosen.size>=30){toast("يمكن تحديد حتى 30 قطعة في الطلب الواحد.");return false;}
     chosen.set(id,s);
   }
   dirty=true;renderSelection();
   toast(chosen.has(id)?"تمت إضافة القطعة "+s.code+" إلى طلبك.":"تمت إزالة القطعة "+s.code+".");
   return true;
 }
 function openBooking(siteId="",preserve=false){
   if(!preserve){
     $("bookingForm").reset();chosen.clear();dirty=false;
     const s=inventory().find(s=>s.id===siteId&&available(s));
     const detected=s?packageForSite(s):null;
      if(s&&!detected){toast("هذا القياس لا يملك باقة تلقائية؛ تواصل مع الإدارة للتسعير.");return;}
      category.value=detected||"A";currentCategory=category.value;
     countries.value=s?.governorate||"صلاح الدين";
     writeCities();
     if(s)cities.value=s.city;
     duration.value="3";
     if(s)chosen.set(s.id,s);
   }
   selecting=false;bar.hidden=true;modal.hidden=false;restoreScroll();
   $("bookingForm").hidden=false;$("bookingResult").hidden=true;
   $("bookingSend").disabled=false;
   writePackage();
   $("bookingPhone").dispatchEvent(new Event("input"));
 }
 function close(){
   if(busy)return;
   if(!$("bookingResult").hidden || !dirty || confirm("توجد بيانات حجز غير مرسلة. هل تريد إغلاق النموذج وفقدانها؟")){
     modal.hidden=true;bar.hidden=true;selecting=false;restoreScroll();
   }
 }
 function pickOnMap(){
   if(busy)return;
   beforeMapSelection=new Map(chosen);
    selecting=true;modal.hidden=true;bar.hidden=false;restoreScroll();
   document.querySelector(".map-area")?.scrollIntoView({behavior:"smooth",block:"center"});
   toast("اضغط على علامات المواقع بالخريطة. يمكن تحديد أكثر من قطعة من نفس الفئة.");
 }
 function finishMap(){
   if(!selecting)return;
   selecting=false;beforeMapSelection=null;bar.hidden=true;openBooking("",true);
  }
  function cancelMap(){
    if(!selecting)return;
    chosen.clear();
    for(const [id,site] of beforeMapSelection||[])chosen.set(id,site);
    selecting=false;beforeMapSelection=null;bar.hidden=true;openBooking("",true);
  }
  function clearOnEmptyMap(){
    if(!selecting||!chosen.size)return;
    chosen.clear();dirty=true;renderSelection();
    toast("تم إلغاء تحديد القطع من الخريطة.");
  }
  function trackUrl(token){return location.origin+location.pathname+"#booking="+encodeURIComponent(token);}
 function whatsappLink(result,payload,selected){
   const phone=String(getState().siteSettings?.whatsapp_number||window.RAAFAT_CONFIG?.whatsappNumber||"").replace(/\D/g,"");
   const details=selected.length?selected.map((s,i)=>(i+1)+". "+s.code+" — "+s.name+" ("+s.governorate+" / "+s.city+")").join("\n"):"طلب عام بدون قطع محددة";
   const text="طلب حجز إعلاني - شركة رأفت\nرقم الطلب: "+result.reference+
     "\nالزبون: "+payload.p_customer_name+"\nالهاتف: "+payload.p_phone+"\nالجهة: "+payload.p_company_name+
     "\nالمحافظة: "+payload.p_governorate+" / "+payload.p_city+
     "\nالفئة: "+payload.p_category+"\nالمدة: "+(payload.p_duration_months?payload.p_duration_months+" أشهر":"بعد الكشف")+
     "\nالقطع المختارة ("+selected.length+"):\n"+details+
     "\nالمجموع: "+(result.price_usd?money(result.price_usd):"بعد الكشف")+
     "\nرابط الطلب: "+trackUrl(result.tracking_token);
   return "https://"+(phone?"wa.me/"+phone:"api.whatsapp.com/send")+"?text="+encodeURIComponent(text);
 }
 async function submit(event){
   event.preventDefault();if(busy||!db)return;
   const selected=picked();
   if(category.value==="E"&&!selected.length&&(!Number.isFinite(Number(eArea.value))||Number(eArea.value)<=0)){toast("أدخل مساحة إعلان الأسطح بالمتر المربع.");eArea.focus();return;}
   const payload={
     p_customer_name:$("bookingName").value.trim(),
     p_phone:$("bookingPhone").value.replace(/\D/g,""),
     p_company_name:$("bookingCompany").value.trim(),
     p_governorate:countries.value,p_city:cities.value,p_category:category.value,
     p_duration_months:Number(duration.value),
     p_site_ids:selected.map(s=>s.id),p_e_area_m2:category.value==="E"&&!selected.length?Number(eArea.value):null
   };
   if(!/^\d{11}$/.test(payload.p_phone)){toast("رقم الهاتف يجب أن يكون 11 رقماً بالضبط.");return}
   busy=true;$("bookingSend").disabled=true;$("bookingSend").textContent="جاري إرسال الطلب…";
   try{
     const {data,error}=await db.rpc("submit_booking_request_v2",payload);
     if(error)throw error;
     const result=data?.[0];if(!result)throw Error("لم ترجع قاعدة البيانات رقم الحجز");
     $("bookingForm").hidden=true;$("bookingResult").hidden=false;
     $("bookingReference").textContent=result.reference;
     $("bookingResultLink").value=trackUrl(result.tracking_token);
     $("bookingResultMessage").textContent="شكراً لثقتك بشركة رأفت! تم استلام طلبك الذي يضم "+result.site_count+" قطع محددة، وهو بانتظار موافقة الإدارة. لا يعتبر حجزاً مؤكداً حتى اعتماده.";
     $("bookingWhatsApp").href=whatsappLink(result,payload,selected);
     dirty=false;toast("تم تسجيل طلب الحجز بنجاح.");
   }catch(err){console.error("Booking failed:",err.message);toast("تعذر تسجيل الحجز: "+(err.message||"يرجى المحاولة لاحقاً"));}
   finally{busy=false;$("bookingSend").disabled=false;$("bookingSend").textContent="تأكيد إرسال طلب الحجز";}
 }
 async function track(token){
   if(!db)return;
   try{
     const {data,error}=await db.rpc("track_booking_request_multi",{p_token:token});
     if(error)throw error;
     const row=data?.[0];
     const requested=Array.isArray(row?.sites)?row.sites:[];
     $("bookingTrackingContent").innerHTML=row?
       '<div class="tracking-state">'+safe(({pending:"بانتظار مراجعة الإدارة",approved:"تمت الموافقة",rejected:"لم تتم الموافقة",completed:"مكتمل"})[row.status]||row.status)+'</div>'+
       '<h3>'+safe(row.reference)+'</h3><p>'+safe(row.company_name)+'</p>'+
       '<p>'+safe(row.governorate)+" / "+safe(row.city)+'</p>'+
       '<p>الفئة: '+safe(row.category)+' • المدة: '+safe(row.duration_months||"بعد الكشف")+'</p>'+
       '<p>القطع المختارة: '+requested.length+'</p>'+
       requested.map(s=>'<p>'+safe(s.code)+' • '+safe(s.name)+' — '+safe(s.governorate)+' / '+safe(s.city)+'</p>').join("")+
       (row.category==='E'&&row.requested_area_m2?'<p>المساحة: '+safe(row.requested_area_m2)+' م²</p>':'')+
       '<p>الإجمالي: '+(row.quoted_price_usd?money(row.quoted_price_usd):"بعد الكشف")+'</p>':
       '<p>رابط المتابعة غير صالح أو غير متاح.</p>';
     $("bookingTracking").hidden=false;
   }catch(err){toast("تعذر فتح رابط المتابعة.");}
 }
 function hashTrack(){const token=location.hash.match(/^#booking=([0-9a-f-]{36})$/i)?.[1];if(token)void track(token);}
 $("bookNow").addEventListener("click",()=>openBooking());
 document.addEventListener("click",event=>{
   const button=event.target.closest("[data-book-site]");
   if(button)openBooking(button.dataset.bookSite);
 });
 $("bookingClose").addEventListener("click",close);
 // Never dismiss on outside click: forms may contain unsaved customer data.
 $("bookingChooseOnMap").addEventListener("click",pickOnMap);
 $("bookingMapFinish").addEventListener("click",finishMap);
 $("bookingMapCancel").addEventListener("click",cancelMap);
  modal.addEventListener("click",event=>{if(event.target===modal)close();});
 $("bookingClearSites").addEventListener("click",()=>{if(chosen.size){chosen.clear();dirty=true;renderSelection();}});
 $("bookingSelectedSites").addEventListener("click",e=>{const btn=e.target.closest("[data-remove-booking-site]");if(btn)addOrRemove(btn.dataset.removeBookingSite);});
 countries.addEventListener("change",()=>{dirty=true;writeCities();});
 cities.addEventListener("change",()=>{dirty=true;writeSites();});
 category.addEventListener("change",event=>changeCategory(event.target.value));
 duration.addEventListener("change",()=>{dirty=true;renderSelection();});
 eArea.addEventListener("input",()=>{dirty=true;renderSelection();});
 sites.addEventListener("change",()=>{if(sites.value)addOrRemove(sites.value);sites.value="";});
 $("bookingForm").addEventListener("input",()=>{dirty=true;});
 $("bookingForm").addEventListener("submit",submit);
 $("bookingPhone").addEventListener("input",event=>{event.target.value=event.target.value.replace(/\D/g,"").slice(0,11);});
 $("bookingCopy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("bookingResultLink").value);toast("تم نسخ رابط متابعة الحجز.");}catch{toast("انسخ الرابط يدوياً.");}});
 $("bookingTrackClose").addEventListener("click",()=>$("bookingTracking").hidden=true);
 window.addEventListener("hashchange",hashTrack);
 hashTrack();
 if(new URLSearchParams(location.search).get("booking")==="1")openBooking();
 return {
   openBooking,
   isSelecting:()=>selecting,
   isSelected:id=>chosen.has(id),
   handleSiteSelection:id=>{if(!selecting)return false;addOrRemove(id);return true;},
    clearOnEmptyMap,
   refreshSelection:()=>{if(!modal.hidden||selecting)renderSelection();}
 };
}


export function setupAdminBookings({db,getState,toast}){
 const table=$("dashBookingRows"),count=$("dashBookingCount");
 if(!table)return;
 let bookings=[],loading=false,page=0,totalCount=0;
  const PAGE_SIZE=50;
  const pager=document.createElement("div");
  pager.id="dashBookingPager";pager.className="admin-booking-pager";pager.hidden=true;
  pager.innerHTML='<button type="button" class="admin-mini-button secondary" data-booking-page="prev">السابق</button><span data-page-label></span><button type="button" class="admin-mini-button secondary" data-booking-page="next">التالي</button>';
  count.insertAdjacentElement("afterend",pager);
  pager.addEventListener("click",event=>{
    const btn=event.target.closest("[data-booking-page]");
    if(!btn||btn.disabled)return;
    page+=btn.dataset.bookingPage==="next"?1:-1;
    page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(totalCount/PAGE_SIZE)-1)));
    void load();
  });
 const labels={pending:"بانتظار المراجعة",approved:"موافق عليه",rejected:"مرفوض",completed:"مكتمل"};
  const allowed={pending:["pending","approved","rejected"],approved:["approved","pending","rejected","completed"],rejected:["rejected","pending","approved"],completed:["completed"]};
  const money=v=>"$"+Number(v).toLocaleString("en-US");
 async function load(){
  if(getState().staffRole!=="admin"||!db||loading)return;
  loading=true;
  count.textContent="جاري تحميل طلبات الحجز…";
  try{
   const {data,error,count:all}=await db.from("booking_requests")
    .select("id,customer_name,phone,company_name,governorate,city,site_code,category,duration_months,quoted_price_usd,requested_area_m2,status,created_at,tracking_token,booking_request_sites(site_id,site_code,site_name,governorate,city,unit_price_usd)",{count:"exact"})
     .order("created_at",{ascending:false}).range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
   if(error)throw error;
   bookings=data||[];
    totalCount=all||0;
    const {count:pending,error:pendingError}=await db.from("booking_requests")
      .select("id",{count:"exact",head:true}).eq("status","pending");
    if(pendingError)throw pendingError;
    $("dashBookingBadge").textContent=pending?String(pending):"";
    count.textContent="عرض "+(totalCount?page*PAGE_SIZE+1:0)+"–"+Math.min(totalCount,(page+1)*PAGE_SIZE)+" من "+totalCount+" طلب • "+pending+" بانتظار المراجعة";
    pager.hidden=totalCount<=PAGE_SIZE;
    pager.querySelector("[data-page-label]").textContent="صفحة "+(page+1)+" من "+Math.max(1,Math.ceil(totalCount/PAGE_SIZE));
    pager.querySelector('[data-booking-page="prev"]').disabled=page===0;
    pager.querySelector('[data-booking-page="next"]').disabled=(page+1)*PAGE_SIZE>=totalCount;
   table.innerHTML=bookings.length?bookings.map(b=>{
    const requested=b.booking_request_sites||[];
    const chips=requested.map(s=>
      '<span class="booking-admin-site">'+safe(s.site_code)+'<small>'+safe(s.governorate)+' / '+safe(s.city)+'</small></span>').join("");
    const countText=requested.length?requested.length+" قطع مختارة":"طلب عام / بدون قطع";
    return '<tr><td><strong>RF-'+safe(b.id.replace(/-/g,"").slice(0,8).toUpperCase())+'</strong><small>'+new Date(b.created_at).toLocaleString("ar-IQ")+'</small></td>'+
     '<td>'+safe(b.customer_name)+'<small dir="ltr">'+safe(b.phone)+'</small></td>'+
     '<td>'+safe(b.company_name)+'<small>'+safe(b.governorate)+' / '+safe(b.city)+'</small></td>'+
     '<td><strong>فئة '+safe(b.category)+'</strong> • '+safe(b.duration_months||"كشف موقع")+' أشهر'+
     '<div class="booking-admin-sites">'+(chips||'<span class="booking-admin-site">'+safe(b.site_code||"بدون قطعة محددة")+'</span>')+'</div>'+
     '<small>'+countText+(b.category==='E'&&b.requested_area_m2?' • المساحة: '+safe(b.requested_area_m2)+' م²':'')+'</small><div class="booking-admin-total">'+(b.quoted_price_usd?money(b.quoted_price_usd):"بعد الكشف")+'</div>'+
     requested.map(s=>s.site_id?'<a class="booking-admin-map-link" href="'+safe(location.origin+location.pathname+'#site='+encodeURIComponent(s.site_id))+'" target="_blank" rel="noopener noreferrer">⌖ '+safe(s.site_code)+'</a>':"").join(" ")+
     '</td>'+
     '<td>'+safe(labels[b.status]||b.status)+'</td>'+
     '<td><select class="input" data-booking-status="'+safe(b.id)+'" '+(b.status==="completed"?"disabled":"")+'>'+
     Object.entries(labels).map(([key,label])=>'<option value="'+key+'" '+(b.status===key?"selected":"")+' '+(!(allowed[b.status]||[]).includes(key)?"disabled":"")+'>'+label+'</option>').join("")+
     '</select><button type="button" data-booking-link="'+safe(b.tracking_token)+'">نسخ رابط الزبون</button></td></tr>';
   }).join(""):'<tr><td colspan="6">لا توجد طلبات حجز حتى الآن.</td></tr>';
   table.querySelectorAll("[data-booking-status]").forEach(select=>select.addEventListener("change",async()=>{
    const booking=bookings.find(b=>b.id===select.dataset.bookingStatus);
    if(!booking||!confirm("هل تريد تغيير حالة الطلب إلى "+labels[select.value]+"؟")){select.value=booking?.status||"pending";return;}
    select.disabled=true;
    const {data:updated,error}=await db.from("booking_requests")
       .update({status:select.value,updated_at:new Date().toISOString()})
       .eq("id",booking.id).eq("status",booking.status).select("id").maybeSingle();
     if(error||!updated){toast("لم يتم اعتماد التغيير: "+(error?.message||"الطلب تغيّر من حساب آخر؛ حدّث القائمة."));select.disabled=false;select.value=booking.status;void load();return;}
    toast("تم تحديث الحجز والقطع المرتبطة به.");
    await load();
   }));
   table.querySelectorAll("[data-booking-link]").forEach(btn=>btn.addEventListener("click",async()=>{
    const url=location.origin+location.pathname+"#booking="+btn.dataset.bookingLink;
    try{await navigator.clipboard.writeText(url);toast("تم نسخ رابط متابعة الزبون.");}
    catch{prompt("رابط المتابعة",url);}
   }));
  }catch(err){count.textContent="تعذر تحميل الطلبات: "+(err.message||"حدث خطأ");}
  finally{loading=false;}
 }
 document.addEventListener("raafat:bookings-tab",()=>void load());
 setInterval(()=>{if(getState().staffRole==="admin"&&!$("adminDashboard").hidden)void load();},60000);
 $("dashBookingRefresh").addEventListener("click",()=>void load());
 return {load};
}
