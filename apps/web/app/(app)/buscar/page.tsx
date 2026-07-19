import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { createClient } from "@/lib/supabase/server";

// Búsqueda global (el dolor #1 del negocio, nombrado por Felipe en el descubrimiento:
// "no saber si se tiene stock e ir a almacén a buscarlo a ciegas"). Resultado en
// segundos: cuánto hay, en qué sede, y en QUÉ contenedor del almacén está guardado.
// La pistola Zebra funciona aquí sin configurar nada: tipea el código y da Enter.
export default async function BuscarPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const persona = await requirePersonaActual();
  const term = (q ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const [variantes, { data: stockRows }] = await Promise.all([
    getCatalogoConStock(persona),
    supabase.from("stock").select("variante_id, cantidad, sedes(codigo, tipo), contenedores(codigo)"),
  ]);

  // varianteId → detalle por sede (cantidad + contenedor si es almacén)
  const detallePorVariante = new Map<string, { sede: string; esAlmacen: boolean; cantidad: number; contenedor: string | null }[]>();
  (stockRows ?? []).forEach((r) => {
    const sede = Array.isArray(r.sedes) ? r.sedes[0] : r.sedes;
    const contenedor = Array.isArray(r.contenedores) ? r.contenedores[0] : r.contenedores;
    if (!sede) return;
    const lista = detallePorVariante.get(r.variante_id) ?? [];
    lista.push({ sede: sede.codigo, esAlmacen: sede.tipo === "almacen", cantidad: r.cantidad, contenedor: contenedor?.codigo ?? null });
    detallePorVariante.set(r.variante_id, lista);
  });

  const resultados = term
    ? variantes
        .filter((v) =>
          `${v.sku} ${v.referencia} ${v.categoria ?? ""} ${v.familia ?? ""} ${v.talla ?? ""} ${v.color ?? ""} ${v.marca ?? ""}`
            .toLowerCase()
            .includes(term)
        )
        .slice(0, 30)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Búsqueda</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          {term ? <>&ldquo;{q}&rdquo;</> : "Escribe algo en el buscador de arriba"}
        </h1>
        {term && (
          <p className="mt-1 text-sm text-tinta/45">
            {resultados.length === 0
              ? "Sin coincidencias — revisa la escritura o prueba con menos palabras."
              : `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {resultados.map((v) => {
          const detalles = (detallePorVariante.get(v.varianteId) ?? []).filter((d) => d.cantidad > 0);
          const hayStock = v.stockTotal > 0;
          return (
            <Link
              key={v.varianteId}
              href={`/producto/${v.varianteId}`}
              className="block border border-tinta/10 bg-papel p-5 transition-colors hover:border-rojo/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-tinta">
                    {v.referencia}{" "}
                    <span className="text-tinta/45">{[v.talla, v.color].filter(Boolean).join(" · ")}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-tinta/45">
                    {[v.familia, v.categoria].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-tinta/30">{v.sku}</p>
                </div>
                <div className="text-right">
                  <p className={`font-display text-2xl ${hayStock ? "text-tinta" : "text-rojo"}`}>{v.stockTotal}</p>
                  <p className="label-cayla text-[8px] text-tinta/40">{hayStock ? "en stock" : "agotada"}</p>
                  {v.precio != null && <p className="mt-1 text-xs text-tinta/55">S/{v.precio.toFixed(2)}</p>}
                </div>
              </div>

              {detalles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-px border border-tinta/10 bg-tinta/10">
                  {detalles.map((d) => (
                    <span key={d.sede} className="bg-crema px-3 py-1.5 text-xs text-tinta/70">
                      {d.sede} <b className="font-display text-sm text-tinta">{d.cantidad}</b>
                      {d.esAlmacen && (
                        <span className="text-rojo"> · {d.contenedor ?? "sin ubicación"}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
