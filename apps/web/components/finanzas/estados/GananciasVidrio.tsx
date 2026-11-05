import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import { HeroeEstado } from "@/components/finanzas/estados/HeroeEstado";
import { LibroDelContador } from "@/components/finanzas/estados/LibroDelContador";
import { DetalleDeParte, MesaDePartes, TarjetasDePartes, TuboDePartes } from "@/components/finanzas/estados/PartesDelEstado";
import type { FilaDelLibro, ParteEstado } from "@/lib/estados-partes";
import type { LecturaDeGanancias } from "@/lib/estados-ganancias";
import type { Periodo } from "@/lib/estados-periodo";

/**
 * Estados financieros ▸ Ganancias y pérdidas (ADR-0611; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): la cifra, la frase y cómo viene mes a mes; debajo, a dónde se fue lo
 * que se vendió, parte por parte, y el libro del contador. Las cifras vienen de la base y las palabras de `lib/estados-ganancias.ts`.
 */
export function GananciasVidrio({
  nombre,
  lectura,
  partes,
  tituloPartes,
  periodo,
  libro,
  linea,
}: {
  nombre: string;
  lectura: LecturaDeGanancias;
  partes: readonly ParteEstado[];
  tituloPartes: string;
  periodo: Periodo;
  libro: readonly FilaDelLibro[];
  /** La línea de los meses: llega sola, con su propio `Suspense`. */
  linea: ReactNode;
}) {
  const hayPartes = partes.some((p) => p.cifra !== 0);
  return (
    <MesaDePartes className="min-w-0 space-y-4">
      <HeroeEstado nombre={nombre} valor={lectura.valor} mal={lectura.mal} frase={lectura.frase} chip={lectura.chip} guia="fin-ganamos.respuesta">
        {linea}
      </HeroeEstado>
      {hayPartes && (
        <section className="placa-estados estados-debajo" data-guia="fin-ganamos.partes">
          <div className="estados-debajo-titulo">
            <h2 className="tabular-nums">{tituloPartes}</h2>
            <small>Toca una parte para ver su detalle</small>
          </div>
          <TuboDePartes partes={partes} etiqueta={tituloPartes} />
          <TarjetasDePartes partes={partes} />
          <DetalleDeParte partes={partes} tituloColumnas={periodo.unMes ? "Mes a mes" : "Período a período"} />
          <LibroDelContador
            titulo="Ganancias y pérdidas"
            detalle={`${periodo.titulo} · en soles · formato del contador`}
            filas={libro}
            guia="fin-ganamos.libro"
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
