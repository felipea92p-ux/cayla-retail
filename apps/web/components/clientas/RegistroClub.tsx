"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { consultarNombre, registrarme } from "@/app/actions/club-registro";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaClub, Trozos } from "@/components/clientas/piezas-club-publico";
import { EMISOR } from "@/lib/emisor";
import { hoyLima } from "@/lib/fechas-lima";
import { ajustarCelular } from "@/lib/club-reglas";
import { celularLegible } from "@/lib/club-caja-reglas";
import { OPCIONES_MES_CUMPLE, ajustarAnio, ajustarDia } from "@/lib/club-cumple-reglas";
import { camposDelRegistro } from "@/lib/club-registro-guia";
import { TIPOS_DOCUMENTO_CLIENTA, ajustarNumeroAlTipo, largoMaximoDocumento, type TipoDocumentoClienta } from "@/lib/documento-clienta-reglas";
import {
  AYUDA,
  BAJADA_CLUB,
  BOTON_UNIRME,
  CASILLA_MAYOR,
  MENSAJE,
  NOTA_CONDICIONES,
  TITULO_CLUB,
  beneficiosDelClub,
  bienvenida,
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
} from "@/lib/club-registro-reglas";

/* ====================================================================
   El registro PÚBLICO del Club CAYLA (ADR-0288 act. g): lo abre la clienta en SU celular al escanear el QR del cartel o de su
   ticket, sin cuenta, y se une sola. Los textos son los aprobados (`docs/club/texto-legal-registro-v1.md`); la política, los
   términos, la casilla de WhatsApp y el saludo llegan de la base con su versión.

   Guía de foco (ADR-0284): cada bloque se enciende cuando es el que sigue, «Falta: …» sobre el botón lleva a cada cosa, y todo
   sale de `problemasRegistro`, la MISMA regla que el servidor vuelve a correr (`lib/club-registro-guia.ts`).

   DNI: con los 8 dígitos, `consultarNombre` trae su nombre del padrón A MEDIAS («¿Eres Lucía P. S.?»); ella confirma o
   corrige. Carné o pasaporte: escribe su nombre. Las tres casillas nacen sin marcar: el consentimiento es el toque de ella.
   Guardar va por `registrarme` (acción de servidor, llave de servicio); el loader general la cubre como en todo el ERP.
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

const OPCIONES_TIPO = TIPOS_DOCUMENTO_CLIENTA.map((t) => ({ valor: t.valor, texto: t.etiqueta }));

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

export function RegistroClub({ ubicacionId, paginaInicial }: { ubicacionId: string; paginaInicial: PaginaClub }) {
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

  // Pasar del formulario a la bienvenida cambia de VISTA sin cambiar de URL: se suelta la reserva de alto de `PaginaEstable`
  // (ADR-0185) y la vista vuelve arriba, donde está la bienvenida. Antes de pintar, para que el aire no alcance a verse.
  const vistaPrevia = useRef(false);
  useLayoutEffect(() => {
    if (vistaPrevia.current === (listo !== null)) return;
    vistaPrevia.current = listo !== null;
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [listo]);

  const esDni = r.documentoTipo === "dni";
  const pendienteDocumento =
    consulta.estado === "buscando" ? "Buscando tu DNI…" : consulta.estado === "encontrado" ? "Confirma si eres tú." : consulta.estado === "fallo" ? consulta.mensaje : null;
  const guia = useGuiaCampos(camposDelRegistro(r, hoy, esDni ? pendienteDocumento : null), { enModal: false });
  const problemas = problemasRegistro(r, hoy);
  const marcadores = marcadoresDePagina(pagina);

  function pedirNombre(numero: string) {
    numeroActual.current = numero;
    if (numero.length !== 8) {
      setConsulta({ estado: "nada" });
      return;
    }
    setConsulta({ estado: "buscando", numero });
    consultarNombre(ubicacionId, numero).then(
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
   * no llegó, la guía ya dice qué falta (sin rojo: lo que falta es un camino, no un error).
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
      if (res.estado === "listo") setListo(res);
      else if (res.estado === "textos_cambiaron") {
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

  if (listo) return <Bienvenida listo={listo} pagina={pagina} />;

  const ir = (cual: "privacidad" | "terminos") => enlaceLegal(cual, ubicacionId);
  const textoPublicidad = completarMarcadores(pagina.textos.casillaPublicidad.texto, marcadores);

  return (
    <HojaClub>
      <p className="label-cayla mt-8 text-[11px] text-taupe-profundo">Club CAYLA · {pagina.tienda}</p>
      <h1 className="font-display mt-2 text-[36px] leading-none tracking-tight text-tinta">{TITULO_CLUB}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-tinta/75">{BAJADA_CLUB}</p>

      <section aria-labelledby="club-que-recibes" className="mt-6 rounded-2xl border border-sand bg-papel p-4 sm:p-5">
        <h2 id="club-que-recibes" className="label-cayla text-[11px] text-taupe-profundo">
          Qué recibes
        </h2>
        <ul className="mt-3 space-y-3 text-[14px] leading-snug text-tinta/80">
          {beneficiosDelClub(pagina).map((b) => (
            <li key={b.fuerte} className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-taupe" />
              <span>
                <b className="font-semibold text-tinta">{b.fuerte}</b> {b.resto}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] leading-snug text-tinta/60">
          {NOTA_CONDICIONES.antes}
          <EnlaceLegal href={ir("terminos")}>{NOTA_CONDICIONES.enlace}</EnlaceLegal>
          {NOTA_CONDICIONES.despues}
        </p>
      </section>

      <form onSubmit={unirme} noValidate className="mt-8 space-y-6">
        <CampoGuiado id="documento" guia={guia} titulo={esDni ? "DNI" : "Documento"} ayuda="DNI por defecto">
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <CampoSelect etiqueta="Tipo de documento" caja valor={r.documentoTipo} onValor={cambiarTipo} opciones={OPCIONES_TIPO} deshabilitado={enviando} />
            <CampoTexto
              id={ID.numero}
              etiqueta="Número de documento"
              caja
              mono
              inputMode={esDni ? "numeric" : "text"}
              autoCapitalize={esDni ? undefined : "characters"}
              maxLength={largoMaximoDocumento(r.documentoTipo)}
              placeholder={esDni ? "8 dígitos" : "Como figura en tu documento"}
              value={r.documentoNumero}
              disabled={enviando}
              onChange={(e) => cambiarNumero(e.target.value)}
              onBlur={() => marcarSalida("documento")}
              pie={esDni && r.documentoNumero.length === 8 ? null : problemaVisible("documento", r.documentoNumero)}
              tono="error"
            />
          </div>
          <Ayuda>{AYUDA.documento}</Ayuda>
          {esDni && <ConfirmarDni consulta={consulta} numero={r.documentoNumero} onSi={confirmarDni} onCorregir={corregirDni} />}
        </CampoGuiado>

        {!esDni && (
          <CampoGuiado id="nombre" guia={guia} titulo="Nombres y apellidos">
            <CampoTexto
              id={ID.nombre}
              etiqueta="Nombres y apellidos"
              caja
              autoComplete="name"
              value={r.nombre}
              disabled={enviando}
              onChange={(e) => setR((x) => ({ ...x, nombre: e.target.value }))}
              onBlur={() => marcarSalida("nombre")}
              pie={problemaVisible("nombre", r.nombre)}
              tono="error"
            />
          </CampoGuiado>
        )}

        <CampoGuiado id="celular" guia={guia} titulo="Celular con WhatsApp">
          <CampoTexto
            id={ID.celular}
            etiqueta="Celular con WhatsApp"
            caja
            mono
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="9xx xxx xxx" // sugerir-fijo: formato del celular peruano; es el mismo para cualquier clienta
            value={celularLegible(r.celular)}
            disabled={enviando}
            onChange={(e) => setR((x) => ({ ...x, celular: ajustarCelular(e.target.value) }))}
            onBlur={() => marcarSalida("celular")}
            pie={problemaVisible("celular", r.celular)}
            tono="error"
          />
          <Ayuda>{AYUDA.celular}</Ayuda>
        </CampoGuiado>

        <CampoGuiado id="nacimiento" guia={guia} titulo="Fecha de nacimiento">
          <div className="grid grid-cols-3 gap-3">
            <CampoTexto
              id={ID.dia}
              etiqueta="Día de nacimiento"
              caja
              mono
              inputMode="numeric"
              autoComplete="bday-day"
              maxLength={2}
              placeholder="Día" // sugerir-fijo: nombre de la caja (el día en que nació); no depende de nada elegido antes
              value={r.nacimiento.dia}
              disabled={enviando}
              onChange={(e) => setR((x) => ({ ...x, nacimiento: { ...x.nacimiento, dia: ajustarDia(e.target.value) } }))}
            />
            <CampoSelect
              etiqueta="Mes de nacimiento"
              caja
              valor={r.nacimiento.mes}
              onValor={(mes) => setR((x) => ({ ...x, nacimiento: { ...x.nacimiento, mes } }))}
              opciones={OPCIONES_MES_CUMPLE}
              marcador="Mes"
              deshabilitado={enviando}
            />
            <CampoTexto
              id={ID.anio}
              etiqueta="Año de nacimiento"
              caja
              mono
              inputMode="numeric"
              autoComplete="bday-year"
              maxLength={4}
              placeholder="Año" // sugerir-fijo: nombre de la caja (el año en que nació); no depende de nada elegido antes
              value={r.nacimiento.anio}
              disabled={enviando}
              onChange={(e) => setR((x) => ({ ...x, nacimiento: { ...x.nacimiento, anio: ajustarAnio(e.target.value) } }))}
              onBlur={() => marcarSalida("nacimiento")}
            />
          </div>
          {r.nacimiento.anio.length === 4 && problemas.nacimiento ? (
            <p className="anim-revelar mt-1 text-xs text-rojo-profundo">{problemas.nacimiento}</p>
          ) : (
            <Ayuda>{AYUDA.nacimiento}</Ayuda>
          )}
        </CampoGuiado>

        <CampoGuiado id="correo" guia={guia} titulo="Correo electrónico" ayuda="Opcional">
          <CampoTexto
            id={ID.correo}
            etiqueta="Correo electrónico (opcional)"
            caja
            type="email"
            inputMode="email"
            autoComplete="email"
            value={r.correo}
            disabled={enviando}
            onChange={(e) => setR((x) => ({ ...x, correo: e.target.value }))}
            onBlur={() => marcarSalida("correo")}
            pie={problemaVisible("correo", r.correo)}
            tono="error"
          />
          <Ayuda>{AYUDA.correo}</Ayuda>
        </CampoGuiado>

        <div className="space-y-3">
          {aviso && (
            <p role="status" className="anim-revelar rounded-xl bg-hueso px-3.5 py-3 text-sm leading-snug text-tinta/80">
              {aviso}
            </p>
          )}
          <CampoGuiado id="mayor" guia={guia}>
            <FilaCasilla marcada={r.mayorDeEdad} onCambio={() => setR((x) => ({ ...x, mayorDeEdad: !x.mayorDeEdad }))} etiqueta={CASILLA_MAYOR} deshabilitada={enviando}>
              {CASILLA_MAYOR}
            </FilaCasilla>
          </CampoGuiado>
          <CampoGuiado id="terminos" guia={guia}>
            <FilaCasilla
              marcada={r.aceptaTerminos}
              onCambio={() => setR((x) => ({ ...x, aceptaTerminos: !x.aceptaTerminos }))}
              etiqueta="Acepto la Política de privacidad y los Términos del Club CAYLA"
              deshabilitada={enviando}
            >
              {casillaTerminos(EMISOR.razonSocial).map((t, i) =>
                typeof t === "string" ? (
                  <span key={i}>{t}</span>
                ) : (
                  <EnlaceLegal key={i} href={ir(t.enlace)}>
                    {t.texto}
                  </EnlaceLegal>
                ),
              )}
            </FilaCasilla>
          </CampoGuiado>
          <CampoGuiado id="publicidad" guia={guia}>
            <FilaCasilla
              marcada={r.aceptaPublicidad}
              onCambio={() => setR((x) => ({ ...x, aceptaPublicidad: !x.aceptaPublicidad }))}
              etiqueta={textoPublicidad}
              deshabilitada={enviando}
            >
              {textoPublicidad}
            </FilaCasilla>
            <p className="mt-1.5 pl-[30px] text-xs text-tinta/60">Opcional. Sin esta casilla eres socia igual, con tus beneficios en tienda y sin mensajes.</p>
          </CampoGuiado>
        </div>

        <div className="space-y-3">
          <PieGuia guia={guia} listo="Todo listo para unirte." />
          <Boton
            type="submit"
            peso="primario"
            cargando={enviando}
            disabled={!guia.puedeConfirmar}
            title={guia.frase ?? undefined}
            className={`h-12 w-full ${guia.claseConfirmar}`}
          >
            {enviando ? "Uniéndote…" : BOTON_UNIRME}
          </Boton>
          {error && (
            <p role="alert" className="anim-revelar text-center text-[13px] leading-snug text-rojo-profundo">
              {error}
            </p>
          )}
          <p className="text-[11.5px] leading-relaxed text-tinta/60">{letraChica(EMISOR)}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            <EnlaceLegal href={ir("privacidad")}>Política de privacidad</EnlaceLegal>
            <EnlaceLegal href={ir("terminos")}>Términos del Club CAYLA</EnlaceLegal>
          </p>
        </div>
      </form>
    </HojaClub>
  );
}

function Ayuda({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-snug text-tinta/60">{children}</p>;
}

/** La política y los términos se abren en otra pestaña: el formulario a medio llenar no se pierde. */
function EnlaceLegal({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="font-medium text-tinta underline underline-offset-2 hover:text-rojo-profundo">
      {children}
    </a>
  );
}

