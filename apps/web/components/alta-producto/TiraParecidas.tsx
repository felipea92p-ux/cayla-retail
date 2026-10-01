"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { textoAnuncio, type AlertaVista } from "@/lib/parecidas-alta-vista";

// La tira «2 prendas parecidas · Ver» de «Nuevo producto» en celular y tablet (Fase 1; maqueta docs/maquetas/producto-buscar-primero-2026-09/).
//
// EL PROBLEMA. Con menos de 1024 px no hay resumen a la derecha, y ahí vivía la alerta de prendas parecidas. La misma alerta pasa a una tira de una
// línea pegada SOBRE la barra de abajo de la ficha (`data-barra-ficha`): se ve sin tapar el formulario y un toque abre la hoja a pantalla completa.
//
// CONTRATO. PROMETE: mostrar la tira con el mismo tono que la alerta del resumen (pizarra, ámbar, rojo, neutro) y, cuando lo que avisa FRENA «Crear»,
//   con la letra más gruesa además del color (quien no distingue el color igual lo nota); no mostrar nada si no hay nada que avisar; mantener una región
//   `role="status"` siempre montada (la del resumen está oculta con esta pantalla, así que esta es la que se anuncia; mientras la base responde no hay
//   tira, pero la región dice «Buscando…» para el lector de pantalla); objetivo táctil de 44 px; `type="button"` (vive dentro del formulario); la región es
//   un destino de foco de respaldo de la hoja (`data-parecidas-ancla`, `tabIndex -1`). ASUME: que es el PRIMER hijo de la barra `data-barra-ficha` (16 px a los
//   lados y 10 px arriba: sus márgenes negativos la llevan de borde a borde) y que la barra se oculta con lg:hidden, así que aquí no hay punto de corte.
//   NO HACE: decidir el texto ni el tono (vienen en `AlertaVista`) ni abrir la hoja por su cuenta.

type Props = {
  /** La misma alerta que recibe `AlertaParecidas`; se dibuja su `tira`. */
  alerta: AlertaVista | null;
  onVer: (id?: string) => void;
  onReintentar?: () => void;
  /** Se tocó el enlace que SALE de la pantalla («Ver Camisa Lara»): ver el contrato de `AlertaParecidas` (`useSalidaSinGuardar`). */
  onVerFicha?: (id: string) => void;
  /** Como en `AlertaParecidas`: el rojo en línea bajo Nombre ya se anuncia solo. */
  avisoEnLinea?: boolean;
};

export function TiraParecidas({ alerta, onVer, onReintentar, onVerFicha, avisoEnLinea = false }: Props) {
  const tira = alerta?.tira ?? null;

  const interior = tira && (
    <>
      {tira.conAviso && <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />}
      <span className="parecidas-tira-texto">{tira.texto}</span>
      <span className="parecidas-tira-ver">{tira.etiqueta}</span>
    </>
  );

  return (
    // La región va siempre; lo que entra y sale es la tira. Sin tira queda vacía y sin alto: no empuja nada de la barra.
    <div role="status" aria-live="polite" className="parecidas-tira-region" data-parecidas-ancla tabIndex={-1}>
      {/* Mientras la base responde no hay tira (la maqueta no la pinta), pero quien escucha no se queda sin saber que se está buscando. */}
      {alerta && !tira && <span className="sr-only">{textoAnuncio(alerta, { avisoEnLinea })}</span>}
      {alerta && tira && (
        <div className="parecidas-tira anim-revelar" data-tono={alerta.tono} data-tipo={alerta.tipo} data-frena={tira.frena ? "" : undefined} key={alerta.clave}>
          {tira.accion.tipo === "ver_ficha" ? (
            <Link href={tira.accion.href} className="parecidas-tira-fila" onClick={() => tira.accion.tipo === "ver_ficha" && onVerFicha?.(tira.accion.id)}>
              {interior}
            </Link>
          ) : (
            <button
              type="button"
              className="parecidas-tira-fila"
              onClick={() => {
                if (tira.accion.tipo === "reintentar") onReintentar?.();
                else onVer(tira.accion.tipo === "comparar" ? tira.accion.id : undefined);
              }}
            >
              {interior}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
