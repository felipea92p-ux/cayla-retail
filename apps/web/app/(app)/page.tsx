import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { createClient } from "@/lib/supabase/server";
import { CatalogoList } from "@/components/CatalogoList";

export default async function InicioPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const sedesResult = await supabase.from("sedes").select("id, codigo").order("codigo");
  const sedes: { id: string; codigo: string }[] = sedesResult.data ?? [];
  const variantes = await getCatalogoConStock(persona);

  const sedeActual = sedes.find((s) => s.id === persona.sedeId) ?? {
    id: persona.sedeId,
    codigo: persona.sedeCodigo,
  };

  const bajoStock = variantes.filter((v) => v.stockTotal <= v.stockMinimo).length;
  const totalUnidades = variantes.reduce((a, v) => a + v.stockTotal, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Referencias</p>
          <p className="text-xl font-semibold text-neutral-900">{variantes.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Unidades totales</p>
          <p className="text-xl font-semibold text-neutral-900">{totalUnidades}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Bajo stock</p>
          <p className="text-xl font-semibold text-red-600">{bajoStock}</p>
        </div>
      </div>

      <CatalogoList variantes={variantes} sedeActual={sedeActual} todasLasSedes={sedes} />
    </div>
  );
}
