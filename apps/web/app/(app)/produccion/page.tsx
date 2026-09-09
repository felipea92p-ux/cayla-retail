import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/server";
import { OrdenesProduccion, type OrdenRow, type OrdenLinea } from "@/components/OrdenesProduccion";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { exigir } from "@/lib/resultado";

// Producción (Taller): una sola forma de producir — la Orden de producción.
// Se abre con costo estimado y variantes, avanza por etapas (corte → confección →
// acabado, flexibles) y al cerrar confirma cuántas salieron buenas y el costo real,
// que entra al inventario del taller.
export default async function ProduccionPage() {
  const persona = await requirePersonaActual();
  const sedes = await getSedes();
  const taller = sedes.find((s) => s.tipo === "fabrica");

  const esLider = persona.rol === "lider";
  const esTaller = taller != null && persona.sedeId === taller.id;
  if (!esLider && !esTaller) redirect("/");
  if (!taller) redirect("/");

  // La cabecera solo necesita saber en qué taller estás — y `getSedes()` ya está
  // memorizada por el layout, así que no cuesta viaje. Las órdenes, que sí son consulta
  // pesada (60 órdenes + sus líneas + 500 modelos), bajan aparte. — ADR-0021.
  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Taller · {taller.codigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Órdenes de producción</h1>
        <p className="mt-1 text-sm text-tinta/70">
          Abre una orden, márcala avanzar por etapas y ciérrala al inventario cuando esté lista.
        </p>
      </div>

      <Suspense fallback={<EsqueletoTabla filas={5} />}>
        <Ordenes unidadId={taller.id} />
      </Suspense>
    </div>
  );
}

async function Ordenes({ unidadId }: { unidadId: string }) {
  const supabase = await createClient();
  const [resProducciones, resModelos] = await Promise.all([
    supabase
      .from("producciones")
      .select(
        "id, cantidad, costo_unitario, costo_tela, costo_avios, costo_maquila, precio_taller, detalle, es_muestra, estado, inventariado_at, etapas, fecha_entrega, productos(referencia, material)"
      )
      .eq("unidad_id", unidadId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("productos").select("id, referencia, material").order("referencia").limit(500),
  ]);

  // El tablero del Taller es la lista de trabajo abierto. Si se recorta en silencio, el
  // equipo se va a casa con corridas sin cerrar creyendo que no quedaba nada.
  const producciones = exigir(resProducciones, "las órdenes del Taller");
  const modelosData = exigir(resModelos, "los modelos del catálogo");

  const ids = producciones.map((p) => p.id);
  // Las líneas son las CANTIDADES por talla y color de cada orden. Si fallan, el tablero
  // muestra órdenes sin desglose y parecen vacías.
  const lineasData = ids.length
    ? exigir(
        await supabase
          .from("produccion_lineas")
          .select("produccion_id, variante_id, cantidad, variantes(talla, color)")
          .in("produccion_id", ids),
        "las líneas de las órdenes de producción"
      )
    : [];

  const lineasPorOrden = new Map<string, OrdenLinea[]>();
  for (const l of lineasData) {
    const v = Array.isArray(l.variantes) ? l.variantes[0] : l.variantes;
    const arr = lineasPorOrden.get(l.produccion_id) ?? [];
    arr.push({ varianteId: l.variante_id, talla: v?.talla ?? null, color: v?.color ?? null, cantidad: l.cantidad });
    lineasPorOrden.set(l.produccion_id, arr);
  }

  const ordenes: OrdenRow[] = (producciones ?? []).map((p) => {
    const prod = Array.isArray(p.productos) ? p.productos[0] : p.productos;
    return {
      id: p.id,
      modelo: prod?.referencia ?? "(modelo)",
      material: prod?.material ?? null,
      detalle: p.detalle ?? null,
      esMuestra: p.es_muestra,
      estado: p.estado,
      inventariado: p.inventariado_at != null,
      cantidad: p.cantidad,
      costoUnitario: Number(p.costo_unitario),
      precioTaller: Number(p.precio_taller ?? 0),
      costoTela: Number(p.costo_tela ?? 0),
      costoAvios: Number(p.costo_avios ?? 0),
      costoMaquila: Number(p.costo_maquila ?? 0),
      etapas: (p.etapas ?? {}) as Record<string, string>,
      fechaEntrega: p.fecha_entrega ?? null,
      lineas: lineasPorOrden.get(p.id) ?? [],
    };
  });

  const modelos = (modelosData ?? []).map((m) => ({ id: m.id, referencia: m.referencia }));
  const materiales = [
    ...new Set((modelosData ?? []).map((m) => m.material).filter((x): x is string => !!x && x.trim() !== "")),
  ].sort();

  return <OrdenesProduccion unidadId={unidadId} modelos={modelos} materiales={materiales} ordenes={ordenes} />;
}
