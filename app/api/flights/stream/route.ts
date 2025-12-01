import type { NextRequest } from "next/server"

async function fetchFlights() {
  try {
    const response = await fetch("https://opensky-network.org/api/states/all", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!response.ok) return { states: [], time: Date.now() / 1000 }
    const data = await response.json()
    // Lọc các state có latitude/longitude hợp lệ
    const filteredStates = (data.states || []).filter(
      (raw: any[]) =>
        typeof raw[5] === "number" &&
        typeof raw[6] === "number" &&
        !isNaN(raw[5]) &&
        !isNaN(raw[6])
    )
    return { ...data, states: filteredStates }
  } catch {
    return { states: [], time: Date.now() / 1000 }
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
