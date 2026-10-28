"use client";

import { Store } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import {
  MOTIVO_DESDE_LA_TABLA,
  desdeHace,
  nombreCorto,
  quedaBajoElCosto,
  soles,
  type CambioPrecioAqui,
  type PrecioDeSede,
} from "@/lib/precio-sede-reglas";

/**
 * Bajo la tabla de «Precios», en una terminal (Felipe 2026-10-27: «por qué me pide hacer clic en otro botón si ya tengo ahí en la
 * tabla para cambiar el precio»). El precio de su tienda se escribe en la tabla, como un costo; aquí va solo lo que la tabla no dice:
 * a cuánto pasa a vender (o si vuelve al de la prenda), lo que la base rechazaría y, sin tocar nada, desde cuándo y quién puso el precio
 * propio vigente. No pide motivo (Felipe 2026-10-27): se guarda `MOTIVO_DESDE_LA_TABLA` y quién lo cambió lo dice la firma. Reemplaza al bloque «Precio en …» con su botón «Cambiar precio aquí» y su hoja.
 * Nada se guarda aquí: todo espera a «Revisar y guardar».
 */
export function PrecioAquiTerminal({
  sede,
  propio,
  cambio,
  general,
  costoMaximo,
  error,
}: {
  sede: string;
  /** El precio propio vigente de la tienda, si tiene uno. */
  propio: PrecioDeSede | undefined;
  cambio: CambioPrecioAqui;
  /** El precio de la prenda guardado, si todas sus tallas valen igual. */
  general: number | null;
  costoMaximo: number | null;
  /** Lo que la base rechazaría de lo escrito (bajo el costo, sobre el tope). */
  error: string | null;
}) {
  const corto = nombreCorto(sede);

  return (
    <div className="mt-3 space-y-2.5" data-campo="precio-por-tienda">
      {detalle()}
      {/* La frase del bloque de antes, que Felipe pidió conservar (2026-10-27): deja claro que el cambio es SOLO de esta tienda. */}
      <p className="flex items-center gap-2 text-[12.5px] text-tinta/70">
        <Store aria-hidden className="h-3.5 w-3.5 shrink-0 text-taupe" />
        Este precio solo vale en {sede}: las otras tiendas no cambian.
      </p>
    </div>
  );

  function detalle() {
    if (cambio.que === "poner") {
      return (
        <div className="max-w-xl space-y-2">
          <p className="text-[12.5px] text-tinta/70">
            {corto} pasa a vender toda la prenda a {soles(cambio.precio)}.
          </p>
          {/* Lo que la base rechazaría (bajo el costo, sobre el tope): se dice aquí mismo, antes de «Revisar y guardar». */}
          {error && (
            <Aviso tono="error" chico>
              {error}
            </Aviso>
          )}
        </div>
      );
    }

    if (cambio.que === "quitar") {
      return (
        <p className="text-[12.5px] text-tinta/70">
          {corto} vuelve al precio de la prenda ({soles(cambio.general)}) y deja de tener precio propio.
        </p>
      );
    }

    if (!propio) return null;
    const bajoCosto = quedaBajoElCosto(propio.precio, costoMaximo);
    return (
      <div className="space-y-1 text-[12.5px] text-tinta/70">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Chip tono="ambar">Precio propio</Chip>
          <span>
            {/* El motivo fijo de la tabla no dice nada nuevo: solo se muestra el que alguien escribió. */}
            {desdeHace(propio.desde)}
            {propio.motivo !== MOTIVO_DESDE_LA_TABLA ? ` · «${propio.motivo}»` : ""}
            {propio.creadoPor ? ` · ${propio.creadoPor}` : ""}
            {general !== null ? `. Para volver al de la prenda, escribe ${general.toFixed(2)}.` : ""}
          </span>
          {bajoCosto && <Chip tono="rojo">Bajo el costo</Chip>}
        </p>
        {bajoCosto && <p className="text-rojo-profundo">Hoy queda por debajo de lo que cuesta la prenda. Súbelo.</p>}
      </div>
    );
  }
}
