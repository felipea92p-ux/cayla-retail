"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { estadoDelPaso, type PasoDeAcceso } from "@/lib/panel-entrada";
import { Icono } from "../Icono";

// Lo que el formulario le cuenta al lado de la pantalla (`PantallaDeCuenta.tsx`): en «Olvidé mi contraseña», «Contraseña nueva» y
// «Restablecer mi acceso», en qué paso va (la tarjeta del Club con el nombre de «Crear cuenta» se fue con la foto, 2026-11-26). Dos
// contextos: el formulario solo usa el de poner (que nunca cambia), así no se vuelve a dibujar cuando el lado cambia; el lado lee el otro.

type Lo = { paso: number | null };
type Poner = { ponerPaso: (paso: number | null) => void };

const LoVivo = createContext<Lo>({ paso: null });
const PonerVivo = createContext<Poner | null>(null);

export function EntradaViva({ children }: { children: ReactNode }) {
  const [paso, ponerPaso] = useState<number | null>(null);
  const poner = useMemo(() => ({ ponerPaso }), []);
  const lo = useMemo(() => ({ paso }), [paso]);
  return (
    <PonerVivo.Provider value={poner}>
      <LoVivo.Provider value={lo}>{children}</LoVivo.Provider>
    </PonerVivo.Provider>
  );
}

/** El formulario dice en qué paso va (desde 0); null deja el del panel. Sin panel, nada. */
export function usePasoDelPanel(paso: number | null) {
  const poner = useContext(PonerVivo)?.ponerPaso;
  useEffect(() => {
    poner?.(paso);
  }, [poner, paso]);
}

/** Los pasos para volver a entrar, con el que toca encendido: el de la página o, si el formulario avanzó, el que dice el formulario. */
export function PasosDeAcceso({ pasos, inicial }: { pasos: readonly PasoDeAcceso[]; inicial: number }) {
  const { paso } = useContext(LoVivo);
  const actual = paso ?? inicial;
  return (
    <ol className="en-pasos">
      {pasos.map((p, i) => {
        const estado = estadoDelPaso(i, actual);
        return (
          <li key={p.titulo} className="en-paso" data-estado={estado} aria-current={estado === "ahora" ? "step" : undefined}>
            <span className="en-paso-n" aria-hidden="true">
              {estado === "hecho" ? <Icono nombre="check" /> : i + 1}
            </span>
            <span className="en-paso-t">
              <b>
                {p.titulo}
                {estado === "ahora" && <span className="en-paso-aqui">Estás aquí</span>}
              </b>
              <small>{p.texto}</small>
              {estado === "hecho" && <span className="t-sr"> (listo)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
