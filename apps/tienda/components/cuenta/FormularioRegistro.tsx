"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, useTransition } from "react";
import { confirmarCodigo, consultarCorreo, crearCuenta, obtenerCodigo, type RespuestaCrear, type RespuestaDelCodigo } from "@/app/acciones/cuenta";
import {
  arregloCorreo,
  campoQueSigue,
  CLAVE_MAXIMA,
  CODIGO_VENCE_MIN,
  codigoLimpio,
  correoValido,
  cuentaRegresiva,
  estadoCuenta,
  faltanCaracteres,
  faltanCuenta,
  faltanResumidos,
  marcaDe,
  MAX_NOMBRE_CUENTA,
  normalizarCorreo,
  REGISTRO_CUENTA_VACIO,
  TEXTO_MARCA,
  type CampoCuenta,
  type ConsultaCorreo,
  type RegistroCuenta,
} from "@/lib/cuentas";
import { MENSAJES } from "@/lib/cuentas-mensajes";
import { codigoDelCorreoActual, codigoParaProbar, type CodigoDelCorreo } from "@/lib/correo-confirmado";
import { hrefConVolver, PARAMETRO_VOLVER, rutaParaVolver } from "@/lib/entrada";
import { avanceDeLaCuenta, buzonDelCorreo, nombreParaLaTarjeta } from "@/lib/panel-entrada";
import { Icono } from "../Icono";
import { BotonGoogle } from "./BotonGoogle";
import { CajaClave } from "./CajaClave";
import { Campo, Resultado } from "./CampoGuiado";
import { useNombreEnLaTarjeta } from "./EntradaViva";

// «Crea tu cuenta» (maqueta v4, `vRegistro` y `guiaRegistro`; ADR-0438: solo lo necesario). Correo (con su código), nombre, contraseña y
// aceptar los términos; o «Continuar con Google», que no pide nada más. El documento y el celular se piden después, al separar por
// primera vez, y recién entonces se entra al Club CAYLA (`FormularioUnirseAlClub`). Cada campo dice su estado en su título (✓ Listo ·
// Sigue aquí · Revisa) y debajo qué le falta o qué está mal; el de abajo dice lo primero que falta (cada cosa lleva a su campo) y
// cuánto más, y el botón se enciende cuando no falta nada.
// El código del correo (Felipe 2026-10-15: «al lado del correo debería existir un botón de obtener código y abajo un input para
// colocarlo»): «Obtener código» al lado del correo; la caja del código aparece debajo, con «Reenviar» y su espera, y se revisa sola
// con sus 6 números; con el bueno, «Correo confirmado». «Crear mi cuenta» se prende recién con el correo confirmado y lo demás
// completo, y el servidor vuelve a exigir esa confirmación (`lib/correo-confirmado.ts`). Cambiar el correo deja sin valor el código.

const ID: Record<CampoCuenta, string> = {
  correo: "registro-correo",
  codigo: "registro-codigo",
  nombre: "registro-nombre",
  clave: "registro-clave",
  acepta: "registro-acepta",
};
const ID_CREAR = "registro-crear";
const ID_OBTENER = "registro-obtener";

/** Cuánto se espera después de la última letra antes de preguntarle a la base. */
const ESPERA_CORREO_MS = 700;

const NO_DISPONIBLE: RespuestaCrear = { campo: null, mensaje: MENSAJES.noDisponible };
const SIN_RESPUESTA: RespuestaDelCodigo = { estado: "codigo", enviado: false, mensaje: MENSAJES.codigoNoEnviado, tono: "error", espera: null };

