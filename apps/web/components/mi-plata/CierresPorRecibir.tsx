"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto, CampoSelect } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { opcionesDeCuentas, primerNombre, type CuentaOpcion } from "@/lib/fondos-reglas";
import { cuentaSugerida } from "@/lib/mi-plata-reglas";
import { recibirCierre } from "@/lib/revisar-compras-acciones";
import { botonCierre, camposCierre, filaCierre, type CierrePorRecibir } from "@/lib/revisar-compras-reglas";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ los cierres del día que esperan a Compras. Rediseño (2026-10-23): se reciben
// en el detalle de la bandeja. «Lo devuelvo» se recibe en una cuenta (vuelve al banco o a la caja fuerte); «CAYLA me debe» se paga desde
// una. Trae el monto del cierre y la cuenta sugerida, y se puede corregir el monto si trajo otra cosa (lo que no devolvió sigue en su
// plata). Con plata suya por confirmar, primero se confirma: la base no deja recibir antes (la plata por confirmar todavía no está en su
// fondo). El cierre de quien mira no lo recibe ella.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

export function DetalleCierre({ cierre, cuentas, alTerminar }: { cierre: CierrePorRecibir; cuentas: CuentaOpcion[]; alTerminar: () => void }) {
  const router = useRouter();
  const devuelve = cierre.decision === "devuelve";
  const [cuentaId, setCuentaId] = useState(cuentaSugerida(cuentas) ?? "");
  const [monto, setMonto] = useState(cierre.monto.toFixed(2));
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposCierre({ cuentaId, monto }, cierre.decision, cuentas, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMontoPlata(monto);
  const otroMonto = montoLeido != null && Math.abs(montoLeido - cierre.monto) >= 0.005;
  const nombre = primerNombre(cierre.persona);
  const espera = cierre.plataPorConfirmar > 0.005;
  const chip = filaCierre(cierre).chip;

  async function confirmar() {
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    setGuardando(true);
    const firma = esPersona ? firmaOmitida("compra_cierre_recibir") : responsable.firma();
    const { error } = await recibirCierre({ p_cierre_id: cierre.id, p_cuenta_id: cuentaId, p_monto: otroMonto ? montoLeido : null }, firma);
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, devuelve ? "recibir la plata" : "pagarle"), tono: "error" },
      );
    }
    avisar.exito(devuelve ? `Recibiste ${soles(montoLeido ?? 0)} de ${nombre}` : `Le pagaste ${soles(montoLeido ?? 0)} a ${nombre}`, {
      detalle: devuelve ? "Ya bajó de su plata para compras." : "Su plata para compras vuelve a cero.",
    });
    alTerminar();
    router.refresh();
  }

  return (
    <PanelDetalle
      guia="fondos.cierre-detalle"
      sobre={`${cierre.persona} · ${diaMes(cierre.fecha)}`}
      titulo={devuelve ? `Cerró su día y devuelve ${soles(cierre.monto)}` : `Cerró su día y le debemos ${soles(cierre.monto)}`}
      estado={<Chip tono={chip.tono}>{chip.texto}</Chip>}
    >
      {cierre.esMia ? (
        <div className="flex flex-col items-start gap-2">
          <Chip tono="pizarra">Es tuyo</Chip>
          <p className="text-sm text-taupe">Lo de tu propio día lo recibe otra persona de Compras.</p>
        </div>
      ) : espera ? (
        <p className="nota-cayla text-sm">
          Primero confirma su plata por confirmar ({soles(cierre.plataPorConfirmar)}), en «Plata por confirmar»: todavía no está en su fondo.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="flex min-w-0 max-w-2xl flex-col gap-5"
        >
          <div className="grid gap-3 @min-[40rem]:grid-cols-2">
            <CampoGuiado id="cuenta" guia={guia} titulo={devuelve ? "¿Dónde entra la plata?" : "¿De dónde sale?"}>
              <CampoSelect
                etiqueta={devuelve ? "¿Dónde entra la plata?" : "¿De dónde sale?"}
                caja
                valor={cuentaId}
                onValor={(x) => {
                  setRechazo(null);
                  setCuentaId(x);
                }}
                opciones={opcionesDeCuentas(cuentas)}
                marcador={cuentas.length === 0 ? "No hay un banco ni una caja fuerte activos" : "Elige el banco o la caja fuerte"}
                deshabilitado={guardando || cuentas.length === 0}
              />
            </CampoGuiado>
            <CampoGuiado id="monto" guia={guia} titulo={devuelve ? "¿Cuánto trajo?" : "¿Cuánto le pagas?"}>
              <CampoMonto
                etiqueta={devuelve ? "¿Cuánto trajo?" : "¿Cuánto le pagas?"}
                etiquetaOculta
                inputMode="decimal"
                autoComplete="off"
                value={monto}
                disabled={guardando}
                onChange={(e) => {
                  setRechazo(null);
                  setMonto(e.target.value);
                }}
              />
              {otroMonto && devuelve && <p className="mt-1.5 text-xs text-taupe">Lo que no trajo sigue en su plata para compras.</p>}
            </CampoGuiado>
          </div>
          {devuelve && <p className="nota-cayla text-sm">Cuéntala antes de recibirla. Si falta, recíbela por lo que contaste.</p>}
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo={devuelve ? "Quién recibe" : "Quién paga"}>
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo." conFrase />
          <div className="pie-acciones border-t border-sand pt-4">
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              textoCargando="Guardando…"
              disabled={!guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
              data-guia="fondos.cierre-recibir"
            >
              {botonCierre(cierre, montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </PanelDetalle>
  );
}
