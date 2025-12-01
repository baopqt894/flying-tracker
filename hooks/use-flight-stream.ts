"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { Flight, MapGeoBounds } from "@/types/flight"

interface UseFlightStreamOptions {
  enabled?: boolean
  pollInterval?: number // ms
}

interface UseFlightStreamReturn {
  flights: Flight[]
  isLoading: boolean
  isConnected: boolean
  lastUpdate: Date | null
  error: Error | null
  reconnect: () => void
  setGeoBounds: (bounds: MapGeoBounds) => void
  initialLoading: boolean
}

export function useFlightStream(options: UseFlightStreamOptions = {}): UseFlightStreamReturn {
  const { enabled = true, pollInterval = 10000 } = options
  const [flights, setFlights] = useState<Flight[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [geoBounds, setGeoBoundsState] = useState<MapGeoBounds | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedOnce = useRef(false)

  const fetchFlights = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      let url = "/api/flights"
      if (geoBounds) {
        const params = new URLSearchParams({
          lamin: geoBounds.southernLatitude.toString(),
          lomin: geoBounds.westernLongitude.toString(),
          lamax: geoBounds.northernLatitude.toString(),
          lomax: geoBounds.easternLongitude.toString(),
        })
        url += `?${params.toString()}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch flights")
      const data = await res.json()
      setFlights(data.flights || [])
      setLastUpdate(new Date())
      setIsConnected(true)
      setIsLoading(false)
      
      // Mark initial loading as complete after first successful fetch
      if (!hasFetchedOnce.current) {
        hasFetchedOnce.current = true
        setInitialLoading(false)
      }
    } catch (err: any) {
      setError(err)
      setIsConnected(false)
      setIsLoading(false)
      
      // Still mark initial loading as complete on error to show the app
      if (!hasFetchedOnce.current) {
        hasFetchedOnce.current = true
        setInitialLoading(false)
      }
    }
  }, [geoBounds])

  // Polling effect
  useEffect(() => {
    if (!enabled) return
    fetchFlights()
    intervalRef.current = setInterval(fetchFlights, pollInterval)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, fetchFlights, pollInterval])

  // Manual reconnect
  const reconnect = useCallback(() => {
    fetchFlights()
  }, [fetchFlights])

  // Set geo bounds
  const setGeoBounds = useCallback((bounds: MapGeoBounds) => {
    setGeoBoundsState(bounds)
  }, [])

  return {
    flights,
    isLoading,
    isConnected,
    lastUpdate,
    error,
    reconnect,
    setGeoBounds,
    initialLoading,
  }
}
