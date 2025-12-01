"use client"

import { Plane, Radar } from "lucide-react"

export default function Loading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-accent/5 rounded-full blur-3xl" />
      </div>
      
      <div className="flex flex-col items-center gap-6 relative z-10">
        {/* Animated radar/plane icon */}
        <div className="relative">
          {/* Outer pulse rings */}
          <div className="absolute inset-0 -m-8">
            <div className="absolute inset-0 border border-primary/10 rounded-full animate-ping" style={{ animationDuration: "2s" }} />
          </div>
          <div className="absolute inset-0 -m-4">
            <div className="absolute inset-0 border border-primary/20 rounded-full animate-ping" style={{ animationDuration: "1.5s", animationDelay: "0.5s" }} />
          </div>
          
          {/* Main icon container */}
          <div className="p-5 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-xl shadow-primary/20">
            <div className="relative">
              <Radar className="h-10 w-10 sm:h-14 sm:w-14 text-primary-foreground" />
              {/* Scanning line animation */}
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"
                style={{ transform: "rotate(-45deg)" }}
              />
            </div>
          </div>
          
          {/* Orbiting plane */}
          <div 
            className="absolute -inset-6"
            style={{
              animation: "spin 4s linear infinite",
            }}
          >
            <Plane className="h-5 w-5 text-primary absolute -top-1 left-1/2 -translate-x-1/2" 
                   style={{ transform: "translateX(-50%) rotate(90deg)" }} />
          </div>
        </div>
        
        {/* Text content */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Live<span className="text-primary">Earth</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xs">
            Initializing real-time flight tracker...
          </p>
        </div>
        
        {/* Loading progress dots */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: `${i * 100}ms`, animationDuration: "0.8s" }}
              />
            ))}
          </div>
        </div>
        
        {/* Loading status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
          <div className="w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span>Connecting to flight data...</span>
        </div>
      </div>
    </div>
  )
}
