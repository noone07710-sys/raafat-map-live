/* RAAFAT • keyboard-accessible, first-party select menus.
 * Portals always render ABOVE booking overlays (13000) and follow scroll,
 * rather than disappearing on the focus-triggered scroll event. */
let opened=null,serial=0,updateFrame=0;
function cancelPositionFrame(){
 if(updateFrame){cancelAnimationFrame(updateFrame);updateFrame=0;}
}
function closeOpened({returnFocus=false}={}){
 if(!opened)return;
 const current=opened;opened=null;cancelPositionFrame();
 current.button.setAttribute("aria-expanded","false");
 current.button.removeAttribute("aria-controls");
 current.menu.remove();
 if(returnFocus&&current.button.isConnected)current.button.focus({preventScroll:true});
}
function positionOpened(){
 if(!opened)return;
 const {button,menu}=opened;
 if(!button.isConnected||!menu.isConnected){closeOpened();return;}
 const rect=button.getBoundingClientRect();
 const width=Math.min(Math.max(rect.width,170),Math.max(180,window.innerWidth-20));
 const viewportHeight=window.innerHeight;
 // The select can scroll inside the modal, but must not float at an unrelated spot.
 if(rect.bottom<0||rect.top>viewportHeight){closeOpened();return;}
 const targetHeight=Math.min(312,Math.max(116,viewportHeight-24));
 const below=viewportHeight-rect.bottom-10;
 const above=rect.top-10;
 const top=below>=Math.min(184,targetHeight)||below>=above
   ?Math.min(viewportHeight-16-Math.min(targetHeight,Math.max(84,menu.scrollHeight)),rect.bottom+6)
   :Math.max(10,rect.top-6-Math.min(targetHeight,Math.max(84,menu.scrollHeight)));
 const left=Math.max(10,Math.min(window.innerWidth-width-10,rect.right-width));
 menu.style.position="fixed";
 menu.style.zIndex="25000";
 menu.style.left=left+"px";
 menu.style.right="auto";
 menu.style.top=Math.max(8,top)+"px";
 menu.style.bottom="auto";
 menu.style.width=width+"px";
 menu.style.maxHeight=targetHeight+"px";
 menu.style.overflowY="auto";
}
function schedulePosition(){
 if(!opened||updateFrame)return;
 updateFrame=requestAnimationFrame(()=>{updateFrame=0;positionOpened();});
}
function buildOptionList(select,menu,button,sync){
 menu.replaceChildren();
 const current=[...select.options].filter(option=>!option.hidden);
 const options=[];
 for(const option of current){
   const item=document.createElement("button");
   item.type="button";item.className="raafat-select-option";
   item.setAttribute("role","option");
   item.setAttribute("aria-selected",String(option.value===select.value));
   item.tabIndex=-1;item.textContent=option.textContent||option.value;
   item.disabled=option.disabled;
   item.addEventListener("click",event=>{
     event.preventDefault();
     if(option.disabled)return;
     const changed=select.value!==option.value;
     select.value=option.value;
     sync();closeOpened({returnFocus:true});
     if(changed)select.dispatchEvent(new Event("change",{bubbles:true}));
   });
   options.push(item);menu.append(item);
 }
 if(!options.length){
   const empty=document.createElement("div");
   empty.className="raafat-select-empty";empty.textContent="لا توجد خيارات متاحة حالياً.";
   menu.appendChild(empty);
 }
 return options;
}
export function enhanceAdminSelects(scope=document){
 const root=scope||document;
 root.querySelectorAll("select:not([data-raafat-select])").forEach(select=>{
   if(!select.closest("#adminDashboard,#siteModal,#bookingModal"))return;
   select.dataset.raafatSelect="yes";
   const holder=document.createElement("span");
   holder.className="raafat-select-shell";
   select.parentNode.insertBefore(holder,select);
   holder.appendChild(select);
   select.classList.add("raafat-native-select");
   // The button is the only interactive selector. Hiding the original
   // select prevents nested <label> clicks from opening the OS picker.
   select.setAttribute("aria-hidden","true");
   select.tabIndex=-1;
   const button=document.createElement("button");
   button.type="button";button.className="raafat-select-trigger";
   button.setAttribute("aria-haspopup","listbox");
   button.setAttribute("aria-expanded","false");
   const linkedLabel=select.labels?.[0]?.textContent?.trim().slice(0,90)||"";
   button.setAttribute("aria-label",select.getAttribute("aria-label")||linkedLabel||"اختر من القائمة");
   button.innerHTML='<span class="raafat-select-text"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
   holder.appendChild(button);
   const sync=()=>{
     button.querySelector(".raafat-select-text").textContent=select.selectedOptions?.[0]?.textContent||"اختر…";
     button.disabled=select.disabled;
     if(opened?.button===button){buildOptionList(select,opened.menu,button,sync);schedulePosition();}
   };
   function open(){
     if(select.disabled)return;
     if(opened?.button===button){closeOpened({returnFocus:true});return;}
     closeOpened();
     const menu=document.createElement("div");
     menu.className="raafat-select-menu";
     menu.id="raafat-listbox-"+(++serial);
     menu.setAttribute("role","listbox");
     menu.setAttribute("aria-label",button.getAttribute("aria-label"));
     const options=buildOptionList(select,menu,button,sync);
     document.body.appendChild(menu);
     opened={button,menu,select};
     button.setAttribute("aria-expanded","true");
     button.setAttribute("aria-controls",menu.id);
     positionOpened();
     const enabled=options.filter(option=>!option.disabled);
     const selected=enabled.find(option=>option.getAttribute("aria-selected")==="true")||enabled[0];
     menu.addEventListener("keydown",event=>{
       const current=enabled.indexOf(document.activeElement);
       function move(index){enabled[Math.max(0,Math.min(index,enabled.length-1))]?.focus({preventScroll:true});}
       if(event.key==="ArrowDown"){event.preventDefault();move(current<0?0:current+1);}
       else if(event.key==="ArrowUp"){event.preventDefault();move(current<0?enabled.length-1:current-1);}
       else if(event.key==="Home"){event.preventDefault();move(0);}
       else if(event.key==="End"){event.preventDefault();move(enabled.length-1);}
       else if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeOpened({returnFocus:true});}
       else if((event.key==="Enter"||event.key===" ")&&document.activeElement?.getAttribute("role")==="option"){
         event.preventDefault();document.activeElement.click();
       }
     });
     // preventScroll is essential: otherwise opening a select inside the scrollable
     // booking modal triggered a document scroll which closed the list immediately.
     requestAnimationFrame(()=>{
       if(opened?.menu===menu){
         selected?.focus({preventScroll:true});
         selected?.scrollIntoView?.({block:"nearest",inline:"nearest"});
       }
     });
   }
   button.addEventListener("click",event=>{event.preventDefault();open();});
   button.addEventListener("keydown",event=>{
     if(["ArrowDown","ArrowUp","Enter"," "].includes(event.key)){event.preventDefault();open();}
   });
   select.addEventListener("change",sync);
   select.addEventListener("raafat-select-sync",sync);
   new MutationObserver(sync).observe(select,{
     attributes:true,childList:true,subtree:true,attributeFilter:["disabled","hidden","selected"]
   });
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
 if(!opened||opened.menu.contains(event.target))return;
 schedulePosition();
},true);
window.addEventListener("resize",schedulePosition);
document.addEventListener("visibilitychange",()=>{if(document.hidden)closeOpened();});
