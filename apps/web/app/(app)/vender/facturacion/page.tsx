import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getComprobantesMes, getSeriesComprobantes } from "@/lib/comprobantes";
import { getProformasMes } from "@/lib/proformas";
import { mesActualLima, mesLimaUTC } from "@/lib/finanzas-nucleo";
import { createClient } from "@/lib/supabase/server";
import { VenderNav } from "@/components/VenderNav";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { ProformasPanel } from "@/components/ProformasPanel";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Facturación electrónica (F3, parte 1 de 2 — ver docs/BACKLOG.md). Reserva
// comprobantes con correlativo oficial ya mismo; el envío a SUNAT queda
// pendiente de una decisión estructural (SEE propio vs. OSE) que Claude le
// planteó a Felipe antes de construir esta pantalla.
// Vive en Vender, no en Finanzas (movido 2026-09-03, pedido de Felipe): emitir
// un comprobante cierra una venta, no es un reporte financiero.
export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const { m } = await searchParams;
  const actual = mesActualLima();
  const [anio, mes] = m && /^\d{4}-\d{1,2}$/.test(m) ? m.split("-").map(Number) : [actual.anio, actual.mes];
  const { desde, hasta } = mesLimaUTC(anio, mes);

  const supabase = await createClient();
  const [comprobantes, series, proformas, sedesResult] = await Promise.all([
    getComprobantesMes(desde, hasta),
    getSeriesComprobantes(),
    getProformasMes(desde, hasta),
    supabase.from("sedes").select("id, codigo").neq("tipo", "almacen").order("codigo"),
  ]);
  const sedes = (sedesResult.data ?? []).filter(
    (s): s is { id: string; codigo: string } => s.id != null && s.codigo != null
  );
  const sedeActual = sedes.find((s) => s.id === persona.sedeId) ?? sedes[0];

  const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${mes - 1}`;
  const mesSiguiente = mes === 12 ? `${anio + 1}-1` : `${anio}-${mes + 1}`;
  const esMesActual = anio === actual.anio && mes === actual.mes;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Vender</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            Facturación · {MESES[mes - 1]} {anio}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/vender/facturacion?m=${mesPrevio}`}
            className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
          >
            ← {MESES[(mes + 10) % 12]}
          </Link>
          {!esMesActual && (
            <Link
              href={`/vender/facturacion?m=${mesSiguiente}`}
              className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
            >
              {MESES[mes % 12]} →
            </Link>
          )}
        </div>
      </div>

      <VenderNav />

      {/* Proforma primero: es el trabajo pendiente (¿quién va a volver a comprar?),
          antes que el historial ya cerrado de comprobantes (patrón Ramp, Ronda 2). */}
      <ProformasPanel proformas={proformas} sedes={sedes} sedeActualId={sedeActual?.id ?? ""} />

      <div className="border-t border-tinta/10 pt-8">
        <ComprobantesPanel comprobantes={comprobantes} series={series} sedes={sedes} sedeActualId={sedeActual?.id ?? ""} />
      </div>
    </div>
  );
}
