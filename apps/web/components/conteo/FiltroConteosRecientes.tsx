"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { hrefRecientes } from "@/lib/conteo-recientes-reglas";

/* ====================================================================
   FiltroConteosRecientes · Todos · Hoy · Ayer · otra fecha (Inventario ▸ Conteo, 2026-10-01)

   El filtro vive en la URL (`?dia=aaaa-mm-dd`), como los de Existencias y Movimientos: la página es un Server Component que lee
   y dibuja, el enlace se comparte y «atrás» vuelve al día anterior. Las tres píldoras son enlaces (no necesitan JavaScript); la
   fecha exacta es el `CampoFecha` de siempre —se tipea o se elige en el calendario, con el teclado completo—, y el calendario
   marca con un punto los días que tienen conteos para no ir a ciegas.

   Hoy y Ayer dicen cuántos conteos trajeron. «Todos» no lleva cifra: muestra los más recientes (un tope), no «todos» de verdad,
   y una cifra que no coincidiera con lo que se ve sería peor que ninguna. Elegir en el calendario el día de hoy o el de ayer
   enciende la píldora de siempre: el mismo filtro no tiene dos caras.

   Rediseño 2026-10-01: una sola fila alineada. Antes la etiqueta «OTRA FECHA» flotaba sobre un campo con hilo y las píldoras
   quedaban 13 px más abajo; ahora «Otra fecha» va al lado, como texto, y el campo es la caja hundida de los demás filtros del
   ERP (`CampoFecha caja`, con su etiqueta para lectores de pantalla).
   ==================================================================== */

export function FiltroConteosRecientes({
  dia,
  hoy,
  ayer,
  deHoy,
  deAyer,
  diasConConteos,
  variantes = [],
}: {
  /** El día filtrado (`aaaa-mm-dd`), o `null` en «Todos». */
  dia: string | null;
  hoy: string;
  ayer: string;
  deHoy: number;
  deAyer: number;
  diasConConteos: string[];
  /** «Contar esta prenda» (`?variantes=`): se conserva al cambiar de día. */
  variantes?: string[];
}) {
  const router = useRouter();
  // Hoy y Ayer tienen su píldora: la fecha exacta solo se escribe en el campo si es OTRA.
  const otraFecha = dia && dia !== hoy && dia !== ayer ? dia : "";

  return (
    <div role="group" aria-label="Filtrar los conteos por día" className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <Link href={hrefRecientes(null, variantes)} scroll={false} className="pildora-cayla" aria-current={dia === null ? "true" : undefined} data-activa={dia === null}>
        Todos
      </Link>
      <Link href={hrefRecientes(hoy, variantes)} scroll={false} className="pildora-cayla" aria-current={dia === hoy ? "true" : undefined} data-activa={dia === hoy}>
        Hoy <span className="font-normal opacity-70 dark:opacity-85">{deHoy}</span>
      </Link>
      <Link href={hrefRecientes(ayer, variantes)} scroll={false} className="pildora-cayla" aria-current={dia === ayer ? "true" : undefined} data-activa={dia === ayer}>
        Ayer <span className="font-normal opacity-70 dark:opacity-85">{deAyer}</span>
      </Link>
      <div className="flex items-center gap-2 sm:pl-1.5">
        <span aria-hidden className="text-[13px] text-taupe">
          Otra fecha
        </span>
        {/* `CampoFecha` deja debajo un renglón para avisos (`mt-1` + 0,9 rem): aquí nunca los hay, y ese renglón sacaba la caja del
            centro de la fila. El margen negativo es exactamente esa altura. */}
        <div className="-mb-[1.15rem] w-36">
          <CampoFecha
            caja
            etiqueta="Otra fecha"
            valor={otraFecha}
            onValor={(iso) => router.push(hrefRecientes(iso || null, variantes), { scroll: false })}
            diasMarcados={diasConConteos}
            descripcionMarcado="con conteos"
          />
        </div>
      </div>
    </div>
  );
}
