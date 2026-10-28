import { compararTallas } from "./tallas";
import { diaLima, diasEntreFechas } from "./fechas-lima";
import { codigoDeEtiqueta } from "./prenda-reglas";
import { precioPropioMasBajo } from "./precio-sede-reglas";

// Reglas puras de Producción: sin Supabase, sin `next/headers`, para que las
// importen tanto la página (servidor) como los formularios (cliente) — mismo
// patrón que `vender-reglas.ts` y `compras-reglas.ts`. Lo que toca la base
// vive en `produccion.ts`.

/** Etapas por las que pasa una orden. Muestra = desarrollar el modelo, una
 *  sola vez; Producción = fabricar el lote, cada vez (decisión con Felipe,
 *  jul-2026, heredada de V1). Las claves son las que `set_etapa_produccion`
 *  acepta — cambiar una acá sin tocar la RPC rompe el botón. */
export const ETAPAS_MUESTRA = [
  { clave: "patronaje", etiqueta: "Patronaje", detalle: "Crear el molde base del modelo." },
  { clave: "muestra", etiqueta: "Muestra y aprobación", detalle: "Coser un prototipo y revisarlo antes de producir." },
  { clave: "escalado", etiqueta: "Escalado y ploteo", detalle: "Molde a todas las tallas + tizado sobre la tela." },
] as const;

export const ETAPAS_PRODUCCION = [
  { clave: "corte", etiqueta: "Corte", detalle: "Tender la tela y cortar las piezas." },
  { clave: "confeccion", etiqueta: "Confección", detalle: "Costura, ojal y botón — armar la prenda." },
  { clave: "acabado", etiqueta: "Acabados", detalle: "Planchado, limpiar hilos, control de calidad, etiqueta y empaque." },
] as const;

export type EtapaClave = (typeof ETAPAS_MUESTRA)[number]["clave"] | (typeof ETAPAS_PRODUCCION)[number]["clave"];
export type EstadoEtapa = "pendiente" | "hecho" | "tercerizado";
export type EstadoOrden = "en_proceso" | "terminada" | "anulada";

// Umbrales del semáforo — margen = precio de venta − costo directo, como % del
// precio. Alto a propósito: de ese margen salen costura, taller y utilidad
// (mano de obra fija que el costo directo no incluye). Heredado de V1.
export const UMBRAL_GANA = 0.6;
export const UMBRAL_FILO = 0.4;

export type Semaforo = { tono: "gana" | "filo" | "pierde"; margen: number };

/** Las palabras del semáforo, UNA sola vez (la hoja de Nueva orden, la tarjeta y el panel). El tono `pierde` se mostraba como «Pierde» junto a un margen de 38 %
 *  POSITIVO y se leía como pérdida de dinero (/formidable 2026-10-10, el ciego no lo entendió hasta abrir el panel): significa «el margen no alcanza para costura,
 *  taller y utilidad». Se llama «Margen bajo», como en Nuevo producto. El nombre del tono y los umbrales NO cambian: son una regla de precios. */
export const TEXTO_SEMAFORO: Record<Semaforo["tono"], string> = { gana: "Gana", filo: "Al filo", pierde: "Margen bajo" };

/** La leyenda del medidor del panel, con los mismos umbrales que `semaforoMargen`. */
export const LEYENDA_SEMAFORO = {
  pierde: `margen bajo < ${Math.round(UMBRAL_FILO * 100)}%`,
  filo: "al filo",
  gana: `gana ≥ ${Math.round(UMBRAL_GANA * 100)}%`,
} as const;

/** null cuando no hay con qué comparar (modelo sin precio o costo en cero). */
export function semaforoMargen(precioVenta: number, costoUnitario: number): Semaforo | null {
  if (precioVenta <= 0 || costoUnitario <= 0) return null;
  const margen = (precioVenta - costoUnitario) / precioVenta;
  if (margen >= UMBRAL_GANA) return { tono: "gana", margen };
  if (margen >= UMBRAL_FILO) return { tono: "filo", margen };
  return { tono: "pierde", margen };
}

/** El precio propio más bajo que alguna tienda le pone al modelo, si queda bajo el de la grilla (ADR-0370). `sede` ya viene en corto y, si hay un empate, junta
 *  las tiendas («Trujillo y Arequipa»). */
export type PrecioMasBajo = { precio: number; sede: string };

/** Con qué precio se mide el margen de una orden. Felipe (2026-10-11): «el más bajo de cualquier tienda», la vara prudente: si ahí todavía gana, gana en todas.
 *  Sin una tienda más barata que la grilla (o si no se pudo leer), el precio de venta del modelo de siempre. `precioVenta` no cambia: es el de la grilla. */
