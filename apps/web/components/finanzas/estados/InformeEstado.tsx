"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { solesCentimos } from "@/lib/flujo-caja-reglas";
import { anchoEnElInforme, bloquesDelInforme, seAbre, type FilaInforme, type Informe } from "@/lib/estados-informe";

const cifra = (v: number | null) => (v === null ? "—" : solesCentimos(v));

/**
 * Un estado financiero como informe (camino «A · El informe», Felipe 2026-11-06): una fila por concepto, la columna de ahora y las de antes, y lo que pesa
 * cada fila. Una fila con algo que decir se abre en su lugar con qué es y lo que la compone. «Nombres del contador» cambia las palabras, no las cifras.
 * Es un estado contable con sus columnas, no una tabla de registros: por eso no es `<Tabla>` (como el kit de Finanzas, ADR-0195).
 */
export function InformeEstado({ informe, guia, guiaContador }: { informe: Informe; guia?: string; guiaContador?: string }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [contador, setContador] = useState(false);
  const { columnas, filas } = informe;
  // Con tres columnas o más, las de antes de la anterior se esconden en una placa angosta.
  const viejo = (j: number) => columnas.length >= 3 && j < columnas.length - 2;
  return (
    <section className="estados-informe" data-guia={guia}>
      <div className="estados-informe-cabeza">
        <h2>{informe.titulo}</h2>
        <button type="button" className="btn-cayla btn-sutil btn-chico" aria-pressed={contador} onClick={() => setContador((c) => !c)} data-guia={guiaContador}>
          {contador ? "Nombres de tienda" : "Nombres del contador"}
        </button>
      </div>
      <table className="estados-informe-tabla">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Concepto</span>
            </th>
            {columnas.map((c) => (
              <th key={c.etiqueta} scope="col" data-actual={c.actual || undefined} data-viejo={viejo(columnas.indexOf(c)) || undefined}>
                {c.etiqueta}
              </th>
            ))}
            {informe.pesoDe && <th scope="col">{informe.pesoDe}</th>}
          </tr>
        </thead>
        {bloquesDelInforme(filas).map((bloque) => (
          <tbody key={bloque[0]!.clave}>
            {bloque.map((f) => {
            const i = filas.indexOf(f);
            if (f.tipo === "seccion") {
              return (
                <tr key={f.clave} className="estados-informe-fila" data-tipo="seccion" style={{ "--i": i } as CSSProperties}>
                  <th scope="rowgroup" colSpan={columnas.length + (informe.pesoDe ? 2 : 1)}>
                    {f.nombre}
                  </th>
                </tr>
              );
            }
            const abre = seAbre(f);
            const esta = abierta === f.clave;
            return (
              <Fragment key={f.clave}>
                <tr className="estados-informe-fila" data-tipo={f.tipo} data-abierta={esta || undefined} style={{ "--i": i } as CSSProperties}>
                  <th scope="row">
                    <NombreDeFila fila={f} contador={contador} abre={abre} abierta={esta} onAbrir={() => setAbierta(esta ? null : f.clave)} ancho={f.tipo === "linea" && informe.pesoDe ? anchoEnElInforme(f, filas, informe.referencia) : null} />
                  </th>
                  {f.valores.map((v, j) => {
                    const actual = columnas[j]?.actual;
                    return (
                      <td key={columnas[j]?.etiqueta ?? j} className="tabular-nums" data-actual={actual || undefined} data-viejo={viejo(j) || undefined} data-tono={(actual && f.tono) || undefined}>
                        {cifra(v)}
                      </td>
                    );
                  })}
                  {informe.pesoDe && (
                    <td className="tabular-nums estados-informe-peso" data-tono={f.tono || undefined}>
                      {f.peso ?? ""}
                    </td>
                  )}
                </tr>
                {abre && esta && (
                  <tr className="estados-informe-abierta">
                    <td colSpan={columnas.length + (informe.pesoDe ? 2 : 1)}>
                      <DetalleDeFila fila={f} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
            })}
          </tbody>
        ))}
      </table>
    </section>
  );
}

function NombreDeFila({ fila, contador, abre, abierta, onAbrir, ancho }: { fila: FilaInforme; contador: boolean; abre: boolean; abierta: boolean; onAbrir: () => void; ancho: number | null }) {
  const texto = (
    <>
      {fila.resta && (
        <span className="estados-informe-menos" aria-label="menos">
          −
        </span>
      )}
      {contador ? fila.contable : fila.nombre}
    </>
  );
  return (
    <span className="estados-informe-nombre">
      {abre ? (
        <button type="button" aria-expanded={abierta} onClick={onAbrir}>
          {texto}
          <ChevronRight aria-hidden className="h-4 w-4" data-abierta={abierta || undefined} />
        </button>
      ) : (
        <span>{texto}</span>
      )}
      {ancho !== null && (
        <u aria-hidden>
          <i style={{ "--w": `${ancho}%` } as CSSProperties} />
        </u>
      )}
    </span>
  );
}

function DetalleDeFila({ fila }: { fila: FilaInforme }) {
  return (
    <div className="estados-informe-detalle">
      {fila.que && <p>{fila.que}</p>}
      {fila.aviso && <p className="estados-informe-aviso">{fila.aviso}</p>}
      {fila.detalle && fila.detalle.length > 0 && (
        <ul>
          {fila.detalle.map((d) => (
            <li key={d.nombre}>
              <span>{d.nombre}</span>
              <b className="tabular-nums">{solesCentimos(d.valor)}</b>
            </li>
          ))}
        </ul>
      )}
      {fila.ver && <EnlaceVer href={fila.ver.href}>{fila.ver.texto}</EnlaceVer>}
    </div>
  );
}
