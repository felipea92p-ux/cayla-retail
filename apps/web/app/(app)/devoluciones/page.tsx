import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getLineasVentaParaDevolucion, getDevolucionesPendientes } from "@/lib/devoluciones";
import { DevolucionesLista } from "@/components/DevolucionesLista";

export default async function DevolucionesPage() {
  const persona = await requirePersonaActualV2();
  const [lineas, pendientes] = await Promise.all([
    getLineasVentaParaDevolucion(persona.ubicacionId),
    getDevolucionesPendientes(persona.ubicacionId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Devoluciones</h1>
        <p className="mt-1 text-sm text-tinta/65">Elige la prenda vendida que la clienta quiere devolver.</p>
      </div>

      {lineas.length === 0 && pendientes.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay ventas recientes en esta ubicación.</p>
      ) : (
        <DevolucionesLista
          lineas={lineas}
          pendientes={pendientes}
          ubicacionId={persona.ubicacionId}
          esLider={persona.rol === "lider"}
        />
      )}
    </div>
  );
}
