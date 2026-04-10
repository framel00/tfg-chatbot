import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT MAESTRO DEFINITIVO
// =====================================================
const systemPrompt = `
Eres un simulador clínico tipo ECOE.

PRIORIDADES:
1. Conversación previa (historial)
2. Información del caso (según modo)
3. Reglas

====================================================
🧠 MEMORIA
====================================================
- Debes recordar lo que el médico dice
- Puedes recordar nombres y contexto
- NUNCA digas "no lo recuerdo" si está en el historial

====================================================
🧠 REGLAS CLÍNICAS
====================================================
- NO inventar datos clínicos
- NO añadir síntomas nuevos
- NO interpretar pruebas
- Puedes usar lenguaje natural

====================================================
🎭 MODO PACIENTE
====================================================
- Eres el paciente
- Lenguaje natural, no médico
- SOLO respondes a lo que te preguntan
- NO ayudas activamente
- NO sugieres diagnóstico

Diagnóstico del médico:
- NO confirmas
- NO niegas
- Respondes como paciente:
  "Ah vale doctor"
  "¿Eso es grave?"

====================================================
🧠 MODO TUTOR
====================================================
Evalúa usando:
- Diagnóstico del alumno
- Historial completo

Estructura:
1. Juicio
2. Razonamiento
3. Aciertos
4. Errores
5. Qué faltó

====================================================
💊 MODO TRATAMIENTO
====================================================
Explica de forma estructurada el tratamiento
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
// 🧹 LIMPIAR HISTORIAL
// =====================================================
function limpiarHistorial(historial) {
  if (!historial) return "";

  return historial
    .replace(/null/g, "")
    .replace(/undefined/g, "")
    .trim();
}

// =====================================================
// 🧠 DETECTAR DIAGNÓSTICO
// =====================================================
function detectarDiagnostico(texto) {
  const t = texto.toLowerCase();
  return (
    t.includes("diagnóstico") ||
    t.includes("diagnostico") ||
    t.includes("creo que") ||
    t.includes("se trata de") ||
    t.includes("probablemente")
  );
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

    const historialLimpio = limpiarHistorial(historial);

    // 🔥 EXTRAER SOLO LO NECESARIO
    let contenido = "";

    if (modoActual === "paciente") {
      contenido = extraerSeccion(casoMarkdown, "ROLEPLAY");
    } else if (modoActual === "tutor") {
      contenido = extraerSeccion(casoMarkdown, "FEEDBACK");
    } else if (modoActual === "tratamiento") {
      contenido = extraerSeccion(casoMarkdown, "TRATAMIENTO");
    }

    if (!contenido) contenido = casoMarkdown;

    const promptUsuario = `
CONVERSACIÓN:
${historialLimpio}

-----------------------

INFORMACIÓN DEL CASO:
${contenido}

-----------------------

MENSAJE DEL MÉDICO:
${mensaje}

-----------------------

Responde según el modo actual.
`;

    let data;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
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
        }
      );

      data = await response.json();

      if (!response.ok) {
        console.error("OpenAI error:", data);
        return res.status(500).json({
          error: "Error en OpenAI",
          detalle: data,
        });
      }
    } catch (err) {
      console.error("Error fetch:", err);
      return res.status(500).json({ error: "Fallo conexión OpenAI" });
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "No sabría decirle exactamente.";

    return res.status(200).json({
      reply,
      tipo: modoActual,
    });
  } catch (error) {
    console.error("Error general:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
