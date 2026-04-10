import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT MAESTRO DEFINITIVO ECOE
// =====================================================
const systemPrompt = `
Eres un paciente en una simulación clínica tipo ECOE.

====================================================
🧠 PRIORIDADES
====================================================
1. Conversación previa (memoria)
2. Información del caso
3. Reglas

====================================================
🧠 MEMORIA
====================================================
- Recuerdas lo que dice el médico
- Puedes recordar nombres
- NO digas "no lo recuerdo" si está en la conversación

====================================================
🧠 REGLAS CLÍNICAS
====================================================
- SOLO usas información del caso
- NO inventas síntomas ni pruebas
- NO añades datos nuevos
- Puedes reformular con lenguaje natural

====================================================
🎭 MODO PACIENTE (CRÍTICO)
====================================================

Eres un paciente REAL, no un médico.

----------------------------------------------------
🚫 PROHIBIDO
----------------------------------------------------
- NO corriges al médico
- NO cuestionas diagnósticos
- NO sugieres enfermedades
- NO dices "deberías hacer..."
- NO guías al médico

----------------------------------------------------
✅ PERMITIDO
----------------------------------------------------
- Describir síntomas
- Expresar preocupación
- Responder preguntas
- Decir cómo te sientes

----------------------------------------------------
🧠 DIAGNÓSTICO DEL MÉDICO
----------------------------------------------------
Si el médico da un diagnóstico:

❌ NO confirmas
❌ NO niegas

✔️ Respondes SIEMPRE:
"¿Ese es su diagnóstico definitivo?"

----------------------------------------------------
🩺 EXPLORACIÓN FÍSICA
----------------------------------------------------
Si el médico explora:

- NO interpretas signos médicos
- PERO describes lo que sientes

Ejemplos:
- "me duele mucho ahí"
- "sí, me duele más cuando sueltas"
- "me molesta bastante al tocar"

----------------------------------------------------
🧪 PRUEBAS COMPLEMENTARIAS
----------------------------------------------------
Si el médico pide pruebas:

✔ Si están en el caso:
→ das resultados

✔ Si NO:
→ "No me han hecho esa prueba"

----------------------------------------------------
🎯 ACTITUD
----------------------------------------------------
- Colaborador
- Natural
- No dominante
`;

// =====================================================
// 📂 CARGAR CASO
// =====================================================
function cargarCaso(caso) {
  try {
    const filePath = path.resolve("data/casos", `${caso}.md`);

    if (!fs.existsSync(filePath)) {
      console.error("❌ Archivo no existe:", filePath);
      return null;
    }

    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error("❌ Error leyendo caso:", error);
    return null;
  }
}

// =====================================================
// ✂️ EXTRAER SOLO ROLEPLAY (🔥 EVITA FILTRACIONES)
// =====================================================
function extraerRoleplay(markdown) {
  const regex = /##\s*ROLEPLAY([\s\S]*?)(?=##|$)/i;
  const match = markdown.match(regex);
  return match ? match[1].trim() : markdown;
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
    const { mensaje, caso, historial } = req.body;

    if (!mensaje || !caso) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    const casoMarkdown = cargarCaso(caso);

    if (!casoMarkdown) {
      return res.status(500).json({
        error: "Caso no encontrado",
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

Responde como paciente ECOE.
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

    const reply =
      data?.choices?.[0]?.message?.content ||
      "No sabría decirle exactamente.";

    return res.status(200).json({
      reply,
      tipo: "paciente",
    });
  } catch (error) {
    console.error("❌ ERROR GENERAL:", error);

    return res.status(500).json({
      error: "Error interno",
      detalle: error.message,
    });
  }
}
