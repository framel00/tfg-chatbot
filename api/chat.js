export default async function handler(req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { mensaje, caso, modo } = body;

  const prompt =
  modo === "paciente"
    ? `Eres un paciente simulado. Caso clínico: ${caso}. 
Responde como un paciente real:
- lenguaje no técnico
- respuestas breves
- no des diagnósticos
- solo da información si te preguntan`

    : modo === "evaluador"
    ? `Eres un tutor clínico experto en ECOE.

Caso clínico:
${caso}

El alumno propone:
${mensaje}

Evalúa de forma estructurada:

1. ¿Diagnóstico correcto o incorrecto?
2. Justificación clínica breve
3. Qué le ha faltado preguntar
4. Puntos fuertes
5. Nota del 1 al 10

Sé claro y docente.`

    : modo === "feedback"
    ? `Eres un médico especialista que enseña razonamiento clínico.

Caso clínico:
${caso}

El alumno propone:
${mensaje}

Explica de forma estructurada:

1. Diagnóstico más probable
2. Diagnósticos diferenciales importantes
3. Algoritmo diagnóstico paso a paso
4. Pruebas complementarias clave
5. Tratamiento inicial
6. Perlas clínicas tipo MIR

Sé claro, ordenado y didáctico.`

    : `Error: modo no reconocido`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: mensaje || "Hola" }
        ]
      })
    });

    const data = await response.json();

    return res.status(200).json({
      reply: data.choices[0].message.content
    });

  } catch (error) {
    return res.status(500).json({
      error: "Error en el servidor",
      detalle: error.message
    });
  }
}
