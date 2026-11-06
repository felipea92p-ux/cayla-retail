"use client";

import { useEffect, useRef } from "react";
import { type DescuentoForm, type ItemCarrito, money } from "@/components/PuntoDeVenta";
import { CabezaPaso } from "@/components/punto-de-venta/HojaDeCobro";
import { Casilla } from "@/components/ui/Casilla";
import { CLASE_MONTO_ILEGIBLE, atributosMontoTexto, atributosPorcentajeTexto } from "@/components/ui/CampoMonto";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { AYUDA_MODO_DESCUENTO, type CuentaDelDescuento } from "@/lib/descuento-cuenta-reglas";
import { RAZONES_DESCUENTO, type ModoDescuento, type PasoDescuento } from "@/lib/vender-reglas";

/** Atajos de % — los que se dan de palabra en el mostrador. */
const ATAJOS_PCT = [5, 10, 15] as const;
/** Atajos de S/ — la otra entrada, para cuando lo acordado con el cliente es un monto y no un % (vuelve el 2026-10-14, Felipe). */
const ATAJOS_MONTO = [5, 10, 20, 50] as const;

/** Lleva la vista (y el foco, si es un campo de texto) al paso del descuento que sigue. Cada paso se marca con `data-paso-descuento`. */
function irAlPaso(raiz: HTMLElement | null, paso: PasoDescuento) {
  const destino = raiz?.querySelector<HTMLElement>(`[data-paso-descuento="${paso}"]`);
  if (!destino) return;
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  destino.scrollIntoView({ block: "nearest", behavior: reducido ? "auto" : "smooth" });
  const campo = destino.matches("input, textarea") ? destino : destino.querySelector<HTMLElement>("input, textarea");
  campo?.focus({ preventScroll: true });
}

/**
 * El cuerpo del descuento: tres pasos que se marcan ✓ al cumplirse — 1 ¿A qué prendas? · 2 ¿Cuánto? · 3 ¿Por qué? — y, si pasa el 15 %, el
 * argumento (ADR-0584, maqueta `docs/maquetas/descuento-hoja-2026-11/`, Felipe 2026-11-02: «A · Hoja lateral»). Lo dibuja la hoja lateral de
 * escritorio (`HojaDeDescuento`, como el cobro) y, en el celular, el ticket dentro de su hoja. En una hoja ancha se acomoda en dos columnas
 * (las prendas a la izquierda; cuánto y por qué a la derecha); en una angosta, en una.
 *
 * Sin reglas propias: todo sale de `cuentaDelDescuento`. «Cuánto» dice con palabras si es porcentaje o monto (antes, «% | S/» solo con
 * símbolos), y el motivo es una lista de una línea con las mismas cinco razones de siempre (`RAZONES_DESCUENTO`: la base manda).
 * La guía de foco (ADR-0284) sigue igual: el paso que toca se enciende y, al completarlo, el foco salta al siguiente.
 */
