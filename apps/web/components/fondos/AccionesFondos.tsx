"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMonto } from "@/lib/caja-cierre-reglas";
import { soles } from "@/lib/compras-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import {
  MAX_TEXTO_FONDO,
  TEXTO_MOVIMIENTO_FONDO,
  camposDevolver,
  camposEntregar,
  fraseDevolver,
  fraseEntregar,
  opcionesDeCuentas,
  opcionesDePersonas,
  primerNombre,
  type CuentaOpcion,
  type FondoFila,
  type MovimientoFondo,
  type OpcionesFondos,
} from "@/lib/fondos-reglas";
import { anularMovimientoFondo, devolverFondo, entregarFondo } from "@/lib/fondos-acciones";

// Fondos por rendir (ADR-0362, fase 6 · actividad 1): las tres hojas que guardan. Cada una con su guía de foco (ADR-0284): lo que
// falta es lo MISMO que rechaza la base (`camposEntregar`, `camposDevolver`, `lib/fondos-reglas.ts`).
//
// Quién firma (decisión 39): con la cuenta de una PERSONA no hay combo —firma ella—; desde una TERMINAL, el combo «Responsable». La base
// además impide que alguien mueva su propio fondo desde aquí (ni con su cuenta ni eligiéndose en el combo): la pantalla ya no lo ofrece
// (la persona sale en la lista pero no se elige; su fila no lleva «Registrar devolución» ni «Anular»), y si igual llegara, lo dice.
//
// Un doble clic no duplica: el candado se pone en el mismo tick y la base recibe un token por hoja (`p_token`): un reintento tras un
// corte de señal devuelve el MISMO movimiento.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** Lo que dice la hoja cuando la base no guardó (o la señal se cortó: pudo guardarse, y reintentar con la misma hoja no repite). */
function rechazoDe(error: Parameters<typeof traducirError>[0], que: string): Rechazo {
  if (error && esFalloDeRed(error)) {
    return {
      titulo: "Se cortó la conexión",
      texto: `No sabemos si alcanzó a ${que}. Vuelve a tocar el botón: si ya se guardó, no se repite.`,
      tono: "atencion",
    };
  }
  return { titulo: "No se guardó", texto: traducirError(error, que), tono: "error" };
}

// ---------- Entregar plata ----------

