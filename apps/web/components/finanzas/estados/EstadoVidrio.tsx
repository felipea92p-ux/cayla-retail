import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import { HeroeEstado } from "@/components/finanzas/estados/HeroeEstado";
import { LibroDelContador } from "@/components/finanzas/estados/LibroDelContador";
import { DetalleDeParte, MesaDePartes, TarjetasDePartes, TuboDePartes } from "@/components/finanzas/estados/PartesDelEstado";
import type { FilaDelLibro, ParteEstado } from "@/lib/estados-partes";

export type LecturaDelEstado = {
  valor: number;
  mal?: boolean;
  conSigno?: boolean;
  frase: string;
  chip?: { texto: string; tono: "bien" | "mal" | null } | null;
  nota?: string | null;
};

/**
 * Un estado financiero (ADR-0611; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`), siempre igual para que se aprenda una vez: arriba, la cifra, la frase y un solo gráfico;
 * debajo, lo que lo explica parte por parte, con su detalle completo al tocarla, y el libro del contador. Las cifras vienen de la base y las palabras, de la regla de cada estado.
 */
export function EstadoVidrio({
  nombre,
  lectura,
  grafico,
  conAire,
  guiaRespuesta,
  guiaPartes,
  guiaLibro,
  aviso,
  titulo,
  conTubo,
  partes,
  columnasDeTarjetas,
  tituloColumnas,
  libro,
  pieDeLibro,
}: {
  /** «Ganancias y pérdidas · Octubre 2026». */
  nombre: string;
  lectura: LecturaDelEstado;
  /** El gráfico de arriba. */
  grafico: ReactNode;
  /** El gráfico no llega a los bordes de la placa. */
  conAire?: boolean;
  guiaRespuesta: string;
  guiaPartes: string;
  guiaLibro: string;
  /** Lo que hay que saber antes de leer, debajo de la cifra. */
  aviso?: ReactNode;
  /** Lo que resume lo de abajo: «A dónde se fue lo que vendiste: S/ 123». */
  titulo: string;
  /** Debajo del título va la barra de partes. */
  conTubo?: boolean;
  partes: readonly ParteEstado[];
  columnasDeTarjetas?: number;
  /** «Mes a mes». */
  tituloColumnas: string;
  libro: { titulo: string; detalle: string; filas: readonly FilaDelLibro[] };
  /** Lo que cierra el libro: la ecuación del Balance. */
  pieDeLibro?: ReactNode;
}) {
  const hayPartes = partes.some((p) => Math.round(p.cifra) !== 0);
  return (
    <MesaDePartes className="min-w-0 space-y-4">
      <HeroeEstado nombre={nombre} valor={lectura.valor} mal={lectura.mal} conSigno={lectura.conSigno} frase={lectura.frase} chip={lectura.chip} conAire={conAire} guia={guiaRespuesta}>
        {grafico}
      </HeroeEstado>
      {aviso}
      {hayPartes && (
        <section className="placa-estados estados-debajo" data-guia={guiaPartes}>
          <div className="estados-debajo-titulo">
            <h2 className="tabular-nums">{titulo}</h2>
            <small>Toca una parte para ver su detalle</small>
          </div>
          {conTubo && <TuboDePartes partes={partes} etiqueta={titulo} />}
          <TarjetasDePartes partes={partes} columnas={columnasDeTarjetas} />
          <DetalleDeParte partes={partes} tituloColumnas={tituloColumnas} />
          <LibroDelContador
            titulo={libro.titulo}
            detalle={libro.detalle}
            filas={libro.filas}
            guia={guiaLibro}
            pie={pieDeLibro}
            nota={
              lectura.nota && (
                <p className="estados-nota">
                  <Lightbulb aria-hidden className="h-5 w-5" />
                  <span>{lectura.nota}</span>
                </p>
              )
            }
          />
        </section>
      )}
    </MesaDePartes>
  );
}
