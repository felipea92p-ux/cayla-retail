"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, ImageOff } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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
import { diaMes } from "@/lib/fechas-lima";
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
} from "@/lib/revisar-compras-reglas";
import type { GastoConFoto } from "@/lib/revisar-compras";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ lo que las compradoras gastaron en otra cosa (taxi, cargador, comida…). Cada
// fila: de quién, qué fue, cuándo, cuánto y la foto si le dieron papel. «Revisar» abre la hoja: qué papel le dieron (sin papel, solo el taxi
// y el cargador, en la planilla de movilidad) y, si lo hay, su serie y número y el RUC (con el RUC de una factura se separa el IGV). Al
// guardar, pasa a los gastos del viaje pagado desde su plata de compras. El gasto de quien mira no lo revisa ella.

export function GastosPorRevisar({ gastos }: { gastos: GastoConFoto[] }) {
  return (
    <ul className="card-cayla @container divide-y divide-sand" data-guia="fondos.gastos">
      {gastos.map((g) => (
        <FilaGasto key={g.id} gasto={g} />
      ))}
    </ul>
  );
}

function FotoGasto({ gasto, grande = false }: { gasto: GastoConFoto; grande?: boolean }) {
  if (!gasto.fotoUrl) {
    if (grande) return null;
    return (
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-hueso text-taupe" title="No le dieron papel">
        <ImageOff className="h-5 w-5" aria-hidden />
        <span className="sr-only">Sin foto</span>
      </span>
    );
  }
  return (
    <a
      href={gasto.fotoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={grande ? "block overflow-hidden rounded-xl bg-hueso" : "grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-hueso text-taupe"}
      title="Ver la foto en grande"
    >
      {gasto.fotoRuta?.toLowerCase().endsWith(".pdf") ? (
        <FileText className="h-6 w-6" aria-hidden />
      ) : (
        // La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gasto.fotoUrl} alt={`Foto del papel: ${nombreGasto(gasto)}`} className={grande ? "max-h-72 w-full object-contain" : "h-full w-full object-cover"} />
      )}
    </a>
  );
}

function FilaGasto({ gasto }: { gasto: GastoConFoto }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 @min-[40rem]:grid-cols-[3.5rem_minmax(0,1fr)_auto_auto]">
      <FotoGasto gasto={gasto} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{nombreGasto(gasto)}</span>
        <span className="block text-xs text-taupe">
          {gasto.persona}
          {gasto.fecha ? ` · ${diaMes(gasto.fecha)}` : ""}
          {gasto.fotoRuta ? "" : " · sin papel"}
        </span>
        {!gasto.tieneCompra && <span className="block text-xs text-ambar-profundo">Se revisa cuando anote su primera compra.</span>}
      </span>
      <span className="col-span-2 whitespace-nowrap font-serif text-lg tabular-nums text-tinta @min-[40rem]:col-span-1">{soles(gasto.monto)}</span>
      {gasto.esMia ? (
        <span className="col-span-2 flex justify-end @min-[40rem]:col-span-1">
          <Chip tono="pizarra" title="Nadie revisa sus propios gastos: que lo revise otra persona de Compras.">
            Es tuyo
          </Chip>
        </span>
      ) : (
        <span className="col-span-2 flex justify-end @min-[40rem]:col-span-1">
          <Boton
            peso="primario"
            disabled={!gasto.tieneCompra}
            title={gasto.tieneCompra ? undefined : "Un gasto del viaje va siempre a una compra: espera a que anote la primera."}
            data-guia="fondos.gasto-revisar"
            onClick={(e) => {
              origen.current = e.currentTarget;
              setAbierta(true);
            }}
          >
            Revisar
          </Boton>
        </span>
      )}
      {abierta && <RevisarGastoModal gasto={gasto} onClose={() => setAbierta(false)} volverA={origen} />}
    </li>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function RevisarGastoModal({ gasto, onClose, volverA }: { gasto: GastoConFoto; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
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
    avisar.exito(`Pasaste ${soles(gasto.monto)} a los gastos`, { detalle: `${nombreGasto(gasto)} de ${primerNombre(gasto.persona)}: ya está en los gastos del viaje.` });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo={`Revisar: ${nombreGasto(gasto)}`}
      subtitulo={`${gasto.persona} lo pagó con su plata de compras${gasto.fecha ? ` el ${diaMes(gasto.fecha)}` : ""}: ${soles(gasto.monto)}.`}
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <FotoGasto gasto={gasto} grande />
          <CampoGuiado id="papel" guia={guia} titulo="¿Qué papel le dieron?">
            <div role="group" aria-label="¿Qué papel le dieron?" className="grid grid-cols-2 gap-2">
              {opciones.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={papel === k}
                  disabled={guardando}
                  onClick={() => limpiar(setPapel)(k)}
                  className={`card-cayla mov-boton flex flex-col items-start gap-0.5 p-3 text-left ${papel === k ? "border-tinta bg-sand/40" : ""}`}
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
              <p className="mt-1.5 text-xs text-taupe">Solo el taxi y el cargador pasan sin papel: pídele a {primerNombre(gasto.persona)} el papel.</p>
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
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              textoCargando="Guardando…"
              disabled={!guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
            >
              {fraseRevisarGasto(gasto.monto)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
