"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { ChipsConOtra } from "./ChipsConOtra";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { soles } from "@/lib/compras-reglas";
import { sugerirNombre } from "@/lib/sugerencias-alta-producto";
import {
  MARCA_NUEVA_MAX,
  MARCA_NUEVA_PREFIJO,
  NOMBRE_NUEVO_MAX,
  alternarDestino,
  camposPrenda,
  camposPrendaNueva,
  conCantidad,
  habitualParecido,
  opcionesCategoriaNueva,
  opcionesMarcaNueva,
  problemaReparto,
  gananciaPorPrenda,
  leerCantidad,
  leerPrecio,
  marcaEscrita,
  nombreCortoTienda,
  textoAgregarPrenda,
  type BorradorNuevo,
  type BorradorPrenda,
  type CategoriaParaComprar,
  type Habitual,
} from "@/lib/compra-rapida-reglas";

// La hoja de la prenda de «Compré ropa» (rediseño, maquetas docs/maquetas/compras-formidable-2026-10/ y mis-compras-rediseno-2026-10/, Felipe 2026-10-23 y 24). Al tocar una
// prenda se abre esta hoja con lo que antes eran cuatro pantallas seguidas: cuántas, cuánto costó cada una, a cuánto se vende y a qué
// tienda va (por prenda: Felipe lo pidió así el mismo día). La cantidad llega vacía con «La vez pasada» a un toque (/formidable,
// 2026-10-23); el costo y la venta, con su atajo («La vez pasada», «Del catálogo»). La tienda llega marcada con la de la prenda anterior.
// No guarda nada en la base: agrega la prenda a la compra, que se guarda al final, con el papel.
//
// Repartir entre tiendas (Felipe 2026-10-23: «si selecciono más de una, que aparezcan inputs para distribuir el total»): toda prenda puede
// ir a varias tiendas; al marcar la segunda aparece «¿Cuántas a cada una?», repartido parejo, y se corrige con − y +. También una prenda
// NUEVA (Felipe 2026-10-24: «no me permite seleccionar más de 1 sede»): la crea la primera tienda que la recibe, y la segunda no la duplica
// porque la recepción ya avisa «Esa prenda ya existe en esta marca» y ofrece usar la que está (`nombre_duplicado`).
//
// «Algo nuevo de este proveedor» es esta misma hoja (Felipe 2026-10-23: «que se entienda»): arriba, qué es, la marca y cómo se llama; abajo,
// lo de siempre. Es solo una referencia de la compra: no crea la prenda en el catálogo, la crea la tienda al recibir.

type Tienda = { id: string; nombre: string };

/** Lo que pide una prenda que todavía no le compras: lo escrito, y con qué se elige. */
export type PrendaNuevaDeHoja = {
  borrador: BorradorNuevo;
  cambiar: (cambio: Partial<BorradorNuevo>) => void;
  proveedor: string;
  categorias: CategoriaParaComprar[];
  /** Las categorías que ya le compras y las que ya anotaste en esta compra: van primero, en este orden (lo último anotado, antes). */
  suyas: ReadonlySet<string>;
  marcas: { id: string; nombre: string }[];
  /** Las marcas que trae este proveedor: van primero. */
  marcasDelProveedor: { id: string; nombre: string }[];
  /** Sus habituales, para preguntar «¿Es la …?» si el nombre se parece. */
  habituales: Habitual[];
  /** «Usar esa»: la hoja pasa a la prenda que ya le compras. */
  usar: (h: Habitual) => void;
};

