const { getState } = require('../state');
const { CONSTANTS } = require('../config');
const { uploadTelegramPhotoToSupabase } = require('../services/supabase');
const { say } = require('../utils');
const { advanceConversation } = require('../flows/salesFlow');

async function handlePhoto(ctx) {
    const s = getState(ctx.chat.id);
    const p = s.saleState.partialOrder;
    const currentStep = s.saleState.currentStep;

    switch (currentStep) {
        case 'initial': {
            if (p.items.length === 0) {
                return say(ctx, "Gracias por la foto. Para poder asociarla correctamente, por favor, primero envíame por texto la lista de productos que deseas en tu pedido.");
            }
            return say(ctx, "He recibido la foto. La procesaré en el momento adecuado. Por ahora, sigamos completando los datos del pedido.");
        }

        case 'awaiting_photo': {
            const productName = s.saleState.awaitingPhotoForBaseProduct;
            if (!productName) {
                 return say(ctx, "Recibí una foto, pero no sé a qué producto asignarla.");
            }

            await say(ctx, `⏳ Subiendo y asociando foto para *${productName}*...`);
            
            const url = await uploadTelegramPhotoToSupabase(ctx, CONSTANTS.BUCKETS.ORDER_IMAGES);
            if (!url) {
                return say(ctx, "❌ Hubo un error al guardar la foto del producto. Por favor, envíala de nuevo.");
            }

            const itemToUpdate = p.items.find(item => item.name === productName);
            if (itemToUpdate) {
                itemToUpdate.image_url = url;
            }

            await say(ctx, `✅ Foto para *${productName}* recibida.`);

            s.saleState.awaitingPhotoForBaseProduct = null;
            break;
        }

        case 'awaiting_payment_proof': {
            const paymentToUpdate = p.payments.find(pay => pay.status === 'completado' && pay.method !== 'Efectivo' && !pay.payment_proof_url);
            if (!paymentToUpdate) {
                return say(ctx, "Recibí un comprobante, pero no parece que lo estuviera esperando. 🤔");
            }
            
            await say(ctx, `⏳ Subiendo y asociando comprobante de pago...`);

            const url = await uploadTelegramPhotoToSupabase(ctx, CONSTANTS.BUCKETS.PAYMENT_PROOFS);
            if (!url) {
                return say(ctx, "❌ Hubo un error al guardar el comprobante. Por favor, envíalo de nuevo.");
            }
            
            paymentToUpdate.payment_proof_url = url;
            await say(ctx, `✅ Comprobante de pago de *Bs ${paymentToUpdate.amount.toFixed(2)}* recibido.`);
            
            break;
        }

        default:
            return say(ctx, "He recibido una foto, pero no la esperaba ahora.");
    }

    s.saleState.currentStep = 'initial';
    await advanceConversation(ctx);
}

module.exports = { handlePhoto };