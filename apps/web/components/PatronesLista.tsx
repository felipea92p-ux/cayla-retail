"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
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
  VocabularioVacio,
} from "@/components/atributos/kit";
import { MuestraPatron } from "@/components/MuestraPatron";
import { DetalleMuestraModal, PieTarjetaMuestra } from "@/components/DetalleMuestraModal";
import type { ColorDibujo } from "@/lib/dibujo-generado";
import { filtrarPorNombre, GRUPOS_USO, ORDEN_USO, usoDe, type UsoAtributo } from "@/lib/atributos-buscar";

/**
 * Vocabulario cerrado de patrones (ADR-0095/0096) — mismo mecanismo que
 * Colores: cualquiera con sesión propone, cualquiera de los Líderes aprueba
 * o rechaza. A diferencia de Colores, patrón no tiene código de 3 letras
 * (no se inyecta en el código de barras — es atributo del PRODUCTO, no de
 * la variante), ni hex/tipo/muestra: solo un nombre y el candado de clave
 * única normalizada que ya hace `fn_clave_texto` en la base.
 */

type Patron = {
  id: string;
  nombre: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  /** La foto real (ADR-0256); `null` = el dibujo que sale del nombre. */
  imagenUrl: string | null;
  /** La frase de «Generar dibujo» guardada la última vez; `null` = nunca se describió. */
  descripcionDibujo: string | null;
};

