"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MuestraTejido } from "@/components/MuestraTejido";
import { fueraDeLaCategoria } from "@/lib/alta-producto";
import { guardarEjesCategoria, sumarAlEje, type EjeIds } from "@/lib/alta-producto-ejes";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { useResponsable } from "@/lib/useResponsable";

// La fila «Tejido» del paso 3 del alta: una tarjeta con muestra por cada tejido que la categoría ofrece. Tocar la elegida la suelta.
//
// «Ver más» (Felipe, 2026-09-28): abre los tejidos del catálogo que la categoría todavía NO ofrece. Jeans ofrece 3 de 22; antes, para
// usar Lino en un jean había que saber que Lino existía y escribirlo en «+ Nuevo tejido». Es la misma tarjeta punteada que «Ver más»
// de las familias en el paso 1 (ArbolCategoria), para que el gesto se lea igual en todo el alta.
//
// Elegir uno de esos NO puede ser solo marcarlo: la base rechaza crear un producto con un tejido que su categoría no ofrece
// (`crear_producto_con_variantes`, «Ese tejido no está habilitado para la categoría elegida»). Así que tocarlo hace lo mismo que
// escribir un tejido existente en «+ Nuevo tejido»: lo ofrece en la categoría (una escritura aparte, firmada con su propio combo
// «Responsable», ADR-0161) y lo deja elegido. Se dice en pantalla antes del toque, porque cambia la categoría y no solo el producto.
// El combo vive en la parte ABIERTA (`OtrosTejidos`) por la misma razón que en ProponerValor: nadie lee la asistencia por un botón
// que nadie abrió.

export function TarjetaTejido({
  tejido,
  imagenUrl = null,
  elegido,
  onClick,
  deshabilitado = false,
  guardando = false,
  indice,
}: {
  tejido: ValorVocabulario;
  /** La imagen que eligió un Líder en Atributos (ADR-0256); sin ella, el dibujo automático por nombre. */
  imagenUrl?: string | null;
  elegido: boolean;
  onClick: () => void;
  deshabilitado?: boolean;
  /** Esta tarjeta es la que se está ofreciendo en la categoría ahora mismo. */
  guardando?: boolean;
  /** Entra escalonada (`anim-entra`): solo las que aparecen por un toque de la persona. */
  indice?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={elegido}
      disabled={deshabilitado}
      className={`flex w-[96px] flex-col gap-1.5 rounded-md border p-1.5 text-left text-[12.5px] transition-colors disabled:cursor-not-allowed ${
        elegido ? "border-tinta bg-tinta/[0.07] text-tinta" : "border-tinta/15 text-tinta/75 hover:border-tinta/40"
      } ${guardando ? "opacity-100" : "disabled:opacity-50"} ${indice === undefined ? "" : "anim-entra"}`}
      style={indice === undefined ? undefined : { ["--i" as string]: indice }}
    >
      <MuestraTejido nombre={tejido.texto} imagenUrl={imagenUrl} />
      <span className="px-0.5">
        {elegido && <span aria-hidden>✓ </span>}
        {guardando ? "Agregando…" : tejido.texto}
      </span>
    </button>
  );
}

type Props = {
  /** Los tejidos que la categoría ofrece (`categoria_tejidos`): la base solo acepta uno de estos al crear el producto. */
  deLaCategoria: ValorVocabulario[];
  /** Todos los tejidos aprobados del catálogo: de aquí sale lo que muestra «Ver más». */
  universo: ValorVocabulario[];
  /** id → imagen elegida en Atributos (ADR-0256). */
  imagenes: Record<string, string>;
  tejidoId: string;
  onElegir: (id: string) => void;
  categoriaId: string;
  categoriaNombre: string;
  /** Lo que la categoría ofrece HOY en los tres ejes: la RPC reemplaza, así que se le devuelve entero + el tejido nuevo. */
  ejesActuales: EjeIds;
  /** El tejido ya quedó ofrecido en la categoría: quien llama lo suma a la fila y lo deja elegido. */
  onOfrecido: (tejido: ValorVocabulario) => void;
};

