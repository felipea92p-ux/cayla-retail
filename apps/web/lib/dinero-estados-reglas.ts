// Finanzas ▸ Cuentas y dinero ▸ Dónde está: la campana «Estado de las cuentas» (rediseño visual, Felipe 2026-10-31,
// docs/maquetas/finanzas-dinero-rediseno-2026-10/). Una ventana con tres vistas de lo que pide mirada: las CUENTAS (cada una con su
// estado: sin conciliar, sin abonar, sin depositar, saldo negativo), los CIERRES de caja con diferencia y lo que falta REGISTRAR
// (depósitos de máquinas y salidas de planilla). Lógica pura: no calcula plata ni inventa un estado que la base no haya dado; solo
// ordena, filtra, cuenta y pagina lo que `gruposDeDinero`, `getCierresConDiferencia`, `avisosDeMaquinas` y la planilla ya traen.

import { GRUPO_CAMINO, montoConSigno, type GrupoCuentas } from "./dinero-telar-reglas";
import { fechaCorta, solesRedondo } from "./gastos-reglas";
import { avisosDeMaquinas, diaYNumero, type AlertaPos, type CierreConDiferencia, type CuentaDinero } from "./cuentas-dinero-reglas";
import { textoRegistrar, type AvisoPlanilla } from "./planilla-salidas-reglas";
import type { TonoChip } from "@/components/ui/Chip";

// ---- Las cuentas: una fila por cuenta, con su etapa, su sede y su estado -------------------------------------------------------

/** Por dónde va la plata: del cajón al banco. De ahí sale la columna «Etapa» y el orden de lo que se puede usar hoy. */
export type EtapaDinero = "banco" | "camino" | "deposito" | "caja";
export const TEXTO_ETAPA: Record<EtapaDinero, string> = {
  banco: "Ya en el banco",
  camino: "En camino al banco",
  deposito: "Por depositar",
  caja: "En las cajas de venta",
};

/** Qué es lo que hace que una cuenta pida atención (una sola razón por cuenta, la más grave). */
export type Pedido = "negativo" | "abonar" | "conciliar" | "depositar";
const PESO_PEDIDO: Record<Pedido, number> = { negativo: 0, abonar: 1, conciliar: 2, depositar: 3 };

export type EstadoCuenta = { texto: string; tono: TonoChip };

export type FilaEstado = {
  id: string;
  nombre: string;
  detalle: string | null;
  /** El nombre del grupo que la contiene («Tienda AQP», «Empresa»); lo que viene en camino todavía no tiene sede. */
  sede: string;
  sinSede: boolean;
  etapa: EtapaDinero;
  saldo: number | null;
  estado: EstadoCuenta | null;
  pide: Pedido | null;
};

export function etapaDe(tipo: CuentaDinero["tipo"]): EtapaDinero {
  if (tipo === "banco") return "banco";
  if (tipo === "por_abonar") return "camino";
  if (tipo === "caja_fuerte" || tipo === "por_rendir") return "deposito";
  return "caja";
}

const TONO_DE_INSIGNIA: Record<"verde" | "ambar" | "pizarra", TonoChip> = { verde: "verde", ambar: "ambar", pizarra: "pizarra" };

/**
 * Las cuentas de `gruposDeDinero` como filas de la ventana. `atrasadas`: las cuentas de máquina que la base marca con depósito
 * atrasado (`AlertaPos.atrasados > 0`); un «N días sin abonar» solo pide atención si la máquina ya se atrasó. Un saldo negativo
 * (que no es la tarjeta de crédito, que no entra a los grupos) pide revisión siempre.
 */
