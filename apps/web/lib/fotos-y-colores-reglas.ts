// Lo que se puede equivocar sin que se note en «Fotos y colores» (ADR-0663), sacado del componente para probarlo sin React.
// Nació de /chaos (2026-11-14, semilla 663): un clic repetido sumaba la misma foto varias veces, «Volver a intentar» rearmaba
// la mezcla con un solo color y, sin red, la tarjeta decía «Failed to fetch».

/** Suma la foto a las del formulario una sola vez: un clic repetido en «Usar X» o en «Volver a intentar» llega dos o tres
 *  veces a asentar la misma foto, y cada copia se subiría al crear el producto. Si ya estaba, devuelve la MISMA lista. */
export function sumarFotoUnaVez<F extends { clave: string }>(fotos: F[], foto: F): F[] {
  return fotos.some((f) => f.clave === foto.clave) ? fotos : [...fotos, foto];
}

/** Con qué colores se reintenta una foto cuya mezcla no se pudo armar: TODOS los que se eligieron, nunca solo el primero
 *  (eso dejaba la prenda en un color liso sin avisar). Si falta contestar una parte, no hay qué reintentar: `null`. */
export function codigosParaReintentar(eleccion: (string | null)[] | undefined): string[] | null {
  if (!eleccion?.length || eleccion.some((c) => c === null)) return null;
  return eleccion as string[];
}

const SIN_RED = "No hay conexión. Revisa el internet y vuelve a intentar.";

/** El motivo que dice la tarjeta cuando algo falla. El error de red del navegador es un `TypeError` con un texto técnico
 *  en inglés que cambia según el navegador («Failed to fetch», «Load failed», «NetworkError…»): se dice en palabras de
 *  tienda. El mensaje que manda la base se respeta tal cual. */
export function motivoDeFalla(e: unknown, porDefecto: string): string {
  if (e instanceof TypeError) return SIN_RED;
  return e instanceof Error && e.message.trim() ? e.message : porDefecto;
}

/** La segunda opción de una foto con dibujo (Felipe 2026-11-14). Lo de casi siempre es «Es una mezcla»: el dibujo ya lo dice el patrón
 *  del paso 2 (Floral, Rayas) y el color queda como la mezcla de sus tonos. «Elegir el estampado» solo tiene sentido si la lista tiene
 *  algún color estampado (ADR-0634); sin ninguno (producción al 2026-11-14: 123 lisos y 1 textura), prometía algo que la lista no traía. */
export function segundaOpcionDelDibujo(carta: readonly { tipo?: string | null }[]): "Elegir el estampado" | "Elegir otro color" {
  return carta.some((c) => c.tipo === "estampado") ? "Elegir el estampado" : "Elegir otro color";
}
