"use client";

import Link from "next/link";
import { contextoAccion, resolverAccion } from "@/lib/resumen-acciones";
import type { AnalisisVariante, PasoPlan, Ubicacion } from "@/lib/resumen-reglas";

// El botón de una recomendación. Regla de Felipe: NUNCA mueve inventario al
// hacer clic — o navega al flujo real (ya prellenado, con su propia
// confirmación), o abre el `ReponerPisoModal` de Existencias (que solo escribe
// cuando la persona aprieta «Confirmar»), o abre el detalle que explica. Sin
// recomendación no hay botón: hay un texto quieto que dice «Sin acción».

export type AlAccionar = {
  bajarAlPiso: (a: AnalisisVariante, cantidad: number) => void;
  verDetalle: (a: AnalisisVariante) => void;
};

type Estilo = "fuerte" | "normal";

const BASE = "label-cayla inline-flex min-h-9 w-full items-center justify-center rounded-md px-2.5 py-1.5 text-center text-[11px] leading-[1.15] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta/60";
const ESTILO: Record<Estilo, string> = {
  // El rojo profundo es urgencia: solo lo recibe una acción sobre algo agotado o en cobertura crítica.
  fuerte: "bg-rojo-profundo text-crema hover:bg-rojo",
  normal: "border border-tinta/25 bg-papel text-tinta hover:border-tinta/50",
};

export function BotonAccion({
  a,
  destino,
  puedeBajarAlPiso,
  alAccionar,
  paso = a.plan.principal,
  estilo,
}: {
  a: AnalisisVariante;
  destino: Ubicacion;
  puedeBajarAlPiso: boolean;
  alAccionar: AlAccionar;
  /** Por defecto, el paso principal del plan; el detalle pasa cada paso por separado. */
  paso?: PasoPlan | null;
  estilo?: Estilo;
}) {
  const accion = resolverAccion(paso, contextoAccion(a, destino, puedeBajarAlPiso));
  if (accion.via === "ninguna" || !paso) {
    return <span className={`${BASE} cursor-default border border-tinta/10 bg-tinta/[0.03] text-tinta/45`}>Sin acción</span>;
  }
  const clase = `${BASE} ${ESTILO[estilo ?? (a.plan.urgencia === "alta" && paso.accionable ? "fuerte" : "normal")]}`;
  // La fila entera abre el detalle al hacer clic; el botón no debe abrirlo además.
  const parar = (e: React.MouseEvent) => e.stopPropagation();

  if (accion.via === "enlace") {
    return (
      <Link href={accion.href} onClick={parar} className={clase} title={paso.motivo}>
        {paso.texto}
      </Link>
    );
  }
  if (accion.via === "bajar_al_piso") {
    return (
      <button type="button" className={clase} title={paso.motivo} onClick={(e) => (parar(e), alAccionar.bajarAlPiso(a, accion.cantidad))}>
        {paso.texto}
      </button>
    );
  }
  return (
    <button type="button" className={clase} title={paso.motivo} onClick={(e) => (parar(e), alAccionar.verDetalle(a))}>
      {paso.texto}
    </button>
  );
}
