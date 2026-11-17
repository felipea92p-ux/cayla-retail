"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { Lacre } from "./Lacre";

// El aviso al cerrar un envío (Felipe 2026-11-16, maqueta `docs/maquetas/recibir-cierre-recibo-2026-11/`, forma B; ficha `docs/milimetro/cierre-de-envio.md`):
// en vez de llenar la pantalla con todo lo recibido, el sello cae, una línea dice qué entró y qué no cuadró, y tú eliges: imprimir las etiquetas (todo
// llega sin etiqueta, así que es lo que sigue), ver lo recibido o volver a la lista. Felipe eligió la variante con «Imprimir» primero. Cerrar el aviso
// (Escape, el velo, «atrás») es quedarse a ver lo recibido: ninguna salida pierde nada.

export function AvisoRecibido({
  numero,
  linea,
  imprimir,
  onVer,
  onVolver,
}: {
  numero: string;
  /** Qué entró y qué no cuadró, en una línea (`lineaDelAviso`). */
  linea: string;
  /** Las etiquetas de todo lo que entró al stock; `null` si nada entró (entonces «Ver lo recibido» es el principal). */
  imprimir: { href: string; etiquetas: number } | null;
  onVer: () => void;
  onVolver: () => void;
}) {
  return (
    <Modal
      titulo={`${numero} recibido`}
      onClose={onVer}
      arriba={
        <span className="rc-aviso-recibido block">
          <Lacre enHoja />
        </span>
      }
    >
      {(cerrar): ReactNode => (
        <div className="space-y-5">
          <p className="text-center text-[15px] text-taupe">{linea}</p>
          <div className="grid gap-2.5">
            {imprimir && (
              <BotonImprimir href={imprimir.href} peso="primario">
                {`Imprimir ${imprimir.etiquetas.toLocaleString("es-PE")} ${imprimir.etiquetas === 1 ? "etiqueta" : "etiquetas"}`}
              </BotonImprimir>
            )}
            <Boton type="button" peso={imprimir ? "fantasma" : "primario"} onClick={cerrar}>
              Ver lo recibido
            </Boton>
            <Boton type="button" peso="fantasma" onClick={onVolver}>
              Volver a Recibir mercadería {/* unificar-fijo: una de las tres salidas del aviso al cerrar, elegida por Felipe en la maqueta del 2026-11-16; no es la vuelta de la pantalla (esa sigue siendo la flecha) */}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
