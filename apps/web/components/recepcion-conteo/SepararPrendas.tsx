"use client";

import { useState } from "react";
import { Minus, Plus, Search, Sparkles, X } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ElegirPrendaExistente } from "@/components/recepcion-envio/ElegirPrendaExistente";
import type { CategoriaDeLinea, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  cambiarCantidadPrenda,
  cambiarNuevasSinDescribir,
  nuevasSinDescribir,
  quitarPrenda,
  sumarPrenda,
  textoPrendas,
  totalSeparado,
  type PrendaSeparada,
  type Separado,
} from "@/lib/recepcion-conteo-reglas";

// «¿Qué chompas son?» (ADR-0393, decisiones 1 y 8): separar lo contado por prenda, si se quiere. Una conocida se busca por su nombre (entre
// las de esa categoría y marca) y se pone cuántas eran; con sus tallas y colores entra al stock al cerrar, sin ellas queda «por detallar».
// Lo nuevo es solo cuántas («por crear»). Lo que no se separa queda «sin separar»: nada de esto frena el cierre. La misma pieza sirve en
// «Hacer ahora», con lo que quedó de una línea ya cerrada.

const BOTON_PASO =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-taupe transition-colors hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-30";

/** − 3 + : cuántas de una fila. */
export function PasoCantidad({ valor, onValor, etiqueta, minimo = 0 }: { valor: number; onValor: (n: number) => void; etiqueta: string; minimo?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-xl border border-sand bg-papel px-0.5">
      <button type="button" className={BOTON_PASO} onClick={() => onValor(valor - 1)} disabled={valor <= minimo} aria-label={`Una menos de ${etiqueta}`}>
        <Minus aria-hidden className="h-4 w-4" />
      </button>
      <span className="min-w-8 text-center text-[15px] font-semibold tabular-nums text-tinta" aria-live="polite">
        {valor}
      </span>
      <button type="button" className={BOTON_PASO} onClick={() => onValor(valor + 1)} aria-label={`Una más de ${etiqueta}`}>
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </span>
  );
}

export function SepararPrendas({
  categoria,
  marca,
  separado,
  /** Hasta cuántas se pueden separar (lo contado menos lo que ya entró al stock; en «Hacer ahora», lo que queda sin separar). */
  tope,
  enHacerAhora = false,
  onSeparado,
  onTallas,
  onPrendaVista,
}: {
  categoria: CategoriaDeLinea;
  marca: { id: string; nombre: string };
  separado: Separado;
  tope: number;
  enHacerAhora?: boolean;
  onSeparado: (s: Separado) => void;
  onTallas: (p: PrendaSeparada) => void;
  /** Una prenda elegida en la búsqueda (con sus tallas y colores): la pantalla la guarda para la hoja de tallas. */
  onPrendaVista: (p: PrendaRecepcion) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const total = totalSeparado(separado);
  const sinSeparar = Math.max(0, tope - total);
  const nuevas = nuevasSinDescribir(separado);
  const nombre = categoria.nombre.toLowerCase();

  return (
    <div data-guia="recepcion.separar" className="space-y-3 rounded-2xl border border-sand bg-crema/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-tinta">
          ¿Qué {nombre} son?{" "}
          {!enHacerAhora && <span className="font-normal text-taupe">· opcional: puedes dejarlo para después</span>}
        </p>
        {tope > 0 && (sinSeparar > 0 ? <Chip tono="neutro">{sinSeparar} sin separar</Chip> : <Chip tono="verde">Todas separadas</Chip>)}
      </div>

      <div className="flex flex-wrap gap-2">
        <Boton type="button" peso="discreto" onClick={() => setBuscando((b) => !b)} aria-expanded={buscando}>
          <span className="inline-flex items-center gap-1.5">
            <Search aria-hidden className="h-4 w-4" />
            Una que ya está en el catálogo
          </span>
        </Boton>
        {!enHacerAhora || sinSeparar > 0 ? (
          <Boton type="button" peso="discreto" onClick={() => onSeparado(cambiarNuevasSinDescribir(separado, nuevas + 1))}>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles aria-hidden className="h-4 w-4" />
              Es nueva
            </span>
          </Boton>
        ) : null}
      </div>

      {buscando && (
        <ElegirPrendaExistente
          categoria={categoria}
          marca={marca}
          onElegir={(p) => {
            setBuscando(false);
            onPrendaVista(p);
            onSeparado(sumarPrenda(separado, { productoId: p.productoId, nombre: p.nombre, codigo: p.codigo }));
          }}
          onEsNueva={() => {
            setBuscando(false);
            onSeparado(cambiarNuevasSinDescribir(separado, nuevas + 1));
          }}
        />
      )}

      {(separado.prendas.length > 0 || nuevas > 0) && (
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-papel">
          {separado.prendas.map((p) => (
            <li key={p.productoId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-medium text-tinta">{p.nombre ?? "Prenda"}</p>
                <p className="text-xs text-taupe">
                  {p.variantes
                    ? p.variantes.map((v) => `${[v.talla, v.color].filter(Boolean).join(" ")} ${v.cantidad}`).join(" · ")
                    : enHacerAhora
                      ? "Falta poner sus tallas y colores"
                      : "Sin tallas: queda por detallar si no las pones"}
                </p>
              </div>
              {p.variantes ? (
                <span className="inline-flex items-center gap-2">
                  <Chip tono="verde">Entra al stock</Chip>
                  <Boton type="button" peso="discreto" onClick={() => onTallas(p)}>
                    Cambiar
                  </Boton>
                </span>
              ) : (
                <Boton type="button" peso="discreto" onClick={() => onTallas(p)}>
                  Tallas y colores
                </Boton>
              )}
              {/* El número y la × van juntos: en una hoja angosta bajan de línea a la vez, la × nunca queda sola. */}
              <span className="inline-flex items-center gap-1">
                <PasoCantidad valor={p.cantidad} etiqueta={p.nombre ?? "esta prenda"} minimo={1} onValor={(n) => onSeparado(cambiarCantidadPrenda(separado, p.productoId, n))} />
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-sand hover:text-tinta"
                  aria-label={`Quitar ${p.nombre ?? "esta prenda"}`}
                  onClick={() => onSeparado(quitarPrenda(separado, p.productoId))}
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
          {nuevas > 0 && (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-medium text-tinta">Nuevas, no están en el catálogo</p>
                <p className="text-xs text-taupe">Solo cuántas: crearlas (nombre, tallas, colores, precio) queda para después.</p>
              </div>
              <Chip tono="pizarra">Por crear</Chip>
              <PasoCantidad valor={nuevas} etiqueta="nuevas" onValor={(n) => onSeparado(cambiarNuevasSinDescribir(separado, n))} />
            </li>
          )}
        </ul>
      )}

      {!enHacerAhora && sinSeparar > 0 && total > 0 && (
        <p className="text-xs text-taupe">Las {textoPrendas(sinSeparar)} que no separes quedan como pendiente del envío: no frenan el cierre.</p>
      )}
      {total > tope &&
        (enHacerAhora ? (
          <p className="text-xs text-ambar">Solo quedan {textoPrendas(tope)} sin separar: si llegaron más, reabre el conteo.</p>
        ) : (
          <p className="text-xs text-ambar">Separaste más de las que contaste: al guardar, lo contado sube a {total}.</p>
        ))}
    </div>
  );
}
