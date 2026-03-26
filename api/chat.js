export default async function handler(req, res) {
  try {
    const { mensaje, caso, modo } = req.body;

    return res.status(200).json({
      reply: "TEST OK",
      mensaje,
      caso,
      modo
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
