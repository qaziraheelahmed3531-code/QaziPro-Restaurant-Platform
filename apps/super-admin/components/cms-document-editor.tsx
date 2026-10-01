"use client"

import { useMemo,useState } from "react"
import { ExternalLink,Send } from "lucide-react"
import { MutationForm } from "./mutation-form"
import { SubmitButton } from "./submit-button"
import { StatusBadge } from "./ui"
import { aboutDefaults,AboutContentFields,AboutContentPreview } from "./about-content-fields"
import { publishSiteDocumentAction,saveSiteDocumentAction } from "@/app/(platform)/website/actions"

type Props={documentKey:string;label:string;draftRevision:number;publishedVersion:number;published:boolean;content:Record<string,unknown>;publicSite:string}

export function CmsDocumentEditor(props:Props){
  return <DocumentEditor key={`${props.documentKey}:${props.draftRevision}`} {...props}/>
}

function DocumentEditor(props:Props){
  const saved=props.documentKey==="about"?{...aboutDefaults,...props.content}:props.content
  const [source,setSource]=useState(()=>JSON.stringify(saved,null,2))
  const parsed=useMemo(()=>{try{const value=JSON.parse(source) as unknown;return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null}catch{return null}},[source])
  const dirty=JSON.stringify(parsed)!==JSON.stringify(saved)
  const previewPath=props.documentKey==="home"?"":props.documentKey
  return <article className={`cms-document${props.documentKey==="about"?" cms-document-about":""}`}><header><div><strong>{props.label}</strong><small>Draft r{props.draftRevision} · Published v{props.publishedVersion}</small></div><StatusBadge value={props.published?"PUBLISHED":"DRAFT"}/></header><div className="cms-inline-preview"><MutationForm action={saveSiteDocumentAction}><input type="hidden" name="key" value={props.documentKey}/><input type="hidden" name="revision" value={props.draftRevision}/>{props.documentKey==="about"?<><input type="hidden" name="content" value={source}/><AboutContentFields value={parsed??{}} onChange={(key,value)=>setSource(JSON.stringify({...parsed,[key]:value},null,2))}/></>:<label>Structured content<textarea name="content" rows={12} value={source} onChange={event=>setSource(event.target.value)} spellCheck={false}/></label>}<div className="cms-actions"><SubmitButton className="button button-secondary">Save draft</SubmitButton><a className="button button-secondary" target="_blank" rel="noreferrer" href={`${props.publicSite}/${previewPath}`}>Open published page <ExternalLink/></a></div></MutationForm><aside aria-label={`${props.label} draft preview`}><span className="eyebrow">LIVE DRAFT PREVIEW</span>{props.documentKey==="about"&&parsed?<AboutContentPreview value={parsed}/>:parsed?Object.entries(parsed).map(([key,value])=><div key={key}><small>{key}</small><strong>{typeof value==="string"?value:JSON.stringify(value)}</strong></div>):<p className="form-error">Fix the JSON to restore preview.</p>}</aside></div>{dirty?<p role="status" className="muted">Unsaved changes. Save the draft before publishing.</p>:null}<MutationForm action={publishSiteDocumentAction} confirmation="Publish this approved draft to QaziPro.com?"><input type="hidden" name="key" value={props.documentKey}/><input type="hidden" name="revision" value={props.draftRevision}/><SubmitButton disabled={dirty||!parsed} className="button"><Send/> Publish</SubmitButton></MutationForm></article>
}
