const { getUserProfile } = require('../services/supabase');
const { getState } = require('../state');
const { say, timeSalutation, normalizeString } = require('../utils');

async function handleStartCommand(ctx) {
    const s = getState(ctx.chat.id);
    if (!s.userProfile) {
        s.userProfile = await getUserProfile(ctx.from?.username);
    }
    
    const profile = s.userProfile;
    const name = profile?.full_name || ctx.from?.first_name || 'allí';
    const saludo = `${timeSalutation()}, ${name}!`;
    
    const role = profile ? normalizeString(profile.role) : '';
    
    if (role === 'promotor') {
        await say(ctx, `${saludo}\nSoy Agente Fenix Delivery. Envíame el número de pedido y te ayudaré con la entrega.`);
    } else {
        await say(ctx, `${saludo}\nSoy Agente Fenix. Envíame los productos de tu pedido, la ubicación y el horario. También puedes enviar una foto de la lista.`);
    }
}

module.exports = { handleStartCommand };
