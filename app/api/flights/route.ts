import { NextResponse, NextRequest } from "next/server"

// Vercel serverless config
export const maxDuration = 30 // Tăng timeout lên 30s cho Pro plan, 10s cho Free
export const dynamic = "force-dynamic"

// Token caching
let cachedToken: string | null = null
let tokenExpiry: number = 0

// Cache cho flight data để fallback khi API fail
let cachedFlights: any[] = []
let cacheTime: number = 0
const CACHE_TTL = 60 * 1000 // 1 minute cache

// Fetch with timeout wrapper
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// Retry wrapper
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 2): Promise<Response> {
  let lastError: Error | null = null
  
  for (let i = 0; i <= retries; i++) {
    try {
      // Giảm timeout cho mỗi lần retry
      const timeout = i === 0 ? 8000 : 5000
      return await fetchWithTimeout(url, options, timeout)
    } catch (error: any) {
      lastError = error
      console.log(`Fetch attempt ${i + 1} failed:`, error.message)
      if (i < retries) {
        await new Promise(r => setTimeout(r, 500)) // Wait 500ms before retry
      }
    }
  }
  
  throw lastError
}

async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken
  }

  // Check if credentials are available
  const clientId = process.env.OPENSKY_CLIENT_ID || process.env.NEXT_PUBLIC_OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET || process.env.NEXT_PUBLIC_OPENSKY_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    console.log("OpenSky credentials not configured, using anonymous access")
    return null
  }

  try {
    const params = new URLSearchParams()
    params.append("grant_type", "client_credentials")
    params.append("client_id", clientId)
    params.append("client_secret", clientSecret)
    
    const tokenResp = await fetchWithTimeout(
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      5000 // 5s timeout for token
    )
    
    if (!tokenResp.ok) {
      console.error("Failed to get OpenSky token:", tokenResp.status)
      return null
    }
    
    const tokenData = await tokenResp.json()
    cachedToken = tokenData.access_token
    tokenExpiry = Date.now() + (tokenData.expires_in || 3600) * 1000
    
    return cachedToken
  } catch (error) {
    console.error("Token fetch error:", error)
    return null
  }
}

function mapStateVector(raw: any[]) {
  return {
    icao24: raw[0],
    callsign: (raw[1] || "").trim(),
    originCountry: raw[2],
    timePosition: raw[3],
    lastContact: raw[4],
    longitude: raw[5],
    latitude: raw[6],
    baroAltitude: raw[7],
    onGround: raw[8],
    velocity: raw[9],
    heading: raw[10],
    verticalRate: raw[11],
    sensors: raw[12],
    geoAltitude: raw[13],
    squawk: raw[14],
    spi: raw[15],
    positionSource: raw[16],
    altitude: raw[13] ?? raw[7],
  }
}

