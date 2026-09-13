import { Suspense } from "react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getCajaAbierta, getResumenCaja } from "@/lib/caja";
import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { PuntoDeVenta } from "@/components/PuntoDeVenta";

/**
 * Vender: la caja del día de la ubicación — abrir, vender, cerrar, y ver lo vendido hoy.
 * Reconciliado con V2 el 2026-09-12 (el corte V1→V2 llegó a `main` mientras se
 * construía esto): `PuntoDeVenta.tsx` reemplaza a `VenderFormV2.tsx` como la
 * experiencia real de Vender — la pantalla mínima de V2 fue explícitamente un
 * placeholder ("no reemplaza a RegistrarVentaModal... se retoma cuando Ventas
 * entre de lleno al roadmap"). Vive dentro de `(app)` con el sidebar de AppShell,
 * sin el tope de ancho `max-w-5xl` (ver AppShell.tsx).
 */
export default async function VenderPage() {
  return (
    <Suspense fallback={<p className="label-cayla text-[11px] text-tinta/50">Cargando caja…</p>}>
      <Caja />
    </Suspense>
  );
}

async function Caja() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();
  const [variantes, caja, resStock] = await Promise.all([
    getCatalogo(),
    getCajaAbierta(persona.ubicacionId),
    supabase.from("stock").select("variante_id, cantidad").eq("ubicacion_id", persona.ubicacionId),
  ]);
  const filasStock = exigir(resStock, "el stock de esta ubicación");
  const stockPorVariante = new Map(filasStock.map((f) => [f.variante_id, f.cantidad]));

  const variantesParaVenta = variantes
    .filter((v) => v.activo)
    .map((v) => ({
      varianteId: v.varianteId,
      sku: v.sku,
      referencia: v.referencia,
      talla: v.talla,
      color: v.color,
      categoria: v.categoria,
      precio: v.precio,
      codigosBarras: v.codigosBarras,
      stockAqui: stockPorVariante.get(v.varianteId) ?? 0,
    }));

  const esperadoEnCajon = caja ? (await getResumenCaja(caja.id, caja.montoApertura)).esperadoEnCajon : null;

  return (
    <PuntoDeVenta
      ubicacionId={persona.ubicacionId}
      ubicacionEtiqueta={persona.ubicacionEtiqueta}
      cajaId={caja?.id ?? null}
      esperadoEnCajon={esperadoEnCajon}
      variantes={variantesParaVenta}
      ventasHoyNode={
        <Suspense fallback={<p className="px-1 py-4 text-center text-xs text-tinta/50">Cargando ventas de hoy…</p>}>
          <VentasDeHoy ubicacionId={persona.ubicacionId} ubicacionEtiqueta={persona.ubicacionEtiqueta} />
        </Suspense>
      }
    />
  );
}

/** `fn_ventas_del_dia` (0011_venta_con_comprobante.sql) ya trae ítems, vendedor y
 *  estado del comprobante — reemplaza el `select` a mano contra `ventas` de la
 *  versión V1. Se le pasa la ubicación siempre: aunque un Líder podría ver todas
 *  (parámetro null), en Vender importa lo que se vendió EN ESTA sede, no un
 *  consolidado — para eso está Facturación. */
async function VentasDeHoy({ ubicacionId, ubicacionEtiqueta }: { ubicacionId: string; ubicacionEtiqueta: string }) {
  const supabase = await createClient();
  const { datos: ventasHoy, fallo } = tolerar(
    await supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId }),
    "las ventas de hoy"
  );

  if (fallo) {
    return <p className="card-cayla border-rojo/30 px-4 py-4 text-center text-xs text-rojo-profundo">{fallo}</p>;
  }

  const ventas = ventasHoy ?? [];
  if (ventas.length === 0) {
    return (
      <p className="font-display card-cayla py-6 text-center text-sm text-tinta/60 italic">
        Aún no hay ventas hoy en {ubicacionEtiqueta}.
      </p>
    );
  }

  return (
    <div className="card-cayla divide-y divide-sand !p-0">
      {ventas.map((v) => (
        <div key={v.venta_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="text-tinta/60">{v.hora}</span>
          <span className="min-w-0 flex-1 truncate text-tinta/60">
            {v.comprobante_texto ?? "Sin comprobante"} {v.metodos_pago ? `· ${v.metodos_pago}` : ""}
          </span>
          <span className="font-medium text-tinta">S/{Number(v.total).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
