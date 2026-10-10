import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { fechaEtiqueta } from "@/lib/etiqueta-precio-reglas";
import { piezaDeJson } from "@/lib/liquidacion-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { LiquidacionPantalla } from "@/components/liquidacion/LiquidacionPantalla";

// Catálogo ▸ Liquidación (ADR-0371, Felipe 2026-10-10): las prendas sueltas, de una sola unidad y con tiempo en el almacén, que la
// sede liquida SIN registrarlas en el catálogo. Cada una lleva una etiqueta con su categoría, su precio y un código que la caja
// escanea. Se mira la sede activa: cada sede liquida lo suyo (el líder cambia de sede con el selector, como en todo el ERP).
export default async function LiquidacionPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("liquidacion");
  const supabase = await createClient();
  const [lectura, categorias] = await Promise.all([
    supabase.rpc("fn_piezas_liquidacion", { p_ubicacion_id: persona.ubicacionId }),
    // Con prefijo y familia: el ejemplo de «Para reconocerla» sigue a la categoría elegida (ADR-0290).
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
  ]);
  const datos = (lectura.data ?? {}) as { precio_minimo?: number | string; piezas?: Record<string, unknown>[] };
  const hoy = hoyLima();

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Liquidación"
        subtitulo="Las prendas sueltas que se liquidan sin entrar al catálogo: cada una con su etiqueta y su precio, que se va bajando."
      />
      {lectura.error ? (
        <p role="alert" className="nota-cayla">
          No se pudieron leer las piezas de liquidación. Recarga la página; si sigue, avísale al líder.
        </p>
      ) : (
        <LiquidacionPantalla
          piezas={(datos.piezas ?? []).map(piezaDeJson)}
          categorias={categorias.data ?? []}
          minimo={Number(datos.precio_minimo ?? 10)}
          esLider={persona.rol === "lider"}
          ubicacionId={persona.ubicacionId}
          hoy={hoy}
          impreso={fechaEtiqueta(hoy)}
        />
      )}
    </div>
  );
}
