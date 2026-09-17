"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";

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

function ordenar(lista: Talla[]) {
  return [...lista].sort((a, b) => a.valor.localeCompare(b.valor, "es", { numeric: true }));
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

  const activos = tallas.filter((t) => t.activo);
  const desactivados = tallas.filter((t) => !t.activo);

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

  return (
    <div className="space-y-6">
      {agregando ? (
        <div className="card-cayla flex items-end gap-2 p-4">
          <CampoTexto
            etiqueta="Valor de la talla"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ej. M, 38, XSS"
            className="flex-1"
            autoFocus
          />
          <Boton peso="primario" className="px-4 py-2.5" onClick={guardar} cargando={guardando} disabled={!valor.trim()}>
            Guardar
          </Boton>
          <Boton peso="fantasma" className="px-4 py-2.5" onClick={() => setAgregando(false)} disabled={guardando}>
            Cancelar
          </Boton>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            + Agregar talla
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {activos.map((t) => (
          <div key={t.id} className="card-cayla flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium text-tinta">{t.valor}</p>
              {t.estado === "pendiente" && (
                <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-1.5 py-0.5 text-[9px] text-rojo">Pendiente</span>
              )}
            </div>
            {puedeEditar && t.estado === "pendiente" && (
              <div className="flex gap-1.5">
                <Boton
                  peso="primario"
                  className="flex-1 px-2 py-1.5 text-[11px]"
                  onClick={() => {
                    setAprobandoAbierto(aprobandoAbierto === t.id ? null : t.id);
                    setComentarioAprobar("");
                  }}
                >
                  Aprobar
                </Boton>
                <Boton
                  peso="discreto"
                  className="flex-1 px-2 py-1.5 text-[11px] text-rojo"
                  onClick={() => {
                    setRechazandoAbierto(rechazandoAbierto === t.id ? null : t.id);
                    setMotivoRechazo("");
                  }}
                >
                  Rechazar
                </Boton>
              </div>
            )}
            {puedeEditar && t.estado !== "pendiente" && (
              <Boton peso="discreto" className="px-2 py-1.5 text-[11px]" cargando={cambiandoId === t.id} onClick={() => desactivar(t)}>
                Desactivar
              </Boton>
            )}
            {aprobandoAbierto === t.id && (
              <div className="space-y-1.5 border-t border-tinta/10 pt-2">
                <input
                  autoFocus
                  value={comentarioAprobar}
                  onChange={(e) => setComentarioAprobar(e.target.value)}
                  placeholder="Comentario (obligatorio)"
                  className="w-full border-b border-tinta/25 bg-transparent px-0.5 py-1 text-[11px] text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
                />
                <p className="text-[10px] text-tinta/55">A qué categoría aplica, por qué es distinta de las que ya existen.</p>
                <Boton
                  peso="primario"
                  className="w-full px-2.5 py-1.5 text-[11px]"
                  cargando={aprobandoId === t.id}
                  disabled={!comentarioAprobar.trim()}
                  onClick={() => aprobar(t)}
                >
                  Confirmar aprobación
                </Boton>
              </div>
            )}
            {rechazandoAbierto === t.id && (
              <div className="space-y-1.5 border-t border-tinta/10 pt-2">
                <input
                  autoFocus
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="w-full border-b border-tinta/25 bg-transparent px-0.5 py-1 text-[11px] text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
                />
                <Boton peso="primario" className="w-full px-2.5 py-1.5 text-[11px]" cargando={rechazandoId === t.id} onClick={() => rechazar(t)}>
                  Confirmar rechazo
                </Boton>
              </div>
            )}
          </div>
        ))}
      </div>

      {desactivados.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivadas — ya no se pueden elegir en una prenda nueva</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {desactivados.map((t) => (
              <div key={t.id} className="card-cayla flex flex-col gap-2 p-3 opacity-60">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-sm font-medium text-tinta">{t.valor}</p>
                  {t.estado === "rechazado" && (
                    <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-1.5 py-0.5 text-[9px] text-rojo">Rechazada</span>
                  )}
                </div>
                {puedeEditar && (
                  <Boton peso="discreto" className="px-2 py-1.5 text-[11px]" onClick={() => abrirReactivar(t)}>
                    Reactivar
                  </Boton>
                )}
                {aprobandoAbierto === t.id && (
                  <div className="space-y-1.5 border-t border-tinta/10 pt-2">
                    <input
                      autoFocus
                      value={comentarioAprobar}
                      onChange={(e) => setComentarioAprobar(e.target.value)}
                      placeholder="Comentario (obligatorio)"
                      className="w-full border-b border-tinta/25 bg-transparent px-0.5 py-1 text-[11px] text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
                    />
                    <Boton
                      peso="primario"
                      className="w-full px-2.5 py-1.5 text-[11px]"
                      cargando={aprobandoId === t.id}
                      disabled={!comentarioAprobar.trim()}
                      onClick={() => aprobar(t)}
                    >
                      Confirmar
                    </Boton>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
