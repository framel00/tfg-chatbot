import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT PACIENTE FINAL
// =====================================================
const systemPaciente = `
Eres un paciente en una simulación clínica tipo ECOE.

━━━━━━━━━━━━━━━━━━━━━━━
🧠 IDENTIDAD
━━━━━━━━━━━━━━━━━━━━━━━
- Eres una persona normal, no médica
- No conoces diagnósticos ni términos técnicos

━━━━━━━━━━━━━━━━━━━━━━━
🎭 FORMA DE HABLAR
━━━━━━━━━━━━━━━━━━━━━━━
- Lenguaje natural, coloquial
- Puedes dudar o no expresarte perfectamente
- No hablas como un informe médico

━━━━━━━━━━━━━━━━━━━━━━━
🧠 COMPORTAMIENTO REALISTA
━━━━━━━━━━━━━━━━━━━━━━━
- No siempre das toda la información a la primera
- Puedes responder de forma incompleta
- Puedes necesitar que te aclaren la pregunta
- Responde con la mínima información necesaria

━━━━━━━━━━━━━━━━━━━━━━━
😐 ACTITUD
━━━━━━━━━━━━━━━━━━━━━━━
- Puedes mostrar preocupación o incomodidad
- Puedes minimizar o exagerar ligeramente síntomas

━━━━━━━━━━━━━━━━━━━━━━━
🩺 INFORMACIÓN CLÍNICA
━━━━━━━━━━━━━━━━━━━━━━━
- SOLO puedes usar la información del caso
- Puedes dar información progresiva (vaga → concreta)

- Si algo no está en el caso:
  → "No sabría decirle"
  → "No me han dicho nada de eso"

- NUNCA inventes

━━━━━━━━━━━━━━━━━━━━━━━
🚫 PROHIBIDO
━━━━━━━━━━━━━━━━━━━━━━━
- No sugieras enfermedades
- No confirmes diagnósticos
- No ayudes al médico
- No estructures la información como un médico

━━━━━━━━━━━━━━━━━━━━━━━
🧠 MEMORIA
━━━━━━━━━━━━━━━━━━━━━━━
- No repitas información ya dada
- No contradigas lo anterior

━━━━━━━━━━━━━━━━━━━━━━━
⚠️ IMPORTANTE
━━━━━━━━━━━━━━━━━━━━━━━
Si el médico propone un diagnóstico o tratamiento:
→ NO respondas
`;

// =====================================================
// 🧠 DETECTOR FINAL (ROBUSTO)
// =====================================================
const detectorPrompt = (mensaje) => `
Eres un clasificador clínico experto.

Analiza este mensaje:

"${mensaje}"

Detecta la intención aunque sea indirecta o incompleta.

Responde SOLO:
diagnostico
tratamiento
sospecha
no
`;

// =====================================================
// 🧠 FEEDBACK DIAGNÓSTICO FINAL
// =====================================================
const systemFeedbackDiagnostico = `
Eres un médico adjunto evaluando a un estudiante.

RESPONDE SIEMPRE CON:

1. Si es correcto o incorrecto (posición clara)
2. Justificación clínica comparando con el caso
3. Qué faltó considerar
4. Qué prueba o dato habría ayudado

TONO:
- Docente pero directo
- Si está mal → dilo claramente
- Si está cerca → matiza

PROHIBIDO:
- No seas ambiguo
- No digas "puede ser"
`;

// =====================================================
// 🧠 FEEDBACK TRATAMIENTO FINAL
// =====================================================
const systemFeedbackTratamiento = `
Eres un médico adjunto evaluando a un estudiante.

RESPONDE SIEMPRE CON:

1. Si es adecuado o no
2. Errores o mejoras
3. Tratamiento ideal
4. Prioridad clínica

TONO:
- Docente
- Claro
- Corrige sin rodeos

PROHIBIDO:
- No ignores el tratamiento del alumno
- No des solo la respuesta correcta
`;

// =====================================================
// 📂 FUNCIONES
// =====================================================
function cargarCaso(caso) {
  const filePath = path.join(process.cwd(), "data/casos", `${caso}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function limpiarHistorial(historial) {
  if (!historial) return "";

  return historial
    .replace(/null|undefined/g, "")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .slice(-12)
    .join("\n");
}

function normalizarDetector(texto) {
  return texto
    .toLowerCase()
    .replace(/[^\w]/g, "")
    .trim();
}

async function llamarOpenAI(messages, temperature = 0.2) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.3-chat-latest",
        messages,
        temperature,
      }),
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    return "";
  }
}

// =====================================================
// 🚀 HANDLER
// =====================================================
export default async function handler(req, res) {
  try {
    let { mensaje, caso, historial, modo } = req.body;

    mensaje = (mensaje || "").trim();

    const casoMD = cargarCaso(caso);
    if (!casoMD) {
      return res.status(500).json({ error: "Caso no encontrado" });
    }

    const hist = limpiarHistorial(historial);

    // =====================================================
    // 🧠 FEEDBACK DIAGNÓSTICO
    // =====================================================
    if (modo === "feedback") {
      const reply = await llamarOpenAI([
        { role: "system", content: systemFeedbackDiagnostico },
        { role: "user", content: `CASO:\n${casoMD}\n\nDIAGNÓSTICO:\n${mensaje}` },
      ]);

      return res.json({ reply, tipo: "feedback" });
    }

    // =====================================================
    // 🧠 FEEDBACK TRATAMIENTO
    // =====================================================
    if (modo === "feedback_tratamiento") {
      const reply = await llamarOpenAI([
        { role: "system", content: systemFeedbackTratamiento },
        { role: "user", content: `CASO:\n${casoMD}\n\nTRATAMIENTO:\n${mensaje}` },
      ]);

      return res.json({ reply, tipo: "feedback_tratamiento" });
    }

    // =====================================================
    // 🧠 DETECTOR
    // =====================================================
    let tipo = "paciente";

    const detRaw = await llamarOpenAI([
      { role: "system", content: detectorPrompt(mensaje) },
    ]);

    const det = normalizarDetector(detRaw);

    if (det === "diagnostico") tipo = "diagnostico";
    else if (det === "tratamiento") tipo = "tratamiento";
    else if (det === "sospecha") tipo = "sospecha";

    // fallback seguro
    if (!detRaw) tipo = "paciente";

    // 👉 BLOQUEO CRÍTICO
    if (tipo === "diagnostico" || tipo === "tratamiento") {
      return res.json({ reply: "", tipo });
    }

    // =====================================================
    // 🧠 PACIENTE
    // =====================================================
    const esInicio = !hist;

    const promptUsuario = esInicio
      ? `
CASO:
${casoMD}

El paciente inicia la consulta explicando su motivo principal de forma natural.
`
      : `
CONVERSACIÓN:
${hist}

CASO:
${casoMD}

MÉDICO:
${mensaje}
`;

    const reply = await llamarOpenAI([
      { role: "system", content: systemPaciente },
      { role: "user", content: promptUsuario },
    ]);

    return res.json({ reply, tipo });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
