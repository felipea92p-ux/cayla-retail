"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { registrarme } from "@/app/actions/club-registro";
import { Desplegable } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useRetenerLuz } from "@/components/guia-de-foco/useRetenerLuz";
import { InicioClub, SociaClub } from "@/components/clientas/club-publico-pasos";
import { EnlaceLegalClub, HojaClub } from "@/components/clientas/piezas-club-publico";
import { EMISOR } from "@/lib/emisor";
import { hoyLima } from "@/lib/fechas-lima";
import { ajustarCelular } from "@/lib/club-reglas";
import { celularLegible } from "@/lib/club-caja-reglas";
import { OPCIONES_MES_CUMPLE, ajustarAnio, ajustarDia } from "@/lib/club-cumple-reglas";
import { camposDelRegistro } from "@/lib/club-registro-guia";
import { avanceDelRegistro, iniciales } from "@/lib/club-publico-reglas";
import type { EstadoCampo } from "@/lib/guia-campos";
import { TIPOS_DOCUMENTO_CLIENTA, ajustarNumeroAlTipo, largoMaximoDocumento, type TipoDocumentoClienta } from "@/lib/documento-clienta-reglas";
import {
  AYUDA,
  BOTON_UNIRME,
  CASILLA_MAYOR,
  MENSAJE,
  casillaTerminos,
  completarMarcadores,
  enlaceLegal,
  letraChica,
  marcadoresDePagina,
  mensajeDeConsulta,
  problemasRegistro,
  versionesDe,
  type CampoRegistro,
  type PaginaClub,
  type RegistroEscrito,
  type RespuestaRegistro,
  type RespuestaConsulta,
} from "@/lib/club-registro-reglas";

/* ====================================================================
   El registro PÚBLICO del Club CAYLA (ADR-0288 act. g): lo abre la clienta en SU celular al escanear el QR del cartel o de su
   ticket, sin cuenta, y se une sola. Tres pasos en la MISMA dirección (estado de la página, sin cambiar de URL), como el diseño
   aprobado por Felipe el 2026-10-01: «al escanear» → «sus datos» → «ya es socia». Al cambiar de paso la vista vuelve arriba; lo
   escrito no se pierde al volver al inicio. El primero y el último los dibuja `club-publico-pasos.tsx`; aquí vive el formulario
   y quién decide el paso. El aspecto y el movimiento: `app/estilos/club-publico.css`.

   Los textos del formulario son los aprobados (`docs/club/texto-legal-registro-v1.md`); la política, los términos, la casilla
   de WhatsApp y el saludo llegan de la base con su versión.

   Guía de foco (ADR-0284): cada campo es una tarjeta que se marca con ✓ al quedar hecha; la que sigue se enciende («Sigue
   aquí» y su halo); la barra de arriba cuenta lo hecho sobre lo requerido; «Falta: …» sobre el botón lleva a cada cosa. Todo
   sale de `problemasRegistro`, la MISMA regla que apaga el botón y que el servidor vuelve a correr (`lib/club-registro-guia.ts`).

   DNI: con los 8 dígitos, la página trae su nombre del padrón A MEDIAS («¿Eres Lucía P. S.?») por `/api/club/nombre` (con
   `x-espera: no`: es una lectura mientras escribe y no abre el loader); ella confirma o corrige. Carné o pasaporte: escribe su
   nombre. Las tres casillas nacen sin marcar: el consentimiento es el toque de ella. Guardar va por `registrarme` (acción de
   servidor, llave de servicio); el loader general la cubre como en todo el ERP.
   ==================================================================== */

const VACIO: RegistroEscrito = {
  documentoTipo: "dni",
  documentoNumero: "",
  dniConfirmado: false,
  nombre: "",
  celular: "",
  nacimiento: { dia: "", mes: "", anio: "" },
  correo: "",
  mayorDeEdad: false,
  aceptaTerminos: false,
  aceptaPublicidad: false,
};

/** Cómo se lee cada tipo en su botón (el diseño: «Carné»); el lector de pantalla oye el nombre entero. */
const TIPO_CORTO: Record<TipoDocumentoClienta, string> = { dni: "DNI", carne_extranjeria: "Carné", pasaporte: "Pasaporte" };

