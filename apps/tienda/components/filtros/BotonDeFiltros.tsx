"use client";

import { useFiltros } from "./ProveedorFiltros";

// El botón «Filtros» del celular (maqueta «Opción 1», ADR-0512 actividad 5): va en la barra, al pie de los grupos, con el número de lo elegido,
// y abre la hoja con COLOR y TALLA. En la computadora no se ve (ahí están las dos palabras con su panel): lo decide `filtros.css`.

const Ajustes = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3 7h10M19 7h2M3 17h2M11 17h10" />
    <circle cx="16" cy="7" r="2.5" />
    <circle cx="8" cy="17" r="2.5" />
  </svg>
);

export function BotonDeFiltros() {
  const f = useFiltros();
  if (!f) return null;
  const n = f.elegido.color.length + f.elegido.talla.length;
  return (
    <button
      ref={(el) => {
        f.registrar("filtros", el);
      }}
      type="button"
      className="fp-filtros-btn fp-etq"
      aria-haspopup="dialog"
      aria-expanded={f.hoja}
      aria-label={`Filtros${n ? `, ${n} ${n === 1 ? "elegido" : "elegidos"}` : ""}`}
      onClick={() => {
        f.cargar();
        f.abrirHoja(true);
      }}
    >
      <Ajustes />
      <span>Filtros</span>
      {n > 0 && <span className="fp-globo">{n}</span>}
    </button>
  );
}
