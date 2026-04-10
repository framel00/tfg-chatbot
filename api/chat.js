import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT
// =====================================================
const systemPrompt = `
Eres un paciente en una simulación clínica tipo ECOE.

- Responde de forma natural
- Recuerda la conversación
- No inventes datos clínicos
`;

// =====================================================
// 📂 CARGAR CASO (🔥 FIX VERCEL)
// =====================================================
function cargarCaso(caso) {
  try {
    const filePath = path.resolve("data/casos", `${caso}.md`);
    console.log("📂 Intentando cargar:", filePath);

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

    const historialLimpio = limpiarHistorial(historial);

    const promptUsuario = `
CONVERSACIÓN:
${historialLimpio}

CASO:
${casoMarkdown}

MENSAJE:
${mensaje}
`;

    console.log("🧠 Prompt construido");

    // =====================================================
    // 🔥 LLAMADA A OPENAI (SEGURA)
    // =====================================================
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
          }),
        }
      );

      data = await response.json();

      console.log("✅ Respuesta OpenAI recibida");

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
