"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CameraOff, Check, FileText, ZoomIn } from "lucide-react";
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
import { diaMes } from "@/lib/fechas-lima";
import { nombreGasto } from "@/lib/mi-plata-reglas";
import { revisarGasto } from "@/lib/revisar-compras-acciones";
import {
  PAPELES_GASTO,
  camposRevisarGasto,
  ejemploSerieNumero,
  papelSugerido,
  papelesParaGasto,
  type PapelGasto,
} from "@/lib/revisar-compras-reglas";
import type { GastoConFoto } from "@/lib/revisar-compras";
import { ICONO_GASTO } from "./iconos";
import { FichasDePapel } from "./FichasDePapel";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ lo que las compradoras gastaron en otra cosa (taxi, cargador, comida…).
// Rediseño (2026-10-23): se revisa en el detalle de la bandeja: qué papel le dieron (sin papel, solo el taxi y el cargador, en la planilla
// de movilidad) y, si lo hay, su serie y número y el RUC (con el RUC de una factura se separa el IGV). Al guardar, pasa a los gastos del
// viaje pagado desde su plata de compras. El gasto de quien mira no lo revisa ella.
//
// Sigue el diseño «A · Bandeja serena» que Felipe eligió el 2026-10-23 mirando las capturas: arriba qué fue («Taxi») y de quién y
// cuándo; abajo, la foto (o el dibujo de lo que fue, con «Sin foto») a la izquierda y, a la derecha, «Gastó» con el monto grande y el
// papel en fichas con su ícono. Sin párrafos: lo que antes explicaba una nota lo dice la ficha.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** La miniatura del gasto en la fila de la bandeja: su foto o, sin papel, el ícono de lo que fue. */
export function MiniFotoGasto({ gasto }: { gasto: GastoConFoto }) {
  const Icono = ICONO_GASTO[gasto.concepto];
  if (!gasto.fotoUrl || gasto.fotoRuta?.toLowerCase().endsWith(".pdf")) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-hueso text-tinta" title={gasto.fotoUrl ? "Un PDF" : "Sin papel"}>
        <Icono className="h-5 w-5" aria-hidden />
      </span>
    );
  }
  return (
    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-hueso">
      {/* La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={gasto.fotoUrl} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

/** La foto del papel en grande, a la izquierda del detalle (se abre entera al tocarla); sin foto, el dibujo de lo que fue. */
function FotoGasto({ gasto }: { gasto: GastoConFoto }) {
  if (!gasto.fotoUrl) {
    const Icono = ICONO_GASTO[gasto.concepto];
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-hueso p-4 text-taupe">
        <Icono /* unificar-fijo: un ícono grande (24 px o más) es un dibujo: trazo 1,5, como el de un vacío (ronda 15) */ className="h-14 w-14" strokeWidth={1.5} aria-hidden />
        <Chip tono="neutro" versalitas={false}>
          <CameraOff className="h-3 w-3" aria-hidden />
          Sin foto
        </Chip>
      </div>
    );
  }
  const esPdf = gasto.fotoRuta?.toLowerCase().endsWith(".pdf");
  return (
    <a
      href={gasto.fotoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex min-h-64 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-hueso p-3 text-taupe"
      title={esPdf ? "Abrir el PDF" : "Ver la foto en grande"}
    >
      {esPdf ? (
        <>
          <FileText /* unificar-fijo: un ícono grande (24 px o más) es un dibujo: trazo 1,5, como el de un vacío (ronda 15) */ className="h-14 w-14" strokeWidth={1.5} aria-hidden />
          <span className="text-sm font-medium text-tinta">Abrir el PDF</span>
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gasto.fotoUrl} alt={`Foto del papel: ${nombreGasto(gasto)}`} className="max-h-80 w-full rounded-xl object-contain" />
          <span aria-hidden className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-papel text-tinta">
            <ZoomIn className="h-4 w-4" />
          </span>
        </>
      )}
    </a>
  );
}

export function DetalleGasto({ gasto, alTerminar }: { gasto: GastoConFoto; alTerminar: () => void }) {
  const router = useRouter();
  // Lo que dijo la compradora al anotar (ADR-0574) viene puesto; de antes, el papel que cae de cajón (un taxi sin foto va sin papel).
  const [papel, setPapel] = useState<PapelGasto | null>(gasto.papel ?? papelSugerido(gasto));
  const [serieNumero, setSerieNumero] = useState("");
  const [ruc, setRuc] = useState(gasto.ruc ?? "");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposRevisarGasto({ papel, serieNumero, ruc }, gasto.concepto, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  // «Sin papel» va primero, como en la captura elegida: es lo más común en un taxi o un cargador. Solo cambia el orden en que se ven.
  const opciones = [...papelesParaGasto(gasto.concepto)].sort((x, y) => Number(y === "planilla_movilidad") - Number(x === "planilla_movilidad"));
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
      sobre={["Gasto por revisar", gasto.ronda].filter(Boolean).join(" · ")}
      titulo={nombreGasto(gasto)}
      subtitulo={[gasto.persona, gasto.fecha ? diaMes(gasto.fecha) : null].filter(Boolean).join(" · ")}
    >
      <div className="grid gap-6 @min-[38rem]:grid-cols-[13rem_minmax(0,1fr)]">
        <FotoGasto gasto={gasto} />
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <span className="label-cayla block text-[11px] text-taupe">Gastó</span>
            <span className="mt-1 block whitespace-nowrap font-serif text-[clamp(2rem,10vw,2.75rem)] leading-none tabular-nums text-tinta">{soles(gasto.monto)}</span>
          </div>
          {gasto.esMia ? (
            <div className="flex flex-col items-start gap-2">
              <Chip tono="pizarra">Es tuyo</Chip>
              <p className="text-sm text-taupe">Que lo revise otra persona de Compras.</p>
            </div>
          ) : !gasto.tieneCompra ? (
            <p className="nota-cayla text-sm">Se revisa cuando {nombre} anote su primera compra.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmar();
              }}
              className="flex min-w-0 flex-col gap-5"
            >
              {gasto.noPasoPor && (
                <Aviso tono="atencion" titulo="No pasó solo a los gastos del viaje">
                  {gasto.noPasoPor}
                </Aviso>
              )}
              <CampoGuiado id="papel" guia={guia} titulo="¿Qué papel le dieron?">
                <FichasDePapel
                  etiqueta="¿Qué papel le dieron?"
                  opciones={opciones}
                  valor={papel}
                  alElegir={(k) => limpiar(setPapel)(k)}
                  deshabilitadas={guardando}
                  guia="fondos.gasto-papel"
                />
                {!opciones.includes("planilla_movilidad") && !gasto.fotoRuta && (
                  <p className="mt-1.5 text-xs text-taupe">Pídele el papel a {nombre}: no subió foto.</p>
                )}
              </CampoGuiado>
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
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4" aria-hidden />
                    Pasar a gastos del viaje
                  </span>
                </Boton>
              </div>
            </form>
          )}
        </div>
      </div>
    </PanelDetalle>
  );
}