/** Ids de las cajas, para llevarle el cursor («No, corregir», un error del servidor). */
const ID = { numero: "club-documento", nombre: "club-nombre", celular: "club-celular", dia: "club-nac-dia", anio: "club-nac-anio", correo: "club-correo" };

/** La consulta del padrón para el DNI escrito. `numero`: a qué DNI corresponde (si ella sigue tipeando, ya no vale). */
type Consulta =
  | { estado: "nada" }
  | { estado: "buscando"; numero: string }
  | { estado: "encontrado"; numero: string; aMedias: string }
  | { estado: "confirmado"; numero: string; aMedias: string }
  | { estado: "fallo"; numero: string; mensaje: string };

type Listo = Extract<RespuestaRegistro, { estado: "listo" }>;
type Paso = "inicio" | "datos" | "socia";

/** La cascada del formulario: cada tarjeta entra 120 ms después de la anterior, desde los 220 ms (el diseño). */
const cascada = (i: number) => ({ "--r": `${220 + i * 120}ms` }) as CSSProperties;

export function RegistroClub({ ubicacionId, paginaInicial }: { ubicacionId: string; paginaInicial: PaginaClub }) {
  const [paso, setPaso] = useState<Paso>("inicio");
  const [pagina, setPagina] = useState(paginaInicial);
  const [r, setR] = useState<RegistroEscrito>(VACIO);
  const [consulta, setConsulta] = useState<Consulta>({ estado: "nada" });
  const [salio, setSalio] = useState<ReadonlySet<CampoRegistro>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [listo, setListo] = useState<Listo | null>(null);
  // El DNI que está en la caja AHORA: una respuesta del padrón que llega tarde, de un número anterior, no se pinta.
  const numeroActual = useRef("");
  const hoy = hoyLima();

  // Cambiar de paso cambia de VISTA sin cambiar de URL: se suelta la reserva de alto de `PaginaEstable` (ADR-0185), la vista
  // vuelve arriba y el foco pasa al título del paso nuevo (el lector de pantalla lo anuncia, y en el celular no se abre el
  // teclado). Antes de pintar, para que el aire no alcance a verse.
  const pasoPrevio = useRef<Paso>(paso);
  useLayoutEffect(() => {
    if (pasoPrevio.current === paso) return;
    pasoPrevio.current = paso;
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector<HTMLElement>("[data-paso-titulo]")?.focus({ preventScroll: true });
  }, [paso]);

  const esDni = r.documentoTipo === "dni";
  const pendienteDocumento =
    consulta.estado === "buscando" ? "Buscando tu DNI…" : consulta.estado === "encontrado" ? "Confirma si eres tú." : consulta.estado === "fallo" ? consulta.mensaje : null;
  const campos = camposDelRegistro(r, hoy, esDni ? pendienteDocumento : null);
  const guia = useGuiaCampos(campos, { enModal: false });
  const avance = avanceDelRegistro(campos);
  const problemas = problemasRegistro(r, hoy);
  const marcadores = marcadoresDePagina(pagina);

  function pedirNombre(numero: string) {
    numeroActual.current = numero;
    if (numero.length !== 8) {
      setConsulta({ estado: "nada" });
      return;
    }
    setConsulta({ estado: "buscando", numero });
    // Lectura mientras escribe: por su ruta con `x-espera: no`, no por la acción de servidor (que abriría el loader, ADR-0149).
    fetch("/api/club/nombre", {
      method: "POST",
      headers: { "content-type": "application/json", "x-espera": "no" },
      body: JSON.stringify({ ubicacionId, numero }),
    })
      .then((res) => res.json() as Promise<RespuestaConsulta>)
      .then(
        (res) => {
          if (numeroActual.current !== numero) return;
          setConsulta(res.estado === "encontrado" ? { estado: "encontrado", numero, aMedias: res.aMedias } : { estado: "fallo", numero, mensaje: mensajeDeConsulta(res) });
        },
        () => {
          if (numeroActual.current === numero) setConsulta({ estado: "fallo", numero, mensaje: MENSAJE.sinPadron });
        },
      );
  }

  function cambiarNumero(texto: string) {
    const numero = ajustarNumeroAlTipo(r.documentoTipo, texto);
    if (numero === r.documentoNumero) return;
    setR((x) => ({ ...x, documentoNumero: numero, dniConfirmado: false }));
    setError(null);
    if (esDni) pedirNombre(numero);
  }

  function cambiarTipo(tipo: TipoDocumentoClienta) {
    if (tipo === r.documentoTipo) return;
    const numero = ajustarNumeroAlTipo(tipo, r.documentoNumero);
    setR((x) => ({ ...x, documentoTipo: tipo, documentoNumero: numero, dniConfirmado: false }));
    if (tipo === "dni") pedirNombre(numero);
    else {
      numeroActual.current = "";
      setConsulta({ estado: "nada" });
    }
  }

  function confirmarDni() {
    if (consulta.estado !== "encontrado") return;
    setConsulta({ ...consulta, estado: "confirmado" });
    setR((x) => ({ ...x, dniConfirmado: true }));
  }

  function corregirDni() {
    numeroActual.current = "";
    setConsulta({ estado: "nada" });
    setR((x) => ({ ...x, documentoNumero: "", dniConfirmado: false }));
    document.getElementById(ID.numero)?.focus();
  }

  const marcarSalida = (campo: CampoRegistro) => setSalio((s) => (s.has(campo) ? s : new Set(s).add(campo)));
  /**
   * Lo que está MAL escrito en un campo, solo después de que ella salió de él y si escribió algo: mientras escribe, o si todavía
   * no llegó, la guía ya dice qué falta (lo que falta es un camino, no un error).
   */
  const problemaVisible = (campo: CampoRegistro, valor: string) => (salio.has(campo) && valor.trim() !== "" ? (problemas[campo] ?? null) : null);

  async function unirme(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!guia.puedeConfirmar) {
      const primero = guia.faltan.find((c) => c.requerido);
      if (primero) guia.ir(primero.id);
      return;
    }
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await registrarme({ ...r, ubicacionId, versiones: versionesDe(pagina) });
      if (res.estado === "listo") {
        setListo(res);
        setPaso("socia");
      } else if (res.estado === "textos_cambiaron") {
        // Aceptar el texto nuevo es otro toque de ella: las casillas de los textos que cambiaron vuelven sin marcar.
        setPagina(res.pagina);
        setR((x) => ({ ...x, aceptaTerminos: false, aceptaPublicidad: false }));
        setAviso(MENSAJE.textosCambiaron);
        guia.ir("terminos");
      } else {
        setError(res.mensaje);
        if (res.campo) guia.ir(res.campo);
      }
    } catch {
      // Sin señal, o la acción no llegó: todo queda como estaba, para reintentar.
      setError(MENSAJE.noDisponible);
    } finally {
      setEnviando(false);
    }
  }

  if (paso === "socia" && listo) return <SociaClub listo={listo} pagina={pagina} mesNacimiento={r.nacimiento.mes} hoy={hoy} />;
  if (paso === "inicio") return <InicioClub pagina={pagina} ubicacionId={ubicacionId} onUnirme={() => setPaso("datos")} />;

  const ir = (cual: "privacidad" | "terminos") => enlaceLegal(cual, ubicacionId);
  const textoPublicidad = completarMarcadores(pagina.textos.casillaPublicidad.texto, marcadores);
  const errorDocumento = esDni && r.documentoNumero.length === 8 ? null : problemaVisible("documento", r.documentoNumero);
  const errorNombre = problemaVisible("nombre", r.nombre);
  const errorCelular = problemaVisible("celular", r.celular);
  const errorNacimiento = r.nacimiento.anio.length === 4 ? (problemas.nacimiento ?? null) : null;
  const errorCorreo = problemaVisible("correo", r.correo);
  // Las casillas obligatorias son UNA tarjeta: se enciende si lo que sigue es una de ellas.
  const estadoCasillas: EstadoCampo =
    guia.ahora === "mayor" || guia.ahora === "terminos" ? "ahora" : guia.estado("mayor") === "hecho" && guia.estado("terminos") === "hecho" ? "hecho" : "falta";
  // La cascada: con carné o pasaporte hay una tarjeta más (el nombre), y todo lo de abajo entra un turno después.
  const n = esDni ? 0 : 1;

  return (
    <HojaClub cabeza={false}>
      <div className="club-paso club-paso-datos">
        <div className="club-avance-cabeza club-entra" style={{ "--d": "450ms" } as CSSProperties}>
          <button type="button" className="club-volver" onClick={() => setPaso("inicio")} aria-label="Volver a Club CAYLA">
            <span aria-hidden>‹</span> Club CAYLA
          </button>
          <div className="club-avance-textos">
            <span>{avance.estado}</span>
            <span>{avance.falta}</span>
          </div>
          <div
            className="club-avance"
            role="progressbar"
            aria-label="Avance de tu registro"
            aria-valuemin={0}
            aria-valuemax={avance.total}
            aria-valuenow={avance.hechos}
            aria-valuetext={`${avance.estado}. ${avance.falta}.`}
          >
            <span className="club-avance-relleno" style={{ width: `${Math.round(avance.fraccion * 100)}%` }} />
          </div>
        </div>

        <div className="club-entra" style={{ "--r": "120ms" } as CSSProperties}>
          <h1 data-paso-titulo tabIndex={-1} className="club-datos-titulo">
            Tus datos
          </h1>
          <p className="club-datos-bajada">Solo lo necesario para reconocerte en caja.</p>
        </div>

        <form onSubmit={unirme} noValidate className="club-paso club-paso-datos">
          <TarjetaCampo id="documento" guia={guia} estilo={cascada(0)} titulo={<span className="club-tarjeta-titulo">Documento</span>}>
            <TipoDocumento valor={r.documentoTipo} onValor={cambiarTipo} deshabilitado={enviando} />
            <label htmlFor={ID.numero} className="club-etiqueta">
              Número de documento
            </label>
            <input
              id={ID.numero}
              className="club-input club-cifra"
              autoComplete="off"
              inputMode={esDni ? "numeric" : "text"}
              autoCapitalize={esDni ? undefined : "characters"}
              maxLength={largoMaximoDocumento(r.documentoTipo)}
              placeholder={esDni ? "8 dígitos" : "Como figura en tu documento"}
              value={r.documentoNumero}
              disabled={enviando}
              aria-invalid={errorDocumento ? true : undefined}
              aria-describedby={`${ID.numero}-pie`}
              onChange={(e) => cambiarNumero(e.target.value)}
              onBlur={() => marcarSalida("documento")}
            />
            <Pie id={`${ID.numero}-pie`} error={errorDocumento}>
              {AYUDA.documento}
            </Pie>
            {esDni && <ConfirmarDni consulta={consulta} numero={r.documentoNumero} onSi={confirmarDni} onCorregir={corregirDni} />}
          </TarjetaCampo>

          {!esDni && (
            <TarjetaCampo
              id="nombre"
              guia={guia}
              estilo={cascada(1)}
              titulo={
                <label htmlFor={ID.nombre} className="club-tarjeta-titulo">
                  Nombres y apellidos
                </label>
              }
            >
              <input
                id={ID.nombre}
                className="club-input"
                autoComplete="name"
                value={r.nombre}
                disabled={enviando}
                aria-invalid={errorNombre ? true : undefined}
                aria-describedby={`${ID.nombre}-pie`}
                onChange={(e) => setR((x) => ({ ...x, nombre: e.target.value }))}
                onBlur={() => marcarSalida("nombre")}
              />
              <Pie id={`${ID.nombre}-pie`} error={errorNombre} />
            </TarjetaCampo>
          )}

          <TarjetaCampo
            id="celular"
            guia={guia}
            estilo={cascada(1 + n)}
            titulo={
              <label htmlFor={ID.celular} className="club-tarjeta-titulo">
                Celular con WhatsApp
              </label>
            }
          >
            <input
              id={ID.celular}
              className="club-input club-cifra"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="9xx xxx xxx" // sugerir-fijo: formato del celular peruano; es el mismo para cualquier clienta
              value={celularLegible(r.celular)}
              disabled={enviando}
              aria-invalid={errorCelular ? true : undefined}
              aria-describedby={`${ID.celular}-pie`}
              onChange={(e) => setR((x) => ({ ...x, celular: ajustarCelular(e.target.value) }))}
              onBlur={() => marcarSalida("celular")}
            />
            <Pie id={`${ID.celular}-pie`} error={errorCelular}>
              {AYUDA.celular}
            </Pie>
          </TarjetaCampo>

          <TarjetaCampo id="nacimiento" guia={guia} estilo={cascada(2 + n)} titulo={<span className="club-tarjeta-titulo">Fecha de nacimiento</span>}>
            <div className="club-fecha" role="group" aria-label="Fecha de nacimiento" aria-describedby="club-nac-pie">
              <input
                id={ID.dia}
                className="club-input club-cifra"
                aria-label="Día de nacimiento"
                inputMode="numeric"
                autoComplete="bday-day"
                maxLength={2}
                placeholder="Día" // sugerir-fijo: nombre de la caja (el día en que nació); no depende de nada elegido antes
                value={r.nacimiento.dia}
                disabled={enviando}
                onChange={(e) => setR((x) => ({ ...x, nacimiento: { ...x.nacimiento, dia: ajustarDia(e.target.value) } }))}
              />
              <Desplegable
                valor={r.nacimiento.mes}
                onValor={(mes) => setR((x) => ({ ...x, nacimiento: { ...x.nacimiento, mes } }))}
                opciones={OPCIONES_MES_CUMPLE}
                marcador="Mes"
                forma="caja"
                etiquetaAccesible="Mes de nacimiento"
                deshabilitado={enviando}
              />
              <input
                id={ID.anio}
                className="club-input club-cifra"
                aria-label="Año de nacimiento"
                inputMode="numeric"
                autoComplete="bday-year"
                maxLength={4}
                placeholder="Año" // sugerir-fijo: nombre de la caja (el año en que nació); no depende de nada elegido antes
                value={r.nacimiento.anio}
                disabled={enviando}
                aria-invalid={errorNacimiento ? true : undefined}
                onChange={(e) => setR((x) => ({ ...x, nacimiento: { ...x.nacimiento, anio: ajustarAnio(e.target.value) } }))}
                onBlur={() => marcarSalida("nacimiento")}
              />
            </div>
            <Pie id="club-nac-pie" error={errorNacimiento}>
              {AYUDA.nacimiento}
            </Pie>
          </TarjetaCampo>

          <TarjetaCampo
            id="correo"
            guia={guia}
            estilo={cascada(3 + n)}
            opcional
            titulo={
              <label htmlFor={ID.correo} className="club-tarjeta-titulo">
                Correo <span className="club-opcional">· opcional</span>
              </label>
            }
          >
            <input
              id={ID.correo}
              className="club-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={r.correo}
              disabled={enviando}
              aria-invalid={errorCorreo ? true : undefined}
              aria-describedby={`${ID.correo}-pie`}
              onChange={(e) => setR((x) => ({ ...x, correo: e.target.value }))}
              onBlur={() => marcarSalida("correo")}
            />
            <Pie id={`${ID.correo}-pie`} error={errorCorreo}>
              {AYUDA.correo}
            </Pie>
          </TarjetaCampo>

          <div className="club-entra" style={cascada(4 + n)}>
            <div className="club-tarjeta club-casillas" data-estado={estadoCasillas}>
              {estadoCasillas === "ahora" && <span className="club-sigue">Sigue aquí</span>}
              {aviso && (
                <p role="status" className="club-aviso anim-revelar">
                  {aviso}
                </p>
              )}
              <FilaCasilla id="mayor" marcada={r.mayorDeEdad} onCambio={() => setR((x) => ({ ...x, mayorDeEdad: !x.mayorDeEdad }))} etiqueta={CASILLA_MAYOR} deshabilitada={enviando}>
                {CASILLA_MAYOR}
              </FilaCasilla>
              <FilaCasilla
                id="terminos"
                marcada={r.aceptaTerminos}
                onCambio={() => setR((x) => ({ ...x, aceptaTerminos: !x.aceptaTerminos }))}
                etiqueta="Acepto la Política de privacidad y los Términos del Club CAYLA"
                deshabilitada={enviando}
              >
                {casillaTerminos(EMISOR.razonSocial).map((t, k) =>
                  typeof t === "string" ? (
                    <span key={k}>{t}</span>
                  ) : (
                    <EnlaceLegalClub key={k} href={ir(t.enlace)}>
                      {t.texto}
                    </EnlaceLegalClub>
                  ),
                )}
              </FilaCasilla>
              <FilaCasilla
                id="publicidad"
                marcada={r.aceptaPublicidad}
                onCambio={() => setR((x) => ({ ...x, aceptaPublicidad: !x.aceptaPublicidad }))}
                etiqueta={textoPublicidad}
                deshabilitada={enviando}
              >
                {textoPublicidad} <span className="club-nota">Opcional. Sin esta casilla eres socia igual, con tus beneficios en tienda y sin mensajes.</span>
              </FilaCasilla>
            </div>
          </div>

          <div className="club-acciones club-entra" style={cascada(5 + n)}>
            <PieGuia guia={guia} listo="Todo listo para unirte." />
            <button
              type="submit"
              className={`club-boton ${guia.claseConfirmar}`}
              disabled={!guia.puedeConfirmar}
              aria-busy={enviando || undefined}
              title={guia.frase ?? undefined}
            >
              <span className="club-boton-texto">{enviando ? "Uniéndote…" : BOTON_UNIRME}</span>
            </button>
            {error && (
              <p role="alert" className="club-error anim-revelar">
                {error}
              </p>
            )}
            <p className="club-letra-chica">{letraChica(EMISOR)}</p>
          </div>
        </form>
      </div>
    </HojaClub>
  );
}

