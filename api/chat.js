import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// =====================================================
// 📂 CARGAR CASO
// =====================================================
function cargarCaso(nombreCaso) {
  try {
    const ruta = path.join(process.cwd(), "data/casos", `${nombreCaso}.md`);
    return fs.readFileSync(ruta, "utf8");
  } catch (error) {
    console.error("Error cargando caso:", error);
    return null;
  }
}

// =====================================================
// 🧠 HISTORIAL → FORMATO OPENAI
// =====================================================
function formatearHistorial(historial) {
  if (!historial) return [];

  return historial
    .split("\n")
    .map((linea) => {
      if (linea.startsWith("Usuario:")) {
        return { role: "user", content: linea.replace("Usuario:", "").trim() };
      }
      if (linea.startsWith("Paciente:")) {
        return { role: "assistant", content: linea.replace("Paciente:", "").trim() };
      }
      return null;
    })
    .filter(Boolean)
    .slice(-25);
}

// =====================================================
// 🤖 LLAMADA OPENAI (ROBUSTA)
// =====================================================
async function llamarOpenAI(messages, temperature = 0.6) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.1",
      messages,
      temperature,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (!data.choices || !data.choices.length) {
    throw new Error("Respuesta vacía de OpenAI");
  }

  return data.choices[0].message.content;
}

// =====================================================
// 🔍 DETECTOR
// =====================================================
function detectorPrompt(mensaje) {
  return `
Clasifica el siguiente mensaje clínico:

"${mensaje}"

Responde SOLO con una palabra:

- diagnostico → afirmación clara del diagnóstico
- tratamiento → propuesta terapéutica
- diagnostico → hipótesis
- no → resto
`;
}

// =====================================================
// 🎭 PACIENTE ECOE
// =====================================================
function promptPaciente(casoMD) {
  return `
Eres un paciente en una simulación clínica tipo ECOE del grado en Medicina

CASO COMPLETO (uso interno):
${casoMD}

━━━━━━━━━━━━━━━━━━━━━━━
🎯 COMPORTAMIENTO
━━━━━━━━━━━━━━━━━━━━━━━
- Habla como paciente real
- Lenguaje natural
- Información progresiva
- NO repitas respuestas, salvo que te pregunten por algo que ya has dicho

━━━━━━━━━━━━━━━━━━━━━━━
🧠 DOBLE MODO
━━━━━━━━━━━━━━━━━━━━━━━

1. MODO PACIENTE
→ Respuesta normal

2. FUERA DE ROLEPLAY (MUY IMPORTANTE)

Actívalo si el médico pide:
- exploración física
- pruebas (analítica, ECG, TAC…)
- no está siendo profesional o está tratando mal al paciente

👉 RESPONDE:
"Fuera de roleplay: ¿Qué quieres explorar exactamente?" o algo similar, para evitar proporcionar mucha información de golpe.
"Fuera de roleplay: Por favor, cuide la forma con la que trata al paciente" si usa lenguaje malsonante o trata mal al paciente

Ejemplo:
- "¿Palpación abdominal?"
- "¿Algún signo concreto?"

━━━━━━━━━━━━━━━━━━━━━━━
📊 PRUEBAS
━━━━━━━━━━━━━━━━━━━━━━━
- SOLO datos del caso, si una prueba no esta completa asume que es normal salvo lo que se especifica en el caso (ejemplo: leucocitosis, PCR elevada, Hemoglobina baja)
- Si no existe:
→ "Esa prueba no está disponible en este caso"

━━━━━━━━━━━━━━━━━━━━━━━
🚫 PROHIBIDO
━━━━━━━━━━━━━━━━━━━━━━━
- No dar diagnósticos
- No ayudar activamente

━━━━━━━━━━━━━━━━━━━━━━━
⚠️ BLOQUEO
━━━━━━━━━━━━━━━━━━━━━━━
Si el médico da diagnóstico o tratamiento:
→ NO RESPONDAS
`;
}

