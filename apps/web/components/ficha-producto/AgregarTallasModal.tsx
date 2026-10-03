"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { construirCeldas } from "@/lib/alta-producto";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import {
  clasificarCombinaciones,
  coloresParaAgregarTalla,
  ejesDeLaPrenda,
  NACEN_EN_CERO_CARGABLES,
  NACEN_SIN_UNIDADES,
  nombreVariante,
  precioYCostoPorDefecto,
  type FilaFicha,
  type Identidad,
} from "@/lib/variantes-ficha-reglas";
import { MatrizNuevas, MontosNuevas, PieModal, type ContextoFicha } from "./piezas";

// «Llegó una talla nueva»: las tallas habilitadas en la categoría que la prenda todavía no vende, en su orden (S, M, L…
// y no alfabético). Cada talla elegida nace en cada color que la prenda ya vende (si están todas desactivadas, en los que
// tuvo: nunca nace «Sin color» por accidente) y que sigue activo en el vocabulario —la base no crea una variante en un
// color inactivo—; la tabla lo muestra antes y deja quitar una celda. Una combinación que existía desactivada vuelve a
// venderse en vez de duplicarse.

export function AgregarTallasModal({
  ctx,
  filas,
  tallas,
  categoriaNombre,
  etiquetasTexto,
  onConfirmar,
  onClose,
}: {
  ctx: ContextoFicha;
  filas: FilaFicha[];
  /** Las tallas habilitadas en la categoría, ya ordenadas. */
  tallas: ValorVocabulario[];
  categoriaNombre?: string;
  etiquetasTexto: string | null;
  onConfirmar: (r: { combos: Identidad[]; precio: string; costo: string }) => void;
  onClose: () => void;
}) {
  const n = ctx.nombres;
  const ejes = ejesDeLaPrenda(filas, n);
  const disponibles = tallas.filter((t) => !ejes.tallas.includes(t.id));
  const ref = coloresParaAgregarTalla(
    filas,
    n,
    ctx.colores.map((c) => c.codigo),
  );
  const coloresDeLaPrenda = ref.colores;
  // Con color pero ninguno activo en el vocabulario (o sin variantes), no hay en qué color nacer: nada que armar.
  const sinDondeNacer = !ref.sinColor && coloresDeLaPrenda.length === 0;
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [montos] = useState(() => precioYCostoPorDefecto(filas));
  const [precio, setPrecio] = useState(montos.precio);
  const [costo, setCosto] = useState(montos.costo);

  const tallasOrdenadas = disponibles.filter((t) => elegidas.includes(t.id));
  const celdas = tallasOrdenadas.length === 0 || sinDondeNacer ? [] : construirCeldas(tallasOrdenadas.map((t) => t.id), coloresDeLaPrenda);
  const combos: Identidad[] = celdas.filter((c) => !excluidas.has(c.clave)).map((c) => ({ colorCodigo: c.color, tallaId: c.tallaId }));
  const clasificadas = clasificarCombinaciones(filas, combos);
  const nacen = clasificadas.filter((c) => c.queHace === "nueva").length;
  const vuelven = clasificadas.filter((c) => c.queHace === "reactiva");
  const precioOk = Number(precio) > 0;
  const colores = coloresDeLaPrenda.map((c) => ctx.colores.find((x) => x.codigo === c) ?? { codigo: c, nombre: n.color(c), hex: null, familiaColor: null });

  return (
    <Modal titulo="Agregar talla" subtitulo="Llegó una talla que la prenda no tenía" onClose={onClose} ancho="max-w-2xl">
      {(cerrar) => (
        <div className="space-y-5">
          {disponibles.length === 0 ? (
            <p className="text-sm text-tinta/80">
              Esta prenda ya tiene todas las tallas habilitadas en {categoriaNombre ?? "su categoría"}. Para ofrecer otra, habilítala primero en Catálogo → Categorías.
            </p>
          ) : (
            <section className="space-y-1.5">
              <p className="text-[12.5px] font-semibold text-tinta">Las tallas que llegaron</p>
              <div className="flex flex-wrap gap-1.5">
                {disponibles.map((t) => (
                  <ChipOpcion
                    key={t.id}
                    elegido={elegidas.includes(t.id)}
                    onClick={() => setElegidas((a) => (a.includes(t.id) ? a.filter((x) => x !== t.id) : [...a, t.id]))}
                    className="min-w-11 justify-center tabular-nums"
                  >
                    {t.texto}
                  </ChipOpcion>
                ))}
              </div>
              <p className="text-[12.5px] text-taupe">
                {coloresDeLaPrenda.length > 0
                  ? ref.deDesactivadas
                    ? `Todas sus variantes están desactivadas: cada talla nace en los colores que tuvo (${coloresDeLaPrenda.map((c) => n.color(c)).join(", ")}).`
                    : `Cada talla nace en los colores que ya vende la prenda (${coloresDeLaPrenda.map((c) => n.color(c)).join(", ")}).`
                  : ref.sinColor
                    ? "La prenda es «Sin color»: cada talla nace sin color, como las que ya tiene."
                    : ref.inactivos.length > 0
                      ? "Ninguno de sus colores sigue activo en el vocabulario: no hay en qué color crear la talla."
                      : "La prenda todavía no tiene colores: empieza por «Agregar color»."}
              </p>
              {ref.inactivos.length > 0 && coloresDeLaPrenda.length > 0 && (
                <p className="text-[12.5px] text-taupe">
                  {ref.inactivos.map((c) => n.color(c)).join(", ")} ya no {ref.inactivos.length === 1 ? "está activo" : "están activos"} en el vocabulario de
                  colores: ahí no nace.
                </p>
              )}
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
                colores={colores.map((c) => c.codigo)}
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

          {nacen > 0 && <p className="text-[12.5px] font-medium text-tinta">{ctx.ajusteStock ? NACEN_EN_CERO_CARGABLES : NACEN_SIN_UNIDADES}</p>}
          <p className="text-[12.5px] text-taupe">Nada se guarda todavía: se suma a la ficha y se guarda con «Revisar y guardar».</p>
          <PieModal
            onCancelar={cerrar}
            texto={combos.length === 0 ? "Agregar" : `Agregar ${combos.length} ${combos.length === 1 ? "variante" : "variantes"}`}
            deshabilitado={combos.length === 0 || (nacen > 0 && !precioOk)}
            onConfirmar={() => {
              onConfirmar({ combos, precio, costo });
              cerrar();
            }}
          />
        </div>
      )}
    </Modal>
  );
}
