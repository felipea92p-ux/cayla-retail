"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, useTransition } from "react";
import { ajustarNumeroAlTipo, TIPOS_DOCUMENTO_CLIENTA, type TipoDocumentoClienta } from "@cayla-retail/shared";
import { consultarDocumento } from "@/app/acciones/cuenta";
import { unirseAlClub, type RespuestaUnirse } from "@/app/acciones/club-registro";
import {
  ayudaDelNumero,
  cajaDelNumero,
  campoQueSigue,
  cumpleTexto,
  documentoCompleto,
  documentoRepetido,
  estadoClub,
  faltanClub,
  faltanResumidos,
  marcaDe,
  MAX_PARTE_NOMBRE,
  MENSAJES,
  mensajeSinNombre,
  REGISTRO_CLUB_VACIO,
  soloDigitos,
  TEXTO_MARCA,
  type CampoClub,
  type CasillaWhatsapp,
  type ConsultaDocumento,
  type Dia,
  type RegistroClub,
} from "@/lib/cuentas";
import { PARAMETRO_VOLVER, rutaParaVolver } from "@/lib/entrada";
import { Icono } from "../Icono";
import { Campo, Resultado } from "./CampoGuiado";

// «Completa tus datos y entra al Club» (ADR-0438, Felipe 2026-10-17: «DNI y celular después, y cuando lo haga recién forma parte del
// Club»). Se pide al separar por primera vez (la bolsa lleva aquí con `?volver=/bolsa`) o cuando la persona quiere, desde «Mi perfil».
// Documento (DNI, carné de extranjería o pasaporte), celular con WhatsApp, y las casillas de «Soy mayor de 18 años» y los términos; el
// cumpleaños y los avisos por WhatsApp son opcionales. Con DNI el nombre sale del padrón y no se escribe (Felipe 2026-10-15); con carné o
// pasaporte se escribe tal cual está en el documento. La misma guía de campos que crear la cuenta: cada uno dice su estado y el pie dice
// qué falta (cada cosa lleva a su campo). Si el documento ya tenía una ficha en una tienda, la cuenta pasa a ESA sin que se diga: todos
// completan igual (Felipe 2026-10-16).

type CampoDelForm = CampoClub | "cumple";
const ID: Record<CampoDelForm | "avisos", string> = {
  documento: "club-documento",
  nombres: "club-nombres",
  apellidos: "club-apellidos",
  cel: "club-cel",
  cumple: "club-cumple-dia",
  mayor: "club-mayor",
  acepta: "club-acepta",
  avisos: "club-avisos",
};
const ID_UNIRME = "club-unirme";

/** Cuánto se espera después de la última letra antes de preguntarle a la base (carné y pasaporte no tienen largo fijo). */
const ESPERA_DNI_MS = 250;
const ESPERA_OTRO_MS = 700;

const NO_DISPONIBLE: RespuestaUnirse = { campo: null, mensaje: MENSAJES.clubNoDisponible };

