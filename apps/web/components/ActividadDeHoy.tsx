"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { HiloComprobante } from "@/components/ui/HiloComprobante";
import { soles } from "@/lib/compras-reglas";
import { ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import type { VentaDelDia } from "@/lib/comprobantes-reglas";
import { accionDeLaFila, camposDeBusquedaDeLaFila, chipDeLaFila, detalleDeLaFila, estadoDeLaFila, type FilaDeActividad } from "@/lib/facturacion-actividad";
import { coincide } from "@/lib/facturacion-busqueda";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { useTransmitir } from "@/lib/useTransmitir";

// «Actividad de hoy» (ADR-0124, spec §7): todo lo que se vendió hoy, con el camino de su
// comprobante hasta SUNAT a la vista y el botón de la fila (Transmitir, Reintentar o Ver PDF).
// Reemplaza la lista plana de `VentasDelDiaPanel`. Es cliente solo por el botón de transmitir:
// las filas vienen resueltas de servidor (`enlazarVentasConComprobantes`) y las decisiones de
// cada una —hilo, chip, detalle, acción— salen de `lib/facturacion-actividad.ts`.
//
// Tres formas según el ancho DE LA TARJETA (container queries), no el de la ventana: con el menú
// lateral desplegado (17 rem) una ventana de 768 px deja ~480 px de contenido, y una regla por
// ventana (`sm:`) armaba ahí la tabla de cuatro columnas apretada hasta cortar el estado. Desde 900 px
// de tarjeta la tabla con la columna «Pago»; entre 640 y 899 px la misma tabla sin esa columna (el
// método pasa a la línea de abajo); por debajo de 640 px, filas apiladas.

// Cada método de pago con su color de dato (paleta de Caja, `--color-metodo-*`): nunca un hex suelto.
const COLOR_METODO: Record<string, string> = {
  efectivo: "var(--color-metodo-efectivo)",
  tarjeta: "var(--color-metodo-tarjeta)",
  yape: "var(--color-metodo-yape)",
  plin: "var(--color-metodo-plin)",
  transferencia: "var(--color-metodo-transferencia)",
};

function metodos(v: VentaDelDia): { nombre: string; color: string }[] {
  return (v.metodos_pago ?? "")
    .split("+")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean)
    .map((clave) => ({ nombre: clave.charAt(0).toUpperCase() + clave.slice(1), color: COLOR_METODO[clave] ?? "rgb(26 26 24 / 0.4)" }));
}

/** «Casaca Emilia (L/Blanco) ×1»: una línea por prenda. */
function lineasDeProductos(v: VentaDelDia): string[] {
  return v.items.map((i) => {
    const variante = [i.talla, i.color].filter(Boolean).join("/");
    return `${i.referencia}${variante ? ` (${variante})` : ""} ×${i.cantidad}`;
  });
}

// Las columnas de la tabla, en las dos versiones (con y sin «Pago»).
const COLUMNAS = "@min-[640px]:grid @min-[640px]:grid-cols-[62px_minmax(0,1fr)_84px_minmax(0,1.3fr)] @min-[900px]:grid-cols-[72px_minmax(0,1.15fr)_104px_96px_minmax(0,1.95fr)]";

