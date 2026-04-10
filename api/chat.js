import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { mensaje, caso, historial } = req.body;

    console.log("📩 Request:", { mensaje, caso });

    // =====================================================
    // 🧪 TEST 1 — RESPUESTA SIMPLE (DEBUG)
    // =====================================================
    if (!mensaje || !caso) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    // =====================================================
    // 📂 TEST 2 — CARGAR ARCHIVO
    // =====================================================
    const filePath = path.join(process.cwd(), "data", "casos", `${caso}.md`);

    console.log("📂 Ruta:", filePath);

    let contenido = "";

    try {
      contenido = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      console.error("❌ Error leyendo archivo:", err);

      return res.status(500).json({
        error: "No se pudo leer el caso",
        ruta: filePath,
      });
    }

    // =====================================================
    // 🤖 TEST 3 — OPENAI
    // =====================================================
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Falta API KEY",
      });
    }

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
              {
                role: "system",
                content: "Eres un paciente.",
              },
              {
                role: "user",
                content: mensaje,
              },
            ],
          }),
        }
      );

      data = await response.json();

      console.log("🧠 OpenAI:", data);
    } catch (err) {
      console.error("❌ Error fetch:", err);

      return res.status(500).json({
        error: "Error en OpenAI",
        detalle: err.message,
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "No puedo responder ahora mismo.";

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
