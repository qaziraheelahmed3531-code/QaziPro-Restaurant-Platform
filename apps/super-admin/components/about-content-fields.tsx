"use client"

export const aboutDefaults: Record<string,string> = {vision:"",teamHeading:"People responsible for the platform.",ctaLabel:"Talk to QaziPro",ctaHref:"/contact"}
const fields = [
  ["eyebrow", "Eyebrow", 100], ["title", "Headline", 180], ["story", "Story", 5000],
  ["mission", "Mission", 2000], ["vision", "Vision", 2000], ["teamHeading", "Team heading", 180], ["ctaLabel", "CTA label", 80],
] as const

export function AboutContentFields({value,onChange}:{value:Record<string,unknown>;onChange:(key:string,value:string)=>void}){
  return <>{fields.map(([key,label,max])=><label key={key}>{label}{max>180?<textarea rows={4} maxLength={max} required={key!=="vision"} value={String(value[key]??"")} onChange={event=>onChange(key,event.target.value)}/>:<input maxLength={max} required value={String(value[key]??"")} onChange={event=>onChange(key,event.target.value)}/>}</label>)}
    <label>CTA destination<select aria-label="CTA destination" value={String(value.ctaHref??"/contact")} onChange={event=>onChange("ctaHref",event.target.value)}><option value="/contact">Contact</option><option value="/book-a-demo">Book a demo</option><option value="/client-onboarding">Client onboarding</option><option value="/restaurant-platform">Restaurant platform</option></select></label></>
}

export function AboutContentPreview({value}:{value:Record<string,unknown>}){
  return <div className="cms-about-preview"><small>{String(value.eyebrow??"")}</small><h2>{String(value.title??"")}</h2><p>{String(value.story??"")}</p><h3>Our mission</h3><p>{String(value.mission??"")}</p>{value.vision?<><h3>Our vision</h3><p>{String(value.vision)}</p></>:null}<span className="button" aria-disabled="true">{String(value.ctaLabel)}</span><h3>{String(value.teamHeading)}</h3><p className="muted">Published team profiles appear here. This draft preview does not publish changes.</p></div>
}
