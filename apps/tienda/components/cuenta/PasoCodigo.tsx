"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RespuestaCodigo } from "@/app/acciones/cuenta";
import { CODIGO_VENCE_MIN, codigoCompleto, codigoLimpio, cuentaRegresiva, MENSAJES, type MarcaCampo } from "@/lib/cuentas";
import { Campo, Resultado } from "./CampoGuiado";

// El paso del código (actividad 2b): después de «Mandarme el código», la persona escribe los 6 números que le llegaron al correo.
// Se ve y se lee como el resto del registro: el campo con su marca, una línea debajo, «Falta: …» y el botón al pie. «Pedir otro
// código» espera lo que la base dice (60 s entre uno y otro); «Cambiar mis datos» vuelve al formulario sin perder nada.

export type MensajeCodigo = { texto: string; tono: "error" | "aviso" | "ok" } | null;

/** Con qué entra el paso: lo que dijo el servidor al mandar el código, y desde y hasta cuándo no se puede pedir otro. */
export type InicioCodigo = { mensaje: MensajeCodigo; desde: number; hasta: number };

const ID = "registro-codigo";

export function PasoCodigo({
  correo,
  inicio,
  confirmar,
  reenviar,
  volver,
}: {
  correo: string;
  inicio: InicioCodigo;
  /** Crea la cuenta con el código. Si sale bien, lleva a «Mi cuenta»; si el problema es de los datos, el formulario vuelve solo. */
  confirmar: (codigo: string) => Promise<Extract<RespuestaCodigo, { paso: "codigo" }> | undefined>;
  reenviar: () => Promise<Extract<RespuestaCodigo, { paso: "codigo" }> | undefined>;
  volver: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState<MensajeCodigo>(inicio.mensaje);
  // El código que salió mal: su marca dice «Revisa» y no se vuelve a mandar (gastaría otro intento) hasta que se cambia.
  const [malo, setMalo] = useState<string | null>(null);
  // Venció, o se gastaron los intentos: ningún código escrito sirve hasta pedir uno nuevo.
  const [necesitaNuevo, setNecesitaNuevo] = useState(false);
  const [hasta, setHasta] = useState(inicio.hasta);
  const [ahora, setAhora] = useState(inicio.desde);
  const [enviando, iniciar] = useTransition();
  const [reenviando, iniciarReenvio] = useTransition();
  const caja = useRef<HTMLInputElement>(null);

  const restan = Math.max(0, Math.ceil((hasta - ahora) / 1000));
  const contando = restan > 0;
  useEffect(() => {
    if (!contando) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [contando]);

  // Al llegar, el cursor ya está en la caja y la página arriba.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    caja.current?.focus();
  }, []);

  const completo = codigoCompleto(codigo);
  const repetido = malo !== null && malo === codigo;
  const marca: MarcaCampo = necesitaNuevo || repetido ? "error" : completo ? "hecho" : "sigue";
  const puedeCrear = completo && !repetido && !necesitaNuevo && !enviando;

  function aplicar(r: Extract<RespuestaCodigo, { paso: "codigo" }> | undefined, probado: string | null) {
    if (!r) return;
    setMensaje(r.mensaje ? { texto: r.mensaje, tono: r.tono } : null);
    if (r.espera !== null) {
      const t = Date.now();
      setHasta(t + r.espera * 1000);
      setAhora(t);
    }
    if (r.codigo === "vencido" || r.codigo === "bloqueado") setNecesitaNuevo(true);
    if (probado !== null && r.codigo) {
      setMalo(probado);
      // Para escribirlo otra vez basta con teclear: lo que había queda marcado.
      caja.current?.select();
    }
  }

  function crear() {
    if (!puedeCrear) return;
    const probado = codigo;
    iniciar(async () => aplicar(await confirmar(probado), probado));
  }

  function pedirOtro() {
    if (contando || reenviando) return;
    iniciarReenvio(async () => {
      const r = await reenviar();
      aplicar(r, null);
      // El código nuevo anula el anterior: la caja queda lista para el nuevo.
      if (r?.tono === "ok") {
        setCodigo("");
        setMalo(null);
        setNecesitaNuevo(false);
        caja.current?.focus();
      }
    });
  }

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        crear();
      }}
    >
      <div>
        <span className="t-ceja">Confirma tu correo</span>
        <h1 className="w-titulo">
          Revisa tu <em>correo.</em>
        </h1>
        <p className="w-texto-sec">
          Te mandamos un código de 6 números a <b className="w-correo">{correo}</b>. Escríbelo aquí para crear tu cuenta; vence en{" "}
          {CODIGO_VENCE_MIN} minutos.
        </p>
      </div>

      <Campo campo="codigo" idCaja={ID} etiqueta="Código" marca={marca} alEntrar={() => undefined} alSalir={() => undefined}>
        <input
          ref={caja}
          id={ID}
          className="w-caja num w-codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6 números" // sugerir-fijo: el código siempre tiene 6 números, no depende de nada elegido antes
          value={codigo}
          onChange={(e) => {
            setCodigo(codigoLimpio(e.target.value));
            // Al corregirlo, el error se va; si hace falta un código nuevo, el aviso se queda hasta pedirlo.
            if (mensaje?.tono === "error" && !necesitaNuevo) setMensaje(null);
          }}
          aria-describedby={`${ID}-res`}
          aria-invalid={marca === "error" || undefined}
        />
        <Resultado id={ID}>
          {mensaje ? (
            <span className={mensaje.tono === "error" ? "w-res-error" : mensaje.tono === "aviso" ? "w-res-aviso" : "w-res-ok"}>{mensaje.texto}</span>
          ) : (
            <p className="w-ayuda">{MENSAJES.codigoAyuda}</p>
          )}
        </Resultado>
        {/* Fuera de la línea que se anuncia: la cuenta regresiva cambia cada segundo y no debe leerse en voz alta cada vez. */}
        <span className="w-res-acc w-codigo-acc">
          <button type="button" className="w-enlace" onClick={pedirOtro} disabled={contando || reenviando}>
            {reenviando ? "Mandando otro código…" : contando ? `Pedir otro código en ${cuentaRegresiva(restan)}` : "Pedir otro código"}
          </button>
          <button type="button" className="w-enlace" onClick={volver} disabled={enviando}>
            Cambiar mis datos
          </button>
        </span>
      </Campo>

      <div className="w-pie-form">
        <p className="w-faltan" aria-live="polite">
          {necesitaNuevo ? (
            <>
              Falta: <b>un código nuevo</b>
            </>
          ) : completo && !repetido ? (
            <>Todo listo.</>
          ) : (
            <>
              Falta: <b>el código</b>
            </>
          )}
        </p>
        <button className="t-btn t-btn-ancho" type="submit" disabled={!puedeCrear} aria-busy={enviando || undefined}>
          {enviando ? "Creando tu cuenta…" : "Crear mi cuenta"}
        </button>
      </div>
    </form>
  );
}
