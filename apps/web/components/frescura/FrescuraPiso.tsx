import { Aviso } from "@/components/ui/Aviso";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { CLASE_TRAMO_PISO, NOMBRE_TRAMO_PISO, TRAMOS_DEL_100, porcentajes, solesEnteros, type FamiliaPiso, type PuertaPiso, type TramoPiso } from "@/lib/frescura-piso";

// La tienda de un vistazo (ADR-0208, act. 2026-10-10 (b)): «¿tu piso está fresco?» con UNA barra por familia. La primera (Indumentaria)
// manda y va grande, con cada estado en número; las demás (Bisutería, Accesorios…) van debajo, una línea cada una, para que 35 anillos
// no tapen la ropa. Lo que todavía no se sabe se ve siempre (gris), y si la tienda no registra lo que vende lo dice el aviso de la puerta
// compartida con Análisis: la barra se ve igual, pero la frase de la cabecera no afirma nada. Sin estado propio: lo arma `frescura-piso.ts`.

/** Los estados de la familia principal que se dicen en número: siempre los tres; «aún no se sabe», solo si hay. */
const tramosConNumero = (f: FamiliaPiso): TramoPiso[] => TRAMOS_DEL_100.filter((t) => t !== "sin_saber" || f.unidades.sin_saber > 0);

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

function segmentos(f: FamiliaPiso) {
  return TRAMOS_DEL_100.map((t) => ({ clave: t, nombre: NOMBRE_TRAMO_PISO[t], valor: f.unidades[t], clase: CLASE_TRAMO_PISO[t] }));
}

/** «58 % fresca · 20 % envejeciendo»: lo que dice una familia de las de abajo, en una línea (sin los estados vacíos). */
function lineaDeFamilia(f: FamiliaPiso): string {
  const pct = porcentajes(f.unidades);
  return TRAMOS_DEL_100.filter((t) => f.unidades[t] > 0)
    .map((t) => `${pct[t]} % ${NOMBRE_TRAMO_PISO[t].toLowerCase()}`)
    .join(" · ");
}

export function FrescuraPiso({
  familias,
  puerta,
  antes = null,
}: {
  familias: readonly FamiliaPiso[];
  puerta: PuertaPiso;
  /** Los porcentajes de la familia principal hace 4 semanas, si se pudo comparar (la frase de la cabecera dice si mejoró). */
  antes?: Record<TramoPiso, number> | null;
}) {
  const [principal, ...otras] = familias;
  if (!principal) return null;
  const pct = porcentajes(principal.unidades);
  const clasicos = familias.reduce((s, f) => s + f.unidades.clasico, 0);
  return (
    <section aria-labelledby="frescura-piso-titulo" className="card-cayla px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="frescura-piso-titulo" className="font-display text-[22px] leading-tight">
          {principal.nombre}
        </h2>
        <span className="text-[13px] tabular-nums text-taupe">
          {unidades(principal.total)} colgadas · {principal.prendas} {principal.prendas === 1 ? "prenda" : "prendas"}
        </span>
      </div>

      <BarraApilada segmentos={segmentos(principal)} alto={12} unidad="unidades colgadas" className="mt-3" />

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {tramosConNumero(principal).map((t) => (
          <div key={t} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[13px] text-taupe">
              <MuestraTramo clase={CLASE_TRAMO_PISO[t]} />
              {NOMBRE_TRAMO_PISO[t]}
            </dt>
            <dd className="mt-0.5 flex items-baseline gap-2">
              <span className="font-display text-[28px] leading-none tabular-nums">{pct[t]} %</span>
              <span className="text-[12.5px] tabular-nums text-taupe">{unidades(principal.unidades[t])}</span>
            </dd>
          </div>
        ))}
      </dl>

      {antes && (
        <p className="mt-3 text-[13px] tabular-nums text-taupe">
          Hace 4 semanas: {antes.fresca} % fresca · {antes.vigente} % vigente · {antes.envejeciendo} % envejeciendo
        </p>
      )}

      {principal.soles && (
        <p className="mt-3 border-t border-sand pt-3 text-[13px] tabular-nums text-taupe">
          {solesEnteros(TRAMOS_DEL_100.reduce((s, t) => s + principal.soles![t], 0))} colgados a precio de venta
          {principal.soles.envejeciendo > 0 && <> · {solesEnteros(principal.soles.envejeciendo)} envejeciendo</>}
        </p>
      )}

      {otras.length > 0 && (
        <ul aria-label="Las demás familias" className="mt-4 divide-y divide-sand border-t border-sand">
          {otras.map((f) => (
            <li key={f.codigo ?? "otras"} className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(140px,1fr)_minmax(180px,2fr)_minmax(0,2fr)]">
              <span className="text-[14px] font-semibold leading-tight">
                {f.nombre} <span className="text-[12.5px] font-normal tabular-nums text-taupe">· {unidades(f.total)}</span>
              </span>
              <BarraApilada segmentos={segmentos(f)} alto={8} unidad="unidades colgadas" />
              <span className="text-[12.5px] leading-snug tabular-nums text-taupe">{lineaDeFamilia(f)}</span>
            </li>
          ))}
        </ul>
      )}

      {clasicos > 0 && (
        <p className="mt-3 text-[12.5px] text-taupe">
          Y {unidades(clasicos)} de clásicos aparte: no se miden por novedad.
        </p>
      )}

      {(puerta === null || !puerta.puedeHablar) && (
        <Aviso tono="atencion" chico className="mt-4">
          {puerta?.aviso ?? "No se pudo saber si esta tienda ya registra lo que vende: estas cifras pueden fallar."}
        </Aviso>
      )}
    </section>
  );
}
