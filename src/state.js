const STATE = new Map();
const CONV = new Map();

function getInitialState() {
  return {
    userProfile: null,
    saleState: {
      currentStep: "initial",
      paymentMethod: null,
      awaitingPhotoForBaseProduct: null,
      ambiguousItems: [],
      partialOrder: {
        items: [],
        payments: [],
        time_preference: null,
        delivery_date: null,
        customer_phone: null,
        customer_name: null,
        location: null,
        notes: [],
        image_url: null,
        is_encomienda: null,
        destino: null,
        fecha_salida_bodega: null,
        fecha_entrega_encomienda: null,
        sale_type: null,
      },
    },
    deliveryState: { currentOrderId: null, expecting: null },
    returnState: {
      currentStep: "initial",
      originalOrder: null,
      returnDetails: { items: [], reason: null, return_amount: null },
    },
    lastSeen: Date.now(),
  };
}

function getState(chatId) {
  if (!STATE.has(chatId)) {
    STATE.set(chatId, getInitialState());
  }
  const s = STATE.get(chatId);
  s.lastSeen = Date.now();
  return s;
}

function getHistory(chatId) {
  if (!CONV.has(chatId)) {
    CONV.set(chatId, []);
  }
  return CONV.get(chatId);
}

function pushHistory(chatId, message, type = "user") {
  const h = getHistory(chatId);
  h.push({ t: Date.now(), type, message });
  if (h.length > 20) {
    h.splice(0, h.length - 20);
  }
}

module.exports = {
  STATE,
  getInitialState,
  getState,
  getHistory,
  pushHistory,
};