export function PanelDescuento({
  descuento,
  onDescuento,
  carrito,
  cuenta,
  bloqueado,
  conQuedaria = false,
}: {
  descuento: DescuentoForm;
  onDescuento: (cambio: Partial<DescuentoForm>) => void;
  carrito: readonly ItemCarrito[];
  cuenta: CuentaDelDescuento;
  bloqueado: boolean;
  /** Al final del cuerpo, «Quedaría en»: lo pide el ticket del celular; la hoja lo lleva en su pie fijo. */
  conQuedaria?: boolean;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const { porMonto, valorValido, todasLasPrendas, elegidas, alcanza, elegidasCuenta, hecho, pasoDescuento, mostrarArgumento } = cuenta;
  const luz = (p: PasoDescuento) => pasoDescuento === p;
  // El paso que se enciende: el que toca llenar ahora (los de motivo y argumento comparten su tarjeta de «¿Por qué?» / «Argumento»).
  const sigue = {
    prendas: luz("prendas"),
    cuanto: luz("valor"),
    porque: luz("motivo") || luz("motivoOtro"),
    argumento: luz("argumento"),
  };

  // Al completar un paso, el foco salta al siguiente — nunca si quien escribe está en un campo de texto (guía de foco, regla 6).
  const pasoAnterior = useRef<PasoDescuento | null>(null);
  useEffect(() => {
    const previo = pasoAnterior.current;
    pasoAnterior.current = pasoDescuento;
    if (previo === null || previo === pasoDescuento) return;
    const activo = document.activeElement;
    if (activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement) return;
    irAlPaso(raiz.current, pasoDescuento);
  }, [pasoDescuento]);
  const siguienteConEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") irAlPaso(raiz.current, pasoDescuento);
  };

  function alternarPrenda(claveLinea: string) {
    // Desde «todo el ticket», desmarcar una prenda deja marcadas todas las demás.
    if (elegidas === null) return onDescuento({ elegidas: carrito.filter((it) => it.claveLinea !== claveLinea).map((it) => it.claveLinea) });
    onDescuento({ elegidas: elegidas.includes(claveLinea) ? elegidas.filter((k) => k !== claveLinea) : [...elegidas, claveLinea] });
  }

  const atajos = porMonto ? ATAJOS_MONTO : ATAJOS_PCT;
  const valorActual = porMonto ? descuento.monto : descuento.pct;
  const clasePaso = (hechoPaso: boolean, enciende: boolean) => `hoja-cobro-paso ${hechoPaso ? "es-hecho" : enciende ? "sigue-aqui" : ""}`;

  return (
    <div ref={raiz} className="pv-desc-cuerpo">
      {/* 1 · A qué prendas: todo el ticket, o solo las que se marquen. */}
      <section className={`${clasePaso(hecho.prendas, sigue.prendas)} pv-desc-prendas`}>
        <CabezaPaso numero={1} titulo="¿A qué prendas?" hecho={hecho.prendas} pista={sigue.prendas ? "Sigue" : null} estado={null} />
        <label className="pv-desc-fila pv-desc-todo">
          <Casilla marcada={todasLasPrendas} onCambio={() => onDescuento({ elegidas: todasLasPrendas ? [] : null })} etiqueta="Todo el ticket" disabled={bloqueado} />
          <span className="min-w-0 flex-1 font-semibold">Todo el ticket</span>
        </label>
        <div data-paso-descuento="prendas" className="pv-desc-lista">
          {carrito.map((it) => (
            <label key={it.claveLinea} className="pv-desc-fila" data-marcada={alcanza(it.claveLinea) || undefined}>
              <Casilla marcada={alcanza(it.claveLinea)} onCambio={() => alternarPrenda(it.claveLinea)} etiqueta={it.referencia} disabled={bloqueado} />
              <span className="min-w-0 flex-1 truncate text-tinta">{it.referencia}</span>
              <span className="shrink-0 text-sm tabular-nums text-tinta/70">
                {it.cantidad > 1 ? `${it.cantidad} × ` : ""}
                {money(it.precioUnitario)}
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="pv-desc-der">
        {/* 2 · Cuánto: con palabras, y sobre qué se calcula. */}
        <section className={clasePaso(hecho.cuanto, sigue.cuanto)}>
          <CabezaPaso numero={2} titulo="¿Cuánto?" hecho={hecho.cuanto} pista={sigue.cuanto ? "Sigue" : null} estado={null} />
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Cómo escribir el descuento"
            className="pv-desc-modo"
            valor={descuento.modo}
            onCambio={(m) => onDescuento({ modo: m as ModoDescuento })}
            opciones={[
              { clave: "porcentaje", etiqueta: "Porcentaje", ayuda: "Del precio de cada prenda" },
              { clave: "monto", etiqueta: "Monto en S/", ayuda: "En soles, del total de lo elegido" },
            ]}
          />
          <div data-paso-descuento="valor" className="pv-desc-fichas" style={{ "--n": atajos.length } as React.CSSProperties}>
            {atajos.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onDescuento(porMonto ? { monto: String(a) } : { pct: String(a) })}
                disabled={bloqueado}
                aria-pressed={valorActual === String(a)}
                className="pildora-cayla pv-desc-ficha"
              >
                {porMonto ? `S/${a}` : `${a}%`}
              </button>
            ))}
            <label className="caja-cayla caja-campo pv-desc-otro gap-1.5">
              {/* «Otro» vive como marcador del propio campo (no como una palabra aparte): así el número entero —100, 12.50— tiene todo el ancho. */}
              {porMonto ? (
                <>
                  <span className="text-sm text-tinta/60">S/</span>
                  <input
                    aria-label="Otro monto de descuento"
                    {...atributosMontoTexto(descuento.monto)}
                    value={descuento.monto}
                    onChange={(e) => onDescuento({ monto: e.target.value })}
                    onKeyDown={siguienteConEnter}
                    placeholder="Otro" // sugerir-fijo: «Otro» nombra la casilla del valor libre junto a las fichas, no es un ejemplo que dependa de lo elegido
                    disabled={bloqueado}
                    className={`min-w-0 flex-1 self-stretch py-0 text-center text-lg font-semibold ${CLASE_MONTO_ILEGIBLE}`}
                  />
                </>
              ) : (
                <>
                  <input
                    aria-label="Otro porcentaje de descuento"
                    {...atributosPorcentajeTexto(descuento.pct)}
                    value={descuento.pct}
                    onChange={(e) => onDescuento({ pct: e.target.value })}
                    onKeyDown={siguienteConEnter}
                    placeholder="Otro" // sugerir-fijo: «Otro» nombra la casilla del valor libre junto a las fichas, no es un ejemplo que dependa de lo elegido
                    disabled={bloqueado}
                    className={`min-w-0 flex-1 self-stretch py-0 text-center text-lg font-semibold ${CLASE_MONTO_ILEGIBLE}`}
                  />
                  <span className="text-sm text-tinta/60">%</span>
                </>
              )}
            </label>
          </div>
          <p className="pv-desc-ayuda">{AYUDA_MODO_DESCUENTO[porMonto ? "monto" : "porcentaje"]}</p>
        </section>

        {/* 3 · Por qué (R-45): de una lista cerrada, no texto libre — «un texto libre no se puede sumar; una lista sí, y a fin de mes se ve
            cuánto margen se fue por cada motivo». `registrar_venta` lo exige apenas hay descuento. */}
        <section className={clasePaso(hecho.porque, sigue.porque)}>
          <CabezaPaso numero={3} titulo="¿Por qué?" hecho={hecho.porque} pista={sigue.porque ? "Sigue" : null} estado={null} />
          <div data-paso-descuento="motivo" role="radiogroup" aria-label="Motivo del descuento" className="pv-desc-opciones">
            {RAZONES_DESCUENTO.map((r) => (
              <button
                key={r.valor}
                type="button"
                role="radio"
                aria-checked={descuento.razon === r.valor}
                onClick={() => onDescuento({ razon: r.valor })}
                disabled={bloqueado}
                className="pv-desc-opcion"
              >
                <span aria-hidden className="pv-desc-punto" />
                {r.etiqueta}
              </button>
            ))}
          </div>
          {descuento.razon === "otro" && (
            <input
              aria-label="Detalle del motivo"
              data-paso-descuento="motivoOtro"
              type="text"
              value={descuento.razonOtro}
              onChange={(e) => onDescuento({ razonOtro: e.target.value })}
              onKeyDown={siguienteConEnter}
              placeholder="¿Por qué se descuenta?"
              disabled={bloqueado}
              className="caja-campo-input box-border h-11 w-full min-w-0 text-sm"
            />
          )}
        </section>

        {/* Argumento escrito: aparece pasado el 15 %, lo aplique quien lo aplique, y es lo único que se pide (Felipe, 2026-10-01: sin código
            de descuento). El candado real vive en la base; acá se pide antes de que llegue a rechazarlo. */}
        {mostrarArgumento && (
          <section className={clasePaso(descuento.argumento.trim() !== "", sigue.argumento)}>
            <CabezaPaso numero={4} titulo="Argumento" hecho={descuento.argumento.trim() !== ""} pista={sigue.argumento ? "Sigue" : null} estado={null} />
            <p className="pv-desc-ayuda">Pasa el 15 %: cuenta por qué se autoriza.</p>
            <textarea
              aria-label="Argumento del descuento"
              data-paso-descuento="argumento"
              value={descuento.argumento}
              onChange={(e) => onDescuento({ argumento: e.target.value })}
              placeholder="Por qué se autoriza este descuento"
              disabled={bloqueado}
              rows={2}
              className="caja-campo-input box-border w-full min-w-0 resize-none text-sm"
            />
          </section>
        )}
      </div>

      {conQuedaria && valorValido && elegidasCuenta > 0 && (
        <p key={cuenta.totalConDescuento} className="anim-asentar pv-desc-quedaria-fila flex items-baseline justify-between border-t border-sand pt-4 text-sm text-tinta/70">
          <span>Quedaría en</span>
          <span className="font-display text-2xl text-tinta">{money(cuenta.totalConDescuento)}</span>
        </p>
      )}
    </div>
  );
}
