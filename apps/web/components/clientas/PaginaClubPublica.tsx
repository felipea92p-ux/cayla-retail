"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { confirmarPublicidadClub } from "@/app/actions/club";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import {
  ERROR_AL_GUARDAR,
  bajadaVigente,
  estadoInicial,
  etiquetaClub,
  mensajeDeEstado,
  puedeConfirmar,
  responsableDelTratamiento,
  saludo,
  trasConfirmar,
  type InvitacionVigente,
  type Trozo,
  type VistaInvitacion,
  type VistaSinFormulario,
} from "@/lib/club-pagina-reglas";

/* ====================================================================
   La página pública del QR personal (ADR-0288 act. c, «camino B»): la abre la socia en SU celular, sin sesión, y
   marca ella misma la casilla para recibir publicidad por WhatsApp. Copia la del spike del club
   (docs/maquetas/club-clientas-spike-2026-09, `fuente/src/47-club-qr.js`, `paginaClubHTML`): cabecera con el colibrí,
   rótulo del club, saludo, la tarjeta con la casilla, la nota legal y «Confirmar» a lo ancho, en una columna de
   `max-w-md`. Sin menú ni cabecera del ERP: vive fuera de `app/(app)`.

   El texto de la casilla sale de la base (`pagina_publicidad`, con su celular a medias); la casilla nace SIEMPRE sin
   marcar y «Confirmar» se enciende solo al marcarla. Guardar va por una acción de servidor (`app/actions/club.ts`),
   como `anon`; mientras responde, el loader general la cubre como en todo el ERP (ADR-0149) y se va solo al volver.
   ==================================================================== */

function Parrafo({ trozos, className }: { trozos: readonly Trozo[]; className: string }) {
  return (
    <p className={className}>
      {trozos.map((t, i) =>
        typeof t === "string" ? (
          <span key={i}>{t}</span>
        ) : (
          <b key={i} className="font-semibold text-tinta">
            {t.fuerte}
          </b>
        ),
      )}
    </p>
  );
}

function Cabeza() {
  return (
    <div className="flex items-center gap-3">
      <IsotipoCayla className="h-7 w-auto" />
      <span className="flex flex-col leading-none">
        <span className="label-cayla text-sm tracking-[0.26em] text-tinta">CAYLA</span>
        <span className="label-cayla mt-1 text-[10px] tracking-[0.2em] text-taupe-profundo">Club</span>
      </span>
    </div>
  );
}

