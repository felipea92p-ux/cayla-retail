// El conteo de Recibir es de SU sede (Felipe, 2026-10-11). Puro: sin React ni `window`; lo usan la página de Recibir (la key),
// `components/recibir/ConteoPorSede.tsx` (lo que se guarda) y las dos pantallas que cuentan, y lo prueba
// `recibir-cambio-de-sede.test.ts`.
//
// El problema: el selector de sede de la cabecera cambia la sede con `router.refresh()`. La ruta no cambia y React conserva el
// estado de todo componente cliente cuya `key` siga igual. En la recepción contra factura (`RecepcionEnvio`) la sede vivía en un
// `useState` que nunca se ponía al día: tras pasar de Lima a Trujillo, «Entra al almacén de» quedaba en blanco y `recibir_envio`
// salía con la sede de LIMA (a un líder la base no le pide que la línea sea de esa sede). En «Llegó mercadería» lo escaneado en
// Lima se recibía en Trujillo. Lo contado en una puerta entraba al almacén de otra.
//
// La decisión: la sede nueva arranca vacía, y lo que estaba contado queda guardado en su sede para retomarlo al volver, mientras
// la persona siga en Recibir. Mismo criterio que el ticket de Vender (`vender-cambio-de-sede.ts`): perder 40 cajas contadas por un
// clic en el selector es peor que guardarlas.

import { fotoFormulario } from "./salida-sin-guardar";

/** La key de la recepción: la sede. Otra sede, otra key: React la vuelve a montar y lo contado no pasa de una tienda a otra. */
export function claveDeLaRecepcion(ubicacionId: string): string {
  return `sede:${ubicacionId}`;
}

/** Lo que se escribe a mano en una recepción contra factura: lo mismo que mira «¿Salir sin guardar?». */
export type EnvioEscrito = {
  reparto: Record<string, Record<string, number>>;
  extras: readonly unknown[];
  decisiones: Record<string, unknown>;
  numeroGuia: string;
  nota: string;
};

const ENVIO_SIN_CONTAR: EnvioEscrito = { reparto: {}, extras: [], decisiones: {}, numeroGuia: "", nota: "" };
const FOTO_SIN_CONTAR = fotoFormulario(ENVIO_SIN_CONTAR);

/**
 * ¿Hay algo contado o escrito? Es la misma regla que ya usaba «¿Salir sin guardar?» (cuenta lo contado, las prendas fuera de
 * comprobante, lo decidido sobre lo que faltó, la guía y la nota; qué facturas se marcaron no, porque se rehace en un toque), y
 * ahora compara contra la recepción VACÍA y no contra la del montaje: una recepción recuperada al volver a su sede también se
 * protege.
 */
export function envioContado(envio: EnvioEscrito): boolean {
  return fotoFormulario({ reparto: envio.reparto, extras: envio.extras, decisiones: envio.decisiones, numeroGuia: envio.numeroGuia, nota: envio.nota }) !== FOTO_SIN_CONTAR;
}

/** «Llegó mercadería»: lo escaneado o la guía escrita. Elegir el proveedor solo es un toque y no se guarda. */
export function llegadaContada({ lineas, numeroGuia }: { lineas: readonly unknown[]; numeroGuia: string }): boolean {
  return lineas.length > 0 || numeroGuia.trim() !== "";
}

/** Las unidades de una recepción contra factura: lo contado en las líneas más lo que llegó fuera de comprobante. */
export function unidadesDelEnvio({ reparto, extras }: { reparto: Record<string, Record<string, number>>; extras: readonly { cantidad: number }[] }): number {
  const contadas = Object.values(reparto).reduce((a, porVariante) => a + Object.values(porVariante).reduce((b, n) => b + (Number.isFinite(n) ? n : 0), 0), 0);
  return contadas + extras.reduce((a, e) => a + (Number.isFinite(e.cantidad) ? e.cantidad : 0), 0);
}

export function unidadesDeLaLlegada(lineas: readonly { cantidad: number }[]): number {
  return lineas.reduce((a, l) => a + l.cantidad, 0);
}

/** Lo guardado en otra sede, tal como se nombra en los avisos. */
export type ConteoGuardado = { sede: string; etiqueta: string; unidades: number };

const conUnidades = (g: ConteoGuardado) => `${g.etiqueta} (${g.unidades} ${g.unidades === 1 ? "unidad" : "unidades"})`;

function enUnaFrase(partes: string[]): string {
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/**
 * El texto de «¿Salir sin guardar?». `propio`: el aviso de la pantalla cuando tiene algo contado en la sede de ahora (`null` si
 * no). Lo guardado en otra sede vive solo mientras la persona siga en Recibir, así que salir también lo pierde y se nombra.
 */
export function mensajeDeSalida(propio: string | null, otras: readonly ConteoGuardado[]): string {
  if (otras.length === 0) return propio ?? "";
  const donde = enUnaFrase(otras.map(conUnidades));
  if (propio) return `${propio} También se pierde lo que dejaste contado en ${donde}.`;
  return `Dejaste un conteo a medias en ${donde} y todavía no se recibió. Si sales de Recibir, se pierde.`;
}

/** El aviso al cambiar de sede con algo contado: dónde quedó y cómo retomarlo. */
export function avisoConteoGuardado(g: Omit<ConteoGuardado, "sede">): { texto: string; detalle: string } {
  return {
    texto: `Lo contado en ${g.etiqueta} quedó guardado`,
    detalle: `${g.unidades} ${g.unidades === 1 ? "unidad" : "unidades"} sin recibir. Vuelve a ${g.etiqueta} con el selector de arriba y está tal como lo dejaste.`,
  };
}

/** El aviso al volver a la sede: lo guardado ya está de nuevo en pantalla. */
export function avisoConteoRetomado(g: Omit<ConteoGuardado, "sede">): string {
  return `Volvió lo que contaste en ${g.etiqueta}`;
}
