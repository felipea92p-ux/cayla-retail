import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getPanelCalidad } from "@/lib/calidad";
import { PanelCalidadVista } from "@/components/PanelCalidadVista";
import { Volver } from "@/components/ui/Volver";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Calidad (ADR-0214): "¿qué talla, qué proveedor o qué producto genera devoluciones?". Subpágina del panel
// comercial, solo Líder: es la pregunta de quien decide compras y producción, no la del mostrador. El candado real
// vive también en las funciones SQL (`fn_es_lider()`); esta redirección es la cortesía, no la seguridad.
export default async function CalidadPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const panel = await getPanelCalidad();

  return (
    <div className="space-y-6">
      <div data-guia="calidad.cabecera">
        {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
        <EncabezadoPagina
          sede="Todas las tiendas"
          volver={<Volver href="/comercial" a="Comercial" />}
          titulo="Qué se devuelve y por qué"
          subtitulo="Devoluciones, prendas dañadas y cambios por talla, proveedor, categoría y producto, para ver dónde está el problema."
        />
      </div>

      <PanelCalidadVista panel={panel} />
    </div>
  );
}
