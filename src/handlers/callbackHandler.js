const { getState, getInitialState, STATE } = require('../state');
const { escapeMarkdown, say } = require('../utils');
const { advanceConversation, requestNextPhotoOrAdvance, processClarification } = require('../flows/salesFlow');
const { advanceReturnConversation, insertReturn } = require('../flows/returnFlow');
const { insertOrder, logUnrecognizedProduct } = require('../services/supabase');

async function handleCallbackQuery(ctx) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const s = getState(chatId);
    const p = s.saleState.partialOrder;
    const data = ctx.callbackQuery?.data;

    try { await ctx.answerCbQuery(); } catch (_) {}

    if (data.startsWith("RETURN_ITEM_")) {
        const item_id = data.split('_')[2];
        const order_item = s.returnState.originalOrder.order_items.find(i => i.id.toString() === item_id);
        if (order_item) {
            s.returnState.returnDetails.items.push({ product_name: order_item.product_name, quantity: null });
            s.returnState.currentStep = 'awaiting_quantity';
            await ctx.deleteMessage();
            await advanceReturnConversation(ctx);
        }
        return;
    }
    if (data === "CONFIRM_RETURN") {
        await ctx.editMessageText("⏳ Registrando la devolución...");
        try {
            const inserted = await insertReturn({ 
                originalOrder: s.returnState.originalOrder, 
                returnDetails: s.returnState.returnDetails, 
                userProfile: s.userProfile 
            });
            await say(ctx, `✅ ¡Devolución #${inserted.id} registrada para el pedido #${s.returnState.originalOrder.order_no}!`);
            const profile = s.userProfile;
            STATE.set(chatId, getInitialState());
            STATE.get(chatId).userProfile = profile;
        } catch(e) {
            console.error("Fallo al insertar devolución:", e);
            await say(ctx, `❌ No pude guardar la devolución. Error: ${escapeMarkdown(e.message)}`);
        }
        return;
    }
    if (data === "CANCEL_RETURN") {
        await ctx.deleteMessage();
        await say(ctx, "Operación de devolución cancelada.");
        const profile = s.userProfile;
        STATE.set(chatId, getInitialState());
        STATE.get(chatId).userProfile = profile;
        return;
    }

    if (data.startsWith("SET_SALE_TYPE_")) {
        const parts = data.split('_');
        const type = parts[3];
        const encodedItemName = parts.slice(4).join('_');
        const itemName = decodeURIComponent(encodedItemName);

        const itemToUpdate = s.saleState.partialOrder.items.find(
            item => (item.original_name === itemName || item.name === itemName)
        );

        if (itemToUpdate) {
            itemToUpdate.sale_type = type === "WHOLESALE" ? 'mayor' : 'unidad';
            await ctx.deleteMessage();
            await say(ctx, `✅ Tipo de venta para *${itemName}* establecido como: *${itemToUpdate.sale_type}*.`);
            
            s.saleState.itemNameToProcess = null; 
            await advanceConversation(ctx); 
        } else {
            await ctx.answerCbQuery(`Error: no encontré el producto "${itemName}" para actualizar.`);
        }
        return;
    }

    if (data.startsWith("CLARIFY_")) {
        await ctx.deleteMessage();
        const choice = data.split("_")[1];
        
        if (!s.saleState.ambiguousItems || s.saleState.ambiguousItems.length === 0) {
            await say(ctx, "❌ Error: No hay productos ambiguos para clarificar.");
            return;
        }
        
        const ambiguousItem = s.saleState.ambiguousItems.shift();
        s.saleState.currentStep = "initial";

        await processClarification(ctx, choice, ambiguousItem);
        
        await advanceConversation(ctx);
        return;
    }

    const paymentMethodMap = { SET_PAYMENT_EFECTIVO: "Efectivo", SET_PAYMENT_QR: "QR", SET_PAYMENT_TRANSFERENCIA: "Transferencia" };
    if (paymentMethodMap[data]) {
        s.saleState.paymentMethod = paymentMethodMap[data];
        await ctx.deleteMessage();
        await advanceConversation(ctx);
        return;
    }
    
    if (data === 'SET_ORDER_TYPE_LOCAL' || data === 'SET_ORDER_TYPE_ENCOMIENDA') {
        p.is_encomienda = data === 'SET_ORDER_TYPE_ENCOMIENDA';
        if (p.is_encomienda) p.location = null;
        await ctx.deleteMessage();
        await advanceConversation(ctx);
        return;
    }

    if (data === "PAY_FULL_NOW" || data === "PAY_PARTIAL_NOW" || data === "PAY_FULL_ON_DELIVERY") {
        const total = require('../utils').calculateTotalAmount(p.items);
        const method = s.saleState.paymentMethod;
        await ctx.deleteMessage();

        if (data === "PAY_FULL_NOW") {
            p.payments.push({ amount: total, method, status: "completado" });
        } else if (data === "PAY_PARTIAL_NOW") {
            s.saleState.currentStep = "awaiting_partial_amount";
            await say(ctx, `Entendido. Se pagará una parte con *${method}*. El total es *Bs ${total.toFixed(2)}*. ¿Qué monto se pagará ahora?`);
            return;
        } else if (data === "PAY_FULL_ON_DELIVERY") {
            p.payments.push({ amount: total, method: "Efectivo", status: "pendiente" });
        }
        s.saleState.paymentMethod = null;
        await advanceConversation(ctx);
        return;
    }

    if (data === "CONFIRM_ORDER") {
        await ctx.editMessageText("⏳ Guardando tu pedido...");
        try {
            const inserted = await insertOrder({ sellerProfile: s.userProfile, orderData: p, chatId });
            await say(ctx, `✅ ¡Pedido #${inserted.order_no || inserted.id} guardado exitosamente!`);
            const profile = s.userProfile;
            STATE.set(chatId, getInitialState());
            STATE.get(chatId).userProfile = profile;
        } catch (e) {
            console.error("Fallo al insertar pedido:", e);
            await say(ctx, `❌ No pude guardar el pedido. Error: ${escapeMarkdown(e.message)}`);
        }
        return;
    }

    if (data === "EDIT_ORDER") {
        s.saleState.currentStep = "initial";
        await ctx.deleteMessage();
        await say(ctx, "Puedes corregir la información enviando un nuevo mensaje con los datos correctos.");
        return;
    }
}

module.exports = { handleCallbackQuery };