"use client";

import { useState } from "react";
import { Layers, List, ListChecks, Package, RotateCcw, Sparkles } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buenasDeRecibidos, CAUSAS_FALTANTE, CAUSAS_SOBRANTE, despuesDeRecibirEnvio, textoCausa, type CatalogoParaRecibir, type DetalleEnvio, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { BOTON_DE_PENDIENTE, cifrasDelEnvio, paraDespues, textoNoSeReabre, textoPrendas, veredictoDelCerrado, prendasQueEntraron, type ConteosDelEnvio, type LineaParaContar, type ParaDespues } from "@/lib/recepcion-conteo-reglas";
import { HacerAhora } from "./HacerAhora";
import { Sello } from "./piezas";
import { ReabrirEnvio } from "./ReabrirEnvio";

// El envío cerrado (ADR-0393): lo contado ya es oficial. Arriba, cuántas se contaron, cuántas ya están en el stock (listas para etiquetar y
// colgar) y cuántas quedan para después. «Para después» lista lo que falta —separar, poner tallas y colores, crear lo nuevo— con «Hacer
// ahora» (decisión 3: lo hace cualquiera que tenga Recibir). Debajo, lo que no cuadró y, mientras Compras no lo haya resuelto, «Reabrir»
// (decisión 5). El rastro de cierres y reaperturas, al final.

/** Qué pasa después con lo que no cuadró (la misma ayuda que se lee al elegir la causa). */
function consecuencia(causa: string): string | null {
  return [...CAUSAS_FALTANTE, ...CAUSAS_SOBRANTE].find((c) => c.valor === causa)?.ayuda.replace(/\.$/, "") ?? null;
}

