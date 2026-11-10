// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco, en «El telar» (Felipe 2026-10-23). Cada línea que anotó CAYLA en la cuenta
// se dibuja junto a la pregunta «¿está en el extracto?», unidas por un hilo que se vuelve verde al marcarla revisada. Es la
// opción (a) de la decisión D5: la base no guarda el estado de cuenta del banco, solo el saldo anotado (`conciliaciones`) y las
// líneas revisadas (`dinero_revisados`); subir el extracto queda para otra obra. Lógica pura: no decide qué cuadra (eso lo suma la
// base), solo en qué estado está cada par y qué banco mirar.

import { cuadra, TEXTO_MEDIO_COBRO, type AlertaPos, type Conciliacion, type ConciliacionCuenta, type LineaConciliacion, type LotePendiente, type TipoCuenta } from "./cuentas-dinero-reglas";
import { diaLima } from "./fechas-lima";
import { soles } from "./compras-reglas";
import { fechaCorta } from "./gastos-reglas";
import { leerMontoPlata } from "./monto-plata-reglas";
import type { CampoDeGuia } from "./guia-campos";

export type EstadoPar = "revisada" | "cambio" | "pendiente";

/** Revisada (el hilo verde); cambió desde que se revisó (hay que mirarla otra vez); o pendiente. */
export function estadoPar(l: Pick<LineaConciliacion, "revisado" | "montoRevisado">): EstadoPar {
  if (l.revisado) return "revisada";
  return l.montoRevisado !== null ? "cambio" : "pendiente";
}

/** Lo que dice el lado del banco de cada par, en palabras. */
export function textoLadoBanco(l: Pick<LineaConciliacion, "revisado" | "montoRevisado" | "revisadoPor">): string {
  switch (estadoPar(l)) {
    case "revisada":
      // Dice lo que pasó: alguien la marcó. Nada obliga a tener el extracto delante, y un botón marca todas de un toque. La fecha no se dice porque `fn_conciliacion` no la trae.
      return l.revisadoPor ? `La revisó ${l.revisadoPor}` : "Revisada";
    case "cambio":
      return `Cambió desde que se revisó (era ${soles(l.montoRevisado ?? 0)}): mírala otra vez`;
    default:
      return "¿Está en el extracto del banco?";
  }
}

/** El botón que marca de un toque lo que falta: dice lo que hace (dejar el visto), sin afirmar nada del banco. */
export function textoMarcarRevisadas(n: number): string {
  return n === 1 ? "Dar por revisada la que falta" : `Dar por revisadas las ${n}`;
}

/**
 * ADR-0629, Fase B: una cuenta se cuadra contra un extracto solo si tiene uno. La puente de una máquina («Por depositar») no lo tiene: lo que
 * espera depósito se ve en «Lo que te deben las máquinas» y lo que llegó se cuadra en el banco que lo recibe. Antes se le pedía «¿qué saldo
 * dice el banco?» y quedaba para siempre en «Nunca se cuadró».
 */
export function tieneExtracto(tipo: TipoCuenta): boolean {
  return tipo !== "por_abonar";
}

/** Las cuentas que se pueden cuadrar, en el orden de la lista: los bancos primero, y por nombre dentro de cada grupo. */
export function bancosParaCuadrar(cuentas: readonly ConciliacionCuenta[]): ConciliacionCuenta[] {
  return [...cuentas].sort((a, b) => Number(b.tipo === "banco") - Number(a.tipo === "banco") || a.nombre.localeCompare(b.nombre, "es"));
}

