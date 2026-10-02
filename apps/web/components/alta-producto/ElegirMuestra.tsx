"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto } from "@/components/ui/campos";
import { Resaltado } from "@/components/ui/Resaltado";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MuestraPatron } from "@/components/MuestraPatron";
import { MuestraTejido } from "@/components/MuestraTejido";
import { GrillaMuestras, TarjetaMuestraBase, TileVerTodos } from "@/components/alta-producto/GrillaMuestras";
import { ProponerValor } from "@/components/alta-producto/ProponerValor";
import { guardarEjesCategoria, sumarAlEje, type EjeIds } from "@/lib/alta-producto-ejes";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { aLaVista, seccionesMuestras, unirSinRepetir } from "@/lib/muestras-alta-reglas";
import { ayudaDeTejido } from "@/lib/tejido-ayuda";
import { AvisoSinIdentidad, useFirmaDeMitad } from "@/components/alta-producto/IdentidadAlta";

// Las filas «Tejido» y «Patrón» del paso 3 de «Nuevo producto» (spike producto-nuevo-v2-2026-09, «Cuando hay mucho»).
//
// El problema: producción tiene 24 tejidos y 9 patrones, y una categoría ofrece hasta 10 y 8. Todo a la vista es un muro de
// tarjetas; solo lo de la categoría obliga a saber que Lino existe para ponérselo a un jean. Así que:
//   · a la vista, 5 muestras de las que ofrece la categoría (en su orden) y una sexta punteada, «Ver todos · 24 tejidos»;
//   · lo elegido NUNCA se esconde: si no está entre esas 5 (vino de «Ver todos»), va primero y empuja a la última;
//   · «Ver todos» abre una hoja con buscador (sin tildes ni mayúsculas): arriba «Los de {categoría}», abajo «Del catálogo».
//
// Elegir uno «Del catálogo» NO puede ser solo marcarlo: la base rechaza crear un producto con un tejido o patrón que su
// categoría no ofrece (`crear_producto_con_variantes`, «Ese tejido no está habilitado para la categoría elegida»). Tocarlo
// lo ofrece en la categoría —una escritura aparte, firmada por quien inició el alta (`useFirmaDeMitad`, sin combo propio desde 2026-09-29)— y lo deja
// elegido; es el mismo gesto que tenía el «Ver más» de `ElegirTejido` y se dice en la sección antes del toque, porque cambia la
// categoría y no solo el producto.
//
// La muestra es la FOTO o el DIBUJO real del tejido/patrón que se eligió en Atributos (ADR-0256): `imagenes` id → URL.
//
// Al pasar el mouse por un TEJIDO sale su ayuda (`lib/tejido-ayuda.ts`: qué es, para qué prendas sirve, cómo se cuida), la misma
// burbuja que ya tienen las etiquetas. Pasar el mouse no existe en el celular y lo que solo se ve al pasar el mouse no existe para
// quien usa el teléfono (Don Norman: el error es del diseño): por eso la ayuda del tejido ELEGIDO también se lee bajo la fila,
// solo donde no hay mouse. Los patrones no tienen ayuda: su dibujo ya dice qué son.

type Tipo = "tejidos" | "patrones";

const TEXTOS: Record<Tipo, { titulo: string; singular: string; plural: string; ninguno: string }> = {
  tejidos: { titulo: "Elige el tejido", singular: "tejido", plural: "tejidos", ninguno: "Ningún tejido se llama así." },
  patrones: { titulo: "Elige el patrón", singular: "patrón", plural: "patrones", ninguno: "Ningún patrón se llama así." },
};

type Props = {
  tipo: Tipo;
  /** Los que la categoría ofrece (`categoria_tejidos` / `categoria_patrones`), en el orden en que se muestran. */
  deLaCategoria: ValorVocabulario[];
  /** Todo el vocabulario aprobado del tipo: de aquí sale «Del catálogo» y el total de «Ver todos». */
  universo: ValorVocabulario[];
  /** id → URL de la foto o el dibujo elegido en Atributos (ADR-0256); sin ella, el dibujo automático por nombre. */
  imagenes: Record<string, string>;
  /** "" = ninguno. */
  elegidoId: string;
  /** "" para quitar. */
  onElegir: (id: string) => void;
  categoriaId: string;
  categoriaNombre: string;
  /** `familias.codigo` de la categoría: el ejemplo de «+ Nuevo tejido / patrón» sigue a la familia (skill `/sugerir`). Sin ella, texto neutro. */
  familia?: string | null;
  /** Lo que la categoría ofrece HOY en los tres ejes: la RPC reemplaza, así que se le devuelve entero + el valor nuevo. */
  ejesActuales: EjeIds;
  /** El valor ya quedó ofrecido en la categoría (desde la hoja o propuesto): quien llama lo suma a la fila. */
  onOfrecido: (v: ValorVocabulario) => void;
};

