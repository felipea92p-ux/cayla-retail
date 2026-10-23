// Finanzas ▸ Cuentas y dinero en «El telar» (Felipe 2026-10-23, docs/maquetas/finanzas-telar-2026-10/): «Dónde está» dibuja
// cada cuenta como un frasco que se llena hasta su nivel, agrupado por sede (una repisa por sede). Lógica pura: no suma plata
// que la base no haya sumado (`fn_cuentas_dinero_saldos`), solo agrupa, ordena y decide el nivel de cada frasco.
//
// Qué es de quién (decisiones D1–D4, 2026-10-23: con lo que la base ya trae): el cajón y la caja fuerte son de su sede; los
// bancos, lo entregado al líder (`por_rendir`) y la tarjeta de crédito son de CAYLA entera; lo «por depositar» de las máquinas
// va aparte, «En camino», porque todavía no tiene sede.

import { cuentasVisibles, diaYNumero, insigniaCuenta, type CuentaDinero, type EfectivoFila, type Insignia, type MovimientoDinero } from "./cuentas-dinero-reglas";
import { diaLima, diasEntreFechas, horaLima } from "./fechas-lima";
import { solesRedondo } from "./gastos-reglas";
import { soles } from "./flujo-caja-reglas";
import { diasHasta, type FilaPorPagar } from "./por-pagar-consolidado-reglas";
import type { SedeTelar } from "./finanzas-telar-reglas";
import type { TonoChip } from "@/components/ui/Chip";
import type { Tienes } from "./dinero-pulso-reglas";
import type { ConciliacionCuenta } from "./cuentas-dinero-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La clave de la repisa de CAYLA entera y la de lo que viene en camino (las de sede son el id de la ubicación). */
export const REPISA_EMPRESA = "empresa";
export const REPISA_CAMINO = "camino";

export type Frasco = {
  id: string;
  nombre: string;
  tipo: CuentaDinero["tipo"];
  /** Nulo = no le toca verlo (el cajón abierto, para quien no cierra la caja): el frasco se dibuja sin líquido y lo dice. */
  saldo: number | null;
  /** De 0 a 1: cuánto se llena el frasco. Nulo si el saldo no se ve. */
  nivel: number | null;
  insignia: Insignia | null;
  /** Para qué es, en palabras («Caja abierta hoy», «Yape de TRU y AQP»): lo pone quien llama, que conoce los medios de cobro. */
  detalle: string | null;
};

export type Repisa = {
  /** El id de la sede, `empresa` o `camino`. */
  clave: string;
  titulo: string;
  /** Lo que suman los saldos que se ven (sin los ocultos). */
  total: number;
  /** Algún frasco de la repisa no deja ver su saldo. */
  ocultos: boolean;
  frascos: Frasco[];
  /** Una línea que explica la repisa cuando hace falta («Los bancos son de CAYLA entera»). */
  nota: string | null;
};

/**
 * El nivel de un frasco contra el más lleno de la pantalla. Con raíz cuadrada, para que un cajón de S/ 500 se vea al lado de un
 * banco de S/ 18,000 (lineal, quedaría vacío). Un frasco en cero o en negativo muestra un fondo mínimo: «hay frasco, está vacío».
 */
export function nivelFrasco(saldo: number | null, maximo: number): number | null {
  if (saldo === null) return null;
  if (saldo <= 0 || maximo <= 0) return 0.04;
  return r2(0.07 + 0.86 * Math.sqrt(Math.min(saldo, maximo) / maximo));
}

/**
 * El color de una sede: el de su hilo en la barra común (`--color-sede-*`, `colorDeSede` de `finanzas-telar-reglas.ts`). CAYLA
 * entera (o una fila sin sede) toma el de la empresa; lo que viene en camino, la pizarra a media voz; una sede que el telar no
 * reconoce, el taupe (como «otra» en la barra). Siempre un token (ADR-0169).
 */
