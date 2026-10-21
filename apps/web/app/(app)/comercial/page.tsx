import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getPanelComercial } from "@/lib/comercial";
import { PanelComercialVista } from "@/components/PanelComercialVista";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BotonVer } from "@/components/ui/BotonDescargar";

// Panel comercial (ADR-0110). Responde "¿cómo va cada tienda hoy, esta semana y este mes, y contra su meta?".
// Solo Líder: es la pregunta de quien decide, no la del mostrador (mismo criterio que Compras y el Resumen de
// Inventario), y ve TODAS las tiendas a la vez — sin selector de ubicación, porque comparar tiendas es el punto.
// El candado real vive también en las tres funciones SQL (`fn_es_lider()`); esta redirección es la cortesía,
// no la seguridad. Esta página solo trae datos y elige el layout; las reglas viven en `lib/comercial-reglas.ts`.
export default async function ComercialPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const panel = await getPanelComercial();
  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Cómo va cada tienda"
        subtitulo="Lo vendido hoy, esta semana y este mes por tienda, contra su meta, con las horas fuertes y las ventas por colaboradora."
        acciones={
          <BotonVer href="/comercial/calidad" guia="comercial.calidad">
            Ver qué se devuelve
          </BotonVer>
        }
      />

      <PanelComercialVista panel={panel} />
    </div>
  );
}
