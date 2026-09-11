import { requirePersonaActual } from "@/lib/persona";
import { InventarioNav } from "@/components/InventarioNav";
import { ConteoPanel } from "@/components/ConteoPanel";
import { RegistroServiceWorker } from "@/components/RegistroServiceWorker";
import { getConteoAbierto, getCatalogoParaConteo, getCategorias, getColores } from "@/lib/conteo";

/**
 * Conteo físico — la pantalla del censo.
 *
 * Es la misma herramienta para dos cosas que parecían distintas: traer las 300-900
 * prendas al sistema por primera vez, y mantener el inventario honesto después. Un
 * conteo que puede crear prendas al vuelo ES un censo (ADR-0027).
 *
 * Todo se carga en paralelo y de una vez: una vez abierta, la pantalla no vuelve al
 * servidor por cada escaneo. Ver el comentario de `ConteoPanel` sobre por qué acá está
 * PROHIBIDO el `router.refresh()` que usan los demás modales del repo.
 */
export default async function ConteoPage() {
  const persona = await requirePersonaActual();

  const [conteo, catalogo, categorias, colores] = await Promise.all([
    getConteoAbierto(persona),
    getCatalogoParaConteo(persona),
    getCategorias(),
    getColores(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Conteo</h1>
        <p className="mt-1 text-xs text-tinta/65">
          {conteo
            ? "Escanea con la pistola o escribe el nombre. Lo contado no entra al inventario hasta que la Líder cierra."
            : "Cuenta lo que hay de verdad en el piso y deja que el sistema se corrija."}
        </p>
      </div>

      <InventarioNav />

      {/* Registra `public/sw.js` — es lo que hace que ESTA pantalla vuelva a abrir con el
          router muerto. Se monta acá y no en el layout: el worker existe para el censo, y
          cuantos menos navegadores lo tengan instalado, menos superficie hay (ADR-0034). */}
      <RegistroServiceWorker />

      <ConteoPanel
        persona={{ sedeId: persona.sedeId, sedeCodigo: persona.sedeCodigo, esLider: persona.rol === "lider" }}
        conteo={conteo}
        catalogo={catalogo}
        categorias={categorias}
        colores={colores}
        generadoEn={new Date().toISOString()}
      />
    </div>
  );
}
