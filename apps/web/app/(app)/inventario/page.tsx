import Link from "next/link";
import { Suspense } from "react";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente, type VarianteInteligente } from "@/lib/inteligencia";
import { getSedes } from "@/lib/sedes";
import { InventarioNav } from "@/components/InventarioNav";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { InventarioAgrupado, type ProductoAgrupado } from "@/components/InventarioAgrupado";

/**
 * La cabecera, los botones y la navegación no dependen de ninguna consulta de catálogo —
 * solo de saber quién eres. Antes igual esperaban a que llegara TODO el inventario para
 * dibujarse, porque la página hacía `await` de todo antes de devolver JSX.
 *
 * Ahora la página solo espera la persona (que el layout ya resolvió, así que sale
 * memorizada y no cuesta viaje nuevo) y el catálogo baja por streaming dentro de su propio
 * <Suspense>. Lo que no depende de la red aparece de inmediato.
 *
 * Importante para el principio 2: esto NO guarda una copia de nada. Es la misma consulta
 * al mismo servidor, solo que la pantalla se dibuja en dos tiempos en vez de uno. No hay
 * una segunda verdad que pueda quedar desfasada — que es justo lo que sí traería
 * local-first (ADR-0018).
 */
export default async function InventarioPage() {
  const persona = await requirePersonaActual();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Catálogo</h1>
        </div>
        <div className="flex gap-2">
          {persona.rol === "lider" && (
            <Link
              href="/inventario/producto/nuevo"
              className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo"
            >
              + Nuevo producto
            </Link>
          )}
          <a
            href="/api/export/inventario"
            className="label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
          >
            Exportar Excel
          </a>
        </div>
      </div>

      <InventarioNav />

      <Suspense fallback={<EsqueletoTabla filas={8} />}>
        <Catalogo />
      </Suspense>
    </div>
  );
}

/** La parte que sí espera la red. Vive aparte para que el <Suspense> de arriba tenga qué envolver. */
async function Catalogo() {
  // `requirePersonaActual` y `getSedes` están memorizados por request (React cache), así
  // que pedirlos de nuevo acá no cuesta un viaje: se reusa lo que ya resolvió el layout.
  const persona = await requirePersonaActual();
  const [{ variantes }, todasSedes] = await Promise.all([getCatalogoInteligente(persona), getSedes()]);
  const sedesOperativas = todasSedes.filter((s) => s.tipo !== "almacen");

  // Agrupar variantes por producto — una fila por modelo, matriz de tallas adentro.
  const porProducto = new Map<string, ProductoAgrupado>();
  variantes.forEach((v: VarianteInteligente) => {
    const actual = porProducto.get(v.productoId);
    if (actual) {
      actual.variantes.push(v);
    } else {
      porProducto.set(v.productoId, {
        productoId: v.productoId,
        referencia: v.referencia,
        familia: v.familia,
        categoria: v.categoria,
        marca: v.marca,
        fotoUrl: v.fotoUrl,
        variantes: [v],
      });
    }
  });
  const productos = [...porProducto.values()].sort((a, b) => a.referencia.localeCompare(b.referencia));

  const sedeActual = sedesOperativas.find((s) => s.id === persona.sedeId) ?? {
    id: persona.sedeId,
    codigo: persona.sedeCodigo,
  };

  return <InventarioAgrupado productos={productos} sedeActual={sedeActual} todasLasSedes={sedesOperativas} />;
}
