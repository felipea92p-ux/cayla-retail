import type { CierreCaja } from "@/lib/caja";
import { cuadra, etiquetaDestino } from "@/lib/caja-cierre-reglas";

function money(n: number) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cuando(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Con la caja cerrada (ADR-0186): cuánto quedó en el cajón, quién cerró, si cuadró y a dónde se fue el resto. Es el
 * contexto de «Antes de abrir, cuenta el cajón». Los cierres anteriores a ADR-0186 no guardaron el fondo: se muestra
 * lo contado y se dice que no quedó registrado cuánto quedó.
 */
export function UltimoCierreCaja({ cierre }: { cierre: CierreCaja }) {
  const diferencia = cierre.montoCierreReal - cierre.montoCierreSistema;
  const cuadro = cuadra(diferencia, 0);
  return (
    <section className="card-cayla p-5" aria-labelledby="ultimo-cierre">
      <p id="ultimo-cierre" className="label-cayla text-[11px] text-taupe-profundo">
        Último cierre
      </p>
      {cierre.montoFondo !== null ? (
        <>
          <p className="font-display mt-2 text-5xl leading-none tabular-nums text-tinta">{money(cierre.montoFondo)}</p>
          <p className="mt-1.5 text-sm text-tinta/65">
            quedaron en el cajón · {cuando(cierre.cerradaEn)}
            {cierre.cerradaPorNombre && ` · cerró ${cierre.cerradaPorNombre}`}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-tinta/65">
          {cuando(cierre.cerradaEn)}
          {cierre.cerradaPorNombre && ` · cerró ${cierre.cerradaPorNombre}`}. Ese cierre es anterior al registro de
          traslados: no quedó anotado cuánto se dejó en el cajón.
        </p>
      )}
      <dl className="mt-4 text-sm">
        <Fila etiqueta="El sistema esperaba" valor={money(cierre.montoCierreSistema)} />
        <Fila
          etiqueta={
            <>
              Se contó en físico
              <span
                className={`ml-2 inline-block rounded-full px-2 py-px text-xs font-semibold ${
                  cuadro ? "bg-verde/15 text-verde-profundo" : "bg-rojo/10 text-rojo-profundo"
                }`}
              >
                {cuadro ? "Cuadró" : `${diferencia > 0 ? "Sobró" : "Faltó"} ${money(Math.abs(diferencia))}`}
              </span>
            </>
          }
          valor={money(cierre.montoCierreReal)}
        />
        {cierre.traslados.map((t, i) => (
          <Fila
            key={i}
            etiqueta={
              <>
                Trasladado · {etiquetaDestino(t.destino)}
                {t.referencia && <span className="block text-xs text-tinta/50">{t.referencia}</span>}
              </>
            }
            valor={`− ${money(t.monto)}`}
          />
        ))}
        {cierre.montoFondo !== null && (
          <Fila etiqueta={<span className="font-semibold text-tinta">Quedó en el cajón</span>} valor={money(cierre.montoFondo)} fuerte />
        )}
      </dl>
    </section>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: React.ReactNode; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-tinta/[0.07] py-2">
      <dt className="text-tinta/65">{etiqueta}</dt>
      <dd className={`whitespace-nowrap tabular-nums ${fuerte ? "font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}