/** La respuesta de la cara: ¿cuadra esta cuenta con el banco? Con su tono, para el chip. */
export function respuestaCuadre(actual: Pick<Conciliacion, "cuenta" | "hasta" | "conciliacion" | "lineas">): { texto: string; tono: "verde" | "ambar" | "pizarra" } {
  const k = actual.conciliacion;
  const faltan = actual.lineas.filter((l) => estadoPar(l) !== "revisada").length;
  const enFecha = `al ${fechaCorta(actual.hasta)}`;
  if (k && cuadra(k.diferencia)) {
    return faltan === 0
      ? { texto: `${actual.cuenta.nombre} cuadra con el banco ${enFecha}.`, tono: "verde" }
      : { texto: `El saldo coincide ${enFecha}; faltan revisar ${faltan} ${faltan === 1 ? "línea" : "líneas"}.`, tono: "ambar" };
  }
  if (k) return { texto: `No cuadra ${enFecha}: hay ${soles(Math.abs(k.diferencia))} de diferencia con el banco.`, tono: "ambar" };
  return faltan === 0
    ? { texto: `Todo revisado ${enFecha}: anota el saldo del banco para saber si cuadra.`, tono: "pizarra" }
    : { texto: `Faltan revisar ${faltan} ${faltan === 1 ? "línea" : "líneas"} y anotar el saldo del banco.`, tono: "pizarra" };
}

// ---- La guía de foco de «¿Qué saldo dice el banco?» (ADR-0284) ---------------------------------------------------------------

/**
 * Los campos del formulario de anotar el saldo, en el orden en que se llenan, para la guía de foco. No agrega reglas: «falta» es
 * lo mismo que hoy bloquea `anotar()` (`CuentasDinero.tsx`): quién lo hace, un saldo que se pueda leer y una fecha que no sea futura.
 */
export function camposDeAnotarSaldo(d: { responsableListo: boolean; saldo: string; fecha: string; hoy: string }): CampoDeGuia[] {
  const saldoLegible = d.saldo.trim() !== "" && leerMontoPlata(d.saldo) !== null;
  return [
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: d.responsableListo, pendiente: "Elige quién está anotando el saldo." },
    { id: "saldo", nombre: "Saldo del banco", requerido: true, hecho: saldoLegible, pendiente: "Escribe el saldo que muestra la banca por internet." },
    { id: "fecha", nombre: "Fecha", requerido: true, hecho: d.fecha !== "" && d.fecha <= d.hoy, pendiente: "Elige el día del saldo (hoy o antes)." },
  ];
}

// ---- Qué corte mirar: `?hasta=` -----------------------------------------------------------------------------------------------

/**
 * El corte que pide la URL (`?hasta=`), o nulo para el de hoy. Se ignora lo que no es una fecha, lo futuro y lo anterior al piso: el
 * inicio de la cuenta (`saldoDesde`) o, si no lo tiene, el inicio de Finanzas (`inicio_finanzas`). Antes de eso no hay movimientos, y
 * el período quedaba al revés («del 16 oct al 1 ene», /chaos 2026-10-23).
 */
export function hastaDeLaUrl(pedido: string | undefined, hoy: string, piso: string | null): string | null {
  if (!pedido || !/^\d{4}-\d{2}-\d{2}$/.test(pedido) || pedido > hoy) return null;
  if (piso && pedido < piso.slice(0, 10)) return null;
  return pedido;
}

/** «del 16 oct al 23 oct»; con el año si el período no es del año de hoy («del 2 dic 1899 al 1 ene 1900»), para que no se lea como
 *  de este año. */
export function textoPeriodo(desde: string, hasta: string, hoy: string): string {
  const conAnio = desde.slice(0, 4) !== hoy.slice(0, 4) || hasta.slice(0, 4) !== hoy.slice(0, 4);
  return `del ${fechaCorta(desde, conAnio)} al ${fechaCorta(hasta, conAnio)}`;
}

// ---- Lista de bancos y filtro de líneas (rediseño Felipe 2026-10-31, «B · Lista y detalle») ------------------------------------
// A la izquierda, cada banco con su estado de un vistazo; a la derecha, el detalle del elegido. Solo presentación: lo que cuadra lo
// sigue decidiendo la base; aquí se traduce lo que ya llega (`ConciliacionCuenta`) a una frase y un tono.

export type EstadoBanco = { texto: string; tono: "verde" | "ambar" | "pizarra" };

/**
 * El estado de un banco en la lista: un saldo anotado que no coincide manda; si no, lo que falta revisar; si no, cómo cerró la última vez. Hasta el 2026-11-08 lo que
 * faltaba revisar iba primero (la maqueta «B · Lista y detalle»), y como la base solo cuenta las líneas posteriores al último saldo anotado, el «No cuadra» se perdía con
 * el primer movimiento nuevo.
 */
