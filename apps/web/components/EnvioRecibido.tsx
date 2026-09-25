"use client";

import Link from "next/link";
import { CloudOff } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { soles } from "@/lib/compras-reglas";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import type { MovimientoDelEnvio } from "@/lib/envio-reglas";

// «Envío recibido»: lo que queda después de confirmar (spike de Recibir, 2026-09-19). No es solo «61 unidades»:
// muestra QUÉ entró, prenda por prenda, colgando de un hilo — la idea de que cada prenda entra como un
// movimiento del historial y el stock no se edita a mano (principio 4) se ve, no se cuenta.
//
// El sello dibuja su tilde y suelta dos ondas una vez; la cifra sube contando; los movimientos entran uno tras
// otro y su hilo (el del Atelier) crece hacia abajo. Todo ocurre una vez y se apaga con movimiento reducido.

export type ResultadoEnvio = {
  unidades: number;
  proveedores: number;
  /** Los lotes que dejó el envío (uno por proveedor): de ahí salen las etiquetas de precio (ADR-0180). */
  lotes: string[];
  extras: number;
  deOtraSede: number;
  traslados: { resultado: string }[];
  cierres: number;
  /** Lo que el proveedor queda debiendo en notas de crédito, a su costo con IGV. 0 = nada que reclamar (o quien
   *  recibió no es líder: el reclamo es dinero y vive en `/compras/notas-credito`). */
  porReclamar: number;
  yaRegistrado: boolean;
  /** Se cortó el internet al confirmar: el envío quedó en la cola de este navegador y sube solo (ADR-0209). Todavía
   *  no hay lotes (sin etiquetas de precio) ni resultado de traslados: eso lo decide la base al subir. */
  sinConexion?: boolean;
  /** Lo que quedó escrito en el stock, prenda por prenda. */
  movimientos: MovimientoDelEnvio[];
};

const VISIBLES = 7;

