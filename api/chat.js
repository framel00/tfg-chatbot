export default async function handler(req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { mensaje, caso, modo } = body;

    const prompt =
      modo === "paciente"
        ? `Eres un paciente simulado. Caso clínico: ${caso}. Responde breve y realista.`
        : `Eres tutor clínico. Caso: ${caso}. Evalúa: ${mensaje}`;

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
