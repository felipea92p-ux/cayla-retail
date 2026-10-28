"use client";

import { useState, type CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { Vacio } from "@/components/ui/Vacio";
import { CascadaPulso } from "@/components/finanzas/CascadaPulso";
import { soles } from "@/lib/flujo-caja-reglas";
import { mesNombre, type FilaER } from "@/lib/resultados-reglas";
import { cascadaDeFila, respuestaDeFila } from "@/lib/pulso-reglas";
import { ChartColumn } from "lucide-react";

// Reportes ▸ Estado de resultados en camino A (Felipe 2026-10-15): antes del cuadro, la respuesta grande «¿cuánto gané en
// octubre?» para lo que se mira, con «¿Por qué?» que abre la cascada. Misma regla y misma pieza que el Resumen (ADR-0358).

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function ResultadoPulso({ fila, mes, enCurso }: { fila: FilaER | null; mes: string; enCurso: boolean }) {
  const [porque, setPorque] = useState(false);
  const vende = !fila || fila.unidad === "tienda" || fila.unidad === "consolidado";
  const nombre = fila ? (fila.unidad === "consolidado" ? "CAYLA" : fila.unidad === "empresa" ? "lo de la empresa" : fila.nombre) : "";
  const pregunta = vende ? `¿Cuánto ${enCurso ? "va ganando" : "ganó"} ${nombre} en ${mesNombre(mes)}?` : `¿Cuánto costó ${nombre} en ${mesNombre(mes)}?`;
  const resp = fila ? respuestaDeFila(fila, { mes, vende, taller: fila.unidad === "taller" }) : null;
  const cascada = fila ? cascadaDeFila(fila) : [];
  return (
    <section className="fin-pulso-hero" aria-labelledby="fin-resultados-pregunta" data-guia="fin-resultados.pulso">
      <p id="fin-resultados-pregunta" {...entra("fin-pulso-pregunta", 1)}>
        {pregunta}
      </p>
      {!resp || resp.estado === "sin_datos" ? (
        <div {...entra("", 2)}>
          <Vacio tamano="chico" icono={<ChartColumn />}>
            {resp?.motivo ?? `Todavía no hay nada registrado en ${mesNombre(mes)}.`}
          </Vacio>
        </div>
      ) : (
        <>
          {vende && (
            <p {...entra("fin-pulso-si", 2)}>
              <Chip tono={resp.estado === "gana" ? "verde" : resp.estado === "pierde" ? "rojo" : "ambar"}>{resp.estado === "gana" ? "Ganó" : resp.estado === "pierde" ? "Perdió" : "Empató"}</Chip>
              <span>{enCurso ? `En lo que va de ${mesNombre(mes)},` : `En ${mesNombre(mes)},`}</span>
            </p>
          )}
          <p {...entra("fin-pulso-respuesta", 3)}>
            <span className="fin-pulso-verbo">{resp.verbo}</span>
            <span className="fin-pulso-monto" data-estado={resp.estado}>
              <CifraAnimada valor={Math.round(resp.monto)} formato="soles" />
            </span>
          </p>
          <p {...entra("fin-pulso-explica", 4)}>{resp.explica}</p>
          {cascada.length > 0 && (
            <div {...entra("fin-pulso-porque", 5)}>
              <button type="button" className="btn-cayla btn-enlace" aria-expanded={porque} aria-controls="fin-resultados-cascada" onClick={() => setPorque((v) => !v)}>
                {porque ? "Cerrar" : `¿Por qué ${soles(resp.monto)}?`}
              </button>
              {porque && <CascadaPulso id="fin-resultados-cascada" tramos={cascada} etiqueta="De dónde sale el número" />}
            </div>
          )}
        </>
      )}
    </section>
  );
}
