"use client";

import { useState } from "react";
import { Layers, ListChecks, RotateCcw, Sparkles } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buenasDeRecibidos, despuesDeRecibirEnvio, textoCausa, type CatalogoParaRecibir, type DetalleEnvio, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { cifrasDelEnvio, paraDespues, textoNoSeReabre, textoPrendas, type ConteosDelEnvio, type LineaParaContar, type ParaDespues } from "@/lib/recepcion-conteo-reglas";
import { HacerAhora } from "./HacerAhora";
import { ReabrirEnvio } from "./ReabrirEnvio";

// El envío cerrado (ADR-0393): lo contado ya es oficial. Arriba, cuántas se contaron, cuántas ya están en el stock (listas para etiquetar y
// colgar) y cuántas quedan para después. «Para después» lista lo que falta —separar, poner tallas y colores, crear lo nuevo— con «Hacer
// ahora» (decisión 3: lo hace cualquiera que tenga Recibir). Debajo, lo que no cuadró y, mientras Compras no lo haya resuelto, «Reabrir»
// (decisión 5). El rastro de cierres y reaperturas, al final.

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
  const buenas = buenasDeRecibidos(detalle.recibidos);
  const acciones = despuesDeRecibirEnvio({ lotes, buenas, unidades: cifras.enStock, unidadesBuenas: buenas.reduce((a, b) => a + b.cantidad, 0), veExistencias });
  const diferencias = (detalle.diferencias ?? []).filter((d) => d.cantidad > 0);
  const cuando = detalle.cerradoEn ? diaYHoraLima(detalle.cerradoEn) : null;
  const reabrir = conteos?.reabrir ?? null;

  return (
    <div className="space-y-6">
      <div data-guia="recepcion.cerrado" className="space-y-4">
        <Aviso tono="exito" titulo={`${textoPrendas(cifras.contadas)} contadas`}>
          {cuando ? `Se cerró el ${cuando.dia} a las ${cuando.hora}${detalle.cerradoPor ? `, lo cerró ${detalle.cerradoPor}` : ""}. ` : ""}
          El conteo ya es oficial: lo que falta se hace después, sin volver a contar.
        </Aviso>
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
        <TituloSeccion dato={<Chip tono={cifras.enStock > 0 ? "verde" : "neutro"}>{cifras.enStock > 0 ? "Listas para etiquetar" : "Esperan sus pendientes"}</Chip>}>
          {cifras.enStock > 0 ? `${textoPrendas(cifras.enStock)} ya están en el stock del almacén` : "Todavía nada entró al stock"}
        </TituloSeccion>
        <p className="text-sm text-taupe">
          {cifras.enStock > 0
            ? "Son las que ya tienen tallas y colores. Todo llegó sin etiqueta: lo que sigue es imprimir la etiqueta de precio y colgarlas."
            : "Al stock entra lo que tiene tallas y colores: resuelve los pendientes de abajo y entra solo."}
        </p>
        {acciones.length > 0 && (
          <div data-guia="recepcion.despues" className="flex flex-wrap gap-2.5">
            {acciones.map((a) => (
              <BotonEnlace key={a.clave} href={a.href} peso={a.principal ? "primario" : "fantasma"}>
                {a.texto}
              </BotonEnlace>
            ))}
          </div>
        )}
      </section>

      <section className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Para después" data-guia="recepcion.para-despues">
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
          <ul className="divide-y divide-sand rounded-xl border border-sand bg-papel">
            {lista.map((p, i) => (
              <li key={`${p.tipo}-${p.linea}-${i}`} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sand text-tinta">
                  {p.tipo === "separar" ? <Layers className="h-4 w-4" /> : p.tipo === "detalle" ? <ListChecks className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block text-sm font-medium text-tinta">{p.titulo}</span>
                  <span className="block text-xs text-taupe">{p.sub}</span>
                </span>
                <Boton type="button" peso="fantasma" onClick={() => setHaciendo(p)}>
                  {p.tipo === "crear" ? "+ Crear ahora" : "Hacer ahora"}
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
                <b className="tabular-nums">{d.tipo === "faltante" ? `−${d.cantidad}` : `+${d.cantidad}`}</b> {[d.categoria, d.marca].filter(Boolean).join(" · ")}
                {d.causa ? <span className="text-taupe"> · {textoCausa(d.causa)}</span> : null}
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
