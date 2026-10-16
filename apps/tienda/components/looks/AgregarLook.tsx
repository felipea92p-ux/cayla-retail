"use client";

import { useId, useRef, useState } from "react";
import {
  alternarTalla,
  faltaTalla,
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
 * sus tallas; la que no hay se ve tachada y no se elige, y la prenda sin ninguna talla no se agrega. La prenda que espera su talla lo dice
 * («Elige tu talla») y el botón dice cuántas van de cuántas («Agregar 2 de 3 prendas a mi bolsa»): quien pidió el look entero no se lleva
 * uno sin una prenda sin darse cuenta. El botón le pasa a `alAgregar` una línea por prenda elegida (la variante: modelo, color y talla). Si `alAgregar` dice por qué no se pudo, la hoja sigue
 * abierta y lo dice sobre el botón (para elegir otra talla); si no, se cierra. Nada se guarda aquí: lo guarda la bolsa.
 */
export function AgregarLook({
  look,
  origenFotos,
  alAgregar,
}: {
  look: Look;
  /** El origen del almacén público de fotos (`TIENDA_FOTOS_ORIGEN`): solo esas fotos pasan por el optimizador. */
  origenFotos: string | undefined;
  /** Agrega las líneas a la bolsa (`AgregarLookALaBolsa`). Devuelve null si salió bien (la hoja se cierra) o el porqué en una o dos
   *  frases (la hoja sigue abierta y lo muestra). */
  alAgregar: (lineas: LineaLook[]) => Promise<string | null>;
}) {
  const hoja = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idMotivo = useId();
  const [elegidas, setElegidas] = useState(() => tallasIniciales(look));
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const lineas = lineasDelLook(look, elegidas);
  const esperan = new Set(faltaTalla(look, elegidas).map((p) => p.posicion));

  const abrir = () => {
    setElegidas(tallasIniciales(look));
    setMotivo(null);
    hoja.current?.showModal();
  };
  const cerrar = () => hoja.current?.close();
  const agregar = async () => {
    if (lineas.length === 0 || enviando) return;
    setEnviando(true);
    setMotivo(null);
    try {
      const porque = await alAgregar(lineas);
      if (porque) setMotivo(porque);
      else cerrar();
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
              <Icono nombre="cerrar" />
            </button>
          </div>
          <p className="t-look-hoja-texto">Elige la talla de cada prenda. La que no tiene talla disponible no se agrega.</p>
          <ul className="t-look-filas">
            {look.piezas.map((p) => {
              const precio = precioDePieza(p);
              const agotada = sinTallasPorAhora(p);
              const talla = p.tallas.find((t) => t.hay && t.varianteId === elegidas[p.posicion]);
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
                          onClick={() => {
                            setMotivo(null);
                            setElegidas((e) => alternarTalla(e, look, p.posicion, t.varianteId));
                          }}
                        >
                          {t.talla}
                        </button>
                      ))}
                    </span>
                    {/* Cómo va cada prenda, siempre en la misma línea (elegir una talla no mueve las filas de abajo). */}
                    {agotada ? (
                      <small className="t-look-agotada">No hay tallas por ahora: esta prenda no se agrega.</small>
                    ) : talla ? (
                      <small className="t-look-estado lista">
                        <Icono nombre="check" />
                        Talla {talla.talla}
                      </small>
                    ) : esperan.has(p.posicion) ? (
                      <small className="t-look-estado">Elige tu talla</small>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {motivo && (
            <p className="t-look-hoja-motivo" id={idMotivo} role="alert">
              {motivo}
            </p>
          )}
          <button
            className="t-btn t-btn-ancho"
            type="button"
            disabled={lineas.length === 0 || enviando}
            aria-busy={enviando}
            aria-describedby={motivo ? idMotivo : undefined}
            onClick={agregar}
          >
            <Icono nombre="bolsa" />
            {enviando ? "Agregando…" : textoAgregar(lineas.length, look.piezas.length)}
          </button>
        </div>
      </dialog>
    </>
  );
}
