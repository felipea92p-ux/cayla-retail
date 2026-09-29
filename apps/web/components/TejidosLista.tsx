"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { useResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
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
import { MuestraTejido } from "@/components/MuestraTejido";
import { DetalleMuestraModal, PieTarjetaMuestra } from "@/components/DetalleMuestraModal";
import type { ColorDibujo } from "@/lib/dibujo-generado";
import { filtrarPorNombre, GRUPOS_USO, ORDEN_USO, usoDe, type UsoAtributo } from "@/lib/atributos-buscar";

/**
 * Vocabulario cerrado de tejidos (ADR-0095/0096) — mismo mecanismo que
 * Colores: cualquiera con sesión propone, cualquiera de los Líderes aprueba
 * o rechaza. A diferencia de Colores, tejido no tiene código de 3 letras
 * (no se inyecta en el código de barras — es atributo del PRODUCTO, no de
 * la variante), ni hex/tipo/muestra: solo un nombre y el candado de clave
 * única normalizada que ya hace `fn_clave_texto` en la base.
 */

type Tejido = {
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

function ordenar(lista: Tejido[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function TejidosLista({
  tejidosIniciales,
  puedeEditar,
  prendasPorId,
  veProductos,
  colores,
}: {
  tejidosIniciales: Tejido[];
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
  // con el combo adentro (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Cada guardado lo vuelve a como vino.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const [tejidos, setTejidos] = useState(() => ordenar(tejidosIniciales));
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

  const activos = tejidos.filter((t) => t.activo);
  const desactivados = tejidos.filter((t) => !t.activo);
  const pasaUso = (t: { id: string }) => uso === "todos" || usoDe(t.id, prendasPorId) === uso;
  const activosVisibles = filtrarPorNombre(activos, busqueda).filter(pasaUso);
  const desactivadosVisibles = filtrarPorNombre(desactivados, busqueda).filter(pasaUso);
  const hayFiltros = uso !== "todos" || busqueda.trim() !== "";
  const quitarFiltros = () => {
    setUso("todos");
    setBusqueda("");
    setAnimar(true);
  };
  const usosConAlgo = ORDEN_USO.filter((u) => activos.some((t) => usoDe(t.id, prendasPorId) === u));

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ nombre, ...(puedeEditar && descripcion.trim() ? { descripcion: descripcion.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar el tejido.");
        return;
      }
      setTejidos((actual) =>
        ordenar([
          ...actual,
          {
            id: datos.tejido.id,
            nombre: datos.tejido.nombre,
            activo: true,
            notas: datos.tejido.notas,
            estado: datos.tejido.estado,
            imagenUrl: null,
            descripcionDibujo: datos.tejido.descripcion_dibujo ?? null,
          },
        ])
      );
      responsable.despues(null);
      avisar.exito(
        datos.tejido.estado === "pendiente" ? `${datos.tejido.nombre} agregado — ya lo puedes usar` : `Tejido ${datos.tejido.nombre} agregado`,
        datos.tejido.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder lo apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
      if (puedeEditar && descripcion.trim()) {
        setGenerarCon(descripcion.trim());
        setDetalleId(datos.tejido.id);
      }
      setDescripcion("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function aprobar(t: Tejido) {
    setAprobandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: t.id, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, estado: "aprobado" as const, activo: true } : x))));
      responsable.despues(null);
      avisar.exito(`${t.nombre} aprobado`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(t: Tejido) {
    setRechazandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: t.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      responsable.despues(null);
      avisar.exito(`${t.nombre} rechazado`, { detalle: "Cae a Desactivados. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  async function reactivar(t: Tejido) {
    setCambiandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify(t.estado === "rechazado" ? { id: t.id, estado: "aprobado" } : { id: t.id, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      responsable.despues(null);
      avisar.exito(`${t.nombre} reactivado`, { detalle: "Vuelve a aparecer al elegir tejido en un producto." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  async function desactivar(t: Tejido) {
    setCambiandoId(t.id);
    try {
      const res = await fetch("/api/productos/tejidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: t.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar el tejido.");
        return;
      }
      setTejidos((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false } : x))));
      responsable.despues(null);
      avisar.exito(`${t.nombre} desactivado`, { detalle: "Deja de aparecer al elegir tejido en un producto nuevo; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  const rechazandoTejido = tejidos.find((t) => t.id === rechazandoAbierto) ?? null;
  function abrirDetalle(id: string) {
    setGenerarCon(null);
    setDetalleId(id);
  }

  const detalle = tejidos.find((x) => x.id === detalleId) ?? null;

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta="Filtrar tejidos"
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
                cuenta={activos.filter((t) => usoDe(t.id, prendasPorId) === u).length}
              >
                {GRUPOS_USO[u].grupo}
              </BotonFiltro>
            ))}
          </>
        }
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: "Buscar tejido", placeholder: "Buscar tejido" }}
        agregar={{ texto: "+ Agregar tejido", onClick: () => setAgregando(true) }}
      />

      {activos.length + desactivados.length === 0 && (
        <VocabularioVacio>Todavía no hay tejidos en el vocabulario. Agrega el primero con «+ Agregar tejido».</VocabularioVacio>
      )}

      {hayFiltros && activosVisibles.length + desactivadosVisibles.length === 0 && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {busqueda.trim() ? <>Ningún tejido coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ningún tejido cumple estos filtros."}
        </SinCoincidencias>
      )}

      <div key={uso} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {ORDEN_USO.map((clave) => {
          const delGrupo = activosVisibles.filter((t) => usoDe(t.id, prendasPorId) === clave);
          if (delGrupo.length === 0) return null;
          return (
            <section key={clave} className="space-y-3">
              <TituloGrupo punto={GRUPOS_USO[clave].punto} cuenta={delGrupo.length}>
                {GRUPOS_USO[clave].grupo}
              </TituloGrupo>
              <div className={GRILLA_ATRIBUTOS}>
                {delGrupo.map((t) => (
                  <TarjetaAtributo
            key={t.id}
            muestra={<MuestraTejido nombre={t.nombre} imagenUrl={t.imagenUrl} />}
            nombre={t.nombre}
            insignia={t.estado === "pendiente" ? "Pendiente" : null}
            detalle={<PieTarjetaMuestra prendas={prendasPorId[t.id] ?? 0} />}
            abrir={{ onClick: () => abrirDetalle(t.id), titulo: "Ver la foto y las prendas" }}
          >
                    {puedeEditar &&
                      (t.estado === "pendiente" ? (
                        <BotonesPendiente
                          aprobando={aprobandoId === t.id}
                          onAprobar={() => setConfirmando(confirmacionCatalogo("aprobar", t.nombre, () => aprobar(t)))}
                          onRechazar={() => {
                            setRechazandoAbierto(t.id);
                            setMotivoRechazo("");
                          }}
                        />
                      ) : (
                        <PieTarjeta>
                          <DesactivarTarjeta
                            cambiando={cambiandoId === t.id}
                            onClick={() => setConfirmando(confirmacionCatalogo("desactivar", t.nombre, () => desactivar(t)))}
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
        <Modal titulo="Nuevo tejido" subtitulo="Queda disponible de inmediato para cualquier producto nuevo." ancho="max-w-sm" onClose={() => setAgregando(false)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Nombre del tejido" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Algodón" autoFocus />
              {puedeEditar && (
                <CampoTexto
                  etiqueta="Cómo se ve (opcional)"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej. denim azul claro, grueso"
                  maxLength={120}
                  pie="Si lo describes, te proponemos un dibujo con los colores del catálogo. Lo usas solo si te gusta."
                />
              )}
              <ComboResponsable control={responsable} deshabilitado={guardando} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton peso="primario" className="flex-1" onClick={guardar} cargando={guardando} disabled={!nombre.trim() || !responsable.listo} title={responsable.motivo ?? undefined}>
                  Guardar
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {rechazandoTejido && (
        <Modal titulo={`Rechazar «${rechazandoTejido.nombre}»`} ancho="max-w-sm" onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <ComboResponsable control={responsable} deshabilitado={rechazandoId === rechazandoTejido.id} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoId === rechazandoTejido.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoId === rechazandoTejido.id}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? undefined}
                  onClick={() => rechazar(rechazandoTejido)}
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
            {desactivadosVisibles.map((t) => (
              <TarjetaAtributo
                key={t.id}
                muestra={<MuestraTejido nombre={t.nombre} imagenUrl={t.imagenUrl} />}
                nombre={t.nombre}
                insignia={t.estado === "rechazado" ? "Rechazado" : null}
                detalle={<PieTarjetaMuestra prendas={prendasPorId[t.id] ?? 0} />}
                abrir={{ onClick: () => abrirDetalle(t.id), titulo: "Ver la foto y las prendas" }}
                apagada
              >
                {puedeEditar && (
                  <BotonReactivar
                    cambiando={cambiandoId === t.id}
                    onClick={() => setConfirmando(confirmacionCatalogo("reactivar", t.nombre, () => reactivar(t)))}
                  />
                )}
              </TarjetaAtributo>
            ))}
          </div>
        </section>
      )}

      {detalle && (
        <DetalleMuestraModal
          tipo="tejido"
          muestra={detalle}
          puedeEditar={puedeEditar}
          veProductos={veProductos}
          responsable={responsable}
          colores={colores}
          generarCon={generarCon}
          onClose={() => {
            setDetalleId(null);
            setGenerarCon(null);
          }}
          onImagen={(id, url, descripcionDibujo) =>
            setTejidos((actual) => actual.map((x) => (x.id === id ? { ...x, imagenUrl: url, ...(descripcionDibujo !== undefined ? { descripcionDibujo } : {}) } : x)))
          }
          onRenombrado={(id, nombre) => setTejidos((actual) => ordenar(actual.map((x) => (x.id === id ? { ...x, nombre } : x))))}
        />
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={responsable} onClose={() => setConfirmando(null)} />}
    </div>
  );
}
