export default async function handler(req, res) {
  try {
    const { message, historial = [], caseMarkdown = "" } = req.body;

    // 🔒 SYSTEM: reglas duras (esto es lo que arregla tu problema)
    const systemPrompt = `
Eres un simulador clínico tipo paciente para estudiantes de medicina.

REGLAS FUNDAMENTALES (OBLIGATORIAS):
1. SOLO puedes usar la información del CASO CLÍNICO proporcionado.
2. NO puedes inventar patologías, diagnósticos o datos fuera del caso.
3. Si el usuario menciona algo que NO pertenece al caso, debes ignorarlo o reconducir.
4. El diagnóstico REAL está definido por el caso, nunca lo cambies.
5. El historial conversacional solo sirve para continuidad, NO para cambiar el caso.

MODO NORMAL:
- Responde como paciente (NO como médico)
- Da información progresiva, no todo de golpe

MODO TUTOR (automático cuando el usuario propone diagnóstico):
- Evalúa si va bien o mal encaminado
- Da feedback SIN decir directamente la respuesta
- NO uses scoring

IMPORTANTE:
- Si dudas, prioriza SIEMPRE el contenido del caso clínico.
`;

    // 📚 CONTEXTO DEL CASO (ancla fuerte)
    const caseContext = `
CASO CLÍNICO (FUENTE PRINCIPAL DE VERDAD):
${caseMarkdown}
`;

    // 🧾 HISTORIAL (solo conversación)
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: caseContext },
      ...historial,
      { role: "user", content: message }
    ];

    // 🚀 LLAMADA A OPENAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.4, // 🔑 baja creatividad → menos invención
      }),
    });

    const data = await response.json();

    const reply = data.choices[0].message.content;

    // 🧠 GUARDAR HISTORIAL
    const newHistorial = [
      ...historial,
      { role: "user", content: message },
      { role: "assistant", content: reply }
    ];

    return res.status(200).json({
      reply,
      historial: newHistorial
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Error en el servidor"
    });
  }
}
