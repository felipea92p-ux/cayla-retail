import { claveDe, type ClaveLinea, type ConteoDeLinea, type ConteosDelEnvio } from "./recepcion-conteo-reglas";

// Lo último que ESTA PESTAÑA supo de cada línea de un envío que se está contando (Recibir ▸ Contar).
//
// POR QUÉ EXISTE (medido en local el 2026-11-11, envío ENV-001244). Contar se guarda solo, línea por línea, y no le avisa al router: un
// `router.refresh()` por toque rehace la página entera. Al volver a la pantalla con «atrás», Next no le pregunta al servidor: dibuja la
// página que guardó, con lo contado de cuando se leyó (lo mismo por un enlace antes de los 30 s de `staleTimes`). La pantalla mostraba el
// número de ANTES del último guardado, y el siguiente toque guardaba encima de ese número viejo: `guardar_conteo_envio` recibe el número
// entero y gana el último. Una prenda contada se perdía sin que nadie lo pidiera, y lo contado en una recepción termina en el stock.
//
// QUÉ HACE. Recuerda, por envío y por línea, la versión más alta que esta pestaña guardó o releyó, y la pantalla arranca de ahí. Vive en
// la memoria de la pestaña, igual que la página que guarda el router: nacen y mueren juntas (una recarga vacía las dos, y entonces la
// página viene nueva del servidor). Por eso no va a `localStorage`: ahí sobreviviría a la lectura que la corrige.
//
// CONTRATO
//   PROMETE: que lo recordado de una línea nunca retrocede (`despacho_conteos.version` solo sube y ninguna función borra filas), y que al
//            mezclar manda la versión más alta; en un empate manda la página, que trae al día lo que no lleva versión (lo que ya entró al
//            stock, lo pendiente).
//   ASUME: que quien guarda o relee una línea lo anota aquí (`RecibirContando`) y que la pantalla se dibuja con `conLoMasNuevo`. En el
//          servidor nadie anota: la memoria está vacía y no se comparte entre personas.
//   NO HACE: no sabe lo que otra persona u otra pestaña guardó después de la lectura de la página (eso lo dice `pisaste` al guardar), y no
//            recuerda el estado del envío ni sus cierres: solo las líneas contadas.

const recordados = new Map<string, Map<ClaveLinea, ConteoDeLinea>>();

/** Anota líneas de un envío recién guardadas o releídas. De cada una se queda la versión más alta; con la misma, la que llega (se leyó después). */
export function recordarConteos(despachoId: string, conteos: readonly ConteoDeLinea[]): void {
  if (conteos.length === 0) return;
  const delEnvio = recordados.get(despachoId) ?? new Map<ClaveLinea, ConteoDeLinea>();
  for (const c of conteos) {
    const clave = claveDe(c);
    const ya = delEnvio.get(clave);
    if (!ya || c.version >= ya.version) delEnvio.set(clave, c);
  }
  recordados.set(despachoId, delEnvio);
}

/** Lo que la pestaña recuerda de un envío, por clave de línea. Vacío si no guardó ni releyó nada de él desde que se cargó. */
export function conteosRecordados(despachoId: string): Record<string, ConteoDeLinea> {
  return Object.fromEntries(recordados.get(despachoId) ?? []);
}

/**
 * Lo contado que vale: lo que leyó la página y, encima, las líneas que se supieron después. Línea por línea gana la versión más alta
 * (una línea que la página todavía no traía, entra); con la misma versión manda la página.
 */
export function conLoMasNuevo(base: ConteosDelEnvio | null, masNuevos: Readonly<Record<string, ConteoDeLinea>>): ConteosDelEnvio | null {
  if (!base) return null;
  const porClave = new Map(base.conteos.map((c) => [claveDe(c), c] as const));
  for (const [clave, c] of Object.entries(masNuevos)) {
    const ya = porClave.get(clave as ClaveLinea);
    if (!ya || c.version > ya.version) porClave.set(clave as ClaveLinea, c);
  }
  return { ...base, conteos: [...porClave.values()] };
}
