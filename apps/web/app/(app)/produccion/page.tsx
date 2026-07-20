import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { getCatalogoConStock } from "@/lib/catalogo";
import { ProduccionManager, type OrdenProduccion } from "@/components/ProduccionManager";

// Producción (Taller): el tablero de lo que se está confeccionando. Accesible para
// el Líder (desde cualquier sede) y para el equipo del Taller (sede TALLER).
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

  const [{ data: ordenes }, variantes] = await Promise.all([
    supabase
      .from("ordenes_produccion")
      .select(
        "id, cantidad_planeada, cantidad_producida, estado, etapa, fecha_inicio, nota, destino_sede_id, variantes(sku, talla, color, productos(referencia))"
      )
      .order("created_at", { ascending: false })
      .limit(80),
    getCatalogoConStock(persona),
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

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Taller · {taller.codigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Producción</h1>
        <p className="mt-1 text-sm text-tinta/50">
          Corte → Confección → Acabado. El stock nace cuando la tienda recibe el fardo.
        </p>
      </div>

      <ProduccionManager
        ordenes={filas}
        variantes={variantes.map((v) => ({
          varianteId: v.varianteId,
          sku: v.sku,
          referencia: v.referencia,
          talla: v.talla,
          color: v.color,
        }))}
        tiendas={tiendas}
        sedeTallerId={taller.id}
      />
    </div>
  );
}
