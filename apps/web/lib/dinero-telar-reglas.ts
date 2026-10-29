// Finanzas ▸ Cuentas y dinero en «El telar» (Felipe 2026-10-23, docs/maquetas/finanzas-telar-2026-10/): «Dónde está» lista cada
// cuenta con su saldo, agrupada por sede (una tarjeta por sede), y una barra fina dice cuánto pesa contra la que más tiene. Hasta el
// 2026-10-28 cada cuenta era un frasco que se llenaba: se cambió por filas porque el dibujo no dejaba comparar ni leer (ADR-0497,
// «Actualización 2026-10-28»). Lógica pura: no suma plata que la base no haya sumado (`fn_cuentas_dinero_saldos`), solo agrupa,
// ordena y decide cuánto pesa cada cuenta.
//
// Qué es de quién (decisiones D1–D4, 2026-10-23: con lo que la base ya trae): el cajón y la caja fuerte son de su sede; los
// bancos, lo entregado al líder (`por_rendir`) y la tarjeta de crédito son de la empresa (el grupo «Empresa», el mismo hilo de la
// barra común: lo que no es de ninguna sede); lo «por depositar» de las máquinas va aparte, «En camino», porque todavía no tiene sede.
// «Todas» es todo eso junto y repartido por sede; «Empresa» solo la parte de la empresa (`GRUPOS_DE_LA_EMPRESA`, 2026-10-28).

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

/** La clave del grupo de la empresa (lo que no es de ninguna sede) y la de lo que viene en camino (las de sede son el id de la ubicación). */
export const GRUPO_EMPRESA = "empresa";
export const GRUPO_CAMINO = "camino";

/**
 * Lo que mira «Empresa» en la barra (Felipe 2026-10-28: «Empresa» y «Todas» no son lo mismo): las cuentas que no son de ninguna sede
 * —los bancos y lo entregado al líder— y lo que viene en camino, que todavía no tiene sede (`orilloDeDinero` ya lo cuenta ahí). «Todas»
 * es toda la plata repartida por sede, y la empresa es una de esas partes.
 */
export const GRUPOS_DE_LA_EMPRESA: readonly string[] = [GRUPO_EMPRESA, GRUPO_CAMINO];

export type FilaCuenta = {
  id: string;
  /** Sin el lugar que ya dice el título del grupo («Caja Operativa», no «Caja Operativa · Tienda AQP»). */
  nombre: string;
  tipo: CuentaDinero["tipo"];
  /** Nulo = no le toca verlo (el cajón abierto, para quien no cierra la caja): la fila no lleva cifra ni barra y lo dice. */
  saldo: number | null;
  /** De 0 a 1: cuánto pesa contra la cuenta con más plata de la pantalla. Nulo si el saldo no se ve. */
  escala: number | null;
  insignia: Insignia | null;
  /** Para qué es, en palabras («Caja abierta hoy», «Yape de TRU y AQP»): lo pone quien llama, que conoce los medios de cobro. */
  detalle: string | null;
};

export type GrupoCuentas = {
  /** El id de la sede, `empresa` o `camino`. */
  clave: string;
  titulo: string;
  /** El lugar de la sede en la lista de ubicaciones (0, 1, 2…), igual con todas las sedes que con una sola; -1 en CAYLA entera y En camino. De ahí sale su color. */
  posicion: number;
  /** Lo que suman los saldos que se ven (sin los ocultos). */
  total: number;
  /** Alguna cuenta del grupo no deja ver su saldo. */
  ocultos: boolean;
  filas: FilaCuenta[];
  /** Una línea que explica el grupo cuando hace falta («Los bancos son de CAYLA entera»). */
  nota: string | null;
};

/**
 * Cuánto pesa una cuenta contra la que más plata tiene en la pantalla, de 0 a 1 y en línea recta: S/ 500 junto a S/ 20,000 es el
 * 2,5 % y se ve como el 2,5 %. Con los frascos se sacaba raíz cuadrada para que el cajón no quedara vacío, y el dibujo mentía:
 * S/ 500 parecía la mitad de un banco de S/ 18,000. Aquí la cifra va escrita al lado, así que la barra puede ser honesta. En cero
 * o en negativo no hay barra; nulo si el saldo no se ve.
 */
export function escalaDeCuenta(saldo: number | null, maximo: number): number | null {
  if (saldo === null) return null;
  if (saldo <= 0 || maximo <= 0) return 0;
  return Math.round((Math.min(saldo, maximo) / maximo) * 10000) / 10000;
}

