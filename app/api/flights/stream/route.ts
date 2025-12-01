import type { NextRequest } from "next/server"

// Vercel config
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Cache for fallback
let cachedData: any = { states: [], time: Date.now() / 1000 }

function getUserPass(prefix = ""): { username?: string; password?: string } {
  const username = process.env[`OPENSKY_USERNAME${prefix}` as any] || process.env[`NEXT_PUBLIC_OPENSKY_USERNAME${prefix}` as any]
  const password = process.env[`OPENSKY_PASSWORD${prefix}` as any] || process.env[`NEXT_PUBLIC_OPENSKY_PASSWORD${prefix}` as any]
  return { username, password }
}

function buildBasicAuthHeader(username?: string, password?: string): Record<string, string> | undefined {
  if (!username || !password) return undefined
  const encoded = Buffer.from(`${username}:${password}`).toString("base64")
  return { Authorization: `Basic ${encoded}` }
}

function buildHeaders(stage: 0 | 1 | 2) {
  // 0: anonymous, 1: primary basic, 2: secondary basic
  const base: Record<string, string> = { Accept: "application/json" }
  if (stage === 1) {
    const { username, password } = getUserPass("")
    return { ...base, ...(buildBasicAuthHeader(username, password) || {}) }
  }
  if (stage === 2) {
    const { username, password } = getUserPass("1")
    return { ...base, ...(buildBasicAuthHeader(username, password) || {}) }
  }
  return base
}

// Fetch with timeout
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

async function fetchFlights() {
  try {
    // Try anonymous first
    let headers = buildHeaders(0)
    let response = await fetchWithTimeout(
      "https://opensky-network.org/api/states/all",
      { headers, cache: "no-store" },
      8000
    )

    // If rate-limited, try primary basic
    if (response.status === 429 || response.status === 403) {
      headers = buildHeaders(1)
      response = await fetchWithTimeout(
        "https://opensky-network.org/api/states/all",
        { headers, cache: "no-store" },
        7000
      )
    }

    // If still rate-limited, try secondary basic
    if (response.status === 429 || response.status === 403) {
      headers = buildHeaders(2)
      response = await fetchWithTimeout(
        "https://opensky-network.org/api/states/all",
        { headers, cache: "no-store" },
        7000
      )
    }

    if (!response.ok) {
      console.log("OpenSky API returned:", response.status)
      return cachedData
    }
    
    const data = await response.json()
    // Lọc các state có latitude/longitude hợp lệ
    const filteredStates = (data.states || []).filter(
      (raw: any[]) =>
        typeof raw[5] === "number" &&
        typeof raw[6] === "number" &&
        !isNaN(raw[5]) &&
        !isNaN(raw[6])
    )
    
    const result = { ...data, states: filteredStates }
    cachedData = result // Update cache
    return result
  } catch (error: any) {
    console.error("Fetch flights error:", error.message)
    return cachedData // Return cached data on error
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendData = async () => {
        try {
          const data = await fetchFlights()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch (error) {
          console.error("SSE error:", error)
        }
      }

      await sendData()

      const interval = setInterval(sendData, 15000)

      request.signal.addEventListener("abort", () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
