import { Aviso } from "@/components/ui/Aviso";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { BotonEnlace } from "@/components/ui/campos";
import {
  avisoDeLaPuerta,
  CAUSAS_SIN_SABER,
  CLASE_TRAMO_PISO,
  NOMBRE_TRAMO_PISO,
  pasoDeLaPuerta,
  TEXTO_CAUSA_SIN_SABER,
  TRAMOS_DEL_100,
  porcentajes,
  solesEnteros,
  type AccesoPuerta,
  type FamiliaPiso,
  type PuertaPiso,
  type TramoPiso,
} from "@/lib/frescura-piso";

// La tienda de un vistazo (ADR-0208, act. 2026-10-10 (b)): «¿tu piso está fresco?» con UNA barra por familia. La primera (Indumentaria)
// manda y va grande, con cada estado en número; las demás (Bisutería, Accesorios…) van debajo, una línea cada una, para que 35 anillos
// no tapen la ropa. Lo que todavía no se sabe se ve siempre (gris), y si la tienda no registra lo que vende lo dice el aviso de la puerta
// compartida con Análisis: la barra se ve igual, marcada «Aproximado», la frase de la cabecera dice por qué no afirma y el aviso trae el
// botón que lo arregla (Felipe, Formidable 2026-10-10 (c): «% con aviso + el paso»). «Aún no se sabe» va rayado y su porqué está a un toque.
// Sin estado propio: lo arma `frescura-piso.ts`.

/** Los estados de la familia principal que se dicen en número: siempre los tres; «aún no se sabe», solo si hay. */
const tramosConNumero = (f: FamiliaPiso): TramoPiso[] => TRAMOS_DEL_100.filter((t) => t !== "sin_saber" || f.unidades.sin_saber > 0);

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;
const colgadas = (n: number) => `${n} ${n === 1 ? "unidad colgada" : "unidades colgadas"}`;

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
  acceso,
  antes = null,
}: {
  familias: readonly FamiliaPiso[];
  puerta: PuertaPiso;
  /** Qué pantallas ve quien mira: el botón de la puerta solo lleva a una que puede abrir. */
  acceso: AccesoPuerta;
  /** Los porcentajes de la familia principal hace 4 semanas, si se pudo comparar (la frase de la cabecera dice si mejoró). */
  antes?: Record<TramoPiso, number> | null;
}) {
  const [principal, ...otras] = familias;
  if (!principal) return null;
  const pct = porcentajes(principal.unidades);
  const clasicos = familias.reduce((s, f) => s + f.unidades.clasico, 0);
  const cerrada = puerta === null || !puerta.puedeHablar;
  const paso = pasoDeLaPuerta(puerta, acceso);
  return (
    <section aria-labelledby="frescura-piso-titulo" className="card-cayla px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="frescura-piso-titulo" className="flex items-center gap-2 font-display text-[22px] leading-tight">
          {principal.nombre}
          {cerrada && <Chip tono="pizarra">Aproximado</Chip>}
        </h2>
        <span className="text-[13px] tabular-nums text-taupe">
          {colgadas(principal.total)} · {principal.prendas} {principal.prendas === 1 ? "prenda" : "prendas"}
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
            {t === "sin_saber" && <PorQueNoSeSabe familia={principal} />}
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

      {cerrada && (
        <Aviso
          tono="atencion"
          chico
          className="mt-4"
          accion={
            paso ? (
              <BotonEnlace href={paso.href} peso="fantasma">
                {paso.texto}
              </BotonEnlace>
            ) : undefined
          }
        >
          {avisoDeLaPuerta(puerta)}
        </Aviso>
      )}
    </section>
  );
}

/**
 * El porqué de «Aún no se sabe», a un toque (ley 6; la ciega no supo qué lo causa): cuántas unidades por cada causa, en palabras de tienda.
 * Un `<details>` del navegador: se abre con un toque o con Enter, sin estado ni JavaScript.
 */
function PorQueNoSeSabe({ familia }: { familia: FamiliaPiso }) {
  const causas = CAUSAS_SIN_SABER.filter((c) => familia.sinSaberPor[c] > 0);
  if (causas.length === 0) return null;
  return (
    <details className="group mt-1 text-[12.5px] leading-snug">
      <summary className="btn-cayla btn-enlace inline-flex min-h-6 cursor-pointer list-none items-center text-[12.5px] [&::-webkit-details-marker]:hidden">¿Por qué?</summary>
      <ul className="mt-1 space-y-0.5 text-taupe">
        {causas.map((c) => (
          <li key={c}>
            <span className="tabular-nums text-tinta">{unidades(familia.sinSaberPor[c])}</span>: {TEXTO_CAUSA_SIN_SABER[c]}.
          </li>
        ))}
      </ul>
    </details>
  );
}
