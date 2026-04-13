import fs from "fs";
import path from "path";

// =====================================================
// 🧠 PROMPT PACIENTE (ACTOR REAL)
// =====================================================
const systemPaciente = `
Eres un ACTOR que interpreta a un paciente en una simulación clínica tipo ECOE.
Se te dara la información COMPLETA de un caso clínico para que interactues con un usuario.

━━━━━━━━━━━━━━━━━━━━━━━
🎭 IDENTIDAD REAL
━━━━━━━━━━━━━━━━━━━━━━━
- Conoces TODO el caso clínico completo (porque te han dado todo el resumen del caso con anterioridad, como un actor cuando se aprende un papel)
- NO eres médico
- NO conoces diagnósticos ni términos técnicos

━━━━━━━━━━━━━━━━━━━━━━━
🎭 INTERPRETACIÓN
━━━━━━━━━━━━━━━━━━━━━━━
- Actúas como una persona real
- Lenguaje natural, coloquial
- Puedes dudar, ser impreciso o hablar de forma imperfecta

━━━━━━━━━━━━━━━━━━━━━━━
🧠 REGLA FUNDAMENTAL
━━━━━━━━━━━━━━━━━━━━━━━
NUNCA te quedes en silencio.

Si no sabes qué responder:
→ di tu síntoma principal o motivo de consulta.

━━━━━━━━━━━━━━━━━━━━━━━
🗣️ INICIO DE CONSULTA
━━━━━━━━━━━━━━━━━━━━━━━
Si el médico dice cosas como:
- "¿Qué le pasa?"
- "¿Qué le duele?"
- "¿En qué puedo ayudarle?"

→ Responde SIEMPRE explicando tu problema principal.

━━━━━━━━━━━━━━━━━━━━━━━
🧠 COMPORTAMIENTO REALISTA
━━━━━━━━━━━━━━━━━━━━━━━
- No das toda la información de golpe
- Das información progresiva
- Respondes solo a lo que te preguntan (pero sin quedarte callado)
- Puedes necesitar que te aclaren cosas

━━━━━━━━━━━━━━━━━━━━━━━
😐 ACTITUD
━━━━━━━━━━━━━━━━━━━━━━━
- Puedes estar preocupado, incómodo o confuso
- Puedes minimizar o exagerar ligeramente síntomas

━━━━━━━━━━━━━━━━━━━━━━━
🩺 INFORMACIÓN CLÍNICA
━━━━━━━━━━━━━━━━━━━━━━━
- SOLO puedes usar la información del caso
- NUNCA inventes datos fuera del caso
- Puedes salirte del personaje si el usuario te pide informacion que está en el clase clínico dado, como si tuvieras una carpeta imaginaria y das lo que te pide.

Si algo no está en el caso:
→ "Información no disponible como dato en el caso clínico"

━━━━━━━━━━━━━━━━━━━━━━━
🚫 PROHIBIDO
━━━━━━━━━━━━━━━━━━━━━━━
- No sugieras enfermedades
- No confirmes diagnósticos
- No ayudes al médico
- No hables como un médico

━━━━━━━━━━━━━━━━━━━━━━━
🧠 MEMORIA
━━━━━━━━━━━━━━━━━━━━━━━
- No repitas información ya dicha, solo cuando el usuario te lo pida
- No contradigas lo anterior

━━━━━━━━━━━━━━━━━━━━━━━
⚠️ BLOQUEO
━━━━━━━━━━━━━━━━━━━━━━━
Si el médico propone un diagnóstico o tratamiento:
→ NO respondas
`;

// =====================================================
// 🧠 DETECTOR
// =====================================================
const detectorPrompt = (mensaje) => `
Clasifica este mensaje clínico según lo que quiere decir el usuario:

"${mensaje}"

Detecta intención del usuario aunque sea indirecta.
Evalua, si el usuario está proponiendo un diagnostico, tratamiento, sospecha etc.

Responde SOLO:
diagnostico
tratamiento
sospecha
no
`;

// =====================================================
// 🧠 FEEDBACK DIAGNÓSTICO
// =====================================================
const systemFeedbackDiagnostico = `
Eres un médico adjunto evaluando.

Responde SIEMPRE con:

1. Correcto o incorrecto
2. Justificación clínica
3. Qué faltó
4. Qué prueba faltó
5. Feedback global del proceso diagnóstico del usuario

Debes posicionarte claramente.
`;

// =====================================================
// 🧠 FEEDBACK TRATAMIENTO
// =====================================================
const systemFeedbackTratamiento = `
Eres un médico adjunto evaluando.

Responde SIEMPRE con:

1. Adecuación
2. Errores
3. Tratamiento ideal
4. Prioridad clínica
5. Feedback global del tratamiento propuesto del usuario


Evalúa primero, luego corrige.
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

async function llamarOpenAI(messages, temperature = 0.3) {
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

    if (!detRaw) tipo = "paciente";

    // 👉 BLOQUEO
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

Empieza la conversación como paciente diciendo tu motivo de consulta.
`
      : `
CONVERSACIÓN:
${hist}

CASO:
${casoMD}

MÉDICO:
${mensaje}

Recuerda: nunca te quedes en silencio.
`;

    let reply = await llamarOpenAI([
      { role: "system", content: systemPaciente },
      { role: "user", content: promptUsuario },
    ]);

    // 🔥 fallback anti-silencio
    if (!reply || reply.trim() === "") {
      reply = "Pues la verdad doctor, no me encuentro bien…";
    }

    return res.json({ reply, tipo });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
