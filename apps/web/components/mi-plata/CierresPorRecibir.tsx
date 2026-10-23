"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, HandCoins, Undo2 } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { FichasCuenta } from "@/components/fondos/FichasCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { primerNombre, type CuentaOpcion } from "@/lib/fondos-reglas";
import { cuentaSugerida } from "@/lib/mi-plata-reglas";
import { recibirCierre } from "@/lib/revisar-compras-acciones";
import { botonCierre, camposCierre, type CierrePorRecibir } from "@/lib/revisar-compras-reglas";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ los cierres del día que esperan a Compras. Rediseño (2026-10-23): se reciben
// en el detalle de la bandeja. «Lo devuelvo» se recibe en una cuenta (vuelve al banco o a la caja fuerte); «CAYLA me debe» se paga desde
// una. Trae el monto del cierre y la cuenta sugerida, y se puede corregir el monto si trajo otra cosa (lo que no devolvió sigue en su
// plata). Con plata suya por confirmar, primero se confirma: la base no deja recibir antes (la plata por confirmar todavía no está en su
// fondo). El cierre de quien mira no lo recibe ella.
//
// Sigue el diseño «A · Bandeja serena» que Felipe eligió el 2026-10-23 mirando las capturas: arriba la persona con su avatar («Lucía
// cerró su ronda») y el día del cierre en un chip; abajo, el cuaderno de la ronda en una tarjeta hueso y la cuenta en fichas de un toque.
// El cierre solo trae lo que devuelve o lo que le debemos (no lo que le dieron, compró y gastó): el cuaderno muestra ese renglón final,
// en grande, sin inventar los demás.

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

  const IconoFinal = devuelve ? Undo2 : HandCoins;
  const IconoBoton = devuelve ? ArrowDownLeft : ArrowUpRight;

  return (
    <PanelDetalle
      guia="fondos.cierre-detalle"
      avatar={<AvatarPersona personaId={cierre.personaId} nombre={cierre.persona} tamano={40} />}
      sobre={[cierre.ronda, "Ronda cerrada"].filter(Boolean).join(" · ")}
      titulo={`${nombre} cerró su ronda`}
      estado={<Chip tono="verde">{cierre.fecha ? `Cerrada ${diaMes(cierre.fecha)}` : "Cerrada"}</Chip>}
    >
      {/* El cuaderno de la ronda: hoy solo su renglón final (lo que devuelve o lo que le debemos), que es lo que trae el cierre. */}
      <div className="rounded-[20px] bg-hueso p-2">
        <div className="flex items-center gap-4 rounded-2xl bg-papel px-5 py-4">
          <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${devuelve ? "bg-verde/10 text-verde" : "bg-ambar/10 text-ambar-profundo"}`}>
            <IconoFinal className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-tinta">{devuelve ? "Devuelve" : "Le debemos"}</span>
          <span className="whitespace-nowrap font-serif text-[40px] leading-none tabular-nums text-tinta">{soles(cierre.monto)}</span>
        </div>
      </div>
      {cierre.esMia ? (
        <div className="flex flex-col items-start gap-2">
          <Chip tono="pizarra">Es tuyo</Chip>
          <p className="text-sm text-taupe">Lo recibe otra persona de Compras.</p>
        </div>
      ) : espera ? (
        <Aviso tono="atencion" titulo="Primero confirma su plata">
          {soles(cierre.plataPorConfirmar)} en «Plata», por confirmar: todavía no está en su fondo.
        </Aviso>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="flex min-w-0 flex-col gap-5"
        >
          <CampoGuiado id="cuenta" guia={guia} titulo={devuelve ? "¿Dónde entra?" : "¿De dónde sale?"}>
            <FichasCuenta
              etiqueta={devuelve ? "¿Dónde entra la plata?" : "¿De dónde sale?"}
              cuentas={cuentas}
              valor={cuentaId}
              onValor={(x) => {
                setRechazo(null);
                setCuentaId(x);
              }}
              deshabilitado={guardando}
            />
          </CampoGuiado>
          <CampoGuiado id="monto" guia={guia} titulo={devuelve ? "¿Cuánto trajo?" : "¿Cuánto le pagas?"} ayuda={devuelve ? "Cuéntala antes" : undefined} className="max-w-xs">
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
            {otroMonto && devuelve && <p className="mt-1.5 text-xs text-taupe">Lo que no trajo sigue en su plata.</p>}
          </CampoGuiado>
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
              <span className="inline-flex items-center gap-2">
                <IconoBoton className="h-4 w-4" aria-hidden />
                {botonCierre(cierre, montoLeido)}
              </span>
            </Boton>
          </div>
        </form>
      )}
    </PanelDetalle>
  );
}
