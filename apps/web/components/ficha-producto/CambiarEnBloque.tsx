"use client";

import { useEffect, useState } from "react";
import { Desplegable } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { alcancesDeBloque, aplicarEnBloque, type CampoBloque, type FilaFicha, type NombresFicha } from "@/lib/variantes-ficha-reglas";

// Precio o costo en bloque: «Cambiar [Precio|Costo] de [Todas | Color: Negro | Talla: S] a [monto] · Aplicar». Es la
// fila de grupo de Shopify («si cambias el precio del grupo, cambia en todas sus variantes») y el «Price extra» de Odoo,
// sin tener que entender ninguno de los dos: se lee como una frase. Aplica a las activas (y nuevas) del alcance; el costo
// no toca las que ya lo traen de compras, y lo dice. Nada se guarda: queda en la ficha hasta «Revisar y guardar».
//
// Un monto escrito y NO aplicado se avisa hacia afuera (`onPendiente`): «Revisar y guardar» no lo deja perderse en silencio
// (revisión 2026-09-28: se escribía 79.90 para las XL, se guardaba otro cambio y las XL seguían al precio viejo).

export function CambiarEnBloque({
  filas,
  onFilas,
  onPendiente,
  nombres,
  veCosto,
  deshabilitado,
  onCampo,
}: {
  filas: FilaFicha[];
  onFilas: (siguiente: FilaFicha[]) => void;
  /** Qué quedó escrito sin aplicar (`null` = nada). Se avisa en cada tecla, al aplicar y al cambiar de campo. */
  onPendiente: (pendiente: CampoBloque | null) => void;
  nombres: NombresFicha;
  veCosto: boolean;
  deshabilitado: boolean;
  /** Precio o Costo: la matriz de la ficha muestra en cada celda lo que aquí se está cambiando. */
  onCampo?: (campo: CampoBloque) => void;
}) {
  const [campo, setCampo] = useState<CampoBloque>("precio");
  const [alcance, setAlcance] = useState("todas");
  const [monto, setMonto] = useState("");
  const [resultado, setResultado] = useState<{ texto: string; error: boolean } | null>(null);
  const alcances = alcancesDeBloque(filas, nombres);
  // Si el alcance elegido dejó de existir (se corrigió ese color), vuelve a «Todas».
  const alcanceVigente = alcances.some((a) => a.valor === alcance) ? alcance : "todas";

  function escribir(valor: string, en: CampoBloque = campo) {
    setMonto(valor);
    onPendiente(valor.trim() === "" ? null : en);
  }

  // Si la barra desaparece (todas quedaron desactivadas) con un monto escrito, ya no hay nada pendiente que avisar.
  useEffect(() => () => onPendiente(null), [onPendiente]);

  function aplicar() {
    const r = aplicarEnBloque(filas, campo, alcanceVigente, monto);
    if (r.error) return setResultado({ texto: r.error, error: true });
    if (r.aplicadas === 0 && r.fijas === 0) return setResultado({ texto: "No hay variantes activas en ese grupo.", error: true });
    onFilas(r.filas);
    const que = campo === "precio" ? "Precio" : "Costo";
    const partes = [`${que} puesto en ${r.aplicadas} ${r.aplicadas === 1 ? "variante" : "variantes"}`];
    if (r.fijas > 0) partes.push(`${r.fijas} no ${r.fijas === 1 ? "cambia" : "cambian"}: su costo viene de compras`);
    setResultado({ texto: `${partes.join(" · ")}. Se guarda con «Revisar y guardar».`, error: false });
    escribir("");
  }

  return (
    <div className="rounded-xl border border-sand bg-papel px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-tinta/80">
        <span>Cambiar</span>
        {veCosto ? (
          <SegmentoDeslizante
            etiqueta="Qué cambiar"
            valor={campo}
            onCambio={(c) => {
              setCampo(c as CampoBloque);
              onCampo?.(c as CampoBloque);
              setResultado(null);
              if (monto.trim() !== "") onPendiente(c as CampoBloque);
            }}
            opciones={[
              { clave: "precio", etiqueta: "Precio" },
              { clave: "costo", etiqueta: "Costo" },
            ]}
          />
        ) : (
          <span className="font-semibold text-tinta">el precio</span>
        )}
        <span>de</span>
        <Desplegable
          forma="caja"
          className="w-auto min-w-[11rem]"
          etiquetaAccesible="A cuáles variantes"
          valor={alcanceVigente}
          onValor={(v) => {
            setAlcance(v);
            setResultado(null);
          }}
          opciones={alcances}
        />
        <span>a</span>
        <span className="caja-cayla flex h-10 w-28 items-center gap-1 px-2.5">
          <span aria-hidden className="text-xs text-taupe">
            S/
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            id="variantes-bloque-monto"
            aria-label={campo === "precio" ? "Nuevo precio" : "Nuevo costo"}
            placeholder="0.00"
            value={monto}
            disabled={deshabilitado}
            onChange={(e) => escribir(e.target.value)}
            // Enter aplica el bloque; NO envía la ficha entera (el formulario de afuera guardaría todo).
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aplicar();
              }
            }}
            className="w-full min-w-0 bg-transparent text-sm tabular-nums text-tinta outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </span>
        <button type="button" onClick={aplicar} disabled={deshabilitado || monto.trim() === ""} className="btn-cayla btn-secundario">
          Aplicar
        </button>
      </div>
      <p aria-live="polite" className={`mt-1.5 min-h-[1rem] text-[12px] ${resultado?.error ? "text-rojo-profundo" : "text-taupe"}`}>
        {resultado?.texto ??
          (monto.trim() !== ""
            ? "Pulsa Aplicar para ponerlo en las variantes (o bórralo): si no, no se guarda."
            : "Cambia varias de una vez con Aplicar (también puedes tocar cada celda abajo). El costo no toca lo que ya viene de Compras.")}
      </p>
    </div>
  );
}
