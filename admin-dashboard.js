/**
 * RA'AFAT CONTROL CENTER
 * All user management is delegated to the protected Supabase admin-staff
 * Edge Function; no service key or privileged database credential lives here.
 */
export function createAdminDashboard({db,getState,toast,openEditor,loadSites,selectSite,applySettings}) {
  const $=id=>document.getElementById(id);
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const cities=["تكريت","بيجي","الدور","سامراء","الشرقاط","العلم","بلد","كركوك"];
  const labels={available:"متاحة",reserved:"محجوزة",booked:"مؤجرة",maintenance:"صيانة"};
  const roles={admin:"مدير كامل",editor:"محرر مواقع"};
  const chosen=new Set();
  let staffLoaded=false,activeTab="overview",settingsLoaded=false;
  const isAdmin=()=>getState().staffRole==="admin";

  function open(){
    const state=getState();
    if(!state.staff){toast("الدخول متاح لموظفي الشركة المعتمدين فقط.");return;}
    $("adminDashboard").hidden=false;
    document.body.classList.add("dashboard-open");
    $("dashStaffTab").hidden=!isAdmin();
    $("dashSettingsTab").hidden=!isAdmin();
    $("dashSessionRole").textContent=(state.user?.email||"حساب موظف")+" • "+(roles[state.staffRole]||"موظف");
    switchTab("overview");
    document.dispatchEvent(new CustomEvent("raafat:bookings-tab"));
  }
  function close(){
    $("adminDashboard").hidden=true;
    document.body.classList.remove("dashboard-open");
  }
  function switchTab(tab){
    if(["staff","settings"].includes(tab)&&!isAdmin()){toast("هذا القسم للمدير فقط.");return;}
    activeTab=tab;
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
    for(const id of [...chosen])if(!state.sites.some(s=>s.id===id))chosen.delete(id);
    $("dashInventoryRows").innerHTML=items.length?items.map(s=>
      '<tr><td><input type="checkbox" data-dash-check="'+escape(s.id)+'" aria-label="تحديد '+escape(s.code)+'" '+(chosen.has(s.id)?"checked":"")+'></td>'+
      '<td><strong>'+escape(s.code)+'</strong></td>'+
      '<td><div class="admin-table-name">'+escape(s.name)+'</div><small>'+escape(s.city)+' • '+escape(s.area||s.street||"")+'</small></td>'+
      '<td>'+Number(s.width_m).toLocaleString("ar-IQ")+' × '+Number(s.height_m).toLocaleString("ar-IQ")+' م</td>'+
      '<td><span class="admin-table-status '+escape(s.status)+'">'+escape(labels[s.status]||s.status)+'</span></td>'+
      '<td><span class="admin-publication '+(s.published?"yes":"no")+'">'+(s.published?"منشورة":"مسودة")+'</span></td>'+
      '<td><div class="admin-row-actions"><button type="button" data-dash-view="'+escape(s.id)+'">عرض</button><button type="button" data-dash-edit="'+escape(s.id)+'">تعديل</button><button type="button" data-dash-duplicate="'+escape(s.id)+'">نسخ</button></div></td></tr>'
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
    const ids=[...chosen];
    if(!ids.length){toast("حدد قطعة واحدة على الأقل.");return;}
    if(!confirm("تأكيد "+description+" لعدد "+ids.length+" قطعة؟"))return;
    try{
      const {error}=await db.from("sites").update(patch).in("id",ids);
      if(error)throw error;
      chosen.clear();
      await loadSites();
      render();
      toast("تم "+description+" بنجاح.");
    }catch(err){toast("تعذر التعديل: "+(err.message||"خطأ غير متوقع"));}
  }
  function exportCsv(){
    const items=getState().sites;
    if(!items.length){toast("لا توجد بيانات لتصديرها.");return;}
    const cols=[
      ["code","الرمز"],["name","اسم الموقع"],["governorate","المحافظة"],
      ["city","المدينة"],["area","المنطقة"],["street","الشارع"],
      ["landmark","أقرب معلم"],["type","نوع الإعلان"],["status","الحالة"],
      ["width_m","العرض"],["height_m","الارتفاع"],["faces","الأوجه"],
      ["lighting","الإنارة"],["latitude","خط العرض"],["longitude","خط الطول"],
      ["published","منشورة"],["description","الوصف"]
    ];
    const csvCell=value=>{
      let v=String(value??"");
      if(/^[\s]*[=+\-@]/.test(v))v="'"+v;
      return '"'+v.replaceAll('"','""')+'"';
    };
    const rows=[cols.map(([,title])=>csvCell(title)).join(","),
      ...items.map(s=>cols.map(([key])=>csvCell(s[key])).join(","))];
    const blob=new Blob(["\ufeff"+rows.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="raafat-sites-"+new Date().toISOString().slice(0,10)+".csv";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2500);
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
        '<div class="admin-staff-row"><div><strong>'+escape(m.email)+'</strong><small>'+escape(roles[m.role]||m.role)+(m.is_self?" • حسابك":"")+'</small></div>'+
        (m.is_self?'<span class="admin-self-tag">الحساب الحالي</span>':
          '<div class="admin-staff-actions"><select data-staff-role="'+escape(m.id)+'" aria-label="صلاحية '+escape(m.email)+'">'+
          '<option value="editor" '+(m.role==="editor"?"selected":"")+'>محرر</option>'+
          '<option value="admin" '+(m.role==="admin"?"selected":"")+'>مدير</option></select>'+
          '<button type="button" data-revoke-staff="'+escape(m.id)+'" title="إيقاف صلاحية هذا المستخدم">سحب الصلاحية</button></div>')+'</div>'
      ).join(""):'<p class="admin-note">ماكو موظفين مسجلين.</p>';
      $("dashStaffList").querySelectorAll("[data-staff-role]").forEach(el=>el.addEventListener("change",async()=>{
        if(!confirm("هل تريد تعديل صلاحية هذا الموظف؟")){await loadStaff();return;}
        try{await staffAction({action:"change_role",id:el.dataset.staffRole,role:el.value});toast("تم تعديل الصلاحية.");await loadStaff()}
        catch(err){toast("تعذر تعديل الصلاحية: "+err.message);await loadStaff();}
      }));
      $("dashStaffList").querySelectorAll("[data-revoke-staff]").forEach(el=>el.addEventListener("click",async()=>{
        if(!confirm("سيُمنع هذا الموظف من إدارة الموقع. هل تريد الاستمرار؟"))return;
        try{await staffAction({action:"revoke",id:el.dataset.revokeStaff});toast("تم سحب صلاحية الموظف.");await loadStaff()}
        catch(err){toast("تعذر سحب الصلاحية: "+err.message);}
      }));
    }catch(err){$("dashStaffList").textContent="تعذر عرض الموظفين: "+err.message;}
  }
  async function createStaff(event){
    event.preventDefault();if(!isAdmin())return;
    const button=$("dashCreateStaff");
    const email=$("dashStaffEmail").value.trim(),password=$("dashStaffPassword").value;
    const role=$("dashStaffRole").value;
    if(password.length<14){staffMessage("كلمة المرور يجب أن تتكون من 14 حرفاً على الأقل.",true);return;}
    if(!confirm("إنشاء "+(roles[role]||role)+" للبريد "+email+"؟"))return;
    button.disabled=true;staffMessage("جاري إنشاء الحساب…");
    try{
      await staffAction({action:"create",email,password,role});
      staffMessage("تم إنشاء الحساب. احفظ كلمة المرور المؤقتة وشاركها مع الموظف بشكل خاص.");
      $("dashStaffEmail").value="";
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
  function initialize(){
    document.querySelectorAll("[data-dash-tab]").forEach(el=>el.addEventListener("click",()=>switchTab(el.dataset.dashTab)));
    document.querySelectorAll("[data-dash-go]").forEach(el=>el.addEventListener("click",()=>switchTab(el.dataset.dashGo)));
    $("closeAdminDashboard").addEventListener("click",close);
    $("adminDashboard").addEventListener("keydown",event=>{if(event.key==="Escape"){event.stopPropagation();close()}});
    $("dashAddSite").addEventListener("click",()=>{close();openEditor()});
    $("dashQuickNew").addEventListener("click",()=>{close();openEditor()});
    $("dashExport").addEventListener("click",exportCsv);
    $("dashChangePassword").addEventListener("click",()=>{close();$("changePasswordButton").click()});
    $("dashRefresh").addEventListener("click",async()=>{await loadSites();render();toast("تم تحديث البيانات.")});
    $("dashInventorySearch").addEventListener("input",renderInventory);
    $("dashInventoryStatus").addEventListener("change",renderInventory);
    $("dashInventoryPublication").addEventListener("change",renderInventory);
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
    $("dashSettingsForm").addEventListener("submit",event=>void saveSettings(event));
  }
  initialize();
  return {open,close,render,loadStaff};
}
