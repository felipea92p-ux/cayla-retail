import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { OrdenesProduccion, type OrdenRow, type OrdenLinea } from "@/components/OrdenesProduccion";

// Producción (Taller): una sola forma de producir — la Orden de producción.
// Se abre con costo estimado y variantes, avanza por etapas (corte → confección →
// acabado, flexibles) y al cerrar confirma cuántas salieron buenas y el costo real,
// que entra al inventario del taller.
export default async function ProduccionPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const { data: sedes } = await supabase.from("sedes").select("id, codigo, tipo");
  const taller = (sedes ?? []).find((s) => s.tipo === "fabrica");

  const esLider = persona.rol === "lider";
  const esTaller = taller != null && persona.sedeId === taller.id;
  if (!esLider && !esTaller) redirect("/");
  if (!taller) redirect("/");

  const [{ data: producciones }, { data: modelosData }] = await Promise.all([
    supabase
      .from("producciones")
      .select(
        "id, cantidad, costo_unitario, costo_tela, costo_avios, costo_maquila, precio_taller, detalle, es_muestra, estado, inventariado_at, etapas, fecha_entrega, productos(referencia, material)"
      )
      .eq("unidad_id", taller.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("productos").select("id, referencia, material").order("referencia").limit(500),
  ]);

  const ids = (producciones ?? []).map((p) => p.id);
  const { data: lineasData } = ids.length
    ? await supabase
        .from("produccion_lineas")
        .select("produccion_id, variante_id, cantidad, variantes(talla, color)")
        .in("produccion_id", ids)
    : { data: [] };

  const lineasPorOrden = new Map<string, OrdenLinea[]>();
  for (const l of lineasData ?? []) {
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

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Taller · {taller.codigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Órdenes de producción</h1>
        <p className="mt-1 text-sm text-tinta/50">
          Abre una orden, márcala avanzar por etapas y ciérrala al inventario cuando esté lista.
        </p>
      </div>

      <OrdenesProduccion unidadId={taller.id} modelos={modelos} materiales={materiales} ordenes={ordenes} />
    </div>
  );
}
