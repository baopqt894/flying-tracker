"use client"

import { useEffect, useRef, useState, memo, useCallback } from "react"
import type { Flight, FlightWithChange } from "@/types/flight"

interface FlightMapProps {
  flights: Flight[]
  selectedFlight: Flight | null
  onSelectFlight: (flight: Flight | null) => void
  theme?: "light" | "dark"
}

function FlightMapComponent({ flights, selectedFlight, onSelectFlight, theme = "dark" }: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const markersMapRef = useRef<Map<string, any>>(new Map())
  const [isMapReady, setIsMapReady] = useState(false)
  const LRef = useRef<any>(null)
  const flightsMapRef = useRef<Map<string, Flight>>(new Map())
  const renderFrameRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Lưu trạng thái vị trí cũ/mới và thời gian fetch cho từng flight
  const flightAnimState = useRef<Map<string, {
    prevLat: number
    prevLng: number
    prevTime: number
    nextLat: number
    nextLng: number
    nextTime: number
  }>>(new Map())
  const lastFetchTimeRef = useRef<number>(Date.now())

  const [trackPolyline, setTrackPolyline] = useState<any>(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)

  useEffect(() => {
    const map = new Map<string, Flight>()
    flights.forEach((f) => map.set(f.icao24, f))
    flightsMapRef.current = map
  }, [flights])

  useEffect(() => {
    const initMap = async () => {
      if (!containerRef.current || mapRef.current) return

      const L = await import("leaflet")
      // Import leaflet CSS globally in your app (e.g., in _app.tsx or layout.tsx)
      // await import("leaflet/dist/leaflet.css")
      LRef.current = L

      mapRef.current = L.map(containerRef.current, {
        center: [20, 0],
        zoom: 3,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false,
        worldCopyJump: false,
        attributionControl: false,
        preferCanvas: true,
        maxBounds: [
          [-90, -180],
          [90, 180],
        ],
        maxBoundsViscosity: 1.0,
      })

      L.control.zoom({ position: "topright" }).addTo(mapRef.current)

      const tileUrl =
        theme === "dark"
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        noWrap: true,
      }).addTo(mapRef.current)

      markersLayerRef.current = L.layerGroup().addTo(mapRef.current)

      setIsMapReady(true)
    }

    initMap()

    return () => {
      if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  const animateMarker = useCallback(
    (marker: any, fromLat: number, fromLng: number, toLat: number, toLng: number, duration = 1000) => {
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Easing function for smooth animation
        const easeProgress = 1 - Math.pow(1 - progress, 3)

        const currentLat = fromLat + (toLat - fromLat) * easeProgress
        const currentLng = fromLng + (toLng - fromLng) * easeProgress

        marker.setLatLng([currentLat, currentLng])

        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }

      requestAnimationFrame(animate)
    },
    [],
  )

  // Cập nhật trạng thái mỗi lần fetch mới
  useEffect(() => {
    const now = Date.now()
    flights.forEach(flight => {
      if (
        typeof flight.latitude === "number" &&
        typeof flight.longitude === "number" &&
        !isNaN(flight.latitude) &&
        !isNaN(flight.longitude)
      ) {
        const prev = flightAnimState.current.get(flight.icao24)
        if (prev) {
          flightAnimState.current.set(flight.icao24, {
            prevLat: prev.nextLat,
            prevLng: prev.nextLng,
            prevTime: prev.nextTime,
            nextLat: flight.latitude,
            nextLng: flight.longitude,
            nextTime: now,
          })
        } else {
          flightAnimState.current.set(flight.icao24, {
            prevLat: flight.latitude,
            prevLng: flight.longitude,
            prevTime: now - 10000,
            nextLat: flight.latitude,
            nextLng: flight.longitude,
            nextTime: now,
          })
        }
      }
    })
    lastFetchTimeRef.current = now
  }, [flights])

  // Hàm lấy vị trí interpolate cho marker
  function getInterpolatedLatLng(icao24: string) {
    const state = flightAnimState.current.get(icao24)
    if (!state) return null
    const now = Date.now()
    const { prevLat, prevLng, prevTime, nextLat, nextLng, nextTime } = state
    if (nextTime === prevTime) return [nextLat, nextLng]
    const t = Math.min((now - prevTime) / (nextTime - prevTime), 1)
    const lat = prevLat + (nextLat - prevLat) * t
    const lng = prevLng + (nextLng - prevLng) * t
    return [lat, lng]
  }

  // Animation loop cho marker
  useEffect(() => {
    if (!isMapReady) return
    let running = true
    function animate() {
      if (!running) return
      markersMapRef.current.forEach((marker, icao24) => {
        const pos = getInterpolatedLatLng(icao24)
        if (pos) marker.setLatLng(pos)
      })
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    animationFrameRef.current = requestAnimationFrame(animate)
    return () => {
      running = false
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isMapReady])

  const renderMarkers = useCallback(() => {
    if (!mapRef.current || !isMapReady || !LRef.current || !markersLayerRef.current) return

    const L = LRef.current
    const bounds = mapRef.current.getBounds()
    const zoom = mapRef.current.getZoom()

    // Lọc flights hợp lệ và nằm trong bounds (ưu tiên hiển thị viewport)
    const validFlights = flights.filter(
      (f) =>
        typeof f.latitude === "number" &&
        typeof f.longitude === "number" &&
        !isNaN(f.latitude) &&
        !isNaN(f.longitude) &&
        bounds.contains([f.latitude, f.longitude])
    )

    // Kích hoạt declutter sớm hơn để giảm tải khi zoom xa
    const directFlightLimit = zoom < 3 ? 500 : zoom < 4 ? 900 : zoom < 5 ? 1300 : zoom < 6 ? 1700 : 2200
    const useDeclutter = validFlights.length > directFlightLimit

    // Ô lớn hơn để lọc nhiều hơn ở zoom thấp
    const cellSize = zoom < 3 ? 40 : zoom < 4 ? 34 : zoom < 5 ? 28 : zoom < 6 ? 22 : zoom < 7 ? 18 : zoom < 8 ? 14 : zoom < 9 ? 12 : 10

    // Giới hạn số máy bay mỗi ô ít hơn
    const maxPerCell = zoom < 3 ? 2 : zoom < 4 ? 2 : zoom < 5 ? 2 : zoom < 6 ? 1 : 1

    type ClusterItem = { key: string; count: number; lat: number; lng: number; flights: Flight[] }

    let clusterItems: ClusterItem[]
    if (useDeclutter) {
      const cellFlights: Record<string, Flight[]> = {}

      // Ưu tiên giữ flight đang chọn trước (seed cell)
      const pushToCell = (f: Flight) => {
        const p = mapRef.current.project([f.latitude, f.longitude], zoom)
        const key = `${Math.floor(p.x / cellSize)}_${Math.floor(p.y / cellSize)}`
        if (!cellFlights[key]) cellFlights[key] = []
        cellFlights[key].push(f)
      }

      if (
        selectedFlight &&
        typeof selectedFlight.latitude === "number" &&
        typeof selectedFlight.longitude === "number" &&
        bounds.contains([selectedFlight.latitude, selectedFlight.longitude])
      ) {
        pushToCell(selectedFlight)
      }

      for (const f of validFlights) {
        if (selectedFlight && f.icao24 === selectedFlight.icao24) continue
        pushToCell(f)
      }

      // Chọn tối đa maxPerCell mỗi ô, ưu tiên altitude cao (hoặc tốc độ nếu cần sau này)
      const picked: Flight[] = []
      Object.entries(cellFlights).forEach(([key, fls]) => {
        if (fls.length <= maxPerCell) {
          picked.push(...fls)
        } else {
          const sorted = fls.sort((a, b) => (b.altitude || 0) - (a.altitude || 0))
          picked.push(...sorted.slice(0, maxPerCell))
        }
      })

      clusterItems = picked.map(f => ({ key: f.icao24, count: 1, lat: f.latitude, lng: f.longitude, flights: [f] }))
    } else {
      clusterItems = validFlights.map(f => ({ key: f.icao24, count: 1, lat: f.latitude, lng: f.longitude, flights: [f] }))
    }

    const finalClusters = clusterItems

    if (typeof window !== "undefined") {
      console.debug(
        `[FlightMap] Zoom=${zoom} FlightsInView=${validFlights.length} Declutter=${useDeclutter} Cells=${finalClusters.length} (maxPerCell=${maxPerCell})`
      )
    }

    const currentMarkerIds = new Set<string>()
    const baseSize = zoom < 4 ? 12 : zoom < 6 ? 16 : 20

    for (const cluster of finalClusters) {
      if (cluster.count === 1) {
        const flight = cluster.flights[0]
        const id = flight.icao24
        currentMarkerIds.add(id)
        const isSelected = selectedFlight?.icao24 === id
        const size = isSelected ? baseSize + 8 : baseSize
        const existingMarker = markersMapRef.current.get(id)
        const pos = getInterpolatedLatLng(id) || [flight.latitude, flight.longitude]

        if (existingMarker) {
          const currentLatLng = existingMarker.getLatLng()
          const newIcon = createPlaneIcon(L, flight.heading || 0, isSelected, flight.onGround, theme, size)
          existingMarker.setIcon(newIcon)
          if (
            Math.abs(currentLatLng.lat - flight.latitude) > 0.0001 ||
            Math.abs(currentLatLng.lng - flight.longitude) > 0.0001
          ) {
            animateMarker(existingMarker, currentLatLng.lat, currentLatLng.lng, flight.latitude, flight.longitude, 1200)
          }
          existingMarker.setLatLng(pos)
        } else {
          const icon = createPlaneIcon(L, flight.heading || 0, isSelected, flight.onGround, theme, size)
          const marker = L.marker(pos, { icon })
          marker.on("click", () => handleMarkerClick(flight))
          if (zoom >= 4) {
            marker.bindTooltip(createTooltipContent(flight, theme), {
              className: "custom-tooltip",
              direction: "top",
              offset: [0, -12],
              opacity: 1,
            })
          }
          markersLayerRef.current.addLayer(marker)
          markersMapRef.current.set(id, marker)
        }
      } else {
        // Cụm nhiều flights -> vẫn hiển thị 1 icon máy bay (không phải blob), có badge số lượng nhỏ
        const id = `cluster:${cluster.key}`
        currentMarkerIds.add(id)
        const avgHeading = cluster.flights.reduce((acc, f) => acc + (f.heading || 0), 0) / cluster.count
        const icon = createPlaneGroupIcon(L, avgHeading, cluster.count, theme, baseSize + 4)
        const existingMarker = markersMapRef.current.get(id)
        const latlng: [number, number] = [cluster.lat, cluster.lng]
        if (existingMarker) {
          existingMarker.setLatLng(latlng)
          existingMarker.setIcon(icon)
        } else {
          const marker = L.marker(latlng, { icon })
          marker.on("click", () => {
            // Click cụm -> zoom sâu hơn để tách
            mapRef.current?.flyTo(latlng, Math.min(zoom + 2, mapRef.current.getMaxZoom()), { duration: 0.6 })
          })
          // Tooltip liệt kê một vài callsign trong cụm
          if (zoom >= 3) {
            const preview = cluster.flights.slice(0, 5).map(f => f.callsign || f.icao24).join(" · ")
            const more = cluster.count > 5 ? ` (+${cluster.count - 5} more)` : ""
            marker.bindTooltip(
              `<div style="padding:6px 8px;font-size:11px;font-weight:600;">${cluster.count} flights<br/><span style="font-weight:400;opacity:.8;">${preview}${more}</span></div>`,
              { className: "custom-tooltip", direction: "top", offset: [0, -14], opacity: 1 }
            )
          }
          markersLayerRef.current.addLayer(marker)
          markersMapRef.current.set(id, marker)
        }
      }
    }

    // Xóa markers không còn trong viewport / cluster mới
    markersMapRef.current.forEach((marker, id) => {
      if (!currentMarkerIds.has(id)) {
        markersLayerRef.current.removeLayer(marker)
        markersMapRef.current.delete(id)
      }
    })
  }, [flights, selectedFlight, onSelectFlight, isMapReady, theme, animateMarker])

  useEffect(() => {
    if (renderFrameRef.current) {
      cancelAnimationFrame(renderFrameRef.current)
    }
    renderFrameRef.current = requestAnimationFrame(renderMarkers)
  }, [renderMarkers])

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return

    const handleMoveEnd = () => {
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current)
      }
      renderFrameRef.current = requestAnimationFrame(renderMarkers)
    }

    mapRef.current.on("moveend", handleMoveEnd)
    mapRef.current.on("zoomend", handleMoveEnd)

    return () => {
      mapRef.current?.off("moveend", handleMoveEnd)
      mapRef.current?.off("zoomend", handleMoveEnd)
    }
  }, [isMapReady, renderMarkers])

  useEffect(() => {
    if (selectedFlight && mapRef.current && isMapReady) {
      mapRef.current.flyTo([selectedFlight.latitude, selectedFlight.longitude], 8, {
        duration: 1,
      })
    }
  }, [selectedFlight, isMapReady])

  useEffect(() => {
    if (!mapRef.current || !LRef.current || !isMapReady) return
    const L = LRef.current
    mapRef.current.eachLayer((layer: any) => {
      if (layer instanceof L.TileLayer) mapRef.current.removeLayer(layer)
    })
    L.tileLayer(
      theme === "dark"
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, noWrap: true },
    ).addTo(mapRef.current)
  }, [theme, isMapReady])

  // Hàm fetch track và vẽ polyline
  const fetchAndDrawTrack = useCallback(async (flight: Flight) => {
    if (!LRef.current || !mapRef.current) return
    setTrackLoading(true)
    setTrackError(null)
    try {
      const res = await fetch(
        `https://opensky-network.org/api/tracks/all?icao24=${flight.icao24}&time=0`,
        { headers: { Accept: "application/json" } }
      )
      if (!res.ok) throw new Error("Failed to fetch track")
      const data = await res.json()
      if (!data.path || !Array.isArray(data.path) || data.path.length < 2) throw new Error("No track data")
      const latlngs = data.path
        .filter((pt: any[]) => typeof pt[1] === "number" && typeof pt[2] === "number")
        .map((pt: any[]) => [pt[1], pt[2]])
      if (trackPolyline) {
        mapRef.current.removeLayer(trackPolyline)
      }
      const L = LRef.current
      const polyline = L.polyline(latlngs, {
        color: theme === "dark" ? "#84cc16" : "#65a30d",
        weight: 3,
        opacity: 0.8,
        dashArray: "6 8",
      }).addTo(mapRef.current)
      setTrackPolyline(polyline)
    } catch (err: any) {
      setTrackError(err.message || "Track error")
    } finally {
      setTrackLoading(false)
    }
  }, [trackPolyline, theme])

  // Xóa polyline khi unselect flight hoặc khi chọn flight khác
  useEffect(() => {
    if (trackPolyline && mapRef.current) {
      mapRef.current.removeLayer(trackPolyline)
      setTrackPolyline(null)
    }
    if (selectedFlight) {
      fetchAndDrawTrack(selectedFlight)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlight])

  // Khi click vào marker, chỉ gọi onSelectFlight
  function handleMarkerClick(flight: Flight) {
    onSelectFlight(flight)
  }

  return (
    <div className="relative h-full w-full">
      {/* Loading overlay */}
      {!isMapReady && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            background: theme === "dark" ? "hsl(160 15% 8%)" : "hsl(120 5% 96%)",
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div 
                className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"
              />
            </div>
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}
      
      {/* Map container */}
      <div
        ref={containerRef}
        className="h-full w-full transition-colors duration-300"
        style={{
          background: theme === "dark" ? "hsl(160 15% 8%)" : "hsl(120 5% 96%)",
        }}
      />
      
      {/* Track loading indicator */}
      {trackLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-border">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground">Loading flight track...</span>
          </div>
        </div>
      )}
    </div>
  )
}

