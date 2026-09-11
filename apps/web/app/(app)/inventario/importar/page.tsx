import { requirePersonaActual } from "@/lib/persona";
import { InventarioNav } from "@/components/InventarioNav";
import { SubirCatalogo } from "@/components/SubirCatalogo";

/**
 * Importar el catálogo de una marca desde su propio archivo.
 *
 * Primer paso de los cuatro: leer y mirar. Sin IA y sin escribir en la base —
 * si el archivo ya se ve mal acá, no tiene sentido gastar una llamada al modelo
 * para mapear columnas corridas.
 */
export default async function ImportarPage() {
  const persona = await requirePersonaActual();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Importar catálogo</h1>
        <p className="mt-1 max-w-2xl text-xs text-tinta/65">
          Sube el archivo tal como lo tienes — con sus columnas, sus títulos y sus nombres. El sistema lo
          lee primero y te lo muestra; no se guarda nada hasta que confirmes.
        </p>
      </div>

      <InventarioNav />

      {persona.rol !== "lider" ? (
        <p className="card-cayla p-4 text-xs text-tinta/65">
          Solo una Líder puede importar un catálogo completo.
        </p>
      ) : (
        <SubirCatalogo />
      )}
    </div>
  );
}
