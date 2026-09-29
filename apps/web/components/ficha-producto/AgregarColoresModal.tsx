"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { AvisoInline, ChipOpcion } from "@/components/alta-producto/piezas";
import { construirCeldas, ordenarColores, type ColorAlta } from "@/lib/alta-producto";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { FAMILIAS_COLOR } from "@/lib/colores-familias";
import {
  bloqueoPorVenta,
  choqueDeCorreccion,
  clasificarCombinaciones,
  corregir,
  ejesDeLaPrenda,
  ejesDeReferencia,
  filasDelEje,
  NACEN_SIN_UNIDADES,
  nombreVariante,
  precioYCostoPorDefecto,
  tallasParaAgregarColor,
  textoChoque,
  textoTallasApagadas,
  unidadesEnStock,
  vistaPreviaCorreccion,
  type FilaFicha,
  type Identidad,
} from "@/lib/variantes-ficha-reglas";
import { ElegirUnColor, MatrizNuevas, MontosNuevas, PieModal, VistaPreviaCodigos, type ContextoFicha } from "./piezas";

// «Llegó un color nuevo» (Shopify «Add another value», mostrando ANTES las combinaciones y dejando desmarcar, como
// Lightspeed X-Series): se eligen los colores como en el alta (ElegirColores: los más usados en la categoría, el buscador
// con sinónimos y la paleta), las tallas que ya vende la prenda vienen marcadas —solo las que su categoría habilita hoy:
// las demás se ven apagadas con su porqué, porque la base rechazaría el guardado entero—, y la tabla talla × color muestra
// qué va a nacer; una celda se toca para quitarla. Una combinación que ya existía desactivada no se duplica: vuelve a
// venderse. Si la prenda tiene todas sus variantes desactivadas, las tallas salen de todas ellas (nunca nace una «Única»
// por accidente).
//
// Si la prenda hoy es «Sin color», primero pregunta de qué color son las que ya tiene (una corrección, con su vista
// previa de códigos): una prenda nunca mezcla «Sin color» con colores (la base lo rechaza con `mezcla_sin_color`).

export type ResultadoAgregarColores = {
  /** Si la prenda era «Sin color»: el color de las que ya tiene (se corrigen). */
  colorDeLasQueTiene: string | null;
  combos: Identidad[];
  precio: string;
  costo: string;
};

