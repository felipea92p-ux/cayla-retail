"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { Campo, CampoTexto, Desplegable } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import {
  FALTA_DESCRIPCION,
  faltaEnPrendaSinRegistrar,
  opcionesDeColor,
  pasoSiguiente,
  precioEscribible,
  sugerirDescripcion,
  tallasDeCategoria,
  type DatosPrendaSinRegistrar,
  type ListasPrendaLibre,
} from "@/lib/prenda-sin-registrar-reglas";

/** La etiqueta del paso que toca se enciende en rojo: es la ruta que el modal le marca a la colaboradora. */
function Etiqueta({ texto, toca }: { texto: string; toca: boolean }) {
  return <span className={`transition-colors duration-300 ease-cayla ${toca ? "text-rojo" : ""}`}>{texto}</span>;
}

/**
 * «Prenda sin registrar» (ADR-0179): lo que caja anota de una prenda que llegó a piso sin pasar por almacén.
 * Primero categoría → talla (solo las de esa categoría, `categoria_tallas`) → color (los usados en esa categoría
 * arriba, como en «Nuevo producto»); con los tres, se propone la descripción («Pantalones · Negro · Talla 28») y la
 * colaboradora la usa (y le agrega lo que quiera), o simplemente escribe la suya: la sugerencia vive bajo el campo
 * solo mientras está vacío (Felipe, 2026-09-23; sin «Descartar» desde 2026-09-25).
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
  // colaboradora no la toque, sigue a la sugerencia; apenas escribe, es suya. Antes el campo arrancaba vacío y en rojo
  // aunque la sugerencia ya estuviera debajo, a un toque de «Usar».
  const [descripcionEscrita, setDescripcionEscrita] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const idTalla = useId();
  const idCategoria = useId();
  const idColor = useId();
  const idColorCampo = useId();
  const idDescripcion = useId();
  const idPrecio = useId();

  const categoria = listas.categorias.find((c) => c.id === categoriaId) ?? null;
  const tallas = useMemo(
    () => (categoriaId ? tallasDeCategoria(listas.tallasPorCategoria[categoriaId], listas.tallas) : []),
    [categoriaId, listas],
  );
  const colores = useMemo(
    () => opcionesDeColor(listas.colores, categoriaId ? listas.usoColores[categoriaId] : undefined),
    [categoriaId, listas],
  );
  const talla = tallas.find((t) => t.id === tallaId) ?? null;
  const color = colores.find((c) => c.valor === colorCodigo) ?? null;

  const sugerencia = sugerirDescripcion(categoria?.nombre ?? null, color?.texto ?? null, talla?.valor ?? null);
  const descripcion = descripcionEscrita ?? sugerencia ?? "";
  const setDescripcion = (v: string) => setDescripcionEscrita(v);
  // Lo de la descripción se dice bajo su campo y solo mientras está vacío: al empezar a escribir se van aviso y
  // sugerencia, y si lo vacían vuelven (Felipe, 2026-09-25). El pie del modal pregunta solo por el resto.
  const descripcionVacia = descripcion.trim() === "";

  const datos: DatosPrendaSinRegistrar = { descripcion, categoriaId, tallaId, colorCodigo, precio: Number(precio) };
  const falta = faltaEnPrendaSinRegistrar(datos);
  const faltaAlPie = faltaEnPrendaSinRegistrar(datos, { sinDescripcion: true });
  // El paso que toca: su etiqueta se enciende, y al cerrar el anterior el cursor salta a él (Felipe, 2026-09-25).
  const paso = pasoSiguiente(datos);

  /** Tras elegir algo, lleva el cursor al paso que sigue: la descripción si hay que escribirla, si no el precio. */
  function avanzar(cambio: Partial<DatosPrendaSinRegistrar>) {
    const d = { ...datos, ...cambio };
    // Con la descripción armándose sola, se calcula con lo recién elegido (el render todavía no pasó).
    if (descripcionEscrita === null) {
      const cat = listas.categorias.find((c) => c.id === d.categoriaId)?.nombre ?? null;
      const tal = tallasDeCategoria(listas.tallasPorCategoria[d.categoriaId], listas.tallas).find((t) => t.id === d.tallaId)?.valor ?? null;
      const col = colores.find((c) => c.valor === d.colorCodigo)?.texto ?? null;
      d.descripcion = sugerirDescripcion(cat, col, tal) ?? "";
    }
    const siguiente = pasoSiguiente(d);
    // Después del render (la talla recién se habilita) y de que el selector devuelva el foco a su propio botón.
    requestAnimationFrame(() => {
      const destino =
        siguiente === "talla"
          ? document.querySelector<HTMLElement>(`button[aria-labelledby="${idTalla}"]`)
          : siguiente === "color"
            ? document.getElementById(idColorCampo)
            : siguiente === "descripcion"
              ? document.getElementById(idDescripcion)
              : siguiente === "precio"
                ? document.getElementById(idPrecio)
                : null;
      destino?.focus();
    });
  }

  function elegirCategoria(id: string) {
    setCategoriaId(id);
    // La talla elegida solo sobrevive si la nueva categoría también la ofrece.
    const nuevas = tallasDeCategoria(listas.tallasPorCategoria[id], listas.tallas);
    const tallaSigue = nuevas.some((t) => t.id === tallaId);
    if (!tallaSigue) setTallaId("");
    avanzar({ categoriaId: id, tallaId: tallaSigue ? tallaId : "" });
  }

  function elegirTalla(id: string) {
    setTallaId(id);
    avanzar({ tallaId: id });
  }

  function elegirColor(codigo: string) {
    setColorCodigo(codigo);
    avanzar({ colorCodigo: codigo });
  }

  function usarSugerencia() {
    if (!sugerencia) return;
    setDescripcion(sugerencia);
    // El foco al final del texto: para seguir escribiendo («… con botones dorados»).
    requestAnimationFrame(() => {
      const el = document.getElementById(idDescripcion) as HTMLInputElement | null;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  return (
    <Modal
      titulo="Prenda sin registrar"
      subtitulo="Para una prenda que todavía no tiene etiqueta. Almacén la registra después con estos datos."
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
    >
      <div className="space-y-1">
        <Campo etiqueta={<Etiqueta texto="Categoría" toca={paso === "categoria"} />} idEtiqueta={idCategoria}>
          <ComboBuscable
            valor={categoriaId}
            onValor={elegirCategoria}
            opciones={listas.categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
            marcador="Busca la categoría"
            etiquetaAccesible="Categoría"
            autoFocus
          />
        </Campo>

        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Campo etiqueta={<Etiqueta texto="Talla" toca={paso === "talla"} />} idEtiqueta={idTalla}>
            <Desplegable
              valor={tallaId}
              onValor={elegirTalla}
              opciones={tallas.map((t) => ({ valor: t.id, texto: t.valor }))}
              marcador={categoriaId ? "Elegir" : "Primero la categoría"}
              deshabilitado={!categoriaId}
              idEtiqueta={idTalla}
            />
          </Campo>
          <Campo etiqueta={<Etiqueta texto="Color" toca={paso === "color"} />} idEtiqueta={idColor}>
            <ComboBuscable
              id={idColorCampo}
              valor={colorCodigo}
              onValor={elegirColor}
              opciones={colores.map((c) => ({
                valor: c.valor,
                texto: c.texto,
                detalle: c.detalle,
                claves: c.claves,
                // El color de la prenda es un dato, no la paleta de la interfaz: va tal cual lo guarda el vocabulario.
                icono: <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-tinta/20" style={{ backgroundColor: c.hex ?? undefined }} />,
              }))}
              marcador="Busca el color"
              etiquetaAccesible="Color"
            />
          </Campo>
        </div>

        <CampoTexto
          id={idDescripcion}
          etiqueta={<Etiqueta texto="Descripción corta" toca={paso === "descripcion"} />}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder={sugerencia ?? "Blusa lino beige"}
          maxLength={80}
          pie={
            descripcionVacia ? (
              <span className="block">
                <span className="block">
                  <Etiqueta texto={FALTA_DESCRIPCION} toca={paso === "descripcion"} />
                </span>
                {sugerencia ? (
                  <span className="mt-0.5 flex items-baseline gap-3">
                    <span className="text-tinta/75">
                      Sugerencia: <span className="text-tinta">«{sugerencia}»</span>
                    </span>
                    <button type="button" onClick={usarSugerencia} className="btn-cayla btn-enlace">
                      Usar
                    </button>
                  </span>
                ) : null}
              </span>
            ) : null
          }
        />

        {/* Un campo de verdad en vez del teclado de pantalla (spike 2026-09-26): en escritorio se escribe con el teclado
            y Enter agrega; en el teléfono `inputMode="decimal"` abre el teclado numérico del propio celular. */}
        <label
          htmlFor={idPrecio}
          className={`card-cayla flex items-center justify-between gap-3 px-4 py-2 transition-colors duration-300 ease-cayla focus-within:border-rojo/60 ${paso === "precio" ? "border-rojo/60" : ""}`}
        >
          <span className="label-cayla text-[11px] text-tinta/65">
            <Etiqueta texto="Precio cobrado" toca={paso === "precio"} />
          </span>
          <span className="flex items-baseline gap-1 font-display text-3xl text-tinta">
            S/
            <input
              id={idPrecio}
              value={precio}
              onChange={(e) => setPrecio(precioEscribible(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && falta === null) {
                  e.preventDefault();
                  onAgregar({ ...datos, descripcion: descripcion.trim() });
                }
              }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-label="Precio cobrado en soles"
              className="w-28 bg-transparent text-right outline-none placeholder:text-tinta/30"
            />
          </span>
        </label>
        <p className="min-h-5 pt-2 text-xs text-tinta/60">{faltaAlPie}</p>
        <button type="button" onClick={() => onAgregar({ ...datos, descripcion: descripcion.trim() })} disabled={falta !== null} className={`${botonPrimario} w-full`}>
          Agregar al ticket
        </button>
      </div>
    </Modal>
  );
}
