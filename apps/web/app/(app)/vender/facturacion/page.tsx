import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getComprobantesMes, getSeriesComprobantes } from "@/lib/comprobantes";
import { getProformasMes } from "@/lib/proformas";
import { mesActualLima, mesLimaUTC } from "@/lib/finanzas-nucleo";
import { createClient } from "@/lib/supabase/server";
import { VenderNav } from "@/components/VenderNav";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { ProformasPanel } from "@/components/ProformasPanel";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Facturación electrónica. Reserva el correlativo oficial con
// `emitir_comprobante` y transmite a SUNAT vía Lucode (el PSE elegido,
// ADR-0005) desde el botón "Transmitir" de cada fila.
// Vive en Vender, no en Finanzas (movido 2026-09-03, pedido de Felipe): emitir
// un comprobante cierra una venta, no es un reporte financiero.
//
// QUIÉN ENTRA: cualquier colaboradora con sesión, no solo un Líder. Quien
// atiende el mostrador es quien emite la boleta — dejarlo en manos del Líder
// significaba que 19 de los 24 logins activos no podían cerrar una venta. El
// candado real vive en la base: `emitir_comprobante` valida `puede_operar_sede`
// y rechaza emitir a nombre de una sede ajena, así que el redirect por rol que
// había acá no protegía nada que la base no protegiera mejor. Lo que sí sigue
// siendo de Líder es ADMINISTRAR (registrar la serie que autorizó SUNAT y
// elegir la sede del comprobante): eso viaja como `puedeAdministrarSeries`.
export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await requirePersonaActual();
  const esLider = persona.rol === "lider";

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
      <ProformasPanel
        proformas={proformas}
        sedes={sedes}
        sedeActualId={sedeActual?.id ?? ""}
        puedeElegirSede={esLider}
      />

      <div className="border-t border-tinta/10 pt-8">
        <ComprobantesPanel
          comprobantes={comprobantes}
          series={series}
          sedes={sedes}
          sedeActualId={sedeActual?.id ?? ""}
          puedeAdministrarSeries={esLider}
        />
      </div>
    </div>
  );
}
