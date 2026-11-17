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
 *  tienda. El mensaje que manda la base (un `Error` común, que armamos nosotros) se respeta tal cual. Cualquier OTRO error
 *  del navegador (un `DOMException` al abrir una foto: «An error occured reading the Blob argument to createImageBitmap»,
 *  2026-11-16) también es un `Error`, pero su texto es técnico y en inglés: va el de respaldo. */
export function motivoDeFalla(e: unknown, porDefecto: string): string {
  if (e instanceof TypeError) return SIN_RED;
  return e instanceof Error && e.name === "Error" && e.message.trim() ? e.message : porDefecto;
}

/** La segunda opción de una foto con dibujo (Felipe 2026-11-14). Lo de casi siempre es «Es una mezcla»: el dibujo ya lo dice el patrón
 *  del paso 2 (Floral, Rayas) y el color queda como la mezcla de sus tonos. «Elegir el estampado» solo tiene sentido si la lista tiene
 *  algún color estampado (ADR-0634); sin ninguno (producción al 2026-11-14: 123 lisos y 1 textura), prometía algo que la lista no traía. */
export function segundaOpcionDelDibujo(carta: readonly { tipo?: string | null }[]): "Elegir el estampado" | "Elegir otro color" {
  return carta.some((c) => c.tipo === "estampado") ? "Elegir el estampado" : "Elegir otro color";
}

/** Dónde entran las fotos que se SUMAN a una prenda que ya existe (Recibir, Felipe 2026-11-14): detrás de las que ya tiene, y la primera solo
 *  es la principal si la prenda no tiene ninguna. Una prenda nueva no tiene fotos: empieza en 0 y la primera es la principal. */
export function lugarDeLasFotosNuevas(existentes: readonly { orden: number; es_principal: boolean }[]): { desde: number; primeraEsPrincipal: boolean } {
  return {
    desde: existentes.reduce((mayor, f) => Math.max(mayor, f.orden + 1), 0),
    primeraEsPrincipal: !existentes.some((f) => f.es_principal),
  };
}

/**
 * Las fotos YA EN SU COLOR que se preparan al ENCENDER «Catálogo con IA» (Felipe 2026-11-16: «si no lo tengo activo y lo activo de nuevo
 * tengo que eliminar y agregar de nuevo, cosa que quita tiempo»). Solo la PRIMERA de cada color, la de frente: es la que se ve y la que hace
 * de molde; la espalda o un detalle no son una foto de catálogo «de frente» y pagarlos no mejora nada (revisión del 2026-11-16). Quedan fuera
 * las que ya tienen su versión de IA (no se paga dos veces) y las que ya se están preparando o ya llegaron (un apagar y encender rápido no
 * repite el pedido).
 */
export function fotosParaLaIAAlEncender<F extends { clave: string; colorCodigo: string | null; ia?: unknown }>(
  enSuColor: readonly F[],
  yaPedidas: ReadonlySet<string>,
): F[] {
  const colores = new Set<string | null>();
  const salen: F[] = [];
  for (const f of enSuColor) {
    if (colores.has(f.colorCodigo)) continue;
    colores.add(f.colorCodigo);
    if (!f.ia && !yaPedidas.has(f.clave)) salen.push(f);
  }
  return salen;
}

/**
 * Las fotos que todavía ESPERAN UNA RESPUESTA (su color) y vuelven a pasar por la IA al encenderla: se arreglan y se vuelven a leer sus
 * colores sobre la foto limpia, sin fondo, como si se hubieran subido con la IA encendida. Si no, la pregunta seguiría armada con la foto
 * vieja («No se ve la prenda», «Tiene 5 colores») bajo una foto que ya no es esa (revisión del 2026-11-16). Las demás ya van por su camino.
 * Fuera: la que ya tiene su respuesta completa y solo espera que se reintente la mezcla.
 */
export function pendientesParaLaIAAlEncender<P extends { estado: string; ia?: unknown; eleccion?: (string | null)[] }>(pendientes: readonly P[]): P[] {
  // Una que ya tiene su respuesta completa (la mezcla que se eligió y no se pudo armar: sin red, o falta quién registra) no se reinicia: se
  // perdería lo que la persona contestó y se pagaría una lectura que nadie pidió.
  return pendientes.filter((p) => p.estado === "pregunta" && !p.ia && codigosParaReintentar(p.eleccion) === null);
}

/**
 * El aviso cuando la IA no pudo con algunas de las fotos que se mandaron al ENCENDERLA: UNO solo para toda la tanda (antes salía uno por foto,
 * iguales, y el siguiente tapaba al anterior: se veía «tu foto», en singular, con tres fallas). Dice cuántas y cuáles; `null` si llegaron todas.
 * `colores`: el nombre del color de cada foto que falló y ya lo tenía; `sinColor`: cuántas fallaron mientras esperaban su color.
 */
export function avisoDeIAQueNoPudo(colores: readonly string[], sinColor: number): { titulo: string; detalle: string } | null {
  const total = colores.length + sinColor;
  if (total === 0) return null;
  const cuales = [...new Set(colores)];
  if (sinColor) cuales.push(sinColor === 1 ? "una que espera su color" : `${sinColor} que esperan su color`);
  return {
    titulo: total === 1 ? "La IA no pudo con una foto: quedó como la subiste." : `La IA no pudo con ${total} fotos: quedaron como las subiste.`,
    detalle: cuales.join(" · "),
  };
}
