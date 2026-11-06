"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { hrefTelar, mesDelDia, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import type { SedeJunta, SedesJuntas as Juntas } from "@/lib/sedes-juntas-reglas";

// Finanzas ▸ Resumen, «Cada sede, junta» (tarea 27 de «Las 36»): lo que vendió, costó, gastó, dejó y tiene cada sede, en una sola tabla, para no saltar entre ¿Ganamos?, el Balance y Dinero.
// Solo dibuja lo que arma `sedesJuntas`. Tabla del kit de Finanzas (ADR-0195), como sus vecinas.

const COLUMNAS = ["Vendió", "Costó", "Gastó", "Dejó", "En caja"] as const;

function Fila({ s, href, total = false }: { s: SedeJunta; href?: (clave: ClaveSede) => string; total?: boolean }) {
  const cifra = (etiqueta: string, n: number, rojo = false) => (
    <td className={`fin-num ${rojo ? "text-rojo" : ""}`} data-l={etiqueta}>
      {total ? <b>{soles(n)}</b> : soles(n)}
    </td>
  );
  return (
    <tr className={total ? "fin-total-t" : undefined}>
      <td data-l="Sede">
        {href ? (
          <Link href={href(s.clave)} scroll={false} className="sedes-juntas-sede btn-enlace">
            <i data-color={s.color} aria-hidden />
            {s.nombre}
          </Link>
        ) : (
          <b>{s.nombre}</b>
        )}
      </td>
      {cifra("Vendió", s.vendio)}
      {cifra("Costó", s.costo)}
      {cifra("Gastó", s.gastos)}
      {cifra("Dejó", s.dejo, s.dejo < 0)}
      <td className="fin-num" data-l="En caja" title={s.tiene === null ? "Sin dato: la Empresa no tiene caja, o una caja sigue abierta" : undefined}>
        {s.tiene === null ? "—" : total ? <b>{soles(s.tiene)}</b> : soles(s.tiene)}
      </td>
    </tr>
  );
}

export function SedesJuntas({ juntas, mes, hoy, falla }: { juntas: Juntas; /** «noviembre». */ mes: string; hoy: string; /** No se pudo leer lo que tiene cada sede. */ falla: string | null }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const href = (clave: ClaveSede) => hrefTelar(pathname, sp.entries(), { sede: clave }, { mismaPantalla: true, mesDeHoy: mesDelDia(hoy) });
  return (
    <Superficie pad guia="fin-resumen.sedes-juntas">
      <CabeceraBloque titulo="Cada sede, junta" bajada={`Lo que vendió, costó, gastó y dejó en ${mes}, y lo que tiene en su caja. Los bancos son de toda CAYLA: no se reparten.`} />
      {falla && (
        <Aviso tono="error" chico className="mt-3">
          {falla}
        </Aviso>
      )}
      <div className="fin-tabla-wrap sedes-juntas mt-3">
        <table className="fin-tabla" /* unificar-fijo: la tabla del kit de Finanzas (fin-tabla), como sus vecinas, ADR-0195 */>
          <caption className="sr-only">{`Lo que vendió, costó, gastó, dejó y tiene cada sede en ${mes}`}</caption>
          <thead>
            <tr>
              <th>Sede</th>
              {COLUMNAS.map((c) => (
                <th key={c} className="fin-num">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {juntas.tiendas.map((s) => (
              <Fila key={s.clave} s={s} href={href} />
            ))}
            {juntas.aparte.map((s) => (
              <Fila key={s.clave} s={s} href={href} />
            ))}
            <Fila s={juntas.total} total />
          </tbody>
        </table>
      </div>
      {juntas.aparte.length > 0 && <p className="mt-2 text-sm text-taupe">El Taller y la Empresa no venden: se pagan con lo que dejan las tiendas, y no se reparten entre ellas.</p>}
    </Superficie>
  );
}
