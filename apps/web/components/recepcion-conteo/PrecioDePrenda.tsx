"use client";

import { useEffect } from "react";
import { CampoTexto } from "@/components/ui/campos";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import { leerPrecioNuevo, type PrendaSeparada } from "@/lib/recepcion-conteo-reglas";
import { leerPrecioDePrenda } from "@/lib/recepcion-conteo-acciones";

// El precio de venta de una prenda que ya se identificó en este envío (Felipe 2026-10-24). El campo viene con el precio de hoy; quien recibe lo
// cambia y elige si vale para todas las sedes o solo para la suya (una terminal, solo la suya: 2026-10-26). NO guarda aquí: el cambio se aplica al cerrar el envío, después de una
// confirmación que lista todo lo que cambia (`CerrarEnvio`). Rige hacia adelante: lo ya vendido guarda su precio y el cambio queda en el
// historial de la prenda (Catálogo ▸ Productos ▸ Historial).

const monto = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lo que la pantalla sabe de una prenda: su precio de hoy (`undefined` mientras se lee, `null` si no hay), lo escrito y dónde vale. */
export type PrecioEditado = { actual: { desde: number; hasta: number } | null | undefined; valor: string; alcance: "todas" | "sede" };

export function PrecioDePrenda({
  prenda,
  sede,
  soloSede = false,
  editado,
  onActual,
  onValor,
  onAlcance,
}: {
  prenda: PrendaSeparada;
  /** El nombre de la sede que recibe: «Solo Tienda Lima». */
  sede: string;
  /** Una terminal: el precio vale solo en su sede. No se ofrece «Todas las sedes»; se dice dónde vale. */
  soloSede?: boolean;
  editado: PrecioEditado | undefined;
  /** El precio de hoy ya se leyó: la pantalla lo guarda y, si no hay nada escrito, lo pone en el campo. */
  onActual: (actual: { desde: number; hasta: number } | null) => void;
  onValor: (valor: string) => void;
  onAlcance: (alcance: "todas" | "sede") => void;
}) {
  const nombre = prenda.nombre ?? prenda.codigo ?? "la prenda";
  const actual = editado?.actual;
  const lectura = leerPrecioNuevo(editado?.valor ?? "");

  useEffect(() => {
    let vivo = true;
    void leerPrecioDePrenda(prenda.productoId).then((p) => vivo && onActual(p));
    return () => {
      vivo = false;
    };
    // Se lee una vez por prenda; `onActual` es de la pantalla y cambia en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prenda.productoId]);

  return (
    <div className="min-w-0 space-y-1.5" data-precio-prenda={prenda.productoId}>
      <p className="truncate text-xs text-taupe">
        <span className="font-medium text-tinta">{nombre}</span>
        {" · "}
        {actual === undefined ? "leyendo el precio…" : actual === null ? "sin precio a la vista" : actual.desde === actual.hasta ? `hoy ${monto(actual.desde)}` : `hoy ${monto(actual.desde)} a ${monto(actual.hasta)}`}
      </p>
      <div className="flex flex-wrap items-start justify-center gap-2 sm:justify-start">
        <div className="w-28 shrink-0">
          <CampoTexto
            caja
            etiqueta={`Precio de venta de ${nombre}`}
            inputMode="decimal"
            value={editado?.valor ?? ""}
            // sugerir-fijo: un precio es un monto de soles, no depende de nada elegido antes
            placeholder="S/ 0.00"
            onChange={(e) => onValor(e.target.value)}
            tono={lectura.problema ? "error" : undefined}
            pie={lectura.problema ?? undefined}
            sinPie={!lectura.problema}
            className="text-right font-semibold tabular-nums"
          />
        </div>
        {soloSede ? (
          <p className="self-center text-xs text-taupe">Vale solo en {sede}: las otras sedes no cambian.</p>
        ) : (
          <ElegirOpcion
            chico
            etiqueta={`Dónde vale el precio de venta de ${nombre}`}
            opciones={[
              { valor: "todas", texto: "Todas las sedes" },
              { valor: "sede", texto: `Solo ${sede}` },
            ]}
            valor={editado?.alcance ?? "todas"}
            onValor={(v) => onAlcance(v as "todas" | "sede")}
          />
        )}
      </div>
    </div>
  );
}
