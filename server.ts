import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Endpoint 1: iTunes Search API proxy for original song audio previews (Israeli + International catalog)
  const previewCache = new Map<
    string,
    {
      previewUrl: string | null;
      trackName?: string;
      artistName?: string;
      artworkUrl?: string;
    }
  >();

  async function searchItunesCatalog(term: string, country: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        term
      )}&country=${country}&media=music&entity=song&limit=5`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data: any = await response.json();
      if (!Array.isArray(data?.results)) return null;
      return data.results.find((r: any) => Boolean(r.previewUrl)) || null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  app.get("/api/itunes-preview", async (req, res) => {
    const term = String(req.query.term || "").trim();
    if (!term) {
      res.status(400).json({ error: "Missing search term" });
      return;
    }

    if (previewCache.has(term)) {
      res.json(previewCache.get(term));
      return;
    }

    try {
      let match = await searchItunesCatalog(term, "IL");
      if (!match) {
        match = await searchItunesCatalog(term, "US");
      }

      const result = {
        previewUrl: match?.previewUrl || null,
        trackName: match?.trackName,
        artistName: match?.artistName,
        artworkUrl: match?.artworkUrl100
          ? String(match.artworkUrl100).replace("100x100bb", "300x300bb")
          : undefined,
      };
      if (result.previewUrl) {
        previewCache.set(term, result);
      }
      res.json(result);
    } catch {
      res.json({ previewUrl: null });
    }
  });

  // Endpoint 2: Audio stream proxy for original song previews
  app.get("/api/audio-proxy", async (req, res) => {
    const targetUrl = String(req.query.url || "").trim();
    if (
      !targetUrl ||
      !/^https:\/\/[a-z0-9.-]*itunes\.apple\.com\//i.test(targetUrl)
    ) {
      res.status(400).send("Invalid audio URL");
      return;
    }
    try {
      const upstream = await fetch(targetUrl);
      if (!upstream.ok || !upstream.body) {
        res.status(502).send("Upstream audio error");
        return;
      }
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "audio/mp4"
      );
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=86400");
      const arrayBuffer = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(500).send("Failed to proxy audio");
    }
  });

  // Endpoint 3: Discover / Import multiple songs by artist or genre from iTunes Israel
  app.get("/api/itunes-discover", async (req, res) => {
    const term = String(req.query.term || "").trim();
    const limit = Math.min(25, Math.max(5, Number(req.query.limit) || 15));
    if (!term) {
      res.status(400).json({ error: "Missing search term" });
      return;
    }

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        term
      )}&country=IL&media=music&entity=song&limit=${limit}`;
      const response = await fetch(url);
      if (!response.ok) {
        res.json({ tracks: [] });
        return;
      }
      const data: any = await response.json();
      const tracks = (Array.isArray(data?.results) ? data.results : [])
        .filter((r: any) =>
          Boolean(r.previewUrl && r.trackName && r.artistName)
        )
        .map((r: any) => ({
          trackId: String(r.trackId),
          title: String(r.trackName),
          artist: String(r.artistName),
          year: r.releaseDate ? new Date(r.releaseDate).getFullYear() : 2024,
          previewUrl: `/api/audio-proxy?url=${encodeURIComponent(
            r.previewUrl
          )}`,
          artworkUrl: r.artworkUrl100
            ? String(r.artworkUrl100).replace("100x100bb", "300x300bb")
            : undefined,
        }));
      res.json({ tracks });
    } catch {
      res.json({ tracks: [] });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BeatQuiz Server running on http://localhost:${PORT}`);
  });
}

startServer();
