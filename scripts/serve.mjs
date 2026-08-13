import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const HOST = process.env.HOST || "127.0.0.1";
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = createServer(async function handle(request, response) {
  try {
    const requestUrl = new URL(request.url || "/", "http://" + HOST);
    const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
    let target = path.resolve(ROOT, relative || "index.html");

    if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
      respond(response, 403, "Forbidden");
      return;
    }

    const details = await stat(target);

    if (details.isDirectory()) {
      target = path.join(target, "index.html");
    }

    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    respond(response, 404, "Not found");
  }
});

server.listen(PORT, HOST, function listening() {
  console.log("Open Work Index: http://" + HOST + ":" + PORT);
});

function respond(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
