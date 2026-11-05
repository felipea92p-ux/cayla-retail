/**
 * Los emojis que se ponen de un toque en un mensaje de WhatsApp: UNA sola lista, igual en toda hoja que edita un mensaje (Felipe
 * 2026-11-04: «la misma cantidad de íconos en ambos lados, y como regla»). Trae los de los mensajes de fábrica, para que quien borra
 * uno pueda volver a ponerlo. Un emoji nuevo se agrega aquí y llega a todas; lo vigila `fila-emojis.test.ts`.
 */
export const EMOJIS_DEL_MENSAJE = ["👋", "😊", "🛍️", "💛", "🎉", "🙏", "✨", "👗", "🎂", "💐", "🏷️"] as const;
