"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FilaBajadas, FilaMovimiento, FilaOperacion, type ContextoFila } from "@/components/FilaMovimiento";
import { CajonMovimiento } from "@/components/CajonMovimiento";
import { DIA_CUANTOS, DIA_ETIQUETA, DIA_TITULO } from "@/components/ui/lista-actividad";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
import { construirDetalleBajadas, type ContextoCajon } from "@/lib/movimientos-cajon";
import type { AccesosAtajos, ApartadoDeMovimiento } from "@/lib/movimientos-atajos";
import { etiquetaDia, plegarBajadas, type ItemLista, type Movimiento, type OperacionMovimiento, type PrendaDeMovimiento } from "@/lib/movimientos-reglas";

// La lista del historial, agrupada por día y, dentro del día, por OPERACIÓN (ADR-0234): lo que se guardó de una sola
// vez —un traslado de 16 variantes, una venta de dos prendas, una bajada al piso escaneada de una vez— es una fila que
// dice qué pasó y cuánto, y que al tocarla abre el cajón con sus prendas. Así el día se lee como lo que pasó en la tienda
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
  saldos,
  apartados,
  accesos,
  plegar,
  hoyLima,
  enlaceCompras,
  enlaceVentas,
}: {
  operaciones: OperacionMovimiento[];
  prendas: Record<string, PrendaDeMovimiento>;
  /** Cuántas quedaron en la tienda después de cada movimiento, por id (ADR-0234, saldo). Null = la base no lo dijo. */
  saldos: Record<string, number> | null;
  /** El apartado de cada movimiento de apartar o liberar (ADR-0241). */
  apartados: Record<string, ApartadoDeMovimiento>;
  /** Qué módulos ve quien mira (ADR-0161): decide si un apartado enlaza a Apartados. */
  accesos: AccesosAtajos;
  /** ¿Se pliegan las bajadas al piso del día? Solo en «Todos» y sin búsqueda (lo decide la página). */
  plegar: boolean;
  hoyLima: string;
  enlaceCompras: boolean;
  enlaceVentas: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [abiertoId, setAbiertoId] = useState<string | null>(() => params.get("mov"));
  // Las bajadas plegadas de un día abren su propio contenido en el MISMO cajón (clave `bajadas-<fecha>`): no tienen id de
  // movimiento ni van en la URL (no son un movimiento que se mande por WhatsApp: la agrupación depende de los filtros).
  const [bajadasAbiertas, setBajadasAbiertas] = useState<string | null>(null);
  const [venta, setVenta] = useState<Movimiento | null>(null);
  // La operación abierta se reconstruye a partir de UN id de sus filas (`abiertoId`, la misma URL `?mov=` de
  // siempre): así una fila suelta y una operación de muchas prendas comparten el mismo estado, sin uno nuevo — abrir
  // la operación es abrir cualquiera de sus filas (diseño aprobado 2026-09-28, ver CajonMovimiento.tsx).
  //
  // «Corregir con un ajuste» (main, ADR-0241/ADR-0237) no vuelve: el cajón nuevo es solo de CONSULTA (sección 14 del
  // pedido) — ajustar stock sigue viviendo en Existencias, nunca dentro del detalle de un movimiento.
  const operacionAbierta = abiertoId ? (operaciones.find((op) => op.filas.some((f) => f.id === abiertoId)) ?? null) : null;
  const abierto = operacionAbierta?.filas.find((f) => f.id === abiertoId) ?? operacionAbierta?.filas[0] ?? null;

  function sincronizarUrl(id: string | null) {
    const p = new URLSearchParams(window.location.search);
    if (id) p.set("mov", id);
    else p.delete("mov");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }
  function abrir(m: Movimiento) {
    setBajadasAbiertas(null);
    setAbiertoId(m.id);
    sincronizarUrl(m.id);
  }
  function abrirBajadas(clave: string) {
    setAbiertoId(null);
    sincronizarUrl(null);
    setBajadasAbiertas(clave);
  }
  function cerrar() {
    setAbiertoId(null);
    setBajadasAbiertas(null);
    sincronizarUrl(null);
  }

  // Sin `mov`: la vuelta desde un traslado reabre la lista, no el detalle que se estaba mirando.
  const vuelta = new URLSearchParams(params.toString());
  vuelta.delete("mov");
  const ctx: ContextoFila = {
    enlaceCompras,
    enlaceVentas,
    saldos,
    volverA: vuelta.toString() ? `${pathname}?${vuelta.toString()}` : pathname,
    onAbrir: abrir,
    onAbrirVenta: (m) => {
      if (abiertoId) cerrar();
      setVenta(m);
    },
    apartados,
    accesos,
    abiertoId,
  };
  const ctxCajon: ContextoCajon = {
    prendas,
    saldos,
    apartados,
    enlaceVentas,
    enlaceCompras,
    modulosVisibles: accesos.modulos,
    volverA: ctx.volverA,
  };

  // Agrupar por día de Lima (`fecha` ya viene calculada en SQL): las operaciones llegan ordenadas por hora desc, así que
  // los grupos salen en orden solos.
  const dias: { fecha: string; operaciones: OperacionMovimiento[] }[] = [];
  for (const op of operaciones) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === op.fecha) ultimo.operaciones.push(op);
    else dias.push({ fecha: op.fecha, operaciones: [op] });
  }
  const itemsPorDia = dias.map((dia) => ({ ...dia, items: plegar ? plegarBajadas(dia.operaciones) : dia.operaciones.map((op): ItemLista => ({ tipo: "operacion", op })) }));
  // Lo que muestra el cajón: la operación abierta, o las bajadas plegadas de un día (si siguen plegadas con estos filtros).
  const grupoBajadas = bajadasAbiertas ? itemsPorDia.flatMap((d) => d.items).find((i) => i.tipo === "bajadas" && i.clave === bajadasAbiertas) : undefined;
  const vistaCajon: VistaCajon | null = operacionAbierta
    ? { tipo: "operacion", operacion: operacionAbierta }
    : grupoBajadas?.tipo === "bajadas"
      ? { tipo: "bajadas", detalle: construirDetalleBajadas(grupoBajadas.clave, grupoBajadas.operaciones, ctxCajon, hoyLima) }
      : null;

  return (
    <>
      {/* `?mov=<id>` compartido (por WhatsApp, por ejemplo) que ya no está en
          esta página — normalmente porque cae fuera del rango de fechas
          actual. No se dispara una consulta extra para ir a buscarlo (ver
          comentario de arriba); esto es solo avisar que no apareció, en vez
          de no decir nada. */}
      {abiertoId && !abierto && (
        <div className="nota-cayla mx-4 mt-3 flex items-center justify-between gap-3 text-sm sm:mx-5">
          <span>Ese movimiento no está en el rango o los filtros actuales — prueba ampliándolos.</span>
          <button type="button" onClick={cerrar} className="label-cayla shrink-0 text-[11px] text-taupe underline underline-offset-2 hover:text-rojo">
            Entendido
          </button>
        </div>
      )}

      {/* Sin caja propia: comparte la tarjeta con los filtros (la pone la página). */}
      <div className="px-4 pb-2 sm:px-5">
        {itemsPorDia.map((dia) => (
          <section key={dia.fecha} aria-label={etiquetaDia(dia.fecha, hoyLima)}>
            <h3 className={DIA_TITULO}>
              <span className={DIA_ETIQUETA}>{etiquetaDia(dia.fecha, hoyLima)}</span>
              <span className={DIA_CUANTOS}>
                {dia.operaciones.length} {dia.operaciones.length === 1 ? "movimiento" : "movimientos"}
              </span>
            </h3>
            <ul className="divide-y divide-sand">
              {dia.items.map((item) =>
                item.tipo === "bajadas" ? (
                  <FilaBajadas key={item.clave} operaciones={item.operaciones} prendas={prendas} abierta={bajadasAbiertas === item.clave} onAbrir={() => abrirBajadas(item.clave)} />
                ) : item.op.filas.length === 1 ? (
                  <FilaMovimiento key={item.op.clave} m={item.op.filas[0]} prenda={prendas[item.op.filas[0].varianteId]} ctx={ctx} />
                ) : (
                  <FilaOperacion key={item.op.clave} op={item.op} prendas={prendas} ctx={ctx} />
                )
              )}
            </ul>
          </section>
        ))}
      </div>

      {vistaCajon && (
        <CajonMovimiento
          vista={vistaCajon}
          contexto={ctxCajon}
          onVerVenta={
            enlaceVentas && abierto
              ? () => {
                  cerrar();
                  setVenta(abierto);
                }
              : undefined
          }
          onCerrar={cerrar}
        />
      )}
      {venta?.venta && (
        // Quien vendió solo se sabe por la fila de la VENTA; en una devolución o un cambio, quien la registró es otra persona.
        <DetalleVentaModal ventaId={venta.venta.id} vendedor={venta.motivo === "venta" ? venta.usuario : null} ubicacionNombre={venta.ubicacion} onClose={() => setVenta(null)} />
      )}
    </>
  );
}