function mapAirportFlight(raw: any) {
  return {
    icao24: raw.icao24,
    callsign: (raw.callsign || "").trim(),
    firstSeen: raw.firstSeen,
    lastSeen: raw.lastSeen,
    estDepartureAirport: raw.estDepartureAirport,
    estArrivalAirport: raw.estArrivalAirport,
    estDepartureAirportHorizDistance: raw.estDepartureAirportHorizDistance,
    estDepartureAirportVertDistance: raw.estDepartureAirportVertDistance,
    estArrivalAirportHorizDistance: raw.estArrivalAirportHorizDistance,
    estArrivalAirportVertDistance: raw.estArrivalAirportVertDistance,
    departureAirportCandidatesCount: raw.departureAirportCandidatesCount,
    arrivalAirportCandidatesCount: raw.arrivalAirportCandidatesCount,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") // "all", "arrivals", "departures"
    const airport = searchParams.get("airport") // ICAO airport code
    const begin = searchParams.get("begin") // Unix timestamp
    const end = searchParams.get("end") // Unix timestamp

    const accessToken = await getAccessToken()

    // Handle airport arrivals search
    // Note: OpenSky arrivals/departures API only has historical data (previous day or earlier)
    if (type === "arrivals" && airport) {
      const now = Math.floor(Date.now() / 1000)
      // Use yesterday's data since OpenSky only has historical data
      const yesterday = now - 24 * 3600
      const twoDaysAgo = now - 2 * 24 * 3600
      
      // If provided times are in the future, use historical times instead
      let beginTime = begin ? parseInt(begin) : twoDaysAgo
      let endTime = end ? parseInt(end) : yesterday
      
      // Ensure we're querying historical data (at least 1 day ago)
      if (endTime > yesterday) {
        endTime = yesterday
        beginTime = twoDaysAgo
      }

      console.log(`[Arrivals] airport=${airport}, begin=${beginTime}, end=${endTime}`)

      const headers: Record<string, string> = { Accept: "application/json" }
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      try {
        const resp = await fetchWithRetry(
          `https://opensky-network.org/api/flights/arrival?airport=${airport}&begin=${beginTime}&end=${endTime}`,
          { headers },
          1
        )

        if (!resp.ok) {
          if (resp.status === 404) {
            return NextResponse.json({ flights: [], type: "arrivals", airport, begin: beginTime, end: endTime })
          }
          const errorText = await resp.text()
          console.error("Arrivals API error:", resp.status, errorText)
          return NextResponse.json({ flights: [], type: "arrivals", airport, error: "API error" })
        }

        const data = await resp.json()
        const mappedFlights = (data || []).map(mapAirportFlight)
        return NextResponse.json({ flights: mappedFlights, type: "arrivals", airport, begin: beginTime, end: endTime })
      } catch (err) {
        console.error("Arrivals fetch error:", err)
        return NextResponse.json({ flights: [], type: "arrivals", airport, error: "Network error" })
      }
    }

    // Handle airport departures search
    // Note: OpenSky arrivals/departures API only has historical data (previous day or earlier)
    if (type === "departures" && airport) {
      const now = Math.floor(Date.now() / 1000)
      // Use yesterday's data since OpenSky only has historical data
      const yesterday = now - 24 * 3600
      const twoDaysAgo = now - 2 * 24 * 3600
      
      // If provided times are in the future, use historical times instead
      let beginTime = begin ? parseInt(begin) : twoDaysAgo
      let endTime = end ? parseInt(end) : yesterday
      
      // Ensure we're querying historical data (at least 1 day ago)
      if (endTime > yesterday) {
        endTime = yesterday
        beginTime = twoDaysAgo
      }

      console.log(`[Departures] airport=${airport}, begin=${beginTime}, end=${endTime}`)

      const headers: Record<string, string> = { Accept: "application/json" }
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      try {
        const resp = await fetchWithRetry(
          `https://opensky-network.org/api/flights/departure?airport=${airport}&begin=${beginTime}&end=${endTime}`,
          { headers },
          1
        )

        if (!resp.ok) {
          if (resp.status === 404) {
            return NextResponse.json({ flights: [], type: "departures", airport, begin: beginTime, end: endTime })
          }
          const errorText = await resp.text()
          console.error("Departures API error:", resp.status, errorText)
          return NextResponse.json({ flights: [], type: "departures", airport, error: "API error" })
        }

        const data = await resp.json()
        const mappedFlights = (data || []).map(mapAirportFlight)
        return NextResponse.json({ flights: mappedFlights, type: "departures", airport, begin: beginTime, end: endTime })
      } catch (err) {
        console.error("Departures fetch error:", err)
        return NextResponse.json({ flights: [], type: "departures", airport, error: "Network error" })
      }
    }

    // Default: fetch all flights (state vectors)
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      }
      
      // Add auth header only if we have a token
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      const flightsResp = await fetchWithRetry(
        "https://opensky-network.org/api/states/all",
        { headers },
        2 // 2 retries
      )

      if (!flightsResp.ok) {
        console.error("OpenSky API error:", flightsResp.status)
        // Return cached data if available
        if (cachedFlights.length > 0 && Date.now() - cacheTime < CACHE_TTL * 5) {
          console.log("Returning cached flights due to API error")
          return NextResponse.json({ 
            flights: cachedFlights, 
            time: cacheTime / 1000,
            cached: true 
          })
        }
        return NextResponse.json({ error: "Failed to fetch flights", flights: [] }, { status: 200 })
      }

      const data = await flightsResp.json()
      const mappedFlights = (data.states || [])
        .filter((raw: any[]) => 
          typeof raw[5] === "number" && 
          typeof raw[6] === "number" && 
          !isNaN(raw[5]) && 
          !isNaN(raw[6])
        )
        .map(mapStateVector)
      
      // Update cache
      cachedFlights = mappedFlights
      cacheTime = Date.now()
      
      return NextResponse.json({ flights: mappedFlights, time: data.time })
    } catch (fetchError) {
      console.error("Fetch error:", fetchError)
      
      // Return cached data as fallback
      if (cachedFlights.length > 0) {
        console.log("Returning cached flights due to fetch error")
        return NextResponse.json({ 
          flights: cachedFlights, 
          time: cacheTime / 1000,
          cached: true 
        })
      }
      
      return NextResponse.json({ flights: [], error: "Network error", time: Date.now() / 1000 })
    }
  } catch (error) {
    console.error("Error fetching flight data:", error)
    
    // Return cached data as last resort
    if (cachedFlights.length > 0) {
      return NextResponse.json({ 
        flights: cachedFlights, 
        time: cacheTime / 1000,
        cached: true 
      })
    }
    
    return NextResponse.json({ error: "Internal server error", flights: [] }, { status: 200 })
  }
}
