// «Te toca» de Cuentas y dinero (El telar, actividad 6): lo pendiente de Dinero para el cajón de la mesa de mando, con la forma
// `PendienteTelar` de la barra común; lo llama `app/api/finanzas/te-toca/route.ts`. Lógica pura: cada pendiente sale de una cifra
// que su cara ya muestra (lo que vence, la caja fuerte sin depositar, las líneas sin revisar).

import { soles } from "./flujo-caja-reglas";
import { diasHasta, type FilaPorPagar } from "./por-pagar-consolidado-reglas";
import { avisoCajaFuerte, ultimoDepositoDe } from "./dinero-telar-reglas";
import { diasEntreFechas } from "./fechas-lima";
import type { CuentaDinero, MovimientoDinero } from "./cuentas-dinero-reglas";
import type { PendienteTelar } from "./finanzas-te-toca-reglas";

type Pendiente = PendienteTelar;

/** Las cajas fuertes con plata que ya avisan en ámbar (más de 3 días sin depositar), de la sede que se mira o de todas. */
export function cajasSinDepositar(
  cuentas: readonly CuentaDinero[],
  movimientos: readonly Pick<MovimientoDinero, "tipo" | "origenId" | "estado" | "fecha">[],
  hoy: string,
  ubicacionId: string | null,
): { nombre: string; saldo: number; dias: number }[] {
  return cuentas
    .filter((c) => c.tipo === "caja_fuerte" && !c.archivada && (!ubicacionId || c.ubicacionId === ubicacionId))
    .filter((c) => avisoCajaFuerte(c, movimientos, hoy)?.tono === "ambar")
    .map((c) => ({ nombre: c.nombre, saldo: c.saldo ?? 0, dias: diasEntreFechas(ultimoDepositoDe(c.id, movimientos)!, hoy) }));
}

const facturas = (n: number) => `${n} ${n === 1 ? "factura" : "facturas"}`;

/**
 * Los pendientes de Dinero:
 * - lo vencido y lo que vence en 7 días, que **frena** (es plata que se debe ya) y lleva a «Qué debes» con ese tramo filtrado;
 * - cada caja fuerte con plata que lleva más de 3 días sin depositar, que **avisa** y lleva a «Dónde está»;
 * - las líneas de los bancos sin revisar, que **avisa** y lleva a «Cuadrar con el banco» (solo el líder la ve).
 * `consulta` es lo que viaja en la dirección (`sede=…`).
 */
export function pendientesDeDinero(
  datos: {
    porPagar: readonly Pick<FilaPorPagar, "vence" | "saldo">[];
    cajasSinDepositar: readonly { nombre: string; saldo: number; dias: number }[];
    lineasSinRevisar: number;
    esLider: boolean;
  },
  hoy: string,
  consulta: string,
): Pendiente[] {
  const con = (ruta: string, extra = "") => {
    const q = [consulta, extra].filter(Boolean).join("&");
    return q ? `${ruta}?${q}` : ruta;
  };
  const lista: Pendiente[] = [];

  const vencidas = datos.porPagar.filter((f) => diasHasta(f.vence, hoy) < 0);
  const semana = datos.porPagar.filter((f) => {
    const d = diasHasta(f.vence, hoy);
    return d >= 0 && d <= 7;
  });
  const suma = (fs: readonly Pick<FilaPorPagar, "saldo">[]) => fs.reduce((a, f) => a + f.saldo, 0);
  if (vencidas.length > 0) {
    lista.push({
      submodulo: "finanzas.dinero",
      id: "dinero.vencidas",
      estado: "frena",
      titulo: `${facturas(vencidas.length)} ya ${vencidas.length === 1 ? "venció" : "vencieron"}`,
      detalle: `${soles(suma(vencidas))} que se debían pagar antes de hoy`,
      verbo: "Pagar",
      href: con("/finanzas/dinero/por-pagar", "tramo=vencidas"),
    });
  }
  if (semana.length > 0) {
    lista.push({
      submodulo: "finanzas.dinero",
      id: "dinero.esta-semana",
      estado: "frena",
      titulo: `Pagar ${facturas(semana.length)} de esta semana`,
      detalle: `${soles(suma(semana))} que vencen en los próximos 7 días`,
      verbo: "Ver",
      href: con("/finanzas/dinero/por-pagar", "tramo=semana"),
    });
  }
  for (const c of datos.cajasSinDepositar) {
    lista.push({
      submodulo: "finanzas.dinero",
      id: `dinero.deposito.${c.nombre}`,
      estado: "avisa",
      titulo: `${c.nombre} lleva ${c.dias} días sin depositar`,
      detalle: `${soles(c.saldo)} guardados que podrían estar en el banco`,
      verbo: "Ver",
      href: con("/finanzas/dinero"),
    });
  }
  if (datos.esLider && datos.lineasSinRevisar > 0) {
    const n = datos.lineasSinRevisar;
    lista.push({
      submodulo: "finanzas.dinero",
      id: "dinero.cuadrar",
      estado: "avisa",
      titulo: `${n} ${n === 1 ? "movimiento" : "movimientos"} del banco sin revisar`,
      detalle: "Para saber si los bancos cuadran antes del cierre",
      verbo: "Cuadrar",
      href: "/finanzas/dinero/conciliacion",
    });
  }
  return lista;
}
