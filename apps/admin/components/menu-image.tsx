"use client"

import Image, { type ImageProps } from "next/image"
import { UtensilsCrossed } from "lucide-react"
import { useState } from "react"

/** A missing catalog asset must not leave a broken-image symbol in the counter. */
export default function MenuImage(props: Omit<ImageProps, "src"> & { src: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  if (failedSource === props.src) return <span className={`${props.className ?? ""} menu-image-fallback`} style={props.fill ? {position:"absolute",inset:0} : {width:Number(props.width ?? 44),height:Number(props.height ?? 44)}} aria-hidden="true"><UtensilsCrossed/></span>
  return <Image {...props} alt={props.alt} onError={event => {setFailedSource(props.src);props.onError?.(event)}}/>
}
