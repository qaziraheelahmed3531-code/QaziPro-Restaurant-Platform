import Link from "next/link"
import { notFound } from "next/navigation"
import { Plus } from "lucide-react"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, EmptyState, PageHeader, StatusBadge } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getModuleRows } from "@/lib/data"
import { isPlatformModule, modules } from "@/lib/platform"

type Row = Record<string, unknown>
const preferred = ["name","title","subject","display_name","hostname","provider","action","component","email","lifecycle","status","release_status","health_state","severity","platform","city","environment","created_at","updated_at","last_seen_at"]
const label = (key:string)=>key.replaceAll("_"," ").replace(/\b\w/g,(value)=>value.toUpperCase())
function renderValue(key:string,value:unknown){if(value===null||value===undefined||value==="")return "—";if(typeof value==="boolean")return <StatusBadge value={value?"ENABLED":"DISABLED"}/>;if(typeof value==="object"){if(Array.isArray(value))return `${value.length} records`;const record=value as Row;return String(record.name??record.display_name??record.id??"Configured")};if(/status|state|severity|lifecycle/.test(key))return <StatusBadge value={value}/>;if(key.includes("fee")||key==="tax"||key==="discount")return Number(value).toLocaleString();return String(value)}

export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<{ page?: string }> }) {
  const { module }=await params
  if(!isPlatformModule(module)||module==="overview"||module==="restaurants")notFound()
  const query=await searchParams
  const context=await requirePlatformStaff(),definition=modules[module],result=await getModuleRows(module,Number(query.page??1))
  const keys=preferred.filter((key)=>result.data.some((row)=>key in row)).slice(0,7)
  const action=module==="onboarding"?<Link className="button" href="/onboarding/new"><Plus/>New restaurant</Link>:module==="packages"?<span className="status status-warning">Package editor pending migration activation</span>:undefined
  return <PlatformShell context={context}><PageHeader eyebrow="QAZIPRO OPERATIONS" title={definition.title} description={definition.detail} actions={action}/>{result.error?<DataNotice message={result.error}/>:null}{result.data.length?<><div className="table-wrap"><table><thead><tr>{keys.map((key)=><th key={key}>{label(key)}</th>)}</tr></thead><tbody>{result.data.map((row,index)=><tr key={String(row.id??row.user_id??index)}>{keys.map((key)=><td key={key}>{renderValue(key,row[key])}</td>)}</tr>)}</tbody></table></div>{result.count>result.pageSize?<nav className="pagination" aria-label="Records pagination"><span>Page {result.page} of {Math.ceil(result.count/result.pageSize)}</span>{result.page>1?<Link href={`/${module}?page=${result.page-1}`}>Previous</Link>:null}{result.page*result.pageSize<result.count?<Link href={`/${module}?page=${result.page+1}`}>Next</Link>:null}</nav>:null}</>:<EmptyState title={`No ${definition.title.toLowerCase()} records`} detail="Nothing has been recorded in this environment yet. Unknown integration health is never shown as healthy." action={module==="onboarding"?{href:"/onboarding/new",label:"Start onboarding"}:undefined}/>}</PlatformShell>
}