/** Un saldo con su signo siempre igual, en la cifra de una fila y en el total de su grupo: «S/ 1,100» y «−S/ 24,000» (con el menos de verdad, no el guion). */
export function montoConSigno(n: number): string {
  return Math.round(n) < 0 ? `−${solesRedondo(-n)}` : solesRedondo(n);
}

/**
 * «Caja Operativa · Tienda AQP» dentro de la tarjeta de Tienda AQP: el lugar ya lo dice el título del grupo, no se repite en cada
 * fila. Solo quita el lugar si va al final tras « · » y si deja algo escrito.
 */
export function nombreSinElLugar(nombre: string, lugar: string): string {
  const cola = ` · ${lugar}`;
  return nombre.endsWith(cola) && nombre.length > cola.length ? nombre.slice(0, -cola.length) : nombre;
}

/**
 * El color de una sede: el de su hilo en la barra común (`--color-sede-*`, `colorDeSede` de `finanzas-telar-reglas.ts`). CAYLA
 * entera (o una fila sin sede) toma el de la empresa; lo que viene en camino, la pizarra a media voz; una sede que el telar no
 * reconoce, el taupe (como «otra» en la barra). Siempre un token (ADR-0169).
 */
export function colorDeGrupo(clave: string | null, sedes: readonly Pick<SedeTelar, "clave" | "color">[]): string {
  if (clave === null || clave === GRUPO_EMPRESA) return "var(--color-sede-emp)";
  if (clave === GRUPO_CAMINO) return "color-mix(in srgb, var(--color-pizarra) 55%, transparent)";
  const color = sedes.find((s) => s.clave === clave)?.color;
  return color && color !== "otra" ? `var(--color-sede-${color})` : "var(--color-taupe)";
}

/** En cada grupo, de lo que está más a la mano a lo que está más lejos: el cajón, la caja fuerte, lo del líder, el banco. */
const ORDEN_TIPO: Record<CuentaDinero["tipo"], number> = { cajon: 0, caja_fuerte: 1, por_rendir: 2, banco: 3, por_abonar: 4, tarjeta_credito: 5 };

/** El grupo al que va una cuenta (ver el encabezado). La tarjeta de crédito no es plata que se tiene: es deuda, y no va en ninguno. */
export function grupoDe(c: Pick<CuentaDinero, "tipo" | "ubicacionId">): string | null {
  if (c.tipo === "tarjeta_credito") return null;
  if (c.tipo === "por_abonar") return GRUPO_CAMINO;
  if ((c.tipo === "cajon" || c.tipo === "caja_fuerte") && c.ubicacionId) return c.ubicacionId;
  return GRUPO_EMPRESA;
}

/**
 * Qué grupos mira «Dónde está» según lo que dice la barra: una sede (solo su cajón y su caja fuerte), la empresa (`GRUPOS_DE_LA_EMPRESA`)
 * o todas (`null`: toda la plata, un grupo por sede). La empresa y una sede nunca se piden a la vez.
 */
export function gruposDelAlcance(ubicacionId: string | null, soloEmpresa: boolean): readonly string[] | null {
  if (soloEmpresa) return GRUPOS_DE_LA_EMPRESA;
  return ubicacionId ? [ubicacionId] : null;
}

/**
 * Las cuentas que suman en el «Tienes» de lo que se mira. Con todas, todas; con una sede, solo las suyas (los bancos son de la empresa
 * y no se le suman); con la empresa, sus bancos, lo del líder, lo que viene en camino y la tarjeta de crédito (la deuda es suya, de ninguna sede).
 */
export function cuentasDelAlcance(cuentas: readonly CuentaDinero[], grupos: readonly string[] | null): CuentaDinero[] {
  if (!grupos) return [...cuentas];
  return cuentas.filter((c) => {
    const g = grupoDe(c);
    return g === null ? grupos.includes(GRUPO_EMPRESA) : grupos.includes(g);
  });
}

/**
 * Los movimientos entre cuentas que toca la empresa: los que sacan o meten plata de una cuenta suya (un depósito del cajón al banco
 * entra; pasar plata del cajón a la caja fuerte de la misma tienda no). La base ya sabe filtrar por sede (`fn_movimientos_dinero`); por
 * «empresa» no, y cada extremo se busca por su cuenta, también si la cuenta ya se archivó.
 */
export function movimientosDeLaEmpresa<M extends { origenId: string | null; destinoId: string | null }>(movimientos: readonly M[], cuentas: readonly CuentaDinero[]): M[] {
  const suyas = new Set(cuentasDelAlcance(cuentas, GRUPOS_DE_LA_EMPRESA).map((c) => c.id));
  return movimientos.filter((m) => (m.origenId !== null && suyas.has(m.origenId)) || (m.destinoId !== null && suyas.has(m.destinoId)));
}

