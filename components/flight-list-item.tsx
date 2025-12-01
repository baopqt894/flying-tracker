"use client"

import { memo } from "react"
import { Plane } from "lucide-react"
import type { Flight } from "@/types/flight"

interface FlightListItemProps {
  flight: Flight
  isSelected: boolean
  onClick: () => void
}

function FlightListItemComponent({ flight, isSelected, onClick }: FlightListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl text-left transition-all duration-200 ${
        isSelected
          ? "bg-primary/20 border border-primary/40 shadow-lg shadow-primary/10"
          : "hover:bg-accent/30 border border-transparent active:bg-accent/50"
      }`}
    >
      <div className={`p-1.5 sm:p-2 rounded-lg ${flight.onGround ? "bg-muted" : "bg-primary/20"}`}>
        <Plane
          className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${flight.onGround ? "text-muted-foreground" : "text-primary"}`}
          style={{ transform: `rotate(${flight.heading || 0}deg)` }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="font-semibold text-foreground text-xs sm:text-sm truncate">{flight.callsign}</span>
          {!flight.onGround && <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary rounded-full animate-pulse" />}
        </div>
        <span className="text-[10px] sm:text-xs text-muted-foreground truncate block">{flight.originCountry}</span>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[10px] sm:text-xs text-foreground font-medium">
          {flight.onGround ? "GND" : `${Math.round((flight.altitude || 0) * 3.281).toLocaleString()} ft`}
        </div>
        <div className="text-[10px] sm:text-xs text-muted-foreground">{Math.round((flight.velocity || 0) * 1.944)} kts</div>
      </div>
    </button>
  )
}

export default memo(FlightListItemComponent)
