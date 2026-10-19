"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Info, Ticket } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { canjearPuntosEnCaja, validarCuponEnCaja } from "@/lib/club-acciones";
import {
  codigoCompleto,
  codigoVacio,
  compraMinimaDelCanje,
  normalizarCodigo,
  solesDelCupon,
  valorDePuntos,
  type ConfigPuntos,
  type CuponPuesto,
  type CuponVivo,
  type ResultadoDelCodigo,
} from "@/lib/club-puntos-reglas";
import { traducirError } from "@/lib/error-escritura";

const dinero = (n: number) => `S/${n.toFixed(2)}`;
const numero = (n: number) => n.toLocaleString("es-PE");

/* ------------------------------------------------------------------ Usar puntos */

type PropsUsarPuntos = {
  clientaId: string;
  /** Nombre de pila de la miembro, para decir de quién son los puntos. */
  nombre: string;
  saldo: number;
  config: ConfigPuntos;
  /** De a cuánto se puede canjear en ESTA compra (`opcionesDeCanje`, ya con `tipo: "posible"`). */
  min: number;
  max: number;
  paso: number;
  totalDelTicket: number;
  responsable: ControlResponsable;
  /** El cupón ya creado: el Punto de venta lo pone en el ticket. */
  onAplicado: (cupon: CuponPuesto) => void;
  onClose: () => void;
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
};

/**
 * «Usar puntos»: el stepper de cuántos puntos canjear. Aplicar crea el cupón en la base (`canjear_puntos`, los puntos salen del saldo
 * en ese mismo instante) y lo deja puesto en el ticket. La clave de la operación (`token`) evita que un doble toque gaste dos
 * veces: la misma devuelve el mismo cupón. Si cambia la cantidad, la clave es otra.
 */
