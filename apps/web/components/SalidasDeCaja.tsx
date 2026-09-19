import type { SalidaCaja } from "@/lib/compras-indicadores";

// «Salidas de caja · próximos 30 días» (maqueta 02): cuánto vence cada semana, para saber si la
// caja alcanza ANTES de la fecha y no después. Seis columnas que entrega `salidas_caja_30d()`:
// lo ya vencido, cuatro semanas desde hoy (Lima) y «Después». Sin librería de gráficos: divs con
// altura proporcional al mayor monto, como la maqueta.
//
// Colores: rojo lo vencido (hay que actuar), ámbar la semana en curso, tinta el resto. Los montos
// van sobre cada barra porque el gráfico es chico y el dato es el punto.

const ALTO_MAX = 96; // px de la barra más alta

// `salidas_caja_30d()` numera desde 0: 0 = vencido, 1 = la semana en curso, 2–4 = las que siguen y
// 5 = «Después» (el único sin fecha `hasta`).
function colorDe(s: SalidaCaja): string {
  if (s.esVencido) return "bg-rojo";
  if (s.orden === 1) return "bg-ambar"; // la semana actual
  if (s.hasta === null) return "bg-tinta/25"; // «Después»
  return "bg-tinta/55";
}

export function SalidasDeCaja({ salidas }: { salidas: SalidaCaja[] }) {
  const max = Math.max(0, ...salidas.map((s) => s.monto));
  return (
    <div className="card-cayla p-5">
      <p className="label-cayla text-[11px] text-tinta/65">Salidas de caja · próximos 30 días</p>
      {max <= 0 ? (
        <p className="mt-4 text-sm text-tinta/65">No hay pagos que venzan en los próximos 30 días.</p>
      ) : (
        <>
          <div className="mt-3 flex h-[150px] items-end gap-2.5 border-b border-tinta/10">
            {salidas.map((s) => (
              <div key={s.orden} className="flex flex-1 flex-col items-center justify-end gap-[5px]">
                <span className="text-xs tabular-nums text-tinta/75">{s.monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <div
                  className={`w-full max-w-[58px] rounded-b-sm rounded-t-md ${colorDe(s)}`}
                  style={{ height: `${Math.max(8, Math.round((s.monto / max) * ALTO_MAX))}px` }}
                  role="img"
                  aria-label={`${s.etiqueta}: ${s.monto.toFixed(2)} soles en ${s.comprobantes} comprobantes`}
                />
                <span className="whitespace-nowrap text-xs text-tinta/65">{s.etiqueta}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-tinta/55">Monto que vence en cada semana (S/). La semana actual en ámbar.</p>
        </>
      )}
    </div>
  );
}
