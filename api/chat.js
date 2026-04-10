import fs from "fs";
import path from "path";

// 🔹 PROMPT MAESTRO
const systemPrompt = `
Eres un simulador clínico avanzado tipo ECOE.

MODOS:
- paciente
- tutor
- tratamiento

----------------------------------------
🧠 REGLAS CLAVE
----------------------------------------

- El HISTORIAL es información clínica válida
- TODO lo dicho previamente debe recordarse
- El historial tiene MÁS prioridad que el caso en datos conversacionales
- NO reinicies conversación
- NO pierdas contexto

----------------------------------------
🎭 MODO PACIENTE
----------------------------------------

- Usa ROLEPLAY como base
- Integra SIEMPRE el historial
- Recuerda nombre, contexto y datos previos
- Responde como paciente real
- No des diagnóstico

----------------------------------------
🧠 MODO TUTOR
----------------------------------------

- Usa SOLO FEEDBACK
- Explica razonamiento clínico
- Corrige al alumno

----------------------------------------
💊 MODO TRATAMIENTO
----------------------------------------

- Usa SOLO TRATAMIENTO
- Explica manejo clínico
`;

// 🔹 CARGAR CASO
function cargarCaso(caso) {
  try {
    const filePath = path.join(process.cwd(), "data", "casos", `${caso}.md`);
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error("Error cargando caso:", error);
    return null;
  }
}

// 🔹 EXTRAER SECCIÓN
function extraerSeccion(markdown, seccion) {
  const regex = new RegExp(
    `##\\s*${seccion}\\b([\\s\\S]*?)(?=##\\s|$)`,
    "i"
  );
  const match = markdown.match(regex);
  return match ? match[1].trim() : "";
}

// 🔥 DETECCIÓN INTELIGENTE DE DIAGNÓSTICO
function detectarDiagnostico(mensaje) {
  const texto = mensaje.toLowerCase().trim();

  // ❌ preguntas → no diagnóstico
  if (texto.includes("?")) return false;

  const patronesPregunta = [
    "puede ser",
    "podria ser",
    "podría ser",
    "sería",
    "es posible",
  ];
  if (patronesPregunta.some((p) => texto.includes(p))) return false;

  // 🔥 patrones fuertes
  const patronesFuertes = [
    "diagnostico:",
    "diagnóstico:",
    "mi diagnostico es",
    "mi diagnóstico es",
    "el diagnostico es",
    "el diagnóstico es",
    "se trata de",
    "esto es",
    "corresponde a",
  ];
  if (patronesFuertes.some((p) => texto.includes(p))) return true;

  // 🧠 patrones clínicos naturales
  const patronesClinicos = [
    "creo que es",
    "probablemente es",
    "sospecho",
    "me cuadra",
    "cuadra con",
    "orienta a",
    "compatible con",
    "sugiere",
    "impresiona de",
    "podria tratarse de",
    "podría tratarse de",
  ];

  if (patronesClinicos.some((p) => texto.includes(p))) {
    if (texto.length > 15) return true;
  }

  // 🧠 mención directa de enfermedad
  const palabrasDiagnostico = [
    "infarto",
    "iam",
    "angina",
    "insuficiencia",
    "neumonia",
    "neumonía",
    "tromboembolismo",
    "epoc",
    "cancer",
    "cáncer",
    "pancreatitis",
    "apendicitis",
    "colecistitis",
    "hepatitis",
    "cirrosis",
    "valvulopatia",
    "valvulopatía",
  ];

  const mencionaDiagnostico = palabrasDiagnostico.some((d) =>
    texto.includes(d)
  );

  if (mencionaDiagnostico && texto.split(" ").length > 3) {
    return true;
  }

  return false;
}

// 🔹 HANDLER
export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo, historial } = req.body;

    if (!mensaje || !caso) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    // 🔥 CAMBIO AUTOMÁTICO A TUTOR
    let modoActual = modo || "paciente";

    if (modoActual === "paciente" && detectarDiagnostico(mensaje)) {
      modoActual = "tutor";
      console.log("🧠 Cambio automático a modo TUTOR");
    }

    const casoMarkdown = cargarCaso(caso);

    if (!casoMarkdown) {
      return res.status(500).json({ error: "Caso no encontrado" });
    }

    // 🔹 EXTRAER CONTENIDO
    let contenido = "";

    if (modoActual === "paciente") {
      contenido = extraerSeccion(casoMarkdown, "ROLEPLAY");
    } else if (modoActual === "tutor") {
      contenido = extraerSeccion(casoMarkdown, "FEEDBACK");
    } else if (modoActual === "tratamiento") {
      contenido = extraerSeccion(casoMarkdown, "TRATAMIENTO");
    }

    if (!contenido) {
      contenido = casoMarkdown;
    }

    console.log("=== DEBUG ===");
    console.log("MODO:", modoActual);
    console.log("HISTORIAL LENGTH:", historial?.length);

    const promptUsuario = `
HISTORIAL:
${historial || "Sin historial"}

----------------------------------------

CASO:
${contenido}

----------------------------------------

MODO:
${modoActual}

----------------------------------------

MENSAJE DEL ALUMNO:
${mensaje}

----------------------------------------

INSTRUCCIÓN:
${
  modoActual === "tutor"
    ? "Evalúa el diagnóstico del alumno, indica si es correcto o no y explica el razonamiento clínico."
    : "Responde como paciente real."
}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
        temperature: 0.4,
      }),
    });

    const data = await response.json();

    const reply =
      data.choices?.[0]?.message?.content ||
      "Error generando respuesta.";

    return res.status(200).json({
      reply,
      tipo: modoActual === "tutor" ? "tutor" : "paciente",
    });

  } catch (error) {
    console.error("Error en API:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
