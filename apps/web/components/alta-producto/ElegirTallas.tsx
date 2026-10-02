"use client";

import { useState, type KeyboardEvent } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto } from "@/components/ui/campos";
import { Resaltado } from "@/components/ui/Resaltado";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { ProponerValor } from "@/components/alta-producto/ProponerValor";
import { guardarEjesCategoria, sumarAlEje, type EjeIds } from "@/lib/alta-producto-ejes";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { agruparTallas, alternar, curvaCambiada, faltanDeLaCategoria, porOfrecer, textoCurva, unirSinRepetir } from "@/lib/muestras-alta-reglas";
import { compararTallas } from "@/lib/tallas";
import { AvisoSinIdentidad, useFirmaDeMitad } from "@/components/alta-producto/IdentidadAlta";

// La fila «Tallas» del paso 3 de «Nuevo producto» (spike producto-nuevo-v2-2026-09, «Cuando hay mucho»).
//
// El problema: el catálogo tiene 27 tallas y una categoría ofrece hasta 9. A la vista van solo las de la categoría (y las
// elegidas que no son de ella, para que lo elegido nunca se esconda), con dos atajos arriba a la derecha:
//   · «Solo las de siempre (28–34)» vuelve a la curva habitual de la categoría, cuando lo elegido se apartó de ella;
//   · «Todas las tallas» marca todas las de la categoría, cuando falta alguna.
// Lo raro («esta blusa sí viene en XXL») va por la ficha punteada «+ Otra talla»: una hoja con el catálogo entero agrupado
// en Letras, Números y Otras (`agruparTallas`, la misma regla que ordena la curva), con buscador y selección múltiple.
//
// Una talla que la categoría no ofrece NO puede quedar solo marcada: `crear_producto_con_variantes` rechaza el producto
// («Una de las tallas elegidas no está habilitada para esta categoría»). Así que «Listo» primero la ofrece en la categoría
// —UNA escritura con todas las nuevas, firmada por quien inició el alta (`useFirmaDeMitad`, sin combo propio desde 2026-09-29), como un tejido del
// catálogo— y recién entonces la deja elegida. Si esa escritura falla, la hoja no se cierra y nada cambia.
// La hoja trabaja sobre una copia: «Listo» aplica, Escape / el velo / «Cancelar» la descartan.

type Props = {
  /** Las que ofrece la categoría (`categoria_tallas`), ya ordenadas como curva. */
  deLaCategoria: ValorVocabulario[];
  /** Todo el vocabulario aprobado de tallas: de aquí sale la hoja «+ Otra talla». */
  universo: ValorVocabulario[];
  /** ids */
  elegidas: string[];
  onElegidas: (ids: string[]) => void;
  /** ids de la curva habitual de la categoría (las que vienen marcadas de antemano). */
  habituales: string[];
  categoriaId: string;
  categoriaNombre: string;
  /** `familias.codigo` de la categoría: el ejemplo de «+ Nueva talla» sigue a la familia (skill `/sugerir`). Sin ella, texto neutro. */
  familia?: string | null;
  /** Lo que la categoría ofrece HOY en los tres ejes: la RPC reemplaza, así que se le devuelve entero + las tallas nuevas. */
  ejesActuales: EjeIds;
  /** La talla ya quedó ofrecida en la categoría (desde la hoja o propuesta): quien llama la suma a la fila. */
  onOfrecido: (v: ValorVocabulario) => void;
  /** `true` cuando quien llama pone los atajos en la línea del título (`<AtajosTallas>` en `FilaAlta accion`). */
  sinAtajos?: boolean;
};

/**
 * «Solo las de siempre (28–34)» y «Todas las tallas». Van en la MISMA línea que el título «Tallas» (como el spike):
 * dentro de la fila le robaban una línea entera a la pantalla. Sin ninguno a la vista no ocupan nada, y la línea del
 * título no cambia de alto al tocarlos, así que las tallas no saltan bajo el dedo (ADR-0185).
 */
