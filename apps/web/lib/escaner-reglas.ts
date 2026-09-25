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

export type EstadoEscaneo = "agregada" | "agotada" | "tope" | "no-encontrada";
export type ResultadoEscaneo = { estado: EstadoEscaneo; codigo: string; nombre?: string };

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
    case "tope":
      return { tono: "ambar", texto: `Ya están todas las ${r.nombre ?? r.codigo} en el ticket` };
    case "no-encontrada":
      return { tono: "ambar", texto: `No encontramos «${r.codigo}» en esta tienda` };
  }
}
