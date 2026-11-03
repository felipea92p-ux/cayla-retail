"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, CircleDashed, Clock, Info, TriangleAlert } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { colorDeAvance, textoDeAvance } from "@/lib/avance-color";
import { conMiles, conSigno, type CifrasDelResumen, type EstadoDelResumen } from "@/lib/recepcion-modelos-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import { Odometro } from "./Odometro";

// El resumen del envío (Felipe 2026-11-02, de su boceto): lo que hacía la barra de abajo, siempre a la vista. Dice cómo va TODO el envío, con el filtro que sea; sus filas filtran la lista.
// Sin aviso no hay con qué comparar: se va todo lo que dependa de lo que dijeron.

const ESTADOS: Record<EstadoDelResumen, { texto: string; tono: string; icono: ReactNode }> = {
  cuadran: { texto: "Cuadran", tono: "verde", icono: <Check aria-hidden className="h-3 w-3" /> },
  diferencia: { texto: "Con diferencia", tono: "ambar", icono: <TriangleAlert aria-hidden className="h-3 w-3" /> },
  "por-contar": { texto: "Por contar", tono: "neutro", icono: <CircleDashed aria-hidden className="h-3 w-3" /> },
  despues: { texto: "Tallas para después", tono: "pizarra", icono: <Clock aria-hidden className="h-3 w-3" /> },
};

export function ResumenDelEnvio({
  cifras,
  sinAviso,
  filtroEstado,
  guia,
  responsable,
  fotos,
  sinGuardar = 0,
  onReintentar,
  alCerrar,
  textoAlCerrar,
  puedeCerrar,
  motivoNoCierra,
  onFiltroEstado,
}: {
  cifras: CifrasDelResumen;
  sinAviso: boolean;
  filtroEstado: EstadoDelResumen | null;
  guia: GuiaCampos;
  responsable: ControlResponsable;
  /** El botón de las fotos de las facturas, si la compra tiene papeles. */
  fotos?: ReactNode;
  /** Líneas que no se pudieron guardar, estén donde estén: quien ya siguió con otra cosa no vería el error. */
  sinGuardar?: number;
  onReintentar?: () => void;
  alCerrar: () => void;
  textoAlCerrar: string;
  puedeCerrar: boolean;
  motivoNoCierra?: string;
  onFiltroEstado: (e: EstadoDelResumen | null) => void;
}) {
  // «Cómo se guarda quién cuenta»: la ayuda se abre con un toque (nunca solo con el mouse encima).
  const [verAyuda, setVerAyuda] = useState(false);
  const { dijeron, contadas, diferencia, avance, estados } = cifras;
  const porContar = estados["por-contar"];
  // El botón principal de la pantalla es «Listo, siguiente»: este pasa a serlo recién cuando ya no queda nada por contar.
  const todoContado = porContar === 0 && puedeCerrar;
  const fila = (clave: EstadoDelResumen) => {
    const e = ESTADOS[clave];
    return (
      <button key={clave} type="button" className="rc-estado" aria-pressed={filtroEstado === clave} title={e.texto} onClick={() => onFiltroEstado(filtroEstado === clave ? null : clave)}>
        <span className="rc-estado-punto" data-tono={e.tono}>
          {e.icono}
        </span>
        <span className="rc-estado-nombre">{e.texto}</span>
        <b>
          <span className="sr-only">{e.texto}: </span>
          {conMiles(estados[clave])}
        </b>
      </button>
    );
  };
  return (
    <aside className="rc-panel rc-resumen" aria-label="Resumen del envío">
      <div className="rc-scroll scroll-cayla">
        <div className="rc-resumen-cuerpo">
          <TituloSeccion className="rc-resumen-titulo">Resumen del envío</TituloSeccion>
          {sinGuardar > 0 && (
            <Aviso
              tono="error"
              chico
              accion={
                <button type="button" className="btn-cayla btn-enlace" onClick={onReintentar}>
                  Reintentar
                </button>
              }
            >
              {sinGuardar === 1 ? "Una línea no se pudo guardar." : `${conMiles(sinGuardar)} líneas no se pudieron guardar.`}
            </Aviso>
          )}
          <dl className="rc-totales" data-guia="recepcion.cifra" aria-live="polite">
            {!sinAviso && dijeron != null && (
              <div className="rc-total">
                <dt>Dijeron</dt>
                <dd>{conMiles(dijeron)}</dd>
              </div>
            )}
            <div className="rc-total" data-grande>
              <dt>Contaste</dt>
              <dd>
                <Odometro valor={contadas} />
              </dd>
            </div>
            {!sinAviso && dijeron != null && (
              <div className="rc-total" data-tono={diferencia === 0 ? "verde" : "ambar"}>
                <dt>Diferencia en lo contado</dt>
                <dd>{conSigno(diferencia)}</dd>
              </div>
            )}
          </dl>
          {!sinAviso && avance != null && (
            <div className="rc-avance">
              <p>
                <span>Avance</span>
                <b>{textoDeAvance(avance)}</b>
              </p>
              <BarraAvance pct={Math.min(100, avance)} alto="normal" color={colorDeAvance(avance)} decorativa />
            </div>
          )}
          <div className="rc-estados" data-guia="recepcion.estados">
            {!sinAviso && fila("cuadran")}
            {!sinAviso && fila("diferencia")}
            {fila("por-contar")}
            <div className="rc-separador" />
            {fila("despues")}
          </div>
          <PieGuia guia={guia} tope={2} listo="Todo contado y con su prenda identificada." />
          <div className="rc-quien" data-guia="recepcion.quien-cuenta">
            <div className="rc-quien-titulo">
              <p className="label-cayla text-[11px] text-taupe">Quién cuenta</p>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-taupe transition-colors hover:text-tinta"
                aria-expanded={verAyuda}
                aria-controls="rc-ayuda-quien"
                aria-label="Cómo se guarda quién cuenta"
                onClick={() => setVerAyuda((v) => !v)}
              >
                <Info aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <ComboResponsable control={responsable} compacto className="min-w-0" />
            {verAyuda && (
              <p id="rc-ayuda-quien" className="nota-cayla text-sm">
                Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.
              </p>
            )}
          </div>
          {fotos}
        </div>
      </div>
      <div className="rc-resumen-pie">
        <p>{textoAlCerrar}</p>
        <Boton
          type="button"
          peso={todoContado ? "primario" : "fantasma"}
          onClick={alCerrar}
          disabled={!puedeCerrar}
          title={motivoNoCierra ?? (porContar > 0 ? `Faltan ${conMiles(porContar)} por contar: al cerrar te los va a pedir.` : "Todo está contado.")}
          data-guia="recepcion.pasar-a-cerrar"
        >
          <span className="inline-flex items-center gap-1.5">
            Pasar a cerrar
            <ArrowRight aria-hidden className="h-4 w-4" />
          </span>
        </Boton>
        <p className="rc-resumen-nota">Lo que cuentas se guarda solo.</p>
      </div>
    </aside>
  );
}
