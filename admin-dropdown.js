/* RAAFAT CONTROL • bespoke dropdowns, no operating-system select popups. */
let opened=null, serial=0;
function closeOpened({returnFocus=false}={}){
 if(!opened)return;
 const record=opened;opened=null;
 record.button.setAttribute("aria-expanded","false");
 record.menu.remove();
 if(returnFocus&&record.button.isConnected)record.button.focus();
}
export function enhanceAdminSelects(scope=document){
 const root=scope||document;
 root.querySelectorAll("select:not([data-raafat-select])").forEach(select=>{
  if(!select.closest("#adminDashboard"))return;
  select.setAttribute("data-raafat-select","yes");
  const holder=document.createElement("span");
  holder.className="raafat-select-shell";
  select.parentNode.insertBefore(holder,select);
  holder.appendChild(select);
  select.classList.add("raafat-native-select");
  select.tabIndex=-1;
  const button=document.createElement("button");
  button.type="button";button.className="raafat-select-trigger";
  button.setAttribute("aria-haspopup","listbox");
  button.setAttribute("aria-expanded","false");
  button.setAttribute("aria-label",select.getAttribute("aria-label")||select.id||"اختيار");
  button.innerHTML='<span class="raafat-select-text"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  holder.appendChild(button);
  function sync(){
   button.querySelector(".raafat-select-text").textContent=select.selectedOptions?.[0]?.textContent||"اختر…";
   button.disabled=select.disabled;
  }
  function open(){
   if(select.disabled)return;
   if(opened?.button===button){closeOpened({returnFocus:true});return;}
   closeOpened();
   sync();
   const menu=document.createElement("div");
   const id="raafat-options-"+(++serial);
   menu.id=id;menu.className="raafat-select-menu";menu.setAttribute("role","listbox");
   menu.setAttribute("aria-label",button.getAttribute("aria-label"));
   const items=[...select.options];
   items.forEach((option,i)=>{
    const opt=document.createElement("button");
    opt.type="button";opt.setAttribute("role","option");opt.tabIndex=-1;opt.className="raafat-select-option";
    opt.setAttribute("aria-selected",String(option.value===select.value));
    opt.textContent=option.textContent||option.value;
    opt.disabled=option.disabled;
    opt.addEventListener("click",()=>{
     if(option.disabled)return;
     const changed=select.value!==option.value;
     select.value=option.value;sync();closeOpened({returnFocus:true});
     if(changed)select.dispatchEvent(new Event("change",{bubbles:true}));
    });
    menu.appendChild(opt);
   });
   document.body.appendChild(menu);
   const rect=button.getBoundingClientRect(),spaceDown=window.innerHeight-rect.bottom;
   const maxHeight=Math.min(280,window.innerHeight-50);
   menu.style.position="fixed";menu.style.width=Math.max(rect.width,175)+"px";
   menu.style.maxHeight=maxHeight+"px";menu.style.right=Math.max(10,window.innerWidth-rect.right)+"px";
   menu.style.top=spaceDown>210?Math.min(window.innerHeight-maxHeight-12,rect.bottom+6)+"px":"auto";
   if(spaceDown<=210)menu.style.bottom=Math.max(10,window.innerHeight-rect.top+6)+"px";
   button.setAttribute("aria-expanded","true");button.setAttribute("aria-controls",id);
   opened={button,menu};
   const options=[...menu.querySelectorAll('[role="option"]:not([disabled])')];
   const selected=options.find(o=>o.getAttribute("aria-selected")==="true")||options[0];
   function focus(index){
    if(!options.length)return;
    options[Math.max(0,Math.min(index,options.length-1))].focus();
   }
   menu.addEventListener("keydown",event=>{
    const current=options.indexOf(document.activeElement);
    if(event.key==="ArrowDown"){event.preventDefault();focus(current<0?0:Math.min(current+1,options.length-1));}
    if(event.key==="ArrowUp"){event.preventDefault();focus(current<0?options.length-1:Math.max(0,current-1));}
    if(event.key==="Home"){event.preventDefault();focus(0);}
    if(event.key==="End"){event.preventDefault();focus(options.length-1);}
    if(event.key==="Enter"||event.key===" "){if(document.activeElement?.getAttribute("role")==="option"){event.preventDefault();document.activeElement.click();}}
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeOpened({returnFocus:true});}
   });
   requestAnimationFrame(()=>selected?.focus());
  }
  button.addEventListener("click",open);
  button.addEventListener("keydown",event=>{if(["ArrowDown","ArrowUp","Enter"," "].includes(event.key)){event.preventDefault();open();}});
  select.addEventListener("change",sync);
  select.addEventListener("raafat-select-sync",sync);
  new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:["disabled"]});
  sync();
 });
}
document.addEventListener("pointerdown",event=>{
 if(!opened)return;
 if(opened.button.contains(event.target)||opened.menu.contains(event.target))return;
 closeOpened();
},true);
document.addEventListener("keydown",event=>{
 if(event.key==="Escape"&&opened){event.preventDefault();event.stopPropagation();closeOpened({returnFocus:true});}
},true);
document.addEventListener("scroll",event=>{
 if(opened&&!opened.menu.contains(event.target))closeOpened();
},true);
window.addEventListener("resize",()=>closeOpened());
