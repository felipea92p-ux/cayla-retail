// Escanear con la cámara del teléfono en Vender (2026-09-25, pedido de Felipe).
//
// En el mostrador la encargada tiene un lector que «escribe» el código en el campo de Vender y termina con Enter. Desde un
// teléfono no hay lector: la cámara lee el QR de la etiqueta (`EtiquetaPrecio` → `CodigoQR` con el código de la prenda) y
// entrega el MISMO texto que habría tipeado el lector. Por eso lo que decide qué prenda es y si entra al ticket no vive
// acá: es el camino de siempre (`resolverCodigoV2` + `agregar` en `PuntoDeVenta`). Acá solo vive lo que es propio de la
// cámara, que sí es distinto del lector: la cámara ve la MISMA etiqueta 8 veces por segundo mientras la tienes delante.

import type { SonidoLectura } from "./conteo-conectado";

/** Un teléfono: puntero táctil y pantalla angosta (o apaisada y baja). Una tablet de mostrador con lector bluetooth queda
 *  fuera a propósito: ahí el lector escribe en el campo de siempre, y cambiarlo por un botón la dejaría sin escáner. */
export const MQ_TELEFONO = "(pointer: coarse) and (max-width: 639.98px), (pointer: coarse) and (max-height: 500px)";

/** Cuánto se ignora el mismo código después de leerlo: lo que tarda en apartarse la prenda de la cámara. Para sumar
 *  una segunda unidad de la misma prenda basta con sacarla del cuadro y volver a mostrarla. */
export const PAUSA_MISMO_CODIGO_MS = 2000;

/** `en_almacen`: el piso está en 0 pero hay en el almacén de esta tienda (D-40) — no entra al ticket hasta que la bajen,
 *  y no es lo mismo que `agotada`. `apartada`: lo único que queda en el piso es de una clienta que lo apartó (no hay
 *  nada libre ni en el almacén): tampoco es `agotada`. Mismos nombres que devuelve `motivoNoCobrable`
 *  (`lib/vender-stock-local.ts`). */
/** `sin_precio`: una prenda de mercadería en S/ 0 no entra al ticket (ADR-0384, `sinPrecioParaVender`). */
/** `repetida`: la prenda ya está en el ticket y no se sumó sola: la cámara pregunta «¿Sumar otra?» (ADR-0562, act. 2026-11-25;
 *  la regla es `decidirLectura`, `lib/lectura-repetida.ts`). */
export type EstadoEscaneo = "agregada" | "agotada" | "en_almacen" | "apartada" | "tope" | "sin_precio" | "no-encontrada" | "repetida";
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
  /** Si entró: cuántas de esta prenda lleva el ticket DESPUÉS de esta lectura (desde 2, la bandeja dice «van 2»). Si es
   *  `repetida`: cuántas lleva AHORA, antes de responder. */
  lleva?: number;
  /** Solo en `repetida`: hasta cuántas admite el ticket de esa prenda (lo libre en el piso), para «Cambiar cantidad». */
  tope?: number | null;
  /** La línea del ticket de esta prenda (su `varianteId`): con ella la bandeja marca la fila que se acaba de leer. */
  clave?: string;
};

/** Una línea del ticket tal como la muestra la bandeja «Escaneadas» de la cámara (2026-11-25, Felipe): UNA fila por prenda con su
 *  cantidad, nunca dos filas de la misma. La arma la pantalla desde su ticket, que es la única fuente de verdad. */
export type LineaEscaneada = {
  clave: string;
  referencia: string;
  /** Color · talla. */
  detalle: string;
  fotoUrl: string | null;
  cantidad: number;
  /** Lo que suma la línea al ticket (cantidad × precio, ya con su descuento). */
  importe: number;
};

/** Las filas de la bandeja: la más nueva arriba (el ticket guarda el orden en que entraron), sin repetir una prenda. */
export function filasDeLaBandeja(lineas: readonly LineaEscaneada[]): LineaEscaneada[] {
  const vistas = new Set<string>();
  const filas: LineaEscaneada[] = [];
  for (let i = lineas.length - 1; i >= 0; i--) {
    const l = lineas[i];
    if (l.cantidad <= 0 || vistas.has(l.clave)) continue;
    vistas.add(l.clave);
    filas.push(l);
  }
  return filas;
}

/** El aviso que sale sobre la cámara después de cada lectura y se va solo (2026-11-25, Felipe: «sin más stock» no se queda en la
 *  bandeja). `titulo` es qué pasó en dos o tres palabras; `nombre`, qué prenda. */
export function avisoDeLectura(r: ResultadoEscaneo): { tono: "verde" | "ambar"; titulo: string; nombre: string } {
  const nombre = r.prenda ? [r.prenda.referencia, r.prenda.detalle].filter(Boolean).join(" · ") : `Código ${r.codigo}`;
  if (r.estado === "agregada") {
    return { tono: "verde", titulo: yaEstabaEnElTicket(r) ? `Entró · van ${r.lleva}` : "Entró al ticket", nombre };
  }
  return { tono: "ambar", titulo: estadoCorto(r) ?? "No entró", nombre };
}

/** Cuánto se queda el aviso sobre la cámara: lo que entró se confirma rápido; lo que no, se deja leer; lo que se puede bajar del
 *  almacén trae su botón «Agregar» y espera más (si no se toca, igual se ofrece al cerrar la cámara). */
