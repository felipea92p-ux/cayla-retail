import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getPanelRentabilidad } from "@/lib/rentabilidad";
import { PanelRentabilidadVista } from "@/components/PanelRentabilidadVista";

// Rentabilidad (ADR-0118): "¿qué vendo mucho pero deja poco, y qué deja mucho pero rota lento?". Subpágina del panel
// comercial, solo Líder: es la pregunta de quien decide precios y compras, no la del mostrador. El candado real vive también
// en la función SQL (`fn_es_lider()`); esta redirección es la cortesía, no la seguridad.
export default async function RentabilidadPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const panel = await getPanelRentabilidad();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/comercial" className="underline-offset-2 hover:underline">
            Comercial
          </Link>{" "}
          · Rentabilidad
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Qué deja y qué rota</h1>
        <p className="mt-1 text-sm text-tinta/65">
          El margen real de lo vendido, sin IGV, por categoría, proveedor, temporada y producto, junto con lo que tarda en rotar.
        </p>
      </div>

      <PanelRentabilidadVista panel={panel} />
    </div>
  );
}