/**
 * Una tarjeta de campo: entra en cascada, su título lleva a la derecha el aro de «falta» o el ✓ que se dibuja al quedar hecha,
 * y se enciende cuando es la que sigue («Sigue aquí» y su halo). `data-campo` es por donde la guía la encuentra para llevar a
 * ella; mientras ella escribe adentro, la luz no se va (`useRetenerLuz`). La entrada va en la caja de afuera y la luz en la de
 * adentro: el destello de «llevarte al campo» no vuelve a disparar la entrada.
 */
function TarjetaCampo({
  id,
  guia,
  estilo,
  titulo,
  opcional = false,
  children,
}: {
  id: CampoRegistro;
  guia: GuiaCampos;
  estilo: CSSProperties;
  titulo: ReactNode;
  opcional?: boolean;
  children: ReactNode;
}) {
  const estado = guia.estado(id);
  const retener = useRetenerLuz(id, guia);
  return (
    <div className="club-entra" style={estilo}>
      <div {...retener} data-campo={id} data-estado={estado} className={`club-tarjeta ${opcional ? "club-tarjeta-opcional" : ""}`}>
        {estado === "ahora" && <span className="club-sigue">Sigue aquí</span>}
        <div className="club-tarjeta-cabeza">
          {titulo}
          <MarcaTarjeta estado={estado} />
        </div>
        {children}
      </div>
    </div>
  );
}

