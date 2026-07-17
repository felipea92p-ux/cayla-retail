import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente } from "@/lib/inteligencia";
import { createClient } from "@/lib/supabase/server";
import { CatalogoList } from "@/components/CatalogoList";

export default async function InicioPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();
  const esLider = persona.rol === "lider";

  const sedesResult = await supabase.from("sedes").select("id, codigo").order("codigo");
  const sedes: { id: string; codigo: string }[] = sedesResult.data ?? [];
  const { variantes, alertasReposicion, alertasTraslado } = await getCatalogoInteligente(persona);

  const sedeActual = sedes.find((s) => s.id === persona.sedeId) ?? {
    id: persona.sedeId,
    codigo: persona.sedeCodigo,
  };

  const reponerYa = variantes.filter((v) => v.reponerYa).length;
  const estancados = variantes.filter((v) => v.estancado).length;
  const totalUnidades = variantes.reduce((a, v) => a + v.stockTotal, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Referencias</p>
          <p className="text-xl font-semibold text-neutral-900">{variantes.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Unidades totales</p>
          <p className="text-xl font-semibold text-neutral-900">{totalUnidades}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Reponer ya</p>
          <p className="text-xl font-semibold text-red-600">{reponerYa}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Estancados</p>
          <p className="text-xl font-semibold text-amber-600">{estancados}</p>
        </div>
      </div>

      {esLider && (alertasReposicion.length > 0 || alertasTraslado.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {alertasReposicion.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-red-800">Reponer pronto</h2>
              <ul className="space-y-1.5 text-sm">
                {alertasReposicion.map((v) => (
                  <li key={v.varianteId}>
                    <Link href={`/producto/${v.varianteId}`} className="text-red-700 hover:underline">
                      {v.referencia} <span className="text-red-400">({v.stockTotal} vs. punto de reorden {v.reorderPoint})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {alertasTraslado.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-blue-800">Sugerencias de traslado</h2>
              <ul className="space-y-1.5 text-sm">
                {alertasTraslado.map((v) => (
                  <li key={v.varianteId}>
                    <Link href={`/producto/${v.varianteId}`} className="text-blue-700 hover:underline">
                      {v.referencia}{" "}
                      <span className="text-blue-400">
                        (a {v.sugerenciaTraslado?.sedeDestinoCodigo}, desde {v.sugerenciaTraslado?.sedeOrigenCodigo} · {v.sugerenciaTraslado?.stockOrigen} unid.)
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <CatalogoList variantes={variantes} sedeActual={sedeActual} todasLasSedes={sedes} esLider={esLider} />
    </div>
  );
}
