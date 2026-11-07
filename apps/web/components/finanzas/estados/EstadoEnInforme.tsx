import type { ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { CifraQueRueda } from "@/components/finanzas/estados/CifraQueRueda";
import { InformeEstado } from "@/components/finanzas/estados/InformeEstado";
import type { Informe } from "@/lib/estados-informe";

const TONO_CHIP = { bien: "verde", mal: "rojo" } as const;

/** Lo que dice la respuesta de un estado: la cifra, la frase que la interpreta, contra qué se compara y la razón. */
export type LecturaDelEstado = {
  valor: number;
  mal?: boolean;
  conSigno?: boolean;
  frase: string;
  chip?: { texto: string; tono: "bien" | "mal" | null } | null;
  nota?: string | null;
};

/**
 * Un estado financiero, camino «A · El informe» (Felipe 2026-11-06; maqueta `docs/maquetas/estados-financieros-2026-11-rediseno/`): a la izquierda el informe,
 * fila por fila y con las columnas de antes; a la derecha la respuesta (la cifra, la frase, contra qué se compara y cómo viene mes a mes) y lo que hay que
 * saber antes de leerla. Igual en los cuatro estados, para que se aprenda una vez.
 */
export function EstadoEnInforme({
  nombre,
  lectura,
  grafico,
  aviso,
  informe,
  guiaRespuesta,
  guiaInforme,
  guiaContador,
}: {
  /** «Resultado · 1 al 6 de noviembre». */
  nombre: string;
  lectura: LecturaDelEstado;
  /** Cómo viene mes a mes. */
  grafico?: ReactNode;
  /** Lo que hay que saber antes de leer. */
  aviso?: ReactNode;
  informe: Informe;
  guiaRespuesta: string;
  guiaInforme: string;
  guiaContador?: string;
}) {
  return (
    <div className="estados-en-informe">
      <div className="estados-informe-placa">
        <InformeEstado informe={informe} guia={guiaInforme} guiaContador={guiaContador} />
      </div>
      <div className="estados-respuesta-columna">
        <section className="estados-informe-placa estados-respuesta" data-guia={guiaRespuesta}>
          <h2 className="estados-respuesta-nombre">{nombre}</h2>
          <CifraQueRueda valor={lectura.valor} mal={lectura.mal} conSigno={lectura.conSigno} className="estados-respuesta-cifra" />
          <p className="estados-respuesta-frase">{lectura.frase}</p>
          {lectura.chip && (
            <div>
              <Chip tono={lectura.chip.tono ? TONO_CHIP[lectura.chip.tono] : "pizarra"} versalitas={false}>
                {lectura.chip.texto}
              </Chip>
            </div>
          )}
          {grafico && <div className="estados-respuesta-grafico">{grafico}</div>}
          {lectura.nota && <p className="estados-respuesta-nota">{lectura.nota}</p>}
        </section>
        {aviso}
      </div>
    </div>
  );
}
