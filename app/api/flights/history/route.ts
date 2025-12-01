import { NextResponse, NextRequest } from "next/server"

// Token caching (shared logic with parent route)
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

function mapFlightHistory(raw: any) {
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
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const icao24 = searchParams.get("icao24")
    const begin = searchParams.get("begin")
    const end = searchParams.get("end")

    if (!icao24) {
      return NextResponse.json({ error: "icao24 parameter required" }, { status: 400 })
    }

    const accessToken = await getAccessToken()

    const now = Math.floor(Date.now() / 1000)
    const beginTime = begin ? parseInt(begin) : now - 2 * 24 * 3600 // Default: last 2 days
    const endTime = end ? parseInt(end) : now

    const resp = await fetch(
      `https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${beginTime}&end=${endTime}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!resp.ok) {
      // OpenSky sometimes returns 404 for aircraft with no history
      if (resp.status === 404) {
        return NextResponse.json({ flights: [], icao24 })
      }
      const errorText = await resp.text()
      console.error("Flight history API error:", errorText)
      return NextResponse.json({ error: "Failed to fetch flight history", details: errorText }, { status: resp.status })
    }

    const data = await resp.json()
    const mappedFlights = (data || []).map(mapFlightHistory)
    return NextResponse.json({ flights: mappedFlights, icao24 })
  } catch (error) {
    console.error("Error fetching flight history:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