export function estadoDeBanco(c: Pick<ConciliacionCuenta, "pendientes" | "ultimaFecha" | "ultimaDiferencia">): EstadoBanco {
  if (c.ultimaFecha !== null && !cuadra(c.ultimaDiferencia)) return { texto: "No cuadra", tono: "ambar" };
  if (c.pendientes > 0) return { texto: `${c.pendientes} por revisar`, tono: "ambar" };
  return c.ultimaFecha === null ? { texto: "Falta el saldo", tono: "pizarra" } : { texto: "Cuadra", tono: "verde" };
}

export type Coincidencias = { coinciden: number; total: number; noCuadran: number; pendientes: number; todoCuadra: boolean };

/**
 * Cuántas de las cuentas que se cuadran (también la tarjeta de crédito; las puentes de las máquinas no tienen extracto) coinciden con el banco. Revisar líneas no es
 * cuadrar: `todoCuadra` exige las tres cosas en todas (saldo anotado, sin diferencia y nada por revisar), porque la base no cuenta como pendiente lo anterior al último
 * saldo anotado, y anotar hoy cinco saldos que no coinciden deja los pendientes en cero.
 */
export function coincidenciasConBanco(cuentas: readonly Pick<ConciliacionCuenta, "tipo" | "pendientes" | "ultimaFecha" | "ultimaDiferencia">[]): Coincidencias {
  const aCuadrar = cuentas.filter((c) => tieneExtracto(c.tipo));
  const coinciden = aCuadrar.filter((c) => c.ultimaFecha !== null && cuadra(c.ultimaDiferencia)).length;
  const pendientes = aCuadrar.reduce((a, c) => a + c.pendientes, 0);
  return {
    coinciden,
    total: aCuadrar.length,
    noCuadran: aCuadrar.filter((c) => c.ultimaFecha !== null && !cuadra(c.ultimaDiferencia)).length,
    pendientes,
    todoCuadra: aCuadrar.length > 0 && coinciden === aCuadrar.length && pendientes === 0,
  };
}

/** «3 de 5 coinciden con el banco». */
export function textoCoinciden(r: Pick<Coincidencias, "coinciden" | "total">): string {
  return `${r.coinciden} de ${r.total} ${r.coinciden === 1 ? "coincide" : "coinciden"} con el banco`;
}

/** «5 líneas por revisar». */
export function textoLineasPorRevisar(n: number): string {
  return `${n} ${n === 1 ? "línea" : "líneas"} por revisar`;
}

/** La línea bajo «Tus bancos»: lo que falta revisar, si hay, y siempre cuántos coinciden. */
export function cabeceraDeBancos(cuentas: Parameters<typeof coincidenciasConBanco>[0]): string {
  const r = coincidenciasConBanco(cuentas);
  return `${r.pendientes > 0 ? `${textoLineasPorRevisar(r.pendientes)} · ` : ""}${textoCoinciden(r)}.`;
}

/** «Última vez: 23 oct», o «Nunca se cuadró» si no se anotó nunca un saldo. */
export function textoUltimaVez(ultimaFecha: string | null): string {
  const dia = ultimaFecha ? diaLima(ultimaFecha) ?? ultimaFecha.slice(0, 10) : null;
  return dia ? `Última vez: ${fechaCorta(dia)}` : "Nunca se cuadró";
}

/** Las dos letras del círculo de un banco: «BCP Soles» → «BS», «BBVA» → «BB». */
export function inicialesDeBanco(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = palabras.length > 1 ? palabras.slice(0, 2).map((p) => p[0]).join("") : (palabras[0] ?? "").slice(0, 2);
  return letras.toUpperCase();
}

export type FiltroLineas = "pendientes" | "revisadas" | "todas";

