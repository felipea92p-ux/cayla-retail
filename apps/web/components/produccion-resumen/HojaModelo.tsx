"use client";

import type { RefObject } from "react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { BotonEnlace } from "@/components/ui/campos";
import { FotoPrenda } from "@/components/ui/FotoPrenda";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { DIAS_RITMO_RECIENTE, UMBRAL_POCA_BASE_VENTAS } from "@/lib/inventario-reglas";
import { baseDelRitmo, ETIQUETA_ESTADO_MODELO, porSemana, seVendioYYaNoHay, textoDiasDeStock } from "@/lib/produccion-decisiones";
import { fraseDeLaFalta, type ColorDeHoja, type HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { TONO_ESTADO_MODELO } from "./estado-modelo";

// «Ver el modelo» (Resumen de Producción, tarea #8 del análisis docs/pantallas/produccion.md): la hoja que se abre al tocar un modelo de «¿Qué producir?». Muestra el modelo con
// su foto y, por color y talla, lo que se vendió en los últimos 30 días y qué se vendió y ya no hay. Es solo de lectura: lo que decide —abrir la orden, trasladar— sale de aquí, no se
// guarda nada. Todo el movimiento es el de `<Modal>` (ADR-0136): esta hoja no agrega ninguno. Lo que cuenta cada cifra vive en `lib/produccion-hoja-modelo.ts` y `lib/produccion-decisiones.ts`.

/** Un dato suelto de la cabecera: la etiqueta, la cifra y, debajo, lo que la explica. */
function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: number | string; nota?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-cayla text-[11px] text-tinta/65">{etiqueta}</dt>
      <dd className="mt-0.5 text-xl leading-tight tabular-nums text-tinta">{valor}</dd>
      {nota && <dd className="text-xs text-tinta/65">{nota}</dd>}
    </div>
  );
}

/**
 * Lo vendido y, debajo, lo que queda en tiendas (solo si queda algo: repetir «sin stock» en cada cifra de un modelo agotado es ruido). En gris, con 2 ventas o menos (poca base). En una
 * CELDA (`celda`), lo que se vendió y ya no hay lleva su aviso en ámbar con su punto (el color no es lo único que lo dice); un total no lo lleva: habla de varias tallas o colores.
 */
function Cifras({ ventas, stock, fuerte = false, celda = false }: { ventas: number; stock: number; fuerte?: boolean; celda?: boolean }) {
  const yaNoHay = celda && seVendioYYaNoHay(ventas, stock);
  const pocaBase = ventas <= UMBRAL_POCA_BASE_VENTAS;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className={`text-sm tabular-nums ${pocaBase ? "text-tinta/65" : "font-medium text-tinta"} ${fuerte ? "font-semibold" : ""}`}>{ventas}</span>
      {yaNoHay ? (
        <span className="mt-0.5 text-[11px] text-ambar">
          <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-ambar align-middle" />
          ya no hay
        </span>
      ) : (
        stock > 0 && <span className="mt-0.5 text-[11px] text-tinta/65">hay {stock}</span>
      )}
    </span>
  );
}

function CabeceraDeColor({ color, presentacion }: { color: ColorDeHoja; presentacion?: PresentacionDeModelo }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden className="block shrink-0">
        <FotoPrenda fotoUrl={color.fotoUrl} referencia="" ancho={56} colorHex={color.hex} categoria={presentacion?.categoria} categoriaPrefijo={presentacion?.categoriaPrefijo} categoriaFamilia={presentacion?.categoriaFamilia} className="w-14" />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] leading-snug text-tinta">
        {color.hex && <span aria-hidden data-color-dato className="size-2.5 shrink-0 rounded-full border border-tinta/20" style={{ backgroundColor: color.hex }} />}
        <span className="min-w-0 break-words">{color.nombre}</span>
      </span>
    </span>
  );
}

