import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getPanelCalidad } from "@/lib/calidad";
import { PanelCalidadVista } from "@/components/PanelCalidadVista";

// Calidad (ADR-0214): "¿qué talla, qué proveedor o qué producto genera devoluciones?". Subpágina del panel
// comercial, solo Líder: es la pregunta de quien decide compras y producción, no la del mostrador. El candado real
// vive también en las funciones SQL (`fn_es_lider()`); esta redirección es la cortesía, no la seguridad.
export default async function CalidadPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const panel = await getPanelCalidad();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/comercial" className="underline-offset-2 hover:underline">
            Comercial
          </Link>{" "}
          · Calidad
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Qué se devuelve y por qué</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Devoluciones, prendas dañadas y cambios por talla, proveedor, categoría y producto, para ver dónde está el problema.
        </p>
      </div>

      <PanelCalidadVista panel={panel} />
    </div>
  );
}
