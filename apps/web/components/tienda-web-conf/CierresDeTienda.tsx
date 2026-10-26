"use client";

import { Plus, X } from "lucide-react";
import { etiquetaDeCierre, type MomentoEnLima } from "@cayla-retail/shared/horario-de-tienda";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { avisar } from "@/components/ui/Avisos";
import { conCierre, objecionAlCierre, sinCierre } from "@/lib/horario-edicion-reglas";

/**
 * Los días en que la tienda no abre aunque su horario diga que sí (feriado, inventario), de hoy en adelante (Tienda web ▸ Conf. Tienda, maqueta
 * de 2026-10-26). Cada cierre es una pastilla con su día y su ✕; «Cerrar hoy» es un toque y «Otra fecha» abre el calendario del sistema, que marca
 * los días ya cerrados. Es un campo CONTROLADO: no guarda nada. La web dice «Cerrada hoy» y salta esos días al decir cuándo vuelve a abrir.
 */
export function CierresDeTienda({
  valor,
  onCambio,
  ahora,
  deshabilitado = false,
}: {
  /** Las fechas «AAAA-MM-DD», en orden. */
  valor: readonly string[];
  onCambio: (fechas: string[]) => void;
  /** La hora de Lima; sin ella (el servidor, el primer instante) no se sabe qué día es «hoy» y no se puede agregar. */
  ahora: MomentoEnLima | null;
  deshabilitado?: boolean;
}) {
  const hoy = ahora?.fecha ?? null;
  const agregar = (fecha: string) => {
    if (!hoy || !fecha) return;
    const objecion = objecionAlCierre(valor, fecha, hoy);
    if (objecion) return avisar.error(objecion);
    onCambio(conCierre(valor, fecha, hoy));
  };

  return (
    <div className="twc-cierres">
      {valor.map((fecha) => (
        <span key={fecha} className="twc-cierre" data-hoy={fecha === hoy ? "" : undefined}>
          {hoy ? etiquetaDeCierre(fecha, hoy) : fecha}
          <button type="button" aria-label={`Quitar el cierre del ${hoy ? etiquetaDeCierre(fecha, hoy) : fecha}`} disabled={deshabilitado} onClick={() => onCambio(sinCierre(valor, fecha))}>
            <X aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="btn-cayla btn-sutil btn-chico"
        disabled={deshabilitado || !hoy || (hoy !== null && valor.includes(hoy))}
        onClick={() => hoy && agregar(hoy)}
      >
        <Plus aria-hidden className="h-3.5 w-3.5" /> Cerrar hoy
      </button>
      <div className="twc-cierres-fecha">
        <CampoFecha caja etiqueta="Cerrar otra fecha" valor="" onValor={agregar} disabled={deshabilitado || !hoy} diasMarcados={valor} descripcionMarcado="ya cerrado" />
      </div>
    </div>
  );
}
