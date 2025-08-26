const { Markup } = require('telegraf');
const { getState } = require('../state');
const { say, calculateTotalAmount, normalizePhone } = require('../utils');
const { findSimilarProducts, logUnrecognizedProduct } = require('../services/supabase');

async function advanceConversation(ctx) {
  const s = getState(ctx.chat.id);
  const p = s.saleState.partialOrder;

  if (s.saleState.ambiguousItems && s.saleState.ambiguousItems.length > 0) {
    s.saleState.currentStep = 'awaiting_clarification';
    const nextAmbiguousItem = s.saleState.ambiguousItems[0];
    const buttons = nextAmbiguousItem.options.map(prod => [Markup.button.callback(prod.name, `CLARIFY_${prod.id}`)]);
    buttons.push([Markup.button.callback("❌ Dejar como está", "CLARIFY_NONE")]);
    return say(ctx, `Para *"${nextAmbiguousItem.originalItem.name}"*, encontré estas opciones. Por favor, selecciona el nombre correcto:`, Markup.inlineKeyboard(buttons));
  }
  
  const itemWithoutSaleType = p.items.find(item => !item.sale_type);
  if (p.items.length > 0 && itemWithoutSaleType) {
    s.saleState.currentStep = 'awaiting_sale_type';
    s.saleState.itemNameToProcess = itemWithoutSaleType.original_name || itemWithoutSaleType.name; 
    return say(ctx, `Para el producto *"${s.saleState.itemNameToProcess}"*, ¿es venta por mayor o al detalle?`, buildSaleTypeKeyboard(s.saleState.itemNameToProcess));
  }

  // --- NUEVA LÓGICA PARA PREGUNTAR PRECIO ---
  const itemWithoutPrice = p.items.find(item => item.unit_price === null || item.unit_price === undefined);
  if (p.items.length > 0 && itemWithoutPrice) {
      s.saleState.currentStep = 'awaiting_price';
      s.saleState.itemNameToProcess = itemWithoutPrice.name;
      return say(ctx, `¿Cuál es el precio unitario en Bs. para *${itemWithoutPrice.name}*?`);
  }
  // --- FIN DE NUEVA LÓGICA ---

  const nextItemWithoutPhoto = p.items.find(item => item.image_url === null);
  if (p.items.length > 0 && nextItemWithoutPhoto) {
    s.saleState.currentStep = 'awaiting_photo';
    s.saleState.awaitingPhotoForBaseProduct = nextItemWithoutPhoto.name;
    return say(ctx, `Ahora, por favor, envía la foto de *${nextItemWithoutPhoto.name}*`);
  }

  if (p.items.length === 0) {
    if (p.location) {
        s.saleState.currentStep = 'awaiting_items';
        return say(ctx, "✅ Ubicación registrada. Ahora, por favor, envíame la lista de productos.");
    }
    s.saleState.currentStep = "initial";
    return;
  }

  if (!p.customer_name || !p.customer_phone) {
    s.saleState.currentStep = "awaiting_customer";
    let question = "";
    if (!p.customer_name && !p.customer_phone) {
      question = "Tengo los productos. ¿A nombre de quién es el pedido y cuál es su número de teléfono?";
    } else if (!p.customer_name) {
      question = `✅ Teléfono ${p.customer_phone} registrado. Ahora, por favor, dime ¿a nombre de quién es el pedido?`;
    } else {
      question = `✅ Nombre "${p.customer_name}" registrado. Ahora, por favor, envíame el número de teléfono.`;
    }
    return say(ctx, question);
  }

  if (p.is_encomienda === null) {
    s.saleState.currentStep = "awaiting_order_type";
    return say(ctx, "Ok, ¿el pedido es para entrega local o es una encomienda?", buildOrderTypeKeyboard());
  }

  if (p.is_encomienda === true && !p.destino) {
    s.saleState.currentStep = "awaiting_destination";
    return say(ctx, "Entendido, es encomienda. ¿A qué ciudad o departamento la enviamos?");
  }

  if (p.is_encomienda === false && !p.location) {
    s.saleState.currentStep = "awaiting_location";
    return say(ctx, "Ok, es entrega local. Por favor, envíame la ubicación (link de Google Maps o coordenadas).");
  }

  if (p.payments.length === 0) {
    if (!s.saleState.paymentMethod) {
      s.saleState.currentStep = "awaiting_payment_method";
      return say(ctx, "Ya casi terminamos. ¿Cuál será el método de pago?", buildPaymentMethodKeyboard());
    }
    s.saleState.currentStep = "awaiting_payment_split";
    const total = calculateTotalAmount(p.items);
    return say(ctx, `Perfecto, pago con *${s.saleState.paymentMethod}*. El total es de *Bs ${total.toFixed(2)}*. ¿Cómo procederá el cliente?`, buildPaymentSplitKeyboard(total.toFixed(2)));
  }

  const proofNeeded = p.payments.find(pay => pay.status === "completado" && pay.method !== "Efectivo" && !pay.payment_proof_url);
  if (proofNeeded) {
    s.saleState.currentStep = "awaiting_payment_proof";
    return say(ctx, `Para confirmar el pago de *Bs ${proofNeeded.amount.toFixed(2)}* con *${proofNeeded.method}*, por favor envía la foto del comprobante.`);
  }

  s.saleState.currentStep = "confirming";
  const summary = buildSummaryText(p);
  return say(ctx, `📝 **Resumen del Pedido**\nPor favor, revisa que todo esté correcto:\n\n${summary}`, buildFinalConfirmKeyboard());
}

