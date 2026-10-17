"use client";

import type { Dispatch, SetStateAction } from "react";
import { CampoTexto } from "@/components/ui/campos";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { nombreBajoCosto, objecionVigencia, parsearDescuento, parsearFecha, type PrendaConCosto } from "@/lib/etiqueta-campana";

/** Una categoría que se puede elegir para que la campaña rija entera en ella. */
export type CategoriaDeCampana = { id: string; nombre: string; familia: string };

/** Lo que se lee de los tres campos: cada uno parseado, y la objeción a las fechas entre sí (null si están bien). */
export function leerCamposDeCampana(c: { descuento: string; desde: string; hasta: string }) {
  const pct = parsearDescuento(c.descuento);
  const fDesde = parsearFecha(c.desde);
  const fHasta = parsearFecha(c.hasta);
  const objecion = fDesde.ok && fHasta.ok ? objecionVigencia(fDesde.valor, fHasta.valor) : null;
  return { pct, fDesde, fHasta, objecion };
}

/**
 * Los campos de una campaña: descuento, fechas y categorías donde rige entera. Los usan la ventana «Campaña» de Catálogo ▸ Atributos
 * (para las etiquetas que no son campaña pero llevan descuento: Para liquidar, Estreno) y la pestaña Datos de Tienda web ▸ Campañas: una
 * sola pieza, para que los dos lugares pidan lo mismo de la misma forma. El estado y el guardado son de quien la usa; aquí solo se dibuja.
 */
export function CamposDeCampana({
  guia,
  descuento,
  setDescuento,
  desde,
  setDesde,
  hasta,
  setHasta,
  elegidas,
  setElegidas,
  categorias,
  puedeDarDescuento,
  bajoCosto,
}: {
  guia: GuiaCampos;
  descuento: string;
  setDescuento: (v: string) => void;
  desde: string;
  setDesde: (v: string) => void;
  hasta: string;
  setHasta: (v: string) => void;
  elegidas: Set<string>;
  setElegidas: Dispatch<SetStateAction<Set<string>>>;
  categorias: readonly CategoriaDeCampana[];
  /** Sin esto, el descuento no se escribe: la campaña se configura con fechas y categorías. */
  puedeDarDescuento: boolean;
  /** Las prendas que quedarían bajo su costo con este descuento (no bloquea: se avisa). */
  bajoCosto: readonly PrendaConCosto[];
}) {
  const { pct, fDesde, fHasta, objecion } = leerCamposDeCampana({ descuento, desde, hasta });

  const porFamilia = new Map<string, CategoriaDeCampana[]>();
  for (const c of categorias) porFamilia.set(c.familia, [...(porFamilia.get(c.familia) ?? []), c]);

  const alternar = (id: string) =>
    setElegidas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  return (
    <>
      <CampoGuiado id="descuento" guia={guia}>
        <CampoTexto
          etiqueta={guia.etiqueta("descuento", "Descuento (%)")}
          mono
          inputMode="decimal"
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
          disabled={!puedeDarDescuento}
          placeholder={puedeDarDescuento ? "Ej. 20" : "Tu rol no pone descuento"}
          tono={!pct.ok || bajoCosto.length > 0 ? "error" : undefined}
          className={bajoCosto.length > 0 ? "!text-rojo-profundo" : ""}
          pie={
            !pct.ok
              ? pct.error
              : bajoCosto.length > 0
                ? `Por debajo del costo: ${bajoCosto.length} prenda${bajoCosto.length === 1 ? "" : "s"} (${bajoCosto
                    .slice(0, 2)
                    .map(nombreBajoCosto)
                    .join(", ")}${bajoCosto.length > 2 ? "…" : ""}). Se puede guardar igual.`
                : "Vacío = solo informativa, sin descuento."
          }
          autoComplete="off"
        />
      </CampoGuiado>

      {/* El título del grupo va arriba y las dos fechas en su propia cuadrícula: con la cuadrícula en el grupo, el título ocupaba una
          columna y «Hasta» bajaba a otra fila. */}
      <CampoGuiado id="vigencia" guia={guia} titulo="Fechas" ayuda="Opcional: sin fechas, la etiqueta es permanente">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} tono={fDesde.ok ? undefined : "error"} />
          <CampoTexto
            etiqueta="Hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            tono={fHasta.ok && !objecion ? undefined : "error"}
            pie={objecion ?? undefined}
          />
        </div>
      </CampoGuiado>

      <CampoGuiado id="categorias" guia={guia}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="label-cayla text-[11px] text-tinta/65">
            {guia.etiqueta("categorias", "Categorías")} <span className="font-normal normal-case text-tinta/45">· opcional</span>
          </p>
          {elegidas.size > 0 && (
            <button type="button" onClick={() => setElegidas(new Set())} className="btn-cayla btn-enlace text-xs">
              Quitar todas
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-tinta/55">
          {elegidas.size === 0
            ? "Sin categorías, la campaña solo alcanza a las prendas que etiquetes a mano."
            : `Alcanza a todas las prendas de ${elegidas.size} categoría${elegidas.size === 1 ? "" : "s"}, además de las etiquetadas a mano.`}
        </p>
        <div className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
          {[...porFamilia.entries()].map(([familia, lista]) => (
            <div key={familia}>
              <p className="text-[11px] text-tinta/55">{familia}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {lista.map((c) => {
                  const activa = elegidas.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={activa}
                      onClick={() => alternar(c.id)}
                      className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                        activa ? "border-tinta bg-tinta text-crema" : "border-tinta/15 text-tinta/70 hover:border-tinta/30 hover:text-tinta"
                      }`}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CampoGuiado>
    </>
  );
}