export function precioParaMargen(o: { precioVenta: number; precioMasBajo?: PrecioMasBajo | null }): number {
  return o.precioMasBajo && o.precioMasBajo.precio > 0 ? o.precioMasBajo.precio : o.precioVenta;
}

type PreciosDeLasTiendas = { porSede: Readonly<Record<string, Readonly<Record<string, number>>>>; nombres: ReadonlyMap<string, string> };

/** A cada orden, el precio propio más bajo de su modelo entre las tiendas (si lo hay). Puro: la página lee los precios una vez (`getPreciosDeLasTiendas`) y esto
 *  solo los reparte. Una orden sin una tienda más barata queda sin `precioMasBajo` (se mide con el precio de la grilla). */
export function conPreciosMasBajos<T extends { precioVenta: number; varianteIdsDelModelo: readonly string[] }>(
  ordenes: readonly T[],
  precios: PreciosDeLasTiendas,
): (T & { precioMasBajo?: PrecioMasBajo })[] {
  return ordenes.map((o) => {
    const bajo = precioPropioMasBajo(o.precioVenta, o.varianteIdsDelModelo, precios.porSede, precios.nombres);
    return bajo ? { ...o, precioMasBajo: bajo } : { ...o };
  });
}

/** Lo mismo para la lista de modelos de «Nueva orden»: su precio de venta es el mayor de sus tallas activas. */
export function conPreciosMasBajosDeModelos<T extends { variantes: readonly { varianteId: string; precio: number }[] }>(
  modelos: readonly T[],
  precios: PreciosDeLasTiendas,
): (T & { precioMasBajo?: PrecioMasBajo })[] {
  return modelos.map((m) => {
    const bajo = precioPropioMasBajo(Math.max(0, ...m.variantes.map((v) => v.precio)), m.variantes.map((v) => v.varianteId), precios.porSede, precios.nombres);
    return bajo ? { ...m, precioMasBajo: bajo } : { ...m };
  });
}

/** Costo por prenda como lo calcula la base (`producciones.costo_unitario`):
 *  costos ÷ buenas, o ÷ plan mientras no cierre. 0 sin prendas. */
export function costoUnitario(costoTela: number, costoAvios: number, costoMaquila: number, prendas: number): number {
  if (prendas <= 0) return 0;
  return Math.round(((costoTela + costoAvios + costoMaquila) / prendas) * 100) / 100;
}

/* ====================================================================
   Tablero de Órdenes (ADR-0133, F2). Todo lo que sigue es puro: la página lee
   y pinta, las reglas viven acá y se prueban sin navegador.
   ==================================================================== */

/** Las etapas de una orden: una muestra desarrolla el modelo, una corrida lo fabrica. */
export function etapasDe(esMuestra: boolean) {
  return esMuestra ? ETAPAS_MUESTRA : ETAPAS_PRODUCCION;
}

export type EtapaActual = EtapaClave | "listo";

/** La primera etapa que todavía no está «hecha» (una tercerizada sigue en curso: la prenda no volvió).
 *  `listo` = todas hechas; la orden espera a que la cierren al inventario. */
export function etapaActual(etapas: Partial<Record<EtapaClave, EstadoEtapa>>, esMuestra: boolean): EtapaActual {
  const pendiente = etapasDe(esMuestra).find((e) => etapas[e.clave] !== "hecho");
  return pendiente ? pendiente.clave : "listo";
}

/** Cuántos días antes de la entrega una orden abierta empieza a avisar. Es una convención de menú, no
 *  un dato del Taller: se puede afinar cuando haya plazos reales por etapa (Eficiencia, F7). */
export const DIAS_ENTREGA_PRONTO = 2;

export type EstadoEntrega =
  | { tipo: "sin_fecha" }
  | { tipo: "vencida"; dias: number }
  | { tipo: "pronto"; dias: number }
  | { tipo: "holgada"; dias: number };

/** Solo hechos: la fecha ya pasó, o falta poco. No estima cuánto trabajo queda (no hay plazos reales por
 *  etapa todavía y inventarlos haría parecer un dato lo que es una suposición). `dias` es siempre ≥ 0
 *  (los que ya pasaron o los que faltan). */
export function estadoEntrega(fechaEntrega: string | null, hoy: string): EstadoEntrega {
  if (!fechaEntrega) return { tipo: "sin_fecha" };
  const falta = diasEntreFechas(hoy, fechaEntrega);
  if (falta < 0) return { tipo: "vencida", dias: -falta };
  if (falta <= DIAS_ENTREGA_PRONTO) return { tipo: "pronto", dias: falta };
  return { tipo: "holgada", dias: falta };
}

