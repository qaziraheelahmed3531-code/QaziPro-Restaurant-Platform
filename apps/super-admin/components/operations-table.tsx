import Link from "next/link"
import { EmptyState, StatusBadge } from "@/components/ui"

type Row = Record<string, unknown>

const human = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

export function OperationsTable({ rows, columns, empty, page = 1, count = 0, pageSize = 50, href }: { rows: Row[]; columns: string[]; empty: string; page?: number; count?: number; pageSize?: number; href?: string }) {
  if (!rows.length) return <EmptyState title={empty} detail="No records have been created in this environment."/>
  return <><div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{human(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => { const value = row[column]; return <td key={column}>{/status|state|severity/.test(column) ? <StatusBadge value={value}/> : typeof value === "object" && value ? String((value as Row).name ?? "Configured") : String(value ?? "-")}</td> })}</tr>)}</tbody></table></div>{href && count > pageSize ? <nav className="pagination" aria-label="Records pagination"><span>Page {page} of {Math.ceil(count / pageSize)} · {count.toLocaleString()} records</span>{page > 1 ? <Link href={`${href}?page=${page - 1}`}>Previous</Link> : null}{page * pageSize < count ? <Link href={`${href}?page=${page + 1}`}>Next</Link> : null}</nav> : null}</>
}
