"use client"

import type React from "react"
import { memo, useEffect, useState } from "react"
import { X, Plane, Gauge, TrendingUp, TrendingDown, Globe, Navigation, History, ChevronUp, ChevronDown } from "lucide-react"
import type { Flight } from "@/types/flight"

interface FlightPanelProps {
  flight: Flight
  onClose: () => void
}

interface FlightHistoryItem {
  icao24: string
  callsign: string
  firstSeen: number
  lastSeen: number
  estDepartureAirport: string | null
  estArrivalAirport: string | null
}

function FlightPanelComponent({ flight, onClose }: FlightPanelProps) {
  const altitudeFt = Math.round((flight.altitude || 0) * 3.281)
  const speedKnots = Math.round((flight.velocity || 0) * 1.944)
  const verticalFpm = Math.round((flight.verticalRate || 0) * 196.85)

  const [flightHistory, setFlightHistory] = useState<FlightHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false) // Collapsed by default on mobile

  useEffect(() => {
    let ignore = false
    async function fetchDetails() {
      setLoading(true)
      setError(null)
      try {
        const now = Math.floor(Date.now() / 1000)
        const begin = now - 2 * 24 * 3600
        const histRes = await fetch(`/api/flights/history?icao24=${flight.icao24}&begin=${begin}&end=${now}`)
        let hist: FlightHistoryItem[] = []
        if (histRes.ok) {
          const data = await histRes.json()
          hist = data.flights || []
        }
        if (!ignore) {
          setFlightHistory(hist)
        }
      } catch (err: any) {
        if (!ignore) setError("Unable to load flight history")
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    fetchDetails()
    return () => {
      ignore = true
    }
  }, [flight.icao24])

  return (
    <div className="absolute bottom-0 left-0 right-0 sm:bottom-20 sm:left-auto sm:right-4 z-[1000] sm:w-80 bg-card/98 backdrop-blur-xl border-t sm:border border-border sm:rounded-2xl shadow-2xl">
      {/* Drag Handle for mobile expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="sm:hidden w-full flex items-center justify-center py-1.5 border-b border-border/50 active:bg-accent/30"
      >
        <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        {isExpanded ? (
          <ChevronDown className="absolute right-3 h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="absolute right-3 h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Header - Always visible */}
      <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20 p-2.5 sm:p-4 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2.5 bg-primary/20 rounded-lg sm:rounded-xl border border-primary/30 flex-shrink-0">
              <Plane className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-foreground truncate">{flight.callsign}</h2>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-[11px] sm:text-sm text-muted-foreground truncate">{flight.originCountry}</span>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-xs font-semibold ml-1 ${
                    flight.onGround
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/20 text-primary"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${flight.onGround ? "bg-muted-foreground" : "bg-primary animate-pulse"}`} />
                  {flight.onGround ? "Ground" : "Air"}
                </span>
              </div>
            </div>
          </div>
          
          {/* Mobile: Quick Stats in header when collapsed */}
          <div className={`sm:hidden flex items-center gap-2 ${isExpanded ? 'hidden' : ''}`}>
            <div className="text-right">
              <div className="text-xs font-bold text-foreground">{altitudeFt.toLocaleString()} ft</div>
              <div className="text-[10px] text-muted-foreground">{speedKnots} kts</div>
            </div>
          </div>
          
          <button 
            onClick={onClose} 
            className="p-1.5 sm:p-2 hover:bg-accent/30 active:bg-accent/50 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      </div>

      {/* Expandable Content */}
      <div 
        className={`overflow-hidden transition-all duration-300 ease-out ${
          isExpanded ? 'max-h-[60vh]' : 'max-h-0 sm:max-h-none'
        } sm:block`}
      >
        <div className="p-2.5 sm:p-4 overflow-y-auto max-h-[50vh] sm:max-h-none">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-2 gap-1.5 sm:gap-3">
            <StatCard
              icon={TrendingUp}
              label="ALT"
              value={altitudeFt.toLocaleString()}
              unit="ft"
              iconColor="text-primary"
              bgColor="bg-primary/10"
            />
            <StatCard
              icon={Gauge}
              label="SPD"
              value={speedKnots.toString()}
              unit="kts"
              iconColor="text-accent"
              bgColor="bg-accent/10"
            />
            <StatCard
              icon={verticalFpm >= 0 ? TrendingUp : TrendingDown}
              label="V/S"
              value={`${verticalFpm > 0 ? "+" : ""}${verticalFpm}`}
              unit="fpm"
              iconColor={verticalFpm >= 0 ? "text-emerald-500" : "text-destructive"}
              bgColor={verticalFpm >= 0 ? "bg-emerald-500/10" : "bg-destructive/10"}
              valueColor={verticalFpm >= 0 ? "text-emerald-500" : "text-destructive"}
            />
            <StatCard
              icon={Navigation}
              label="HDG"
              value={Math.round(flight.heading || 0).toString()}
              unit="°"
              iconColor="text-cyan-500"
              bgColor="bg-cyan-500/10"
            />
          </div>

          {/* Additional Info */}
          <div className="mt-2.5 sm:mt-4 pt-2.5 sm:pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:gap-y-3 text-[11px] sm:text-sm">
              <InfoRow label="ICAO24" value={flight.icao24.toUpperCase()} mono />
              {flight.squawk && <InfoRow label="Squawk" value={flight.squawk} mono />}
              <InfoRow label="Lat" value={`${flight.latitude.toFixed(4)}°`} />
              <InfoRow label="Lon" value={`${flight.longitude.toFixed(4)}°`} />
            </div>
            
            {/* Flight history */}
            <div className="mt-2.5 sm:mt-4 pt-2.5 sm:pt-4 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <History className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground">Recent Flights</span>
              </div>
              
              {loading && (
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
                  <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
                  Loading...
                </div>
              )}
              
              {error && <div className="text-[10px] sm:text-xs text-destructive">{error}</div>}
              
              {!loading && !error && flightHistory.length === 0 && (
                <p className="text-[10px] sm:text-xs text-muted-foreground">No recent history</p>
              )}
              
              {flightHistory.length > 0 && (
                <div className="space-y-1">
                  {flightHistory.slice(-3).reverse().map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-1.5 sm:p-2 bg-secondary/30 rounded-lg text-[10px] sm:text-xs"
                    >
                      <Plane className="h-3 w-3 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0 truncate">
                        <span className="font-medium text-foreground">{f.callsign || "-"}</span>
                        <span className="text-muted-foreground ml-1">
                          {f.estDepartureAirport || "?"} → {f.estArrivalAirport || "?"}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-[9px] flex-shrink-0">
                        {new Date(f.lastSeen * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string
  unit: string
  iconColor: string
  bgColor: string
  valueColor?: string
}

const StatCard = memo(function StatCard({ icon: Icon, label, value, unit, iconColor, bgColor, valueColor }: StatCardProps) {
  return (
    <div className={`${bgColor} rounded-lg sm:rounded-xl p-1.5 sm:p-3 border border-border/50`}>
      <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
        <Icon className={`h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 ${iconColor}`} />
        <span className="text-[8px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5 sm:gap-1">
        <span className={`text-xs sm:text-lg font-bold ${valueColor || "text-foreground"}`}>{value}</span>
        <span className="text-[8px] sm:text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
})

interface InfoRowProps {
  label: string
  value: string
  mono?: boolean
}

const InfoRow = memo(function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className={`text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
})

export default memo(FlightPanelComponent)