export function AtajosTallas({ deLaCategoria, universo, elegidas, onElegidas, habituales }: Pick<Props, "deLaCategoria" | "universo" | "elegidas" | "onElegidas" | "habituales">) {
  const todas = unirSinRepetir(deLaCategoria, universo);
  const mostrarCurva = curvaCambiada(elegidas, habituales);
  const faltan = faltanDeLaCategoria(elegidas, deLaCategoria);
  const rotuloCurva = textoCurva(habituales.map((id) => todas.find((t) => t.id === id)?.texto).filter((t): t is string => Boolean(t)));
  if (!mostrarCurva && faltan.length === 0) return null;
  return (
    <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {mostrarCurva && (
        <button type="button" onClick={() => onElegidas(habituales)} className="btn-cayla btn-enlace text-xs">
          Solo las de siempre{rotuloCurva ? ` (${rotuloCurva})` : ""}
        </button>
      )}
      {faltan.length > 0 && (
        <button type="button" onClick={() => onElegidas([...elegidas, ...faltan])} className="btn-cayla btn-enlace text-xs">
          Todas las tallas
        </button>
      )}
    </span>
  );
}

export function ElegirTallas({ deLaCategoria, universo, elegidas, onElegidas, habituales, categoriaId, categoriaNombre, familia, ejesActuales, onOfrecido, sinAtajos = false }: Props) {
  const [hoja, setHoja] = useState(false);
  /** La talla recién creada desde la cabecera de la hoja: la hoja la marca para que «Listo» no la suelte. */
  const [agregada, setAgregada] = useState<string | null>(null);
  const todas = unirSinRepetir(deLaCategoria, universo);
  const porId = (id: string) => todas.find((t) => t.id === id);

  // Lo elegido nunca se esconde: una elegida que la categoría no ofrece (todavía) se ve al final, en orden de curva.
  const deFuera = porOfrecer(elegidas, deLaCategoria)
    .map(porId)
    .filter((t): t is ValorVocabulario => Boolean(t))
    .sort((a, b) => compararTallas(a.texto, b.texto));


  return (
    <div className="space-y-2">
      {!sinAtajos && (
        <div className="flex min-h-5 flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
          <AtajosTallas deLaCategoria={deLaCategoria} universo={universo} elegidas={elegidas} onElegidas={onElegidas} habituales={habituales} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {[...deLaCategoria, ...deFuera].map((t) => (
          <ChipOpcion key={t.id} elegido={elegidas.includes(t.id)} onClick={() => onElegidas(alternar(elegidas, t.id))} className="tabular-nums">
            {t.texto}
          </ChipOpcion>
        ))}
        <button
          type="button"
          onClick={() => setHoja(true)}
          aria-haspopup="dialog"
          // Punteada: se lee como «hay más», no como una talla más.
          className="flex min-h-9 items-center rounded-md border border-dashed border-tinta/25 px-2.5 py-1.5 text-sm text-taupe transition-colors hover:border-tinta/50 hover:text-tinta"
        >
          + Otra talla
        </button>
      </div>

      {hoja && (
        <Modal
          variante="hoja"
          ancho="max-w-[680px]"
          titulo="Agrega otra talla"
          subtitulo={`${todas.length} tallas en el catálogo. Las que elijas se suman a esta prenda.`}
          onClose={() => setHoja(false)}
          // «+ Nueva talla» arriba a la derecha, igual que tejido, patrón y etiqueta (Felipe 2026-10-02).
          acciones={
            <ProponerValor
              tipo="tallas"
              categoriaId={categoriaId}
              familia={familia}
              ejesActuales={ejesActuales}
              universo={universo}
              onCreado={(v) => {
                // ProponerValor ya la ofreció en la categoría: se suma a la fila y la hoja la deja marcada.
                onOfrecido(v);
                setAgregada(v.id);
              }}
            />
          }
        >
          {(cerrar) => (
            <HojaTallas
              agregada={agregada}
              deLaCategoria={deLaCategoria}
              todas={todas}
              elegidas={elegidas}
              categoriaId={categoriaId}
              categoriaNombre={categoriaNombre}
              ejesActuales={ejesActuales}
              onOfrecido={onOfrecido}
              onListo={(ids) => {
                onElegidas(ids);
                cerrar();
              }}
              onCancelar={cerrar}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function HojaTallas({
  deLaCategoria,
  todas,
  elegidas,
  categoriaId,
  categoriaNombre,
  ejesActuales,
  onOfrecido,
  onListo,
  onCancelar,
  agregada,
}: {
  agregada: string | null;
  deLaCategoria: ValorVocabulario[];
  todas: ValorVocabulario[];
  elegidas: string[];
  categoriaId: string;
  categoriaNombre: string;
  ejesActuales: EjeIds;
  onOfrecido: (v: ValorVocabulario) => void;
  onListo: (ids: string[]) => void;
  onCancelar: () => void;
}) {
  const [marcadas, setMarcadas] = useState(elegidas);
  // Una talla recién creada desde la cabecera se marca sola (ajuste durante el render, no en un efecto).
  const [yaMarcada, setYaMarcada] = useState<string | null>(null);
  if (agregada && agregada !== yaMarcada) {
    setYaMarcada(agregada);
    setMarcadas((prev) => (prev.includes(agregada) ? prev : [...prev, agregada]));
  }
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firma = useFirmaDeMitad("alta_producto_talla");

  const grupos = agruparTallas(todas, busqueda);
  const nuevas = porOfrecer(marcadas, deLaCategoria)
    .map((id) => todas.find((t) => t.id === id))
    .filter((t): t is ValorVocabulario => Boolean(t));
  const listaNuevas = new Intl.ListFormat("es", { type: "conjunction" }).format(
    [...nuevas].sort((a, b) => compararTallas(a.texto, b.texto)).map((t) => t.texto),
  );

  async function listo() {
    if (guardando) return;
    if (nuevas.length === 0) {
      onListo(marcadas);
      return;
    }
    if (!firma.listo) return;
    setGuardando(true);
    setError(null);
    const ejes = nuevas.reduce((e, t) => sumarAlEje(e, "tallas", t.id), ejesActuales);
    const err = await guardarEjesCategoria(categoriaId, ejes, firma.encabezados());
    setGuardando(false);
    if (err) {
      // Nada quedó a medias: la categoría sigue como estaba, la hoja sigue abierta y reintentar es seguro.
      setError(`No se pudo agregar ${listaNuevas} a ${categoriaNombre}: ${err}`);
      return;
    }
    avisar.exito(`${listaNuevas} ahora ${nuevas.length === 1 ? "se ofrece" : "se ofrecen"} en ${categoriaNombre}`);
    nuevas.forEach(onOfrecido);
    // Después de `onOfrecido`: si quien llama también marca la talla ofrecida, esta lista final es la que queda.
    onListo(marcadas);
  }

  // El buscador usa el Escape si tiene algo escrito (lo borra) y lo corta; vacío, lo deja pasar y cierra la hoja (useEscapeLibre).
  function escapeDelBuscador(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && busqueda) {
      e.stopPropagation();
      setBusqueda("");
    }
  }

  return (
    <>
      <div className="max-w-md">
        <CampoTexto
          etiqueta="Buscar talla"
          caja
          type="text"
          autoFocus
          autoComplete="off"
          placeholder="Buscar…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={escapeDelBuscador}
        />
      </div>

      <div className="scroll-cayla -mx-1 mt-3 max-h-[46vh] overflow-y-auto px-1 pb-1">
        {grupos.length === 0 && <p className="py-4 text-[13px] text-taupe">Ninguna talla se llama así.</p>}
        {grupos.map((g, i) => (
          <section key={g.grupo} className={i > 0 ? "mt-4" : ""}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">{g.grupo}</h3>
            <div className="flex flex-wrap gap-1.5">
              {g.tallas.map((t) => (
                <ChipOpcion
                  key={t.id}
                  elegido={marcadas.includes(t.id)}
                  onClick={() => setMarcadas((prev) => alternar(prev, t.id))}
                  disabled={guardando}
                  className="tabular-nums"
                >
                  <Resaltado texto={t.texto} busqueda={busqueda} />
                </ChipOpcion>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-3 space-y-2 border-t border-sand pt-3">
        {nuevas.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12.5px] text-taupe">
              <span className="text-tinta">{listaNuevas}</span> {nuevas.length === 1 ? "no es" : "no son"} de {categoriaNombre}: al tocar «Listo»,{" "}
              {categoriaNombre} {nuevas.length === 1 ? "la ofrece" : "las ofrece"} desde ahora (también para las prendas que vengan).
            </p>
            <AvisoSinIdentidad firma={firma} enHoja />
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-rojo-profundo">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] tabular-nums text-taupe">
            {marcadas.length} {marcadas.length === 1 ? "talla elegida" : "tallas elegidas"}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCancelar} disabled={guardando} className="btn-cayla btn-sutil">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void listo()}
              disabled={guardando || (nuevas.length > 0 && !firma.listo)}
              title={nuevas.length > 0 ? (firma.motivo ?? undefined) : undefined}
              className="btn-cayla btn-primario"
            >
              {guardando ? "Guardando…" : "Listo"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
