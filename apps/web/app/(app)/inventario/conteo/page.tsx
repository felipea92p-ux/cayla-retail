import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getConteoAbierto, getConteosCerradosRecientes } from "@/lib/conteos";
import { getCatalogo } from "@/lib/catalogo-v2";
import { ConteoPanel } from "@/components/ConteoPanel";

// Conteos físicos (Felipe, 2026-09-14): el backend (abrir_conteo,
// conteo_contar, cerrar_conteo) ya existía — esta es la pantalla que le
// faltaba. `InventarioNav.tsx` ya apuntaba acá; el enlace estaba muerto.
export default async function ConteoPage() {
  const persona = await requirePersonaActualV2();
  const [conteoAbierto, cerrados, catalogo] = await Promise.all([
    getConteoAbierto(persona.ubicacionId),
    getConteosCerradosRecientes(persona.ubicacionId),
    getCatalogo(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Conteo físico</h1>
        <p className="mt-1 text-sm text-tinta/65">Compara lo que dice el sistema contra lo que hay de verdad en la tienda.</p>
      </div>

      <ConteoPanel
        ubicacionId={persona.ubicacionId}
        esLider={persona.rol === "lider"}
        conteoAbierto={conteoAbierto}
        catalogo={catalogo.map((v) => ({
          varianteId: v.varianteId,
          sku: v.sku,
          referencia: v.referencia,
          talla: v.talla,
          color: v.color,
          costo: v.costo,
          codigosBarras: v.codigosBarras,
        }))}
      />

      {cerrados.length > 0 && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Conteos anteriores</p>
          <div className="card-cayla divide-y divide-tinta/10">
            {cerrados.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-tinta">
                    {c.cerradoEn && new Date(c.cerradoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                  <p className="mt-0.5 text-xs text-tinta/65">
                    Abrió {c.abiertoPorNombre} · cerró {c.cerradoPorNombre}
                  </p>
                </div>
                <p className="label-cayla text-[11px] text-tinta/65">{c.lineasContadas} líneas contadas</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
