"use client";

import { useState, type ComponentProps } from "react";
import { BadgePercent } from "lucide-react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { ListaDatos } from "@/components/finanzas/kit";
import { CascadaPulso } from "@/components/finanzas/CascadaPulso";
import { ResultadoPulso } from "@/components/finanzas/ResultadoPulso";
import { EstadoResultadosPanel } from "@/components/finanzas/EstadoResultadosPanel";
import { soles } from "@/lib/flujo-caja-reglas";
import { mesNombre, type CampanaFila, type FilaER } from "@/lib/resultados-reglas";
import type { TramoCascada } from "@/lib/pulso-reglas";
import type { metaDeVentas } from "@/lib/ganamos-reglas";

// Estados financieros ▸ ¿Ganamos? (ganancias y pérdidas; ADR-0585, actividad 4). De arriba abajo: la respuesta grande con la cascada de la
// venta a la ganancia siempre a la vista (cada gasto con la raya de lo planeado y su desvío; se toca y muestra sus cuentas, real contra
// planeado); lo que dejó cada sede; las campañas del mes; y, plegado al pie, el estado en su formato formal (el cuadro de siempre, con
// «De dónde sale» en cada cifra). El presupuesto vive aquí: ya no tiene pantalla aparte (Felipe 2026-10-30).

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
  formal,
}: {
  fila: FilaER | null;
  tramos: TramoCascada[];
  meta: ReturnType<typeof metaDeVentas>;
  /** Lo que dejó cada sede, cuando se mira CAYLA entera (cada una lleva a su sede); `null` mirando una sede. */
  sedes: TramoCascada[] | null;
  campanas: CampanaFila[];
  hrefCampanas: string;
  mes: string;
  enCurso: boolean;
  /** El cuadro de siempre, plegado al pie. */
  formal: ComponentProps<typeof EstadoResultadosPanel>;
}) {
  const [verFormal, setVerFormal] = useState(false);
  const conPlan = tramos.some((t) => t.plan !== undefined);
  const leyenda = (
    <p className="text-center text-[12.5px] text-taupe">
      {meta ? `Meta de ventas ${soles(meta.meta)}: ${enCurso ? "al ritmo de hoy llegas al" : "llegaste al"} ${Math.round(meta.avance * 100)} %. ` : ""}
      {conPlan ? "La raya sobre un gasto es lo planeado; tócalo para ver sus partes. Los topes se ponen en Configuración ▸ Presupuesto." : "Toca un gasto para ver sus partes."}
    </p>
  );
  return (
    <div className="min-w-0 space-y-8">
      <ResultadoPulso fila={fila} mes={mes} enCurso={enCurso} tramos={tramos} siempreAbierta pie={leyenda} />

      {sedes && sedes.length > 1 && (
        <section className="space-y-3" data-guia="fin-ganamos.sedes">
          <TituloSeccion>Lo que dejó cada sede</TituloSeccion>
          <CascadaPulso id="fin-ganamos-sedes" tramos={sedes} etiqueta="Lo que dejó cada sede; toca una para verla sola" />
        </section>
      )}

      <section className="space-y-3" data-guia="fin-ganamos.campanas">
        <TituloSeccion accion={<EnlaceVer href={hrefCampanas}>Ver las campañas</EnlaceVer>}>{`Campañas de ${mesNombre(mes)}`}</TituloSeccion>
        {campanas.length ? (
          <ListaDatos
            filas={campanas.map((c) => ({
              dato: `${c.nombre}${c.descuentoPct ? ` · ${c.descuentoPct} % de descuento` : ""} · ${fechaCorta(c.desde)} al ${fechaCorta(c.hasta)}`,
              valor:
                c.margenExtra === null
                  ? "Todavía sin comparar"
                  : c.margenExtra >= 0
                    ? `Dejó ${soles(c.margenExtra)} más que días normales`
                    : `Dejó ${soles(-c.margenExtra)} menos que días normales`,
            }))}
          />
        ) : (
          <Vacio tamano="chico" icono={<BadgePercent />}>
            No hubo campañas en {mesNombre(mes)}.
          </Vacio>
        )}
      </section>

      <section className="space-y-4">
        <BotonVerMas abierto={verFormal} onCambiar={setVerFormal} texto="Ver el formato formal: estado de resultados" forma="enlace" controla="fin-ganamos-formal" data-guia="fin-ganamos.formal-abrir" />
        <FilasDeMas abierto={verFormal} id="fin-ganamos-formal">
          <EstadoResultadosPanel {...formal} />
        </FilasDeMas>
      </section>
    </div>
  );
}
