"use client";

import Link from "next/link";
import { ArrowLeftRight, Ban, BookmarkCheck, FileText, RefreshCw, RotateCcw, ShoppingBag, UserRound, type LucideIcon } from "lucide-react";
import { accionesDeVenta, recorridoDeVenta, type ClaveAccion, type ContextoAcciones, type PasoRecorrido } from "@/lib/historial-acciones-reglas";
import type { FilaHistorial } from "@/lib/ventas-historial-reglas";

// Lo que Ventas ▸ Historial agrega al detalle de una venta (ADR-0230): su recorrido —apartada, vendida, SUNAT, cambios y
// devoluciones— y «Qué hacer con esta venta», con cada acción llevando a SU pantalla con la venta ya buscada. Historial no
// cambia nada: Cambios, Devoluciones o Comprobantes deciden si se puede (y su función en la base lo vuelve a verificar).
// Es contenido del mismo `<Modal>` del detalle, así que entra en su cascada y en el celular sube con la hoja.

/** El contexto de la cuenta, serializable (la página es un Server Component): los módulos van como lista. */
export type ContextoAccionesSerializable = Omit<ContextoAcciones, "modulos"> & { modulos: string[] };

const ICONO: Record<ClaveAccion, LucideIcon> = {
  reintentar: RefreshCw,
  cambiar: ArrowLeftRight,
  devolver: RotateCcw,
  clienta: UserRound,
  apartado: BookmarkCheck,
  volver: ShoppingBag,
  comprobante: FileText,
  anular: Ban,
};

const PUNTO: Record<PasoRecorrido["tono"], string> = {
  hecho: "bg-verde",
  aviso: "bg-ambar",
  posventa: "bg-pizarra",
  apagado: "bg-papel ring-[1.5px] ring-inset ring-taupe",
};

const FECHA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function RecorridoVenta({ fila }: { fila: FilaHistorial }) {
  const pasos = recorridoDeVenta(fila);
  return (
    <section aria-label="Recorrido de la venta">
      <h3 className="label-cayla mb-2 text-[10.5px] text-taupe">Recorrido</h3>
      <ol className="relative space-y-1.5 pl-5 before:absolute before:bottom-1.5 before:left-[4px] before:top-1.5 before:w-[1.5px] before:bg-sand">
        {pasos.map((p, i) => (
          <li key={i} className="relative text-[13px] text-tinta">
            <span aria-hidden className={`absolute -left-5 top-[5px] h-[9px] w-[9px] rounded-full ${PUNTO[p.tono]}`} />
            {p.texto}
            {p.fecha && <span className="ml-1.5 text-xs text-tinta/55">{FECHA.format(new Date(p.fecha)).replace(".", "")}</span>}
          </li>
        ))}
      </ol>
      {fila.operaciones.length > 0 && (
        <p className="mt-2 text-xs text-tinta/60">
          Nº de operación: <span className="font-mono text-tinta">{fila.operaciones.join(", ")}</span>
        </p>
      )}
    </section>
  );
}

export function AccionesVenta({ fila, contexto }: { fila: FilaHistorial; contexto: ContextoAccionesSerializable }) {
  const acciones = accionesDeVenta(fila, { ...contexto, modulos: new Set(contexto.modulos) });
  if (acciones.length === 0) return null;
  return (
    <section aria-label="Qué hacer con esta venta" className="-mx-6 -mb-6 rounded-b-2xl bg-hueso px-6 pb-6 pt-4">
      <h3 className="label-cayla mb-2.5 text-[10.5px] text-taupe">Qué hacer con esta venta</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {acciones.map((a) => {
          const Icono = ICONO[a.clave];
          return (
            <Link
              key={a.clave}
              href={a.href}
              className={`flex min-h-[74px] flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-[13px] font-medium ring-1 transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo ${
                a.destacada ? "bg-tinta text-crema ring-tinta hover:ring-2" : a.peligro ? "bg-papel text-rojo-profundo ring-tinta/[0.07] hover:ring-rojo/60" : "bg-papel text-tinta ring-tinta/[0.07] hover:ring-taupe"
              }`}
            >
              <Icono className="h-4 w-4" aria-hidden />
              {a.etiqueta}
              <span className={`text-[11.5px] font-normal leading-tight ${a.destacada ? "text-crema/65" : "text-tinta/55"}`}>{a.detalle}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
