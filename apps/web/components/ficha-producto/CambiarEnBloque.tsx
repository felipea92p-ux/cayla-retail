"use client";

import { useEffect, useState } from "react";
import { Desplegable } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { alcancesDeBloque, aplicarEnBloque, type CampoBloque, type FilaFicha, type NombresFicha } from "@/lib/variantes-ficha-reglas";
import { CLASE_MONTO_ILEGIBLE, atributosMontoTexto } from "@/components/ui/CampoMonto";

// Precio o costo en bloque: «Cambiar [Precio|Costo] de [Todas | Color: Negro | Talla: S] a [monto] · Aplicar». Es la
// fila de grupo de Shopify («si cambias el precio del grupo, cambia en todas sus variantes») y el «Price extra» de Odoo,
// sin tener que entender ninguno de los dos: se lee como una frase. Aplica a las activas (y nuevas) del alcance; el costo
// no toca las que ya lo traen de compras, y lo dice. Nada se guarda: queda en la ficha hasta «Revisar y guardar».
//
// Un monto escrito y NO aplicado se avisa hacia afuera (`onPendiente`): «Revisar y guardar» no lo deja perderse en silencio
// (revisión 2026-09-28: se escribía 79.90 para las XL, se guardaba otro cambio y las XL seguían al precio viejo).
//
// Cada campo tiene SU monto (revisión 2026-10-03): antes era uno solo, y un precio escrito en «Precios» sin aplicar aparecía en
// «Costos» como «Cambiar el costo… a 79.90», a un Enter de volverse el costo de toda la prenda. Si el grupo elegido deja de
// existir (se quitó o se corrigió ese color) con un monto escrito, no cae en silencio a «Todas»: lo dice y espera.

export function CambiarEnBloque({
  filas,
  onFilas,
  onPendiente,
  nombres,
  veCosto,
  deshabilitado,
  onCampo,
  campoFijo,
  admitePrecioCero = false,
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
  /** Lo decide la pestaña de la matriz («Precios» o «Costos»): sin selector propio, la frase dice cuál se cambia. */
  campoFijo?: CampoBloque;
  /** La categoría elegida es de Empaque (fuera de los motores, ADR-0377): el precio puede ser 0, la bolsa de obsequio. */
  admitePrecioCero?: boolean;
}) {
  const [campoPropio, setCampo] = useState<CampoBloque>("precio");
  const campo = campoFijo ?? campoPropio;
  const [alcance, setAlcance] = useState("todas");
  const [montos, setMontos] = useState<Record<CampoBloque, string>>({ precio: "", costo: "" });
  const monto = montos[campo];
  const [resultado, setResultado] = useState<{ texto: string; error: boolean } | null>(null);
  const alcances = alcancesDeBloque(filas, nombres);
  // Si el alcance elegido dejó de existir (se corrigió o se quitó ese color), vuelve a «Todas»; con un monto escrito, lo dice.
  const alcanceExiste = alcances.some((a) => a.valor === alcance);
  const alcanceVigente = alcanceExiste ? alcance : "todas";
  const alcancePerdido = !alcanceExiste && alcance !== "todas";

  // Lo pendiente hacia afuera: el campo que se ve, si tiene monto; si no, el otro (también quedó escrito sin aplicar).
  const otro: CampoBloque = campo === "precio" ? "costo" : "precio";
  const pendiente: CampoBloque | null = montos[campo].trim() !== "" ? campo : montos[otro].trim() !== "" ? otro : null;
  useEffect(() => onPendiente(pendiente), [pendiente, onPendiente]);

  function escribir(valor: string) {
    setMontos((m) => ({ ...m, [campo]: valor }));
  }

  // Si la barra desaparece (todas quedaron desactivadas) con un monto escrito, ya no hay nada pendiente que avisar.
  useEffect(() => () => onPendiente(null), [onPendiente]);

  function aplicar() {
    if (alcancePerdido) {
      setAlcance("todas");
      return setResultado({ texto: "Ese grupo ya no está en la tabla: elige a cuáles poner el monto y vuelve a pulsar Aplicar.", error: true });
    }
    const r = aplicarEnBloque(filas, campo, alcanceVigente, monto, admitePrecioCero);
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
    <div data-guia="editar.bloque" className="rounded-xl border border-sand bg-papel px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-tinta/80">
        <span>Cambiar</span>
        {campoFijo ? (
          <span className="font-semibold text-tinta">{campoFijo === "precio" ? "el precio" : "el costo"}</span>
        ) : veCosto ? (
          <SegmentoDeslizante
            etiqueta="Qué cambiar"
            valor={campo}
            onCambio={(c) => {
              setCampo(c as CampoBloque);
              onCampo?.(c as CampoBloque);
              setResultado(null);
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
          forma="campo"
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
        {/* La caja que se enciende (ADR-0358, ronda 6), con su «S/» adentro. */}
        <span className="caja-cayla caja-campo w-28 gap-1 px-2.5">
          <span aria-hidden className="text-xs text-taupe">
            S/
          </span>
          <input
            className={`self-stretch py-0 tabular-nums ${CLASE_MONTO_ILEGIBLE}`}
            {...atributosMontoTexto(monto)}
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
