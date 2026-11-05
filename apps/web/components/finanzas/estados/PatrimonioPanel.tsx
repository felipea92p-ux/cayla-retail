"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { Superficie } from "@/components/finanzas/kit";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";
import { cuadroFormalPatrimonio } from "@/lib/patrimonio-reglas";

// Estados financieros ▸ Cambios en el patrimonio: lo que no es la cifra (ADR-0585, ADR-0611). El cuadro del contador por columna (`?forma=formal`) y lo que se dice si faltan los saldos de
// arranque. Las cifras son de `fn_patrimonio_cambios` y `fn_patrimonio_en_fechas`, el mismo diario que el Balance. Lo tuyo es de CAYLA entera.

/** Sin saldos de arranque no hay patrimonio que contar. */
export function PatrimonioSinArranque() {
  return (
    <Vacio icono={<Landmark />} titulo="Faltan los saldos de arranque" guia="fin-patrimonio.vacio">
      Lo tuyo se cuenta desde el día en que CAYLA empezó a usar el sistema. El líder los registra en{" "}
      <Link href="/finanzas/reportes/balance" className="btn-enlace">
        Balance general
      </Link>
      .
    </Vacio>
  );
}

/** El estado de cambios en el patrimonio como lo lee un contador: capital, aportes y resultados acumulados, cada uno del inicio al cierre. */
export function PatrimonioFormal({ datos, titulo }: { datos: Parameters<typeof cuadroFormalPatrimonio>[0]; /** «octubre», «del 5 al 20 de octubre». */ titulo: string }) {
  const filas = cuadroFormalPatrimonio(datos);
  return (
    <Superficie pad guia="fin-patrimonio.formal">
      <p className="mb-3 text-sm text-taupe">Estado de cambios en el patrimonio: {titulo}.</p>
      <div className="fin-tabla-wrap" data-guia="fin-patrimonio.formal-tabla">
        <table className="fin-tabla fin-tabla-flujo">
          <caption className="sr-only">Estado de cambios en el patrimonio: {titulo}</caption>
          <thead>
            <tr>
              <th>Partida</th>
              <th className="fin-num">Capital</th>
              <th className="fin-num">Aportes</th>
              <th className="fin-num">Resultados acumulados</th>
              <th className="fin-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const cifra = (v: number) => (f.fuerte ? soles(v) : Math.round(v) === 0 ? "—" : solesConSigno(v));
              const celda = (v: number, l: string) => (
                <td className="fin-num" data-l={l}>
                  {f.fuerte ? <b>{cifra(v)}</b> : cifra(v)}
                </td>
              );
              return (
                <tr key={f.clave} className={f.fuerte ? "fin-suave" : undefined}>
                  <td data-l="Partida">{f.fuerte ? <b>{f.nombre}</b> : f.nombre}</td>
                  {celda(f.capital, "Capital")}
                  {celda(f.aportes, "Aportes")}
                  {celda(f.utilidades, "Resultados acumulados")}
                  {celda(f.total, "Total")}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Superficie>
  );
}
