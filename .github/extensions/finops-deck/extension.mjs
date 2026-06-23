// Extension: finops-deck
// Serves the static "FinOps for Agentic Coding" slide deck (the repo's docs/ folder)
// over a loopback HTTP server so it can be opened as a GitHub Copilot canvas.
// Read-only static file server — no telemetry, no external network.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join, extname, normalize } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

const HERE = dirname(fileURLToPath(import.meta.url));

// Deck root: env override, else the repo's docs/ (this file lives at
// <repo>/.github/extensions/finops-deck/, so docs/ is three levels up).
const DECK_DIR = resolve(process.env.FINOPS_DECK_DIR || join(HERE, "..", "..", "..", "docs"));

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

const servers = new Map(); // instanceId -> { server, url }

function resolveRequestPath(urlPath) {
    let p = decodeURIComponent((urlPath || "/").split("?")[0].split("#")[0]);
    if (p === "/" || p === "") p = "/index.html";
    const full = normalize(join(DECK_DIR, p));
    if (full !== DECK_DIR && !full.startsWith(DECK_DIR + "/")) return null;
    return full;
}

async function startServer() {
    const server = createServer(async (req, res) => {
        try {
            const full = resolveRequestPath(req.url);
            if (!full) {
                res.statusCode = 403;
                res.end("Forbidden");
                return;
            }
            const info = await stat(full).catch(() => null);
            if (!info || !info.isFile()) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end("Not found: " + req.url);
                return;
            }
            const body = await readFile(full);
            res.setHeader("Content-Type", TYPES[extname(full).toLowerCase()] || "application/octet-stream");
            res.setHeader("Cache-Control", "no-store");
            res.end(body);
        } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Deck server error: " + (err && err.message ? err.message : String(err)));
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "finops-deck",
            displayName: "FinOps deck",
            description: "The 'FinOps for Agentic Coding' minimalist slide deck. Arrow keys / on-screen nav to move between slides.",
            actions: [
                {
                    name: "goto",
                    description: "Get a deep-link URL to a specific slide id (e.g. 'cover', 's05-lifecycle-loop'). Re-open the canvas with the returned url to land on that slide.",
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        if (!entry) throw new CanvasError("not_open", "Deck canvas is not open.");
                        const slide = (ctx.input && ctx.input.slide) ? String(ctx.input.slide) : "cover";
                        return { ok: true, url: `${entry.url}#${slide}` };
                    },
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer();
                    servers.set(ctx.instanceId, entry);
                }
                const slide = (ctx.input && ctx.input.slide) ? `#${String(ctx.input.slide)}` : "";
                return { title: "FinOps for Agentic Coding", url: entry.url + slide };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