// (El resto de las funciones de salesFlow.js no cambian)
async function handleProductAddition(ctx, item) {
    const s = getState(ctx.chat.id);
    const similarProducts = await findSimilarProducts(item.name);

    if (similarProducts.length === 1) {
        const productData = { ...item, name: similarProducts[0].name, is_recognized: true, original_name: item.name, image_url: null };
        s.saleState.partialOrder.items.push(productData);
        const priceInfo = productData.unit_price ? ` (a Bs ${productData.unit_price})` : '';
        await say(ctx, `✅ Producto "${productData.original_name}" normalizado a *${productData.name}*${priceInfo}.`);
        return { needsClarification: false };
    } else if (similarProducts.length > 1) {
        s.saleState.ambiguousItems = s.saleState.ambiguousItems || [];
        s.saleState.ambiguousItems.push({ originalItem: item, options: similarProducts });
        return { needsClarification: true };
    } else {
        await logUnrecognizedProduct(item.name);
        const productData = { ...item, name: item.name.toUpperCase(), is_recognized: false, original_name: item.name, image_url: null };
        s.saleState.partialOrder.items.push(productData);
        const priceInfo = productData.unit_price ? ` (a Bs ${productData.unit_price})` : '';
        await say(ctx, `✅ Producto "${productData.original_name}" añadido como *${productData.name}* (no reconocido)${priceInfo}.`);
        return { needsClarification: false };
    }
}

async function processClarification(ctx, choice, ambiguousItem) {
    const s = getState(ctx.chat.id);
    const p = s.saleState.partialOrder;
    
    let productData;
    if (choice === "NONE") {
        productData = { ...ambiguousItem.originalItem, is_recognized: false, original_name: ambiguousItem.originalItem.name, image_url: null };
        await logUnrecognizedProduct(ambiguousItem.originalItem.name);
    } else {
        const selectedProduct = ambiguousItem.options.find(opt => opt.id.toString() === choice);
        if (selectedProduct) {
            productData = { ...ambiguousItem.originalItem, name: selectedProduct.name, is_recognized: true, original_name: ambiguousItem.originalItem.name, image_url: null };
        }
    }

    if (productData) {
        // Asignamos el precio si venía en el objeto original
        productData.unit_price = ambiguousItem.originalItem.unit_price;
        p.items.push(productData);
        const priceInfo = productData.unit_price ? ` (a Bs ${productData.unit_price})` : '';
        const recognitionInfo = productData.is_recognized ? `normalizado a *${productData.name}*` : `añadido como *${productData.name}*`;
        await say(ctx, `✅ Producto "${productData.original_name}" ${recognitionInfo}${priceInfo}.`);
    }
}

