"use client";

import Link from "next/link";
import { Camera, Check, ChevronRight, CirclePlay, Lock, LogOut, Mail, MapPin, Phone, ShieldCheck, SlidersHorizontal, User, Users, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { BUCKET_FOTOS_PERFIL } from "@/lib/foto-perfil";
import { recordarFotoPersona } from "@/lib/useFotoPersona";
import { diaLima, hoyLima } from "@/lib/fechas-lima";
import { avisar } from "@/components/ui/Avisos";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useCerrarSesion } from "@/components/LogoutButton";

// "Mi perfil" (0014_perfil.sql, 2026-09-14): casi todo acá es de solo lectura
// a propósito — nombres/apellidos/correo/rol/estado/ubicación son de Dynamic
// (o de auth.users), y editarlos desde retail sería la doble fuente de verdad
// que la integración con Dynamic eliminó. Lo único que se escribe es la foto
// (vía la función real de Dynamic, fn_actualizar_foto_perfil) y la contraseña
// (vía Supabase Auth directo) — ninguna de las dos toca una tabla de retail.
//
// La cara (Felipe 2026-10-31, «A · Cristal líquido» de docs/maquetas/mi-perfil-2026-10/): una hoja de vidrio que deja ver la
// pantalla de atrás, con su filo de luz y su brillo que siguen al mouse, la foto en una lente, y «Tú · Cuenta · Seguridad» con
// una gota que fluye de pestaña en pestaña. Lo que hace el modal no cambió. Desde aquí también se cierra sesión (un ícono sutil).
// Movimiento: excepción de ADR-0136 (act. 2026-10-31); estilos en app/estilos/perfil-vidrio.css.

type MiPerfil = {
  persona_id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  celular: string | null;
  /** La RUTA en el bucket `fotos-perfil` de Dynamic (`perfil/<persona>/<archivo>.jpg`), no una URL (lib/foto-perfil.ts). */
  foto_url: string | null;
  rol: "lider" | "integrante";
  estado: string;
  ubicacion_nombre: string | null;
  ultimo_acceso: string | null;
};

type Pestana = "tu" | "cuenta" | "seguridad";
const PESTANAS: { id: Pestana; texto: string; Icono: LucideIcon }[] = [
  { id: "tu", texto: "Tú", Icono: User },
  { id: "cuenta", texto: "Cuenta", Icono: ShieldCheck },
  { id: "seguridad", texto: "Seguridad", Icono: Lock },
];

const LIMITE_BYTES = 3 * 1024 * 1024; // el límite real del bucket fotos-perfil de Dynamic, no uno inventado acá
const ZONA = "America/Lima";

// «Hoy, 9:42 a. m.» / «Ayer, 6:10 p. m.» / «28/10/2026, 9:42 a. m.»: el día se compara en Lima, no en el reloj del aparato.
function formatoAcceso(iso: string) {
  const fecha = new Date(iso);
  const hora = new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }).format(fecha);
  const dia = diaLima(iso);
  const hoy = new Date();
  if (dia === hoyLima(hoy)) return `Hoy, ${hora}`;
  if (dia === hoyLima(new Date(hoy.getTime() - 86_400_000))) return `Ayer, ${hora}`;
  return `${new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha)}, ${hora}`;
}

const sinMovimiento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function Fila({ Icono, etiqueta, valor, copiar }: { Icono: LucideIcon; etiqueta: string; valor: string; copiar?: string }) {
  return (
    <div className="vidrio-fila">
      <span aria-hidden className="vidrio-fila-icono">
        <Icono className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="label-cayla text-[10px] text-tinta/65">{etiqueta}</p>
        <p className="truncate text-sm text-tinta">{valor}</p>
      </div>
      {copiar && <BotonCopiar forma="icono" texto={valor} que={copiar} />}
    </div>
  );
}

function Destino({ Icono, titulo, frase, href, onClick }: { Icono: LucideIcon; titulo: string; frase: string; href?: string; onClick: () => void }) {
  const dentro = (
    <>
      <span aria-hidden className="vidrio-fila-icono">
        <Icono className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-tinta">{titulo}</span>
        <span className="mt-0.5 block text-xs text-tinta/65">{frase}</span>
      </span>
      <ChevronRight aria-hidden className="vidrio-flecha h-4 w-4 shrink-0 text-tinta/55" />
    </>
  );
  return href ? (
    <Link href={href} onClick={onClick} className="vidrio-fila vidrio-fila-viva">
      {dentro}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className="vidrio-fila vidrio-fila-viva w-full text-left">
      {dentro}
    </button>
  );
}

