// «Te toca» de Cuentas y dinero (El telar, actividad 6): lo pendiente de Dinero para el cajón de la mesa de mando. Tiene la forma
// `PendienteTelar` de `lib/finanzas-te-toca-reglas.ts` (la barra común, PR #1305); se escribe aparte porque esa barra todavía no
// está en main. Al llegar, se importa su tipo y se llama desde `app/api/finanzas/te-toca/route.ts`. Lógica pura: cada pendiente
// sale de una cifra que su cara ya muestra (lo que vence, la caja fuerte sin depositar, las líneas sin revisar).

import { soles } from "./flujo-caja-reglas";
import { diasHasta, type FilaPorPagar } from "./por-pagar-consolidado-reglas";

/** Lo mismo que `PendienteTelar` de la barra común (se reemplaza por su tipo cuando esté en main). */
type Pendiente = {
  submodulo: "finanzas.dinero";
  id: string;
  estado: "frena" | "avisa";
  titulo: string;
  detalle: string;
  verbo: string;
  href: string;
};

const facturas = (n: number) => `${n} ${n === 1 ? "factura" : "facturas"}`;

/**
 * Los pendientes de Dinero:
 * - lo vencido y lo que vence en 7 días, que **frena** (es plata que se debe ya) y lleva a «Qué debes» con ese tramo filtrado;
 * - cada caja fuerte con plata que lleva más de 3 días sin depositar, que **avisa** y lleva a «Dónde está»;
 * - las líneas de los bancos sin revisar, que **avisa** y lleva a «Cuadrar con el banco» (solo el líder la ve).
 * `consulta` es lo que viaja en la dirección (`sede=…`).
 * Sin uso hasta que «Te toca» de la barra común (PR #1305) llegue a main: está en `ignoreFiles` de `knip.ts` hasta conectarlo.
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
