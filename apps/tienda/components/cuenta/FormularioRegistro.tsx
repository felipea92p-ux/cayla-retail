"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { confirmarCodigo, consultarCorreo, consultarDni, pedirCodigo, reenviarCodigo, type RespuestaCodigo } from "@/app/acciones/cuenta";
import {
  arregloCorreo,
  campoQueSigue,
  CLAVE_MAXIMA,
  correoValido,
  cumpleTexto,
  estadoRegistro,
  faltanCaracteres,
  faltanRegistro,
  marcaDe,
  MENSAJES,
  normalizarCorreo,
  pideNombre,
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
import { Icono } from "../Icono";
import { Isotipo } from "../Isotipo";
import { CajaClave } from "./CajaClave";
import { Campo, Resultado } from "./CampoGuiado";
import { PasoCodigo, type InicioCodigo } from "./PasoCodigo";

// «Crea tu cuenta» (maqueta v4, `vRegistro` y `guiaRegistro`). Cada campo dice su estado en su título (✓ Listo · Sigue aquí ·
// Revisa) y debajo qué le falta o qué está mal; el de abajo dice todo lo que falta y el botón se enciende cuando no falta nada.
// Mientras se escribe, el correo y el DNI se revisan en la base (si ya tienen cuenta) y el DNI trae el nombre del padrón a medias.
// Actividad 2b: «Soy mayor de 18 años» (obligatoria), «Avisos del Club por WhatsApp» (opcional, con el texto aprobado del Club) y,
// al terminar, un código al correo: la cuenta y la ficha nacen recién con el código bueno (`PasoCodigo`).

const ID: Record<CampoProblema, string> = {
  correo: "registro-correo",
  clave: "registro-clave",
  dni: "registro-dni",
  nombre: "registro-nombre",
  cel: "registro-cel",
  cumple: "registro-cumple-dia",
  mayor: "registro-mayor",
  acepta: "registro-acepta",
  avisos: "registro-avisos",
  codigo: "registro-codigo",
};

/** Cuánto se espera después de la última letra antes de preguntarle a la base. */
const ESPERA_CORREO_MS = 700;
const ESPERA_DNI_MS = 250;

type ProblemaDeDatos = Extract<RespuestaCodigo, { paso: "datos" }>;
const NO_DISPONIBLE: ProblemaDeDatos = { paso: "datos", campo: null, mensaje: MENSAJES.noDisponible };

export function FormularioRegistro({ hoy, casilla: casillaInicial }: { hoy: Dia; casilla: CasillaWhatsapp | null }) {
  const [r, setR] = useState<Registro>(REGISTRO_VACIO);
  const [correoRevisado, setCorreoRevisado] = useState<{ valor: string; estado: ConsultaCorreo }>({ valor: "", estado: "sin_revisar" });
  const [dniRevisado, setDniRevisado] = useState<{ valor: string; estado: ConsultaDni }>({ valor: "", estado: { estado: "sin_revisar" } });
  const [enFoco, setEnFoco] = useState<CampoRegistro | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [casilla, setCasilla] = useState<CasillaWhatsapp | null>(casillaInicial);
  const [avisoCasilla, setAvisoCasilla] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<InicioCodigo | null>(null);
  const [enviando, iniciar] = useTransition();

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

  const estado = estadoRegistro(r, { correo: consultaCorreo, dni: consultaDni }, hoy);
  const faltan = faltanRegistro(estado);
  const sigue = campoQueSigue(estado, enFoco);
  const marca = (campo: CampoRegistro) => marcaDe(estado[campo], sigue === campo);
  const cambiar = (cambio: Partial<Registro>) => {
    setErrorGeneral(null);
    setR((actual) => ({ ...actual, ...cambio }));
  };
  const foco = (campo: CampoRegistro) => ({ alEntrar: () => setEnFoco(campo), alSalir: () => setEnFoco(null) });

  function aplicarError(e: ProblemaDeDatos) {
    if (e.campo === "correo" && e.mensaje === MENSAJES.correoRepetido) setCorreoRevisado({ valor: correo, estado: "repetido" });
    else if (e.campo === "dni" && e.mensaje === MENSAJES.dniRepetido) setDniRevisado({ valor: r.dni, estado: { estado: "repetido" } });
    else if (e.campo === "dni" && e.mensaje === MENSAJES.dniArchivada) setDniRevisado({ valor: r.dni, estado: { estado: "archivada" } });
    else if (e.campo === "nombre" && !pideNombre(consultaDni))
      // El padrón ya no dio el nombre al crear: que lo escriba.
      setDniRevisado({ valor: r.dni, estado: { estado: "sin_nombre", motivo: "sin_padron", delClub: consultaDni.estado === "encontrado" && consultaDni.delClub } });
    else if (e.campo === "avisos") {
      // El texto de los avisos cambió: el nuevo se lee y se vuelve a marcar (nunca se da por aceptado uno que no leyó).
      if (e.casilla !== undefined) setCasilla(e.casilla);
      setR((actual) => ({ ...actual, avisos: false }));
      setAvisoCasilla(e.mensaje);
    } else setErrorGeneral(e.mensaje);
    const id = e.campo ? ID[e.campo] : null;
    // Si vuelve del paso del código, el formulario aparece recién en el próximo cuadro.
    if (id) window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  }

  /** «Mandarme el código»: si sale bien, pasa al paso del código. */
  function pedir() {
    if (faltan.length > 0 || enviando) return;
    setErrorGeneral(null);
    iniciar(async () => {
      const respuesta = await pedirCodigo({ registro: r, casilla: casilla?.version ?? null }).catch((): RespuestaCodigo => NO_DISPONIBLE);
      if (respuesta.paso === "datos") return aplicarError(respuesta);
      const t = Date.now();
      setCodigo({ mensaje: respuesta.mensaje ? { texto: respuesta.mensaje, tono: respuesta.tono } : null, desde: t, hasta: t + (respuesta.espera ?? 0) * 1000 });
    });
  }

  /** Lo que contesta el servidor en el paso del código: si el problema es de los datos, se vuelve a ellos con el problema en su campo. */
  function enElCodigo(respuesta: RespuestaCodigo | undefined) {
    if (!respuesta) return undefined;
    if (respuesta.paso === "codigo") return respuesta;
    setCodigo(null);
    aplicarError(respuesta);
    return undefined;
  }

  if (codigo) {
    return (
      <PasoCodigo
        correo={correo}
        inicio={codigo}
        confirmar={async (valor) =>
          enElCodigo(
            await confirmarCodigo({ registro: r, casilla: casilla?.version ?? null, codigo: valor }).catch(
              (): RespuestaCodigo => ({ paso: "codigo", mensaje: MENSAJES.codigoNoProbado, tono: "error", espera: null }),
            ),
          )
        }
        reenviar={async () =>
          enElCodigo(await reenviarCodigo(correo).catch((): RespuestaCodigo => ({ paso: "codigo", mensaje: MENSAJES.codigoNoEnviado, tono: "error", espera: null })))
        }
        volver={() => setCodigo(null)}
      />
    );
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

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        pedir();
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
        <Resultado id={ID.correo}>
          {estado.correo === "repetido" ? (
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
          ) : (
            <p className="w-ayuda">{MENSAJES.correoAyuda}</p>
          )}
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
            <span className="w-res-ok">
              <Icono nombre="check" />
              {consultaDni.aMedias}
            </span>
          ) : consultaDni.estado === "sin_nombre" ? (
            <span className="w-res-aviso">
              {consultaDni.motivo === "no_encontrado" ? MENSAJES.dniNoEncontrado : consultaDni.motivo === "limite" ? MENSAJES.dniLimite : MENSAJES.dniSinPadron}
            </span>
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

      {pideNombre(consultaDni) && (
        <Campo campo="nombre" idCaja={ID.nombre} etiqueta="Tus nombres y apellidos" marca={marca("nombre")} {...foco("nombre")}>
          <input
            id={ID.nombre}
            className="w-caja"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={200}
            value={r.nombre}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            aria-describedby={`${ID.nombre}-res`}
          />
          <Resultado id={ID.nombre}>
            <p className="w-ayuda">{MENSAJES.nombreAyuda}</p>
          </Resultado>
        </Campo>
      )}

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
              Todo listo. El código llega a <b className="w-correo">{correo}</b>
            </>
          )}
        </p>
        {errorGeneral && (
          <p className="w-error-general" role="alert">
            {errorGeneral}
          </p>
        )}
        <button className="t-btn t-btn-ancho" type="submit" disabled={faltan.length > 0 || enviando} aria-busy={enviando || undefined}>
          {enviando ? "Mandando tu código…" : "Mandarme el código"}
        </button>
      </div>
    </form>
  );
}