export function FormularioRegistro() {
  const [r, setR] = useState<RegistroCuenta>(REGISTRO_CUENTA_VACIO);
  const [correoRevisado, setCorreoRevisado] = useState<{ valor: string; estado: ConsultaCorreo }>({ valor: "", estado: "sin_revisar" });
  const [enFoco, setEnFoco] = useState<CampoCuenta | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  // El código del correo, bajo el correo: sin pedir, enviado (a qué correo y hasta cuándo esperar para otro) o confirmado.
  const [codigo, setCodigo] = useState<CodigoDelCorreo>({ estado: "sin_pedir" });
  const [valorCodigo, setValorCodigo] = useState("");
  // Lo que el servidor dijo del correo al pedir el código (lo acaba de confirmar otro aparato): bajo su caja, mientras sea ese.
  const [avisoCorreo, setAvisoCorreo] = useState<{ correo: string; texto: string } | null>(null);
  // Hasta que se pide un código vale 0: nada la usa antes (el reloj de «volver a pedir» arranca con el envío, que fija la hora). Sin
  // `Date.now()` aquí: la página se arma por adelantado y Next no deja leer el reloj al armarla.
  const [ahora, setAhora] = useState(0);
  const [enviando, iniciar] = useTransition();
  const [pidiendo, iniciarPedido] = useTransition();
  const [probando, iniciarPrueba] = useTransition();
  // A dónde va el cursor cuando la pantalla cambia (la caja del código aparece, o se va con el correo confirmado). Se hace después de
  // pintar: antes, la caja nueva todavía no existe y el botón todavía está apagado.
  const [enfocar, setEnfocar] = useState<{ id: string; seleccionar?: boolean } | null>(null);
  useEffect(() => {
    if (!enfocar) return;
    const caja = document.getElementById(enfocar.id);
    caja?.focus();
    if (enfocar.seleccionar && caja instanceof HTMLInputElement) caja.select();
  }, [enfocar]);
  // La página con cuenta que quería ver (`?volver=`: la prenda que le mandaron): al crear la cuenta va ahí, no a «Mi cuenta».
  const [volver, setVolver] = useState<string | null>(null);
  useEffect(() => {
    // La dirección solo la sabe el navegador (esta página se guarda en caché): leerla al iniciar el estado rompería la hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el destino vive en la dirección, que solo existe en el navegador
    setVolver(rutaParaVolver(new URLSearchParams(window.location.search).get(PARAMETRO_VOLVER)));
  }, []);

  const correo = normalizarCorreo(r.correo);
  const consultaCorreo: ConsultaCorreo = correoRevisado.valor === correo ? correoRevisado.estado : "sin_revisar";

  // El correo, cuando ya tiene forma de correo y dejó de escribirse: ¿ya tiene cuenta?
  useEffect(() => {
    if (!correoValido(correo) || correoRevisado.valor === correo) return;
    let vigente = true;
    const reloj = setTimeout(async () => {
      const estado = await consultarCorreo(correo).catch((): ConsultaCorreo => "sin_revisar");
      if (vigente) setCorreoRevisado({ valor: correo, estado });
    }, ESPERA_CORREO_MS);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [correo, correoRevisado.valor]);

  // El código vale para el correo escrito AHORA: si la persona lo cambia, el de antes deja de valer (y se pide otro).
  const codigoActual = codigoDelCorreoActual(codigo, correo);
  const restan = codigoActual.estado === "enviado" ? Math.max(0, Math.ceil((codigoActual.hasta - ahora) / 1000)) : 0;
  useEffect(() => {
    if (restan <= 0) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [restan]);

  const estado = estadoCuenta(r, { correo: consultaCorreo, codigo });
  const faltan = faltanCuenta(estado);
  const resumenFaltan = faltanResumidos(faltan);
  const sigue = campoQueSigue(faltan, estado, enFoco);
  const marca = (campo: CampoCuenta) => marcaDe(estado[campo], sigue === campo);
  // La tarjeta del Club del panel de al lado lleva su nombre apenas se sabe; y la línea del pie se llena con lo que ya está listo.
  useNombreEnLaTarjeta(nombreParaLaTarjeta(r.nombre));
  const avance = avanceDeLaCuenta(estado);
  const cambiar = (cambio: Partial<RegistroCuenta>) => {
    setErrorGeneral(null);
    setR((actual) => ({ ...actual, ...cambio }));
  };
  const foco = (campo: CampoCuenta) => ({ alEntrar: () => setEnFoco(campo), alSalir: () => setEnFoco(null) });
  // «Obtener código» se prende con un correo bien escrito que no es de otra cuenta ni de otra persona (lo que ya dijo la base).
  const puedeObtener = estado.correo === "ok" && codigoActual.estado === "sin_pedir" && !pidiendo;

  /**
   * Lo que contesta el servidor del código: confirmado, enviado (con su mensaje y su espera) o un problema del correo. `t`: cuándo
   * contestó (de ahí corre la espera para pedir otro).
   */
  function aplicarCodigo(respuesta: RespuestaDelCodigo, correoPedido: string, probado: string | null, t: number) {
    setAvisoCorreo(null);
    if (respuesta.estado === "confirmado") {
      setCodigo({ estado: "confirmado", correo: correoPedido });
      setValorCodigo("");
      // La caja del código se va: el cursor pasa a lo primero que falta de lo demás (o al botón, si ya no falta nada).
      const siguiente = faltan.find(([campo]) => campo !== "correo" && campo !== "codigo")?.[0];
      setEnfocar({ id: siguiente ? ID[siguiente] : ID_CREAR });
      return;
    }
    if (respuesta.estado === "correo") {
      setCodigo({ estado: "sin_pedir" });
      if (respuesta.repetido) setCorreoRevisado({ valor: correoPedido, estado: "repetido" });
      else setAvisoCorreo({ correo: correoPedido, texto: respuesta.mensaje });
      return;
    }
    setAhora(t);
    // La caja de ESE correo, si ya estaba a la vista (al pedirlo o al probarlo).
    const previo = codigo.estado === "enviado" && codigo.correo === correoPedido ? codigo : null;
    if (!respuesta.enviado && !previo) {
      // No se mandó nada y no había código: el porqué va bajo el correo, junto a «Obtener código».
      setCodigo({ estado: "sin_pedir" });
      if (respuesta.mensaje) setAvisoCorreo({ correo: correoPedido, texto: respuesta.mensaje });
      return;
    }
    // Llegó un código nuevo: anula el anterior (lo que había salido mal o vencido ya no cuenta).
    const nuevo = probado === null && respuesta.tono === "ok";
    setCodigo({
      estado: "enviado",
      correo: correoPedido,
      hasta: respuesta.espera !== null ? t + respuesta.espera * 1000 : (previo?.hasta ?? t),
      mensaje: respuesta.mensaje ? { texto: respuesta.mensaje, tono: respuesta.tono } : null,
      // Venció o se gastaron los intentos: ningún código escrito sirve hasta pedir uno nuevo.
      necesitaNuevo: respuesta.codigo === "vencido" || respuesta.codigo === "bloqueado" ? true : nuevo ? false : (previo?.necesitaNuevo ?? false),
      // El que salió mal no se vuelve a probar solo (gastaría otro intento) hasta que se cambia.
      malo: probado !== null && respuesta.codigo ? probado : nuevo ? null : (previo?.malo ?? null),
    });
    // Con el código recién mandado, el cursor espera en su caja; uno que salió mal queda marcado para escribirlo encima.
    setEnfocar({ id: ID.codigo, seleccionar: probado !== null });
  }

  /** «Obtener código» y «Reenviar». */
  function pedirCodigo(reenvio: boolean) {
    if (pidiendo || (!reenvio && !puedeObtener) || (reenvio && restan > 0)) return;
    const correoPedido = correo;
    setAvisoCorreo(null);
    setErrorGeneral(null);
    if (reenvio) setValorCodigo("");
    iniciarPedido(async () => {
      const respuesta = await obtenerCodigo(correoPedido, reenvio).catch((): RespuestaDelCodigo => SIN_RESPUESTA);
      aplicarCodigo(respuesta, correoPedido, null, Date.now());
    });
  }

  /** La caja del código: con sus 6 números se revisa sola (si no es el mismo que ya salió mal). */
  function cambiarCodigo(texto: string) {
    const valor = codigoLimpio(texto);
    setValorCodigo(valor);
    // Al corregirlo, el error se va; si hace falta un código nuevo, el aviso se queda hasta pedirlo.
    if (codigoActual.estado === "enviado" && codigoActual.mensaje?.tono === "error" && !codigoActual.necesitaNuevo && valor !== codigoActual.malo) {
      setCodigo({ ...codigoActual, mensaje: null });
    }
    if (probando || !codigoParaProbar(codigoActual, valor)) return;
    const correoPedido = correo;
    iniciarPrueba(async () => {
      const respuesta = await confirmarCodigo(correoPedido, valor).catch(
        (): RespuestaDelCodigo => ({ estado: "codigo", enviado: true, mensaje: MENSAJES.codigoNoProbado, tono: "error", espera: null }),
      );
      aplicarCodigo(respuesta, correoPedido, valor, Date.now());
    });
  }

  function aplicarError(e: RespuestaCrear) {
    if (e.campo === "codigo") {
      // La confirmación ya no vale (venció, o el correo recibió otro código): hay que pedir uno nuevo.
      setCodigo({ estado: "sin_pedir" });
      setAvisoCorreo({ correo, texto: e.mensaje });
    } else if (e.campo === "correo" && e.mensaje === MENSAJES.correoRepetido) setCorreoRevisado({ valor: correo, estado: "repetido" });
    // El correo de contacto de otra ficha: bajo su campo, sin «Entrar» ni «Olvidé mi contraseña» (esa persona no tiene cuenta).
    else if (e.campo === "correo" && e.mensaje === MENSAJES.correoDeOtraPersona) setCorreoRevisado({ valor: correo, estado: "de_otra_persona" });
    else setErrorGeneral(e.mensaje);
    // Al campo del problema (el del código vive en el correo: ahí está «Obtener código»).
    if (e.campo) setEnfocar({ id: ID[(e.campo === "codigo" ? "correo" : e.campo) as CampoCuenta] ?? ID.correo });
  }

  /**
   * «Crear mi cuenta»: con todo completo y el correo confirmado. Si sale bien, el servidor vuelve a la página donde estaba la persona
   * (`volver`: la bolsa, una prenda) o la lleva al Inicio.
   */
  function crear() {
    if (faltan.length > 0 || enviando) return;
    setErrorGeneral(null);
    iniciar(async () => {
      const respuesta = await crearCuenta({ registro: r, volver }).catch((): RespuestaCrear => NO_DISPONIBLE);
      if (respuesta) aplicarError(respuesta);
    });
  }

  /**
   * Un «Falta: …» del pie lleva a su campo (la guía de foco del ERP, ADR-0284): lo deja en el medio de la pantalla (el pie fijo no lo
   * tapa) y le pone el cursor, que lo enciende con «Sigue aquí». Confirmar el correo, si el código todavía no se pidió, es tocar
   * «Obtener código» (o, si aún no se puede, escribir bien el correo).
   */
  function irAlCampo(campo: CampoCuenta) {
    const id = campo === "codigo" && codigoActual.estado !== "enviado" ? (puedeObtener ? ID_OBTENER : ID.correo) : ID[campo];
    const destino = document.getElementById(id);
    if (!destino) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    destino.scrollIntoView({ block: "center", behavior: quieto ? "auto" : "smooth" });
    destino.focus({ preventScroll: true });
  }

  const enlacesDeCuenta = (
    <span className="w-res-acc">
      <Link className="w-enlace" href={hrefConVolver("/entrar", volver)}>
        Entrar
      </Link>
      <Link className="w-enlace" href="/olvide-mi-contrasena">
        Olvidé mi contraseña
      </Link>
    </span>
  );
  const sugerencia = arregloCorreo(r.correo);
  const avisoDelCorreo = avisoCorreo && avisoCorreo.correo === correo ? avisoCorreo.texto : null;
  // Lo que sigue es pedir el código: «Obtener código» lleva la luz (la caja del código todavía no existe).
  const obtenerSigue = sigue === "codigo" && codigoActual.estado === "sin_pedir";
  // «Revisa» en el código: hace falta uno nuevo, o el escrito es el mismo que ya salió mal.
  const codigoMalo =
    codigoActual.estado === "enviado" && (codigoActual.necesitaNuevo || (codigoActual.malo !== null && codigoActual.malo === valorCodigo));
  // Con el código en camino, un atajo a su buzón (se abre aparte: lo escrito aquí no se pierde).
  const buzon = codigoActual.estado === "enviado" ? buzonDelCorreo(correo) : null;

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
        <span className="t-ceja">Crea tu cuenta</span>
        <h1 className="w-titulo">
          Solo lo necesario. <em>Lo demás, cuando separes.</em>
        </h1>
        <p className="w-texto-sec">Con tu cuenta separas, guardas tus favoritos y sigues tus pedidos. El Club CAYLA empieza cuando separas tu primera prenda.</p>
      </div>

      <BotonGoogle volver={volver} texto="Crear mi cuenta con Google" />

      <Campo campo="correo" idCaja={ID.correo} etiqueta="Correo" marca={marca("correo")} {...foco("correo")}>
        {/* «Obtener código» al lado del correo (Felipe 2026-10-15); con el correo confirmado, el botón se va y queda el ✓. La misma
            fila de «Cambiar mi correo» y «Restablecer mi acceso» (`.w-caja-con-boton`). */}
        <div className="w-caja-con-boton">
          <input
            id={ID.correo}
            className="w-caja"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="tucorreo@gmail.com" // sugerir-fijo: el ejemplo es la forma de un correo, no depende de nada elegido antes
            value={r.correo}
            onChange={(e) => cambiar({ correo: e.target.value })}
            aria-describedby={`${ID.correo}-res`}
            aria-invalid={estado.correo === "mal" || estado.correo === "repetido" || undefined}
          />
          {codigoActual.estado === "sin_pedir" && (
            <button
              id={ID_OBTENER}
              type="button"
              className={`t-btn t-btn-sec w-obtener${obtenerSigue ? " w-obtener-sigue" : ""}`}
              onClick={() => pedirCodigo(false)}
              // En el botón, lo que sigue es pedir el código (no el correo, que ya está listo): la luz se queda en él.
              onFocus={(e) => {
                e.stopPropagation();
                setEnFoco("codigo");
              }}
              disabled={!puedeObtener}
              aria-busy={pidiendo || undefined}
              aria-describedby={`${ID.correo}-res`}
            >
              {pidiendo ? "Mandando…" : MENSAJES.codigoObtener}
            </button>
          )}
        </div>
        <Resultado id={ID.correo}>
          {estado.correo === "repetido" && consultaCorreo === "de_otra_persona" ? (
            <span className="w-res-error">{MENSAJES.correoDeOtraPersona}</span>
          ) : estado.correo === "repetido" ? (
            <>
              <span className="w-res-error">{MENSAJES.correoRepetido}</span>
              {enlacesDeCuenta}
            </>
          ) : sugerencia ? (
            <>
              <span className="w-res-aviso">
                ¿Quisiste decir <b>{sugerencia}</b>?
              </span>
              <button type="button" className="w-enlace" onClick={() => cambiar({ correo: sugerencia })}>
                Usar este correo
              </button>
            </>
          ) : estado.correo === "mal" ? (
            <span className="w-res-error">{MENSAJES.correoMal}</span>
          ) : codigoActual.estado === "confirmado" ? (
            <span className="w-res-ok">
              <Icono nombre="check" />
              {MENSAJES.correoConfirmado}
            </span>
          ) : avisoDelCorreo ? (
            <span className="w-res-aviso">{avisoDelCorreo}</span>
          ) : codigoActual.estado === "sin_pedir" && estado.correo === "ok" ? (
            <p className="w-ayuda">{MENSAJES.codigoAntes}</p>
          ) : (
            <p className="w-ayuda">{MENSAJES.correoAyuda}</p>
          )}
        </Resultado>
      </Campo>

      {/* La caja del código, DEBAJO del correo, apenas se pide: se revisa sola con sus 6 números. */}
      {codigoActual.estado === "enviado" && (
        <Campo campo="codigo" idCaja={ID.codigo} etiqueta="Código" marca={codigoMalo ? "error" : marca("codigo")} {...foco("codigo")}>
          <input
            id={ID.codigo}
            className="w-caja num w-codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 números" // sugerir-fijo: el código siempre tiene 6 números, no depende de nada elegido antes
            value={valorCodigo}
            onChange={(e) => cambiarCodigo(e.target.value)}
            aria-describedby={`${ID.codigo}-res`}
            aria-invalid={codigoMalo || undefined}
            aria-busy={probando || undefined}
          />
          <Resultado id={ID.codigo}>
            {probando ? (
              <p className="w-ayuda">Revisando tu código…</p>
            ) : codigoActual.mensaje ? (
              <span className={codigoActual.mensaje.tono === "error" ? "w-res-error" : codigoActual.mensaje.tono === "aviso" ? "w-res-aviso" : "w-res-ok"}>
                {codigoActual.mensaje.texto}
              </span>
            ) : (
              <p className="w-ayuda">
                Te lo mandamos a <b className="w-correo">{correo}</b>. Vence en {CODIGO_VENCE_MIN} minutos. {MENSAJES.codigoAyuda}
              </p>
            )}
          </Resultado>
          {/* Fuera de la línea que se anuncia: la cuenta regresiva cambia cada segundo y no debe leerse en voz alta cada vez. */}
          <span className="w-res-acc w-codigo-acc">
            <button type="button" className="w-enlace" onClick={() => pedirCodigo(true)} disabled={restan > 0 || pidiendo}>
              {pidiendo ? "Mandando otro código…" : restan > 0 ? `Reenviar en ${cuentaRegresiva(restan)}` : "Reenviar"}
            </button>
            {buzon && (
              <a className="w-enlace en-buzon" href={buzon.href} target="_blank" rel="noopener noreferrer">
                Abrir {buzon.nombre}
                <Icono nombre="flecha" />
              </a>
            )}
          </span>
        </Campo>
      )}

      <Campo campo="nombre" idCaja={ID.nombre} etiqueta="Tu nombre" marca={marca("nombre")} {...foco("nombre")}>
        <input
          id={ID.nombre}
          className="w-caja"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={MAX_NOMBRE_CUENTA}
          value={r.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          aria-describedby={`${ID.nombre}-res`}
          aria-invalid={estado.nombre === "mal" || undefined}
        />
        <Resultado id={ID.nombre}>
          <p className="w-ayuda">{MENSAJES.nombreAyuda}</p>
        </Resultado>
      </Campo>

      <Campo campo="clave" idCaja={ID.clave} etiqueta="Contraseña" marca={marca("clave")} {...foco("clave")}>
        <CajaClave
          id={ID.clave}
          valor={r.clave}
          onCambio={(clave) => cambiar({ clave })}
          autoComplete="new-password"
          describedBy={`${ID.clave}-res`}
          invalida={estado.clave === "mal"}
        />
        <Resultado id={ID.clave}>
          <p className="w-ayuda">{r.clave.length > CLAVE_MAXIMA ? MENSAJES.claveLarga : (faltanCaracteres(r.clave) ?? MENSAJES.claveAyuda)}</p>
        </Resultado>
      </Campo>

      <div className="w-casillas">
        <div className="w-campo" data-campo="acepta" data-estado={marca("acepta")}>
          <label className="w-check" htmlFor={ID.acepta}>
            <input
              id={ID.acepta}
              type="checkbox"
              checked={r.acepta}
              onChange={(e) => cambiar({ acepta: e.target.checked })}
              onFocus={() => setEnFoco("acepta")}
              onBlur={() => setEnFoco(null)}
            />
            <span>
              Acepto crear mi cuenta y que CAYLA use mis datos para mis pedidos, como dicen la{" "}
              <Link href="/privacidad" target="_blank">
                política de privacidad
              </Link>{" "}
              y los{" "}
              <Link href="/terminos-del-club" target="_blank">
                términos
              </Link>
              . <span className="w-marca">{TEXTO_MARCA[marca("acepta")]}</span>
            </span>
          </label>
        </div>
      </div>

      <p className="w-texto-sec">
        ¿Ya tienes cuenta?{" "}
        <Link className="w-enlace" href={hrefConVolver("/entrar", volver)}>
          Entra
        </Link>
      </p>

      <div className="w-pie-form">
        <span className="en-avance" aria-hidden="true">
          <span style={{ transform: `scaleX(${avance.total ? avance.listos / avance.total : 0})` }} />
        </span>
        <p className="w-faltan" aria-live="polite">
          {faltan.length ? (
            // Los primeros que faltan, cada uno lleva a su campo, y cuántos más.
            <>
              Falta:{" "}
              {resumenFaltan.nombrados.map(([campo, nombre], i) => (
                <Fragment key={campo}>
                  {i > 0 && (resumenFaltan.mas === 0 && i === resumenFaltan.nombrados.length - 1 ? " y " : ", ")}
                  <button type="button" className="w-falta-ir" onClick={() => irAlCampo(campo)}>
                    {nombre}
                  </button>
                </Fragment>
              ))}
              {resumenFaltan.mas > 0 && <> y{"\u00a0"}{resumenFaltan.mas}{"\u00a0"}más</>}
            </>
          ) : errorGeneral ? null : (
            // Con un error encima, «Todo listo» se contradice (Felipe lo vio el 2026-10-16): queda solo el error, que dice qué hacer.
            <>
              Todo listo. Tu cuenta se crea con <b className="w-correo">{correo}</b>
            </>
          )}
        </p>
        {errorGeneral && (
          <p className="w-error-general" role="alert">
            {errorGeneral}
          </p>
        )}
        {/* Se prende recién con el correo confirmado y lo demás completo; el servidor vuelve a exigir la confirmación. */}
        <button id={ID_CREAR} className="t-btn t-btn-ancho" type="submit" disabled={faltan.length > 0 || enviando} aria-busy={enviando || undefined}>
          {enviando ? "Creando tu cuenta…" : "Crear mi cuenta"}
        </button>
      </div>
    </form>
  );
}
