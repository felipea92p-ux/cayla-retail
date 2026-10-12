"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Check } from "lucide-react";
import {
  avisoSinUnidadesAqui,
  idsDeColumna,
  idsDeFila,
  unidadesTexto,
  type CeldaMatriz,
  type FilaColor,
  type Matriz,
} from "@/lib/vista-rapida-producto-reglas";
import { hayPunteroFino, useCifraConRetraso } from "./movimiento";

/** Cada celda entra a su hora (`--vr-i` × 34 ms + 320 ms, vista-rapida.css): su número empieza a contar cuando ella aparece. */
const retrasoDeCelda = (i: number) => i * 34 + 360;

const estilo = (vars: Record<string, string | number>) => vars as CSSProperties;

/** La cifra grande de la cabecera (unidades en la sede): cuenta desde 0 al abrir; mientras no se lee, «—». */
function CifraGrande({ valor }: { valor: number | null }) {
  return <>{useCifraConRetraso(valor, 0, 800)}</>;
}
function Cifra({ valor, retraso }: { valor: number | null; retraso: number }) {
  return <>{useCifraConRetraso(valor, retraso, 600)}</>;
}

/**
 * La matriz color × talla de la vista rápida (maqueta A «Matriz», Felipe 2026-10-05). Una celda = una variante, con sus unidades en la
 * sede y una barrita proporcional. Se elige tocando una celda, un color (toda su fila) o una talla (toda su columna): lo elegido manda
 * a Etiquetas, y la foto sigue al color que se toca o se señala. Con mouse, al pasar sobre una celda se alumbra su fila y su columna.
 *
 * No decide nada de negocio: lo que dibuja viene de `armarMatriz` (lib/vista-rapida-producto-reglas.ts) y lo elegido vive en quien la usa.
 */
