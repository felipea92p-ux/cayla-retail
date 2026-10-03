// La matriz color × talla de Editar producto (maqueta B «Panel del taller», docs/maquetas/producto-editar-rediseno-2026-10/,
// elegida por Felipe el 2026-10-02) — sin React ni red.
//
// CONTRATO
//   PROMETE: armar las filas (colores activos, en el orden de la ficha) y columnas (tallas activas, en orden de curva) de la
//            matriz; el número de cada celda (el stock de HOY en el lugar que se ajusta, más lo que la persona ya tocó y todavía
//            no viaja); los totales por color, por talla y general; y el lote que se manda a `ajustar_inventario`.
//   ASUME:   el stock llega por `VarianteAjuste` (la misma lectura que `AjustarInventarioModal`), acotado a la sede activa.
//   NO HACE: no escribe stock. El stepper es el ajuste de siempre (ADR-0240, `ajustar_inventario`): lo tocado se junta y viaja
//            UNA vez, al confirmar «Revisar y guardar» (ADR-0313, act. 2026-10-02 noche), con su motivo y su responsable; `stock`
//            sigue siendo un snapshot de `movimientos` (principio 4).

import { compararTallas } from "./tallas";
import { apartadoEn, lineasDeAjuste, modoDeAjuste, stockEn, type LineaAjuste, type LugarAjuste, type MotivoAjuste, type VarianteAjuste } from "./ajuste-reglas";
import { destinoGuardado, type Destino, type FilaFicha, type NombresFicha } from "./variantes-ficha-reglas";

export type MatrizFicha = {
  /** Colores con alguna variante activa, en el orden en que aparecen en la ficha. */
  colores: (string | null)[];
  /** Tallas con alguna variante activa, en orden de curva (S · M · L, 28 · 30). */
  tallas: (string | null)[];
  /** La fila activa de cada celda; `undefined` = esa combinación no existe (o está desactivada). */
  celda: (color: string | null, talla: string | null) => FilaFicha | undefined;
};

export function armarMatriz(filas: readonly FilaFicha[], n: NombresFicha): MatrizFicha {
  const activas = filas.filter((f) => f.activo);
  const colores: (string | null)[] = [];
  const tallas: (string | null)[] = [];
  for (const f of activas) {
    if (!colores.includes(f.colorCodigo)) colores.push(f.colorCodigo);
    if (!tallas.includes(f.tallaId)) tallas.push(f.tallaId);
  }
  tallas.sort((a, b) => {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return compararTallas(n.talla(a), n.talla(b));
  });
  const porClave = new Map(activas.map((f) => [`${f.colorCodigo ?? ""}|${f.tallaId ?? ""}`, f]));
  return { colores, tallas, celda: (c, t) => porClave.get(`${c ?? ""}|${t ?? ""}`) };
}

/** Lo que la persona tocó y todavía no viajó (o está viajando), por variante guardada: +2, −1. */
export type Pendientes = Readonly<Record<string, number>>;

/** El número de una celda guardada: el stock de hoy en el lugar, más lo tocado. Sin lectura de stock (todavía cargando), 0. */
export function cantidadDeCelda(v: VarianteAjuste | undefined, lugar: LugarAjuste, pendiente: number): number {
  return (v ? stockEn(v, lugar) : 0) + pendiente;
}

/** El piso de una celda: no baja de cero ni de lo apartado para clientas (los dos candados de `fn_aplicar_movimiento`). */
export function minimoDeCelda(v: VarianteAjuste | undefined, lugar: LugarAjuste): number {
  return v ? apartadoEn(v, lugar) : 0;
}

/** Lo tocado tras un «−» o un «+»; `null` si ese toque dejaría la celda debajo de su piso. */
export function pasoDeCelda(actual: number, pendiente: number, paso: 1 | -1, minimo: number): number | null {
  const siguiente = pendiente + paso;
  if (actual + siguiente < minimo) return null;
  return siguiente;
}

/** Lo tocado para que la celda muestre `objetivo` (el número que se escribió en ella); `null` si no es un entero de 0 en
 *  adelante o si queda debajo de su piso (lo apartado para clientas no se puede contar como que no está). */
