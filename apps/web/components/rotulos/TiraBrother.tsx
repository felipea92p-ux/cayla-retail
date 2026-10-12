"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Minus, Plus, Scissors } from "lucide-react";
import { RotuloAnaquel } from "@/components/RotuloAnaquel";
import { useContar } from "@/lib/useContar";
import { copiasDeTexto, MAX_COPIAS, papelDeTiraCm, quienesSalen, tiraConSalientes, type Rotulo } from "@/lib/rotulos-reglas";

/** Lo que dura la salida de un rótulo de la tira (`rot-seg--sale` en `app/estilos/rotulos-brother.css`). */
const SALIDA_MS = 360;
/** Hasta cuándo dura la entrada de la pantalla: la tira se imprime rótulo por rótulo solo esta primera vez. */
const ENTRADA_MS = 2_400;

/** El rótulo de ejemplo que asoma de la Brother mientras no hay prendas: dice qué va a salir, sin prometer ninguna prenda. */
const EJEMPLO: Rotulo = {
  clave: "ejemplo",
  modelos: ["Nombre de la prenda"],
  marcas: ["la de la prenda"],
  tallas: ["S", "M", "L"],
};

/**
 * La Brother y su tira (ADR-0366, act. 2026-10-12, maqueta A «Rollo»): los rótulos salen uno bajo otro, como van a salir del
 * rollo, cada uno con sus copias al costado. Lo que se ve es lo que sale: cada rótulo es el mismo `RotuloAnaquel` de la hoja.
 *
 * Movimiento (ADR-0136, sin rebote ni bucle, apagado con `prefers-reduced-motion`): al entrar, la tira se imprime rótulo por
 * rótulo (el cabezal, una línea roja, baja y deja la tinta); un rótulo nuevo alarga la tira; uno que se quita sale hacia la
 * derecha y la tira se cierra; con `recorriendo` la luz pasa a ámbar y el cabezal recorre cada rótulo, en orden.
 * Sin prendas, asoma un rótulo de ejemplo en gris; la primera prenda se imprime sobre ese mismo papel.
 */
