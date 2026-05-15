const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    if (url.pathname === "/scores" && request.method === "GET") {
      return json({ scores: await loadScores(env, Number(url.searchParams.get("limit")) || 5) });
    }

    if (url.pathname === "/scores" && request.method === "POST") {
      const payload = await request.json().catch(() => null);
      const entry = normalizeEntry(payload);
      if (!entry) return json({ error: "Invalid score entry" }, 400);

      const scores = await loadScores(env, 50);
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score || a.time - b.time);
      await env.SCORES.put("leaderboard", JSON.stringify(scores.slice(0, 50)));
      return json({ ok: true, scores: scores.slice(0, 5) });
    }

    return json({ error: "Not found" }, 404);
  }
};

async function loadScores(env, limit) {
  const raw = await env.SCORES.get("leaderboard");
  const scores = raw ? JSON.parse(raw) : [];
  return Array.isArray(scores) ? scores.slice(0, Math.max(1, Math.min(limit, 50))) : [];
}

function normalizeEntry(payload) {
  if (!payload || typeof payload !== "object") return null;
  const playerId = String(payload.playerId || "PLAYER1").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 16) || "PLAYER1";
  const score = Math.max(0, Math.min(Number(payload.score) || 0, 999999));
  const time = Math.max(0, Math.min(Number(payload.time) || 0, 9999));
  const defeated = Math.max(0, Math.min(Number(payload.defeated) || 0, 999));
  const result = payload.result === "victory" ? "victory" : "gameOver";
  return { playerId, score, time, defeated, result, date: new Date().toISOString().slice(0, 10) };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}
