import type { VentaDelDia } from "@/lib/comprobantes-reglas";
import { ESTADO_ESTILO, ESTADO_ETIQUETA, ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

function textoItems(v: VentaDelDia) {
  return v.items
    .map((i) => `${i.referencia}${[i.talla, i.color].filter(Boolean).length ? ` (${[i.talla, i.color].filter(Boolean).join("/")})` : ""} x${i.cantidad}`)
    .join(" · ");
}

// "Todo lo que se vendió hoy" (pedido de Felipe, 2026-09-12), en un solo
// vistazo desde Facturación: qué salió, quién lo vendió, cómo se pagó y si
// ya tiene boleta/factura o todavía no. Las tarjetas de arriba (vendido, ventas, por enviar,
// ticket promedio) las dibuja `ResumenTarjetas`; esta lista es lo que la rebanada B reemplaza
// por «Actividad de hoy» con el hilo del comprobante. Antes esta pregunta no tenía una
// sola pantalla — había que cruzar Caja (cuadre de efectivo) con
// Comprobantes (solo lo ya facturado, filtrado por MES) a mano.
//
// Es de solo lectura y por eso NO es "use client": la RPC
// (`fn_ventas_del_dia`) ya resuelve el filtro por rol (líder ve todo,
// integrante solo su ubicación), así que esta pantalla solo dibuja lo que
// llega — ninguna decisión de permisos vive acá.
export function VentasDelDiaPanel({ ventas }: { ventas: VentaDelDia[] }) {
  const hoy = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Ventas de hoy</p>
          <h2 className="font-display mt-0.5 text-xl capitalize text-tinta">{hoy}</h2>
        </div>
      </div>

      {ventas.length === 0 ? (
        <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
          Sin ventas registradas hoy todavía.
        </p>
      ) : (
        <div className="space-y-2">
          {ventas.map((v) => (
            <div key={v.venta_id} className="card-cayla flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="w-14 shrink-0">
                <p className="font-display text-lg tabular-nums text-tinta">{v.hora}</p>
                <p className="label-cayla text-[10px] text-tinta/55">{v.ubicacion_nombre}</p>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-tinta">{textoItems(v)}</p>
                <p className="mt-0.5 text-xs text-tinta/65">
                  {v.cliente_nombre} · {v.vendedor} · {v.metodos_pago ?? "—"}
                </p>
              </div>

              <div className="text-right">
                <p className="font-display text-lg tabular-nums text-tinta">{money(Number(v.total))}</p>
              </div>

              <div className="shrink-0">
                {v.comprobante_texto && v.comprobante_tipo && v.comprobante_estado ? (
                  <div className="text-right">
                    <p className="text-xs font-medium text-tinta">
                      {ETIQUETA_TIPO[v.comprobante_tipo]} {v.comprobante_texto}
                    </p>
                    <span
                      className={`label-cayla mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[10px] ${ESTADO_ESTILO[v.comprobante_estado]}`}
                    >
                      {ESTADO_ETIQUETA[v.comprobante_estado]}
                    </span>
                  </div>
                ) : (
                  <span className="label-cayla rounded-full border border-ambar/30 bg-ambar/10 px-2.5 py-0.5 text-[10px] text-ambar-profundo">
                    Sin comprobante
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
