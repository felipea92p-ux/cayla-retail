// Las piezas de liquidación (ADR-0371, Felipe 2026-10-10): prendas sueltas que se liquidan sin entrar al catálogo. Cada una es
// una fila con su sede, su categoría y su precio, y una etiqueta con un código corto (`LQ` + 6) que la caja escanea. Cambiar el
// precio imprime una etiqueta NUEVA y la vieja deja de valer. Lógica pura: la usan la pantalla de Liquidación y Vender, desde el
// servidor y desde el navegador, y se prueba en `liquidacion-reglas.test.ts`. Las reglas que cuidan el dinero viven en la base
// (`20261010190000_piezas_de_liquidacion.sql`): aquí solo se anticipan para no mandar algo que se va a rechazar.

export type EstadoPieza = "disponible" | "vendida" | "retirada";

export type PiezaLiquidacion = {
  id: string;
  estado: EstadoPieza;
  precio: number;
  /** El precio de la primera etiqueta: cuánto se rebajó desde que entró a la liquidación. */
  precioInicial: number;
  ubicacionId: string;
  ubicacion: string;
  categoriaId: string;
  categoria: string;
  /** Unas palabras para reconocerla («Blusa beige, manga globo»), opcionales (Felipe 2026-10-10). */
  descripcion: string | null;
  prefijo: string | null;
  familia: string | null;
  /** El código de la etiqueta vigente (null si ya no está a la venta). */
  codigo: string | null;
  /** Cuántas etiquetas se le imprimieron (1 = nunca se rebajó). */
  etiquetas: number;
  creadoEn: string;
  vendidaEn: string | null;
  retiradaEn: string | null;
  motivoRetiro: string | null;
  ventaId: string | null;
};

/** Lo que devuelve `fn_pieza_liquidacion(código)`: la pieza, y si el código leído es el vigente o uno viejo. */
export type PiezaLeida =
  | { tipo: "pieza"; pieza: PiezaLiquidacion; codigoLeido: string; vigente: boolean }
  | { tipo: "otra_sede"; codigoLeido: string; ubicacion: string };

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const textoONulo = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Una pieza tal como la arma `fn_pieza_liquidacion_json` (snake_case) → la de la web. */
export function piezaDeJson(j: Record<string, unknown>): PiezaLiquidacion {
  const estado = texto(j.estado);
  return {
    id: texto(j.id),
    estado: estado === "vendida" || estado === "retirada" ? estado : "disponible",
    precio: numero(j.precio),
    precioInicial: numero(j.precio_inicial ?? j.precio),
    ubicacionId: texto(j.ubicacion_id),
    ubicacion: texto(j.ubicacion),
    categoriaId: texto(j.categoria_id),
    categoria: texto(j.categoria),
    descripcion: textoONulo(j.descripcion),
    prefijo: textoONulo(j.prefijo),
    familia: textoONulo(j.familia),
    codigo: textoONulo(j.codigo),
    etiquetas: Math.max(1, Math.round(numero(j.etiquetas))),
    creadoEn: texto(j.creado_en),
    vendidaEn: textoONulo(j.vendida_en),
    retiradaEn: textoONulo(j.retirada_en),
    motivoRetiro: textoONulo(j.motivo_retiro),
    ventaId: textoONulo(j.venta_id),
  };
}

/** Lo que devuelve `fn_pieza_liquidacion` → `null` si el código no es de ninguna pieza. */
export function piezaLeidaDeJson(j: unknown): PiezaLeida | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  if (o.otra_sede === true) return { tipo: "otra_sede", codigoLeido: texto(o.codigo_leido), ubicacion: texto(o.ubicacion) };
  return { tipo: "pieza", pieza: piezaDeJson(o), codigoLeido: texto(o.codigo_leido), vigente: o.vigente !== false };
}

/** Sin 0/O ni 1/I: el mismo alfabeto que acuña la base (`fn_codigo_liquidacion_nuevo`). */
const PATRON_CODIGO = /^LQ[2-9A-HJ-NP-Z]{6}$/;

/**
 * ¿Lo que leyó la pistola (o escribió la persona) es un código de liquidación? Devuelve el código limpio o null. Acepta minúsculas,
 * espacios y el guion que agrega un teclado o una persona al dictarlo («lq-7k3m9p»); y como se escribe a mano si la pistola falla,
 * lee una O como 0 y una I como 1… que el alfabeto no tiene, así que esas no pasan: mejor «no lo encontramos» que la pieza de otro.
 */
export function codigoDeLiquidacion(leido: string): string | null {
  const limpio = leido.toUpperCase().replace(/[\s-]/g, "");
  return PATRON_CODIGO.test(limpio) ? limpio : null;
}

/** Lo más largo de «Para reconocerla»: lo mismo que acepta la base (`piezas_liquidacion_descripcion_corta`). */
export const MAX_DESCRIPCION_LIQUIDACION = 60;

/** El nombre de la línea en la venta, el ticket y la boleta ante SUNAT (va como `descripcion_libre`): lo que la reconoce, si lo tiene;
 *  si no, su categoría. */
export function nombreEnVenta(categoria: string, descripcion?: string | null): string {
  const c = (descripcion ?? "").trim() || categoria.trim();
  return c ? `Liquidación · ${c}` : "Liquidación";
}

/** Lo que el buscador de la pantalla mira de cada prenda: lo que la reconoce, su categoría, su código y su precio. */
export function textoBuscable(p: PiezaLiquidacion): string {
  return `${p.descripcion ?? ""} ${p.categoria} ${p.codigo ?? ""} ${soles(p.precio)}`;
}

