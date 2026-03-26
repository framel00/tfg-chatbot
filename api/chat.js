import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo } = req.body;

    // 🧪 DEBUG 1
    console.log("BODY:", req.body);

    // 📂 Cargar JSON
    const filePath = path.join(process.cwd(), "data", "casos.json");
    const rawData = fs.readFileSync(filePath, "utf-8");

    // 🧪 DEBUG 2
    console.log("RAW JSON cargado");

    const data = JSON.parse(rawData);

    // 🧪 DEBUG 3
    console.log("JSON parseado OK");

    const casoData = data.casos?.[caso];

    if (!casoData) {
      return res.status(400).json({
        reply: "Error: caso clínico no encontrado."
      });
    }

    let prompt = "";

    // =========================
    // 🧑‍⚕️ PACIENTE
    // =========================
    if (modo === "paciente") {
      prompt = `
Eres un paciente simulado.

Habla de forma natural, breve y realista.

CONTEXTO:
${casoData.resumen}

INFO:
${casoData.info_paciente}

Usuario:
${mensaje}
`;
    }

    // =========================
    // 🧠 TUTOR
    // =========================
    if (modo === "tutor") {
      prompt = `
Evalúa el diagnóstico del alumno.

Diagnóstico alumno:
${mensaje}

Correcto:
${casoData.diagnostico}

Datos clave:
${casoData.datos_clave.join(", ")}

Algoritmo:
${casoData.algoritmo.join(" → ")}

Tratamiento:
${casoData.tratamiento.join(" → ")}

Responde estructurado.
`;
    }

    // 🧪 DEBUG 4
    console.log("PROMPT generado");

    // 🤖 OpenAI
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt
      })
    });

    const dataOpenAI = await response.json();

    // 🧪 DEBUG 5
    console.log("OPENAI RESPONSE:", dataOpenAI);

    const reply =
      dataOpenAI.output?.[0]?.content?.[0]?.text ||
      "Error generando respuesta.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("ERROR:", error);

    return res.status(500).json({
      reply: "Error interno del servidor.",
      error: error.message
    });
  }
}
