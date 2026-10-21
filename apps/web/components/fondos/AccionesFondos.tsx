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
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import {
  ARTICULO_MOVIMIENTO_FONDO,
  MAX_TEXTO_FONDO,
  TEXTO_MOVIMIENTO_FONDO,
  camposDevolver,
  camposEntregar,
  fraseDevolver,
  fraseEntregar,
  opcionesDeCuentas,
  opcionesDePersonas,
  primerNombre,
  subtituloDevolver,
  topeDevolucion,
  type CuentaOpcion,
  type FondoFila,
  type MovimientoFondo,
  type OpcionesFondos,
} from "@/lib/fondos-reglas";
import { anularMovimientoFondo, anularPagoDeudaFondo, devolverFondo, entregarFondo, pagarDeudaFondo } from "@/lib/fondos-acciones";
import { camposPagarDeuda, frasePagarDeuda, repartoDelPago, type DeudaDePersona } from "@/lib/deuda-fondo-reglas";
import { diaMes } from "@/lib/fechas-lima";

// Fondos por rendir (ADR-0362, fase 6 · actividad 1): las hojas que guardan. Cada una con su guía de foco (ADR-0284): lo que falta es lo
// MISMO que rechaza la base (`camposEntregar`, `camposDevolver`, `lib/fondos-reglas.ts`; `camposPagarDeuda`, `lib/deuda-fondo-reglas.ts`).
// La actividad 7 suma «Registrar su pago»: lo que la persona devuelve de la deuda de un faltante (decisión 71: solo así se salda).
//
// Quién firma (decisión 39): con la cuenta de una PERSONA no hay combo —firma ella—; desde una TERMINAL, el combo «Responsable». La base
// además impide que alguien mueva su propio fondo desde aquí (ni con su cuenta ni eligiéndose en el combo): la pantalla ya no lo ofrece
// (la persona sale en la lista pero no se elige; su fila no lleva «Registrar devolución» ni «Anular»), y si igual llegara, lo dice.
//
// Un doble clic no duplica y un reintento tras un corte no cambia lo que se guarda: la marca de cada envío sigue a lo que se manda
// (`useIntento`, /chaos 2026-10-14). Si la respuesta se pierde, la hoja se congela («No sabemos si se guardó») hasta reenviar lo mismo o
// preguntarle a la base; corregir el monto antes de saber qué pasó ya no anuncia lo que no se guardó.

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
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  // La marca sigue a lo que se manda (`useIntento`, /chaos 2026-10-14): si la respuesta se pierde, la hoja se congela hasta saber qué
  // pasó; nunca se manda otra cosa con la misma marca ni se anuncia algo distinto de lo que guardó la base.
  const intento = useIntento("entregar_fondo");
  const guardando = intento.enviando;
  const congelada = intento.incierto;
  const [revisando, setRevisando] = useState(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  const campos: CampoDeGuia[] = camposEntregar({ personaId, cuentaId, monto, motivo }, opciones, {
    esPersona,
    listo: responsable.listo,
    motivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);
  const persona = opciones.personas.find((p) => p.id === personaId) ?? null;
  const montoLeido = leerMontoPlata(monto);
  const sinCuentas = opciones.cuentas.length === 0;

  const limpiar = <T,>(f: (v: T) => void) => (v: T) => {
    setRechazo(null);
    f(v);
  };

  async function confirmar() {
    if (guardando) return;
    if (!congelada && !guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    const firma = esPersona ? firmaOmitida("fondo_entregar") : responsable.firma();
    const args = { p_persona_id: personaId, p_cuenta_origen_id: cuentaId, p_monto: montoLeido ?? 0, p_motivo: motivo.trim() };
    const r = await intento.enviar(huellaDe(args), (token, senal) => entregarFondo(args, firma, token, senal));
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    if (!esPersona) responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") return setRechazo(rechazoDe(r.error, "entregar la plata"));
    entregada();
  }

  // Lo que se anuncia es lo que se mandó: con la hoja congelada mientras estuvo en duda, es lo mismo que guardó la base.
  function entregada() {
    avisar.exito(`Le entregaste ${soles(montoLeido ?? 0)} a ${primerNombre(persona?.nombre ?? "")}`, {
      detalle: "Ya está en su fondo: aquí ves cuánto tiene en la mano.",
    });
    onClose();
    router.refresh();
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return entregada();
    if (res.tipo === "no_llego") return avisar.aviso("La entrega no se registró", { detalle: "No quedó nada guardado: revisa los datos y vuelve a entregar." });
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  return (
    <Modal titulo="Entregar plata" subtitulo="Para que compre: queda en su fondo hasta que la rinda." onClose={onClose} variante="hoja" alCerrarEnfocar={volverA} bloqueado={guardando || congelada}>
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <fieldset disabled={congelada} className="campos-congelables min-w-0 space-y-5">
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
          </fieldset>
          {congelada ? (
            <AvisoIntentoIncierto onRevisar={() => void revisar()} revisando={revisando} />
          ) : (
            rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )
          )}
          <PieGuia guia={guia} listo="Todo listo para entregar." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando || congelada}>
              Cancelar
            </Boton>
            <Boton textoCargando="Entregando…" type="submit" peso="primario" cargando={guardando} disabled={!congelada && !guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {congelada ? "Volver a intentar" : fraseEntregar(montoLeido, persona?.nombre ?? null)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------- Registrar lo que la persona devuelve ----------

// `porAprobar`: el faltante de su rendición por aprobar (0 si no tiene una). Con él, el tope es lo que tiene en la mano (`topeDevolucion`).
export function DevolverFondo({ fondo, cuentas, porAprobar = 0 }: { fondo: FondoFila; cuentas: CuentaOpcion[]; porAprobar?: number }) {
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
      {abierta && <DevolverFondoModal fondo={fondo} cuentas={cuentas} porAprobar={porAprobar} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function DevolverFondoModal({
  fondo,
  cuentas,
  porAprobar,
  onClose,
  volverA,
}: {
  fondo: FondoFila;
  cuentas: CuentaOpcion[];
  porAprobar: number;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState("");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  // La marca sigue a lo que se manda (`useIntento`, /chaos 2026-10-14): si la respuesta se pierde, la hoja se congela hasta saber qué
  // pasó; nunca se manda otra cosa con la misma marca ni se anuncia algo distinto de lo que guardó la base.
  const intento = useIntento("devolver_fondo");
  const guardando = intento.enviando;
  const congelada = intento.incierto;
  const [revisando, setRevisando] = useState(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const nombre = primerNombre(fondo.persona);

  const tope = topeDevolucion(fondo.saldo, porAprobar);
  const guia = useGuiaCampos(camposDevolver({ cuentaId, monto, nota }, tope, cuentas, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMontoPlata(monto);

  async function confirmar() {
    if (guardando) return;
    if (!congelada && !guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    const firma = esPersona ? firmaOmitida("fondo_devolver") : responsable.firma();
    const args = { p_persona_id: fondo.personaId, p_cuenta_destino_id: cuentaId, p_monto: montoLeido ?? 0, p_nota: nota.trim() || null };
    const r = await intento.enviar(huellaDe(args), (token, senal) => devolverFondo(args, firma, token, senal));
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    if (!esPersona) responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") return setRechazo(rechazoDe(r.error, "registrar lo devuelto"));
    registrada();
  }

  function registrada() {
    avisar.exito(`${nombre} devolvió ${soles(montoLeido ?? 0)}`, { detalle: "Ya no cuenta en su fondo." });
    onClose();
    router.refresh();
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return registrada();
    if (res.tipo === "no_llego") return avisar.aviso("La devolución no se registró", { detalle: "No quedó nada guardado: revisa los datos y vuelve a registrarla." });
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  return (
    <Modal
      titulo={`Lo que devuelve ${nombre}`}
      subtitulo={subtituloDevolver(tope)}
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
      bloqueado={guardando || congelada}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <fieldset disabled={congelada} className="campos-congelables min-w-0 space-y-5">
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
          </fieldset>
          {congelada ? (
            <AvisoIntentoIncierto onRevisar={() => void revisar()} revisando={revisando} />
          ) : (
            rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )
          )}
          <PieGuia guia={guia} listo="Todo listo para registrar." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando || congelada}>
              Cancelar
            </Boton>
            <Boton textoCargando="Registrando…" type="submit" peso="primario" cargando={guardando} disabled={!congelada && !guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {congelada ? "Volver a intentar" : fraseDevolver(montoLeido)}
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
  const art = ARTICULO_MOVIMIENTO_FONDO[movimiento.tipo];
  const esPago = movimiento.tipo === "pago_deuda_fondo";

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
      const firma = esPersona ? firmaOmitida(esPago ? "fondo_deuda_anular" : "fondo_anular") : responsable.firma();
      const args = { p_id: movimiento.id, p_motivo: motivo.trim() };
      const { error } = esPago ? await anularPagoDeudaFondo(args, firma) : await anularMovimientoFondo(args, firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error) {
        setRechazo(rechazoDe(error, `anular ${art} ${que}`));
        return;
      }
      avisar.exito(`Anulaste ${art} ${que} de ${soles(movimiento.monto)}`, {
        detalle: esPago ? `${movimiento.persona} vuelve a deber ese monto. Queda a la vista, tachado, con quién lo anuló y por qué.` : "Queda a la vista, tachada, con quién la anuló y por qué.",
      });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Anular ${art} ${que}`}
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
              : esPago
                ? `La plata deja de contar en ${movimiento.cuenta} y ${primerNombre(movimiento.persona)} vuelve a deber ${soles(movimiento.monto)}.`
                : "La plata vuelve a contar en su fondo."}{" "}
            No se borra: queda a la vista con quién {esPago ? "lo" : "la"} anuló y por qué. <b className="font-medium text-tinta">Esto no se puede deshacer.</b>
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
            <Boton textoCargando="Anulando…" type="submit" peso="peligro" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {`Anular ${art} ${que}`}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------- Registrar lo que la persona paga de su deuda (actividad 7) ----------

export function PagarDeudaFondo({ deuda, cuentas }: { deuda: DeudaDePersona; cuentas: CuentaOpcion[] }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="fantasma"
        data-guia="fondos.pagar-deuda"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        Registrar su pago
      </Boton>
      {abierta && <PagarDeudaFondoModal deuda={deuda} cuentas={cuentas} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function PagarDeudaFondoModal({
  deuda,
  cuentas,
  onClose,
  volverA,
}: {
  deuda: DeudaDePersona;
  cuentas: CuentaOpcion[];
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState("");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  // La marca sigue a lo que se manda (`useIntento`, /chaos 2026-10-14): si la respuesta se pierde, la hoja se congela hasta saber qué
  // pasó; nunca se manda otra cosa con la misma marca ni se anuncia algo distinto de lo que guardó la base.
  const intento = useIntento("pagar_deuda_fondo");
  const guardando = intento.enviando;
  const congelada = intento.incierto;
  const [revisando, setRevisando] = useState(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const nombre = primerNombre(deuda.persona);

  const guia = useGuiaCampos(camposPagarDeuda({ cuentaId, monto, nota }, deuda.debe, cuentas, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMontoPlata(monto);
  // Con varias deudas, cuánto paga de cada una (la más vieja primero, como la base).
  const reparto = deuda.deudas.length > 1 && montoLeido != null && montoLeido > 0 && montoLeido <= deuda.debe + 0.005 ? repartoDelPago(montoLeido, deuda.deudas) : [];

  async function confirmar() {
    if (guardando) return;
    if (!congelada && !guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    const firma = esPersona ? firmaOmitida("fondo_deuda_pagar") : responsable.firma();
    const args = { p_persona_id: deuda.personaId, p_monto: montoLeido ?? 0, p_cuenta_destino_id: cuentaId, p_nota: nota.trim() || null };
    const r = await intento.enviar(huellaDe(args), (token, senal) => pagarDeudaFondo(args, firma, token, senal));
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    if (!esPersona) responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") return setRechazo(rechazoDe(r.error, "registrar el pago"));
    pagada();
  }

  function pagada() {
    const pagado = montoLeido ?? 0;
    const queda = Math.round((deuda.debe - pagado) * 100) / 100;
    avisar.exito(`${nombre} pagó ${soles(pagado)} de su deuda`, { detalle: queda > 0 ? `Todavía debe ${soles(queda)}.` : "Ya no debe nada." });
    onClose();
    router.refresh();
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return pagada();
    if (res.tipo === "no_llego") return avisar.aviso("El pago no se registró", { detalle: "No quedó nada guardado: revisa los datos y vuelve a registrarlo." });
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  return (
    <Modal
      titulo={`Lo que paga ${nombre} de su deuda`}
      subtitulo={`Debe ${soles(deuda.debe)} por faltantes de su fondo.`}
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
      bloqueado={guardando || congelada}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <fieldset disabled={congelada} className="campos-congelables min-w-0 space-y-5">
          <p className="text-sm text-tinta/75">Lo registra quien recibe la plata, no quien la debe. La deuda baja apenas se guarda.</p>
          {deuda.deudas.length > 1 && (
            <ul className="divide-y divide-sand rounded-xl border border-sand text-sm" data-sin-cascada>
              {deuda.deudas.map((d) => (
                <li key={d.rendicionId} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <span className="text-tinta/80">Rendición aprobada el {diaMes(d.desde)}</span>
                  <span className="tabular-nums text-tinta">debe {soles(d.debe)}</span>
                </li>
              ))}
            </ul>
          )}
          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto pagó?">
            <CampoMonto
              etiqueta="¿Cuánto pagó?"
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
            <button
              type="button"
              className="btn-enlace mt-1.5 text-xs"
              disabled={guardando}
              onClick={() => {
                setRechazo(null);
                setMonto(deuda.debe.toFixed(2));
              }}
            >
              Pagó todo: {soles(deuda.debe)}
            </button>
            {reparto.length > 0 && (
              <p className="mt-1.5 text-xs text-taupe">
                Paga primero la más vieja: {reparto.map((x) => `${soles(x.paga)} de la del ${diaMes(x.desde)}`).join(" y ")}.
              </p>
            )}
          </CampoGuiado>
          <CampoGuiado id="cuenta" guia={guia} titulo="¿A dónde entró la plata?">
            <CampoSelect
              etiqueta="¿A dónde entró la plata?"
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
          <CampoGuiado id="nota" guia={guia} titulo="Nota">
            <CampoTexto
              etiqueta="Nota"
              caja
              maxLength={MAX_TEXTO_FONDO}
              // sugerir-fijo: la nota de un pago cuenta cómo devolvió la plata; no depende del monto ni de la cuenta elegidos.
              placeholder="Ej. Lo devolvió en efectivo"
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
          </fieldset>
          {congelada ? (
            <AvisoIntentoIncierto onRevisar={() => void revisar()} revisando={revisando} />
          ) : (
            rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )
          )}
          <PieGuia guia={guia} listo="Todo listo para registrar." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando || congelada}>
              Cancelar
            </Boton>
            <Boton textoCargando="Registrando…" type="submit" peso="primario" cargando={guardando} disabled={!congelada && !guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {congelada ? "Volver a intentar" : frasePagarDeuda(montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
