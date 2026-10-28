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
  llaveDeUnidades,
  NACEN_SIN_UNIDADES,
  nombreVariante,
  precioValido,
  precioYCostoPorDefecto,
  type FilaFicha,
  type Identidad,
} from "@/lib/variantes-ficha-reglas";
import { MatrizNuevas, MontosNuevas, PieModal, PuntoColor, type ContextoFicha } from "./piezas";
import { Aviso } from "@/components/ui/Aviso";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { camposDeAgregarVariante } from "@/lib/agregar-variantes-guia";
import { numeroDeLaSede, PasosDeAgregar, UnidadesDeLasNuevas, VistaPreviaDeLaTabla, YaEstan, type FilaDeVistaPrevia } from "./UnidadesDePartida";
import { numeroDeMonto } from "@/lib/monto-plata-reglas";

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
  admitePrecioCero = false,
}: {
  ctx: ContextoFicha;
  filas: FilaFicha[];
  /** Las tallas habilitadas en la categoría, ya ordenadas. */
  tallas: ValorVocabulario[];
  categoriaNombre?: string;
  etiquetasTexto: string | null;
  onConfirmar: (r: { combos: Identidad[]; precio: string; costo: string; unidades: Record<string, number> }) => void;
  onClose: () => void;
  /** La categoría elegida es de Empaque (fuera de los motores, ADR-0377): las nuevas pueden nacer a S/ 0.00 (la bolsa de obsequio). */
  admitePrecioCero?: boolean;
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
  const precioOk = precio.trim() !== "" && precioValido(numeroDeMonto(precio), admitePrecioCero);
  const colores = coloresDeLaPrenda.map((c) => ctx.colores.find((x) => x.codigo === c) ?? { codigo: c, nombre: n.color(c), hex: null, familiaColor: null });

  // Con cuántas unidades nace cada variante (ADR-0494): la única ocasión en que se escribe stock desde Editar producto.
  const puedeCargar = !!ctx.ajusteStock;
  const [porVariante, setPorVariante] = useState<Record<string, number>>({});
  const nuevasCombos = clasificadas.filter((c) => c.queHace === "nueva");
  const unidadesDe = (color: string | null, talla: string | null) => porVariante[llaveDeUnidades({ colorCodigo: color, tallaId: talla })] ?? 0;
  const totalUnidades = nuevasCombos.reduce((s, c) => s + unidadesDe(c.colorCodigo, c.tallaId), 0);
  const filasDeColores: (string | null)[] = coloresDeLaPrenda.length > 0 ? coloresDeLaPrenda : [null];
  const guia = useGuiaCampos(
    camposDeAgregarVariante({ que: "talla", elegidos: combos.length > 0 ? elegidas.length : 0, nacen, precioOk, puedeCargar, unidades: totalUnidades })
  );
  // «Así quedará en la tabla»: la columna nueva, en ámbar y con sus unidades, junto a lo que ya hay.
  const columnasVista = [
    ...ejes.tallas.map((t) => ({ id: t, texto: n.talla(t) || "Única", nueva: false })),
    ...tallasOrdenadas.map((t) => ({ id: t.id as string | null, texto: t.texto, nueva: true })),
  ];
  const filasDeVista: FilaDeVistaPrevia[] = ejes.colores.map((c) => ({
    nombre: n.color(c),
    punto: <PuntoColor codigo={c} colores={ctx.colores} />,
    nueva: false,
    celdas: columnasVista.map((col) => {
      if (!col.nueva) {
        const f = filas.find((x) => x.activo && x.colorCodigo === c && x.tallaId === col.id);
        return { texto: f ? numeroDeLaSede(f, ctx) : "—", nueva: false };
      }
      const nace = nuevasCombos.some((x) => x.colorCodigo === c && x.tallaId === col.id);
      return { texto: nace ? String(unidadesDe(c, col.id)) : "—", nueva: nace };
    }),
  }));

  return (
    <Modal titulo="Agregar talla" subtitulo="Llegó una talla que la prenda no tenía" onClose={onClose} tamano="ancha">
      {(cerrar) => (
        <div data-guia="agregar-talla.cuerpo" className="space-y-5">
          <PasosDeAgregar primero="Elige la talla" segundo={puedeCargar ? "Unidades de partida" : "Cómo nacen"} hechoPrimero={combos.length > 0 && elegidas.length > 0} />
          {disponibles.length === 0 ? (
            <p className="text-sm text-tinta/80">
              Esta prenda ya tiene todas las tallas habilitadas en {categoriaNombre ?? "su categoría"}. Para ofrecer otra, habilítala primero en Catálogo → Categorías.
            </p>
          ) : (
            <section className="space-y-1.5">
              <CampoGuiado id="elegidos" guia={guia} retiene="fila" titulo="Las tallas que llegaron">
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
              </CampoGuiado>
              <YaEstan titulo="Ya están en esta prenda" items={ejes.tallas.map((t) => ({ clave: t ?? "unica", texto: n.talla(t) || "Única" }))} />
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
              {nacen > 0 && (
                <CampoGuiado id="precio" guia={guia}>
                  <MontosNuevas precio={precio} costo={costo} onPrecio={setPrecio} onCosto={setCosto} veCosto={ctx.veCosto} />
                </CampoGuiado>
              )}
              {nacen > 0 && !precioOk && (
                <Aviso tono="error" chico>
                  Pon el precio de venta de las nuevas.
                </Aviso>
              )}
              {nacen > 0 && etiquetasTexto && (
                <p className="text-[12.5px] text-taupe">Nacen con las etiquetas que tienen todas las activas ({etiquetasTexto}); se pueden cambiar en cada fila.</p>
              )}
            </section>
          )}

          {/* ADR-0494: con cuántas unidades NACE cada variante; se sella al guardar y después solo se ajusta en Existencias. */}
          {nacen > 0 && puedeCargar && (
            <section data-guia="agregar-talla.unidades" className="space-y-2">
              <CampoGuiado id="unidades" guia={guia} titulo="¿Con cuántas unidades nacen?" ayuda="Es la única vez que se escriben aquí: después, el stock se ajusta en Existencias.">
                <UnidadesDeLasNuevas
                  filas={filasDeColores.map((c) => ({ id: c, nombre: n.color(c), punto: <PuntoColor codigo={c} colores={ctx.colores} /> }))}
                  columnas={tallasOrdenadas.map((t) => ({ id: t.id as string | null, texto: t.texto }))}
                  incluida={(c, t) => nuevasCombos.some((x) => x.colorCodigo === c && x.tallaId === t)}
                  valor={unidadesDe}
                  onFijar={(c, t, v) => setPorVariante((a) => ({ ...a, [llaveDeUnidades({ colorCodigo: c, tallaId: t })]: v }))}
                  onPaso={(c, t, p) => setPorVariante((a) => { const k = llaveDeUnidades({ colorCodigo: c, tallaId: t }); return { ...a, [k]: Math.min(9999, Math.max(0, (a[k] ?? 0) + p)) }; })}
                  onTodas={() => setPorVariante((a) => Object.fromEntries([...nuevasCombos.map((c) => llaveDeUnidades(c)), ...Object.keys(a)].map((k) => [k, Math.min(9999, (a[k] ?? 0) + 1)])))}
                  onCeros={() => setPorVariante({})}
                  total={totalUnidades}
                />
              </CampoGuiado>
            </section>
          )}
          {nacen > 0 && !puedeCargar && <p className="text-[12.5px] font-medium text-tinta">{NACEN_SIN_UNIDADES}</p>}
          {celdas.length > 0 && (
            <section data-guia="agregar-talla.vista-previa" className="space-y-2">
              <p className="text-[12.5px] font-semibold text-tinta">Así quedará en la tabla</p>
              <VistaPreviaDeLaTabla columnas={columnasVista} filas={filasDeVista} />
            </section>
          )}
          <p className="text-[12.5px] text-taupe">Nada se guarda todavía: se suma a la ficha y se guarda con «Revisar y guardar».</p>
          <PieGuia guia={guia} listo={puedeCargar && nacen > 0 && totalUnidades > 0 ? `Listo: ${totalUnidades} ${totalUnidades === 1 ? "unidad" : "unidades"} de partida.` : "Todo listo."} />
          <PieModal
            onCancelar={cerrar}
            texto={combos.length === 0 ? "Agregar" : `Agregar ${combos.length} ${combos.length === 1 ? "variante" : "variantes"}`}
            deshabilitado={combos.length === 0 || (nacen > 0 && !precioOk)}
            onConfirmar={() => {
              onConfirmar({ combos, precio, costo, unidades: puedeCargar ? porVariante : {} });
              cerrar();
            }}
          />
        </div>
      )}
    </Modal>
  );
}
