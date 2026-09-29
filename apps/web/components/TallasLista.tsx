"use client";

import { useState, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { useResponsable } from "@/lib/useResponsable";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import {
  BarraAtributos,
  BotonesPendiente,
  BotonReactivar,
  DesactivarTarjeta,
  GRILLA_ATRIBUTOS,
  PieTarjeta,
  SinCoincidencias,
  TarjetaAtributo,
  TituloGrupo,
  VistaRapidaAtributo,
} from "@/components/atributos/kit";
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

/** La tarjeta de una talla: la de las seis pestañas de Atributos (`components/atributos/kit.tsx`). */
function TarjetaTalla({ t, apagada = false, abrir, children }: { t: Talla; apagada?: boolean; abrir?: { onClick: () => void; titulo: string }; children?: ReactNode }) {
  return (
    <TarjetaAtributo
      muestra={<MuestraTalla valor={t.valor} estilo={TIPOS[tipoDeTalla(t.valor)].estilo} />}
      nombre={t.valor}
      notas={t.estado !== "rechazado" && !abrir ? t.notas : null}
      insignia={t.estado === "pendiente" ? "Pendiente" : t.estado === "rechazado" ? "Rechazada" : null}
      apagada={apagada}
      abrir={abrir}
    >
      {children}
    </TarjetaAtributo>
  );
}

export function TallasLista({ tallasIniciales, puedeEditar }: { tallasIniciales: Talla[]; puedeEditar: boolean }) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // con el combo adentro (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Cada guardado lo vuelve a como vino.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
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

  // Vista rápida antes de Editar (ADR-0261 extendido), y el nuevo «Editar nombre» — antes esta pestaña solo
  // tenía Desactivar/Reactivar, sin forma de corregir un valor mal tipeado.
  const [viendo, setViendo] = useState<Talla | null>(null);
  const [editando, setEditando] = useState<Talla | null>(null);
  const [nuevoValor, setNuevoValor] = useState("");
  const [editandoGuardando, setEditandoGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
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
      responsable.despues(null);
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: t.id, estado: "aprobado", notas: comentarioAprobar.trim() }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, estado: "aprobado" as const, activo: true, notas: datos.talla.notas } : x))));
      responsable.despues(null);
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: t.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      responsable.despues(null);
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: t.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false } : x))));
      responsable.despues(null);
      avisar.exito(`${t.valor} desactivada`, { detalle: "Deja de aparecer al elegir talla en una prenda nueva; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  // Editar nombre (ADR-0261 extendido): corrige un typo sin desactivar y crear de nuevo, algo que hoy Tallas
  // no ofrecía (solo Desactivar/Reactivar). El endpoint ya lo soporta (`patch.valor`).
  async function editarValor(t: Talla) {
    const valor = nuevoValor.trim();
    if (!valor) return;
    setEditandoGuardando(true);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: t.id, valor }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, valor: datos.talla.valor } : x))));
      responsable.despues(null);
      avisar.exito(`${datos.talla.valor} guardada`);
      setEditando(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setEditandoGuardando(false);
    }
  }

  const aprobandoTalla = tallas.find((t) => t.id === aprobandoAbierto) ?? null;
  const rechazandoTalla = tallas.find((t) => t.id === rechazandoAbierto) ?? null;

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta="Filtrar tallas"
        filtros={
          <>
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
          </>
        }
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: "Buscar talla", placeholder: "Buscar talla" }}
        agregar={{ texto: "+ Agregar talla", onClick: () => setAgregando(true) }}
      />

      {hayFiltros && activosVisibles.length + desactivadosVisibles.length === 0 && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {q ? <>Ninguna talla coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ninguna talla cumple estos filtros."}
        </SinCoincidencias>
      )}

      <div key={tipo} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {ORDEN_TIPOS.map((clave) => {
          const delTipo = activosVisibles.filter((t) => tipoDeTalla(t.valor) === clave);
          if (delTipo.length === 0) return null;
          const { grupo, dot } = TIPOS[clave];
          return (
            <section key={clave} className="space-y-3">
              <TituloGrupo punto={dot} cuenta={delTipo.length}>
                {grupo}
              </TituloGrupo>
              <div className={GRILLA_ATRIBUTOS}>
                {delTipo.map((t) => (
                  <TarjetaTalla
                    key={t.id}
                    t={t}
                    abrir={t.estado === "aprobado" ? { onClick: () => setViendo(t), titulo: `Ver ${t.valor}` } : undefined}
                  >
                    {puedeEditar &&
                      (t.estado === "pendiente" ? (
                        <BotonesPendiente
                          onAprobar={() => {
                            setAprobandoAbierto(t.id);
                            setComentarioAprobar("");
                          }}
                          onRechazar={() => {
                            setRechazandoAbierto(t.id);
                            setMotivoRechazo("");
                          }}
                        />
                      ) : (
                        <PieTarjeta>
                          <DesactivarTarjeta
                            cambiando={cambiandoId === t.id}
                            onClick={() => setConfirmando(confirmacionCatalogo("desactivar", t.valor, () => desactivar(t)))}
                          />
                        </PieTarjeta>
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
          <TituloGrupo cuenta={desactivadosVisibles.length}>Desactivadas — ya no se pueden elegir en una prenda nueva</TituloGrupo>
          <div className={GRILLA_ATRIBUTOS}>
            {desactivadosVisibles.map((t) => (
              <TarjetaTalla key={t.id} t={t} apagada>
                {puedeEditar && <BotonReactivar onClick={() => abrirReactivar(t)} />}
              </TarjetaTalla>
            ))}
          </div>
        </section>
      )}

      {viendo && (
        <VistaRapidaAtributo
          titulo={viendo.valor}
          muestra={<MuestraTalla valor={viendo.valor} estilo={TIPOS[tipoDeTalla(viendo.valor)].estilo} className="aspect-[3/1] w-full" />}
          accion={{
            texto: "Editar",
            onClick: () => {
              setEditando(viendo);
              setNuevoValor(viendo.valor);
              setViendo(null);
            },
          }}
          onClose={() => setViendo(null)}
        >
          {viendo.notas && <p className="text-xs text-tinta/65">{viendo.notas}</p>}
        </VistaRapidaAtributo>
      )}

      {editando && (
        <Modal titulo={`Editar «${editando.valor}»`} ancho="max-w-sm" onClose={() => setEditando(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Valor de la talla" value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} autoFocus />
              <ComboResponsable control={responsable} deshabilitado={editandoGuardando} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={editandoGuardando}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={editandoGuardando}
                  disabled={!nuevoValor.trim() || !responsable.listo}
                  title={responsable.motivo ?? undefined}
                  onClick={() => editarValor(editando)}
                >
                  Guardar
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {agregando && (
        <Modal titulo="Nueva talla" subtitulo="Queda disponible de inmediato para cualquier prenda nueva." ancho="max-w-sm" onClose={() => setAgregando(false)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Valor de la talla" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej. M, 38, XSS" autoFocus />
              <ComboResponsable control={responsable} deshabilitado={guardando} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton peso="primario" className="flex-1" onClick={guardar} cargando={guardando} disabled={!valor.trim() || !responsable.listo} title={responsable.motivo ?? undefined}>
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
              <ComboResponsable control={responsable} deshabilitado={aprobandoId === aprobandoTalla.id} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={aprobandoId === aprobandoTalla.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={aprobandoId === aprobandoTalla.id}
                  disabled={!comentarioAprobar.trim() || !responsable.listo}
                  title={responsable.motivo ?? undefined}
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
              <ComboResponsable control={responsable} deshabilitado={rechazandoId === rechazandoTalla.id} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoId === rechazandoTalla.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoId === rechazandoTalla.id}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? undefined}
                  onClick={() => rechazar(rechazandoTalla)}
                >
                  Confirmar rechazo
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={responsable} onClose={() => setConfirmando(null)} />}
    </div>
  );
}
