"use client"

import { useRef, useState } from "react"
import { FileUp, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"

export function PortalDocumentUpload({ reference }: { reference: string }) {
  const [pending,setPending]=useState(false)
  const [message,setMessage]=useState("")
  const [error,setError]=useState("")
  const input=useRef<HTMLInputElement>(null)
  const router=useRouter()
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setPending(true);setMessage("");setError("")
    const form=new FormData(event.currentTarget)
    try{
      const response=await fetch(`/api/client-portal/${reference}/documents`,{method:"POST",body:form})
      const body=await response.json() as {message?:string}
      if(!response.ok)throw new Error(body.message||"Upload failed.")
      setMessage("Document uploaded securely.");if(input.current)input.current.value="";router.refresh()
    }catch(reason){setError(reason instanceof Error?reason.message:"We couldn't upload that document.")}
    finally{setPending(false)}
  }
  return <form className="portal-upload-form" onSubmit={submit}>
    <label htmlFor="portal-document">Upload requested document</label>
    <p>PDF, PNG, JPEG or WebP. Maximum 3 MB.</p>
    <input ref={input} id="portal-document" name="document" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required/>
    {error?<p className="portal-form-error" role="alert">{error}</p>:null}
    {message?<p className="portal-form-success" role="status">{message}</p>:null}
    <button className="button button-outline" disabled={pending}>{pending?<><LoaderCircle className="spinner"/> Uploading…</>:<>Upload document <FileUp size={17}/></>}</button>
  </form>
}
