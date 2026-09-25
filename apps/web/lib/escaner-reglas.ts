// Escanear con la cámara del teléfono en Vender (2026-09-25, pedido de Felipe).
//
// En el mostrador la encargada tiene un lector que «escribe» el código en el campo de Vender y termina con Enter. Desde un
// teléfono no hay lector: la cámara lee el QR de la etiqueta (`EtiquetaPrecio` → `CodigoQR` con el código de la prenda) y
// entrega el MISMO texto que habría tipeado el lector. Por eso lo que decide qué prenda es y si entra al ticket no vive
// acá: es el camino de siempre (`resolverCodigoV2` + `agregar` en `PuntoDeVenta`). Acá solo vive lo que es propio de la
// cámara, que sí es distinto del lector: la cámara ve la MISMA etiqueta 8 veces por segundo mientras la tienes delante.

/** Un teléfono: puntero táctil y pantalla angosta (o apaisada y baja). Una tablet de mostrador con lector bluetooth queda
 *  fuera a propósito: ahí el lector escribe en el campo de siempre, y cambiarlo por un botón la dejaría sin escáner. */
export const MQ_TELEFONO = "(pointer: coarse) and (max-width: 639.98px), (pointer: coarse) and (max-height: 500px)";

/** Cuánto se ignora el mismo código después de leerlo: lo que tarda en apartarse la prenda de la cámara. Para sumar
 *  una segunda unidad de la misma prenda basta con sacarla del cuadro y volver a mostrarla. */
export const PAUSA_MISMO_CODIGO_MS = 2000;

/** `en_almacen`: el piso está en 0 pero hay en el almacén de esta tienda (D-40) — no entra al ticket hasta que la bajen,
 *  y no es lo mismo que `agotada`. Mismo nombre que devuelve `motivoNoCobrable` (`lib/vender-stock-local.ts`). */
export type EstadoEscaneo = "agregada" | "agotada" | "en_almacen" | "tope" | "no-encontrada";
export type ResultadoEscaneo = {
  estado: EstadoEscaneo;
  codigo: string;
  /** «Blusa Emma · M»: lo que se lee en el aviso. */
  nombre?: string;
  /** Lo que muestra la tarjeta que vuela al ticket (ausente si el código no es de ninguna prenda). */
  prenda?: { referencia: string; detalle: string; precio: number; fotoUrl: string | null };
  /** Cuántas hay en el almacén de esta tienda (sin lo apartado); null/ausente sin almacén. La cámara no muestra el
   *  aviso de arriba (le taparía la ✕), así que su tarjeta tiene que decir por sí sola dónde está la prenda. */
  almacen?: number | null;
};

/** Cuánto dura el vuelo de la tarjeta al ticket, de que aparece a que entra en la bolsa. Son tres tramos, cada uno dentro
 *  del rango de ADR-0136: aparece (≈200 ms), se deja leer (≈240 ms) y viaja (≈460 ms). */
export const MS_VUELO = 900;
/** Una lectura que NO entra al ticket: la tarjeta aparece, se deja leer y se desvanece donde está. */
export const MS_AVISO = 1100;

/**
 * El camino de la tarjeta desde el visor hasta la bolsa del ticket (`dx`, `dy`: cuánto hay que moverla), en keyframes de
 * Web Animations. Aparece creciendo un poco, se queda quieta para que se lea, y viaja en ARCO (primero sube apenas y se va
 * hacia el costado, después cae a la bolsa) encogiéndose: así se lee «entró ahí», no «se fue». Sin rebote: la escala
 * nunca pasa de 1.
 */
export function keyframesVuelo(dx: number, dy: number): Keyframe[] {
  return [
    { offset: 0, transform: "translate3d(0, 10px, 0) scale(0.86)", opacity: 0 },
    { offset: 0.22, transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
    { offset: 0.49, transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
    { offset: 0.72, transform: `translate3d(${dx * 0.42}px, ${dy * 0.3 - 18}px, 0) scale(0.62)`, opacity: 1 },
    { offset: 1, transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.14)`, opacity: 0.25 },
  ];
}

/** Una lectura que no entra: aparece, se deja leer y sube apagándose en su lugar. */
export function keyframesAviso(): Keyframe[] {
  return [
    { offset: 0, transform: "translate3d(0, 10px, 0) scale(0.92)", opacity: 0 },
    { offset: 0.2, transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
    { offset: 0.75, transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
    { offset: 1, transform: "translate3d(0, -14px, 0) scale(0.98)", opacity: 0 },
  ];
}

/** El texto del QR tal cual lo usaría el lector: sin espacios ni saltos alrededor. */
export function normalizarLectura(crudo: string): string {
  return crudo.trim();
}

/** ¿Es la misma etiqueta que se acaba de leer y todavía no pasó la pausa? */
export function esLecturaRepetida(codigo: string, ultima: { codigo: string; en: number } | null, ahora: number): boolean {
  return ultima !== null && ultima.codigo === codigo && ahora - ultima.en < PAUSA_MISMO_CODIGO_MS;
}

/** Lo que se le dice a la encargada después de cada lectura, en palabras del mostrador. */
export function mensajeEscaneo(r: ResultadoEscaneo): { tono: "verde" | "ambar"; texto: string } {
  switch (r.estado) {
    case "agregada":
      return { tono: "verde", texto: `${r.nombre ?? r.codigo} · al ticket` };
    case "agotada":
      return { tono: "ambar", texto: `${r.nombre ?? r.codigo} está agotada aquí` };
    case "en_almacen":
      return { tono: "ambar", texto: `${r.nombre ?? r.codigo} no entró: está en el almacén` };
    case "tope":
      return (r.almacen ?? 0) > 0
        ? { tono: "ambar", texto: `${r.nombre ?? r.codigo} no entró: las del piso ya están en el ticket y las demás en el almacén` }
        : { tono: "ambar", texto: `Ya están todas las ${r.nombre ?? r.codigo} en el ticket` };
    case "no-encontrada":
      return { tono: "ambar", texto: `No encontramos «${r.codigo}» en esta tienda` };
  }
}

/** Por qué una lectura NO entró, en dos o tres palabras: la etiqueta ámbar de la fila de la bandeja y de la tarjeta.
 *  Corta a propósito (la fila tiene ~120 px a 375 px de ancho). La cámara no pinta el aviso largo, así que la etiqueta
 *  tiene que leerse como un NO: «2 en el almacén» sonaba a buena noticia y la colaboradora no veía que la prenda no
 *  entró al ticket. Por eso lo del almacén (piso en 0, o todas las del piso ya en el ticket) empieza por «No entró»; qué
 *  hacer lo dice un solo aviso al cerrar la cámara (`avisoQuedaronEnAlmacen`). */
export function estadoCorto(r: ResultadoEscaneo): string | null {
  const enAlmacen = (r.almacen ?? 0) > 0;
  switch (r.estado) {
    case "agregada":
      return null;
    case "agotada":
      return "Agotada aquí";
    case "en_almacen":
      return "No entró · en almacén";
    case "tope":
      return enAlmacen ? "No entró · en almacén" : "Sin más stock";
    case "no-encontrada":
      return "No es de esta tienda";
  }
}
