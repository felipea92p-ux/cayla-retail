"use client";

import { useEffect, useRef } from "react";
import { Boton } from "@/components/ui/campos";
import { fraseCostosAtipicos, type CostoAtipico } from "@/lib/costo-atipico-reglas";
import { Aviso } from "@/components/ui/Aviso";

// El aviso en línea del «costo atípico» (Felipe, 2026-09-30): la base rechazó un costo fuera de lo normal y el LÍDER decide
// entre corregir lo que tecleó o confirmarlo. Es la misma pieza para Producción, la recepción de un lote, la factura y los
// ítems fuera de factura de un envío: cada pantalla trae su pie (qué revisar) y sus dos textos de botón, y decide qué
// hace «corregir» (dónde deja el foco) y «confirmar» (reenviar con la confirmación). La regla vive en la base; esto solo
// la muestra. Tokens de la paleta y movimiento del sistema (`anim-revelar`, ADR-0136): sin rebote ni bucle, y sin rojo,
// porque aquí nada es un error: es un aviso para decidir.
export function AvisoCostoAtipico({
  costos,
  pie,
  textoCorregir,
  textoConfirmar,
  textoCargando = "Registrando…",
  cargando,
  listo,
  motivoNoListo,
  onCorregir,
  onConfirmar,
}: {
  costos: CostoAtipico[];
  /** Qué revisar y qué pasa si lo confirma, en palabras de esa pantalla. */
  pie: string;
  textoCorregir: string;
  textoConfirmar: string;
  /** Lo que dice el botón de confirmar mientras la base responde («Cerrando…», «Registrando…»). */
  textoCargando?: string;
  cargando: boolean;
  /** Hay un responsable vigente (el mismo candado que el botón principal de la pantalla). */
  listo: boolean;
  motivoNoListo?: string | null;
  onCorregir: () => void;
  onConfirmar: () => void;
}) {
  const aviso = useRef<HTMLDivElement>(null);
  // Nace fuera de pantalla a veces (formularios largos): solo se mueve la página si no se ve.
  useEffect(() => {
    aviso.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const { titulo, detalles } = fraseCostosAtipicos(costos);
  return (
    <Aviso ref={aviso} tono="atencion" titulo={titulo} className="mt-4">
      {detalles.length === 1 ? (
        <p>{detalles[0]}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5">
          {detalles.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs">{pie}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Boton type="button" peso="fantasma" disabled={cargando} className="sm:flex-1" onClick={onCorregir}>
          {textoCorregir}
        </Boton>
        <Boton type="button" peso="primario" cargando={cargando} disabled={!listo} title={motivoNoListo ?? undefined} className="sm:flex-1" onClick={onConfirmar}>
          {cargando ? textoCargando : textoConfirmar}
        </Boton>
      </div>
    </Aviso>
  );
}
