"use client";

import Image from "next/image";
import { useState } from "react";
import { createPortal } from "react-dom";
import { EMISOR } from "@/lib/emisor";
import { fotoOptimizable } from "@/lib/foto-prenda-reglas";
import { money } from "@/components/PuntoDeVenta";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { tramosDelPlazo, textoDevolucion, type Apartado, type ClaveEstado } from "@/lib/separaciones-reglas";

/** Las iniciales de la prenda cuando su color aún no tiene foto — mismo plan B que el catálogo del Punto de venta. */
function iniciales(referencia: string) {
  return referencia.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/**
 * La foto de la prenda, servida al tamaño en que se VE. `ancho` es el ancho en pantalla (px CSS): el optimizador de
 * Next entrega un WebP de ese ancho (y el doble en pantallas retina), no el original. Medido el 2026-09-22 en
 * producción: 31 fotos, promedio 90 KB y la mayor 199 KB; una miniatura de 44 px pesa unos 5 KB. Sin esto, la lista
 * del buscador bajaba ~0,7 MB por búsqueda. Si la foto no carga (404, host no permitido), quedan las iniciales:
 * nunca una imagen rota. Una foto de otro host se muestra sin optimizar (`fotoOptimizable`): el optimizador la
 * rechazaría tumbando la pantalla.
 */
export function FotoPrenda({
  fotoUrl,
  referencia,
  ancho,
  className = "",
}: {
  fotoUrl: string | null | undefined;
  referencia: string;
  ancho: number;
  className?: string;
}) {
  const [rota, setRota] = useState(false);
  return (
    <div className={`relative aspect-[4/5] shrink-0 overflow-hidden rounded-lg bg-sand/40 ${className}`}>
      {fotoUrl && !rota ? (
        <Image
          src={fotoUrl}
          alt={referencia}
          fill
          sizes={`${ancho}px`}
          unoptimized={!fotoOptimizable(fotoUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)}
          className="object-cover"
          onError={() => setRota(true)}
        />
      ) : (
        <span aria-hidden className={`font-display absolute inset-0 flex items-center justify-center text-tinta/30 ${ancho < 40 ? "text-[11px]" : "text-lg"}`}>
          {iniciales(referencia)}
        </span>
      )}
    </div>
  );
}

// La insignia oficial (ADR-0169): pizarra = en plazo (informativo, no semáforo), ámbar = vence pronto, rojo = pide
// acción hoy. Solo el punto de «vencido» late (señal, no adorno — ADR-0136).
const TONO_ESTADO: Record<ClaveEstado, TonoChip> = {
  vigente: "pizarra",
  porvencer: "ambar",
  vencida: "rojo",
  devolver: "rojo",
  cerrada: "neutro",
};

export function EstadoChip({ clave, texto }: { clave: ClaveEstado; texto: string }) {
  return (
    <Chip tono={TONO_ESTADO[clave]} vivo={clave === "vencida"}>
      {texto}
    </Chip>
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
