import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { supabaseConfig } from "./assets/supabase-config.js";

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const TABLE = "inscripciones_coro_infantil";

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------

const loginSection = document.getElementById("login-section");
const dashboardSection = document.getElementById("dashboard-section");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const responsesBody = document.getElementById("responsesBody");
const tableFooter = document.getElementById("tableFooter");
const searchInput = document.getElementById("searchInput");

const filters = {
    slot: document.getElementById("filterSlot"),
    rehearsal: document.getElementById("filterRehearsal"),
    experience: document.getElementById("filterExperience")
};

const detailModal = document.getElementById("detailModal");
const detailBody = document.getElementById("detailBody");
const detailClose = document.getElementById("detailClose");

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

let allData = [];
let displayedData = [];
let hasLoaded = false;

const EXPERIENCE_LABELS = {
    true: "Sí",
    false: "No"
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" sin desfases de zona horaria.
function formatBirthDate(value) {
    if (!value) return "-";
    const parts = String(value).split("-");
    if (parts.length !== 3) return value;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}

function experienceLabel(value) {
    return value ? "Sí" : "No";
}

function badge(value) {
    return value
        ? '<span class="badge badge-yes">Sí</span>'
        : '<span class="badge badge-no">No</span>';
}

function uniqueValues(key) {
    return Array.from(new Set(allData.map((row) => row[key]).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es")
    );
}

function fillSelect(select, values, placeholder) {
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
    select.value = values.includes(current) ? current : "";
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

function showLogin() {
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
}

function showDashboard() {
    loginSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
}

async function enterDashboard() {
    showDashboard();
    await loadData();
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.style.display = "none";
    loginBtn.disabled = true;
    loginBtn.textContent = "Entrando…";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";

    if (error) {
        loginError.textContent = "Credenciales incorrectas o usuario no encontrado.";
        loginError.style.display = "block";
    }
});

logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    allData = [];
    displayedData = [];
    hasLoaded = false;
    responsesBody.innerHTML = "";
    tableFooter.textContent = "";
    showLogin();
});

supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        enterDashboard();
    } else {
        showLogin();
    }
});

supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
        enterDashboard();
    } else if (event === "SIGNED_OUT") {
        showLogin();
    }
});

// ---------------------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------------------

async function loadData() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Cargando…";

    const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });

    refreshBtn.disabled = false;
    refreshBtn.textContent = "Actualizar";

    if (error) {
        console.error("Error al cargar las inscripciones:", error);
        responsesBody.innerHTML =
            '<tr><td colspan="14" class="empty-state">No se han podido cargar las inscripciones. ' +
            "Revisa la conexión e inténtalo de nuevo.</td></tr>";
        tableFooter.textContent = "";
        return;
    }

    allData = data || [];
    hasLoaded = true;

    fillSelect(filters.slot, uniqueValues("audition_slot"), "Todas");
    fillSelect(filters.rehearsal, uniqueValues("rehearsal_availability"), "Todas");
    filters.experience.innerHTML =
        '<option value="">Todas</option><option value="si">Sí</option><option value="no">No</option>';

    applyFilters();
}

refreshBtn.addEventListener("click", loadData);

// ---------------------------------------------------------------------------
// Filtros y tabla
// ---------------------------------------------------------------------------

function matchesFilters(row) {
    const search = searchInput.value.trim().toLowerCase();

    if (search) {
        const haystack = [
            row.guardian_name,
            row.child_name,
            row.guardian_email,
            row.guardian_phone,
            row.emergency_phone
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        if (!haystack.includes(search)) return false;
    }

    if (filters.slot.value && row.audition_slot !== filters.slot.value) return false;
    if (filters.rehearsal.value && row.rehearsal_availability !== filters.rehearsal.value) return false;

    if (filters.experience.value) {
        const wanted = filters.experience.value === "si";
        if (Boolean(row.choir_experience) !== wanted) return false;
    }

    return true;
}

function shortCell(value, fallback = "-") {
    const text = value || fallback;
    return `<td class="cell-clip${value ? "" : " cell-empty"}" title="${escapeHtml(text)}">${escapeHtml(text)}</td>`;
}

function renderTable() {
    if (!displayedData.length) {
        responsesBody.innerHTML =
            '<tr><td colspan="14" class="empty-state">' +
            (allData.length
                ? "Ninguna inscripción coincide con los filtros."
                : "Todavía no hay inscripciones registradas.") +
            "</td></tr>";
        tableFooter.textContent = allData.length
            ? `Mostrando 0 de ${allData.length} inscripciones.`
            : "";
        return;
    }

    responsesBody.innerHTML = displayedData
        .map(
            (row) => `
            <tr data-id="${escapeHtml(row.id)}">
                <td>${escapeHtml(formatDateTime(row.created_at))}</td>
                ${shortCell(row.guardian_name)}
                ${shortCell(row.guardian_relationship)}
                ${shortCell(row.guardian_phone)}
                ${shortCell(row.guardian_email)}
                ${shortCell(row.child_name)}
                <td>${escapeHtml(formatBirthDate(row.birth_date))}</td>
                <td>${escapeHtml(row.child_age)}</td>
                <td>${badge(row.choir_experience)}</td>
                ${shortCell(row.audition_slot)}
                ${shortCell(row.rehearsal_availability)}
                <td>${badge(row.authorization_accepted)}</td>
                <td>${badge(row.data_protection_accepted)}</td>
                <td><button class="btn btn-secondary btn-detail" data-id="${escapeHtml(row.id)}">Ver</button></td>
            </tr>`
        )
        .join("");

    tableFooter.textContent = `Mostrando ${displayedData.length} de ${allData.length} inscripciones.`;
}

function applyFilters() {
    displayedData = allData.filter(matchesFilters);
    renderTable();
}

searchInput.addEventListener("input", applyFilters);
filters.slot.addEventListener("change", applyFilters);
filters.rehearsal.addEventListener("change", applyFilters);
filters.experience.addEventListener("change", applyFilters);

document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    searchInput.value = "";
    filters.slot.value = "";
    filters.rehearsal.value = "";
    filters.experience.value = "";
    applyFilters();
});

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

