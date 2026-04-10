import fs from "fs";
import path from "path";

// 🔥 PROMPT MAESTRO MEJORADO (ANTI-ALUCINACIONES)
const systemPrompt = `
Eres un simulador clínico tipo ECOE.

----------------------------------------
🚨 REGLA CRÍTICA (OBLIGATORIA)
----------------------------------------
- SOLO puedes usar información contenida en el CASO proporcionado.
- PROHIBIDO inventar síntomas, antecedentes, pruebas o datos.
- PROHIBIDO completar información ausente.
- PROHIBIDO inferir datos no escritos explícitamente.

Si el alumno pregunta algo que NO está en el caso:
👉 Responde como paciente:
"No me han comentado nada sobre eso"
"No lo recuerdo bien"
"No me han hecho esa prueba"

----------------------------------------
🧠 HISTORIAL
----------------------------------------
- El historial es válido y debe usarse
- NO contradigas información previa

----------------------------------------
🎭 MODO PACIENTE
----------------------------------------
- Responde SOLO con información del ROLEPLAY
- Lenguaje natural (paciente, no médico)
- NO des diagnóstico
- NO sugieras enfermedades

----------------------------------------
🧠 MODO TUTOR
----------------------------------------
- Evalúa el diagnóstico del alumno
- Usa SOLO el FEEDBACK del caso
- NO añadas conocimiento externo
- Explica razonamiento clínico

----------------------------------------
💊 MODO TRATAMIENTO
----------------------------------------
- Usa SOLO el apartado TRATAMIENTO
- Explica manejo de forma estructurada
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

// 🔥 DETECCIÓN DE DIAGNÓSTICO (MEJORADA)
function detectarDiagnostico(mensaje) {
  const texto = mensaje.toLowerCase().trim();

  if (texto.includes("?")) return false;

  const patronesFuertes = [
    "diagnóstico",
    "diagnostico",
    "se trata de",
    "esto es",
    "compatible con",
    "sugiere",
    "impresiona de",
  ];

  return patronesFuertes.some((p) => texto.includes(p));
}

// 🔹 HANDLER
export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo, historial } = req.body;

    if (!mensaje || !caso) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    let modoActual = modo || "paciente";

    // 🔥 CAMBIO AUTOMÁTICO A TUTOR
    if (modoActual === "paciente" && detectarDiagnostico(mensaje)) {
      modoActual = "tutor";
    }

    const casoMarkdown = cargarCaso(caso);

    if (!casoMarkdown) {
      return res.status(500).json({ error: "Caso no encontrado" });
    }

    // 🔹 EXTRAER CONTENIDO SEGÚN MODO
    let contenido = "";

    if (modoActual === "paciente") {
      contenido = extraerSeccion(casoMarkdown, "ROLEPLAY");
    } else if (modoActual === "tutor") {
      contenido = extraerSeccion(casoMarkdown, "FEEDBACK");
    } else if (modoActual === "tratamiento") {
      contenido = extraerSeccion(casoMarkdown, "TRATAMIENTO");
    }

    if (!contenido) contenido = casoMarkdown;

    const promptUsuario = `
HISTORIAL:
${historial || "Sin historial"}

----------------------------------------

CASO (ÚNICA FUENTE DE VERDAD):
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
    ? "Evalúa el diagnóstico estrictamente con la información disponible."
    : modoActual === "tratamiento"
    ? "Explica el tratamiento del caso."
    : "Responde como paciente sin inventar información."
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
        temperature: 0.2, // 🔥 MENOS CREATIVIDAD = MENOS ALUCINACIÓN
      }),
    });

    const data = await response.json();

    const reply =
      data.choices?.[0]?.message?.content ||
      "No estoy seguro de eso, no me han dado esa información.";

    return res.status(200).json({
      reply,
      tipo: modoActual === "tutor" ? "tutor" : "paciente",
    });

  } catch (error) {
    console.error("Error en API:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