export function colorDeRepisa(clave: string | null, sedes: readonly Pick<SedeTelar, "clave" | "color">[]): string {
  if (clave === null || clave === REPISA_EMPRESA) return "var(--color-sede-emp)";
  if (clave === REPISA_CAMINO) return "color-mix(in srgb, var(--color-pizarra) 55%, transparent)";
  const color = sedes.find((s) => s.clave === clave)?.color;
  return color && color !== "otra" ? `var(--color-sede-${color})` : "var(--color-taupe)";
}

/** En cada repisa, de lo que está más a la mano a lo que está más lejos: el cajón, la caja fuerte, lo del líder, el banco. */
const ORDEN_TIPO: Record<CuentaDinero["tipo"], number> = { cajon: 0, caja_fuerte: 1, por_rendir: 2, banco: 3, por_abonar: 4, tarjeta_credito: 5 };

/** La repisa a la que va una cuenta (ver el encabezado). La tarjeta de crédito no es un frasco: es deuda. */
export function repisaDe(c: Pick<CuentaDinero, "tipo" | "ubicacionId">): string | null {
  if (c.tipo === "tarjeta_credito") return null;
  if (c.tipo === "por_abonar") return REPISA_CAMINO;
  if ((c.tipo === "cajon" || c.tipo === "caja_fuerte") && c.ubicacionId) return c.ubicacionId;
  return REPISA_EMPRESA;
}

/**
 * Las repisas de «Dónde está». Con una sede elegida, solo la suya (aunque esté vacía: «Lima todavía no tiene plata»); con todas,
 * una por sede en el orden de `ubicaciones` (tiendas y después el Taller), luego CAYLA entera y al final lo que viene en camino.
 * Las repisas sin cuentas no salen.
 */
export function repisasDeDinero(
  cuentas: readonly CuentaDinero[],
  ubicaciones: readonly { id: string; nombre: string }[],
  ubicacionId: string | null,
  hoy: string,
  /** Lo que dice cada frasco bajo su nombre y el aviso propio de la pantalla (la caja fuerte que no se deposita). */
  extra: { explicar?: (c: CuentaDinero) => string | null; avisar?: (c: CuentaDinero) => Insignia | null } = {},
): Repisa[] {
  const explicar = extra.explicar ?? (() => null);
  const avisar = extra.avisar ?? (() => null);
  const vis = cuentasVisibles(cuentas, null).filter((c) => repisaDe(c) !== null);
  const maximo = Math.max(0, ...vis.map((c) => c.saldo ?? 0));
  const claves = ubicacionId ? [ubicacionId] : [...ubicaciones.map((u) => u.id), REPISA_EMPRESA, REPISA_CAMINO];
  const repisas: Repisa[] = [];
  for (const clave of claves) {
    const suyas = vis.filter((c) => repisaDe(c) === clave).sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
    if (!suyas.length && !ubicacionId) continue;
    const titulo =
      clave === REPISA_EMPRESA ? "CAYLA entera" : clave === REPISA_CAMINO ? "En camino" : (ubicaciones.find((u) => u.id === clave)?.nombre ?? "Tu tienda");
    const nota =
      clave === REPISA_EMPRESA
        ? "Los bancos y lo que se entregó al líder son de CAYLA entera."
        : clave === REPISA_CAMINO
          ? "Lo que las máquinas de tarjeta y QR depositan en 1 o 2 días. Todavía no tiene sede."
          : suyas.length === 0
            ? "Todavía no tiene cajón ni caja fuerte con plata."
            : null;
    repisas.push({
      clave,
      titulo,
      total: r2(suyas.reduce((a, c) => a + (c.saldo ?? 0), 0)),
      ocultos: suyas.some((c) => c.saldo === null),
      frascos: suyas.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, saldo: c.saldo, nivel: nivelFrasco(c.saldo, maximo), insignia: insigniaCuenta(c, hoy) ?? avisar(c), detalle: explicar(c) })),
      nota,
    });
  }
  return repisas;
}

