import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT MAESTRO DEFINITIVO (3 MODOS REALES)
// =====================================================
const systemPrompt = `
Eres un simulador clínico avanzado tipo ECOE.

Tu comportamiento depende del MODO en el que te encuentres:

====================================================
🧠 PRINCIPIOS DE FUNCIONAMIENTO
====================================================

- La información clínica debe basarse exclusivamente en el CASO proporcionado, aunque con margen interpretativo que concuerde con los datos del caso.
- No debes añadir datos clínicos nuevos que no estén presentes en el caso.
- No debes introducir pruebas, hallazgos o antecedentes no descritos.

⚠️ IMPORTANTE:
Puedes expresar la información del caso de forma NATURAL y FLEXIBLE:
- Reformular síntomas con lenguaje cotidiano
- Explicar sensaciones con tus propias palabras
- Variar la forma de describir lo mismo

Ejemplo:
- "dolor en fosa ilíaca derecha" → "me duele aquí abajo a la derecha"
- "inicio periumbilical" → "empezó por el centro de la barriga"

👉 Esto NO se considera inventar.

Si el alumno pregunta algo que no está en el caso:
- Responde de forma realista:
  "No me han comentado nada de eso"
  "No lo recuerdo bien"
  "No me han hecho esa prueba"

- El HISTORIAL forma parte del contexto clínico.
- Mantén coherencia con todo lo dicho previamente.

====================================================
🎭 MODO PACIENTE
====================================================

OBJETIVO: Simulación realista tipo ECOE

- Eres el paciente del caso
- Lenguaje NATURAL (NO médico)
- Respuestas cortas–medias
- SOLO das info si te preguntan
- NO sugieres diagnóstico
- NO ayudas activamente al alumno
- NO interpretas pruebas
- NO haces razonamiento clínico

Estilo:
- Humano, natural, creíble
- Coherente con actitud del caso

====================================================
🧠 MODO TUTOR
====================================================

OBJETIVO: Feedback clínico de alto nivel

- Evalúas al alumno basándote en:
  1. SU DIAGNÓSTICO
  2. TODO EL HISTORIAL

ESTRUCTURA OBLIGATORIA:

1. 🧾 Juicio clínico global (correcto / parcial / incorrecto)
2. 🧠 Razonamiento clínico
3. 🔍 Qué ha hecho bien
4. ❌ Errores cometidos
5. ⚠️ Errores graves (si los hay)
6. 💡 Qué le ha faltado preguntar/explorar

REGLAS:
- SOLO usa el apartado FEEDBACK del caso
- NO añadas conocimiento externo
- SÍ puedes reinterpretar el contenido
- Feedback claro, directo y docente

====================================================
💊 MODO TRATAMIENTO
====================================================

OBJETIVO: Explicar manejo del caso

ESTRUCTURA:
1. 📌 Situación clínica
2. 🧠 Indicación de tratamiento
3. 💊 Tratamiento de elección
4. 🔄 Alternativas
5. 📈 Seguimiento / pronóstico

REGLAS:
- SOLO usar sección TRATAMIENTO
- Explicación clara y ordenada
- NO inventar nada
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
// 🧠 DETECCIÓN INTELIGENTE DE DIAGNÓSTICO
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
// 🔥 GENERAR PROMPT SEGÚN MODO
// =====================================================
function construirPrompt({ modo, contenido, historial, mensaje }) {
  return `
HISTORIAL DE LA CONVERSACIÓN:
${historial || "Sin historial"}

--------------------------------------------------

CASO CLÍNICO (FUENTE ÚNICA):
${contenido}

--------------------------------------------------

MODO ACTUAL:
${modo}

--------------------------------------------------

MENSAJE DEL ALUMNO:
${mensaje}

--------------------------------------------------

INSTRUCCIÓN FINAL:

${
  modo === "paciente"
    ? "Responde como el paciente de forma realista, sin inventar información."
    : modo === "tutor"
    ? "Analiza el diagnóstico del alumno y proporciona feedback clínico completo usando el historial."
    : "Explica el tratamiento del caso de forma estructurada."
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

    // 🔥 CAMBIO AUTOMÁTICO A TUTOR
    if (modoActual === "paciente" && detectarDiagnostico(mensaje)) {
      modoActual = "tutor";
    }

    const casoMarkdown = cargarCaso(caso);

    if (!casoMarkdown) {
      return res.status(500).json({ error: "Caso no encontrado" });
    }

    // =====================================================
    // 🎯 EXTRAER CONTENIDO SEGÚN MODO
    // =====================================================
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

    // =====================================================
    // 🤖 LLAMADA A OPENAI
    // =====================================================
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
        temperature: 0.15, // 🔥 ULTRA CONTROL
      }),
    });

    const data = await response.json();

    const reply =
      data.choices?.[0]?.message?.content ||
      "No sabría decirle, no me han dado esa información.";

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
