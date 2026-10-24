/* ====================================================================
   «Ajustar stock» en el modal de la prenda de Existencias: la planilla de TODO el modelo (Felipe 2026-10-23, ronda 3 de
   `docs/maquetas/existencias-ajustar-stock-2026-10/`, ADR-0494)

   Las colaboradoras cargaban el stock en Catálogo ▸ Editar producto porque ahí veían el modelo entero en una tabla (color × talla),
   escribían lo contado y guardaban una vez; en Existencias era talla por talla, con cuatro pasos cada una. Esta planilla trae esa
   tabla al modal de la prenda: la talla de la que se viene queda en foco, el motivo, el lugar y quién se eligen UNA vez, y todo viaja
   en UNA llamada a `ajustar_inventario` (ADR-0240) con las reglas de siempre (`ajuste-reglas.ts`, `matriz-ficha-reglas.ts`).

   Este archivo decide lo que no es dibujo: los motivos con sus palabras de tienda y cómo viajan a la base, en qué lugar entra, el
   modelo (qué colores y tallas tiene la planilla), por qué un «+» o un «−» no se puede, qué frena el guardado y el ancho justo del
   modal. Lógica pura, con su prueba; el componente solo dibuja y llama a la base.
   ==================================================================== */

import {
  apartadoEn,
  NOTA_MINIMA_ENCONTRE,
  reposicionCerrada,
  stockEn,
  textoProblemaMotivo,
  type LugarAjuste,
  type MotivoAjuste,
  type VarianteAjuste,
} from "./ajuste-reglas";
import { conPaso, type Pendientes } from "./matriz-ficha-reglas";
import { compararTallas } from "./tallas";

/** Los motivos de la planilla, en voz de tienda. Son los del ajuste de una talla de Existencias (ADR-0391), juntados en una lista que
 *  vale para toda la visita: un motivo, un lugar y quién, para todas las tallas que se toquen. */
export type ClaveMotivoPlanilla = "conte" | "encontre" | "no_aparece" | "error_cobro" | "uso_interno" | "otro";

export type MotivoPlanilla = {
  clave: ClaveMotivoPlanilla;
  texto: string;
  /** La frase bajo los motivos: qué escribir y qué no se puede. */
  ayuda: string;
  /** Hacia dónde mueve el stock: «Encontré» solo suma (también la base: `encontre_prendas_resta`), «No aparece» y «Uso interno» solo
   *  restan (lo dicen sus palabras: una prenda que no aparece no suma). */
  sentido: "ambos" | "suma" | "resta";
  /** Uno de los cuatro motivos de `ajustar_inventario`. */
  base: MotivoAjuste;
  /** La nota que pide (con su ejemplo, que sigue al motivo: ADR-0290), o `null`. */
  nota: { etiqueta: string; ejemplo: string } | null;
  /** La nota que viaja sola cuando el motivo no la pide pero la base necesita saber qué fue («Error al cobrar» es «otro»). */
  notaFija?: string;
};

export const MOTIVOS_PLANILLA: readonly MotivoPlanilla[] = [
  { clave: "conte", texto: "Conté y hay otro número", ayuda: "Escribe lo que contaste: el sistema saca la diferencia.", sentido: "ambos", base: "conteo_fisico", nota: null },
  {
    clave: "encontre",
    texto: "Encontré unidades",
    ayuda: "Solo suma, y en el almacén: después se cuelgan.",
    sentido: "suma",
    base: "reposicion",
    nota: { etiqueta: "¿Dónde estaban?", ejemplo: "Ej. en la caja de la repisa alta" },
  },
  { clave: "no_aparece", texto: "No aparece", ayuda: "La buscaste y no está: solo resta.", sentido: "resta", base: "merma", nota: null },
  { clave: "error_cobro", texto: "Error al cobrar", ayuda: "Se cobró otra talla o color: corrige las dos.", sentido: "ambos", base: "otro", nota: null, notaFija: "Error al cobrar" },
  { clave: "uso_interno", texto: "Uso interno", ayuda: "Se usó en la tienda (vitrina, maniquí): solo resta.", sentido: "resta", base: "otro", nota: null, notaFija: "Uso interno" },
  { clave: "otro", texto: "Otro", ayuda: "Escribe qué pasó.", sentido: "ambos", base: "otro", nota: { etiqueta: "¿Qué pasó?", ejemplo: "Ej. tenía la etiqueta de otra talla" } },
];

