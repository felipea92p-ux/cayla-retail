"use client";

import type { CSSProperties, ReactNode } from "react";
import { Plus, Tag } from "lucide-react";
import { FilaDeLista } from "@/components/campanas/FilaDeLista";
import { Globito } from "@/components/ui/Globito";
import { descuentosDeLaTienda, nombreDeDescuento, textoPct, type DescuentoDeLista } from "@/lib/rebaja-rapida-reglas";
import { claveResponsableConteo } from "@/lib/responsable-conteo";
import { useResponsable } from "@/lib/useResponsable";

/** Quién lo hace se elige una vez por tienda y queda para los siguientes: el panel de cada descuento recuerda el mismo. */
export const useResponsableDeRebaja = (ubicacionId: string, sede: string) =>
  useResponsable({ ubicacionId, etiqueta: sede }, { recordarEn: claveResponsableConteo(`rebaja-${ubicacionId}`) });

/**
 * «Descuentos» (ADR-0677, Felipe 2026-11-17, cara A de la maqueta): lo primero de la lista de Campañas y ofertas. Cada cajón de «Poner un %» que
 * rige en la tienda es una fila «Descuento −10 %» con cuántas prendas tiene; el de todas las tiendas es otra fila y lo dice. Tocar una abre su
 * panel (`PanelDeDescuento`), que la pantalla pone a la derecha o, con una sola columna, aquí mismo bajo la fila (`panelEnLinea`). Al final,
 * «Nuevo descuento» (la hoja `HojaDeDescuento`): sale aunque todavía no haya ninguno, para crear el primero.
 */
export function DescuentosDeLaTienda({
  descuentos,
  abiertoId,
  onAbrir,
  panelEnLinea,
  onNuevo,
}: {
  descuentos: readonly DescuentoDeLista[];
  abiertoId: string | null;
  onAbrir: (etiquetaId: string) => void;
  /** El panel del descuento abierto, cuando va debajo de su fila (una sola columna). */
  panelEnLinea?: ReactNode;
  /** Abre la hoja «Nuevo descuento». */
  onNuevo: () => void;
}) {
  const filas = descuentosDeLaTienda(descuentos);

  return (
    <section className="lc-descuentos" aria-label="Descuentos" data-guia="rebaja.tienda">
      <h3 className="sl-pila-titulo">
        Descuentos
        <Globito n={filas.length} />
      </h3>
      {filas.map((d, i) => (
        <div key={d.etiquetaId}>
          <FilaDeLista
            icono={<Tag />}
            sobre="Descuento"
            titulo={textoPct(d.pct)}
            bajada={d.todas ? "Todas las tiendas" : null}
            cifra={d.prendas}
            cifraTexto={d.prendas === 1 ? "prenda" : "prendas"}
            etiqueta={nombreDeDescuento(d)}
            abierta={d.etiquetaId === abiertoId}
            onAbrir={() => onAbrir(d.etiquetaId)}
            indice={i}
            guia={i === 0 ? "rebaja.fila" : undefined}
          />
          {d.etiquetaId === abiertoId && panelEnLinea && <div className="sl-detalle sl-detalle-en-linea lc-panel-en-linea">{panelEnLinea}</div>}
        </div>
      ))}
      <div>
        <button type="button" className="lc-fila lc-fila-nuevo" onClick={onNuevo} data-guia="rebaja.nuevo" style={{ "--i": filas.length } as CSSProperties}>
          <span className="lc-fila-lente" aria-hidden>
            <Plus />
          </span>
          <span>Nuevo descuento</span>
        </button>
      </div>
    </section>
  );
}
