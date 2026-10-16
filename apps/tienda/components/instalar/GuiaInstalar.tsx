"use client";

import { ayudaDeLaGuia, pasosDeLaGuia, tituloDeLaGuia, type TipoDeGuia } from "@/lib/instalar";
import { Icono } from "../Icono";
import { HojaNativa } from "./HojaNativa";

/**
 * La guía de tres toques (plantilla D): el iPhone no deja instalar con un botón, y Android sin el aviso del navegador tampoco, así que
 * se enseña el camino con los botones dibujados como los del navegador. Cerrarla de cualquier modo cuenta como «Ahora no» (quien la
 * leyó no necesita que se le ofrezca otra vez al entrar; la fila de «Mi perfil» sigue ahí).
 */
export function GuiaInstalar({ tipo, alCerrar }: { tipo: TipoDeGuia; alCerrar: () => void }) {
  const ayuda = ayudaDeLaGuia(tipo);
  return (
    <HojaNativa etiqueta={tituloDeLaGuia(tipo)} alCerrar={alCerrar}>
      <h2 className="t-inst-tit">
        {tipo === "ios" ? (
          <>
            Añade CAYLA a tu <em>iPhone</em>
          </>
        ) : (
          <>
            Añade CAYLA a tu <em>celular</em>
          </>
        )}
      </h2>
      <ol className="t-inst-pasos">
        {pasosDeLaGuia(tipo).map((p, i) => (
          <li key={i}>
            <span>
              {p.partes.map((x, j) => (typeof x === "string" ? x : <b key={j}>{x.b}</b>))}
              {p.icono && (
                <span className="t-inst-mini">
                  <Icono nombre={p.icono} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {ayuda && <p className="t-inst-ayuda">{ayuda}</p>}
      <div className="t-inst-acc">
        <button type="button" className="t-btn t-btn-ancho" onClick={alCerrar}>
          Entendido
        </button>
      </div>
    </HojaNativa>
  );
}
