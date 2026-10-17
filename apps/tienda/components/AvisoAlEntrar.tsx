"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { entendiElAviso } from "@/app/acciones/inicio";
import { TEXTO_ENLACE_RESPUESTA, presentacionDelAviso, textoDeMas, type AvisoAlEntrar as Aviso } from "@/lib/inicio-aviso";
import { Icono } from "./Icono";

/**
 * El aviso al entrar (ADR-0408; Felipe, 2026-10-14): arriba del Inicio, lo que la persona tiene a su favor en el Club (su descuento de
 * cumpleaños, su vale, la talla que esperaba y ya llegó), con hasta cuándo y el camino a «Mi cuenta». Lo arma el servidor
 * (`lib/inicio-aviso.ts`); aquí solo se dibuja y se cierra. «Entendido» lo pliega en el momento y le pide al servidor que lo recuerde en
 * este aparato (una cookie por aviso): no vuelve a salir para esos mismos beneficios; uno nuevo, sí. Desde el 2026-10-17 también trae
 * «CAYLA te respondió» (la respuesta a una recomendación suya): la ceja y el enlace siguen lo que trae (`presentacionDelAviso`).
 */
export function AvisoAlEntrar({ aviso, activas }: { aviso: Aviso; activas: string[] }) {
  const id = useId();
  const [cerrado, setCerrado] = useState(false);
  const [, iniciar] = useTransition();
  const { ceja, enlace, enlaceEnCadaLinea } = presentacionDelAviso(aviso);

  function entendido() {
    setCerrado(true);
    iniciar(() => entendiElAviso(aviso.claves, activas));
  }

  return (
    // El pliegue: al cerrar, la fila de la grilla pasa de su alto a cero (sin rebote) y lo de abajo sube con ella.
    <div className="t-aviso-club-envol" data-cerrado={cerrado || undefined} inert={cerrado || undefined}>
      <div className="t-aviso-club-pliegue">
        <div className="t-ancho">
          <section className="t-aviso-club" aria-labelledby={id}>
            <div className="t-aviso-club-cuerpo">
              <span className="t-ceja" id={id}>
                {ceja}
              </span>
              <ul className="t-aviso-club-lista">
                {aviso.lineas.map((l) => (
                  <li key={l.clave}>
                    <span className="t-aviso-club-ic">
                      <Icono nombre={l.icono} />
                    </span>
                    <span>
                      <b>{l.titulo}</b>
                      <small>{l.texto}</small>
                      {enlaceEnCadaLinea && l.tipo === "respuesta" && l.href && (
                        <Link className="t-enlace" href={l.href}>
                          {TEXTO_ENLACE_RESPUESTA}
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {aviso.mas > 0 && <p className="t-aviso-club-mas">{textoDeMas(aviso.mas)}</p>}
            </div>
            <div className="t-aviso-club-acc">
              <Link className="t-enlace" href={enlace.href}>
                {enlace.texto} <Icono nombre="flecha" />
              </Link>
              <button type="button" className="t-btn t-btn-chico" onClick={entendido}>
                Entendido
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
