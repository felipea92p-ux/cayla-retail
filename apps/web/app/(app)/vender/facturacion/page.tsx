import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getComprobantesMes, getSeriesComprobantes, getVentasDeHoy } from "@/lib/comprobantes";
import { getProformasMes } from "@/lib/proformas";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { ProformasPanel } from "@/components/ProformasPanel";
import { VentasDelDiaPanel } from "@/components/VentasDelDiaPanel";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Facturación electrónica — rescatada de producción (2026-09-12, ver
// supabase/migrations/0010_facturacion.sql). Reserva comprobantes con
// correlativo oficial y los transmite a SUNAT por Lucode (PSE) desde la
// misma pantalla; anular es un tercer paso aparte. Toda la pantalla es de
// líder: emitir, transmitir y anular mueven documentos legales, y el
// redirect de abajo es la primera de las tres capas que lo exigen
// (pantalla, RPC, RLS).
export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const { m } = await searchParams;
  const actual = mesActualLima();
  const [anio, mes] = m && /^\d{4}-\d{1,2}$/.test(m) ? m.split("-").map(Number) : [actual.anio, actual.mes];
  const { desde, hasta } = mesLimaUTC(anio, mes);

  const [comprobantes, series, proformas, ubicaciones, ventasHoy] = await Promise.all([
    getComprobantesMes(desde, hasta),
    getSeriesComprobantes(),
    getProformasMes(desde, hasta),
    getUbicaciones(),
    // Sin ubicación: un líder ve las ventas de todas las tiendas del día,
    // que es justo lo que pidió ("todo lo que se vendió hoy") — un
    // integrante vería solo la suya igual, aunque acá nunca entra (la
    // pantalla entera es líder-only, ver el redirect de arriba).
    getVentasDeHoy(),
  ]);
  const ubicacionesOperativas = ubicaciones.filter((u) => u.tipo !== "almacen");
  const ubicacionActual = ubicacionesOperativas.find((u) => u.id === persona.ubicacionId) ?? ubicacionesOperativas[0];

  const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${mes - 1}`;
  const mesSiguiente = mes === 12 ? `${anio + 1}-1` : `${anio}-${mes + 1}`;
  const esMesActual = anio === actual.anio && mes === actual.mes;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Vender</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            Facturación · {MESES[mes - 1]} {anio}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/vender/facturacion?m=${mesPrevio}`}
            className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          >
            ← {MESES[(mes + 10) % 12]}
          </Link>
          {!esMesActual && (
            <Link
              href={`/vender/facturacion?m=${mesSiguiente}`}
              className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
            >
              {MESES[mes % 12]} →
            </Link>
          )}
        </div>
      </div>

      {/* Ventas de hoy primero: es lo más inmediato — qué pasó en el mostrador
          en las últimas horas, antes que el trabajo pendiente (proformas) o el
          historial administrativo del mes (comprobantes). */}
      <VentasDelDiaPanel ventas={ventasHoy} />

      <div className="border-t border-tinta/10 pt-8">
        {/* Proforma primero de los dos de abajo: es el trabajo pendiente
            (¿quién va a volver a comprar?), antes que el historial ya cerrado
            de comprobantes. */}
        <ProformasPanel proformas={proformas} ubicaciones={ubicacionesOperativas} ubicacionActualId={ubicacionActual?.id ?? ""} />
      </div>

      <div className="border-t border-tinta/10 pt-8">
        <ComprobantesPanel comprobantes={comprobantes} series={series} ubicaciones={ubicacionesOperativas} ubicacionActualId={ubicacionActual?.id ?? ""} />
      </div>
    </div>
  );
}