/** «25», «25.5», «25,50» → 25.5. Null si no es un precio que se pueda guardar (cero, negativo, más de dos decimales). */
export function precioDeTexto(t: string): number | null {
  const limpio = t.trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return n > 0 ? n : null;
}

/**
 * Qué le falta a un precio para poder etiquetarse, en palabras (null si está bien). La base dice lo mismo
 * (`fn_exigir_precio_liquidacion`); aquí se adelanta para no mandar algo que va a volver rechazado.
 */
export function problemaDePrecio(t: string, minimo: number, esLider: boolean): string | null {
  if (t.trim() === "") return "Escribe el precio.";
  const n = precioDeTexto(t);
  if (n === null) return "Escribe un precio mayor que cero, con hasta dos decimales.";
  if (n < minimo && !esLider) return `No baja de S/ ${soles(minimo)} sin un líder: pídele que la etiquete él.`;
  return null;
}

export const soles = (n: number): string =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lo que dicen las cifras de la cabecera. «Este mes» es el mes calendario de Lima en que cae `hoy` (AAAA-MM-DD). */
export type CifrasLiquidacion = {
  disponibles: number;
  valorDisponible: number;
  vendidasMes: number;
  cobradoMes: number;
  /** Piezas a la venta que ya se rebajaron al menos una vez. */
  rebajadas: number;
};

const mesDe = (iso: string | null): string => (iso ?? "").slice(0, 7);

export function cifrasDe(piezas: readonly PiezaLiquidacion[], hoy: string): CifrasLiquidacion {
  const mes = hoy.slice(0, 7);
  const disponibles = piezas.filter((p) => p.estado === "disponible");
  const vendidasMes = piezas.filter((p) => p.estado === "vendida" && mesDe(fechaLima(p.vendidaEn)) === mes);
  return {
    disponibles: disponibles.length,
    valorDisponible: redondear(disponibles.reduce((s, p) => s + p.precio, 0)),
    vendidasMes: vendidasMes.length,
    cobradoMes: redondear(vendidasMes.reduce((s, p) => s + p.precio, 0)),
    rebajadas: disponibles.filter((p) => p.etiquetas > 1).length,
  };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** La fecha (AAAA-MM-DD) de Lima de un instante. Lima no tiene horario de verano: siempre UTC−5. */
export function fechaLima(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** «hoy», «1 día», «12 días»: cuánto lleva a la venta, dicho como en la tienda. */
export function tiempoALaVenta(dias: number): string {
  return dias <= 0 ? "desde hoy" : dias === 1 ? "1 día" : `${dias} días`;
}

/** Cuántos días lleva a la venta una pieza disponible (desde su primera etiqueta). */
export function diasALaVenta(p: PiezaLiquidacion, hoy: string): number {
  const desde = fechaLima(p.creadoEn);
  if (!desde) return 0;
  return Math.max(0, Math.round((Date.parse(hoy) - Date.parse(desde)) / 86_400_000));
}

export type Filtro = "disponibles" | "rebajadas" | "vendidas" | "retiradas";

/** «Precio bajado» son las que siguen a la venta y ya tienen una etiqueta nueva: un subconjunto de «A la venta» (/formidable, H5). */
export function filtrar(piezas: readonly PiezaLiquidacion[], filtro: Filtro): PiezaLiquidacion[] {
  if (filtro === "rebajadas") return piezas.filter((p) => p.estado === "disponible" && p.etiquetas > 1);
  const estado: EstadoPieza = filtro === "disponibles" ? "disponible" : filtro === "vendidas" ? "vendida" : "retirada";
  return piezas.filter((p) => p.estado === estado);
}

/** Un error de las funciones de liquidación, en las palabras de la tienda. null si no es uno de ellos. */
export function errorDeLiquidacion(mensaje: string): { titulo: string; detalle?: string; releer?: boolean } | null {
  const pista = (m: RegExp) => m.test(mensaje);
  // El hint de la base trae el detalle con el precio y el código vigentes: se muestra tal cual.
  // En pantalla se dice «prenda» (/formidable, ley 4): los textos de la base, ya en producción, dicen «pieza».
  const detalle = mensaje.replace(/^[\s\S]*?liquidacion_[a-z_]+\s*/, "").replace(/\bpieza\b/g, "prenda").trim() || undefined;
  if (pista(/liquidacion_bajo_minimo/)) return { titulo: "Ese precio necesita un líder", detalle };
  if (pista(/liquidacion_etiqueta_vieja/)) return { titulo: "Esa etiqueta ya no vale", detalle, releer: true };
  if (pista(/liquidacion_ya_vendida/)) return { titulo: "Esa prenda ya se vendió", detalle, releer: true };
  if (pista(/liquidacion_retirada/)) return { titulo: "Esa prenda ya no está a la venta", detalle, releer: true };
  if (pista(/liquidacion_otra_sede/)) return { titulo: "Esa prenda es de otra tienda", detalle };
  if (pista(/liquidacion_precio_distinto/)) return { titulo: "El precio no es el de la etiqueta", detalle, releer: true };
  if (pista(/liquidacion_sin_descuentos/)) return { titulo: "Las prendas de liquidación no llevan descuento", detalle };
  if (pista(/liquidacion_venta_final/)) return { titulo: "Es venta final", detalle };
  if (pista(/liquidacion_no_existe/)) return { titulo: "No encontramos esa prenda", detalle };
  if (pista(/liquidacion_sin_cambios/)) return { titulo: "Ese ya es su precio" };
  if (pista(/liquidacion_datos_invalidos/)) return { titulo: "Revisa los datos", detalle };
  return null;
}
