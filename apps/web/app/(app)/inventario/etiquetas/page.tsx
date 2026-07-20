import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { InventarioNav } from "@/components/InventarioNav";
import { EtiquetasGenerator } from "@/components/EtiquetasGenerator";

// Etiquetas de código de barras por SKU (Fase B). Impresas en la Brother
// QL-1110NWB (62mm), leídas por la pistola Zebra en venta, búsqueda y conteo.
export default async function EtiquetasPage() {
  const persona = await requirePersonaActual();
  const variantes = await getCatalogoConStock(persona);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Etiquetas</h1>
        <p className="mt-1 text-sm text-tinta/50">
          Código de barras por prenda — imprime al recibir y la pistola hace el resto.
        </p>
      </div>

      <InventarioNav />

      <EtiquetasGenerator
        variantes={variantes.map((v) => ({
          varianteId: v.varianteId,
          sku: v.sku,
          referencia: v.referencia,
          talla: v.talla,
          color: v.color,
          precio: v.precio,
        }))}
      />
    </div>
  );
}