/** Lo que el select de Producción trae de `variantes` (con sus embebidos de talla y color): `sku` y `codigo` van
 *  los dos porque en producción `sku` es NULL en casi todas las variantes (ADR-0058) y el que la colaboradora
 *  reconoce es el `codigo` de la etiqueta. */
export type VarianteLeida = {
  sku?: string | null;
  codigo?: string | null;
  talla?: { valor: string } | null;
  color?: { codigo?: string | null; nombre: string; hex: string | null } | null;
};

/** Cómo Producción nombra una prenda en pantalla. Las dos lecturas del módulo (las líneas de una orden y las variantes
 *  del formulario de nueva orden) pasan por aquí, para que ninguna vuelva a leer solo `sku` y deje un hueco.
 *  El campo se sigue llamando `sku` (lo consumen buscadores y tooltips), pero trae el CÓDIGO DE ETIQUETA con respaldo al
 *  sku legado, o `""` si la variante no tiene ninguno. Solo se MUESTRA: para identificar una prenda se compara `varianteId`. */
export function datosDeVariante(v: VarianteLeida | null | undefined): { sku: string; talla: string | null; color: string | null; colorHex: string | null; colorCodigo: string | null } {
  return {
    sku: v ? codigoDeEtiqueta(v) : "",
    talla: v?.talla?.valor ?? null,
    color: v?.color?.nombre ?? null,
    colorHex: v?.color?.hex ?? null,
    // El código del vocabulario (ADR-0400): con él la orden propone la tela del mismo color. Falta en las lecturas viejas que no lo piden.
    colorCodigo: v?.color?.codigo ?? null,
  };
}

type LineaMatriz = { varianteId: string; talla: string | null; color: string | null; colorHex: string | null; cantidadPlan: number; cantidadBuenas: number | null };
export type CeldaMatriz = { varianteId: string; plan: number; buenas: number | null };
export type MatrizOrden = {
  colores: { nombre: string; hex: string | null }[];
  tallas: string[];
  /** Clave `color|talla`; ausente = esa combinación no está en la orden (se pinta «—»). */
  celdas: Record<string, CeldaMatriz>;
  totalPorTalla: Record<string, number>;
  totalPorColor: Record<string, number>;
  total: number;
};

export const claveCelda = (color: string, talla: string) => `${color}|${talla}`;

/** Las líneas de una orden como grilla color × talla — como el Taller arma la curva sobre la mesa de corte.
 *  Tallas en orden canónico (S · M · L), colores en el orden en que aparecen. Sin color o sin talla el
 *  modelo igual se dibuja («Sin color» / «Única»). */
export function matrizDeLineas(lineas: LineaMatriz[]): MatrizOrden {
  const colores: MatrizOrden["colores"] = [];
  const tallas: string[] = [];
  const celdas: MatrizOrden["celdas"] = {};
  const totalPorTalla: Record<string, number> = {};
  const totalPorColor: Record<string, number> = {};
  let total = 0;
  for (const l of lineas) {
    const color = l.color ?? "Sin color";
    const talla = l.talla ?? "Única";
    if (!colores.some((c) => c.nombre === color)) colores.push({ nombre: color, hex: l.colorHex });
    if (!tallas.includes(talla)) tallas.push(talla);
    celdas[claveCelda(color, talla)] = { varianteId: l.varianteId, plan: l.cantidadPlan, buenas: l.cantidadBuenas };
    totalPorTalla[talla] = (totalPorTalla[talla] ?? 0) + l.cantidadPlan;
    totalPorColor[color] = (totalPorColor[color] ?? 0) + l.cantidadPlan;
    total += l.cantidadPlan;
  }
  tallas.sort(compararTallas);
  return { colores, tallas, celdas, totalPorTalla, totalPorColor, total };
}

/** Cuántas prendas «salieron buenas»: lo que el cierre reparte el costo. Entradas vacías o negativas cuentan 0. */
export function totalBuenas(buenas: Record<string, number | string>): number {
  return Object.values(buenas).reduce<number>((s, v) => s + Math.max(0, Math.floor(Number(v) || 0)), 0);
}

/** Lo más que puede anotarse como bueno de una talla (ADR-0415): el doble de lo pedido, o 5 más si la talla es chica. Que salgan
 *  algunas más es real (el corte rindió); más que eso es casi siempre un cero de más. La base dice lo mismo (`buenas_de_mas`). */
