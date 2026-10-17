import { leerDinero } from "./modelo-nuevo-reglas";

// «Tela», el bloque nuevo de la hoja «Nueva orden de producción» (ADR-0400, decisión 6; actividad 2): las reglas puras. Sin React ni Supabase.
//
// EL PROBLEMA PRIMERO: la orden no sabía qué tela llevaba (tres montos tecleados) y «¿alcanza la tela?» callaba. Ahora la orden elige el tejido del
// modelo → la tela de ese color en Insumos → metros a pedir = consumo por prenda × prendas × (1 + merma de la tela), y el consumo se escribe una vez
// en el modelo (`producto_consumos`, lo que calcula Audaces) y lo real lo corrige al cerrar.
//
// LA BASE MANDA: `fn_produccion_insumos_normalizar` (migración 20261014154000) valida otra vez y rechaza con un `hint` estable. `problemasTela` NO
// agrega reglas (CLAUDE.md «Guía de foco», punto 5): una orden SIN tela es válida (la base acepta `p_insumos` nulo o vacío), y la prueba lee la
// migración y exige que cada `hint` de acá exista allá.
//
// CONTRATO
//   PROMETE: que si `problemasTela` no dice nada, `insumosParaRpc` arma un `p_insumos` que la base acepta (cada tela existe y no está archivada, su
//            color es uno que la orden fabrica, el consumo es un número entre 0 y 9999, y la misma tela va una vez por color); y al revés.
//            Que `metrosAPedir` redondea a 3 decimales como `cantidad_plan`.
//   ASUME:   `mermaPct` es FRACCIÓN (0.05 = 5 %), como `insumos.merma_pct`; el consumo llega como TEXTO y se lee ESTRICTO (`leerDinero`, la misma
//            lectura que el precio de esta hoja: solo dígitos y un punto).
//   NO HACE: no decide qué lote se descuenta (eso es `registrar_consumo_insumo`, al cerrar Corte) ni escribe `producto_consumos` (lo hace la base).

export type InsumoDelTaller = {
  id: string;
  nombre: string;
  tipo: "tela" | "avio";
  /** `insumos.unidad_medida`: metro, unidad, kilo… */
  unidad: string;
  tejidoId: string | null;
  colorCodigo: string | null;
  /** Lo que hay en el estante (Σ lotes − consumos), en su unidad. */
  saldo: number;
  /** Fracción: 0.05 = 5 % (`insumos.merma_pct`). */
  mermaPct: number;
  archivado: boolean;
};

/** Una fila del bloque. `colorCodigo` null = para toda la orden (el hilo, los botones). El consumo va como TEXTO, igual que la caja. */
export type TelaBorrador = { insumoId: string | null; colorCodigo: string | null; consumoPorPrenda: string };

export type ColorDeLaOrden = { colorCodigo: string | null; cantidad: number };

/** Los colores que la orden fabrica, con cuántas prendas de cada uno, en el orden en que aparecen. Un color con 0 prendas no existe para la tela
 *  (la base lo rechaza: `insumo_color_ajeno`). Un modelo sin colores es un solo «color» nulo. */
export function coloresDeLaOrden(lineas: readonly { colorCodigo: string | null; cantidad: number }[]): ColorDeLaOrden[] {
  const suma = new Map<string | null, number>();
  for (const l of lineas) {
    const n = Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 0;
    suma.set(l.colorCodigo, (suma.get(l.colorCodigo) ?? 0) + n);
  }
  return [...suma].filter(([, cantidad]) => cantidad > 0).map(([colorCodigo, cantidad]) => ({ colorCodigo, cantidad }));
}

/**
 * Una tela por color de la orden: la del estante que es de ese tejido y de ese color; si no la hay, la de ese tejido sin color; si tampoco, la fila
 * queda sin tela (la persona elige). Nunca una archivada. Entre varias que calcen gana la de más saldo (la que de verdad puede surtir). Sin tejido en el
 * modelo no se adivina nada: proponer una tela de otro tejido por el color sería afirmar algo que no se sabe.
 */
export function telasSugeridas(o: { tejidoId: string | null; colores: readonly ColorDeLaOrden[]; insumos: readonly InsumoDelTaller[]; consumo?: string }): TelaBorrador[] {
  const telas = o.tejidoId ? o.insumos.filter((i) => i.tipo === "tela" && !i.archivado && i.tejidoId === o.tejidoId) : [];
  const mejor = (candidatas: InsumoDelTaller[]) => candidatas.reduce<InsumoDelTaller | null>((m, i) => (m === null || i.saldo > m.saldo ? i : m), null);
  return o.colores.map((c) => {
    const delColor = c.colorCodigo === null ? null : mejor(telas.filter((i) => i.colorCodigo === c.colorCodigo));
    const sinColor = mejor(telas.filter((i) => i.colorCodigo === null));
    return { insumoId: (delColor ?? sinColor)?.id ?? null, colorCodigo: c.colorCodigo, consumoPorPrenda: o.consumo ?? "" };
  });
}

