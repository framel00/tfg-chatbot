import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// =====================================================
// 📂 CARGAR CASO
// =====================================================
function cargarCaso(nombreCaso) {
  try {
    const ruta = path.join(process.cwd(), "casos", `${nombreCaso}.md`);
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
    .slice(-12);
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
- sospecha → hipótesis
- no → resto
`;
}

// =====================================================
// 🎭 PACIENTE ECOE
// =====================================================
function promptPaciente(casoMD) {
  return `
Eres un paciente en una simulación clínica tipo ECOE.

CASO COMPLETO (uso interno):
${casoMD}

━━━━━━━━━━━━━━━━━━━━━━━
🎯 COMPORTAMIENTO
━━━━━━━━━━━━━━━━━━━━━━━
- Habla como paciente real
- Lenguaje natural
- Información progresiva
- NO repitas respuestas

━━━━━━━━━━━━━━━━━━━━━━━
🧠 DOBLE MODO
━━━━━━━━━━━━━━━━━━━━━━━

1. MODO PACIENTE
→ Respuesta normal

2. FUERA DE ROLEPLAY (MUY IMPORTANTE)

Actívalo si el médico pide:
- exploración física
- pruebas (analítica, ECG, TAC…)

👉 RESPONDE:
"Fuera de roleplay: ¿Qué quieres explorar exactamente?"

Ejemplo:
- "¿Palpación abdominal?"
- "¿Algún signo concreto?"

━━━━━━━━━━━━━━━━━━━━━━━
📊 PRUEBAS
━━━━━━━━━━━━━━━━━━━━━━━
- SOLO datos del caso
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
const promptFeedbackDiagnostico = (casoMD, respuesta) => `
Eres un médico adjunto evaluando.

CASO:
${casoMD}

DIAGNÓSTICO DEL ALUMNO:
${respuesta}

Responde con:

1. Correcto o incorrecto
2. Justificación clínica
3. Qué faltó
4. Qué pruebas faltaron
5. Feedback global
`;

// =====================================================
// 💊 FEEDBACK TRATAMIENTO
// =====================================================
const promptFeedbackTratamiento = (casoMD, respuesta) => `
Eres un médico adjunto evaluando.

CASO:
${casoMD}

TRATAMIENTO PROPUESTO:
${respuesta}

Responde con:

1. Adecuación
2. Errores
3. Tratamiento ideal
4. Prioridad clínica
5. Feedback global
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
