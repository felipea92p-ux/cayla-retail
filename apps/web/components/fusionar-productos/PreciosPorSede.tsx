"use client";

import { Aviso } from "@/components/ui/Aviso";
import { Interruptor } from "@/components/ui/campos";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { soles } from "@/lib/compras-reglas";
import {
  fichaDelPrecioDeSede,
  fraseDePrecioEnSede,
  sedesBajoCosto,
  type PrecioSedePlan,
  type ProductoPlan,
} from "@/lib/fusionar-productos-reglas";
import { FilaDistinta } from "./piezas";

/**
 * Precios por sede de una fusión (ADR-0650, act. 2026-11-15; migraciones 20261115153000 y 20261116020000).
 * Solo se dibuja si una ficha repetida cobra, con precio propio, algo distinto de lo que cobraría la que queda.
 * Por defecto cada sede conserva su precio: donde dos fichas tenían precios propios distintos se elige de cuál, con la MISMA
 * pieza que «Lo que es distinto» (la opción con su ✓, alineada bajo su ficha); donde no hay conflicto se dice el precio que
 * queda y, si cambia, el de antes. «Un solo precio» junta todo en el precio general.
 * Auditoría 2026-11-16: antes eran botones negros (voz de acción) y «Conserva S/ 74.90» escondía que la tienda bajaba de precio.
 */
export function PreciosPorSede({
  sedes,
  productos,
  unSoloPrecio,
  elegidas,
  deshabilitado,
  onUnSoloPrecio,
  onElegir,
}: {
  sedes: PrecioSedePlan[];
  /** Las fichas de la fusión, en el orden de la hoja (las columnas de «Lo que es distinto»). */
  productos: ProductoPlan[];
  unSoloPrecio: boolean;
  elegidas: Record<string, string>;
  deshabilitado: boolean;
  onUnSoloPrecio: (v: boolean) => void;
  onElegir: (ubicacionId: string, productoId: string) => void;
}) {
  const conflictos = sedes.filter((s) => s.conflicto);
  const sinConflicto = sedes.filter((s) => !s.conflicto);
  // Lo que la fusión frenaría al confirmar, dicho antes (20261116203000).
  const bajoCosto = sedesBajoCosto(sedes, { unSoloPrecio, precioSedeDe: elegidas });
  return (
    <section className="space-y-4" data-guia="fusionar.precios-sede">
      <TituloGrupo cuenta={sedes.length}>Precios por sede</TituloGrupo>
      <Interruptor
        activo={unSoloPrecio}
        onActivo={onUnSoloPrecio}
        disabled={deshabilitado}
        etiqueta="Un solo precio para todas las sedes"
      />
      {!unSoloPrecio && (
        <>
          {conflictos.map((sede, k) => {
            const opciones = sede.productos
              .filter((p) => p.propio && p.precio !== null)
              .map((p) => ({ productoId: p.id, valor: soles(p.precio as number) }));
            return (
              <FilaDistinta
                key={sede.ubicacionId}
                campo="precio"
                etiqueta={`Precio en ${sede.nombre}`}
                vacia="Sin precio propio"
                productos={productos}
                opciones={opciones}
                marcada={fichaDelPrecioDeSede(sede, elegidas[sede.ubicacionId])}
                indice={Math.min(k, 7)}
                deshabilitada={deshabilitado}
                onElegir={(productoId) => onElegir(sede.ubicacionId, productoId)}
              />
            );
          })}
          {sinConflicto.length > 0 && (
            <ul className="space-y-1 text-sm text-tinta">
              {sinConflicto.map((sede) => (
                <li key={sede.ubicacionId}>{fraseDePrecioEnSede(sede, undefined)}</li>
              ))}
            </ul>
          )}
          {bajoCosto.map((b) => (
            <Aviso key={b.nombre} tono="atencion" chico titulo={`${b.nombre}: ${b.precio === null ? "ese precio" : soles(b.precio)} queda bajo el costo`}>
              Así no se podrá fusionar. Elige el de otra ficha o «Un solo precio».
            </Aviso>
          ))}
        </>
      )}
    </section>
  );
}
