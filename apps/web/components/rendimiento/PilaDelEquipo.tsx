"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { useDestinoFlotante } from "@/components/ui/useAnclaje";
import { carasQueCaben, type MedidaPersona } from "@/lib/rendimiento-vista-reglas";

/* ====================================================================
   Las caras de «El equipo» (Felipe 2026-11-17: «se está saliendo»; maqueta docs/maquetas/rendimiento-rango-2026-11/): la pila MIDE su caja. Caben las caras que
   caben, y las demás se cuentan en «+N», que abre la lista con nombre. Antes todas iban en una fila de ancho libre y, con 14 personas, las últimas caían fuera
   de la tarjeta. Tocar a alguien de la lista hace lo mismo que su cara: la mira solo a ella. Cuántas caben lo dice `carasQueCaben` (rendimiento-vista-reglas.ts).
   ==================================================================== */

export function PilaDelEquipo({
  medidas,
  colores,
  elegidas,
  conPersonas,
  tonoLectura,
  onPersona,
}: {
  medidas: readonly MedidaPersona[];
  colores: ReadonlyMap<string, string>;
  elegidas: readonly string[];
  conPersonas: boolean;
  tonoLectura: (lectura: NonNullable<MedidaPersona["lectura"]>) => string;
  onPersona: (personaId: string) => void;
}) {
  const caja = useRef<HTMLSpanElement>(null);
  const mas = useRef<HTMLButtonElement>(null);
  const [ancho, setAncho] = useState(0);
  const [abierta, setAbierta] = useState(false);

  // Se mide la TARJETA, no la propia caja: el valor de una tarjeta de cifra mide lo que miden sus caras, así que la caja siempre «cabría».
  useLayoutEffect(() => {
    const el = caja.current;
    const tarjeta = el?.closest<HTMLElement>("[data-conducta]") ?? el?.parentElement;
    if (!el || !tarjeta) return;
    const medir = () => {
      const e = getComputedStyle(tarjeta);
      setAncho(tarjeta.clientWidth - parseFloat(e.paddingLeft) - parseFloat(e.paddingRight));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(tarjeta);
    return () => ro.disconnect();
  }, []);

  const visibles = carasQueCaben(medidas.length, ancho);
  const ocultas = medidas.slice(visibles);
  // Si el ancho crece y ya no hay «+N», la lista no se queda abierta sobre nada.
  const lista = abierta && ocultas.length > 0;
  const hayElegidaOculta = ocultas.some((m) => elegidas.includes(m.personaId));

  const cara = (m: MedidaPersona) => (
    <button
      key={m.personaId}
      type="button"
      className="mesa-persona-boton"
      style={{ "--c": colores.get(m.personaId) } as CSSProperties}
      title={m.nombre}
      aria-label={`Ver a ${m.nombre}`}
      aria-pressed={elegidas.includes(m.personaId)}
      data-apagada={elegidas.length > 0 && !elegidas.includes(m.personaId) ? "" : undefined}
      data-persona={m.personaId}
      disabled={!conPersonas}
      onClick={() => onPersona(m.personaId)}
    >
      <AvatarPersona personaId={m.personaId} nombre={m.nombre} tamano={32} />
    </button>
  );

  return (
    <span ref={caja} className="mesa-pila">
      <span className="mesa-pila-caras">
        {medidas.slice(0, visibles).map(cara)}
      </span>
      {ocultas.length > 0 && (
        <button
          ref={mas}
          type="button"
          className="mesa-pila-mas tabular-nums"
          aria-haspopup="dialog"
          aria-expanded={lista}
          aria-pressed={hayElegidaOculta}
          aria-label={`Ver ${ocultas.length} ${ocultas.length === 1 ? "persona más" : "personas más"}`}
          disabled={!conPersonas}
          onClick={() => setAbierta((a) => !a)}
        >
          +{ocultas.length}
        </button>
      )}
      {lista && <ListaDeMas ocultas={ocultas} colores={colores} elegidas={elegidas} tonoLectura={tonoLectura} control={mas} onPersona={onPersona} onCerrar={() => setAbierta(false)} />}
    </span>
  );
}

/** Quienes no caben en la pila, con nombre. Flota bajo el «+N»; Escape y tocar afuera la cierran, y el foco vuelve al «+N». */
function ListaDeMas({
  ocultas,
  colores,
  elegidas,
  tonoLectura,
  control,
  onPersona,
  onCerrar,
}: {
  ocultas: readonly MedidaPersona[];
  colores: ReadonlyMap<string, string>;
  elegidas: readonly string[];
  tonoLectura: (lectura: NonNullable<MedidaPersona["lectura"]>) => string;
  control: RefObject<HTMLButtonElement | null>;
  onPersona: (personaId: string) => void;
  onCerrar: () => void;
}) {
  const destino = useDestinoFlotante(control, true);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function calcular() {
      const r = control.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = Math.min(284, window.innerWidth - 16);
      setPos({ top: r.bottom + 8, left: Math.min(Math.max(8, r.left - 20), window.innerWidth - ancho - 8) });
    }
    calcular();
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [control]);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCerrar();
      control.current?.focus({ preventScroll: true });
    }
    // En captura: la pantalla tiene su propio Escape (limpiar lo puesto) y no debe oírlo si el Escape era de esta hoja, tenga o no el foco adentro.
    document.addEventListener("keydown", alTeclear, true);
    return () => document.removeEventListener("keydown", alTeclear, true);
  }, [control, onCerrar]);

  const colocada = pos !== null;
  useEffect(() => {
    if (colocada) panel.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [colocada]);

  if (!pos || !destino) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[59]" onClick={onCerrar} aria-hidden />
      <div ref={panel} role="dialog" aria-label={`${ocultas.length} ${ocultas.length === 1 ? "persona más" : "personas más"}`} style={{ top: pos.top, left: pos.left }} className="mesa-pila-lista anim-revelar z-[60]">
        {ocultas.map((m) => (
          <button
            key={m.personaId}
            type="button"
            className="mesa-pila-fila"
            aria-pressed={elegidas.includes(m.personaId)}
            style={{ "--c": colores.get(m.personaId), "--tono": m.lectura ? tonoLectura(m.lectura) : undefined } as CSSProperties}
            onClick={() => onPersona(m.personaId)}
          >
            <span className="mesa-pila-cara">
              <AvatarPersona personaId={m.personaId} nombre={m.nombre} tamano={24} />
            </span>
            <span className="min-w-0 flex-1 truncate">{m.nombre}</span>
            {m.lectura && (
              <>
                <i aria-hidden className="mesa-pila-punto" />
                <span className="sr-only">{m.lectura}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </>,
    destino,
  );
}
