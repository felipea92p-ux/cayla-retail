"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
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
import { cuentaSugerida } from "@/lib/mi-plata-reglas";
import { recibirCierre } from "@/lib/revisar-compras-acciones";
import { botonCierre, camposCierre, textoCierrePorRecibir, type CierrePorRecibir } from "@/lib/revisar-compras-reglas";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ los cierres del día que esperan a Compras. «Lo devuelvo» se recibe en una
// cuenta (vuelve al banco o a la caja fuerte); «CAYLA me debe» se paga desde una. La hoja trae el monto del cierre y la cuenta sugerida, y
// se puede corregir el monto si trajo otra cosa (lo que no devolvió sigue en su plata). Con plata suya por confirmar, primero se confirma:
// la base no deja recibir antes (la plata por confirmar todavía no está en su fondo). El cierre de quien mira no lo recibe ella.

export function CierresPorRecibir({ cierres, cuentas }: { cierres: CierrePorRecibir[]; cuentas: CuentaOpcion[] }) {
  return (
    <ul className="card-cayla @container divide-y divide-sand" data-guia="fondos.cierres">
      {cierres.map((c) => (
        <FilaCierre key={c.id} cierre={c} cuentas={cuentas} />
      ))}
    </ul>
  );
}

function FilaCierre({ cierre, cuentas }: { cierre: CierrePorRecibir; cuentas: CuentaOpcion[] }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  const espera = cierre.plataPorConfirmar > 0.005;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto_auto]">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{cierre.persona}</span>
        <span className="block text-xs text-taupe">
          Terminó de comprar el {diaMes(cierre.fecha)} · {cierre.decision === "devuelve" ? "lo devuelve en caja" : "pagó de su bolsillo"}
        </span>
        {espera && (
          <span className="block text-xs text-ambar-profundo">
            Primero confirma su plata por confirmar ({soles(cierre.plataPorConfirmar)}), arriba.
          </span>
        )}
      </span>
      <span className="whitespace-nowrap font-serif text-lg tabular-nums text-tinta">{textoCierrePorRecibir(cierre)}</span>
      {cierre.esMia ? (
        <span className="flex justify-end">
          <Chip tono="pizarra" title="Lo de tu propio día lo recibe otra persona de Compras.">
            Es tuyo
          </Chip>
        </span>
      ) : (
        <span className="flex justify-end">
          <Boton
            peso="primario"
            disabled={espera}
            title={espera ? "Primero confirma su plata por confirmar" : undefined}
            data-guia="fondos.cierre-recibir"
            onClick={(e) => {
              origen.current = e.currentTarget;
              setAbierta(true);
            }}
          >
            {botonCierre(cierre, cierre.monto)}
          </Boton>
        </span>
      )}
      {abierta && <RecibirCierreModal cierre={cierre} cuentas={cuentas} onClose={() => setAbierta(false)} volverA={origen} />}
    </li>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function RecibirCierreModal({
  cierre,
  cuentas,
  onClose,
  volverA,
}: {
  cierre: CierrePorRecibir;
  cuentas: CuentaOpcion[];
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
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
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo={devuelve ? `Recibir lo que devuelve ${nombre}` : `Pagarle a ${nombre}`}
      subtitulo={
        devuelve
          ? `Terminó de comprar el ${diaMes(cierre.fecha)} y le quedaron ${soles(cierre.monto)}.`
          : `Terminó de comprar el ${diaMes(cierre.fecha)} y puso ${soles(cierre.monto)} de su bolsillo.`
      }
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
          <CampoGuiado id="cuenta" guia={guia} titulo={devuelve ? "¿A dónde vuelve?" : "¿De dónde sale?"}>
            <CampoSelect
              etiqueta={devuelve ? "¿A dónde vuelve?" : "¿De dónde sale?"}
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
              {botonCierre(cierre, montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
