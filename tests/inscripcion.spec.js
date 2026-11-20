import { test, expect } from "@playwright/test";
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadLocalEnv } from "./helpers/env.mjs";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

// Carga SUPABASE_DB_URL desde .env si no está ya en el entorno.
loadLocalEnv();

// Para el test de integración real hace falta una cadena de conexión a la
// base de datos de Supabase (rol postgres). Si no está definida (o sigue
// teniendo los valores de ejemplo), el test de envío real se omite y solo
// se ejecutan las validaciones del formulario.
const DB_URL = (process.env.SUPABASE_DB_URL || "").trim();

const PLACEHOLDER_PATTERN =
    /TU_REF|TU_PASSWORD|TU_REGION|TU-PROYECTO|\bREF\b|\bPASSWORD\b|\bREGION\b/i;
const DB_URL_IS_PLACEHOLDER = PLACEHOLDER_PATTERN.test(DB_URL);

// Si la configuración de Supabase aún tiene placeholders, el cliente no se
// puede crear y el formulario no envía: los tests que dependen de eso se omiten.
const SUPABASE_CONFIG_IS_PLACEHOLDER = /PLACEHOLDER/.test(
    readFileSync(resolve(import.meta.dirname, "../assets/supabase-config.js"), "utf8")
);

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const TEST_PREFIX = "E2E TEST";
const GUARDIAN_NAME = `${TEST_PREFIX} Adulto ${RUN_ID}`;
const GUARDIAN2_NAME = `${TEST_PREFIX} Adulto 2 ${RUN_ID}`;
const CHILD_NAME = `${TEST_PREFIX} Menor ${RUN_ID}`;

let db = null;
let dbSkipReason = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
    if (!DB_URL) {
        dbSkipReason = "SUPABASE_DB_URL no está definida.";
    } else if (DB_URL_IS_PLACEHOLDER) {
        dbSkipReason =
            "SUPABASE_DB_URL todavía contiene los valores de ejemplo (REF / PASSWORD / REGION). " +
            "Sustitúyelos por los datos reales del proyecto.";
    } else {
        const client = new pg.Client({
            connectionString: DB_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10_000,
            query_timeout: 10_000,
            statement_timeout: 10_000
        });

        try {
            await client.connect();
            db = client;
        } catch (error) {
            dbSkipReason = `no se pudo conectar a la base de datos (${error.code || error.message}).`;
            await client.end().catch(() => {});
        }
    }

    if (dbSkipReason) {
        console.warn(`\n[tests] Envío real desactivado: ${dbSkipReason}\n`);
    }
});

