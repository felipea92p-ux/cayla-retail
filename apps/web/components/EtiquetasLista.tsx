"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto, Hilo } from "@/components/ui/campos";
import { MuestraEtiqueta } from "@/components/MuestraEtiqueta";
import { hoyLima, vigenciaDe, type Vigencia } from "@/lib/etiqueta-vigencia";
import { normalizarNombre } from "@/lib/patron-visual";

/**
 * Vocabulario cerrado de etiquetas de catálogo (folksonomy: "Oferta",
 * "Verano 2026") — distinto de la etiqueta física de código de barras que
 * ya existe en Inventario/Movimientos. Mismo mecanismo propone/aprueba/
 * rechaza que colores/tejidos/patrones.
 *
 * Sin restricción por sede a propósito (Felipe, 2026-09-18): "empresa
 * uniforme" — toda etiqueta aplica igual en todas las sedes. La columna
 * `sedes_permitidas` sigue en el esquema (dormida, sin UI) por si algún
 * día hace falta de verdad; no se dropeó porque revivirla no pide
 * migración nueva. Ver 20260918020000_para_liquidar_global_no_por_sede.sql
 * para el porqué: no es cosmética, bloquea venta/traslado de verdad.
 *
 * Aplicar/quitar una etiqueta de una VARIANTE puntual no vive acá — es
 * edición normal de producto (`variantes_write_lider`, ya conectado en
 * ProductoForm.tsx — ese selector solo ofrece las que están vigentes hoy).
 *
 * `estilo` agrupa visualmente en 3 familias + "General" — paleta cerrada
 * a propósito (Felipe: "colores suaves dentro de nuestra paleta", nunca
 * libre), sin usar rojo (acento sagrado, máx. 2 usos por pantalla — un
 * badge por cada una de 20 tarjetas lo rompería). Ver
 * 20260918060000_etiquetas_estilo_visual.sql.
 */

type Estilo = "neutral" | "urgencia" | "positivo" | "campana";

const ESTILOS: Record<Estilo, { grupo: string; dot: string }> = {
  urgencia: { grupo: "Rotación", dot: "bg-ambar" },
  positivo: { grupo: "Artesanal", dot: "bg-verde" },
  campana: { grupo: "Campaña y festividad", dot: "bg-taupe-profundo" },
  neutral: { grupo: "General", dot: "bg-tinta/25" },
};

const ORDEN_GRUPOS: Estilo[] = ["urgencia", "positivo", "campana", "neutral"];

const formatoFecha = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });
const fecha = (f: string) => formatoFecha.format(new Date(f + "T00:00:00"));

function textoRango(desde: string | null, hasta: string | null) {
  if (desde && hasta) return `${fecha(desde)} – ${fecha(hasta)}`;
  if (desde) return `Desde ${fecha(desde)}`;
  if (hasta) return `Hasta ${fecha(hasta)}`;
  return null;
}

type Etiqueta = {
  id: string;
  nombre: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  estilo: Estilo;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
};

