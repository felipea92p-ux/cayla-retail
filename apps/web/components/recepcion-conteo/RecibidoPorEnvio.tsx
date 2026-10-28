"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Modal } from "@/components/ui/Modal";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { FilasDeMas } from "@/components/ui/VerMas";
import type { CostoRecepcion } from "@/components/RecepcionesRecientes";
import { fechaCorta, notaSinEnvio, type RecepcionReciente } from "@/lib/compras-reglas";
import { paginar } from "@/lib/paginacion";
import { agruparPorEnvio, prendasDelEnvio, type EnvioRecibido, type PrendaRecibida } from "@/lib/recibido-por-envio-reglas";
import type { MatrizModelo } from "@/lib/recepcion-matriz-reglas";

// «Terminados» por ENVÍO (Felipe 2026-10-28): una fila por envío, como «Por terminar» (un fardo con dos proveedores ya no sale partido en dos
// filas); una llegada sin envío queda como fila propia. Tocar la fila abre el envío con cada prenda recibida; tocar una prenda despliega los
// colores y tallas que se contaron, y ahí va el costo de lo que entró (antes era una columna de la lista).
const PLANTILLA = "sm:grid-cols-[6rem_8rem_1fr_7rem]";
const PLANTILLA_DETALLE = "sm:grid-cols-[1.5rem_1fr_5rem]";
const PLANTILLA_DETALLE_PROVEEDOR = "sm:grid-cols-[1.5rem_1fr_minmax(0,12rem)_5rem]";

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

export function RecibidoPorEnvio({ recepciones, vacio, costos, porPagina }: { recepciones: RecepcionReciente[]; vacio: string; costos?: Record<string, CostoRecepcion>; porPagina: number }) {
  const [abierto, setAbierto] = useState<EnvioRecibido | null>(null);
  const [pagina, setPagina] = useState(1);
  const envios = agruparPorEnvio(recepciones);
  const actual = paginar(envios, pagina, porPagina);

  if (envios.length === 0) return <p className="card-cayla p-5 text-sm text-tinta/65">{vacio}</p>;
  return (
    <>
      <Tabla>
        <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Fecha" }, { titulo: "Envío" }, { titulo: "Proveedor" }, { titulo: "Unidades", alinear: "der" }]} />
        {actual.filas.map((e) => (
          <button key={e.clave} type="button" data-guia="recibir.reciente" onClick={() => setAbierto(e)} className={`${fila(PLANTILLA)} w-full text-left`}>
            <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(e.fecha)}</span>
            <span className={celda("izq", "text-sm font-semibold tabular-nums text-tinta")}>{e.numero ?? <span className="font-normal text-taupe">Sin envío</span>}</span>
            <span className={celda("izq", "whitespace-normal")}>
              <span className="text-sm font-medium text-tinta">{e.proveedores.join(" · ")}</span>
              <span className="block truncate text-xs text-tinta/65">
                {e.ubicacion}
                {e.recibidoPor ? ` · ${e.recibidoPor}` : ""}
              </span>
            </span>
            <span className={celda("der", "text-sm text-tinta")}>
              {unidades(e.unidades)}
              <span className="block text-xs text-tinta/55">
                {e.lineas} {e.lineas === 1 ? "línea" : "líneas"}
              </span>
            </span>
          </button>
        ))}
        {actual.totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-taupe">
            <span>
              Mostrando {actual.desde}–{actual.hasta} de {envios.length}
            </span>
            <PaginacionLocal pagina={actual.pagina} totalPaginas={actual.totalPaginas} onPagina={setPagina} />
          </div>
        )}
      </Tabla>

      {abierto && <EnvioAbierto envio={abierto} costos={costos} onClose={() => setAbierto(null)} />}
    </>
  );
}

