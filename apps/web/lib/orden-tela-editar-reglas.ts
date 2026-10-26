import type { InsumoVista } from "./insumos";
import { aMilesimas, leerConsumo, type InsumoDelTaller, type TelaBorrador } from "./orden-tela-reglas";
import type { InsumoPagina } from "./orden-pagina-reglas";

// «Editar tela y avíos» de una orden que ya está abierta (ADR-0510, actividad 2): las reglas puras de la hoja. Sin React ni Supabase.
//
// LA BASE MANDA: `guardar_insumos_orden` (migración 20261026035000) reemplaza la lista de tela y avíos de la orden con la que llega, la valida con la misma función que usa abrir y no deja quitar
// una tela con consumo anotado. Aquí solo se ARMA lo que la hoja muestra a partir de lo que la página ya leyó, se avisa antes lo que la base rechazaría por consumo, y se cuenta qué cambió para decirlo.
//
// CONTRATO
//   PROMETE: que `telasIniciales` devuelve la lista tal como está en la orden (la tela primero, luego los avíos); que `hayCambios` ignora filas sin tela elegida y diferencias de formato («1.2» y «1.200» son
//            lo mismo); que `problemasDeEdicion` marca EXACTAMENTE lo que la base rechaza con `insumo_con_consumo` (una tela con consumo que se quedó sin ninguna fila) y nada más; que `contarCambios`
//            cuenta igual que la base (agregadas, corregidas, quitadas); y que `armarEdicionDeTela` entrega algo que viaja del servidor al cliente (sin `Map`, sin funciones).
//   ASUME:   el consumo ya anotado viene de la página (`InsumoPagina.usado`: lo consumido menos lo devuelto, por tela, no por color); un insumo declarado en la orden que ya no está en el estante se archivó.
//   NO HACE: no decide si la lista es válida (eso es `problemasTela`, que ya refleja el validador de la base), no escribe y no calcula el plan: el plan lo calcula la base.

/** Una fila de la lista, ya sin formato: la llave es la misma que usa el índice único de la base (tela + color, con «sin color» = vacío). */
const llave = (insumoId: string, colorCodigo: string | null) => `${insumoId}\u0000${colorCodigo ?? ""}`;

/** Las filas con tela elegida y su consumo en milésimas (null = el consumo no se lee todavía: se trata como una fila distinta de cualquiera guardada). */
function filasConTela(telas: readonly TelaBorrador[]): Map<string, { insumoId: string; consumo: number | null }> {
  const filas = new Map<string, { insumoId: string; consumo: number | null }>();
  for (const t of telas) {
    if (!t.insumoId) continue;
    const consumo = leerConsumo(t.consumoPorPrenda);
    filas.set(llave(t.insumoId, t.colorCodigo), { insumoId: t.insumoId, consumo: consumo === null ? null : aMilesimas(consumo) });
  }
  return filas;
}

/** La lista de la orden tal como está guardada: primero la tela, luego los avíos (la hoja los acomoda sola por color). El consumo con tres decimales, como lo muestra «Nueva orden». */
export function telasIniciales(insumos: readonly InsumoPagina[]): TelaBorrador[] {
  const fila = (i: InsumoPagina): TelaBorrador => ({ insumoId: i.insumoId, colorCodigo: i.colorCodigo, consumoPorPrenda: i.consumoPorPrenda.toFixed(3) });
  return [...insumos.filter((i) => i.tipo === "tela").map(fila), ...insumos.filter((i) => i.tipo === "avio").map(fila)];
}

/** ¿Lo que hay en la hoja es distinto de lo guardado? Cuenta una tela agregada, una quitada o un consumo cambiado; una fila sin tela elegida no cuenta. */
export function hayCambios(inicial: readonly TelaBorrador[], actual: readonly TelaBorrador[]): boolean {
  const a = filasConTela(inicial);
  const b = filasConTela(actual);
  if (a.size !== b.size) return true;
  for (const [k, fila] of b) {
    const antes = a.get(k);
    if (!antes || antes.consumo !== fila.consumo) return true;
  }
  return false;
}

export type CambiosDeTela = { agregadas: number; corregidas: number; quitadas: number };

/** Lo mismo que cuenta la base: filas nuevas, filas con otro consumo y filas que ya no están. Una fila con el consumo sin leer cuenta como corregida. */
export function contarCambios(inicial: readonly TelaBorrador[], actual: readonly TelaBorrador[]): CambiosDeTela {
  const a = filasConTela(inicial);
  const b = filasConTela(actual);
  let agregadas = 0;
  let corregidas = 0;
  let quitadas = 0;
  for (const [k, fila] of b) {
    const antes = a.get(k);
    if (!antes) agregadas += 1;
    else if (antes.consumo !== fila.consumo) corregidas += 1;
  }
  for (const k of a.keys()) if (!b.has(k)) quitadas += 1;
  return { agregadas, corregidas, quitadas };
}