export function topeDeBuenas(plan: number): number {
  return Math.max(plan * 2, plan + 5);
}

/** La frase de la primera talla que pasa el tope, para decirlo antes de mandar; null si todas caben. */
export function problemaDeBuenas(lineas: readonly { varianteId: string; cantidadPlan: number }[], buenas: Readonly<Record<string, number | string>>): string | null {
  for (const l of lineas) {
    const anotadas = Math.max(0, Math.floor(Number(buenas[l.varianteId]) || 0));
    if (anotadas > topeDeBuenas(l.cantidadPlan)) {
      return `De una talla se pidieron ${l.cantidadPlan} y anotaste ${anotadas} buenas: más del doble de lo pedido. Revisa la cantidad; si de verdad salieron tantas, anota hasta ${topeDeBuenas(l.cantidadPlan)} y abre otra orden con el resto.`;
    }
  }
  return null;
}

/** La entrega es una promesa del Taller: no puede ser antes de hoy (ADR-0415, `entrega_pasada`). Vacía es válida (es opcional). */
export function problemaDeEntrega(fecha: string, hoy: string): string | null {
  return fecha !== "" && fecha < hoy ? "La entrega no puede ser antes de hoy: elige el día en que el Taller la va a entregar, o déjala en blanco." : null;
}

/** Lo planeado que no salió bueno (segundas o pérdidas). Nunca negativo. */
export function segundas(plan: number, buenas: number): number {
  return Math.max(0, plan - buenas);
}

export type ParteCosto = { clave: "tela" | "avios" | "maquila"; etiqueta: string; valor: number; parte: number };

/** Los tres costos como partes de un todo (para la barra apilada). `parte` va de 0 a 1; con costo cero
 *  todas valen 0 y la barra no se dibuja. */
export function desgloseCosto(costoTela: number, costoAvios: number, costoMaquila: number): { total: number; partes: ParteCosto[] } {
  const total = costoTela + costoAvios + costoMaquila;
  const parte = (v: number) => (total > 0 ? v / total : 0);
  return {
    total,
    partes: [
      { clave: "tela", etiqueta: "Tela", valor: costoTela, parte: parte(costoTela) },
      { clave: "avios", etiqueta: "Avíos", valor: costoAvios, parte: parte(costoAvios) },
      { clave: "maquila", etiqueta: "Servicios de afuera", valor: costoMaquila, parte: parte(costoMaquila) },
    ],
  };
}

/** Dónde cae el margen en el medidor (0 a 1, recortado): pierde < 40 % · al filo · gana ≥ 60 %. */
export function posicionEnMedidor(margen: number): number {
  return Math.min(1, Math.max(0, margen));
}

type OrdenParaResumen = {
  estado: EstadoOrden;
  esMuestra: boolean;
  cantidadPlan: number;
  fechaEntrega: string | null;
  precioVenta: number;
  precioMasBajo?: PrecioMasBajo | null;
  costoUnitario: number;
};
export type ResumenTablero = { enCurso: number; prendas: number; vencidas: number; pronto: number; margenPromedio: number | null };

/** Las cifras de arriba del tablero. Solo cuentan órdenes de producción abiertas (las muestras no llevan
 *  entrega ni margen). El margen promedio ignora las que aún no tienen precio o costo. */
export function resumenTablero(ordenes: OrdenParaResumen[], hoy: string): ResumenTablero {
  const abiertas = ordenes.filter((o) => o.estado === "en_proceso" && !o.esMuestra);
  let vencidas = 0;
  let pronto = 0;
  const margenes: number[] = [];
  for (const o of abiertas) {
    const e = estadoEntrega(o.fechaEntrega, hoy);
    if (e.tipo === "vencida") vencidas += 1;
    if (e.tipo === "pronto") pronto += 1;
    const s = semaforoMargen(precioParaMargen(o), o.costoUnitario);
    if (s) margenes.push(s.margen);
  }
  return {
    enCurso: abiertas.length,
    prendas: abiertas.reduce((s, o) => s + o.cantidadPlan, 0),
    vencidas,
    pronto,
    margenPromedio: margenes.length ? margenes.reduce((a, b) => a + b, 0) / margenes.length : null,
  };
}

/** Las prendas buenas que entraron al stock desde el día `desde` (`aaaa-mm-dd` de Lima): el «terminadas hoy · 7 días · 30 días» del
 *  Taller en el Observatorio. `inventariadoEn` es un instante que la base manda en UTC: se compara su día de LIMA (`diaLima`); con
 *  sus 10 primeros caracteres, lo cerrado de 7 pm a medianoche contaba como terminado al día siguiente. */
