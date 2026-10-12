"use client";

import Link from "next/link";
import { FunnelX, SearchX } from "lucide-react";
import { Vacio } from "./ui/Vacio";
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
   (`lib/existencias-vacio.ts`). Se dibuja con la pieza única <Vacio> (ADR-0358, ronda 5), con su entrada en cascada.
   ==================================================================== */

// En productos, como el «N productos» de la barra: el número de cada sugerencia es lo que trae al usarla.
const prendas = (n: number) => (n === 1 ? "1 producto" : `${n.toLocaleString("es-PE")} productos`);

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

  // La pieza única del vacío (ADR-0358, ronda 5): lo buscado en el título, los filtros como píldoras que se quitan con un toque,
  // «¿Quisiste decir…?» en la frase y lo que lo deshace en las acciones. Lo que la sede no ha recibido va debajo, en su nota.
  const seLeyo = comoSeLeyo.some((termino) => termino.tipo !== "texto");
  return (
    <div className="border-t border-sand">
      <Vacio
        icono={hayTexto ? <SearchX /> : <FunnelX />}
        titulo={titulo}
        detalle={
          sinStock.length > 0 ? (
            <div className="nota-cayla">
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
          ) : null
        }
        filtros={filtros.map((filtro) => ({ texto: `${filtro.etiqueta}: ${filtro.valor}`, onQuitar: () => onQuitarFiltro(filtro.clave) }))}
        acciones={
          <>
            {relajaciones.length > 0 && <span className="self-center text-sm text-taupe">Prueba con:</span>}
            {relajaciones.map((relajacion) => (
              <button
                type="button"
                key={relajacion.texto}
                className="btn-cayla btn-secundario whitespace-normal text-left"
                onClick={() => (relajacion.accion.tipo === "termino" ? onQuitarTermino(relajacion.accion.consulta) : onQuitarFiltro(relajacion.accion.clave))}
              >
                {relajacion.texto} · {prendas(relajacion.prendas)}
              </button>
            ))}
            {/* Botones con la clase de la pieza (no <Boton>): este archivo se prueba sin el alias «@/» que usa campos.tsx. */}
            <button type="button" className="btn-cayla btn-secundario" onClick={onLimpiarTodo}>
              {etiquetaLimpiar}
            </button>
          </>
        }
      >
        {/* Solo aporta cuando algo se leyó como color o talla («negro», «m»): con una sola palabra de texto era ruido. */}
        {seLeyo && (
          <>
            Se leyó así:{" "}
            {comoSeLeyo.map((termino, i) => (
              <span key={`${termino.texto}-${i}`}>
                {i > 0 && " · "}
                <b>«{termino.texto}»</b>
                {termino.tipo !== "texto" && ` (${termino.tipo})`}
              </span>
            ))}
            .{" "}
          </>
        )}
        {filtros.length > 0 && "Filtros activos: quita uno tocándolo. "}
        {quisisteDecir && (
          <>
            ¿Quisiste decir{" "}
            <button
              type="button"
              className="btn-enlace"
              aria-label={`Buscar «${quisisteDecir.consulta}» en lugar de «${quisisteDecir.escrito}»`}
              onClick={() => onQuitarTermino(quisisteDecir.consulta)}
            >
              «{quisisteDecir.sugerido}»
            </button>
            ?{" "}
          </>
        )}
      </Vacio>


    </div>
  );
}
