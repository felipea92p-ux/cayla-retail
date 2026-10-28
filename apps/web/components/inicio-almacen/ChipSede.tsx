import { tonoDeSede, type NuevoProducto } from "@/lib/inicio-almacen-reglas";

/**
 * La sigla de la sede donde se registró un producto («TRU», «AQP»): el catálogo es el mismo en todas las sedes y solo cambia
 * el inventario, así que esto dice desde dónde se dio de alta, no de quién es (ADR-0292). La de la sede de quien mira va rellena
 * y dice «tu sede» al pasar el mouse. Sin sede conocida no se pinta nada.
 */
export function ChipSede({ p }: { p: Pick<NuevoProducto, "sede" | "sedeNombre" | "propia"> }) {
  if (!p.sede) return null;
  const donde = p.sedeNombre ?? p.sede;
  return (
    <span
      className="ia-sd"
      data-t={String(tonoDeSede(p.sede))}
      data-propia={p.propia ? "" : undefined}
      title={p.propia ? `Registrado en tu sede (${donde})` : `Registrado en ${donde}`}
    >
      <i />
      <span className="sr-only">Registrado en </span>
      {p.sede}
    </span>
  );
}