/**
 * Lo que pone cada sede en «Dónde está», para el orillo de la barra común (`{ [ubicacionId | "empresa"]: monto }`, contrato de
 * `telar-barra-comun.md`). Lo en camino se cuenta en «empresa» hasta que tenga sede (D1).
 */
export function orilloDeDinero(cuentas: readonly CuentaDinero[]): Record<string, number> {
  const porSede: Record<string, number> = {};
  for (const c of cuentasVisibles(cuentas, null)) {
    const clave = repisaDe(c);
    if (clave === null) continue;
    const k = clave === REPISA_CAMINO ? REPISA_EMPRESA : clave;
    porSede[k] = r2((porSede[k] ?? 0) + (c.saldo ?? 0));
  }
  return porSede;
}

// ---- El efectivo de hoy (actividad 2): el cajón y la caja fuerte dicen cómo van ---------------------------------------------

/** Desde cuántos días una caja fuerte con plata espera su depósito: avisa en ámbar pasados 3 días. */
export const DIAS_PARA_AVISAR_DEPOSITO = 3;

/** El día (de Lima) del último depósito vigente que salió de una cuenta, o nulo si nunca se depositó desde ella. */
export function ultimoDepositoDe(cuentaId: string, movimientos: readonly Pick<MovimientoDinero, "tipo" | "origenId" | "estado" | "fecha">[]): string | null {
  let ultimo: string | null = null;
  for (const m of movimientos) {
    if (m.tipo !== "deposito" || m.origenId !== cuentaId || m.estado !== "vigente") continue;
    const dia = diaLima(m.fecha);
    if (dia && (!ultimo || dia > ultimo)) ultimo = dia;
  }
  return ultimo;
}

/**
 * El aviso de una caja fuerte con plata: hace cuánto se depositó por última vez. Vacía, o cualquier otra cuenta, no avisa nada.
 * Sin depósitos en la lista que se leyó, lo dice sin inventar fecha.
 */
export function avisoCajaFuerte(
  c: Pick<CuentaDinero, "id" | "tipo" | "saldo">,
  movimientos: readonly Pick<MovimientoDinero, "tipo" | "origenId" | "estado" | "fecha">[],
  hoy: string,
): Insignia | null {
  if (c.tipo !== "caja_fuerte" || c.saldo === null || c.saldo <= 0) return null;
  const ultimo = ultimoDepositoDe(c.id, movimientos);
  if (!ultimo) return { texto: "sin depósitos registrados", tono: "pizarra" };
  const d = diasEntreFechas(ultimo, hoy);
  if (d <= 0) return { texto: "depositada hoy", tono: "verde" };
  if (d <= DIAS_PARA_AVISAR_DEPOSITO) return { texto: `depositada hace ${d} ${d === 1 ? "día" : "días"}`, tono: "verde" };
  return { texto: `${d} días sin depositar`, tono: "ambar" };
}

/**
 * Lo que dice el frasco del cajón bajo su nombre: abierta, desde qué hora y cuánto se vendió en efectivo (la misma cuenta del cierre,
 * `fn_efectivo_por_tienda`); cerrada, desde cuándo. El Taller no tiene caja: tiene un fondo fijo.
 */
export function detalleCajon(f: Pick<EfectivoFila, "abierta" | "abiertaEn" | "ventasEfectivo" | "egresos" | "depositos" | "cerradaEn"> | undefined, esTaller: boolean): string | null {
  if (esTaller) return "Fondo fijo para gastos chicos";
  if (!f) return null;
  if (!f.abierta) return f.cerradaEn ? `Caja cerrada desde el ${diaYNumero(f.cerradaEn)}` : "Caja cerrada";
  const hora = horaLima(f.abiertaEn);
  const salio = Math.round((f.egresos + f.depositos) * 100) / 100;
  return [`Abierta${hora ? ` desde las ${hora}` : ""}`, `vendió ${solesRedondo(f.ventasEfectivo)} en efectivo`, salio > 0 ? `salieron ${solesRedondo(salio)}` : null]
    .filter(Boolean)
    .join(" · ");
}