function openDetail(id) {
    const row = allData.find((item) => String(item.id) === String(id));
    if (!row) return;

    const fields = [
        ["Fecha de inscripción", formatDateTime(row.created_at)],
        ["Adulto responsable", row.guardian_name],
        ["Parentesco", row.guardian_relationship],
        ["Teléfono de contacto", row.guardian_phone],
        ["Correo electrónico", row.guardian_email],
        ["Teléfono de emergencia", row.emergency_phone || "No indicado"],
        ["Aspirante", row.child_name],
        ["Fecha de nacimiento", formatBirthDate(row.birth_date)],
        ["Edad", `${row.child_age} años`],
        ["Experiencia previa en coro", experienceLabel(row.choir_experience)],
        ["Estudios musicales", row.musical_background],
        ["Alergias / condiciones médicas", row.medical_notes || "Ninguna indicada"],
        ["Franja de audición", row.audition_slot],
        ["Disponibilidad de ensayos", row.rehearsal_availability],
        ["Autorización de participación", row.authorization_accepted ? "Aceptada" : "No aceptada"],
        ["Protección de datos", row.data_protection_accepted ? "Aceptada" : "No aceptada"]
    ];

    detailBody.innerHTML = fields
        .map(
            ([label, value]) => `
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value ?? "-")}</dd>`
        )
        .join("");

    detailModal.classList.remove("hidden");
}

function closeDetail() {
    detailModal.classList.add("hidden");
}

responsesBody.addEventListener("click", (event) => {
    const button = event.target.closest(".btn-detail");
    if (button) {
        openDetail(button.dataset.id);
        return;
    }

    const row = event.target.closest("tr[data-id]");
    if (row) openDetail(row.dataset.id);
});

detailClose.addEventListener("click", closeDetail);
detailModal.addEventListener("click", (event) => {
    if (event.target === detailModal) closeDetail();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !detailModal.classList.contains("hidden")) {
        closeDetail();
    }
});

// ---------------------------------------------------------------------------
// Exportaciones
// ---------------------------------------------------------------------------

const EXPORT_HEADERS = [
    "Fecha de inscripción",
    "Adulto responsable",
    "Parentesco",
    "Teléfono",
    "Email",
    "Teléfono de emergencia",
    "Aspirante",
    "Fecha de nacimiento",
    "Edad",
    "Experiencia previa",
    "Estudios musicales",
    "Alergias / condiciones",
    "Franja de audición",
    "Disponibilidad de ensayos",
    "Autorización",
    "Protección de datos"
];

function rowToArray(row) {
    return [
        formatDateTime(row.created_at),
        row.guardian_name || "",
        row.guardian_relationship || "",
        row.guardian_phone || "",
        row.guardian_email || "",
        row.emergency_phone || "",
        row.child_name || "",
        formatBirthDate(row.birth_date),
        row.child_age ?? "",
        experienceLabel(row.choir_experience),
        row.musical_background || "",
        row.medical_notes || "",
        row.audition_slot || "",
        row.rehearsal_availability || "",
        row.authorization_accepted ? "Sí" : "No",
        row.data_protection_accepted ? "Sí" : "No"
    ];
}

function exportFileName(extension) {
    const now = new Date();
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
    return `inscripciones_coro_infantil_${stamp}.${extension}`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportCsv() {
    if (!displayedData.length) return;

    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
        EXPORT_HEADERS.map(escapeCsv).join(";"),
        ...displayedData.map((row) => rowToArray(row).map(escapeCsv).join(";"))
    ];

    // BOM para que Excel reconozca los acentos.
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, exportFileName("csv"));
}

async function exportExcel() {
    if (!displayedData.length || typeof ExcelJS === "undefined") return;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OCGC";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Inscripciones");
    sheet.addRow(EXPORT_HEADERS);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1A1E26" }
    };

    displayedData.forEach((row) => sheet.addRow(rowToArray(row)));

    sheet.columns.forEach((column, index) => {
        const longest = Math.max(
            String(EXPORT_HEADERS[index] || "").length,
            ...displayedData.map((row) => String(rowToArray(row)[index] ?? "").length)
        );
        column.width = Math.min(Math.max(longest + 2, 12), 45);
    });

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
        new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }),
        exportFileName("xlsx")
    );
}

function exportPdf() {
    if (!displayedData.length || !window.jspdf) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(14);
    doc.text("Inscripciones · Coro Infantil OCGC (El Señor de los Anillos)", 14, 14);
    doc.setFontSize(9);
    doc.text(`Generado el ${formatDateTime(new Date().toISOString())}`, 14, 20);

    doc.autoTable({
        startY: 24,
        head: [[
            "Fecha",
            "Adulto",
            "Teléfono",
            "Aspirante",
            "Nacimiento",
            "Edad",
            "Franja",
            "Ensayos"
        ]],
        body: displayedData.map((row) => [
            formatDateTime(row.created_at),
            row.guardian_name || "-",
            row.guardian_phone || "-",
            row.child_name || "-",
            formatBirthDate(row.birth_date),
            row.child_age ?? "-",
            row.audition_slot || "-",
            row.rehearsal_availability || "-"
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [26, 30, 38], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        margin: { left: 14, right: 14 }
    });

    doc.save(exportFileName("pdf"));
}

document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);
document.getElementById("exportPdfBtn").addEventListener("click", exportPdf);
