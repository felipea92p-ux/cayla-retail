import { exigirPermiso } from "@/lib/persona-actual";
import { opcional } from "@/lib/resultado";
import { getComprobantesMes, getExtrasDeComprobantes, getResumenPorEnviar } from "@/lib/comprobantes";
import { hoyLimaUTC } from "@/lib/fecha-lima";
import { tiendasOperativas } from "@/lib/facturacion-reglas";
import { montosPorTramo } from "@/lib/comprobantes-graficos-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { ComprobantesTarjetas } from "@/components/ComprobantesTarjetas";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";
import { PeriodoComprobantes } from "@/components/PeriodoComprobantes";

// Hoy = la base de Comprobantes (Felipe, 2026-09-26; spike `docs/maquetas/comprobantes-conectado-2026-09/`):
// los comprobantes del día con sus cifras y gráficos, y lo que se puede hacer con cada uno (ver la venta,
// reenviarlo, un cambio o una devolución). «Este mes» (`/emitidos`) es la misma vista con el mes entero.
// Lo que antes era la base, Series, vive en `/series`.
export default async function HoyPage() {
  const persona = await exigirPermiso("facturar");
  const ahora = new Date();
  const { desde, hasta } = hoyLimaUTC(ahora.getTime());

  // Los comprobantes de hoy son plata: sin ellos la pantalla no se dibuja (`exigir`). La cola de SUNAT es
  // secundaria: si falla llega `null` y sus tarjetas lo dicen.
  const [comprobantes, porEnviar, ubicaciones] = await Promise.all([
    getComprobantesMes(desde, hasta),
    opcional(getResumenPorEnviar(), "la cola de SUNAT (Hoy)"),
    getUbicaciones(),
  ]);
  // Lo que conecta cada comprobante con su venta, la clienta y Posventa. Nunca tumba la vista (`tolerar` adentro).
  const extras = await getExtrasDeComprobantes(comprobantes);

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <PeriodoComprobantes activo="hoy" />
      <ComprobantesTarjetas comprobantes={comprobantes} porEnviar={porEnviar} periodo="hoy" ahora={ahora} tramos={montosPorTramo(comprobantes, "hora")} />
      <ComprobantesPanel
        comprobantes={comprobantes}
        periodo="hoy"
        esLider={persona.rol === "lider"}
        extras={extras}
        tiendas={tiendasOperativas(ubicaciones).map(({ id, nombre }) => ({ id, nombre }))}
      />
    </div>
  );
}
