"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Colaborador, DynamicDisponible } from "@/lib/colaboradores";
import type { Ubicacion } from "@/lib/ubicaciones";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoSelect } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

const ETIQUETA_ROL: Record<Colaborador["rol"], string> = { lider: "Líder", colaborador: "Colaborador" };

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso)
  );
}

// Colaboradores: quién puede entrar a retail hoy. Retail nunca crea gente
// nueva acá — Dynamic ya es dueño de esa identidad (0009_integracion_
// dynamic.sql) — solo decide a cuáles cuentas YA existentes en Dynamic les
// da acceso (0013_colaboradores_autorizados.sql). "Agregar" elige de una
// lista de cuentas activas de Dynamic que todavía no tienen acceso; nunca
// un formulario para escribir una persona a mano.
export function ColaboradoresPanel({
  colaboradores,
  disponibles,
  ubicaciones,
}: {
  colaboradores: Colaborador[];
  disponibles: DynamicDisponible[];
  ubicaciones: Ubicacion[];
}) {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState("");
  const [ubicacionElegida, setUbicacionElegida] = useState("");
  const [loading, setLoading] = useState(false);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Colaborador | null>(null);

  function abrirModalAgregar() {
    // Se vacía al abrir, no una sola vez en el useState inicial: si ya se agregó
    // a alguien en esta misma sesión, el estado viejo apuntaba a una persona que
    // ya no está en `disponibles`. Y arranca SIN elegir a nadie a propósito: dar
    // acceso no admite un "primero de la lista" que un Enter apurado confirme.
    setSeleccionado("");
    setUbicacionElegida("");
    setModalAbierto(true);
  }

  async function onAgregar(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado || !ubicacionElegida) return;
    setLoading(true);
    const supabase = createClient();
    // Todo colaborador nuevo entra con rol Colaborador, fijo a esta sede —
    // Líder es un nivel que hoy no se asigna desde acá (0016_roles_colaborador.sql).
    const { error } = await supabase.rpc("agregar_colaborador", {
      p_persona_id: seleccionado,
      p_ubicacion_id: ubicacionElegida,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "agregar el colaborador"));
      return;
    }
    avisar.exito(`${disponibles.find((d) => d.persona_id === seleccionado)?.nombre ?? "Colaborador"} ya tiene acceso`);
    setModalAbierto(false);
    router.refresh();
  }

  async function onQuitar(persona_id: string) {
    setConfirmando(null);
    setQuitandoId(persona_id);
    const supabase = createClient();
    const { error } = await supabase.rpc("quitar_colaborador", { p_persona_id: persona_id });
    setQuitandoId(null);
    if (error) {
      avisar.error(traducirError(error, "quitar el acceso"));
      return;
    }
    avisar.exito("Acceso quitado", { detalle: "La persona ya no puede entrar al sistema de retail." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Retail</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Colaboradores</h1>
          <p className="mt-1 text-xs leading-relaxed text-tinta/65">
            Quién puede entrar a retail hoy. Las personas se dan de alta en Dynamic —
            acá solo se decide a quién de Dynamic se le abre la puerta de retail, y a
            qué sede queda fijo si entra como Colaborador.
          </p>
        </div>
        <div className="text-right">
          <Boton peso="primario" onClick={abrirModalAgregar} disabled={disponibles.length === 0}>
            Agregar colaborador
          </Boton>
          {disponibles.length === 0 && (
            <p className="mt-1 text-xs text-tinta/65">Todas las cuentas activas de Dynamic ya tienen acceso.</p>
          )}
        </div>
      </div>

      {colaboradores.length === 0 ? (
        <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
          Nadie tiene acceso a retail todavía.
        </p>
      ) : (
        <div className="scroll-cayla card-cayla overflow-hidden">
          <div className="scroll-cayla overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/65">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[11px]">Nombre</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Correo</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Rol</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Ubicación asignada</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Sede en Dynamic</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Desde</th>
                  <th className="label-cayla px-3 py-2 text-[11px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {colaboradores.map((c) => (
                  <tr key={c.persona_id} className="transition-colors duration-150 hover:bg-tinta/[0.025]">
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-tinta">{c.nombre}</td>
                    <td className="px-3 py-3 text-tinta/75">{c.correo}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-tinta/75">{ETIQUETA_ROL[c.rol]}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-tinta/75">
                      {c.rol === "lider" ? <span className="text-tinta/65">cualquiera</span> : (c.ubicacion_asignada ?? "—")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-tinta/75">{c.sede ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-tinta/65">{formatearFecha(c.agregado_en)}</td>
                    <td className="px-3 py-3 text-right">
                      <Boton
                        type="button"
                        peso="discreto"
                        cargando={quitandoId === c.persona_id}
                        onClick={() => setConfirmando(c)}
                        className="px-2.5 py-1.5 text-[11px]"
                      >
                        {quitandoId === c.persona_id ? "Quitando…" : "Quitar acceso"}
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalAbierto && (
        <Modal titulo="Agregar colaborador" ancho="max-w-md" onClose={() => setModalAbierto(false)}>
          {(cerrar) => (
            <form onSubmit={onAgregar} className="mt-5 space-y-4">
              <p className="text-xs leading-relaxed text-tinta/75">
                Elige entre las cuentas de Dynamic que todavía no tienen acceso a retail. Si la
                persona que buscas no aparece, primero debe existir y estar activa en Dynamic.
              </p>

              <Campo etiqueta="Persona" htmlFor="colaborador-persona">
                <ComboBuscable
                  id="colaborador-persona"
                  etiquetaAccesible="Persona"
                  marcador="Busca por nombre o correo…"
                  valor={seleccionado}
                  onValor={setSeleccionado}
                  opciones={disponibles.map((d) => ({ valor: d.persona_id, texto: d.nombre, detalle: d.correo }))}
                />
              </Campo>

              <div className="space-y-1.5">
                <CampoSelect
                  etiqueta="Ubicación asignada"
                  valor={ubicacionElegida}
                  onValor={setUbicacionElegida}
                  opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
                  marcador="Elige una ubicación"
                />
                <p className="text-xs leading-relaxed text-tinta/65">
                  Entra como Colaborador, fijo a esta sede — la persona no podrá cambiarla por su cuenta.
                </p>
              </div>

              <div className="flex gap-2 pt-3">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" className="flex-1" cargando={loading} disabled={!seleccionado || !ubicacionElegida}>
                  {loading ? "Agregando…" : "Agregar"}
                </Boton>
              </div>
            </form>
          )}
        </Modal>
      )}

      {confirmando && (
        <Modal titulo="Quitar acceso" ancho="max-w-sm" onClose={() => setConfirmando(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <p className="text-sm leading-relaxed text-tinta/85">
                <strong className="font-semibold text-tinta">{confirmando.nombre}</strong> ya no va a poder entrar
                al sistema de retail. Puedes volver a darle acceso después desde «Agregar colaborador».
              </p>
              <div className="flex gap-2">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton
                  type="button"
                  peso="primario"
                  className="flex-1 bg-rojo hover:bg-rojo/90"
                  onClick={() => onQuitar(confirmando.persona_id)}
                >
                  Sí, quitar acceso
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
