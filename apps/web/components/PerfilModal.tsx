"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";

// "Mi perfil" (0014_perfil.sql, 2026-09-14): casi todo acá es de solo lectura
// a propósito — nombres/apellidos/correo/rol/estado/ubicación son de Dynamic
// (o de auth.users), y editarlos desde retail sería la doble fuente de verdad
// que la integración con Dynamic eliminó. Lo único que se escribe es la foto
// (vía la función real de Dynamic, fn_actualizar_foto_perfil) y la contraseña
// (vía Supabase Auth directo) — ninguna de las dos toca una tabla de retail.

type MiPerfil = {
  persona_id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  celular: string | null;
  foto_url: string | null;
  rol: "lider" | "integrante";
  estado: string;
  ubicacion_nombre: string | null;
  ultimo_acceso: string | null;
};

const LIMITE_BYTES = 3 * 1024 * 1024; // el límite real del bucket fotos-perfil de Dynamic, no uno inventado acá

function iniciales(nombreCompleto: string) {
  return (
    nombreCompleto
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join("")
      .toUpperCase() || "·"
  );
}

function formatoFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-tinta">{valor}</p>
    </div>
  );
}

export function PerfilModal({ onClose, veAdministracion = false }: {
  onClose: () => void;
  /** ¿Su rol ve Colaboradores o Roles y accesos? (20260923111000: ya no son solo del líder). El líder, siempre. */
  veAdministracion?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [perfil, setPerfil] = useState<MiPerfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [claveAbierta, setClaveAbierta] = useState(false);

  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_mi_perfil")
      .maybeSingle()
      .then(({ data, error: errCarga }) => {
        if (!vigente) return;
        if (errCarga) avisar.error(traducirError(errCarga, "cargar tu perfil"));
        else setPerfil(data as MiPerfil);
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

    const { error: errSubida } = await supabase.storage.from("fotos-perfil").upload(ruta, archivo, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
    });
    if (errSubida) {
      avisar.error(traducirError(errSubida, "subir la foto"));
      setSubiendo(false);
      return;
    }

    const { data: publica } = supabase.storage.from("fotos-perfil").getPublicUrl(ruta);
    await guardarFoto(publica.publicUrl);
  }

  async function onEliminarFoto() {
    setSubiendo(true);
    await guardarFoto(null);
  }

  async function guardarFoto(url: string | null) {
    const supabase = createClient();
    // gen-types no modela que un parámetro `text` sin default acepte NULL en
    // tiempo de ejecución (sí lo acepta) — el cast es solo para el tipo, el
    // valor real que viaja es `url` tal cual, null incluido.
    const { error: errGuardar } = await supabase.rpc("actualizar_mi_foto_perfil", { p_foto_url: url as string });
    setSubiendo(false);
    if (errGuardar) {
      avisar.error(traducirError(errGuardar, "guardar la foto en tu perfil"));
      return;
    }
    avisar.exito(url ? "Foto de perfil actualizada" : "Foto de perfil quitada");
    setPerfil((p) => (p ? { ...p, foto_url: url } : p));
    router.refresh(); // así el avatar del sidebar recoge la foto nueva sin recargar la página
  }

  return (
    <Modal titulo="Mi perfil" subtitulo="Tu información personal y de cuenta." onClose={alCerrar} ancho="max-w-lg">
      {(cerrar) => {
        void cerrar; // el cierre animado de Modal no distingue "en vuelo" — se controla acá, con alCerrar
        if (cargando) return <p className="py-8 text-center text-sm text-tinta/65">Cargando…</p>;
        if (!perfil) return <p className="py-8 text-center text-sm text-rojo">{"No se pudo cargar tu perfil."}</p>;

        const nombreCompleto = `${perfil.nombres} ${perfil.apellidos}`;

        return (
          <div className="mt-5 space-y-6">
            {/* ---------- avatar ---------- */}
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-sand">
                {perfil.foto_url ? (
                  <Image src={perfil.foto_url} alt={nombreCompleto} fill unoptimized className="object-cover" />
                ) : (
                  <span className="font-display flex h-full w-full items-center justify-center text-2xl text-tinta">
                    {iniciales(nombreCompleto)}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <input ref={inputRef} type="file" accept="image/jpeg" onChange={onArchivo} className="hidden" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={subiendo}
                    className={botonCancelar}
                  >
                    {subiendo ? "Subiendo…" : perfil.foto_url ? "Cambiar foto" : "Subir foto"}
                  </button>
                  {perfil.foto_url && (
                    <button type="button" onClick={onEliminarFoto} disabled={subiendo} className={botonCancelar}>
                      Eliminar
                    </button>
                  )}
                </div>
                <p className="text-xs text-tinta/55">JPEG, hasta 3 MB.</p>
              </div>
            </div>


            {/* ---------- información personal (solo lectura) ---------- */}
            <div>
              <p className="label-cayla mb-3 text-[11px] text-tinta/65">Información personal</p>
              <div className="card-cayla grid grid-cols-2 gap-4 p-4">
                <Campo etiqueta="Nombres" valor={perfil.nombres} />
                <Campo etiqueta="Apellidos" valor={perfil.apellidos} />
                <Campo etiqueta="Correo" valor={perfil.correo} />
                <Campo etiqueta="Teléfono" valor={perfil.celular ?? "Sin registrar"} />
              </div>
              <p className="mt-2 text-xs text-tinta/55">
                Estos datos vienen de Dynamic — para corregirlos, pídeselo a Desarrollo Organizacional.
              </p>
            </div>

            {/* ---------- cuenta (solo lectura + cambiar contraseña) ---------- */}
            <div>
              <p className="label-cayla mb-3 text-[11px] text-tinta/65">Cuenta</p>
              <div className="card-cayla grid grid-cols-2 gap-4 p-4">
                <Campo etiqueta="Rol" valor={perfil.rol === "lider" ? "Líder" : "Colaborador"} />
                <Campo etiqueta="Estado" valor={perfil.estado === "activo" ? "Activo" : "Inactivo"} />
                <Campo etiqueta="Ubicación" valor={perfil.ubicacion_nombre ?? "Sin asignar"} />
                <Campo etiqueta="Último acceso" valor={perfil.ultimo_acceso ? formatoFecha(perfil.ultimo_acceso) : "Sin registrar"} />
              </div>
            </div>

            {/* Quién puede entrar a retail: el líder, o quien ve Colaboradores o Roles y accesos. La pantalla y cada RPC lo
                vuelven a exigir; esto solo decide si se ofrece la puerta. */}
            {(perfil.rol === "lider" || veAdministracion) && (
              <div>
                <p className="label-cayla mb-3 text-[11px] text-tinta/65">Administración</p>
                <Link
                  href="/colaboradores"
                  onClick={onClose}
                  className="card-cayla flex items-center justify-between gap-3 p-4 transition-colors hover:bg-sand/40"
                >
                  <span>
                    <span className="block text-sm text-tinta">Colaboradores</span>
                    <span className="mt-0.5 block text-xs text-tinta/55">A quién de Dynamic se le abre la puerta de retail.</span>
                  </span>
                  <span aria-hidden className="text-tinta/45">→</span>
                </Link>
              </div>
            )}

            {claveAbierta ? (
              <CambiarClave onListo={() => setClaveAbierta(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setClaveAbierta(true)}
                className="label-cayla text-[11px] text-tinta/70 underline decoration-tinta/30 underline-offset-2 hover:text-rojo"
              >
                Cambiar contraseña
              </button>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={alCerrar} className={`${botonCancelar} flex-1`}>
                Cerrar
              </button>
            </div>
          </div>
        );
      }}
    </Modal>
  );
}

// Paso chico, autocontenido: Supabase Auth directo — nunca toca una tabla de
// retail ni de Dynamic. `updateUser` exige que la sesión siga vigente, así
// que no hace falta pedir la contraseña actual aparte.
function CambiarClave({ onListo }: { onListo: () => void }) {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

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
    setTimeout(onListo, 1200);
  }

  if (exito) return <p className="text-sm text-verde">Contraseña actualizada.</p>;

  return (
    <form onSubmit={onSubmit} className="card-cayla space-y-3 p-4">
      <div>
        <label className="label-cayla text-[11px] text-tinta/70" htmlFor="clave-nueva">
          Contraseña nueva
        </label>
        <input
          id="clave-nueva"
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
        />
      </div>
      <div>
        <label className="label-cayla text-[11px] text-tinta/70" htmlFor="clave-confirmar">
          Confirmar contraseña
        </label>
        <input
          id="clave-confirmar"
          type="password"
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
        />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onListo} className={botonCancelar}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className={botonPrimario}>
          {guardando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>
    </form>
  );
}
