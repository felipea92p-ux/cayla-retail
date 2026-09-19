"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { avisar } from "@/components/ui/Avisos";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto, Hilo } from "@/components/ui/campos";
import type { Estilo } from "@/components/MuestraEtiqueta";
import { MuestraTalla } from "@/components/MuestraTalla";
import { normalizarNombre } from "@/lib/patron-visual";
import { compararTallas, tipoDeTalla, type TipoTalla } from "@/lib/tallas";

/**
 * Vocabulario cerrado de tallas (ADR-0095/0096) — mismo mecanismo que
 * Colores/Tejidos/Patrones, con UNA diferencia real: aprobar acá exige un
 * comentario (a qué categoría aplica, por qué es distinta de las que ya
 * existen) — el trigger de la base (`fn_tallas_estado_trigger`) lo hace
 * cumplir, no solo esta pantalla. Las otras 4 tablas de vocabulario siguen
 * de un clic sin fricción; talla es la excepción con razón de negocio: un
 * color de más es barato de limpiar, una talla mal aprobada ensucia la
 * unicidad de variante y es más cara de deshacer con SKUs ya colgando.
 *
 * Qué categorías OFRECEN una talla no vive acá — eso es
 * `retail.categoria_tallas`, sin pantalla propia todavía (BACKLOG.md).
 */

type Talla = {
  id: string;
  valor: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
};

// Misma grilla y misma tarjeta (p-4, imagen 3:1) que Colores, Tejidos, Patrones y
// Etiquetas: las cinco pestañas de Atributos comparten medidas, así que al
// cambiar de una a otra la ilustración no crece ni se corre.
const GRILLA = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

// Cómo se agrupa y se pinta cada tipo de talla. El tono reutiliza la paleta
// cerrada de Etiquetas (sin rojo: acento sagrado, máx. 2 usos por pantalla).
const TIPOS: Record<TipoTalla, { grupo: string; dot: string; estilo: Estilo }> = {
  letras: { grupo: "Letras", dot: "bg-tinta/25", estilo: "neutral" },
  numeracion: { grupo: "Numeración", dot: "bg-taupe-profundo", estilo: "campana" },
  unica: { grupo: "Única y estándar", dot: "bg-verde", estilo: "positivo" },
  otras: { grupo: "Otras", dot: "bg-ambar", estilo: "urgencia" },
};

const ORDEN_TIPOS: TipoTalla[] = ["letras", "numeracion", "unica", "otras"];

// El orden de la curva (XS·S·M·L, 6·9·26·42), no el alfabético: "26" va después
// de "9", y "XL" después de "L". Es el mismo que usa Recepción para repartir.
function ordenar(lista: Talla[]) {
  return [...lista].sort((a, b) => compararTallas(a.valor, b.valor));
}

