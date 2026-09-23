"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { MuestraPatron } from "@/components/MuestraPatron";

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
};

function ordenar(lista: Patron[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function PatronesLista({ patronesIniciales, puedeEditar }: { patronesIniciales: Patron[]; puedeEditar: boolean }) {
  // Cambiar el vocabulario es Catálogo, operación de tienda (ADR-0161): UN combo «Responsable» firma todo lo que se
  // guarda desde esta lista (arriba; el mismo se repite en cada modal) y cada guardado exitoso lo vacía.
  const responsable = useResponsable();
  const [patrones, setPatrones] = useState(() => ordenar(patronesIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  const activos = patrones.filter((p) => p.activo);
  const desactivados = patrones.filter((p) => !p.activo);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/patrones", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ nombre }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar el patrón.");
        return;
      }
      setPatrones((actual) =>
        ordenar([...actual, { id: datos.patron.id, nombre: datos.patron.nombre, activo: true, notas: datos.patron.notas, estado: datos.patron.estado }])
      );
      responsable.despues(null);
      avisar.exito(
        datos.patron.estado === "pendiente" ? `${datos.patron.nombre} agregado — ya lo puedes usar` : `Patrón ${datos.patron.nombre} agregado`,
        datos.patron.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder lo apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setNombre("");
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: p.id, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, estado: "aprobado" as const, activo: true } : x))));
      responsable.despues(null);
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: p.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      responsable.despues(null);
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify(p.estado === "rechazado" ? { id: p.id, estado: "aprobado" } : { id: p.id, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      responsable.despues(null);
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
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: p.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar el patrón.");
        return;
      }
      setPatrones((actual) => ordenar(actual.map((x) => (x.id === p.id ? { ...x, activo: false } : x))));
      responsable.despues(null);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        {puedeEditar ? <ComboResponsable control={responsable} hacia="abajo" className="w-full max-w-xs" /> : <span />}
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
            <MuestraPatron nombre={p.nombre} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-tinta">{p.nombre}</p>
              {p.estado === "pendiente" && (
                <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
              )}
            </div>
            {puedeEditar && (
              <div className="flex gap-2">
                {p.estado === "pendiente" && (
                  <Boton peso="primario" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={aprobandoId === p.id} disabled={!responsable.listo} title={responsable.motivo ?? undefined} onClick={() => aprobar(p)}>
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
                  <Boton peso="discreto" className="flex-1 px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === p.id} disabled={!responsable.listo} title={responsable.motivo ?? undefined} onClick={() => desactivar(p)}>
                    Desactivar
                  </Boton>
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

      {rechazandoPatron && (
        <Modal titulo={`Rechazar «${rechazandoPatron.nombre}»`} ancho="max-w-sm" onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <ComboResponsable control={responsable} deshabilitado={rechazandoId === rechazandoPatron.id} />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoId === rechazandoPatron.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoId === rechazandoPatron.id}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? undefined}
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
                <MuestraPatron nombre={p.nombre} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-tinta">{p.nombre}</p>
                  {p.estado === "rechazado" && (
                    <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazado</span>
                  )}
                </div>
                {puedeEditar && (
                  <Boton peso="discreto" className="px-2.5 py-1.5 text-[11px]" cargando={cambiandoId === p.id} disabled={!responsable.listo} title={responsable.motivo ?? undefined} onClick={() => reactivar(p)}>
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