export function EnvioRecibido({ resultado: ok, ubicacionNombre, onOtroEnvio }: { resultado: ResultadoEnvio; ubicacionNombre: string; onOtroEnvio: () => void }) {
  const ver = ok.movimientos.slice(0, VISIBLES);
  const mas = ok.movimientos.length - ver.length;
  // Lo que vino de otra sede ya llega etiquetado (entra por traslado, no por lote): solo se etiqueta lo del proveedor.
  const porEtiquetar = ok.unidades - ok.deOtraSede;
  return (
    <div className="card-cayla anim-entra flex flex-col items-center gap-2 px-6 pb-8 pt-10 text-center">
      {ok.sinConexion ? (
        // Sin conexión no hay «visto» verde: todavía no se registró nada. Nube tachada en ámbar, quieta.
        <span aria-hidden className="mb-2 grid h-[76px] w-[76px] place-items-center rounded-full border-2 border-ambar text-ambar-profundo">
          <CloudOff className="h-8 w-8" strokeWidth={1.6} />
        </span>
      ) : (
        <span aria-hidden className="relative mb-2 block h-[76px] w-[76px]">
          <span className="anim-onda absolute inset-[6px] rounded-full border-2 border-verde" />
          <span className="anim-onda anim-onda-2 absolute inset-[6px] rounded-full border-2 border-verde" />
          <svg viewBox="0 0 76 76" className="anim-sello relative h-[76px] w-[76px] fill-none stroke-verde-profundo" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle pathLength="1" cx="38" cy="38" r="33" />
            <path pathLength="1" d="M24 39l10 10 19-21" />
          </svg>
        </span>
      )}
      <p className="label-cayla text-[11px] text-tinta/65">{ok.sinConexion ? "Envío guardado sin conexión" : ok.yaRegistrado ? "Envío ya registrado" : "Envío recibido"}</p>
      {ok.sinConexion && (
        <p className="max-w-lg text-sm text-ambar-profundo">
          Quedó guardado en este equipo y sube solo cuando vuelva el internet. No cierres esta pestaña. Las etiquetas de precio se imprimen cuando suba.
        </p>
      )}
      {ok.unidades > 0 ? (
        <>
          <p className="font-display text-[44px] leading-[1.1] tabular-nums text-tinta">
            <CifraQueCuenta valor={ok.unidades} alMontar /> {ok.unidades === 1 ? "unidad" : "unidades"}
          </p>
          <p className="max-w-lg text-sm text-tinta/70">
            {ok.sinConexion ? "Sumarán" : "Ya suman"} al stock de {ubicacionNombre}
            {ok.proveedores > 0 && `, de ${ok.proveedores === 1 ? "un proveedor" : `${ok.proveedores} proveedores`}`}
            {ok.extras > 0 && ` (${ok.extras} ${ok.extras === 1 ? "prenda" : "prendas"} fuera de comprobante)`}
            {ok.deOtraSede > 0 && ` y ${ok.deOtraSede} de otra sede`}.
          </p>
        </>
      ) : (
        <p className="font-display text-3xl text-tinta">Nada que sumar al stock</p>
      )}
      {ok.traslados.length > 0 && (
        <p className="max-w-lg text-sm text-tinta/70">
          {ok.traslados.map((t) => (t.resultado === "cerrada" ? "Un traslado confirmado completo." : "Un traslado quedó con diferencia: un líder lo revisa.")).join(" ")}
        </p>
      )}
      {ok.cierres > 0 && (
        <p className="max-w-lg text-sm text-tinta/70">
          {ok.cierres} {ok.cierres === 1 ? "faltante cerrado" : "faltantes cerrados"}. Quedan en el historial del comprobante.
        </p>
      )}
      {/* El documento del proveedor no se registra acá: se reclama en su módulo (solo líder — `porReclamar` llega en 0 para el resto). */}
      {ok.porReclamar > 0 && (
        <p className="flex max-w-lg flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-tinta/70">
          <span>
            El proveedor te debe <b className="font-semibold tabular-nums text-ambar-profundo">{soles(ok.porReclamar)}</b> en notas de crédito.
          </span>
          <Link href="/compras/notas-credito" className="rounded-full transition-opacity hover:opacity-80">
            <Chip tono="ambar">Se reclama en Notas de crédito ↗</Chip>
          </Link>
        </p>
      )}

      {ver.length > 0 && (
        <ol aria-label="Movimientos que dejó el envío" className="relative mt-4 w-full max-w-xl pl-[22px] text-left">
          <span aria-hidden className="recibir-hilo absolute bottom-1.5 left-[5px] top-1.5 w-0.5 bg-taupe/50" />
          {ver.map((m, i) => (
            <li key={i} style={{ "--i": i } as React.CSSProperties} className="anim-movimiento relative grid grid-cols-[3.2rem_1fr_auto] gap-2.5 py-1.5 text-[13.5px]">
              <span aria-hidden className="absolute -left-[21px] top-[14px] h-2 w-2 rounded-full border-2 border-taupe bg-papel" />
              <b className="font-display text-lg font-normal tabular-nums text-verde-profundo">+{m.cantidad}</b>
              <span className="min-w-0 truncate text-tinta">
                {m.referencia}
                {m.detalle ? ` · ${m.detalle}` : ""}
              </span>
              <small className="text-xs text-tinta/55">{m.origen}</small>
            </li>
          ))}
          {mas > 0 && (
            <li style={{ "--i": ver.length } as React.CSSProperties} className="anim-movimiento py-1.5 text-xs text-tinta/55">
              y {mas} {mas === 1 ? "movimiento más" : "movimientos más"}…
            </li>
          )}
        </ol>
      )}

      {porEtiquetar > 0 && ok.lotes.length > 0 && (
        <Link href={urlEtiquetasDePrecio({ lotes: ok.lotes })} className="btn-cayla btn-primario mt-4">
          Imprimir {porEtiquetar === 1 ? "la etiqueta" : `${porEtiquetar} etiquetas`} de precio
        </Link>
      )}

      <div className="flex flex-wrap justify-center gap-3 pt-4">
        <Boton peso="discreto" onClick={onOtroEnvio}>
          Recibir otro envío
        </Boton>
        {/* Sin red, navegar deja la pestaña en una página que no carga (y la cola solo sube desde Recibir). */}
        {!ok.sinConexion && (
          <Link href="/recibir?vista=recibidas&nueva=1" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema hover:bg-rojo">
            Ver recibidas
          </Link>
        )}
      </div>
    </div>
  );
}
