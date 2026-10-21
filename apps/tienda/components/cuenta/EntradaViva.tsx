"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { estadoDelPaso, PIE_DE_TARJETA, type PasoDeAcceso } from "@/lib/panel-entrada";
import { Icono } from "../Icono";
import { TarjetaClub } from "../TarjetaClub";

// Lo que el formulario le cuenta al panel de marca de al lado (`PanelDeEntrada.tsx`): en «Crear cuenta», el nombre para la tarjeta
// del Club apenas se sabe; en «Olvidé mi contraseña» y «Contraseña nueva», en qué paso va. Dos contextos: el formulario solo usa el de
// poner (que nunca cambia), así no se vuelve a dibujar cuando el panel cambia; el panel lee el otro.

type Lo = { nombre: string | null; paso: number | null };
type Poner = { ponerNombre: (nombre: string | null) => void; ponerPaso: (paso: number | null) => void };

const LoVivo = createContext<Lo>({ nombre: null, paso: null });
const PonerVivo = createContext<Poner | null>(null);

export function EntradaViva({ children }: { children: ReactNode }) {
  const [nombre, ponerNombre] = useState<string | null>(null);
  const [paso, ponerPaso] = useState<number | null>(null);
  const poner = useMemo(() => ({ ponerNombre, ponerPaso }), []);
  const lo = useMemo(() => ({ nombre, paso }), [nombre, paso]);
  return (
    <PonerVivo.Provider value={poner}>
      <LoVivo.Provider value={lo}>{children}</LoVivo.Provider>
    </PonerVivo.Provider>
  );
}

/** El formulario de «Crear cuenta» pone en la tarjeta del panel el nombre que ya sabe (null: «Tu nombre aquí»). Sin panel, nada. */
export function useNombreEnLaTarjeta(nombre: string | null) {
  const poner = useContext(PonerVivo)?.ponerNombre;
  useEffect(() => {
    poner?.(nombre);
  }, [poner, nombre]);
}

/** El formulario dice en qué paso va (desde 0); null deja el del panel. Sin panel, nada. */
export function usePasoDelPanel(paso: number | null) {
  const poner = useContext(PonerVivo)?.ponerPaso;
  useEffect(() => {
    poner?.(paso);
  }, [poner, paso]);
}

/**
 * La tarjeta del Club de «Crear cuenta», con el nombre de quien la crea apenas el formulario lo sabe. Al llegar el nombre, la tarjeta
 * vuelve a entrar (una vez) con su brillo: se ve que es suya. El nombre no se lee en voz alta: el formulario ya lo dice bajo el documento.
 */
export function TarjetaConTuNombre({ desde }: { desde: number }) {
  const { nombre } = useContext(LoVivo);
  return (
    <>
      <div className="en-tarjeta-viva" data-con-nombre={nombre ? "" : undefined} key={nombre ? "con" : "sin"}>
        <TarjetaClub nombre={nombre ?? "Tu nombre aquí"} desde={desde} />
      </div>
      <p className="en-tarjeta-pie">{nombre ? PIE_DE_TARJETA.con : PIE_DE_TARJETA.sin}</p>
    </>
  );
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