// ---- La respuesta de la cabecera (El telar): una pregunta y su cifra por cara, con sus chips -------------------------------

export type CaraDinero = "donde" | "debes" | "cuadrar";
export type ChipRespuesta = { texto: string; tono: TonoChip };

/** La pregunta de cada cara, con la sede que se mira («Trujillo»), o sin ella con todas. Cuadrar es siempre de CAYLA entera. */
export function preguntaDeDinero(cara: CaraDinero, sede: string | null): string {
  if (cara === "cuadrar") return "¿Cuánto dicen tus bancos?";
  if (cara === "debes") return sede ? `¿Cuánto debe ${sede}?` : "¿Cuánto debes?";
  return sede ? `¿Cuánta plata tiene ${sede} hoy?` : "¿Cuánta plata tienes hoy?";
}

/** Bajo «¿Cuánta plata tienes?»: dónde está (bancos, en camino, efectivo) y, aparte, lo que se debe en la tarjeta. */
export function chipsDondeEsta(t: Pick<Tienes, "partes" | "tarjeta" | "ocultas">): ChipRespuesta[] {
  const chips: ChipRespuesta[] = t.partes.map((p) => ({ texto: `${p.titulo.replace(/ \(.*\)$/, "")} ${soles(p.monto)}`, tono: "pizarra" }));
  if (t.tarjeta > 0) chips.push({ texto: `Debes ${soles(t.tarjeta)} en la tarjeta`, tono: "ambar" });
  if (t.ocultas) chips.push({ texto: "El cajón abierto lo ve quien cierra la caja", tono: "apagado" });
  return chips;
}

/** Bajo «¿Cuánto debes?»: cuántas facturas, cuánto ya venció (rojo) y cuánto vence esta semana (ámbar). */
export function chipsQueDebes(filas: readonly Pick<FilaPorPagar, "vence" | "saldo">[], hoy: string): ChipRespuesta[] {
  if (filas.length === 0) return [{ texto: "Nada por pagar", tono: "verde" }];
  const vencido = filas.filter((f) => diasHasta(f.vence, hoy) < 0);
  const semana = filas.filter((f) => {
    const d = diasHasta(f.vence, hoy);
    return d >= 0 && d <= 7;
  });
  const suma = (fs: typeof filas) => fs.reduce((a, f) => a + f.saldo, 0);
  const chips: ChipRespuesta[] = [{ texto: `${filas.length} ${filas.length === 1 ? "factura" : "facturas"}`, tono: "pizarra" }];
  if (vencido.length) chips.push({ texto: `${soles(suma(vencido))} ya vencido`, tono: "rojo" });
  if (semana.length) chips.push({ texto: `${soles(suma(semana))} vence esta semana`, tono: "ambar" });
  return chips;
}

/** «¿Cuánto dicen tus bancos?»: lo que suma el sistema en los bancos (nulo si no hay bancos) y cuántas líneas faltan revisar. */
export function respuestaCuadrar(cuentas: readonly Pick<ConciliacionCuenta, "tipo" | "saldoHoy" | "pendientes">[]): { valor: number | null; chips: ChipRespuesta[] } {
  const bancos = cuentas.filter((c) => c.tipo === "banco");
  if (!bancos.length) return { valor: null, chips: [] };
  const pendientes = cuentas.reduce((a, c) => a + c.pendientes, 0);
  return {
    valor: Math.round(bancos.reduce((a, c) => a + c.saldoHoy, 0) * 100) / 100,
    chips: [pendientes ? { texto: `${pendientes} ${pendientes === 1 ? "línea" : "líneas"} por revisar`, tono: "ambar" } : { texto: "Todo revisado", tono: "verde" }],
  };
}
