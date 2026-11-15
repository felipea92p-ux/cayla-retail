import { Building2, ReceiptText } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import type { Mes } from "@/lib/facturacion-reglas";
import { tiendaDeUrl } from "@/lib/reportes-ventas-reglas";
import { getReportePorEmpresa, tiendasConDosEmpresas } from "@/lib/reportes-por-empresa";
import { cifrasDeLaTienda, cobradoEnCuentasDeLaCasa, fechasParaLaBase, ladoALado, periodoDeUrl, periodoEnPalabras, plataPorCuenta } from "@/lib/reportes-por-empresa-reglas";
import { CabeceraReportes } from "@/components/reportes-ventas/CabeceraReportes";
import { FiltrosPorEmpresa } from "@/components/reportes-ventas/FiltrosPorEmpresa";
import { CifrasPorEmpresa } from "@/components/reportes-ventas/CifrasPorEmpresa";
import { DetallePorEmpresa } from "@/components/reportes-ventas/DetallePorEmpresa";
import { LadoALado } from "@/components/reportes-ventas/LadoALado";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";

// Ventas ▸ Reportes ▸ «CAYLA y CLAURE» (ADR-0667, maqueta elegida por Felipe el 2026-11-15, opción A): las ventas de una tienda donde venden dos empresas
// (hoy Tienda LIM), separadas por empresa. Lee en el servidor con `fn_reporte_ventas_por_empresa` UNA vez por período; todas las cifras salen de las mismas
// filas que se ven al bajar al detalle (`lib/reportes-por-empresa-reglas.ts`). La tienda: el líder elige entre las que tienen dos empresas; quien tiene el
// módulo en su rol, la suya si es una de ellas. La puerta del módulo `reportes_ventas` está en el layout de Reportes; la base vuelve a preguntarla.
export default async function ReportesPorEmpresaPage({ searchParams }: { searchParams: Promise<{ m?: string; desde?: string; hasta?: string; "desde-inicio"?: string; tienda?: string }> }) {
  const persona = await requirePersonaActualV2();
  const sp = await searchParams;
  const hoy = hoyLima();
  const actual: Mes = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  const periodo = periodoDeUrl(sp, hoy);

  const tiendas = await tiendasConDosEmpresas(persona).catch(() => []);
  const pedida = tiendaDeUrl(sp.tienda);
  const tienda = tiendas.find((t) => t.id === pedida) ?? tiendas[0] ?? null;
  const porEmpresa = tiendas[0]?.empresas ?? null;

  if (!tienda) {
    return (
      <div className="space-y-6">
        <CabeceraReportes sede={persona.rol === "lider" ? "Todas las tiendas" : persona.ubicacionEtiqueta} activa="empresas" porEmpresa={porEmpresa} />
        <Vacio icono={<Building2 />} titulo="Aquí vende una sola empresa">
          Esta vista separa las ventas de una tienda donde venden dos empresas. En tu tienda todo es de una.
        </Vacio>
      </div>
    );
  }

  const lectura = await getReportePorEmpresa(fechasParaLaBase(periodo), tienda.id);
  const r = lectura.datos;
  const tramo = r ? { desde: r.desde, hasta: r.hasta } : null;
  const otra = r?.empresas.find((e) => !e.casa)?.nombre ?? null;
  const enPalabras = tramo ? periodoEnPalabras(periodo, tramo, hoy) : "";

  // `.pantalla-en-vidrio` (display: contents): los bloques de esta pestaña toman las piezas elegidas (ADR-0596), sin tocar las otras dos.
  return (
    <div className="pantalla-en-vidrio">
    <div className="space-y-6">
      <CabeceraReportes sede={tienda.nombre} activa="empresas" porEmpresa={porEmpresa} />
      <FiltrosPorEmpresa periodo={periodo} tramo={tramo} actual={actual} hoy={hoy} tiendas={tiendas} tiendaId={tienda.id} otra={otra} />
      {lectura.falla ? (
        <Aviso tono={lectura.sinAcceso ? "atencion" : "error"} titulo={lectura.sinAcceso ? "Tu rol no ve estas ventas" : "No se pudieron leer las ventas"}>
          {lectura.sinAcceso ? "Pídele a quien administra los accesos que te lo active." : `${lectura.falla} Vuelve a intentarlo en un momento.`}
        </Aviso>
      ) : r && r.ventas.length === 0 ? (
        <Vacio icono={<ReceiptText />} titulo={`No hay ventas: ${enPalabras.toLowerCase()}`}>
          En {tienda.nombre} no se registró ninguna venta en ese período. Elige otro arriba.
        </Vacio>
      ) : r ? (
        <>
          <CifrasPorEmpresa c={cifrasDeLaTienda(r)} tienda={tienda.nombre} periodo={enPalabras} />
          <DetallePorEmpresa
            r={r}
            plata={plataPorCuenta(r)}
            cobradoPorLaCasa={Object.fromEntries(r.empresas.filter((e) => !e.casa).map((e) => [e.id, cobradoEnCuentasDeLaCasa(r, e.id)]))}
          >
            <LadoALado lados={ladoALado(r)} />
          </DetallePorEmpresa>
        </>
      ) : null}
    </div>
    </div>
  );
}
