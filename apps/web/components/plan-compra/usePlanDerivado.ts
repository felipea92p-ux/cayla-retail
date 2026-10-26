"use client";

import { useMemo } from "react";
import { avisosDelPlan, type AvisoDelPlan } from "@/lib/plan-compra-avisos";
import { conDescuentos, leerDescuentos } from "@/lib/plan-compra-descuento";
import { leerHistorial } from "@/lib/plan-compra-historial";
import { leerPedido, type LecturaPedido } from "@/lib/plan-compra-pedido";
import { diasDeVentasDelErp } from "@/lib/plan-compra-periodo";
import { diasConQueSeCuenta, fraseDeLosDias, fraseDelConteoAntesDelPlazo, leerPlazoFijado, plazoDePedido, type PlazoDePedido, type PlazoFijado } from "@/lib/plan-compra-plazo";
import { conHistorial, leerPropuesta, proponer, type LecturaPropuesta } from "@/lib/plan-compra-propuesta";
import { leerVersiones, versionDeHoy, type LecturaVersiones, type VersionDelPlan } from "@/lib/plan-compra-versiones";
import { tiendasParaRepartir } from "@/lib/plan-compra-reparto";
import {
  armarFilas,
  confianzaDelStock,
  leerPlan,
  momentoDeLaCampana,
  totalesDelPlan,
  type ConfianzaDelStock,
  type FilaPlan,
  type LecturaPlan,
  type Momento,
  type TotalesPlan,
} from "@/lib/plan-compra-reglas";
import type { LecturaMotor } from "@/lib/motor-demanda";

// Lo que se deriva de lo que la base manda para UNA campaña del Plan: las filas con su cuenta hecha, en qué momento está la campaña, el plazo para
// pedir, la confianza del stock y los avisos. Lo comparten las pestañas del Plan (Plan, Presupuesto, Calendario): las tres muestran la misma campaña
// y el mismo centro de avisos, y ninguna debe calcularlos por su lado. Antes vivía dentro de `PlanCampana`; salió de ahí sin cambiar nada de lo que hace
// (Kent Beck: primero se vuelve fácil el cambio, después se hace el cambio).

export type EntradaDelPlan = {
  datos: unknown;
  /** El descuento guardado y el que sugiere la campaña (`fn_plan_compra_descuento`), crudo. */
  descuentos?: unknown;
  /** Los hechos para proponer flojo, normal y bueno (`fn_plan_compra_propuesta`), crudos. */
  propuesta?: unknown;
  /** La misma campaña del año anterior en el historial, crudo. */
  historia?: unknown;
  /** Lo ya pedido en órdenes de compra, crudo. */
  pedido?: unknown;
  /** Los días para llegar fijados (`fn_plan_compra_plazo`), crudo. */
  plazo?: unknown;
  /** El precio de la plata, el tope y las versiones (`fn_plan_compra_versiones`), crudo. */
  versiones?: unknown;
  preparacion: LecturaMotor;
  puedeContar: boolean;
};

/** Lo derivado de una campaña que SÍ existe. */
export type PlanConPlan = {
  plan: LecturaPlan;
  /** Los hechos de la propuesta, aunque sean de otra campaña (la pantalla los descarta si `planId` no es el de este plan). */
  hechos: LecturaPropuesta | null;
  /** Los hechos, solo si son de ESTA campaña. */
  hechosDelPlan: LecturaPropuesta | null;
  pedido: LecturaPedido | null;
  filas: FilaPlan[];
  momento: Momento;
  totales: TotalesPlan;
  plazoFijado: PlazoFijado | null;
  plazo: PlazoDePedido;
  /** Categorías con algo por comprar. */
  porPedir: number;
  confianza: ConfianzaDelStock;
  avisos: AvisoDelPlan[];
  /** Las versiones del plan; null = la base no las manda (no se ofrecen ni «Usar el plan con tope»). */
  versiones: LecturaVersiones | null;
  /** El precio de la plata con que se calculan las filas (0 = el plan de siempre). */
  precioDeLaPlata: number;
  /** La versión que ES el plan de hoy; null = hay cambios que ninguna versión recuerda (o no hay versiones). */
  versionDeHoy: VersionDelPlan | null;
};

export type PlanDerivado = { plan: null; hechos: LecturaPropuesta | null; pedido: LecturaPedido | null; filas: FilaPlan[] } | PlanConPlan;

