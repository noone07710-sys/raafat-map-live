/* RAAFAT UI • first-party accessible confirmations and copy sheets.
   No browser confirm(), prompt(), or alert() dialogs are used. */
const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
let activeDialog=null;
const icon={
 danger:'<path d="M12 3 2.8 19a1.6 1.6 0 0 0 1.4 2.4h15.6a1.6 1.6 0 0 0 1.4-2.4L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
 confirm:'<path d="m5 12 4.5 4.5L19 7"/><circle cx="12" cy="12" r="10"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'
};
function showDialog({mode="confirm",title="تأكيد العملية",message="",detail="",expected="",value="",confirmText="تأكيد",cancelText="إلغاء",danger=false}={}){
 return new Promise(resolve=>{
  if(activeDialog){activeDialog.cancel();}
  const previousFocus=document.activeElement;
  const oldOverflow=document.body.style.overflow;
  const id="raafatDialogTitle";
  const root=document.createElement("div");
  root.className="raafat-dialog-layer";
  root.setAttribute("data-raafat-dialog","true");
  const verifying=mode==="verify",copying=mode==="copy";
  const mark=danger?"danger":copying?"copy":"confirm";
  const svg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon[mark]+'</svg>';
  root.innerHTML='<div class="raafat-dialog-overlay" data-dismiss="true"></div>'+
   '<section class="raafat-dialog-card '+(danger?"is-danger":"")+'" role="dialog" aria-modal="true" aria-labelledby="'+id+'" tabindex="-1">'+
   '<div class="raafat-dialog-head"><span class="raafat-dialog-mark">'+svg+'</span><div class="raafat-dialog-label">RAAFAT CONTROL CENTER</div></div>'+
   '<h2 id="'+id+'">'+escapeHTML(title)+'</h2>'+
   (message?'<p class="raafat-dialog-message">'+escapeHTML(message)+'</p>':"")+
   (detail?'<p class="raafat-dialog-detail">'+escapeHTML(detail)+'</p>':"")+
   (verifying?'<div class="raafat-dialog-verification"><span>اكتب الرمز للتأكيد</span>'+
    '<strong dir="ltr">'+escapeHTML(expected)+'</strong>'+
    '<input class="raafat-dialog-input" type="text" autocomplete="off" spellcheck="false" dir="ltr" aria-label="رمز التأكيد" placeholder="أدخل الرمز تماماً مثل ما يظهر"></div>':"")+
   (copying?'<div class="raafat-dialog-verification"><span>الرابط</span><textarea readonly class="raafat-dialog-copy" aria-label="نسخ الرابط" dir="ltr">'+escapeHTML(value)+'</textarea></div>':"")+
   '<div class="raafat-dialog-footer">'+
   '<button type="button" class="raafat-dialog-cancel">'+escapeHTML(cancelText)+'</button>'+
   '<button type="button" class="raafat-dialog-confirm" '+(verifying?"disabled":"")+'>'+escapeHTML(confirmText)+'</button>'+
   '</div></section>';
  document.body.appendChild(root);
  document.body.style.overflow="hidden";
  const card=root.querySelector(".raafat-dialog-card");
  const input=root.querySelector(".raafat-dialog-input");
  const yes=root.querySelector(".raafat-dialog-confirm");
  const no=root.querySelector(".raafat-dialog-cancel");
  let done=false;
  function finish(ok){
   if(done)return;
   done=true;document.removeEventListener("keydown",onKey,true);
   root.remove();document.body.style.overflow=oldOverflow;
   activeDialog=null;
   if(previousFocus?.isConnected&&typeof previousFocus.focus==="function")previousFocus.focus({preventScroll:true});
   resolve(Boolean(ok));
  }
  function onKey(event){
   if(event.key==="Escape"){event.preventDefault();event.stopPropagation();finish(false);return;}
   if(event.key==="Tab"){
    const focusable=[...root.querySelectorAll("button:not([disabled]),input,textarea")];
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
   if(event.key==="Enter"&&!copying&&document.activeElement===input&&!yes.disabled){event.preventDefault();finish(true);}
  }
  document.addEventListener("keydown",onKey,true);
  root.querySelector("[data-dismiss]").addEventListener("click",()=>finish(false));
  no.addEventListener("click",()=>finish(false));
  if(verifying){
   input.addEventListener("input",()=>{yes.disabled=input.value.trim()!==expected;});
   input.focus();
  }else if(copying){root.querySelector("textarea").focus();root.querySelector("textarea").select();}
  else yes.focus();
  yes.addEventListener("click",async()=>{
   if(yes.disabled)return;
   if(copying){
    try{
     await navigator.clipboard.writeText(value);
     yes.textContent="تم نسخ الرابط";
     setTimeout(()=>finish(true),380);
    }catch{
     const field=root.querySelector("textarea");field.select();
     try{document.execCommand("copy");yes.textContent="تم النسخ";setTimeout(()=>finish(true),380);}
     catch{yes.textContent="حدد الرابط وانسخه";field.focus();}
    }
   }else finish(true);
  });
  activeDialog={cancel:()=>finish(false)};
 });
}
export const raafatConfirm=opts=>showDialog({...opts,mode:"confirm"});
export const raafatVerify=opts=>showDialog({...opts,mode:"verify",danger:true,confirmText:opts?.confirmText||"حذف نهائي"});
export const raafatCopy=opts=>showDialog({...opts,mode:"copy",confirmText:"نسخ الرابط"});
