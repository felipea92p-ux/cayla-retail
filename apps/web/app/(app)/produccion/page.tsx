import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { getCatalogoConStock } from "@/lib/catalogo";
import { ProduccionManager, type OrdenProduccion } from "@/components/ProduccionManager";
import { ProduccionCosteo, type LoteRow } from "@/components/ProduccionCosteo";

// Producción (Taller): registrar lotes con su costo directo (tela + avíos), ver el
// semáforo de rentabilidad por modelo, y el tablero de lo que está en curso por etapa.
export default async function ProduccionPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const { data: sedes } = await supabase.from("sedes").select("id, codigo, tipo");
  const taller = (sedes ?? []).find((s) => s.tipo === "fabrica");
  const tiendas = (sedes ?? []).filter((s) => s.tipo === "tienda").map((s) => ({ id: s.id, codigo: s.codigo }));

  const esLider = persona.rol === "lider";
  const esTaller = taller != null && persona.sedeId === taller.id;
  if (!esLider && !esTaller) redirect("/");
  if (!taller) redirect("/");

  const [{ data: ordenes }, variantes, { data: producciones }, { data: modelosData }] = await Promise.all([
    supabase
      .from("ordenes_produccion")
      .select(
        "id, cantidad_planeada, cantidad_producida, estado, etapa, fecha_inicio, nota, destino_sede_id, variantes(sku, talla, color, productos(referencia))"
      )
      .order("created_at", { ascending: false })
      .limit(80),
    getCatalogoConStock(persona),
    supabase
      .from("producciones")
      .select("id, fecha, cantidad, costo_unitario, precio_taller, detalle, es_muestra, productos(referencia)")
      .eq("unidad_id", taller.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("productos").select("id, referencia").order("referencia").limit(500),
  ]);

  const codigoDe = new Map((sedes ?? []).map((s) => [s.id, s.codigo]));
  const filas: OrdenProduccion[] = (ordenes ?? []).map((o) => {
    const variante = Array.isArray(o.variantes) ? o.variantes[0] : o.variantes;
    const producto = variante ? (Array.isArray(variante.productos) ? variante.productos[0] : variante.productos) : null;
    return {
      id: o.id,
      referencia: producto?.referencia ?? "(sin referencia)",
      talla: variante?.talla ?? null,
      color: variante?.color ?? null,
      sku: variante?.sku ?? "",
      cantidadPlaneada: o.cantidad_planeada,
      cantidadProducida: o.cantidad_producida,
      estado: o.estado,
      etapa: o.etapa,
      destinoCodigo: o.destino_sede_id ? codigoDe.get(o.destino_sede_id) ?? null : null,
      fechaInicio: o.fecha_inicio,
      nota: o.nota,
    };
  });

  const lotes: LoteRow[] = (producciones ?? []).map((p) => {
    const prod = Array.isArray(p.productos) ? p.productos[0] : p.productos;
    return {
      id: p.id,
      fecha: p.fecha,
      cantidad: p.cantidad,
      costoUnitario: Number(p.costo_unitario),
      precioTaller: Number(p.precio_taller ?? 0),
      esMuestra: p.es_muestra,
      modelo: prod?.referencia ?? "(modelo)",
      detalle: p.detalle ?? null,
    };
  });

  const modelos = (modelosData ?? []).map((m) => ({ id: m.id, referencia: m.referencia }));

  const opciones = variantes.map((v) => ({
    varianteId: v.varianteId,
    sku: v.sku,
    referencia: v.referencia,
    talla: v.talla,
    color: v.color,
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Taller · {taller.codigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Producción</h1>
        <p className="mt-1 text-sm text-tinta/50">
          Registra tus lotes con su costo y decide qué modelos te convienen.
        </p>
      </div>

      <ProduccionCosteo unidadId={taller.id} modelos={modelos} lotes={lotes} />

      <div className="border-t border-tinta/10 pt-6">
        <p className="label-cayla mb-4 text-[10px] text-tinta/45">En curso · corte → confección → acabado</p>
        <ProduccionManager ordenes={filas} variantes={opciones} tiendas={tiendas} sedeTallerId={taller.id} />
      </div>
    </div>
  );
}
