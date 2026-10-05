"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { aclaracionDeLaCaja, lineaDeLaSuma, type DesgloseDePrenda } from "@/lib/existencias-prendas";

/* ====================================================================
   Los cuatro lugares de una prenda en una tienda (2026-10-04): Piso (colgada), Almacén (guardada), Apartada y Dañada, con la
   suma explicada y lo que la caja cobra de todo eso. La regla de las cifras y de los dos totales vive en
   `lib/existencias-prendas.ts` (`desgloseDePrenda`); aquí solo se dibuja.

   Las cuatro celdas salen SIEMPRE, también en 0 (atenuadas): si una desapareciera cuando vale 0, la suma se leería distinta de
   una prenda a otra. Una cifra solo es un botón cuando hay algo que hacer con ella (`accion`): un botón que abriría una
   ventana vacía, o que terminaría en «Sin acceso», no se dibuja (ADR-0161).
   ==================================================================== */

type Accion = { texto: string; onClick: () => void };

function Celda({
  etiqueta,
  apodo,
  cantidad,
  ayuda,
  tono,
  accion,
  clase,
}: {
  etiqueta: string;
  /** La palabra de la tienda para ese lugar («colgada», «guardada»): la etiqueta sigue siendo la de la tabla y los filtros. */
  apodo?: string;
  cantidad: number;
  ayuda: string;
  /** Color de la cifra cuando hay algo: ámbar lo que espera una decisión, pizarra lo que es de otro. Con 0 siempre se atenúa. */
  tono?: "ambar" | "pizarra";
  accion?: Accion;
  clase?: string;
}) {
  const colorCifra = cantidad === 0 ? "text-taupe/60" : tono === "ambar" ? "text-ambar-profundo" : tono === "pizarra" ? "text-pizarra" : "text-tinta";
  const contenido: ReactNode = (
    <>
      <span className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-tight">
        <span className="font-medium text-tinta">{etiqueta}</span>
        {apodo && <span className="text-taupe">· {apodo}</span>}
      </span>
      <span className={`mt-2 block font-display text-[30px] leading-none tabular-nums ${colorCifra}`}>{cantidad}</span>
      <span className="mt-2 block text-[12.5px] leading-snug text-taupe">{ayuda}</span>
      {accion && (
        <span className="mt-2 inline-flex items-center gap-0.5 text-[13px] text-tinta underline-offset-[3px] group-hover:underline">
          {accion.texto}
          <ChevronRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );
  const base = `flex h-full w-full flex-col items-start px-4 py-3.5 text-left ${clase ?? ""}`;
  return accion ? (
    <button type="button" onClick={accion.onClick} className={`group ${base} transition-colors hover:bg-hueso/70`}>
      {contenido}
    </button>
  ) : (
    <div className={base}>{contenido}</div>
  );
}

export function DesgloseStockPrenda({
  desglose,
  accionAlmacen,
  accionApartada,
  accionDanada,
}: {
  desglose: DesgloseDePrenda;
  /** «Bajar al piso»: la acción de Reponer que ya existe en el cajón. */
  accionAlmacen?: Accion;
  /** Abre los apartados de ESTA prenda. */
  accionApartada?: Accion;
  /** Abre las dañadas de ESTA prenda: «Decidir» a quien las resuelve, «Ver cuáles» a los demás. */
  accionDanada?: Accion;
}) {
  const suma = lineaDeLaSuma(desglose);
  return (
    <section aria-labelledby="desglose-titulo" className="mt-6">
      <h3 id="desglose-titulo" className="font-display text-[20px] leading-tight text-tinta">
        Dónde está esta prenda
      </h3>
      <p className="mt-1 text-[13.5px] leading-snug text-taupe">Lo que hay de ella en esta sede, por lugar.</p>

      <ul className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-sand">
        <li className="border-b border-r border-sand bg-hueso">
          <Celda etiqueta="Piso" apodo="colgada" cantidad={desglose.piso} ayuda="la caja cobra esto" />
        </li>
        <li className="border-b border-sand">
          <Celda etiqueta="Almacén" apodo="guardada" cantidad={desglose.almacen} ayuda="se baja al piso para venderla" accion={accionAlmacen} />
        </li>
        <li className="border-r border-sand">
          <Celda etiqueta="Apartada" cantidad={desglose.apartada} ayuda="reservada para un cliente" tono="pizarra" accion={accionApartada} />
        </li>
        <li>
          <Celda etiqueta="Dañada" cantidad={desglose.danada} ayuda="en cuarentena" tono="ambar" accion={accionDanada} />
        </li>
      </ul>

      <p className="mt-3 text-[14px] leading-snug text-taupe">
        <b className="font-semibold tabular-nums text-tinta">{suma.cuenta}</b> {suma.texto}
      </p>
      {suma.aparte && <p className="mt-0.5 text-[13px] leading-snug text-taupe">({suma.aparte})</p>}
      <p className="nota-cayla mt-3">{aclaracionDeLaCaja(desglose)}</p>
    </section>
  );
}
