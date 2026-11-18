"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { hrefTelar, mesDelDia, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { NOTA_CLAURE_JUNTAS, type SedeJunta, type SedesJuntas as Juntas } from "@/lib/sedes-juntas-reglas";

// Finanzas ▸ Resumen, «Cada sede, junta» (tarea 27 de «Las 36»): lo que vendió, costó, gastó, dejó y tiene cada sede, en una sola tabla, para no saltar entre ¿Ganamos?, el Balance y Dinero.
// Solo dibuja lo que arma `sedesJuntas`. Tabla del kit de Finanzas (ADR-0195), como sus vecinas.

const COLUMNAS_CON_IGV = ["Vendió con IGV", "IGV", "Costó", "Gastó", "Dejó", "En caja"] as const;
const COLUMNAS_SIN_IGV = ["Vendió", "Costó", "Gastó", "Dejó", "En caja"] as const;

function Fila({ s, conIgv, href, total = false }: { s: SedeJunta; conIgv: boolean; href?: (clave: ClaveSede) => string; total?: boolean }) {
  const cifra = (etiqueta: string, n: number, rojo = false, sub?: string) => (
    <td className={`fin-num ${rojo ? "text-rojo" : ""}`} data-l={etiqueta}>
      {total ? <b>{soles(n)}</b> : soles(n)}
      {sub && <span className="fin-sub">{sub}</span>}
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
      {cifra(conIgv ? "Vendió con IGV" : "Vendió", s.vendio, false, s.claure >= 0.005 ? `− ${soles(s.claure)} de CLAURE` : undefined)}
      {conIgv && cifra("IGV", s.igv ?? 0)}
      {cifra("Costó", s.costo, false, s.pctEstimado === null ? undefined : `${s.pctEstimado} % estimado`)}
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
  const { conIgv } = juntas;
  const columnas = conIgv ? COLUMNAS_CON_IGV : COLUMNAS_SIN_IGV;
  return (
    <Superficie pad guia="fin-resumen.sedes-juntas">
      <CabeceraBloque
        titulo="Cada sede, junta"
        bajada={
          conIgv
            ? `Todo lo que vendió con IGV en ${mes}, lo que de eso es IGV, lo que costó, gastó y dejó, y lo que tiene en su caja. El IGV no cuenta en lo que dejó. Los bancos son de toda CAYLA: no se reparten.`
            : `Lo que vendió, costó, gastó y dejó en ${mes}, y lo que tiene en su caja. Las ventas van sin IGV porque no se pudo leer. Los bancos son de toda CAYLA: no se reparten.`
        }
      />
      {falla && (
        <Aviso tono="error" chico className="mt-3">
          {falla}
        </Aviso>
      )}
      <div className={`fin-tabla-wrap sedes-juntas mt-3 ${conIgv ? "sedes-juntas-con-igv" : ""}`}>
        <table className="fin-tabla" /* unificar-fijo: la tabla del kit de Finanzas (fin-tabla), como sus vecinas, ADR-0195 */>
          <caption className="sr-only">{`Lo que vendió, costó, gastó, dejó y tiene cada sede en ${mes}`}</caption>
          <thead>
            <tr>
              <th>Sede</th>
              {columnas.map((c) => (
                <th key={c} className="fin-num">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {juntas.tiendas.map((s) => (
              <Fila key={s.clave} s={s} conIgv={conIgv} href={href} />
            ))}
            {juntas.aparte.map((s) => (
              <Fila key={s.clave} s={s} conIgv={conIgv} href={href} />
            ))}
            <Fila s={juntas.total} conIgv={conIgv} total />
          </tbody>
        </table>
      </div>
      {[...juntas.tiendas, juntas.total].some((s) => s.pctEstimado !== null) && <p className="mt-2 text-sm text-taupe">El % bajo «Costó» es cuánto de lo vendido lleva un costo estimado: el margen de esa parte no es exacto.</p>}
      {juntas.total.claure >= 0.005 && <p className="mt-2 text-sm text-taupe">{NOTA_CLAURE_JUNTAS}</p>}
      {juntas.aparte.length > 0 && <p className="mt-2 text-sm text-taupe">El Taller y la Empresa no venden: se pagan con lo que dejan las tiendas, y no se reparten entre ellas.</p>}
    </Superficie>
  );
}
