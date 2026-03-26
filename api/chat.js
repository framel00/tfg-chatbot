import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo } = req.body;

    // 📂 1. Cargar base de casos
    const filePath = path.join(process.cwd(), "data", "casos.json");
    const rawData = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(rawData);

    const casoData = data.casos[caso];

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

Tu objetivo es ayudar a un estudiante de medicina a entrenar su razonamiento clínico.

REGLAS OBLIGATORIAS:
- NO reveles el diagnóstico bajo ningún concepto.
- NO sugieras pruebas si no te las piden.
- NO des información no preguntada.
- Responde como una persona normal, no como un libro.
- Usa lenguaje natural, sencillo y realista.
- Respuestas cortas (2-4 líneas máximo).

CONTEXTO DEL CASO:
${casoData.resumen}

INFORMACIÓN BASE DEL PACIENTE:
${casoData.info_paciente}

El estudiante dice:
"${mensaje}"

Responde SOLO como paciente.
`;
    }

    // =========================
    // 🧠 MODO TUTOR SOCRÁTICO
    // =========================
    if (modo === "tutor") {
      prompt = `
Eres un tutor clínico experto en medicina, estilo examen ECOE/MIR.

El alumno propone como diagnóstico:
"${mensaje}"

DIAGNÓSTICO CORRECTO:
${casoData.diagnostico}

DATOS CLAVE DEL CASO:
${casoData.datos_clave.join(", ")}

TU TAREA:

1. Evalúa si el diagnóstico es CORRECTO o INCORRECTO.
2. Explica el razonamiento clínico paso a paso:
   - Qué datos eran clave
   - Cómo orientar el diagnóstico diferencial
3. Explica el algoritmo diagnóstico óptimo:
   ${casoData.algoritmo.join(" → ")}
4. Explica el tratamiento de forma clara:
   ${casoData.tratamiento.join(" → ")}
5. Señala errores típicos si el alumno se ha equivocado.

ESTILO:
- Muy claro y estructurado
- Didáctico pero conciso
- Nivel estudiante de medicina avanzado
- Nada de relleno ni teoría innecesaria

RESPUESTA ESTRUCTURADA:
- ✔️ / ❌ Diagnóstico
- 🧠 Razonamiento
- 🧪 Algoritmo
- 💊 Tratamiento
- ⚠️ Errores (si aplica)
`;
    }

    // =========================
    // 🤖 LLAMADA A OPENAI
    // =========================
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
      reply: "Error interno del servidor."
    });
  }
}
