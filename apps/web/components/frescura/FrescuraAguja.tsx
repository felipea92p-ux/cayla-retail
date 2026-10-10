import { Gauge, Sparkles } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { enlaceBajar, pct, type SenalCategoria, type SinEstrenar } from "@/lib/frescura-aguja";

// Lo que mueve la aguja (ADR-0208, act. 2026-10-10 (b)): hasta tres categorías —las que se quedan y la que se lleva más—, cada una con lo que
// dice de ella y UN botón que lleva a hacerlo (completar tallas o colgar más en Bajar al piso; cambiar de lugar filtra la lista de abajo).
// Sin el piso cuadrado no hay veredictos: dice qué se llevan los clientes (registrado y anotado en caja), que no necesita saber qué cuelga.
// Las reglas viven en `frescura-aguja.ts`; aquí solo se dibujan.

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

function Tarjeta({ s, puedeBajar, onVerCategoria }: { s: SenalCategoria; puedeBajar: boolean; onVerCategoria: (categoriaId: string) => void }) {
  const a = s.acogida;
  const accion = s.accion;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-sand bg-papel px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[16px] font-semibold leading-tight">{s.nombre}</span>
        <Chip tono={s.tipo === "se_queda" ? "ambar" : "verde"}>{s.tipo === "se_queda" ? "Se está quedando" : "Se lleva más"}</Chip>
      </div>
      {a && (
        <p className="text-[13.5px] leading-snug">
          Ocupa {pct(a.partePiso)} del piso y hace {pct(a.parteVentas)} de lo vendido en {a.dias} días.
        </p>
      )}
      {s.envejeciendo > 0 && (
        <p className="text-[13px] leading-snug text-taupe">
          {s.envejeciendo} de sus {unidades(s.piso)} ya pasaron lo que tarda en venderse.
        </p>
      )}
      <div className="mt-auto pt-1">
        {accion.tipo === "completar_tallas" && (
          <>
            <p className="mb-2 text-[12.5px] leading-snug text-taupe">
              {accion.lineas.length === 1 ? "1 talla guardada" : `${accion.lineas.length} tallas guardadas`} de modelos que ya cuelgan: una talla que falta hace parecer lento al modelo.
            </p>
            {puedeBajar ? (
              <BotonEnlace href={enlaceBajar(accion.lineas)} peso="primario">
                Completa tallas
              </BotonEnlace>
            ) : null}
          </>
        )}
        {accion.tipo === "cambiar_lugar" && (
          <Boton type="button" onClick={() => onVerCategoria(s.categoriaId)}>
            Ver cuáles cambiar de lugar
          </Boton>
        )}
        {accion.tipo === "colgar_mas" && (
          <>
            <p className="mb-2 text-[12.5px] leading-snug text-taupe">Tienes {unidades(accion.enAlmacen)} en el almacén.</p>
            {puedeBajar ? (
              <BotonEnlace href={enlaceBajar(accion.lineas)} peso="primario">
                Cuelga más
              </BotonEnlace>
            ) : null}
          </>
        )}
        {accion.tipo === "pedir" && <p className="text-[12.5px] leading-snug text-taupe">No queda en el almacén: conviene pedir más.</p>}
      </div>
    </li>
  );
}

export function FrescuraAguja({
  senales,
  pisoCuadrado,
  seLlevan,
  estrenar,
  puedeBajar,
  onVerCategoria,
}: {
  senales: readonly SenalCategoria[];
  pisoCuadrado: boolean;
  /** Sin el piso cuadrado: lo que más se llevan los clientes en 14 días (registrado y anotado en caja). */
  seLlevan: readonly { categoriaId: string; nombre: string; unidades: number }[];
  /** Lo que el cliente nunca vio colgado y está en el almacén (solo con el piso cuadrado: si no, podría estar colgado sin registrar). */
  estrenar: SinEstrenar;
  /** Quien mira puede bajar al piso (Bajar al piso es una función de Existencias, ADR-0306). */
  puedeBajar: boolean;
  onVerCategoria: (categoriaId: string) => void;
}) {
  return (
    <section aria-labelledby="frescura-aguja-titulo" className="card-cayla px-4 py-4 sm:px-5">
      <h2 id="frescura-aguja-titulo" className="font-display text-[20px] leading-tight sm:text-[22px]">
        {pisoCuadrado ? "Lo que mueve la aguja" : "Lo que más se llevan"}
      </h2>
      {!pisoCuadrado ? (
        seLlevan.length > 0 ? (
          <>
            <p className="mt-1 text-[13.5px] leading-snug">
              {seLlevan.map((c) => `${c.nombre} ${c.unidades}`).join(" · ")} <span className="text-taupe">en 14 días, con lo anotado en caja.</span>
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-taupe">
              Cuando el piso esté cuadrado, aquí vas a ver qué categoría se queda y cuál se lleva más que lo que ocupa.
            </p>
          </>
        ) : (
          <Vacio tamano="chico" alinear="izquierda" icono={<Gauge strokeWidth={1.5} />} className="mt-2">
            Cuando el piso esté cuadrado, aquí vas a ver qué categoría se queda y cuál se lleva más.
          </Vacio>
        )
      ) : senales.length === 0 ? (
        <Vacio tamano="chico" alinear="izquierda" icono={<Gauge strokeWidth={1.5} />} className="mt-2">
          Esta semana ninguna categoría se sale de lo normal.
        </Vacio>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {senales.map((s) => (
            <Tarjeta key={s.categoriaId} s={s} puedeBajar={puedeBajar} onVerCategoria={onVerCategoria} />
          ))}
        </ul>
      )}
      {pisoCuadrado && estrenar.prendas > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sand pt-3">
          <Sparkles aria-hidden strokeWidth={1.5} className="h-5 w-5 shrink-0 text-taupe" />
          <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
            <span className="font-semibold">
              Sin estrenar: {estrenar.prendas} {estrenar.prendas === 1 ? "prenda" : "prendas"}
            </span>{" "}
            que tu cliente nunca vio colgadas esperan en el almacén ({unidades(estrenar.unidades)}). Colgarlas refresca el piso sin comprar nada.
          </p>
          {puedeBajar && estrenar.lineas.length > 0 && (
            <BotonEnlace href={enlaceBajar(estrenar.lineas)}>Estrenar en el piso</BotonEnlace>
          )}
        </div>
      )}
    </section>
  );
}
