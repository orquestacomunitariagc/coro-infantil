import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { supabaseConfig } from "./assets/supabase-config.js";

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const TABLE = "inscripciones_coro_infantil";

// Fecha de referencia para calcular la edad: día de las audiciones.
const AUDITION_DATE = new Date(2026, 11, 10); // 10/12/2026
const AUDITION_DATE_LABEL = "10/12/2026";
const MIN_AGE = 6;
const MAX_AGE = 16;
const MIN_PHONE_DIGITS = 9;

const DEFAULT_AGE_NOTE =
    "Se calcula automáticamente al indicar la fecha de nacimiento (edad a 10/12/2026). " +
    "Puedes corregirla si es necesario.";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// Convierte "YYYY-MM-DD" en una fecha local (evita desfases de zona horaria).
function parseISODate(value) {
    if (!value) return null;

    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    return date;
}

// Edad cumplida en una fecha de referencia.
function ageOn(birthDate, reference) {
    let age = reference.getFullYear() - birthDate.getFullYear();
    const beforeBirthday =
        reference.getMonth() < birthDate.getMonth() ||
        (reference.getMonth() === birthDate.getMonth() && reference.getDate() < birthDate.getDate());

    if (beforeBirthday) age--;
    return age;
}

function countDigits(value) {
    return (value.match(/\d/g) || []).length;
}

