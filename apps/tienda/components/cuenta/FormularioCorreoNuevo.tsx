"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  confirmarCorreoNuevo,
  pedirCodigoCorreoNuevo,
  reenviarCodigoCorreoNuevo,
  type RespuestaConfirmar,
  type RespuestaObtener,
} from "@/app/acciones/mi-cuenta";
import { arregloCorreo, codigoCompleto, marcaDe, normalizarCorreo } from "@/lib/cuentas";
import { MENSAJES } from "@/lib/cuentas-mensajes";
import { estadoCambioDeCorreo, pasoQueSigue, textoDeLoQueFalta, TEXTOS_CUENTA, type PasoDelCorreo } from "@/lib/mi-cuenta";
import { CajaClave } from "./CajaClave";
import { Campo, Resultado } from "./CampoGuiado";
import { CorreoConCodigo } from "./CorreoConCodigo";

// «Cambiar mi correo» (Mi cuenta, Felipe 2026-10-15). Su contraseña (para confirmar que es ella), el correo nuevo con «Obtener código» al
// lado y, debajo, la caja del código con «Reenviar» y «✓ Correo confirmado»: la misma forma de «Crear cuenta». El correo con que entra
// cambia recién cuando escribe el código que le llegó al correo NUEVO; al de antes le llega un aviso. Cada campo dice su estado y el pie
// dice qué falta (la guía de la tienda, como el registro).

const ID = { clave: "correo-nuevo-clave", correo: "correo-nuevo-correo", codigo: "correo-nuevo-codigo" } as const;

type Mensaje = { texto: string; tono: "error" | "aviso" | "ok" } | null;
const NO_DISPONIBLE: RespuestaObtener = { ok: false, campo: null, mensaje: TEXTOS_CUENTA.noDisponible };