export function EntregarFondo({ opciones }: { opciones: OpcionesFondos }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="primario"
        data-guia="fondos.entregar"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        + Entregar plata
      </Boton>
      {abierta && <EntregarFondoModal opciones={opciones} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function EntregarFondoModal({ opciones, onClose, volverA }: { opciones: OpcionesFondos; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [personaId, setPersonaId] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  const campos: CampoDeGuia[] = camposEntregar({ personaId, cuentaId, monto, motivo }, opciones, {
    esPersona,
    listo: responsable.listo,
    motivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);
  const persona = opciones.personas.find((p) => p.id === personaId) ?? null;
  const montoLeido = leerMonto(monto);
  const sinCuentas = opciones.cuentas.length === 0;

  const limpiar = <T,>(f: (v: T) => void) => (v: T) => {
    setRechazo(null);
    f(v);
  };

  async function confirmar() {
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const firma = esPersona ? firmaOmitida("fondo_entregar") : responsable.firma();
      const { id, error } = await entregarFondo(
        { p_persona_id: personaId, p_cuenta_origen_id: cuentaId, p_monto: montoLeido ?? 0, p_motivo: motivo.trim(), p_token: token },
        firma,
      );
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error || !id) {
        setRechazo(rechazoDe(error, "entregar la plata"));
        return;
      }
      avisar.exito(`Le entregaste ${soles(montoLeido ?? 0)} a ${primerNombre(persona?.nombre ?? "")}`, {
        detalle: "Ya está en su fondo: aquí ves cuánto tiene en la mano.",
      });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal titulo="Entregar plata" subtitulo="Para que compre: queda en su fondo hasta que la rinda." onClose={onClose} variante="hoja" alCerrarEnfocar={volverA}>
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <CampoGuiado id="persona" guia={guia} titulo="¿A quién le entregas?">
            <CampoSelect
              etiqueta="¿A quién le entregas?"
              caja
              valor={personaId}
              onValor={limpiar(setPersonaId)}
              opciones={opcionesDePersonas(opciones)}
              marcador="Elige a la persona"
              deshabilitado={guardando}
            />
          </CampoGuiado>
          <CampoGuiado id="cuenta" guia={guia} titulo="¿De dónde sale la plata?">
            <CampoSelect
              etiqueta="¿De dónde sale la plata?"
              caja
              valor={cuentaId}
              onValor={limpiar(setCuentaId)}
              opciones={opcionesDeCuentas(opciones.cuentas)}
              marcador={sinCuentas ? "No hay un banco ni una caja fuerte activos" : "Elige el banco o la caja fuerte"}
              deshabilitado={guardando || sinCuentas}
            />
          </CampoGuiado>
          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto?">
            <CampoMonto
              etiqueta="¿Cuánto?"
              etiquetaOculta
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              disabled={guardando}
              onChange={(e) => limpiar(setMonto)(e.target.value)}
            />
          </CampoGuiado>
          <CampoGuiado id="motivo" guia={guia} titulo="¿Para qué es?">
            <CampoTexto
              etiqueta="¿Para qué es?"
              caja
              maxLength={MAX_TEXTO_FONDO}
              // sugerir-fijo: el «para qué» es la compra o el viaje; no depende de a quién ni de qué cuenta se eligió.
              placeholder="Ej. Compras en Gamarra de esta semana"
              value={motivo}
              disabled={guardando}
              onChange={(e) => limpiar(setMotivo)(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-taupe">Lo verá quien revise el fondo y quien lo rinda.</p>
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién entrega">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para entregar." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Entregando…" : fraseEntregar(montoLeido, persona?.nombre ?? null)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------- Registrar lo que la persona devuelve ----------

export function DevolverFondo({ fondo, cuentas }: { fondo: FondoFila; cuentas: CuentaOpcion[] }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="fantasma"
        data-guia="fondos.devolver"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        Registrar devolución
      </Boton>
      {abierta && <DevolverFondoModal fondo={fondo} cuentas={cuentas} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function DevolverFondoModal({
  fondo,
  cuentas,
  onClose,
  volverA,
}: {
  fondo: FondoFila;
  cuentas: CuentaOpcion[];
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState("");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const nombre = primerNombre(fondo.persona);

  const guia = useGuiaCampos(camposDevolver({ cuentaId, monto, nota }, fondo.saldo, cuentas, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMonto(monto);

  async function confirmar() {
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const firma = esPersona ? firmaOmitida("fondo_devolver") : responsable.firma();
      const { id, error } = await devolverFondo(
        { p_persona_id: fondo.personaId, p_cuenta_destino_id: cuentaId, p_monto: montoLeido ?? 0, p_nota: nota.trim() || null, p_token: token },
        firma,
      );
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error || !id) {
        setRechazo(rechazoDe(error, "registrar lo devuelto"));
        return;
      }
      avisar.exito(`${nombre} devolvió ${soles(montoLeido ?? 0)}`, { detalle: "Ya no cuenta en su fondo." });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Lo que devuelve ${nombre}`}
      subtitulo={`Tiene ${soles(fondo.saldo)} en su fondo.`}
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <p className="text-sm text-tinta/75">Lo registra quien recibe la plata, no quien la devuelve.</p>
          <CampoGuiado id="cuenta" guia={guia} titulo="¿A dónde vuelve la plata?">
            <CampoSelect
              etiqueta="¿A dónde vuelve la plata?"
              caja
              valor={cuentaId}
              onValor={(v) => {
                setRechazo(null);
                setCuentaId(v);
              }}
              opciones={opcionesDeCuentas(cuentas)}
              marcador="Elige el banco o la caja fuerte"
              deshabilitado={guardando}
            />
          </CampoGuiado>
          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto devuelve?">
            <CampoMonto
              etiqueta="¿Cuánto devuelve?"
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
          </CampoGuiado>
          <CampoGuiado id="nota" guia={guia} titulo="Nota">
            <CampoTexto
              etiqueta="Nota"
              caja
              maxLength={MAX_TEXTO_FONDO}
              // sugerir-fijo: la nota de una devolución cuenta qué pasó; no depende de la cuenta ni del monto elegidos.
              placeholder="Ej. Lo que sobró de la compra"
              value={nota}
              disabled={guardando}
              onChange={(e) => setNota(e.target.value)}
            />
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para registrar." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Registrando…" : fraseDevolver(montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------- Anular una entrega o una devolución ----------

export function AnularMovimientoFondo({ movimiento }: { movimiento: MovimientoFondo }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="fantasma"
        data-guia="fondos.anular"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        Anular
      </Boton>
      {abierta && <AnularMovimientoFondoModal movimiento={movimiento} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function AnularMovimientoFondoModal({
  movimiento,
  onClose,
  volverA,
}: {
  movimiento: MovimientoFondo;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const enVuelo = useRef(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const que = TEXTO_MOVIMIENTO_FONDO[movimiento.tipo].toLowerCase();

  // Lo que falta = lo que `anular_movimiento_fondo` rechazaría: el motivo y, desde una terminal, quién lo anula.
  const campos: CampoDeGuia[] = [
    { id: "motivo", nombre: "Motivo", requerido: true, hecho: motivo.trim() !== "", pendiente: "Di por qué se anula." },
    ...(esPersona
      ? []
      : [{ id: "responsable", nombre: "Quién la anula", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién la anula." }]),
  ];
  const guia = useGuiaCampos(campos);

  async function confirmar() {
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const firma = esPersona ? firmaOmitida("fondo_anular") : responsable.firma();
      const { error } = await anularMovimientoFondo({ p_id: movimiento.id, p_motivo: motivo.trim() }, firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error) {
        setRechazo(rechazoDe(error, `anular la ${que}`));
        return;
      }
      avisar.exito(`Anulaste la ${que} de ${soles(movimiento.monto)}`, { detalle: "Queda a la vista, tachada, con quién la anuló y por qué." });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Anular la ${que}`}
      subtitulo={`${movimiento.persona} · ${soles(movimiento.monto)}`}
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <p className="text-sm text-tinta/75">
            {movimiento.tipo === "entrega_fondo"
              ? "La plata vuelve a contar donde estaba y deja de contar en su fondo."
              : "La plata vuelve a contar en su fondo."}{" "}
            No se borra: queda a la vista con quién la anuló y por qué. <b className="font-medium text-tinta">Esto no se puede deshacer.</b>
          </p>
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué se anula">
            <CampoTexto
              etiqueta="Por qué se anula"
              caja
              autoFocus
              maxLength={MAX_TEXTO_FONDO}
              value={motivo}
              onChange={(e) => {
                setRechazo(null);
                setMotivo(e.target.value);
              }}
            />
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién la anula">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para anular." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="peligro" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Anulando…" : `Anular la ${que}`}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
