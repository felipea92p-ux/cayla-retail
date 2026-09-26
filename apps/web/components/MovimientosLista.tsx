"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FilaMovimiento, FilaOperacion, type ContextoFila } from "@/components/FilaMovimiento";
import { MovimientoDetalle } from "@/components/MovimientoDetalle";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
import { etiquetaDia, type Movimiento, type OperacionMovimiento, type PrendaDeMovimiento } from "@/lib/movimientos-reglas";

// La lista del historial, agrupada por día y, dentro del día, por OPERACIÓN (ADR-0234): lo que se guardó de una sola
// vez —un traslado de 16 variantes, una venta de dos prendas, una bajada al piso escaneada de una vez— es una fila que
// dice qué pasó y cuánto, y que al tocarla se despliega en sus prendas. Así el día se lee como lo que pasó en la tienda
// y un envío grande no tapa todo lo demás (antes, el Traslado 2 ocupaba 16 de 18 filas).
//
// Muestra el EFECTO sobre el stock de la sede que se mira (qué prenda, cuánto, de dónde a dónde) y el proceso que lo
// originó. Qué prendas viajaron juntas, el envío, la recepción y las diferencias los cuenta Traslados: acá solo hay un
// enlace para llegar a él, no una copia — y ese enlace trae de vuelta a esta lista, con sus filtros.
//
// Cada prenda abre su detalle en un modal — la fila ya trae todo (fn_movimientos resolvió las referencias), así que
// abrir el detalle no consulta nada. Una venta abre SU detalle, el mismo de Historial (`DetalleVentaModal`), si quien
// mira ve el Historial.
//
// El movimiento abierto vive en la URL (`?mov=<id>`) para que «mirá este movimiento» sea un enlace que se manda por
// WhatsApp y abre exactamente eso (el detalle tiene «Copiar enlace»). Se escribe con `history.replaceState`, no con
// `router.push`: la página es un Server Component y un push volvería a consultar Postgres solo por abrir un modal. Si el
// id no está en la página cargada (otros filtros, otra página del cursor), no se abre nada — nunca se inventa una
// consulta extra.
export function MovimientosLista({
  operaciones,
  prendas,
  hoyLima,
  enlaceCompras,
  enlaceVentas,
}: {
  operaciones: OperacionMovimiento[];
  prendas: Record<string, PrendaDeMovimiento>;
  hoyLima: string;
  enlaceCompras: boolean;
  enlaceVentas: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [abiertoId, setAbiertoId] = useState<string | null>(() => params.get("mov"));
  const [desplegadas, setDesplegadas] = useState<ReadonlySet<string>>(() => new Set());
  const [venta, setVenta] = useState<Movimiento | null>(null);
  const movimientos = operaciones.flatMap((op) => op.filas);
  const abierto = abiertoId ? (movimientos.find((m) => m.id === abiertoId) ?? null) : null;

  function sincronizarUrl(id: string | null) {
    const p = new URLSearchParams(window.location.search);
    if (id) p.set("mov", id);
    else p.delete("mov");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }
  function abrir(m: Movimiento) {
    setAbiertoId(m.id);
    sincronizarUrl(m.id);
  }
  function cerrar() {
    setAbiertoId(null);
    sincronizarUrl(null);
  }
  function alternar(clave: string) {
    setDesplegadas((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(clave)) nuevas.delete(clave);
      else nuevas.add(clave);
      return nuevas;
    });
  }

  // Sin `mov`: la vuelta desde un traslado reabre la lista, no el detalle que se estaba mirando.
  const vuelta = new URLSearchParams(params.toString());
  vuelta.delete("mov");
  const ctx: ContextoFila = {
    enlaceCompras,
    enlaceVentas,
    volverA: vuelta.toString() ? `${pathname}?${vuelta.toString()}` : pathname,
    onAbrir: abrir,
    onAbrirVenta: (m) => {
      if (abiertoId) cerrar();
      setVenta(m);
    },
  };

  // Agrupar por día de Lima (`fecha` ya viene calculada en SQL): las operaciones llegan ordenadas por hora desc, así que
  // los grupos salen en orden solos.
  const dias: { fecha: string; operaciones: OperacionMovimiento[] }[] = [];
  for (const op of operaciones) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === op.fecha) ultimo.operaciones.push(op);
    else dias.push({ fecha: op.fecha, operaciones: [op] });
  }

  return (
    <>
      {/* `?mov=<id>` compartido (por WhatsApp, por ejemplo) que ya no está en
          esta página — normalmente porque cae fuera del rango de fechas
          actual. No se dispara una consulta extra para ir a buscarlo (ver
          comentario de arriba); esto es solo avisar que no apareció, en vez
          de no decir nada. */}
      {abiertoId && !abierto && (
        <div className="nota-cayla mb-4 flex items-center justify-between gap-3 text-sm">
          <span>Ese movimiento no está en el rango o los filtros actuales — prueba ampliándolos.</span>
          <button type="button" onClick={cerrar} className="label-cayla shrink-0 text-[11px] text-taupe underline underline-offset-2 hover:text-rojo">
            Entendido
          </button>
        </div>
      )}

      <div className="card-cayla px-4 pb-2 sm:px-5">
        {dias.map((dia) => (
          <section key={dia.fecha} aria-label={etiquetaDia(dia.fecha, hoyLima)}>
            <h3 className="flex items-baseline justify-between gap-3 border-b border-sand pb-2 pt-4">
              <span className="label-cayla text-[11px] font-bold text-tinta">{etiquetaDia(dia.fecha, hoyLima)}</span>
              <span className="label-cayla text-[10.5px] font-bold text-taupe">
                {dia.operaciones.length} {dia.operaciones.length === 1 ? "movimiento" : "movimientos"}
              </span>
            </h3>
            <ul className="divide-y divide-sand">
              {dia.operaciones.map((op) =>
                op.filas.length === 1 ? (
                  <FilaMovimiento key={op.clave} m={op.filas[0]} prenda={prendas[op.filas[0].varianteId]} ctx={ctx} />
                ) : (
                  <FilaOperacion key={op.clave} op={op} prendas={prendas} ctx={ctx} abierta={desplegadas.has(op.clave)} onAlternar={() => alternar(op.clave)} />
                )
              )}
            </ul>
          </section>
        ))}
      </div>

      {abierto && (
        <MovimientoDetalle
          movimiento={abierto}
          prenda={prendas[abierto.varianteId]}
          onVerVenta={
            enlaceVentas
              ? () => {
                  cerrar();
                  setVenta(abierto);
                }
              : undefined
          }
          onClose={cerrar}
        />
      )}
      {venta?.venta && (
        // Quien vendió solo se sabe por la fila de la VENTA; en una devolución o un cambio, quien la registró es otra persona.
        <DetalleVentaModal ventaId={venta.venta.id} vendedor={venta.motivo === "venta" ? venta.usuario : null} ubicacionNombre={venta.ubicacion} onClose={() => setVenta(null)} />
      )}
    </>
  );
}
