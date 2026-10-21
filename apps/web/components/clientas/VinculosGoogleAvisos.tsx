"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { traducirError } from "@/lib/error-escritura";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { celularAMedias } from "@/lib/club-avisos-reglas";
import { firmaOmitida, type ClaveSinResponsable, type FirmaOmitida } from "@/lib/responsable-omitido";
import type { Firma } from "@/lib/responsable-reglas";
import { desvincularCuentaGoogle, registrarVinculoAvisado } from "@/lib/vinculos-google-acciones";
import { correoAMedias, enlaceDelAviso, problemaParaAvisar, textoDelAviso, type EstadoAvisoVinculo, type VinculoGoogle } from "@/lib/vinculos-google-reglas";

// Clientas ▸ Avisos ▸ «Cuentas de Google unidas a un miembro» (ADR-0469). Quien ya estaba en CAYLA (una ficha abierta en caja con su correo)
// y entró a la tienda online con Google queda unido a su ficha sin pasar por una tienda. A cambio, la tienda le AVISA a la dueña de la ficha:
// aquí se abre su WhatsApp con el texto listo y se anota quién avisó, igual que los avisos del club (el sistema no manda WhatsApp solo).
// Si no era ella, un líder deshace la unión: la cuenta de Google se cierra y la ficha queda como estaba.
//
// El bloque solo se dibuja si hay algo en los últimos 60 días. El responsable lo pone el panel de Avisos (`puerta`): una persona firma a su
// nombre, una terminal elige quién envía. Deshacer es solo del líder y siempre firma con su cuenta de persona.

const CHIP: Record<EstadoAvisoVinculo, { tono: TonoChip; texto: string }> = {
  pendiente: { tono: "pizarra", texto: "Falta avisarle" },
  sin_celular: { tono: "ambar", texto: "Sin celular" },
  enviado: { tono: "verde", texto: "Avisada" },
};

type PuertaDelResponsable = {
  /** ¿Se puede firmar ya? (una persona siempre; una terminal, con alguien elegido). */
  listo: boolean;
  /** Por qué todavía no, si falta elegir quién envía. */
  motivo: string | null;
  firmaDe: (clave: ClaveSinResponsable) => Firma | FirmaOmitida | null;
  /** La base rechazó por el responsable (ya no está de turno): el combo se vacía y relee la lista. */
  despues: (error: { code?: string | null; hint?: string | null; message?: string | null } | null | undefined) => void;
};

