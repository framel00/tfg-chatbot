import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT MAESTRO ECOE (VERSIÓN FINAL)
// =====================================================
const systemPrompt = `
Eres un paciente en una simulación clínica tipo ECOE.

====================================================
🧠 IDENTIDAD
====================================================
- Eres un paciente, NO un asistente
- NO ayudas al médico
- NO haces razonamiento clínico
- NO das diagnósticos

====================================================
🎭 COMPORTAMIENTO
====================================================
- Lenguaje natural (no técnico)
- Respuestas cortas o medias
- SOLO respondes a lo que te preguntan
- No tomas iniciativa

====================================================
🚫 PROHIBIDO
====================================================
- NO digas "¿en qué puedo ayudarte?"
- NO digas "estoy aquí para ayudarte"
- NO sugieras enfermedades
- NO corrijas al médico
- NO guíes la consulta

====================================================
🧠 MEMORIA
====================================================
- Recuerdas lo que dice el médico
- Puedes recordar nombres
- Nunca digas "no lo recuerdo" si aparece en la conversación

====================================================
🧠 INFORMACIÓN CLÍNICA
====================================================
- SOLO puedes usar información del caso
- NO inventes síntomas, pruebas o antecedentes

====================================================
🧠 DIAGNÓSTICO
====================================================
Si el médico dice un diagnóstico:

👉 SIEMPRE respondes:
"¿Ese es su diagnóstico definitivo?"

NO confirmas ni niegas

====================================================
🩺 EXPLORACIÓN FÍSICA
====================================================
Si el médico explora:

- Describe lo que sientes
- Ejemplos:
  "me duele mucho ahí"
  "me molesta bastante al tocar"
  "sí, me duele más cuando sueltas"

NO interpretas signos médicos

====================================================
🧪 PRUEBAS COMPLEMENTARIAS
====================================================
- Si existen en el caso → das resultados
- Si NO → "No me han hecho esa prueba"

====================================================
🎯 ACTITUD
====================================================
- Colaborador
- Natural
- No dominante
`;

// =====================================================
// 📂 EXTRAER SOLO ROLEPLAY (EVITA FILTRACIONES)
// =====================================================
function extraerRoleplay(markdown) {
  const regex = /##\s*ROLEPLAY([\s\S]*?)(?=##|$)/i;
  const match = markdown.match(regex);
  return match ? match[1].trim() : markdown;
}

// =====================================================
// 📂 CARGAR CASO
// =====================================================
function cargarCaso(caso) {
  try {
    const filePath = path.join(process.cwd(), "data", "casos", `${caso}.md`);
    console.log("📂 Ruta:", filePath);

    if (!fs.existsSync(filePath)) {
      console.error("❌ Archivo no existe");
      return null;
    }

    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error("❌ Error leyendo caso:", error);
    return null;
  }
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
// 🚀 HANDLER
// =====================================================
export default async function handler(req, res) {
  try {
    console.log("📩 Request recibido");

    const { mensaje, caso, historial } = req.body;

    if (!mensaje || !caso) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    const casoMarkdown = cargarCaso(caso);

    if (!casoMarkdown) {
      return res.status(500).json({
        error: "Caso no encontrado",
        caso,
      });
    }

    const roleplay = extraerRoleplay(casoMarkdown);
    const historialLimpio = limpiarHistorial(historial);

    const promptUsuario = `
CONVERSACIÓN:
${historialLimpio}

-----------------------

INFORMACIÓN DEL PACIENTE:
${roleplay}

-----------------------

MENSAJE DEL MÉDICO:
${mensaje}

-----------------------

Responde como paciente ECOE real.
`;

    console.log("🧠 Prompt construido");

    let data;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
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
        }
      );

      data = await response.json();

      if (!response.ok) {
        console.error("❌ Error OpenAI:", data);
        return res.status(500).json({
          error: "Error OpenAI",
          detalle: data,
        });
      }
    } catch (err) {
      console.error("❌ Error fetch:", err);
      return res.status(500).json({
        error: "Error conectando con OpenAI",
        detalle: err.message,
      });
    }

    if (!data || !data.choices) {
      console.error("❌ Respuesta inválida:", data);
      return res.status(500).json({
        error: "Respuesta inválida de OpenAI",
        detalle: data,
      });
    }

    const reply =
      data.choices[0]?.message?.content ||
      "No sabría decirle exactamente.";

    return res.status(200).json({
      reply,
      tipo: "paciente",
    });
  } catch (error) {
    console.error("❌ ERROR GENERAL:", error.stack);

    return res.status(500).json({
      error: "Error interno",
      detalle: error.message,
    });
  }
}
