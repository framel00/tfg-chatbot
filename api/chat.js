import fs from "fs";
import path from "path";

// 🔹 PROMPT MAESTRO (CORREGIDO)
const systemPrompt = `
Eres un simulador clínico avanzado diseñado para entrenamiento tipo ECOE.

Tu comportamiento depende estrictamente del modo en el que te encuentres:
- "paciente"
- "tutor"
- "tratamiento"

Recibirás siempre:
- Un caso clínico en formato Markdown estructurado
- Un historial de conversación
- Un mensaje del usuario
- Un modo de funcionamiento

----------------------------------------
📚 ESTRUCTURA DEL CASO (MARKDOWN)
----------------------------------------

El caso está dividido en secciones:

## ROLEPLAY
## FEEDBACK
## TRATAMIENTO

----------------------------------------
🧠 REGLAS GENERALES
----------------------------------------

- NUNCA inventes información
- El HISTORIAL de la conversación es información clínica válida
- TODO lo dicho previamente debe recordarse (nombre, síntomas, contexto)
- El historial tiene prioridad sobre el ROLEPLAY en datos conversacionales
- Si algo no aparece ni en el caso ni en el historial:
  → "No dispongo de esa información en este momento"

----------------------------------------
🎭 MODO PACIENTE
----------------------------------------

- Usa ROLEPLAY como base
- PERO integra SIEMPRE el historial de conversación
- Recuerda datos previos del usuario (nombre, contexto)
- Responde como paciente real, coherente y continuo
- No reinicies la conversación
- No des información no preguntada
- No des diagnóstico

----------------------------------------
🧠 MODO TUTOR
----------------------------------------

- SOLO usa FEEDBACK
- Explica razonamiento clínico

----------------------------------------
💊 MODO TRATAMIENTO
----------------------------------------

- SOLO usa TRATAMIENTO
- Explica manejo clínico

----------------------------------------
PRIORIDAD:
1. Historial de conversación
2. Modo actual
3. Contenido del caso
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

// 🔥 EXTRAER SECCIÓN
function extraerSeccion(markdown, seccion) {
  const regex = new RegExp(
    `##\\s*${seccion}\\b([\\s\\S]*?)(?=##\\s|$)`,
    "i"
  );
  const match = markdown.match(regex);
  return match ? match[1].trim() : "";
}

// 🔹 HANDLER
export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo, historial } = req.body;

    if (!mensaje || !caso || !modo) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    const casoMarkdown = cargarCaso(caso);

    if (!casoMarkdown) {
      return res.status(500).json({ error: "Caso no encontrado" });
    }

    // 🔥 EXTRAER CONTENIDO SEGÚN MODO
    let contenido = "";

    if (modo === "paciente") {
      contenido = extraerSeccion(casoMarkdown, "ROLEPLAY");
    } else if (modo === "tutor") {
      contenido = extraerSeccion(casoMarkdown, "FEEDBACK");
    } else if (modo === "tratamiento") {
      contenido = extraerSeccion(casoMarkdown, "TRATAMIENTO");
    }

    // 🔥 FALLBACK
    if (!contenido) {
      console.log("⚠️ Sección no encontrada, usando fallback completo");
      contenido = casoMarkdown;
    }

    // 🔥 DEBUG
    console.log("=== DEBUG ===");
    console.log("CASO:", caso);
    console.log("MODO:", modo);
    console.log("HISTORIAL LENGTH:", historial ? historial.length : 0);

    // 🔹 LLAMADA OPENAI
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
          {
            role: "user",
            content: `
HISTORIAL DE LA CONVERSACIÓN:
${historial || "Sin historial previo"}

----------------------------------------

CONTENIDO DEL CASO:
${contenido}

----------------------------------------

MODO:
${modo}

----------------------------------------

MENSAJE ACTUAL:
${mensaje}
            `,
          },
        ],
        temperature: 0.4,
      }),
    });

    const data = await response.json();

    console.log("OPENAI RESPONSE:", JSON.stringify(data, null, 2));

    const reply =
      data.choices?.[0]?.message?.content ||
      "Error generando respuesta.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Error en API:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