// =====================================================
// 🩺 FEEDBACK DIAGNÓSTICO
// =====================================================
const promptFeedbackDiagnostico = (casoMD, historial, respuesta) => `
Eres un médico adjunto evaluando a un alumno de medicina en una simulación clínica tipo ECOE.

━━━━━━━━━━━━━━━━━━━━━━━
📚 CASO CLÍNICO
━━━━━━━━━━━━━━━━━━━━━━━
${casoMD}

━━━━━━━━━━━━━━━━━━━━━━━
🗂️ INTERACCIÓN DEL ALUMNO
━━━━━━━━━━━━━━━━━━━━━━━
${historial}

━━━━━━━━━━━━━━━━━━━━━━━
🧠 DIAGNÓSTICO FINAL DEL ALUMNO
━━━━━━━━━━━━━━━━━━━━━━━
${respuesta}

━━━━━━━━━━━━━━━━━━━━━━━
🩺 INSTRUCCIONES
━━━━━━━━━━━━━━━━━━━━━━━

Evalúa TODO el proceso clínico del alumno, no solo el diagnóstico final.

Debes analizar:
- Calidad de la anamnesis
- Exploración solicitada
- Pruebas pedidas
- Razonamiento clínico

━━━━━━━━━━━━━━━━━━━━━━━
📊 RESPONDE CON:

1. Correcto o incorrecto
2. Justificación clínica
3. Qué faltó, dentro de los datos disponibles en el caso actual
4. Qué pruebas faltaron, de las que están disponibles en el caso actual
5. Feedback global, puntos fuertes y debiles del proceso diagnostico del usuario
`;

// =====================================================
// 💊 FEEDBACK TRATAMIENTO
// =====================================================

const promptFeedbackTratamiento = (casoMD, historial, respuesta) => `
Eres un médico adjunto evaluando a un alumno.

━━━━━━━━━━━━━━━━━━━━━━━
📚 CASO CLÍNICO
━━━━━━━━━━━━━━━━━━━━━━━
${casoMD}

━━━━━━━━━━━━━━━━━━━━━━━
🗂️ INTERACCIÓN DEL ALUMNO
━━━━━━━━━━━━━━━━━━━━━━━
${historial}

━━━━━━━━━━━━━━━━━━━━━━━
💊 TRATAMIENTO DEL ALUMNO
━━━━━━━━━━━━━━━━━━━━━━━
${respuesta}

Evalúa:
- Adecuación del tratamiento
- Si está alineado con el diagnóstico
- Errores
- Omisiones importantes

━━━━━━━━━━━━━━━━━━━━━━━
📊 RESPONDE CON:

1. Adecuación
2. Errores, de mas graves a más sutiles u opcionales
3. Tratamiento ideal, dentro de los datos disponibles en el caso actual
4. Prioridad clínica, con los datos disponibles del caso
5. Feedback global, puntos fuertes y debiles de la respuesta del usuario
`;

// =====================================================
// 🚀 HANDLER
// =====================================================
export default async function handler(req, res) {
  try {
    let { mensaje, historial, caso, modo } = req.body;

    mensaje = (mensaje || "").trim();

    // 🛑 Mensaje vacío
    if (!mensaje) {
      return res.json({
        reply: "¿Qué te gustaría preguntarme?",
        tipo: "paciente",
      });
    }

    const casoMD = cargarCaso(caso);

    if (!casoMD) {
      return res.status(400).json({
        error: "Caso no encontrado",
      });
    }

    // =====================================================
    // 🧠 FEEDBACK DIAGNÓSTICO
    // =====================================================
    if (modo === "feedback") {
      const reply = await llamarOpenAI([
        { role: "system", content: promptFeedbackDiagnostico(casoMD, mensaje) },
      ]);
      return res.json({ reply, tipo: "feedback" });
    }

    // =====================================================
    // 🧠 FEEDBACK TRATAMIENTO
    // =====================================================
    if (modo === "feedback_tratamiento") {
      const reply = await llamarOpenAI([
        { role: "system", content: promptFeedbackTratamiento(casoMD, mensaje) },
      ]);
      return res.json({ reply, tipo: "feedback_tratamiento" });
    }

    // =====================================================
    // 🔍 DETECTOR
    // =====================================================
    let tipo = "no";

    try {
      const detRaw = await llamarOpenAI([
        { role: "system", content: "Eres un clasificador clínico." },
        { role: "user", content: detectorPrompt(mensaje) },
      ], 0);

      tipo = detRaw.trim().toLowerCase();
    } catch (e) {
      console.error("Error detector:", e);
      tipo = "no";
    }

    // 🛑 BLOQUEO REAL
    if (tipo === "diagnostico" || tipo === "tratamiento") {
      return res.json({ reply: "", tipo });
    }

    // =====================================================
    // 🎭 PACIENTE
    // =====================================================
    const mensajes = [
      { role: "system", content: promptPaciente(casoMD) },
      ...formatearHistorial(historial),
      { role: "user", content: mensaje },
    ];

    let reply = "";

    try {
      reply = await llamarOpenAI(mensajes, 0.6);
    } catch (e) {
      console.error("Error paciente:", e);
      reply = "No me encuentro muy bien…";
    }

    return res.json({
      reply,
      tipo: tipo === "sospecha" ? "sospecha" : "paciente",
    });

  } catch (error) {
    console.error("Error general:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
}
