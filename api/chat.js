import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT MAESTRO FINAL ULTRA ROBUSTO
// =====================================================
const systemPrompt = `
Eres un simulador clínico tipo ECOE.

Tu comportamiento depende del MODO actual.

====================================================
🧠 PRIORIDADES (ORDEN OBLIGATORIO)
====================================================

1. CONVERSACIÓN PREVIA (historial)
2. CASO CLÍNICO
3. REGLAS

👉 Si algo está en la conversación, debes recordarlo.
👉 Está PROHIBIDO decir "no lo recuerdo" si aparece en el historial.

====================================================
🧠 MEMORIA
====================================================

La conversación es REAL.

Puedes y debes:
- Recordar nombres (ej: "Fran")
- Recordar lo que se ha dicho
- Mantener coherencia

IMPORTANTE:
- Esto NO es información clínica
- Es memoria conversacional

====================================================
🧠 INFORMACIÓN CLÍNICA
====================================================

- SOLO usar datos del caso
- NO inventar síntomas, pruebas o antecedentes
- NO añadir información nueva

✔️ Puedes:
- Reformular lenguaje
- Explicar con palabras naturales

====================================================
❗ PREGUNTAS FUERA DEL CASO
====================================================

Si NO está en el caso:
- "No me han comentado nada de eso"
- "No lo recuerdo bien"
- "No me han hecho esa prueba"

⚠️ EXCEPCIÓN:
Si es sobre la conversación → SÍ responder

====================================================
🎭 MODO PACIENTE
====================================================

- Eres el paciente
- Lenguaje natural
- No médico
- No ayudas activamente
- No razonas clínicamente

🧠 SOBRE DIAGNÓSTICOS:
- NO confirmas
- NO niegas

✔️ Respuestas:
- "Ah vale doctor"
- "¿Eso es grave?"
- "¿Tiene solución?"

====================================================
🧠 MODO TUTOR
====================================================

Evalúa al alumno usando:
- Su diagnóstico
- TODO el historial

Estructura obligatoria:

1. 🧾 Juicio global
2. 🧠 Razonamiento
3. 🔍 Aciertos
4. ❌ Errores
5. ⚠️ Errores graves
6. 💡 Qué faltó

- SOLO usar FEEDBACK del caso
- NO usar conocimiento externo

====================================================
💊 MODO TRATAMIENTO
====================================================

1. 📌 Situación clínica
2. 🧠 Indicación
3. 💊 Tratamiento
4. 🔄 Alternativas
5. 📈 Seguimiento

- SOLO usar TRATAMIENTO del caso
`;

// =====================================================
// 📂 CARGAR CASO
// =====================================================
function cargarCaso(caso) {
  try {
    const filePath = path.join(process.cwd(), "data", "casos", `${caso}.md`);
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error("Error cargando caso:", error);
    return null;
  }
}

// =====================================================
// ✂️ EXTRAER SECCIÓN
// =====================================================
function extraerSeccion(markdown, seccion) {
  const regex = new RegExp(
    `##\\s*${seccion}\\b([\\s\\S]*?)(?=##\\s|$)`,
    "i"
  );
  const match = markdown.match(regex);
  return match ? match[1].trim() : "";
}

// =====================================================
// 🧠 DETECCIÓN DE DIAGNÓSTICO
// =====================================================
function detectarDiagnostico(texto) {
  const t = texto.toLowerCase().trim();

  if (t.includes("?")) return false;

  const patrones = [
    "diagnóstico",
    "diagnostico",
    "creo que",
    "se trata de",
    "probablemente",
    "compatible con",
    "lo más probable es",
  ];

  return patrones.some((p) => t.includes(p));
}

// =====================================================
// 🧠 CONSTRUIR PROMPT
// =====================================================
function construirPrompt({ modo, contenido, historial, mensaje }) {
  return `
CONVERSACIÓN PREVIA:
${historial || "Sin conversación previa"}

----------------------------------------

CASO:
${contenido}

----------------------------------------

MODO:
${modo}

----------------------------------------

MENSAJE DEL MÉDICO:
${mensaje}

----------------------------------------

INSTRUCCIÓN FINAL:
${
  modo === "paciente"
    ? "Responde como paciente realista usando la conversación."
    : modo === "tutor"
    ? "Da feedback clínico estructurado usando historial."
    : "Explica el tratamiento de forma estructurada."
}
`;
}

// =====================================================
// 🚀 HANDLER PRINCIPAL
// =====================================================
export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo, historial } = req.body;

    if (!mensaje || !caso) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    let modoActual = modo || "paciente";

    // 🔥 AUTO CAMBIO A TUTOR
    if (modoActual === "paciente" && detectarDiagnostico(mensaje)) {
      modoActual = "tutor";
    }

    const casoMarkdown = cargarCaso(caso);

    if (!casoMarkdown) {
      return res.status(500).json({ error: "Caso no encontrado" });
    }

    let contenido = "";

    if (modoActual === "paciente") {
      contenido = extraerSeccion(casoMarkdown, "ROLEPLAY");
    } else if (modoActual === "tutor") {
      contenido = extraerSeccion(casoMarkdown, "FEEDBACK");
    } else if (modoActual === "tratamiento") {
      contenido = extraerSeccion(casoMarkdown, "TRATAMIENTO");
    }

    if (!contenido) contenido = casoMarkdown;

    const promptUsuario = construirPrompt({
      modo: modoActual,
      contenido,
      historial,
      mensaje,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${process.env.OPENAI_API_KEY}\`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: promptUsuario },
        ],
        temperature: 0.2,
      }),
    });

    const data = await response.json();

    const reply =
      data.choices?.[0]?.message?.content ||
      "No sabría decirle exactamente.";

    return res.status(200).json({
      reply,
      tipo: modoActual,
    });
  } catch (error) {
    console.error("Error en API:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
