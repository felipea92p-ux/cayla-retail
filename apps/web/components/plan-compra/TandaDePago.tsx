"use client";

import { Aviso } from "@/components/ui/Aviso";
import { Campo, CampoSelect, type Opcion } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { CantidadEditable } from "@/components/plan-compra/CantidadEditable";
import { solesEnterosES } from "@/lib/plan-compra-presupuesto";
import { FORMAS_DE_PAGO, ORDEN_DE_FORMAS, frasePorQueLlegaTarde, tandaLlegaTarde, type FormaDePago, type Tanda } from "@/lib/plan-compra-inversion";
import { fechaCortaES } from "@/lib/plan-compra-reglas";
import { diaMes } from "@/lib/fechas-lima";

// Una tanda de compra del Plan (ADR-0527, spike ⑤): cuándo se pide, qué parte de la compra es y cómo se paga. Solo dibuja y avisa; lo que cuesta cada pago y lo que sale de la caja lo cuenta
// `lib/plan-compra-inversion.ts`. Las categorías de abajo son una ayuda para imaginarse qué cae en cada tanda: no se guardan.

const etiquetaDeLaSemana = (fecha: string, hoy: string): string =>
  fecha === hoy ? `Esta semana · hoy ${fechaCortaES(fecha)}` : fecha < hoy ? `${fechaCortaES(fecha)} · ya pasó` : `Semana del ${fechaCortaES(fecha)}`;

/** Las semanas que se ofrecen, más la fecha de la tanda si no es una de ellas (se guardó otro día): nunca se pierde lo ya elegido. */
export function opcionesDeSemana(semanas: readonly string[], pedido: string, hoy: string): Opcion<string>[] {
  const fechas = semanas.includes(pedido) ? [...semanas] : [...semanas, pedido].sort();
  return fechas.map((f) => ({ valor: f, texto: etiquetaDeLaSemana(f, hoy) }));
}

const OPCIONES_DE_FORMA: Opcion<FormaDePago>[] = ORDEN_DE_FORMAS.map((f) => ({ valor: f, texto: FORMAS_DE_PAGO[f].nombre }));

export function TandaDePago({
  numero,
  tanda,
  saleDeCaja,
  esUltima,
  semanas,
  hoy,
  limite,
  diasParaLlegar,
  desde,
  categorias,
  deshabilitado,
  onCambiar,
}: {
  numero: number;
  tanda: Tanda;
  /** Lo que sale de caja por ESTA tanda (con IGV). */
  saleDeCaja: number;
  /** La última tanda toma lo que falta para llegar a 100 %: su porcentaje no se escribe. */
  esUltima: boolean;
  semanas: readonly string[];
  hoy: string;
  /** El último día para pedir y que llegue a tiempo; null = la campaña ya empezó (no hay «tarde»). */
  limite: string | null;
  diasParaLlegar: number;
  /** El primer día de la campaña. */
  desde: string;
  /** Qué categorías caen aquí (ayuda): nombre y lo que cuestan con IGV. */
  categorias: readonly { clave: string; nombre: string; saleDeCaja: number }[];
  deshabilitado: boolean;
  onCambiar: (cambios: Partial<Tanda>) => void;
}) {
  const tarde = tandaLlegaTarde(tanda, limite);
  return (
    <div className="pp-tanda" data-tanda={numero}>
      <TituloSeccion nivel={3} dato={`${tanda.pct} % de la compra · ${solesEnterosES(saleDeCaja)}`}>
        Tanda {numero}
      </TituloSeccion>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect etiqueta="Semana del pedido" valor={tanda.pedido} onValor={(v) => onCambiar({ pedido: v })} opciones={opcionesDeSemana(semanas, tanda.pedido, hoy)} deshabilitado={deshabilitado} />
        <CampoSelect etiqueta="Cómo se paga" valor={tanda.forma} onValor={(v) => onCambiar({ forma: v })} opciones={OPCIONES_DE_FORMA} deshabilitado={deshabilitado} />
      </div>
      {esUltima ? (
        <p className="text-sm text-taupe">El resto de la compra: {tanda.pct} %</p>
      ) : (
        <Campo etiqueta="% de la compra en esta tanda">
          <CantidadEditable valor={tanda.pct} onCambiar={(n) => onCambiar({ pct: n })} etiqueta={`porcentaje de la compra en la tanda ${numero}`} tamano="fila" sufijo="%" max={100} deshabilitado={deshabilitado} />
        </Campo>
      )}
      {tarde && (
        <Aviso tono="atencion" chico titulo={`Pedir el ${diaMes(tanda.pedido)} llega tarde`}>
          {frasePorQueLlegaTarde(tanda, diasParaLlegar, desde)}
        </Aviso>
      )}
      <div className="flex flex-wrap gap-1.5" aria-label={`Categorías de la tanda ${numero}`}>
        {categorias.length > 0 ? (
          categorias.map((c) => (
            <Chip key={c.clave} tono="neutro" versalitas={false}>
              {c.nombre} · {solesEnterosES(c.saleDeCaja)}
            </Chip>
          ))
        ) : (
          <Chip tono="neutro" versalitas={false}>
            {tanda.pct > 0 ? "Lo que quede" : "Sin compra en esta tanda"}
          </Chip>
        )}
      </div>
    </div>
  );
}
