"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { createClient } from "@/lib/supabase/client";
import {
  desdeHace,
  leerPreciosDeSede,
  soles,
  tiendasLibres,
  textoPonerPrecio,
  type PrecioDeSede,
} from "@/lib/precio-sede-reglas";
import {
  PonerPrecioSedeModal,
  QuitarPrecioSedeModal,
  type Tienda,
} from "./PrecioSedeModal";

/**
 * «Precio por tienda» dentro de «Variantes y precios» (Felipe 2026-10-09). Se nota sin confundir: si todas las tiendas venden
 * igual lo dice en una línea; si una tiene precio propio, la fila la nombra con su precio, la insignia «Precio propio», desde
 * cuándo y por qué, con «Cambiar» y «Quitar». Lee y guarda por su cuenta (`fn_precios_sede_producto`, `poner_precio_sede`):
 * no es parte del «Confirmar y guardar» de la ficha.
 */
export function PreciosPorSede({
  productoId,
  general,
  tiendas,
  deshabilitado,
}: {
  productoId: string;
  /** El precio general GUARDADO (el más común de las variantes activas). */
  general: number | null;
  /** Las tiendas donde esta cuenta puede poner precio (la suya; el líder, todas). Vacío: solo se lee. */
  tiendas: readonly Tienda[];
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const [precios, setPrecios] = useState<PrecioDeSede[] | null>(null);
  const [hoja, setHoja] = useState<
    | { k: "poner"; actual?: PrecioDeSede }
    | { k: "quitar"; precio: PrecioDeSede }
    | null
  >(null);

  // Se vuelve a leer al subir `lectura` (después de guardar o quitar).
  const [lectura, setLectura] = useState(0);
  useEffect(() => {
    let vivo = true;
    void createClient()
      .rpc("fn_precios_sede_producto", { p_producto_id: productoId })
      .then(({ data, error }) => {
        // Si la función aún no está en la base (web publicada antes que el SQL), la ficha sigue sin el bloque.
        if (vivo) setPrecios(error ? [] : leerPreciosDeSede(data));
      });
    return () => {
      vivo = false;
    };
  }, [productoId, lectura]);

  if (precios === null) return null;
  const puedeTocar = (ubicacionId: string) =>
    tiendas.some((t) => t.id === ubicacionId);
  const libres = tiendasLibres(tiendas, precios);
  const textoPoner = textoPonerPrecio(libres, precios.length > 0);
  const cerrarYLeer = () => {
    setHoja(null);
    setLectura((n) => n + 1);
    // La ficha también lee el precio de esta tienda (la vista previa de las etiquetas): se rehace sin perder lo editado.
    router.refresh();
  };

  return (
    <div
      className="mt-4 rounded-sm border border-sand bg-papel px-3.5 py-3"
      data-campo="precio-por-tienda"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Store
          aria-hidden
          className="h-4 w-4 shrink-0 text-taupe"
          strokeWidth={1.75}
        />
        <p className="text-[13px] font-semibold text-tinta">
          Precio por tienda
        </p>
        {precios.length === 0 && (
          <p className="text-[12.5px] text-tinta/65">
            Se vende a {general !== null ? soles(general) : "su precio"} en
            todas las tiendas.
          </p>
        )}
        {textoPoner && (
          <Boton
            type="button"
            peso="discreto"
            className="ml-auto"
            disabled={deshabilitado}
            onClick={() => setHoja({ k: "poner" })}
          >
            {textoPoner}
          </Boton>
        )}
      </div>

      {precios.length > 0 && (
        <ul
          className="mt-2.5 divide-y divide-sand/70"
          aria-label="Tiendas con precio propio"
        >
          {precios.map((p) => (
            <li
              key={`${p.ubicacionId}-${p.precio}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
            >
              <span className="text-[13px] text-tinta">{p.sede}</span>
              <span className="font-mono text-[14px] font-semibold text-tinta">
                {soles(p.precio)}
              </span>
              <Chip tono="ambar">Precio propio</Chip>
              {/* Formidable 2026-10-10: en palabras de tienda («las demás tiendas», no «general») y el motivo en su línea, con contraste ≥ 4,5:1. */}
              <span className="basis-full text-[12.5px] text-tinta/70">
                {general !== null && <>Las demás tiendas: {soles(general)} · </>}
                {desdeHace(p.desde)}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] text-tinta/70">
                «{p.motivo}»{p.creadoPor ? ` · ${p.creadoPor}` : ""}
              </span>
              {puedeTocar(p.ubicacionId) && (
                <span className="ml-auto flex gap-2">
                  <Boton
                    type="button"
                    peso="discreto"
                    disabled={deshabilitado}
                    aria-label={`Cambiar el precio de ${p.sede}`}
                    onClick={() => setHoja({ k: "poner", actual: p })}
                  >
                    Cambiar
                  </Boton>
                  {/* Quitar es lo peligroso: rojo desde el principio (pieza única, ADR-0358). */}
                  <Boton
                    type="button"
                    peso="peligro"
                    disabled={deshabilitado}
                    aria-label={`Quitar el precio de ${p.sede}`}
                    onClick={() => setHoja({ k: "quitar", precio: p })}
                  >
                    Quitar
                  </Boton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* La ficha es un <form>: los eventos de la hoja (un portal) suben por el árbol de React (ADR-0128). Sin esto, «Guardar
          precio» abriría «Revisa y guarda» del producto, y Enter en el precio no guardaría (la ficha lo frena). */}
      <span
        className="contents"
        onSubmit={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {hoja?.k === "poner" && (
          <PonerPrecioSedeModal
            productoId={productoId}
            tiendas={hoja.actual ? tiendas : libres}
            general={general}
            actual={hoja.actual}
            onClose={() => setHoja(null)}
            onGuardado={cerrarYLeer}
          />
        )}
        {hoja?.k === "quitar" && (
          <QuitarPrecioSedeModal
            productoId={productoId}
            precio={hoja.precio}
            general={general}
            onClose={() => setHoja(null)}
            onGuardado={cerrarYLeer}
          />
        )}
      </span>
    </div>
  );
}
