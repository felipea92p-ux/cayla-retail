"use client";

import { Linea } from "@/components/ui/Linea";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/compras-reglas";
import { diaMes, diasEntreFechas } from "@/lib/fechas-lima";
import { subeEnCadaCompra, variacionCosto } from "@/lib/proveedores-reglas";
import type { EvolucionCosto } from "@/lib/proveedores";

// «Evolución del costo» de la ficha (maqueta 09): lo que cobra ESTE proveedor por la prenda que más se
// le compra, compra a compra. Es el argumento para pactar el precio del próximo pedido: no es lo mismo
// «es caro» que «subió 8.7 % en tres compras». Sale de `compra_items` (lo que de verdad se pagó en
// cada comprobante), no de `costo_historial`, que mezcla a todos los proveedores de la misma prenda.
//
// ADR-0128: al llegar, la línea se dibuja y los puntos aparecen uno tras otro (una vez); al pasar el mouse
// por el gráfico una guía salta a la compra más cercana, su punto crece y un globito dice su fecha y su costo
// — se lee UNA compra sin buscarla en la fila de abajo. Desde la ronda 14 de /unificar es la línea del sistema.
//
// Con una sola compra no hay evolución que dibujar, y no se inventa una línea: el estado vacío lo dice.
// Son 2–6 puntos y el dato es el monto de cada uno (la fila de abajo), no el trazo.


export function ProveedorCostoEvolucion({ evolucion }: { evolucion: EvolucionCosto | null }) {
  const puntos = evolucion?.puntos ?? [];
  const costos = puntos.map((p) => p.costo);
  const variacion = variacionCosto(costos);

  const etiqueta = `Evolución del costo${evolucion ? ` · ${evolucion.referencia}` : ""}`;
  // La cabecera es la pieza única de cifra (TarjetaCifra, ADR-0358); el gráfico va en su contexto. Sin compras que
  // comparar es «sin dato»; con una sola, su costo se ve apagado (tinta/65), porque todavía no es una evolución.
  if (!evolucion || puntos.length < 2 || variacion == null) {
    return puntos.length === 1 ? (
      <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 11 }} etiqueta={etiqueta} valor={soles(puntos[0].costo)} tono="text-tinta/65">
        {`Solo hay una compra de ${evolucion?.referencia} a este proveedor. Con dos se ve cuánto cambia lo que cobra.`}
      </TarjetaCifra>
    ) : (
      <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 11 }} etiqueta={etiqueta} valor={null}>
        Todavía no hay compras de una misma prenda para comparar.
      </TarjetaCifra>
    );
  }

  return (
    <TarjetaCifra
      className="anim-entra"
      style={{ ["--i" as string]: 11 }}
      etiqueta={etiqueta}
      valor={`${variacion > 0 ? "+" : ""}${variacion.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}
      tono={variacion > 0 ? "text-ambar-profundo" : variacion < 0 ? "text-verde-profundo" : undefined}
    >
        <>
          <span className="block">{`en ${puntos.length} compras · ${duracion(puntos[0].fecha, puntos[puntos.length - 1].fecha)}`}</span>

          {/* La línea del sistema (ronda 14 de /unificar): una compra por punto, en tinta; si sube o baja lo dice la cifra de arriba. */}
          <Linea
            className="mt-2"
            serie={costos.map((c, i) => ({ x: i, y: c }))}
            desde={0}
            hasta={costos.length - 1}
            minY={Math.min(...costos) - (Math.max(...costos) - Math.min(...costos) || Math.max(...costos)) * 0.3}
            maxY={Math.max(...costos) + (Math.max(...costos) - Math.min(...costos) || Math.max(...costos)) * 0.3}
            ejes={false}
            puntos
            leer={(i) => (
              <>
                <b className="block font-semibold">{diaMes(puntos[i].fecha)}</b>
                <span className="block">{soles(costos[i])}</span>
              </>
            )}
            alto={120}
            etiqueta={`Costo de ${evolucion.referencia}: ${costos.map((c) => soles(c)).join(", ")}`}
          />

          <div className="flex justify-between text-xs">
            {puntos.map((p, i) => (
              <span key={p.documento} className={i === 0 ? "text-left" : i === puntos.length - 1 ? "text-right" : "text-center"}>
                <b className="block font-semibold tabular-nums text-tinta">{soles(p.costo)}</b>
                <span className="text-tinta/55">{diaMes(p.fecha)}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 border-t border-tinta/10 pt-3 text-xs text-tinta/65">
            {subeEnCadaCompra(costos)
              ? "Sube en cada compra: el dato para pactar el precio del próximo pedido."
              : "Compara con lo que se pagó en cada compra antes de pactar el precio del próximo pedido."}
          </p>
        </>
    </TarjetaCifra>
  );
}

/** «4 semanas» / «12 días» entre la primera y la última compra. */
function duracion(desde: string, hasta: string): string {
  const dias = diasEntreFechas(desde, hasta);
  if (dias < 14) return `${dias} ${dias === 1 ? "día" : "días"}`;
  return `${Math.round(dias / 7)} semanas`;
}
