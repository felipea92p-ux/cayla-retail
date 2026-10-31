// Cambiar el tipo de una orden abierta (ADR-0581): las reglas puras. Sin React ni Supabase.
//
// EL PROBLEMA. Una orden se abre como «Lote de producción» o «Muestra», y no había forma de corregirlo: tres lotes de 16, 54 y 69 prendas se abrieron como muestra con «Crear un modelo
// nuevo» (donde el formulario arranca en Muestra) y quedaron así. Una muestra, al cerrarse, no entra al stock. `cambiar_tipo_orden_produccion` (migración 20261030151000) lo corrige mientras
// la orden sigue abierta; esto dice, en palabras de tienda, a qué tipo pasa, qué cambia al cerrarla y cómo se lee lo que responde la base.
//
// CONTRATO
//   PROMETE: que el botón, el título y el aviso de consecuencia salen del MISMO destino (no pueden decir cosas distintas); que la consecuencia dicha es la que la base aplica al cerrar la orden
//            (`cerrar_produccion`: una muestra no toca el stock ni el costo; `fn_analisis_pedido_en_camino`: no cuenta las muestras); y que una respuesta que no se entiende no se toma por «ya
//            quedó»: `leerRespuestaDeCambioDeTipo` devuelve `null` y la pantalla refresca para mostrar lo que la base tiene.
//   ASUME:   el destino es siempre el tipo contrario al de hoy (la base ignora un pedido que no cambia nada).
//   NO HACE: no valida el precio ni el largo del motivo (lo hace la base, con su mensaje) ni decide quién puede (`datos.permisos.puedeOperar` y la base).

export const RPC_CAMBIAR_TIPO_ORDEN = "cambiar_tipo_orden_produccion";
/** El motivo es opcional; si se escribe, la base admite hasta 300 letras (`cambio_motivo_largo`): el campo de la hoja no deja escribir más. */
export const MAX_MOTIVO_TIPO = 300;

export type DestinoDeTipo = {
  /** El tipo al que pasa: lo que se manda a la base como `p_es_muestra`. */
  esMuestra: boolean;
  /** «lote de producción» / «muestra», para el medio de una frase. */
  nombre: string;
  /** Con artículo: «un lote de producción» / «una muestra». */
  como: string;
  /** El rótulo del botón que abre la hoja y el título de la hoja (los dos dicen el tipo completo: lo que se toca es lo que se confirma). */
  boton: string;
  titulo: string;
  /** El rótulo del botón que confirma, DENTRO de la hoja: corto, porque en el celular el pie son dos mitades y el título de arriba ya dice el tipo completo. */
  confirmar: string;
};

/** A qué tipo pasa una orden que hoy es muestra (o lote): siempre al contrario. */
export function destinoDeTipo(esMuestraHoy: boolean): DestinoDeTipo {
  return esMuestraHoy
    ? { esMuestra: false, nombre: "lote de producción", como: "un lote de producción", boton: "Pasar a lote de producción", titulo: "Pasar esta orden a lote de producción", confirmar: "Pasar a lote" }
    : { esMuestra: true, nombre: "muestra", como: "una muestra", boton: "Pasar a muestra", titulo: "Pasar esta orden a muestra", confirmar: "Pasar a muestra" };
}

/** Lo que cambia al cerrar la orden, dicho para quien la abrió: el stock y lo que Análisis cuenta como «en camino». */
export function queCambiaAlCerrar(destino: DestinoDeTipo, prendas: number): string {
  const suyas = prendas === 1 ? "su prenda" : `sus ${prendas} prendas`;
  return destino.esMuestra
    ? `Al darla por terminada no entra nada al stock ni se toca el costo de la prenda, y Análisis deja de contar ${suyas} como «en camino».`
    : `Al pasarla al stock, las prendas buenas entran al stock del Taller con su costo, y Análisis cuenta ${suyas} como «en camino» mientras se fabrican. Como muestra no habrían entrado.`;
}

/**
 * El aviso de antemano para pasar a lote: un lote necesita precio a tienda y la página conoce el MÁS ALTO de las tallas y colores del modelo. Si ni ese tiene precio, ninguno lo tiene y la
 * base lo va a rechazar: se dice antes de tocar. Si hay alguno con precio y otro sin él, lo dice la base con los códigos que faltan (la página no los sabe). Pasar a muestra nunca lo pide.
 */
export function avisoDePrecioParaLote(destino: DestinoDeTipo, precioMasAlto: number | null): string | null {
  if (destino.esMuestra || (precioMasAlto !== null && precioMasAlto > 0)) return null;
  return "Esta prenda todavía no tiene precio a tienda, y un lote de producción lo necesita para poder venderse. Ponlo en Catálogo ▸ Productos y vuelve a intentar.";
}

/** El aviso de éxito: «La orden de Blusa Hanna ahora es un lote de producción». */
export function textoCambiasteElTipo(referencia: string, destino: DestinoDeTipo): string {
  return `La orden de ${referencia} ahora es ${destino.como}`;
}

/** El aviso cuando la orden ya tenía ese tipo (otra persona la cambió antes, o un doble clic): no se escribió nada. */
export function textoYaEraDeEseTipo(referencia: string, destino: DestinoDeTipo): string {
  return `La orden de ${referencia} ya era ${destino.como}: no hubo nada que cambiar`;
}

/** El motivo es opcional: vacío o solo espacios se manda como nada. */
export function motivoParaLaBase(motivo: string): string | null {
  const m = motivo.trim();
  return m === "" ? null : m;
}

/** La respuesta de `cambiar_tipo_orden_produccion`: `{ cambio: true, id }` si cambió, `{ cambio: false }` si ya era de ese tipo. Otra cosa: `null`. */
export function leerRespuestaDeCambioDeTipo(data: unknown): { cambio: boolean } | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const cambio = (data as Record<string, unknown>).cambio;
  return typeof cambio === "boolean" ? { cambio } : null;
}

/**
 * Cómo se cuenta un cambio de tipo en la historia de la orden: «Pasó de muestra a lote de producción», y el motivo —si lo hubo— aparte. La base guarda la frase y el motivo en un solo texto
 * (`Pasó de muestra a lote de producción · motivo`); el título sale del dato (`pasoAMuestra`) y no de leer el texto.
 */
export function entradaDeCambioDeTipo(pasoAMuestra: boolean | null, texto: string): { titulo: string; detalle: string | null } {
  if (pasoAMuestra === null) return { titulo: "Cambió el tipo de la orden", detalle: texto === "" ? null : texto };
  const titulo = pasoAMuestra ? "Pasó de lote de producción a muestra" : "Pasó de muestra a lote de producción";
  const motivo = texto.startsWith(`${titulo} · `) ? texto.slice(titulo.length + 3) : texto === titulo ? "" : texto;
  return { titulo, detalle: motivo === "" ? null : `Por qué: ${motivo}` };
}
