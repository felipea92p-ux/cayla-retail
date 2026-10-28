"use client";

import { Percent } from "lucide-react";
import { Boton, Interruptor } from "@/components/ui/campos";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { solesES } from "@/lib/plan-compra-reglas";
import { type CostosConIgv } from "@/lib/plan-compra-inversion";

// «Costo e IGV» (ADR-0527, spike ⑤): algunos costos del plan ya incluyen el IGV y otros no. La persona marca cuáles lo traen y el sistema dice, por categoría, cuánto se le paga al proveedor, cuánto
// es IGV y cuánto sale de la caja. Esta marca es de ESTA campaña: no cambia el costo de la ficha. La cuenta es de `costosConIgv` (`lib/plan-compra-inversion.ts`); aquí solo se dibuja.

// La tabla se adapta al ancho de SU tarjeta (`@container`), de menos a más: con la angosta, categoría, la marca del IGV y lo que sale de caja; con la mediana suma «Costo del plan»; con la ancha, «Al proveedor» e
// «IGV» (que juntos suman lo que sale de caja). Así el nombre de la categoría nunca queda sin lugar.
const DESDE_MEDIA = "hidden @min-[560px]:block";
const DESDE_ANCHA = "hidden @min-[760px]:block";
const COLUMNAS: Columna[] = [
  { titulo: "Categoría" },
  { titulo: "Costo del plan", alinear: "der", clase: DESDE_MEDIA },
  { titulo: "¿Ya incluye el IGV?" },
  { titulo: "Al proveedor (sin IGV)", alinear: "der", clase: DESDE_ANCHA },
  { titulo: "IGV", alinear: "der", clase: DESDE_ANCHA },
  { titulo: "Sale de caja", alinear: "der" },
];
const PLANTILLA =
  "sm:grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] @min-[560px]:grid-cols-[minmax(0,1.2fr)_6.5rem_8.5rem_6.5rem] @min-[760px]:grid-cols-[minmax(0,1.3fr)_6.5rem_8.5rem_7rem_5.5rem_6.5rem]";

export function CostoEIgv({
  costos,
  onMarcar,
  onTodas,
  deshabilitado,
}: {
  costos: CostosConIgv;
  /** Marca o desmarca una categoría. */
  onMarcar: (clave: string, incluido: boolean) => void;
  /** «Marcar todas» (true) o «Quitar todas» (false): las que se ven. */
  onTodas: (incluido: boolean) => void;
  deshabilitado: boolean;
}) {
  if (costos.filas.length === 0) {
    return (
      <Vacio tamano="chico" icono={<Percent />}>
        Ninguna categoría tiene nada por comprar: cuando el plan pida comprar algo, aquí dices cuáles costos ya traen el IGV.
      </Vacio>
    );
  }
  const todas = costos.filas.every((f) => f.incluido);
  const ninguna = costos.filas.every((f) => !f.incluido);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-[14rem] flex-1 text-sm text-taupe">
          Marca las categorías cuyo costo <b className="font-semibold text-tinta">ya incluye el IGV</b>. A las demás el sistema les suma el 18 % para decirte cuánto le pagas al proveedor y cuánto sale de tu caja.
        </p>
        <div className="flex gap-2">
          <Boton type="button" peso="fantasma" className="btn-chico" onClick={() => onTodas(true)} disabled={deshabilitado || todas}>
            Marcar todas
          </Boton>
          <Boton type="button" peso="fantasma" className="btn-chico" onClick={() => onTodas(false)} disabled={deshabilitado || ninguna}>
            Quitar todas
          </Boton>
        </div>
      </div>
      <Tabla guia="pagos.igv" className="@container">
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {costos.filas.map((f) => (
          <div key={f.clave} className={fila(PLANTILLA)}>
            <span className={celda("izq", "font-semibold")} title={f.nombre}>
              {f.nombre}
            </span>
            <span className={celda("der", DESDE_MEDIA)}>{solesES(f.inversion)}</span>
            <span className={celda("izq")}>
              <Interruptor
                activo={f.incluido}
                onActivo={(v) => onMarcar(f.clave, v)}
                disabled={deshabilitado}
                etiqueta={
                  <>
                    <span className="sr-only">{f.nombre}: el costo ya incluye el IGV. </span>
                    <span className="text-xs text-taupe">{f.incluido ? "Ya lo incluye" : "No lo incluye"}</span>
                  </>
                }
              />
            </span>
            <span className={celda("der", DESDE_ANCHA)}>{solesES(f.sinIgv)}</span>
            <span className={celda("der", DESDE_ANCHA)}>{solesES(f.igv)}</span>
            <span className={celda("der", "font-semibold")}>
              <span className="text-xs font-normal text-taupe sm:hidden">Sale de caja </span>
              {solesES(f.saleDeCaja)}
            </span>
          </div>
        ))}
        <div className={fila(PLANTILLA, "font-semibold")} data-total>
          <span className={celda("izq")}>Total</span>
          <span className={celda("der", DESDE_MEDIA)}>{solesES(costos.inversion)}</span>
          <span className={celda("izq")} />
          <span className={celda("der", DESDE_ANCHA)}>{solesES(costos.sinIgv)}</span>
          <span className={celda("der", DESDE_ANCHA)}>{solesES(costos.igv)}</span>
          <span className={celda("der")}>{solesES(costos.saleDeCaja)}</span>
        </div>
      </Tabla>
      <p className="text-xs text-taupe">
        El IGV de una compra sale de tu caja ahora y después baja lo que le pagas a SUNAT (crédito fiscal); confírmalo con tu contador. Esta marca es de esta campaña: no cambia el costo de la ficha.
      </p>
    </div>
  );
}
