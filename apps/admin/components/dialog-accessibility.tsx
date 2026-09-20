"use client"

import { useEffect } from "react"

/** Shared keyboard behavior for the operational drawers and modal editors. */
export function DialogAccessibility() {
  useEffect(() => {
    let active: HTMLElement | null = null
    let previous: HTMLElement | null = null
    const selector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'
    const visible = (root:HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el=>el.getClientRects().length>0)
    const sync = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const next = dialogs[dialogs.length-1] ?? null
      if(next===active)return
      if(!next){previous?.focus();active=null;return}
      previous=document.activeElement instanceof HTMLElement?document.activeElement:null
      active=next
      requestAnimationFrame(()=>visible(next)[0]?.focus())
    }
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{childList:true,subtree:true})
    const keydown=(event:KeyboardEvent)=>{
      if(!active)return
      if(event.key==="Escape"){
        const close=active.querySelector<HTMLButtonElement>('button[aria-label^="Close"],header button')
        if(close&&!close.disabled){event.preventDefault();close.click()}
      }
      if(event.key!=="Tab")return
      const controls=visible(active);const first=controls[0];const last=controls[controls.length-1]
      if(!first){event.preventDefault();return}
      if(event.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){event.preventDefault();first.focus()}
    }
    document.addEventListener("keydown",keydown);sync()
    return()=>{observer.disconnect();document.removeEventListener("keydown",keydown)}
  },[])
  return null
}
