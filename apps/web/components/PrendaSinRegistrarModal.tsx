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
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const idTalla = useId();
  const idCategoria = useId();
  const idColor = useId();
  const idColorCampo = useId();
  const idDescripcion = useId();

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
  // Lo de la descripción se dice bajo su campo y solo mientras está vacío: al empezar a escribir se van aviso y
  // sugerencia, y si lo vacían vuelven (Felipe, 2026-09-25). El pie del modal pregunta solo por el resto.
  const descripcionVacia = descripcion.trim() === "";

  const datos: DatosPrendaSinRegistrar = { descripcion, categoriaId, tallaId, colorCodigo, precio: Number(precio) };
  const falta = faltaEnPrendaSinRegistrar(datos);
  const faltaAlPie = faltaEnPrendaSinRegistrar(datos, { sinDescripcion: true });
  // El paso que toca: su etiqueta se enciende, y al cerrar el anterior el cursor salta a él (Felipe, 2026-09-25).
  const paso = pasoSiguiente(datos);

  /** Tras elegir algo, lleva el cursor al paso que sigue. El precio no: se marca con el teclado de abajo. */
  function avanzar(cambio: Partial<DatosPrendaSinRegistrar>) {
    const siguiente = pasoSiguiente({ ...datos, ...cambio });
    // Después del render (la talla recién se habilita) y de que el selector devuelva el foco a su propio botón.
    requestAnimationFrame(() => {
      const destino =
        siguiente === "talla"
          ? document.querySelector<HTMLElement>(`button[aria-labelledby="${idTalla}"]`)
          : siguiente === "color"
            ? document.getElementById(idColorCampo)
            : siguiente === "descripcion"
              ? document.getElementById(idDescripcion)
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

        <div
          className={`card-cayla flex items-baseline justify-between px-4 py-2 transition-colors duration-300 ease-cayla ${paso === "precio" ? "border-rojo/60" : ""}`}
        >
          <span className="label-cayla text-[11px] text-tinta/65">
            <Etiqueta texto="Precio cobrado" toca={paso === "precio"} />
          </span>
          <span className="font-display text-3xl text-tinta">S/{precio || "0.00"}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "←"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPrecio((v) => (t === "←" ? v.slice(0, -1) : v + t))}
              className="h-11 rounded-lg border border-sand bg-papel text-lg text-tinta transition-colors hover:bg-sand/40"
            >
              {t}
            </button>
          ))}
        </div>
        <p className="min-h-5 pt-2 text-xs text-tinta/60">{faltaAlPie}</p>
        <button type="button" onClick={() => onAgregar({ ...datos, descripcion: descripcion.trim() })} disabled={falta !== null} className={`${botonPrimario} w-full`}>
          Agregar al ticket
        </button>
      </div>
    </Modal>
  );
}
