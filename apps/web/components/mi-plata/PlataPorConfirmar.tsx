"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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

// Compras simple (ADR-0480, actividad 2): «Revisar compras» ▸ la plata que anotaron las compradoras. Cada fila muestra a quién, cómo le
// llegó, cuánto y su voucher; «Confirmar» la confirma de un toque con lo anotado y la cuenta sugerida (el BCP: Felipe 2026-10-22), y
// «Cambiar» abre la hoja para corregir el monto o la cuenta. «Ya tenía plata» no sale de ninguna cuenta: es el saldo de apertura de su
// fondo. La fila de quien mira no se confirma (nadie confirma su propia plata; la base tampoco lo deja).
//
// Confirmar no lleva token: volver a confirmar lo mismo devuelve lo que ya quedó (un doble clic o un corte no duplican), y con otros datos
// la base dice que ya se confirmó. Desde una terminal no hay toque directo: la hoja pide quién confirma (decisión 39).

type Fila = PlataPorConfirmarConFoto;

export function PlataPorConfirmar({ filas, cuentas }: { filas: Fila[]; cuentas: CuentaOpcion[] }) {
  const sugerida = cuentaSugerida(cuentas);
  const nombreCuenta = (id: string | null) => cuentas.find((c) => c.id === id)?.nombre ?? null;
  return (
    // La fila se acomoda por el ancho de SU tarjeta (`@container`), no por el de la ventana: con el lateral abierto la tarjeta es mucho más
    // angosta. Angosta, el monto va bajo el nombre y los botones en su propia línea; ancha, todo en una fila.
    <ul className="card-cayla @container divide-y divide-sand" data-guia="fondos.plata-anotada">
      {filas.map((f) => (
        <FilaPlata key={f.id} fila={f} cuentas={cuentas} sugerida={sugerida} nombreSugerida={nombreCuenta(sugerida)} />
      ))}
    </ul>
  );
}

function FilaPlata({ fila, cuentas, sugerida, nombreSugerida }: { fila: Fila; cuentas: CuentaOpcion[]; sugerida: string | null; nombreSugerida: string | null }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const yaTenia = fila.medio === "ya_tenia";
  // Un toque basta si firma la persona y hay de dónde sale (o no hace falta: «ya tenía»).
  const deUnToque = esPersona && (yaTenia || sugerida !== null);

  async function confirmarDeUnToque() {
    if (confirmando) return;
    setConfirmando(true);
    const { error } = await confirmarPlata({ p_id: fila.id, p_monto: fila.monto, p_cuenta_origen_id: yaTenia ? null : sugerida }, firmaOmitida("plata_confirmar"));
    setConfirmando(false);
    if (error) {
      return avisar.error(esFalloDeRed(error) ? "Se cortó la conexión" : "No se confirmó", {
        detalle: esFalloDeRed(error) ? "Vuelve a tocar «Confirmar»: si ya se guardó, no se repite." : traducirError(error, "confirmar la plata"),
      });
    }
    avisar.exito(`Confirmaste ${soles(fila.monto)} de ${primerNombre(fila.persona)}`, { detalle: "Ya está en su fondo." });
    router.refresh();
  }

  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 @min-[40rem]:grid-cols-[3.5rem_minmax(0,1fr)_auto_auto]">
      <Voucher fila={fila} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{fila.persona}</span>
        <span className="block text-xs text-taupe">
          {yaTenia ? "Ya tenía de antes · saldo de apertura" : MEDIOS_PLATA[fila.medio].nombre}
          {fila.fecha ? ` · ${diaMes(fila.fecha)}` : ""}
          {!yaTenia && nombreSugerida ? ` · sale de ${nombreSugerida}` : ""}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-serif text-lg tabular-nums text-tinta @min-[40rem]:hidden">{soles(fila.monto)}</span>
      </span>
      <span className="hidden whitespace-nowrap font-serif text-lg tabular-nums text-tinta @min-[40rem]:block">{soles(fila.monto)}</span>
      {fila.esMia ? (
        <span className="col-span-2 flex justify-end @min-[40rem]:col-span-1">
          <Chip tono="pizarra" title="Nadie confirma su propia plata: que la confirme otra persona de Compras.">
            Es tuya
          </Chip>
        </span>
      ) : (
        <span className="col-span-2 flex justify-end gap-2 @min-[40rem]:col-span-1">
          <Boton
            peso="fantasma"
            data-guia="fondos.plata-cambiar"
            disabled={confirmando}
            onClick={(e) => {
              origen.current = e.currentTarget;
              setAbierta(true);
            }}
          >
            Cambiar
          </Boton>
          <Boton
            peso="primario"
            data-guia="fondos.plata-confirmar"
            cargando={confirmando}
            textoCargando="Confirmando…"
            onClick={(e) => {
              if (deUnToque) return void confirmarDeUnToque();
              origen.current = e.currentTarget;
              setAbierta(true);
            }}
          >
            Confirmar
          </Boton>
        </span>
      )}
      {abierta && <ConfirmarPlataModal fila={fila} cuentas={cuentas} sugerida={sugerida} onClose={() => setAbierta(false)} volverA={origen} />}
    </li>
  );
}

