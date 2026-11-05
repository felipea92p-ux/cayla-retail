"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { CifraQueRueda } from "@/components/finanzas/estados/CifraQueRueda";
import { altoDeColumna, anchoDeFila, type ParteEstado } from "@/lib/estados-partes";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";

// Lo que se explora de un estado (ADR-0611, Felipe 2026-11-05): al pasar el mouse por una parte, el resto se apaga para darle énfasis, y al tocarla su detalle completo se abre
// justo debajo. Vale igual para una parte de la barra, su tarjeta o un gráfico: todas se enteran por el mismo contexto.

type Foco = { sobre: string | null; elegida: string | null; pasar: (k: string | null) => void; elegir: (k: string | null) => void };
const Contexto = createContext<Foco | null>(null);

/** Lo que necesita una pieza para sumarse a la exploración: se apaga, se enciende y abre su detalle. */
export function useParte(clave: string, nombre: string) {
  const f = useContext(Contexto);
  const activa = f?.sobre ?? f?.elegida ?? null;
  return {
    "data-parte": clave,
    "data-encendida": activa === clave || undefined,
    "data-apagada": (activa !== null && activa !== clave) || undefined,
    "aria-expanded": f?.elegida === clave,
    "aria-label": `Ver el detalle de ${nombre}`,
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "touch") f?.pasar(clave);
    },
    onPointerLeave: () => f?.pasar(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.target.matches(":focus-visible")) f?.pasar(clave);
    },
    onBlur: () => f?.pasar(null),
    onClick: () => f?.elegir(f.elegida === clave ? null : clave),
  };
}

/** El lugar donde pasa la exploración: el gráfico de arriba y la barra de abajo se apagan juntos. */
export function MesaDePartes({ children, className }: { children: ReactNode; className?: string }) {
  const [sobre, setSobre] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const foco = useMemo<Foco>(() => ({ sobre, elegida, pasar: setSobre, elegir: setElegida }), [sobre, elegida]);

  // Escape cierra el detalle y devuelve el foco a su tarjeta, solo si la tecla nació aquí: con una hoja abierta encima, es de la hoja.
  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || !elegida || !e.currentTarget.contains(e.target as Node)) return;
    e.stopPropagation();
    const clave = elegida;
    setElegida(null);
    raiz.current?.querySelector<HTMLElement>(`.estados-parte[data-parte="${clave}"], [data-parte="${clave}"]`)?.focus({ preventScroll: true });
  }

  return (
    <Contexto.Provider value={foco}>
      <div ref={raiz} className={className} data-foco={sobre ? "mouse" : "elegido"} onKeyDown={alTeclear}>
        {children}
      </div>
    </Contexto.Provider>
  );
}

function Segmento({ parte, hueco }: { parte: ParteEstado; hueco?: boolean }) {
  const p = useParte(parte.clave, parte.nombre);
  return (
    <button type="button" className="estados-seg" data-hueco={hueco || undefined} style={{ "--c": parte.color, flexGrow: parte.enBarra } as CSSProperties} {...p}>
      <span className="estados-seg-globo" aria-hidden>
        <b className="tabular-nums">{parte.texto}</b>
        <span>{parte.sub ? `${parte.nombre} · ${parte.sub}` : parte.nombre}</span>
      </span>
    </button>
  );
}

/** La barra: cada parte, del ancho de lo que pesa. */
export function TuboDePartes({ partes, huecos = [], etiqueta }: { partes: readonly ParteEstado[]; huecos?: readonly string[]; etiqueta: string }) {
  const visibles = partes.filter((x) => x.enBarra > 0);
  if (!visibles.length) return null;
  return (
    <div className="estados-tubo" role="group" aria-label={etiqueta}>
      {visibles.map((x) => (
        <Segmento key={x.clave} parte={x} hueco={huecos.includes(x.clave)} />
      ))}
    </div>
  );
}

function Tarjeta({ parte }: { parte: ParteEstado }) {
  const p = useParte(parte.clave, parte.nombre);
  return (
    <button type="button" className="estados-parte" style={{ "--c": parte.color } as CSSProperties} {...p}>
      <i aria-hidden />
      <span>{parte.nombre}</span>
      <b className="tabular-nums" data-tono={parte.tono}>
        {parte.texto}
      </b>
      {parte.sub && <small className="tabular-nums">{parte.sub}</small>}
    </button>
  );
}

/** Una tarjeta por parte, con su cifra. */
export function TarjetasDePartes({ partes, columnas }: { partes: readonly ParteEstado[]; columnas?: number }) {
  return (
    <div className="estados-partes" style={{ "--n": columnas ?? partes.length } as CSSProperties}>
      {partes.map((x) => (
        <Tarjeta key={x.clave} parte={x} />
      ))}
    </div>
  );
}

