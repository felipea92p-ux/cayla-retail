"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { useResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { MuestraTejido } from "@/components/MuestraTejido";
import { BOTON_TARJETA_MUESTRA, DetalleMuestraModal, PieTarjetaMuestra } from "@/components/DetalleMuestraModal";
import type { ColorDibujo } from "@/lib/dibujo-generado";

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

  const activos = tejidos.filter((t) => t.activo);
  const desactivados = tejidos.filter((t) => !t.activo);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span />
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
        >
          + Agregar tejido
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {activos.map((t) => (
          <div
            key={t.id}
            className="card-cayla flex flex-col gap-2 p-4 transition-transform duration-260 ease-cayla hover:-translate-y-0.5 hover:shadow-md"
          >
            <button type="button" onClick={() => abrirDetalle(t.id)} title="Ver la foto y las prendas" className={BOTON_TARJETA_MUESTRA}>
              <MuestraTejido nombre={t.nombre} imagenUrl={t.imagenUrl} />
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-tinta">{t.nombre}</span>
                {t.estado === "pendiente" && (
                  <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
                )}
              </span>
              <PieTarjetaMuestra prendas={prendasPorId[t.id] ?? 0} />
            </button>
            {puedeEditar && (
              <div className="flex gap-2">
                {t.estado === "pendiente" && (
                  <Boton peso="primario" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={aprobandoId === t.id} onClick={() => setConfirmando(confirmacionCatalogo("aprobar", t.nombre, () => aprobar(t)))}>
                    Aprobar
                  </Boton>
                )}
                {t.estado === "pendiente" ? (
                  <Boton
                    peso="discreto"
                    className="flex-1 px-2.5 py-1.5 text-[11px] text-rojo"
                    onClick={() => {
                      setRechazandoAbierto(t.id);
                      setMotivoRechazo("");
                    }}
                  >
                    Rechazar
                  </Boton>
                ) : (
                  <Boton peso="discreto" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === t.id} onClick={() => setConfirmando(confirmacionCatalogo("desactivar", t.nombre, () => desactivar(t)))}>
                    Desactivar
                  </Boton>
                )}
              </div>
            )}
          </div>
        ))}
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

      {desactivados.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no se pueden elegir en un producto nuevo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {desactivados.map((t) => (
              <div key={t.id} className="card-cayla flex flex-col gap-2 p-4 opacity-60">
                <button type="button" onClick={() => abrirDetalle(t.id)} title="Ver la foto y las prendas" className={BOTON_TARJETA_MUESTRA}>
                  <MuestraTejido nombre={t.nombre} imagenUrl={t.imagenUrl} />
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-tinta">{t.nombre}</span>
                    {t.estado === "rechazado" && (
                      <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazado</span>
                    )}
                  </span>
                  <PieTarjetaMuestra prendas={prendasPorId[t.id] ?? 0} />
                </button>
                {puedeEditar && (
                  <Boton peso="discreto" className="px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === t.id} onClick={() => setConfirmando(confirmacionCatalogo("reactivar", t.nombre, () => reactivar(t)))}>
                    Reactivar
                  </Boton>
                )}
              </div>
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
        />
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={responsable} onClose={() => setConfirmando(null)} />}
    </div>
  );
}
