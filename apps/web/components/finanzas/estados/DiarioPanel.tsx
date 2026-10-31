"use client";

import { useMemo, useState } from "react";
import { Buscador } from "@/components/ui/Buscador";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { Superficie, PieTabla } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import { filtrarDiario } from "@/lib/contador-reglas";
import { fechaCorta } from "@/lib/gastos-reglas";
import { mesNombre, type LineaDiario } from "@/lib/resultados-reglas";

// «Ver ▸ Libro diario del mes» (ADR-0585): cada línea de cada asiento, la misma de `fn_diario` que se descarga, con el nombre de su cuenta y
// su sede. Un mes pasa de 5,000 líneas: se busca mientras se escribe (cuenta, asiento o glosa) y se ve de a 100. Al pie, el debe y el haber
// de lo que se está viendo, que deben ser iguales.

const POR_PAGINA = 100;
const cifra = (v: number) => (Math.round(v * 100) === 0 ? "" : soles(v));

export function DiarioPanel({ lineas, cuentas, sedes, mes }: { lineas: LineaDiario[]; cuentas: Record<string, string>; sedes: Record<string, string>; mes: string }) {
  const [buscado, setBuscado] = useState("");
  const [pagina, setPagina] = useState(1);
  const mapaCuentas = useMemo(() => new Map(Object.entries(cuentas)), [cuentas]);
  const vistas = useMemo(() => filtrarDiario(lineas, buscado, mapaCuentas), [lineas, buscado, mapaCuentas]);
  const paginas = Math.max(1, Math.ceil(vistas.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const enPagina = vistas.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);
  const debe = vistas.reduce((a, l) => a + l.debe, 0);
  const haber = vistas.reduce((a, l) => a + l.haber, 0);
  return (
    <Superficie guia="fin-contador.diario">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-taupe">Libro diario de {mesNombre(mes)}: cada línea de cada asiento, de la más vieja a la más nueva.</p>
        <Buscador
          valor={buscado}
          onCambio={(v) => {
            setBuscado(v);
            setPagina(1);
          }}
          conteo={`${vistas.length} ${vistas.length === 1 ? "línea" : "líneas"}`}
          etiqueta="Buscar en el libro diario"
          placeholder="Cuenta, asiento o glosa" // sugerir-fijo: dice qué se puede buscar, no depende de nada elegido
          className="w-full sm:w-80"
        />
      </div>
      <div className="fin-tabla-wrap">
        <table className="fin-tabla fin-tabla-flujo">
          <caption className="sr-only">Libro diario de {mesNombre(mes)}</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Asiento</th>
              <th>Cuenta</th>
              <th className="fin-num">Debe</th>
              <th className="fin-num">Haber</th>
              <th>Glosa</th>
              <th>Sede</th>
            </tr>
          </thead>
          <tbody>
            {enPagina.map((l, i) => (
              <tr key={`${l.asiento}-${l.cuenta}-${l.origenId}-${i}`}>
                <td data-l="Fecha">{fechaCorta(l.fecha)}</td>
                <td data-l="Asiento" className="num">
                  {l.asiento}
                </td>
                <td data-l="Cuenta">
                  <span className="num text-taupe">{l.cuenta}</span> {cuentas[l.cuenta] ?? ""}
                </td>
                <td className="fin-num" data-l="Debe">
                  {cifra(l.debe)}
                </td>
                <td className="fin-num" data-l="Haber">
                  {cifra(l.haber)}
                </td>
                <td data-l="Glosa">{l.glosa}</td>
                <td data-l="Sede">{l.ubicacionId ? (sedes[l.ubicacionId] ?? "") : "De la empresa"}</td>
              </tr>
            ))}
            <tr className="fin-suave">
              <td data-l="Fecha" colSpan={3}>
                <b>{buscado ? `Total de lo que coincide (${vistas.length} líneas)` : `Total del mes (${vistas.length} líneas)`}</b>
              </td>
              <td className="fin-num" data-l="Debe">
                <b>{soles(debe)}</b>
              </td>
              <td className="fin-num" data-l="Haber">
                <b>{soles(haber)}</b>
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <PieTabla>
          <PaginacionLocal pagina={actual} totalPaginas={paginas} onPagina={setPagina} />
        </PieTabla>
      )}
    </Superficie>
  );
}