export function filasDeEstado(grupos: readonly GrupoCuentas[], atrasadas: ReadonlySet<string>): FilaEstado[] {
  const filas: FilaEstado[] = [];
  for (const g of grupos) {
    for (const f of g.filas) {
      const ins = f.insignia;
      let estado: EstadoCuenta | null = ins ? { texto: ins.texto, tono: TONO_DE_INSIGNIA[ins.tono] } : null;
      let pide: Pedido | null = null;
      if (f.saldo !== null && Math.round(f.saldo) < 0) {
        estado = { texto: "Saldo negativo: revisar", tono: "rojo" };
        pide = "negativo";
      } else if (f.tipo === "por_abonar" && atrasadas.has(f.id)) {
        estado = { texto: ins?.texto ?? "sin abonar", tono: "ambar" };
        pide = "abonar";
      } else if (f.tipo === "banco" && ins?.tono === "ambar") {
        pide = "conciliar";
      } else if (f.tipo === "caja_fuerte" && ins?.tono === "ambar") {
        pide = "depositar";
      }
      filas.push({
        id: f.id,
        nombre: f.nombre,
        detalle: f.detalle,
        sede: g.clave === GRUPO_CAMINO ? "Sin sede" : g.titulo,
        sinSede: g.clave === GRUPO_CAMINO,
        etapa: etapaDe(f.tipo),
        saldo: f.saldo,
        estado,
        pide,
      });
    }
  }
  return filas;
}

// ---- Filtros, orden y páginas --------------------------------------------------------------------------------------------------

export type FiltroEstado = "todas" | "atencion" | "conciliar" | "abonar" | "depositar" | "negativo";
export const FILTROS_ESTADO: readonly { clave: FiltroEstado; texto: string; pasa: (f: FilaEstado) => boolean }[] = [
  { clave: "todas", texto: "Todas", pasa: () => true },
  { clave: "atencion", texto: "Piden atención", pasa: (f) => f.pide !== null },
  { clave: "conciliar", texto: "Sin conciliar", pasa: (f) => f.pide === "conciliar" },
  { clave: "abonar", texto: "Sin abonar", pasa: (f) => f.pide === "abonar" },
  { clave: "depositar", texto: "Sin depositar", pasa: (f) => f.pide === "depositar" },
  { clave: "negativo", texto: "Saldo negativo", pasa: (f) => f.pide === "negativo" },
];

/** Todos los filtros, siempre, cada uno con su cuenta (también en cero): quien mira la ventana ve de entrada qué se puede revisar y que hoy no hay nada en ese estado. */
export function filtrosDeEstado(filas: readonly FilaEstado[]): { clave: FiltroEstado; texto: string; n: number }[] {
  return FILTROS_ESTADO.map((f) => ({ clave: f.clave, texto: f.texto, n: filas.filter(f.pasa).length }));
}

export type CampoOrdenEstado = "cuenta" | "sede" | "etapa" | "estado" | "saldo";
export type OrdenEstado = { campo: CampoOrdenEstado; dir: "asc" | "desc" };
/** De entrada, lo que pide atención primero (lo más grave arriba) y, entre iguales, la cuenta con más plata. */
export const ORDEN_ESTADO_INICIAL: OrdenEstado = { campo: "estado", dir: "asc" };

const ORDEN_ETAPA: Record<EtapaDinero, number> = { banco: 0, camino: 1, deposito: 2, caja: 3 };

export function ordenarEstados(filas: readonly FilaEstado[], orden: OrdenEstado): FilaEstado[] {
  const signo = orden.dir === "asc" ? 1 : -1;
  const clave = (f: FilaEstado): number | string => {
    switch (orden.campo) {
      case "cuenta":
        return f.nombre;
      case "sede":
        return f.sede;
      case "etapa":
        return ORDEN_ETAPA[f.etapa];
      case "saldo":
        return f.saldo ?? Number.NEGATIVE_INFINITY;
      default:
        return f.pide === null ? 9 : PESO_PEDIDO[f.pide];
    }
  };
  return [...filas].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y, "es") : Number(x) - Number(y);
    return c * signo || (b.saldo ?? 0) - (a.saldo ?? 0) || a.nombre.localeCompare(b.nombre, "es");
  });
}

export const TAMANOS_PAGINA = [30, 40] as const;
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number];

export type Pagina<T> = { pagina: number; totalPaginas: number; total: number; desde: number; hasta: number; visibles: T[] };
/** Una página de una lista que ya está en memoria (`pagina` empieza en 1 y se acomoda si se pasa del final). */
export function paginar<T>(filas: readonly T[], pagina: number, tamano: number): Pagina<T> {
  const total = filas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  const ini = (p - 1) * tamano;
  return { pagina: p, totalPaginas, total, desde: total === 0 ? 0 : ini + 1, hasta: Math.min(ini + tamano, total), visibles: filas.slice(ini, ini + tamano) };
}

