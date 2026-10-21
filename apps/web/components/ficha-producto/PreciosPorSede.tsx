"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import {
  desdeHace,
  preciosEnCadaTienda,
  quedaBajoElCosto,
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
 * «Precio por tienda» dentro de «Variantes y precios» (Felipe 2026-10-09). Si todas las tiendas venden igual lo dice en una línea; si
 * alguna tiene precio propio, muestra TODAS las tiendas, cada una con el precio al que vende la prenda (2026-10-10: antes la fila de AQP
 * decía «Las demás tiendas: S/ 79.90» con TRU a 69.90). La de precio propio lleva la insignia, desde cuándo, por qué y quién, con
 * «Cambiar» y «Quitar»; las demás dicen que siguen el precio de la prenda y, si esta cuenta puede, ofrecen ponerle uno. Lee con
 * `usePreciosDeTienda` (en la ficha) y guarda por su cuenta (`poner_precio_sede`): no es parte del «Confirmar y guardar» de la ficha.
 */
export function PreciosPorSede({
  productoId,
  precios,
  onCambio,
  precioPrenda,
  todas,
  tiendas,
  ubicacionActual,
  costoMaximo = null,
  deshabilitado,
}: {
  productoId: string;
  /** Los precios propios vigentes (`usePreciosDeTienda`); `null` mientras se leen. */
  precios: PrecioDeSede[] | null;
  /** Después de poner o quitar uno: se vuelven a leer. */
  onCambio: () => void;
  /** El precio de la prenda GUARDADO, si todas sus tallas activas valen lo mismo; si cambia según la talla, null. */
  precioPrenda: number | null;
  /** Todas las tiendas abiertas (para mostrar el precio en cada una). */
  todas: readonly Tienda[];
  /** Las tiendas donde esta cuenta puede poner precio (la suya; el líder, todas). Vacío: solo se lee. */
  tiendas: readonly Tienda[];
  /** La tienda de quien mira: ahí puede imprimir las etiquetas nuevas al terminar. */
  ubicacionActual: string | null;
  /** Lo que cuesta la talla activa que MÁS cuesta (lo guardado), si esta cuenta ve costos; null si no. Con él, un precio de tienda que
   *  hoy queda por debajo del costo se marca. La base solo frena al ponerlo (Felipe 2026-10-11): después el costo puede cambiar. */
  costoMaximo?: number | null;
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const [hoja, setHoja] = useState<
    | { k: "poner"; actual?: PrecioDeSede; tiendaId?: string }
    | { k: "quitar"; precio: PrecioDeSede }
    | null
  >(null);

  if (precios === null) return null;
  const puedeTocar = (ubicacionId: string) => tiendas.some((t) => t.id === ubicacionId);
  const libres = tiendasLibres(tiendas, precios);
  const textoPoner = precios.length === 0 ? textoPonerPrecio(libres, false) : null;
  const filas = preciosEnCadaTienda(todas, precios, precioPrenda);
  const precioEn = (ubicacionId: string): number | null => filas.find((f) => f.ubicacionId === ubicacionId)?.precio ?? precioPrenda;
  const cerrarYLeer = () => {
    setHoja(null);
    onCambio();
    // La ficha también lee el precio de esta tienda (la vista previa de las etiquetas): se rehace sin perder lo editado.
    router.refresh();
  };
  const dePrenda = precioPrenda !== null ? `a ${soles(precioPrenda)}` : "al precio de cada talla";

  return (
    <div
      className="mt-4 rounded-sm border border-sand bg-papel px-3.5 py-3"
      data-campo="precio-por-tienda"
      data-guia="editar.precio-tienda"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Store
          aria-hidden
          className="h-4 w-4 shrink-0 text-taupe"
        />
        <p className="text-[13px] font-semibold text-tinta">
          Precio por tienda
        </p>
        {precios.length === 0 ? (
          <p className="text-[12.5px] text-tinta/65">
            Se vende {dePrenda} en todas las tiendas.
          </p>
        ) : (
          <p className="text-[12.5px] text-tinta/65">
            Cada tienda vende todas las tallas a su precio.
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
          aria-label="Precio de la prenda en cada tienda"
        >
          {filas.map((f) => (
            <li
              key={f.ubicacionId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
            >
              <span className="min-w-[7.5rem] text-[13px] text-tinta">{f.sede}</span>
              <span className="font-mono text-[14px] font-semibold text-tinta">
                {f.precio !== null ? soles(f.precio) : "Según la talla"}
              </span>
              {f.propio ? (
                <Chip tono="ambar">Precio propio</Chip>
              ) : (
                <span className="text-[12.5px] text-tinta/60">El de la prenda</span>
              )}
              {f.propio && quedaBajoElCosto(f.propio.precio, costoMaximo) && <Chip tono="rojo">Bajo el costo</Chip>}
              {f.propio && puedeTocar(f.ubicacionId) && (
                <span className="ml-auto flex gap-2">
                  <Boton
                    type="button"
                    peso="discreto"
                    disabled={deshabilitado}
                    aria-label={`Cambiar el precio de ${f.sede}`}
                    onClick={() => setHoja({ k: "poner", actual: f.propio ?? undefined })}
                  >
                    Cambiar
                  </Boton>
                  {/* Quitar es lo peligroso: rojo desde el principio (pieza única, ADR-0358). */}
                  <Boton
                    type="button"
                    peso="peligro"
                    disabled={deshabilitado}
                    aria-label={`Quitar el precio de ${f.sede}`}
                    onClick={() => f.propio && setHoja({ k: "quitar", precio: f.propio })}
                  >
                    Quitar
                  </Boton>
                </span>
              )}
              {!f.propio && puedeTocar(f.ubicacionId) && (
                <Boton
                  type="button"
                  peso="discreto"
                  className="ml-auto"
                  disabled={deshabilitado}
                  aria-label={`Poner un precio propio en ${f.sede}`}
                  onClick={() => setHoja({ k: "poner", tiendaId: f.ubicacionId })}
                >
                  Precio propio
                </Boton>
              )}
              {f.propio && (
                <span className="basis-full text-[12.5px] text-tinta/70">
                  {desdeHace(f.propio.desde)} · «{f.propio.motivo}»{f.propio.creadoPor ? ` · ${f.propio.creadoPor}` : ""}
                </span>
              )}
              {f.propio && quedaBajoElCosto(f.propio.precio, costoMaximo) && (
                <span className="basis-full text-[12.5px] text-rojo-profundo">
                  Hoy queda por debajo de lo que cuesta la prenda.{puedeTocar(f.ubicacionId) ? " Súbelo o quítalo." : ""}
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
            tiendaInicial={hoja.tiendaId}
            general={precioPrenda}
            costoMaximo={costoMaximo}
            precioAntesEn={precioEn}
            ubicacionActual={ubicacionActual}
            actual={hoja.actual}
            onClose={() => setHoja(null)}
            onGuardado={cerrarYLeer}
          />
        )}
        {hoja?.k === "quitar" && (
          <QuitarPrecioSedeModal
            productoId={productoId}
            precio={hoja.precio}
            general={precioPrenda}
            ubicacionActual={ubicacionActual}
            onClose={() => setHoja(null)}
            onGuardado={cerrarYLeer}
          />
        )}
      </span>
    </div>
  );
}
