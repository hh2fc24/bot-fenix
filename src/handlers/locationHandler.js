// RUTA: src/handlers/locationHandler.js

const { getState } = require('../state');
// Ahora usamos la herramienta 'reverseGeocode' desde nuestra caja de herramientas en utils
const { reverseGeocode } = require('../utils/location'); 
const { advanceConversation } = require('../flows/salesFlow');
const { say } = require('../utils');

// Este es el manejador que se activa cuando el usuario comparte una ubicación desde Telegram
async function handleLocation(ctx) {
    const s = getState(ctx.chat.id);
    const { latitude, longitude } = ctx.message?.location || {};

    if (latitude == null || longitude == null) return;

    if (s.saleState.currentStep !== "confirming") {
        const geo = await reverseGeocode(latitude, longitude);
        s.saleState.partialOrder.is_encomienda = false;
        s.saleState.partialOrder.location = {
            lat: latitude,
            lng: longitude,
            address: geo.address,
            city: geo.city,
            country: geo.country,
        };
        await say(ctx, `✅ Ubicación para entrega local recibida: ${geo.address}`);
        await advanceConversation(ctx);
    }
}

module.exports = { handleLocation };