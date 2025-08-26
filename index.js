// RUTA: index.js

const { bot } = require('./src/config');
const { handleStartCommand } = require('./src/handlers/commandHandler');
const { handleText } = require('./src/handlers/textHandler');
const { handlePhoto } = require('./src/handlers/photoHandler');
const { handleLocation } = require('./src/handlers/locationHandler');
const { handleCallbackQuery } = require('./src/handlers/callbackHandler');
// --- Importamos los nuevos controladores del navegador ---
const { initBrowser, closeBrowser } = require('./src/utils/location');

bot.catch((err, ctx) => {
  console.error(`Error no controlado para el update ${ctx.updateType}`, err);
  const safeErrorMessage = "Ocurrió un error inesperado. El equipo técnico ha sido notificado. Por favor, intenta de nuevo en unos momentos.";
  if (ctx.reply) {
    ctx.reply(safeErrorMessage).catch(e => console.error("Fallo al enviar el mensaje de error:", e));
  } else if (ctx.editMessageText) {
    ctx.editMessageText(safeErrorMessage).catch(e => console.error("Fallo al editar el mensaje de error:", e));
  }
});

bot.start(handleStartCommand);
bot.on('text', handleText);
bot.on('photo', handlePhoto);
bot.on('location', handleLocation);
bot.on('callback_query', handleCallbackQuery);

async function main() {
  try {
    console.log("🤖 Bot iniciando en modo modular...");
    // --- 1. Inicia el navegador ANTES de lanzar el bot ---
    await initBrowser();
    
    // --- 2. Lanza el bot ---
    await bot.launch();
    console.log("✅ Bot corriendo exitosamente.");

    // --- 3. Registra las funciones de apagado seguro ---
    const stopBot = async (signal) => {
      console.log(`\n🚦 Recibida señal ${signal}. Apagando bot...`);
      bot.stop(signal); // Detiene Telegraf
      await closeBrowser(); // Cierra el navegador
      console.log("✅ Bot y navegador detenidos de forma segura.");
      process.exit(0);
    };

    process.once("SIGINT", () => stopBot("SIGINT"));
    process.once("SIGTERM", () => stopBot("SIGTERM"));

  } catch (e) {
    console.error("❌ El bot no pudo iniciar:", e?.message);
    await closeBrowser(); // Intenta cerrar el navegador si falló el inicio
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}