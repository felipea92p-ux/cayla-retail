"use client";

import { useEffect, useRef, useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import {
  avisoDelRestablecer,
  camposDelRestablecer,
  esRechazoDelCorreoNuevo,
  leerAccesoWeb,
  leerResultadoDelRestablecer,
  problemaCorreoNuevo,
  textoDeLaTiendaOnline,
  type AccesoWeb,
  type ResultadoDelRestablecer,
} from "@/lib/acceso-web-reglas";
import { normalizarCorreo, rechazoVigente, type RechazoCorreo } from "@/lib/correo-clienta-reglas";
import { traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { createClient } from "@/lib/supabase/client";
import type { ControlResponsable } from "@/lib/useResponsable";

// La tienda online en la ficha de un cliente (Felipe 2026-10-15, 20261015132000): si tiene cuenta, y «Restablecer acceso» para quien ya
// no puede entrar porque perdió su correo. La persona de la tienda escribe el correo nuevo que le da el cliente (DNI en mano); al cliente
// le llega a ese correo un código, y con él confirma el correo y crea su contraseña en la tienda online. Hasta entonces nada cambia.
// La ficha (`ClientaFichaModal`) solo las engancha: una línea para el bloque y otra para la hoja. Las reglas: `lib/acceso-web-reglas.ts`.

/** El bloque «Tienda online» de la ficha. Lee lo suyo (`fn_clienta_acceso_web`); si la base no contesta, no se dibuja. */
export function TiendaOnlineDeLaFicha({ clientaId, verCompleto, onRestablecer }: { clientaId: string; verCompleto: boolean; onRestablecer: () => void }) {
  const [acceso, setAcceso] = useState<AccesoWeb | null>(null);

  useEffect(() => {
    let vigente = true;
    void createClient()
      .rpc("fn_clienta_acceso_web", { p_id: clientaId })
      .then(({ data, error }) => {
        if (vigente) setAcceso(error ? null : leerAccesoWeb(data));
      });
    return () => {
      vigente = false;
    };
  }, [clientaId]);

  if (!acceso?.cuentaWeb) return null;
  return (
    <div className="card-cayla" data-guia="clientas.ficha-tienda-online">
      <div className="grid gap-x-4 gap-y-1.5 p-4 sm:grid-cols-[7.5rem_1fr] sm:items-center">
        <span className="label-cayla text-[10.5px] text-tinta/55">Tienda online</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Chip tono="verde">Tiene cuenta</Chip>
          {acceso.restablecer && <Chip tono="ambar">Restablecer pedido</Chip>}
          <Boton type="button" className="!py-1.5 sm:ml-auto" onClick={onRestablecer}>
            Restablecer acceso
          </Boton>
        </div>
        <span className="text-xs text-tinta/55 sm:col-start-2">{textoDeLaTiendaOnline(acceso, verCompleto, new Date())}</span>
      </div>
    </div>
  );
}

const ID_CORREO_NUEVO = "ficha-acceso-web-correo";
const MENSAJE_RARO = "No se pudo restablecer su acceso ahora. Vuelve a intentar en un momento.";

/** Lo que devolvió la ruta del ERP como error (la forma de un error de la base), o null si no se entiende. */
function errorDeLaRuta(json: unknown): ErrorEscritura {
  const e = typeof json === "object" && json !== null ? (json as { error?: unknown }).error : null;
  if (typeof e !== "object" || e === null || typeof (e as { message?: unknown }).message !== "string") return null;
  const { message, code, details, hint } = e as { message: string; code?: unknown; details?: unknown; hint?: unknown };
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return { message, code: texto(code), details: texto(details), hint: texto(hint) };
}

/**
 * La hoja «Restablecer acceso» (un modo de la ficha, ADR-0136: no anida otro modal). El correo nuevo, quién lo hace y «Mandar el código».
 * Lo que la base rechaza del correo (mal escrito, de otra ficha o cuenta, o el mismo con que ya entra) va bajo su caja.
 */
export function RestablecerAccesoWeb({
  clientaId,
  verCompleto,
  responsable,
  onCancelar,
  onListo,
}: {
  clientaId: string;
  verCompleto: boolean;
  responsable: ControlResponsable;
  onCancelar: () => void;
  /** El código salió (o el pedido quedó): la ficha vuelve a «ver» y el bloque lo dice. */
  onListo: () => void;
}) {
  const [correo, setCorreo] = useState("");
  const [salio, setSalio] = useState(false);
  const [rechazo, setRechazo] = useState<RechazoCorreo | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Un doble clic llega antes de que el botón se apague: el segundo no sale.
  const enCurso = useRef(false);
  const rechazado = rechazoVigente(rechazo, correo);
  const guia = useGuiaCampos(camposDelRestablecer({ correo, rechazo: rechazado, responsableListo: responsable.listo }));
  const problema = rechazado ?? problemaCorreoNuevo(correo);
  // Bajo la caja: lo que dijo la base de ESE correo o, cuando ya salió de la caja, que está mal escrito.
  const pie = rechazado ?? (salio && correo.trim() !== "" ? problemaCorreoNuevo(correo) : null);

  function alCorreo() {
    window.setTimeout(() => document.getElementById(ID_CORREO_NUEVO)?.focus(), 0);
  }

  async function mandar(e: React.FormEvent) {
    e.preventDefault();
    if (enCurso.current) return;
    if (problema) {
      setSalio(true);
      alCorreo();
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    const enviado = normalizarCorreo(correo);
    enCurso.current = true;
    setGuardando(true);
    let error: ErrorEscritura = null;
    let resultado: ResultadoDelRestablecer | null = null;
    try {
      const r = await fetch("/api/clientas/acceso-web", {
        method: "POST",
        headers: { "content-type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ clientaId, correo: enviado }),
      });
      const json: unknown = await r.json().catch(() => null);
      if (r.ok) resultado = leerResultadoDelRestablecer(json);
      error = r.ok ? (resultado ? null : { message: MENSAJE_RARO }) : (errorDeLaRuta(json) ?? { message: MENSAJE_RARO });
    } catch (fallo) {
      // Sin red: traducirError lo reconoce («Se cortó la conexión…») y pide revisar antes de repetir.
      error = { message: fallo instanceof Error ? fallo.message : "Failed to fetch" };
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
    responsable.despues(error);
    if (error) {
      const frase = traducirError(error, "restablecer su acceso");
      if (esRechazoDelCorreoNuevo(error)) {
        setRechazo({ valor: enviado, mensaje: frase });
        setSalio(true);
        alCorreo();
        return;
      }
      avisar.error(frase);
      return;
    }
    const aviso = avisoDelRestablecer(resultado!, verCompleto);
    if (aviso.tipo === "error") {
      // Ese correo no sirve (otra cuenta de la tienda online ya lo tiene): se dice bajo su caja, para escribir otro.
      setRechazo({ valor: enviado, mensaje: `${aviso.titulo}. ${aviso.detalle}` });
      setSalio(true);
      alCorreo();
      return;
    }
    if (aviso.tipo === "exito") avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    else avisar.aviso(aviso.titulo, { detalle: aviso.detalle, duracion: 9000 });
    onListo();
  }

  return (
    <form onSubmit={mandar} className="space-y-4" noValidate>
      <TituloGrupo nivel={3}>Restablecer acceso a la tienda online</TituloGrupo>
      <p className="text-sm text-tinta/75">
        Para el cliente que ya no puede entrar a la tienda online porque perdió su correo. Revisa su documento y escribe el correo nuevo que
        te da: le llega un código a ese correo, y con él confirma el correo y crea su contraseña. <strong>Hasta que escriba el código, su
        cuenta sigue igual.</strong> A su correo de antes le avisamos del cambio.
      </p>
      <CampoGuiado id="correo" guia={guia}>
        <CampoTexto
          id={ID_CORREO_NUEVO}
          etiqueta={guia.etiqueta("correo", "Correo nuevo")}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          onBlur={() => setSalio(true)}
          aria-invalid={pie ? true : undefined}
          pie={pie ?? "El que el cliente usa hoy. Con él va a entrar desde ahora."}
          tono={pie ? "error" : "neutro"}
        />
      </CampoGuiado>
      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>
      <PieGuia guia={guia} listo="Todo listo para mandar el código." />
      <PieAcciones>
        <Boton type="button" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          peso="primario"
          cargando={guardando}
          textoCargando="Mandando…"
          disabled={!responsable.listo}
          title={responsable.motivo ?? guia.frase ?? undefined}
          className={guia.claseConfirmar}
        >
          Mandar el código
        </Boton>
      </PieAcciones>
    </form>
  );
}
