"use client";

import { Shirt } from "lucide-react";
import { FotoPrenda } from "@/components/ui/FotoPrenda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { DIAS_RITMO_RECIENTE } from "@/lib/inventario-reglas";
import type { MatrizDeHoja, TiendaDeHoja } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { Cifras } from "./CifrasDeLaHoja";

// La matriz de la hoja «Ver el modelo»: lo vendido en los últimos 30 días por color y talla, con lo que queda debajo de cada cifra. Se ve de TODA la red o de UNA tienda (el segmento de
// arriba: lo mismo contado de otra forma, ADR-0358) sin que cambien las filas ni las columnas. Cada color es un botón, como en la vista rápida de Catálogo: pasar el mouse por él
// muestra su foto y un clic la deja fija. No guarda nada.

function CabeceraDeColor({ nombre, hex, fotoUrl, presentacion, enFoto }: { nombre: string; hex: string | null; fotoUrl: string | null; presentacion?: PresentacionDeModelo; enFoto: "fijado" | "vista previa" | null }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden className="block shrink-0">
        <FotoPrenda fotoUrl={fotoUrl} referencia="" ancho={56} colorHex={hex} categoria={presentacion?.categoria} categoriaPrefijo={presentacion?.categoriaPrefijo} categoriaFamilia={presentacion?.categoriaFamilia} className="w-14" />
      </span>
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] leading-snug text-tinta">
          {hex && <span aria-hidden data-color-dato className="size-2.5 shrink-0 rounded-full border border-tinta/20" style={{ backgroundColor: hex }} />}
          <span className="min-w-0 break-words">{nombre}</span>
        </span>
        {/* Cuál es el color que la foto de la izquierda muestra, y si es de paso: el estado se dice con palabras, no solo con un fondo. */}
        {enFoto && <span className="text-[11px] text-taupe">{enFoto === "fijado" ? "en la foto" : "vista previa"}</span>}
      </span>
    </span>
  );
}

export function MatrizDelModelo({
  referencia,
  tallas,
  matriz,
  tiendas,
  tiendaId,
  alCambiarTienda,
  presentacion,
  fijado,
  alFijar,
  enFoto,
  alVistaPrevia,
}: {
  referencia: string;
  tallas: string[];
  matriz: MatrizDeHoja;
  tiendas: TiendaDeHoja[];
  /** La tienda de la matriz; `null` = toda la red. */
  tiendaId: string | null;
  alCambiarTienda: (id: string | null) => void;
  presentacion?: PresentacionDeModelo;
  /** El color que la foto tiene fijo (su nombre). */
  fijado: string;
  alFijar: (nombre: string) => void;
  /** El color que la foto muestra ahora: el fijado, o el que se señala con el mouse o el teclado (vista previa). */
  enFoto: string;
  alVistaPrevia: (nombre: string | null) => void;
}) {
  const tienda = tiendaId === null ? null : tiendas.find((t) => t.id === tiendaId) ?? null;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <TituloGrupo className="min-w-0 flex-1">
          Vendido en los últimos {DIAS_RITMO_RECIENTE} días, por color y talla{tienda ? ` · ${tienda.nombre}` : ""}
        </TituloGrupo>
        {tiendas.length > 1 && (
          <div data-guia="prod-resumen.hoja-tienda-selector">
            <SegmentoDeslizante
              forma="modo"
              etiqueta="Tienda de la matriz"
              valor={tienda?.id ?? "red"}
              onCambio={(clave) => alCambiarTienda(clave === "red" ? null : clave)}
              opciones={[{ clave: "red", etiqueta: "Toda la red" }, ...tiendas.map((t) => ({ clave: t.id, etiqueta: t.nombre.replace(/^Tienda\s+/i, "") }))]}
            />
          </div>
        )}
      </div>
      {matriz.colores.length === 0 ? (
        <Vacio tamano="chico" icono={<Shirt />}>
          Este modelo no tiene tallas ni colores activos.
        </Vacio>
      ) : (
        // `tabIndex` + `role="region"`: con muchas tallas la matriz se desplaza hacia el lado, y sin esto quien usa solo el teclado no llega a las últimas columnas ni a «Total».
        <div data-guia="prod-resumen.hoja" role="region" aria-label={`Ventas por color y talla de ${referencia}${tienda ? ` en ${tienda.nombre}` : ""}`} tabIndex={0} className="mt-1 overflow-x-auto">
          <table /* unificar-fijo: una matriz de colores y tallas (con la foto de cada color), otra función que una lista de registros */ className="w-full border-separate border-spacing-0">
            <caption className="sr-only">
              Vendido en los últimos {DIAS_RITMO_RECIENTE} días de {referencia}, por color y talla, con lo que queda {tienda ? `en ${tienda.nombre}` : "en tiendas"}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="label-cayla py-2 pr-3 text-left text-[11px] font-normal text-tinta/65">
                  Color
                </th>
                {tallas.map((t) => (
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
              {matriz.colores.map((c) => (
                <tr key={c.nombre} className={c.nombre === fijado ? "bg-hueso/60" : undefined}>
                  <th scope="row" className="border-t border-tinta/10 py-2 pr-3 text-left font-normal">
                    <button
                      type="button"
                      aria-pressed={c.nombre === fijado}
                      onClick={() => alFijar(c.nombre)}
                      onPointerEnter={(e) => e.pointerType === "mouse" && alVistaPrevia(c.nombre)}
                      onPointerLeave={() => alVistaPrevia(null)}
                      onFocus={() => alVistaPrevia(c.nombre)}
                      onBlur={() => alVistaPrevia(null)}
                      className="rounded-md text-left outline-offset-2"
                    >
                      <CabeceraDeColor nombre={c.nombre} hex={c.hex} fotoUrl={c.fotoUrl} presentacion={presentacion} enFoto={c.nombre !== enFoto ? null : enFoto === fijado ? "fijado" : "vista previa"} />
                    </button>
                  </th>
                  {c.celdas.map((celda, i) => (
                    <td key={tallas[i]} className="border-t border-tinta/10 px-2 py-2 text-right align-middle">
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
                {matriz.porTalla.map((t, i) => (
                  <td key={tallas[i]} className="border-t border-tinta/25 px-2 py-2 text-right align-middle">
                    <Cifras ventas={t.ventas} stock={t.stock} fuerte />
                  </td>
                ))}
                <td className="border-t border-tinta/25 py-2 pl-3 text-right align-middle">
                  <Cifras ventas={matriz.total.ventas} stock={matriz.total.stock} fuerte />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