/** La tarjeta de una talla: ilustración arriba, nombre y acciones abajo. */
function TarjetaTalla({ t, apagada = false, children }: { t: Talla; apagada?: boolean; children?: ReactNode }) {
  return (
    <div
      className={`group/etq card-cayla flex flex-col gap-2 p-4 transition-[transform,border-color] duration-260 ease-cayla hover:-translate-y-0.5 hover:border-tinta/25 ${
        apagada ? "opacity-60" : ""
      }`}
    >
      <MuestraTalla valor={t.valor} estilo={TIPOS[tipoDeTalla(t.valor)].estilo} />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-medium leading-snug text-tinta">
            {t.valor}
            {t.notas && t.estado !== "rechazado" && <Ayuda titulo={t.valor}>{t.notas}</Ayuda>}
          </p>
          {t.estado === "pendiente" && (
            <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
          )}
          {t.estado === "rechazado" && (
            <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazada</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function TallasLista({ tallasIniciales, puedeEditar }: { tallasIniciales: Talla[]; puedeEditar: boolean }) {
  const [tallas, setTallas] = useState(() => ordenar(tallasIniciales));
  const [agregando, setAgregando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  const [aprobandoAbierto, setAprobandoAbierto] = useState<string | null>(null);
  const [comentarioAprobar, setComentarioAprobar] = useState("");
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);

  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [tipo, setTipo] = useState<TipoTalla | "todas">("todas");
  // La grilla solo se re-asienta cuando la persona cambia un filtro, nunca al
  // cargar la pantalla: el movimiento responde a una acción (ver globals.css).
  const [animar, setAnimar] = useState(false);

  const q = normalizarNombre(busqueda);
  const pasaFiltros = (t: Talla) => (tipo === "todas" || tipoDeTalla(t.valor) === tipo) && (!q || normalizarNombre(t.valor).includes(q));
  const hayFiltros = tipo !== "todas" || q !== "";
  const quitarFiltros = () => {
    setTipo("todas");
    setBusqueda("");
    setAnimar(true);
  };

  const activos = tallas.filter((t) => t.activo);
  const desactivados = tallas.filter((t) => !t.activo);
  const tiposConTallas = ORDEN_TIPOS.filter((g) => activos.some((t) => tipoDeTalla(t.valor) === g));
  const activosVisibles = activos.filter(pasaFiltros);
  const desactivadosVisibles = desactivados.filter(pasaFiltros);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar la talla.");
        return;
      }
      setTallas((actual) =>
        ordenar([...actual, { id: datos.talla.id, valor: datos.talla.valor, activo: true, notas: datos.talla.notas, estado: datos.talla.estado }])
      );
      avisar.exito(
        datos.talla.estado === "pendiente" ? `${datos.talla.valor} agregada — ya la puedes usar` : `Talla ${datos.talla.valor} agregada`,
        datos.talla.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder la apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setValor("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  // Aprobar exige comentario — la base lo rechaza si llega vacío, esto solo
  // evita el viaje al servidor con el botón deshabilitado.
  async function aprobar(t: Talla) {
    if (!comentarioAprobar.trim()) return;
    setAprobandoId(t.id);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, estado: "aprobado", notas: comentarioAprobar.trim() }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, estado: "aprobado" as const, activo: true, notas: datos.talla.notas } : x))));
      avisar.exito(`${t.valor} aprobada`);
      setAprobandoAbierto(null);
      setComentarioAprobar("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(t: Talla) {
    setRechazandoId(t.id);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${t.valor} rechazada`, { detalle: "Cae a Desactivadas. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  // Reactivar una rechazada TAMBIÉN exige el comentario (misma regla que
  // aprobar, porque en la base es la misma transición estado→'aprobado').
  function abrirReactivar(t: Talla) {
    setAprobandoAbierto(t.id);
    setComentarioAprobar("");
  }

  async function desactivar(t: Talla) {
    setCambiandoId(t.id);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false } : x))));
      avisar.exito(`${t.valor} desactivada`, { detalle: "Deja de aparecer al elegir talla en una prenda nueva; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  const aprobandoTalla = tallas.find((t) => t.id === aprobandoAbierto) ?? null;
  const rechazandoTalla = tallas.find((t) => t.id === rechazandoAbierto) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Filtrar tallas" className="flex flex-wrap items-center gap-1.5">
          <BotonFiltro activo={tipo === "todas"} onClick={() => { setTipo("todas"); setAnimar(true); }} cuenta={activos.length}>
            Todas
          </BotonFiltro>
          {tiposConTallas.map((g) => (
            <BotonFiltro
              key={g}
              activo={tipo === g}
              onClick={() => { setTipo(tipo === g ? "todas" : g); setAnimar(true); }}
              cuenta={activos.filter((t) => tipoDeTalla(t.valor) === g).length}
            >
              {TIPOS[g].grupo}
            </BotonFiltro>
          ))}
        </div>

        <div className="ml-auto flex w-full items-center gap-3 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Search aria-hidden className="pointer-events-none absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta/40" />
            <input
              type="search"
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              onFocus={() => setBuscando(true)}
              onBlur={() => setBuscando(false)}
              placeholder="Buscar"
              aria-label="Buscar talla"
              className="h-9 w-full bg-transparent pl-6 pr-6 text-sm text-tinta outline-none placeholder:text-tinta/55 [&::-webkit-search-cancel-button]:hidden"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                aria-label="Borrar búsqueda"
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-tinta/40 transition-colors hover:text-tinta"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
            <Hilo activo={buscando} />
          </div>
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="label-cayla shrink-0 rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            + Agregar talla
          </button>
        </div>
      </div>

      {hayFiltros && activosVisibles.length + desactivadosVisibles.length === 0 && (
        <div className="card-cayla flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-tinta/75">
            {q ? <>Ninguna talla coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ninguna talla cumple estos filtros."}
          </p>
          <Boton peso="discreto" className="px-3 py-1.5 text-[11px]" onClick={quitarFiltros}>
            Quitar filtros
          </Boton>
        </div>
      )}

      <div key={tipo} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {ORDEN_TIPOS.map((clave) => {
          const delTipo = activosVisibles.filter((t) => tipoDeTalla(t.valor) === clave);
          if (delTipo.length === 0) return null;
          const { grupo, dot } = TIPOS[clave];
          return (
            <section key={clave} className="space-y-3">
              <p className="label-cayla flex items-center gap-1.5 text-[11px] text-tinta/65">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                {grupo}
                <span className="font-normal tabular-nums text-tinta/40">{delTipo.length}</span>
              </p>
              <div className={GRILLA}>
                {delTipo.map((t) => (
                  <TarjetaTalla key={t.id} t={t}>
                    {puedeEditar &&
                      (t.estado === "pendiente" ? (
                        // Dos botones lado a lado no caben en una tarjeta angosta ("RECHAZAR"
                        // se cortaba): con `flex-wrap` y un mínimo por botón, si no caben en
                        // fila pasan a dos filas en vez de recortarse.
                        <div className="flex flex-wrap gap-2">
                          <Boton
                            peso="primario"
                            className="min-w-[6.5rem] flex-1 px-2.5! py-1.5 text-[11px] whitespace-nowrap"
                            onClick={() => {
                              setAprobandoAbierto(t.id);
                              setComentarioAprobar("");
                            }}
                          >
                            Aprobar
                          </Boton>
                          <Boton
                            peso="discreto"
                            className="min-w-[6.5rem] flex-1 px-2.5! py-1.5 text-[11px] whitespace-nowrap text-rojo"
                            onClick={() => {
                              setRechazandoAbierto(t.id);
                              setMotivoRechazo("");
                            }}
                          >
                            Rechazar
                          </Boton>
                        </div>
                      ) : (
                        // Desactivar no es lo que se hace a diario: aparece al pasar el
                        // mouse o al enfocar con teclado, y en pantallas táctiles (sin
                        // hover) se ve siempre. Reserva su espacio para que la tarjeta
                        // no salte de alto.
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            disabled={cambiandoId === t.id}
                            onClick={() => desactivar(t)}
                            className="label-cayla text-[10px] text-tinta/55 underline-offset-4 opacity-0 transition-[opacity,color] duration-200 hover:text-tinta hover:underline focus:opacity-100 disabled:opacity-50 group-hover/etq:opacity-100 [@media(hover:none)]:opacity-100"
                          >
                            {cambiandoId === t.id ? "Desactivando…" : "Desactivar"}
                          </button>
                        </div>
                      ))}
                  </TarjetaTalla>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {desactivadosVisibles.length > 0 && (
        <section className="space-y-3">
          <p className="label-cayla text-[11px] text-tinta/65">
            Desactivadas — ya no se pueden elegir en una prenda nueva
            <span className="ml-1.5 font-normal tabular-nums text-tinta/40">{desactivadosVisibles.length}</span>
          </p>
          <div className={GRILLA}>
            {desactivadosVisibles.map((t) => (
              <TarjetaTalla key={t.id} t={t} apagada>
                {puedeEditar && (
                  <Boton peso="discreto" className="px-2.5! py-1.5 text-[11px] whitespace-nowrap" onClick={() => abrirReactivar(t)}>
                    Reactivar
                  </Boton>
                )}
              </TarjetaTalla>
            ))}
          </div>
        </section>
      )}

      {agregando && (
        <Modal titulo="Nueva talla" subtitulo="Queda disponible de inmediato para cualquier prenda nueva." ancho="max-w-sm" onClose={() => setAgregando(false)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Valor de la talla" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej. M, 38, XSS" autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton peso="primario" className="flex-1" onClick={guardar} cargando={guardando} disabled={!valor.trim()}>
                  Guardar
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {aprobandoTalla && (
        <Modal
          titulo={`Aprobar «${aprobandoTalla.valor}»`}
          subtitulo="A qué categoría aplica, por qué es distinta de las que ya existen — queda de referencia."
          ancho="max-w-sm"
          onClose={() => setAprobandoAbierto(null)}
        >
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Comentario (obligatorio)" value={comentarioAprobar} onChange={(e) => setComentarioAprobar(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={aprobandoId === aprobandoTalla.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={aprobandoId === aprobandoTalla.id}
                  disabled={!comentarioAprobar.trim()}
                  onClick={() => aprobar(aprobandoTalla)}
                >
                  Confirmar aprobación
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {rechazandoTalla && (
        <Modal titulo={`Rechazar «${rechazandoTalla.valor}»`} ancho="max-w-sm" onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoId === rechazandoTalla.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoId === rechazandoTalla.id}
                  onClick={() => rechazar(rechazandoTalla)}
                >
                  Confirmar rechazo
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
