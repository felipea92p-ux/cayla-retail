"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { pedirCodigoDeAcceso, restablecerAcceso, type RespuestaConfirmar, type RespuestaObtener } from "@/app/acciones/mi-cuenta";
import { arregloCorreo, CLAVE_MAXIMA, faltanCaracteres, MENSAJES, marcaDe, normalizarCorreo } from "@/lib/cuentas";
import { estadoRestablecer, pasoQueSigue, textoDeLoQueFalta, TEXTOS_CUENTA, type PasoDelCorreo } from "@/lib/mi-cuenta";
import { CajaClave } from "./CajaClave";
import { Campo, Resultado } from "./CampoGuiado";
import { CorreoConCodigo } from "./CorreoConCodigo";
import { usePasoDelPanel } from "./EntradaViva";

// «Restablecer mi acceso» (Felipe 2026-10-15): quien ya no puede entrar lo pide en una tienda CAYLA, que escribe su correo nuevo en el
// ERP; a ese correo le llega un código. Aquí escribe ese correo (con «Obtener código» al lado si necesita uno nuevo), debajo el código
// (con «Reenviar» y «✓ Correo confirmado») y su contraseña nueva. La misma forma de «Crear cuenta». Todo se confirma junto al tocar
// «Guardar y entrar»: nunca queda una puerta de «poner contraseña sin la de antes».

const ID = { correo: "acceso-correo", codigo: "acceso-codigo", clave: "acceso-clave" } as const;

type Mensaje = { texto: string; tono: "error" | "aviso" | "ok" } | null;
const NO_DISPONIBLE: RespuestaObtener = { ok: false, campo: null, mensaje: TEXTOS_CUENTA.noDisponible };

