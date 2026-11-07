"use client";

import type { ReactNode } from "react";
import { BadgePercent } from "lucide-react";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { CascadaEstados, LeyendaCascada } from "@/components/finanzas/estados/CascadaEstados";
import { solesCentimos, solesConSignoCentimos } from "@/lib/flujo-caja-reglas";
import { filasDeTramos, type FilaCascada } from "@/lib/cascada-estados-reglas";
import type { metaDeVentas } from "@/lib/ganamos-reglas";
import type { TramoCascada } from "@/lib/pulso-reglas";
import type { CampanaFila, FilaER } from "@/lib/resultados-reglas";

const fechaCorta = (iso: string | null) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");

/**
 * Lo que sigue a un toque en Ganancias y pérdidas (ADR-0611): contra lo planeado, si hay presupuesto; lo que dejó cada sede; las campañas, si se mira un mes; cómo cuadra con Ventas y el cuadro por sede.
 * Con otras fechas el presupuesto y las campañas no se dibujan: van por mes, y a medias mentirían.
 */
export function MasDeGanancias({
  fila,
  tramos,
  meta,
  enCurso,
  sedes,
  campanas,
  hrefCampanas,
  nombreDelMes,
  cuadre,
  cuadro,
}: {
  fila: FilaER | null;
  tramos: TramoCascada[];
  meta: ReturnType<typeof metaDeVentas>;
  enCurso: boolean;
  /** Lo que dejó cada sede, mirando CAYLA entera. */
  sedes: FilaCascada[] | null;
  /** Las campañas del mes, si se mira un mes entero; `null` con otras fechas. */
  campanas: CampanaFila[] | null;
  hrefCampanas: string;
  /** «octubre». */
  nombreDelMes: string;
  cuadre: ReactNode;
  /** El estado de resultados por sede, con lo que hay detrás de cada cifra. */
  cuadro: ReactNode;
}) {
  const filas = fila
    ? filasDeTramos(
        tramos,
        fila.ventas > 0 && tramos.some((x) => x.clave === "costo")
          ? { tras: "costo", clave: "margen", nombre: "Te quedó de margen", detalle: (v) => `${Math.round((v / fila.ventas) * 100)} % de lo vendido` }
          : undefined,
      ).map((f) => (f.clave === "ventas" && meta ? { ...f, detalle: `Meta sin IGV: ${solesCentimos(meta.meta)} · ${enCurso ? "al ritmo de hoy, " : ""}${Math.round(meta.avance * 100)} %` } : f))
    : [];
  const conPlan = filas.some((f) => f.plan !== undefined);
  return (
    <>
      {conPlan && (
        <section data-guia="fin-ganamos.planeado">
          <TituloSeccion accion={<LeyendaCascada plan />}>Contra lo planeado</TituloSeccion>
          <div className="mt-3">
            <CascadaEstados id="fin-ganamos-cascada" filas={filas} etiqueta="De la venta a la ganancia, contra lo planeado; toca un gasto para ver sus partes" />
          </div>
          <p className="mt-2 text-sm text-taupe">Los topes de lo planeado se ponen en Configuración ▸ Gastos.</p>
        </section>
      )}
      {sedes && sedes.length > 1 && (
        <section data-guia="fin-ganamos.sedes">
          <TituloSeccion accion={<span className="text-sm text-taupe">Toca una para verla sola</span>}>Lo que dejó cada sede</TituloSeccion>
          <div className="mt-3">
            <CascadaEstados id="fin-ganamos-sedes" filas={sedes} etiqueta="Lo que dejó cada sede; toca una para verla sola" sedes />
          </div>
        </section>
      )}
      {campanas && (
        <section data-guia="fin-ganamos.campanas">
          <TituloSeccion accion={<EnlaceVer href={hrefCampanas}>Ver las campañas</EnlaceVer>}>{`Campañas de ${nombreDelMes}`}</TituloSeccion>
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
                  <span className="fin-camp-valor" data-tono={c.margenExtra === null ? undefined : c.margenExtra >= 0 ? "verde" : "rojo"} title="Lo que dejó de más (o de menos) contra sus días de comparación">
                    {c.margenExtra === null ? "Sin comparar" : solesConSignoCentimos(c.margenExtra)}
                  </span>
                </div>
              ))
            ) : (
              <Vacio tamano="chico" icono={<BadgePercent />}>
                No hubo campañas en {nombreDelMes}.
              </Vacio>
            )}
          </div>
        </section>
      )}
      {cuadre}
      {cuadro}
    </>
  );
}
