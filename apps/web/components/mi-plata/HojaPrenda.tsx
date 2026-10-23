"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { soles } from "@/lib/compras-reglas";
import {
  camposPrenda,
  gananciaPorPrenda,
  leerCantidad,
  leerPrecio,
  textoAgregarPrenda,
  type BorradorPrenda,
  type Habitual,
} from "@/lib/compra-rapida-reglas";

// La hoja de la prenda de «Compré ropa» (rediseño, maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23). Al tocar una
// prenda se abre esta hoja con lo que antes eran cuatro pantallas seguidas: cuántas, cuánto costó cada una, a cuánto se vende y a qué
// tienda va (por prenda: Felipe lo pidió así el mismo día). La cantidad llega vacía con «La vez pasada» a un toque (/formidable,
// 2026-10-23); el costo y la venta, con su atajo («La vez pasada», «Del catálogo»). La tienda llega marcada con la de la prenda anterior.
// No guarda nada en la base: agrega la prenda a la compra, que se guarda al final, con el papel.

type Tienda = { id: string; nombre: string };

export function HojaPrenda({
  habitual: h,
  borrador: b,
  cambiar,
  tiendas,
  tiendaAnterior,
  corrige,
  onAgregar,
  onQuitar,
  onClose,
}: {
  habitual: Habitual;
  borrador: BorradorPrenda;
  cambiar: (b: BorradorPrenda) => void;
  tiendas: Tienda[];
  /** La tienda de la prenda anterior, para decir «Como la anterior». */
  tiendaAnterior: string | null;
  /** Corrige una prenda que ya va en la compra: el botón dice «Guardar» y aparece «Quitar». */
  corrige: boolean;
  onAgregar: () => void;
  onQuitar?: () => void;
  onClose: () => void;
}) {
  const guia = useGuiaCampos(camposPrenda(b));
  const poner = (campo: keyof BorradorPrenda) => (v: string | null) => cambiar({ ...b, [campo]: v });
  const cantidad = leerCantidad(b.cantidad);
  const ganancia = gananciaPorPrenda(b);
  const laVezPasada = h.veces > 0 && h.ultimaCantidad != null && h.ultimaCantidad > 0 ? h.ultimaCantidad : null;
  const detalle = [h.categoria, h.marca].filter(Boolean).join(" · ");

  return (
    <Modal titulo={h.nombre} subtitulo={detalle} onClose={onClose} variante="hoja">
      {(cerrar) => (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (guia.puedeConfirmar) onAgregar();
            else {
              const ahora = guia.ahora ?? guia.faltan[0]?.id;
              if (ahora) guia.ir(ahora);
            }
          }}
        >
          <CampoGuiado id="cantidad" guia={guia} titulo="¿Cuántas?">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PasoCantidad
                data-guia="compra.cantidad"
                menos={{ onClick: () => poner("cantidad")(String(Math.max(1, (cantidad ?? 1) - 1))), deshabilitado: (cantidad ?? 0) <= 1, etiqueta: "Una menos" }}
                mas={{ onClick: () => poner("cantidad")(String(Math.min(99999, (cantidad ?? 0) + 1))), etiqueta: "Una más" }}
                campo={{
                  value: b.cantidad,
                  inputMode: "numeric",
                  autoComplete: "off",
                  "aria-label": "¿Cuántas compraste?",
                  onChange: (e) => poner("cantidad")(e.target.value),
                }}
              />
              {laVezPasada != null && (
                <Atajo elegido={cantidad === laVezPasada} onClick={() => poner("cantidad")(String(laVezPasada))} guia="compra.igual" nombre="La vez pasada">
                  {laVezPasada}
                </Atajo>
              )}
            </div>
          </CampoGuiado>

          {/* Lado a lado como la maqueta desde 640 px; en el celular, uno bajo el otro: a media hoja, el título con su «Sigue aquí» no
              cabía y el bloque crecía mientras se llenaba. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoGuiado id="costo" guia={guia} titulo="Te costó c/u">
              <CampoMonto
                etiqueta="Te costó cada una"
                etiquetaOculta
                inputMode="decimal"
                autoComplete="off"
                value={b.costo}
                data-guia="compra.costo"
                onChange={(e) => poner("costo")(e.target.value)}
              />
              {h.costo != null && (
                <Atajo elegido={leerPrecio(b.costo) === h.costo} onClick={() => poner("costo")(h.costo!.toFixed(2))} nombre={h.veces > 0 ? "La vez pasada" : "Del catálogo"}>
                  {soles(h.costo)}
                </Atajo>
              )}
            </CampoGuiado>
            <CampoGuiado id="venta" guia={guia} titulo="Se vende a">
              <CampoMonto
                etiqueta="Se vende a"
                etiquetaOculta
                inputMode="decimal"
                autoComplete="off"
                value={b.venta}
                data-guia="compra.venta"
                onChange={(e) => poner("venta")(e.target.value)}
              />
              {h.venta != null && (
                <Atajo elegido={leerPrecio(b.venta) === h.venta} onClick={() => poner("venta")(h.venta!.toFixed(2))} nombre="Del catálogo">
                  {soles(h.venta)}
                </Atajo>
              )}
            </CampoGuiado>
          </div>

          {ganancia != null && (
            <p
              /* unificar-fijo: el dato de la ganancia por prenda de la maqueta, no un aviso */ className={`flex items-center justify-between rounded-[14px] px-3.5 py-3 text-sm ${ganancia >= 0 ? "bg-verde/10" : "bg-ambar/10"}`}
            >
              <span className="text-tinta">{ganancia >= 0 ? "Por cada una ganas" : "Se vende por debajo de lo que costó"}</span>
              <b className={`tabular-nums ${ganancia >= 0 ? "text-verde" : "text-ambar"}`}>{soles(Math.abs(ganancia))}</b>
            </p>
          )}

          <CampoGuiado id="tienda" guia={guia} titulo="¿A qué tienda va?">
            <div role="group" aria-label="¿A qué tienda va?" className="grid grid-cols-3 gap-2" data-guia="compra.tiendas">
              {tiendas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={b.destinoId === t.id}
                  onClick={() => poner("destinoId")(t.id)}
                  className={`card-cayla mov-boton flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[14px] p-2 text-center ${b.destinoId === t.id ? "border-tinta bg-sand/40" : ""}`}
                >
                  <span className="text-sm font-medium leading-tight text-tinta">{t.nombre}</span>
                  {tiendaAnterior === t.id && <span className="text-[11px] text-taupe">Como la anterior</span>}
                </button>
              ))}
            </div>
          </CampoGuiado>

          <PieGuia guia={guia} listo="Lista para agregar a la compra." conFrase />
          <PieAcciones
            className="pie-hoja-fijo pt-1"
            izquierda={
              corrige && onQuitar ? (
                <Boton type="button" peso="peligro" onClick={onQuitar}>
                  Quitar de la compra
                </Boton>
              ) : undefined
            }
          >
            <Boton type="button" peso="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              disabled={!guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
              data-guia="compra.agregar"
            >
              {textoAgregarPrenda(b, corrige)}
            </Boton>
          </PieAcciones>
        </form>
      )}
    </Modal>
  );
}

/** «La vez pasada / S/ 17.50»: pone lo de antes de un toque; marcado (con su ✓) cuando lo escrito ya es eso. En dos líneas: a 375 px,
 *  media hoja no alcanza para el nombre y el monto juntos. */
function Atajo({ elegido, onClick, guia, nombre, children }: { elegido: boolean; onClick: () => void; guia?: string; nombre: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onClick}
      data-guia={guia}
      className="btn-cayla btn-sutil btn-chico mt-2 h-auto min-h-11 max-w-full flex-col items-start gap-0 py-1.5 text-left leading-tight"
    >
      <span className="flex items-center gap-1 text-[11px] text-taupe">
        {elegido && <Check className="h-3 w-3 text-verde" aria-hidden />}
        {nombre}
      </span>
      <span className="tabular-nums text-tinta">{children}</span>
    </button>
  );
}