export function fijarCelda(actual: number, objetivo: number, minimo: number): number | null {
  if (!Number.isInteger(objetivo) || objetivo < 0 || objetivo < minimo) return null;
  return objetivo - actual;
}

/** Un cambio de stock de una variante guardada, como lo lee la hoja «Revisa y guarda»: de cuánto a cuánto. */
export type CambioDeStock = { varianteId: string; color: string | null; talla: string | null; antes: number; despues: number };

/** Lo tocado en las variantes guardadas, en el orden de la lectura (por talla y color). Lo que volvió a su número no cuenta. */
export function cambiosDeStock(variantes: readonly VarianteAjuste[], pendientes: Pendientes, lugar: LugarAjuste): CambioDeStock[] {
  return variantes.flatMap((v) => {
    const d = pendientes[v.varianteId];
    if (!d) return [];
    const antes = stockEn(v, lugar);
    return [{ varianteId: v.varianteId, color: v.color, talla: v.talla, antes, despues: antes + d }];
  });
}

/** El grupo «Stock» de la hoja: una línea por talla («S · Blanco  4 → 6») y una nota con el motivo y el lugar. */
export function grupoDeStockEnHoja(
  cambios: readonly CambioDeStock[],
  motivo: string,
  donde: string
): { titulo: string; lineas: { texto: string; antes: string; despues: string }[]; nota: string } | null {
  if (cambios.length === 0) return null;
  const sube = cambios.filter((c) => c.despues > c.antes).reduce((s, c) => s + (c.despues - c.antes), 0);
  return {
    titulo: "Stock",
    lineas: cambios.map((c) => ({ texto: [c.talla ?? "Única", c.color].filter(Boolean).join(" · "), antes: String(c.antes), despues: String(c.despues) })),
    nota: `Se registra como «${motivo}» ${donde}.${sube > 0 ? ` Entran ${sube} ${sube === 1 ? "unidad" : "unidades"}: al guardar te propone imprimir sus etiquetas.` : ""}`,
  };
}

/** Lo que subió al guardar, por variante (cuántas unidades nuevas, para imprimir justo esas etiquetas). Se suma si se repite. */
export type Subida = { varianteId: string; color: string | null; talla: string | null; unidades: number };

export function juntarSubidas(antes: readonly Subida[], nuevas: readonly Subida[]): Subida[] {
  const salida = antes.map((s) => ({ ...s }));
  for (const n of nuevas) {
    if (!(n.unidades > 0)) continue;
    const ya = salida.find((s) => s.varianteId === n.varianteId);
    if (ya) ya.unidades += n.unidades;
    else salida.push({ ...n });
  }
  return salida;
}

/** «Imprimir etiquetas» de lo que subió: una etiqueta por unidad nueva, no por todo el stock de la tienda (`?unidades=id:n`). */
export function hrefEtiquetasDeSubidas(subidas: readonly Subida[]): string | null {
  const con = subidas.filter((s) => s.unidades > 0);
  if (con.length === 0) return null;
  return `/etiquetas-de-precio?unidades=${con.map((s) => `${s.varianteId}:${s.unidades}`).join(",")}`;
}

/** Suma un paso a lo pendiente; lo que vuelve a 0 deja de estar pendiente. */
export function conPaso(p: Pendientes, varianteId: string, siguiente: number): Record<string, number> {
  const salida = { ...p };
  if (siguiente === 0) delete salida[varianteId];
  else salida[varianteId] = siguiente;
  return salida;
}

/**
 * El lote que viaja a `ajustar_inventario`: las mismas líneas que arma el modal (`lineasDeAjuste`), escritas como las escribiría
 * una persona en él. Con «Conteo físico» el modal pide CUÁNTAS HAY (el stock de la pantalla más lo tocado); con los demás
 * motivos, cuánto se suma o se resta. La base guarda siempre la diferencia, así que el resultado es el mismo con cualquier motivo.
 */