const TONO_CHIP = { bien: "verde", mal: "rojo" } as const;

/** El detalle de la parte elegida, justo debajo, con su piquito apuntando a ella. */
export function DetalleDeParte({ partes, tituloColumnas }: { partes: readonly ParteEstado[]; tituloColumnas: string }) {
  const f = useContext(Contexto);
  const parte = partes.find((x) => x.clave === f?.elegida) ?? null;
  const caja = useRef<HTMLDivElement>(null);
  const [pico, setPico] = useState(40);
  const clave = parte?.clave ?? null;

  // El piquito va bajo la tarjeta elegida. Al abrir, si el detalle no se ve, se trae a la vista.
  useLayoutEffect(() => {
    if (!clave || !caja.current) return;
    const destino = caja.current.closest("[data-foco]")?.querySelector<HTMLElement>(`.estados-parte[data-parte="${clave}"]`) ?? caja.current.closest("[data-foco]")?.querySelector<HTMLElement>(`[data-parte="${clave}"]`);
    if (destino) {
      const d = destino.getBoundingClientRect();
      const c = caja.current.getBoundingClientRect();
      setPico(Math.max(26, Math.min(c.width - 26, d.left + d.width / 2 - c.left)));
    }
  }, [clave]);
  const yaAbierta = useRef(false);
  useLayoutEffect(() => {
    const abierta = clave !== null;
    if (abierta && !yaAbierta.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const el = caja.current;
      window.setTimeout(() => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 260);
    }
    yaAbierta.current = abierta;
  }, [clave]);

  const conFilas = (parte?.filas ?? []).filter((x) => x.valor !== 0);
  return (
    <div className="estados-det" data-abierto={parte ? "" : undefined} inert={!parte || undefined}>
      <div>
        <div ref={caja} className="estados-det-vidrio" role="region" aria-live="polite" aria-label={parte ? `Detalle de ${parte.nombre}` : undefined} style={{ "--c": parte?.color ?? "transparent" } as CSSProperties}>
          <i className="estados-det-pico" aria-hidden style={{ left: pico }} />
          {parte && (
            <>
              <button type="button" className="estados-det-cerrar" aria-label="Cerrar el detalle" onClick={() => f?.elegir(null)}>
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0">
                <p className="estados-det-nombre">
                  <i aria-hidden />
                  {parte.nombre}
                </p>
                <CifraQueRueda key={parte.clave} valor={parte.cifra} mal={parte.tono === "mal"} conSigno={parte.conSignos && parte.cifra > 0} className="estados-det-cifra" />
                <p className="estados-det-que">{parte.que}</p>
                {parte.chip && (
                  <div className="mt-2.5">
                    <Chip tono={parte.chip.tono ? TONO_CHIP[parte.chip.tono] : "pizarra"} versalitas={false}>
                      {parte.chip.texto}
                    </Chip>
                  </div>
                )}
              </div>
              <div className="estados-det-filas" key={parte.clave}>
                {conFilas.map((x, i) => (
                  <div key={x.nombre} className="estados-det-fila" style={{ "--i": i, "--f": x.valor < 0 ? "var(--color-rojo)" : parte.conSignos ? "var(--color-verde)" : parte.color } as CSSProperties}>
                    <span>{x.nombre}</span>
                    <b className="tabular-nums" data-tono={parte.conSignos ? (x.valor < 0 ? "mal" : "bien") : undefined}>
                      {parte.conSignos ? solesConSigno(x.valor) : soles(x.valor)}
                    </b>
                    <u aria-hidden>
                      <i style={{ width: `${anchoDeFila(x.valor, conFilas)}%` }} />
                    </u>
                  </div>
                ))}
                {!conFilas.length && <p className="estados-det-sin-filas">{parte.cifra === 0 ? "Sin movimientos en estas fechas." : "No tiene más partes."}</p>}
                {parte.aviso && <p className="estados-det-aviso">{parte.aviso}</p>}
              </div>
              {parte.columnas.length > 1 && (
                <div className="estados-det-columnas">
                  <span>{tituloColumnas}</span>
                  <div style={{ "--cols": parte.columnas.length } as CSSProperties}>
                    {parte.columnas.map((c) => (
                      <div key={c.etiqueta} data-actual={c.actual || undefined} style={{ "--h": `${altoDeColumna(c.valor, parte.columnas)}px`, "--f": c.valor < 0 ? "var(--color-rojo)" : parte.color } as CSSProperties}>
                        <em className="tabular-nums">{`${c.valor < 0 ? "−" : ""}${Math.abs(Math.round(c.valor)).toLocaleString("en-US")}`}</em>
                        <p aria-hidden />
                        <small>{c.etiqueta}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
