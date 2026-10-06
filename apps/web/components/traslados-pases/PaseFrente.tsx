"use client";

import type { ReactNode } from "react";
import { TrasladoMiniaturas } from "@/components/TrasladoMiniaturas";
import { LetrasQueGiran } from "@/components/traslados-pases/LetrasQueGiran";
import { LineaViaje } from "@/components/traslados-pases/LineaViaje";
import { SelloPase, glifoDeTono } from "@/components/traslados-pases/SelloPase";
import type { VistaPase } from "@/lib/traslados-pases-reglas";

/** El sello de goma que cae sobre el pase (RECIBIDA, CON NOTA, ANULADA…). `cae`: recién puesto, con su animación. */
export type SelloPuesto = { texto: string; tono: VistaPase["tono"]; fecha: string; cae?: boolean };

// El frente del pase (ADR-0354): de qué sede a cuál en grande, el camión, tres datos, quién envía y UN botón (`accion`).
/** Bajo el código, el nombre entero de la sede; si el código ya ES el nombre (el Taller), no se repite. Un espacio duro
 *  conserva el alto de la línea para que los dos lados queden alineados. */
function subtituloDeSede(nombre: string, codigo: string, soy: boolean): string {
  const repetido = nombre.trim().toLowerCase() === codigo.trim().toLowerCase();
  if (repetido) return soy ? "tú" : "\u00a0";
  return soy ? `${nombre} · tú` : nombre;
}

export function PaseFrente({ vista, accion, sello }: { vista: VistaPase; accion: ReactNode; sello?: SelloPuesto | null }) {
  const estampa = sello === undefined ? vista.sello : sello;
  return (
    <article className="tp-pase" data-tp-tono={vista.tono} aria-label={`Caja Nº ${vista.numero}: ${vista.nombre}`}>
      <header className="tp-banda">
        <SelloPase glifo={glifoDeTono(vista.tono)} tono={vista.tono} />
        <span className="tp-banda-nombre">{vista.nombre}</span>
        <span className="tp-banda-num">Caja Nº {vista.numero}</span>
      </header>
      <div className="tp-ruta">
        <div>
          <b className="tp-cod" data-largo={vista.codigoOrigen.length > 3 ? "" : undefined}>
            <LetrasQueGiran texto={vista.codigoOrigen} />
          </b>
          <span className="tp-sede">{subtituloDeSede(vista.sedeOrigen, vista.codigoOrigen, vista.soyOrigen)}</span>
        </div>
        <LineaViaje progreso={vista.progreso} conCamion={vista.conCamion} tarde={vista.tarde} />
        <div className="tp-der">
          <b className="tp-cod" data-largo={vista.codigoDestino.length > 3 ? "" : undefined}>
            <LetrasQueGiran texto={vista.codigoDestino} demora={140} />
          </b>
          <span className="tp-sede">{subtituloDeSede(vista.sedeDestino, vista.codigoDestino, vista.soyDestino)}</span>
        </div>
      </div>
      <dl className="tp-campos">
        {vista.campos.map((c) => (
          <div key={c.etiqueta} data-tarde={c.tarde ? "" : undefined}>
            <dt>
              <small>{c.etiqueta}</small>
            </dt>
            <dd>
              <b>{c.valor}</b>
              {c.detalle && <em>{c.detalle}</em>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="tp-perfo" aria-hidden>
        <i />
        <i />
      </div>
      <div className="tp-pie">
        <div>
          <TrasladoMiniaturas fotos={vista.fotos} colores={vista.colores} />
          {vista.enviaNombre && (
            <div className="tp-envia">
              <i aria-hidden>{vista.enviaNombre.charAt(0)}</i>Envía {vista.enviaNombre}
            </div>
          )}
        </div>
      </div>
      {accion}
      {estampa && (
        <div className="tp-estampa" data-tp-tono={estampa.tono} data-cae={"cae" in estampa && estampa.cae ? "" : undefined} role="img" aria-label={`Sello: ${estampa.texto}`}>
          {estampa.texto}
          {estampa.fecha && <small>{estampa.fecha}</small>}
        </div>
      )}
    </article>
  );
}
