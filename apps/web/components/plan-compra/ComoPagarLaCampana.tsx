"use client";

import { useMemo } from "react";
import { Ayuda } from "@/components/Ayuda";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Tabla, fila } from "@/components/ui/Tabla";
import { queFaltaEnLaProyeccion, soles } from "@/lib/flujo-caja-reglas";
import type { FormaDePago, Tanda } from "@/lib/plan-compra-inversion";
import { BAJA_DE_COBROS, evaluarFormas, formasParaComparar, leerLaCaja, veredictoDeLaForma, type FlujoDelPlan, type FormaEvaluada, type Veredicto } from "@/lib/plan-compra-pagar";

// «Cómo pagar la campaña» (ADR-0527, la caja; #13 de la auditoría): compara cinco formas de pagar —al contado, a 30 o 60 días, con anticipo— aplicadas a las MISMAS tandas, contra la caja que Finanzas
// ya proyecta, con lo que se espera cobrar y si se cobra 20 % menos. Responde lo útil: «¿aguanto al contado? si no, ¿cuánto crédito necesito?». NO es una predicción (ni de ventas ni de ganancias: Sinatra
// no trae costos y el ERP lleva semanas) y lo dice. Las formas con crédito dependen de que el proveedor las dé (hoy ningún proveedor lo tiene cargado): se muestran, con lo que hay que confirmar, y nunca se
// recomiendan solas. «Usar» solo cambia las tandas de la pantalla: no guarda nada.

const TITULO: Record<Veredicto["tipo"], string> = {
  "caja-ya-apretada": "Tu caja ya viene apretada",
  "contado-aguanta": "Puedes pagar al contado",
  "contado-justo": "Al contado aguanta, pero justo",
  "pide-credito": "Necesitas crédito del proveedor",
  ninguna: "Esta compra no cabe en tu caja",
  "fuera-de-vista": "Todavía no se puede comparar",
};
const TONO: Record<Veredicto["tipo"], "exito" | "atencion" | "error" | "info"> = { "caja-ya-apretada": "atencion", "contado-aguanta": "exito", "contado-justo": "atencion", "pide-credito": "atencion", ninguna: "error", "fuera-de-vista": "info" };

function Resultado({ f, minimo }: { f: FormaEvaluada; minimo: number }) {
  if (f.esperado === null) return <Chip tono="neutro" versalitas={false}>Sin dato</Chip>;
  if (f.aguantaSiVaPeor) return <Chip tono="verde" versalitas={false}>Aguanta</Chip>;
  if (f.aguantaLoEsperado) return <Chip tono="pizarra" versalitas={false} title={minimo > 0 ? "Aguanta con lo esperado; cobrando 20 % menos queda bajo tu mínimo" : "Aguanta con lo esperado; cobrando 20 % menos se queda sin plata"}>Justo</Chip>;
  return <Chip tono="ambar" versalitas={false}>No aguanta</Chip>;
}

export function ComoPagarLaCampana({
  flujo,
  tandas,
  saleDeCaja,
  formaActual,
  onUsar,
  deshabilitado,
}: {
  flujo: FlujoDelPlan | null;
  tandas: readonly Tanda[];
  saleDeCaja: number;
  /** La forma que hoy tienen TODAS las tandas, si es la misma; null si están mezcladas. */
  formaActual: FormaDePago | null;
  onUsar: (forma: FormaDePago) => void;
  deshabilitado: boolean;
}) {
  const caja = useMemo(() => leerLaCaja(flujo), [flujo]);
  const comparacion = useMemo(() => {
    if (!caja || saleDeCaja <= 0) return null;
    const formas = evaluarFormas(caja, saleDeCaja, formasParaComparar(tandas));
    return { formas, veredicto: veredictoDeLaForma(caja, formas) };
  }, [caja, tandas, saleDeCaja]);

  // Sin la caja (sin permiso, caída) o sin nada por pagar, no hay con qué comparar: la gráfica de al lado ya dice por qué.
  if (!caja || !comparacion) return null;
  const { formas, veredicto } = comparacion;
  const { provisional } = queFaltaEnLaProyeccion(caja);
  return (
    <div className="space-y-4" data-guia="pagos.formas">
      <Aviso tono={TONO[veredicto.tipo]} chico titulo={TITULO[veredicto.tipo]}>
        {veredicto.frase}
      </Aviso>
      <Tabla>
        {formas.map((f) => {
          const recomendada = "clave" in veredicto && veredicto.clave === f.clave;
          return (
            <div key={f.clave} className={fila("")} data-forma={f.clave} data-recomendada={recomendada || undefined}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <span className="min-w-0 font-semibold" title={f.requiere ?? undefined}>
                  {f.nombre}
                  {f.requiere && <span className="block text-xs font-normal text-taupe">Pide crédito del proveedor</span>}
                  {formaActual === f.clave && <span className="block text-xs font-normal text-taupe">La que tienes ahora</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Resultado f={f} minimo={caja.minimoCaja} />
                  {formaActual !== f.clave && (
                    <Boton type="button" peso="fantasma" className="btn-chico" disabled={deshabilitado} onClick={() => onUsar(f.clave)}>
                      Usar
                    </Boton>
                  )}
                </span>
              </div>
              <p className="text-xs text-taupe">
                Tu caja más baja <b className="font-semibold tabular-nums text-tinta">{f.esperado ? soles(f.esperado.masBajo.saldo) : "—"}</b> · si se cobra {Math.round(BAJA_DE_COBROS * 100)} % menos{" "}
                <b className="font-semibold tabular-nums text-tinta">{f.flojo ? soles(f.flojo.masBajo.saldo) : "—"}</b>
              </p>
            </div>
          );
        })}
      </Tabla>
      <p className="text-xs text-taupe">
        Compara cada forma de pagar, aplicada a tus mismas tandas, con la caja que Finanzas ya proyecta
        {caja.minimoCaja > 0 ? ` y tu mínimo de ${soles(caja.minimoCaja)}` : ""}. El «{Math.round(BAJA_DE_COBROS * 100)} % menos» es un «¿y si me va peor?», no una predicción.{provisional ? " Como tu caja todavía es provisional, esta comparación también." : ""}{" "}
        <Ayuda titulo="Qué mide y qué no">
          <span className="block">
            «Aguanta» quiere decir que tu caja no baja de tu mínimo (ni de cero) en ningún momento de las próximas 12 semanas, contando lo que Finanzas ya sabe que entra y sale.
          </span>
          <span className="mt-2 block">
            No predice tus ventas ni tus ganancias: la historia de otros años solo trae cuánto se vendió por día, sin costo, y el sistema lleva pocas semanas de datos. Por eso se mira también «si se cobra 20 % menos».
          </span>
          <span className="mt-2 block">
            Las formas a plazo o con anticipo dependen de que tu proveedor las dé: confírmalo con él antes de contar con ellas. Hoy ningún proveedor tiene su crédito cargado en el sistema.
          </span>
        </Ayuda>
      </p>
    </div>
  );
}