export function TiraBrother({
  rotulos,
  copias,
  onCopias,
  recorriendo,
}: {
  rotulos: Rotulo[];
  copias: Record<string, string>;
  onCopias: (clave: string, texto: string) => void;
  /** Mientras dura el recorrido de antes de imprimir: `porRotulo` en ms (ver `recorridoDeImpresion`). */
  recorriendo: { porRotulo: number } | null;
}) {
  // La entrada en cascada es solo la primera vez: un rótulo que se suma después sale solo, sin esperar turno.
  const [primeraVez, setPrimeraVez] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setPrimeraVez(false), ENTRADA_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Los que se quitan siguen dibujados en su lugar mientras salen. Se calcula al cambiar la lista (patrón «ajustar el estado
  // cuando cambia una prop», sin efecto): así el primer cuadro ya los trae.
  const [previos, setPrevios] = useState(rotulos);
  const [salientes, setSalientes] = useState<{ item: Rotulo; lugar: number }[]>([]);
  // La primera prenda después de la tira vacía se imprime sobre el papel de ejemplo, sin alargar la tira. Su marca dura lo que
  // dura el rótulo en la tira (quitarla después le devuelve la entrada normal): una clase que se va reiniciaría la animación.
  const [enSitio, setEnSitio] = useState<ReadonlySet<string>>(new Set());
  if (previos !== rotulos) {
    const salen = quienesSalen(previos, rotulos, (r) => r.clave);
    setPrevios(rotulos);
    if (salen.length) setSalientes((s) => [...s.filter((x) => !rotulos.some((r) => r.clave === x.item.clave)), ...salen]);
    const siguen = new Set([...enSitio].filter((c) => rotulos.some((r) => r.clave === c)));
    if (previos.length === 0 && rotulos.length > 0 && !primeraVez) rotulos.forEach((r) => siguen.add(r.clave));
    if (siguen.size !== enSitio.size || [...siguen].some((c) => !enSitio.has(c))) setEnSitio(siguen);
  }
  useEffect(() => {
    if (!salientes.length) return;
    const t = window.setTimeout(() => setSalientes([]), SALIDA_MS);
    return () => window.clearTimeout(t);
  }, [salientes]);

  // El rótulo, lo más grande que cabe: a su lado van las copias; en angosto, debajo (ver `@container rotulos` en el CSS).
  const raiz = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1.2);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const medir = new ResizeObserver(([e]) => {
      // Ancho: la columna reserva 200 px a la derecha para las copias (ver `.rot-maquina` en el CSS) y la impresora mide 104 px
      // más que el papel. Angosto: las copias van debajo y solo cuenta la impresora.
      const w = e.contentRect.width;
      setZoom(Math.max(0.8, Math.min(1.35, (w > 560 ? w - 200 - 104 : w - 110) / ANCHO_ROTULO_PX)));
    });
    medir.observe(el);
    return () => medir.disconnect();
  }, []);

  const tira = tiraConSalientes(rotulos, salientes);
  const vacia = rotulos.length === 0;
  const total = rotulos.reduce((a, r) => a + copiasDeTexto(copias[r.clave] ?? "1"), 0);
  const totalContado = Math.round(useContar(total, 500));
  const cm = papelDeTiraCm(total);
  const cmContado = useContar(cm, 650);
  let orden = 0;

  return (
    <section
      ref={raiz}
      aria-label="Así salen de la Brother"
      data-guia="rotulos.vista"
      className="rot-maquina"
      style={{ "--z": zoom.toFixed(3) } as CSSProperties}
      data-recorriendo={recorriendo ? "" : undefined}
    >
      <div className="rot-maquina__escena">
        <div className="rot-brother" aria-hidden>
          <div className="rot-brother__tapa" />
          <div className="rot-brother__frente">
            <span className="rot-brother__luz" />
            <span className="rot-brother__nombre">QL · 62 mm</span>
            <span className="rot-brother__perilla" />
          </div>
        </div>

        <div className="rot-tira">
          {vacia && salientes.length === 0 && (
            <div className="rot-seg rot-seg--ejemplo" aria-label="Ejemplo de rótulo">
              <div className="rot-seg__papel papel-fijo">
                <RotuloAnaquel rotulo={EJEMPLO} />
              </div>
              <div className="rot-seg__copias">
                <span aria-hidden className="rot-seg__guia" />
                <span className="rot-sello">Así sale un rótulo</span>
              </div>
            </div>
          )}
          {tira.map(({ item: r, sale }, i) => {
            const texto = copias[r.clave] ?? "1";
            const n = copiasDeTexto(texto);
            const nombre = r.modelos.join(" · ");
            const lugar = sale ? 0 : orden++;
            const clases = [
              "rot-seg",
              sale && "rot-seg--sale",
              !sale && n === 0 && "rot-seg--cero",
              !sale && enSitio.has(r.clave) && "rot-seg--en-sitio",
              !sale && !enSitio.has(r.clave) && "rot-seg--nace",
              recorriendo && !sale && n > 0 && "rot-seg--recorre",
            ];
            // Al entrar, uno tras otro; al imprimir, el cabezal pasa por cada uno en orden (los de 0 copias no salen: se saltan).
            const estilo = {
              "--espera": primeraVez ? `${650 + lugar * 380}ms` : "0ms",
              "--d": recorriendo ? `${recorriendo.porRotulo}ms` : undefined,
              "--r": recorriendo ? `${lugar * recorriendo.porRotulo}ms` : undefined,
            } as CSSProperties;
            return (
              <div
                key={`${r.clave}${sale ? "-sale" : ""}`}
                className={clases.filter(Boolean).join(" ")}
                style={estilo}
                aria-hidden={sale || undefined}
                inert={sale}
              >
                <div className="rot-seg__papel papel-fijo">
                  <RotuloAnaquel rotulo={r} />
                  <span aria-hidden className="rot-seg__no-sale">
                    <span>No sale</span>
                  </span>
                  <span aria-hidden className="rot-seg__cubre" />
                  <span aria-hidden className="rot-seg__cabezal" />
                </div>
                {i > 0 && <Scissors aria-hidden className="rot-seg__tijera" />}
                <div className="rot-seg__copias" data-guia={i === 0 ? "rotulos.copias" : undefined}>
                  <span aria-hidden className="rot-seg__guia" />
                  <label htmlFor={`copias-${r.clave}`} className="rot-seg__etiqueta">
                    Copias
                  </label>
                  <span className="etq-paso">
                    <button
                      type="button"
                      aria-label={`Una copia menos de ${nombre}`}
                      disabled={n <= 0}
                      onClick={() => onCopias(r.clave, String(n - 1))}
                    >
                      <Minus aria-hidden />
                    </button>
                    <input
                      id={`copias-${r.clave}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_COPIAS}
                      value={texto}
                      onChange={(ev) => onCopias(r.clave, ev.target.value)}
                      onFocus={(ev) => ev.currentTarget.select()}
                      className="tabular-nums"
                    />
                    <button
                      type="button"
                      aria-label={`Una copia más de ${nombre}`}
                      disabled={n >= MAX_COPIAS}
                      onClick={() => onCopias(r.clave, String(n + 1))}
                    >
                      <Plus aria-hidden />
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {!vacia && (
          <p className="rot-pie" aria-live="polite">
            <Scissors aria-hidden className="h-3.5 w-3.5 text-taupe" />
            <span>
              {total === 1 ? "Sale" : "Salen"} <b className="tabular-nums">{totalContado}</b> {total === 1 ? "rótulo" : "rótulos"} · unos{" "}
              <b className="tabular-nums">
                {cmContado.toLocaleString("es-PE", {
                  maximumFractionDigits: 1,
                })}
              </b>{" "}
              cm de papel
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

/** 62 mm en píxeles de CSS (96 por pulgada): el ancho del rótulo dibujado a tamaño real. */
const ANCHO_ROTULO_PX = (62 * 96) / 25.4;