/** Una casilla de verdad (teclado y lector de pantalla); todo el texto la marca. Nace SIEMPRE sin marcar. */
function FilaCasilla({
  marcada,
  onCambio,
  etiqueta,
  deshabilitada,
  children,
}: {
  marcada: boolean;
  onCambio: () => void;
  etiqueta: string;
  deshabilitada: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border border-sand bg-papel px-3.5 py-3 text-[14px] leading-snug text-tinta ${deshabilitada ? "opacity-60" : "cursor-pointer"}`}>
      <Casilla marcada={marcada} onCambio={() => !deshabilitada && onCambio()} etiqueta={etiqueta} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

/** «¿Eres Lucía P. S.?» bajo el DNI: buscando, la pregunta con «Sí, soy yo» / «No, corregir», confirmado, o por qué no se pudo. */
function ConfirmarDni({ consulta, numero, onSi, onCorregir }: { consulta: Consulta; numero: string; onSi: () => void; onCorregir: () => void }) {
  if (consulta.estado === "nada" || consulta.numero !== numero) return null;
  if (consulta.estado === "buscando") {
    return (
      <p role="status" className="mt-2 text-[13px] text-tinta/65">
        Buscando tu DNI…
      </p>
    );
  }
  if (consulta.estado === "fallo") {
    return (
      <p role="alert" className="anim-revelar mt-2 text-[13px] leading-snug text-rojo-profundo">
        {consulta.mensaje}
      </p>
    );
  }
  if (consulta.estado === "confirmado") {
    return (
      <p role="status" className="anim-revelar mt-2 flex flex-wrap items-center gap-x-2 text-[13.5px] text-verde">
        <Check aria-hidden className="h-4 w-4" />
        <span>
          Eres <b className="font-semibold">{consulta.aMedias}</b>
        </span>
        <button type="button" onClick={onCorregir} className="text-[12.5px] text-tinta/65 underline underline-offset-2 hover:text-rojo-profundo">
          No soy yo
        </button>
      </p>
    );
  }
  return (
    <div role="status" className="anim-revelar mt-3 rounded-xl border border-sand bg-papel px-3.5 py-3">
      <p className="text-[15px] text-tinta">
        ¿Eres <b className="font-semibold">{consulta.aMedias}</b>?
      </p>
      <p className="mt-1 text-xs leading-snug text-tinta/60">{AYUDA.padron}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onSi} className="btn-cayla btn-primario btn-chico">
          Sí, soy yo
        </button>
        <button type="button" onClick={onCorregir} className="btn-cayla btn-secundario btn-chico">
          No, corregir
        </button>
      </div>
    </div>
  );
}

/** Después de «Unirme»: su bienvenida (o «Actualizamos tus datos»), su código y, si marcó WhatsApp, el saludo a la tienda. */
function Bienvenida({ listo, pagina }: { listo: Listo; pagina: PaginaClub }) {
  const b = bienvenida(listo, pagina);
  return (
    <HojaClub>
      <div aria-live="polite" className="anim-revelar mt-10">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-verde/15 text-verde">
          {/* El visto se dibuja una vez al llegar (respuesta a su «Unirme», ADR-0136); quieto con movimiento reducido. */}
          <Check aria-hidden className="check-trazo h-6 w-6" style={{ "--d": "120ms" } as CSSProperties} />
        </span>
        <h1 className="font-display mt-4 text-[32px] leading-tight text-tinta">{b.titulo}</h1>
        {b.parrafos.map((p, i) => (
          <p key={i} className="mt-3 text-[15px] leading-relaxed text-tinta/75">
            <Trozos trozos={p} />
          </p>
        ))}
        {b.saludo && (
          <section className="mt-6 rounded-2xl border border-sand bg-papel p-4 sm:p-5">
            <p className="text-[15px] font-semibold text-tinta">{b.saludo.titulo}</p>
            <p className="mt-1 text-[14px] leading-snug text-tinta/75">{b.saludo.parrafo}</p>
            <a href={b.saludo.enlace} target="_blank" rel="noopener noreferrer" className="btn-cayla btn-primario mt-4 flex h-12 w-full">
              {b.saludo.boton}
            </a>
          </section>
        )}
      </div>
    </HojaClub>
  );
}
