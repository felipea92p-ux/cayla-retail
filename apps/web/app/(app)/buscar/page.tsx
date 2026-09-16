import Link from "next/link";
import { Suspense } from "react";
import { getCatalogo } from "@/lib/catalogo-v2";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";

// Rediseño V2 (2026-09-12) — no una adaptación de la versión V1: esa dependía de
// `getCatalogoConStock`/`mapaSedes`/`contenedores`, ninguno con equivalente V2.
// Encontrado en producción: el buscador del header (`BuscadorGlobal` en
// AppShell.tsx) quedó activo al recortar la navegación de Fase 1, pero seguía
// apuntando a esta ruta sin adaptar — un enlace que compilaba y rompía al usarse,
// justo lo que la Fase 1 prohibía dejar pasar. Bug real reportado por Felipe.
export default async function BuscarPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          Búsqueda
          <Ayuda titulo="Búsqueda">
            Para responderle a una clienta sin ir al almacén a ciegas. Te dice cuánto hay de esa
            prenda y en qué ubicación. Puedes escribir la referencia, el SKU, la talla o el
            color, o escanear la etiqueta con la pistola: es lo mismo, la pistola solo escribe
            el código por ti.
          </Ayuda>
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          {term ? <>&ldquo;{q}&rdquo;</> : "Escribe algo en el buscador de arriba"}
        </h1>
      </div>

      {term === "" ? null : (
        <Suspense key={term} fallback={<EsqueletoTabla filas={4} />}>
          <Resultados term={term.toLowerCase()} textoOriginal={q ?? ""} />
        </Suspense>
      )}
    </div>
  );
}

async function Resultados({ term, textoOriginal }: { term: string; textoOriginal: string }) {
  const catalogo = await getCatalogo();

  const resultados = catalogo
    .filter((v) => v.activo)
    .filter((v) =>
      `${v.sku} ${v.referencia} ${v.categoria ?? ""} ${v.talla ?? ""} ${v.color ?? ""}`
        .toLowerCase()
        .includes(term)
    )
    .slice(0, 30);

  if (resultados.length === 0) {
    return (
      <p className="text-sm text-tinta/65">
        Sin coincidencias para &ldquo;{textoOriginal}&rdquo; — revisa la escritura o prueba con menos
        palabras.
      </p>
    );
  }

  // El stock por ubicación se pide SOLO para lo que ya matcheó, no para el
  // catálogo entero: RLS acota las filas a lo que la persona puede ver
  // (líder = todas, integrante = la suya), así que esto ya sale bien
  // recortado sin filtrar nada a mano acá.
  const supabase = await createClient();
  const stockRows = exigir(
    await supabase
      .from("stock")
      .select("variante_id, cantidad, ubicacion:ubicaciones ( nombre )")
      .in(
        "variante_id",
        resultados.map((r) => r.varianteId)
      )
      // La centinela del «Monto manual» no es una prenda: sin esto, buscar
      // «cargo» mostraba 999.999 unidades por tienda (`lib/cargo-especial.ts`).
      .neq("variante_id", ID_CARGO_ESPECIAL)
      .gt("cantidad", 0),
    "el stock de estos resultados"
  );

  // Una ubicación con piso y almacén trae 2 filas para la misma variante
  // (20260914210000_inventario_piso_almacen.sql) — acá solo importa el
  // total por ubicación, así que se suman antes de listar; sin esto, Tienda
  // Lima aparecería dos veces por la misma prenda.
  const stockPorVariante = new Map<string, Map<string, number>>();
  stockRows.forEach((r) => {
    const porUbicacion = stockPorVariante.get(r.variante_id) ?? new Map<string, number>();
    const nombre = r.ubicacion?.nombre ?? "—";
    porUbicacion.set(nombre, (porUbicacion.get(nombre) ?? 0) + r.cantidad);
    stockPorVariante.set(r.variante_id, porUbicacion);
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-tinta/65">
        {resultados.length} resultado{resultados.length === 1 ? "" : "s"}
      </p>

      <div className="space-y-3">
        {resultados.map((v) => {
          const detalles = Array.from(stockPorVariante.get(v.varianteId) ?? new Map<string, number>(), ([ubicacion, cantidad]) => ({
            ubicacion,
            cantidad,
          }));
          const stockTotal = detalles.reduce((acc, d) => acc + d.cantidad, 0);
          const hayStock = stockTotal > 0;
          return (
            <div key={v.varianteId} className="card-cayla p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-tinta">
                    {v.referencia}{" "}
                    <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join(" · ")}</span>
                  </p>
                  {v.categoria && <p className="mt-0.5 text-xs text-tinta/65">{v.categoria}</p>}
                  <p className="mt-1 font-mono text-[11px] text-tinta/65">{v.sku}</p>
                </div>
                <div className="text-right">
                  <p className={`font-display text-2xl ${hayStock ? "text-tinta" : "text-rojo"}`}>{stockTotal}</p>
                  <p className="label-cayla text-[10px] text-tinta/65">{hayStock ? "en stock" : "agotada"}</p>
                  <p className="mt-1 text-xs text-tinta/70">S/{v.precio.toFixed(2)}</p>
                </div>
              </div>

              {detalles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12">
                  {detalles.map((d, i) => (
                    <span key={`${d.ubicacion}-${i}`} className="bg-crema px-3 py-1.5 text-xs text-tinta/80">
                      {d.ubicacion} <b className="font-display text-sm text-tinta">{d.cantidad}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Link a `/producto/[varianteId]` (detalle) queda para Fase 2: esa
          pantalla también depende del catálogo V1. La tarjeta ya responde la
          pregunta que motiva la búsqueda (cuánto hay y dónde) sin necesitar
          ese detalle. */}
      <Link href="/productos" className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
        Ver catálogo completo →
      </Link>
    </div>
  );
}