/** «agregaste 2, corregiste 1 y quitaste 1»: lo que se dice después de guardar. Vacío si no cambió nada. */
export function textoDeCambios(c: CambiosDeTela): string {
  const partes = [c.agregadas > 0 ? `agregaste ${c.agregadas}` : null, c.corregidas > 0 ? `corregiste ${c.corregidas}` : null, c.quitadas > 0 ? `quitaste ${c.quitadas}` : null].filter((p): p is string => p !== null);
  return partes.length < 2 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** Lo ya usado por tela o avío en esta orden. El libro de insumos no sabe de colores: es el mismo número en cada fila de una misma tela, así que se toma el mayor, no la suma. */
export function usadoPorInsumo(insumos: readonly InsumoPagina[]): Map<string, number> {
  const usado = new Map<string, number>();
  for (const i of insumos) usado.set(i.insumoId, Math.max(usado.get(i.insumoId) ?? 0, i.usado));
  return usado;
}

export type ProblemaDeEdicion = { insumoId: string; texto: string };

/**
 * Lo que la base rechazaría con `insumo_con_consumo`, dicho ANTES de guardar: una tela o avío con consumo anotado que se quedó sin ninguna fila. Quitar uno de sus colores mientras le queda otro
 * está bien, y corregir cuánto lleva cada prenda también. Lo demás (tela archivada, color ajeno, consumo mal escrito) lo dice `problemasTela`.
 */
export function problemasDeEdicion(inicial: readonly TelaBorrador[], actual: readonly TelaBorrador[], usado: ReadonlyMap<string, number>, nombres: ReadonlyMap<string, string>): ProblemaDeEdicion[] {
  const quedan = new Set([...filasConTela(actual).values()].map((f) => f.insumoId));
  const antes = [...new Set([...filasConTela(inicial).values()].map((f) => f.insumoId))];
  return antes
    .filter((id) => (usado.get(id) ?? 0) > 0 && !quedan.has(id))
    .map((id) => ({ insumoId: id, texto: `No se quita «${nombres.get(id) ?? "esta tela"}»: ya se anotó que se usó en esta orden. Puedes corregir cuánto lleva cada prenda.` }));
}

/** Todo lo que la hoja necesita y la página ya sabe, listo para cruzar del servidor al cliente. */
export type DatosEditarTela = {
  /** Telas y avíos del estante (sin archivar) y, aparte, los de la orden que ya no están en él (archivados: se ven, pero no se vuelven a elegir). */
  insumos: InsumoDelTaller[];
  /** El tejido del modelo: las telas de ese tejido se ofrecen primero. */
  tejidoId: string | null;
  tejidoNombre: string | null;
  consumoDeclarado: { telaPorPrenda: number; fuente: "declarado" | "medido" } | null;
  /** Solo quien ve los costos del Taller: el costo de la unidad (metro, unidad) del lote que se usaría. */
  conCostos: boolean;
  costoPorUnidad: Record<string, number>;
  /** Lo que las OTRAS órdenes ya reservan de cada tela (la de esta orden no cuenta contra sí misma) y lo que viene en camino. */
  comprometido: Record<string, number>;
  enCamino: Record<string, number>;
  /** Lo ya usado en esta orden por tela. */
  usado: Record<string, number>;
};

export type EntradaDeEdicion = {
  /** Lo que la página leyó de la orden. */
  insumosDeLaOrden: readonly InsumoPagina[];
  tejidoNombre: string | null;
  /** El estante: `getInsumosDelTaller().insumos` (sin archivados). */
  estante: readonly InsumoVista[];
  tejidoId: string | null;
  consumoDeclarado: DatosEditarTela["consumoDeclarado"];
  /** `getOpcionesNuevaOrden().datos`: lo comprometido y lo que viene en camino de TODAS las órdenes abiertas, esta incluida; null si no se leyó. */
  comprometidoDeTodas: Readonly<Record<string, number>> | null;
  enCaminoDeTodas: Readonly<Record<string, number>> | null;
  conCostos: boolean;
};

export function armarEdicionDeTela(e: EntradaDeEdicion): DatosEditarTela {
  const delEstante = e.estante.map<InsumoDelTaller>((i) => ({ id: i.id, nombre: i.nombre, tipo: i.tipo, unidad: i.unidad, tejidoId: i.tejidoId, colorCodigo: i.colorCodigo, saldo: i.saldo, mermaPct: i.merma, archivado: false }));
  const enElEstante = new Set(delEstante.map((i) => i.id));
  // Lo declarado que ya no está en el estante se archivó: se sigue viendo con su nombre, nunca se vuelve a elegir (la merma exacta ya no se conoce: solo afecta a la vista previa).
  const archivados: InsumoDelTaller[] = [];
  for (const i of e.insumosDeLaOrden) {
    if (enElEstante.has(i.insumoId) || archivados.some((a) => a.id === i.insumoId)) continue;
    archivados.push({ id: i.insumoId, nombre: i.nombre, tipo: i.tipo, unidad: i.unidad, tejidoId: null, colorCodigo: i.colorCodigo, saldo: i.saldo, mermaPct: 0, archivado: true });
  }
  const costoPorUnidad: Record<string, number> = {};
  if (e.conCostos) {
    for (const i of e.estante) {
      const lote = i.lotes.find((l) => l.saldo > 0 && l.costoUnitario !== null);
      if (lote) costoPorUnidad[i.id] = lote.costoUnitario as number;
    }
  }
  // «Lo que reservan las demás» de una tela que esta orden ya declara es lo que la página ya calculó sin ella; para las otras, lo de todas (esta orden no la declara, no se cuenta dos veces).
  const comprometido: Record<string, number> = { ...(e.comprometidoDeTodas ?? {}) };
  const enCamino: Record<string, number> = { ...(e.enCaminoDeTodas ?? {}) };
  for (const i of e.insumosDeLaOrden) {
    comprometido[i.insumoId] = Math.max(0, ...e.insumosDeLaOrden.filter((x) => x.insumoId === i.insumoId).map((x) => x.comprometidoOtras));
    enCamino[i.insumoId] = Math.max(0, ...e.insumosDeLaOrden.filter((x) => x.insumoId === i.insumoId).map((x) => x.enCamino));
  }
  return {
    insumos: [...delEstante, ...archivados],
    tejidoId: e.tejidoId,
    tejidoNombre: e.tejidoNombre,
    consumoDeclarado: e.consumoDeclarado,
    conCostos: e.conCostos,
    costoPorUnidad,
    comprometido,
    enCamino,
    usado: Object.fromEntries(usadoPorInsumo(e.insumosDeLaOrden)),
  };
}
