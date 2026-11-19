import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.TEST_PORT || 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: "./tests",
    timeout: 45_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [["list"]],
    use: {
        baseURL: BASE_URL,
        // Usa el Chrome instalado en el sistema: no hace falta
        // descargar los navegadores de Playwright.
        channel: "chrome",
        headless: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    },
    webServer: {
        command: "node tests/server.mjs",
        url: `${BASE_URL}/index.html`,
        reuseExistingServer: true,
        timeout: 20_000
    }
});
