"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CLASE_MONTO_ILEGIBLE, atributosMontoTexto } from "@/components/ui/CampoMonto";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { money } from "@/components/PuntoDeVenta";
import { numeroDeMonto } from "@/lib/monto-plata-reglas";
import { RAZONES_DESCUENTO, RAZON_CAMPANA, totalDeLineas, type ModoDescuento } from "@/lib/vender-reglas";
import {
  aplicarAlApartado,
  lineasSiSeAplica,
  pideArgumento,
  type DescuentoManual,
  type LineaDescontada,
  type PrendaDescontable,
} from "@/lib/apartar-descuento-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";

// La hoja «Descuento» de Apartar (ADR-0584, Felipe 2026-10-30): la misma decisión que el apartado «Descuento» del ticket de Vender
// —cuánto (% o S/), por qué, el argumento pasado el 15 % y a qué prendas— con las mismas cuentas (`apartar-descuento-reglas.ts`).
// La base lo vuelve a exigir al apartar (`fn_exigir_descuento_manual`): esto solo guía.

/** Los atajos de siempre en el mostrador (los mismos del ticket). */
const ATAJOS_PCT = [5, 10, 15] as const;
const ATAJOS_MONTO = [5, 10, 20, 50] as const;

const OPCION = "rounded-lg text-sm font-semibold transition-colors";
const OPCION_ACTIVA = "bg-papel text-tinta shadow-sm";
const OPCION_INACTIVA = "text-tinta/60 hover:bg-papel/60";
const SIN_FLECHAS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function DescuentoApartado({
  lineas,
  prendas,
  nombreDe,
  elegidasAlAbrir,
  onAplicar,
  onQuitar,
  onClose,
}: {
  /** Las prendas del apartado con el descuento que ya llevan. */
  lineas: readonly LineaDescontada[];
  prendas: ReadonlyMap<string, PrendaDescontable>;
  /** «Blusa Emma · Terracota · M»: cómo se nombra cada prenda en la lista. */
  nombreDe: (varianteId: string) => string;
  /** Las que arrancan marcadas: todas, o la línea desde la que se abrió. */
  elegidasAlAbrir: readonly string[];
  onAplicar: (descuentos: Record<string, DescuentoManual>) => void;
  onQuitar: (varianteIds: string[]) => void;
  onClose: () => void;
}) {
  const [modo, setModo] = useState<ModoDescuento>("porcentaje");
  const [pct, setPct] = useState("");
  const [monto, setMonto] = useState("");
  const [razon, setRazon] = useState("");
  const [razonOtro, setRazonOtro] = useState("");
  const [argumento, setArgumento] = useState("");
  const [elegidas, setElegidas] = useState<string[]>(() => [...elegidasAlAbrir]);

  const porMonto = modo === "monto";
  const valor = porMonto ? numeroDeMonto(monto) : Number(pct);
  const valorValido = Number.isFinite(valor) && valor > 0 && (porMonto || valor <= 100);
  const conArgumento = valorValido && elegidas.length > 0 && pideArgumento(lineas, modo, valor, elegidas);
  const detalle = { razon, razonOtro, argumento };
  const quedan = valorValido && elegidas.length > 0 ? lineasSiSeAplica(lineas, prendas, modo, valor, elegidas, detalle) : null;
  // Donde la campaña da igual o más, la prenda se queda con la campaña: se dice antes de aplicar, no después.
  const ganaLaCampana = quedan ? quedan.filter((l) => elegidas.includes(l.varianteId) && l.razonDescuento === RAZON_CAMPANA) : [];
  const conManual = lineas.filter((l) => elegidas.includes(l.varianteId) && l.descuentoUnitario > 0 && l.razonDescuento !== RAZON_CAMPANA);

  // Lo que falta sale de lo mismo que exige la base (motivo, su detalle si es «Otro», el argumento pasado el 15 %, una prenda).
  const campos: CampoDeGuia[] = [
    { id: "valor", nombre: porMonto ? "Monto" : "Porcentaje", requerido: true, hecho: valorValido, pendiente: porMonto ? "Escribe un monto mayor a 0." : "Elige un porcentaje entre 1 y 100." },
    {
      id: "motivo",
      nombre: "Motivo",
      requerido: true,
      hecho: razon !== "" && (razon !== "otro" || razonOtro.trim() !== ""),
      pendiente: razon === "otro" ? "Cuenta en una línea por qué es «Otro»." : "Elige por qué se aplica el descuento.",
    },
    ...(conArgumento
      ? [{ id: "argumento", nombre: "Argumento", requerido: true, hecho: argumento.trim() !== "", pendiente: "Pasa el 15 %: escribe por qué se autoriza." }]
      : []),
    { id: "prendas", nombre: "Prendas", requerido: true, hecho: elegidas.length > 0, pendiente: "Marca al menos una prenda." },
  ];
  const guia = useGuiaCampos(campos);

  const alternar = (id: string) => setElegidas((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  const todas = elegidas.length === lineas.length;

  return (
    <Modal titulo="Descuento" subtitulo="Con las mismas reglas de la venta: el cliente lo conserva hasta que recoja." onClose={onClose} tamano="mediana">
      {(cerrar) => (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!guia.puedeConfirmar) return;
            onAplicar(aplicarAlApartado(lineas, modo, valor, elegidas, detalle));
            cerrar();
          }}
        >
          <CampoGuiado id="valor" guia={guia} titulo="Cuánto" ayuda={porMonto ? "en soles, del total de lo elegido" : "del precio de cada prenda"}>
            <div className="space-y-2">
              <SegmentoDeslizante
                forma="modo"
                etiqueta="Cómo escribir el descuento"
                valor={modo}
                onCambio={(m) => setModo(m as ModoDescuento)}
                opciones={[
                  { clave: "porcentaje", etiqueta: "%", ayuda: "En porcentaje del precio" },
                  { clave: "monto", etiqueta: "S/", ayuda: "En soles, del total de lo elegido" },
                ]}
              />
              <div className={`grid gap-1 rounded-xl bg-sand/50 p-1 ${porMonto ? "grid-cols-4" : "grid-cols-3"}`}>
                {(porMonto ? ATAJOS_MONTO : ATAJOS_PCT).map((v) => {
                  const activo = (porMonto ? monto : pct) === String(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => (porMonto ? setMonto(String(v)) : setPct(String(v)))}
                      className={`${OPCION} h-11 ${activo ? OPCION_ACTIVA : OPCION_INACTIVA}`}
                    >
                      {porMonto ? `S/${v}` : `${v}%`}
                    </button>
                  );
                })}
              </div>
              <label className="caja-cayla caja-campo h-11 gap-2">
                <span className="text-[12px] text-taupe">Otro</span>
                {porMonto ? (
                  <>
                    <span className="ml-auto text-sm text-tinta/60">S/</span>
                    <input
                      aria-label="Monto de descuento"
                      {...atributosMontoTexto(monto)}
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder="0.00" // sugerir-fijo: el formato de un monto en soles no depende de nada elegido antes
                      className={`w-24 self-stretch py-0 text-right text-lg font-semibold ${CLASE_MONTO_ILEGIBLE}`}
                    />
                  </>
                ) : (
                  <>
                    <input
                      aria-label="Porcentaje de descuento"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      value={pct}
                      onChange={(e) => setPct(e.target.value)}
                      placeholder="0" // sugerir-fijo: un porcentaje vacío no depende de nada elegido antes
                      className={`ml-auto w-20 self-stretch py-0 text-right text-lg font-semibold ${SIN_FLECHAS}`}
                    />
                    <span className="text-sm text-tinta/60">%</span>
                  </>
                )}
              </label>
            </div>
          </CampoGuiado>

          {/* El motivo es de una lista cerrada (R-45): a fin de mes se suma cuánto margen se fue por cada uno, igual que en la venta. */}
          <CampoGuiado id="motivo" guia={guia} titulo="Motivo">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-sand/50 p-1">
              {RAZONES_DESCUENTO.map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  aria-pressed={razon === r.valor}
                  onClick={() => setRazon(r.valor)}
                  className={`${OPCION} h-10 px-2 text-xs ${razon === r.valor ? OPCION_ACTIVA : OPCION_INACTIVA}`}
                >
                  {r.etiqueta}
                </button>
              ))}
            </div>
            {razon === "otro" && (
              <input
                aria-label="Detalle del motivo"
                type="text"
                maxLength={120}
                value={razonOtro}
                onChange={(e) => setRazonOtro(e.target.value)}
                placeholder="¿Por qué se descuenta?" // sugerir-fijo: pregunta por el motivo, no da un ejemplo que dependa de la prenda
                className="caja-campo-input anim-revelar mt-2 h-11 w-full text-sm"
              />
            )}
          </CampoGuiado>

          {conArgumento && (
            <CampoGuiado id="argumento" guia={guia} titulo="Argumento" ayuda="pasa el 15 %">
              <textarea
                aria-label="Argumento del descuento"
                rows={2}
                maxLength={300}
                value={argumento}
                onChange={(e) => setArgumento(e.target.value)}
                placeholder="Por qué se autoriza este descuento" // sugerir-fijo: pide la razón, no sugiere un ejemplo
                className="caja-campo-input w-full resize-none text-sm"
              />
            </CampoGuiado>
          )}

          <CampoGuiado id="prendas" guia={guia} titulo="A qué prendas" retiene="fila">
            <div className="divide-y divide-sand rounded-lg border border-sand bg-crema">
              {lineas.length > 1 && (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-tinta">
                  <Casilla
                    marcada={todas}
                    aMedias={elegidas.length > 0 && !todas}
                    onCambio={() => setElegidas(todas ? [] : lineas.map((l) => l.varianteId))}
                    etiqueta="Todas las prendas"
                  />
                  Todas las prendas
                </label>
              )}
              {lineas.map((l) => (
                <label key={l.varianteId} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Casilla marcada={elegidas.includes(l.varianteId)} onCambio={() => alternar(l.varianteId)} etiqueta={nombreDe(l.varianteId)} />
                  <span className="min-w-0 flex-1 truncate text-tinta">{nombreDe(l.varianteId)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-taupe">
                    {l.cantidad > 1 ? `${l.cantidad} × ` : ""}
                    {money(l.precioUnitario)}
                  </span>
                </label>
              ))}
            </div>
          </CampoGuiado>

          {quedan && (
            <div className="space-y-1 border-t border-sand pt-4">
              <p key={totalDeLineas(quedan)} className="anim-asentar flex items-baseline justify-between text-sm text-tinta/70">
                <span>El apartado quedaría en</span>
                <span className="font-display text-2xl text-tinta">{money(totalDeLineas(quedan))}</span>
              </p>
              {!porMonto && <p className="text-xs text-taupe">Cada prenda baja a un precio sin céntimos sueltos.</p>}
              {ganaLaCampana.length > 0 && (
                <p className="text-xs text-taupe">
                  {ganaLaCampana.map((l) => nombreDe(l.varianteId)).join(", ")}: su campaña ya da igual o más, se queda con la campaña.
                </p>
              )}
            </div>
          )}

          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Todo listo para aplicar." />
            {/* En el celular «Cancelar» y «Aplicar» se reparten la fila y «Quitar descuento» baja a la suya (PieAcciones). */}
            <PieAcciones
              className="w-full"
              izquierda={
                conManual.length > 0 ? (
                  <Boton
                    type="button"
                    peso="peligro"
                    onClick={() => {
                      onQuitar(conManual.map((l) => l.varianteId));
                      cerrar();
                    }}
                  >
                    Quitar descuento
                  </Boton>
                ) : undefined
              }
            >
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                Aplicar descuento
              </Boton>
            </PieAcciones>
          </div>
        </form>
      )}
    </Modal>
  );
}