/** Hoy casi todo lo que se ajusta son correcciones al contar (Felipe 2026-10-23: todavía se cuadra el inventario). */
export const MOTIVO_INICIAL: ClaveMotivoPlanilla = "conte";

export function motivoPlanilla(clave: ClaveMotivoPlanilla): MotivoPlanilla {
  return MOTIVOS_PLANILLA.find((m) => m.clave === clave) ?? MOTIVOS_PLANILLA[0];
}

/** «Encontré unidades» no se ofrece en el PISO de una tienda que separa piso y almacén: lo encontrado se anota en el almacén y después
 *  se cuelga (la base lo rechaza igual: `reposicion_piso_cerrada`). */
export function motivoCerrado(clave: ClaveMotivoPlanilla, lugar: "piso" | "almacen", separa: boolean): string | null {
  if (clave === "encontre" && reposicionCerrada(lugar, separa)) return "En el piso no: lo encontrado se anota en el almacén y después se cuelga.";
  return null;
}

/** El motivo y la nota que viajan a `ajustar_inventario`. Una nota escrita con un motivo que no la pide no viaja escondida. */
export function paraLaBase(clave: ClaveMotivoPlanilla, nota: string): { motivo: MotivoAjuste; nota: string } {
  const m = motivoPlanilla(clave);
  if (m.nota) return { motivo: m.base, nota: nota.trim() };
  return { motivo: m.base, nota: m.notaFija ?? "" };
}

/** ¿La nota alcanza? Las que se piden llevan al menos 3 letras (la base exige lo mismo para «Encontré»: `encontre_prendas_sin_nota`). */
export function notaLista(clave: ClaveMotivoPlanilla, nota: string): boolean {
  return !motivoPlanilla(clave).nota || nota.trim().length >= NOTA_MINIMA_ENCONTRE;
}

/** En qué lugar entra la planilla (Felipe 2026-10-23, ronda 3): donde esa talla tiene más unidades; con empate, en el almacén (como
 *  entraba antes). Los Aretes Dorados con 3 en piso y 0 en almacén entran en «En piso». */
export function lugarInicial(talla: { piso: number | null; almacen: number | null }, separa: boolean): "piso" | "almacen" {
  if (!separa) return "almacen";
  return (talla.piso ?? 0) > (talla.almacen ?? 0) ? "piso" : "almacen";
}

/* ---------- El modelo: qué colores y tallas tiene la planilla ---------- */

/** Lo que la lectura trae de cada variante además del stock: el color en #hex y si se sigue vendiendo. */
export type ExtraDeVariante = { hex: string | null; activa: boolean };

export type ColorDelModelo = { color: string | null; hex: string | null };

export type ModeloDeAjuste = {
  colores: ColorDelModelo[];
  tallas: (string | null)[];
  /** La variante de cada cruce, o nada si esa combinación no existe. */
  celdas: ReadonlyMap<string, VarianteAjuste>;
};

export const claveCelda = (color: string | null, talla: string | null) => `${color ?? ""}|${talla ?? ""}`;

/** Una talla sin nombre se rotula «Única» y va al final, como en todo el ERP. */
const compararTallaOpcional = (a: string | null, b: string | null) => (a === null || b === null ? (a === b ? 0 : a === null ? 1 : -1) : compararTallas(a, b));

/** Las variantes del producto en la planilla: las que se venden, más las que ya no se venden pero todavía tienen algo en esta sede (hay
 *  que poder llevarlas a 0). Los colores salen en el orden de Existencias (`ordenColores`) y después los que la tienda nunca tuvo, por
 *  nombre; las tallas, como se cuenta una curva (S · M · L). */
