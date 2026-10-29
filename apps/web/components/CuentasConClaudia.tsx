"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { BotonEnlace } from "@/components/ui/campos";
import { soles } from "@/lib/compras-reglas";
import { textoMedioClaure } from "@/lib/cuenta-claure-reglas";
import {
  leerCierreClaure,
  lineaDeHoy,
  lineaDelEfectivo,
  mensajeParaClaudia,
  titularDelCierre,
  type CierreClaure,
} from "@/lib/cierre-claure-reglas";

// El cierre de caja de Lima y CLAURE (ADR-0560, actividad 3). Felipe (2026-10-28): al cerrar la caja el sistema avisa cuánto se le debe a Claudia
// (el neto, con el detalle a la mano), deja listo el resumen para pasárselo, y el líder puede registrar el pago desde ahí. Lo ve quien cierra la
// caja y el líder (el candado es el de cerrar esa caja, `fn_claure_cierre`). NUNCA bloquea ni cambia el cierre: si no aplica (la sede no tiene a
// CLAURE) o no se puede leer, no dibuja nada (principio 9).

/** Lo que la base dice de CLAURE para esa caja; `null` mientras llega, si la sede no tiene a CLAURE o si no se pudo leer. */
export function useCierreClaure(cajaId: string): CierreClaure | null {
  const [cierre, setCierre] = useState<CierreClaure | null>(null);
  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_claure_cierre" as never, { p_caja_id: cajaId } as never)
      .then(({ data, error }) => {
        if (vigente) setCierre(error ? null : leerCierreClaure(data));
      });
    return () => {
      vigente = false;
    };
  }, [cajaId]);
  return cierre;
}

/** En el paso de contar, bajo «Ventas en efectivo»: cuánto de ese efectivo es de CLAURE. Solo informa; lo contado en el cajón es uno solo. */
export function EfectivoDeClaure({ cierre }: { cierre: CierreClaure }) {
  if (cierre.efectivo.claure <= 0) return null;
  return (
    <p className="mt-1.5 text-[11px] leading-snug text-tinta/60">
      De las ventas en efectivo, {soles(cierre.efectivo.claure)} es de CLAURE (lo tiene Claudia) y {soles(cierre.efectivo.cayla)} es de CAYLA.
    </p>
  );
}

/** Tras cerrar: el neto con Claudia, lo de hoy en una línea, el detalle plegado, el resumen para copiar y, para el líder, el pago. */
export function CuentasConClaudia({ cierre }: { cierre: CierreClaure }) {
  const titular = titularDelCierre(cierre);
  const hoy = cierre.hoy;
  return (
    <section className="rounded-xl border border-sand bg-crema/60 p-3.5 text-left" aria-labelledby="cierre-claudia">
      <p id="cierre-claudia" className="label-cayla text-[10px] text-taupe-profundo">
        Cuentas con Claudia
      </p>
      <p className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-sm text-tinta/70">{titular.frase}</span>
        <span className="font-display text-2xl tabular-nums text-tinta">{soles(titular.monto)}</span>
      </p>
      <p className="mt-1.5 text-xs leading-snug text-tinta/65">{lineaDeHoy(cierre)}</p>
      {cierre.efectivo.total > 0 && <p className="mt-1 text-xs leading-snug text-tinta/65">{lineaDelEfectivo(cierre)}</p>}
      {cierre.cambiosPorRevisar > 0 && (
        <p className="mt-1 text-xs leading-snug text-ambar-profundo">
          Hay {cierre.cambiosPorRevisar} {cierre.cambiosPorRevisar === 1 ? "cambio" : "cambios"} con prendas de CLAURE por revisar: todavía no suman.
        </p>
      )}
      <details className="mt-2 rounded-lg border border-dashed border-sand px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-tinta/80">Ver el detalle</summary>
        <dl className="mt-2 space-y-0.5 text-xs text-tinta/70">
          <Fila etiqueta="Se le debía al empezar el día" valor={cierre.saldoAnterior} />
          <Fila etiqueta="+ Cobrado hoy en tus cuentas" valor={hoy.cobrado} />
          {cierre.porMedio
            .filter((m) => m.monto > 0)
            .map((m) => (
              <div key={m.medio} className="flex justify-between gap-2 pl-3 text-tinta/55">
                <dt>{textoMedioClaure(m.medio)}</dt>
                <dd className="tabular-nums">{soles(m.monto)}</dd>
              </div>
            ))}
          {hoy.devuelto > 0 && <Fila etiqueta="− Devuelto hoy" valor={hoy.devuelto} />}
          {hoy.igv !== 0 && <Fila etiqueta="− IGV (lo paga CAYLA)" valor={hoy.igv} />}
          {hoy.comision > 0 && <Fila etiqueta="− Comisión del POS (estimada)" valor={hoy.comision} />}
          {hoy.pagado > 0 && <Fila etiqueta="− Ya pagado hoy" valor={hoy.pagado} />}
          {hoy.efectivoClaudia > 0 && <Fila etiqueta="− Efectivo que se quedó con ella hoy" valor={hoy.efectivoClaudia} />}
          {hoy.gastos > 0 && <Fila etiqueta="− Gastos suyos que pagó CAYLA hoy" valor={hoy.gastos} />}
          <div className="flex justify-between gap-2 border-t border-sand pt-1 font-semibold text-tinta">
            <dt>{titular.frase}</dt>
            <dd className="tabular-nums">{soles(titular.monto)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] leading-snug text-tinta/55">
          El IGV de la boleta lo declara y paga CAYLA, así que se le descuenta a Claudia. La comisión del POS es una estimación con la tarifa de la máquina y la asume CLAURE. El efectivo de CLAURE no entra a lo que se le debe: lo tiene Claudia.
        </p>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <BotonCopiar texto={() => mensajeParaClaudia(cierre)} que="el resumen para Claudia">
          Copiar resumen
        </BotonCopiar>
        {cierre.puedePagar && (
          <BotonEnlace href="/finanzas/dinero/claure?pagar=1" peso="fantasma">
            Pagar a CLAURE
          </BotonEnlace>
        )}
      </div>
    </section>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums">{soles(valor)}</dd>
    </div>
  );
}