// ---- Los cierres de caja con diferencia ---------------------------------------------------------------------------------------

export type FilaCierre = { id: string; dia: string; sede: string; diferencia: number; cerradaPor: string | null };

export function filasDeCierres(cierres: readonly CierreConDiferencia[]): FilaCierre[] {
  return cierres.map((c) => ({ id: c.cajaId, dia: diaYNumero(c.cerradaEn), sede: c.ubicacionNombre, diferencia: c.diferencia, cerradaPor: c.cerradaPor }));
}

/** Los que faltaron plata: los que piden revisión (un sobrante chico es un redondeo; un faltante, no). */
export const cierresConFaltante = (cierres: readonly Pick<FilaCierre, "diferencia">[]): number => cierres.filter((c) => c.diferencia < 0).length;

/** `todos`, `faltaron`, `sobraron` o `sede:<nombre>`: una sola fila de filtros, como la maqueta aprobada. */
export type FiltroCierre = string;
/** Todos los filtros a la vista siempre: también una sede sin cierres con diferencia, con su 0. `sedes` trae las del negocio; la que tenga un cierre y no esté ahí se suma. */
export function filtrosDeCierres(filas: readonly FilaCierre[], sedes: readonly string[] = []): { clave: FiltroCierre; texto: string; n: number }[] {
  const lista = [
    { clave: "todos", texto: "Todos", n: filas.length },
    { clave: "faltaron", texto: "Faltaron", n: filas.filter((f) => f.diferencia < 0).length },
    { clave: "sobraron", texto: "Sobraron", n: filas.filter((f) => f.diferencia > 0).length },
  ];
  const todas = [...new Set([...sedes, ...filas.map((f) => f.sede)])].sort((a, b) => a.localeCompare(b, "es"));
  for (const sede of todas) lista.push({ clave: `sede:${sede}`, texto: sede, n: filas.filter((f) => f.sede === sede).length });
  return lista;
}
export function pasaCierre(f: FilaCierre, filtro: FiltroCierre): boolean {
  if (filtro === "todos") return true;
  if (filtro === "faltaron") return f.diferencia < 0;
  if (filtro === "sobraron") return f.diferencia > 0;
  return filtro.startsWith("sede:") ? f.sede === filtro.slice(5) : true;
}

// ---- Lo que falta registrar ---------------------------------------------------------------------------------------------------

export type AccionPorRegistrar = { texto: string; tipo: "maquina"; cuentaId: string } | { texto: string; tipo: "planilla"; clave: string };
export type PorRegistrar = { clave: string; titulo: string; detalle: string; lineas: string[]; accion: AccionPorRegistrar | null };

/** El depósito de una máquina que se atrasó y las salidas de planilla que Dynamic pagó y nadie dijo de qué banco salieron. */
export function porRegistrar(alertas: readonly AlertaPos[], planilla: readonly AvisoPlanilla[]): PorRegistrar[] {
  const maquinas: PorRegistrar[] = avisosDeMaquinas(alertas).map((a) => ({
    clave: `maquina-${a.maquina.maquinaId}`,
    titulo: a.titulo,
    detalle: a.detalle,
    lineas: [],
    accion: { texto: "Registrar el depósito", tipo: "maquina", cuentaId: a.maquina.cuentaId },
  }));
  const planillas: PorRegistrar[] = planilla.map((a) => ({
    clave: `planilla-${a.clave}`,
    titulo: a.titulo,
    detalle: a.detalle,
    lineas: a.tramos.map((t) => t.texto),
    accion: a.porRegistrar.length > 0 ? { texto: textoRegistrar(a.porRegistrar.length), tipo: "planilla", clave: a.clave } : null,
  }));
  return [...maquinas, ...planillas];
}

// ---- El número de la campana ---------------------------------------------------------------------------------------------------