export function EnvioCerrado({
  detalle,
  lineas,
  conteos,
  catalogo,
  lotes,
  veExistencias,
  responsable,
  prendas,
  onPrendaVista,
  onCambio,
  onReabierto,
}: {
  detalle: DetalleEnvio;
  lineas: readonly LineaParaContar[];
  conteos: ConteosDelEnvio | null;
  catalogo: CatalogoParaRecibir | null;
  lotes: string[];
  veExistencias: boolean;
  responsable: ControlResponsable;
  prendas: ReadonlyMap<string, PrendaRecepcion>;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onCambio: () => void;
  onReabierto: () => void;
}) {
  const [haciendo, setHaciendo] = useState<ParaDespues | null>(null);
  const [reabriendo, setReabriendo] = useState(false);
  const cifras = cifrasDelEnvio(lineas);
  const lista = paraDespues(lineas);
  // Qué dice el envío sobre el stock: listas para etiquetar o, si nada entró, por qué y qué lo resuelve (formidable 2026-10-13, cambio 1).
  const veredicto = veredictoDelCerrado(lineas, lista);
  const buenas = buenasDeRecibidos(detalle.recibidos);
  const acciones = despuesDeRecibirEnvio({ lotes, buenas, unidades: cifras.enStock, unidadesBuenas: buenas.reduce((a, b) => a + b.cantidad, 0), veExistencias });
  const diferencias = (detalle.diferencias ?? []).filter((d) => d.cantidad > 0);
  const cuando = detalle.cerradoEn ? diaYHoraLima(detalle.cerradoEn) : null;
  const reabrir = conteos?.reabrir ?? null;

  return (
    <div className="space-y-6">
      <div data-guia="recepcion.cerrado" className="space-y-4">
        {/* El sello de la maqueta A: el envío quedó cerrado, y el conteo ya es oficial. */}
        <div className="flex flex-wrap items-center gap-5">
          <Sello />
          <div className="min-w-0 flex-1 basis-80">
            <p className="label-cayla text-[11px] text-taupe">
              Envío cerrado{detalle.sede ? ` · ${detalle.sede.nombre}` : ""}
              {cuando ? ` · ${cuando.dia} ${cuando.hora}` : ""}
            </p>
            <p className="font-display text-[34px] leading-tight text-tinta">{textoPrendas(cifras.contadas)} contadas</p>
            <p className="text-[15px] text-taupe">
              {[detalle.cerradoPor ? `Lo cerró ${detalle.cerradoPor}` : null, `Envío ${detalle.numero}${detalle.numeroGuia ? ` · guía ${detalle.numeroGuia}` : ""}`].filter(Boolean).join(". ")}. El
              conteo ya es oficial: lo que falta se hace después, sin volver a contar.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cifras.dijeron == null ? (
            <TarjetaCifra etiqueta="Dijeron" valor={null}>
              Llegó sin aviso: nada con qué comparar
            </TarjetaCifra>
          ) : (
            <TarjetaCifra etiqueta="Dijeron" valor={cifras.dijeron.toLocaleString("es-PE")} />
          )}
          <TarjetaCifra etiqueta="Contaste" valor={cifras.contadas.toLocaleString("es-PE")} />
          <TarjetaCifra etiqueta="Ya en el stock" valor={cifras.enStock.toLocaleString("es-PE")} unidad="con tallas y colores" tono="verde" />
          <TarjetaCifra etiqueta="Para después" valor={cifras.porDetallar.toLocaleString("es-PE")} tono={cifras.porDetallar > 0 ? "ambar" : "verde"} />
        </div>
      </div>

      <section className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Ya en el stock">
        <TituloSeccion dato={veredicto.chip ? <Chip tono={veredicto.chip.tono}>{veredicto.chip.texto}</Chip> : undefined}>{veredicto.titulo}</TituloSeccion>
        <p className="text-sm text-taupe">{veredicto.texto}</p>
        {cifras.enStock > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Lo que ya se puede vender">
            {prendasQueEntraron(detalle.recibidos).map((p) => (
              <li key={p.nombre}>
                <Chip tono="neutro">
                  {p.nombre} ×{p.cantidad}
                </Chip>
              </li>
            ))}
          </ul>
        )}
        {veredicto.accion && lista.length > 0 ? (
          <div data-guia="recepcion.despues" className="flex flex-wrap gap-2.5">
            <Boton type="button" peso="primario" onClick={() => setHaciendo(lista[0])}>
              {veredicto.accion}
            </Boton>
          </div>
        ) : (
          acciones.length > 0 && (
            <div data-guia="recepcion.despues" className="flex flex-wrap gap-2.5">
              {acciones.map((a) => (
                <BotonEnlace key={a.clave} href={a.href} peso={a.principal ? "primario" : "fantasma"}>
                  {a.texto}
                </BotonEnlace>
              ))}
            </div>
          )
        )}
      </section>

      <section className="rc-pendientes-caja space-y-3 bg-papel p-4 sm:p-5" aria-label="Para después" data-guia="recepcion.para-despues">
        <TituloSeccion
          dato={
            <Chip tono={lista.length ? "pizarra" : "verde"} vivo={lista.length > 0}>
              {lista.length ? "Avisa en Recibir y en el Inicio" : "Todo al día"}
            </Chip>
          }
        >
          {lista.length ? `Para después · ${lista.length} ${lista.length === 1 ? "pendiente" : "pendientes"}` : "Nada quedó para después"}
        </TituloSeccion>
        <p className="text-sm text-taupe">
          {lista.length
            ? "Ya están contadas y en el almacén, pero no en el sistema: hasta terminarlas no se pueden vender ni colgar. Lo puede hacer cualquiera que tenga Recibir, cuando pueda."
            : "El envío quedó separado y detallado."}
        </p>
        {lista.length > 0 && (
          <ul className="space-y-1.5">
            {lista.map((p, i) => (
              <li key={`${p.tipo}-${p.linea}-${i}`} className="rc-pend" data-tipo={p.tipo}>
                <span aria-hidden className="rc-cat-ic" data-tamano="chico">
                  {p.tipo === "separar" ? <Layers className="h-4 w-4" /> : p.tipo === "detalle" ? <ListChecks className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <b className="block text-[14.5px] text-tinta">{p.titulo}</b>
                  <small className="block text-[12.5px] text-taupe">{p.sub}</small>
                </span>
                <Boton type="button" peso="fantasma" onClick={() => setHaciendo(p)}>
                  {BOTON_DE_PENDIENTE[p.tipo]}
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {diferencias.length > 0 && (
        <section className="card-cayla space-y-2 p-4 sm:p-5" aria-label="Lo que no cuadró">
          <TituloSeccion>Lo que no cuadró</TituloSeccion>
          <ul className="space-y-1 text-sm text-tinta">
            {diferencias.map((d, i) => (
              <li key={i}>
                <b className="font-display text-lg tabular-nums">{d.tipo === "faltante" ? `−${d.cantidad}` : `+${d.cantidad}`}</b> {[d.categoria, d.marca].filter(Boolean).join(" · ")}
                {d.causa ? <span> · {textoCausa(d.causa)}</span> : null}
                {d.causa && consecuencia(d.causa) ? <span className="text-taupe"> → {consecuencia(d.causa)}</span> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-taupe">La sede dice qué pasó; Compras decide qué pasa con la plata.</p>
        </section>
      )}

      <section className="card-cayla flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5" aria-label="Reabrir" data-guia="recepcion.reabrir">
        <div className="min-w-0 flex-1 basis-72">
          <TituloSeccion>¿Encontraste algo más?</TituloSeccion>
          <p className="text-sm text-taupe">
            {reabrir?.sePuede === false
              ? `${textoNoSeReabre(reabrir.porQueNo)}.`
              : "Si aparecen las que faltaban o algo quedó mal contado, reabre el envío, corrige y ciérralo de nuevo. Lo que ya entró al stock no se toca."}
          </p>
          {conteos && conteos.cierres.length > 1 && (
            <p className="mt-1 text-xs text-taupe">
              {conteos.cierres
                .map((c) => {
                  const h = c.hechoEn ? diaYHoraLima(c.hechoEn) : null;
                  return `${c.tipo === "cierre" ? "Cerrado" : "Reabierto"}${h ? ` el ${h.dia} a las ${h.hora}` : ""}${c.hechoPor?.nombre ? ` por ${c.hechoPor.nombre}` : ""}${c.motivo ? ` («${c.motivo}»)` : ""}`;
                })
                .join(" · ")}
            </p>
          )}
        </div>
        {reabrir?.sePuede !== false && (
          <Boton type="button" peso="fantasma" onClick={() => setReabriendo(true)}>
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw aria-hidden className="h-4 w-4" />
              Reabrir el conteo
            </span>
          </Boton>
        )}
      </section>

      <div className="flex flex-wrap gap-2.5">
        <BotonEnlace href="/recibir" peso="primario">
          <span className="inline-flex items-center gap-2">
            <Package aria-hidden className="h-4 w-4" />
            Recibir otro
          </span>
        </BotonEnlace>
        <BotonEnlace href="/recibir?vista=recibidas" peso="fantasma">
          <span className="inline-flex items-center gap-2">
            <List aria-hidden className="h-4 w-4" />
            Ver todo lo recibido
          </span>
        </BotonEnlace>
      </div>

      {haciendo && (
        <HacerAhora
          detalle={detalle}
          item={haciendo}
          linea={lineas.find((l) => l.clave === haciendo.linea) ?? null}
          catalogo={catalogo}
          responsable={responsable}
          prendas={prendas}
          onPrendaVista={onPrendaVista}
          onListo={() => {
            setHaciendo(null);
            onCambio();
          }}
          onCerrar={() => setHaciendo(null)}
        />
      )}

      {reabriendo && (
        <ReabrirEnvio
          detalle={detalle}
          responsable={responsable}
          onReabierto={() => {
            setReabriendo(false);
            onReabierto();
          }}
          onCerrar={() => setReabriendo(false)}
        />
      )}
    </div>
  );
}
