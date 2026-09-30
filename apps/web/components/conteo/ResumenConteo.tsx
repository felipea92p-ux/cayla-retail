import type { ReactNode } from "react";
// Rutas relativas a propósito (ver `EstadoLinea.tsx`): la prueba de render corre en vitest, que no resuelve `@/` para valores.
import { textoProgreso, textoResumen, textoRevision, textoTerminado, type ResumenConteo as ResumenDeConteo } from "../../lib/conteo-reglas";

/* ====================================================================
   ResumenConteo · «cuántas van», dicho siempre con las mismas palabras
   (Inventario ▸ Conteo, rediseño 2026-09-29; plano en el kit de Conteo)

   El resumen de un conteo se dice en cinco lugares —el inicio, Contar, Revisar, el cierre y el resultado— y los
   textos son del contrato (§3.2). Salen de `lib/conteo-reglas.ts` (`textoResumen`, `textoProgreso`, `textoRevision`,
   `textoTerminado`), no de esta pieza: aquí solo se decide QUÉ se muestra y cómo se dibuja, para que las tres pantallas
   que lo usan no reescriban cada una una frase parecida. Es presentacional: recibe números, no llama a nada.

   Las variantes son lugares, no estilos:
     · «completo»  (por defecto) — «18 de 37 variantes verificadas» + la barra + «37 variantes · 18 verificadas ·
                                     19 pendientes · 2 con diferencia». La tarjeta del conteo en curso del inicio.
     · «progreso»  — solo «18 de 37…» y la barra. El pie fijo de Contar (`lateral` va a la derecha del texto: el «Guardado»).
     · «cifras»    — solo la línea de cifras. El encabezado de la lista de Contar, donde la barra ya va en el pie.
     · «revision»  — «37 variantes» y «34 correctas · 3 con diferencia · 0 pendientes» (Revisar conteo).
     · «resultado» — «37 variantes verificadas · 34 coincidieron · 3 con diferencia» (Conteo terminado).
                     `parcial` suma cuántas quedaron sin verificar.

   Una pantalla tiene UNA barra de progreso (`role="progressbar"`): por eso «completo» y «progreso» no se combinan en
   la misma página.

   Alto reservado (ADR-0185): la barra mide siempre 6 px y el texto de progreso es de una línea; la línea de cifras
   reserva la cola «· N con diferencia» aunque todavía no haya ninguna (invisible, fuera de los lectores de pantalla),
   así el texto parte igual en un celular y la lista de abajo no baja 19 px cuando aparece la primera diferencia.

   Sin estado ni efectos: un Server Component (Inicio, Revisar, Resultado) y uno de cliente (Contar) lo dibujan igual.
   ==================================================================== */

export type VarianteResumenConteo = "completo" | "progreso" | "cifras" | "revision" | "resultado";

/** Lo que este resumen lee. `ResumenConteo` de la lib lo cumple entero; el historial lo arma con sus cuatro cifras
 *  (`correctas` es opcional: si falta son las verificadas que no tienen diferencia). */
export type ResumenParaMostrar = Pick<ResumenDeConteo, "variantes" | "verificadas" | "pendientes" | "conDiferencia"> & Partial<Pick<ResumenDeConteo, "correctas">>;

// Un espacio duro antes del punto medio: al partirse la línea, el «·» se queda al final de la anterior y no abre la siguiente.
const sinPuntoAlInicio = (t: string) => t.replaceAll(" · ", " · ");