function ordenar(lista: Patron[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function PatronesLista({
  patronesIniciales,
  puedeEditar,
  prendasPorId,
  veProductos,
  colores,
}: {
  patronesIniciales: Patron[];
  puedeEditar: boolean;
  /** Cuántos productos usan cada uno (activos y descontinuados): lo que dice cada tarjeta. */
  prendasPorId: Record<string, number>;
  /** Solo quien ve Productos llega, desde el detalle, a la ficha de cada prenda. */
  veProductos: boolean;
  /** Los colores activos del catálogo: con ellos pinta el generador de dibujos. */
  colores: readonly ColorDibujo[];
}) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const [patrones, setPatrones] = useState(() => ordenar(patronesIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  // El detalle (foto + prendas, ADR-0256) se abre con un clic en la tarjeta.
  const [detalleId, setDetalleId] = useState<string | null>(null);
  // Al crear con una descripción, el detalle abre con el generador ya propuesto desde esa frase (opcional).
  const [descripcion, setDescripcion] = useState("");
  const [generarCon, setGenerarCon] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // «En uso · Sin prendas» (ADR-0261): la píldora elegida. La grilla solo se re-asienta cuando la persona cambia un
  // filtro, nunca al cargar la pantalla: el movimiento responde a una acción (ver globals.css).
  const [uso, setUso] = useState<UsoAtributo | "todos">("todos");
  const [animar, setAnimar] = useState(false);

  const activos = patrones.filter((p) => p.activo);
  const desactivados = patrones.filter((p) => !p.activo);
  const pasaUso = (p: { id: string }) => uso === "todos" || usoDe(p.id, prendasPorId) === uso;
  const activosVisibles = filtrarPorNombre(activos, busqueda).filter(pasaUso);
  const desactivadosVisibles = filtrarPorNombre(desactivados, busqueda).filter(pasaUso);
  const hayFiltros = uso !== "todos" || busqueda.trim() !== "";
  const quitarFiltros = () => {
    setUso("todos");
    setBusqueda("");
    setAnimar(true);
  };
  const usosConAlgo = ORDEN_USO.filter((u) => activos.some((p) => usoDe(p.id, prendasPorId) === u));

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ nombre, ...(puedeEditar && descripcion.trim() ? { descripcion: descripcion.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar el patrón.");
        return;
      }
      setPatrones((actual) =>
        ordenar([
          ...actual,
          {
            id: datos.patron.id,
            nombre: datos.patron.nombre,
            activo: true,
            notas: datos.patron.notas,
            estado: datos.patron.estado,
            imagenUrl: null,
            descripcionDibujo: datos.patron.descripcion_dibujo ?? null,
          },
        ])
      );
      responsable.despues(null);
      avisar.exito(
        datos.patron.estado === "pendiente" ? `${datos.patron.nombre} agregado — ya lo puedes usar` : `Patrón ${datos.patron.nombre} agregado`,
        datos.patron.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder lo apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
      if (puedeEditar && descripcion.trim()) {
        setGenerarCon(descripcion.trim());
        setDetalleId(datos.patron.id);
      }
      setDescripcion("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function aprobar(p: Patron) {
    setAprobandoId(p.id);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify({ id: p.id, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, estado: "aprobado" as const, activo: true } : x))));
      avisar.exito(`${p.nombre} aprobado`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(p: Patron) {
    setRechazandoId(p.id);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("patron_rechazar") },
        body: JSON.stringify({ id: p.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${p.nombre} rechazado`, { detalle: "Cae a Desactivados. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  async function reactivar(p: Patron) {
    setCambiandoId(p.id);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify(p.estado === "rechazado" ? { id: p.id, estado: "aprobado" } : { id: p.id, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${p.nombre} reactivado`, { detalle: "Vuelve a aparecer al elegir patrón en un producto." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  async function desactivar(p: Patron) {
    setCambiandoId(p.id);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify({ id: p.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, activo: false } : x))));
      avisar.exito(`${p.nombre} desactivado`, { detalle: "Deja de aparecer al elegir patrón en un producto nuevo; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  const rechazandoPatron = patrones.find((p) => p.id === rechazandoAbierto) ?? null;
  function abrirDetalle(id: string) {
    setGenerarCon(null);
    setDetalleId(id);
  }

  const detalle = patrones.find((x) => x.id === detalleId) ?? null;

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta="Filtrar patrones"
        filtros={
          <>
            <BotonFiltro activo={uso === "todos"} onClick={() => { setUso("todos"); setAnimar(true); }} cuenta={activos.length}>
              Todos
            </BotonFiltro>
            {usosConAlgo.map((u) => (
              <BotonFiltro
                key={u}
                activo={uso === u}
                onClick={() => { setUso(uso === u ? "todos" : u); setAnimar(true); }}
                cuenta={activos.filter((p) => usoDe(p.id, prendasPorId) === u).length}
              >
                {GRUPOS_USO[u].grupo}
              </BotonFiltro>
            ))}
          </>
        }
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: "Buscar patrón", placeholder: "Buscar patrón" }}
        agregar={{ texto: "+ Agregar patrón", onClick: () => setAgregando(true) }}
      />

      {activos.length + desactivados.length === 0 && (
        <VocabularioVacio>Todavía no hay patrones en el vocabulario. Agrega el primero con «+ Agregar patrón».</VocabularioVacio>
      )}

      {hayFiltros && activosVisibles.length + desactivadosVisibles.length === 0 && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {busqueda.trim() ? <>Ningún patrón coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ningún patrón cumple estos filtros."}
        </SinCoincidencias>
      )}

      <div key={uso} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {ORDEN_USO.map((clave) => {
          const delGrupo = activosVisibles.filter((p) => usoDe(p.id, prendasPorId) === clave);
          if (delGrupo.length === 0) return null;
          return (
            <section key={clave} className="space-y-3">
              <TituloGrupo punto={GRUPOS_USO[clave].punto} cuenta={delGrupo.length}>
                {GRUPOS_USO[clave].grupo}
              </TituloGrupo>
              <div className={GRILLA_ATRIBUTOS}>
                {delGrupo.map((p) => (
                  <TarjetaAtributo
            key={p.id}
            muestra={<MuestraPatron nombre={p.nombre} imagenUrl={p.imagenUrl} />}
            nombre={p.nombre}
            insignia={p.estado === "pendiente" ? "Pendiente" : null}
            detalle={<PieTarjetaMuestra prendas={prendasPorId[p.id] ?? 0} />}
            abrir={{ onClick: () => abrirDetalle(p.id), titulo: "Ver la foto y las prendas" }}
          >
                    {puedeEditar &&
                      (p.estado === "pendiente" ? (
                        <BotonesPendiente
                          aprobando={aprobandoId === p.id}
                          onAprobar={() => setConfirmando(confirmacionCatalogo("aprobar", p.nombre, () => aprobar(p)))}
                          onRechazar={() => {
                            setRechazandoAbierto(p.id);
                            setMotivoRechazo("");
                          }}
                        />
                      ) : (
                        <PieTarjeta>
                          <DesactivarTarjeta
                            cambiando={cambiandoId === p.id}
                            onClick={() => setConfirmando(confirmacionCatalogo("desactivar", p.nombre, () => desactivar(p)))}
                          />
                        </PieTarjeta>
                      ))}
                  </TarjetaAtributo>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {agregando && (
        <NuevoPatronModal
          nombre={nombre}
          onNombre={setNombre}
          descripcion={descripcion}
          onDescripcion={setDescripcion}
          conDescripcion={puedeEditar}
          responsable={responsable}
          guardando={guardando}
          onGuardar={guardar}
          onClose={() => setAgregando(false)}
        />
      )}

      {rechazandoPatron && (
        <Modal titulo={`Rechazar «${rechazandoPatron.nombre}»`} ancho="max-w-sm" onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoId === rechazandoPatron.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoId === rechazandoPatron.id}
                  onClick={() => rechazar(rechazandoPatron)}
                >
                  Confirmar rechazo
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {desactivadosVisibles.length > 0 && (
        <section className="space-y-3">
          <TituloGrupo cuenta={desactivadosVisibles.length}>Desactivados — ya no se pueden elegir en un producto nuevo</TituloGrupo>
          <div className={GRILLA_ATRIBUTOS}>
            {desactivadosVisibles.map((p) => (
              <TarjetaAtributo
                key={p.id}
                muestra={<MuestraPatron nombre={p.nombre} imagenUrl={p.imagenUrl} />}
                nombre={p.nombre}
                insignia={p.estado === "rechazado" ? "Rechazado" : null}
                detalle={<PieTarjetaMuestra prendas={prendasPorId[p.id] ?? 0} />}
                abrir={{ onClick: () => abrirDetalle(p.id), titulo: "Ver la foto y las prendas" }}
                apagada
              >
                {puedeEditar && (
                  <BotonReactivar
                    cambiando={cambiandoId === p.id}
                    onClick={() => setConfirmando(confirmacionCatalogo("reactivar", p.nombre, () => reactivar(p)))}
                  />
                )}
              </TarjetaAtributo>
            ))}
          </div>
        </section>
      )}

      {detalle && (
        <DetalleMuestraModal
          tipo="patron"
          muestra={detalle}
          puedeEditar={puedeEditar}
          veProductos={veProductos}
          colores={colores}
          generarCon={generarCon}
          onClose={() => {
            setDetalleId(null);
            setGenerarCon(null);
          }}
          onImagen={(id, url, descripcionDibujo) =>
            setPatrones((actual) => actual.map((x) => (x.id === id ? { ...x, imagenUrl: url, ...(descripcionDibujo !== undefined ? { descripcionDibujo } : {}) } : x)))
          }
        />
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

/**
 * La ventana de agregar patrón. Su guía de foco (CLAUDE.md «Guía de foco») sale de lo que ya apaga el botón: un nombre y alguien
 * que firma; la descripción del dibujo es opcional. Vive en su propio componente para que la guía nazca y muera con la ventana.
 */
function NuevoPatronModal({
  nombre,
  onNombre,
  descripcion,
  onDescripcion,
  conDescripcion,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  nombre: string;
  onNombre: (v: string) => void;
  descripcion: string;
  onDescripcion: (v: string) => void;
  /** Solo quien puede editar propone un dibujo desde una frase. */
  conDescripcion: boolean;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: () => void;
  onClose: () => void;
}) {
  const guia = useGuiaCampos([
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombre.trim() !== "", pendiente: "Escribe el nombre del patrón." },
    ...(conDescripcion ? [{ id: "descripcion", nombre: "Cómo se ve", requerido: false, hecho: descripcion.trim() !== "", pendiente: "" }] : []),
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  return (
    <Modal titulo="Nuevo patrón" subtitulo="Queda disponible de inmediato para cualquier producto nuevo." ancho="max-w-sm" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre del patrón")} value={nombre} onChange={(e) => onNombre(e.target.value)} placeholder="Ej. Rayado" autoFocus />
          </CampoGuiado>
          {conDescripcion && (
            <CampoGuiado id="descripcion" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("descripcion", "Cómo se ve (opcional)")}
                value={descripcion}
                onChange={(e) => onDescripcion(e.target.value)}
                placeholder="Ej. rayas azul marino finas sobre crudo"
                maxLength={120}
                pie="Si lo describes, te proponemos un dibujo con los colores del catálogo. Lo usas solo si te gusta."
              />
            </CampoGuiado>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              onClick={onGuardar}
              cargando={guardando}
              disabled={!nombre.trim() || !responsable.listo}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Guardar
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