function EnvioAbierto({ envio, costos, onClose }: { envio: EnvioRecibido; costos?: Record<string, CostoRecepcion>; onClose: () => void }) {
  const [desplegadas, setDesplegadas] = useState<ReadonlySet<string>>(new Set());
  const prendas = prendasDelEnvio(envio);
  const variosProveedores = envio.proveedores.length > 1;
  const plantilla = variosProveedores ? PLANTILLA_DETALLE_PROVEEDOR : PLANTILLA_DETALLE;
  const guias = [...new Set(envio.lotes.map((l) => l.numeroGuia).filter((g): g is string => !!g))];
  const notas = [...new Set(envio.lotes.map((l) => notaSinEnvio(l.nota)).filter((n): n is string => !!n))];
  const facturas = envio.lotes.filter((l) => l.conFactura && l.compraId);
  const alternar = (clave: string) =>
    setDesplegadas((prev) => {
      const n = new Set(prev);
      if (!n.delete(clave)) n.add(clave);
      return n;
    });
  return (
    <Modal
      conCerrar
      titulo={envio.numero ?? envio.proveedores.join(" · ")}
      subtitulo={[
        fechaCorta(envio.fecha),
        envio.numero && !variosProveedores ? envio.proveedores[0] : null,
        guias.length > 0 ? `Guía ${guias.join(", ")}` : "Sin guía",
        envio.ubicacion,
        envio.recibidoPor ? `Recibido por ${envio.recibidoPor}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      tamano="mediana"
      onClose={onClose}
    >
      <div data-guia="recibir.detalle" className="mt-4 space-y-4">
        <Tabla>
          <Encabezado plantilla={plantilla} columnas={[{ titulo: "" }, { titulo: "Prenda" }, ...(variosProveedores ? [{ titulo: "Proveedor" }] : []), { titulo: "Cantidad", alinear: "der" as const }]} />
          {prendas.flatMap((p) => {
            const abierta = desplegadas.has(p.clave);
            const panel = `prenda-${p.clave}`;
            return [
              <button key={p.clave} type="button" data-guia="recibir.desplegar" onClick={() => alternar(p.clave)} aria-expanded={abierta} aria-controls={panel} className={`${fila(plantilla)} w-full text-left`}>
                <span className={celda("izq", "text-taupe")}>
                  <ChevronRight aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla ${abierta ? "rotate-90" : ""}`} />
                </span>
                <span className={celda("izq", "whitespace-normal text-sm text-tinta")}>
                  {p.modelo}
                  {p.sku ? ` · ${p.sku}` : ""}
                </span>
                {variosProveedores && <span className={celda("izq", "truncate text-xs text-tinta/65")}>{p.proveedor}</span>}
                <span className={celda("der", "text-sm tabular-nums text-tinta")}>{p.unidades}</span>
              </button>,
              <FilasDeMas key={`${p.clave}-d`} id={panel} abierto={abierta} className="!border-t-0">
                <ColoresYTallas prenda={p} costo={costos?.[p.loteId]} />
              </FilasDeMas>,
            ];
          })}
        </Tabla>

        {notas.map((n) => (
          <p key={n} className="text-sm text-tinta/65">
            <span className="label-cayla text-[11px]">Nota · </span>
            {n}
          </p>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-tinta/10 pt-3">
          <p className="text-xs text-tinta/55">{unidades(envio.unidades)} en total</p>
          {facturas.map((l) => (
            // Cierra este modal antes de navegar: la ruta de factura abre SU propio modal interceptado, y sin esto quedaban los dos apilados.
            <EnlaceVer key={l.loteId} href={`/compras/factura/${l.compraId}`} alNavegar={onClose}>
              Ver factura completa
            </EnlaceVer>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Lo que se contó de una prenda en este envío: colores en filas, tallas en columnas, y el costo de lo que entró (solo quien ve el dinero). */
function ColoresYTallas({ prenda, costo }: { prenda: PrendaRecibida; costo?: CostoRecepcion }) {
  const m: MatrizModelo = prenda.matriz;
  return (
    <div className="space-y-2 bg-hueso/40 px-5 py-3 sm:pl-[3.25rem]">
      <div className="overflow-x-auto">
        <table /* unificar-fijo: matriz color × talla de lo recibido, como las de la ficha (las matrices de tallas quedan aparte) */ className="min-w-[16rem] text-sm tabular-nums">
          <thead>
            <tr className="text-xs font-normal text-taupe">
              <th scope="col" className="py-1 pr-4 text-left font-normal">Color</th>
              {m.tallas.map((t) => (
                <th key={t} scope="col" className="px-3 py-1 text-right font-normal">{t}</th>
              ))}
              <th scope="col" className="py-1 pl-3 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand">
            {m.colores.map((c) => (
              <tr key={c.color}>
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-tinta">{c.color}</th>
                {m.tallas.map((t) => (
                  <td key={t} className={`px-3 py-1.5 text-right ${c.porTalla[t] ? "text-tinta" : "text-taupe"}`}>{c.porTalla[t] ?? "—"}</td>
                ))}
                <td className="py-1.5 pl-3 text-right font-semibold text-tinta">{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {costo &&
        (costo.sinCosto ? (
          <Chip tono="ambar">Sin costo</Chip>
        ) : costo.costo != null ? (
          <Chip tono="verde">{`S/ ${costo.costo.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} c/u`}</Chip>
        ) : null)}
    </div>
  );
}