export function MatrizUnidades({
  matriz,
  sedeNombre,
  sedeCorta,
  detalleOtrasSedes,
  lectura,
  elegidas,
  alternar,
  fijado,
  alFijar,
  alVistaPrevia,
  alQuitar,
}: {
  matriz: Matriz;
  sedeNombre: string;
  sedeCorta: string;
  /** Lo de las otras sedes, ya redactado por `lineasDeStock` («+24 en LIM · 11 en taller»); `null` si no hay o no se leyó. */
  detalleOtrasSedes: string | null;
  lectura: "leyendo" | "error" | "ok";
  elegidas: ReadonlySet<string>;
  alternar: (ids: readonly string[]) => void;
  /** El color que la foto tiene fijo (su `clave`). */
  fijado: string;
  alFijar: (clave: string) => void;
  /** El color que se señala con el mouse o el teclado (vista previa en la foto); `null` al salir. */
  alVistaPrevia: (clave: string | null) => void;
  alQuitar: () => void;
}) {
  const [cruz, setCruz] = useState<{ fila: string | null; col: string | null }>({ fila: null, col: null });
  const caja = useRef<HTMLElement>(null);
  const nt = matriz.columnas.length;
  const celdasElegidas = matriz.celdas.filter((c) => elegidas.has(c.varianteId));
  const sinAqui = matriz.totalGeneral === 0;

  // El brillo que sigue al puntero: solo con mouse, y sin pasar por React (se escribe directo en la caja, 60 veces por segundo).
  function brillo(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" || !hayPunteroFino() || !caja.current) return;
    const r = caja.current.getBoundingClientRect();
    caja.current.style.setProperty("--vr-mx", `${e.clientX - r.left}px`);
    caja.current.style.setProperty("--vr-my", `${e.clientY - r.top}px`);
    caja.current.style.setProperty("--vr-brillo", "1");
  }
  function apagarBrillo() {
    caja.current?.style.setProperty("--vr-brillo", "0");
  }

  const entra = (fila: string | null, col: string | null) => (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    setCruz((c) => (c.fila === fila && c.col === col ? c : { fila, col }));
    if (fila !== null) alVistaPrevia(fila);
  };
  const salir = () => {
    setCruz({ fila: null, col: null });
    alVistaPrevia(null);
    apagarBrillo();
  };

  // Una onda sale de donde se tocó la celda (se crea al hacer clic y se quita sola al terminar).
  function onda(e: React.MouseEvent<HTMLElement>) {
    if (!hayPunteroFino()) return;
    const ondas = e.currentTarget.querySelector(".vr-ondas");
    if (!ondas) return;
    const r = e.currentTarget.getBoundingClientRect();
    const o = document.createElement("span");
    o.className = "vr-onda";
    o.style.setProperty("--vr-ox", `${e.clientX - r.left}px`);
    o.style.setProperty("--vr-oy", `${e.clientY - r.top}px`);
    o.addEventListener("animationend", () => o.remove());
    ondas.appendChild(o);
  }

  // Flechas: se mueve de celda en celda (45 botones con Tab sería una tortura). Cada celda dice su lugar en `data-pos="fila,columna"`.
  function flechas(e: KeyboardEvent<HTMLElement>) {
    const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
    const actual = (e.target as HTMLElement).closest<HTMLElement>("[data-pos]");
    if (!d || !actual) return;
    const [f, c] = actual.dataset.pos!.split(",").map(Number);
    const sig = caja.current?.querySelector<HTMLElement>(`[data-pos="${f + d[0]},${c + d[1]}"]`);
    if (sig) {
      e.preventDefault();
      sig.focus();
    }
  }

  const todasDe = (ids: readonly string[]) => ids.length > 0 && ids.every((id) => elegidas.has(id));
  const unidadesElegidas = celdasElegidas.some((c) => c.unidades === null) ? null : celdasElegidas.reduce((t, c) => t + (c.unidades ?? 0), 0);

  return (
    <section ref={caja} className="vr-mx" aria-label="Unidades por color y talla" onPointerMove={brillo} onPointerLeave={apagarBrillo}>
      <div className="vr-mx-cab">
        <div style={{ minWidth: 0 }}>
          <span className="vr-rotulo label-cayla">Unidades por color y talla</span>
          <span className="vr-estado" aria-live="polite">
            {lectura === "error" ? (
              <span key="error" className="vr-texto-cambia">
                No se pudo leer el stock de {sedeNombre}
              </span>
            ) : celdasElegidas.length === 0 ? (
              <span key="nada" className="vr-texto-cambia">
                Toca una celda, un color o una talla
              </span>
            ) : celdasElegidas.length === 1 ? (
              <span key={celdasElegidas[0].varianteId} className="vr-texto-cambia vr-fl">
                <FilaSwatch fila={matriz.filas.find((f) => f.clave === (celdasElegidas[0].color ?? ""))} />
                <b>{celdasElegidas[0].nombre}</b>
                <span className="vr-cod">{celdasElegidas[0].codigo}</span>
                <span className="tabular-nums">S/{celdasElegidas[0].precio.toFixed(2)}</span>
                {unidadesElegidas !== null && <span>{unidadesTexto(unidadesElegidas)}</span>}
                <button type="button" className="vr-quitar" onClick={alQuitar}>
                  Quitar
                </button>
              </span>
            ) : (
              <span key="varias" className="vr-texto-cambia vr-fl">
                <b>{celdasElegidas.length} variantes elegidas</b>
                {unidadesElegidas !== null && <span>{unidadesTexto(unidadesElegidas)}</span>}
                <button type="button" className="vr-quitar" onClick={alQuitar}>
                  Quitar
                </button>
              </span>
            )}
          </span>
        </div>
        <div className="vr-gran">
          <b className="font-display tabular-nums" data-cero={sinAqui || undefined}>
            <CifraGrande valor={matriz.totalGeneral} />
          </b>
          <span className="vr-gran-txt">
            <span>en {sedeCorta}</span>
            {!sinAqui && detalleOtrasSedes && <span>{detalleOtrasSedes}</span>}
          </span>
        </div>
      </div>

      {sinAqui && (
        <p className="vr-aviso anim-revelar">
          <b>{avisoSinUnidadesAqui(sedeNombre, detalleOtrasSedes)}</b>
        </p>
      )}

      <div
        className="vr-grid"
        role="group"
        aria-label={`Unidades en ${sedeNombre}, por color y talla`}
        data-cruz={cruz.fila !== null || cruz.col !== null || undefined}
        style={estilo({ "--vr-nt": nt })}
        onPointerLeave={salir}
        onKeyDown={flechas}
        onFocus={(e) => {
          const f = (e.target as HTMLElement).closest<HTMLElement>("[data-color]");
          if (f) alVistaPrevia(f.dataset.color!);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) alVistaPrevia(null);
        }}
      >
        <div className="vr-fila vr-cab-t">
          <span className="vr-ct vr-tt" style={{ textAlign: "left", paddingLeft: 8 }}>
            Color
          </span>
          {matriz.columnas.map((c) => {
            const ids = idsDeColumna(c);
            return (
              <button
                key={c.clave}
                type="button"
                className="vr-ct"
                data-activa={cruz.col === c.clave || undefined}
                aria-pressed={todasDe(ids)}
                aria-label={`Elegir la talla ${c.nombre} de todos los colores${c.total === null ? "" : ` (${unidadesTexto(c.total)})`}`}
                onClick={() => alternar(ids)}
                onPointerEnter={entra(null, c.clave)}
              >
                {c.nombre}
                <small className="tabular-nums">
                  <Cifra valor={c.total} retraso={700} />
                </small>
              </button>
            );
          })}
          <span className="vr-ct vr-tt vr-ctot">
            Total
            <small className="tabular-nums">
              <Cifra valor={matriz.totalGeneral} retraso={700} />
            </small>
          </span>
        </div>

        {matriz.filas.map((f, fi) => (
          <Fila
            key={f.clave}
            fila={f}
            indice={fi}
            sedeCorta={sedeCorta}
            columnas={matriz.columnas.map((c) => c.clave)}
            elegidas={elegidas}
            cruz={cruz}
            fijada={f.clave === fijado}
            todasElegidas={todasDe(idsDeFila(f))}
            alternar={alternar}
            alFijar={alFijar}
            entra={entra}
            onda={onda}
          />
        ))}
      </div>
    </section>
  );
}