export function FormularioRestablecerAcceso() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [enFoco, setEnFoco] = useState<PasoDelCorreo | null>(null);
  const [mensajeCorreo, setMensajeCorreo] = useState<Mensaje>(null);
  const [mensajeCodigo, setMensajeCodigo] = useState<Mensaje>(null);
  const [mensajeClave, setMensajeClave] = useState<string | null>(null);
  const [rechazado, setRechazado] = useState<string | null>(null);
  const [malo, setMalo] = useState<string | null>(null);
  const [necesitaNuevo, setNecesitaNuevo] = useState(false);
  const [hasta, setHasta] = useState(0);
  const [ahora, setAhora] = useState(0);
  const [confirmado, setConfirmado] = useState(false);
  const [obteniendo, iniciarObtener] = useTransition();
  const [guardando, iniciarGuardar] = useTransition();
  const cajaCodigo = useRef<HTMLInputElement>(null);

  const restan = Math.max(0, Math.ceil((hasta - ahora) / 1000));
  useEffect(() => {
    if (restan <= 0) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [restan]);

  const normal = normalizarCorreo(correo);
  const repetido = malo !== null && malo === codigo;
  // Un código que salió mal (o que ya no sirve) cuenta como «falta» hasta que cambie: el pie no dice «Todo listo» con el botón apagado.
  const estado = estadoRestablecer({ correo, codigo: repetido || necesitaNuevo ? "" : codigo, clave });
  const sigue = pasoQueSigue(estado, enFoco);
  const listo = estado.faltan.length === 0 && !repetido && !necesitaNuevo && rechazado !== normal;
  // El panel de al lado: con el código escrito, lo que toca es la contraseña nueva; al confirmar, todo hecho.
  usePasoDelPanel(confirmado ? 3 : estado.campos.codigo === "ok" ? 2 : null);

  function esperar(segundos: number | null | undefined) {
    if (segundos === null || segundos === undefined) return;
    const t = Date.now();
    setHasta(t + segundos * 1000);
    setAhora(t);
  }

  /** «Obtener código» y «Reenviar»: lo mismo (el de la tienda ya pudo llegar; si no, se pide otro). */
  function pedir() {
    if (estado.campos.correo !== "ok" || obteniendo || restan > 0) return;
    const pedido = normal;
    setMensajeCorreo(null);
    iniciarObtener(async () => {
      const r = await pedirCodigoDeAcceso(pedido).catch(() => NO_DISPONIBLE);
      esperar(r.ok ? r.espera : r.espera);
      if (r.ok) {
        setMalo(null);
        setNecesitaNuevo(false);
        setCodigo("");
        setMensajeCodigo(r.mensaje ? { texto: r.mensaje, tono: r.tono } : null);
        window.setTimeout(() => cajaCodigo.current?.focus(), 0);
      } else if (r.campo === "correo") {
        setMensajeCorreo({ texto: r.mensaje, tono: "error" });
      } else {
        setMensajeCodigo({ texto: r.mensaje, tono: r.espera ? "aviso" : "error" });
      }
    });
  }

  function guardar() {
    if (!listo || guardando) return;
    const probado = codigo;
    const pedido = normal;
    iniciarGuardar(async () => {
      const r: RespuestaConfirmar = await restablecerAcceso({ correo: pedido, codigo: probado, clave }).catch(() => ({
        ok: false as const,
        campo: "codigo" as const,
        mensaje: MENSAJES.codigoNoProbado,
      }));
      if (r.ok) {
        // El correo quedó confirmado: se ve un momento y sigue a su cuenta.
        setConfirmado(true);
        window.setTimeout(() => {
          router.replace(r.destino ?? "/cuenta");
          router.refresh();
        }, 1100);
        return;
      }
      esperar(r.espera);
      if (r.campo === "clave") {
        setMensajeClave(r.mensaje);
        return;
      }
      if (r.campo === "correo") {
        setRechazado(pedido);
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

  const marcaCorreo = rechazado === normal && normal ? "error" : marcaDe(estado.campos.correo, sigue === "correo");
  const marcaCodigo = repetido || necesitaNuevo ? "error" : marcaDe(estado.campos.codigo, sigue === "codigo");
  const marcaClave = mensajeClave ? "error" : marcaDe(estado.campos.clave_nueva, sigue === "clave_nueva");
  const sugerencia = arregloCorreo(correo);

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div>
        <span className="t-ceja">Restablecer mi acceso</span>
        <h1 className="w-titulo">
          Entra con tu <em>correo nuevo.</em>
        </h1>
        <p className="w-texto-sec">
          Si en una tienda CAYLA pediste cambiar el correo de tu cuenta, te llegó un código a tu correo nuevo. {TEXTOS_CUENTA.restablecerAyuda}
        </p>
      </div>

      <CorreoConCodigo
        ids={{ correo: ID.correo, codigo: ID.codigo }}
        etiquetaCorreo="Tu correo nuevo"
        correo={correo}
        onCorreo={(v) => {
          setCorreo(v);
          if (mensajeCorreo?.tono === "error") setMensajeCorreo(null);
        }}
        marcaCorreo={marcaCorreo}
        resultadoCorreo={
          mensajeCorreo && (mensajeCorreo.tono !== "error" || rechazado === normal || !rechazado) ? (
            <span className={mensajeCorreo.tono === "error" ? "w-res-error" : "w-res-aviso"}>{mensajeCorreo.texto}</span>
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
          ) : (
            <p className="w-ayuda">El que diste en la tienda. Si no te llegó el código, toca «Obtener código».</p>
          )
        }
        puedeObtener={estado.campos.correo === "ok"}
        obteniendo={obteniendo}
        onObtener={pedir}
        mostrarCodigo
        codigo={codigo}
        onCodigo={(v) => {
          setCodigo(v);
          if (mensajeCodigo?.tono === "error" && !necesitaNuevo) setMensajeCodigo(null);
        }}
        marcaCodigo={marcaCodigo}
        resultadoCodigo={
          mensajeCodigo ? (
            <span className={mensajeCodigo.tono === "error" ? "w-res-error" : mensajeCodigo.tono === "aviso" ? "w-res-aviso" : "w-res-ok"}>{mensajeCodigo.texto}</span>
          ) : confirmado ? (
            <p className="w-ayuda">Entrando a tu cuenta…</p>
          ) : (
            <p className="w-ayuda">Son 6 números y vence en 30 minutos. Si no lo ves, revisa también tu carpeta de spam.</p>
          )
        }
        confirmado={confirmado}
        puedeReenviar={estado.campos.correo === "ok"}
        reenviando={obteniendo}
        onReenviar={pedir}
        restan={restan}
        bloqueado={guardando}
        codigoRef={cajaCodigo}
        onFoco={(c) => setEnFoco(c)}
      />

      <Campo campo="clave_nueva" idCaja={ID.clave} etiqueta="Tu contraseña nueva" marca={confirmado ? "hecho" : marcaClave} alEntrar={() => setEnFoco("clave_nueva")} alSalir={() => setEnFoco(null)}>
        <CajaClave
          id={ID.clave}
          valor={clave}
          onCambio={(v) => {
            setClave(v);
            setMensajeClave(null);
          }}
          autoComplete="new-password"
          describedBy={`${ID.clave}-res`}
          invalida={mensajeClave !== null}
        />
        <Resultado id={ID.clave}>
          {mensajeClave ? (
            <span className="w-res-error">{mensajeClave}</span>
          ) : (
            <p className="w-ayuda">{clave.length > CLAVE_MAXIMA ? MENSAJES.claveLarga : (faltanCaracteres(clave) ?? TEXTOS_CUENTA.claveNuevaAyuda)}</p>
          )}
        </Resultado>
      </Campo>

      <div className="w-pie-form">
        <p className="w-faltan" aria-live="polite">
          {confirmado ? (
            <>Listo: tu correo quedó confirmado.</>
          ) : estado.faltan.length > 0 ? (
            <>
              Falta: <b>{textoDeLoQueFalta(estado.faltan)}</b>
            </>
          ) : (
            <>Todo listo.</>
          )}
        </p>
        <button className="t-btn t-btn-ancho" type="submit" disabled={!listo || guardando || confirmado} aria-busy={guardando || confirmado || undefined}>
          {guardando || confirmado ? "Entrando…" : "Guardar y entrar"}
        </button>
        <Link className="w-enlace" href="/entrar">
          Volver a entrar
        </Link>
      </div>
    </form>
  );
}
