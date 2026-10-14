"use client";

import { Aviso } from "./Aviso";
import { Boton } from "./campos";
import { TEXTO_INCIERTO } from "@/lib/intento-reglas";

/**
 * Lo que muestra un formulario cuyo envío quedó en duda (`useIntento`, fase «incierto»): no se sabe si se guardó, los campos
 * están congelados y hay dos salidas: reenviar LO MISMO (si ya se guardó, la base no lo repite) o preguntarle a la base.
 * Va sobre los botones de la hoja, donde va el error de toda una hoja (`Aviso`, ADR-0358).
 */
export function AvisoIntentoIncierto({
  onRevisar,
  revisando,
  onReintentar,
  reintentando,
  className = "",
}: {
  onRevisar: () => void;
  revisando: boolean;
  /** Sin esto, reintentar es el botón principal de la hoja (que ya dice «Volver a intentar»). */
  onReintentar?: () => void;
  reintentando?: boolean;
  className?: string;
}) {
  return (
    <Aviso tono="atencion" titulo="No sabemos si se guardó" className={className}>
      <span className="block">{TEXTO_INCIERTO}</span>
      <span className="mt-2 flex flex-wrap gap-2">
        <Boton type="button" peso="fantasma" onClick={onRevisar} cargando={revisando} disabled={reintentando}>
          Revisar si se guardó
        </Boton>
        {onReintentar && (
          <Boton type="button" peso="primario" onClick={onReintentar} cargando={reintentando} disabled={revisando}>
            Volver a intentar
          </Boton>
        )}
      </span>
    </Aviso>
  );
}

/** Lo que se dice si, con un envío en duda, se intenta mandar OTRA cosa (`useIntento` responde «congelado»). */
export function avisarCongelado(avisar: { aviso: (texto: string, opciones?: { detalle?: string }) => unknown }) {
  avisar.aviso("Primero revisa si se guardó", {
    detalle: "Mientras no sepamos qué pasó con el envío anterior, no se manda otra cosa. Toca «Revisar si se guardó».",
  });
}
