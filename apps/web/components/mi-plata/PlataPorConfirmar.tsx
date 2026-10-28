"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CameraOff, Check, ImageOff, Wallet, ZoomIn } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
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
import { primerNombre, type CuentaOpcion } from "@/lib/fondos-reglas";
import { confirmarPlata } from "@/lib/mi-plata-acciones";
import { MEDIOS_PLATA, camposConfirmar, cuentaAlConfirmar, textoBancoIndicado } from "@/lib/mi-plata-reglas";
import type { PlataPorConfirmarConFoto } from "@/lib/mi-plata";
import { FichasCuenta } from "@/components/fondos/FichasCuenta";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 2): «Revisar compras» ▸ la plata que anotaron las compradoras. Rediseño (2026-10-23): se revisa en
// el detalle de la bandeja, al lado de la lista: el voucher en grande, el monto, la cuenta sugerida (el BCP: Felipe 2026-10-22) y
// «Confirmar S/ X». «Ya tenía plata» no sale de ninguna cuenta: es el saldo de apertura de su fondo. La de quien mira no se confirma
// (nadie confirma su propia plata; la base tampoco lo deja).
//
// Confirmar no lleva token: volver a confirmar lo mismo devuelve lo que ya quedó (un doble clic o un corte no duplican), y con otros datos
// la base dice que ya se confirmó. Desde una terminal, pide quién confirma (decisión 39).
//
// Sigue el diseño «A · Bandeja serena» que Felipe eligió el 2026-10-23 mirando las capturas: arriba la persona con su avatar y el medio
// y el día en un chip; abajo, el voucher grande a la izquierda y, a la derecha, «¿Cuánto llegó?» y la cuenta en fichas de un toque.
// Sin párrafos: lo que antes decía una nota es ahora un dato (✓ igual a lo que anotó, el bloque del saldo de apertura).

type Fila = PlataPorConfirmarConFoto;
type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** La miniatura del voucher en la fila de la bandeja. */
export function MiniVoucher({ fila }: { fila: Fila }) {
  if (!fila.fotoUrl) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-hueso text-taupe" title={fila.medio === "ya_tenia" ? "Plata que ya tenía" : "Sin foto del voucher"}>
        <ImageOff className="h-5 w-5" aria-hidden />
      </span>
    );
  }
  return (
    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-hueso">
      {/* El voucher es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fila.fotoUrl} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

/** El voucher en grande, a la izquierda del detalle: la foto (se abre entera al tocarla) o, sin foto, un dibujo con su chip. */
function VoucherGrande({ fila }: { fila: Fila }) {
  const yaTenia = fila.medio === "ya_tenia";
  if (!fila.fotoUrl) {
    const Icono = yaTenia ? Wallet : ImageOff;
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-hueso p-4 text-taupe">
        <Icono /* unificar-fijo: un ícono grande (24 px o más) es un dibujo: trazo 1,5, como el de un vacío (ronda 15) */ className="h-14 w-14" strokeWidth={1.5} aria-hidden />
        <Chip tono="neutro" versalitas={false}>
          {yaTenia ? (
            <>
              <Wallet className="h-3 w-3" aria-hidden />
              Ya la tenía
            </>
          ) : (
            <>
              <CameraOff className="h-3 w-3" aria-hidden />
              Sin foto
            </>
          )}
        </Chip>
      </div>
    );
  }
  return (
    <a
      href={fila.fotoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-2xl bg-hueso p-3"
      title="Ver el voucher en grande"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fila.fotoUrl} alt={`Voucher de ${fila.persona}`} className="max-h-80 w-full rounded-xl object-contain" />
      <span aria-hidden className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-papel text-tinta">
        <ZoomIn className="h-4 w-4" />
      </span>
    </a>
  );
}

export function DetallePlata({ fila, cuentas, alTerminar }: { fila: Fila; cuentas: CuentaOpcion[]; alTerminar: () => void }) {
  const router = useRouter();
  const [monto, setMonto] = useState(fila.monto.toFixed(2));
  // Llega elegido el banco que dijo la compradora (si sigue disponible) o, si no, el BCP: Compras lo cambia si la transferencia salió de otro.
  const [cuentaId, setCuentaId] = useState(cuentaAlConfirmar(fila, cuentas));
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
      avatar={<AvatarPersona personaId={fila.personaId} nombre={fila.persona} tamano={40} />}
      sobre={["Plata por confirmar", fila.ronda].filter(Boolean).join(" · ")}
      titulo={fila.persona}
      estado={<Chip tono="pizarra">{[MEDIOS_PLATA[fila.medio].nombre, fila.fecha ? diaMes(fila.fecha) : null].filter(Boolean).join(" · ")}</Chip>}
    >
      <div className="grid gap-6 @min-[38rem]:grid-cols-[13rem_minmax(0,1fr)]">
        <VoucherGrande fila={fila} />
        {fila.esMia ? (
          <div className="flex flex-col items-start gap-2">
            <Chip tono="pizarra">Es tuya</Chip>
            <p className="text-sm text-taupe">Que la confirme otra persona de Compras.</p>
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
              {otroMonto ? (
                <p className="mt-1.5 text-xs text-taupe">Anotó {soles(fila.monto)}: en su plata se verán los dos montos.</p>
              ) : (
                montoLeido != null && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-verde">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Igual a lo que anotó
                  </p>
                )
              )}
            </CampoGuiado>
            {yaTenia ? (
              <div className="flex items-center gap-3 rounded-2xl bg-hueso p-3">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-papel text-taupe">
                  <Wallet className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-tinta">Saldo de apertura</span>
                  <span className="block text-xs text-taupe">No sale de ningún banco.</span>
                </span>
              </div>
            ) : (
              <CampoGuiado id="cuenta" guia={guia} titulo="¿De qué cuenta salió?">
                <FichasCuenta
                  etiqueta="¿De qué cuenta salió?"
                  cuentas={cuentas}
                  valor={cuentaId}
                  onValor={(v) => {
                    setRechazo(null);
                    setCuentaId(v);
                  }}
                  deshabilitado={guardando}
                />
                {textoBancoIndicado(nombre, fila.cuentaIndicada) && <p className="mt-1.5 text-xs text-taupe">{textoBancoIndicado(nombre, fila.cuentaIndicada)}</p>}
              </CampoGuiado>
            )}
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
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4" aria-hidden />
                  {montoLeido != null && montoLeido > 0 ? `Confirmar ${soles(montoLeido)}` : "Confirmar"}
                </span>
              </Boton>
            </div>
          </form>
        )}
      </div>
    </PanelDetalle>
  );
}