/** A la derecha del título: el ✓ verde que se dibuja al quedar hecho, o un aro mientras falta. Lo opcional sin llenar, nada. */
function MarcaTarjeta({ estado }: { estado: EstadoCampo }) {
  if (estado === "hecho") {
    return (
      <svg className="club-visto" viewBox="0 0 20 20" role="img" aria-label="Listo">
        <circle cx="10" cy="10" r="9" />
        <path pathLength={100} d="M6 10.4l2.6 2.6L14 7.6" />
      </svg>
    );
  }
  if (estado === "opcional") return null;
  return <span className="club-pendiente" aria-hidden />;
}

/** Bajo cada caja: lo que está mal (si ella ya salió del campo) o, si no, su texto de ayuda. El alto está reservado. */
function Pie({ id, error, children }: { id: string; error: string | null; children?: ReactNode }) {
  return (
    <p id={id} className="club-pie" data-tono={error ? "error" : undefined}>
      {error ?? children}
    </p>
  );
}

/** DNI · Carné · Pasaporte: un grupo de radio (una sola parada de tabulador; las flechas cambian de opción). */
function TipoDocumento({ valor, onValor, deshabilitado }: { valor: TipoDocumentoClienta; onValor: (t: TipoDocumentoClienta) => void; deshabilitado: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function alTeclado(e: KeyboardEvent, i: number) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const siguiente = (i + delta + TIPOS_DOCUMENTO_CLIENTA.length) % TIPOS_DOCUMENTO_CLIENTA.length;
    onValor(TIPOS_DOCUMENTO_CLIENTA[siguiente]!.valor);
    refs.current[siguiente]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Tipo de documento" className="club-segmento">
      {TIPOS_DOCUMENTO_CLIENTA.map((t, i) => (
        <button
          key={t.valor}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={t.valor === valor}
          aria-label={t.etiqueta}
          tabIndex={t.valor === valor ? 0 : -1}
          disabled={deshabilitado}
          onClick={() => onValor(t.valor)}
          onKeyDown={(e) => alTeclado(e, i)}
        >
          {TIPO_CORTO[t.valor]}
        </button>
      ))}
    </div>
  );
}

