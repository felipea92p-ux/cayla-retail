"use client";

import { useId, useMemo, useState, type ReactNode, type RefObject } from "react";
import { Banknote, Palette, PenLine, Ruler, Tag } from "lucide-react";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { CampoTexto } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { IconoCategoria } from "@/components/IconoCategoria";
import { tonoDeCategoria } from "@/components/MuestraCategoria";
import { camposGuiaPrenda } from "@/lib/prenda-sin-registrar-guia";
import {
  faltaEnPrendaSinRegistrar,
  gruposDeTallas,
  opcionesDeColor,
  pasoSiguiente,
  precioEscribible,
  sugerirDescripcion,
  tallasDeCategoria,
  type DatosPrendaSinRegistrar,
  type ListasPrendaLibre,
  type OpcionColor,
  type PasoPrenda,
  type Talla,
} from "@/lib/prenda-sin-registrar-reglas";

/** El título de un campo con su ícono: la marca de la guía la pone `CampoGuiado` a la izquierda. */
function Titulo({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="text-tinta/55 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icono}
      </span>
      {children}
    </span>
  );
}

/** El control que se le da el foco al llegar a un campo: su caja, su combo o su primera talla (por `data-campo`, nunca por estilo). */
function enfocarCampo(paso: PasoPrenda | null) {
  if (!paso) return;
  const bloque = document.querySelector<HTMLElement>(`[data-campo="${paso}"]`);
  bloque?.querySelector<HTMLElement>('input:not([type="hidden"]), [role="combobox"], button[aria-haspopup], button[data-talla]')?.focus();
}

/** Las tallas que el modal ofrece para una categoría (ver `tallasDeCategoria`: si `categoria_tallas` no cargó, todas). */
const tallasDe = (listas: ListasPrendaLibre, id: string): Talla[] =>
  id ? tallasDeCategoria(listas.tallasPorCategoria?.[id], listas.tallas, listas.tallasPorCategoria !== null) : [];

/**
 * «Prenda sin registrar» (ADR-0179): lo que caja anota de una prenda que llegó a piso sin pasar por almacén.
 * Maqueta C «Etiqueta en vivo» (docs/maquetas/prenda-sin-registrar-2026-10/, Felipe 2026-10-01): a la izquierda se elige
 * categoría → talla → color → descripción → precio; a la derecha se arma la etiqueta provisional que almacén va a recibir.
 * Las tallas son SOLO las de la categoría (`categoria_tallas`): las habituales adelante, las otras más tenues y «Estándar»
 * aparte; si la categoría tiene una sola («Única»), se pone sola. La guía de foco (ADR-0284) enciende el campo que sigue.
 */