export function ElegirTejido({ deLaCategoria, universo, imagenes, tejidoId, onElegir, categoriaId, categoriaNombre, ejesActuales, onOfrecido }: Props) {
  const [verMas, setVerMas] = useState(false);
  const otros = fueraDeLaCategoria(universo, deLaCategoria);
  const nombresOcultos = new Intl.ListFormat("es", { type: "conjunction" }).format(otros.map((t) => t.texto));
  const idBloque = `otros-tejidos-${categoriaId}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {deLaCategoria.map((t) => (
          <TarjetaTejido key={t.id} tejido={t} imagenUrl={imagenes[t.id]} elegido={tejidoId === t.id} onClick={() => onElegir(tejidoId === t.id ? "" : t.id)} />
        ))}
        {otros.length > 0 && (
          <button
            type="button"
            aria-expanded={verMas}
            aria-controls={idBloque}
            onClick={() => setVerMas((v) => !v)}
            // Borde punteado y sin muestra de tela: se lee como "más opciones", no como un tejido más ni como "crear uno nuevo".
            className="flex w-[96px] flex-col gap-1.5 rounded-md border border-dashed border-tinta/25 p-1.5 text-left text-[12.5px] text-tinta/70 transition-colors hover:border-tinta/50 hover:text-tinta"
          >
            <span className="flex aspect-[3/1] w-full items-center justify-center" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d={verMas ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
              </svg>
            </span>
            <span className="px-0.5">
              <span className="block font-medium leading-tight">{verMas ? "Ver menos" : "Ver más"}</span>
              {!verMas && (
                <span className="text-[11px] text-tinta/55" title={nombresOcultos}>
                  {otros.length} en el catálogo
                </span>
              )}
            </span>
          </button>
        )}
      </div>
      {verMas && otros.length > 0 && (
        <OtrosTejidos
          id={idBloque}
          otros={otros}
          imagenes={imagenes}
          categoriaId={categoriaId}
          categoriaNombre={categoriaNombre}
          ejesActuales={ejesActuales}
          onOfrecido={(t) => {
            setVerMas(false);
            onOfrecido(t);
          }}
        />
      )}
    </div>
  );
}

function OtrosTejidos({
  id,
  otros,
  imagenes,
  categoriaId,
  categoriaNombre,
  ejesActuales,
  onOfrecido,
}: {
  id: string;
  otros: ValorVocabulario[];
  imagenes: Record<string, string>;
  categoriaId: string;
  categoriaNombre: string;
  ejesActuales: EjeIds;
  onOfrecido: (tejido: ValorVocabulario) => void;
}) {
  const responsable = useResponsable();
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ofrecer(t: ValorVocabulario) {
    if (guardandoId || !responsable.listo) return;
    setGuardandoId(t.id);
    setError(null);
    const err = await guardarEjesCategoria(categoriaId, sumarAlEje(ejesActuales, "tejidos", t.id), responsable.encabezados());
    setGuardandoId(null);
    if (err) {
      // Nada quedó a medias: la categoría sigue como estaba y reintentar es seguro (ofrecer uno que ya está no lo repite).
      setError(`No se pudo agregar ${t.texto} a ${categoriaNombre}: ${err}`);
      return;
    }
    responsable.despues(null);
    avisar.exito(`${t.texto} ahora se ofrece en ${categoriaNombre}`);
    onOfrecido(t);
  }

  return (
    <div id={id} className="space-y-2 border-t border-tinta/10 pt-3">
      <p className="text-xs text-taupe">
        Otros tejidos del catálogo. Al elegir uno, <span className="text-tinta">{categoriaNombre}</span> lo ofrece desde ahora (también para las
        prendas que vengan) y queda elegido para esta.
      </p>
      <ComboResponsable control={responsable} deshabilitado={guardandoId !== null} className="max-w-sm" />
      <div className="flex flex-wrap gap-1.5" title={responsable.motivo ?? undefined}>
        {otros.map((t, i) => (
          <TarjetaTejido
            key={t.id}
            tejido={t}
            imagenUrl={imagenes[t.id]}
            elegido={false}
            indice={i}
            guardando={guardandoId === t.id}
            deshabilitado={guardandoId !== null || !responsable.listo}
            onClick={() => void ofrecer(t)}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-rojo-profundo">
          {error}
        </p>
      )}
    </div>
  );
}
