export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo } = req.body;

    const prompt =
      modo === "paciente"
        ? `Eres un paciente simulado. Caso clínico: ${caso}. Responde de forma breve y realista, sin lenguaje técnico.`
        : `Eres un tutor clínico. Caso: ${caso}. Evalúa la respuesta del alumno: ${mensaje}. Indica si es correcta, explica por qué y da feedback.`

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

    res.status(200).json({
      reply: data.choices[0].message.content
    });

  } catch (error) {
    res.status(500).json({
      error: "Error en el servidor",
      detalle: error.message
    });
  }
}
