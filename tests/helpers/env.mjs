// Carga variables desde el archivo .env local sin dependencias.
// Solo se lee coro_infantil/.env, para que el proyecto funcione igual
// cuando se publique como repositorio independiente.
// Nunca sobrescribe variables ya definidas en el entorno.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CANDIDATES = [
    resolve(import.meta.dirname, "../../.env")
];

export function loadLocalEnv() {
    for (const file of CANDIDATES) {
        if (!existsSync(file)) continue;

        const content = readFileSync(file, "utf8");

        for (const line of content.split(/\r?\n/)) {
            const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (!match) continue;

            const [, key, rawValue] = match;
            if (process.env[key]) continue;

            const value = rawValue
                .replace(/^["']|["']$/g, "")
                .trim();

            if (value) process.env[key] = value;
        }
    }
}
