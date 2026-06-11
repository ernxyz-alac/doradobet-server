import { Database } from "bun:sqlite";

const db = new Database("matches.sqlite", { create: true });
// Use a composite key of id and company to track data uniquely per integration
db.run("CREATE TABLE IF NOT EXISTS matches (id TEXT, company TEXT, data TEXT, PRIMARY KEY (id, company))");

const MAIN_GAME_URL = "https://sb2frontend-altenar2.biahosted.com/api/widget/GetEventDetails?culture=es-ES&timezoneOffset=300&deviceType=1&numFormat=en-GB&countryCode=PE&integration="
const GAME_SCORE_URL = "https://sb2frontend-altenar2.biahosted.com/api/widget/GetEventTrackerInfo?culture=es-ES&timezoneOffset=300&deviceType=1&numFormat=en-GB&countryCode=PE&integration="

export const getUrls = (currentGameId: string, companyName: string = "ecuabet") => {
    return {
        main: `${MAIN_GAME_URL}${companyName}&eventId=${currentGameId}`,
        gameScore: `${GAME_SCORE_URL}${companyName}&eventId=${currentGameId}`,
    }
}

const isDataEmpty = (data: any) => {
    // A match is "empty" if the name is missing or empty, or if there are no competitors
    return !data || !data.name || (Array.isArray(data.competitors) && data.competitors.length === 0);
}

export const flow = async (currentGameId: string, companyName: string) => {
    const { main, gameScore } = getUrls(currentGameId, companyName)
    const resp = await fetch(main)
    const gameData: any = await resp.json()

    // If API returns empty data, try to retrieve from DB using both ID and Company
    if (isDataEmpty(gameData)) {
        const row: any = db.query("SELECT data FROM matches WHERE id = ? AND company = ?").get(currentGameId, companyName);
        if (row) {
            return JSON.parse(row.data);
        }
        // If not in DB and empty from API, return empty structure
        return {
            name: "",
            time: "",
            odds: "",
            score: "",
        }
    }

    // Build the data object
    const requiredData = {
        name: gameData.name || "",
        time: gameData.liveTime || "",
        odds: gameData.odds?.slice(0, 3).map((odd: any) => (`${odd.name} -> ${odd.price}`)).join("\n") || "",
        score: "",
    }

    const competitorIds = (gameData.competitors || []).map((competitor: any) => ({ id: competitor.id, name: competitor.name }))

    try {
        const scoreResp = await fetch(gameScore)
        const scoreData: any = await scoreResp.json()
        const scoreEvent = scoreData.events?.[0]

        const competitorOrder = scoreEvent?.competitorIds ?? competitorIds.map((c: any) => c.id)
        const competitorScore = scoreEvent?.score

        if (scoreEvent?.liveTime) {
            requiredData.time = scoreEvent.liveTime
        }

        requiredData.score = competitorOrder.map((id: number, index: number) => {
            const competitor = competitorIds.find((c: any) => c.id === id)
            const score = competitorScore?.[index] ?? 0

            return `${competitor?.name} -> ${score}`
          }).join(", ")
    } catch (e) {
        console.error("Error fetching score data:", e);
    }

    // Persist if we have valid data, indexed by ID and Company
    if (requiredData.name) {
        db.run("INSERT OR REPLACE INTO matches (id, company, data) VALUES (?, ?, ?)", [currentGameId, companyName, JSON.stringify(requiredData)]);
    }

    return requiredData
}

Bun.serve({
    port: 9001,
    async fetch(request) {
        const url = new URL(request.url);

        // Define CORS headers
        const headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // Handle OPTIONS request for CORS
        if (request.method === "OPTIONS") {
            return new Response(null, { headers });
        }

        // API route
        if (url.pathname === "/data") {
            const gameId = url.searchParams.get("gameId");
            const companyName = url.searchParams.get("companyName");

            if (!gameId) {
                return Response.json({ error: "Missing or invalid gameId" }, { status: 400, headers });
            }
            try {
                const data = await flow(gameId, companyName || "ecuabet");
                return Response.json(data, { headers });
            } catch (error) {
                console.error("Error in /data endpoint:", error);
                return Response.json(
                    { error: "Failed to fetch data" },
                    { status: 500, headers }
                );
            }
        }

        // Default serve
        return new Response("Server is running", { status: 200, headers });
    },
});

console.log('Server running on port', 9001)
