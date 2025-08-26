const { Markup } = require('telegraf');
const { getState, getInitialState, STATE } = require('../state');
const { say } = require('../utils');
const { insertReturn } = require('../services/supabase');
const { supabase } = require('../config'); // Necesitamos supabase para buscar el pedido

async function startReturnFlow(ctx) {
  const s = getState(ctx.chat.id);
  const currentUserProfile = s.userProfile;
  STATE.set(ctx.chat.id, getInitialState()); // Reinicia el estado
  const new_s = getState(ctx.chat.id);
  new_s.userProfile = currentUserProfile;
  new_s.returnState.currentStep = "awaiting_order_no";
  await say(ctx, "Entendido. Para iniciar una devolución, por favor, envíame el número del pedido (Ej: 12345).");
}

async function advanceReturnConversation(ctx) {
  const s = getState(ctx.chat.id);
  const rState = s.returnState;
  const step = rState.currentStep;

  if (step === "awaiting_items") {
    const order = rState.originalOrder;
    const itemButtons = order.order_items.map((item) =>
      Markup.button.callback(`${item.quantity}x ${item.product_name}`, `RETURN_ITEM_${item.id}`)
    );
    await say(ctx, `Pedido #${order.order_no} encontrado (Cliente: *${order.customer_name}*). ¿Qué producto se va a devolver?`, Markup.inlineKeyboard(itemButtons, { columns: 1 }));
    return;
  }
  if (step === "awaiting_quantity") {
    const productName = rState.returnDetails.items[0].product_name;
    await say(ctx, `Entendido. ¿Cuántas unidades de *${productName}* se devuelven?`);
    return;
  }
  if (step === "awaiting_reason") {
    await say(ctx, "Perfecto. Ahora, describe brevemente el motivo de la devolución.");
    return;
  }
  if (step === "awaiting_amount") {
    await say(ctx, "¿Cuál es el monto total en Bs. que se devolverá al cliente?");
    return;
  }
  if (step === "confirming") {
    const summary = buildReturnSummaryText(rState);
    await say(ctx, `📝 **Resumen de Devolución**\nPor favor, revisa que todo sea correcto:\n\n${summary}`, Markup.inlineKeyboard([
        Markup.button.callback("✅ Confirmar Devolución", "CONFIRM_RETURN"),
        Markup.button.callback("❌ Cancelar", "CANCEL_RETURN"),
      ]));
  }
}

function buildReturnSummaryText(rState) {
  const { originalOrder, returnDetails } = rState;
  const lines = [
    `• *Pedido Original:* #${originalOrder.order_no}`,
    `• *Cliente:* ${originalOrder.customer_name}`,
    `• *Vendedor Original:* ${originalOrder.seller}`,
    `• *Ítem a devolver:*`,
    ...returnDetails.items.map((it) => `  - ${it.quantity}x ${it.product_name}`),
    `• *Motivo:* ${returnDetails.reason}`,
    `• *Monto a Devolver:* ${returnDetails.return_amount} Bs.`,
  ];
  return lines.join("\n");
}

async function handleReturnText(ctx, text) {
    const s = getState(ctx.chat.id);
    const rState = s.returnState;

    switch (rState.currentStep) {
        case 'awaiting_order_no':
            const { data: order, error } = await supabase
                .from("orders")
                .select(`id, order_no, customer_name, seller, order_items(id, product_name, quantity)`)
                .eq("order_no", text.trim())
                .single();
            
            if (error || !order) {
                return say(ctx, `❌ No encontré ningún pedido con el número *${text.trim()}*.`);
            }
            rState.originalOrder = order;
            rState.currentStep = "awaiting_items";
            break;

        case 'awaiting_quantity':
            const qty = parseInt(text.trim(), 10);
            if (isNaN(qty) || qty <= 0) {
                return say(ctx, "Por favor, introduce una cantidad numérica válida.");
            }
            rState.returnDetails.items[0].quantity = qty;
            rState.currentStep = "awaiting_reason";
            break;

        case 'awaiting_reason':
            rState.returnDetails.reason = text.trim();
            rState.currentStep = "awaiting_amount";
            break;

        case 'awaiting_amount':
            const amount = parseFloat(text.replace(/[^0-9.,]/g, "").replace(",", "."));
            if (isNaN(amount) || amount < 0) {
                return say(ctx, "Por favor, introduce un monto válido.");
            }
            rState.returnDetails.return_amount = amount;
            rState.currentStep = "confirming";
            break;
    }
    await advanceReturnConversation(ctx);
}

module.exports = {
  startReturnFlow,
  advanceReturnConversation,
  handleReturnText,
  insertReturn,
};
