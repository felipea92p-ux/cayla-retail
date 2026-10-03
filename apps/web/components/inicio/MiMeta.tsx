import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { Etiqueta, Tarjeta } from "@/components/inicio/TarjetasInicio";
import { diaMes } from "@/lib/fechas-lima";
import { reconocer, resumirMiMeta, type MiMeta } from "@/lib/mi-meta-reglas";
import { formatoSoles } from "@/lib/resumen-formato";

// ── Mi meta (ADR-0325: la integrante ve SOLO lo suyo; la meta es para acompañar, no para pagar ni evaluar) ─────────────────
// Propuesta final de Felipe, 2026-10-03 (docs/maquetas/rendimiento-vistas-2026-10/inicio-final.html): el anillo del día arriba,
// «Lo que va bien» debajo y «Tu mes» al final. Los tres son Server Components: no necesitan JavaScript.

const R = 54;
const CIRCUNFERENCIA = 2 * Math.PI * R;

/** El anillo de su meta de hoy: se llena hasta el 100 % y ahí se queda (el número del centro es el que dice cuánto). */
function Anillo({ pct, vendido, meta }: { pct: number; vendido: number; meta: number }) {
  const lleno = Math.min(100, Math.max(0, pct)) / 100;
  return (
    <div className="relative size-[150px] shrink-0">
      <svg viewBox="0 0 130 130" className="size-full -rotate-90" role="img" aria-label={`Llevas ${formatoSoles(vendido)} de ${formatoSoles(meta)}, ${pct} % de tu meta de hoy`}>
        <circle cx="65" cy="65" r={R} fill="none" strokeWidth="12" className="stroke-tinta/10" />
        <circle
          cx="65"
          cy="65"
          r={R}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-verde"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * (1 - lleno)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-[30px] leading-none text-tinta tabular-nums">{formatoSoles(vendido)}</p>
          <p className="mt-1 text-xs text-tinta/65">de {formatoSoles(meta)}</p>
        </div>
      </div>
    </div>
  );
}

