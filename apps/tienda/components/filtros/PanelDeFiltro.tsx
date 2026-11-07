"use client";

import type { Ref } from "react";
import type { Faceta } from "@/lib/filtros-color-talla";
import { useFiltros } from "./ProveedorFiltros";
import { prendasTexto, ZonaDeFiltro } from "./ZonaDeFiltro";

// El panel de COLOR o de TALLA de la computadora (maqueta «Opción 1 · Filtros que se abren», ADR-0512 actividad 4): se abre bajo la barra pegada y
// se cuenta en vivo (no hay «Aplicar»). Lo de adentro es `ZonaDeFiltro`; aquí solo el marco, el lema y el pie con «Ver N prendas».

export function PanelDeFiltro({ faceta, id, ref, cerrar }: { faceta: Faceta; id: string; ref: Ref<HTMLElement>; cerrar: (devolverFoco: boolean) => void }) {
  const f = useFiltros();
  if (!f) return null;
  const esColor = faceta === "color";
  const abierto = f.abierto === faceta;
  return (
    <section ref={ref} id={id} className="fp-panel" role="dialog" aria-label={esColor ? "Color" : "Talla"} data-abierto={abierto ? "" : undefined} inert={!abierto} tabIndex={-1}>
      <div className="fp-p-cuerpo">
        <p className="fp-lema">{esColor ? "Elige uno o varios colores" : "Elige una o varias tallas"}</p>
        <ZonaDeFiltro faceta={faceta} />
      </div>
      <div className="fp-p-pie">
        <button
          type="button"
          className="fp-qt fp-etq"
          hidden={f.elegido[faceta].length === 0}
          onClick={(e) => {
            f.quitar(faceta);
            // El botón se oculta: el foco pasa a donde la persona seguiría (la primera opción del panel).
            const el = e.currentTarget.closest("section");
            requestAnimationFrame(() => el?.querySelector<HTMLElement>(".fp-op")?.focus({ preventScroll: true }));
          }}
        >
          {esColor ? "Quitar colores" : "Quitar tallas"}
        </button>
        <button type="button" className="fp-cierra fp-etq" onClick={() => cerrar(true)}>
          Ver {prendasTexto(f.vivo?.conteos.total ?? 0)}
        </button>
      </div>
    </section>
  );
}
