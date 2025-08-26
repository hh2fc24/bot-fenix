// auth.js - Módulo de Autenticación de Vendedores

async function getSellerId(supabase, telegramUsername) {
    if (!telegramUsername) {
      console.warn('Intento de acceso sin username de Telegram.');
      return null;
    }
  
    try {
      const { data, error } = await supabase
        .from('people')
        .select('id') // Seleccionamos el UUID del vendedor
        .eq('telegram_username', telegramUsername)
        .eq('active', true) // Solo permite vendedores activos
        .single();
  
      if (error) {
        // No es un error si no encuentra al usuario, eso es esperado.
        if (error.code !== 'PGRST116') { 
          console.error('Error al buscar vendedor:', error);
        }
        return null;
      }
  
      return data ? data.id : null; // Devuelve el UUID del vendedor o null si no se encuentra
    
    } catch (e) {
      console.error('Excepción crítica en getSellerId:', e);
      return null;
    }
  }
  
  // Exportamos la función para que pueda ser usada en otros archivos
  module.exports = { getSellerId };
  