"use client";

import type { ReactNode } from "react";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { useRetenerLuz, type ModoRetencion } from "./useRetenerLuz";
import type { GuiaCampos } from "./useGuiaCampos";

// Las dos piezas de la guía de foco para un modal (CLAUDE.md «Guía de foco», ADR-0284). Sus estilos: `app/estilos/alta-guia.css`
// (`hilo-luz`). Lo único que hacen: encender el control que sigue —una caja de texto, un combo, chips, un interruptor, un grupo de
// tres cajas— y decir qué falta antes del botón. No conocen ningún control en particular: envuelven lo que les pongas.

/**
 * Envuelve UN campo (o un grupo de ellos) y lo ENCIENDE cuando es el que sigue: un halo suave alrededor, el fondo más claro en la
 * caja de texto o el combo de adentro, y la marca de su título. `titulo` es solo para un grupo o un control sin etiqueta propia
 * (los `CampoTexto` ya traen la suya: pásale `guia.etiqueta(id, "Nombre")`). Sin `guia.estado(id)` conocido es «opcional».
 * No cambia el tamaño de nada: la luz se pinta por detrás y por fuera.
 */
export function CampoGuiado({
  id,
  guia,
  titulo,
  ayuda,
  retiene,
  className = "",
  children,
}: {
  id: string;
  guia: GuiaCampos;
  titulo?: ReactNode;
  ayuda?: ReactNode;
  /** `"fila"` para un campo de VARIAS opciones (chips que se marcan de a uno): la luz espera mientras se siga eligiendo aquí. Por defecto
   *  espera solo mientras se teclea en una caja de texto. */
  retiene?: ModoRetencion;
  className?: string;
  children: ReactNode;
}) {
  const estado = guia.estado(id);
  const retener = useRetenerLuz(id, guia, retiene);

  return (
    <div {...retener} data-campo={id} data-estado={estado} className={`hilo-luz ${className}`}>
      {titulo && (
        <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-tinta">
          <ConMarca estado={estado}>{titulo}</ConMarca>
          {ayuda && <span className="text-[12px] font-normal text-taupe">{ayuda}</span>}
        </p>
      )}
      {children}
    </div>
  );
}

/** «Falta: ● Nombre ○ Motivo» sobre el botón principal, cada cosa tocable (lleva a su campo); con todo listo, «Todo listo.».
 *  `conFrase`: además, escribe A LA VISTA qué hacer con el campo que sigue («El precio va con punto, por ejemplo 12.50.»). Sin esto la frase solo vive en el
 *  `title` de cada chip (pasar el mouse), que no se ve con el dedo ni con el teclado (ley 6 de Formidable). Por defecto no cambia nada para los demás modales. */
export function PieGuia({ guia, listo = "Todo listo.", conFrase = false }: { guia: GuiaCampos; listo?: string; conFrase?: boolean }) {
  if (guia.faltan.length > 0) {
    const siguiente = guia.faltan.find((c) => c.id === guia.ahora) ?? guia.faltan[0];
    return (
      <div className="space-y-1 pt-1">
        <FaltanDelPaso faltan={guia.faltan} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} />
        {conFrase && siguiente?.pendiente && (
          <p role="status" className="text-[12.5px] text-tinta/80">
            {siguiente.pendiente}
          </p>
        )}
      </div>
    );
  }
  return (
    <p role="status" className="pt-1 text-[12.5px] text-verde">
      {listo}
    </p>
  );
}
