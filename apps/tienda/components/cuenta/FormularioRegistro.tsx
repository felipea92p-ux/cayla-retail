"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { consultarCorreo, consultarDni, crearCuenta, type RespuestaRegistro } from "@/app/acciones/cuenta";
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
  type CampoRegistro,
  type ConsultaCorreo,
  type ConsultaDni,
  type Dia,
  type MarcaCampo,
  type Registro,
} from "@/lib/cuentas";
import { Icono } from "../Icono";
import { Isotipo } from "../Isotipo";
import { CajaClave } from "./CajaClave";

// «Crea tu cuenta» (maqueta v4, `vRegistro` y `guiaRegistro`). Cada campo dice su estado en su título (✓ Listo · Sigue aquí ·
// Revisa) y debajo qué le falta o qué está mal; el de abajo dice todo lo que falta y el botón se enciende cuando no falta nada.
// Mientras se escribe, el correo y el DNI se revisan en la base (si ya tienen cuenta) y el DNI trae el nombre del padrón a medias.

const ID: Record<CampoRegistro, string> = {
  correo: "registro-correo",
  clave: "registro-clave",
  dni: "registro-dni",
  nombre: "registro-nombre",
  cel: "registro-cel",
  cumple: "registro-cumple-dia",
  acepta: "registro-acepta",
};

/** Cuánto se espera después de la última letra antes de preguntarle a la base. */
const ESPERA_CORREO_MS = 700;
const ESPERA_DNI_MS = 250;

export function FormularioRegistro({ hoy }: { hoy: Dia }) {
  const [r, setR] = useState<Registro>(REGISTRO_VACIO);
  const [correoRevisado, setCorreoRevisado] = useState<{ valor: string; estado: ConsultaCorreo }>({ valor: "", estado: "sin_revisar" });
  const [dniRevisado, setDniRevisado] = useState<{ valor: string; estado: ConsultaDni }>({ valor: "", estado: { estado: "sin_revisar" } });
  const [enFoco, setEnFoco] = useState<CampoRegistro | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
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
  const foco = { alEntrar: setEnFoco, alSalir: () => setEnFoco(null) };

  function aplicarError(e: RespuestaRegistro) {
    if (e.campo === "correo" && e.mensaje === MENSAJES.correoRepetido) setCorreoRevisado({ valor: correo, estado: "repetido" });
    else if (e.campo === "dni" && e.mensaje === MENSAJES.dniRepetido) setDniRevisado({ valor: r.dni, estado: { estado: "repetido" } });
    else if (e.campo === "dni" && e.mensaje === MENSAJES.dniArchivada) setDniRevisado({ valor: r.dni, estado: { estado: "archivada" } });
    else if (e.campo === "nombre" && !pideNombre(consultaDni))
      // El padrón ya no dio el nombre al crear: que lo escriba.
      setDniRevisado({ valor: r.dni, estado: { estado: "sin_nombre", motivo: "sin_padron", delClub: consultaDni.estado === "encontrado" && consultaDni.delClub } });
    else setErrorGeneral(e.mensaje);
    if (e.campo) document.getElementById(ID[e.campo])?.focus();
  }

  function crear() {
    if (faltan.length > 0 || enviando) return;
    setErrorGeneral(null);
    iniciar(async () => {
      // Si sale bien, la acción ya llevó a «Mi cuenta»; si vuelve, algo no se pudo.
      const respuesta = await crearCuenta(r).catch((): RespuestaRegistro => ({ campo: null, mensaje: MENSAJES.noDisponible }));
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

      <Campo campo="correo" etiqueta="Correo" marca={marca("correo")} {...foco}>
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

      <Campo campo="clave" etiqueta="Contraseña" marca={marca("clave")} {...foco}>
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

      <Campo campo="dni" etiqueta="DNI" marca={marca("dni")} {...foco}>
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
        <Campo campo="nombre" etiqueta="Tus nombres y apellidos" marca={marca("nombre")} {...foco}>
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

      <Campo campo="cel" etiqueta="Celular con WhatsApp" marca={marca("cel")} {...foco}>
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

      <Campo campo="cumple" etiqueta="Tu cumpleaños" marca={marca("cumple")} {...foco}>
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
              Todo listo. Tu correo: <b className="w-correo">{correo}</b>
            </>
          )}
        </p>
        {errorGeneral && (
          <p className="w-error-general" role="alert">
            {errorGeneral}
          </p>
        )}
        <button className="t-btn t-btn-ancho" type="submit" disabled={faltan.length > 0 || enviando} aria-busy={enviando || undefined}>
          {enviando ? "Creando tu cuenta…" : "Crear mi cuenta"}
        </button>
      </div>
    </form>
  );
}

/** Un campo con su título, su marca y lo que dice debajo. La luz («Sigue aquí») no se va de él mientras tenga el foco. */
function Campo({
  campo,
  etiqueta,
  marca,
  alEntrar,
  alSalir,
  children,
}: {
  campo: CampoRegistro;
  etiqueta: string;
  marca: MarcaCampo;
  alEntrar: (campo: CampoRegistro) => void;
  alSalir: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="w-campo"
      data-campo={campo}
      data-estado={marca}
      onFocus={() => alEntrar(campo)}
      onBlur={(e) => {
        // Pasar del día al mes del cumpleaños no es salir del campo.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) alSalir();
      }}
    >
      <label htmlFor={ID[campo]}>
        {etiqueta} <span className="w-marca">{TEXTO_MARCA[marca]}</span>
      </label>
      {children}
    </div>
  );
}

function Resultado({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div className="w-res" id={`${id}-res`} aria-live="polite">
      {children}
    </div>
  );
}
