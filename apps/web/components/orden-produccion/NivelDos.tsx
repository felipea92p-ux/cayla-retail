"use client";

import { useId, type ReactNode } from "react";
import { ParDato, Pares } from "@/components/ui/ParDato";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { PasoDeLaOrden } from "@/components/orden-produccion/PasoDeLaOrden";
import type { ParDelResumen } from "@/lib/orden-nivel-dos-reglas";
import { AYUDA_DEL_RESTO, PASOS_DE_LA_ORDEN, type EstadoDelPaso } from "@/lib/orden-pasos-reglas";

// El paso 3 de «Nueva orden» (el «nivel 2» de ADR-0509): lo que la orden ya trae resuelto (las fases y quién las hace, la tela, la entrega y la nota) plegado bajo su resumen y un «Ver y cambiar».
// El resumen va dato por dato (`<ParDato>`: «Fases», «Tela», «Entrega», «Nota» si hay), no en una frase con puntos (Producción más clara, Felipe 2026-11-26); abierto, los campos ya dicen
// lo mismo y el resumen se calla. Lo que explica el paso vive detrás del «?» de su título.
// Es la pieza de «Ver más / Ver menos» del sistema (`ui/VerMas`: baja en su lugar y, plegado, queda `inert`: ni se ve ni se alcanza con el teclado), no un botón a mano.
//
// QUÉ NO HACE. No decide cuándo se abre: eso es del formulario (`lib/orden-nivel-dos-reglas.ts`: se abre solo si algo adentro está mal o si la guía de foco quiere llevar al cursor a un
// campo de adentro). Lo plegado SIGUE MONTADO: lo escrito ahí (una fase que sale afuera, una tela) no se pierde al plegarlo y se manda igual.
export function NivelDos({
  abierto,
  onCambio,
  resumen,
  estado,
  children,
}: {
  abierto: boolean;
  onCambio: (abierto: boolean) => void;
  resumen: readonly ParDelResumen[];
  /** Cómo va el paso, según la guía de foco. */
  estado: EstadoDelPaso;
  children: ReactNode;
}) {
  const id = useId();
  const paso = PASOS_DE_LA_ORDEN.resto;
  return (
    // Abierto, las fases y la tela llevan su propio «Sigue» en su título: el del paso se calla.
    <PasoDeLaOrden numero={paso.numero} titulo={paso.titulo} estado={estado} conPalabra={!abierto} ayuda={AYUDA_DEL_RESTO} guia="prod-orden-nueva.nivel2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {!abierto && (
          <Pares>
            {resumen.map((par) => (
              <ParDato key={par.clave} rotulo={par.rotulo}>
                {par.valor}
              </ParDato>
            ))}
          </Pares>
        )}
        <BotonVerMas abierto={abierto} onCambiar={onCambio} texto="Ver y cambiar" forma="enlace" controla={id} data-guia="prod-orden-nueva.nivel2-abrir" className="shrink-0 @min-[560px]:ml-auto" />
      </div>
      <FilasDeMas abierto={abierto} id={id}>
        <div className="mt-4 space-y-5 border-t border-sand pt-4">{children}</div>
      </FilasDeMas>
    </PasoDeLaOrden>
  );
}