/** Lo que el modelo dice que lleva (`producto_consumos`), listo para la caja: «1.200». Vacío si el modelo todavía no lo sabe. */
export function consumoSugerido(declarado: { telaPorPrenda: number; fuente: "declarado" | "medido" } | null): string {
  if (!declarado || !Number.isFinite(declarado.telaPorPrenda) || declarado.telaPorPrenda <= 0) return "";
  return declarado.telaPorPrenda.toFixed(3);
}

/**
 * El consumo de la primera tela de la orden contra lo que ya dice el modelo (`producto_consumos`), para el interruptor «Dejar este consumo como el del modelo» (Felipe, 2026-10-15).
 *  · `ninguna`: no hay tela con consumo escrito, o lo escrito es lo mismo que dice el modelo: no hay nada que ofrecer.
 *  · `primera`: el modelo todavía no dice nada; esta orden lo deja declarado sola (sin interruptor ni permiso: es lo de siempre).
 *  · `corregir`: el modelo dice otra cosa. Corregirlo es de quien edita el catálogo; a los demás se les dice que solo esta orden usa lo escrito.
 * Solo cuenta la PRIMERA tela (la base escribe una sola, `producto_consumos.tela_por_prenda`); un avío no cuenta.
 */
export type OfertaDeConsumo =
  | { tipo: "ninguna" }
  | { tipo: "primera"; nuevo: number; unidad: string }
  | { tipo: "corregir"; nuevo: number; actual: number; fuente: "declarado" | "medido"; unidad: string };

export function ofertaDeConsumoDelModelo(
  telas: readonly TelaBorrador[],
  insumos: readonly InsumoDelTaller[],
  declarado: { telaPorPrenda: number; fuente: "declarado" | "medido" } | null,
): OfertaDeConsumo {
  for (const t of telas) {
    const insumo = t.insumoId ? insumos.find((i) => i.id === t.insumoId) : undefined;
    if (!insumo || insumo.tipo !== "tela") continue;
    const nuevo = leerConsumo(t.consumoPorPrenda);
    if (nuevo === null) continue;
    if (!declarado || !(declarado.telaPorPrenda > 0)) return { tipo: "primera", nuevo, unidad: insumo.unidad };
    return aMilesimas(nuevo) === aMilesimas(declarado.telaPorPrenda) ? { tipo: "ninguna" } : { tipo: "corregir", nuevo, actual: declarado.telaPorPrenda, fuente: declarado.fuente, unidad: insumo.unidad };
  }
  return { tipo: "ninguna" };
}

/** A tres decimales como la base (`round(x, 3)` de numeric: la mitad sube). `toPrecision(15)` quita el ruido binario (1.2 × 30 × 1.05 = 37.800000000000004). */
export function aMilesimas(n: number): number {
  return Math.round(Number((n * 1000).toPrecision(15))) / 1000;
}

/** El consumo escrito como número (> 0), o null si no se puede leer. El tope de 9999 lo dice `problemasTela`; acá solo se lee. */
export function leerConsumo(texto: string | number): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) && texto > 0 ? texto : null;
  const l = leerDinero(texto);
  return l.tipo === "ok" && l.valor > 0 ? l.valor : null;
}

/** `cantidad_plan` de la base: consumo × prendas × (1 + merma), a 3 decimales. null si el consumo no es un número mayor que cero. */
export function metrosAPedir(consumo: string | number, prendas: number, mermaPct: number): number | null {
  const c = leerConsumo(consumo);
  if (c === null) return null;
  const merma = Number.isFinite(mermaPct) && mermaPct > 0 ? mermaPct : 0;
  return aMilesimas(c * Math.max(prendas, 0) * (1 + merma));
}

export type VeredictoTela = {
  alcanza: boolean;
  /** Lo que falta CONTANDO lo que viene en camino. */
  faltan: number;
  /** Lo que faltaría sin contar lo que viene (el estante solo). */
  faltanSinLoQueViene: number;
  /** Alcanza, pero solo gracias a lo que viene en camino (el estante solo no alcanza). */
  conLoQueViene: boolean;
};

/**
 * «Alcanza» o «faltan N m»: el plan contra lo que queda libre en el estante (saldo − lo que otras órdenes abiertas ya comprometieron) MÁS lo que viene en camino (`enCamino`: lo que
 * falta recibir de los pedidos, sin los atrasados; regla de Felipe del 2026-10-16, la cuenta de `fn_tela_en_camino`). Sin `enCamino` es el veredicto de siempre. Un número roto o
 * negativo no cuenta como tela que viene.
 */
export function veredictoTela(plan: number, saldo: number, comprometido: number, enCamino = 0): VeredictoTela {
  const libre = (Number.isFinite(saldo) ? saldo : 0) - (Number.isFinite(comprometido) ? comprometido : 0);
  const viene = Number.isFinite(enCamino) && enCamino > 0 ? enCamino : 0;
  const faltanSinLoQueViene = aMilesimas(Math.max(plan - libre, 0));
  const faltan = aMilesimas(Math.max(plan - libre - viene, 0));
  return { alcanza: faltan === 0, faltan, faltanSinLoQueViene, conLoQueViene: faltan === 0 && faltanSinLoQueViene > 0 };
}

