"use client";

import type { ComponentProps } from "react";
import { BadgePercent } from "lucide-react";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { EstadoResultadosPanel } from "@/components/finanzas/EstadoResultadosPanel";
import { CascadaEstados, LeyendaCascada } from "@/components/finanzas/estados/CascadaEstados";
import { TitularEstado } from "@/components/finanzas/estados/TitularEstado";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";
import { mesNombre, type CampanaFila, type FilaER } from "@/lib/resultados-reglas";
import type { FormaEstado } from "@/lib/estados-financieros-reglas";
import { filasDeTramos, type FilaCascada } from "@/lib/cascada-estados-reglas";
import { titularGanamos, type metaDeVentas } from "@/lib/ganamos-reglas";
import type { TramoCascada } from "@/lib/pulso-reglas";

// Estados financieros ▸ ¿Ganamos? (ganancias y pérdidas; ADR-0585, actividad 4), dibujado como la maqueta aprobada
// (`docs/maquetas/finanzas-eeff-2026-10/`): en una tarjeta, la respuesta («Sí. Ganaste S/ X» y de cada S/ 100 cuánto quedó); la
// cascada de la venta a la ganancia, que flota (cada gasto empieza donde terminó el anterior), con el margen, la raya de lo planeado y
// su píldora; las campañas del mes y lo que dejó cada sede. Con «Formato formal» arriba (`?forma=formal`), el estado de resultados del
// contador en su lugar. El presupuesto vive aquí.

const fechaCorta = (iso: string | null) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");

export function GanamosPanel({
  fila,
  tramos,
  meta,
  sedes,
  campanas,
  hrefCampanas,
  mes,
  enCurso,
  forma,
  formal,
}: {
  fila: FilaER | null;
  tramos: TramoCascada[];
  meta: ReturnType<typeof metaDeVentas>;
  /** Lo que dejó cada sede, cuando se mira CAYLA entera (cada una lleva a su sede); `null` mirando una sede. */
  sedes: FilaCascada[] | null;
  campanas: CampanaFila[];
  hrefCampanas: string;
  mes: string;
  enCurso: boolean;
  forma: FormaEstado;
  /** El cuadro del contador, cuando se pide el formato formal. */
  formal: ComponentProps<typeof EstadoResultadosPanel>;
}) {
  if (forma === "formal")
    return (
      <div className="min-w-0" data-guia="fin-ganamos.formal">
        <EstadoResultadosPanel {...formal} />
      </div>
    );
  const formalNombre = `Ganancias y pérdidas · ${mesNombre(mes)}`;
  if (!fila)
    return (
      <div className="fin-estado min-w-0">
        <TitularEstado formal={formalNombre} respuesta="Sin números este mes" bajada="Todavía no hay ventas ni gastos registrados en este mes." />
      </div>
    );
  const t = titularGanamos(fila);
  const vende = fila.ventas > 0;
  const filas = filasDeTramos(
    tramos,
    vende && tramos.some((x) => x.clave === "costo")
      ? { tras: "costo", clave: "margen", nombre: "Te quedó de margen", detalle: (v) => `${Math.round((v / fila.ventas) * 100)} % de lo vendido` }
      : undefined,
  ).map((f) =>
    f.clave === "ventas" && meta
      ? { ...f, detalle: `Meta: ${soles(meta.meta)} · ${enCurso ? "al ritmo de hoy, " : ""}${Math.round(meta.avance * 100)} %` }
      : f.tipo === "final"
        ? { ...f, nombre: t.respuesta.split(" ")[0]! }
        : f,
  );
  const conPlan = filas.some((f) => f.plan !== undefined);
  return (
    <div className="fin-estado min-w-0">
      <TitularEstado formal={formalNombre} si={t.si} respuesta={t.respuesta} bajada={t.bajada} guia="fin-ganamos.respuesta" />

      <div className="fin-estado-sep" />
      <section data-guia="fin-ganamos.cascada">
        <TituloSeccion accion={<LeyendaCascada plan={conPlan} />}>De la venta a la ganancia</TituloSeccion>
        <div className="mt-3">
          <CascadaEstados id="fin-ganamos-cascada" filas={filas} etiqueta="De la venta a la ganancia; toca un gasto para ver sus partes" />
        </div>
        {conPlan && <p className="mt-2 text-sm text-taupe">Los topes de lo planeado se ponen en Configuración ▸ Presupuesto.</p>}
      </section>

      <div className="fin-estado-sep" />
      <section data-guia="fin-ganamos.campanas">
        <TituloSeccion accion={<EnlaceVer href={hrefCampanas}>Ver las campañas</EnlaceVer>}>{`Campañas de ${mesNombre(mes)}`}</TituloSeccion>
        <div className="mt-3 flex flex-col gap-2.5">
          {campanas.length ? (
            campanas.map((c) => (
              <div key={c.id} className="fin-camp">
                <span className="fin-camp-sello" aria-hidden>
                  %
                </span>
                <span className="min-w-0">
                  <b>{`${c.nombre}${c.descuentoPct ? ` · ${c.descuentoPct} % de descuento` : ""}`}</b>
                  <small>{`${fechaCorta(c.desde)} al ${fechaCorta(c.hasta)}${c.tiendas ? ` · ${c.tiendas} ${c.tiendas === 1 ? "tienda" : "tiendas"}` : ""}`}</small>
                </span>
                <span className="fin-camp-valor" data-tono={c.margenExtra === null ? undefined : c.margenExtra >= 0 ? "verde" : "rojo"} title="Lo que dejó de más (o de menos) que días normales">
                  {c.margenExtra === null ? "Sin comparar" : solesConSigno(c.margenExtra)}
                </span>
              </div>
            ))
          ) : (
            <Vacio tamano="chico" icono={<BadgePercent />}>
              No hubo campañas en {mesNombre(mes)}.
            </Vacio>
          )}
        </div>
      </section>

      {sedes && sedes.length > 1 && (
        <>
          <div className="fin-estado-sep" />
          <section data-guia="fin-ganamos.sedes">
            <TituloSeccion accion={<span className="text-sm text-taupe">Toca una para verla sola</span>}>Lo que dejó cada sede</TituloSeccion>
            <div className="mt-3">
              <CascadaEstados id="fin-ganamos-sedes" filas={sedes} etiqueta="Lo que dejó cada sede; toca una para verla sola" sedes />
            </div>
          </section>
        </>
      )}

    </div>
  );
}
