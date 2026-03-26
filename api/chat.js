import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo } = req.body;

    // 📂 Cargar casos
    const filePath = path.join(process.cwd(), "data", "casos.json");
    const rawData = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(rawData);

    const casoData = data.casos?.[caso];

    if (!casoData) {
      return res.status(400).json({
        reply: "Error: caso clínico no encontrado."
      });
    }

    let prompt = "";

    // =========================
    // 🧑‍⚕️ MODO PACIENTE
    // =========================
    if (modo === "paciente") {
      prompt = `
Eres un paciente simulado en un entorno clínico tipo ECOE.

OBJETIVO:
Responder como un paciente real para ayudar al estudiante a razonar.

REGLAS:
- NO reveles el diagnóstico.
- NO des información no preguntada.
- Responde de forma natural, breve y realista (2-4 líneas).
- Si te preguntan por síntomas → respóndelos.
- Si te preguntan por pruebas (analítica, TAC, RX, etc) → proporciona los resultados como si ya estuvieran hechos.
- NO ofrezcas pruebas por iniciativa propia.
- Mantén coherencia con lo ya dicho.

CONTEXTO DEL CASO:
${casoData.resumen}

INFORMACIÓN INICIAL:
${casoData.info_paciente}

El médico pregunta:
"${mensaje}"

Responde SOLO como paciente.
`;
    }

    // =========================
    // 🧠 MODO TUTOR SOCRÁTICO
    // =========================
    if (modo === "tutor") {
      prompt = `
Eres un tutor clínico experto estilo ECOE/MIR.

El alumno propone:
"${mensaje}"

Diagnóstico correcto:
${casoData.diagnostico}

Datos clave del caso:
${casoData.datos_clave.slice(0,6).join(", ")}

TAREA:

1. Di si el diagnóstico es CORRECTO o INCORRECTO.
2. Razonamiento clínico breve.
3. Estilo socrático:
   - Qué ha hecho bien
   - Qué le ha faltado
   - Qué es secundario o menos relevante
4. Señala errores si los hay.

ESTILO:
- Didáctico
- Directo
- Como un adjunto corrigiendo un ECOE
- Máximo 120-150 palabras

FORMATO:
✔️/❌ Diagnóstico  
🧠 Razonamiento  
📌 Puntos clave  
⚠️ Errores
`;
    }

    // =========================
    // 💊 MODO TRATAMIENTO
    // =========================
    if (modo === "tratamiento") {
      prompt = `
Eres un tutor clínico.

Explica de forma clara, práctica y esquemática:

1. Algoritmo diagnóstico óptimo
2. Tratamiento del caso

Algoritmo:
${casoData.algoritmo.join(" → ")}

Tratamiento:
${casoData.tratamiento.join(" → ")}

ESTILO:
- Muy estructurado
- Muy claro
- Orientado a examen MIR/ECOE
- Sin relleno

FORMATO:
🧪 Algoritmo  
💊 Tratamiento

Máximo 150 palabras.
`;
    }

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

    const reply =
      dataOpenAI.output?.[0]?.content?.[0]?.text ||
      "Error generando respuesta.";

    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({
      reply: "Error interno del servidor.",
      error: error.message
    });
  }
}