/** Cuántas líneas están revisadas y cuántas faltan, para la barra de avance y las pestañas del filtro. */
export function avanceDeLineas(lineas: readonly Pick<LineaConciliacion, "revisado" | "montoRevisado">[]): { total: number; revisadas: number; faltan: number; pct: number } {
  const revisadas = lineas.filter((l) => estadoPar(l) === "revisada").length;
  return { total: lineas.length, revisadas, faltan: lineas.length - revisadas, pct: lineas.length ? Math.round((revisadas / lineas.length) * 100) : 0 };
}

/** Las líneas que muestra el filtro: «por revisar» incluye las que cambiaron desde que se revisaron. */
export function filtrarLineas<L extends Pick<LineaConciliacion, "revisado" | "montoRevisado">>(lineas: readonly L[], filtro: FiltroLineas): L[] {
  if (filtro === "todas") return [...lineas];
  return lineas.filter((l) => (estadoPar(l) === "revisada") === (filtro === "revisadas"));
}

// ---- «Lo que te deben las máquinas» (ADR-0629, Fase B, actividad 1) --------------------------------------------------------------
// La puente salió de la lista de bancos: su lugar es esta lista, que dice por máquina cuánto cobró y todavía no llegó, y qué días ya se
// pasaron de lo que la máquina tarda en depositar. Solo traduce lo que la base ya calcula (`fn_pos_alertas` y `fn_pos_pendientes`, que
// cuenta el residuo de cada día): no decide nada de plata.

export type DiaQueSeDebe = { clave: string; titulo: string; monto: number; nota: string | null };
export type DeudaDeMaquina = {
  cuentaId: string;
  nombre: string;
  /** Todo lo que cobró y no tiene depósito, atrasado o no. */
  total: number;
  estado: EstadoBanco;
  /** Solo los días que ya debieron llegar, del más viejo al más nuevo: son los que hay que buscar en el banco o reclamar. */
  atrasados: DiaQueSeDebe[];
  /** Lo que todavía no le toca llegar, en una frase («S/ 1,195.90 de hoy, que llega mañana»); nulo si no hay. */
  enCamino: string | null;
};

const textoMedio = (m: LotePendiente["medio"]) => (m === "tarjeta" ? "Tarjeta" : TEXTO_MEDIO_COBRO[m]);

/** Por máquina, lo que debe y qué días ya se atrasaron. Las máquinas sin nada pendiente salen «Al día» para que se vea que se miró. */
export function deudaDeMaquinas(alertas: readonly AlertaPos[], lotesPorCuenta: ReadonlyMap<string, readonly LotePendiente[]>): DeudaDeMaquina[] {
  return [...alertas]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((a) => {
      const lotes = [...(lotesPorCuenta.get(a.cuentaId) ?? [])].filter((l) => l.bruto > 0).sort((x, y) => x.fecha.localeCompare(y.fecha) || x.ubicacionNombre.localeCompare(y.ubicacionNombre, "es"));
      const atrasados = lotes.filter((l) => l.atrasado);
      const enCaminoMonto = redondear(lotes.filter((l) => !l.atrasado).reduce((s, l) => s + l.bruto, 0));
      const total = redondear(lotes.reduce((s, l) => s + l.bruto, 0));
      const montoAtrasado = redondear(atrasados.reduce((s, l) => s + l.bruto, 0));
      return {
        cuentaId: a.cuentaId,
        nombre: a.nombre,
        total,
        estado:
          atrasados.length > 0
            ? { texto: `${soles(montoAtrasado)} atrasado`, tono: "ambar" as const }
            : total > 0
              ? { texto: "Al día", tono: "verde" as const }
              : { texto: "No debe nada", tono: "verde" as const },
        atrasados: atrasados.map((l) => ({
          clave: l.clave,
          titulo: `${fechaCorta(l.fecha)} · ${l.ubicacionNombre} · ${textoMedio(l.medio)}`,
          monto: l.bruto,
          nota: l.yaDepositado > 0 ? `Ya llegaron ${soles(l.yaDepositado)}; esto falta` : null,
        })),
        enCamino: enCaminoMonto > 0 ? `${soles(enCaminoMonto)} todavía no le toca llegar.` : null,
      };
    });
}

const redondear = (n: number) => Math.round(n * 100) / 100;
