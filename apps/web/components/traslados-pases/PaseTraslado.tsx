"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PaseFrente, type SelloPuesto } from "@/components/traslados-pases/PaseFrente";
import { RUTA_TRASLADOS, rutaDelPase, useVecinos } from "@/components/traslados-pases/Billetera";
import { fechaDeSello, type TonoPase, type VistaPase } from "@/lib/traslados-pases-reglas";

// El escenario: el pase grande que GIRA (ADR-0354). Al frente, de dónde a dónde y un botón; al reverso, lo que se hace con la
// caja (contar, revisar, ver lo enviado). Al terminar, el pase vuelve al frente, le cae un sello y, un momento después, se abre
// la siguiente caja que te toca. El reverso le habla al pase por `usePase()`. Quien lo dibuja le pone `key={id}`: otro pase
// empieza siempre por el frente y sin sello puesto a mano.

type Pase = {
  /** Da vuelta el pase (true = reverso). */
  girar: (alReverso: boolean) => void;
  /** Vuelve al frente, pone el sello y, 1,6 s después, abre la siguiente caja que te toca (o refresca esta). */
  sellar: (texto: string, tono: TonoPase) => void;
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
  abajo,
  volverA,
}: {
  vista: VistaPase;
  /** Lo que va al reverso. Sin reverso, el botón lleva a `abajo` (el detalle de siempre). */
  reverso?: ReactNode;
  abajo?: ReactNode;
  /** «← Movimientos» si se llegó desde ahí (ADR-0234). */
  volverA?: { href: string; a: string } | null;
}) {
  const router = useRouter();
  const v = useVecinos(vista.id);
  const [vuelta, setVuelta] = useState(false);
  const [sello, setSello] = useState<SelloPuesto | null | undefined>(undefined);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abajoRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const pase: Pase = {
    girar: (alReverso) => setVuelta(alReverso),
    sellar: (texto, tono) => {
      setVuelta(false);
      const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      temporizador.current = setTimeout(() => setSello({ texto, tono, fecha: fechaDeSello(new Date().toISOString()), cae: true }), reducir ? 0 : 720);
      temporizador.current = setTimeout(
        () => {
          const siguiente = v.siguientePorHacer;
          if (siguiente) router.push(rutaDelPase(siguiente.id), { scroll: false });
          router.refresh();
        },
        reducir ? 400 : 720 + MS_HASTA_LA_SIGUIENTE,
      );
    },
  };

  const alBoton = () => {
    if (reverso) {
      setVuelta(true);
      return;
    }
    abajoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <div className="tp-escenario">
          <div key={vista.id} className="tp-giro tp-entra">
            <div className="tp-pase3d" data-vuelta={vuelta ? "" : undefined}>
              <div inert={vuelta}>
                <PaseFrente
                  vista={vista}
                  sello={sello}
                  accion={
                    <button type="button" onClick={alBoton} className={`btn-cayla ${vista.boton.principal ? "btn-primario" : "btn-secundario"} tp-boton`}>
                      {vista.boton.texto} <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  }
                />
              </div>
              {reverso && (
                <div className="tp-pase tp-pase-atras" data-tp-tono={vista.tono} inert={!vuelta} aria-hidden={!vuelta}>
                  {reverso}
                </div>
              )}
            </div>
          </div>
          {v.total > 1 && (
            <nav className="tp-paginas" aria-label="Pasar de caja">
              {v.anterior ? (
                <Link href={rutaDelPase(v.anterior.id)} scroll={false} aria-label={`Caja anterior: Nº ${v.anterior.numero}`}>
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
                <Link href={rutaDelPase(v.siguiente.id)} scroll={false} aria-label={`Caja siguiente: Nº ${v.siguiente.numero}`}>
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
        {abajo && (
          <div ref={abajoRef} className="scroll-mt-20">
            {abajo}
          </div>
        )}
      </div>
    </CtxPase.Provider>
  );
}