export function armarModelo(
  variantes: readonly VarianteAjuste[],
  extras: ReadonlyMap<string, ExtraDeVariante>,
  ordenColores: readonly (string | null)[]
): ModeloDeAjuste {
  const visibles = variantes.filter((v) => extras.get(v.varianteId)?.activa !== false || v.stockSinDividir > 0);
  const colores = new Map<string | null, ColorDelModelo>();
  for (const v of visibles) if (!colores.has(v.color)) colores.set(v.color, { color: v.color, hex: extras.get(v.varianteId)?.hex ?? null });
  const posicion = (c: string | null) => {
    const i = ordenColores.indexOf(c);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const listaColores = [...colores.values()].sort((a, b) => posicion(a.color) - posicion(b.color) || (a.color ?? "").localeCompare(b.color ?? "", "es"));
  const tallas = [...new Set(visibles.map((v) => v.talla))].sort(compararTallaOpcional);
  const celdas = new Map(visibles.map((v) => [claveCelda(v.color, v.talla), v]));
  return { colores: listaColores, tallas, celdas };
}

/* ---------- Cada celda: por qué no sube o no baja ---------- */

/** Por qué el «+» de una celda no suma, o `null` si suma. `pendiente`: lo ya tocado en esa celda en la visita. */
export function porQueNoSube(o: {
  variante: Pick<VarianteAjuste, "sinHistoria">;
  motivo: ClaveMotivoPlanilla;
  pendiente: number;
  cargaAbierta: boolean;
  enPisoCerrado: boolean;
  nombre: string;
}): string | null {
  const m = motivoPlanilla(o.motivo);
  if (m.sentido === "resta" && o.pendiente >= 0) return `«${m.texto}» solo resta: para sumar, elige otro motivo.`;
  // La misma condición que la base (`textoProblemaMotivo`), dicha con el nombre del motivo de la planilla.
  if (textoProblemaMotivo({ delta: 1, variante: o.variante }, m.base, o.cargaAbierta, o.enPisoCerrado)) {
    return `${o.nombre} nunca estuvo en esta tienda: si la encontraste, elige «Encontré unidades»${o.enPisoCerrado ? " en el almacén" : ""}.`;
  }
  return null;
}

/** Por qué el «−» de una celda no resta: `null` si resta; `""` si no hay nada que decir (ya está en 0). Lo apartado para clientes no se
 *  quita (sigue en la tienda), y lo que solo suma no resta. */
export function porQueNoBaja(o: {
  variante: VarianteAjuste;
  lugar: LugarAjuste;
  motivo: ClaveMotivoPlanilla;
  pendiente: number;
  nombre: string;
}): string | null {
  const m = motivoPlanilla(o.motivo);
  const numero = stockEn(o.variante, o.lugar) + o.pendiente;
  if (numero <= 0) return "";
  if (m.sentido === "suma" && o.pendiente <= 0) return `«${m.texto}» solo suma: para quitar, elige otro motivo.`;
  const apartado = apartadoEn(o.variante, o.lugar);
  if (numero <= apartado) return `${o.nombre}: ${apartado === 1 ? "1 está apartada" : `${apartado} están apartadas`} para clientes y no se quitan aquí.`;
  return null;
}

/** El piso de una celda: lo apartado (o lo de hoy, si el motivo solo suma). Al escribir un número más bajo, se queda en el piso. */
export function minimoDeLaCelda(variante: VarianteAjuste, lugar: LugarAjuste, motivo: ClaveMotivoPlanilla): number {
  return motivoPlanilla(motivo).sentido === "suma" ? stockEn(variante, lugar) : apartadoEn(variante, lugar);
}

/** El tope de una celda que solo resta: no sube de lo que hay hoy. */
export function maximoDeLaCelda(variante: VarianteAjuste, lugar: LugarAjuste, motivo: ClaveMotivoPlanilla): number | null {
  return motivoPlanilla(motivo).sentido === "resta" ? stockEn(variante, lugar) : null;
}

/* ---------- Lo que frena guardar ---------- */

/** Lo que frena guardar (con el campo que lo arregla), o `null`. Primero cada talla contra el motivo, después la nota y quién. Las mismas
 *  reglas que la base y que la ficha (`problemaDelStockDeLaVisita`), dichas antes de guardar. */
export function problemaDelLote(o: {
  lineas: readonly { delta: number; nombre: string; variante: Pick<VarianteAjuste, "sinHistoria"> }[];
  motivo: ClaveMotivoPlanilla;
  nota: string;
  cargaAbierta: boolean;
  enPisoCerrado: boolean;
  responsableListo: boolean;
}): { texto: string; campo: "cambios" | "motivo" | "nota" | "responsable" } | null {
  if (o.lineas.length === 0) return { texto: "una talla", campo: "cambios" };
  const m = motivoPlanilla(o.motivo);
  for (const l of o.lineas) {
    if (m.sentido === "suma" && l.delta < 0) return { texto: `«${m.texto}» solo suma, y ${l.nombre} baja`, campo: "motivo" };
    if (m.sentido === "resta" && l.delta > 0) return { texto: `«${m.texto}» solo resta, y ${l.nombre} sube`, campo: "motivo" };
    const p = textoProblemaMotivo(l, m.base, o.cargaAbierta, o.enPisoCerrado);
    if (p) return { texto: `${l.nombre} entra con «Encontré unidades»`, campo: "motivo" };
  }
  if (!notaLista(o.motivo, o.nota)) return { texto: (m.nota?.etiqueta ?? "la nota").replace(/[¿?]/g, "").toLocaleLowerCase("es"), campo: "nota" };
  if (!o.responsableListo) return { texto: "quién lo hace", campo: "responsable" };
  return null;
}

/** «3 cambios · entran 4 · salen 1». */
export function resumenDelLote(lineas: readonly { delta: number }[]): { tallas: number; entran: number; salen: number } {
  return {
    tallas: lineas.length,
    entran: lineas.reduce((s, l) => s + Math.max(0, l.delta), 0),
    salen: lineas.reduce((s, l) => s + Math.max(0, -l.delta), 0),
  };
}

/* ---------- Contar con la tienda abierta (ADR-0494, /chaos 2026-10-23 CON-06; Felipe: «aplica tu recomendación») ---------- */

/** «Conté y hay otro número» es un número de verdad, no una diferencia: viaja con lo que había al contar (`esperado`) y la base rechaza
 *  el ajuste si otra venta o movimiento lo cambió mientras tanto. Los demás motivos SON diferencias («encontré 2», «no aparece 1») y
 *  valen igual aunque alguien haya vendido. */
export function viajaConLoQueHabia(motivo: ClaveMotivoPlanilla): boolean {
  return motivo === "conte";
}

/** Una talla que cambió mientras se contaba: lo que había (lo que leyó la planilla) y lo que hay ahora, según la base. */
export type CambioAlContar = { varianteId: string; antes: number; ahora: number };

/** El rechazo `ajuste_cambio_al_contar` trae en `details` lo que cambió, en JSON (`[{variante_id, esperado, ahora}]`). Otro error, `null`;
 *  ese rechazo con un `details` que no se entiende, una lista vacía (la pantalla vuelve a leer todo). */
export function cambiosAlContar(error: { hint?: string | null; details?: string | null } | null): CambioAlContar[] | null {
  if (error?.hint !== "ajuste_cambio_al_contar") return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(error.details ?? "");
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((c) =>
    c && typeof c.variante_id === "string" && Number.isInteger(c.esperado) && Number.isInteger(c.ahora)
      ? [{ varianteId: c.variante_id as string, antes: c.esperado as number, ahora: c.ahora as number }]
      : []
  );
}

/** La copia local con lo que hay ahora en el lugar contado (lo acaba de decir la base). */
export function conStockDeAhora(v: VarianteAjuste, lugar: LugarAjuste, ahora: number): VarianteAjuste {
  const diferencia = ahora - stockEn(v, lugar);
  return {
    ...v,
    stockPiso: lugar === "piso" ? ahora : v.stockPiso,
    stockAlmacen: lugar === "almacen" ? ahora : v.stockAlmacen,
    stockSinDividir: v.stockSinDividir + diferencia,
  };
}

/** Lo contado se queda escrito: la diferencia se vuelve a sacar contra lo de ahora (con 6 leídas, 5 contadas y 1 vendida, la talla
 *  ya no cambia: lo contado es lo que hay). */
export function mantenerLoContado(pendientes: Pendientes, cambios: readonly CambioAlContar[]): Pendientes {
  return cambios.reduce((p, c) => conPaso(p, c.varianteId, c.antes + (pendientes[c.varianteId] ?? 0) - c.ahora), pendientes);
}

/** El aviso, en voz de tienda: qué talla cambió, de cuánto a cuánto, que no se guardó nada y qué hacer. */
export function textoCambiosAlContar(cambios: readonly CambioAlContar[], nombreDe: (varianteId: string) => string): string {
  const cada = cambios.map((c) => ({ nombre: nombreDe(c.varianteId), antes: c.antes, ahora: c.ahora }));
  const queCambio =
    cada.length === 1
      ? `Mientras contabas cambió ${cada[0]!.nombre}: había ${cada[0]!.antes} y ahora hay ${cada[0]!.ahora}.`
      : `Mientras contabas cambiaron ${listaEnFrase(cada.map((c) => `${c.nombre} (había ${c.antes}, ahora hay ${c.ahora})`))}.`;
  return `${queCambio} No se guardó nada: lo que contaste sigue escrito. ${cada.length === 1 ? "Revisa esa talla" : "Revisa esas tallas"} y vuelve a guardar.`;
}

function listaEnFrase(partes: readonly string[]): string {
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/* ---------- El ancho justo del modal (Felipe 2026-10-23: «no debería ensancharse innecesariamente») ---------- */

/** Las medidas de la planilla, las mismas que dibuja `AjusteDelModelo` (si una cambia allá, cambia aquí). */
export const PLANILLA = {
  /** La columna del color, como mínimo (el círculo y el nombre). */
  columnaColor: 168,
  /** Cada talla: el paso de cantidad «planilla» con su aire. */
  columnaTalla: 112,
  /** El total del color (no va con una sola talla: repetiría el número). */
  columnaTotal: 72,
} as const;

/** Lo que rodea a la planilla dentro del modal al ajustar: los bordes de la hoja (24 + 24), la columna de la foto (14 rem) y el espacio
 *  entre las dos (24). */
const ALREDEDOR_DE_LA_PLANILLA = 48 + 224 + 24;

export function anchoDeLaPlanilla(tallas: number): number {
  return PLANILLA.columnaColor + tallas * PLANILLA.columnaTalla + (tallas > 1 ? PLANILLA.columnaTotal : 0);
}

/** Los anchos posibles del modal al ajustar, en rem: el de siempre y los que agregan tallas. Son clases de Tailwind escritas enteras (el
 *  compilador solo emite las que ve en el código), y por eso es una tabla y no una cuenta. */
export const ANCHOS_DEL_MODAL = [
  { rem: 62, clase: "sm:max-w-[62rem]" },
  { rem: 69, clase: "sm:max-w-[69rem]" },
  { rem: 76, clase: "sm:max-w-[76rem]" },
  { rem: 83, clase: "sm:max-w-[83rem]" },
  { rem: 90, clase: "sm:max-w-[90rem]" },
] as const;

/** El ancho del modal para ajustar un modelo de `tallas` tallas: el de siempre si la planilla cabe (de 1 a 4 tallas), y si no, el más
 *  chico en que cabe. Con más tallas de las que entran en el más grande, la planilla se desliza dentro de su caja. */
export function anchoDelModalAlAjustar(tallas: number): (typeof ANCHOS_DEL_MODAL)[number] {
  const necesita = anchoDeLaPlanilla(tallas) + ALREDEDOR_DE_LA_PLANILLA;
  return ANCHOS_DEL_MODAL.find((a) => a.rem * 16 >= necesita) ?? ANCHOS_DEL_MODAL[ANCHOS_DEL_MODAL.length - 1];
}
