const { supabase } = require('../config');
const { normalizeString, normalizePhone, parseTimeRange, calculateTotalAmount } = require('../utils');

async function getUserProfile(telegramUsername) {
  if (!telegramUsername) {
    console.warn("getUserProfile: telegramUsername es nulo o indefinido");
    return null;
  }
  try {
    const { data, error } = await supabase
      .from("people")
      .select("id, role, full_name, telegram_username, active")
      .eq("telegram_username", telegramUsername)
      .eq("active", true)
      .maybeSingle();
    if (error) {
      console.error("Error en getUserProfile:", error?.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error("Error inesperado en getUserProfile:", e?.message);
    return null;
  }
}

async function findSimilarProducts(productName, limit = 3) {
  if (!productName) return [];
  const normalizedName = normalizeString(productName);
  try {
    const { data, error } = await supabase.rpc("fn_search_products", {
      p_search_term: normalizedName,
      p_match_limit: limit,
    });
    if (error) {
      console.error(`Error en RPC fn_search_products para "${normalizedName}":`, error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("Error inesperado buscando productos similares:", e);
    return [];
  }
}

async function logUnrecognizedProduct(productName) {
  try {
    const { error } = await supabase
      .from("unrecognized_products")
      .upsert(
        { product_name: productName, last_seen: new Date().toISOString() },
        { onConflict: "product_name" }
      );
    if (error) throw error;
  } catch (e) {
    console.warn("Error registrando producto no reconocido:", e.message);
  }
}

async function insertOrder({ sellerProfile, orderData, chatId }) {
  const items = orderData.items || [];
  const totalAmount = calculateTotalAmount(items);
  const timeRange = parseTimeRange(orderData.time_preference);
  const role = sellerProfile ? (normalizeString(sellerProfile.role) === "promotor" ? "delivery" : "seller") : "seller";

  const { data: insertedOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      seller: sellerProfile?.full_name || `tg_user_${chatId}`,
      sales_user_id: sellerProfile?.id || null,
      sales_role: role,
      customer_id: normalizePhone(orderData.customer_phone) || `anon-${chatId}`,
      amount: totalAmount,
      status: "pending",
      customer_phone: normalizePhone(orderData.customer_phone),
      customer_name: orderData.customer_name,
      delivery_address: orderData.is_encomienda ? null : orderData.location?.address,
      delivery_geo_lat: orderData.is_encomienda ? null : orderData.location?.lat,
      delivery_geo_lng: orderData.is_encomienda ? null : orderData.location?.lng,
      delivery_date: orderData.delivery_date,
      delivery_time_from: timeRange.from,
      delivery_time_to: timeRange.to,
      notes: orderData.notes?.join(" | "),
      image_url: orderData.image_url,
      is_encomienda: orderData.is_encomienda,
      destino: orderData.destino,
      fecha_salida_bodega: orderData.fecha_salida_bodega,
      fecha_entrega_encomienda: orderData.fecha_entrega_encomienda,
      sale_type: orderData.sale_type,
    })
    .select("id, order_no")
    .single();

  if (orderError) throw orderError;

  const orderItems = items.map((item) => ({
    order_id: insertedOrder.id,
    product_name: item.name,
    quantity: Number(item.qty || 1),
    unit_price: Number(item.unit_price || 0),
    subtotal: Number(item.qty || 1) * Number(item.unit_price || 0),
    sale_type: orderData.sale_type,
    base_product_name: item.base_product_name || item.name,
    is_recognized: item.is_recognized,
    original_name: item.original_name,
    image_url: item.image_url || null,
  }));

  const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
  if (itemsError) throw itemsError;

  if (orderData.payments && orderData.payments.length > 0) {
    const payments = orderData.payments.map((p) => ({ ...p, order_id: insertedOrder.id }));
    const { error: paymentsError } = await supabase.from("order_payments").insert(payments);
    if (paymentsError) throw paymentsError;
  }

  return insertedOrder;
}

async function insertReturn({ originalOrder, returnDetails, userProfile }) {
    try {
      const { data: returnData, error } = await supabase
        .from("product_returns")
        .insert({
          original_order_id: originalOrder.id,
          original_order_no: originalOrder.order_no,
          original_seller_name: originalOrder.seller,
          original_customer_name: originalOrder.customer_name,
          return_date: new Date(),
          return_amount: returnDetails.return_amount,
          reason: returnDetails.reason,
          processed_by_user_id: userProfile?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      for (const item of returnDetails.items) {
        await supabase.from("return_items").insert({
          return_id: returnData.id,
          product_name: item.product_name,
          quantity: item.quantity,
        });
      }
      return returnData;
    } catch (e) {
      console.error("Error al insertar devolución:", e);
      throw e;
    }
}

async function uploadTelegramPhotoToSupabase(ctx, bucket) {
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const response = await require('axios').get(fileLink.href, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(response.data);
    const fileExtension = (fileLink.pathname.split(".").pop() || "jpg").split("?")[0];
    const fileName = `${bucket}_${ctx.chat.id}_${Date.now()}.${fileExtension}`;
    
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, imageBuffer, {
        contentType: response.headers["content-type"] || "image/jpeg",
        upsert: false,
      });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
  } catch (e) {
    console.error(`Fallo al subir imagen al bucket ${bucket}:`, e?.message);
    return null;
  }
}


module.exports = {
  getUserProfile,
  findSimilarProducts,
  logUnrecognizedProduct,
  insertOrder,
  insertReturn,
  uploadTelegramPhotoToSupabase,
};
