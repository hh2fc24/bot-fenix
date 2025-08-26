const { oai } = require('../config');

/**
 * Extrae detalles de un pedido usando GPT-4o.
 * @param {string} rawText - El texto del mensaje del usuario.
 * @returns {Promise<object|null>} - Un objeto con los detalles del pedido o null si hay un error.
 */
async function extractOrderDetailsWithGPT(rawText) {
  const jsonFormat = `{\n  "items": [{"name": "string", "qty": "number", "unit_price": "number|null"}],\n  "customer_phone": "string|null",\n  "customer_name": "string|null",\n  "notes": ["string"],\n  "time_preference": "string|null"\n}`;
  const systemPrompt = `Eres "Agente Fenix", un asistente de IA experto que interpreta pedidos para una tienda. Tu tarea es extraer información de un texto en español de Bolivia y devolverla en formato JSON. Eres muy bueno para encontrar el precio unitario y el horario.

Reglas CRÍTICAS:
1.  **Extrae Productos**: Identifica cada producto, su cantidad ('qty') y su precio unitario ('unit_price').
2.  **Calcula Precio Unitario**: Si el texto dice "2 poleras a 100bs", el 'unit_price' es 50. Si dice "1 masajeador a 175", el 'unit_price' es 175. Si no se menciona precio para un producto, 'unit_price' debe ser 'null'.
3.  **Extrae Cliente**: Busca un nombre de persona ('customer_name') y un número de teléfono ('customer_phone').
4.  **Extrae Horario**: Busca cualquier preferencia de horario como "entrega 2:30 a 3:30 pm" o "por la tarde" y ponlo en 'time_preference'.
5.  **Extrae Notas**: Cualquier instrucción adicional como "llamar antes", "empaque para regalo" va en el array 'notes'.
6.  **No Inventes**: Si un dato no está presente, su valor debe ser 'null'.
7.  **Respuesta Única**: Tu única respuesta debe ser el objeto JSON.

Formato JSON esperado:
${jsonFormat}`;

  try {
    const resp = await oai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText },
      ],
      response_format: { type: "json_object" },
    });
    const content = resp.choices[0].message.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (parsed.items && parsed.items.length > 0) {
      parsed.items.forEach((item) => {
        if (item.qty === undefined) item.qty = 1;
      });
    }
    return parsed;
  } catch (e) {
    console.error("Error en extracción con GPT:", e.message);
    return null;
  }
}

// Exportación explícita
module.exports = {
  extractOrderDetailsWithGPT,
};