/**
 * Lo que dice el globito de la campana: cuentas que piden atención + cierres que faltaron + salidas de planilla por registrar. El depósito
 * atrasado de una máquina NO se suma otra vez: ya cuenta como la cuenta «sin abonar» que es (la misma causa no se cuenta dos veces).
 */
export function contadorDeCampana(filas: readonly FilaEstado[], cierres: readonly FilaCierre[], pendientes: readonly PorRegistrar[]): number {
  return filas.filter((f) => f.pide !== null).length + cierresConFaltante(cierres) + pendientes.filter((p) => p.accion?.tipo === "planilla").length;
}

// ---- «Cuánto hay en cada etapa» y «Pide tu atención» (el panorama de Dónde está) ------------------------------------------------

export const ETAPAS_EN_ORDEN: readonly EtapaDinero[] = ["banco", "camino", "deposito", "caja"];
export const AYUDA_ETAPA: Record<EtapaDinero, string> = {
  banco: "Disponible para pagar hoy",
  camino: "Cobrado con tarjeta o QR: la máquina lo deposita en 1 o 2 días",
  deposito: "En las cajas fuertes y lo entregado al líder, por llevar al banco",
  caja: "El efectivo de las cajas de venta",
};

/** Lo que suma cada etapa de lo que se ve (un saldo oculto no suma). Siempre las cuatro, en el orden del recorrido. */
export function totalesPorEtapa(filas: readonly Pick<FilaEstado, "etapa" | "saldo">[]): { etapa: EtapaDinero; total: number; cuentas: number }[] {
  return ETAPAS_EN_ORDEN.map((etapa) => {
    const suyas = filas.filter((f) => f.etapa === etapa);
    return { etapa, total: Math.round(suyas.reduce((a, f) => a + (f.saldo ?? 0), 0) * 100) / 100, cuentas: suyas.length };
  });
}

/**
 * La frase bajo la barra de la franja: lo que se puede usar hoy y lo que todavía está de camino o sin llevar al banco. Solo dice lo que hay
 * (una etapa en cero no se nombra) y, si no hay nada, lo dice.
 */
export function fraseDeEtapas(totales: readonly { etapa: EtapaDinero; total: number }[]): string {
  const de = (e: EtapaDinero) => totales.find((t) => t.etapa === e)?.total ?? 0;
  const partes: string[] = [];
  if (de("banco") > 0) partes.push(`Ya puedes usar ${solesRedondo(de("banco"))} que están en el banco`);
  if (de("camino") > 0) partes.push(`${solesRedondo(de("camino"))} vienen en camino con las máquinas`);
  if (de("deposito") > 0) partes.push(`faltan por llevar al banco ${solesRedondo(de("deposito"))} de las cajas fuertes y del líder`);
  if (de("caja") > 0) partes.push(`${solesRedondo(de("caja"))} están en las cajas de venta`);
  if (partes.length === 0) return "Todavía no hay plata registrada en estas cuentas.";
  const frase = partes.join("; ");
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}

/** Qué se hace desde un aviso: ir a una pantalla, abrir «Registrar movimiento» o abrir la campana en una de sus vistas. */
export type AccionAtencion = { texto: string } & (
  | { tipo: "enlace"; href: string }
  | { tipo: "movimiento"; que: "deposito" | "abono_tarjeta" | "dueno_saca"; cuentaId?: string }
  | { tipo: "campana"; vista: "cierres" | "pendientes" }
);
/** De qué es el aviso: de ahí sale su ícono. */
export type TipoAtencion = "negativo" | "dueno" | "maquina" | "conciliar" | "depositar" | "cierres" | "planilla";
export type ItemAtencion = { clave: string; tipo: TipoAtencion; tono: "error" | "atencion"; titulo: string; detalle: string; accion: AccionAtencion | null };

/**
 * «Pide tu atención»: lo más grave primero. Un saldo negativo; el depósito atrasado de una máquina; un banco sin conciliar; una caja
 * fuerte sin depositar; los cierres que faltaron plata; lo que falta registrar de la planilla. Cada aviso dice qué pasó y qué hacer,
 * con las mismas hojas de siempre. No decide nada: lee `pide` de cada fila y lo que ya traen `porRegistrar` y los cierres.
 */
