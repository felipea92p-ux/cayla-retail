"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { confirmarCodigo, consultarCorreo, consultarDni, crearCuenta, obtenerCodigo, type RespuestaCrear, type RespuestaDelCodigo } from "@/app/acciones/cuenta";
import {
  arregloCorreo,
  campoQueSigue,
  CLAVE_MAXIMA,
  CODIGO_VENCE_MIN,
  codigoLimpio,
  correoValido,
  cuentaRegresiva,
  cumpleTexto,
  estadoRegistro,
  faltanCaracteres,
  faltanRegistro,
  marcaDe,
  MENSAJES,
  mensajeSinNombre,
  normalizarCorreo,
  REGISTRO_VACIO,
  soloDigitos,
  TEXTO_MARCA,
  textoFaltan,
  type CampoProblema,
  type CampoRegistro,
  type CasillaWhatsapp,
  type ConsultaCorreo,
  type ConsultaDni,
  type Dia,
  type Registro,
} from "@/lib/cuentas";
import { codigoDelCorreoActual, codigoParaProbar, type CodigoDelCorreo } from "@/lib/correo-confirmado";
import { Icono } from "../Icono";
import { Isotipo } from "../Isotipo";
import { CajaClave } from "./CajaClave";
import { Campo, Resultado } from "./CampoGuiado";

// «Crea tu cuenta» (maqueta v4, `vRegistro` y `guiaRegistro`). Cada campo dice su estado en su título (✓ Listo · Sigue aquí ·
// Revisa) y debajo qué le falta o qué está mal; el de abajo dice todo lo que falta y el botón se enciende cuando no falta nada.
// Mientras se escribe, el correo y el DNI se revisan en la base (si ya tienen cuenta) y el DNI trae el nombre del padrón a medias.
// El nombre no se escribe (Felipe 2026-10-15): si el padrón no lo encuentra o no responde, no se crea la cuenta, y el DNI ofrece
// «Volver a intentar».
// Actividad 2b: «Soy mayor de 18 años» (obligatoria) y «Avisos del Club por WhatsApp» (opcional, con el texto aprobado del Club).
// El código del correo (Felipe 2026-10-15: «al lado del correo debería existir un botón de obtener código y abajo un input para
// colocarlo»): «Obtener código» al lado del correo; la caja del código aparece debajo, con «Reenviar» y su espera, y se revisa sola
// con sus 6 números; con el bueno, «Correo confirmado». «Crear mi cuenta» se prende recién con el correo confirmado y lo demás
// completo, y el servidor vuelve a exigir esa confirmación (`lib/correo-confirmado.ts`). Cambiar el correo deja sin valor el código.

const ID: Record<CampoProblema, string> = {
  correo: "registro-correo",
  codigo: "registro-codigo",
  clave: "registro-clave",
  dni: "registro-dni",
  cel: "registro-cel",
  cumple: "registro-cumple-dia",
  mayor: "registro-mayor",
  acepta: "registro-acepta",
  avisos: "registro-avisos",
};
const ID_CREAR = "registro-crear";

/** Cuánto se espera después de la última letra antes de preguntarle a la base. */
const ESPERA_CORREO_MS = 700;
const ESPERA_DNI_MS = 250;

const NO_DISPONIBLE: RespuestaCrear = { campo: null, mensaje: MENSAJES.noDisponible };
const SIN_RESPUESTA: RespuestaDelCodigo = { estado: "codigo", enviado: false, mensaje: MENSAJES.codigoNoEnviado, tono: "error", espera: null };

