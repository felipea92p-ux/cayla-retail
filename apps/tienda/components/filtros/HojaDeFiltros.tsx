"use client";

import { useEffect, useId, useRef } from "react";
import { HojaNativa } from "@/components/instalar/HojaNativa";
import { useFiltros } from "./ProveedorFiltros";
import { prendasTexto, ZonaDeFiltro } from "./ZonaDeFiltro";

// La hoja «Filtros» del celular (maqueta «Opción 1 · Filtros que se abren», ADR-0512 actividad 5): sube desde abajo con COLOR y TALLA, se
// cuenta en vivo (no hay «Aplicar»: la lista de atrás se actualiza sola) y «Ver N prendas» la cierra. Es la misma hoja nativa de la tienda
// (`HojaNativa`, un <dialog>: velo, fondo quieto, foco atrapado, Escape), con el asa que se arrastra hacia abajo para cerrarla.

const Equis = () => (
  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="m3 3 12 12M15 3 3 15" />
  </svg>
);

export function HojaDeFiltros() {
  const f = useFiltros();
  const uid = useId().replace(/:/g, "");
  const abierta = f?.hoja ?? false;
  const abrirHoja = f?.abrirHoja;
  const enfocar = f?.enfocar;
  const estabaAbierta = useRef(false);
  // Al cerrarse (de cualquier modo: la ×, «Ver N prendas», el velo, arrastrarla, Escape) el foco vuelve al botón «Filtros».
  useEffect(() => {
    if (estabaAbierta.current && !abierta) enfocar?.("filtros");
    estabaAbierta.current = abierta;
  }, [abierta, enfocar]);
  // Si la ventana se ensancha hasta que le toca el panel de la computadora, la hoja se cierra sola.
  useEffect(() => {
    if (!abierta || !abrirHoja) return;
    const ancha = window.matchMedia("(min-width: 700px)");
    const alCambiar = () => {
      if (ancha.matches) abrirHoja(false);
    };
    ancha.addEventListener("change", alCambiar);
    return () => ancha.removeEventListener("change", alCambiar);
  }, [abierta, abrirHoja]);
  if (!f || !abierta) return null;

  const [nC, nT] = [f.elegido.color.length, f.elegido.talla.length];
  const verTalla = f.vivo ? f.vivo.opciones.tallaRelevante || nT > 0 : nT > 0;
  const total = f.vivo?.conteos.total ?? 0;
  const cerrar = () => f.abrirHoja(false);

  return (
    <HojaNativa etiqueta="Filtros" alCerrar={cerrar} arrastrable claseHoja="fp-hoja">
      <header className="fp-h-cab">
        <h2>Filtros</h2>
        <button type="button" className="fp-x" aria-label="Cerrar los filtros" onClick={cerrar}>
          <Equis />
        </button>
      </header>
      <div className="fp-h-cuerpo">
        <section className="fp-sec" aria-labelledby={`fp-h-color-${uid}`}>
          <h3 className="fp-sec-t fp-etq" id={`fp-h-color-${uid}`}>
            <span>Color</span>
            {nC > 0 && <span className="fp-globo">{nC}</span>}
          </h3>
          <ZonaDeFiltro faceta="color" />
        </section>
        {verTalla && (
          <section className="fp-sec" aria-labelledby={`fp-h-talla-${uid}`}>
            <h3 className="fp-sec-t fp-etq" id={`fp-h-talla-${uid}`}>
              <span>Talla</span>
              {nT > 0 && <span className="fp-globo">{nT}</span>}
            </h3>
            <ZonaDeFiltro faceta="talla" />
          </section>
        )}
      </div>
      <footer className="fp-h-pie">
        <button
          type="button"
          className="fp-limpiar"
          hidden={nC + nT === 0}
          onClick={(e) => {
            f.quitar();
            // El botón se oculta: el foco pasa a «Ver N prendas», que es adonde la persona seguiría.
            const ver = e.currentTarget.parentElement?.querySelector<HTMLElement>(".fp-ver");
            requestAnimationFrame(() => ver?.focus({ preventScroll: true }));
          }}
        >
          Limpiar
        </button>
        <button type="button" className="fp-ver fp-etq" onClick={cerrar}>
          Ver {prendasTexto(total)}
        </button>
      </footer>
      <p className="t-sr" role="status" aria-live="polite">
        {prendasTexto(total)}.
      </p>
    </HojaNativa>
  );
}
