// «Te toca» del telar de Finanzas (Felipe 2026-10-23): los pendientes de los seis submódulos juntos, en un cajón de la mesa de
// mando. Cada submódulo aporta los suyos (`pendientesDe<Submódulo>`), con la misma forma; el cajón los agrupa y pone primero los del
// submódulo donde se está. Lógica pura, probada en `finanzas-te-toca-reglas.test.ts`. No inventa reglas: cada pendiente sale de una
// cifra que su pantalla ya muestra.
import { soles } from "./flujo-caja-reglas";
import { DESDE_EL_UMBRAL } from "./gastos-extracto-reglas";
import type { PendienteImpuesto } from "./impuestos-antes-reglas";
import { CLASE_AVISO, ordenarAvisos, type Aviso } from "./resumen-finanzas-reglas";

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

/**
 * Los pendientes de Gastos, de su panel del mes (`fn_gastos_panel`). `sinComprobante` e `igvSinComprobante` NO son los del panel: son lo
 * grande sin papel de la lista del mes (`sinComprobanteGrande`), lo mismo que marca la lista (Felipe 2026-10-30). `consulta` es lo que viaja
 * en la dirección (`?sede=…`).
 */
export function pendientesDeGastos(
  panel: { egresosSinClasificar: number; egresosSinClasificarMonto: number; sinComprobante: number; igvSinComprobante: number; nPorPagar: number; porPagar: number },
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
      titulo: `${n} ${n === 1 ? "gasto" : "gastos"} ${DESDE_EL_UMBRAL} sin boleta ni factura`,
      detalle: `Con factura recuperarías ${soles(panel.igvSinComprobante)} de IGV`,
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

/** Los gastos fijos del mes que ya vencieron sin registrarse (`fn_gastos_fijos_mes`, estado «falta»). */
export function pendientesDeFijos(faltan: readonly { monto: number }[], consulta: string): PendienteTelar[] {
  if (faltan.length === 0) return [];
  const q = [consulta, "tab=fijos"].filter(Boolean).join("&");
  const n = faltan.length;
  return [
    {
      submodulo: "finanzas.gastos",
      id: "gastos.fijos",
      estado: "avisa",
      titulo: `${n} ${n === 1 ? "gasto fijo venció" : "gastos fijos vencieron"} sin registrarse`,
      detalle: `Por unos ${soles(faltan.reduce((a, f) => a + f.monto, 0))}. Mientras no estén, el resultado del mes sale mejor de lo que es`,
      verbo: "Ver fijos",
      href: `/finanzas/gastos?${q}`,
    },
  ];
}

/** El mes anterior sin cerrar. `submodulo` es el del menú; `mesNombre`, «octubre». */
/**
 * El cierre en «Te toca» con su lectura (tarea 155): si no se pudo leer qué meses están cerrados, no se dice «sigue abierto» sin saberlo.
 * El pendiente no sale y el cajón queda incompleto, así que si nada más responde el cajón dice «No pudimos revisar tus pendientes».
 * `clave`: la unidad que se mira (la sede o «consolidado»).
 */
export function cierreDeTeToca(o: { mes: string; mesNombre: string; clave: string; lectura: { datos: readonly string[]; falla: string | null } }): { pendientes: PendienteTelar[]; incompleto: boolean } {
  if (o.lectura.falla) return { pendientes: [], incompleto: true };
  return { pendientes: pendientesDeCierre({ mes: o.mes, mesNombre: o.mesNombre, cerrado: o.lectura.datos.includes(o.clave) }), incompleto: false };
}

/** Cada pregunta a «Te toca» hace cerca de una docena de lecturas: al recibir el foco se repite, como máximo, una vez por minuto. */
const ESPERA_ENTRE_PREGUNTAS_MS = 60_000;

export function puedeVolverAPreguntar(ultimaPregunta: number, ahora: number): boolean {
  return ahora - ultimaPregunta >= ESPERA_ENTRE_PREGUNTAS_MS;
}

/** Lo que dice el cajón. Con varias sedes marcadas la respuesta es de todas (Por pagar, adonde llevan sus enlaces, mira de a una): se dice, no se finge que filtra. */
export function frasesDeTeToca(varias: boolean): { frase: string; vacio: string } {
  return varias
    ? { frase: "Lo que conviene hacer hoy en Finanzas, de todas las sedes.", vacio: "Nada te toca en Finanzas en ninguna sede." }
    : { frase: "Lo que conviene hacer hoy en Finanzas, para la sede que elegiste arriba.", vacio: "Nada te toca en Finanzas para esta sede." };
}

function pendientesDeCierre(o: { mes: string; mesNombre: string; cerrado: boolean }): PendienteTelar[] {
  if (o.cerrado) return [];
  return [
    {
      submodulo: "finanzas.cierreDeMes",
      id: "cierre.mes",
      estado: "avisa",
      titulo: `${o.mesNombre.charAt(0).toUpperCase()}${o.mesNombre.slice(1)} sigue abierto`,
      detalle: `Mientras siga abierto, se puede registrar con fecha de ${o.mesNombre} y sus números pueden cambiar`,
      verbo: "Cerrar el mes",
      href: `/finanzas/cierre?mes=${o.mes}`,
    },
  ];
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

// ---- «Hoy te toca» del Resumen: una sola lista con el cajón (tarea 1 de «Las 36», Felipe 2026-11-05) ----------------------------------------------

/** Los avisos del Resumen que dicen lo mismo que un pendiente del cajón. Lo demás (la caja bajo el mínimo, una tienda que pierde, lo fuera de lo
 *  normal, una campaña) es lectura del propio Resumen: sale de `fn_resumen_finanzas`, que tarda 2,3 s y no puede ir en cada navegación del cajón. */
const YA_EN_EL_CAJON = /^(vencida:|vencidas:resto$|vencen$|fijo:|fijos:resto$|egresos$|cierre$)/;
/** Los pendientes que tienen su aviso equivalente en el Resumen, y en qué lugar van. */
const ORDEN_DEL_PENDIENTE: Readonly<Record<string, number>> = {
  "dinero.vencidas": CLASE_AVISO.vencida,
  "dinero.esta-semana": CLASE_AVISO.vencen,
  "gastos.fijos": CLASE_AVISO.fijo,
  "cierre.mes": CLASE_AVISO.cierre,
  "gastos.egresos": CLASE_AVISO.egresos,
};

function avisoDelPendiente(p: PendienteTelar): Aviso {
  return {
    clave: p.id,
    tono: p.estado === "frena" ? "rojo" : "ambar",
    titulo: p.titulo,
    detalle: p.detalle,
    impacto: null,
    href: p.href,
    boton: p.verbo,
    origen: "Te toca",
    orden: ORDEN_DEL_PENDIENTE[p.id] ?? CLASE_AVISO.egresos,
    peso: 0,
  };
}

/**
 * Lo que dice «Hoy te toca»: lo que tienes que hacer sale del cajón, para que las dos listas digan lo mismo, y encima va la lectura propia del Resumen.
 * Si el cajón no respondió (`null`), o respondió a medias, los avisos del Resumen siguen: mejor repetir que callar lo vencido.
 */
export function listaDeHoy(pendientes: readonly PendienteTelar[] | null, incompleto: boolean, avisos: readonly Aviso[]): Aviso[] {
  if (pendientes === null) return ordenarAvisos(avisos);
  if (incompleto) return ordenarAvisos([...avisos, ...pendientes.filter((p) => !(p.id in ORDEN_DEL_PENDIENTE)).map(avisoDelPendiente)]);
  return ordenarAvisos([...avisos.filter((a) => !YA_EN_EL_CAJON.test(a.clave)), ...pendientes.map(avisoDelPendiente)]);
}