export function UsarPuntosModal({ clientaId, nombre, saldo, config, min, max, paso, totalDelTicket, responsable, onAplicado, onClose, alCerrarEnfocar }: PropsUsarPuntos) {
  const [puntos, setPuntos] = useState(min);
  const [guardando, setGuardando] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const token = useRef<{ puntos: number; valor: string }>({ puntos: -1, valor: "" });
  const alAplicar = useRef(false);

  const valor = valorDePuntos(puntos, config);
  const compraMinima = compraMinimaDelCanje(puntos, config);
  const claveDe = (p: number) => {
    if (token.current.puntos !== p) token.current = { puntos: p, valor: crypto.randomUUID() };
    return token.current.valor;
  };

  async function aplicar() {
    if (alAplicar.current) return;
    if (responsable.motivo) {
      avisar.error(responsable.motivo);
      return;
    }
    alAplicar.current = true;
    setGuardando(true);
    setProblema(null);
    try {
      const { cupon, error } = await canjearPuntosEnCaja(clientaId, puntos, claveDe(puntos), responsable.firma());
      responsable.despues(error);
      if (error || !cupon) {
        setProblema(traducirError(error ?? { message: "" }, "canjear los puntos"));
        return;
      }
      onAplicado(cupon);
      onClose();
    } finally {
      alAplicar.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo="Usar puntos en esta compra"
      subtitulo={`Se crea un cupón de ${nombre} y se aplica al ticket.`}
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <div className="mt-4">
          <div className="flex justify-center">
          <PasoCantidad
            menos={{ onClick: () => setPuntos((p) => Math.max(min, p - paso)), deshabilitado: puntos <= min || guardando, etiqueta: "Canjear 100 puntos menos" }}
            mas={{ onClick: () => setPuntos((p) => Math.min(max, p + paso)), deshabilitado: puntos >= max || guardando, etiqueta: "Canjear 100 puntos más" }}
          >
            {Number.isInteger(valor) ? valor : valor.toFixed(2)}
          </PasoCantidad>
          </div>
          <p className="mt-2 text-center leading-tight">
            <b className="block font-display text-3xl tabular-nums text-tinta">{solesDelCupon(valor)}</b>
            <span className="text-xs text-tinta/60">{numero(puntos)} puntos</span>
          </p>

          <dl className="mt-4 divide-y divide-sand rounded-xl border border-sand bg-crema text-[13px]">
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-tinta/70">Compra del ticket</dt>
              <dd className="font-semibold tabular-nums text-tinta">{dinero(totalDelTicket)}</dd>
            </div>
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-tinta/70">Este cupón pide una compra de</dt>
              <dd className="font-semibold tabular-nums text-tinta">{solesDelCupon(compraMinima)} o más</dd>
            </div>
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-tinta/70">Le quedan</dt>
              <dd className="font-semibold tabular-nums text-tinta">{numero(saldo - puntos)} puntos</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-tinta/60">
            Vale por {config.vigenciaDias} días y lo puede usar quien lo traiga. Si no se usa, los puntos vuelven a su saldo.
          </p>

          {problema && (
            <Aviso tono="error" className="mt-3">
              {problema}
            </Aviso>
          )}

          <PieAcciones className="mt-4 pie-hoja-fijo">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="button" peso="primario" onClick={aplicar} cargando={guardando} textoCargando="Aplicando…">
              Aplicar {solesDelCupon(valor)}
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Código de cupón */

type PropsCodigo = {
  totalDelTicket: number;
  /** Los cupones vivos de la miembro del ticket (si hay): un toque los pone en el campo. */
  cuponesDeLaClienta: CuponVivo[];
  nombreClienta: string | null;
  onAplicar: (cupon: CuponPuesto) => void;
  onClose: () => void;
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
};

/**
 * «Código de cupón»: se escribe o se escanea (el QR del cupón entra como texto, igual que un código de barras). Cuando el código
 * está completo se pregunta a la base (`validar_cupon`, solo lee); si sirve, «Aplicar al ticket». La base es quien manda: al cobrar
 * `registrar_venta` vuelve a comprobarlo y gasta el cupón una sola vez, aunque dos cajas lo intenten a la vez.
 */
export function CodigoDeCuponModal({ totalDelTicket, cuponesDeLaClienta, nombreClienta, onAplicar, onClose, alCerrarEnfocar }: PropsCodigo) {
  const [codigo, setCodigo] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDelCodigo | null>(null);
  const [sinRespuesta, setSinRespuesta] = useState(false);
  const vuelta = useRef(0);

  // Con el código completo se pregunta solo; si cambia a medias, el resultado viejo se olvida. Cada pregunta lleva su número: una
  // respuesta lenta de un código anterior no pisa a la del que está escrito ahora.
  useEffect(() => {
    if (!codigoCompleto(codigo)) return;
    const mia = ++vuelta.current;
    let vigente = true;
    validarCuponEnCaja(codigo, totalDelTicket)
      .then(({ resultado: r, error }) => {
        if (!vigente || mia !== vuelta.current) return;
        setConsultando(false);
        if (error || !r) {
          setSinRespuesta(true);
          setResultado(null);
        } else {
          setSinRespuesta(false);
          setResultado(r);
        }
      })
      .catch(() => {
        if (!vigente || mia !== vuelta.current) return;
        setConsultando(false);
        setSinRespuesta(true);
      });
    return () => {
      vigente = false;
    };
  }, [codigo, totalDelTicket]);

  function escribir(texto: string) {
    const nuevo = normalizarCodigo(texto);
    const salida = codigoVacio(nuevo) ? "" : nuevo;
    setCodigo(salida);
    setResultado(null);
    setSinRespuesta(false);
    setConsultando(codigoCompleto(salida));
  }

  const bueno = resultado?.tipo === "ok" ? resultado.cupon : null;
  const malo = resultado?.tipo === "no" ? resultado : null;

  return (
    <Modal titulo="Código de cupón" subtitulo="Escríbelo o escanea el QR del cliente." onClose={onClose} alCerrarEnfocar={alCerrarEnfocar}>
      {(cerrar) => (
        <div className="mt-4">
          <CampoTexto
            etiqueta="Código del cupón"
            mono
            value={codigo}
            // sugerir-fijo: el formato del código es el mismo para todos, no depende de nada elegido antes.
            placeholder="CAY-XXXX-XXXX"
            maxLength={13}
            autoFocus
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            trabajando={consultando}
            valido={bueno !== null}
            tono={malo?.tono === "error" ? "error" : undefined}
            onChange={(e) => escribir(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && bueno) {
                e.preventDefault();
                onAplicar(bueno);
                onClose();
              }
            }}
          />

          {bueno && (
            <div className="anim-revelar mt-3 flex items-center gap-3 rounded-xl border border-sand bg-crema px-3 py-2.5">
              <b className="font-display text-2xl text-verde tabular-nums">{solesDelCupon(bueno.valor)}</b>
              <div className="min-w-0 flex-1 text-[13px] leading-snug text-tinta">
                <b className="font-semibold">Cupón válido</b>
                <span className="block text-xs text-tinta/65">
                  {bueno.de ? `De ${bueno.de} · ` : ""}vence el {bueno.venceEl.slice(8, 10)}/{bueno.venceEl.slice(5, 7)}
                  <br />
                  Lo puede usar cualquier persona, una sola vez.
                </span>
              </div>
            </div>
          )}
          {malo && (
            <Aviso tono={malo.tono} titulo={malo.titulo} className="mt-3">
              {malo.detalle}
            </Aviso>
          )}
          {sinRespuesta && (
            <Aviso tono="atencion" titulo="No pudimos revisar el código" className="mt-3">
              Revisa la conexión y vuelve a escribirlo. Puedes seguir vendiendo sin el cupón.
            </Aviso>
          )}

          {cuponesDeLaClienta.length > 0 && !bueno && (
            <div className="mt-4">
              <p className="label-cayla text-[11px] text-tinta/60">{nombreClienta ? `Cupones de ${nombreClienta}` : "Sus cupones"}</p>
              <ul className="mt-1.5 divide-y divide-sand rounded-xl border border-sand bg-crema">
                {cuponesDeLaClienta.map((c) => (
                  <li key={c.codigo}>
                    <button
                      type="button"
                      onClick={() => escribir(c.codigo)}
                      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-sand/40"
                    >
                      <Ticket className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
                      <span className="min-w-0 flex-1 text-[13px] text-tinta">
                        <b className="font-semibold tabular-nums">{solesDelCupon(c.valor)}</b>
                        <span className="ml-2 font-mono text-xs tracking-wider text-tinta/65">{c.codigo}</span>
                      </span>
                      <span className="text-xs text-tinta/60">vence {c.venceEl.slice(8, 10)}/{c.venceEl.slice(5, 7)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-xs text-tinta/60">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-taupe" aria-hidden />
            <span>Los intentos con códigos que no existen se cuentan: así nadie adivina cupones probando en la caja.</span>
          </p>

          <PieAcciones className="mt-4 pie-hoja-fijo">
            <Boton type="button" peso="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              disabled={!bueno}
              onClick={() => {
                if (!bueno) return;
                onAplicar(bueno);
                cerrar();
              }}
            >
              Aplicar al ticket
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
