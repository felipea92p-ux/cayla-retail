"use client";

import Link from "next/link";
import { createContext, startTransition, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PaseFrente, type SelloPuesto } from "@/components/traslados-pases/PaseFrente";
import { RUTA_TRASLADOS, rutaDelPase, useVecinos } from "@/components/traslados-pases/Billetera";
import { TEXTO_SELLO, fechaDeSello, type TonoPase, type VistaPase } from "@/lib/traslados-pases-reglas";
import type { LoSiguiente } from "@/lib/traslados-recepcion-reglas";

// El escenario: el pase grande que GIRA (ADR-0355). Al frente, de dónde a dónde y un botón; al reverso, lo que se hace con la
// caja (contar, revisar, ver lo enviado). Al terminar, el pase vuelve al frente, le cae un sello y, un momento después, se abre
// la siguiente caja que te toca. El reverso le habla al pase por `usePase()`. Quien lo dibuja le pone `key={id}`: otro pase
// empieza siempre por el frente y sin sello puesto a mano.

type Pase = {
  /** Da vuelta el pase (true = reverso). */
  girar: (alReverso: boolean) => void;
  /** Vuelve al frente, pone el sello y, 1,6 s después, abre la siguiente caja que te toca (o refresca esta). `luego`: a dónde ir si
   *  no queda otra que te toque y este pase deja de existir (un pedido enviado ya es una caja en camino). */
  sellar: (texto: string, tono: TonoPase, opciones?: { luego?: string }) => void;
};
const CtxPase = createContext<Pase | null>(null);
export function usePase(): Pase {
  const p = useContext(CtxPase);
  if (!p) throw new Error("usePase va dentro de un PaseTraslado");
  return p;
}

const MS_HASTA_LA_SIGUIENTE = 1600;