export function HojaModelo({ hoja, presentacion, onClose, alCerrarEnfocar }: { hoja: HojaDeModelo; presentacion?: PresentacionDeModelo; onClose: () => void; alCerrarEnfocar?: RefObject<HTMLElement | null> }) {
  const base = baseDelRitmo(hoja.ventasBase);
  const falta = fraseDeLaFalta(hoja);
  const traslado = hoja.estado === "trasladar" && !!hoja.hrefTrasladar;
  const hrefOrden = `/produccion/ordenes?nueva=${hoja.productoId}`;
  return (
    <Modal
      variante="hoja"
      conCerrar
      ancho="max-w-2xl"
      titulo={hoja.referencia}
      subtitulo={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Chip tono={TONO_ESTADO_MODELO[hoja.estado]}>{ETIQUETA_ESTADO_MODELO[hoja.estado]}</Chip>
          <span>{hoja.ritmoDia ? `Se vende ${porSemana(hoja.ritmoDia)} por semana (${base.largo})` : `Sin ventas medidas en los últimos ${DIAS_RITMO_RECIENTE} días`}</span>
        </span>
      }
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
    >
      <div className="flex gap-4">
        <span aria-hidden className="block shrink-0">
          <FotoPrenda fotoUrl={presentacion?.fotoUrl} referencia="" ancho={112} colorHex={presentacion?.colorHex} categoria={presentacion?.categoria} categoriaPrefijo={presentacion?.categoriaPrefijo} categoriaFamilia={presentacion?.categoriaFamilia} className="w-28" />
        </span>
        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato etiqueta="En tiendas" valor={hoja.stockRed} nota={hoja.diasRed === null ? "sin ventas medidas" : textoDiasDeStock(hoja.stockRed, hoja.diasRed)} />
            <Dato etiqueta="En el Taller" valor={hoja.stockTaller} nota={hoja.stockTaller > 0 ? "por trasladar" : undefined} />
            <Dato etiqueta="En camino" valor={hoja.enCamino} nota={hoja.enCamino > 0 ? "a las tiendas" : undefined} />
            <Dato etiqueta="En órdenes abiertas" valor={hoja.enProduccion} />
          </dl>
          {falta && <p className="mt-3 text-[13.5px] leading-relaxed text-tinta">{falta}</p>}
        </div>
      </div>

      <div className="mt-5">
        <TituloGrupo>Vendido en los últimos {DIAS_RITMO_RECIENTE} días, por color y talla</TituloGrupo>
        {hoja.colores.length === 0 ? (
          <p className="mt-2 text-sm text-tinta/70">Este modelo no tiene tallas ni colores activos.</p>
        ) : (
          <div data-guia="prod-resumen.hoja" className="mt-1 overflow-x-auto">
            <table /* unificar-fijo: una matriz de colores y tallas (con la foto de cada color), otra función que una lista de registros */ className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th scope="col" className="label-cayla py-2 pr-3 text-left text-[11px] font-normal text-tinta/65">
                    Color
                  </th>
                  {hoja.tallas.map((t) => (
                    <th key={t} scope="col" className="label-cayla px-2 py-2 text-right text-[11px] font-normal text-tinta/65">
                      {t}
                    </th>
                  ))}
                  <th scope="col" className="label-cayla py-2 pl-3 text-right text-[11px] font-normal text-tinta/65">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {hoja.colores.map((c) => (
                  <tr key={c.nombre}>
                    <th scope="row" className="border-t border-tinta/10 py-2 pr-3 text-left font-normal">
                      <CabeceraDeColor color={c} presentacion={presentacion} />
                    </th>
                    {c.celdas.map((celda, i) => (
                      <td key={hoja.tallas[i]} className="border-t border-tinta/10 px-2 py-2 text-right align-middle">
                        {celda ? <Cifras ventas={celda.ventas} stock={celda.stock} celda /> : <span className="text-sm text-tinta/65">—</span>}
                      </td>
                    ))}
                    <td className="border-t border-tinta/10 py-2 pl-3 text-right align-middle">
                      <Cifras ventas={c.ventas} stock={c.stock} fuerte />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="border-t border-tinta/25 py-2 pr-3 text-left text-[13.5px] font-medium text-tinta">
                    Total
                  </th>
                  {hoja.porTalla.map((t, i) => (
                    <td key={hoja.tallas[i]} className="border-t border-tinta/25 px-2 py-2 text-right align-middle">
                      <Cifras ventas={t.ventas} stock={t.stock} fuerte />
                    </td>
                  ))}
                  <td className="border-t border-tinta/25 py-2 pl-3 text-right align-middle">
                    <Cifras ventas={hoja.total.ventas} stock={hoja.total.stock} fuerte />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="nota-cayla mt-4">
        Ventas de todas las tiendas en los últimos {DIAS_RITMO_RECIENTE} días; debajo de cada cifra, lo que queda en tiendas. Las cifras en gris tienen {UMBRAL_POCA_BASE_VENTAS} ventas o menos: es poca base, no decidas por ellas. «Ya no hay» marca lo que se vendió más de {UMBRAL_POCA_BASE_VENTAS} veces y hoy no queda ninguna en tiendas.
      </p>

      <div data-guia="prod-resumen.hoja-acciones" className="pie-hoja-fijo mt-4 flex flex-wrap justify-end gap-2 pt-1">
        {hoja.hrefTrasladar && (
          <BotonEnlace href={hoja.hrefTrasladar} peso={traslado ? "primario" : "fantasma"}>
            Trasladar al piso
          </BotonEnlace>
        )}
        <BotonEnlace href={hrefOrden} peso={traslado ? "fantasma" : "primario"}>
          Abrir orden
        </BotonEnlace>
      </div>
    </Modal>
  );
}