function ordenar(lista: Etiqueta[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

const GRILLA = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4";

function BotonFiltro({
  activo,
  onClick,
  cuenta,
  punto,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  cuenta: number;
  punto?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`label-cayla inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10.5px] transition-colors ${
        activo ? "border-tinta bg-tinta text-crema" : "border-tinta/15 text-tinta/65 hover:border-tinta/30 hover:text-tinta"
      }`}
    >
      {punto && <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${punto}`} />}
      {children}
      <span className={`font-normal tabular-nums ${activo ? "text-crema/60" : "text-tinta/40"}`}>{cuenta}</span>
    </button>
  );
}

/** Lo que dice la etiqueta sobre su temporada: un chip sobre la ilustración
 *  (se lee sin abrir nada) y el rango de fechas debajo del nombre. */
function chipDeVigencia(v: Vigencia | null) {
  if (!v) return null;
  if (v.estado === "vigente") return <Chip tono="verde">Vigente</Chip>;
  if (v.estado === "proxima") return <Chip tono="ambar">{v.enDias === 1 ? "Mañana" : `En ${v.enDias} días`}</Chip>;
  return <Chip tono="neutro">Fuera de temporada</Chip>;
}

function TarjetaEtiqueta({
  e,
  vigencia,
  apagada = false,
  children,
}: {
  e: Etiqueta;
  vigencia: Vigencia | null;
  apagada?: boolean;
  children?: ReactNode;
}) {
  const rango = textoRango(e.vigenteDesde, e.vigenteHasta);
  return (
    <div
      className={`group/etq card-cayla flex flex-col gap-3 p-2.5 transition-[transform,border-color] duration-260 ease-cayla hover:-translate-y-0.5 hover:border-tinta/25 ${
        apagada ? "opacity-60" : ""
      }`}
    >
      <div className="relative">
        <MuestraEtiqueta nombre={e.nombre} estilo={e.estilo} />
        {vigencia && <span className="absolute right-2 top-2 rounded-full bg-papel">{chipDeVigencia(vigencia)}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-medium leading-snug text-tinta">
            {e.nombre}
            {e.notas && e.estado !== "rechazado" && <Ayuda titulo={e.nombre}>{e.notas}</Ayuda>}
          </p>
          {e.estado === "pendiente" && (
            <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
          )}
          {e.estado === "rechazado" && (
            <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazada</span>
          )}
        </div>
        {rango && <p className="text-[11px] tabular-nums text-tinta/60">{rango}</p>}
      </div>
      {children}
    </div>
  );
}

export function EtiquetasLista({ etiquetasIniciales, puedeEditar }: { etiquetasIniciales: Etiqueta[]; puedeEditar: boolean }) {
  const [etiquetas, setEtiquetas] = useState(() => ordenar(etiquetasIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [grupo, setGrupo] = useState<Estilo | "todas">("todas");
  const [soloVigentes, setSoloVigentes] = useState(false);
  // El grid solo se re-asienta cuando la persona cambia un filtro, nunca al
  // cargar la pantalla: el movimiento responde a una acción (ver globals.css).
  const [animar, setAnimar] = useState(false);

  const hoy = hoyLima();
  const vigenciaEn = (e: Etiqueta) => vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
  const q = normalizarNombre(busqueda);
  const pasaFiltros = (e: Etiqueta) =>
    (grupo === "todas" || e.estilo === grupo) &&
    (!soloVigentes || vigenciaEn(e)?.estado === "vigente") &&
    (!q || normalizarNombre(e.nombre).includes(q));
  const hayFiltros = grupo !== "todas" || soloVigentes || q !== "";
  const quitarFiltros = () => {
    setGrupo("todas");
    setSoloVigentes(false);
    setBusqueda("");
    setAnimar(true);
  };

  const activas = etiquetas.filter((e) => e.activo);
  const desactivadas = etiquetas.filter((e) => !e.activo);
  const rechazandoEtiqueta = etiquetas.find((e) => e.id === rechazandoAbierto) ?? null;
  const gruposConEtiquetas = ORDEN_GRUPOS.filter((g) => activas.some((e) => e.estilo === g));
  const vigentesHoy = activas.filter((e) => vigenciaEn(e)?.estado === "vigente").length;
  const activasVisibles = activas.filter(pasaFiltros);
  const desactivadasVisibles = desactivadas.filter(pasaFiltros);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar la etiqueta.");
        return;
      }
      setEtiquetas((actual) =>
        ordenar([
          ...actual,
          {
            id: datos.etiqueta.id,
            nombre: datos.etiqueta.nombre,
            activo: true,
            notas: datos.etiqueta.notas,
            estado: datos.etiqueta.estado,
            estilo: "neutral",
            vigenteDesde: null,
            vigenteHasta: null,
          },
        ])
      );
      avisar.exito(
        datos.etiqueta.estado === "pendiente" ? `${datos.etiqueta.nombre} agregada — ya la puedes usar` : `Etiqueta ${datos.etiqueta.nombre} agregada`,
        datos.etiqueta.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder la apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function aprobar(e: Etiqueta) {
    setAprobandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, estado: "aprobado" as const, activo: true } : x))));
      avisar.exito(`${e.nombre} aprobada`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(e: Etiqueta) {
    setRechazandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${e.nombre} rechazada`, { detalle: "Cae a Desactivadas. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  async function reactivar(e: Etiqueta) {
    setCambiandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e.estado === "rechazado" ? { id: e.id, estado: "aprobado" } : { id: e.id, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${e.nombre} reactivada`, { detalle: "Vuelve a aparecer al etiquetar una variante." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  async function desactivar(e: Etiqueta) {
    setCambiandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false } : x))));
      avisar.exito(`${e.nombre} desactivada`, { detalle: "Deja de aparecer al etiquetar una variante nueva; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Filtrar etiquetas" className="flex flex-wrap items-center gap-1.5">
          <BotonFiltro activo={grupo === "todas"} onClick={() => { setGrupo("todas"); setAnimar(true); }} cuenta={activas.length}>
            Todas
          </BotonFiltro>
          {gruposConEtiquetas.map((g) => (
            <BotonFiltro
              key={g}
              activo={grupo === g}
              onClick={() => { setGrupo(grupo === g ? "todas" : g); setAnimar(true); }}
              cuenta={activas.filter((e) => e.estilo === g).length}
            >
              {ESTILOS[g].grupo}
            </BotonFiltro>
          ))}
          {vigentesHoy > 0 && (
            <>
              <span aria-hidden className="mx-1 hidden h-4 w-px bg-tinta/15 sm:block" />
              <BotonFiltro
                activo={soloVigentes}
                onClick={() => { setSoloVigentes((v) => !v); setAnimar(true); }}
                cuenta={vigentesHoy}
                punto="bg-verde"
              >
                Vigentes hoy
              </BotonFiltro>
            </>
          )}
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
              aria-label="Buscar etiqueta"
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
            + Agregar etiqueta
          </button>
        </div>
      </div>

      {hayFiltros && activasVisibles.length + desactivadasVisibles.length === 0 && (
        <div className="card-cayla flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-tinta/75">
            {q ? <>Ninguna etiqueta coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ninguna etiqueta cumple estos filtros."}
          </p>
          <Boton peso="discreto" className="px-3 py-1.5 text-[11px]" onClick={quitarFiltros}>
            Quitar filtros
          </Boton>
        </div>
      )}

      <div key={`${grupo}-${soloVigentes}`} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {ORDEN_GRUPOS.map((clave) => {
          const delGrupo = activasVisibles.filter((e) => e.estilo === clave);
          if (delGrupo.length === 0) return null;
          const { grupo: nombreGrupo, dot } = ESTILOS[clave];
          return (
            <section key={clave} className="space-y-3">
              <p className="label-cayla flex items-center gap-1.5 text-[11px] text-tinta/65">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                {nombreGrupo}
                <span className="font-normal tabular-nums text-tinta/40">{delGrupo.length}</span>
              </p>
              <div className={GRILLA}>
                {delGrupo.map((e) => (
                  <TarjetaEtiqueta key={e.id} e={e} vigencia={vigenciaEn(e)}>
                    {puedeEditar &&
                      (e.estado === "pendiente" ? (
                        <div className="flex gap-2 px-1 pb-1">
                          <Boton peso="primario" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={aprobandoId === e.id} onClick={() => aprobar(e)}>
                            Aprobar
                          </Boton>
                          <Boton
                            peso="discreto"
                            className="flex-1 px-2.5 py-1.5 text-[11px] text-rojo"
                            onClick={() => {
                              setRechazandoAbierto(e.id);
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
                        <div className="flex justify-end px-1 pb-0.5 opacity-0 transition-opacity duration-200 group-hover/etq:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                          <button
                            type="button"
                            disabled={cambiandoId === e.id}
                            onClick={() => desactivar(e)}
                            className="label-cayla text-[10px] text-tinta/55 underline-offset-4 transition-colors hover:text-tinta hover:underline disabled:opacity-50"
                          >
                            {cambiandoId === e.id ? "Desactivando…" : "Desactivar"}
                          </button>
                        </div>
                      ))}
                  </TarjetaEtiqueta>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {desactivadasVisibles.length > 0 && (
        <section className="space-y-3">
          <p className="label-cayla text-[11px] text-tinta/65">
            Desactivadas — ya no se pueden aplicar a una variante nueva
            <span className="ml-1.5 font-normal tabular-nums text-tinta/40">{desactivadasVisibles.length}</span>
          </p>
          <div className={GRILLA}>
            {desactivadasVisibles.map((e) => (
              <TarjetaEtiqueta key={e.id} e={e} vigencia={null} apagada>
                {puedeEditar && (
                  <div className="px-1 pb-1">
                    <Boton peso="discreto" className="w-full px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === e.id} onClick={() => reactivar(e)}>
                      Reactivar
                    </Boton>
                  </div>
                )}
              </TarjetaEtiqueta>
            ))}
          </div>
        </section>
      )}

      {agregando && (
        <Modal titulo="Nueva etiqueta" subtitulo="Queda disponible de inmediato para cualquier variante." ancho="max-w-sm" onClose={() => setAgregando(false)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Nombre de la etiqueta" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Oferta, Verano 2026" autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton peso="primario" className="flex-1" onClick={guardar} cargando={guardando} disabled={!nombre.trim()}>
                  Guardar etiqueta
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {rechazandoEtiqueta && (
        <Modal titulo={`Rechazar «${rechazandoEtiqueta.nombre}»`} ancho="max-w-sm" onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoId === rechazandoEtiqueta.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoId === rechazandoEtiqueta.id}
                  onClick={() => rechazar(rechazandoEtiqueta)}
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
