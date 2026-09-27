"use client";

import Link from "next/link";
import { X } from "lucide-react";
// Ruta relativa a propósito: la prueba de render de este componente (`existencias-vacio.test.ts`) corre en vitest, que no resuelve `@/`
// para valores (los tipos se borran y no importan).
import { textoSinStock, type ClaveFiltro, type ExplicacionVacio } from "../lib/existencias-vacio";

/* ====================================================================
   Estado vacío de Existencias (2026-09-26)

   Antes decía solo «Ningún producto coincide con la búsqueda.» y quien buscaba una marca no sabía si la
   marca no existía, estaba mal escrita, la sede no la había recibido o un filtro la escondía. Ahora explica
   qué leyó el buscador, ofrece quitar UNA cosa a la vez (con cuántas prendas se verían) y, si el producto
   existe en el catálogo pero esta sede no lo tiene, lo dice aparte y sin protagonismo.

   Presentacional: no busca nada ni conoce Supabase. Todo llega calculado en `explicacion`
   (`lib/existencias-vacio.ts`). Sin animación propia: es un aviso de estado (`role="status"`), no un modal.
   ==================================================================== */

const prendas = (n: number) => (n === 1 ? "1 prenda" : `${n.toLocaleString("es-PE")} prendas`);

export function ExistenciasVacio({
  explicacion,
  sede,
  hayTexto,
  onQuitarTermino,
  onQuitarFiltro,
  onLimpiarTodo,
  hrefCatalogo,
}: {
  explicacion: ExplicacionVacio;
  sede: string;
  /** ¿Hay algo escrito en el buscador? Decide cómo se llama el botón de limpiar. */
  hayTexto: boolean;
  /** Pone esa consulta en el buscador (sirve para «Quitar «polo»» y para «¿Quisiste decir…?»). */
  onQuitarTermino: (consulta: string) => void;
  onQuitarFiltro: (clave: ClaveFiltro) => void;
  onLimpiarTodo: () => void;
  /** Adónde lleva «Ver en Productos» para cada prenda que la sede no ha recibido. Sin esto, el enlace no se muestra. */
  hrefCatalogo?: (referencia: string) => string;
}) {
  const { titulo, comoSeLeyo, filtros, relajaciones, quisisteDecir, sinStock, sinStockTotal } = explicacion;
  const faltan = sinStockTotal - sinStock.length;
  // El botón dice lo que de verdad limpia: «Limpiar búsqueda y filtros» ante quien solo tiene filtros sería mentira a medias.
  const etiquetaLimpiar = hayTexto && filtros.length === 0 ? "Limpiar la búsqueda" : !hayTexto && filtros.length > 0 ? "Quitar todos los filtros" : "Limpiar búsqueda y filtros";

  return (
    <div role="status" className="border-t border-sand p-5 text-sm">
      <p className="font-display text-lg leading-snug text-tinta">{titulo}</p>

      {/* Solo aporta cuando algo se leyó como color o talla («negro», «m»): con una sola palabra de texto era ruido («poloo» texto). */}
      {comoSeLeyo.some((termino) => termino.tipo !== "texto") && (
        <p className="mt-1 text-xs text-taupe">
          Se leyó así:{" "}
          {comoSeLeyo.map((termino, i) => (
            <span key={`${termino.texto}-${i}`}>
              {i > 0 && " · "}
              <span className="font-medium text-tinta">«{termino.texto}»</span>
              {termino.tipo !== "texto" && ` (${termino.tipo})`}
            </span>
          ))}
        </p>
      )}

      {filtros.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-taupe">Filtros activos:</span>
          {filtros.map((filtro) => (
            <button
              key={filtro.clave}
              type="button"
              className="pildora-cayla"
              aria-label={`Quitar el filtro ${filtro.etiqueta}: ${filtro.valor}`}
              onClick={() => onQuitarFiltro(filtro.clave)}
            >
              {filtro.etiqueta}: {filtro.valor}
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}

      {sinStock.length > 0 && (
        <div className="nota-cayla mt-4">
          <p>{textoSinStock(sede)}</p>
          <ul className="mt-1.5 space-y-1">
            {sinStock.map((producto) => (
              <li key={producto.id}>
                <span className="text-tinta">{producto.referencia}</span>
                {producto.marca ? ` · marca ${producto.marca}` : producto.categoria ? ` · categoría ${producto.categoria}` : ""}
                {hrefCatalogo && (
                  <>
                    {" · "}
                    <Link href={hrefCatalogo(producto.referencia)} prefetch={false} className="btn-enlace text-xs" aria-label={`Ver «${producto.referencia}» en Productos`}>
                      Ver en Productos
                    </Link>
                  </>
                )}
              </li>
            ))}
            {faltan > 0 && <li>y {faltan.toLocaleString("es-PE")} más</li>}
          </ul>
        </div>
      )}

      {relajaciones.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-taupe">Prueba con:</span>
          {relajaciones.map((relajacion) => (
            <button
              key={relajacion.texto}
              type="button"
              className="btn-cayla btn-secundario btn-chico whitespace-normal text-left"
              onClick={() => (relajacion.accion.tipo === "termino" ? onQuitarTermino(relajacion.accion.consulta) : onQuitarFiltro(relajacion.accion.clave))}
            >
              {relajacion.texto} · {prendas(relajacion.prendas)}
            </button>
          ))}
        </div>
      )}

      {quisisteDecir && (
        <p className="mt-4 text-taupe">
          ¿Quisiste decir{" "}
          <button
            type="button"
            className="btn-enlace"
            aria-label={`Buscar «${quisisteDecir.consulta}» en lugar de «${quisisteDecir.escrito}»`}
            onClick={() => onQuitarTermino(quisisteDecir.consulta)}
          >
            «{quisisteDecir.sugerido}»
          </button>
          ?
        </p>
      )}

      <div className="mt-4">
        <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={onLimpiarTodo}>
          {etiquetaLimpiar}
        </button>
      </div>
    </div>
  );
}
