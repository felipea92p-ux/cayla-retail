import { exigirLider } from "@/lib/persona-actual";
import { getCategoriasParaCotizar, getCotizacionesMaquila } from "@/lib/cotizaciones-maquila";
import { hoyLima } from "@/lib/fechas-lima";
import { CotizacionesMaquilaPanel } from "@/components/CotizacionesMaquilaPanel";

// D-82 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`) — cargar y renovar la cotización
// de maquila externa por tipo de prenda, la referencia contra la que D-31 mide al Taller.
// Líder-only (mismo criterio que Descuentos en Facturación: un precio de referencia que
// termina afectando cómo se lee el resultado del Taller no lo carga cualquiera) y, a
// diferencia de Insumos/Órdenes, SIN exigir estar parado en el Taller — D-80: la tienda
// también consulta esta misma cifra como su costo de referencia, así que un líder de tienda
// tiene que poder abrir esta pantalla igual.
//
// A propósito FUERA del árbol de `lib/menu.ts` todavía (otra tarea de esta misma tanda lo
// está tocando — D-84, agrupar Producción bajo "Abastecimiento"): se abre por URL directa,
// `/produccion/cotizaciones-maquila`, hasta que esa pieza se enganche.
export default async function CotizacionesMaquilaPage() {
  await exigirLider();

  const [cotizaciones, categorias] = await Promise.all([getCotizacionesMaquila(), getCategoriasParaCotizar()]);

  return (
    <div className="space-y-6">
      <CotizacionesMaquilaPanel cotizaciones={cotizaciones} categorias={categorias} hoy={hoyLima()} />
    </div>
  );
}
