"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";
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
import { confirmarPlata } from "@/lib/mi-plata-acciones";
import { MEDIOS_PLATA, camposConfirmar, cuentaSugerida } from "@/lib/mi-plata-reglas";
import type { PlataPorConfirmarConFoto } from "@/lib/mi-plata";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 2): «Revisar compras» ▸ la plata que anotaron las compradoras. Rediseño (2026-10-23): se revisa en
// el detalle de la bandeja, al lado de la lista: el voucher en grande, el monto, la cuenta sugerida (el BCP: Felipe 2026-10-22) y
// «Confirmar S/ X». «Ya tenía plata» no sale de ninguna cuenta: es el saldo de apertura de su fondo. La de quien mira no se confirma
// (nadie confirma su propia plata; la base tampoco lo deja).
//
// Confirmar no lleva token: volver a confirmar lo mismo devuelve lo que ya quedó (un doble clic o un corte no duplican), y con otros datos
// la base dice que ya se confirmó. Desde una terminal, pide quién confirma (decisión 39).

type Fila = PlataPorConfirmarConFoto;
type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** La miniatura del voucher en la fila de la bandeja. */
export function MiniVoucher({ fila }: { fila: Fila }) {
  if (!fila.fotoUrl) {
    return (
      <span className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-xl bg-hueso text-taupe" title={fila.medio === "ya_tenia" ? "Plata que ya tenía" : "Sin foto del voucher"}>
        <ImageOff className="h-5 w-5" aria-hidden />
      </span>
    );
  }
  return (
    <span className="block h-[54px] w-[54px] shrink-0 overflow-hidden rounded-xl bg-hueso">
      {/* El voucher es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fila.fotoUrl} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

export function DetallePlata({ fila, cuentas, alTerminar }: { fila: Fila; cuentas: CuentaOpcion[]; alTerminar: () => void }) {
  const router = useRouter();
  const [monto, setMonto] = useState(fila.monto.toFixed(2));
  const [cuentaId, setCuentaId] = useState(cuentaSugerida(cuentas) ?? "");
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const yaTenia = fila.medio === "ya_tenia";
  const guia = useGuiaCampos(camposConfirmar({ monto, cuentaId }, fila.medio, cuentas, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMontoPlata(monto);
  const otroMonto = montoLeido != null && Math.abs(montoLeido - fila.monto) >= 0.005;
  const nombre = primerNombre(fila.persona);

  async function confirmar() {
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    setGuardando(true);
    const firma = esPersona ? firmaOmitida("plata_confirmar") : responsable.firma();
    const { error } = await confirmarPlata({ p_id: fila.id, p_monto: montoLeido ?? 0, p_cuenta_origen_id: yaTenia ? null : cuentaId }, firma);
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se confirmó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se confirmó", texto: traducirError(error, "confirmar la plata"), tono: "error" },
      );
    }
    avisar.exito(`Confirmaste ${soles(montoLeido ?? 0)} de ${nombre}`, {
      detalle: otroMonto ? `Se anotó ${soles(fila.monto)}: en su plata se ven los dos montos.` : "Ya está en su fondo.",
    });
    alTerminar();
    router.refresh();
  }

  return (
    <PanelDetalle
      guia="fondos.plata-detalle"
      sobre={`${fila.persona}${fila.fecha ? ` · ${diaMes(fila.fecha)}` : ""}`}
      titulo={yaTenia ? `Ya tenía ${soles(fila.monto)}` : `Le llegaron ${soles(fila.monto)}`}
      estado={<Chip tono="ambar">Por confirmar</Chip>}
    >
      <div className="grid gap-5 @min-[38rem]:grid-cols-[18.75rem_minmax(0,1fr)]">
        {fila.fotoUrl ? (
          <a href={fila.fotoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl bg-hueso p-3" title="Ver el voucher en grande">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fila.fotoUrl} alt={`Voucher de ${fila.persona}`} className="max-h-80 w-full object-contain" />
          </a>
        ) : (
          <p className="nota-cayla text-sm">{yaTenia ? "Es la plata que ya tenía antes de usar el sistema: no hay voucher." : "No subió foto del voucher."}</p>
        )}
        {fila.esMia ? (
          <div className="flex flex-col items-start gap-2">
            <Chip tono="pizarra">Es tuya</Chip>
            <p className="text-sm text-taupe">Nadie confirma su propia plata: que la confirme otra persona de Compras.</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirmar();
            }}
            className="flex min-w-0 flex-col gap-5"
          >
            <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto llegó?">
              <CampoMonto
                etiqueta="¿Cuánto llegó?"
                etiquetaOculta
                inputMode="decimal"
                autoComplete="off"
                value={monto}
                disabled={guardando}
                data-guia="fondos.plata-monto"
                onChange={(e) => {
                  setRechazo(null);
                  setMonto(e.target.value);
                }}
              />
              <p className="mt-1.5 text-xs text-taupe">
                {otroMonto ? `Se anotó ${soles(fila.monto)}: en su plata se verán los dos montos.` : `Lo anotó como ${MEDIOS_PLATA[fila.medio].nombre.toLowerCase()}.`}
              </p>
            </CampoGuiado>
            {yaTenia ? (
              <p className="nota-cayla text-sm">Entra como el saldo de apertura de su fondo y no sale de ningún banco.</p>
            ) : (
              <CampoGuiado id="cuenta" guia={guia} titulo="¿De qué cuenta salió?">
                <CampoSelect
                  etiqueta="¿De qué cuenta salió?"
                  caja
                  valor={cuentaId}
                  onValor={(v) => {
                    setRechazo(null);
                    setCuentaId(v);
                  }}
                  opciones={opcionesDeCuentas(cuentas)}
                  marcador={cuentas.length === 0 ? "No hay un banco ni una caja fuerte activos" : "Elige el banco o la caja fuerte"}
                  deshabilitado={guardando || cuentas.length === 0}
                />
              </CampoGuiado>
            )}
            {!yaTenia && <p className="nota-cayla text-sm">Al confirmar, la plata entra al fondo de {nombre} y sale del banco en los libros.</p>}
            {!esPersona && (
              <CampoGuiado id="responsable" guia={guia} titulo="Quién confirma">
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
            )}
            {rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )}
            <PieGuia guia={guia} listo="Todo listo para confirmar." conFrase />
            <div className="pie-acciones border-t border-sand pt-4">
              <Boton
                textoCargando="Confirmando…"
                type="submit"
                peso="primario"
                cargando={guardando}
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
                data-guia="fondos.plata-confirmar"
              >
                {montoLeido != null && montoLeido > 0 ? `Confirmar ${soles(montoLeido)}` : "Confirmar"}
              </Boton>
            </div>
          </form>
        )}
      </div>
    </PanelDetalle>
  );
}
