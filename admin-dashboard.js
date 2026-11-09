import {raafatConfirm} from "./ui-dialog.js";
import {enhanceAdminSelects} from "./admin-dropdown.js";
import {downloadArabicCsv} from "./arabic-export.js";
/**
 * RA'AFAT CONTROL CENTER
 * All user management is delegated to the protected Supabase admin-staff
 * Edge Function; no service key or privileged database credential lives here.
 */
export function createAdminDashboard({db,getState,toast,openEditor,deleteSite,loadSites,selectSite,applySettings}) {
  const $=id=>document.getElementById(id);
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const cities=["تكريت","بيجي","الدور","سامراء","الشرقاط","العلم","بلد","كركوك","الحويجة","داقوق","الدبس"];
  const labels={available:"متاحة",reserved:"محجوزة",booked:"مؤجرة",maintenance:"صيانة"};
  const roles={admin:"مدير كامل",editor:"محرر مواقع"};
  const chosen=new Set();
  let staffLoaded=false,activeTab="overview",settingsLoaded=false,activityPage=0,activityTotal=0,exportBusy=false;
  const isAdmin=()=>getState().staffRole==="admin";

  function open(){
    const state=getState();
    if(!state.staff){toast("الدخول متاح لموظفي الشركة المعتمدين فقط.");return;}
    $("adminDashboard").hidden=false;
    document.body.classList.add("dashboard-open");
    $("dashStaffTab").hidden=!isAdmin();
    $("dashSettingsTab").hidden=!isAdmin();
    $("dashActivityTab").hidden=!isAdmin();
    $("dashExportBookings").hidden=!isAdmin();
    $("dashMyName").value=state.staffName||"";
    $("dashMyNameForm").hidden=Boolean(state.staffName);
    $("dashIdentityLocked").hidden=!state.staffName;
    $("dashIdentityName").textContent=state.staffName||"الاسم غير مسجّل";
    $("dashMyNameNote").textContent="يُعتمد اسمك لمرة واحدة فقط في سجلات العمليات.";
    if(!state.staffName)requestAnimationFrame(()=>$("dashMyName").focus());
    document.querySelector('[data-dash-tab="bookings"]').hidden=!isAdmin();
    for(const id of ["dashApplyStatus","dashBulkPublish","dashBulkHide"])$(id).hidden=!isAdmin();
    $("dashBulkStatus").disabled=!isAdmin();
    $("dashSessionRole").textContent=(state.staffName||"الاسم غير مسجّل")+" • "+(roles[state.staffRole]||"موظف");
    $("dashAdminGreeting").textContent="أهلاً، "+(state.staffName||"ضيف الإدارة");
    $("dashAdminRole").textContent=roles[state.staffRole]||"حساب معتمد";
    switchTab("overview");
    document.dispatchEvent(new CustomEvent("raafat:bookings-tab"));
  }
  function close(){
    closeExportMenu();
    $("adminDashboard").hidden=true;
    document.body.classList.remove("dashboard-open");
  }
  function switchTab(tab){
    if(["staff","settings","bookings","activity"].includes(tab)&&!isAdmin()){toast("هذا القسم للمدير فقط.");return;}
    activeTab=tab;
    closeExportMenu();
    const titles={overview:"نظرة عامة",inventory:"إدارة القطع",bookings:"طلبات الحجز",activity:"سجل النشاط",staff:"فريق الإدارة",settings:"الإعدادات"};
    $("dashCurrentSection").textContent=titles[tab]||"إدارة رأفت";
    document.querySelectorAll("[data-dash-tab]").forEach(btn=>{
      const selected=btn.dataset.dashTab===tab;
      btn.classList.toggle("active",selected);
      btn.setAttribute("aria-selected",String(selected));
    });
    document.querySelectorAll("[data-dash-panel]").forEach(panel=>panel.hidden=panel.dataset.dashPanel!==tab);
    if(tab==="inventory")renderInventory();
    if(tab==="bookings")document.dispatchEvent(new CustomEvent("raafat:bookings-tab"));
    if(tab==="staff"&&!staffLoaded)void loadStaff();
    if(tab==="settings")loadSettingsForm();
    if(tab==="activity")void loadActivity();
  }
  function render(){
    const sites=getState().sites||[];
    const count=status=>sites.filter(s=>s.status===status).length;
    $("dashTotal").textContent=sites.length;
    $("dashAvailable").textContent=count("available");
    $("dashReserved").textContent=count("reserved");
    $("dashBooked").textContent=count("booked");
    $("dashUnpublished").textContent=sites.filter(s=>!s.published).length;
    $("dashArea").textContent=sites.reduce((n,s)=>n+(Number(s.width_m)||0)*(Number(s.height_m)||0),0)
      .toLocaleString("ar-IQ",{maximumFractionDigits:1});
    const counts=cities.map(city=>({city,count:sites.filter(s=>s.city===city).length}));
    const max=Math.max(1,...counts.map(x=>x.count));
    $("dashCitiesChart").innerHTML=counts.map(({city,count})=>
      '<div class="admin-chart-item"><span>'+escape(city)+'</span><div class="admin-chart-track"><i style="width:'+Math.max(0,Math.min(100,count/max*100))+'%"></i></div><strong>'+count+'</strong></div>').join("");
    if(activeTab==="inventory")renderInventory();
  }
  function matchingSites(){
    const state=getState();
    const q=$("dashInventorySearch").value.trim().toLocaleLowerCase();
    const st=$("dashInventoryStatus").value;
    const pub=$("dashInventoryPublication").value;
    return state.sites.filter(s=>
      (!q||[s.name,s.code,s.governorate,s.city,s.area,s.street,s.landmark].some(t=>
        String(t||"").toLocaleLowerCase().includes(q))) &&
      (!st||s.status===st) &&
      (!pub||(pub==="published"?s.published:!s.published))
    );
  }
  function renderInventory(){
    const state=getState(),items=matchingSites();
    const visibleIds=new Set(items.map(s=>s.id));
    for(const id of [...chosen])if(!visibleIds.has(id))chosen.delete(id);
    $("dashInventoryRows").innerHTML=items.length?items.map(s=>
      '<tr><td><input type="checkbox" data-dash-check="'+escape(s.id)+'" aria-label="تحديد '+escape(s.code)+'" '+(chosen.has(s.id)?"checked":"")+'></td>'+
      '<td><strong>'+escape(s.code)+'</strong></td>'+
      '<td><div class="admin-table-name">'+escape(s.name)+'</div><small>'+escape(s.city)+' • '+escape(s.area||s.street||"")+'</small></td>'+
      '<td>'+Number(s.width_m).toLocaleString("ar-IQ")+' × '+Number(s.height_m).toLocaleString("ar-IQ")+' م</td>'+
      '<td><span class="admin-table-status '+escape(s.status)+'">'+escape(labels[s.status]||s.status)+'</span></td>'+
      '<td><span class="admin-publication '+(s.published?"yes":"no")+'">'+(s.published?"منشورة":"مسودة")+'</span></td>'+
      '<td><div class="admin-row-actions"><button type="button" data-dash-view="'+escape(s.id)+'">عرض</button><button type="button" data-dash-edit="'+escape(s.id)+'">تعديل</button><button type="button" data-dash-duplicate="'+escape(s.id)+'">نسخ</button>'+(isAdmin()?'<button type="button" class="admin-danger-mini" data-dash-delete="'+escape(s.id)+'">حذف نهائي</button>':'')+'</div></td></tr>'
    ).join(""):'<tr><td colspan="7" class="admin-table-empty">لا توجد قطع مطابقة للبحث.</td></tr>';
    $("dashInventoryCount").textContent=items.length+" قطعة من أصل "+state.sites.length;
    $("dashSelectedCount").textContent=chosen.size+" محددة";
    $("dashSelectAll").checked=items.length>0&&items.every(s=>chosen.has(s.id));
    $("dashSelectAll").indeterminate=chosen.size>0&&!$("dashSelectAll").checked;
    $("dashInventoryRows").querySelectorAll("[data-dash-check]").forEach(el=>el.addEventListener("change",()=>{
      el.checked?chosen.add(el.dataset.dashCheck):chosen.delete(el.dataset.dashCheck);
      renderInventory();
    }));
    const find=id=>state.sites.find(s=>s.id===id);
    $("dashInventoryRows").querySelectorAll("[data-dash-view]").forEach(el=>el.addEventListener("click",()=>{
      const s=find(el.dataset.dashView);if(!s)return;
      close();selectSite(s.id);
      document.querySelector(".map-area")?.scrollIntoView({behavior:"smooth",block:"start"});
      setTimeout(()=>getState().map?.invalidateSize(),180);
    }));
    $("dashInventoryRows").querySelectorAll("[data-dash-edit]").forEach(el=>el.addEventListener("click",()=>{
      const s=find(el.dataset.dashEdit);if(!s)return;close();openEditor(s);
    }));
    $("dashInventoryRows").querySelectorAll("[data-dash-delete]").forEach(el=>el.addEventListener("click",()=>{
      const item=find(el.dataset.dashDelete);if(!item||!isAdmin())return;
      close();void deleteSite(item);
    }));
    $("dashInventoryRows").querySelectorAll("[data-dash-duplicate]").forEach(el=>el.addEventListener("click",()=>{
      const s=find(el.dataset.dashDuplicate);if(!s)return;close();
      openEditor(s);
      getState().editorId=null;
      $("fCode").value="";
      $("fName").value=s.name+" — نسخة";
      $("formTitle").textContent="إنشاء نسخة جديدة";
      $("photoInfo").textContent="سيتم نسخ تفاصيل القطعة، لكن صورها لا تنسخ تلقائياً.";
      $("fPhotos").value="";
    }));
  }
  async function bulkUpdate(patch,description){
    if(!isAdmin()&&("status" in patch||"published" in patch)){toast("هذا الإجراء للمدير فقط.");return;}
    const visibleIds=new Set(matchingSites().map(s=>s.id));
    const ids=[...chosen].filter(id=>visibleIds.has(id));
    if(!ids.length){toast("حدد قطعة ظاهرة واحدة على الأقل.");return;}
    if(!(await raafatConfirm({title:"تأكيد التعديل الجماعي",message:"هل تريد "+description+" لـ "+ids.length+" قطعة إعلانية؟",detail:"راح تطبَّق التغييرات على القطع المحددة الظاهرة فقط.",confirmText:"تطبيق التغييرات"})))return;
    try{
      const {error}=await db.from("sites").update(patch).in("id",ids);
      if(error)throw error;
      chosen.clear();
      await loadSites();
      render();
      document.dispatchEvent(new CustomEvent("raafat:activity-changed"));
      toast("تم "+description+" بنجاح.");
    }catch(err){toast("تعذر التعديل: "+(err.message||"خطأ غير متوقع"));}
  }
  function closeExportMenu(){
    const menu=$("dashExportMenu");if(!menu)return;
    menu.hidden=true;$("dashExport").setAttribute("aria-expanded","false");
  }
  function toggleExportMenu(){
    if(exportBusy)return;
    const menu=$("dashExportMenu"),willOpen=menu.hidden;
    menu.hidden=!willOpen;
    $("dashExport").setAttribute("aria-expanded",String(willOpen));
    $("dashExportBookings").hidden=!isAdmin();
    if(willOpen)menu.querySelector('[data-raafat-export="sites"]')?.focus();
    else $("dashExport").focus();
  }
  async function fetchAllForExport(kind){
    const isBooking=kind==="bookings";
    if(isBooking&&!isAdmin())throw Error("تصدير الحجوزات متاح للمدير فقط.");
    const table=isBooking?"booking_requests":"sites";
    const fields=isBooking
      ?"id,booking_no,created_at,customer_name,phone,company_name,governorate,city,category,duration_months,quoted_price_usd,requested_area_m2,status,site_code,booking_request_sites(site_code,site_name)"
      :"code,name,package_class,governorate,city,area,street,landmark,type,status,width_m,height_m,faces,lighting,published,facing,material,description,latitude,longitude,created_at,id";
    const items=[],perPage=1000,maxPages=200;
    for(let page=0;page<maxPages;page++){
      const {data,error}=await db.from(table).select(fields)
        .order("created_at",{ascending:false}).order("id",{ascending:true})
        .range(page*perPage,(page+1)*perPage-1);
      if(error)throw error;
      items.push(...(data||[]));
      if(!data||data.length<perPage)return items;
    }
    throw Error("عدد السجلات كبير جداً؛ لم يتم إنشاء ملف ناقص. قلّل البيانات أو راجع الإدارة التقنية.");
  }
  async function exportCsv(kind){
    if(exportBusy)return;
    exportBusy=true;closeExportMenu();
    const status=$("dashExportStatus"),button=$("dashExport");
    status.hidden=false;status.textContent="جاري تجهيز الملف العربي…";
    button.disabled=true;
    try{
      const items=await fetchAllForExport(kind);
      if(!items.length){toast(kind==="bookings"?"لا توجد حجوزات قابلة للتصدير حالياً.":"لا توجد قطع قابلة للتصدير حالياً.");return;}
      const total=downloadArabicCsv(items,kind);
      toast("تم تنزيل "+total+" سجل بنجاح. الملف باللغة العربية ومتوافق مع Excel.");
    }catch(error){toast("تعذر تصدير البيانات: "+(error.message||"راجع الاتصال والصلاحيات."));}
    finally{exportBusy=false;status.hidden=true;button.disabled=false;}
  }
  function strongPassword(){
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#!%*";
    const bytes=new Uint8Array(26);window.crypto.getRandomValues(bytes);
    let pw="Aa7!"+Array.from(bytes,x=>chars[x%chars.length]).join("");
    const random=new Uint8Array(pw.length);window.crypto.getRandomValues(random);
    const list=[...pw];for(let i=list.length-1;i>0;i--){const j=random[i]%(i+1);[list[i],list[j]]=[list[j],list[i]]}
    return list.join("");
  }
  function staffMessage(msg,bad=false){
    $("dashStaffMessage").textContent=msg;
    $("dashStaffMessage").classList.toggle("bad",bad);
  }
  async function staffAction(body){
    const {data,error}=await db.functions.invoke("admin-staff",{body});
    if(error){
      let message=error.message||"تعذر الاتصال بخدمة الإدارة.";
      if(error.context?.json){
        try{const json=await error.context.json();message=json.error||message;}catch{}
      }
      throw new Error(message);
    }
    if(data?.error)throw new Error(data.error);
    return data;
  }
  async function loadStaff(){
    if(!isAdmin())return;
    $("dashStaffList").innerHTML='<p class="admin-note">جاري تحميل حسابات الإدارة…</p>';
    try{
      const data=await staffAction({action:"list"});
      staffLoaded=true;
      const staff=data.staff||[];
      $("dashStaffList").innerHTML=staff.length?staff.map(m=>
        '<div class="admin-staff-row"><div><strong>'+escape(m.display_name||"الاسم غير مسجل")+'</strong><small>'+escape(m.email)+' • '+escape(roles[m.role]||m.role)+(m.is_self?" • حسابك":"")+'</small></div>'+
        (m.is_self?'<span class="admin-self-tag">الحساب الحالي</span>':
          '<div class="admin-staff-actions"><select data-staff-role="'+escape(m.id)+'" aria-label="صلاحية '+escape(m.email)+'">'+
          '<option value="editor" '+(m.role==="editor"?"selected":"")+'>محرر</option>'+
          '<option value="admin" '+(m.role==="admin"?"selected":"")+'>مدير</option></select>'+
          '<button type="button" data-revoke-staff="'+escape(m.id)+'" title="إيقاف صلاحية هذا المستخدم">سحب الصلاحية</button></div>')+'</div>'
      ).join(""):'<p class="admin-note">ماكو موظفين مسجلين.</p>';
      $("dashStaffList").querySelectorAll("[data-staff-role]").forEach(el=>el.addEventListener("change",async()=>{
        if(!(await raafatConfirm({title:"تعديل صلاحية الموظف",message:"تغيير الرتبة راح يغيّر الصلاحيات المتاحة لهذا الحساب.",confirmText:"تحديث الصلاحية"}))){await loadStaff();return;}
        try{await staffAction({action:"change_role",id:el.dataset.staffRole,role:el.value});toast("تم تعديل الصلاحية.");await loadStaff()}
        catch(err){toast("تعذر تعديل الصلاحية: "+err.message);await loadStaff();}
      }));
      $("dashStaffList").querySelectorAll("[data-revoke-staff]").forEach(el=>el.addEventListener("click",async()=>{
        if(!(await raafatConfirm({title:"سحب صلاحيات الموظف",message:"راح يفقد هذا المستخدم صلاحية الوصول إلى إدارة المنصة.",danger:true,confirmText:"سحب الصلاحية"})))return;
        try{await staffAction({action:"revoke",id:el.dataset.revokeStaff});toast("تم سحب صلاحية الموظف.");await loadStaff()}
        catch(err){toast("تعذر سحب الصلاحية: "+err.message);}
      }));
      enhanceAdminSelects($("dashStaffList"));
    }catch(err){$("dashStaffList").textContent="تعذر عرض الموظفين: "+err.message;}
  }
  async function createStaff(event){
    event.preventDefault();if(!isAdmin())return;
    const button=$("dashCreateStaff");
    const email=$("dashStaffEmail").value.trim(),password=$("dashStaffPassword").value,display_name=$("dashStaffName").value.trim();
    if(display_name.length<2||display_name.length>80){staffMessage("اكتب اسم الموظف الصحيح.",true);return;}
    const role=$("dashStaffRole").value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){staffMessage("اكتب بريد إلكتروني صحيح للموظف.",true);return;}
    if(password.length<14){staffMessage("كلمة المرور يجب أن تتكون من 14 حرفاً على الأقل.",true);return;}
    if(!(await raafatConfirm({title:"إنشاء حساب إداري",message:"سيتم إنشاء حساب جديد باسم "+display_name+" ("+email+") بصلاحية "+(roles[role]||role)+".",confirmText:"إنشاء الحساب"})))return;
    button.disabled=true;staffMessage("جاري إنشاء الحساب…");
    try{
      await staffAction({action:"create",email,password,role,display_name});
      staffMessage("تم إنشاء الحساب. احفظ كلمة المرور المؤقتة وشاركها مع الموظف بشكل خاص.");
      $("dashStaffEmail").value="";$("dashStaffName").value="";
      staffLoaded=false;await loadStaff();
    }catch(err){staffMessage("تعذر إنشاء الحساب: "+err.message,true)}
    finally{button.disabled=false}
  }
  function loadSettingsForm(){
    if(!isAdmin())return;
    const x=getState().siteSettings||{};
    $("dashHeadline").value=x.headline||"المواقع الإعلانية";
    $("dashWhatsApp").value=x.whatsapp_number||"";
    $("dashContactMessage").value=x.contact_message||"مرحباً، أود الاستفسار عن موقع إعلاني.";
    $("dashMapStart").value=x.map_start_city||"تكريت";
    $("dashCityChips").checked=x.show_city_chips!==false;
    $("dashStats").checked=x.show_statistics!==false;
    $("dashGlow").checked=x.show_map_glow!==false;
    settingsLoaded=true;
  }
  async function saveSettings(event){
    event.preventDefault();if(!isAdmin())return;
    const patch={
      headline:$("dashHeadline").value.trim(),
      whatsapp_number:$("dashWhatsApp").value.replace(/[^\d]/g,""),
      contact_message:$("dashContactMessage").value.trim(),
      map_start_city:$("dashMapStart").value,
      show_city_chips:$("dashCityChips").checked,
      show_statistics:$("dashStats").checked,
      show_map_glow:$("dashGlow").checked,
      updated_at:new Date().toISOString()
    };
    if(!patch.headline||patch.headline.length<2){$("dashSettingsMessage").textContent="اكتب عنواناً مناسباً للموقع قبل الحفظ.";return;}
    if(patch.whatsapp_number && !/^\d{10,15}$/.test(patch.whatsapp_number)){
      $("dashSettingsMessage").textContent="رقم واتساب يجب أن يكون من 10 إلى 15 رقماً.";return;
    }
    const button=$("dashSaveSettings");button.disabled=true;
    $("dashSettingsMessage").textContent="جاري الحفظ…";
    try{
      const {data,error}=await db.from("site_settings").update(patch).eq("id",true).select("*").single();
      if(error)throw error;
      applySettings(data);
      $("dashSettingsMessage").textContent="تم حفظ الإعدادات وتطبيقها بنجاح.";
      toast("تم تحديث إعدادات الموقع.");
    }catch(err){$("dashSettingsMessage").textContent="تعذر الحفظ: "+(err.message||"راجع الصلاحيات.");}
    finally{button.disabled=false}
  }
  async function saveMyName(event){
    event.preventDefault();
    const name=$("dashMyName").value.trim();
    if(name.length<2||name.length>80){$("dashMyNameNote").textContent="الاسم يجب أن يكون من حرفين إلى 80 حرفاً.";return;}
    const button=$("dashSaveMyName");button.disabled=true;
    try{
      const {data,error}=await db.rpc("set_my_staff_name",{p_name:name});
      if(error)throw error;
      getState().staffName=data;
      $("dashMyNameForm").hidden=true;
      $("dashIdentityLocked").hidden=false;
      $("dashIdentityName").textContent=data;
      $("dashAdminGreeting").textContent="أهلاً، "+data;
      $("dashMyNameNote").textContent="تم تسجيل اسمك لمرة واحدة.";
      $("dashSessionRole").textContent=data+" • "+(roles[getState().staffRole]||"موظف");
      document.dispatchEvent(new CustomEvent("raafat:activity-changed"));
      toast("تم حفظ اسم الموظف بنجاح.");
    }catch(error){$("dashMyNameNote").textContent="تعذر الحفظ: "+(error.message||"خطأ غير معروف");}
    finally{button.disabled=false}
  }
  async function loadActivity(){
    if(!isAdmin())return;
    const table=$("dashActivityRows"),count=$("dashActivityCount");
    count.textContent="جاري تحميل سجل النشاط…";
    const size=50;
    let query=db.from("activity_logs")
      .select("id,created_at,actor_name,action,entity_type,summary",{count:"exact"})
      .order("created_at",{ascending:false});
    const kind=$("dashActivityEntity").value;
    if(kind)query=query.eq("entity_type",kind);
    const staffName=$("dashActivitySearch").value.trim().replace(/[\\%_]/g,"");
    if(staffName)query=query.ilike("actor_name","%"+staffName+"%");
    try{
      const {data,error,count:total}=await query.range(activityPage*size,(activityPage+1)*size-1);
      if(error)throw error;
      activityTotal=total||0;
      if(activityPage>0&&activityPage*size>=activityTotal){activityPage=0;return void loadActivity();}
      const types={sites:"القطع",booking_requests:"الحجوزات",site_photos:"الصور",staff_members:"الموظفون",site_settings:"الإعدادات"};
      const actions={
        "site.insert":"إضافة قطعة","site.update":"تعديل قطعة","site.delete":"حذف قطعة",
        "booking.insert":"طلب حجز جديد","booking.update":"تعديل حجز","booking.delete":"حذف حجز",
        "photo.insert":"إضافة صورة","photo.delete":"حذف صورة",
        "staff.insert":"إضافة موظف","staff.update":"تعديل موظف","staff.delete":"سحب موظف",
        "staff.create":"إنشاء حساب","staff.change_role":"تغيير صلاحية","staff.revoke":"سحب صلاحية",
        "settings.update":"إعدادات المنصة"
      };
      table.innerHTML=(data||[]).map(item=>
        '<tr><td><strong>'+escape(item.actor_name)+'</strong></td>'+
        '<td><span class="audit-action '+(item.action.endsWith(".delete")?"is-delete":"")+'">'+escape(actions[item.action]||item.action)+'</span></td>'+
        '<td>'+escape(types[item.entity_type]||item.entity_type)+'</td>'+
        '<td>'+escape(item.summary)+'</td>'+
        '<td><time datetime="'+escape(item.created_at)+'">'+new Date(item.created_at).toLocaleString("ar-IQ")+'</time></td></tr>'
      ).join("")||'<tr><td colspan="5" class="admin-table-empty">ماكو عمليات مطابقة حالياً.</td></tr>';
      count.textContent=activityTotal+" عملية • صفحة "+(activityPage+1)+" • يحتفظ بالسجل لمدة 30 يوماً";
      $("dashActivityPrev").disabled=activityPage===0;
      $("dashActivityNext").disabled=(activityPage+1)*size>=activityTotal;
    }catch(error){count.textContent="تعذر عرض السجل: "+(error.message||"خطأ غير معروف");}
  }
  function initialize(){
    document.querySelectorAll("[data-dash-tab]").forEach(el=>el.addEventListener("click",()=>switchTab(el.dataset.dashTab)));
    document.querySelectorAll("[data-dash-go]").forEach(el=>el.addEventListener("click",()=>switchTab(el.dataset.dashGo)));
    $("closeAdminDashboard").addEventListener("click",close);
    $("adminDashboard").addEventListener("keydown",event=>{if(event.key==="Escape"){event.stopPropagation();close()}});
    $("dashAddSite").addEventListener("click",()=>{close();openEditor()});
    $("dashQuickNew").addEventListener("click",()=>{close();openEditor()});
    $("dashExport").addEventListener("click",toggleExportMenu);
    $("dashExportMenu").querySelectorAll("[data-raafat-export]").forEach(button=>
      button.addEventListener("click",()=>void exportCsv(button.dataset.raafatExport))
    );
    document.addEventListener("pointerdown",event=>{
      if($("dashExportMenu").hidden)return;
      if(!event.target.closest("#dashExportMenu,#dashExport"))closeExportMenu();
    });
    $("dashChangePassword").addEventListener("click",()=>{close();$("changePasswordButton").click()});
    $("dashRefresh").addEventListener("click",async()=>{await loadSites();render();toast("تم تحديث البيانات.")});
    for(const [id,event] of [["dashInventorySearch","input"],["dashInventoryStatus","change"],["dashInventoryPublication","change"]]){
      $(id).addEventListener(event,()=>{chosen.clear();renderInventory();});
    }
    $("dashSelectAll").addEventListener("change",event=>{
      for(const s of matchingSites())event.target.checked?chosen.add(s.id):chosen.delete(s.id);
      renderInventory();
    });
    $("dashApplyStatus").addEventListener("click",()=>{
      const status=$("dashBulkStatus").value;
      if(!status){toast("اختر الحالة أولاً.");return}
      void bulkUpdate({status},"تحديث حالة القطع");
    });
    $("dashBulkPublish").addEventListener("click",()=>void bulkUpdate({published:true},"نشر القطع المحددة"));
    $("dashBulkHide").addEventListener("click",()=>void bulkUpdate({published:false},"إخفاء القطع المحددة"));
    $("dashGeneratePassword").addEventListener("click",()=>{$("dashStaffPassword").value=strongPassword();staffMessage("كلمة مرور قوية جاهزة، احفظها بأمان.")});
    $("dashTogglePassword").addEventListener("click",()=>{
      const input=$("dashStaffPassword");
      const showing=input.type==="text";
      input.type=showing?"password":"text";
      $("dashTogglePassword").textContent=showing?"إظهار":"إخفاء";
    });
    $("dashCopyPassword").addEventListener("click",async()=>{
      const pw=$("dashStaffPassword").value;
      if(!pw){staffMessage("ولّد كلمة مرور أولاً.",true);return}
      try{await navigator.clipboard.writeText(pw);staffMessage("تم النسخ، أرسلها بشكل خاص فقط.");}
      catch{staffMessage("تعذر النسخ، يمكنك تحديد النص ونسخه.",true);}
    });
    $("dashStaffForm").addEventListener("submit",event=>void createStaff(event));
    $("dashReloadStaff").addEventListener("click",()=>void loadStaff());
    enhanceAdminSelects($("adminDashboard"));
    $("dashSettingsForm").addEventListener("submit",event=>void saveSettings(event));
    $("dashMyNameForm").addEventListener("submit",event=>void saveMyName(event));
    $("dashActivityRefresh").addEventListener("click",()=>void loadActivity());
    $("dashActivityEntity").addEventListener("change",()=>{activityPage=0;if(activeTab==="activity")void loadActivity();});
    $("dashActivitySearch").addEventListener("input",()=>{activityPage=0;if(activeTab==="activity")void loadActivity();});
    $("dashActivityPrev").addEventListener("click",()=>{if(activityPage>0){activityPage--;void loadActivity();}});
    $("dashActivityNext").addEventListener("click",()=>{if((activityPage+1)*50<activityTotal){activityPage++;void loadActivity();}});
    document.addEventListener("raafat:activity-changed",()=>{if(activeTab==="activity"&&isAdmin())void loadActivity();});
  }
  initialize();
  return {open,close,render,loadStaff};
}
