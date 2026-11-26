"use client";

import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { useResponsable } from "@/lib/useResponsable";
import { camposDeComprobantes, chipLucode, fraseDePrueba, type EmpresaAliada } from "@/lib/empresas-aliadas-reglas";

// «Comprobantes» de una empresa aliada (ADR-0683, migración 20261122213000; Felipe 2026-11-22 eligió guardar la llave en el Vault). Aquí el Admin
// deja lo que la aliada necesita para emitir con SU RUC: el domicilio fiscal y la llave que le dio Lucode. La llave se escribe y nunca vuelve:
// la hoja solo muestra sus 4 últimos caracteres. Guardar una llave nueva la prueba sola contra Lucode (sin emitir nada). Esto NO cambia cómo se
// emite hoy: hasta la fase 2 lo que vende sigue saliendo como CAYLA, por consignación.

type Responsable = ReturnType<typeof useResponsable>;
type Prueba = { estado: "conectada" | "rechazada" | "sin_respuesta"; entorno: "sandbox" | "produccion" };

async function probar(empresaId: string): Promise<Prueba | { error: string }> {
  try {
    const r = await fetch("/api/lucode/probar-aliada", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: empresaId }),
    });
    const json = (await r.json()) as Partial<Prueba> & { error?: string };
    if (!r.ok || !json.estado) return { error: json.error ?? "No se pudo probar la conexión. Prueba en un rato." };
    return { estado: json.estado, entorno: json.entorno === "produccion" ? "produccion" : "sandbox" };
  } catch {
    return { error: "Sin conexión: no se pudo probar. La llave sigue guardada." };
  }
}

export function HojaComprobantesAliada({
  aliada,
  responsable,
  volverA,
  onClose,
}: {
  aliada: EmpresaAliada;
  responsable: Responsable;
  /** El botón que la abrió: ahí vuelve el foco al cerrarla. */
  volverA: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const conexion = aliada.comprobantes ?? { estado: "sin_llave" as const, termina: null, probadaEn: null };
  const tieneLlave = conexion.estado !== "sin_llave";
  const [domicilio, setDomicilio] = useState(aliada.domicilioFiscal ?? "");
  const [llave, setLlave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const campos = camposDeComprobantes(domicilio, llave, tieneLlave);
  const guia = useGuiaCampos(campos);
  const fotoActual = fotoFormulario({ domicilio, llave });
  const [fotoAlAbrir] = useState(fotoActual);
  const conCambios = fotoActual !== fotoAlAbrir;
  const avisoSalida = useSalidaSinGuardar(conCambios, "Escribiste datos de comprobantes y todavía no se guardaron. Si cierras ahora, se pierde lo que escribiste.");
  const chip = chipLucode(conexion);

  async function avisarPrueba(): Promise<void> {
    setProbando(true);
    const r = await probar(aliada.id);
    setProbando(false);
    if ("error" in r) avisar.error(r.error);
    else if (r.estado === "conectada") avisar.exito(`${aliada.nombre}: ${fraseDePrueba(r.estado, r.entorno)}`);
    else avisar.error(`${aliada.nombre}: ${fraseDePrueba(r.estado, r.entorno)}`);
    router.refresh();
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    const llaveNueva = llave.trim() !== "";
    setGuardando(true);
    const { error } = (await firmar(
      createClient().rpc(
        "guardar_comprobantes_aliada" as never,
        { p_id: aliada.id, p_domicilio: domicilio.trim() || null, p_llave: llaveNueva ? llave.trim() : null } as never,
      ) as never,
      responsable.firma(),
    )) as { error: { hint?: string | null; message?: string } | null };
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      const texto = traducirError(error as never, "guardar los datos de comprobantes");
      if (error.hint === "llave" || error.hint === "domicilio") guia.marcarError(error.hint, texto);
      else avisar.error(texto);
      return;
    }
    // La llave ya está en el Vault: se borra de la pantalla en el acto.
    setLlave("");
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    if (llaveNueva) {
      avisar.exito(`${aliada.nombre}: llave guardada. Probando la conexión…`);
      await guardiaFuera;
      await avisarPrueba();
    } else {
      avisar.exito(`${aliada.nombre}: cambios guardados.`);
      void guardiaFuera.then(() => router.refresh());
    }
  }

  return (
    <>
      <Modal
        titulo={`Comprobantes de ${aliada.nombre}`}
        subtitulo="Para que emita con su propio RUC."
        onClose={onClose}
        antesDeCerrar={avisoSalida.pedirAccion}
        alCerrarEnfocar={volverA}
        tamano="mediana"
        bloqueado={guardando || probando}
      >
        {(cerrar) => (
          <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="space-y-5" autoComplete="off">
            <div className="flex flex-wrap items-center gap-3">
              <Chip tono={chip.tono} versalitas={false}>
                {chip.texto}
              </Chip>
              {tieneLlave && !conCambios && (
                <Boton type="button" className="btn-chico" onClick={avisarPrueba} cargando={probando} textoCargando="Probando…">
                  Probar conexión
                </Boton>
              )}
            </div>

            <CampoGuiado id="domicilio" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("domicilio", "Domicilio fiscal")}
                value={domicilio}
                maxLength={200}
                // sugerir-fijo: un domicilio fiscal no depende de nada elegido antes en esta hoja
                placeholder="El que figura en su ficha RUC"
                onChange={(ev) => setDomicilio(ev.target.value)}
              />
            </CampoGuiado>

            <CampoGuiado id="llave" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("llave", tieneLlave ? "Cambiar la llave de Lucode" : "Llave de Lucode")}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={llave}
                maxLength={500}
                // sugerir-fijo: dice cómo se reconoce la llave guardada, no depende de lo elegido
                placeholder={tieneLlave ? `Guardada · termina en …${conexion.termina ?? ""}` : "Pégala tal como te la dio Lucode"}
                onChange={(ev) => setLlave(ev.target.value)}
              />
            </CampoGuiado>

            <Aviso tono="info" chico>
              La llave se guarda cifrada y no se vuelve a mostrar. Nunca te pediremos la clave SOL.
            </Aviso>

            <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              <PieGuia guia={guia} listo="Todo listo para guardar." />
              <div className="ml-auto pie-acciones">
                <Boton type="button" onClick={() => avisoSalida.pedirAccion(cerrar)}>
                  Cancelar
                </Boton>
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  confirma={guia}
                  className={guia.claseConfirmar}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  disabled={probando}
                >
                  Guardar
                </Boton>
              </div>
            </div>
          </form>
        )}
      </Modal>
      {avisoSalida.aviso}
    </>
  );
}
