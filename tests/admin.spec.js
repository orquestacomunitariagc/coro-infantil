import { test, expect } from "@playwright/test";

// El panel de administración necesita una sesión real de Supabase. Para poder
// comprobar el renderizado sin credenciales, se sustituye el módulo de
// Supabase por un doble de prueba que devuelve filas fijas.

const ROWS = [
    {
        id: "11111111-1111-1111-1111-111111111111",
        created_at: "2026-11-20T10:00:00.000Z",
        guardian_name: "Adulto Uno",
        guardian_relationship: "Madre",
        guardian_phone: "600 111 222",
        guardian_email: "uno@example.com",
        guardian2_name: "Adulto Dos",
        guardian2_relationship: "Padre",
        guardian2_phone: "600 333 444",
        guardian2_email: "dos@example.com",
        emergency_phone: "600 555 666",
        child_name: "Menor de Prueba",
        birth_date: "2015-05-20",
        child_age: 11,
        choir_experience: true,
        musical_background: "Solfeo",
        medical_notes: null,
        audition_slot: "Sin preferencia",
        rehearsal_availability: "Sí, total disponibilidad",
        authorization_accepted: true,
        data_protection_accepted: true
    },
    {
        id: "22222222-2222-2222-2222-222222222222",
        created_at: "2026-11-20T09:00:00.000Z",
        guardian_name: "Adulto Solo",
        guardian_relationship: "Tutor/a legal",
        guardian_phone: "600 777 888",
        guardian_email: "solo@example.com",
        guardian2_name: null,
        guardian2_relationship: null,
        guardian2_phone: null,
        guardian2_email: null,
        emergency_phone: null,
        child_name: "Otro Menor",
        birth_date: "2016-01-15",
        child_age: 10,
        choir_experience: false,
        musical_background: "Ninguno",
        medical_notes: "Ninguna",
        audition_slot: "De 17:00 a 18:00h",
        rehearsal_availability: "Depende de otras actividades",
        authorization_accepted: true,
        data_protection_accepted: true
    }
];

const SUPABASE_STUB = `
export function createClient() {
    return {
        auth: {
            getSession: async () => ({ data: { session: { user: { email: "admin@example.com" } } } }),
            onAuthStateChange: () => {},
            signOut: async () => {},
            signInWithPassword: async () => ({ error: null })
        },
        from: () => ({
            select: () => ({
                order: async () => ({ data: ${JSON.stringify(ROWS)}, error: null })
            })
        })
    };
}
`;

test.beforeEach(async ({ page }) => {
    await page.route("https://esm.sh/**", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/javascript",
            body: SUPABASE_STUB
        })
    );
});

test("el panel muestra los datos de los dos progenitores en la tabla", async ({ page }) => {
    await page.goto("/admin.html");

    const row = page.locator('#responsesBody tr[data-id="11111111-1111-1111-1111-111111111111"]');

    await expect(row).toContainText("Adulto Uno");
    await expect(row).toContainText("Adulto Dos");
    await expect(row).toContainText("Madre");
    await expect(row).toContainText("Padre");
    await expect(row).toContainText("600 111 222");
    await expect(row).toContainText("600 333 444");
    await expect(row).toContainText("uno@example.com");
    await expect(row).toContainText("dos@example.com");
});

test("el detalle muestra los datos completos de ambos progenitores", async ({ page }) => {
    await page.goto("/admin.html");

    const row = page.locator('#responsesBody tr[data-id="11111111-1111-1111-1111-111111111111"]');
    await row.locator(".btn-detail").click();

    const detail = page.locator("#detailBody");
    await expect(detail).toContainText("Segundo adulto responsable");
    await expect(detail).toContainText("Adulto Dos");
    await expect(detail).toContainText("600 333 444");
    await expect(detail).toContainText("dos@example.com");
    await expect(detail).toContainText("600 555 666");
});

test("una inscripción con un solo progenitor no muestra datos del segundo", async ({ page }) => {
    await page.goto("/admin.html");

    const row = page.locator('#responsesBody tr[data-id="22222222-2222-2222-2222-222222222222"]');
    await row.locator(".btn-detail").click();

    const detail = page.locator("#detailBody");
    await expect(detail).toContainText("Adulto Solo");
    await expect(detail).not.toContainText("Segundo adulto responsable");
});

test("la exportación a PDF incluye los dos progenitores", async ({ page }) => {
    await page.goto("/admin.html");
    await expect(page.locator("#responsesBody tr").first()).toBeVisible();

    const hasPdf = await page.evaluate(() => Boolean(window.jspdf));
    test.skip(!hasPdf, "jsPDF no está disponible (CDN no cargada).");

    // Se intercepta la tabla que se envía al PDF para poder inspeccionarla.
    await page.evaluate(() => {
        const Original = window.jspdf.jsPDF;
        window.__pdfBody = null;
        window.jspdf.jsPDF = function (...args) {
            const doc = new Original(...args);
            const originalAutoTable = doc.autoTable.bind(doc);
            doc.autoTable = (options) => {
                window.__pdfBody = options.body;
                return originalAutoTable(options);
            };
            doc.save = () => {};
            return doc;
        };
    });

    await page.locator("#exportPdfBtn").click();
    await expect.poll(() => page.evaluate(() => Boolean(window.__pdfBody))).toBe(true);

    const body = await page.evaluate(() => window.__pdfBody);
    const row = body.map((cells) => cells.join(" | ")).find((text) => text.includes("Menor de Prueba"));

    expect(row).toContain("Adulto Uno");
    expect(row).toContain("Adulto Dos");
    expect(row).toContain("600 111 222");
    expect(row).toContain("600 333 444");
    expect(row).toContain("uno@example.com");
    expect(row).toContain("dos@example.com");
});
