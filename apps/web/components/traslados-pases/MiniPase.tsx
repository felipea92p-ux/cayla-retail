"use client";

import Link from "next/link";
import { LineaViaje } from "@/components/traslados-pases/LineaViaje";
import { SelloPase, glifoDeTono } from "@/components/traslados-pases/SelloPase";
import type { VistaPase } from "@/lib/traslados-pases-reglas";

/** Un pase en la billetera: se ve la franja de arriba (qué le toca y el número) y, si es el elegido o el último, la ruta entera. */
export function MiniPase({ pase, actual, href }: { pase: VistaPase; actual: boolean; href: string }) {
  return (
    <Link href={href} scroll={false} className="tp-mini" data-tp-tono={pase.tono} aria-current={actual ? "page" : undefined}>
      <span className="tp-mini-banda">
        <SelloPase glifo={glifoDeTono(pase.tono)} tono={pase.tono} tamano={28} />
        <span className="tp-mini-nombre">{pase.nombre}</span>
        <span className="tp-mini-num">{pase.rotulo}</span>
      </span>
      <span className="tp-mini-ruta">
        <b className="tp-cod" data-largo={pase.codigoOrigen.length > 3 ? "" : undefined}>
          {pase.codigoOrigen}
        </b>
        <LineaViaje progreso={pase.progreso} conCamion={pase.conCamion} tarde={pase.tarde} quieto />
        <b className="tp-cod" data-largo={pase.codigoDestino.length > 3 ? "" : undefined}>
          {pase.codigoDestino}
        </b>
        <span className="tp-mini-cifra">
          {pase.sello ? (
            <span className="tp-mini-sello">{pase.sello.texto}</span>
          ) : (
            <>
              <b>{pase.cifra.grande}</b>
              <small>{pase.cifra.chica}</small>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
