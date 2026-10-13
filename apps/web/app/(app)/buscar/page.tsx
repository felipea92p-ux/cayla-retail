import Link from "next/link";
import { Suspense } from "react";
import { getCatalogo } from "@/lib/catalogo-v2";
import { clave } from "@/lib/buscar-prenda-v2";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { CampoTexto, Boton } from "@/components/ui/campos";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getPreciosPorSede } from "@/lib/precios-sede-datos";

// Rediseño V2 (2026-09-12) — no una adaptación de la versión V1: esa dependía de
// `getCatalogoConStock`/`mapaSedes`/`contenedores`, ninguno con equivalente V2.
// `BuscadorGlobal` (el campo de la cabecera que escribía `?q=` acá) se quitó de
// `AppShell.tsx` el 2026-09-16 — esta pantalla ahora trae su propio campo, un
// `<form method="get">` nativo (sin "use client"): el navegador arma `?q=...`
// solo, sin depender de JS ni de un buscador ajeno.
export default async function BuscarPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65" data-guia="buscar.ayuda">
          Búsqueda
          <Ayuda titulo="Búsqueda">
            Para responderle a un cliente sin ir al almacén a ciegas. Te dice cuánto hay de esa
            prenda para vender y en qué tienda: no cuenta lo apartado ni lo que está en
            Cuarentena. Puedes escribir la referencia, el SKU, la talla o el color, o escanear
            la etiqueta con la pistola: es lo mismo, la pistola solo escribe el código por ti.
          </Ayuda>
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          {term ? <>&ldquo;{q}&rdquo;</> : "Buscar en el catálogo"}
        </h1>
        <form method="get" className="mt-4 flex items-end gap-3">
          <div className="max-w-sm flex-1" data-guia="buscar.campo">
            <CampoTexto
              name="q"
              etiqueta="Buscar"
              defaultValue={q ?? ""}
              placeholder="SKU, referencia, talla, color…"
              autoFocus
            />
          </div>
          <Boton type="submit" peso="primario" data-guia="buscar.boton">
            Buscar
          </Boton>
        </form>
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
  // El precio que se le dice al cliente es el de ESTA tienda (su precio propio, si tiene): el que cobra la caja aquí (Felipe 2026-10-10).
  const persona = await requirePersonaActualV2();
  const [catalogo, preciosSede] = await Promise.all([getCatalogo(), getPreciosPorSede([persona.ubicacionId])]);
  const preciosAqui = preciosSede[persona.ubicacionId] ?? {};

  const k = clave(term);
  const resultados = catalogo
    .filter((v) => v.activo)
    .filter((v) =>
      clave(`${v.sku} ${v.referencia} ${v.categoria ?? ""} ${v.talla ?? ""} ${v.color ?? ""} ${v.codigosBarras.join(" ")}`).includes(k)
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

  // «Cuánto hay» sale de la fórmula única de la base (`fn_existencias`, ADR-0270): lo DISPONIBLE para vender, sin lo
  // apartado, sin Cuarentena, sin tallas retiradas ni pruebas. Antes se sumaba la tabla `stock` en crudo, y una prenda
  // devuelta que esperaba en Cuarentena salía «en stock» (auditoría 2026-10-13, punto 19). Se piden las mismas sedes que
  // dejaba ver la tabla: el líder, todas; los demás, la suya. Y solo los productos que ya coincidieron, no el catálogo.
  const supabase = await createClient();
  const pedidas = new Set(resultados.map((r) => r.varianteId).filter((id) => id !== ID_CARGO_ESPECIAL));
  const [filas, ubicaciones] = await Promise.all([
    supabase
      .rpc("fn_existencias", {
        ...(persona.rol === "lider" ? {} : { p_ubicacion_id: persona.ubicacionId }),
        p_producto_ids: [...new Set(resultados.map((r) => r.productoId).filter(Boolean))],
      })
      .then((r) => exigir(r, "lo disponible de estos resultados")),
    supabase
      .from("ubicaciones")
      .select("id, nombre")
      .then((r) => exigir(r, "los nombres de las sedes")),
  ]);
  const nombreDe = new Map(ubicaciones.map((u) => [u.id, u.nombre]));

  // `fn_existencias` ya da una fila por prenda y sede (piso y almacén juntos): aquí solo se agrupa por prenda.
  const stockPorVariante = new Map<string, Map<string, number>>();
  filas.forEach((f) => {
    if (!pedidas.has(f.variante_id) || f.disponible <= 0) return;
    const porUbicacion = stockPorVariante.get(f.variante_id) ?? new Map<string, number>();
    const nombre = nombreDe.get(f.ubicacion_id) ?? "—";
    porUbicacion.set(nombre, (porUbicacion.get(nombre) ?? 0) + f.disponible);
    stockPorVariante.set(f.variante_id, porUbicacion);
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-tinta/65" data-guia="buscar.conteo">
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
            <div key={v.varianteId} className="card-cayla p-5" data-guia="buscar.resultado">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-tinta">
                    {v.referencia}{" "}
                    <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join(" · ")}</span>
                  </p>
                  {v.categoria && <p className="mt-0.5 text-xs text-tinta/65">{v.categoria}</p>}
                  <p className="mt-1 font-mono text-[11px] text-tinta/65">{v.sku}</p>
                </div>
                <div className="text-right" data-guia="buscar.stock">
                  <p className={`font-display text-2xl ${hayStock ? "text-tinta" : "text-rojo"}`}>{stockTotal}</p>
                  <p className="label-cayla text-[10px] text-tinta/65">{hayStock ? "en stock" : "agotada"}</p>
                  <p className="mt-1 text-xs text-tinta/70">S/{(preciosAqui[v.varianteId] ?? v.precio).toFixed(2)}</p>
                </div>
              </div>

              {detalles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12" data-guia="buscar.sedes">
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
      <Link href="/productos" className="label-cayla text-[11px] text-tinta/65 hover:text-rojo" data-guia="buscar.catalogo">
        Ver catálogo completo →
      </Link>
    </div>
  );
}
