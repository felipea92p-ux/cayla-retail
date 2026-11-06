"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { FilasDeMas } from "@/components/ui/VerMas";
import { pasosDelLado, pasosDelLibro, textoDelLibro, type FilaDelLibro, type LadoDelLibro, type PasoDelLibro } from "@/lib/estados-partes";

function Filas({ pasos, desde = 0 }: { pasos: readonly PasoDelLibro[]; desde?: number }) {
  return (
    <div className="estados-libro-filas">
      {pasos.map((p, i) => (
        <div key={p.nombre} className="estados-libro-fila" data-tipo={p.tipo} style={{ "--i": desde + i } as CSSProperties}>
          <span>{p.nombre}</span>
          <u aria-hidden>
            <i style={{ "--a": `${p.desde}%`, "--w": `${p.ancho}%`, "--f": p.color, "--i": desde + i } as CSSProperties} />
          </u>
          <b className="tabular-nums">{textoDelLibro(p.valor)}</b>
        </div>
      ))}
    </div>
  );
}

/** El estado con sus nombres de siempre, para el contador (ADR-0611): se abre aquí mismo y cada fila lleva una barrita que ayuda a leerlo. */
export function LibroDelContador({
  titulo,
  detalle,
  filas,
  lados,
  guia,
  nota,
  pie,
}: {
  titulo: string;
  detalle: string;
  /** Un cuadro de una columna, donde cada fila sigue a la anterior. */
  filas?: readonly FilaDelLibro[];
  /** Un cuadro de dos lados: el Balance. */
  lados?: readonly LadoDelLibro[];
  guia?: string;
  /** La razón de la cifra, en la misma fila del botón. */
  nota?: ReactNode;
  /** Lo que cierra el cuadro. */
  pie?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <div className="estados-nota-fila">
        {nota}
        <button type="button" className="btn-cayla btn-secundario" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)} data-guia={guia}>
          {abierto ? "Ocultar el formato formal" : "Ver el formato formal"}
          <ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla motion-reduce:transition-none ${abierto ? "-rotate-180" : ""}`} />
        </button>
      </div>
      <FilasDeMas abierto={abierto} className="estados-formal">
        <div className="estados-libro">
          <div className="estados-libro-cabeza">
            <h3>{titulo}</h3>
            <span>{detalle}</span>
          </div>
          {filas && <Filas pasos={pasosDelLibro(filas)} />}
          {lados && (
            <div className="estados-libro-dos">
              {lados.map((l, i) => (
                <div key={l.titulo} className="min-w-0">
                  <h4>{l.titulo}</h4>
                  <Filas pasos={pasosDelLado(l)} desde={i * 6} />
                </div>
              ))}
            </div>
          )}
          {pie}
        </div>
      </FilasDeMas>
    </>
  );
}
