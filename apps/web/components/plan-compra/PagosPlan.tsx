"use client";

import { Ayuda } from "@/components/Ayuda";
import { CuandoSePaga } from "@/components/plan-compra/CuandoSePaga";
import { MarcoPlan } from "@/components/plan-compra/MarcoPlan";
import { PartesDelPresupuesto } from "@/components/plan-compra/PartesDelPresupuesto";
import { SinCampana } from "@/components/plan-compra/SinCampana";
import { usePlanDerivado } from "@/components/plan-compra/usePlanDerivado";
import { Aviso } from "@/components/ui/Aviso";
import { leerPagado, leerPagos } from "@/lib/plan-compra-inversion";
import type { CampanasLeidas } from "@/lib/plan-compra-reglas";
import type { LecturaMotor } from "@/lib/motor-demanda";

// Compras ▸ Plan de campaña ▸ Presupuesto ▸ Cuándo se paga (ADR-0527, Felipe 2026-10-26, spike ⑤): cuándo se pide y se paga lo que el plan todavía pide comprar, cuánto de lo que sale de caja es IGV y
// si Finanzas ve la compra. Lee lo mismo que las demás pestañas (`getPlanCompra`, con los pagos) y la misma campaña; lo nuevo es lo que guarda: la lista de pagos y la visibilidad.
export function PagosPlan({
  datos,
  falla,
  preparacion,
  campanas,
  puedeContar,
  planPedidoNoExiste = false,
  propuesta = null,
  pedido = null,
  historia = null,
  descuentos = null,
  plazo = null,
  versiones = null,
  versionesFallo = false,
  pagos = null,
  pagado = null,
  pagosFallo = false,
}: {
  datos: unknown;
  falla: string | null;
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  puedeContar: boolean;
  planPedidoNoExiste?: boolean;
  propuesta?: unknown;
  pedido?: unknown;
  historia?: unknown;
  descuentos?: unknown;
  plazo?: unknown;
  versiones?: unknown;
  versionesFallo?: boolean;
  /** Cómo se paga la campaña y si Finanzas la ve (`fn_plan_compra_pagos`), crudo; null = la base todavía no lo tiene o falló. */
  pagos?: unknown;
  /** Lo facturado y lo ya pagado de la campaña (`fn_plan_compra_pagado`), crudo. */
  pagado?: unknown;
  /** La lectura de los pagos FALLÓ (no es que la base no los tenga): no se ofrece guardar a ciegas. */
  pagosFallo?: boolean;
}) {
  const derivado = usePlanDerivado({ datos, descuentos, propuesta, historia, pedido, plazo, versiones, preparacion, puedeContar, campanas });
  if (derivado.plan === null) return <SinCampana activa="presupuesto" campanas={campanas} falla={falla} />;
  const lectura = leerPagos(pagos);
  return (
    <MarcoPlan
      activa="presupuesto"
      derivado={derivado}
      campanas={campanas}
      planPedidoNoExiste={planPedidoNoExiste}
      versionesFallo={versionesFallo}
      subtitulo={
        <>
          {derivado.plan.plan.nombre}: cuándo pides y cuándo pagas lo que falta comprar.{" "}
          <span className="inline-block align-middle">
            <Ayuda titulo="Cómo se lee">
              <span className="block">
                Parte lo que falta comprar en 1, 2 o 3 tandas, elige la semana de cada pedido y cómo se paga (contado, a 30 o 60 días, con anticipo). Con eso ves cuánto sale de tu caja cada mes y si algún pedido llega tarde
                para la campaña.
              </span>
              <span className="mt-2 block">
                Nada se compra ni se paga aquí: es el plan de pagos. Finanzas lo lee para decirte si la caja aguanta; el pago de verdad se registra en Compras ▸ Por pagar y reemplaza al planeado.
              </span>
            </Ayuda>
          </span>
        </>
      }
    >
      {() => (
        <>
          <PartesDelPresupuesto activa="pagos" planId={derivado.plan.plan.id} />
          {pagosFallo ? (
            <Aviso tono="atencion" titulo="No se pudo leer cómo se paga esta campaña">
              La base no respondió. Recarga la página; si sigue igual, avísale a tu líder. Mientras tanto no se ofrece guardar nada: podrías pisar lo que ya había.
            </Aviso>
          ) : lectura === null ? (
            <Aviso tono="info" titulo="Esta parte todavía no está disponible">
              La base aún no sabe guardar cómo se paga una campaña. Tu plan sigue igual y Finanzas cuenta lo que falta pedir sin fechas de pago.
            </Aviso>
          ) : (
            <CuandoSePaga key={`${derivado.plan.plan.id}|${lectura.guardado?.version ?? 0}`} derivado={derivado} lectura={lectura} pagado={leerPagado(pagado)} />
          )}
        </>
      )}
    </MarcoPlan>
  );
}