export function FormularioCorreoNuevo({ correoActual }: { correoActual: string }) {
  const [clave, setClave] = useState("");
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enFoco, setEnFoco] = useState<PasoDelCorreo | null>(null);
  // El correo al que se mandó el último código (normalizado). Si después cambia la caja, ese código ya no le sirve.
  const [pedidoPara, setPedidoPara] = useState<string | null>(null);
  // El correo que la base dijo que no (de otra persona, o el mismo de ahora): queda en rojo mientras siga escrito ese.
  const [rechazado, setRechazado] = useState<string | null>(null);
  const [mensajeCorreo, setMensajeCorreo] = useState<Mensaje>(null);
  const [mensajeClave, setMensajeClave] = useState<string | null>(null);
  const [mensajeCodigo, setMensajeCodigo] = useState<Mensaje>(null);
  // El código que salió mal: no se vuelve a mandar (gastaría otro intento) hasta que se cambia.
  const [malo, setMalo] = useState<string | null>(null);
  const [necesitaNuevo, setNecesitaNuevo] = useState(false);
  const [hasta, setHasta] = useState(0);
  const [ahora, setAhora] = useState(0);
  // El correo que quedó y el de antes (el de antes se guarda al confirmar: si la página se vuelve a leer, la base ya dice el nuevo).
  const [confirmado, setConfirmado] = useState<{ nuevo: string; anterior: string } | null>(null);
  const [obteniendo, iniciarObtener] = useTransition();
  const [reenviando, iniciarReenvio] = useTransition();
  const [confirmando, iniciarConfirmar] = useTransition();
  const cajaCodigo = useRef<HTMLInputElement>(null);

  const restan = Math.max(0, Math.ceil((hasta - ahora) / 1000));
  useEffect(() => {
    if (restan <= 0) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [restan]);

  const normal = normalizarCorreo(correo);
  const rechazoVigente = rechazado !== null && rechazado === normal ? rechazado : null;
  const repetido = malo !== null && malo === codigo;
  // Una contraseña que el servidor rechazó, o un código que salió mal (o que ya no sirve), cuentan como «falta» hasta que cambien: así no se
  // vuelve a probar lo mismo (gastaría un intento) y el pie no dice «Todo listo» con el botón apagado.
  const estado = estadoCambioDeCorreo({
    clave: mensajeClave ? "" : clave,
    correo,
    actual: correoActual,
    rechazado: rechazoVigente,
    pedidoPara,
    codigo: repetido || necesitaNuevo ? "" : codigo,
    confirmado: confirmado !== null,
  });
  const sigue = pasoQueSigue(estado, enFoco);
  const codigoListo = pedidoPara !== null && pedidoPara === normal && codigoCompleto(codigo) && !repetido && !necesitaNuevo;
  const puedeObtener = estado.campos.clave === "ok" && estado.campos.correo === "ok";

  function esperar(segundos: number | null | undefined) {
    if (segundos === null || segundos === undefined) return;
    const t = Date.now();
    setHasta(t + segundos * 1000);
    setAhora(t);
  }

  function aplicarObtener(r: RespuestaObtener, correoPedido: string) {
    if (r.ok) {
      setPedidoPara(correoPedido);
      setCodigo("");
      setMalo(null);
      setNecesitaNuevo(false);
      setMensajeCodigo(r.mensaje ? { texto: r.mensaje, tono: r.tono } : null);
      esperar(r.espera);
      window.setTimeout(() => cajaCodigo.current?.focus(), 0);
      return;
    }
    esperar(r.espera);
    if (r.campo === "clave") {
      setMensajeClave(r.mensaje);
      window.setTimeout(() => document.getElementById(ID.clave)?.focus(), 0);
    } else if (r.campo === "correo") {
      if (r.mensaje === MENSAJES.correoDeOtraPersona || r.mensaje === TEXTOS_CUENTA.mismoCorreo || r.mensaje === TEXTOS_CUENTA.correoTomado) {
        setRechazado(correoPedido);
      }
      setMensajeCorreo({ texto: r.mensaje, tono: "error" });
    } else {
      setMensajeCorreo({ texto: r.mensaje, tono: "aviso" });
    }
  }

  function obtener() {
    if (!puedeObtener || obteniendo) return;
    const pedido = normal;
    setMensajeCorreo(null);
    setMensajeClave(null);
    iniciarObtener(async () => aplicarObtener(await pedirCodigoCorreoNuevo({ correo: pedido, clave }).catch(() => NO_DISPONIBLE), pedido));
  }

  function reenviar() {
    if (!pedidoPara || reenviando) return;
    const pedido = pedidoPara;
    iniciarReenvio(async () => {
      const r = await reenviarCodigoCorreoNuevo(pedido).catch(() => NO_DISPONIBLE);
      if (r.ok) aplicarObtener(r, pedido);
      else {
        esperar(r.espera);
        setMensajeCodigo({ texto: r.mensaje, tono: r.espera ? "aviso" : "error" });
      }
    });
  }

  function confirmar() {
    if (!codigoListo || confirmando || !pedidoPara) return;
    const probado = codigo;
    const pedido = pedidoPara;
    iniciarConfirmar(async () => {
      const r: RespuestaConfirmar = await confirmarCorreoNuevo({ correo: pedido, codigo: probado }).catch(() => ({
        ok: false as const,
        campo: "codigo" as const,
        mensaje: MENSAJES.codigoNoProbado,
      }));
      if (r.ok) {
        setConfirmado({ nuevo: r.correo, anterior: correoActual });
        setMensajeCodigo(null);
        return;
      }
      esperar(r.espera);
      if (r.campo === "correo") {
        setRechazado(pedido);
        setPedidoPara(null);
        setMensajeCorreo({ texto: r.mensaje, tono: "error" });
        return;
      }
      setMensajeCodigo({ texto: r.mensaje, tono: "error" });
      if (r.codigo === "vencido" || r.codigo === "bloqueado") setNecesitaNuevo(true);
      if (r.codigo) {
        setMalo(probado);
        cajaCodigo.current?.select();
      }
    });
  }

  // Con los 6 números, se revisa solo (como el registro): no hace falta tocar el botón.
  useEffect(() => {
    if (codigoListo && !confirmando && confirmado === null) confirmar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando el código queda completo
  }, [codigoListo]);

  const marca = (paso: "clave" | "correo" | "codigo") => {
    if (paso === "correo") return marcaDe(estado.campos.correo, sigue === "correo" || sigue === "obtener");
    if (paso === "codigo") return repetido || necesitaNuevo ? "error" : marcaDe(estado.campos.codigo, sigue === "codigo");
    return mensajeClave ? "error" : marcaDe(estado.campos.clave, sigue === "clave");
  };
  const sugerencia = !rechazoVigente ? arregloCorreo(correo) : null;

  if (confirmado) {
    return (
      <div className="w-ficha">
        <div>
          <span className="t-ceja">Mi perfil</span>
          <h1 className="w-titulo">
            {/* La cursiva roja va en lo último, como en todos los títulos: toda la frase en rojo pesaba demasiado. */}
            Listo: ahora entras con <em>tu correo nuevo.</em>
          </h1>
        </div>
        <Campo campo="codigo" idCaja={ID.codigo} etiqueta="Correo con que entras" marca="hecho" textoMarca="✓ Correo confirmado" alEntrar={() => undefined} alSalir={() => undefined}>
          <input id={ID.codigo} className="w-caja" value={confirmado.nuevo} readOnly aria-describedby={`${ID.codigo}-res`} />
          <Resultado id={ID.codigo}>
            <p className="w-ayuda">{TEXTOS_CUENTA.correoCambiado(confirmado.anterior)}</p>
          </Resultado>
        </Campo>
        <div className="w-pie-form">
          <Link className="t-btn t-btn-ancho" href="/cuenta?aviso=correo">
            Volver a mi perfil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (codigoListo) confirmar();
        else if (puedeObtener && pedidoPara !== normal) obtener();
      }}
    >
      <div>
        <span className="t-ceja">Mi perfil</span>
        <h1 className="w-titulo">
          Cambia tu <em>correo.</em>
        </h1>
        <p className="w-texto-sec">
          Ahora entras con <b className="w-correo">{correoActual}</b>. Te mandamos un código al correo nuevo y, cuando lo escribas aquí,
          entras con él. A tu correo de ahora le avisamos del cambio.
        </p>
      </div>

      <Campo campo="clave" idCaja={ID.clave} etiqueta="Tu contraseña" marca={marca("clave")} alEntrar={() => setEnFoco("clave")} alSalir={() => setEnFoco(null)}>
        <CajaClave
          id={ID.clave}
          valor={clave}
          onCambio={(v) => {
            setClave(v);
            setMensajeClave(null);
          }}
          autoComplete="current-password"
          describedBy={`${ID.clave}-res`}
          invalida={mensajeClave !== null}
        />
        <Resultado id={ID.clave}>
          {mensajeClave ? <span className="w-res-error">{mensajeClave}</span> : <p className="w-ayuda">{TEXTOS_CUENTA.claveActualAyuda}</p>}
        </Resultado>
      </Campo>

      <CorreoConCodigo
        ids={{ correo: ID.correo, codigo: ID.codigo }}
        etiquetaCorreo="Correo nuevo"
        correo={correo}
        onCorreo={(v) => {
          setCorreo(v);
          if (mensajeCorreo?.tono !== "aviso" || !restan) setMensajeCorreo(null);
        }}
        marcaCorreo={marca("correo")}
        resultadoCorreo={
          mensajeCorreo && (rechazoVigente || mensajeCorreo.tono !== "error") ? (
            <span className={mensajeCorreo.tono === "error" ? "w-res-error" : "w-res-aviso"}>{mensajeCorreo.texto}</span>
          ) : estado.campos.correo === "repetido" ? (
            <span className="w-res-error">{normal === normalizarCorreo(correoActual) ? TEXTOS_CUENTA.mismoCorreo : MENSAJES.correoDeOtraPersona}</span>
          ) : sugerencia ? (
            <>
              <span className="w-res-aviso">
                ¿Quisiste decir <b>{sugerencia}</b>?
              </span>
              <button type="button" className="w-enlace" onClick={() => setCorreo(sugerencia)}>
                Usar este correo
              </button>
            </>
          ) : estado.campos.correo === "mal" ? (
            <span className="w-res-error">{MENSAJES.correoMal}</span>
          ) : estado.campos.correo === "ok" && estado.campos.clave !== "ok" ? (
            <p className="w-ayuda">Escribe tu contraseña arriba y toca «Obtener código».</p>
          ) : (
            <p className="w-ayuda">{TEXTOS_CUENTA.correoNuevoAyuda}</p>
          )
        }
        puedeObtener={puedeObtener && pedidoPara !== normal}
        obteniendo={obteniendo}
        onObtener={obtener}
        mostrarCodigo={pedidoPara !== null}
        codigo={codigo}
        onCodigo={(v) => {
          setCodigo(v);
          if (mensajeCodigo?.tono === "error" && !necesitaNuevo) setMensajeCodigo(null);
        }}
        marcaCodigo={marca("codigo")}
        resultadoCodigo={
          pedidoPara !== null && pedidoPara !== normal ? (
            <span className="w-res-aviso">Cambiaste el correo: toca «Obtener código» para mandarlo al nuevo.</span>
          ) : mensajeCodigo ? (
            <span className={mensajeCodigo.tono === "error" ? "w-res-error" : mensajeCodigo.tono === "aviso" ? "w-res-aviso" : "w-res-ok"}>{mensajeCodigo.texto}</span>
          ) : confirmando ? (
            <p className="w-ayuda">Revisando tu código…</p>
          ) : (
            <p className="w-ayuda">{TEXTOS_CUENTA.codigoCorreo(pedidoPara ?? normal)}</p>
          )
        }
        confirmado={false}
        puedeReenviar={pedidoPara !== null && pedidoPara === normal}
        reenviando={reenviando}
        onReenviar={reenviar}
        restan={restan}
        bloqueado={confirmando}
        codigoRef={cajaCodigo}
        onFoco={(c) => setEnFoco(c)}
      />

      <div className="w-pie-form">
        <p className="w-faltan" aria-live="polite">
          {estado.faltan.length > 0 ? (
            <>
              Falta: <b>{textoDeLoQueFalta(estado.faltan)}</b>
            </>
          ) : (
            <>Todo listo.</>
          )}
        </p>
        <button className="t-btn t-btn-ancho" type="submit" disabled={!codigoListo || confirmando} aria-busy={confirmando || undefined}>
          {confirmando ? "Confirmando…" : "Confirmar mi correo nuevo"}
        </button>
        <Link className="w-enlace" href="/cuenta">
          Volver a mi perfil
        </Link>
      </div>
    </form>
  );
}
