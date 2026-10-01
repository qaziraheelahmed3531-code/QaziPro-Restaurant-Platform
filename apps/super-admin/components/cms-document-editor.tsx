"use client"

import { useMemo,useState } from "react"
import { ExternalLink,Send } from "lucide-react"
import { MutationForm } from "./mutation-form"
import { SubmitButton } from "./submit-button"
import { StatusBadge } from "./ui"
import { publishSiteDocumentAction,saveSiteDocumentAction } from "@/app/(platform)/website/actions"

type Props={documentKey:string;label:string;draftRevision:number;publishedVersion:number;published:boolean;content:Record<string,unknown>;publicSite:string}

export function CmsDocumentEditor(props:Props){
  const [source,setSource]=useState(()=>JSON.stringify(props.content,null,2))
  const parsed=useMemo(()=>{try{const value=JSON.parse(source) as unknown;return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null}catch{return null}},[source])
  const previewPath=props.documentKey==="home"?"":props.documentKey
  return <article className="cms-document"><header><div><strong>{props.label}</strong><small>Draft r{props.draftRevision} · Published v{props.publishedVersion}</small></div><StatusBadge value={props.published?"PUBLISHED":"DRAFT"}/></header><div className="cms-inline-preview"><MutationForm action={saveSiteDocumentAction}><input type="hidden" name="key" value={props.documentKey}/><input type="hidden" name="revision" value={props.draftRevision}/><label>Structured content<textarea name="content" rows={12} value={source} onChange={event=>setSource(event.target.value)} spellCheck={false}/></label><div className="cms-actions"><SubmitButton className="button button-secondary">Save draft</SubmitButton><a className="button button-secondary" target="_blank" rel="noreferrer" href={`${props.publicSite}/${previewPath}`}>Preview live <ExternalLink/></a></div></MutationForm><aside aria-live="polite"><span className="eyebrow">LIVE DRAFT PREVIEW</span>{parsed?Object.entries(parsed).map(([key,value])=><div key={key}><small>{key}</small><strong>{typeof value==="string"?value:JSON.stringify(value)}</strong></div>):<p className="form-error">Fix the JSON to restore preview.</p>}</aside></div><MutationForm action={publishSiteDocumentAction} confirmation="Publish this approved draft to QaziPro.com?"><input type="hidden" name="key" value={props.documentKey}/><SubmitButton className="button"><Send/> Publish</SubmitButton></MutationForm></article>
}