export function PrendaSinRegistrarModal({
  listas,
  onAgregar,
  onClose,
  alCerrarEnfocar,
}: {
  listas: ListasPrendaLibre;
  onAgregar: (d: DatosPrendaSinRegistrar) => void;
  onClose: () => void;
  alCerrarEnfocar: RefObject<HTMLInputElement | null>;
}) {
  const [categoriaId, setCategoriaId] = useState("");
  const [tallaId, setTallaId] = useState("");
  const [colorCodigo, setColorCodigo] = useState("");
  // La descripción se arma sola con categoría, color y talla (spike del Punto de venta, 2026-09-26): mientras la
  // colaboradora no la toque, sigue a la sugerencia; apenas escribe, es suya.
  const [descripcionEscrita, setDescripcionEscrita] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const idDescripcion = useId();
  const idPrecio = useId();

  const categoria = listas.categorias.find((c) => c.id === categoriaId) ?? null;
  const tallas = useMemo(() => tallasDe(listas, categoriaId), [categoriaId, listas]);
  const grupos = gruposDeTallas(tallas, listas.habitualesPorCategoria[categoriaId]);
  const colores = useMemo(
    () => opcionesDeColor(listas.colores, categoriaId ? listas.usoColores[categoriaId] : undefined),
    [categoriaId, listas],
  );
  const talla = tallas.find((t) => t.id === tallaId) ?? null;
  const color = colores.find((c) => c.valor === colorCodigo) ?? null;

  const sugerencia = sugerirDescripcion(categoria?.nombre ?? null, color?.texto ?? null, talla?.valor ?? null);
  const descripcion = descripcionEscrita ?? sugerencia ?? "";

  const datos: DatosPrendaSinRegistrar = { descripcion, categoriaId, tallaId, colorCodigo, precio: Number(precio) };
  const falta = faltaEnPrendaSinRegistrar(datos);
  const guia = useGuiaCampos(camposGuiaPrenda(datos));

  const opcionesCategoria = useMemo(
    () =>
      listas.categorias.map((c) => {
        const suyas = tallasDe(listas, c.id);
        const hab = gruposDeTallas(suyas, listas.habitualesPorCategoria[c.id]);
        return {
          valor: c.id,
          texto: c.nombre,
          // Lo que se ve al lado de cada categoría: sus tallas de siempre, para reconocerla de un vistazo.
          detalle: hab.unica ? `Talla ${hab.unica.valor.toLowerCase()}` : hab.habituales.map((t) => t.valor).join(" · "),
          icono: <IconoCategoria prefijo={c.prefijo} familia={c.familia} className="h-4 w-4 text-tinta/70" />,
        };
      }),
    [listas],
  );

  /** Tras elegir algo, lleva el cursor al campo que sigue (Felipe, 2026-09-25): ya no hace falta buscarlo. */
  function avanzar(cambio: Partial<DatosPrendaSinRegistrar>) {
    const d = { ...datos, ...cambio };
    // Con la descripción armándose sola, se calcula con lo recién elegido (el render todavía no pasó).
    if (descripcionEscrita === null) {
      const cat = listas.categorias.find((c) => c.id === d.categoriaId)?.nombre ?? null;
      const tal = tallasDe(listas, d.categoriaId).find((t) => t.id === d.tallaId)?.valor ?? null;
      const col = colores.find((c) => c.valor === d.colorCodigo)?.texto ?? null;
      d.descripcion = sugerirDescripcion(cat, col, tal) ?? "";
    }
    // Después del render (las tallas recién aparecen) y de que el combo devuelva el foco a su propio botón.
    requestAnimationFrame(() => requestAnimationFrame(() => enfocarCampo(pasoSiguiente(d))));
  }

  function elegirCategoria(id: string) {
    setCategoriaId(id);
    const nuevas = tallasDe(listas, id);
    // Una categoría con una sola talla («Única») la pone sola; si no, la talla elegida solo sobrevive si la nueva categoría
    // también la ofrece (Vestidos → Pantalones borra la M).
    const sola = nuevas.length === 1 ? nuevas[0]!.id : null;
    const queda = sola ?? (nuevas.some((t) => t.id === tallaId) ? tallaId : "");
    setTallaId(queda);
    avanzar({ categoriaId: id, tallaId: queda });
  }

  function elegirTalla(id: string) {
    setTallaId(id);
    avanzar({ tallaId: id });
  }

  function elegirColor(codigo: string) {
    setColorCodigo(codigo);
    avanzar({ colorCodigo: codigo });
  }

  function volverASugerencia() {
    setDescripcionEscrita(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(idDescripcion) as HTMLInputElement | null;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const agregar = () => onAgregar({ ...datos, descripcion: descripcion.trim() });

  const botonTalla = (t: Talla, menor = false, ancho = false) => (
    <button
      key={t.id}
      type="button"
      data-talla={t.valor}
      aria-pressed={tallaId === t.id}
      onClick={() => elegirTalla(t.id)}
      className={`h-10 rounded-lg border px-3 text-sm transition-colors duration-200 ease-cayla ${ancho ? "min-w-24" : "min-w-11"} ${
        tallaId === t.id
          ? "border-tinta bg-tinta text-crema"
          : menor
            ? "border-taupe/30 bg-transparent text-tinta/65 hover:border-tinta/60 hover:text-tinta"
            : "border-taupe/40 bg-hueso font-medium text-tinta hover:border-tinta/60"
      }`}
    >
      {t.valor}
    </button>
  );

  return (
    <Modal
      titulo="Prenda sin registrar"
      subtitulo="La etiqueta provisional se arma mientras eliges. Almacén la registra después con estos datos."
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
      variante="hoja"
      ancho="max-w-4xl"
    >
      {/* Una sola copia de cada pieza, ubicada por áreas: en celular la etiqueta va arriba y el botón al pie; desde md, los campos
          a la izquierda y la etiqueta con el botón a la derecha. */}
      <div className="grid gap-x-10 gap-y-5 [grid-template-areas:'etiqueta'_'campos'_'pie'] md:grid-cols-[minmax(0,1fr)_17.5rem] md:grid-rows-[auto_1fr] md:[grid-template-areas:'campos_etiqueta'_'campos_pie']">
        <div className="space-y-6 [grid-area:campos]">
          <CampoGuiado id="categoria" guia={guia} titulo={<Titulo icono={<Tag />}>Categoría</Titulo>}>
            <ComboBuscable
              valor={categoriaId}
              onValor={elegirCategoria}
              opciones={opcionesCategoria}
              marcador="Busca la categoría"
              etiquetaAccesible="Categoría"
              autoFocus
              caja
            />
          </CampoGuiado>

          <CampoGuiado
            id="talla"
            guia={guia}
            titulo={<Titulo icono={<Ruler />}>Talla</Titulo>}
            ayuda={categoria && !grupos.unica ? `Las de ${categoria.nombre.toLowerCase()}` : undefined}
          >
            {!categoria ? (
              <p className="rounded-lg bg-hueso px-3 py-2.5 text-[13px] text-tinta/60">Primero la categoría: las tallas salen de ella.</p>
            ) : grupos.unica ? (
              <p key={categoriaId} className="anim-revelar rounded-lg bg-hueso px-3 py-2.5 text-[13px] text-tinta">
                <span className="font-semibold">Talla {grupos.unica.valor.toLowerCase()}</span>
                <span className="text-tinta/70"> · {categoria.nombre} tiene una sola talla: ya quedó puesta.</span>
              </p>
            ) : (
              <div key={categoriaId} className="anim-revelar space-y-2.5" role="group" aria-label="Talla">
                <div className="flex flex-wrap gap-1.5">
                  {grupos.habituales.map((t) => botonTalla(t))}
                  {grupos.estandar && botonTalla(grupos.estandar, false, true)}
                </div>
                {grupos.otras.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-tinta/55">Otras de {categoria.nombre.toLowerCase()}</p>
                    <div className="flex flex-wrap gap-1.5">{grupos.otras.map((t) => botonTalla(t, true))}</div>
                  </div>
                )}
              </div>
            )}
          </CampoGuiado>

          <CampoGuiado id="color" guia={guia} titulo={<Titulo icono={<Palette />}>Color</Titulo>}>
            <ComboBuscable
              valor={colorCodigo}
              onValor={elegirColor}
              opciones={colores.map((c) => ({
                valor: c.valor,
                texto: c.texto,
                detalle: c.detalle,
                claves: c.claves,
                icono: <Muestra color={c} />,
              }))}
              marcador="Busca el color"
              etiquetaAccesible="Color"
              caja
            />
          </CampoGuiado>

          <CampoGuiado id="descripcion" guia={guia} titulo={<Titulo icono={<PenLine />}>Descripción corta</Titulo>}>
            <CampoTexto
              id={idDescripcion}
              caja
              etiqueta="Descripción corta"
              value={descripcion}
              onChange={(e) => setDescripcionEscrita(e.target.value)}
              // sugerir-fijo: no es un ejemplo, es la instrucción mientras falta elegir; con los tres datos el campo ya trae la descripción armada
              placeholder="Se arma sola con categoría, talla y color"
              maxLength={80}
              pie={
                descripcionEscrita === null && sugerencia ? (
                  <span className="text-tinta/65">Se armó sola con lo que elegiste. Puedes agregarle detalles.</span>
                ) : descripcionEscrita !== null && sugerencia && descripcionEscrita.trim() !== sugerencia ? (
                  <span className="flex flex-wrap items-baseline gap-x-2 text-tinta/65">
                    <span>{descripcion.trim() === "" ? "Vacía." : "Escrita por ti."}</span>
                    <button type="button" onClick={volverASugerencia} className="btn-cayla btn-enlace">
                      Usar «{sugerencia}»
                    </button>
                  </span>
                ) : null
              }
            />
          </CampoGuiado>

          {/* Un campo de verdad en vez del teclado de pantalla (spike 2026-09-26): en escritorio se escribe con el teclado
              y Enter agrega; en el teléfono `inputMode="decimal"` abre el teclado numérico del propio celular. */}
          <CampoGuiado id="precio" guia={guia}>
            <label htmlFor={idPrecio} className="card-cayla flex items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4">
              <span className="whitespace-nowrap text-[13px] font-semibold text-tinta">{guia.etiqueta("precio", <Titulo icono={<Banknote />}>Precio cobrado</Titulo>)}</span>
              <span className="flex items-baseline gap-1 font-display text-3xl text-tinta">
                S/
                <input
                  id={idPrecio}
                  value={precio}
                  onChange={(e) => setPrecio(precioEscribible(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && falta === null) {
                      e.preventDefault();
                      agregar();
                    }
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                  // sugerir-fijo: el formato de un monto en soles, no depende de nada elegido antes
                  placeholder="0.00"
                  aria-label="Precio cobrado en soles"
                  className="w-20 rounded-md bg-transparent text-right outline-none placeholder:text-tinta/30 sm:w-28"
                />
              </span>
            </label>
          </CampoGuiado>
        </div>

        <div className="[grid-area:etiqueta]">
          <EtiquetaPrevia
            categoria={categoria}
            talla={talla?.valor ?? null}
            color={color}
            precio={Number(precio)}
            descripcion={falta === null ? descripcion.trim() : null}
            lista={falta === null}
          />
        </div>

        <div className="[grid-area:pie] md:self-start">
          <PieGuia guia={guia} listo="Lista para el ticket. Enter en el precio también la agrega." />
          <button
            type="button"
            onClick={agregar}
            disabled={falta !== null}
            title={guia.frase ?? undefined}
            className={`${botonPrimario} mt-3 w-full ${guia.claseConfirmar}`}
          >
            Agregar al ticket
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** La muestra de un color de prenda: es un dato del vocabulario (su hex), no la paleta de la interfaz. Sin hex (estampado,
 *  multicolor), un damero en tokens. */
function Muestra({ color, className = "h-3 w-3" }: { color: Pick<OpcionColor, "hex">; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border border-tinta/20 ${className} ${color.hex ? "" : "bg-[conic-gradient(var(--color-hueso)_0_25%,var(--color-sand)_0_50%,var(--color-hueso)_0_75%,var(--color-sand)_0)]"}`}
      style={color.hex ? { backgroundColor: color.hex } : undefined}
    />
  );
}

/**
 * La etiqueta provisional: lo que almacén va a recibir, armándose con cada elección. Cada dato entra con `anim-revelar` (una
 * respuesta a la acción, ADR-0136: 240 ms, sin rebote, apagada con movimiento reducido) y el ícono de la categoría se asienta;
 * con todo listo el borde pasa a verde. En celular es una franja arriba; desde md, la etiqueta colgada a la derecha.
 */
function EtiquetaPrevia({
  categoria,
  talla,
  color,
  precio,
  descripcion,
  lista,
}: {
  categoria: ListasPrendaLibre["categorias"][number] | null;
  talla: string | null;
  color: OpcionColor | null;
  precio: number;
  descripcion: string | null;
  lista: boolean;
}) {
  const tono = categoria ? tonoDeCategoria(categoria.familia) : null;
  const vacio = "text-tinta/30";
  const lineaColor = color ? (
    <span key={color.valor} className="anim-revelar inline-flex items-center gap-1.5">
      <Muestra color={color} className="h-3.5 w-3.5" />
      {color.texto}
    </span>
  ) : (
    <span className={vacio}>Color</span>
  );
  const textoPrecio = precio > 0 ? `S/ ${precio.toFixed(2)}` : "S/ 0.00";

  return (
    <div
      aria-label="Etiqueta provisional"
      className={`relative flex items-center gap-3 rounded-2xl border bg-crema p-3 transition-colors duration-300 ease-cayla md:flex-col md:gap-0 md:px-5 md:pb-5 md:pt-9 md:text-center ${
        lista ? "border-verde/50" : "border-sand"
      }`}
    >
      {/* El ojal de la etiqueta. */}
      <span aria-hidden className="absolute left-1/2 top-3 hidden h-3 w-3 -translate-x-1/2 rounded-full border border-sand bg-papel md:block" />

      <span
        key={categoria?.id ?? "vacia"}
        aria-hidden
        className={`anim-asentar grid h-11 w-11 shrink-0 place-items-center rounded-full md:mb-3 md:h-16 md:w-16 ${categoria ? "" : "border border-dashed border-tinta/20 text-tinta/25"}`}
        style={tono ? { backgroundColor: tono.fondo, color: tono.acento } : undefined}
      >
        <IconoCategoria prefijo={categoria?.prefijo} familia={categoria?.familia ?? null} className="h-6 w-6 md:h-8 md:w-8" />
      </span>

      <div className="min-w-0 flex-1 md:w-full md:flex-none">
        <p className="truncate text-[11px] uppercase tracking-[0.14em] text-tinta/60">
          {categoria ? (
            <span key={categoria.id} className="anim-revelar inline-block">
              {categoria.nombre}
            </span>
          ) : (
            <span className={vacio}>Categoría</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-tinta md:hidden">{lineaColor}</p>
      </div>

      <p className={`font-display leading-none text-tinta md:my-2 ${talla && talla.length > 3 ? "text-2xl md:text-4xl" : "text-3xl md:text-6xl"}`}>
        {talla ? (
          <span key={talla} className="anim-revelar inline-block">
            {talla}
          </span>
        ) : (
          <span className={vacio}>—</span>
        )}
      </p>

      <p className="hidden min-h-5 items-center justify-center text-[13px] text-tinta md:flex">{lineaColor}</p>

      <p className={`font-display text-xl md:mt-3 md:w-full md:border-t md:border-dashed md:border-sand md:pt-3 md:text-3xl ${precio > 0 ? "text-tinta" : vacio}`}>
        {textoPrecio}
      </p>

      {descripcion && (
        <p key={descripcion} className="anim-revelar mt-2 hidden text-[12px] leading-snug text-tinta/65 md:block">
          «{descripcion}»
        </p>
      )}
    </div>
  );
}
