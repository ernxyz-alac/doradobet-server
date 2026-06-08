const MAIN_GAME_URL = "https://sb2frontend-altenar2.biahosted.com/api/widget/GetEventDetails?culture=es-ES&timezoneOffset=-60&integration=doradobet&deviceType=1&numFormat=en-GB&countryCode=AT&eventId="
const GAME_SCORE_URL = "https://sb2frontend-altenar2.biahosted.com/api/widget/GetEventTrackerInfo?culture=es-ES&timezoneOffset=300&integration=doradobet&deviceType=1&numFormat=en-GB&countryCode=PE&eventId="

export const getUrls = (currentGameId: number) => {
    return {
        main: `${MAIN_GAME_URL}${currentGameId}`,
        gameScore: `${GAME_SCORE_URL}${currentGameId}`,
    }
}

export const flow = async (currentGameId: number) => {
    const { main, gameScore } = getUrls(currentGameId)
    const resp = await fetch(main)
    const gameData: any = await resp.json()

    const requiredData = {
        name: gameData.name,
        time: gameData.liveTime,
        odds: gameData.odds.slice(0, 3).map((odd: any) => (`${odd.name} -> ${odd.price}`)).join("\n"),
        score: "",
    }

    const competitorIds = gameData.competitors.map((competitor: any) => ({ id: competitor.id, name: competitor.name }))

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

    return requiredData
}

Bun.serve({
    port: 9001,
    async fetch(request) {
        const url = new URL(request.url);
        
        // API route
        if (url.pathname === "/data") {
            const gameId = parseInt(url.searchParams.get("gameId") ?? "0");
            if (!gameId) {
                 return Response.json({ error: "Missing or invalid gameId" }, { status: 400 });
            }
            try {
                const data = await flow(gameId);
                return Response.json(data);
            } catch (error) {
                console.error("Error in /data endpoint:", error);
                return Response.json(
                    { error: "Failed to fetch data" },
                    { status: 500 }
                );
            }
        }
        
        // Default serve
        return new Response("Server is running", { status: 200 });
    },
});

console.log('Server running on port', 9001)
