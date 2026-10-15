"use client";

import { useId, useRef, useState } from "react";
import {
  alternarTalla,
  lineasDelLook,
  precioDePieza,
  sinTallasPorAhora,
  tallasIniciales,
  textoAgregar,
  type LineaLook,
  type Look,
} from "@/lib/looks";
import { Icono } from "../Icono";
import { Foto } from "./Lamina";

/**
 * «Agregar el look a mi bolsa» (maqueta v4, `t-look-bolsa` y la hoja `look-tallas`; propuesta h): abre una hoja con cada prenda del look y
 * sus tallas; la que no hay se ve tachada y no se elige, y la prenda sin ninguna talla no se agrega. «Agregar N prendas a mi bolsa» le pasa
 * a `alAgregar` una línea por prenda elegida (la variante: modelo, color y talla).
 *
 * La bolsa es de la actividad 7: mientras no la conecten (`alAgregar` sin pasar), las tallas se eligen igual y el botón final queda apagado
 * con una línea que dice que llega pronto. Nada se guarda aquí.
 */
export function AgregarLook({
  look,
  origenFotos,
  alAgregar,
}: {
  look: Look;
  /** El origen del almacén público de fotos (`TIENDA_FOTOS_ORIGEN`): solo esas fotos pasan por el optimizador. */
  origenFotos: string | undefined;
  /** Lo conecta la integración con la bolsa (actividad 7). Sin él, el botón final queda apagado y dice que llega pronto. */
  alAgregar?: (lineas: LineaLook[]) => void | Promise<void>;
}) {
  const hoja = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [elegidas, setElegidas] = useState(() => tallasIniciales(look));
  const [enviando, setEnviando] = useState(false);
  const lineas = lineasDelLook(look, elegidas);

  const abrir = () => {
    setElegidas(tallasIniciales(look));
    hoja.current?.showModal();
  };
  const cerrar = () => hoja.current?.close();
  const agregar = async () => {
    if (!alAgregar || lineas.length === 0 || enviando) return;
    setEnviando(true);
    try {
      await alAgregar(lineas);
      cerrar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button className="t-btn t-btn-ancho" type="button" aria-haspopup="dialog" onClick={abrir}>
        <Icono nombre="bolsa" />
        Agregar el look a mi bolsa
      </button>
      {/* `<dialog>` con showModal: el navegador atrapa el foco, cierra con Escape y deja inerte lo de atrás. Tocar el velo también cierra. */}
      <dialog
        ref={hoja}
        className="t-look-hoja"
        aria-labelledby={idTitulo}
        onClick={(e) => {
          if (e.target === e.currentTarget) cerrar();
        }}
      >
        <div className="t-look-hoja-in">
          <div className="t-look-hoja-cab">
            <h2 id={idTitulo}>{look.nombre}</h2>
            <button type="button" className="t-look-cerrar" onClick={cerrar} aria-label="Cerrar">
              {/* El mismo trazo de «cerrar» de la maqueta. Cuando la cabecera (actividad 5) lo sume a `Icono`, se usa de ahí. */}
              <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <p className="t-look-hoja-texto">Elige la talla de cada prenda. La que no tiene talla disponible no se agrega.</p>
          <ul className="t-look-filas">
            {look.piezas.map((p) => {
              const precio = precioDePieza(p);
              const agotada = sinTallasPorAhora(p);
              return (
                <li key={p.posicion} className="t-look-fila">
                  <span className="t-look-tile">
                    <Foto pieza={p} origenFotos={origenFotos} />
                  </span>
                  <span className="t-look-fila-txt">
                    <b>{p.prenda.nombre}</b>
                    <small>
                      {p.color.nombre} · {precio.principal}
                    </small>
                    <span className="t-look-tallas" role="group" aria-label={`Talla de ${p.prenda.nombre}`}>
                      {p.tallas.map((t) => (
                        <button
                          key={t.varianteId}
                          type="button"
                          className="t-look-talla"
                          aria-pressed={elegidas[p.posicion] === t.varianteId}
                          disabled={!t.hay}
                          title={t.hay ? undefined : "No hay esta talla por ahora"}
                          onClick={() => setElegidas((e) => alternarTalla(e, look, p.posicion, t.varianteId))}
                        >
                          {t.talla}
                        </button>
                      ))}
                    </span>
                    {agotada && <small className="t-look-agotada">No hay tallas por ahora: esta prenda no se agrega.</small>}
                  </span>
                </li>
              );
            })}
          </ul>
          <button className="t-btn t-btn-ancho" type="button" disabled={!alAgregar || lineas.length === 0 || enviando} onClick={agregar}>
            <Icono nombre="bolsa" />
            {textoAgregar(lineas.length)}
          </button>
          {!alAgregar && (
            <p className="t-look-hoja-nota" role="note">
              Muy pronto podrás agregar el look a tu bolsa desde aquí.
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