/** Una casilla de verdad (teclado y lector de pantalla); todo el texto la marca. Nace SIEMPRE sin marcar. */
function FilaCasilla({
  id,
  marcada,
  onCambio,
  etiqueta,
  deshabilitada,
  children,
}: {
  id: string;
  marcada: boolean;
  onCambio: () => void;
  etiqueta: string;
  deshabilitada: boolean;
  children: ReactNode;
}) {
  return (
    <label data-campo={id} data-deshabilitada={deshabilitada || undefined} className="club-casilla-fila">
      <Casilla marcada={marcada} onCambio={() => !deshabilitada && onCambio()} etiqueta={etiqueta} className="club-casilla" />
      <span>{children}</span>
    </label>
  );
}

/** «¿Eres Mariela Q. R.?» bajo el DNI: buscando, la pregunta con «Sí, soy yo» / «No, corregir», confirmado, o por qué no se pudo. */
function ConfirmarDni({ consulta, numero, onSi, onCorregir }: { consulta: Consulta; numero: string; onSi: () => void; onCorregir: () => void }) {
  if (consulta.estado === "nada" || consulta.numero !== numero) return null;
  if (consulta.estado === "buscando") {
    return (
      <p role="status" className="club-buscando">
        Buscando tu DNI…
      </p>
    );
  }
  if (consulta.estado === "fallo") {
    return (
      <p role="alert" className="club-error-texto anim-revelar">
        {consulta.mensaje}
      </p>
    );
  }
  if (consulta.estado === "confirmado") {
    return (
      <div role="status" className="club-eres club-eres-confirmada">
        <span className="club-avatar" aria-hidden>
          {iniciales(consulta.aMedias)}
        </span>
        <p className="club-eres-pregunta club-eres-confirmado">
          Eres <strong>{consulta.aMedias}</strong>
        </p>
        <button type="button" onClick={onCorregir} className="club-boton-chico club-boton-chico-secundario">
          No soy yo
        </button>
      </div>
    );
  }
  return (
    <div role="status" className="club-eres">
      <div className="club-eres-fila">
        <span className="club-avatar" aria-hidden>
          {iniciales(consulta.aMedias)}
        </span>
        <p className="club-eres-pregunta">
          ¿Eres <strong>{consulta.aMedias}</strong>?
        </p>
      </div>
      <p className="club-eres-ayuda">{AYUDA.padron}</p>
      <div className="club-eres-botones">
        <button type="button" onClick={onSi} className="club-boton-chico club-boton-chico-primario">
          Sí, soy yo
        </button>
        <button type="button" onClick={onCorregir} className="club-boton-chico club-boton-chico-secundario">
          No, corregir
        </button>
      </div>
    </div>
  );
}