// ---------- Lo que falta (solo lo que la base rechaza) ----------

/** Los `hint` de `fn_produccion_insumos_normalizar`. Todos pueden pasar desde la hoja; la prueba exige que existan en la migración. */
export const HINTS_TELA = ["insumo_invalido", "insumo_archivado", "insumo_color_ajeno", "insumo_consumo_invalido", "insumo_repetido"] as const;
export type HintTela = (typeof HINTS_TELA)[number];

/** `indice` es la posición de la fila en `telas` (una fila no tiene otra identidad hasta que se guarda). */
export type ProblemaTela = { indice: number; hint: HintTela; texto: string };

/** El tope de `fn_produccion_insumos_normalizar` (`v_consumo > 9999`): la prueba lo compara con la migración. */
export const CONSUMO_MAXIMO = 9999;

const colorLimpio = (c: string | null) => (c === null ? null : c.trim() === "" ? null : c.trim());

/**
 * Lo que la base rechazaría de las filas que viajan (las que ya tienen tela elegida), en el orden en que la base lo mira: la tela existe y no está
 * archivada → su color es uno que la orden fabrica (con prendas) → el consumo es un número entre 0 y 9999 → la misma tela no se repite para el mismo
 * color. Una fila sin tela no viaja y no es una falta: la orden puede abrirse sin tela declarada.
 */
export function problemasTela(telas: readonly TelaBorrador[], ctx: { insumos: readonly InsumoDelTaller[]; colores: readonly ColorDeLaOrden[] }): ProblemaTela[] {
  const porId = new Map(ctx.insumos.map((i) => [i.id, i] as const));
  const fabrica = new Set(ctx.colores.filter((c) => c.cantidad > 0).map((c) => c.colorCodigo).filter((c): c is string => c !== null));
  const vistas = new Set<string>();
  const problemas: ProblemaTela[] = [];
  telas.forEach((t, indice) => {
    if (!t.insumoId) return;
    const di = (hint: HintTela, texto: string) => problemas.push({ indice, hint, texto });
    const insumo = porId.get(t.insumoId);
    const nombre = insumo ? `«${insumo.nombre}»` : "esa tela";
    if (!insumo) di("insumo_invalido", "Esa tela o avío no está en Insumos.");
    else if (insumo.archivado) di("insumo_archivado", `${nombre} está archivada en Insumos: elige otra o desarchívala.`);

    const color = colorLimpio(t.colorCodigo);
    if (color !== null && !fabrica.has(color)) di("insumo_color_ajeno", `La orden no fabrica el color «${color}»: ${nombre} no tiene a qué aplicarse.`);

    const l = leerDinero(t.consumoPorPrenda);
    if (l.tipo === "coma") di("insumo_consumo_invalido", `Escribe el consumo por prenda de ${nombre} con punto, por ejemplo 1.200.`);
    else if (l.tipo === "invalido") di("insumo_consumo_invalido", `El consumo por prenda de ${nombre} tiene que ser un número, por ejemplo 1.200.`);
    else if (l.tipo === "vacio") di("insumo_consumo_invalido", `Escribe cuánto lleva cada prenda de ${nombre}, por ejemplo 1.200.`);
    else if (l.tipo === "negativo" || l.valor <= 0) di("insumo_consumo_invalido", `El consumo por prenda de ${nombre} tiene que ser mayor que cero.`);
    else if (l.valor > CONSUMO_MAXIMO) di("insumo_consumo_invalido", `El consumo por prenda de ${nombre} no puede pasar de ${CONSUMO_MAXIMO}.`);

    const llave = `${t.insumoId}\u0000${color ?? ""}`;
    if (vistas.has(llave)) di("insumo_repetido", `${nombre} ya está en la orden${color ? ` para el color «${color}»` : ""}: la misma tela va una sola vez por color.`);
    vistas.add(llave);
  });
  return problemas;
}

// ---------- Lo que viaja a la base ----------

export type InsumoRpc = { insumo_id: string; color_codigo: string | null; consumo_por_prenda: string };

/** El `p_insumos` de `abrir_orden_produccion`: solo las filas con tela elegida; el consumo viaja como texto, tal cual se escribió (recortado), para que la
 *  base lo lea con su propia regla y nunca se «arregle» en silencio. */
export function insumosParaRpc(telas: readonly TelaBorrador[]): InsumoRpc[] {
  const salida: InsumoRpc[] = [];
  for (const t of telas) {
    if (!t.insumoId) continue;
    salida.push({ insumo_id: t.insumoId, color_codigo: colorLimpio(t.colorCodigo), consumo_por_prenda: t.consumoPorPrenda.trim() });
  }
  return salida;
}
