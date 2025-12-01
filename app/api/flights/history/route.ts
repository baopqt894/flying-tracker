import { NextResponse, NextRequest } from "next/server"

// Token caching (primary/secondary)
let tokenCache: Record<"primary" | "secondary", { token: string | null; expiry: number }> = {
  primary: { token: null, expiry: 0 },
  secondary: { token: null, expiry: 0 },
}

function getEnvPair(which: "primary" | "secondary") {
  const suffix = which === "secondary" ? "1" : ""
  const clientId = process.env[`OPENSKY_CLIENT_ID${suffix}` as any] || process.env[`NEXT_PUBLIC_OPENSKY_CLIENT_ID${suffix}` as any]
  const clientSecret = process.env[`OPENSKY_CLIENT_SECRET${suffix}` as any] || process.env[`NEXT_PUBLIC_OPENSKY_CLIENT_SECRET${suffix}` as any]
  return { clientId, clientSecret }
}

async function fetchToken(which: "primary" | "secondary"): Promise<string | null> {
  const { clientId, clientSecret } = getEnvPair(which)
  if (!clientId || !clientSecret) return null

  const cached = tokenCache[which]
  if (cached.token && Date.now() < cached.expiry - 5 * 60 * 1000) return cached.token

  const params = new URLSearchParams()
  params.append("grant_type", "client_credentials")
  params.append("client_id", clientId!)
  params.append("client_secret", clientSecret!)

  const resp = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  )
  if (!resp.ok) return null
  const data = await resp.json()
  tokenCache[which] = { token: data.access_token, expiry: Date.now() + (data.expires_in || 3600) * 1000 }
  return tokenCache[which].token
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

    // Try primary token first; fallback to secondary on 401/403/429
    let accessToken = await fetchToken("primary")
    if (!accessToken) accessToken = await fetchToken("secondary")

    const now = Math.floor(Date.now() / 1000)
    const beginTime = begin ? parseInt(begin) : now - 2 * 24 * 3600
    const endTime = end ? parseInt(end) : now

    const doRequest = async (token: string | null) => {
      const headers: Record<string, string> = { Accept: "application/json" }
      if (token) headers.Authorization = `Bearer ${token}`
      return fetch(
        `https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${beginTime}&end=${endTime}`,
        { headers }
      )
    }

    let resp = await doRequest(accessToken)

    if (resp.status === 401 || resp.status === 403 || resp.status === 429) {
      // retry with secondary token
      const secondary = await fetchToken("secondary")
      if (secondary && secondary !== accessToken) {
        resp = await doRequest(secondary)
      }
    }

    if (!resp.ok) {
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