export function itemsDeAtencion(
  filas: readonly FilaEstado[],
  cierres: readonly FilaCierre[],
  pendientes: readonly PorRegistrar[],
  esLider: boolean,
  /** Lo que CAYLA le debe al dueño (solo el líder y con todas las sedes): `deudaConDueno`. */
  dueno: { deuda: number; prestamos: readonly { fecha: string; monto: number; devuelto: number }[] } | null = null,
): ItemAtencion[] {
  const items: ItemAtencion[] = [];
  for (const f of filas.filter((x) => x.pide === "negativo")) {
    items.push({ clave: `neg-${f.id}`, tipo: "negativo", tono: "error", titulo: `${f.nombre}: saldo negativo (${montoConSigno(f.saldo ?? 0)})`, detalle: "Una cuenta no puede dar más de lo que tiene: revisa sus movimientos.", accion: null });
  }
  if (dueno && dueno.deuda > 0) {
    const p = dueno.prestamos.find((x) => x.monto - x.devuelto > 0);
    items.push({
      clave: "dueno",
      tipo: "dueno",
      tono: "atencion",
      titulo: `CAYLA te debe ${solesRedondo(dueno.deuda)} (préstamo del dueño)`,
      detalle: p ? `Préstamo del ${fechaCorta(p.fecha)}: devuelto ${solesRedondo(p.devuelto)} de ${solesRedondo(p.monto)}.` : "Hay un préstamo del dueño sin devolver.",
      accion: { tipo: "movimiento", que: "dueno_saca", texto: "Devolver" },
    });
  }
  for (const p of pendientes.filter((x) => x.accion?.tipo === "maquina")) {
    const a = p.accion as Extract<AccionPorRegistrar, { tipo: "maquina" }>;
    items.push({ clave: p.clave, tipo: "maquina", tono: "atencion", titulo: p.titulo, detalle: p.detalle, accion: esLider ? { tipo: "movimiento", que: "abono_tarjeta", cuentaId: a.cuentaId, texto: a.texto } : null });
  }
  for (const f of filas.filter((x) => x.pide === "conciliar")) {
    items.push({ clave: `con-${f.id}`, tipo: "conciliar", tono: "atencion", titulo: `${f.nombre}: ${f.estado?.texto ?? "sin conciliar"}`, detalle: "Cuadra su saldo contra lo que dice el banco.", accion: esLider ? { tipo: "enlace", href: "/finanzas/dinero/conciliacion", texto: "Cuadrar con el banco" } : null });
  }
  for (const f of filas.filter((x) => x.pide === "depositar")) {
    items.push({
      clave: `dep-${f.id}`,
      tipo: "depositar",
      tono: "atencion",
      titulo: `${f.nombre} · ${f.sede}: ${f.estado?.texto ?? "sin depositar"}`,
      detalle: `Hay ${solesRedondo(f.saldo ?? 0)} guardados sin llevar al banco.`,
      accion: { tipo: "movimiento", que: "deposito", cuentaId: f.id, texto: "Registrar el depósito" },
    });
  }
  const faltaron = cierres.filter((c) => c.diferencia < 0);
  if (faltaron.length > 0) {
    items.push({
      clave: "cierres",
      tipo: "cierres",
      tono: "atencion",
      titulo: faltaron.length === 1 ? "1 cierre donde faltó plata" : `${faltaron.length} cierres donde faltó plata`,
      detalle: faltaron.slice(0, 3).map((c) => `${c.sede} ${c.dia}: −${solesRedondo(-c.diferencia)}`).join(" · "),
      accion: { tipo: "campana", vista: "cierres", texto: "Ver los cierres" },
    });
  }
  for (const p of pendientes.filter((x) => x.accion?.tipo === "planilla")) {
    items.push({ clave: p.clave, tipo: "planilla", tono: "atencion", titulo: p.titulo, detalle: p.detalle, accion: esLider ? { tipo: "campana", vista: "pendientes", texto: p.accion?.texto ?? "Registrar" } : null });
  }
  return items;
}