export function msDelAvisoDeLectura(r: Pick<ResultadoEscaneo, "estado" | "almacen">, { conAgregar = false }: { conAgregar?: boolean } = {}): number {
  if (r.estado === "agregada") return 1800;
  return conAgregar && sePuedeBajar(r) ? 6000 : 3200;
}

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

/** Con qué tono pinta una pantalla lo que pasó con una lectura: `verde` entró · `taupe` y `pizarra` la reconoció (se quitó, ya
 *  estaba, no cambia nada) · `ambar` no entró o no es de ninguna prenda. */
export type TonoLectura = "verde" | "taupe" | "pizarra" | "ambar";

/**
 * El bip de una lectura con la cámara del teléfono (Felipe 2026-10-23: «que siempre emita sonido, así como en Bajar en tandas»): el
 * mismo de Conteo y de la bajada (`PATRON_SONIDO`), para saber que se leyó sin volver a mirar la pantalla. Agudo y corto si la prenda
 * se reconoció; grave y largo si no entró («mira la pantalla»). Sin tono —la pantalla solo busca lo leído y no sabe todavía si está—,
 * agudo: el código se leyó.
 */
export function sonidoDeLecturaCamara(tono?: TonoLectura, { yaEstaba = false }: { yaEstaba?: boolean } = {}): SonidoLectura {
  if (tono === "ambar") return "desconocida";
  // La prenda ya estaba en el ticket y entró otra (Vender, 2026-11-25): el doble toque de «ya la escaneaste» de Bajar al piso, para
  // que una etiqueta leída dos veces se oiga distinta sin mirar la pantalla. Entra igual: aquí no se pregunta (ADR-0562).
  return yaEstaba ? "repetida" : "suma";
}

/** ¿La prenda de esta lectura ya estaba en el ticket? Solo si entró y ahora van 2 o más. */
export function yaEstabaEnElTicket(r: Pick<ResultadoEscaneo, "estado" | "lleva">): boolean {
  return r.estado === "agregada" && (r.lleva ?? 1) > 1;
}

/** ¿Lo que frenó esta lectura es el almacén de ESTA tienda? Entonces la fila de la cámara ofrece «Agregar», que registra la bajada
 *  (la misma condición que `quedoEnAlmacen` de Vender: piso en 0 con almacén, o las del piso ya en el ticket con más en el almacén). */
export function sePuedeBajar(r: Pick<ResultadoEscaneo, "estado" | "almacen">): boolean {
  return r.estado === "en_almacen" || (r.estado === "tope" && (r.almacen ?? 0) > 0);
}

/** La segunda línea de una fila de la bandeja: color · talla y, si ya estaba en el ticket, cuántas van; sin prenda, el código. */
export function detalleDeLectura(r: ResultadoEscaneo): string {
  const base = r.prenda?.detalle || `Código ${r.codigo}`;
  return yaEstabaEnElTicket(r) ? `${base} · van ${r.lleva}` : base;
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
    case "apartada":
      return { tono: "ambar", texto: `${r.nombre ?? r.codigo} no entró: está apartada para un cliente` };
    case "tope":
      return (r.almacen ?? 0) > 0
        ? { tono: "ambar", texto: `${r.nombre ?? r.codigo} no entró: las del piso ya están en el ticket y las demás en el almacén` }
        : { tono: "ambar", texto: `Ya están todas las ${r.nombre ?? r.codigo} en el ticket` };
    case "sin_precio":
      return { tono: "ambar", texto: `${r.nombre ?? r.codigo} no entró: no tiene precio en el catálogo` };
    case "no-encontrada":
      return { tono: "ambar", texto: `No encontramos «${r.codigo}» en esta tienda` };
    case "repetida":
      return { tono: "ambar", texto: `${r.nombre ?? r.codigo} ya está en el ticket: ¿sumar otra?` };
  }
}

/** Por qué una lectura NO entró, en dos o tres palabras: la etiqueta ámbar de la fila de la bandeja y de la tarjeta.
 *  Corta a propósito (la fila tiene ~120 px a 375 px de ancho). La cámara no pinta el aviso largo, así que la etiqueta
 *  tiene que leerse como un NO: «2 en el almacén» sonaba a buena noticia y la colaboradora no veía que la prenda no
 *  entró al ticket. Por eso lo del almacén (piso en 0, o todas las del piso ya en el ticket) empieza por «No entró»; qué
 *  hacer lo ofrece la misma fila («Agregar», que registra la bajada, `sePuedeBajar`) y, si no se tocó, la hoja al cerrar la cámara. */
export function estadoCorto(r: ResultadoEscaneo): string | null {
  const enAlmacen = (r.almacen ?? 0) > 0;
  switch (r.estado) {
    case "agregada":
      return null;
    case "agotada":
      return "Agotada aquí";
    case "en_almacen":
      return "No entró · en almacén";
    case "apartada":
      return "No entró · apartada";
    case "tope":
      return enAlmacen ? "No entró · en almacén" : "Sin más stock";
    case "sin_precio":
      return "No entró · sin precio";
    case "no-encontrada":
      return "No es de esta tienda";
    case "repetida":
      return "Ya está en el ticket";
  }
}