export function ElegirMuestra({ tipo, deLaCategoria, universo, imagenes, elegidoId, onElegir, categoriaId, categoriaNombre, familia, ejesActuales, onOfrecido }: Props) {
  const [hoja, setHoja] = useState(false);
  const todos = unirSinRepetir(deLaCategoria, universo);
  const elegido = elegidoId ? (todos.find((v) => v.id === elegidoId) ?? null) : null;
  const visibles = aLaVista(deLaCategoria, elegido);
  const t = TEXTOS[tipo];
  const ayudaElegido = tipo === "tejidos" && elegido ? ayudaDeTejido(elegido.texto) : null;

  return (
    <TooltipProvider delayDuration={250}>
      <GrillaMuestras>
        {visibles.map((v) => (
          <TarjetaMuestra
            key={v.id}
            tipo={tipo}
            valor={v}
            imagenUrl={imagenes[v.id]}
            elegido={v.id === elegidoId}
            // Tocar la elegida la suelta: la fila es también la forma de quitarla.
            onClick={() => onElegir(v.id === elegidoId ? "" : v.id)}
          />
        ))}
        <TileVerTodos total={todos.length} singular={t.singular} plural={t.plural} onClick={() => setHoja(true)} />
      </GrillaMuestras>

      {elegido && ayudaElegido && (
        <p role="status" className="mt-2 text-xs text-taupe [@media(hover:hover)]:hidden">
          <strong className="text-tinta">{elegido.texto}:</strong> {ayudaElegido.queEs} {ayudaElegido.datos.join(" ")}
        </p>
      )}

      {hoja && (
        <Modal
          variante="hoja"
          ancho="max-w-[680px]"
          titulo={t.titulo}
          subtitulo={`${todos.length} en el catálogo. Arriba, los que ya usa ${categoriaNombre}.`}
          onClose={() => setHoja(false)}
          // «+ Nuevo tejido / patrón» arriba a la derecha, a la vista (Felipe 2026-10-02): antes era un enlace al pie de la hoja.
          acciones={
            <ProponerValor
              tipo={tipo}
              categoriaId={categoriaId}
              familia={familia}
              ejesActuales={ejesActuales}
              universo={universo}
              onCreado={(v) => {
                onOfrecido(v);
                onElegir(v.id);
                setHoja(false);
              }}
            />
          }
        >
          {(cerrar) => (
            <HojaMuestras
              tipo={tipo}
              deLaCategoria={deLaCategoria}
              universo={universo}
              imagenes={imagenes}
              elegidoId={elegidoId}
              categoriaId={categoriaId}
              categoriaNombre={categoriaNombre}
              ejesActuales={ejesActuales}
              onElegir={(id) => {
                onElegir(id);
                cerrar();
              }}
              onOfrecido={(v) => {
                // El padre lo suma a la categoría; elegirlo aquí también deja el resultado igual aunque el padre no lo elija.
                onOfrecido(v);
                onElegir(v.id);
                cerrar();
              }}
            />
          )}
        </Modal>
      )}
    </TooltipProvider>
  );
}