export function lineasDelLote(variantes: readonly VarianteAjuste[], pendientes: Pendientes, lugar: LugarAjuste, motivo: MotivoAjuste): LineaAjuste[] {
  const modo = modoDeAjuste(motivo);
  const cantidades: Record<string, string> = {};
  for (const v of variantes) {
    const d = pendientes[v.varianteId];
    if (!d) continue;
    cantidades[v.varianteId] = String(modo === "contado" ? stockEn(v, lugar) + d : d);
  }
  return lineasDeAjuste(variantes, cantidades, lugar, modo);
}

/** Totales de la matriz con lo que cada celda muestra: por color, por talla y general. */
export function totalesMatriz(m: MatrizFicha, numero: (f: FilaFicha) => number): { porColor: Map<string | null, number>; porTalla: Map<string | null, number>; total: number } {
  const porColor = new Map<string | null, number>();
  const porTalla = new Map<string | null, number>();
  let total = 0;
  for (const c of m.colores) {
    for (const t of m.tallas) {
      const f = m.celda(c, t);
      if (!f) continue;
      const u = numero(f);
      porColor.set(c, (porColor.get(c) ?? 0) + u);
      porTalla.set(t, (porTalla.get(t) ?? 0) + u);
      total += u;
    }
  }
  return { porColor, porTalla, total };
}

/** Cómo se pinta la barra de una talla en el panel: vacía en 0, en ámbar con 3 o menos (se acaba), en verde si hay. */
export function tonoDeBarra(unidades: number): "cero" | "bajo" | "normal" {
  return unidades <= 0 ? "cero" : unidades <= 3 ? "bajo" : "normal";
}

/** «9 variantes activas · S/ 69–89»: lo que dice la cabecera de «Variantes y precios» plegada o abierta. */
export function resumenVariantes(filas: readonly FilaFicha[]): string {
  const activas = filas.filter((f) => f.activo);
  const precios = activas.map((f) => Number(f.precio)).filter((p) => p > 0);
  const partes = [`${activas.length} ${activas.length === 1 ? "variante activa" : "variantes activas"}`];
  if (precios.length > 0) partes.push(rangoDePrecios(precios));
  return partes.join(" · ");
}

/** «S/ 69» si todas valen lo mismo, «S/ 69–89» si no. Con céntimos solo si alguno los tiene. */
export function rangoDePrecios(precios: readonly number[]): string {
  const min = Math.min(...precios);
  const max = Math.max(...precios);
  const conCentimos = precios.some((p) => !Number.isInteger(p));
  const f = (p: number) => (conCentimos ? p.toFixed(2) : String(p));
  return min === max ? `S/ ${f(min)}` : `S/ ${f(min)}–${f(max)}`;
}

// ---------------------------------------------------------------------------
// Etiquetas y colores que se quitan, desde la misma matriz (ADR-0313, act. 2026-10-03)
// ---------------------------------------------------------------------------
// «Más de cada variante» desapareció: lo que solo vivía ahí (etiquetas por variante, desactivar un color) se hace en la tabla.
// Nada de esto guarda: cambia las filas, y todo viaja con «Revisar y guardar» (ADR-0257), como el precio.

/** Cuántas de las variantes activas llevan la etiqueta: «Nuevo · 4 de 15». */
export function cuentaEtiqueta(filas: readonly FilaFicha[], etiquetaId: string): { con: number; de: number } {
  const activas = filas.filter((f) => f.activo);
  return { con: activas.filter((f) => f.etiquetaIds.includes(etiquetaId)).length, de: activas.length };
}

/** Pone (o quita) UNA etiqueta en las variantes `claves`; sin `claves`, en todas las activas. Las otras etiquetas de cada
 *  variante no se tocan, y una variante que ya estaba como se pide queda igual (el resumen no cuenta un cambio que no hubo). */
