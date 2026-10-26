"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { CampoTexto } from "@/components/ui/campos";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import { ALCANCE_DE_FABRICA, hoyDelPrecio, leerPrecioNuevo, type PrecioEditado, type PrendaSeparada, type RangoDePrecio } from "@/lib/recepcion-conteo-reglas";
import { leerPreciosDePrenda } from "@/lib/recepcion-conteo-acciones";

// El precio de venta de una prenda que ya se identificó en este envío (Felipe 2026-10-24). El campo viene con el precio de hoy; quien recibe lo
// cambia y elige si vale solo para la sede donde recibe (la primera opción y la que viene elegida, Felipe 2026-10-26) o para todas. NO guarda aquí: el cambio se aplica al cerrar el envío, después de una
// confirmación que lista todo lo que cambia (`CerrarEnvio`). Rige hacia adelante: lo ya vendido guarda su precio y el cambio queda en el
// historial de la prenda (Catálogo ▸ Productos ▸ Historial).

const monto = (n: number) => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const textoRango = (r: RangoDePrecio) => (r.desde === r.hasta ? monto(r.desde) : `${monto(r.desde)} a ${monto(r.hasta)}`);

/** Junto al nombre de la prenda: su precio de hoy (el de la sede si el precio vale solo para ella, y si es otro que el general, también el general). */
function textoDeHoy(e: PrecioEditado | undefined, sede: string): string {
  if (!e || e.actual === undefined) return "leyendo el precio…";
  const hoy = hoyDelPrecio(e);
  if (hoy === null || hoy === undefined) return "sin precio a la vista";
  const distinto = e.alcance === "sede" && e.actual !== null && e.actualSede !== undefined && e.actualSede !== null && textoRango(e.actual) !== textoRango(e.actualSede);
  return distinto && e.actual ? `hoy en ${sede} ${textoRango(hoy)} (en las demás sedes, ${textoRango(e.actual)})` : `hoy ${textoRango(hoy)}`;
}

/** Lleva el cursor al campo del precio de una prenda (para decirle a quien escribe cuál hay que corregir). */
export function enfocarPrecio(productoId: string) {
  const campo = document.querySelector<HTMLInputElement>(`[data-precio-prenda="${CSS.escape(productoId)}"] input`);
  campo?.scrollIntoView({ block: "center", behavior: "smooth" });
  campo?.focus({ preventScroll: true });
}

export function PrecioDePrenda({
  prenda,
  sede,
  sedeId,
  editado,
  onActual,
  onValor,
  onAlcance,
}: {
  prenda: Pick<PrendaSeparada, "productoId" | "nombre" | "codigo">;
  /** El nombre de la sede que recibe: «Solo Tienda Lima». */
  sede: string;
  /** La sede que recibe, para leer el precio que la prenda tiene en ella (`null`: no se sabe, vale el general). */
  sedeId: string | null;
  editado: PrecioEditado | undefined;
  /** El precio de hoy ya se leyó (el general y el de esta sede): la pantalla lo guarda y, si no hay nada escrito, lo pone en el campo. */
  onActual: (general: RangoDePrecio | null, enSede: RangoDePrecio | null | undefined) => void;
  onValor: (valor: string) => void;
  onAlcance: (alcance: "todas" | "sede") => void;
}) {
  const nombre = prenda.nombre ?? prenda.codigo ?? "la prenda";
  const alcance = editado?.alcance ?? ALCANCE_DE_FABRICA;
  const lectura = leerPrecioNuevo(editado?.valor ?? "");
  // Lo que está mal escrito, o lo que la base no aceptaría (con su motivo): junto al campo, no en un aviso aparte.
  const problema = lectura.problema ?? editado?.rechazo ?? null;

  useEffect(() => {
    let vivo = true;
    void leerPreciosDePrenda(prenda.productoId, sedeId).then((p) => vivo && onActual(p.general, p.enSede));
    return () => {
      vivo = false;
    };
    // Se lee una vez por prenda; `onActual` es de la pantalla y cambia en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prenda.productoId, sedeId]);

  return (
    <div className="min-w-0 space-y-1.5" data-precio-prenda={prenda.productoId}>
      <p className="truncate text-xs text-taupe">
        <span className="font-medium text-tinta">{nombre}</span>
        {" · "}
        {textoDeHoy(editado, sede)}
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
            tono={problema ? "error" : undefined}
            sinPie
            className="text-right font-semibold tabular-nums"
          />
        </div>
        <ElegirOpcion
          chico
          etiqueta={`Dónde vale el precio de venta de ${nombre}`}
          // La sede donde se recibe va primero y viene elegida: es lo que casi siempre se quiere (Felipe 2026-10-26).
          opciones={[
            { valor: "sede", texto: `Solo ${sede}` },
            { valor: "todas", texto: "Todas las sedes" },
          ]}
          valor={alcance}
          onValor={(v) => onAlcance(v as "todas" | "sede")}
        />
      </div>
      {/* El motivo va bajo la fila, a todo el ancho (el campo es angosto y un motivo largo se partía en una columna), con el pie de error de siempre. */}
      {problema && (
        <p role="alert" className="text-xs leading-tight text-rojo-profundo">
          <span className="pie-error trazo-dibuja anim-revelar">
            <CircleAlert aria-hidden />
            <span>{problema}</span>
          </span>
        </p>
      )}
    </div>
  );
}
