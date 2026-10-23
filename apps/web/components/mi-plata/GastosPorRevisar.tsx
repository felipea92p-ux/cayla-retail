"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { primerNombre } from "@/lib/fondos-reglas";
import { nombreGasto } from "@/lib/mi-plata-reglas";
import { revisarGasto } from "@/lib/revisar-compras-acciones";
import {
  PAPELES_GASTO,
  camposRevisarGasto,
  ejemploSerieNumero,
  fraseRevisarGasto,
  papelSugerido,
  papelesParaGasto,
  type PapelGasto,
  diaYRonda,
} from "@/lib/revisar-compras-reglas";
import type { GastoConFoto } from "@/lib/revisar-compras";
import { ICONO_GASTO } from "./iconos";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ lo que las compradoras gastaron en otra cosa (taxi, cargador, comida…).
// Rediseño (2026-10-23): se revisa en el detalle de la bandeja: qué papel le dieron (sin papel, solo el taxi y el cargador, en la planilla
// de movilidad) y, si lo hay, su serie y número y el RUC (con el RUC de una factura se separa el IGV). Al guardar, pasa a los gastos del
// viaje pagado desde su plata de compras. El gasto de quien mira no lo revisa ella.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** La miniatura del gasto en la fila de la bandeja: su foto o, sin papel, el ícono de lo que fue. */
export function MiniFotoGasto({ gasto }: { gasto: GastoConFoto }) {
  const Icono = ICONO_GASTO[gasto.concepto];
  if (!gasto.fotoUrl || gasto.fotoRuta?.toLowerCase().endsWith(".pdf")) {
    return (
      <span className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-xl bg-hueso text-tinta" title={gasto.fotoUrl ? "Un PDF" : "Sin papel"}>
        <Icono className="h-5 w-5" aria-hidden />
      </span>
    );
  }
  return (
    <span className="block h-[54px] w-[54px] shrink-0 overflow-hidden rounded-xl bg-hueso">
      {/* La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={gasto.fotoUrl} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

function FotoGasto({ gasto }: { gasto: GastoConFoto }) {
  if (!gasto.fotoUrl) return null;
  return (
    <a href={gasto.fotoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl bg-hueso p-3" title="Ver la foto en grande">
      {gasto.fotoRuta?.toLowerCase().endsWith(".pdf") ? (
        <span className="flex items-center gap-2 text-sm text-tinta">
          <FileText className="h-5 w-5" aria-hidden />
          Abrir el PDF
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gasto.fotoUrl} alt={`Foto del papel: ${nombreGasto(gasto)}`} className="max-h-80 w-full object-contain" />
      )}
    </a>
  );
}

export function DetalleGasto({ gasto, alTerminar }: { gasto: GastoConFoto; alTerminar: () => void }) {
  const router = useRouter();
  const [papel, setPapel] = useState<PapelGasto | null>(papelSugerido(gasto));
  const [serieNumero, setSerieNumero] = useState("");
  const [ruc, setRuc] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposRevisarGasto({ papel, serieNumero, ruc }, gasto.concepto, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const opciones = papelesParaGasto(gasto.concepto);
  const conNumero = papel !== null && papel !== "planilla_movilidad";
  const nombre = primerNombre(gasto.persona);

  const limpiar = <T,>(f: (x: T) => void) => (x: T) => {
    setRechazo(null);
    f(x);
  };

  async function confirmar() {
    if (guardando || papel === null) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    setGuardando(true);
    const firma = esPersona ? firmaOmitida("gasto_revisar") : responsable.firma();
    const { error } = await revisarGasto(
      { p_gasto_id: gasto.id, p_papel: papel, p_serie_numero: conNumero ? serieNumero.trim() || null : null, p_ruc: conNumero ? ruc.trim() || null : null },
      firma,
    );
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "revisar el gasto"), tono: "error" },
      );
    }
    avisar.exito(`Pasaste ${soles(gasto.monto)} a los gastos`, { detalle: `${nombreGasto(gasto)} de ${nombre}: ya está en los gastos del viaje.` });
    alTerminar();
    router.refresh();
  }

  return (
    <PanelDetalle
      guia="fondos.gasto-detalle"
      sobre={[gasto.persona, diaYRonda(gasto.fecha, gasto.ronda)].filter(Boolean).join(" · ")}
      titulo={`${nombreGasto(gasto)} · ${soles(gasto.monto)}`}
      estado={<Chip tono="ambar">Por revisar</Chip>}
    >
      <div className={`grid gap-5 ${gasto.fotoUrl ? "@min-[38rem]:grid-cols-[18.75rem_minmax(0,1fr)]" : ""}`}>
        <FotoGasto gasto={gasto} />
        {gasto.esMia ? (
          <div className="flex flex-col items-start gap-2">
            <Chip tono="pizarra">Es tuyo</Chip>
            <p className="text-sm text-taupe">Nadie revisa sus propios gastos: que lo revise otra persona de Compras.</p>
          </div>
        ) : !gasto.tieneCompra ? (
          <p className="nota-cayla text-sm">Se revisa cuando {nombre} anote su primera compra: un gasto del viaje va siempre a una compra.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirmar();
            }}
            className="flex min-w-0 max-w-2xl flex-col gap-5"
          >
            <CampoGuiado id="papel" guia={guia} titulo="¿Qué papel le dieron?">
              <div role="group" aria-label="¿Qué papel le dieron?" className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-4" data-guia="fondos.gasto-papel">
                {opciones.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={papel === k}
                    disabled={guardando}
                    onClick={() => limpiar(setPapel)(k)}
                    className={`card-cayla mov-boton flex flex-col items-start gap-0.5 rounded-[14px] p-3 text-left ${papel === k ? "border-tinta bg-sand/40" : ""}`}
                  >
                    <span className="flex w-full items-center justify-between font-medium text-tinta">
                      {PAPELES_GASTO[k].nombre}
                      {papel === k && <Check className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="text-xs text-taupe">{PAPELES_GASTO[k].ayuda}</span>
                  </button>
                ))}
              </div>
              {!opciones.includes("planilla_movilidad") && !gasto.fotoRuta && (
                <p className="mt-1.5 text-xs text-taupe">Solo el taxi y el cargador pasan sin papel: pídele a {nombre} el papel.</p>
              )}
            </CampoGuiado>
            {papel === "planilla_movilidad" && (
              <p className="nota-cayla text-sm">Sin papel: va a la planilla de movilidad. Pasa a los gastos del viaje de {nombre}, de su compra de ese día.</p>
            )}
            {conNumero && (
              <div className="grid grid-cols-2 gap-3">
                <CampoGuiado id="serie" guia={guia} titulo="Serie y número · opcional">
                  <CampoTexto
                    etiqueta="Serie y número"
                    caja
                    autoComplete="off"
                    maxLength={40}
                    placeholder={ejemploSerieNumero(papel)}
                    value={serieNumero}
                    disabled={guardando}
                    onChange={(e) => limpiar(setSerieNumero)(e.target.value)}
                  />
                </CampoGuiado>
                <CampoGuiado id="ruc" guia={guia} titulo={papel === "factura" ? "RUC · separa el IGV" : "RUC · opcional"}>
                  <CampoTexto
                    etiqueta="RUC"
                    caja
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="11 números" // sugerir-fijo: el formato de un RUC no depende de nada elegido antes
                    value={ruc}
                    disabled={guardando}
                    onChange={(e) => limpiar(setRuc)(e.target.value.replace(/\D/g, ""))}
                  />
                </CampoGuiado>
              </div>
            )}
            {!esPersona && (
              <CampoGuiado id="responsable" guia={guia} titulo="Quién revisa">
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
            )}
            {rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )}
            <PieGuia guia={guia} listo="Todo listo para pasarlo." conFrase />
            <div className="pie-acciones border-t border-sand pt-4">
              <Boton
                type="submit"
                peso="primario"
                cargando={guardando}
                textoCargando="Guardando…"
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
                data-guia="fondos.gasto-revisar"
              >
                {fraseRevisarGasto(gasto.monto)}
              </Boton>
            </div>
          </form>
        )}
      </div>
    </PanelDetalle>
  );
}