export function ponerEtiqueta(filas: readonly FilaFicha[], etiquetaId: string, poner: boolean, claves?: readonly string[]): FilaFicha[] {
  const objetivo = claves ? new Set(claves) : null;
  return filas.map((f) => {
    if (objetivo ? !objetivo.has(f.clave) : !f.activo) return f;
    const tiene = f.etiquetaIds.includes(etiquetaId);
    if (tiene === poner) return f;
    return { ...f, etiquetaIds: poner ? [...f.etiquetaIds, etiquetaId] : f.etiquetaIds.filter((id) => id !== etiquetaId) };
  });
}

/** ¿Esta etiqueta cambió en esta variante contra lo guardado? Una variante nueva no tiene «antes»: no se marca. */
export function etiquetaCambiada(f: FilaFicha, etiquetaId: string): boolean {
  if (!f.guardada) return false;
  return f.etiquetaIds.includes(etiquetaId) !== f.guardada.etiquetaIds.includes(etiquetaId);
}

/** Los colores (como se ven ahora) que se quitan al guardar: se vendían y ya no les queda ninguna talla activa. */
export function coloresQueSeQuitan(filas: readonly FilaFicha[]): (string | null)[] {
  const salida: (string | null)[] = [];
  for (const f of filas) {
    if (salida.includes(f.colorCodigo) || !f.guardada?.activo) continue;
    if (!filas.some((o) => o.colorCodigo === f.colorCodigo && o.activo)) salida.push(f.colorCodigo);
  }
  return salida;
}

/** Los colores que ya no se vendían al abrir la ficha (todas sus tallas desactivadas en la base) y siguen así. Vuelven con
 *  «+ Agregar color», que reactiva lo que existía en vez de crear otra variante (`agregarCombinaciones`). */
export function coloresYaDesactivados(filas: readonly FilaFicha[]): (string | null)[] {
  const salida: (string | null)[] = [];
  for (const f of filas) {
    if (salida.includes(f.colorCodigo)) continue;
    const delColor = filas.filter((o) => o.colorCodigo === f.colorCodigo);
    if (delColor.every((o) => !o.activo && o.guardada && !o.guardada.activo)) salida.push(f.colorCodigo);
  }
  return salida;
}

/** «Deshacer» de «Quitar color»: vuelven a la venta las tallas de ese color que estaban activas en la base. */
export function devolverColor(filas: readonly FilaFicha[], colorCodigo: string | null): FilaFicha[] {
  return filas.map((f) => (f.colorCodigo === colorCodigo && f.guardada?.activo && !f.activo ? { ...f, activo: true } : f));
}

export type CorreccionPendiente = { clave: string; texto: string; claves: string[]; destino: Destino };

/** Las correcciones de color o talla que esperan a «Revisar y guardar», juntas como se hicieron: «Arena → Beige (3 tallas)»,
 *  «Talla S → M (2 colores)». La matriz ya muestra la identidad NUEVA; sin esta línea, una corrección se veía como un cambio
 *  de nombre sin «antes» ni «Deshacer». `destino` es lo que la devuelve a como está guardada. */
export function correccionesPendientes(filas: readonly FilaFicha[], n: NombresFicha): CorreccionPendiente[] {
  const grupos = new Map<string, CorreccionPendiente & { eje: "color" | "talla" | "ambos"; antes: string | null; ahora: string | null }>();
  for (const f of filas) {
    const g = f.guardada;
    if (!g) continue;
    const color = f.colorCodigo !== g.colorCodigo;
    const talla = f.tallaId !== g.tallaId;
    if (!color && !talla) continue;
    const eje = color && talla ? "ambos" : color ? "color" : "talla";
    const clave = eje === "ambos" ? `x|${f.clave}` : eje === "color" ? `c|${g.colorCodigo}|${f.colorCodigo}` : `t|${g.tallaId}|${f.tallaId}`;
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.claves.push(f.clave);
      continue;
    }
    const destino: Destino = eje === "color" ? { colorCodigo: g.colorCodigo } : eje === "talla" ? { tallaId: g.tallaId } : destinoGuardado(f);
    const [antes, ahora] = eje === "talla" ? [g.tallaId, f.tallaId] : [g.colorCodigo, f.colorCodigo];
    grupos.set(clave, { clave, texto: "", claves: [f.clave], destino, eje, antes, ahora });
  }
  const talla = (t: string | null) => n.talla(t) || "Única";
  return [...grupos.values()].map(({ eje, antes, ahora, ...c }) => {
    const una = filas.find((f) => f.clave === c.claves[0])!;
    const k = c.claves.length;
    const texto =
      eje === "color"
        ? `${n.color(antes)} → ${n.color(ahora)} ${k > 1 ? `(${k} tallas)` : `en ${talla(una.tallaId)}`}`
        : eje === "talla"
          ? `Talla ${talla(antes)} → ${talla(ahora)} ${k > 1 ? `(${k} colores)` : `en ${n.color(una.colorCodigo)}`}`
          : `${n.color(una.guardada!.colorCodigo)} ${talla(una.guardada!.tallaId)} → ${n.color(una.colorCodigo)} ${talla(una.tallaId)}`;
    return { ...c, texto };
  });
}

