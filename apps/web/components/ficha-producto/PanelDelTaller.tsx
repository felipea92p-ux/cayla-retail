"use client";

import { useRef } from "react";
import Image from "next/image";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { vistaDeFotos, type FotoLocal } from "@/lib/fotos-por-color-reglas";
import { compararTallas } from "@/lib/tallas";
import type { FilaFicha } from "@/lib/variantes-ficha-reglas";
import type { PendienteFicha } from "@/lib/producto-ficha-guia";
import { rangoDePrecios, tonoDeBarra } from "@/lib/matriz-ficha-reglas";
import { useSubirFotos, type FotoSubida } from "./useSubirFotos";
import type { ContextoFicha } from "./piezas";
import type { StockFicha } from "./useStockFicha";

// Panel del taller (maqueta B, Felipe 2026-10-02): la columna derecha que usa el ancho que ADR-0257 dejó libre. Es la identidad
// visual de la prenda en vivo —la foto del color elegido, sus colores, el stock por talla de ese color, el precio y lo que le falta—
// para que quien ajusta precios o stock a la izquierda vea de un vistazo qué le falta sin bajar a buscarlo.
//
// NO es un segundo lugar para guardar (ADR-0257: guardar es solo la barra de abajo). Lo que hace aquí es lo mismo que hace la
// izquierda, por el mismo camino: el stepper de cada talla es el ajuste de `useStockFicha` (con el motivo de la visita), y
// «Cambiar foto» sube la foto con la misma revisión de siempre (`useSubirFotos`, ADR-0228) y la deja en la ficha hasta «Revisar y
// guardar», como cualquier foto de la sección «Fotos».

