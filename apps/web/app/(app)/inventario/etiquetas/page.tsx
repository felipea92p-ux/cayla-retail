import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { getConteoAbierto } from "@/lib/conteo";
import { InventarioNav } from "@/components/InventarioNav";
import { EtiquetasGenerator } from "@/components/EtiquetasGenerator";

// Etiquetas para la Brother QL-1110NWB (62 mm): QR + el código legible al lado,
// verificado con la pistola Zebra el 2026-09-10 (ADR-0025).
//
// Se lee también el conteo abierto de la sede: después de contar una tienda quedan
// decenas de prendas nuevas sin etiqueta, y ése es el cierre del día de censo —
// contar, crear, imprimir todo junto, pegar.
export default async function EtiquetasPage() {
  const persona = await requirePersonaActual();
  const [variantes, conteo] = await Promise.all([
    getCatalogoConStock(persona),
    getConteoAbierto(persona),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Etiquetas</h1>
        <p className="mt-1 text-sm text-tinta/70">
          QR y código por prenda — imprime al recibir o al terminar un conteo, y la pistola hace
          el resto.
        </p>
      </div>

      <InventarioNav />

      {conteo && conteo.lineas.length > 0 && (
        <p className="card-cayla px-4 py-3 text-sm text-tinta/75">
          Hay un conteo abierto en {persona.sedeCodigo} con {conteo.lineas.length} prendas.
          Puedes imprimir todas sus etiquetas de una vez con el botón de abajo, o{" "}
          <Link href="/inventario/conteo" className="text-rojo underline underline-offset-2">
            volver al conteo
          </Link>
          .
        </p>
      )}

      <EtiquetasGenerator
        sedeCodigo={persona.sedeCodigo}
        contadasEnConteo={(conteo?.lineas ?? []).map((l) => ({
          varianteId: l.varianteId,
          contadas: l.contada,
        }))}
        variantes={variantes.map((v) => ({
          varianteId: v.varianteId,
          productoId: v.productoId,
          sku: v.sku,
          codigo: v.codigo,
          referencia: v.referencia,
          familia: v.familia,
          categoria: v.categoria,
          talla: v.talla,
          color: v.color,
          precio: v.precio,
          stockEnMiSede: v.stockPorSede[persona.sedeCodigo] ?? 0,
        }))}
      />
    </div>
  );
}