export function PaseTraslado({
  vista,
  reverso,
  accion,
  siguiente,
  volverA,
}: {
  vista: VistaPase;
  /** Lo que va al reverso: el botón del frente da vuelta el pase. */
  reverso: ReactNode;
  /** Botones propios del frente (un pedido lleva «No la tengo» y «Enviar»); sin ellos, el botón de la vista, que gira el pase. Van
   *  dentro del pase: pueden usar `usePase()`. */
  accion?: ReactNode;
  /** «Lo siguiente» de lo recién recibido (bajar al piso, imprimir etiquetas): va en el frente. Llega como dato y no como elemento
   *  armado en el servidor (un elemento del servidor dentro de este cliente salía en React como hijo de una lista sin clave). */
  siguiente?: LoSiguiente | null;
  /** «← Movimientos» si se llegó desde ahí (ADR-0234). */
  volverA?: { href: string; a: string } | null;
}) {
  const router = useRouter();
  const v = useVecinos(vista.id);
  const [vuelta, setVuelta] = useState(false);
  const [sello, setSello] = useState<SelloPuesto | null | undefined>(undefined);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const escenario = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  // El foco acompaña al giro: al reverso, a su «Volver»; de vuelta al frente, a su botón (sin mover la página).
  const yaGiro = useRef(false);
  useEffect(() => {
    if (!vuelta && !yaGiro.current) return;
    yaGiro.current = true;
    const destino = escenario.current?.querySelector<HTMLElement>(vuelta ? "[data-foco-reverso]" : ".tp-boton");
    destino?.focus({ preventScroll: true });
    // Al reverso, el pase crece: si su pie (el botón de terminar o confirmar) quedaría bajo el pliegue, se trae el pase entero a la
    // vista, una vez y suave. Es la respuesta a un clic, nunca mientras se escribe.
    if (!vuelta) return;
    const giro = escenario.current?.querySelector<HTMLElement>(".tp-giro");
    if (!giro) return;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => giro.scrollIntoView({ block: "nearest", behavior: reducir ? "auto" : "smooth" }), reducir ? 0 : 520);
    return () => clearTimeout(t);
  }, [vuelta]);

  const pase: Pase = {
    girar: (alReverso) => setVuelta(alReverso),
    sellar: (texto, tono, opciones) => {
      setVuelta(false);
      const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      temporizador.current = setTimeout(() => setSello({ texto, tono, fecha: fechaDeSello(new Date().toISOString()), cae: true }), reducir ? 0 : 720);
      temporizador.current = setTimeout(
        () => {
          const siguiente = v.siguientePorHacer;
          const destino = siguiente ? rutaDelPase(siguiente.id) : opciones?.luego;
          if (destino) {
            // La billetera vive en el layout, que no se vuelve a pedir al navegar: sin el refresh, la caja recién sellada seguiría
            // en «Te llegan» y el anillo no sumaría.
            startTransition(() => {
              router.push(destino, { scroll: false });
              router.refresh();
            });
            return;
          }
          // Sin otra caja que te toque, se queda en esta ya actualizada. Un sello que no es de terminada («FALTÓ ALGO»: la caja
          // sigue abierta para el líder) se levanta junto con la foto nueva, en la misma transición.
          startTransition(() => {
            router.refresh();
            if (!Object.values(TEXTO_SELLO).includes(texto)) setSello(undefined);
          });
        },
        reducir ? 400 : 720 + MS_HASTA_LA_SIGUIENTE,
      );
    },
  };

  return (
    <CtxPase.Provider value={pase}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 lg:hidden">
          <Link href={RUTA_TRASLADOS} className="btn-cayla btn-enlace text-sm">
            <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={1.8} /> Todas las cajas
          </Link>
        </div>
        {volverA && (
          <Link href={volverA.href} className="btn-cayla btn-enlace text-sm">
            <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={1.8} /> Volver a {volverA.a}
          </Link>
        )}
        <div className="tp-escenario" ref={escenario}>
          <div key={vista.id} className="tp-giro tp-entra">
            <div className="tp-pase3d" data-vuelta={vuelta ? "" : undefined}>
              <div inert={vuelta}>
                <PaseFrente
                  vista={vista}
                  sello={sello}
                  accion={
                    accion ??
                    (siguiente ? (
                      <FrenteLoSiguiente vista={vista} siguiente={siguiente} />
                    ) : (
                      <button type="button" onClick={() => setVuelta(true)} className={`btn-cayla ${vista.boton.principal ? "btn-primario" : "btn-secundario"} tp-boton`}>
                        {vista.boton.texto} <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    ))
                  }
                />
              </div>
              <div className="tp-pase tp-pase-atras" data-tp-tono={vista.tono} inert={!vuelta} aria-hidden={!vuelta}>
                {reverso}
              </div>
            </div>
          </div>
          {v.total > 1 && (
            <nav className="tp-paginas" aria-label="Pasar de caja">
              {v.anterior ? (
                <Link href={rutaDelPase(v.anterior.id)} scroll={false} aria-label={`Anterior: ${v.anterior.rotulo}`}>
                  <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                </Link>
              ) : (
                <span aria-disabled>
                  <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                </span>
              )}
              <p>
                {v.posicion + 1} de {v.total}
              </p>
              {v.siguiente ? (
                <Link href={rutaDelPase(v.siguiente.id)} scroll={false} aria-label={`Siguiente: ${v.siguiente.rotulo}`}>
                  <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                </Link>
              ) : (
                <span aria-disabled>
                  <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                </span>
              )}
            </nav>
          )}
        </div>
      </div>
    </CtxPase.Provider>
  );
}

// «Lo siguiente» en el frente del pase (ADR-0355, actividad 5; la regla es la de ADR-0242 D-6.1, `loSiguienteDeLaRecepcion`):
// recién recibida la caja, el botón grande ya no es «Ver lo que llegó» sino lo que hay que hacer con las prendas —bajarlas al piso
// o imprimir sus etiquetas—, con su frase encima. Ver lo que llegó queda al lado, y gira el pase. Si la caja todavía le pide algo a
// quien mira (revisar lo que faltó), ese botón manda y «Lo siguiente» va al lado, como secundario.
function FrenteLoSiguiente({ vista, siguiente }: { vista: VistaPase; siguiente: LoSiguiente }) {
  const pase = usePase();
  const manda = vista.porHacer;
  return (
    <div>
      <p className="tp-siguiente">{siguiente.intro}</p>
      <div className="tp-acciones">
        <button type="button" onClick={() => pase.girar(true)} className={`btn-cayla ${manda ? "btn-primario tp-boton" : "btn-secundario"}`}>
          {vista.boton.texto} {manda && <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />}
        </button>
        {siguiente.acciones.map((a) => (
          <Link key={a.clave} href={a.href} className={`btn-cayla ${a.principal && !manda ? "btn-primario tp-boton" : "btn-secundario"}`}>
            {a.texto}
            {a.principal && !manda && <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />}
          </Link>
        ))}
      </div>
    </div>
  );
}