export function SeccionMiMeta({ miMeta, cajaAbierta, titulo }: { miMeta: MiMeta; cajaAbierta: boolean | null; titulo: string }) {
  const r = resumirMiMeta(miMeta);
  const ventasTxt = (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`;
  // Hoy no tiene parte de la meta (descanso): no hay anillo que llenar, y no se inventa uno.
  if (r.hoy.meta === null || r.hoy.pct === null) {
    return (
      <section>
        <Etiqueta>{titulo}</Etiqueta>
        <Tarjeta etiqueta="Tus ventas de hoy" valor={formatoSoles(r.hoy.vendido)}>
          {r.hoy.ventas > 0 ? `${ventasTxt(r.hoy.ventas)} · ` : ""}Hoy no tienes parte de la meta
        </Tarjeta>
      </section>
    );
  }
  const lograda = r.hoy.pct >= 100;
  const frase = lograda
    ? "Ya pasaste tu meta de hoy."
    : r.hoy.vendido > 0
      ? `Llevas el ${r.hoy.pct} % de tu meta de hoy.`
      : `Aún sin ventas: tu meta de hoy es ${formatoSoles(r.hoy.meta)}.`;
  return (
    <section>
      <Etiqueta>{`Tu meta de hoy`}</Etiqueta>
      <div className="card-cayla flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:text-left">
        <Anillo pct={r.hoy.pct} vendido={r.hoy.vendido} meta={r.hoy.meta} />
        <div className="min-w-0">
          <p className="font-display text-[22px] leading-tight text-tinta">{frase}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {lograda && <Chip tono="verde">Meta lograda</Chip>}
            {r.hoy.ventas > 0 && <span className="text-xs text-tinta/65">{ventasTxt(r.hoy.ventas)}</span>}
          </div>
          {cajaAbierta === false && <p className="mt-2 text-xs text-tinta/65">La caja está cerrada: ábrela en Caja para vender.</p>}
          {cajaAbierta === null && <p className="mt-2 text-xs text-tinta/65">No se pudo leer la caja.</p>}
        </div>
      </div>
    </section>
  );
}

const ICONO = "grid size-10 shrink-0 place-items-center rounded-full bg-sand font-display text-lg text-tinta";

/** «Lo que va bien»: reconoce sin inventar. Si nada tiene base honesta, no se dibuja la sección. */
export function SeccionLoQueVaBien({ miMeta }: { miMeta: MiMeta }) {
  const r = reconocer(miMeta);
  const filas: { icono: string; titulo: string; detalle: string }[] = [];
  if (r.hoyLograda) filas.push({ icono: "✓", titulo: "Hoy llegaste a tu meta", detalle: "Buen día." });
  if (r.mejorDia) {
    filas.push({
      icono: "★",
      titulo: r.mejorDia.esHoy ? "Hoy es tu mejor día del mes" : `Tu mejor día del mes fue el ${diaMes(r.mejorDia.fecha)}`,
      detalle: `Vendiste ${formatoSoles(r.mejorDia.total)}${r.mejorDia.pctMeta !== null ? `, ${r.mejorDia.pctMeta} % de tu meta de ese día` : ""}.`,
    });
  }
  if (r.racha > 0) {
    filas.push({
      icono: "↗",
      titulo: `${r.racha} días seguidos cerca de tu meta`,
      detalle: "Constancia: ningún día por debajo del 85 % de tu meta en esa racha.",
    });
  }
  if (r.ticket) {
    filas.push({
      icono: "%",
      titulo: `Tu ticket subió ${r.ticket.subioPct} % frente al mes pasado`,
      detalle: `De ${formatoSoles(r.ticket.anterior)} a ${formatoSoles(r.ticket.actual)} por venta.`,
    });
  }
  if (filas.length === 0) return null;
  return (
    <section>
      <Etiqueta>Lo que va bien</Etiqueta>
      <div className="card-cayla divide-y divide-tinta/10 px-5 py-1">
        {filas.map((f) => (
          <div key={f.titulo} className="flex items-start gap-3 py-3.5">
            <span aria-hidden className={ICONO}>
              {f.icono}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tinta">{f.titulo}</p>
              <p className="mt-0.5 text-xs text-tinta/65">{f.detalle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** «Tu mes»: lo vendido contra su meta y lo que falta dicho en días de SU promedio (nunca contra otra persona). */
export function SeccionTuMes({ miMeta }: { miMeta: MiMeta }) {
  const m = resumirMiMeta(miMeta).mes;
  const { hito } = reconocer(miMeta);
  const dias = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ${n === 1 ? "día" : "días"}`;
  return (
    <section>
      <Etiqueta>Tu mes</Etiqueta>
      <div className="card-cayla p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-3xl text-tinta tabular-nums">{formatoSoles(m.vendido)}</p>
          <p className="text-[13px] text-tinta/65">
            de {formatoSoles(m.meta)} · <b className="font-semibold text-tinta">{m.pct ?? 0} %</b>
          </p>
        </div>
        <BarraAvance pct={m.pct ?? 0} marca={m.tocabaPct} className="mt-3" />
        <p className="mt-3 text-[13px] text-tinta/80">
          {hito.falta > 0 ? (
            <>
              Te faltan <b className="font-semibold">{formatoSoles(hito.falta)}</b>
              {hito.diasDePromedio !== null && hito.promedio !== null && (
                <>
                  : como {dias(hito.diasDePromedio)} de tu promedio ({formatoSoles(hito.promedio)} por día trabajado)
                </>
              )}
              {hito.diasQueQuedan > 0 && `. Quedan ${dias(hito.diasQueQuedan)}`}.
            </>
          ) : (
            "Ya llegaste a tu meta del mes."
          )}
        </p>
        {hito.proyeccion !== null && <p className="mt-1 text-xs text-tinta/65">A este ritmo cierras el mes cerca de {formatoSoles(hito.proyeccion)}.</p>}
        <p className="nota-cayla mt-4">
          La meta es para <b>acompañarte</b>: no se usa para pagar ni para evaluar. Solo ves lo tuyo; si algo no te cuadra, díselo a tu líder de sede.
        </p>
      </div>
    </section>
  );
}