export function PaginaClubPublica({ token, vistaInicial }: { token: string; vistaInicial: VistaInvitacion }) {
  const [estado, setEstado] = useState(() => estadoInicial(vistaInicial));
  const [enviando, setEnviando] = useState(false);
  const { vista } = estado;

  // Pasar del formulario a un resultado cambia de VISTA sin cambiar de URL: se suelta la reserva de alto de
  // `PaginaEstable` (ADR-0185) y la vista vuelve arriba, donde está el resultado. Antes de pintar, para que el aire no
  // alcance a verse. No hay ningún campo de texto con foco que interrumpir.
  const estadoPrevio = useRef(vista.estado);
  useLayoutEffect(() => {
    if (estadoPrevio.current === vista.estado) return;
    estadoPrevio.current = vista.estado;
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [vista.estado]);

  async function confirmar(actual: InvitacionVigente) {
    if (!puedeConfirmar({ marcada: estado.marcada, enviando })) return;
    setEnviando(true);
    setEstado((e) => ({ ...e, error: null }));
    try {
      const respuesta = await confirmarPublicidadClub(token, actual.textoVersion);
      setEstado((e) => trasConfirmar(actual, e.marcada, respuesta));
    } catch {
      // Sin señal, o la acción no llegó: todo queda como estaba, con la casilla marcada, para reintentar.
      setEstado((e) => ({ ...e, error: ERROR_AL_GUARDAR }));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-dvh bg-crema">
      <div className="mx-auto max-w-md">
        <div className="flex min-h-dvh flex-col bg-crema px-5 pb-8 pt-7 text-tinta">
          <Cabeza />
          {/* Lo que cambia al confirmar se anuncia al lector de pantalla (el botón que tenía el foco desaparece). */}
          <div aria-live="polite">
            {vista.estado === "vigente" ? (
              <Formulario
                vista={vista}
                marcada={estado.marcada}
                aviso={estado.aviso}
                error={estado.error}
                enviando={enviando}
                onMarcar={(marcada) => setEstado((e) => ({ ...e, marcada, error: null }))}
                onConfirmar={() => confirmar(vista)}
              />
            ) : (
              <Resultado vista={vista} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Formulario({
  vista,
  marcada,
  aviso,
  error,
  enviando,
  onMarcar,
  onConfirmar,
}: {
  vista: InvitacionVigente;
  marcada: boolean;
  aviso: string | null;
  error: string | null;
  enviando: boolean;
  onMarcar: (marcada: boolean) => void;
  onConfirmar: () => void;
}) {
  const activo = puedeConfirmar({ marcada, enviando });
  return (
    <>
      <p className="label-cayla mt-8 text-[11px] text-taupe-profundo">{etiquetaClub(vista.tienda)}</p>
      <h1 className="font-display mt-2 text-[34px] leading-none tracking-tight text-tinta">{saludo(vista.nombreCorto)}</h1>
      <Parrafo trozos={bajadaVigente(vista.codigoClub)} className="mt-3 text-[15px] text-tinta/75" />

      {aviso ? (
        <p className="anim-revelar mt-5 rounded-xl bg-hueso px-3.5 py-3 text-sm leading-snug text-tinta/80">
          {aviso}
        </p>
      ) : null}

      <div className="mt-6 rounded-2xl border border-sand bg-papel p-4">
        {/* Una casilla de verdad (teclado y lector de pantalla), con la forma redonda del spike. Todo el texto la marca. */}
        <label className="flex w-full cursor-pointer items-start gap-3 text-left">
          <span className="relative mt-0.5 flex h-5 w-5 shrink-0">
            <input
              type="checkbox"
              checked={marcada}
              disabled={enviando}
              onChange={(e) => onMarcar(e.target.checked)}
              className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full border border-tinta/30 bg-papel transition-colors checked:border-tinta checked:bg-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo disabled:cursor-default"
            />
            <Check aria-hidden strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-crema opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="text-[14.5px] leading-snug text-tinta">{vista.texto}</span>
        </label>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-tinta/55">
        Tu permiso queda guardado con la fecha y este texto. {responsableDelTratamiento(vista.razonSocial, vista.ruc)}.
      </p>

      <button
        type="button"
        onClick={onConfirmar}
        disabled={!activo}
        aria-busy={enviando}
        className="label-cayla mt-5 flex h-12 w-full items-center justify-center rounded-md bg-tinta text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40 disabled:hover:bg-tinta"
      >
        {enviando ? "Enviando…" : "Confirmar"}
      </button>
      {error ? (
        <p role="alert" className="anim-revelar mt-3 text-center text-[13px] text-rojo-profundo">
          {error}
        </p>
      ) : null}
    </>
  );
}

function Resultado({ vista }: { vista: VistaSinFormulario }) {
  const { titulo, parrafo } = mensajeDeEstado(vista);
  if (vista.estado === "listo") {
    return (
      <div className="anim-revelar">
        <div className="mt-8">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-verde/15 text-verde">
            {/* El visto se dibuja una vez al llegar (respuesta a su «Confirmar», ADR-0136); quieto con movimiento reducido. */}
            <Check aria-hidden className="check-trazo h-6 w-6" style={{ "--d": "120ms" } as CSSProperties} />
          </span>
        </div>
        <h1 className="font-display mt-4 text-[32px] leading-tight text-tinta">{titulo}</h1>
        <Parrafo trozos={parrafo} className="mt-3 text-[15px] text-tinta/75" />
      </div>
    );
  }
  return (
    <>
      <h1 className="font-display mt-8 text-[30px] leading-tight text-tinta">{titulo}</h1>
      <Parrafo trozos={parrafo} className="mt-3 text-[15px] text-tinta/70" />
      {vista.estado === "no_disponible" ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 w-full py-2 text-center text-[13px] text-tinta/70 underline underline-offset-2 hover:text-rojo"
        >
          Volver a intentar
        </button>
      ) : null}
    </>
  );
}