export function FormularioUnirseAlClub({ hoy, casilla: casillaInicial, nombre }: { hoy: Dia; casilla: CasillaWhatsapp | null; nombre: string }) {
  const [r, setR] = useState<RegistroClub>(REGISTRO_CLUB_VACIO);
  // Lo que dijo el servidor del documento escrito, con su tipo («dni:12345678»): otro tipo u otro número es otra consulta.
  const [documentoRevisado, setDocumentoRevisado] = useState<{ valor: string; estado: ConsultaDocumento }>({ valor: "", estado: { estado: "sin_revisar" } });
  const [enFoco, setEnFoco] = useState<CampoDelForm | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [casilla, setCasilla] = useState<CasillaWhatsapp | null>(casillaInicial);
  const [avisoCasilla, setAvisoCasilla] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  // A dónde va el cursor cuando la pantalla cambia. Se hace después de pintar.
  const [enfocar, setEnfocar] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (enfocar) document.getElementById(enfocar.id)?.focus();
  }, [enfocar]);
  // A dónde vuelve al terminar (`?volver=`: la bolsa): solo una página de esta tienda.
  const [volver, setVolver] = useState<string | null>(null);
  useEffect(() => {
    // La dirección solo la sabe el navegador (esta página se guarda en caché): leerla al iniciar el estado rompería la hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el destino vive en la dirección, que solo existe en el navegador
    setVolver(rutaParaVolver(new URLSearchParams(window.location.search).get(PARAMETRO_VOLVER)));
  }, []);

  const esDni = r.documentoTipo === "dni";
  const claveDocumento = `${r.documentoTipo}:${r.documento}`;
  const completo = documentoCompleto(r.documentoTipo, r.documento);
  const consultaDocumento: ConsultaDocumento =
    documentoRevisado.valor === claveDocumento ? documentoRevisado.estado : completo ? { estado: "buscando" } : { estado: "sin_revisar" };

  // El documento, apenas está completo: ¿ya es de otra cuenta? y, con DNI, su nombre del padrón.
  useEffect(() => {
    if (!completo || documentoRevisado.valor === claveDocumento) return;
    const [tipo, numero, clave] = [r.documentoTipo, r.documento, claveDocumento];
    let vigente = true;
    const reloj = setTimeout(async () => {
      const estado = await consultarDocumento(tipo, numero).catch((): ConsultaDocumento => ({ estado: "sin_nombre", motivo: "sin_padron" }));
      if (vigente) setDocumentoRevisado({ valor: clave, estado });
    }, tipo === "dni" ? ESPERA_DNI_MS : ESPERA_OTRO_MS);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [r.documentoTipo, r.documento, claveDocumento, completo, documentoRevisado.valor]);

  const estado = estadoClub(r, { documento: consultaDocumento }, hoy);
  const faltan = faltanClub(estado);
  const resumenFaltan = faltanResumidos(faltan);
  const sigue = campoQueSigue(faltan, estado, enFoco);
  const marca = (campo: CampoClub) => marcaDe(estado[campo], sigue === campo);
  const marcaCumple = estado.cumpleVacio ? "opcional" : marcaDe(estado.cumple, sigue === "cumple");
  const cambiar = (cambio: Partial<RegistroClub>) => {
    setErrorGeneral(null);
    setR((actual) => ({ ...actual, ...cambio }));
  };
  const foco = (campo: CampoDelForm) => ({ alEntrar: () => setEnFoco(campo), alSalir: () => setEnFoco(null) });
  /** Otro tipo de documento: el número se ajusta a lo que ese tipo admite (no se vacía), como en la caja del ERP. */
  const cambiarTipo = (tipo: TipoDocumentoClienta) => cambiar({ documentoTipo: tipo, documento: ajustarNumeroAlTipo(tipo, r.documento) });

  function aplicarError(e: RespuestaUnirse) {
    if (e.campo === "documento" && e.mensaje === documentoRepetido(r.documentoTipo)) setDocumentoRevisado({ valor: claveDocumento, estado: { estado: "repetido" } });
    else if (e.campo === "documento" && e.mensaje === MENSAJES.dniArchivada) setDocumentoRevisado({ valor: claveDocumento, estado: { estado: "archivada" } });
    else if (e.campo === "documento" && (e.mensaje === MENSAJES.dniSinPadron || e.mensaje === MENSAJES.dniNoEncontrado))
      // El padrón ya no dio el nombre: el DNI lo dice, con «Volver a intentar» (el nombre no se escribe a mano).
      setDocumentoRevisado({
        valor: claveDocumento,
        estado: { estado: "sin_nombre", motivo: e.mensaje === MENSAJES.dniNoEncontrado ? "no_encontrado" : "sin_padron" },
      });
    else if (e.campo === "nombres" || e.campo === "apellidos" || e.campo === "documento") setErrorGeneral(e.mensaje);
    else if (e.campo === "avisos") {
      // El texto de los avisos cambió: el nuevo se lee y se vuelve a marcar (nunca se da por aceptado uno que no leyó).
      if (e.casilla !== undefined) setCasilla(e.casilla);
      setR((actual) => ({ ...actual, avisos: false }));
      setAvisoCasilla(e.mensaje);
    } else setErrorGeneral(e.mensaje);
    // Al campo del problema.
    const id = e.campo ? ID[e.campo as CampoDelForm | "avisos"] : undefined;
    if (id) setEnfocar({ id });
  }

  /** «Unirme al Club»: con todo completo. Si sale bien, el servidor vuelve a donde estaba la persona (la bolsa) o la lleva a «Mi perfil». */
  function unirme() {
    if (faltan.length > 0 || enviando) return;
    setErrorGeneral(null);
    iniciar(async () => {
      const respuesta = await unirseAlClub({ registro: r, casilla: casilla?.version ?? null, volver }).catch((): RespuestaUnirse => NO_DISPONIBLE);
      if (respuesta) aplicarError(respuesta);
    });
  }

  /** Un «Falta: …» del pie lleva a su campo: lo deja en el medio de la pantalla y le pone el cursor. */
  function irAlCampo(campo: CampoDelForm) {
    const destino = document.getElementById(ID[campo]);
    if (!destino) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    destino.scrollIntoView({ block: "center", behavior: quieto ? "auto" : "smooth" });
    destino.focus({ preventScroll: true });
  }

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        unirme();
      }}
    >
      <div>
        <span className="t-ceja">Para separar</span>
        <h1 className="w-titulo">
          Completa tus datos y <em>entra al Club.</em>
        </h1>
        <p className="w-texto-sec">
          {nombre}, la tienda necesita tu documento para entregarte tu pedido y tu celular para confirmarlo por WhatsApp. Es una sola vez: con ellos
          ya eres parte del Club CAYLA.
        </p>
      </div>

      <Campo campo="documento" idCaja={ID.documento} etiqueta="Documento" marca={marca("documento")} {...foco("documento")}>
        {/* El tipo (Felipe 2026-10-15: DNI, carné de extranjería o pasaporte, «como en las tiendas»). Cambiarlo no borra el número: se
            ajusta a lo que ese tipo admite (la misma regla de la caja del ERP). */}
        <div className="w-tipos" role="radiogroup" aria-label="Tipo de documento">
          {TIPOS_DOCUMENTO_CLIENTA.map((t) => (
            <button key={t.valor} type="button" role="radio" aria-checked={r.documentoTipo === t.valor} className="w-tipo" onClick={() => cambiarTipo(t.valor)}>
              {t.etiqueta}
            </button>
          ))}
        </div>
        <input
          id={ID.documento}
          className="w-caja num"
          inputMode={cajaDelNumero(r.documentoTipo).teclado}
          autoCapitalize={esDni ? "none" : "characters"}
          autoComplete="off"
          spellCheck={false}
          maxLength={cajaDelNumero(r.documentoTipo).largo}
          placeholder={ayudaDelNumero(r.documentoTipo)}
          aria-label={`Número de ${TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === r.documentoTipo)?.etiqueta ?? "documento"}`}
          value={r.documento}
          onChange={(e) => cambiar({ documento: ajustarNumeroAlTipo(r.documentoTipo, e.target.value) })}
          aria-describedby={`${ID.documento}-res`}
          aria-invalid={estado.documento === "mal" || estado.documento === "repetido" || undefined}
        />
        <Resultado id={ID.documento}>
          {consultaDocumento.estado === "repetido" ? (
            <span className="w-res-error">{documentoRepetido(r.documentoTipo)}</span>
          ) : consultaDocumento.estado === "archivada" ? (
            <span className="w-res-error">{MENSAJES.dniArchivada}</span>
          ) : consultaDocumento.estado === "buscando" ? (
            <p className="w-ayuda">{esDni ? MENSAJES.dniBuscando : MENSAJES.documentoRevisando}</p>
          ) : consultaDocumento.estado === "encontrado" ? (
            // Su nombre del padrón, a medias (no revela el de nadie) y con su origen: no se escribe ni se cambia aquí.
            <>
              <span className="w-res-ok">
                <Icono nombre="check" />
                {consultaDocumento.aMedias}
              </span>
              <p className="w-ayuda">{MENSAJES.dniDelPadron}</p>
            </>
          ) : consultaDocumento.estado === "libre" ? (
            <p className="w-ayuda">{MENSAJES.documentoLibre}</p>
          ) : consultaDocumento.estado === "sin_nombre" ? (
            // Sin el nombre del padrón no hay Club (Felipe 2026-10-15): el porqué y «Volver a intentar», que pregunta otra vez.
            <>
              <span className="w-res-error">{mensajeSinNombre(consultaDocumento.motivo)}</span>
              <button type="button" className="w-enlace" onClick={() => setDocumentoRevisado({ valor: "", estado: { estado: "sin_revisar" } })}>
                Volver a intentar
              </button>
            </>
          ) : (
            <p className="w-ayuda">{esDni ? MENSAJES.dniAyuda : MENSAJES.documentoAyuda}</p>
          )}
        </Resultado>
      </Campo>

      {/* Con carné o pasaporte, el nombre se escribe tal cual está en el documento: nombres y apellidos aparte. Con DNI no hay caja:
          sale del padrón. */}
      {!esDni &&
        (["nombres", "apellidos"] as const).map((parte) => (
          <Campo key={parte} campo={parte} idCaja={ID[parte]} etiqueta={parte === "nombres" ? "Nombres" : "Apellidos"} marca={marca(parte)} {...foco(parte)}>
            <input
              id={ID[parte]}
              className="w-caja"
              autoComplete={parte === "nombres" ? "given-name" : "family-name"}
              autoCapitalize="words"
              maxLength={MAX_PARTE_NOMBRE}
              value={r[parte]}
              onChange={(e) => cambiar({ [parte]: e.target.value } as Partial<RegistroClub>)}
              aria-describedby={`${ID[parte]}-res`}
              aria-invalid={estado[parte] === "mal" || undefined}
            />
            <Resultado id={ID[parte]}>
              {estado[parte] === "mal" ? (
                <span className="w-res-error">{MENSAJES.nombreConNumeros}</span>
              ) : (
                <p className="w-ayuda">{parte === "nombres" ? MENSAJES.nombresAyuda : MENSAJES.apellidosAyuda}</p>
              )}
            </Resultado>
          </Campo>
        ))}

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

      <Campo campo="cumple" idCaja={ID.cumple} etiqueta="Tu cumpleaños" marca={marcaCumple} {...foco("cumple")}>
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
          ) : !estado.cumpleVacio ? (
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
              Acepto unirme al Club CAYLA y que CAYLA use mis datos para mis pedidos y beneficios, como dicen la{" "}
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

      <div className="w-pie-form">
        <p className="w-faltan" aria-live="polite">
          {faltan.length ? (
            // Los primeros que faltan, cada uno lleva a su campo, y cuántos más.
            <>
              Falta:{" "}
              {resumenFaltan.nombrados.map(([campo, nombreCampo], i) => (
                <Fragment key={campo}>
                  {i > 0 && (resumenFaltan.mas === 0 && i === resumenFaltan.nombrados.length - 1 ? " y " : ", ")}
                  <button type="button" className="w-falta-ir" onClick={() => irAlCampo(campo)}>
                    {nombreCampo}
                  </button>
                </Fragment>
              ))}
              {resumenFaltan.mas > 0 && <> y{" "}{resumenFaltan.mas}{" "}más</>}
            </>
          ) : errorGeneral ? null : (
            <>Todo listo. Te unes al Club y sigues con tu pedido.</>
          )}
        </p>
        {errorGeneral && (
          <p className="w-error-general" role="alert">
            {errorGeneral}
          </p>
        )}
        <button id={ID_UNIRME} className="t-btn t-btn-ancho" type="submit" disabled={faltan.length > 0 || enviando} aria-busy={enviando || undefined}>
          {enviando ? "Uniéndote al Club…" : volver ? "Unirme al Club y seguir" : "Unirme al Club"}
        </button>
      </div>
    </form>
  );
}
