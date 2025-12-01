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
  const { enabled = true, pollInterval = 15000 } = options // Tăng lên 15s để giảm rate limit
  const [flights, setFlights] = useState<Flight[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [geoBounds, setGeoBoundsState] = useState<MapGeoBounds | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedOnce = useRef(false)
  const retryCount = useRef(0)
  const maxRetries = 3

  const fetchFlights = useCallback(async () => {
    setIsLoading(true)
    
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
      
      // Add timeout for fetch
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout
      
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      
      const data = await res.json()
      
      // Even if there's an error field, we may still have flights (cached)
      if (data.flights && data.flights.length > 0) {
        setFlights(data.flights)
        setLastUpdate(new Date())
        setIsConnected(!data.cached)
        retryCount.current = 0 // Reset retry count on success
      } else if (data.error && flights.length === 0) {
        // Only set error if we have no data at all
        throw new Error(data.error)
      }
      
      setError(null)
      setIsLoading(false)
      
      // Mark initial loading as complete after first fetch
      if (!hasFetchedOnce.current) {
        hasFetchedOnce.current = true
        setInitialLoading(false)
      }
    } catch (err: any) {
      console.error("Flight fetch error:", err.message)
      setError(err)
      setIsLoading(false)
      
      // Increment retry count
      retryCount.current++
      
      // If we have existing flights, keep showing them but mark as disconnected
      if (flights.length > 0) {
        setIsConnected(false)
      }
      
      // Still mark initial loading as complete to show the app
      if (!hasFetchedOnce.current) {
        hasFetchedOnce.current = true
        setInitialLoading(false)
      }
      
      // Retry with exponential backoff if under max retries
      if (retryCount.current <= maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 10000)
        console.log(`Retrying in ${retryDelay}ms (attempt ${retryCount.current}/${maxRetries})`)
        setTimeout(fetchFlights, retryDelay)
      }
    }
  }, [geoBounds, flights.length])

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
