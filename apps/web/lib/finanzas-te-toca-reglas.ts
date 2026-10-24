// «Te toca» del telar de Finanzas (Felipe 2026-10-23): los pendientes de los seis submódulos juntos, en un cajón de la mesa de
// mando. Cada submódulo aporta los suyos (`pendientesDe<Submódulo>`), con la misma forma; el cajón los agrupa y pone primero los del
// submódulo donde se está. Lógica pura, probada en `finanzas-te-toca-reglas.test.ts`. No inventa reglas: cada pendiente sale de una
// cifra que su pantalla ya muestra.
import { soles } from "./flujo-caja-reglas";
import type { PendienteImpuesto } from "./impuestos-antes-reglas";

/** «frena»: no deja seguir (un cierre, un pago que vence). «avisa»: conviene hacerlo. */
export type EstadoPendiente = "frena" | "avisa";

export type PendienteTelar = {
  /** El id de su submódulo en el menú (`finanzas.gastos`). */
  submodulo: string;
  id: string;
  estado: EstadoPendiente;
  titulo: string;
  detalle: string;
  /** El texto del botón: lo que hace al tocarlo («Clasificar»). */
  verbo: string;
  href: string;
};

/** Los pendientes de Gastos, de su panel del mes (`fn_gastos_panel`). `consulta` es lo que viaja en la dirección (`?sede=…`). */
export function pendientesDeGastos(
  panel: { egresosSinClasificar: number; egresosSinClasificarMonto: number; sinComprobante: number; nPorPagar: number; porPagar: number },
  consulta: string,
): PendienteTelar[] {
  const con = (extra: string) => {
    const q = [consulta, extra].filter(Boolean).join("&");
    return q ? `/finanzas/gastos?${q}` : "/finanzas/gastos";
  };
  const lista: PendienteTelar[] = [];
  if (panel.egresosSinClasificar > 0) {
    const n = panel.egresosSinClasificar;
    lista.push({
      submodulo: "finanzas.gastos",
      id: "gastos.egresos",
      estado: "avisa",
      titulo: `${n} ${n === 1 ? "salida de caja" : "salidas de caja"} sin clasificar`,
      detalle: `${soles(panel.egresosSinClasificarMonto)} que no cuentan en ningún número hasta decir qué fueron`,
      verbo: "Clasificar",
      href: con("tab=egresos"),
    });
  }
  if (panel.sinComprobante > 0) {
    const n = panel.sinComprobante;
    lista.push({
      submodulo: "finanzas.gastos",
      id: "gastos.sin-comprobante",
      estado: "avisa",
      titulo: `${n} ${n === 1 ? "gasto" : "gastos"} sin boleta ni factura`,
      detalle: "Sin comprobante no recuperas su IGV",
      verbo: "Ver",
      href: con(""),
    });
  }
  if (panel.nPorPagar > 0) {
    lista.push({
      submodulo: "finanzas.gastos",
      id: "gastos.por-pagar",
      estado: "avisa",
      titulo: `${panel.nPorPagar} ${panel.nPorPagar === 1 ? "gasto" : "gastos"} por pagar`,
      detalle: `${soles(panel.porPagar)} en facturas a crédito`,
      verbo: "Ver",
      href: con(""),
    });
  }
  return lista;
}

/** Los pendientes de Impuestos: su lista «Antes de declarar» (`antesDeDeclarar`, del mes que se declara ahora). Lo que no lleva a
 *  otra pantalla (el aviso del límite, los recibos por honorarios) lleva a Impuestos. `consulta` es lo que viaja (`?sede=…`). */
export function pendientesDeImpuestos(lista: readonly PendienteImpuesto[], consulta: string): PendienteTelar[] {
  const aImpuestos = consulta ? `/finanzas/impuestos?${consulta}` : "/finanzas/impuestos";
  return lista.map((p) => ({
    submodulo: "finanzas.impuestos",
    id: `impuestos.${p.id}`,
    estado: p.estado,
    titulo: p.titulo,
    detalle: p.detalle,
    verbo: p.href && p.verbo ? p.verbo : "Ver",
    href: p.href ?? aImpuestos,
  }));
}

export type GrupoPendientes = { submodulo: string; etiqueta: string; pendientes: PendienteTelar[] };

/** Los pendientes por submódulo, en el orden de las pestañas, con el submódulo donde se está primero; lo que frena va arriba. */
export function agruparPendientes(lista: readonly PendienteTelar[], submodulos: readonly { clave: string; etiqueta: string }[], actual: string): GrupoPendientes[] {
  const orden = [...submodulos].sort((a, b) => Number(b.clave === actual) - Number(a.clave === actual));
  return orden
    .map((s) => ({
      submodulo: s.clave,
      etiqueta: s.etiqueta,
      pendientes: lista.filter((p) => p.submodulo === s.clave).sort((a, b) => Number(b.estado === "frena") - Number(a.estado === "frena")),
    }))
    .filter((g) => g.pendientes.length > 0);
}
