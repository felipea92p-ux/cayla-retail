"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Colaborador, DynamicDisponible } from "@/lib/colaboradores";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

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
}: {
  colaboradores: Colaborador[];
  disponibles: DynamicDisponible[];
}) {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState(disponibles[0]?.persona_id ?? "");
  const [loading, setLoading] = useState(false);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);

  async function onAgregar(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("agregar_colaborador", { p_persona_id: seleccionado });
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
            acá solo se decide a quién de Dynamic se le abre la puerta de retail.
          </p>
        </div>
        <Boton peso="primario" onClick={() => setModalAbierto(true)} disabled={disponibles.length === 0}>
          Agregar colaborador
        </Boton>
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
                    <td className="whitespace-nowrap px-3 py-3 text-tinta/75">{c.sede ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-tinta/65">{formatearFecha(c.agregado_en)}</td>
                    <td className="px-3 py-3 text-right">
                      <Boton
                        type="button"
                        peso="discreto"
                        cargando={quitandoId === c.persona_id}
                        onClick={() => onQuitar(c.persona_id)}
                        className="border-rojo/30 px-2.5 py-1.5 text-[11px] text-rojo hover:bg-rojo/8"
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

              <CampoSelect
                etiqueta="Persona"
                valor={seleccionado}
                onValor={setSeleccionado}
                opciones={disponibles.map((d) => ({ valor: d.persona_id, texto: `${d.nombre} — ${d.correo}` }))}
              />

              <div className="flex gap-2 pt-3">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" className="flex-1" cargando={loading} disabled={!seleccionado}>
                  {loading ? "Agregando…" : "Agregar"}
                </Boton>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