function Voucher({ fila }: { fila: Fila }) {
  if (!fila.fotoUrl) {
    return (
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-hueso text-taupe" title={fila.medio === "ya_tenia" ? "Plata que ya tenía" : "No subió foto del voucher"}>
        <ImageOff className="h-5 w-5" aria-hidden />
        <span className="sr-only">Sin foto del voucher</span>
      </span>
    );
  }
  return (
    <a href={fila.fotoUrl} target="_blank" rel="noopener noreferrer" className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-hueso" title="Ver el voucher">
      {/* El voucher es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fila.fotoUrl} alt={`Voucher de ${fila.persona}`} className="h-full w-full object-cover" />
    </a>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function ConfirmarPlataModal({
  fila,
  cuentas,
  sugerida,
  onClose,
  volverA,
}: {
  fila: Fila;
  cuentas: CuentaOpcion[];
  sugerida: string | null;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [monto, setMonto] = useState(fila.monto.toFixed(2));
  const [cuentaId, setCuentaId] = useState(sugerida ?? "");
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const yaTenia = fila.medio === "ya_tenia";
  const guia = useGuiaCampos(camposConfirmar({ monto, cuentaId }, fila.medio, cuentas, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMontoPlata(monto);
  const otroMonto = montoLeido != null && Math.abs(montoLeido - fila.monto) >= 0.005;

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
    avisar.exito(`Confirmaste ${soles(montoLeido ?? 0)} de ${primerNombre(fila.persona)}`, {
      detalle: otroMonto ? `Se anotó ${soles(fila.monto)}: en su plata se ven los dos montos.` : "Ya está en su fondo.",
    });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo="Confirmar la plata"
      subtitulo={`${fila.persona} anotó ${soles(fila.monto)} (${yaTenia ? "plata que ya tenía" : MEDIOS_PLATA[fila.medio].nombre}).`}
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
          {fila.fotoUrl && (
            <a href={fila.fotoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl bg-hueso">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fila.fotoUrl} alt={`Voucher de ${fila.persona}`} className="max-h-72 w-full object-contain" />
            </a>
          )}
          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto llegó?">
            <CampoMonto
              etiqueta="¿Cuánto llegó?"
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
            {otroMonto && <p className="mt-1.5 text-xs text-taupe">Se anotó {soles(fila.monto)}: en su plata se verán los dos montos.</p>}
          </CampoGuiado>
          {yaTenia ? (
            <p className="nota-cayla text-sm">Es la plata que ya tenía antes de usar el sistema: entra como el saldo de apertura de su fondo y no sale de ningún banco.</p>
          ) : (
            <CampoGuiado id="cuenta" guia={guia} titulo="¿De dónde salió?">
              <CampoSelect
                etiqueta="¿De dónde salió?"
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
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              textoCargando="Confirmando…"
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
            >
              {montoLeido != null && montoLeido > 0 ? `Confirmar ${soles(montoLeido)}` : "Confirmar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