export function PerfilModal({ onClose, veAdministracion = false, veConfiguracion = false, onDemo }: {
  onClose: () => void;
  /** Abre «Demo» (ADR-0389): elegir qué módulo o submódulo volver a ver con su guía interactiva. */
  onDemo?: () => void;
  /** ¿Su rol ve Colaboradores o Roles y accesos? (20260923131000: ya no son solo del líder). El líder, siempre. */
  veAdministracion?: boolean;
  /** ¿Ve el módulo Configuración? (ADR-0253: ya se da a un rol; al líder se le puede quitar). */
  veConfiguracion?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [perfil, setPerfil] = useState<MiPerfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("tu");
  // Cerrar sesión desde aquí (Felipe 2026-10-31): la misma salida que «Salir» del lateral, con el colibrí; el perfil se cierra antes.
  const salida = useCerrarSesion({ nombre: perfil ? `${perfil.nombres} ${perfil.apellidos}` : "", terminal: false });

  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_mi_perfil")
      .maybeSingle()
      .then(({ data, error: errCarga }) => {
        if (!vigente) return;
        if (errCarga) avisar.error(traducirError(errCarga, "cargar tu perfil", { lectura: true }));
        else if (data) {
          const miPerfil = data as MiPerfil;
          setPerfil(miPerfil);
          // Ya vino la foto: el avatar de acá y el del lateral no tienen que volver a preguntarla.
          recordarFotoPersona(miPerfil.persona_id, miPerfil.foto_url);
        }
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  // Mientras una foto está en vuelo, cerrar (Cancelar, Escape, clic afuera —
  // los tres pasan por este mismo callback) se avisa en vez de cortar la
  // subida a medias.
  function alCerrar() {
    if (subiendo) {
      avisar.aviso("Espera a que termine de subirse la foto antes de cerrar.");
      return;
    }
    onClose();
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hay que reintentar
    if (!archivo || !perfil) return;

    if (archivo.type !== "image/jpeg") {
      avisar.error("La foto debe ser JPEG (.jpg) — es el único formato que acepta el sistema hoy.");
      return;
    }
    if (archivo.size > LIMITE_BYTES) {
      avisar.error("La foto pesa más de 3 MB — usa una más liviana.");
      return;
    }

    setSubiendo(true);
    const supabase = createClient();
    // Mismo objetivo que el precedente histórico de fotos de producto:
    // nombre nuevo por subida para que el navegador no siga mostrando la
    // foto vieja desde su caché — random en vez de Date.now() porque
    // react-hooks/purity marca Date.now() como impuro dentro de un
    // componente, aunque esté en un manejador de evento, no en el render.
    const ruta = `perfil/${perfil.persona_id}/${crypto.randomUUID()}.jpg`;

    const { error: errSubida } = await supabase.storage.from(BUCKET_FOTOS_PERFIL).upload(ruta, archivo, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
    });
    if (errSubida) {
      avisar.error(traducirError(errSubida, "subir la foto"));
      setSubiendo(false);
      return;
    }

    // Se guarda la RUTA, como la guarda Dynamic: su función rechaza lo que no empiece por `perfil/`, así que mandarle
    // la URL pública (como se hacía hasta el 2026-09-25) subía el archivo y después fallaba al guardarlo.
    await guardarFoto(ruta);
  }

  async function onEliminarFoto() {
    setSubiendo(true);
    await guardarFoto(null);
  }

  async function guardarFoto(ruta: string | null) {
    const supabase = createClient();
    // gen-types no modela que un parámetro `text` sin default acepte NULL en
    // tiempo de ejecución (sí lo acepta) — el cast es solo para el tipo, el
    // valor real que viaja es `ruta` tal cual, null incluido.
    const { error: errGuardar } = await supabase.rpc("actualizar_mi_foto_perfil", { p_foto_url: ruta as string });
    setSubiendo(false);
    if (errGuardar) {
      avisar.error(traducirError(errGuardar, "guardar la foto en tu perfil"));
      return;
    }
    avisar.exito(ruta ? "Foto de perfil actualizada" : "Foto de perfil quitada");
    setPerfil((p) => (p ? { ...p, foto_url: ruta } : p));
    if (perfil) recordarFotoPersona(perfil.persona_id, ruta); // el lateral la cambia en el acto, sin recargar
  }

  return (
    <>
      <Modal variante="vidrio" conCerrar titulo="Mi perfil" subtitulo="Tu información personal y de cuenta." onClose={alCerrar} tamano="mediana">
        {(cerrar) => {
          void cerrar; // el cierre animado de Modal no distingue "en vuelo" — se controla acá, con alCerrar
          if (cargando) return <p className="py-8 text-center text-sm text-tinta/65">Cargando…</p>;
          if (!perfil)
            return (
              <Aviso tono="error" className="mt-5">
                No se pudo cargar tu perfil.
              </Aviso>
            );

          const nombreCompleto = `${perfil.nombres} ${perfil.apellidos}`;
          const esLider = perfil.rol === "lider";
          const activo = perfil.estado === "activo";

          return (
            <>
              <LuzDelVidrio />
              {/* Cerrar sesión: un ícono sutil junto a la ×. Pasa por la misma salida que «Salir» del lateral (pregunta si hay
                  trabajo sin subir) y cierra el perfil antes, para que el colibrí no vuele bajo la hoja. */}
              <button
                type="button"
                data-sin-cascada
                onClick={() => salida.pedir(onClose)}
                disabled={subiendo}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="vidrio-salir"
              >
                <LogOut aria-hidden className="h-4 w-4" />
              </button>

              <header className="vidrio-cabecera">
                <input ref={inputRef} type="file" accept="image/jpeg" onChange={onArchivo} className="hidden" />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={subiendo}
                  aria-label={perfil.foto_url ? "Cambiar foto" : "Subir foto"}
                  title="JPEG, hasta 3 MB"
                  className={`vidrio-lente ${subiendo ? "vidrio-lente-subiendo" : ""}`}
                >
                  <AvatarPersona personaId={perfil.persona_id} nombre={nombreCompleto} tamano={80} />
                  <span aria-hidden className="vidrio-lente-camara">
                    <Camera className="h-5 w-5" />
                  </span>
                </button>
                <div className="min-w-0">
                  <p className="label-cayla text-[11px] text-tinta/65">Mi perfil</p>
                  <p className="vidrio-nombre">
                    {/* Una palabra por ranura; el espacio va AFUERA de cada una (dentro de un inline-block se pierde). */}
                    {nombreCompleto.split(" ").map((palabra, i) => (
                      <Fragment key={i}>
                        {i > 0 && " "}
                        <span style={{ "--i": i } as React.CSSProperties}>{palabra}</span>
                      </Fragment>
                    ))}
                  </p>
                  <div className="vidrio-chips">
                    <Chip tono="tinta" versalitas={false}>{esLider ? "Líder" : "Colaborador"}</Chip>
                    <Chip tono={activo ? "verde" : "apagado"}>{activo ? "Activo" : "Inactivo"}</Chip>
                    {perfil.ubicacion_nombre && (
                      <span className="inline-flex items-center gap-1 text-[12.5px] text-tinta/80">
                        <MapPin aria-hidden className="h-3.5 w-3.5" />
                        {perfil.ubicacion_nombre}
                      </span>
                    )}
                  </div>
                  <div className="vidrio-foto">
                    <Boton type="button" cargando={subiendo} textoCargando="Subiendo…" onClick={() => inputRef.current?.click()} className="btn-chico">
                      {perfil.foto_url ? "Cambiar foto" : "Subir foto"}
                    </Boton>
                    {perfil.foto_url && (
                      <button type="button" onClick={onEliminarFoto} disabled={subiendo} className="btn-cayla btn-peligro btn-chico">
                        Quitar foto
                      </button>
                    )}
                    <span className="text-xs text-tinta/60">JPEG, hasta 3 MB</span>
                  </div>
                </div>
              </header>

              <PestanasDeVidrio actual={pestana} onCambiar={setPestana} />

              <PanelDeVidrio pestana={pestana}>
                {pestana === "tu" && (
                  <div className="grid gap-2">
                    <Fila Icono={User} etiqueta="Nombres" valor={perfil.nombres} />
                    <Fila Icono={User} etiqueta="Apellidos" valor={perfil.apellidos} />
                    <Fila Icono={Mail} etiqueta="Correo" valor={perfil.correo} copiar="el correo" />
                    <Fila Icono={Phone} etiqueta="Teléfono" valor={perfil.celular ?? "Sin registrar"} copiar={perfil.celular ? "el teléfono" : undefined} />
                    <p className="nota-cayla vidrio-nota">Estos datos vienen de Dynamic. Para corregirlos, pídeselo a Desarrollo Organizacional.</p>
                  </div>
                )}

                {pestana === "cuenta" && (
                  <div>
                    <div className="grid grid-cols-2 gap-2">
                      <Dato etiqueta="Rol" valor={esLider ? "Líder" : "Colaborador"} />
                      <Dato etiqueta="Estado" valor={activo ? "Activo" : "Inactivo"} tono={activo ? "verde" : undefined} />
                      <Dato etiqueta="Sede" valor={perfil.ubicacion_nombre ?? "Sin asignar"} />
                      <Dato etiqueta="Último acceso" valor={perfil.ultimo_acceso ? formatoAcceso(perfil.ultimo_acceso) : "Sin registrar"} />
                    </div>
                    {/* Quién puede entrar a retail: el líder, o quien ve Colaboradores o Roles y accesos. La pantalla y cada RPC lo
                        vuelven a exigir; esto solo decide si se ofrece la puerta. */}
                    {(esLider || veAdministracion || veConfiguracion) && (
                      <>
                        <p className="label-cayla mb-2 ml-1 mt-5 text-[10px] text-tinta/65">Administración</p>
                        <div className="grid gap-2">
                          {(esLider || veAdministracion) && (
                            <Destino Icono={Users} titulo="Colaboradores" frase="A quién de Dynamic se le abre la puerta de retail." href="/colaboradores" onClick={onClose} />
                          )}
                          {/* Configuración (ADR-0195 F1): se ofrece a quien ve el módulo (ADR-0253: ya no es solo del líder). */}
                          {veConfiguracion && (
                            <Destino Icono={SlidersHorizontal} titulo="Configuración" frase="Meta de cada día, fondo de caja y lo que cambia cada campaña." href="/configuracion" onClick={onClose} />
                          )}
                        </div>
                      </>
                    )}
                    {/* Demo (ADR-0389, Felipe 2026-10-07): la guía de cada pantalla se ofrece una sola vez; aquí se repite la que quieras. */}
                    {onDemo && (
                      <>
                        <p className="label-cayla mb-2 ml-1 mt-5 text-[10px] text-tinta/65">Aprender</p>
                        <Destino Icono={CirclePlay} titulo="Demo" frase="Elige un módulo y te mostramos, paso a paso, qué hace cada cosa." onClick={onDemo} />
                      </>
                    )}
                  </div>
                )}

                {pestana === "seguridad" && (
                  <div>
                    <div className="mb-4 flex items-center gap-3 text-[13px] text-tinta/80">
                      <span aria-hidden className="vidrio-escudo">
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      Cámbiala cuando quieras. Nadie más la ve, ni el líder.
                    </div>
                    <CambiarClave onCancelar={() => setPestana("tu")} />
                  </div>
                )}
              </PanelDeVidrio>
            </>
          );
        }}
      </Modal>
      {salida.dialogo}
    </>
  );
}

function Dato({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: "verde" }) {
  return (
    <div className="vidrio-fila vidrio-fila-dato">
      <p className="label-cayla text-[10px] text-tinta/65">{etiqueta}</p>
      <p className={`vidrio-dato ${tono === "verde" ? "text-verde" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}

// El filo de luz y el brillo: siguen al mouse por toda la hoja (nunca se mueven solos). Con «reducir movimiento», quietos.
function LuzDelVidrio() {
  const ancla = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const hoja = ancla.current?.closest<HTMLElement>(".hoja-vidrio");
    if (!hoja || sinMovimiento() || !window.matchMedia?.("(hover: hover)").matches) return;
    const mover = (e: PointerEvent) => {
      const r = hoja.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      hoja.style.setProperty("--vidrio-x", `${x * 100}%`);
      hoja.style.setProperty("--vidrio-y", `${y * 100}%`);
      hoja.style.setProperty("--vidrio-angulo", `${(Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 30}deg`);
    };
    hoja.addEventListener("pointermove", mover);
    return () => hoja.removeEventListener("pointermove", mover);
  }, []);
  return (
    <>
      <span ref={ancla} aria-hidden data-sin-cascada className="vidrio-brillo" />
      <span aria-hidden data-sin-cascada className="vidrio-filo" />
    </>
  );
}

// «Tú · Cuenta · Seguridad» con la gota de vidrio que fluye: se estira hasta tocar la pestaña nueva y recién ahí suelta la vieja
// (sin rebote: nunca pasa de su lugar). Elegida por Felipe mirando la maqueta; por eso no es `<Pestanas>`.
function PestanasDeVidrio({ actual, onCambiar }: { actual: Pestana; onCambiar: (p: Pestana) => void }) {
  const pista = useRef<HTMLDivElement>(null);
  const gota = useRef<HTMLSpanElement>(null);
  const anterior = useRef<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const p = pista.current;
    const g = gota.current;
    if (!p || !g) return;
    const ubicar = (animar: boolean) => {
      const b = p.querySelector<HTMLElement>(`[data-pestana="${actual}"]`);
      if (!b) return;
      const hacia = { left: b.offsetLeft, width: b.offsetWidth };
      const desde = anterior.current;
      g.style.left = `${hacia.left}px`;
      g.style.width = `${hacia.width}px`;
      anterior.current = hacia;
      if (!animar || !desde || !desde.width || sinMovimiento() || (desde.left === hacia.left && desde.width === hacia.width)) return;
      const izq = Math.min(desde.left, hacia.left);
      const der = Math.max(desde.left + desde.width, hacia.left + hacia.width);
      g.animate(
        [
          { left: `${desde.left}px`, width: `${desde.width}px`, transform: "scaleY(1)" },
          { left: `${izq}px`, width: `${der - izq}px`, transform: "scaleY(0.86)", offset: 0.45 },
          { left: `${hacia.left}px`, width: `${hacia.width}px`, transform: "scaleY(1)" },
        ],
        { duration: 520, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)" }
      );
    };
    ubicar(true);
    // Cambia de ancho (las letras llegan tarde, el celular gira): la gota se reubica sin animar.
    const vigia = new ResizeObserver(() => ubicar(false));
    vigia.observe(p);
    return () => vigia.disconnect();
  }, [actual]);

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = PESTANAS.findIndex((p) => p.id === actual);
    const siguiente = PESTANAS[(i + (e.key === "ArrowRight" ? 1 : PESTANAS.length - 1)) % PESTANAS.length];
    onCambiar(siguiente.id);
    pista.current?.querySelector<HTMLElement>(`[data-pestana="${siguiente.id}"]`)?.focus();
  }

  return (
    <div
      ref={pista}
      className="vidrio-pestanas"
      role="tablist" // unificar-fijo: la gota de vidrio de Mi perfil, elegida por Felipe el 2026-10-31 (maqueta mi-perfil-2026-10)
      aria-label="Secciones de tu perfil"
      onKeyDown={alTeclear}
    >
      <span ref={gota} aria-hidden className="vidrio-gota" />
      {PESTANAS.map(({ id, texto, Icono }) => (
        <button
          key={id}
          type="button"
          data-pestana={id}
          role="tab" // unificar-fijo: la gota de vidrio de Mi perfil, elegida por Felipe el 2026-10-31 (maqueta mi-perfil-2026-10)
          id={`perfil-pestana-${id}`}
          aria-selected={actual === id}
          aria-controls="perfil-panel"
          tabIndex={actual === id ? 0 : -1}
          onClick={() => onCambiar(id)}
        >
          <Icono aria-hidden className="h-3.5 w-3.5" />
          {texto}
        </button>
      ))}
    </div>
  );
}

// El panel cambia de alto sin saltar y su contenido entra desenfocado y se enfoca (`vidrio-panel-entra`).
function PanelDeVidrio({ pestana, children }: { pestana: Pestana; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const alto = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const nuevo = el.offsetHeight;
    const viejo = alto.current;
    alto.current = nuevo;
    if (viejo === null || viejo === nuevo || sinMovimiento()) return;
    el.animate([{ height: `${viejo}px` }, { height: `${nuevo}px` }], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)" });
  }, [pestana]);
  return (
    <div ref={caja} id="perfil-panel" role="tabpanel" aria-labelledby={`perfil-pestana-${pestana}`} className="vidrio-panel">
      <div key={pestana} className="vidrio-panel-entra">
        {children}
      </div>
    </div>
  );
}

// La fuerza orienta y no bloquea: la regla de verdad sigue siendo «8 caracteres o más y que coincidan».
function fuerzaDe(clave: string): { pct: number; texto: string; tono: "rojo" | "ambar" | "verde" } | null {
  if (!clave) return null;
  if (clave.length < 8) {
    const faltan = 8 - clave.length;
    return { pct: 25, texto: `Muy corta: ${faltan === 1 ? "falta 1 caracter" : `faltan ${faltan} caracteres`}.`, tono: "rojo" };
  }
  const tipos = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(clave)).length;
  if (clave.length >= 12 && tipos >= 3) return { pct: 100, texto: "Fuerte.", tono: "verde" };
  if (tipos >= 2) return { pct: 75, texto: "Buena.", tono: "verde" };
  return { pct: 50, texto: "Suficiente. Con un número quedaría mejor.", tono: "ambar" };
}

// Paso chico, autocontenido: Supabase Auth directo — nunca toca una tabla de
// retail ni de Dynamic. `updateUser` exige que la sesión siga vigente, así
// que no hace falta pedir la contraseña actual aparte.
function CambiarClave({ onCancelar }: { onCancelar: () => void }) {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  // La guía de foco (ADR-0284): sale de la misma validación que bloquea el guardado, sin reglas nuevas.
  const nuevaLista = nueva.length >= 8;
  const coinciden = nuevaLista && confirmar === nueva;
  const guia = useGuiaCampos([
    { id: "clave-nueva", nombre: "Contraseña nueva", requerido: true, hecho: nuevaLista, pendiente: "Escribe al menos 8 caracteres." },
    { id: "clave-confirmar", nombre: "Confírmala", requerido: true, hecho: coinciden, pendiente: "Escríbela otra vez, igual." },
  ]);
  const fuerza = fuerzaDe(nueva);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (nueva.length < 8) {
      avisar.error("La contraseña debe tener al menos 8 caracteres.", { enfocar: "clave-nueva" });
      return;
    }
    if (nueva !== confirmar) {
      avisar.error("Las dos contraseñas no coinciden.", { enfocar: "clave-confirmar" });
      return;
    }
    setGuardando(true);
    const { error: errClave } = await createClient().auth.updateUser({ password: nueva });
    setGuardando(false);
    if (errClave) {
      avisar.error(traducirError(errClave, "cambiar tu contraseña"));
      return;
    }
    avisar.exito("Contraseña actualizada");
    setExito(true);
  }

  if (exito)
    return (
      <p className="vidrio-listo">
        <Check aria-hidden className="h-5 w-5" />
        Contraseña actualizada. La usas desde tu próxima entrada.
      </p>
    );

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <CampoGuiado id="clave-nueva" guia={guia}>
        <CampoTexto
          id="clave-nueva"
          etiqueta={guia.etiqueta("clave-nueva", "Contraseña nueva")}
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          valido={nuevaLista}
          sinPie
        />
        <div className="mt-2">
          <BarraAvance pct={fuerza?.pct ?? 0} tono={fuerza?.tono ?? "tinta"} alto="fina" etiqueta="Qué tan fuerte es" decorativa />
          <p className="mt-1.5 min-h-[18px] text-xs text-tinta/65" aria-live="polite">
            {fuerza?.texto ?? "Al menos 8 caracteres."}
          </p>
        </div>
      </CampoGuiado>
      <CampoGuiado id="clave-confirmar" guia={guia}>
        <CampoTexto
          id="clave-confirmar"
          etiqueta={guia.etiqueta("clave-confirmar", "Confírmala")}
          type="password"
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          valido={coinciden}
          pie={confirmar && nuevaLista && !coinciden ? "Todavía no coinciden." : undefined}
        />
      </CampoGuiado>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PieGuia guia={guia} listo="Todo listo para guardar." />
        <div className="ml-auto pie-acciones">
          <Boton type="button" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton peso="primario" cargando={guardando} type="submit" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
            Guardar contraseña
          </Boton>
        </div>
      </div>
    </form>
  );
}