export function ActividadDeHoy({ filas, ahora }: { filas: FilaDeActividad[]; ahora: Date }) {
  const { transmitiendoId, transmitir } = useTransmitir();
  const { texto: busqueda } = useFacturacionBusqueda();
  const visibles = filas.filter((f) => coincide(camposDeBusquedaDeLaFila(f), busqueda));

  return (
    <div className="card-cayla anim-sube @container overflow-hidden" style={{ "--i": 7 } as CSSProperties}>
      <div className="flex items-end justify-between gap-3 px-5 pt-[18px] pb-3.5">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Ventas de hoy</p>
          <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">Actividad de hoy</h2>
          <p className="mt-0.5 text-xs text-tinta/65">Con el camino de cada comprobante hasta SUNAT</p>
        </div>
        <Link
          href="/vender/facturacion/comprobantes"
          className="label-cayla shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-tinta/60 outline-none transition-colors duration-200 hover:bg-sand/40 hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
        >
          Ver comprobantes →
        </Link>
      </div>

      {filas.length === 0 ? (
        <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Sin ventas registradas hoy todavía.</p>
      ) : visibles.length === 0 ? (
        <SinCoincidencias />
      ) : (
        <>
          <div className={`label-cayla hidden gap-x-4 border-t border-tinta/10 px-5 py-2 text-[11px] text-tinta/65 ${COLUMNAS}`}>
            <span>Hora</span>
            <span>Productos</span>
            <span className="hidden @min-[900px]:inline">Pago</span>
            <span className="text-right">Total</span>
            <span>Comprobante</span>
          </div>

          {visibles.map((fila) => {
            const { venta, comprobante } = fila;
            const estado = estadoDeLaFila(fila);
            const chip = chipDeLaFila(venta, comprobante);
            const detalle = detalleDeLaFila(comprobante, ahora);
            const accion = accionDeLaFila(comprobante);
            const pago = metodos(venta);
            const enVuelo = comprobante !== null && transmitiendoId === comprobante.id;
            return (
              <div
                key={`${venta.venta_id}-${venta.comprobante_texto ?? "sin"}`}
                className={`flex flex-col gap-2 border-t border-tinta/10 px-5 py-3 transition-colors duration-150 hover:bg-tinta/[0.025] @min-[640px]:items-center @min-[640px]:gap-x-4 @min-[640px]:gap-y-0 ${COLUMNAS}`}
              >
                <div className="flex items-baseline gap-2 @min-[640px]:block">
                  <p className="font-display text-lg leading-tight tabular-nums text-tinta">{venta.hora}</p>
                  <p className="label-cayla text-[10px] text-tinta/65 @min-[640px]:mt-0.5">{venta.ubicacion_nombre}</p>
                </div>

                <div className="min-w-0">
                  {lineasDeProductos(venta).map((linea, i) => (
                    <p key={i} className="text-[15px] leading-normal text-tinta">
                      {linea}
                    </p>
                  ))}
                  <p className="mt-0.5 text-[13px] text-tinta/65">
                    {venta.cliente_nombre} · {venta.vendedor}
                    <span className="@min-[900px]:hidden">{pago.length > 0 ? ` · ${pago.map((m) => m.nombre).join(" + ")}` : ""}</span>
                  </p>
                </div>

                <div className="hidden @min-[900px]:block">
                  {pago.map((m) => (
                    <span key={m.nombre} className="mr-3 inline-flex items-center gap-2 text-[13px] text-tinta">
                      <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: m.color }} />
                      {m.nombre}
                    </span>
                  ))}
                </div>

                <p className="font-display text-lg leading-tight tabular-nums text-tinta @min-[640px]:text-right">{soles(Number(venta.total))}</p>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div>
                    {venta.comprobante_texto && venta.comprobante_tipo && (
                      <p className="mb-1.5 text-[13px] text-tinta/65">
                        {ETIQUETA_TIPO[venta.comprobante_tipo]} <b className="font-semibold text-tinta">{venta.comprobante_texto}</b>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <HiloComprobante estado={estado} entorno={comprobante?.entorno_transmision ?? null} transmitiendo={enVuelo} />
                      <Chip tono={chip.tono} className={chip.punteado ? "border-dashed border-tinta/30" : ""}>
                        {chip.texto}
                      </Chip>
                    </div>
                    {detalle && <p className={`mt-1.5 text-[13px] ${estado === "rechazado" ? "text-rojo-profundo" : "text-tinta/65"}`}>{detalle}</p>}
                  </div>

                  {accion?.tipo === "transmitir" && comprobante && (
                    <BotonCompacto variante={accion.alerta ? "fila-alerta" : "fila"} cargando={enVuelo} onClick={() => transmitir(comprobante.id)}>
                      {enVuelo ? "Transmitiendo…" : accion.etiqueta}
                    </BotonCompacto>
                  )}
                  {accion?.tipo === "pdf" && (
                    <BotonCompacto variante="fila" onClick={() => window.open(accion.href, "_blank", "noopener,noreferrer")}>
                      {accion.etiqueta}
                    </BotonCompacto>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-tinta/10 px-5 py-3.5 text-xs text-tinta/65">
            <span className="basis-full">Cómo se lee el hilo: venta · número reservado · enviado a SUNAT · aceptado</span>
            <span className="inline-flex items-center gap-2.5">
              <HiloComprobante estado="pendiente" entorno={null} />
              Pendiente de enviar
            </span>
            <span className="inline-flex items-center gap-2.5">
              <HiloComprobante estado="enviado" entorno="produccion" />
              Enviado, esperando a SUNAT
            </span>
            <span className="inline-flex items-center gap-2.5">
              <HiloComprobante estado="aceptado" entorno="produccion" />
              Aceptado
            </span>
            <span className="inline-flex items-center gap-2.5">
              <HiloComprobante estado="rechazado" entorno="produccion" />
              Rechazado
            </span>
          </div>
        </>
      )}
    </div>
  );
}
