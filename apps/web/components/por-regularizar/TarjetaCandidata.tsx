"use client";

import type { CSSProperties } from "react";
import { rotuloDeDiferencia, type Candidata } from "@/lib/por-regularizar-mesa";
import { MosaicoDePrenda, Veredicto, soles } from "./piezas";

/** Una prenda del catálogo entre las que se elige (ADR-0360): su dibujo (ícono de la categoría sobre su color), cuánto cuesta, cuántas hay
 *  libres en la tienda de la venta y en cuántos de los tres datos coincide. Pasar el mouse o elegirla muestra la diferencia de precio. */
export function TarjetaCandidata({
  candidata,
  sugerida,
  seleccionada,
  indice,
  sede,
  onElegir,
  onApuntar,
}: {
  candidata: Candidata;
  sugerida: boolean;
  seleccionada: boolean;
  indice: number;
  /** La tienda de la venta, corta («TRU»). */
  sede: string;
  onElegir: (id: string) => void;
  /** El mouse o el foco entran (id) o salen (null): el puente dibuja un hilo de ensayo hasta ella. */
  onApuntar: (id: string | null) => void;
}) {
  const { prenda: p, calce, disponible, diferencia } = candidata;
  const hay = disponible === null ? null : disponible > 0 ? `${disponible} en ${sede}` : "Sin unidades libres";
  return (
    <button
      type="button"
      className="vsr-ct"
      data-vsr-prenda={p.id}
      data-sin-unidades={disponible === 0 ? "" : undefined}
      aria-pressed={seleccionada}
      onClick={() => onElegir(p.id)}
      onMouseEnter={() => onApuntar(p.id)}
      onMouseLeave={() => onApuntar(null)}
      onFocus={() => onApuntar(p.id)}
      onBlur={() => onApuntar(null)}
      style={{ "--i": indice } as CSSProperties}
    >
      <span className="vsr-ct-foto">
        <MosaicoDePrenda prenda={p} />
        {sugerida && <span className="vsr-sug">Sugerida</span>}
        <span className="vsr-dif">{rotuloDeDiferencia(diferencia)}</span>
      </span>
      <b>{p.nombre}</b>
      <small>
        {[p.talla, p.color, p.codigo].filter(Boolean).join(" · ")}
      </small>
      <span className="vsr-ct-pr">
        <b>{soles(p.precio)}</b>
        {hay && <span>{hay}</span>}
      </span>
      <Veredicto calce={calce} />
    </button>
  );
}
