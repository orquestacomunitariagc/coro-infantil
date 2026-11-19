// Servidor estático mínimo para los tests (sin dependencias externas).
// También sirve para probar el formulario en local con `npm start`.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.TEST_PORT || process.env.PORT || 4173);
const host = "127.0.0.1";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8"
};

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, `http://${host}:${port}`);
        let pathname = decodeURIComponent(url.pathname);

        if (pathname === "/") pathname = "/index.html";

        const filePath = resolve(join(root, normalize(pathname)));

        // Evita salir de la carpeta del proyecto.
        if (filePath !== root && !filePath.startsWith(root + sep)) {
            response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Forbidden");
            return;
        }

        const info = await stat(filePath).catch(() => null);
        if (!info || !info.isFile()) {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Not found");
            return;
        }

        const data = await readFile(filePath);
        response.writeHead(200, {
            "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        response.end(data);
    } catch (error) {
        console.error("Error sirviendo la petición:", error);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Server error");
    }
});

server.listen(port, host, () => {
    console.log(`Servidor de pruebas: http://${host}:${port}`);
});
