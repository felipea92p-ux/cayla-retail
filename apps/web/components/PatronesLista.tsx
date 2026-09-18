"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Muestra, SelectorMuestra } from "@/components/ui/MuestraVisual";
import { BUCKET_MUESTRAS_PATRONES } from "@/lib/muestra-visual";

/**
 * Vocabulario cerrado de patrones (ADR-0095/0096) — mismo mecanismo que
 * Colores: cualquiera con sesión propone, cualquiera de los Líderes aprueba
 * o rechaza. A diferencia de Colores, patrón no tiene código de 3 letras
 * (no se inyecta en el código de barras — es atributo del PRODUCTO, no de
 * la variante), ni hex/tipo: solo un nombre y el candado de clave única
 * normalizada que ya hace `fn_clave_texto` en la base.
 *
 * `imagenMuestraUrl` (20260918140000, pedido de Felipe: "sería ideal
 * ponerle su imagen referencial así como en colores") reusa el mismo
 * mecanismo de Colores (`components/ui/MuestraVisual.tsx`,
 * `lib/muestra-visual.ts`) — mismo bucket público, misma subida directa
 * navegador→bucket, distinto bucket de destino. Sin `hex` de respaldo:
 * el cuadro queda neutro (`Muestra` con `hex={null}`) hasta que alguien
 * sube la foto real.
 */

type Patron = {
  id: string;
  nombre: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  imagenMuestraUrl: string | null;
};

function ordenar(lista: Patron[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function PatronesLista({ patronesIniciales, puedeEditar }: { patronesIniciales: Patron[]; puedeEditar: boolean }) {
  const [patrones, setPatrones] = useState(() => ordenar(patronesIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [imagenMuestraUrl, setImagenMuestraUrl] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [imagenEditando, setImagenEditando] = useState<string | null>(null);
  const [guardandoImagen, setGuardandoImagen] = useState(false);

  const activos = patrones.filter((p) => p.activo);
  const desactivados = patrones.filter((p) => !p.activo);
  const patronEditando = patrones.find((p) => p.id === editandoId) ?? null;

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, imagenMuestraUrl }),
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
            imagenMuestraUrl: datos.patron.imagen_muestra_url,
          },
        ])
      );
      avisar.exito(
        datos.patron.estado === "pendiente" ? `${datos.patron.nombre} agregado — ya lo puedes usar` : `Patrón ${datos.patron.nombre} agregado`,
        datos.patron.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder lo apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
      setImagenMuestraUrl(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarImagen(p: Patron) {
    setGuardandoImagen(true);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, imagenMuestraUrl: imagenEditando }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar la muestra.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, imagenMuestraUrl: datos.patron.imagen_muestra_url } : x))));
      avisar.exito(`Muestra de ${p.nombre} actualizada`);
      setEditandoId(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardandoImagen(false);
    }
  }

  async function aprobar(p: Patron) {
    setAprobandoId(p.id);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
        >
          + Agregar patrón
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {activos.map((p) => (
          <div
            key={p.id}
            className="card-cayla flex flex-col gap-2 p-4 transition-transform duration-260 ease-cayla hover:-translate-y-0.5 hover:shadow-md"
          >
            <Muestra url={p.imagenMuestraUrl} hex={null} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-tinta">{p.nombre}</p>
              {p.estado === "pendiente" && (
                <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
              )}
            </div>
            {puedeEditar && (
              <div className="flex gap-2">
                {p.estado === "pendiente" && (
                  <Boton peso="primario" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={aprobandoId === p.id} onClick={() => aprobar(p)}>
                    Aprobar
                  </Boton>
                )}
                {p.estado === "pendiente" ? (
                  <Boton
                    peso="discreto"
                    className="flex-1 px-2.5 py-1.5 text-[11px] text-rojo"
                    onClick={() => {
                      setRechazandoAbierto(p.id);
                      setMotivoRechazo("");
                    }}
                  >
                    Rechazar
                  </Boton>
                ) : (
                  <>
                    <Boton
                      peso="discreto"
                      className="flex-1 px-2.5 py-1.5 text-[11px]"
                      onClick={() => {
                        setEditandoId(p.id);
                        setImagenEditando(p.imagenMuestraUrl);
                      }}
                    >
                      Editar
                    </Boton>
                    <Boton peso="discreto" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === p.id} onClick={() => desactivar(p)}>
                      Desactivar
                    </Boton>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {agregando && (
        <Modal titulo="Nuevo patrón" subtitulo="Queda disponible de inmediato para cualquier producto nuevo." ancho="max-w-sm" onClose={() => setAgregando(false)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Nombre del patrón" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Rayado" autoFocus />
              <div>
                <p className="label-cayla mb-1.5 text-[11px] text-tinta/65">Muestra (opcional)</p>
                <SelectorMuestra urlActual={imagenMuestraUrl} hex={null} bucket={BUCKET_MUESTRAS_PATRONES} onSubida={setImagenMuestraUrl} />
              </div>
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton peso="primario" className="flex-1" onClick={guardar} cargando={guardando} disabled={!nombre.trim()}>
                  Guardar
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {patronEditando && (
        <Modal titulo={`Muestra de «${patronEditando.nombre}»`} ancho="max-w-sm" onClose={() => setEditandoId(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <SelectorMuestra urlActual={imagenEditando} hex={null} bucket={BUCKET_MUESTRAS_PATRONES} onSubida={setImagenEditando} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardandoImagen}>
                  Cancelar
                </Boton>
                <Boton peso="primario" className="flex-1" onClick={() => guardarImagen(patronEditando)} cargando={guardandoImagen}>
                  Guardar
                </Boton>
              </div>
            </div>
          )}
        </Modal>
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

      {desactivados.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no se pueden elegir en un producto nuevo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {desactivados.map((p) => (
              <div key={p.id} className="card-cayla flex flex-col gap-2 p-4 opacity-60">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-tinta">{p.nombre}</p>
                  {p.estado === "rechazado" && (
                    <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazado</span>
                  )}
                </div>
                {puedeEditar && (
                  <Boton peso="discreto" className="px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === p.id} onClick={() => reactivar(p)}>
                    Reactivar
                  </Boton>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