export function terminadasDesde(ordenes: readonly { inventariadoEn: string | null; cantidadBuenas: number | null }[], desde: string): number {
  return ordenes.reduce((suma, o) => {
    const dia = diaLima(o.inventariadoEn);
    return dia !== null && dia >= desde ? suma + (o.cantidadBuenas ?? 0) : suma;
  }, 0);
}

// ---------------------------------------------------------------------------
// Siguiente paso de una orden cerrada: llevarlas a las tiendas (ADR-0133, F8)
// ---------------------------------------------------------------------------
//
// Al cerrar, las prendas buenas entran al stock del TALLER; para venderlas hay que trasladarlas a una tienda. Ese traslado ya existe (`/inventario/mover`, dos fases:
// sale del Taller, la tienda confirma lo que llegó). Producción no lo reimplementa: solo lleva la mano hasta ahí, con el origen y las líneas ya puestas. El destino NO se
// prellena (una corrida suele repartirse entre tiendas): lo elige quien traslada. Lo prellenado es una SUGERENCIA: la pantalla de destino valida todo (solo un líder respeta un
// origen distinto del suyo; una variante sin stock movible se ignora).

export type LineaParaTrasladar = { varianteId: string; cantidadBuenas: number | null };

/** `/inventario/mover?origen=<Taller>&lineas=<variante>:<cantidad>,…`, o `null` si la orden no dejó ninguna prenda buena (no hay nada que llevar). */
export function urlLlevarATiendas(tallerId: string, lineas: LineaParaTrasladar[]): string | null {
  const buenas = lineas.filter((l) => (l.cantidadBuenas ?? 0) > 0);
  if (buenas.length === 0) return null;
  return `/inventario/mover?origen=${encodeURIComponent(tallerId)}&lineas=${buenas.map((l) => `${encodeURIComponent(l.varianteId)}:${l.cantidadBuenas}`).join(",")}`;
}

/** Lo inverso, para la pantalla de Mover: `variante:cantidad,variante:cantidad`. Descarta lo mal formado, las cantidades que no son enteros positivos y las variantes repetidas
 *  (se suman). Nunca lanza: un parámetro roto se ignora y el formulario arranca como siempre. */
export function parsearLineasPrellenadas(param: string | undefined): { varianteId: string; cantidad: number }[] {
  if (!param) return [];
  const acum = new Map<string, number>();
  for (const trozo of param.split(",")) {
    const [id, cant] = trozo.split(":");
    const n = Number(cant);
    if (!id || !Number.isInteger(n) || n <= 0) continue;
    acum.set(id, (acum.get(id) ?? 0) + n);
  }
  return [...acum.entries()].map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
}

// ---------------------------------------------------------------------------
// ¿Un modelo se puede ofrecer para producir? (Resumen de Producción, 2026-10-13)
//
// CONTRATO
//   PROMETE: decir si un modelo entra a «¿Qué producir?» y a las tarjetas de «Para decidir». Entra solo si está activo (un descontinuado
//            no se produce, ADR-0270), aprobado (un alta pendiente o rechazada todavía no es mercadería), no es de prueba y su familia
//            no está fuera de los motores (ADR-0377: bolsas, cajas, empaque; Felipe decidió el 2026-10-13 que Producción ▸ Resumen
//            también la respeta, porque «¿Qué producir?» decide qué fabricar).
//   ASUME:   lo que no se sabe sigue contando, igual que la base (`fn_categoria_entra_a_motores`): un modelo sin categoría, o una lectura
//            de familias que falló (conjunto vacío), NO lo sacan. Ante la duda se muestra; nunca se esconde una prenda de verdad.
//   NO HACE: no lee la base ni decide qué familia está apagada (eso lo marca un líder en Catálogo ▸ Familias); y NO cierra la puerta
//            de la base: `abrir_produccion` todavía no mira el estado del producto (candado #6 del backlog), así que esto solo
//            decide qué se le OFRECE a la líder en el Resumen.
// ---------------------------------------------------------------------------

export type ProductoParaProducir = { estado: string; estado_alta: string; es_prueba: boolean; categoria_id: string | null };

export function esProducible(p: ProductoParaProducir, categoriasApagadas: ReadonlySet<string>): boolean {
  if (p.estado !== "activo") return false;
  if (p.estado_alta !== "aprobado") return false;
  if (p.es_prueba) return false;
  return !p.categoria_id || !categoriasApagadas.has(p.categoria_id);
}
