"use client";

import { useEffect, useRef, useState } from "react";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { MOTIVO_COSTO_MAX, fraseCostosAtipicos, problemaDelMotivoDeCosto, type CostoAtipico } from "@/lib/costo-atipico-reglas";
import { Aviso } from "@/components/ui/Aviso";

// El aviso en línea del «costo atípico» (Felipe, 2026-09-30): la base rechazó un costo fuera de lo normal y el LÍDER decide
// entre corregir lo que tecleó o confirmarlo. Es la misma pieza para Producción, la recepción de un lote, la factura y los
// ítems fuera de factura de un envío: cada pantalla trae su pie (qué revisar) y sus dos textos de botón, y decide qué
// hace «corregir» (dónde deja el foco) y «confirmar» (reenviar con la confirmación). La regla vive en la base; esto solo
// la muestra. Tokens de la paleta y movimiento del sistema (`anim-revelar`, ADR-0136): sin rebote ni bucle, y sin rojo,
// porque aquí nada es un error: es un aviso para decidir.
//
// `conMotivo` (P19 del «Análisis del Taller», Felipe 2026-11-02; solo Producción por ahora): confirmar pide escribir POR QUÉ el costo es correcto (5 a 300 letras: lo mismo que exige
// la base) y `onConfirmar` recibe ese motivo. La nota de la orden guarda el motivo con el nombre de quien confirmó y la hora. Con un costo «sin costo», lo primero que se ofrece es
// corregir (declarar la tela): confirmar un cero queda como la salida de excepción, no como el camino.
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
  conMotivo = false,
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
  /** Con `conMotivo` recibe lo que la persona escribió; sin él, nada. */
  onConfirmar: (motivo: string) => void;
  /** Pide el motivo antes de poder confirmar (solo Producción: P19). */
  conMotivo?: boolean;
}) {
  const aviso = useRef<HTMLDivElement>(null);
  const [motivo, setMotivo] = useState("");
  const [toco, setToco] = useState(false);
  const problemaMotivo = conMotivo ? problemaDelMotivoDeCosto(motivo) : null;
  const sinCosto = conMotivo && costos[0]?.motivo === "sin_costo";
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
      {conMotivo && (
        <div className="mt-3">
          <CampoTexto
            etiqueta="Por qué es correcto este costo · obligatorio"
            value={motivo}
            maxLength={MOTIVO_COSTO_MAX}
            onChange={(e) => setMotivo(e.target.value)}
            onBlur={() => setToco(true)}
            disabled={cargando}
            autoComplete="off"
            tono={toco && problemaMotivo ? "aviso" : "neutro"}
            pie={toco && problemaMotivo ? problemaMotivo : "Queda en la nota de la orden con tu nombre y la hora."}
          />
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Boton type="button" peso={sinCosto ? "primario" : "fantasma"} disabled={cargando} className="sm:flex-1" onClick={onCorregir}>
          {textoCorregir}
        </Boton>
        <Boton
          type="button"
          peso={sinCosto ? "fantasma" : "primario"}
          cargando={cargando}
          textoCargando={textoCargando}
          disabled={!listo || problemaMotivo !== null}
          title={problemaMotivo ?? motivoNoListo ?? undefined}
          className="sm:flex-1"
          onClick={() => onConfirmar(motivo.trim())}
        >
          {textoConfirmar}
        </Boton>
      </div>
    </Aviso>
  );
}
