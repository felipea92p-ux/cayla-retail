"use client";

import { useId, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { campoEtiqueta } from "@/components/ui/Modal";

// El nivel 2 de «Nueva orden» (ADR-0509): lo que la orden ya trae resuelto (las fases y quién las hace, la tela, la entrega y la nota) plegado bajo UNA línea que lo resume y un «Ver y cambiar».
// Es la pieza de «Ver más / Ver menos» del sistema (`ui/VerMas`: baja en su lugar y, plegado, queda `inert`: ni se ve ni se alcanza con el teclado), no un botón a mano.
//
// QUÉ NO HACE. No decide cuándo se abre: eso es del formulario (`lib/orden-nivel-dos-reglas.ts`: se abre solo si algo adentro está mal o si la guía de foco quiere llevar al cursor a un
// campo de adentro). Lo plegado SIGUE MONTADO: lo escrito ahí (una fase que sale afuera, una tela) no se pierde al plegarlo y se manda igual.
export function NivelDos({ abierto, onCambio, resumen, children }: { abierto: boolean; onCambio: (abierto: boolean) => void; resumen: string; children: ReactNode }) {
  const id = useId();
  return (
    <section data-guia="prod-orden-nueva.nivel2" aria-label="Fases, tela y entrega" className="rounded-xl border border-dashed border-sand">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 text-sm leading-snug text-tinta/75">
          <span className={`${campoEtiqueta} mr-2`}>Fases, tela y entrega</span>
          {resumen}
        </p>
        <BotonVerMas abierto={abierto} onCambiar={onCambio} texto="Ver y cambiar" forma="enlace" controla={id} data-guia="prod-orden-nueva.nivel2-abrir" className="shrink-0" />
      </div>
      <FilasDeMas abierto={abierto} id={id}>
        <div className="space-y-5 border-t border-sand px-4 pb-4 pt-4">{children}</div>
      </FilasDeMas>
    </section>
  );
}
