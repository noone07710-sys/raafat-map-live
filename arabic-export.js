/* RAAFAT • Accurate Arabic Excel-compatible exports (UTF-8 BOM + delimiter hint).
 * All labels and status values are deliberately Arabic; no raw database enum leaks.
 * Text cells are quoted and sanitized against spreadsheet-formula injection. */
const SIZES=Object.freeze({A:[1.2,2],B:[2,3],C:[2.5,3.5],D:[3,4]});
const STATUSES=Object.freeze({available:"متاحة",reserved:"محجوزة",booked:"مؤجرة",maintenance:"صيانة",pending:"بانتظار المراجعة",approved:"موافق عليه",rejected:"مرفوض",completed:"مكتمل"});
const TYPES=Object.freeze({billboard:"لوحة إعلانية",unipole:"لوحة عمودية",led:"شاشة إلكترونية",bridge:"إعلان جسر",wall:"جدارية",building:"واجهة بناية",sidewalk:"لوحة رصيف",other:"أخرى"});
const safeNumber=v=>v===null||v===undefined||v===""?"":(Number.isFinite(Number(v))?String(Number(v)):"");
const raw=v=>String(v??"").replace(/\u0000/g,"");
const sanitize=v=>{
 const str=raw(v);
 // The first printable character must never start an interpreted spreadsheet formula.
 const trimmed=str.replace(/^[\s\u200B-\u200F\uFEFF]+/u,"");
 return /^[=+@\-]/.test(trimmed) || /^[\t\r\n]/.test(str) ? "'"+str : str;
};
const textCell=v=>'"'+sanitize(v).replaceAll('"','""')+'"';
const valueCell=v=>Number.isFinite(v)?String(v):safeNumber(v);
// Excel tries to convert quoted 11-digit Iraqi phones into numbers and drops the
// first zero. Only strictly validated decimal digits use this safe text formula.
const phoneCell=v=>{
 const phone=raw(v);
 if(!/^[0-9]{11}$/.test(phone))return textCell(phone);
 const literal='="'+phone+'"';
 return '"'+literal.replaceAll('"','""')+'"';
};
export function packageName(site){
 if(site?.package_class==="E")return "E";
 const w=Number(site?.width_m),h=Number(site?.height_m);
 const known=Object.entries(SIZES).find(([,dim])=>(w===dim[0]&&h===dim[1])||(w===dim[1]&&h===dim[0]));
 return known?.[0]||site?.package_class||"قياس خاص";
}
const columnsSites=[
 ["رمز القطعة",s=>raw(s.code)],["اسم الموقع",s=>raw(s.name)],["الفئة الإعلانية",s=>packageName(s)],
 ["المحافظة",s=>raw(s.governorate)],["القضاء أو المدينة",s=>raw(s.city)],["المنطقة",s=>raw(s.area)],
 ["الشارع",s=>raw(s.street)],["أقرب معلم",s=>raw(s.landmark)],["نوع الإعلان",s=>TYPES[s.type]||"غير محدد"],
 ["الحالة",s=>STATUSES[s.status]||"غير محددة"],["العرض بالمتر",s=>safeNumber(s.width_m),"number"],
 ["الارتفاع بالمتر",s=>safeNumber(s.height_m),"number"],
 ["المساحة بالمتر المربع",s=>safeNumber(Number(s.width_m)*Number(s.height_m)),"number"],
 ["عدد الأوجه",s=>safeNumber(s.faces),"number"],["الإنارة",s=>s.lighting?"مضاءة":"غير مضاءة"],
 ["النشر",s=>s.published?"منشورة":"مسودة"],["اتجاه الإعلان",s=>raw(s.facing)],
 ["الخامة",s=>raw(s.material)],["الوصف",s=>raw(s.description)],
 ["خط العرض",s=>safeNumber(s.latitude),"number"],["خط الطول",s=>safeNumber(s.longitude),"number"]
];
const bookingSites=b=>{
 const chosen=Array.isArray(b.booking_request_sites)?b.booking_request_sites:[];
 return chosen.length?chosen.map(s=>s.site_code).filter(Boolean).join("، "):raw(b.site_code)||"طلب عام";
};
const columnsBookings=[
 ["رقم الطلب",b=>"RA-"+b.booking_no],["تاريخ الطلب",b=>new Date(b.created_at).toLocaleString("ar-IQ",{hour12:false})],
 ["اسم الزبون",b=>raw(b.customer_name)],["رقم الهاتف",b=>raw(b.phone),"phone"],
 ["الجهة أو الشركة",b=>raw(b.company_name)],["المحافظة",b=>raw(b.governorate)],["القضاء أو المدينة",b=>raw(b.city)],
 ["الفئة",b=>raw(b.category)],["المدة بالأشهر",b=>safeNumber(b.duration_months),"number"],
 ["القطع المحددة",bookingSites],["عدد القطع",b=>Array.isArray(b.booking_request_sites)?b.booking_request_sites.length:(b.site_code?1:0),"number"],
 ["المساحة المطلوبة بالمتر المربع",b=>safeNumber(b.requested_area_m2),"number"],
 ["المبلغ بالدولار",b=>safeNumber(b.quoted_price_usd),"number"],["حالة الطلب",b=>STATUSES[b.status]||"غير محددة"]
];
export function makeArabicCsv(items,kind="sites"){
 const columns=kind==="bookings"?columnsBookings:columnsSites;
 const header=columns.map(([name])=>textCell(name)).join(",");
 const rows=(items||[]).map(item=>columns.map(([,get,type])=>{
   const val=get(item);
   return type==="number"&&val!==""?valueCell(val):type==="phone"?phoneCell(val):textCell(val);
 }).join(","));
 // Excel on Windows detects Arabic UTF-8 with BOM and comma via the sep directive.
 return "\uFEFFsep=,\r\n"+[header,...rows].join("\r\n")+"\r\n";
}
export function downloadArabicCsv(items,kind="sites"){
 const csv=makeArabicCsv(items,kind);
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 const date=new Date();
 const d=[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
 link.href=url;link.download=(kind==="bookings"?"حجوزات-رأفت-":"لوحات-رأفت-")+d+".csv";
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2500);
 return items.length;
}
