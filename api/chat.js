import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT MAESTRO DEFINITIVO (ARREGLADO)
// =====================================================
const systemPrompt = `
Eres un simulador clínico avanzado tipo ECOE.

Tu comportamiento depende del MODO en el que te encuentres.

====================================================
🧠 PRINCIPIOS DE FUNCIONAMIENTO
====================================================

- La información clínica debe basarse exclusivamente en el CASO proporcionado.
- No debes añadir datos clínicos nuevos (síntomas, antecedentes, pruebas).
- No debes inventar información médica.

⚠️ PERO:
Puedes expresar la información del caso de forma NATURAL:
- Reformular síntomas
- Usar lenguaje cotidiano
- Explicar sensaciones

👉 Esto NO es inventar.

----------------------------------------------------
🧠 MEMORIA Y CONVERSACIÓN
----------------------------------------------------

- Debes recordar TODO lo que el médico diga en la conversación.
- Puedes recordar nombres, contexto y preguntas previas.

IMPORTANTE:
- Esto NO es información clínica → es conversación.
- NO digas "no lo recuerdo" si sí está en el historial.

Ejemplo:
Si el médico dice "soy Fran" → puedes recordarlo después.

----------------------------------------------------
⚠️ DIFERENCIA CLAVE
----------------------------------------------------

- Información clínica → SOLO del caso
- Información conversacional → del historial

Puedes usar ambas.

----------------------------------------------------
Si te preguntan algo que NO está en el caso:

Responde de forma realista:
- "No me han comentado nada de eso"
- "No lo recuerdo bien"
- "No me han hecho esa prueba"

====================================================
🎭 MODO PACIENTE
====================================================

OBJETIVO: Simulación realista

- Eres el paciente
- Lenguaje natural (NO médico)
- Respuestas cortas–medias
- SOLO respondes a lo que te preguntan
- NO ayudas activamente
- NO interpretas pruebas
- NO haces razonamiento clínico

----------------------------------------------------
🧠 SOBRE EL DIAGNÓSTICO DEL MÉDICO
----------------------------------------------------

- NO confirmas ni niegas diagnósticos
- NO das opinión médica

Respuestas correctas:
- "Ah… vale doctor"
- "¿Eso es grave?"
- "¿Y eso qué significa?"
- "¿Tiene solución?"

Respuestas prohibidas:
- "Sí, es eso"
- "No, no es eso"

====================================================
🧠 MODO TUTOR
====================================================

OBJETIVO: Feedback clínico

Estructura obligatoria:

1. 🧾 Juicio global
2. 🧠 Razonamiento
3. 🔍 Aciertos
4. ❌ Errores
5. ⚠️ Errores graves
6. 💡 Qué faltó

- Usa SOLO el FEEDBACK del caso
- Usa el HISTORIAL
- No inventes contenido externo

====================================================
💊 MODO TRATAMIENTO
====================================================

1. 📌 Situación clínica
2. 🧠 Indicación
3. 💊 Tratamiento
4. 🔄 Alternativas
5. 📈 Seguimiento

- SOLO usar TRATAMIENTO
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
// ✂️ EXTRAER SECCIONES
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
    "impresiona de",
    "compatible con",
    "lo más probable es",
    "diría que",
    "esto es un",
  ];

  return patrones.some((p) => t.includes(p));
}

// =====================================================
// 🧠 CONSTRUIR PROMPT
// =====================================================
function construirPrompt({ modo, contenido, historial, mensaje }) {
  return `
HISTORIAL:
${historial || "Sin historial"}

----------------------------------------

CASO:
${contenido}

----------------------------------------

MODO:
${modo}

----------------------------------------

MENSAJE:
${mensaje}

----------------------------------------

INSTRUCCIÓN:
${
  modo === "paciente"
    ? "Responde como paciente realista."
    : modo === "tutor"
    ? "Da feedback clínico completo."
    : "Explica tratamiento."
}
`;
}

// =====================================================
// 🚀 HANDLER
// =====================================================
export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo, historial } = req.body;

    if (!mensaje || !caso) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    let modoActual = modo || "paciente";

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
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
      tipo:
        modoActual === "tutor"
          ? "tutor"
          : modoActual === "tratamiento"
          ? "tratamiento"
          : "paciente",
    });
  } catch (error) {
    console.error("Error en API:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