export function PanelDelTaller({
  ctx,
  filas,
  colores,
  colorMostrado,
  onElegirColor,
  fotosVista,
  onFotosSubidas,
  stock,
  onAbrirModal,
  pendientes,
  completadaAqui,
  onIrPendiente,
  deshabilitado,
}: {
  ctx: ContextoFicha;
  filas: readonly FilaFicha[];
  /** Los colores que la prenda vende hoy, en el orden de la ficha. */
  colores: readonly string[];
  /** El color que el panel muestra (el elegido, o el que tiene el mouse encima en la matriz). */
  colorMostrado: string | null;
  onElegirColor: (c: string | null) => void;
  fotosVista: readonly FotoLocal[];
  /** Fotos recién subidas desde el panel: van al color mostrado y pasan a ser su portada. */
  onFotosSubidas: (nuevas: FotoSubida[]) => void;
  stock: StockFicha;
  onAbrirModal: (color: string | null) => void;
  pendientes: readonly PendienteFicha[];
  completadaAqui: boolean;
  onIrPendiente: (p: PendienteFicha, colorSinFoto: string | null) => void;
  deshabilitado: boolean;
}) {
  const n = ctx.nombres;
  const archivo = useRef<HTMLInputElement>(null);
  const { elegir, ocupado, revision } = useSubirFotos({ onSubidas: onFotosSubidas });

  const vista = vistaDeFotos(colores, fotosVista as FotoLocal[]);
  const tarjeta = vista.tarjetas.find((t) => t.codigo === colorMostrado);
  const propia = tarjeta?.fotos[0] ?? null;
  const foto = propia ?? vista.general.fotos[0] ?? null;
  const sinFoto = (c: string) => vista.tarjetas.find((t) => t.codigo === c)?.estado === "sin-foto";
  const color = (c: string | null) => ctx.colores.find((x) => x.codigo === c);

  const delColor = filas
    .filter((f) => f.activo && f.colorCodigo === colorMostrado)
    .slice()
    .sort((a, b) => compararTallas(n.talla(a.tallaId), n.talla(b.tallaId)));
  const numero = (f: FilaFicha) => (f.id && f.guardada ? stock.numero(f.id) : stock.numeroNueva(f.clave));
  const max = Math.max(1, ...delColor.map(numero));

  const precios = filas
    .filter((f) => f.activo)
    .map((f) => Number(f.precio))
    .filter((p) => p > 0);
  const primerSinFoto = colores.find(sinFoto) ?? null;
  const pendiente = pendientes[0];

  return (
    <aside aria-label="Identidad y stock de la prenda" className="taller-panel min-w-0 lg:sticky lg:top-6">
      <div className="taller-panel-foto">
        <div className="taller-foto-grande">
          {foto ? (
            <Image key={foto.url} src={foto.url} alt="" fill sizes="340px" className="taller-foto-img object-cover" unoptimized />
          ) : (
            <div className="taller-foto-vacia">{colorMostrado ? `Sin foto de ${n.color(colorMostrado)} todavía` : "Sin fotos todavía"}</div>
          )}
          {colorMostrado && (
            <span className="taller-tagcolor">
              <span className="grid h-[9px] w-[9px] place-items-center overflow-hidden rounded-full">
                <span className="block scale-[1.1]">
                  <Punto hex={color(colorMostrado)?.hex ?? null} familia={color(colorMostrado)?.familiaColor} />
                </span>
              </span>
              {n.color(colorMostrado)}
            </span>
          )}
          <button
            type="button"
            className="taller-btn-foto"
            data-sin-foto={!propia || undefined}
            disabled={deshabilitado || ocupado}
            onClick={() => archivo.current?.click()}
          >
            {propia ? "Cambiar foto" : "+ Agregar foto"}
          </button>
          <input
            ref={archivo}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const archivos = [...(e.target.files ?? [])];
              e.target.value = "";
              if (archivos.length > 0) elegir(archivos, colorMostrado);
            }}
          />
        </div>
        {colores.length > 0 && (
          <div className="taller-swatches">
            {colores.map((c) => {
              const col = color(c);
              return (
                <button
                  key={c}
                  type="button"
                  className="taller-swatch"
                  aria-pressed={c === colorMostrado}
                  data-sin-foto={sinFoto(c) || undefined}
                  title={sinFoto(c) ? `${n.color(c)} — sin foto` : n.color(c)}
                  aria-label={n.color(c)}
                  onClick={() => onElegirColor(c)}
                >
                  <span className="absolute inset-0 grid place-items-center overflow-hidden rounded-full">
                    <span className="block scale-[2.9]">
                      <Punto hex={col?.hex ?? null} familia={col?.familiaColor} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {colorMostrado !== null && delColor.length > 0 && (
        <div className="taller-tarjeta">
          <p className="taller-tit mb-2.5 flex justify-between">
            <span>Stock por talla</span>
            <span>{n.color(colorMostrado)}</span>
          </p>
          {delColor.map((f) => {
            const u = numero(f);
            const guardada = !!(f.id && f.guardada);
            const esperando = guardada && stock.cargando;
            const talla = n.talla(f.tallaId) || "Única";
            const nombre = `${n.color(colorMostrado)} · ${talla}`;
            const puedeBajar = guardada ? stock.puedeAjustar && stock.puedeBajar(f.id!) : u > 0;
            const conBotones = !guardada || stock.puedeAjustar;
            return (
              <div key={f.clave} className="taller-barra-talla">
                <b className="text-[12px] text-taupe">{talla}</b>
                <div className="taller-pista">
                  <div
                    className="taller-relleno"
                    data-tono={tonoDeBarra(u)}
                    role="progressbar"
                    aria-valuenow={u}
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-label={`${nombre}: ${u} ${u === 1 ? "unidad" : "unidades"}`}
                    style={{ width: esperando ? 0 : `${Math.round((u / max) * 100)}%` }}
                  />
                </div>
                <span className="text-right text-[12px] tabular-nums text-tinta">{esperando ? "…" : u}</span>
                {conBotones ? (
                  <span className="taller-stepper" data-mini="true">
                    <button
                      type="button"
                      aria-label={`Una menos de ${nombre}`}
                      disabled={deshabilitado || esperando || !puedeBajar}
                      onClick={() => (guardada ? stock.paso(f.id!, -1) : stock.pasoNueva(f.clave, -1))}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label={`Una más de ${nombre}`}
                      disabled={deshabilitado || esperando}
                      onClick={() => {
                        if (!guardada) return stock.pasoNueva(f.clave, 1);
                        if (stock.paso(f.id!, 1).abrirModal) onAbrirModal(f.guardada!.colorCodigo);
                      }}
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}

      {precios.length > 0 && (
        <div className="taller-tarjeta flex items-center justify-between">
          <span className="taller-tit">Precio de la prenda</span>
          <span className="taller-rango">{rangoDePrecios(precios).replace("–", " – ")}</span>
        </div>
      )}

      {pendiente ? (
        <button type="button" className="taller-tarjeta taller-guia" onClick={() => onIrPendiente(pendiente, primerSinFoto)} title={pendiente.detalle}>
          <span className="taller-hilo" aria-hidden />
          <span>
            Falta <b>{pendiente.etiqueta.charAt(0).toLowerCase() + pendiente.etiqueta.slice(1)}</b>
            {pendientes.length > 1 ? ` y ${pendientes.length - 1} más` : ""} — no hace falta para guardar
          </span>
        </button>
      ) : (
        completadaAqui && (
          <div className="taller-tarjeta taller-guia" data-completa="true" role="status">
            <span className="taller-hilo" aria-hidden />
            Ficha completa
          </div>
        )
      )}

      <p className="text-center text-[11.5px] text-tinta/45">Guardar sigue abajo, en la barra.</p>
      {revision}
    </aside>
  );
}
