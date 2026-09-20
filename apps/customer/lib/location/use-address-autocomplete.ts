"use client"

import { useEffect, useState } from "react"

import type { AddressSuggestion } from "@/lib/geoapify/types"
import { getAddressSuggestions } from "@/lib/location/api"

export function useAddressAutocomplete(query: string, areaId?: string) {
  const [state, setState] = useState<{
    query: string
    suggestions: AddressSuggestion[]
    loading: boolean
    error: string | null
  }>({ query: "", suggestions: [], loading: false, error: null })

  useEffect(() => {
    const normalized = query.trim()
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      if (normalized.length < 3) {
        setState({ query: normalized, suggestions: [], loading: false, error: null })
        return
      }
      setState((current) => ({ ...current, query: normalized, loading: true, error: null }))
      try {
        const suggestions = await getAddressSuggestions(normalized, controller.signal, areaId)
        if (controller.signal.aborted) return
        setState({ query: normalized, suggestions, loading: false, error: null })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({
          query: normalized,
          suggestions: [],
          loading: false,
          error: error instanceof Error ? error.message : "Address suggestions are temporarily unavailable.",
        })
      }
    }, normalized.length < 3 ? 0 : 380)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query, areaId])

  const current = state.query === query.trim()
  return {
    suggestions: current ? state.suggestions : [],
    loading: current && state.loading,
    error: current ? state.error : null,
  }
}
