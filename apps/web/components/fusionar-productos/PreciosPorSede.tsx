"use client";

import { Boton, Interruptor } from "@/components/ui/campos";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { soles } from "@/lib/compras-reglas";
import { fichaDelPrecioDeSede, type PrecioSedePlan } from "@/lib/fusionar-productos-reglas";

/**
 * Precios por sede de una fusión (ADR-0650, act. 2026-11-15; migración 20261115153000).
 * Solo se dibuja si una ficha repetida cobra, con precio propio, algo distinto de lo que cobraría la que queda.
 * Por defecto cada sede conserva su precio: donde dos fichas tenían precios propios distintos se elige de cuál; «un solo precio»
 * junta todo en el precio general. Una línea a la vista; lo que explica va en el pie de cada fila.
 */
export function PreciosPorSede({
  sedes,
  fichas,
  unSoloPrecio,
  elegidas,
  deshabilitado,
  onUnSoloPrecio,
  onElegir,
}: {
  sedes: PrecioSedePlan[];
  /** Las fichas de la fusión con su nombre, en el orden de la hoja. */
  fichas: { id: string; referencia: string }[];
  unSoloPrecio: boolean;
  elegidas: Record<string, string>;
  deshabilitado: boolean;
  onUnSoloPrecio: (v: boolean) => void;
  onElegir: (ubicacionId: string, productoId: string) => void;
}) {
  const nombreDe = (id: string) => fichas.find((f) => f.id === id)?.referencia ?? "Ficha";
  return (
    <section className="space-y-3" data-guia="fusionar.precios-sede">
      <TituloGrupo cuenta={sedes.length} nota="cada sede conserva el suyo">
        Precios por sede
      </TituloGrupo>
      <Interruptor
        activo={unSoloPrecio}
        onActivo={onUnSoloPrecio}
        disabled={deshabilitado}
        etiqueta="Un solo precio para todas las sedes"
      />
      {!unSoloPrecio && (
        <ul className="divide-y divide-sand rounded-2xl border border-sand">
          {sedes.map((sede) => {
            const elegida = fichaDelPrecioDeSede(sede, elegidas[sede.ubicacionId]);
            const propios = sede.productos.filter((p) => p.propio);
            return (
              <li key={sede.ubicacionId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="w-28 shrink-0 text-sm font-medium text-tinta">{sede.nombre}</span>
                {sede.conflicto ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Precio en ${sede.nombre}`}>
                    {propios.map((p) => (
                      <Boton
                        key={p.id}
                        type="button"
                        peso={elegida === p.id ? "primario" : "fantasma"}
                        className="btn-chico"
                        aria-pressed={elegida === p.id}
                        disabled={deshabilitado}
                        onClick={() => onElegir(sede.ubicacionId, p.id)}
                      >
                        {p.precio === null ? "Sin precio" : soles(p.precio)} · {nombreDe(p.id)}
                      </Boton>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-tinta/80">
                    Conserva {elegida ? soles(sede.productos.find((p) => p.id === elegida)?.precio ?? 0) : "su precio"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