export function FormularioRegistro({ hoy, casilla: casillaInicial }: { hoy: Dia; casilla: CasillaWhatsapp | null }) {
  const [r, setR] = useState<Registro>(REGISTRO_VACIO);
  const [correoRevisado, setCorreoRevisado] = useState<{ valor: string; estado: ConsultaCorreo }>({ valor: "", estado: "sin_revisar" });
  const [dniRevisado, setDniRevisado] = useState<{ valor: string; estado: ConsultaDni }>({ valor: "", estado: { estado: "sin_revisar" } });
  const [enFoco, setEnFoco] = useState<CampoRegistro | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [casilla, setCasilla] = useState<CasillaWhatsapp | null>(casillaInicial);
  const [avisoCasilla, setAvisoCasilla] = useState<string | null>(null);
  // El código del correo, bajo el correo: sin pedir, enviado (a qué correo y hasta cuándo esperar para otro) o confirmado.
  const [codigo, setCodigo] = useState<CodigoDelCorreo>({ estado: "sin_pedir" });
  const [valorCodigo, setValorCodigo] = useState("");
  // Lo que el servidor dijo del correo al pedir el código (lo acaba de confirmar otro aparato): bajo su caja, mientras sea ese.
  const [avisoCorreo, setAvisoCorreo] = useState<{ correo: string; texto: string } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
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

  const correo = normalizarCorreo(r.correo);
  const dniCompleto = /^\d{8}$/.test(r.dni);
  const consultaCorreo: ConsultaCorreo = correoRevisado.valor === correo ? correoRevisado.estado : "sin_revisar";
  const consultaDni: ConsultaDni =
    dniRevisado.valor === r.dni ? dniRevisado.estado : dniCompleto ? { estado: "buscando" } : { estado: "sin_revisar" };

  // El DNI, apenas tiene sus 8 cifras: ¿ya tiene cuenta?, ¿era del club?, y su nombre del padrón.
  useEffect(() => {
    if (!dniCompleto || dniRevisado.valor === r.dni) return;
    const dni = r.dni;
    let vigente = true;
    const reloj = setTimeout(async () => {
      const estado = await consultarDni(dni).catch((): ConsultaDni => ({ estado: "sin_nombre", motivo: "sin_padron", delClub: false }));
      if (vigente) setDniRevisado({ valor: dni, estado });
    }, ESPERA_DNI_MS);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [r.dni, dniCompleto, dniRevisado.valor]);

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

  const estado = estadoRegistro(r, { correo: consultaCorreo, dni: consultaDni, codigo }, hoy);
  const faltan = faltanRegistro(estado);
  const sigue = campoQueSigue(estado, enFoco);
  const marca = (campo: CampoRegistro) => marcaDe(estado[campo], sigue === campo);
  const cambiar = (cambio: Partial<Registro>) => {
    setErrorGeneral(null);
    setR((actual) => ({ ...actual, ...cambio }));
  };
  const foco = (campo: CampoRegistro) => ({ alEntrar: () => setEnFoco(campo), alSalir: () => setEnFoco(null) });
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
    else if (e.campo === "dni" && e.mensaje === MENSAJES.dniRepetido) setDniRevisado({ valor: r.dni, estado: { estado: "repetido" } });
    else if (e.campo === "dni" && e.mensaje === MENSAJES.dniArchivada) setDniRevisado({ valor: r.dni, estado: { estado: "archivada" } });
    else if (e.campo === "dni" && (e.mensaje === MENSAJES.dniSinPadron || e.mensaje === MENSAJES.dniNoEncontrado))
      // El padrón ya no dio el nombre al crear: el DNI lo dice, con «Volver a intentar» (el nombre no se escribe a mano).
      setDniRevisado({
        valor: r.dni,
        estado: {
          estado: "sin_nombre",
          motivo: e.mensaje === MENSAJES.dniNoEncontrado ? "no_encontrado" : "sin_padron",
          delClub: (consultaDni.estado === "encontrado" || consultaDni.estado === "sin_nombre") && consultaDni.delClub,
        },
      });
    else if (e.campo === "avisos") {
      // El texto de los avisos cambió: el nuevo se lee y se vuelve a marcar (nunca se da por aceptado uno que no leyó).
      if (e.casilla !== undefined) setCasilla(e.casilla);
      setR((actual) => ({ ...actual, avisos: false }));
      setAvisoCasilla(e.mensaje);
    } else setErrorGeneral(e.mensaje);
    // Al campo del problema (el del código vive en el correo: ahí está «Obtener código»).
    if (e.campo) setEnfocar({ id: ID[e.campo === "codigo" ? "correo" : e.campo] });
  }

  /** «Crear mi cuenta»: con todo completo y el correo confirmado. Si sale bien, el servidor lleva a «Mi cuenta». */
  function crear() {
    if (faltan.length > 0 || enviando) return;
    setErrorGeneral(null);
    iniciar(async () => {
      const respuesta = await crearCuenta({ registro: r, casilla: casilla?.version ?? null }).catch((): RespuestaCrear => NO_DISPONIBLE);
      if (respuesta) aplicarError(respuesta);
    });
  }

  const delClub = (consultaDni.estado === "encontrado" || consultaDni.estado === "sin_nombre") && consultaDni.delClub;
  const enlacesDeCuenta = (
    <span className="w-res-acc">
      <Link className="w-enlace" href="/entrar">
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
          Entra al catálogo y <em>ya eres del club.</em>
        </h1>
        <p className="w-texto-sec">Una sola vez. Con tu DNI te reconocemos en cualquier tienda y sale tu boleta.</p>
      </div>

      <Campo campo="correo" idCaja={ID.correo} etiqueta="Correo" marca={marca("correo")} {...foco("correo")}>
        {/* «Obtener código» al lado del correo (Felipe 2026-10-15); con el correo confirmado, el botón se va y queda el ✓. */}
        <div className="w-correo-fila">
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
          </span>
        </Campo>
      )}

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

      <Campo campo="dni" idCaja={ID.dni} etiqueta="DNI" marca={marca("dni")} {...foco("dni")}>
        <input
          id={ID.dni}
          className="w-caja num"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder="8 dígitos" // sugerir-fijo: el largo de un DNI no depende de nada elegido antes
          value={r.dni}
          onChange={(e) => cambiar({ dni: soloDigitos(e.target.value, 8) })}
          aria-describedby={`${ID.dni}-res`}
          aria-invalid={estado.dni === "mal" || estado.dni === "repetido" || undefined}
        />
        <Resultado id={ID.dni}>
          {consultaDni.estado === "repetido" ? (
            <>
              <span className="w-res-error">{MENSAJES.dniRepetido}</span>
              {enlacesDeCuenta}
            </>
          ) : consultaDni.estado === "archivada" ? (
            <span className="w-res-error">{MENSAJES.dniArchivada}</span>
          ) : consultaDni.estado === "buscando" ? (
            <p className="w-ayuda">{MENSAJES.dniBuscando}</p>
          ) : consultaDni.estado === "encontrado" ? (
            // Su nombre del padrón, a medias (no revela el de nadie) y con su origen: no se escribe ni se cambia aquí.
            <>
              <span className="w-res-ok">
                <Icono nombre="check" />
                {consultaDni.aMedias}
              </span>
              <p className="w-ayuda">{MENSAJES.dniDelPadron}</p>
            </>
          ) : consultaDni.estado === "sin_nombre" ? (
            // Sin el nombre del padrón no hay cuenta (Felipe 2026-10-15): el porqué y «Volver a intentar», que pregunta otra vez.
            <>
              <span className="w-res-error">{mensajeSinNombre(consultaDni.motivo)}</span>
              <button type="button" className="w-enlace" onClick={() => setDniRevisado({ valor: "", estado: { estado: "sin_revisar" } })}>
                Volver a intentar
              </button>
            </>
          ) : (
            <p className="w-ayuda">{MENSAJES.dniAyuda}</p>
          )}
          {delClub && (
            <span className="w-club">
              <Isotipo />
              {MENSAJES.dniDelClub}
            </span>
          )}
        </Resultado>
      </Campo>

      <Campo campo="cel" idCaja={ID.cel} etiqueta="Celular con WhatsApp" marca={marca("cel")} {...foco("cel")}>
        <div className="w-caja-pref">
          <span aria-hidden="true">+51</span>
          <input
            id={ID.cel}
            className="w-caja num"
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={9}
            placeholder="9 dígitos" // sugerir-fijo: el largo de un celular no depende de nada elegido antes
            value={r.celular}
            onChange={(e) => cambiar({ celular: soloDigitos(e.target.value, 9) })}
            aria-describedby={`${ID.cel}-res`}
            aria-invalid={estado.cel === "mal" || undefined}
          />
        </div>
        <Resultado id={ID.cel}>
          {estado.cel === "mal" ? <span className="w-res-error">{MENSAJES.celMal}</span> : <p className="w-ayuda">{MENSAJES.celAyuda}</p>}
        </Resultado>
      </Campo>

      <Campo campo="cumple" idCaja={ID.cumple} etiqueta="Tu cumpleaños" marca={marca("cumple")} {...foco("cumple")}>
        <div className="w-cumple">
          <input
            id={ID.cumple}
            className="w-caja num"
            inputMode="numeric"
            maxLength={2}
            placeholder="Día"
            aria-label="Día"
            value={r.cumple.d}
            onChange={(e) => cambiar({ cumple: { ...r.cumple, d: soloDigitos(e.target.value, 2) } })}
            aria-describedby={`${ID.cumple}-res`}
          />
          <input
            className="w-caja num"
            inputMode="numeric"
            maxLength={2}
            placeholder="Mes"
            aria-label="Mes, del 1 al 12"
            value={r.cumple.m}
            onChange={(e) => cambiar({ cumple: { ...r.cumple, m: soloDigitos(e.target.value, 2) } })}
            aria-describedby={`${ID.cumple}-res`}
          />
          <input
            className="w-caja num"
            inputMode="numeric"
            maxLength={4}
            placeholder="Año (opcional)"
            aria-label="Año, opcional"
            value={r.cumple.a}
            onChange={(e) => cambiar({ cumple: { ...r.cumple, a: soloDigitos(e.target.value, 4) } })}
            aria-describedby={`${ID.cumple}-res`}
          />
        </div>
        <Resultado id={ID.cumple}>
          {estado.cumple === "mal" ? (
            <span className="w-res-error">{estado.motivoCumple === "menor" ? MENSAJES.cumpleMenor : MENSAJES.cumpleMal}</span>
          ) : estado.cumple === "ok" ? (
            <span className="w-res-ok">
              <Icono nombre="regalo" />
              Tu cumpleaños: {cumpleTexto(Number(r.cumple.d), Number(r.cumple.m))}
            </span>
          ) : (
            <p className="w-ayuda">{MENSAJES.cumpleAyuda}</p>
          )}
        </Resultado>
      </Campo>

      <div className="w-casillas">
        <div className="w-campo" data-campo="mayor" data-estado={marca("mayor")}>
          <label className="w-check" htmlFor={ID.mayor}>
            <input
              id={ID.mayor}
              type="checkbox"
              checked={r.mayor}
              onChange={(e) => cambiar({ mayor: e.target.checked })}
              onFocus={() => setEnFoco("mayor")}
              onBlur={() => setEnFoco(null)}
            />
            <span>
              {MENSAJES.mayor} <span className="w-marca">{TEXTO_MARCA[marca("mayor")]}</span>
            </span>
          </label>
        </div>

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
              Acepto crear mi cuenta y unirme al Club CAYLA, y que CAYLA use mis datos para mis pedidos y beneficios, como dicen la{" "}
              <Link href="/privacidad" target="_blank">
                política de privacidad
              </Link>{" "}
              y los{" "}
              <Link href="/terminos-del-club" target="_blank">
                términos del club
              </Link>
              . <span className="w-marca">{TEXTO_MARCA[marca("acepta")]}</span>
            </span>
          </label>
        </div>

        {casilla && (
          <div className="w-campo w-avisos" data-campo="avisos" data-estado={r.avisos ? "hecho" : "opcional"}>
            <span className="w-campo-t">
              {MENSAJES.avisosTitulo} <span className="w-marca">{r.avisos ? TEXTO_MARCA.hecho : "Opcional"}</span>
            </span>
            <label className="w-check" htmlFor={ID.avisos}>
              <input
                id={ID.avisos}
                type="checkbox"
                checked={r.avisos}
                onChange={(e) => {
                  setAvisoCasilla(null);
                  cambiar({ avisos: e.target.checked });
                }}
                aria-describedby={`${ID.avisos}-res`}
              />
              <span>{casilla.texto}</span>
            </label>
            <div className="w-res w-check-res" id={`${ID.avisos}-res`} aria-live="polite">
              {avisoCasilla ? <span className="w-res-aviso">{avisoCasilla}</span> : <p className="w-ayuda">{MENSAJES.avisosAyuda}</p>}
            </div>
          </div>
        )}
      </div>

      <p className="w-texto-sec">
        ¿Ya tienes cuenta?{" "}
        <Link className="w-enlace" href="/entrar">
          Entra
        </Link>
      </p>

      <div className="w-pie-form">
        <p className="w-faltan" aria-live="polite">
          {faltan.length ? (
            <>
              Falta: <b>{textoFaltan(faltan)}</b>
            </>
          ) : (
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