export function AgregarColoresModal({
  ctx,
  filas,
  tallas,
  categoriaNombre,
  etiquetasTexto,
  onColorCreado,
  onConfirmar,
  onClose,
}: {
  ctx: ContextoFicha;
  filas: FilaFicha[];
  /** Las tallas habilitadas HOY en la categoría elegida, ya ordenadas: una variante nueva solo nace en una de ellas. */
  tallas: ValorVocabulario[];
  categoriaNombre?: string;
  /** Los nombres de las etiquetas con que nacen las nuevas (las que tienen todas las activas), o null. */
  etiquetasTexto: string | null;
  /** Un color creado aquí mismo (ElegirColores deja crearlo si no existe): la ficha lo suma a su vocabulario. */
  onColorCreado: (color: ColorAlta) => void;
  onConfirmar: (r: ResultadoAgregarColores) => void;
  onClose: () => void;
}) {
  const n = ctx.nombres;
  const ejes = ejesDeLaPrenda(filas, n);
  // La prenda hoy vende solo «Sin color»: antes de sumarle colores, las que tiene necesitan el suyo.
  const eraSinColor = ejes.colores.length === 1 && ejes.colores[0] === null;
  const sinColor = eraSinColor ? filasDelEje(filas, "color", null) : [];
  const clavesSinColor = sinColor.map((f) => f.clave);

  // Ponerles color a las «Sin color» es corregirlas: sin la función de la base, no se puede.
  const noSePuedeCorregir = eraSinColor && !ctx.puedeCorregir;

  const [colorDeLasQueTiene, setColorDeLasQueTiene] = useState("");
  const [nuevos, setNuevos] = useState<string[]>([]);
  const tallasDeLaPrenda = tallasParaAgregarColor(filas, n, tallas);
  const apagadas = tallasDeLaPrenda.filter((t) => !t.habilitada).map((t) => t.id);
  const [tallasElegidas, setTallasElegidas] = useState<string[]>(() => tallasDeLaPrenda.filter((t) => t.habilitada).map((t) => t.id));
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [montos] = useState(() => precioYCostoPorDefecto(filas));
  const [precio, setPrecio] = useState(montos.precio);
  const [costo, setCosto] = useState(montos.costo);

  // Paso 1 (solo si era «Sin color»): la corrección de las que ya tiene.
  const destinoPrimero = colorDeLasQueTiene ? { colorCodigo: colorDeLasQueTiene } : null;
  const bloqueo = eraSinColor ? bloqueoPorVenta(sinColor, ctx.estado, ctx.esLider, n) : null;
  const choque = destinoPrimero ? choqueDeCorreccion(filas, clavesSinColor, destinoPrimero) : null;
  const vista = destinoPrimero && !choque ? vistaPreviaCorreccion(filas, clavesSinColor, destinoPrimero, ctx.codigoProducto, n) : [];
  const base = destinoPrimero ? corregir(filas, clavesSinColor, destinoPrimero) : filas;

  // Paso 2: los colores nuevos. No se ofrecen los que la prenda ya vende (ni el que se acaba de elegir arriba).
  const yaVende = new Set(ejesDeLaPrenda(base, n).colores);
  // ~65 colores: ordenarlos en cada pintada cuesta nada (y un `useMemo` sobre un Set nuevo no ahorraría nada).
  const disponibles = ctx.colores.filter((c) => !yaVende.has(c.codigo));
  // Sin «los más usados» (ADR-0260: la carta de colores del alta va abierta de entrada, por familia).
  const { grupos } = ordenarColores(disponibles, {}, FAMILIAS_COLOR);

  const tallasOrdenadas = tallasDeLaPrenda.filter((t) => t.habilitada && tallasElegidas.includes(t.id)).map((t) => ({ id: t.id, texto: n.talla(t.id) }));
  // Sin colores elegidos no hay nada que crear; con la prenda con tallas y ninguna marcada, tampoco (no nacen «sin talla»).
  const celdas = nuevos.length === 0 || (tallasDeLaPrenda.length > 0 && tallasOrdenadas.length === 0) ? [] : construirCeldas(tallasOrdenadas.map((t) => t.id), nuevos);
  const combos: Identidad[] = celdas.filter((c) => !excluidas.has(c.clave)).map((c) => ({ colorCodigo: c.color, tallaId: c.tallaId }));
  const clasificadas = clasificarCombinaciones(base, combos);
  const nacen = clasificadas.filter((c) => c.queHace === "nueva").length;
  const vuelven = clasificadas.filter((c) => c.queHace === "reactiva");
  const precioOk = Number(precio) > 0;

  const faltaPrimero = eraSinColor && !colorDeLasQueTiene;
  const puede = !noSePuedeCorregir && !faltaPrimero && !choque && !bloqueo && (combos.length > 0 || !!destinoPrimero) && (nacen === 0 || precioOk);
  // Sin colores nuevos, en una prenda «Sin color» lo único que hace es darles color a las que ya tiene: eso es corregir (se
  // registraron sin color). En una prenda con colores, sin elegir nada todavía, el botón dice lo que hará: agregar.
  const texto =
    combos.length > 0
      ? `Agregar ${combos.length} ${combos.length === 1 ? "variante" : "variantes"}`
      : destinoPrimero
        ? "Corregir el color"
        : "Agregar color";
  const tallasDeDesactivadas = ejesDeReferencia(filas, n).deDesactivadas && tallasDeLaPrenda.length > 0;
  const unidades = unidadesEnStock(sinColor, ctx.estado);

  function alternarColor(codigo: string) {
    setNuevos((a) => (a.includes(codigo) ? a.filter((c) => c !== codigo) : [...a, codigo]));
  }

  return (
    <Modal titulo="Agregar color" subtitulo="Llegó un color que la prenda no tenía" onClose={onClose} ancho="max-w-2xl">
      {(cerrar) => (
        <div className="space-y-5">
          {eraSinColor && (
            <section className="space-y-2">
              <p className="text-[12.5px] font-semibold text-tinta">1 · ¿De qué color son las que ya tienes?</p>
              <p className="text-[12.5px] text-taupe">
                Hoy {sinColor.length === 1 ? "su variante es" : `sus ${sinColor.length} variantes son`} «Sin color»
                {unidades ? ` (${unidades} u.)` : ""}. Una prenda no mezcla «Sin color» con colores: dales primero el suyo. Conservan su stock y su
                historia.
              </p>
              {noSePuedeCorregir ? (
                <AvisoInline tono="ambar">
                  Corregir el color todavía no está disponible, y sin eso no se le pueden sumar colores a una prenda «Sin color».
                </AvisoInline>
              ) : (
                <ElegirUnColor
                  valor={colorDeLasQueTiene}
                  onValor={(c) => {
                    setColorDeLasQueTiene(c);
                    setNuevos((a) => a.filter((x) => x !== c));
                  }}
                  colores={ctx.colores}
                  ofrecerSinColor={false}
                  etiqueta="Color de las que ya tienes"
                />
              )}
              {bloqueo && (
                <AvisoInline tono="ambar" alerta>
                  {bloqueo}
                </AvisoInline>
              )}
              {choque && destinoPrimero && (
                <AvisoInline tono="rojo" alerta>
                  {textoChoque(choque, destinoPrimero, filas, ctx)}
                </AvisoInline>
              )}
              <VistaPreviaCodigos filas={vista} />
            </section>
          )}

          <section className="space-y-2">
            <p className="text-[12.5px] font-semibold text-tinta">{eraSinColor ? "2 · Los colores que llegaron" : "Los colores que llegaron"}</p>
            <ElegirColores
              colores={disponibles}
              grupos={grupos}
              elegidos={nuevos}
              onAlternar={alternarColor}
              onCreado={(color) => {
                // Como en el alta: el color recién creado se suma al vocabulario de la ficha y queda elegido.
                onColorCreado(color);
                setNuevos((a) => (a.includes(color.codigo) ? a : [...a, color.codigo]));
              }}
            />
          </section>

          {tallasDeLaPrenda.length > 0 && (
            <section className="space-y-1.5">
              <p className="text-[12.5px] font-semibold text-tinta">En qué tallas</p>
              <div className="flex flex-wrap gap-1.5">
                {tallasDeLaPrenda.map((t) => (
                  <ChipOpcion
                    key={t.id}
                    elegido={t.habilitada && tallasElegidas.includes(t.id)}
                    disabled={!t.habilitada}
                    onClick={() => setTallasElegidas((a) => (a.includes(t.id) ? a.filter((x) => x !== t.id) : [...a, t.id]))}
                    className="min-w-11 justify-center tabular-nums"
                  >
                    {n.talla(t.id)}
                  </ChipOpcion>
                ))}
              </div>
              {apagadas.length > 0 && <p className="text-[12.5px] text-taupe">{textoTallasApagadas(apagadas, n, categoriaNombre)}</p>}
              {tallasDeDesactivadas && <p className="text-[12.5px] text-taupe">Todas sus variantes están desactivadas: se proponen las tallas que tuvo.</p>}
            </section>
          )}

          {celdas.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm">
                <b className="tabular-nums">{combos.length}</b>{" "}
                <span className="text-taupe">{combos.length === 1 ? "variante" : "variantes"} · toca una celda para quitarla</span>
              </p>
              <MatrizNuevas
                celdas={celdas}
                tallas={tallasOrdenadas}
                colores={nuevos}
                excluidas={excluidas}
                onExcluidas={setExcluidas}
                nombreColor={n.color}
              />
              {vuelven.length > 0 && (
                <p className="text-[12.5px] text-taupe">
                  {vuelven.map((c) => nombreVariante(c, n)).join(", ")} ya {vuelven.length === 1 ? "existía desactivada: vuelve" : "existían desactivadas: vuelven"} a
                  venderse (no se crea otra).
                </p>
              )}
              {nacen > 0 && <MontosNuevas precio={precio} costo={costo} onPrecio={setPrecio} onCosto={setCosto} veCosto={ctx.veCosto} />}
              {nacen > 0 && !precioOk && <p className="text-[12.5px] text-rojo-profundo">Pon el precio de venta de las nuevas.</p>}
              {nacen > 0 && etiquetasTexto && (
                <p className="text-[12.5px] text-taupe">Nacen con las etiquetas que tienen todas las activas ({etiquetasTexto}); se pueden cambiar en cada fila.</p>
              )}
            </section>
          )}

          {faltaPrimero && nuevos.length > 0 && <p className="text-[12.5px] text-ambar-profundo">Primero di de qué color son las que ya tienes (arriba).</p>}

          {nacen > 0 && <p className="text-[12.5px] font-medium text-tinta">{NACEN_SIN_UNIDADES}</p>}
          <p className="text-[12.5px] text-taupe">Nada se guarda todavía: se suma a la ficha y se guarda con «Revisar y guardar».</p>
          <PieModal
            onCancelar={cerrar}
            texto={texto}
            deshabilitado={!puede}
            onConfirmar={() => {
              onConfirmar({ colorDeLasQueTiene: colorDeLasQueTiene || null, combos, precio, costo });
              cerrar();
            }}
          />
        </div>
      )}
    </Modal>
  );
}
