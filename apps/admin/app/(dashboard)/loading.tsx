import { AppLoader } from "@italian-pizza/shared/app-loader"

export default function Loading() {
  return <div className="route-loading" role="status"><AppLoader active delay={0} label="Loading page"/><span>Loading page…</span></div>
}