test.afterAll(async () => {
    if (!db) return;

    try {
        // Limpieza defensiva por si un test falló antes de borrar su fila.
        await db.query(
            "delete from public.inscripciones_coro_infantil where child_name like $1",
            [`${TEST_PREFIX}%`]
        );
    } catch (error) {
        console.warn(`[tests] No se pudo limpiar la base de datos: ${error.message}`);
    } finally {
        await db.end().catch(() => {});
        db = null;
    }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("1. la inscripción se envía y se guarda correctamente en Supabase", async ({ page }) => {
    test.skip(
        !db,
        `Test de envío real omitido: ${dbSkipReason} ` +
        "Consulta el README (sección Tests) para configurarlo."
    );

    await page.goto("/index.html");

    await page.locator('input[name="familyType"][value="dos_progenitores"]').check();
    await page.locator("#guardianName").fill(GUARDIAN_NAME);
    await page.locator('input[name="guardianRelationship"][value="Madre"]').check();
    await page.locator("#guardianPhone").fill("600 123 456");
    await page.locator("#guardianEmail").fill("e2e@example.com");

    // Segundo progenitor o tutor legal.
    await page.locator("#guardian2Name").fill(GUARDIAN2_NAME);
    await page.locator('input[name="guardian2Relationship"][value="Padre"]').check();
    await page.locator("#guardian2Phone").fill("600 654 321");
    await page.locator("#guardian2Email").fill("e2e2@example.com");

    // El teléfono de emergencia se deja vacío a propósito (debe guardarse NULL).
    await page.locator("#childName").fill(CHILD_NAME);
    await page.locator("#birthDate").fill("2015-05-20");
    await page.locator("#birthDate").dispatchEvent("change");

    // La edad debe autocompletarse con la edad a fecha de audición.
    await expect(page.locator("#childAge")).toHaveValue("11");

    await page.locator('input[name="choirExperience"][value="si"]').check();
    await page.locator("#musicalBackground").fill("Solfeo, 3 años");
    await page.locator("#medicalNotes").fill("Ninguna");
    await page.locator('input[name="auditionSlot"][value="De 17:00 a 18:00h"]').check();
    await page
        .locator('input[name="rehearsalAvailability"][value="Sí, total disponibilidad"]')
        .check();
    await page.locator("#authorization").check();
    await page.locator("#dataProtection").check();

    await page.locator("#submitBtn").click();

    // Redirección a la página de confirmación.
    await page.waitForURL("**/thank-you.html", { timeout: 20_000 });
    await expect(page.locator(".thank-you-title")).toContainText("Inscripción recibida");

    // Verificación en la base de datos.
    const { rows } = await db.query(
        `select *,
                to_char(birth_date, 'YYYY-MM-DD') as birth_date_text
           from public.inscripciones_coro_infantil
          where child_name = $1`,
        [CHILD_NAME]
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];

    expect(row.guardian_name).toBe(GUARDIAN_NAME);
    expect(row.guardian_relationship).toBe("Madre");
    expect(row.guardian_phone).toBe("600 123 456");
    expect(row.guardian_email).toBe("e2e@example.com");
    expect(row.guardian2_name).toBe(GUARDIAN2_NAME);
    expect(row.guardian2_relationship).toBe("Padre");
    expect(row.guardian2_phone).toBe("600 654 321");
    expect(row.guardian2_email).toBe("e2e2@example.com");
    // El tipo de familia solo controla el formulario: no se almacena.
    expect(row).not.toHaveProperty("family_type");
    expect(row.emergency_phone).toBeNull();
    expect(row.birth_date_text).toBe("2015-05-20");
    expect(row.child_age).toBe(11);
    expect(row.choir_experience).toBe(true);
    expect(row.musical_background).toBe("Solfeo, 3 años");
    expect(row.medical_notes).toBe("Ninguna");
    expect(row.audition_slot).toBe("De 17:00 a 18:00h");
    expect(row.rehearsal_availability).toBe("Sí, total disponibilidad");
    expect(row.authorization_accepted).toBe(true);
    expect(row.data_protection_accepted).toBe(true);
    expect(row.created_at).toBeInstanceOf(Date);

    // No debe haberse duplicado la inscripción.
    const count = await db.query(
        "select count(*)::int as total from public.inscripciones_coro_infantil where child_name = $1",
        [CHILD_NAME]
    );
    expect(count.rows[0].total).toBe(1);

    // Limpieza inmediata de la fila de prueba.
    await db.query("delete from public.inscripciones_coro_infantil where id = $1", [row.id]);

    const afterDelete = await db.query(
        "select count(*)::int as total from public.inscripciones_coro_infantil where id = $1",
        [row.id]
    );
    expect(afterDelete.rows[0].total).toBe(0);
});

test("2. el formulario vacío no se puede enviar", async ({ page }) => {
    await page.goto("/index.html");

    await page.locator("#submitBtn").click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/index\.html/);

    const validity = await page.evaluate(() => {
        const form = document.getElementById("registrationForm");
        return {
            formValid: form.checkValidity(),
            guardianMissing: document.getElementById("guardianName").validity.valueMissing,
            familyMissing: document.querySelector('input[name="familyType"]').validity.valueMissing,
            childMissing: document.getElementById("childName").validity.valueMissing,
            ageMissing: document.getElementById("childAge").validity.valueMissing,
            relationshipMissing: document.querySelector(
                'input[name="guardianRelationship"]'
            ).validity.valueMissing,
            authorizationMissing: document.getElementById("authorization").validity.valueMissing
        };
    });

    expect(validity.formValid).toBe(false);
    expect(validity.guardianMissing).toBe(true);
    expect(validity.familyMissing).toBe(true);
    expect(validity.childMissing).toBe(true);
    expect(validity.ageMissing).toBe(true);
    expect(validity.relationshipMissing).toBe(true);
    expect(validity.authorizationMissing).toBe(true);
});

test("3. la edad se calcula, avisa fuera de rango y se puede corregir", async ({ page }) => {
    await page.goto("/index.html");

    const birthDate = page.locator("#birthDate");
    const age = page.locator("#childAge");
    const note = page.locator("#ageNote");

    // Fecha válida: 11 años a 10/12/2026.
    await birthDate.fill("2015-05-20");
    await birthDate.dispatchEvent("change");
    await expect(age).toHaveValue("11");
    await expect(note).not.toHaveClass(/is-warning/);

    // Demasiado joven (5 años a fecha de audición).
    await birthDate.fill("2021-01-01");
    await birthDate.dispatchEvent("change");
    await expect(age).toHaveValue("");
    await expect(note).toHaveClass(/is-warning/);
    await expect(note).toContainText("fuera del rango");

    // Demasiado mayor (21 años).
    await birthDate.fill("2005-01-01");
    await birthDate.dispatchEvent("change");
    await expect(age).toHaveValue("");
    await expect(note).toHaveClass(/is-warning/);

    // Edad editable: se puede corregir manualmente.
    await birthDate.fill("2015-05-20");
    await birthDate.dispatchEvent("change");
    await age.selectOption("10");
    await expect(age).toHaveValue("10");
    await expect(note).toHaveClass(/is-warning/);
    await expect(note).toContainText("no coincide");

    // Al volver a la edad calculada, el aviso desaparece.
    await age.selectOption("11");
    await expect(note).not.toHaveClass(/is-warning/);

    // El atributo max impide fechas futuras.
    const max = await birthDate.getAttribute("max");
    expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("4. los teléfonos demasiado cortos se rechazan", async ({ page }) => {
    await page.goto("/index.html");

    const phone = page.locator("#guardianPhone");
    await phone.fill("123");
    await page.locator("#guardianName").click(); // provoca blur

    const validation = await phone.evaluate((input) => ({
        valid: input.checkValidity(),
        message: input.validationMessage
    }));

    expect(validation.valid).toBe(false);
    expect(validation.message).toContain("9 dígitos");

    // Al corregirlo, deja de ser inválido.
    await phone.fill("600 123 456");
    await phone.evaluate((input) => input.blur());
    expect(await phone.evaluate((input) => input.checkValidity())).toBe(true);
});

test("5. la página de agradecimiento muestra la información de la audición", async ({ page }) => {
    await page.goto("/thank-you.html");

    await expect(page.locator(".thank-you-title")).toContainText("Inscripción recibida");
    await expect(page.locator(".thank-you-box")).toContainText("10 de diciembre");
    await expect(page.locator(".thank-you-box")).toContainText("IES La Isleta");
});

test("6. el selector familiar muestra y valida los datos del segundo progenitor", async ({ page }) => {
    await page.goto("/index.html");

    const secondBlock = page.locator("#guardian2Block");
    const name2 = page.locator("#guardian2Name");
    const phone2 = page.locator("#guardian2Phone");

    const fieldState = () =>
        page.evaluate(() => ({
            nameDisabled: document.getElementById("guardian2Name").disabled,
            nameRequired: document.getElementById("guardian2Name").required,
            phoneRequired: document.getElementById("guardian2Phone").required,
            allRelationshipsRequired: [...document.querySelectorAll('input[name="guardian2Relationship"]')]
                .every((radio) => radio.required)
        }));

    // Por defecto solo hay un progenitor: el segundo bloque no se ve ni se valida.
    await expect(secondBlock).toBeHidden();
    expect(await fieldState()).toEqual({
        nameDisabled: true,
        nameRequired: false,
        phoneRequired: false,
        allRelationshipsRequired: false
    });

    // Con dos progenitores, el bloque aparece y sus campos pasan a ser obligatorios.
    await page.locator('input[name="familyType"][value="dos_progenitores"]').check();
    await expect(secondBlock).toBeVisible();
    expect(await fieldState()).toEqual({
        nameDisabled: false,
        nameRequired: true,
        phoneRequired: true,
        allRelationshipsRequired: true
    });

    // Un teléfono demasiado corto del segundo adulto también se rechaza.
    await phone2.fill("123");
    await name2.click();
    expect(await phone2.evaluate((input) => input.validationMessage)).toContain("9 dígitos");

    // Al volver a familia monoparental, se oculta y se vacía.
    await name2.fill("Segundo adulto");
    await page.locator('input[name="familyType"][value="monoparental"]').check();
    await expect(secondBlock).toBeHidden();
    expect(await name2.inputValue()).toBe("");
    expect(await fieldState()).toEqual({
        nameDisabled: true,
        nameRequired: false,
        phoneRequired: false,
        allRelationshipsRequired: false
    });
});

test("7. el formulario público no reutiliza la sesión del panel", async ({ page }) => {
    test.skip(
        SUPABASE_CONFIG_IS_PLACEHOLDER,
        "La configuración local de Supabase contiene placeholders."
    );

    // Simula una sesión de administración guardada en este mismo navegador.
    await page.addInitScript(() => {
        window.localStorage.setItem(
            "sb-rgnaqwcgufooizjvrhaw-auth-token",
            JSON.stringify({
                access_token: "fake-admin-token",
                refresh_token: "fake-refresh-token",
                token_type: "bearer",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user: {
                    id: "00000000-0000-0000-0000-000000000000",
                    aud: "authenticated",
                    role: "authenticated",
                    email: "admin@example.com"
                }
            })
        );
    });

    // Se intercepta el envío: solo interesa la cabecera de autorización.
    let headers = null;
    await page.route("**/rest/v1/inscripciones_coro_infantil*", async (route) => {
        headers = route.request().headers();
        await route.abort();
    });

    await page.goto("/index.html");

    await page.locator('input[name="familyType"][value="monoparental"]').check();
    await page.locator("#guardianName").fill(`${TEST_PREFIX} Sesion ${RUN_ID}`);
    await page.locator('input[name="guardianRelationship"][value="Madre"]').check();
    await page.locator("#guardianPhone").fill("600 123 456");
    await page.locator("#guardianEmail").fill("e2e@example.com");
    await page.locator("#childName").fill(`${TEST_PREFIX} Menor sesion ${RUN_ID}`);
    await page.locator("#birthDate").fill("2015-05-20");
    await page.locator("#birthDate").dispatchEvent("change");
    await page.locator('input[name="choirExperience"][value="no"]').check();
    await page.locator("#musicalBackground").fill("Ninguno");
    await page.locator('input[name="auditionSlot"][value="Sin preferencia"]').check();
    await page
        .locator('input[name="rehearsalAvailability"][value="Sí, total disponibilidad"]')
        .check();
    await page.locator("#authorization").check();
    await page.locator("#dataProtection").check();

    await page.locator("#submitBtn").click();
    await expect.poll(() => headers, { timeout: 10_000 }).not.toBeNull();

    // La petición usa la clave anónima, no el token guardado del panel.
    expect(headers.authorization).toBe(`Bearer ${headers.apikey}`);
    expect(headers.authorization).not.toContain("fake-admin-token");
});