/**
 * «Quitar color» (opción B, Felipe 2026-10-03): el color deja de venderse y lo que se le tocó en esta visita (precio, costo,
 * etiquetas) vuelve a lo guardado. Si algún día ese color vuelve con «+ Agregar color», vuelve como estaba, no con un precio o
 * un «Nuevo» de una visita que nadie recuerda. Las que ya existen se desactivan (nunca se borran: guardan stock e historia);
 * las nuevas, que todavía no existen, se van. «Deshacer» (`devolverColor`) la vuelve a la venta, sin lo que se le había tocado.
 */
export function quitarColor(filas: readonly FilaFicha[], colorCodigo: string | null): FilaFicha[] {
  const delColor = (f: FilaFicha) => f.activo && f.colorCodigo === colorCodigo;
  return filas
    .filter((f) => !delColor(f) || f.guardada !== null)
    .map((f) => {
      if (!delColor(f) || !f.guardada) return f;
      const g = f.guardada;
      return { ...f, activo: false, precio: g.precio, costo: f.costoFijo ? f.costo : g.costo, etiquetaIds: [...g.etiquetaIds] };
    });
}

/** Una línea de la hoja «Etiquetas de lo que entró»: una talla de un color, cuántas unidades entraron y con qué precio. */
export type LineaParaImprimir = {
  varianteId: string;
  colorCodigo: string | null;
  color: string;
  talla: string;
  precio: number | null;
  unidades: number;
  etiquetaIds: string[];
};

/** Lo que entró en el guardado (las `Subida`s del stock), con lo que la ficha sabe de cada variante: su color, su talla, su precio
 *  y sus etiquetas. En el orden de la tabla: por color como aparecen, y por talla en curva. Una variante que la ficha no conoce
 *  (no debería pasar) sale con lo que trae la subida. */
export function lineasParaImprimir(subidas: readonly Subida[], filas: readonly FilaFicha[], n: NombresFicha): LineaParaImprimir[] {
  const lineas = subidas
    .filter((s) => s.unidades > 0)
    .map((s) => {
      const f = filas.find((x) => x.id === s.varianteId);
      const precio = f ? Number(f.precio) : NaN;
      return {
        varianteId: s.varianteId,
        colorCodigo: f ? f.colorCodigo : null,
        color: f ? n.color(f.colorCodigo) : (s.color ?? "Sin color"),
        talla: f ? n.talla(f.tallaId) || "Única" : (s.talla ?? "Única"),
        precio: Number.isFinite(precio) && precio > 0 ? precio : null,
        unidades: s.unidades,
        etiquetaIds: f ? [...f.etiquetaIds] : [],
        orden: f ? filas.findIndex((x) => x.colorCodigo === f.colorCodigo) : Number.MAX_SAFE_INTEGER,
      };
    });
  lineas.sort((a, b) => a.orden - b.orden || compararTallas(a.talla, b.talla));
  return lineas.map((l) => ({
    varianteId: l.varianteId,
    colorCodigo: l.colorCodigo,
    color: l.color,
    talla: l.talla,
    precio: l.precio,
    unidades: l.unidades,
    etiquetaIds: l.etiquetaIds,
  }));
}