function TarjetaMuestra({
  tipo,
  valor,
  imagenUrl,
  elegido,
  onClick,
  enHoja = false,
  busqueda = "",
  deshabilitado = false,
  guardando = false,
  motivo,
}: {
  tipo: Tipo;
  valor: ValorVocabulario;
  imagenUrl?: string;
  elegido: boolean;
  onClick: () => void;
  /** En la hoja el nombre largo pasa a dos líneas; en la fila se corta con «…» (el `title` lo dice entero). */
  enHoja?: boolean;
  busqueda?: string;
  deshabilitado?: boolean;
  /** Esta tarjeta es la que se está ofreciendo en la categoría ahora mismo. */
  guardando?: boolean;
  /** Por qué está apagada (falta elegir quién registra el alta): se ve al pasar el mouse. */
  motivo?: string;
}) {
  const Muestra = tipo === "tejidos" ? MuestraTejido : MuestraPatron;
  const ayuda = tipo === "tejidos" ? ayudaDeTejido(valor.texto) : null;
  // Con ayuda, la burbuja ya trae el nombre entero (en la fila se corta con «…»), así que el `title` nativo sobra y se
  // encimaría con ella; queda solo cuando `motivo` explica por qué la tarjeta está apagada (un botón apagado no abre la burbuja).
  const tarjeta = (
    <TarjetaMuestraBase
      elegido={elegido}
      guardando={guardando}
      deshabilitado={deshabilitado}
      onClick={onClick}
      title={motivo ?? (enHoja || ayuda ? undefined : valor.texto)}
    >
      <Muestra nombre={valor.texto} imagenUrl={imagenUrl ?? null} className="h-10 w-full" />
      <span className={`px-0.5 ${enHoja ? "break-words leading-tight" : "truncate"}`}>
        {elegido && (
          <span aria-hidden className="text-[11px]">
            ✓{" "}
          </span>
        )}
        {guardando ? "Agregando…" : <Resaltado texto={valor.texto} busqueda={busqueda} />}
      </span>
    </TarjetaMuestraBase>
  );
  if (!ayuda) return tarjeta;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{tarjeta}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} collisionPadding={8} className="max-w-[16rem] leading-snug">
        <p className="font-semibold">{valor.texto}</p>
        <p className="mt-0.5">{ayuda.queEs}</p>
        {ayuda.datos.map((d) => (
          <p key={d} className="mt-1 opacity-75">
            {d}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function HojaMuestras({
  tipo,
  deLaCategoria,
  universo,
  imagenes,
  elegidoId,
  categoriaId,
  categoriaNombre,
  ejesActuales,
  onElegir,
  onOfrecido,
}: {
  tipo: Tipo;
  deLaCategoria: ValorVocabulario[];
  universo: ValorVocabulario[];
  imagenes: Record<string, string>;
  elegidoId: string;
  categoriaId: string;
  categoriaNombre: string;
  ejesActuales: EjeIds;
  onElegir: (id: string) => void;
  onOfrecido: (v: ValorVocabulario) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firma = useFirmaDeMitad("alta_producto_muestra");
  const t = TEXTOS[tipo];
  const { propias, delCatalogo } = seccionesMuestras(deLaCategoria, universo, busqueda);

  async function ofrecer(v: ValorVocabulario) {
    if (guardandoId || !firma.listo) return;
    setGuardandoId(v.id);
    setError(null);
    const err = await guardarEjesCategoria(categoriaId, sumarAlEje(ejesActuales, tipo, v.id), firma.encabezados());
    setGuardandoId(null);
    if (err) {
      // Nada quedó a medias: la categoría sigue como estaba y reintentar es seguro (ofrecer uno que ya está no lo repite).
      setError(`No se pudo agregar ${v.texto} a ${categoriaNombre}: ${err}`);
      return;
    }
    avisar.exito(`${v.texto} ahora se ofrece en ${categoriaNombre}`);
    onOfrecido(v);
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
          etiqueta={`Buscar ${t.singular}`}
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

      <div className="scroll-cayla -mx-1 mt-3 max-h-[52vh] overflow-y-auto px-1 pb-1">
        {propias.length === 0 && delCatalogo.length === 0 && <p className="py-4 text-[13px] text-taupe">{t.ninguno}</p>}

        {propias.length > 0 && (
          <section>
            <TituloSeccion>
              Los de {categoriaNombre} <small className="text-[12px] font-normal normal-case tracking-normal">· {propias.length}</small>
            </TituloSeccion>
            <GrillaMuestras>
              {propias.map((v) => (
                <TarjetaMuestra
                  key={v.id}
                  tipo={tipo}
                  valor={v}
                  imagenUrl={imagenes[v.id]}
                  elegido={v.id === elegidoId}
                  enHoja
                  busqueda={busqueda}
                  deshabilitado={guardandoId !== null}
                  onClick={() => onElegir(v.id)}
                />
              ))}
            </GrillaMuestras>
          </section>
        )}

        {delCatalogo.length > 0 && (
          <section className={propias.length > 0 ? "mt-4" : ""}>
            <TituloSeccion>
              Del catálogo{" "}
              <small className="text-[12px] font-normal normal-case tracking-normal">
                · elegir uno lo suma a {categoriaNombre} (también para las prendas que vengan)
              </small>
            </TituloSeccion>
            <AvisoSinIdentidad firma={firma} enHoja className="mb-2" />
            <GrillaMuestras>
              {delCatalogo.map((v) => (
                <TarjetaMuestra
                  key={v.id}
                  tipo={tipo}
                  valor={v}
                  imagenUrl={imagenes[v.id]}
                  elegido={false}
                  enHoja
                  busqueda={busqueda}
                  guardando={guardandoId === v.id}
                  deshabilitado={guardandoId !== null || !firma.listo}
                  motivo={firma.motivo ?? undefined}
                  onClick={() => void ofrecer(v)}
                />
              ))}
            </GrillaMuestras>
            {error && (
              <p role="alert" className="mt-2 text-xs text-rojo-profundo">
                {error}
              </p>
            )}
          </section>
        )}
      </div>

    </>
  );
}

function TituloSeccion({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">{children}</h3>;
}