function todayISO() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registrationForm");
    if (!form) return;

    const birthDateInput = document.getElementById("birthDate");
    const ageSelect = document.getElementById("childAge");
    const ageNote = document.getElementById("ageNote");
    const guardianPhone = document.getElementById("guardianPhone");
    const emergencyPhone = document.getElementById("emergencyPhone");
    const submitBtn = document.getElementById("submitBtn");
    const formError = document.getElementById("formError");

    const familyTypeRadios = form.querySelectorAll('input[name="familyType"]');
    const guardian2Block = document.getElementById("guardian2Block");
    const guardian2Name = document.getElementById("guardian2Name");
    const guardian2Phone = document.getElementById("guardian2Phone");
    const guardian2Email = document.getElementById("guardian2Email");
    const guardian2RelationshipRadios =
        form.querySelectorAll('input[name="guardian2Relationship"]');
    const guardian2Inputs = [guardian2Name, guardian2Phone, guardian2Email];

    // No se permiten fechas de nacimiento futuras.
    birthDateInput.max = todayISO();

    // -----------------------------------------------------------------------
    // Edad
    // -----------------------------------------------------------------------

    function getComputedAge() {
        const birthDate = parseISODate(birthDateInput.value);
        if (!birthDate) return null;
        return ageOn(birthDate, AUDITION_DATE);
    }

    function setAgeNote(text, isWarning) {
        ageNote.textContent = text;
        ageNote.classList.toggle("is-warning", Boolean(isWarning));
    }

    function handleBirthDateChange() {
        const age = getComputedAge();

        if (age === null) {
            setAgeNote(DEFAULT_AGE_NOTE, false);
            return;
        }

        if (age < MIN_AGE || age > MAX_AGE) {
            ageSelect.value = "";
            setAgeNote(
                `Según la fecha indicada, la edad a ${AUDITION_DATE_LABEL} sería ${age} años, ` +
                `fuera del rango de ${MIN_AGE} a ${MAX_AGE}. Revisa la fecha o selecciona la edad correcta.`,
                true
            );
            return;
        }

        ageSelect.value = String(age);
        setAgeNote(
            `Edad calculada automáticamente a fecha de la audición (${AUDITION_DATE_LABEL}): ` +
            `${age} años. Puedes corregirla si es necesario.`,
            false
        );
    }

    function handleAgeChange() {
        const computed = getComputedAge();
        const selected = ageSelect.value;

        if (computed === null) {
            setAgeNote(DEFAULT_AGE_NOTE, false);
            return;
        }

        if (!selected) {
            setAgeNote(
                `La edad calculada a ${AUDITION_DATE_LABEL} es ${computed} años. Selecciona una edad.`,
                false
            );
            return;
        }

        if (Number(selected) !== computed) {
            setAgeNote(
                `La edad indicada (${selected} años) no coincide con la fecha de nacimiento ` +
                `(${computed} años a ${AUDITION_DATE_LABEL}). Puedes mantenerla si es correcta.`,
                true
            );
            return;
        }

        setAgeNote(
            `Edad calculada automáticamente a fecha de la audición (${AUDITION_DATE_LABEL}): ` +
            `${computed} años.`,
            false
        );
    }

    birthDateInput.addEventListener("change", handleBirthDateChange);
    ageSelect.addEventListener("change", handleAgeChange);

    // -----------------------------------------------------------------------
    // Composición familiar y segundo progenitor/tutor
    // -----------------------------------------------------------------------

    function isTwoGuardiansSelected() {
        return radioValue("familyType") === "dos_progenitores";
    }

    function setGuardian2Visible(visible) {
        guardian2Block.classList.toggle("hidden", !visible);

        [...guardian2Inputs, ...guardian2RelationshipRadios].forEach((input) => {
            input.disabled = !visible;
            input.required = visible;
        });

        if (!visible) {
            guardian2Inputs.forEach((input) => {
                input.value = "";
                input.setCustomValidity("");
            });
            guardian2RelationshipRadios.forEach((input) => {
                input.checked = false;
            });
        }
    }

    familyTypeRadios.forEach((radio) => {
        radio.addEventListener("change", () => setGuardian2Visible(isTwoGuardiansSelected()));
    });

    // Arranca con un solo progenitor/tutor: el segundo bloque permanece oculto
    // y sus campos no se validan ni se envían.
    setGuardian2Visible(false);

    // -----------------------------------------------------------------------
    // Teléfonos
    // -----------------------------------------------------------------------

    function isPhoneRequired(input) {
        if (input === guardian2Phone) return isTwoGuardiansSelected();
        return input === guardianPhone;
    }

    function validatePhone(input, required) {
        input.setCustomValidity("");

        const value = input.value.trim();
        if (!value) {
            if (required) input.setCustomValidity("Introduce un teléfono de contacto.");
            return;
        }

        if (countDigits(value) < MIN_PHONE_DIGITS) {
            input.setCustomValidity(
                `Introduce un teléfono válido (al menos ${MIN_PHONE_DIGITS} dígitos).`
            );
        }
    }

    [guardianPhone, emergencyPhone, guardian2Phone].forEach((input) => {
        input.addEventListener("input", () => input.setCustomValidity(""));
        input.addEventListener("blur", () => validatePhone(input, isPhoneRequired(input)));
    });

    // -----------------------------------------------------------------------
    // Mensajes de error
    // -----------------------------------------------------------------------

    function showError(message) {
        formError.textContent = message;
        formError.classList.remove("hidden");
        formError.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function hideError() {
        formError.textContent = "";
        formError.classList.add("hidden");
    }

    function setSubmitting(isSubmitting) {
        submitBtn.disabled = isSubmitting;
        submitBtn.textContent = isSubmitting ? "Enviando…" : "Enviar inscripción";
    }

    function radioValue(name) {
        const checked = form.querySelector(`input[name="${name}"]:checked`);
        return checked ? checked.value : "";
    }

    // -----------------------------------------------------------------------
    // Envío
    // -----------------------------------------------------------------------

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideError();

        validatePhone(guardianPhone, true);
        validatePhone(emergencyPhone, false);
        validatePhone(guardian2Phone, isTwoGuardiansSelected());

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const twoGuardians = isTwoGuardiansSelected();

        // El tipo de familia solo controla qué campos se muestran: no se guarda.
        const payload = {
            guardian_name: document.getElementById("guardianName").value.trim(),
            guardian_relationship: radioValue("guardianRelationship"),
            guardian_phone: guardianPhone.value.trim(),
            guardian_email: document.getElementById("guardianEmail").value.trim(),
            guardian2_name: twoGuardians ? guardian2Name.value.trim() : null,
            guardian2_relationship: twoGuardians ? radioValue("guardian2Relationship") : null,
            guardian2_phone: twoGuardians ? guardian2Phone.value.trim() : null,
            guardian2_email: twoGuardians ? guardian2Email.value.trim() : null,
            emergency_phone: emergencyPhone.value.trim() || null,

            child_name: document.getElementById("childName").value.trim(),
            birth_date: birthDateInput.value,
            child_age: Number(ageSelect.value),
            choir_experience: radioValue("choirExperience") === "si",
            musical_background: document.getElementById("musicalBackground").value.trim(),
            medical_notes: document.getElementById("medicalNotes").value.trim() || null,

            audition_slot: radioValue("auditionSlot"),
            rehearsal_availability: radioValue("rehearsalAvailability"),

            authorization_accepted: document.getElementById("authorization").checked,
            data_protection_accepted: document.getElementById("dataProtection").checked
        };

        setSubmitting(true);

        try {
            const { error } = await supabase.from(TABLE).insert(payload);

            if (error) {
                console.error("Error al guardar la inscripción:", error);
                showError(
                    "No hemos podido registrar la inscripción. Inténtalo de nuevo en unos minutos. " +
                    "Si el problema continúa, escríbenos indicando el error."
                );
                setSubmitting(false);
                return;
            }

            window.location.href = "thank-you.html";
        } catch (error) {
            console.error("Error de conexión al guardar la inscripción:", error);
            showError(
                "No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."
            );
            setSubmitting(false);
        }
    });
});
