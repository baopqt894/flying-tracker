import { NextResponse, NextRequest } from "next/server"

// Token caching
let cachedToken: string | null = null
let tokenExpiry: number = 0

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken
  }

  const params = new URLSearchParams()
  params.append("grant_type", "client_credentials")
  params.append("client_id", process.env.NEXT_PUBLIC_OPENSKY_CLIENT_ID!)
  params.append("client_secret", process.env.NEXT_PUBLIC_OPENSKY_CLIENT_SECRET!)
  
  const tokenResp = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  )
  
  if (!tokenResp.ok) {
    throw new Error("Failed to get OpenSky token")
  }
  
  const tokenData = await tokenResp.json()
  cachedToken = tokenData.access_token
  // Token typically expires in 1 hour
  tokenExpiry = Date.now() + (tokenData.expires_in || 3600) * 1000
  
  return cachedToken!
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

      const resp = await fetch(
        `https://opensky-network.org/api/flights/arrival?airport=${airport}&begin=${beginTime}&end=${endTime}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!resp.ok) {
        // 404 means no flights found for this period - return empty array
        if (resp.status === 404) {
          return NextResponse.json({ flights: [], type: "arrivals", airport, begin: beginTime, end: endTime })
        }
        const errorText = await resp.text()
        console.error("Arrivals API error:", resp.status, errorText)
        return NextResponse.json({ error: "Failed to fetch arrivals", details: errorText }, { status: resp.status })
      }

      const data = await resp.json()
      const mappedFlights = (data || []).map(mapAirportFlight)
      return NextResponse.json({ flights: mappedFlights, type: "arrivals", airport, begin: beginTime, end: endTime })
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

      const resp = await fetch(
        `https://opensky-network.org/api/flights/departure?airport=${airport}&begin=${beginTime}&end=${endTime}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!resp.ok) {
        // 404 means no flights found for this period - return empty array
        if (resp.status === 404) {
          return NextResponse.json({ flights: [], type: "departures", airport, begin: beginTime, end: endTime })
        }
        const errorText = await resp.text()
        console.error("Departures API error:", resp.status, errorText)
        return NextResponse.json({ error: "Failed to fetch departures", details: errorText }, { status: resp.status })
      }

      const data = await resp.json()
      const mappedFlights = (data || []).map(mapAirportFlight)
      return NextResponse.json({ flights: mappedFlights, type: "departures", airport, begin: beginTime, end: endTime })
    }

    // Default: fetch all flights (state vectors)
    const flightsResp = await fetch("https://opensky-network.org/api/states/all", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!flightsResp.ok) {
      return NextResponse.json({ error: "Failed to fetch flights" }, { status: 500 })
    }

    const data = await flightsResp.json()
    const mappedFlights = (data.states || []).map(mapStateVector)
    return NextResponse.json({ flights: mappedFlights, time: data.time })
  } catch (error) {
    console.error("Error fetching flight data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
