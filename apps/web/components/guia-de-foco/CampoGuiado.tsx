"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { useRetenerLuz, type ModoRetencion } from "./useRetenerLuz";
import { separarFaltan } from "@/lib/guia-campos";
import type { GuiaCampos } from "./useGuiaCampos";

// Las dos piezas de la guía de foco para un modal (CLAUDE.md «Guía de foco», ADR-0284). Sus estilos: `app/estilos/alta-guia.css`
// (`hilo-luz`). Lo único que hacen: encender el control que sigue —una caja de texto, un combo, chips, un interruptor, un grupo de
// tres cajas— y decir qué falta antes del botón. No conocen ningún control en particular: envuelven lo que les pongas.

/** A qué control de adentro se une el error de un campo guiado: el primero que espere el dato. */
const CONTROL_DEL_CAMPO = "input:not([type='hidden']):not([type='file']), textarea, select, [role='combobox'], [role='radiogroup'], button[aria-haspopup]";

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
  ayudaAbajo = false,
  retiene,
  className = "",
  children,
}: {
  id: string;
  guia: GuiaCampos;
  titulo?: ReactNode;
  ayuda?: ReactNode;
  /** La ayuda va en su propia línea, bajo el título (Felipe 2026-10-28), en vez de a su derecha. Por defecto no cambia nada para los demás modales. */
  ayudaAbajo?: boolean;
  /** `"fila"` para un campo de VARIAS opciones (chips que se marcan de a uno): la luz espera mientras se siga eligiendo aquí. Por defecto
   *  espera solo mientras se teclea en una caja de texto. */
  retiene?: ModoRetencion;
  className?: string;
  children: ReactNode;
}) {
  const estado = guia.estado(id);
  const retener = useRetenerLuz(id, guia, retiene);
  const error = guia.errorDe(id);
  const idError = useId();
  const caja = useRef<HTMLDivElement>(null);

  // El error queda unido al control, sea cual sea: el lector de pantalla lo lee al llegar a él.
  useEffect(() => {
    // Si la ayuda del campo ya decía lo mismo, no se dice dos veces: queda el error.
    caja.current?.querySelectorAll<HTMLElement>("[id$='-pie']").forEach((pie) => {
      pie.hidden = Boolean(error) && pie.textContent?.trim() === error;
    });
    const control = caja.current?.querySelector<HTMLElement>(CONTROL_DEL_CAMPO);
    if (!control) return;
    const previo = (control.getAttribute("aria-describedby") ?? "").split(" ").filter((x) => x && x !== idError);
    const unidos = error ? [...previo, idError] : previo;
    if (unidos.length) control.setAttribute("aria-describedby", unidos.join(" "));
    else control.removeAttribute("aria-describedby");
    if (error) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
  }, [error, idError]);

  return (
    <div
      {...retener}
      ref={caja}
      data-campo={id}
      data-estado={estado}
      data-error={error ? "" : undefined}
      className={`hilo-luz ${className}`}
      onInputCapture={() => guia.limpiarError(id)}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("button, [role='option'], [role='radio'], [role='switch']")) guia.limpiarError(id);
      }}
    >
      {titulo && (
        <>
          <p className={`${ayuda && ayudaAbajo ? "" : "mb-1.5 "}flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-tinta`}>
            {guia.etiqueta(id, titulo)}
            {ayuda && !ayudaAbajo && <span className="text-[12px] font-normal text-taupe">{ayuda}</span>}
          </p>
          {ayuda && ayudaAbajo && <p className="mb-1.5 mt-0.5 text-[12px] font-normal text-taupe">{ayuda}</p>}
        </>
      )}
      {children}
      {error && (
        <p id={idError} role="alert" className="hilo-error mt-1.5 text-xs leading-tight text-rojo">
          <span className="pie-error trazo-dibuja anim-revelar">
            <CircleAlert aria-hidden />
            <span>{error}</span>
          </span>
        </p>
      )}
    </div>
  );
}

/** «Falta: ● Nombre ○ Motivo» sobre el botón principal, cada cosa tocable (lleva a su campo); con todo listo, «Todo listo.».
 *  `conFrase`: además, escribe A LA VISTA qué hacer con el campo que sigue («El precio va con punto, por ejemplo 12.50.»). Sin esto la frase solo vive en el
 *  `title` de cada chip (pasar el mouse), que no se ve con el dedo ni con el teclado (ley 6 de Formidable). Por defecto no cambia nada para los demás modales. */
export function PieGuia({ guia, listo = "Todo listo.", conFrase = false, tope }: { guia: GuiaCampos; listo?: string; conFrase?: boolean; /** Cuántas cosas que faltan se listan a lo sumo; las demás se cuentan. */ tope?: number }) {
  if (guia.faltan.length > 0) {
    const siguiente = guia.faltan.find((c) => c.id === guia.ahora) ?? guia.faltan[0];
    return (
      <div className="space-y-1 pt-1">
        {guia.conGrado ? (
          <PieSeparado guia={guia} />
        ) : (
          <FaltanDelPaso faltan={guia.faltan} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} tope={tope} />
        )}
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

/** Con `conGrado`: «Faltan: …» (lo que bloquea) y, en otra línea, «Conviene: …» (lo que no). Quien solo tiene cosas que convienen no ve ningún «Falta». */
function PieSeparado({ guia }: { guia: GuiaCampos }) {
  const { obligatorios, convienen } = separarFaltan(guia.faltan);
  return (
    <>
      {obligatorios.length > 0 && <FaltanDelPaso faltan={obligatorios} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} />}
      {convienen.length > 0 && <FaltanDelPaso faltan={convienen} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} rotulo="Conviene" />}
    </>
  );
}