export function VinculosGoogleAvisos({
  vinculos,
  sede,
  esLider,
  puerta,
}: {
  vinculos: VinculoGoogle[];
  /** La tienda activa: el aviso sale de su WhatsApp. */
  sede: { id: string; nombre: string };
  esLider: boolean;
  puerta: PuertaDelResponsable;
}) {
  // Lo que se tocó en esta pantalla sigue a la vista aunque la lista no se relea: «avisado» cambia el chip y «deshecho» saca la fila.
  const [hechos, setHechos] = useState<Record<string, "avisado" | "deshecho">>({});
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [aDeshacer, setADeshacer] = useState<VinculoGoogle | null>(null);

  const visibles = vinculos.filter((v) => hechos[v.id] !== "deshecho");
  if (visibles.length === 0) return null;
  const estadoDe = (v: VinculoGoogle): EstadoAvisoVinculo => (hechos[v.id] === "avisado" ? "enviado" : v.aviso);
  const porAvisar = visibles.filter((v) => estadoDe(v) === "pendiente").length;

  // `window.open` va ANTES de cualquier espera: abierto después de un `await`, el navegador lo toma por una ventana emergente y la bloquea.
  // Si igual la bloquea, no se anota nada: un aviso que no se abrió no se mandó.
  function avisarA(v: VinculoGoogle) {
    const texto = textoDelAviso(v, sede.nombre);
    const problema = problemaParaAvisar({ telefono: v.telefono, aviso: estadoDe(v) });
    const enlace = enlaceDelAviso(v, texto);
    if (problema || !enlace) {
      avisar.error(problema ?? "Este aviso no se puede mandar.");
      return;
    }
    if (!puerta.listo) {
      if (puerta.motivo) avisar.error(puerta.motivo);
      return;
    }
    const pestana = window.open(enlace, "_blank");
    if (!pestana) {
      avisar.error("El navegador no dejó abrir WhatsApp Web.", { detalle: "Permite las ventanas emergentes de este sitio y vuelve a tocar «Avisar»." });
      return;
    }
    try {
      pestana.opener = null;
    } catch {
      // Una pestaña de otro origen puede no dejar tocarlo: no importa, solo corta el vínculo con el ERP.
    }
    void anotar(v);
  }

  async function anotar(v: VinculoGoogle) {
    setEnCurso(v.id);
    const { error } = await registrarVinculoAvisado(v.id, sede.id, puerta.firmaDe("aviso_club_enviar"));
    setEnCurso(null);
    if (error) {
      puerta.despues(error);
      avisar.error(traducirError(error, "anotar el aviso como enviado"), { detalle: "WhatsApp ya se abrió: cuando lo mandes, vuelve a tocar «Avisar»." });
      return;
    }
    setHechos((h) => ({ ...h, [v.id]: "avisado" }));
  }

  async function deshacer(v: VinculoGoogle) {
    const { error } = await desvincularCuentaGoogle(v.id, firmaOmitida("vinculo_google_desvincular"));
    if (error) {
      avisar.error(traducirError(error, "deshacer la unión"));
      return;
    }
    setHechos((h) => ({ ...h, [v.id]: "deshecho" }));
    avisar.exito("Unión deshecha", { detalle: `La cuenta de Google ya no entra a los datos de ${v.nombre}. Su ficha no cambió.` });
  }

  return (
    <section className="rounded-xl border border-sand bg-papel p-5 sm:p-6" aria-label="Cuentas de Google unidas a un miembro" data-guia="avisos.vinculos">
      <TituloSeccion cuenta={porAvisar}>
        Cuentas de Google unidas a un miembro
      </TituloSeccion>
      <p className="nota-cayla mt-2">
        Alguien entró a la tienda online con Google y su correo ya estaba en la ficha de un miembro, así que la cuenta quedó unida a esa ficha.
        Avísale a la dueña por WhatsApp para que sepa. Si no fue ella, {esLider ? "deshaz la unión: la cuenta de Google deja de entrar y la ficha queda como estaba." : "avísale a un líder, que puede deshacer la unión."}
      </p>

      <ul className="mt-3 divide-y divide-sand">
        {visibles.map((v) => {
          const estado = estadoDe(v);
          const chip = CHIP[estado];
          const cuando = diaYHoraLima(v.creadoEn);
          const problema = problemaParaAvisar({ telefono: v.telefono, aviso: estado });
          const bloqueo = problema ?? puerta.motivo;
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <AvatarPersona personaId={null} nombre={v.nombre} tamano={32} />
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-[13.5px] text-tinta">{v.nombre}</p>
                <p className="truncate text-[12px] text-taupe">
                  Entró como «{v.nombreGoogle}» · {correoAMedias(v.correo)} · {cuando.dia} {cuando.hora} · {celularAMedias(v.telefono)}
                </p>
                {estado === "sin_celular" && (
                  <p className="text-[12px] text-ambar-profundo">No hay a quién escribirle: avísale en la tienda, o agrega su celular en su ficha.</p>
                )}
              </div>
              <Chip tono={chip.tono}>{chip.texto}</Chip>
              <div className="flex flex-wrap items-center gap-2">
                {estado !== "enviado" && (
                  <Boton
                    peso="primario"
                    onClick={() => avisarA(v)}
                    cargando={enCurso === v.id}
                    textoCargando="Anotando…"
                    disabled={enCurso !== null || bloqueo !== null}
                    title={bloqueo ?? "Abre WhatsApp Web con su número y el texto listos"}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      Avisar
                    </span>
                  </Boton>
                )}
                {esLider && (
                  <Boton peso="peligro" onClick={() => setADeshacer(v)} disabled={enCurso !== null} title="La cuenta de Google deja de entrar a esta ficha">
                    Deshacer la unión
                  </Boton>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {aDeshacer && (
        <ConfirmarConResponsable
          confirmacion={{
            titulo: `¿Deshacer la unión con ${aDeshacer.nombre}?`,
            bajada:
              "La cuenta de Google se cierra y deja de entrar a esta ficha. La ficha, sus compras y sus puntos no cambian. Si la dueña quiere su cuenta, puede crearla de nuevo con otro correo o en una tienda.",
            verbo: "Deshacer la unión",
            accion: () => deshacer(aDeshacer),
          }}
          onClose={() => setADeshacer(null)}
        />
      )}
    </section>
  );
}