/**
 * Los grupos de «Dónde está». `alcance` dice cuáles (ver `gruposDelAlcance`): con una sede, solo el suyo (aunque esté vacío: «Lima
 * todavía no tiene plata»); con la empresa, el suyo y lo que viene en camino; con todas (`null`), uno por sede en el orden de
 * `ubicaciones` (tiendas y después el Taller), luego la empresa y al final lo que viene en camino. Un grupo sin cuentas solo sale si es
 * de una sede que se pidió sola.
 */
export function gruposDeDinero(
  cuentas: readonly CuentaDinero[],
  ubicaciones: readonly { id: string; nombre: string }[],
  alcance: string | readonly string[] | null,
  hoy: string,
  /** Lo que dice cada fila bajo su nombre y el aviso propio de la pantalla (la caja fuerte que no se deposita). */
  extra: { explicar?: (c: CuentaDinero) => string | null; avisar?: (c: CuentaDinero) => Insignia | null } = {},
): GrupoCuentas[] {
  const explicar = extra.explicar ?? (() => null);
  const avisar = extra.avisar ?? (() => null);
  const vis = cuentasVisibles(cuentas, null).filter((c) => grupoDe(c) !== null);
  const maximo = Math.max(0, ...vis.map((c) => c.saldo ?? 0));
  const pedidos = alcance === null ? null : typeof alcance === "string" ? [alcance] : alcance;
  const claves = pedidos ?? [...ubicaciones.map((u) => u.id), GRUPO_EMPRESA, GRUPO_CAMINO];
  const grupos: GrupoCuentas[] = [];
  for (const clave of claves) {
    const suyas = vis.filter((c) => grupoDe(c) === clave).sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
    const esDeSede = clave !== GRUPO_EMPRESA && clave !== GRUPO_CAMINO;
    if (!suyas.length && !(pedidos && esDeSede)) continue;
    const titulo =
      clave === GRUPO_EMPRESA ? "Empresa" : clave === GRUPO_CAMINO ? "En camino" : (ubicaciones.find((u) => u.id === clave)?.nombre ?? "Tu tienda");
    const nota =
      clave === GRUPO_EMPRESA
        ? "Los bancos y lo que se entregó al líder son de la empresa, no de una sede."
        : clave === GRUPO_CAMINO
          ? "Lo que las máquinas de tarjeta y QR depositan en 1 o 2 días. Todavía no tiene sede."
          : suyas.length === 0
            ? "Todavía no tiene cajón ni caja fuerte con plata."
            : null;
    grupos.push({
      clave,
      titulo,
      posicion: ubicaciones.findIndex((u) => u.id === clave),
      total: r2(suyas.reduce((a, c) => a + (c.saldo ?? 0), 0)),
      ocultos: suyas.some((c) => c.saldo === null),
      filas: suyas.map((c) => ({ id: c.id, nombre: nombreSinElLugar(c.nombre, titulo), tipo: c.tipo, saldo: c.saldo, escala: escalaDeCuenta(c.saldo, maximo), insignia: insigniaCuenta(c, hoy) ?? avisar(c), detalle: explicar(c) })),
      nota,
    });
  }
  return grupos;
}

/**
 * Lo que pone cada sede en «Dónde está», para el orillo de la barra común (`{ [ubicacionId | "empresa"]: monto }`, contrato de
 * `telar-barra-comun.md`). Lo en camino se cuenta en «empresa» hasta que tenga sede (D1).
 */
export function orilloDeDinero(cuentas: readonly CuentaDinero[]): Record<string, number> {
  const porSede: Record<string, number> = {};
  for (const c of cuentasVisibles(cuentas, null)) {
    const clave = grupoDe(c);
    if (clave === null) continue;
    const k = clave === GRUPO_CAMINO ? GRUPO_EMPRESA : clave;
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
 * Lo que dice la fila del cajón bajo su nombre: abierta, desde qué hora y cuánto se vendió en efectivo (la misma cuenta del cierre,
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

export type CaraDinero = "donde" | "debes" | "cuadrar" | "claure";
export type ChipRespuesta = { texto: string; tono: TonoChip };

/** La pregunta de cada cara, con la sede que se mira («Trujillo»), o sin ella con todas. Cuadrar es siempre de CAYLA entera. */
export function preguntaDeDinero(cara: CaraDinero, sede: string | null): string {
  if (cara === "cuadrar") return "¿Cuánto dicen tus bancos?";
  if (cara === "claure") return "¿Cuánto le debes a CLAURE?";
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