function FilaSwatch({ fila }: { fila: FilaColor | undefined }) {
  return <span className="vr-sw" style={{ background: fila?.hex, width: 18, height: 18 }} />;
}

function Fila({
  fila,
  indice,
  sedeCorta,
  columnas,
  elegidas,
  cruz,
  fijada,
  todasElegidas,
  alternar,
  alFijar,
  entra,
  onda,
}: {
  fila: FilaColor;
  indice: number;
  sedeCorta: string;
  columnas: string[];
  elegidas: ReadonlySet<string>;
  cruz: { fila: string | null; col: string | null };
  fijada: boolean;
  todasElegidas: boolean;
  alternar: (ids: readonly string[]) => void;
  alFijar: (clave: string) => void;
  entra: (fila: string | null, col: string | null) => (e: PointerEvent) => void;
  onda: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const ids = idsDeFila(fila);
  return (
    <div className="vr-fila" data-color={fila.clave} data-activa={cruz.fila === fila.clave || undefined} data-fijada={fijada || undefined} onPointerEnter={entra(fila.clave, cruz.col)}>
      <button
        type="button"
        className="vr-rcolor"
        aria-pressed={todasElegidas}
        aria-label={`Elegir todas las tallas de ${fila.nombre}`}
        data-pos={`${indice},-1`}
        onClick={() => {
          alFijar(fila.clave);
          alternar(ids);
        }}
      >
        <span className="vr-sw" style={{ background: fila.hex }} />
        <span className="vr-n">
          {fila.nombre}
          <span className="vr-s">{fila.total === null ? "" : fila.total === 0 ? "sin unidades" : unidadesTexto(fila.total)}</span>
        </span>
      </button>
      {fila.celdas.map((c, ci) => {
        const orden = indice + ci;
        if (!c) return <span key={columnas[ci]} className="vr-hueco" style={estilo({ "--vr-i": orden })} title="Esta prenda no se vende en esa talla" aria-hidden="true" />;
        return (
          <Celda
            key={c.varianteId}
            celda={c}
            orden={orden}
            posicion={`${indice},${ci}`}
            sedeCorta={sedeCorta}
            elegida={elegidas.has(c.varianteId)}
            enCruz={cruz.fila === fila.clave || cruz.col === columnas[ci]}
            alTocar={(e) => {
              onda(e);
              alFijar(fila.clave);
              alternar([c.varianteId]);
            }}
            alEntrar={entra(fila.clave, columnas[ci])}
          />
        );
      })}
      <span className="vr-tot tabular-nums vr-ctot">
        <Cifra valor={fila.total} retraso={700} />
      </span>
    </div>
  );
}

function Celda({
  celda,
  orden,
  posicion,
  sedeCorta,
  elegida,
  enCruz,
  alTocar,
  alEntrar,
}: {
  celda: CeldaMatriz;
  orden: number;
  posicion: string;
  sedeCorta: string;
  elegida: boolean;
  enCruz: boolean;
  alTocar: (e: React.MouseEvent<HTMLElement>) => void;
  alEntrar: (e: PointerEvent) => void;
}) {
  const texto = useCifraConRetraso(celda.unidades, retrasoDeCelda(orden), 600);
  return (
    <button
      type="button"
      className="vr-cel"
      data-pos={posicion}
      data-cero={celda.unidades === 0 || undefined}
      data-desconocida={celda.unidades === null || undefined}
      data-inactiva={!celda.activo || undefined}
      data-en-cruz={enCruz || undefined}
      aria-pressed={elegida}
      aria-label={`${celda.nombre}: ${celda.unidades === null ? "sin lectura del stock" : unidadesTexto(celda.unidades)} en ${sedeCorta}${celda.precioDistinto ? `, a S/${celda.precio.toFixed(2)}` : ""}`}
      style={estilo({ "--vr-i": orden, "--vr-n": celda.nivel ?? 0 })}
      onClick={alTocar}
      onPointerEnter={alEntrar}
    >
      <span className="vr-v tabular-nums">{texto}</span>
      <span className="vr-barra" aria-hidden="true">
        <i />
      </span>
      {celda.precioDistinto && <span className="vr-pr tabular-nums">S/{celda.precio.toFixed(2)}</span>}
      <span className="vr-ok" aria-hidden="true">
        <Check strokeWidth={3} className="h-2.5 w-2.5" />
      </span>
      <span className="vr-ondas" aria-hidden="true" />
    </button>
  );
}
