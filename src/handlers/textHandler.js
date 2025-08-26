const { getState } = require('../state');
const { normalizeString, isGreetingText, say, calculateTotalAmount, normalizePhone } = require('../utils');
const { getUserProfile } = require('../services/supabase');
const { extractOrderDetailsWithGPT } = require('../services/openai');
const { extractLocation, geocodeAddress } = require('../utils/location');
const { handleProductAddition, advanceConversation } = require('../flows/salesFlow');
const { startReturnFlow, handleReturnText } = require('../flows/returnFlow');
const { handleStartCommand } = require('./commandHandler');

async function handleText(ctx) {
    const text = ctx.message?.text || "";
    if (text.startsWith("/")) return;

    const s = getState(ctx.chat.id);
    if (!s.userProfile) {
        s.userProfile = await getUserProfile(ctx.from?.username);
    }
    const normalizedText = normalizeString(text);

    if (isGreetingText(text)) {
        return handleStartCommand(ctx);
    }

    const isReturnKeyword = ["devolucion", "devolver", "registrar devolucion"].some(kw => normalizedText.includes(kw));
    if (s.returnState.currentStep !== 'initial' || isReturnKeyword) {
        if (s.returnState.currentStep === 'initial') { await startReturnFlow(ctx); } else { await handleReturnText(ctx, text); }
        return;
    }

    const p = s.saleState.partialOrder;
    const step = s.saleState.currentStep;

    const interactiveSteps = ['awaiting_clarification', 'awaiting_sale_type', 'awaiting_order_type', 'awaiting_payment_split', 'confirming'];
    if (interactiveSteps.includes(s.saleState.currentStep)) {
        await say(ctx, "Por favor, selecciona una de las opciones del mensaje anterior para continuar. 🙏");
        return;
    }

    // --- NUEVO MANEJADOR PARA EL PRECIO ---
    if (step === 'awaiting_price') {
        const price = parseFloat(text.replace(/[^0-9.,]/g, "").replace(",", "."));
        if (isNaN(price) || price < 0) {
            return say(ctx, "Por favor, introduce un precio válido (solo números).");
        }
        const itemToUpdate = p.items.find(item => item.name === s.saleState.itemNameToProcess);
        if (itemToUpdate) {
            itemToUpdate.unit_price = price;
            await say(ctx, `✅ Precio de *Bs. ${price.toFixed(2)}* establecido para *${itemToUpdate.name}*`);
        }
        s.saleState.itemNameToProcess = null;
        s.saleState.currentStep = 'initial';
        await advanceConversation(ctx);
        return;
    }
    // --- FIN DE NUEVO MANEJADOR ---

    if (step === 'awaiting_location') {
        const textLocation = text.trim();
        await say(ctx, `Procesando ubicación: *"${textLocation}"*...`);
        let loc = null;
        const urlRegex = /(https?:\/\/[^\s]*(maps|goo\.gl|google|googleusercontent|mapas )[^\s]*)/i;
        const urlMatch = textLocation.match(urlRegex);

        if (urlMatch) {
            loc = await extractLocation(urlMatch[0]);
        } else {
            loc = await geocodeAddress(`${textLocation}, Santa Cruz, Bolivia`);
        }

        if (!loc) {
            return say(ctx, "❌ No pude interpretar la ubicación. Por favor, intenta con un link de Google Maps o una dirección más clara.");
        }
        
        p.is_encomienda = false;
        p.location = { lat: loc.lat, lng: loc.lng, address: loc.address, city: loc.city, country: loc.country };
        await say(ctx, `✅ Ubicación recibida: *${loc.address}*`);
        s.saleState.currentStep = 'initial';
        await advanceConversation(ctx);
        return;
    }

    if (step === 'awaiting_customer') {
        await say(ctx, "🧠 Procesando nombre y teléfono...");
        const extracted = await extractOrderDetailsWithGPT(text);
        if (extracted?.customer_name) p.customer_name = extracted.customer_name;
        if (extracted?.customer_phone) p.customer_phone = normalizePhone(extracted.customer_phone);
        await advanceConversation(ctx);
        return;
    }
    
    if (step === 'awaiting_destination') {
        p.destino = text.trim();
        await say(ctx, `✅ Destino de encomienda establecido: *${p.destino}*`);
        s.saleState.currentStep = 'initial';
        await advanceConversation(ctx);
        return;
    }
    
    if (step === 'awaiting_partial_amount') {
        const total = calculateTotalAmount(p.items);
        const amount = parseFloat(text.replace(/[^0-9.,]/g, "").replace(",", "."));
        if (isNaN(amount) || amount <= 0 || amount >= total) {
            return say(ctx, `Monto inválido. Debe ser un número mayor a 0 y menor a ${total}.`);
        }
        p.payments.push({ amount, method: s.saleState.paymentMethod, status: "completado" });
        s.saleState.paymentMethod = null;
        s.saleState.currentStep = 'initial';
        await advanceConversation(ctx);
        return;
    }

    try {
        await say(ctx, "🧠 Analizando tu mensaje...");
        const extracted = await extractOrderDetailsWithGPT(text);
        if (extracted) {
            if (extracted.customer_phone) p.customer_phone = normalizePhone(extracted.customer_phone);
            if (extracted.customer_name) p.customer_name = extracted.customer_name;
            if (extracted.notes?.length > 0) p.notes = [...new Set([...p.notes, ...extracted.notes])];
            if (extracted.time_preference) p.time_preference = extracted.time_preference;
            if (extracted.items?.length > 0) {
                await say(ctx, `He encontrado ${extracted.items.length} producto(s), procesando...`);
                p.items = []; 
                for (const item of extracted.items) {
                    await handleProductAddition(ctx, item);
                }
            }
        }
        const loc = await extractLocation(text);
        if (loc?.lat && loc?.lng) {
            p.location = loc;
            p.is_encomienda = false;
            await say(ctx, `✅ Ubicación encontrada y registrada: ${loc.address}`);
        }
        await advanceConversation(ctx);
    } catch (error) {
        console.error("Error en el flujo de ventas (textHandler general):", error);
        await say(ctx, "Ocurrió un error al procesar tu mensaje. Por favor, intenta de nuevo.");
    }
}

module.exports = { handleText };