function createPlaneIcon(
  L: any,
  heading: number,
  isSelected: boolean,
  onGround: boolean,
  theme: "light" | "dark" = "dark",
  size = 20,
) {
  const color = onGround ? (theme === "dark" ? "#6b7280" : "#9ca3af") : theme === "dark" ? "#84cc16" : "#65a30d"

  const glowColor = isSelected
    ? theme === "dark"
      ? "rgba(132, 204, 22, 0.6)"
      : "rgba(101, 163, 13, 0.4)"
    : "transparent"

  return L.divIcon({
    className: "flight-marker",
    html: `
      <svg 
        width="${size}" 
        height="${size}" 
        viewBox="0 0 24 24" 
        fill="${color}"
        style="transform: rotate(${heading}deg); filter: drop-shadow(0 0 ${isSelected ? "6px" : "2px"} ${glowColor}); will-change: transform;"
      >
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Icon cho cụm nhiều flights: vẫn là máy bay + badge số lượng nhỏ phía dưới / cạnh
function createPlaneGroupIcon(
  L: any,
  heading: number,
  count: number,
  theme: "light" | "dark" = "dark",
  size = 20,
) {
  const baseColor = theme === "dark" ? "#84cc16" : "#65a30d"
  const badgeBg = theme === "dark" ? "#0f1f0f" : "#ecf9ec"
  const badgeBorder = theme === "dark" ? "#1f3f1f" : "#c1e5c1"
  const badgeText = theme === "dark" ? "#84cc16" : "#3d7a12"
  return L.divIcon({
    className: "flight-group-marker",
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <svg 
          width="${size}" 
          height="${size}" 
          viewBox="0 0 24 24" 
          fill="${baseColor}"
          style="transform: rotate(${heading}deg); filter: drop-shadow(0 0 3px rgba(0,0,0,.4));"
        >
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>
        <div style="position:absolute;bottom:-4px;right:-6px;background:${badgeBg};color:${badgeText};border:1px solid ${badgeBorder};font-size:10px;font-weight:600;min-width:18px;padding:0 4px;border-radius:10px;line-height:16px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,.3);">${count}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function createTooltipContent(flight: Flight, theme: "light" | "dark" = "dark") {
  const bgColor = theme === "dark" ? "hsl(160 15% 10%)" : "hsl(0 0% 100%)"
  const textColor = theme === "dark" ? "hsl(120 5% 95%)" : "hsl(120 5% 20%)"
  const accentColor = theme === "dark" ? "hsl(80 60% 55%)" : "hsl(80 60% 40%)"
  const mutedColor = theme === "dark" ? "hsl(120 5% 60%)" : "hsl(120 5% 50%)"
  const borderColor = theme === "dark" ? "hsl(160 15% 20%)" : "hsl(120 5% 90%)"

  return `<div style="background: ${bgColor}; color: ${textColor}; padding: 10px 14px; border-radius: 10px; border: 1px solid ${borderColor}; box-shadow: 0 8px 24px rgba(0,0,0,${theme === "dark" ? "0.3" : "0.1"});">
    <div style="font-weight: 700; font-size: 14px; color: ${accentColor};">${flight.callsign}</div>
    <div style="font-size: 11px; color: ${mutedColor}; margin-top: 3px;">${flight.originCountry}</div>
    <div style="font-size: 12px; color: ${textColor}; margin-top: 6px; font-weight: 500;">
      ${flight.onGround ? "On Ground" : `${Math.round((flight.altitude || 0) * 3.281).toLocaleString()} ft`}
    </div>
  </div>`
}

// createClusterIcon giữ lại nếu cần fallback nhưng hiện không sử dụng nữa
function createClusterIcon(L: any, count: number, theme: "light" | "dark", zoom: number) {
  // Plane size scales a bit with zoom, but stays compact
  const planeSize = zoom < 3 ? 18 : zoom < 5 ? 22 : zoom < 7 ? 26 : 30
  // Badge sizing
  const badgeSize = count < 10 ? 16 : count < 100 ? 18 : 20
  const fontSize = count < 10 ? 11 : 10

  const planeColor = theme === "dark" ? "#84cc16" : "#65a30d"
  const badgeBg = theme === "dark" ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)"
  const badgeBorder = theme === "dark" ? "rgba(132,204,22,0.5)" : "rgba(101,163,13,0.45)"
  const badgeText = theme === "dark" ? "#ffffff" : "#0a0a0a"

  // Limit very large number display
  const displayCount = count > 999 ? "999+" : String(count)

  return L.divIcon({
    html: `
    <div style="position:relative; width:${planeSize}px; height:${planeSize}px; display:flex; align-items:center; justify-content:center;">
      <svg 
        width="${planeSize}" 
        height="${planeSize}" 
        viewBox="0 0 24 24" 
        fill="${planeColor}" 
        style="filter: drop-shadow(0 0 4px ${theme === "dark" ? "rgba(132,204,22,0.5)" : "rgba(101,163,13,0.4)"});">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
      <div style="
        position:absolute; top:-6px; right:-6px; min-width:${badgeSize}px; height:${badgeSize}px; padding:0 4px;
        background:${badgeBg}; color:${badgeText}; border:2px solid ${badgeBorder}; border-radius:999px;
        display:flex; align-items:center; justify-content:center; font-weight:700; font-size:${fontSize}px;
        font-family:system-ui,-apple-system,sans-serif; box-shadow:0 2px 6px rgba(0,0,0,0.4);
      ">${displayCount}</div>
    </div>`,
    className: "cluster-plane-marker",
    iconSize: [planeSize, planeSize],
    iconAnchor: [planeSize / 2, planeSize / 2],
  })
}

export default memo(FlightMapComponent)