export function usePlanDerivado(e: EntradaDelPlan): PlanDerivado {
  const { datos, descuentos = null, propuesta = null, historia = null, pedido: pedidoCrudo = null, plazo: plazoCrudo = null, versiones: versionesCrudas = null, preparacion, puedeContar } = e;
  const plan = useMemo(() => conDescuentos(leerPlan(datos), leerDescuentos(descuentos)), [datos, descuentos]);
  const hechos = useMemo(() => {
    const leida = leerPropuesta(propuesta);
    return leida ? conHistorial(leida, leerHistorial(historia)) : null;
  }, [propuesta, historia]);
  const pedido = useMemo(() => leerPedido(pedidoCrudo), [pedidoCrudo]);
  const versiones = useMemo(() => leerVersiones(versionesCrudas), [versionesCrudas]);
  // El precio de la plata del plan con tope que la campaña USA: cada cuenta del Plan (la tabla, la hoja de cada categoría, el simulador) lo aplica.
  const precioDeLaPlata = versiones?.precioDeLaPlata ?? 0;

  // Cada fila lleva lo que propone el sistema (C4) y el % de lo que sobra de la campaña (C5), si la base los manda para ESTA campaña.
  const filas = useMemo(() => {
    if (!plan) return [];
    // Lo ya pedido en órdenes va en cada fila haya o no propuesta, y lo que falta llegar se resta de «Comprar» (ADR-0372 act. (e) y 2026-10-13 b).
    const base = armarFilas(plan, pedido?.porCategoria, precioDeLaPlata);
    if (!hechos || hechos.planId !== plan.plan.id) return base;
    return base.map((f) => ({
      ...f,
      propuesta: proponer(hechos, f.c.id),
      propuestaLeidaEn: hechos.leidaEn,
      diasDeVentas: diasDeVentasDelErp(hechos.tiendas),
      conCampanaAnterior: hechos.tiendas.some((t) => t.previaDisponible),
      recuperoDefecto: hechos.recupero.pct,
      // El reparto entre tiendas (Felipe 2026-10-12): todas las tiendas activas, con su venta de 90 días, su stock y su mínimo.
      reparto:
        hechos.tiendasActivas.length > 0
          ? tiendasParaRepartir(hechos, f.c.id, (nombre) => f.sedes?.find((s) => s.ubicacion === nombre)?.unidades ?? 0)
          : undefined,
    }));
  }, [plan, hechos, pedido, precioDeLaPlata]);

  if (!plan) return { plan: null, hechos, pedido, filas };

  const momento = momentoDeLaCampana(plan.hoy, plan.plan.desde, plan.plan.hasta);
  const totales = totalesDelPlan(filas);
  // La fecha límite para pedir (ADR-0499): el inicio de la campaña menos los días que tarda un pedido en llegar. Mientras ese número no se
  // fije por campaña, es el supuesto de fábrica (14) y el aviso lo dice.
  const plazoFijado = leerPlazoFijado(plazoCrudo);
  const plazo = plazoDePedido(plan.plan.desde, plan.plan.hasta, plan.hoy, diasConQueSeCuenta(plazoFijado));
  const porPedir = filas.filter((f) => (f.calculo?.comprar ?? 0) > 0).length;
  const confianza = confianzaDelStock(preparacion);
  const hechosDelPlan = hechos && hechos.planId === plan.plan.id ? hechos : null;
  // El centro de avisos (Felipe 2026-10-26, spike ②): UNA lista en vez de franjas sueltas, con su número y lo urgente a la vista.
  const avisos = avisosDelPlan(
    {
      estado: momento.estado,
      plazo,
      porPedir,
      conPlan: totales.conPlan,
      fraseDeLosDias: fraseDeLosDias(plazoFijado),
      puedeCambiarDias: !!plazoFijado,
      confianza,
      puedeContar,
      fraseDelConteo: fraseDelConteoAntesDelPlazo(plazo),
      filas,
      tope: plan.tope.valor,
      inversion: totales.inversion,
      precioDeLaPlata,
    },
    { diasDeVentas: diasDeVentasDelErp(hechosDelPlan?.tiendas), conCampanaAnterior: hechosDelPlan?.tiendas.some((t) => t.previaDisponible) ?? false },
  );
  return { plan, hechos, hechosDelPlan, pedido, filas, momento, totales, plazoFijado, plazo, porPedir, confianza, avisos, versiones, precioDeLaPlata, versionDeHoy: versiones ? versionDeHoy(versiones) : null };
}
