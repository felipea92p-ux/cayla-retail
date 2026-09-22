"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { EMISOR } from "@/lib/emisor";
import { money } from "@/components/PuntoDeVenta";
import { tramosDelPlazo, textoDevolucion, type Apartado, type ClaveEstado } from "@/lib/separaciones-reglas";

/** Las iniciales de la prenda cuando su color aún no tiene foto — mismo plan B que el catálogo del Punto de venta. */
function iniciales(referencia: string) {
  return referencia.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function FotoPrenda({ fotoUrl, referencia, className = "" }: { fotoUrl: string | null | undefined; referencia: string; className?: string }) {
  return (
    <div className={`relative aspect-[4/5] shrink-0 overflow-hidden rounded-lg bg-sand/40 ${className}`}>
      {fotoUrl ? (
        <Image src={fotoUrl} alt={referencia} fill sizes="120px" className="object-cover" unoptimized />
      ) : (
        <span aria-hidden className="font-display absolute inset-0 flex items-center justify-center text-lg text-tinta/30">
          {iniciales(referencia)}
        </span>
      )}
    </div>
  );
}

const TONO_ESTADO: Record<ClaveEstado, string> = {
  vigente: "text-verde-profundo",
  porvencer: "text-ambar-profundo",
  vencida: "text-rojo-profundo",
  devolver: "text-rojo-profundo",
  cerrada: "text-tinta/55",
};

/** El estado con su punto de color. El punto de «vencido» late: es una señal que pide acción (ADR-0136). */
export function EstadoChip({ clave, texto }: { clave: ClaveEstado; texto: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold ${TONO_ESTADO[clave]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current ${clave === "vencida" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
      {texto}
    </span>
  );
}

/** 7 días de plazo + 2 de gracia (en rosa), con el día de hoy marcado. */
export function BarraPlazo({ creadaEl, hoy }: { creadaEl: string; hoy: string }) {
  return (
    <div aria-hidden className="grid grid-cols-9 gap-0.5">
      {tramosDelPlazo(creadaEl, hoy).map((t, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-sm ${
            t.momento === "hoy" ? (t.tipo === "gracia" ? "bg-rojo" : "bg-tinta") : t.momento === "pasado" ? (t.tipo === "gracia" ? "bg-rojo" : "bg-taupe/50") : t.tipo === "gracia" ? "bg-rojo/20" : "bg-sand"
          }`}
        />
      ))}
    </div>
  );
}

export function fechaCorta(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
}
export function fechaNumerica(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * El ticket de 80 mm del apartado (anticipo al apartar, final al entregar). Mismo mecanismo que `ReciboTermico`: un
 * `#comprobante-print` pegado a `<body>`; en pantalla no se ve y al imprimir es lo único que sale (globals.css).
 * Mientras el envío de anticipos a SUNAT no esté activo (ADR-0166) no lleva QR: dice que la boleta electrónica queda
 * registrada y se envía después.
 */
export function ReciboApartado({ apartado, tipo, sede, pagadoHoy }: { apartado: Apartado; tipo: "anticipo" | "final"; sede: string; pagadoHoy?: { metodo: string; monto: number }[] }) {
  const a = apartado;
  const cuerpo = (
    <div id="comprobante-print">
      <header className="rt-centro">
        <p className="rt-marca">{EMISOR.nombreComercial}</p>
        <p className="rt-negrita">
          {EMISOR.razonSocial} · RUC {EMISOR.ruc}
        </p>
        <p className="rt-tienda">{sede}</p>
      </header>
      <p className="rt-centro rt-titulo">{tipo === "anticipo" ? "BOLETA DE VENTA ELECTRÓNICA — ANTICIPO" : "BOLETA DE VENTA ELECTRÓNICA"}</p>
      <p className="rt-centro rt-numero">{tipo === "anticipo" ? a.comprobanteAnticipo : (a.comprobanteFinal ?? "")}</p>
      <p className="rt-centro rt-negrita">APARTADO {a.codigo}{tipo === "final" ? " · ENTREGADO" : ""}</p>
      <div className="rt-datos">
        <p>Clienta: {a.nombres} {a.apellidos}{a.dni ? ` · DNI ${a.dni}` : ""}</p>
        <p>Cel.: {a.celular}{a.asesora ? ` · Atendió: ${a.asesora}` : ""}</p>
      </div>
      {a.prendas.map((p) => (
        <p key={p.varianteId} className="rt-fila">
          <span>{p.cantidad} {p.referencia} {p.sku}</span>
          <span>{money((p.precioUnitario - p.descuentoUnitario) * p.cantidad)}</span>
        </p>
      ))}
      <p className="rt-fila rt-negrita"><span>Total de las prendas</span><span>{money(a.total)}</span></p>
      {tipo === "anticipo" ? (
        <>
          <p className="rt-fila"><span>Anticipo (incluye IGV)</span><span>{money(a.adelanto)}</span></p>
          <p className="rt-fila rt-total"><span>SALDO AL RECOGER</span><span>{money(a.total - a.adelanto)}</span></p>
          <p className="rt-fila rt-negrita"><span>RECOGER HASTA</span><span>{fechaNumerica(a.venceEl)}</span></p>
          <div className="rt-pie">
            <p className="rt-negrita">CONDICIONES DE TU APARTADO</p>
            <p>1. Tus prendas quedan guardadas hasta el {fechaNumerica(a.venceEl)}.</p>
            <p>2. Para recogerlas trae este comprobante o tu DNI.</p>
            <p>3. Si no las recoges a tiempo vuelven a la tienda y te devolvemos el 100% por {textoDevolucion(a)}, sin que tengas que venir.</p>
            <p>4. El precio queda congelado. Cambios y devoluciones: desde el día que recoges.</p>
          </div>
        </>
      ) : (
        <>
          <p className="rt-fila"><span>(−) Anticipo {a.comprobanteAnticipo}</span><span>−{money(a.adelanto)}</span></p>
          {(pagadoHoy ?? []).map((p, i) => (
            <p key={i} className="rt-fila"><span>Pagado hoy · {p.metodo}</span><span>{money(p.monto)}</span></p>
          ))}
          <p className="rt-fila rt-total"><span>APARTADO LIQUIDADO</span><span>{money(a.total)}</span></p>
        </>
      )}
      <p className="rt-centro rt-lema">Comprobante electrónico registrado: su envío a SUNAT se completa después.</p>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(cuerpo, document.body);
}
