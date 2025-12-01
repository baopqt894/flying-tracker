"use client"

import type React from "react"
import dynamic from "next/dynamic"
import { useState, useCallback, useMemo, memo } from "react"
import {
  Plane,
  RefreshCw,
  Search,
  Layers,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Radio,
  Radar,
  Menu,
  X,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  PlaneLanding,
  PlaneTakeoff,
  Building2,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import FlightPanel from "@/components/flight-panel"
import FlightListItem from "@/components/flight-list-item"
import type { Flight } from "@/types/flight"
import { useDebounce } from "use-debounce"
import { useTheme } from "next-themes"
import { useFlightStream } from "@/hooks/use-flight-stream"

const FlightMap = dynamic(() => import("@/components/flight-map"), {
  ssr: false,
  loading: () => null,
})

// Airport search result type
interface AirportFlight {
  icao24: string
  callsign: string
  firstSeen: number
  lastSeen: number
  estDepartureAirport: string | null
  estArrivalAirport: string | null
}

export default function FlightTracker() {
  const { flights, isLoading, isConnected, lastUpdate, reconnect, initialLoading } = useFlightStream({})
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch] = useDebounce(searchQuery, 300)
  const [sidebarOpen, setSidebarOpen] = useState(false) // Mặc định ẩn sidebar để hiện map trước
  const [flightsToShow, setFlightsToShow] = useState(50)
  const { theme, setTheme } = useTheme()

  // Airport search state
  const [airportCode, setAirportCode] = useState("")
  const [airportSearchType, setAirportSearchType] = useState<"arrivals" | "departures">("arrivals")
  const [airportFlights, setAirportFlights] = useState<AirportFlight[]>([])
  const [airportSearchLoading, setAirportSearchLoading] = useState(false)
  const [airportSearchError, setAirportSearchError] = useState<string | null>(null)
  const [showAirportSearch, setShowAirportSearch] = useState(false)

  const filteredFlights = useMemo(() => {
    if (!debouncedSearch) return flights
    const search = debouncedSearch.toLowerCase()
    return flights.filter(
      (flight) => flight.callsign.toLowerCase().includes(search) || flight.originCountry.toLowerCase().includes(search),
    )
  }, [flights, debouncedSearch])

  const displayedFlights = useMemo(() => {
    return filteredFlights.slice(0, flightsToShow)
  }, [filteredFlights, flightsToShow])

  const activeFlights = useMemo(() => flights.filter((f) => !f.onGround).length, [flights])

  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })

  const handleSelectFlight = useCallback((flight: Flight | null) => {
    setSelectedFlight(flight)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  // Airport search handler
  // Note: OpenSky only provides historical data (previous day or earlier)
  const handleAirportSearch = async () => {
    if (!airportCode.trim()) return
    
    setAirportSearchLoading(true)
    setAirportSearchError(null)
    setAirportFlights([])
    
    try {
      // Use yesterday's data since OpenSky only has historical arrivals/departures
      const now = Math.floor(Date.now() / 1000)
      const yesterday = now - 24 * 3600
      const twoDaysAgo = now - 2 * 24 * 3600
      
      const res = await fetch(
        `/api/flights?type=${airportSearchType}&airport=${airportCode.toUpperCase()}&begin=${twoDaysAgo}&end=${yesterday}`
      )
      
      if (!res.ok) {
        throw new Error("Failed to fetch airport data")
      }
      
      const data = await res.json()
      setAirportFlights(data.flights || [])
      
      if (data.flights?.length === 0) {
        setAirportSearchError("No flights found (showing yesterday's data)")
      }
    } catch (err: any) {
      setAirportSearchError(err.message || "Search failed")
    } finally {
      setAirportSearchLoading(false)
    }
  }

  // Global loading screen
  if (initialLoading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <Radar className="h-20 w-20 text-primary animate-pulse" />
            <div className="absolute inset-0 h-20 w-20 border-4 border-primary/20 rounded-full animate-ping" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Live<span className="text-primary">Earth</span>
            </h1>
            <p className="text-muted-foreground animate-pulse">Loading flight data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-[1001] h-12 sm:h-14 bg-card/95 backdrop-blur-xl border-b border-border flex items-center justify-between px-2 sm:px-4">
        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 sm:p-2 hover:bg-accent/30 active:bg-accent/50 rounded-lg transition-colors"
          >
            {sidebarOpen ? (
              <X className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            ) : (
              <Menu className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            )}
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <div className="relative">
              <div className="p-1 sm:p-1.5 bg-gradient-to-br from-primary to-accent rounded-md sm:rounded-lg">
                <Radar className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-primary rounded-full border-2 border-card animate-pulse" />
            </div>
            <div className="hidden xs:block">
              <span className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                Live<span className="text-primary">Earth</span>
              </span>
            </div>
          </div>
        </div>

        {/* Center - Stats (hidden on mobile) */}
        <div className="hidden lg:flex items-center gap-5">
          <StatBadge icon={Globe} label="Total" value={flights.length.toLocaleString()} color="text-primary" />
          <div className="h-6 w-px bg-border" />
          <StatBadge icon={Radio} label="In Air" value={activeFlights.toLocaleString()} color="text-accent" />
          <div className="h-6 w-px bg-border" />
          <StatBadge icon={Clock} label="UTC" value={currentTime} color="text-muted-foreground" />
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="h-4 w-4 text-primary" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={`text-xs font-medium ${isConnected ? "text-primary" : "text-muted-foreground"}`}>
              {isConnected ? "Live" : "Connecting..."}
            </span>
          </div>
        </div>

        {/* Mobile mini stats */}
        <div className="flex lg:hidden items-center gap-1.5 text-[10px] sm:text-xs">
          <span className="text-primary font-bold">{flights.length}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-accent font-bold">{activeFlights}</span>
          {isConnected ? (
            <Wifi className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary ml-1" />
          ) : (
            <WifiOff className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground ml-1" />
          )}
        </div>

        {/* Search & Theme Toggle */}
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search flights..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-40 lg:w-48 h-8 sm:h-9 pl-9 bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground focus:ring-primary/50 focus:border-primary/50 rounded-lg text-sm"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAirportSearch(!showAirportSearch)}
            className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg ${showAirportSearch ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-primary hover:bg-accent/30"}`}
            title="Search by Airport"
          >
            <Building2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-primary hover:bg-accent/30 active:bg-accent/50 rounded-lg"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={reconnect}
            disabled={isLoading}
            className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-primary hover:bg-accent/30 active:bg-accent/50 rounded-lg"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {/* Airport Search Panel */}
      {showAirportSearch && (
        <div className="absolute top-12 sm:top-14 right-2 z-[1002] w-72 sm:w-80 bg-card/98 backdrop-blur-xl border border-border rounded-xl shadow-2xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Airport Search
            </h3>
            <button onClick={() => setShowAirportSearch(false)} className="p-1 hover:bg-accent/30 rounded">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ICAO Airport Code</label>
              <Input
                type="text"
                placeholder="e.g. KJFK, EGLL, LFPG"
                value={airportCode}
                onChange={(e) => setAirportCode(e.target.value.toUpperCase())}
                className="h-9 bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground text-sm uppercase"
                maxLength={4}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setAirportSearchType("arrivals")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  airportSearchType === "arrivals"
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                }`}
              >
                <PlaneLanding className="h-3.5 w-3.5" />
                Arrivals
              </button>
              <button
                onClick={() => setAirportSearchType("departures")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  airportSearchType === "departures"
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                }`}
              >
                <PlaneTakeoff className="h-3.5 w-3.5" />
                Departures
              </button>
            </div>
            
            <Button
              onClick={handleAirportSearch}
              disabled={!airportCode.trim() || airportSearchLoading}
              className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {airportSearchLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>
          
          {airportSearchError && (
            <p className="mt-3 text-xs text-destructive">{airportSearchError}</p>
          )}
          
          {airportFlights.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">
                {airportFlights.length} {airportSearchType} found (yesterday)
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {airportFlights.map((af, idx) => (
                  <div
                    key={`${af.icao24}-${idx}`}
                    className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg text-xs"
                  >
                    <Plane className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {af.callsign || af.icao24}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span>{af.estDepartureAirport || "?"}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span>{af.estArrivalAirport || "?"}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(af.lastSeen * 1000).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {!airportSearchLoading && !airportSearchError && airportFlights.length === 0 && airportCode && (
            <p className="mt-3 text-xs text-muted-foreground text-center">
              No results. Try searching for a valid airport code.
            </p>
          )}
        </div>
      )}

      {/* Sidebar - slide from left on mobile */}
      <aside
        className={`absolute top-12 sm:top-14 left-0 bottom-0 z-[1000] bg-card/98 backdrop-blur-xl border-r border-border transition-all duration-300 ${
          sidebarOpen ? "w-64 sm:w-72" : "w-0"
        } overflow-hidden`}
      >
        <div className="h-full flex flex-col w-64 sm:w-72">
          {/* Sidebar Header - Fixed */}
          <div className="flex-shrink-0 p-2 sm:p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs sm:text-sm font-semibold text-foreground">Flight List</h2>
              <span className="text-[10px] sm:text-xs text-muted-foreground">{filteredFlights.length} flights</span>
            </div>
            {/* Mobile Search - always show on sidebar */}
            <div className="relative md:hidden">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-7 sm:h-8 pl-8 bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground rounded-lg text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* Mobile Stats - Fixed */}
          <div className="lg:hidden flex-shrink-0 p-2 sm:p-3 border-b border-border">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <div className="bg-primary/10 rounded-lg p-1.5 sm:p-2 text-center border border-primary/20">
                <Globe className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary mx-auto mb-0.5" />
                <div className="text-xs sm:text-sm font-bold text-foreground">{flights.length.toLocaleString()}</div>
                <div className="text-[8px] sm:text-[9px] text-muted-foreground">Total</div>
              </div>
              <div className="bg-accent/10 rounded-lg p-1.5 sm:p-2 text-center border border-accent/20">
                <Radio className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent mx-auto mb-0.5" />
                <div className="text-xs sm:text-sm font-bold text-foreground">{activeFlights.toLocaleString()}</div>
                <div className="text-[8px] sm:text-[9px] text-muted-foreground">In Air</div>
              </div>
              <div className="bg-muted rounded-lg p-1.5 sm:p-2 text-center border border-border">
                {isConnected ? (
                  <Wifi className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary mx-auto mb-0.5" />
                ) : (
                  <WifiOff className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground mx-auto mb-0.5" />
                )}
                <div className="text-[10px] sm:text-xs font-bold text-foreground">{isConnected ? "Live" : "..."}</div>
                <div className="text-[8px] sm:text-[9px] text-muted-foreground">Status</div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <div className="p-1.5 sm:p-2 space-y-0.5 sm:space-y-1">
              {displayedFlights.map((flight) => (
                <FlightListItem
                  key={flight.icao24}
                  flight={flight}
                  isSelected={selectedFlight?.icao24 === flight.icao24}
                  onClick={() => handleSelectFlight(flight)}
                />
              ))}
              {filteredFlights.length > flightsToShow && (
                <button
                  className="w-full mt-2 py-2 sm:py-2.5 bg-primary/10 hover:bg-primary/20 active:bg-primary/30 border border-primary/20 rounded-lg text-primary text-xs sm:text-sm font-medium transition-colors"
                  onClick={() => setFlightsToShow((n) => n + 50)}
                >
                  Load more flights
                </button>
              )}
              {filteredFlights.length === 0 && (
                <div className="text-center py-4 sm:py-6 text-muted-foreground">
                  <Plane className="h-5 w-5 sm:h-6 sm:w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs sm:text-sm">No flights found</p>
                </div>
              )}
            </div>
          </div>

          {/* Last Update - Fixed at bottom */}
          <div className="flex-shrink-0 p-1.5 sm:p-2 border-t border-border">
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <span className="text-muted-foreground">Last updated</span>
              <span className="text-foreground font-mono">{lastUpdate?.toLocaleTimeString("en-US") || "--:--:--"}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="lg:hidden absolute inset-0 top-12 sm:top-14 bg-black/50 z-[999]"
          onClick={() => setSidebarOpen(false)}
        >
          {/* Floating "Show Map" button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSidebarOpen(false)
            }}
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-full shadow-lg font-medium text-sm active:scale-95 transition-transform"
          >
            <Globe className="h-4 w-4" />
            Show Map
          </button>
        </div>
      )}

      {/* Toggle Sidebar Button - only on desktop */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`hidden lg:flex absolute z-[1001] top-1/2 -translate-y-1/2 bg-card hover:bg-accent/30 border border-border rounded-r-lg p-1.5 transition-all duration-300 ${
          sidebarOpen ? "left-72" : "left-0"
        }`}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Map */}
      <div className={`absolute inset-0 pt-12 sm:pt-14 transition-all duration-300 ${sidebarOpen ? "lg:pl-72" : ""}`}>
        <FlightMap
          flights={debouncedSearch ? filteredFlights : flights}
          selectedFlight={selectedFlight}
          onSelectFlight={handleSelectFlight}
          theme={theme === "dark" ? "dark" : "light"}
        />
      </div>

      {/* Map Controls - smaller on mobile */}
      <div
        className={`absolute top-16 sm:top-[4.5rem] z-[1000] flex flex-col gap-1 sm:gap-1.5 transition-all duration-300 ${
          sidebarOpen ? "lg:left-[19rem] left-2" : "left-2"
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9 bg-card/90 border border-border text-muted-foreground hover:text-primary hover:bg-accent/30 active:bg-accent/50 rounded-lg shadow-lg"
        >
          <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>

      {/* Flight Panel */}
      {selectedFlight && <FlightPanel flight={selectedFlight} onClose={() => setSelectedFlight(null)} />}
    </div>
  )
}

const StatBadge = memo(function StatBadge({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-sm font-bold text-foreground font-mono">{value}</div>
      </div>
    </div>
  )
})