export function HojaPrenda({
  habitual: h,
  borrador: b,
  cambiar,
  tiendas,
  tiendaAnterior,
  corrige,
  tocada = false,
  onAgregar,
  onQuitar,
  onClose,
  nueva,
  admitePrecioCero = false,
}: {
  habitual: Habitual;
  borrador: BorradorPrenda;
  /** Lo que cambió (solo eso): quien guarda el borrador lo aplica sobre lo último, así dos toques seguidos no se pisan. */
  cambiar: (cambio: Partial<BorradorPrenda>) => void;
  tiendas: Tienda[];
  /** La tienda de la prenda anterior, para decir «Como la anterior». */
  tiendaAnterior: string | null;
  /** Corrige una prenda que ya va en la compra: el botón dice «Guardar» y aparece «Quitar». */
  corrige: boolean;
  /** Lo escrito ya no es lo que traía al abrirse: cerrarla con el dedo, Escape o «Cancelar» pregunta antes de perderlo. */
  tocada?: boolean;
  onAgregar: () => void;
  onQuitar?: () => void;
  onClose: () => void;
  /** Una prenda que todavía no le compras: la hoja pregunta además qué es, la marca y cómo se llama. */
  nueva?: PrendaNuevaDeHoja;
  /** ¿La categoría de esta prenda admite venderla a S/ 0 (bolsas, cajas, empaque)? En una prenda nueva se lee de la categoría que se va eligiendo. Sin dato, no. */
  admitePrecioCero?: boolean;
}) {
  const n = nueva?.borrador;
  const admiteCero = n ? nueva?.categorias.find((c) => c.id === n.categoriaId)?.admitePrecioCero === true : admitePrecioCero;
  const parecido = nueva && n ? habitualParecido(n.nombre, nueva.habituales, n.descartadas) : null;
  const guia = useGuiaCampos(n ? camposPrendaNueva(n, parecido !== null, b, admiteCero) : camposPrenda(b, admiteCero));
  const poner = (campo: "costo" | "venta") => (v: string) => cambiar({ [campo]: v });
  // Cambiar cuántas rehace el reparto parejo entre las tiendas, salvo que se haya repartido a mano.
  const ponerCantidad = (v: string) => cambiar(conCantidad(b, v));
  const repartidas = b.destinos.length >= 2;
  const nombreTienda = new Map(tiendas.map((t) => [t.id, nombreCortoTienda(t.nombre)]));
  const faltaReparto = problemaReparto(b);
  const sumaReparto = b.destinos.reduce((s, d) => s + (leerCantidad(b.reparto[d] ?? "") ?? 0), 0);
  const cantidad = leerCantidad(b.cantidad);
  const ganancia = gananciaPorPrenda(b, admiteCero);
  const laVezPasada = h.veces > 0 && h.ultimaCantidad != null && h.ultimaCantidad > 0 ? h.ultimaCantidad : null;
  const detalle = [h.categoria, h.marca].filter(Boolean).join(" · ");
  // Solo al cerrar la hoja: el «atrás» y los enlaces ya los cuida la guardia de «Compré ropa», que la contiene.
  const salida = useSalidaSinGuardar(
    tocada,
    corrige
      ? "Cambiaste esta prenda y todavía no guardas el cambio. Si cierras ahora, queda como estaba."
      : "Empezaste a anotar esta prenda y todavía no la agregas a la compra. Si cierras ahora, se pierde lo que llenaste.",
    { soloAlCerrar: true },
  );

  return (
    <Modal titulo={nueva ? "Algo nuevo" : h.nombre} subtitulo={nueva ? `De ${nueva.proveedor} · solo una referencia` : detalle} onClose={onClose} variante="hoja" antesDeCerrar={salida.pedirAccion}>
      {(cerrar) => (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (guia.puedeConfirmar) onAgregar();
            else {
              const ahora = guia.ahora ?? guia.faltan[0]?.id;
              if (ahora) guia.ir(ahora);
            }
          }}
        >
          {nueva && n && <DescribirNueva nueva={nueva} n={n} parecido={parecido} guia={guia} />}

          {/* Compacta como la maqueta (Felipe 2026-10-23: «aprovecha mejor los espacios»): «¿Cuántas?» y su − y + en la misma fila; el costo
              y la venta lado a lado, también en el celular; los atajos, píldoras chicas bajo su campo. */}
          <CampoGuiado id="cantidad" guia={guia}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span className="text-[13px] font-semibold text-tinta">
                  <ConMarca estado={guia.estado("cantidad")}>¿Cuántas unidades?</ConMarca>
                </span>
                {laVezPasada != null && (
                  <Atajo elegido={cantidad === laVezPasada} onClick={() => ponerCantidad(String(laVezPasada))} guia="compra.igual">
                    La vez pasada: {laVezPasada}
                  </Atajo>
                )}
              </span>
              <PasoCantidad
                data-guia="compra.cantidad"
                menos={{ onClick: () => ponerCantidad(String(Math.max(1, (cantidad ?? 1) - 1))), deshabilitado: (cantidad ?? 0) <= 1, etiqueta: "Una menos" }}
                mas={{ onClick: () => ponerCantidad(String(Math.min(99999, (cantidad ?? 0) + 1))), etiqueta: "Una más" }}
                campo={{
                  value: b.cantidad,
                  inputMode: "numeric",
                  autoComplete: "off",
                  "aria-label": "¿Cuántas unidades compraste?",
                  onChange: (e) => ponerCantidad(e.target.value),
                }}
              />
            </div>
          </CampoGuiado>

          <div className="grid grid-cols-2 gap-3">
            <CampoGuiado id="costo" guia={guia} titulo="Costo c/u">
              <CampoMonto
                etiqueta="Te costó cada una"
                etiquetaOculta
                sinPie
                inputMode="decimal"
                autoComplete="off"
                value={b.costo}
                data-guia="compra.costo"
                onChange={(e) => poner("costo")(e.target.value)}
              />
              {h.costo != null && (
                <Atajo elegido={leerPrecio(b.costo) === h.costo} onClick={() => poner("costo")(h.costo!.toFixed(2))} titulo={soles(h.costo)}>
                  {h.veces > 0 ? "La vez pasada" : "Del catálogo"}
                </Atajo>
              )}
            </CampoGuiado>
            <CampoGuiado id="venta" guia={guia} titulo="Se vende a">
              <CampoMonto
                etiqueta="Se vende a"
                etiquetaOculta
                sinPie
                inputMode="decimal"
                autoComplete="off"
                value={b.venta}
                data-guia="compra.venta"
                onChange={(e) => poner("venta")(e.target.value)}
              />
              {h.venta != null && (
                <Atajo elegido={leerPrecio(b.venta) === h.venta} onClick={() => poner("venta")(h.venta!.toFixed(2))} titulo={soles(h.venta)}>
                  Del catálogo
                </Atajo>
              )}
            </CampoGuiado>
          </div>

          {ganancia != null && (
            <p
              /* unificar-fijo: el dato de la ganancia por prenda de la maqueta, no un aviso */ className={`flex items-center justify-between rounded-[14px] px-3.5 py-2.5 text-sm ${ganancia >= 0 ? "bg-verde/10" : "bg-ambar/10"}`}
            >
              <span className="text-tinta">{ganancia >= 0 ? "Por cada una ganas" : "Se vende por debajo de lo que costó"}</span>
              <b className={`tabular-nums ${ganancia >= 0 ? "text-verde" : "text-ambar"}`}>{soles(Math.abs(ganancia))}</b>
            </p>
          )}

          <CampoGuiado id="tienda" guia={guia} titulo="¿A qué tienda va? · una o varias">
            {/* Las columnas se reparten solas según cuántas tiendas haya (dos, tres o más), sin un hueco al lado. */}
            <div role="group" aria-label="¿A qué tienda va?" className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2" data-guia="compra.tiendas">
              {tiendas.map((t) => {
                const elegida = b.destinos.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={elegida}
                    title={tiendaAnterior === t.id ? "La de la prenda anterior" : undefined}
                    onClick={() => cambiar(alternarDestino(b, t.id))}
                    className={`card-cayla mov-boton flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-center ${elegida ? "border-tinta bg-sand/40" : ""}`}
                  >
                    {elegida && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    <span className="text-sm font-medium leading-tight text-tinta">{nombreCortoTienda(t.nombre)}</span>
                  </button>
                );
              })}
            </div>
          </CampoGuiado>

          {/* Repartida entre tiendas: cuántas va a cada una, parejo de entrada; abajo, si cuadra con lo comprado. */}
          {repartidas && (
            <CampoGuiado id="reparto" guia={guia} titulo="¿Cuántas unidades a cada una?">
              <ul className="flex flex-col gap-2" data-guia="compra.reparto">
                {b.destinos.map((d) => {
                  const n = leerCantidad(b.reparto[d] ?? "") ?? 0;
                  const ponerParte = (v: string) => cambiar({ reparto: { ...b.reparto, [d]: v }, repartoPropio: true });
                  return (
                    <li key={d} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-tinta">{nombreTienda.get(d) ?? "Tienda"}</span>
                      <PasoCantidad
                        menos={{ onClick: () => ponerParte(String(Math.max(0, n - 1))), deshabilitado: n <= 0, etiqueta: `Una menos a ${nombreTienda.get(d) ?? "la tienda"}` }}
                        mas={{ onClick: () => ponerParte(String(n + 1)), etiqueta: `Una más a ${nombreTienda.get(d) ?? "la tienda"}` }}
                        campo={{
                          value: b.reparto[d] ?? "",
                          inputMode: "numeric",
                          autoComplete: "off",
                          "aria-label": `Cuántas unidades van a ${nombreTienda.get(d) ?? "la tienda"}`,
                          onChange: (e) => ponerParte(e.target.value),
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
              <p className={`mt-2 flex items-center gap-1.5 text-[13px] ${faltaReparto ? "text-ambar" : "text-verde"}`}>
                {faltaReparto ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {faltaReparto ?? `Cuadra: ${sumaReparto} de ${cantidad ?? sumaReparto}`}
              </p>
            </CampoGuiado>
          )}

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
            <Boton type="button" peso="fantasma" onClick={() => salida.pedirAccion(cerrar)}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              disabled={!guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
              data-guia="compra.agregar"
              data-vuelo-origen
            >
              {textoAgregarPrenda(b, corrige)}
            </Boton>
          </PieAcciones>
          {salida.aviso}
        </form>
      )}
    </Modal>
  );
}

/** «✓ La vez pasada»: pone lo de antes de un toque; marcado (con su ✓) cuando lo escrito ya es eso. Una píldora chica bajo su campo, como
 *  la maqueta; el monto va en el campo (y en su `title`). */
function Atajo({ elegido, onClick, guia, titulo, children }: { elegido: boolean; onClick: () => void; guia?: string; titulo?: string; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={elegido} onClick={onClick} data-guia={guia} title={titulo} className="btn-cayla btn-sutil compra-atajo mt-1.5 max-w-full">
      {elegido && <Check className="h-3.5 w-3.5 text-verde" aria-hidden />}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** Lo de arriba de la hoja de una prenda nueva: qué es y la marca, cómo se llama debajo, y la nota de que es solo una
 *  referencia. El ejemplo del nombre sigue a la categoría elegida (ADR-0290). */
function DescribirNueva({
  nueva,
  n,
  parecido,
  guia,
}: {
  nueva: PrendaNuevaDeHoja;
  n: BorradorNuevo;
  parecido: Habitual | null;
  guia: GuiaCampos;
}) {
  const categoria = nueva.categorias.find((c) => c.id === n.categoriaId) ?? null;
  const ejemplo = categoria ? sugerirNombre(categoria) : null;
  const escribeMarca = n.marcaNueva !== null;
  // Si lo escrito ya es una marca de la lista, no se crea otra: se usa esa (y se dice cuál).
  const escrita = escribeMarca ? marcaEscrita(n.marcaNueva ?? "", nueva.marcas) : undefined;
  const marcaYaEsta = escrita && !escrita.id.startsWith(MARCA_NUEVA_PREFIJO) ? escrita : null;
  return (
    <div className="space-y-4 border-b border-sand pb-4">
      <p className="text-[12.5px] leading-snug text-taupe">
        Úsala también si no la encuentras entre sus prendas o no sabes cómo la llaman en la tienda: descríbela como la conoces. Es solo una
        referencia para la compra: no se crea en el catálogo; la tienda la registra cuando la recibe, con su color y sus tallas.
      </p>
      {/* Qué es y la marca, uno bajo otro: con chips, lado a lado se partían. Los chips son lo habitual de este proveedor y «Otra…» abre
          la lista completa (maqueta mis-compras-rediseno-2026-10, Felipe 2026-10-26). */}
      <div className="grid gap-4">
        <CampoGuiado id="categoria" guia={guia} titulo="¿Qué es?">
          <ChipsConOtra
            guia="compra.categoria-nueva"
            etiqueta="¿Qué es?"
            marcadorSinChips="Elige una categoría"
            todas={nueva.categorias}
            habituales={[...nueva.suyas].filter((id) => nueva.categorias.some((c) => c.id === id))}
            valor={n.categoriaId}
            onValor={(v) => nueva.cambiar({ categoriaId: v || null })}
            opciones={opcionesCategoriaNueva(nueva.categorias, nueva.suyas)}
          />
        </CampoGuiado>
        <CampoGuiado id="marca" guia={guia} titulo="¿De qué marca?">
          {/* El «+» del final cambia la lista por una caja para escribir una marca que no está; la «×» vuelve a la lista (Felipe
              2026-10-24). La marca escrita se crea al guardar la compra, unida a este proveedor. */}
          <div className="flex items-start gap-2" data-guia="compra.marca-nueva">
            <div className="min-w-0 flex-1">
              {escribeMarca ? (
                <CampoTexto
                  caja
                  sinPie
                  autoFocus
                  etiqueta="Marca nueva"
                  maxLength={MARCA_NUEVA_MAX}
                  value={n.marcaNueva ?? ""}
                  placeholder="Como dice su etiqueta" // sugerir-fijo: una marca nueva no sale de nada elegido antes
                  onChange={(e) => nueva.cambiar({ marcaNueva: e.target.value })}
                />
              ) : (
                <ChipsConOtra
                  etiqueta="¿De qué marca?"
                  marcadorSinChips="Elige una marca"
                  todas={nueva.marcas}
                  habituales={nueva.marcasDelProveedor.map((m) => m.id)}
                  valor={n.marcaId}
                  onValor={(v) => nueva.cambiar({ marcaId: v || null })}
                  opciones={opcionesMarcaNueva(nueva.marcas, nueva.marcasDelProveedor)}
                />
              )}
            </div>
            <Boton
              type="button"
              peso="fantasma"
              className="h-10 w-10 shrink-0 px-0 max-sm:h-11 max-sm:w-11 pointer-coarse:h-11 pointer-coarse:w-11"
              aria-label={escribeMarca ? "Volver a la lista de marcas" : "Escribir una marca nueva"}
              title={escribeMarca ? "Volver a la lista de marcas" : "Escribir una marca nueva"}
              aria-pressed={escribeMarca}
              data-guia="compra.marca-mas"
              onClick={() => nueva.cambiar({ marcaNueva: escribeMarca ? null : "" })}
            >
              {escribeMarca ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            </Boton>
          </div>
          {escribeMarca && marcaYaEsta && (
            <p className="mt-1.5 text-xs text-taupe">Ya está en la lista: se usa «{marcaYaEsta.nombre}».</p>
          )}
        </CampoGuiado>
      </div>
      <CampoGuiado id="nombre" guia={guia} titulo="¿Cómo se llama?">
        <CampoTexto
          caja
          etiqueta="¿Cómo se llama?"
          maxLength={NOMBRE_NUEVO_MAX}
          value={n.nombre}
          placeholder={ejemplo ? (ejemplo.origen === "categoria" ? `Ej. ${ejemplo.texto}` : ejemplo.texto) : "Primero elige qué es"} // sugerir-fijo: sin categoría, solo pide elegirla antes
          data-guia="compra.nombre-nuevo"
          onChange={(e) => nueva.cambiar({ nombre: e.target.value })}
        />
      </CampoGuiado>
      {parecido && (
        <PreguntaParecido
          titulo={`¿Es «${parecido.nombre}»?`}
          bajada={parecido.veces > 0 ? "Ya se la compraste: para no anotarla dos veces, úsala." : "Ya le compras esa prenda a este proveedor: si es esa, úsala."}
          opciones={[{ id: parecido.clave, nombre: parecido.nombre, detalle: `${parecido.categoria}${parecido.marca ? ` · ${parecido.marca}` : ""}` }]}
          si={() => ({ texto: "Usar esa", onClick: () => nueva.usar(parecido) })}
          no={{ texto: "No, es otra", onClick: () => nueva.cambiar({ descartadas: new Set([...n.descartadas, parecido.clave]) }) }}
        />
      )}
    </div>
  );
}
