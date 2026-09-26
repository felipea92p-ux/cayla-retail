import { compararTallas } from "./tallas";
import { diasEntreFechas } from "./fechas-lima";
import { codigoDeEtiqueta } from "./prenda-reglas";

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

/** null cuando no hay con qué comparar (modelo sin precio o costo en cero). */
export function semaforoMargen(precioVenta: number, costoUnitario: number): Semaforo | null {
  if (precioVenta <= 0 || costoUnitario <= 0) return null;
  const margen = (precioVenta - costoUnitario) / precioVenta;
  if (margen >= UMBRAL_GANA) return { tono: "gana", margen };
  if (margen >= UMBRAL_FILO) return { tono: "filo", margen };
  return { tono: "pierde", margen };
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

/** Columnas del tablero, en el orden en que la prenda las recorre. Las muestras no entran al tablero:
 *  tienen otras tres etapas y van en su propia franja. */
export const COLUMNAS_TABLERO = [
  { clave: "corte", titulo: "Por cortar" },
  { clave: "confeccion", titulo: "En confección" },
  { clave: "acabado", titulo: "En acabados" },
  { clave: "listo", titulo: "Listas para cerrar" },
] as const;
export type ColumnaTablero = (typeof COLUMNAS_TABLERO)[number]["clave"];

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
  color?: { nombre: string; hex: string | null } | null;
};

/** Cómo Producción nombra una prenda en pantalla. Las dos lecturas del módulo (las líneas de una orden y las variantes
 *  del formulario de nueva orden) pasan por aquí, para que ninguna vuelva a leer solo `sku` y deje un hueco.
 *  El campo se sigue llamando `sku` (lo consumen buscadores y tooltips), pero trae el CÓDIGO DE ETIQUETA con respaldo al
 *  sku legado, o `""` si la variante no tiene ninguno. Solo se MUESTRA: para identificar una prenda se compara `varianteId`. */
export function datosDeVariante(v: VarianteLeida | null | undefined): { sku: string; talla: string | null; color: string | null; colorHex: string | null } {
  return {
    sku: v ? codigoDeEtiqueta(v) : "",
    talla: v?.talla?.valor ?? null,
    color: v?.color?.nombre ?? null,
    colorHex: v?.color?.hex ?? null,
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
      { clave: "maquila", etiqueta: "Maquila", valor: costoMaquila, parte: parte(costoMaquila) },
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
    const s = semaforoMargen(o.precioVenta, o.costoUnitario);
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
