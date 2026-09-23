"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { TriangleAlert, X } from "lucide-react";
import type { EstadoExactitud } from "@/lib/resumen-reglas";

// Aviso de exactitud (ADR-0101 decisión 7, afinado en ADR-0121). Es una
// advertencia sobre la CONFIANZA de las recomendaciones, no un error: con un
// conteo cerrado reciente y exacto no aparece (queda solo la línea discreta de
// «validado»). Es ámbar y no rojo a propósito: el rojo del Resumen es urgencia
// de inventario, y un inventario sin contar no es una urgencia de hoy.
//
// Forma (rediseño 2026-09-22, decisión de Felipe: «franja»): una línea fina a todo el ancho BAJO el título, no una
// tarjeta al lado del título. Sigue a la vista, pero no le quita jerarquía al análisis: el título manda y el aviso
// acompaña. Mismo patrón que la franja de atención de Traslados.

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" });

// El «cerrado» vive en sessionStorage (solo esta pestaña) y se lee con
// useSyncExternalStore: en el servidor siempre es «abierto» y el navegador lo
// corrige al hidratar. Cualquier fallo del almacenamiento se ignora.
const EVENTO_CIERRE = "resumen-aviso-exactitud";
const suscribir = (aviso: () => void) => {
  window.addEventListener(EVENTO_CIERRE, aviso);
  return () => window.removeEventListener(EVENTO_CIERRE, aviso);
};
const estaCerrado = (clave: string) => {
  try {
    return sessionStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
};

function textos(e: EstadoExactitud): { titulo: string; detalle: string } {
  switch (e.estado) {
    case "pendiente":
      return { titulo: "Exactitud de inventario aún no validada", detalle: "Último conteo: pendiente. Los datos pueden tener diferencias." };
    case "antiguo":
      return { titulo: "El último conteo ya es antiguo", detalle: `Último conteo el ${fecha(e.ultimoConteo!)} (hace ${e.diasDesde} días). Los datos pueden haber cambiado.` };
    case "baja":
      return { titulo: "Exactitud de inventario por mejorar", detalle: `Último conteo el ${fecha(e.ultimoConteo!)}: ${e.porcentaje}% de las líneas estaban correctas.` };
    default:
      return { titulo: "", detalle: "" };
  }
}

export function ResumenBanner({ exactitud, ubicacionId }: { exactitud: EstadoExactitud; ubicacionId: string }) {
  const clave = `resumen-exactitud-cerrada:${ubicacionId}:${exactitud.estado}`;
  const [cerradoAqui, setCerradoAqui] = useState(false);
  const cerradoGuardado = useSyncExternalStore(suscribir, () => estaCerrado(clave), () => false);
  const cerrado = cerradoAqui || cerradoGuardado;

  if (exactitud.estado === "vigente" || cerrado) return null;
  const { titulo, detalle } = textos(exactitud);

  return (
    <div role="status" className="anim-entra flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-ambar/30 bg-ambar/[0.07] py-2.5 pl-3.5 pr-2 text-[13px]">
      <TriangleAlert aria-hidden strokeWidth={1.75} className="h-4 w-4 shrink-0 text-ambar" />
      <p className="min-w-0 flex-1 basis-64 text-taupe">
        <span className="font-semibold text-tinta">{titulo}.</span> {detalle}
      </p>
      <Link href="/inventario/conteo" className="btn-cayla btn-enlace shrink-0 text-[13px]">
        Ir a conteo →
      </Link>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => {
          try {
            sessionStorage.setItem(clave, "1");
            window.dispatchEvent(new Event(EVENTO_CIERRE));
          } catch {
            /* sin almacenamiento: se cierra solo hasta recargar */
          }
          setCerradoAqui(true);
        }}
        className="shrink-0 rounded-sm p-1 text-tinta/50 transition-colors hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-tinta/40"
      >
        <X aria-hidden strokeWidth={1.5} className="h-4 w-4" />
      </button>
    </div>
  );
}