function buildSaleTypeKeyboard(itemName) {
  const encodedItemName = encodeURIComponent(itemName);
  return Markup.inlineKeyboard([
    Markup.button.callback("📦 Venta por Mayor", `SET_SALE_TYPE_WHOLESALE_${encodedItemName}`),
    Markup.button.callback("🛍️ Venta al Detalle", `SET_SALE_TYPE_RETAIL_${encodedItemName}`),
  ]);
}
function buildOrderTypeKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback("🛵 Entrega Local", "SET_ORDER_TYPE_LOCAL"),
    Markup.button.callback("📦 Encomienda", "SET_ORDER_TYPE_ENCOMIENDA"),
  ]);
}
function buildPaymentMethodKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💵 Efectivo", "SET_PAYMENT_EFECTIVO"), Markup.button.callback("📲 QR", "SET_PAYMENT_QR")],
    [Markup.button.callback("🏦 Transferencia", "SET_PAYMENT_TRANSFERENCIA")],
  ]);
}
function buildPaymentSplitKeyboard(total) {
  return Markup.inlineKeyboard([
    Markup.button.callback(`Pagar Total (Bs ${total}) Ahora`, "PAY_FULL_NOW"),
    Markup.button.callback("Pagar una Parte Ahora", "PAY_PARTIAL_NOW"),
    Markup.button.callback("Pagar Todo en la Entrega", "PAY_FULL_ON_DELIVERY"),
  ]);
}
function buildFinalConfirmKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback("✅ Confirmar y Enviar Pedido", "CONFIRM_ORDER"),
    Markup.button.callback("✏️ Editar", "EDIT_ORDER"),
  ]);
}
function buildSummaryText(p) {
    const lines = [];
    const totalAmount = calculateTotalAmount(p.items);
    if (p.items?.length) {
      lines.push("• **Productos:**");
      const itemsText = p.items.map((item, index) => {
          const statusIcon = item.is_recognized ? '✅' : '⚠️';
          const priceText = item.unit_price ? `(Bs ${Number(item.unit_price).toFixed(2)})` : '(Sin precio)';
          const saleTypeText = item.sale_type ? ` [${item.sale_type}]` : '';
          return `  ${index + 1}. ${statusIcon} ${item.qty}× *${item.name}*${saleTypeText} ${priceText}`;
      }).join("\n");
      lines.push(itemsText);
    }
    lines.push(`\n• 💰 **Monto Total: ${totalAmount.toFixed(2)} Bs.**`);
    if (p.payments?.length) {
      lines.push("\n• **Pagos Registrados:**");
      p.payments.forEach((payment) => {
        const statusText = payment.status === "completado" ? "✅ Pagado" : "🚚 A pagar en entrega";
        const proofText = payment.payment_proof_url ? " (comprobante adjunto)" : "";
        lines.push(`  - Bs ${payment.amount.toFixed(2)} (${payment.method}) - ${statusText}${proofText}`);
      });
    }
    if (p.customer_name) lines.push(`\n• **Cliente:** ${p.customer_name} (${normalizePhone(p.customer_phone) || 'Teléfono no especificado'})`);
    if (p.time_preference) lines.push(`• **Horario:** ${p.time_preference}`);
    if (p.is_encomienda === false && p.location?.address) lines.push(`• **Dirección:** ${p.location.address}`);
    else if (p.is_encomienda === true && p.destino) lines.push(`• **Destino (Encomienda):** ${p.destino}`);
    if (p.notes?.length > 0) lines.push(`• **Notas:** ${p.notes.join(" | ")}`);
    return lines.join("\n");
}

module.exports = {
    advanceConversation,
    handleProductAddition,
    processClarification,
};