function Progreso({ resumen, lateral, conPorcentaje = false }: { resumen: ResumenParaMostrar; lateral?: ReactNode; conPorcentaje?: boolean }) {
  const { variantes, verificadas } = resumen;
  const texto = textoProgreso({ verificadas, variantes });
  const porcentaje = variantes > 0 ? Math.min(100, Math.round((verificadas / variantes) * 100)) : 0;
  return (
    <div className="w-full min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`min-w-0 tabular-nums text-tinta ${conPorcentaje ? "text-[15px] font-semibold" : "text-sm font-medium"}`}>{texto}</p>
        {lateral ? <span className="shrink-0 text-xs text-taupe">{lateral}</span> : null}
      </div>
      {/* Discreta: 6 px, tinta sobre sand, la que ya usaba el conteo. Progreso no es «correcto», por eso no es verde. */}
      <div className={conPorcentaje ? "mt-1.5 flex items-center gap-4" : undefined}>
      <div
        role="progressbar"
        aria-label="Variantes verificadas"
        aria-valuemin={0}
        aria-valuemax={variantes}
        aria-valuenow={Math.min(verificadas, variantes)}
        aria-valuetext={texto}
        className={`h-1.5 overflow-hidden rounded-full bg-sand ${conPorcentaje ? "min-w-0 flex-1" : "mt-1.5"}`}
      >
        <div className="h-full rounded-full bg-tinta transition-[width] duration-300 ease-cayla" style={{ width: `${porcentaje}%` }} />
      </div>
      {conPorcentaje && <span className="w-9 shrink-0 text-right text-sm tabular-nums text-tinta/70">{porcentaje}%</span>}
      </div>
    </div>
  );
}

function Cifras({ resumen }: { resumen: ResumenParaMostrar }) {
  const hay = resumen.conDiferencia > 0;
  const base = textoResumen({ ...resumen, conDiferencia: 0 });
  // La cola «· N con diferencia» sale de la misma función que el resto. Sin diferencias se reserva con `1` (invisible).
  const cola = textoResumen({ ...resumen, conDiferencia: hay ? resumen.conDiferencia : 1 }).slice(base.length);
  return (
    <p className="text-xs tabular-nums text-taupe">
      {sinPuntoAlInicio(base)}
      <span aria-hidden={hay ? undefined : true} className={hay ? undefined : "invisible"}>
        {sinPuntoAlInicio(cola)}
      </span>
    </p>
  );
}

export function ResumenConteo({
  resumen,
  variante = "completo",
  parcial = false,
  lateral,
  conPorcentaje = false,
  className = "",
}: {
  resumen: ResumenParaMostrar;
  variante?: VarianteResumenConteo;
  /** Solo «resultado»: el conteo se cerró con variantes sin verificar; se dice cuántas. */
  parcial?: boolean;
  /** Solo «completo» y «progreso»: lo que va a la derecha de «18 de 37…» (el «Guardado» del pie de Contar). */
  lateral?: ReactNode;
  /** Solo «progreso»: el porcentaje al final de la barra («0%»), como el pie de Contar. */
  conPorcentaje?: boolean;
  className?: string;
}) {
  const correctas = resumen.correctas ?? Math.max(0, resumen.verificadas - resumen.conDiferencia);

  if (variante === "revision") {
    return (
      <div className={className}>
        <p className="font-display text-2xl leading-tight tabular-nums text-tinta">
          {resumen.variantes} {resumen.variantes === 1 ? "variante" : "variantes"}
        </p>
        <p className="mt-1 text-sm tabular-nums text-taupe">{sinPuntoAlInicio(textoRevision({ correctas, conDiferencia: resumen.conDiferencia, pendientes: resumen.pendientes }))}</p>
      </div>
    );
  }

  if (variante === "resultado") {
    return (
      <p className={`text-sm tabular-nums text-tinta/75 ${className}`}>
        {sinPuntoAlInicio(textoTerminado({ verificadas: resumen.verificadas, correctas, conDiferencia: resumen.conDiferencia, pendientes: resumen.pendientes }, parcial))}
      </p>
    );
  }

  if (variante === "cifras") {
    return (
      <div className={className}>
        <Cifras resumen={resumen} />
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Progreso resumen={resumen} lateral={lateral} conPorcentaje={conPorcentaje} />
      {variante === "completo" && <Cifras resumen={resumen} />}
    </div>
  );
}
