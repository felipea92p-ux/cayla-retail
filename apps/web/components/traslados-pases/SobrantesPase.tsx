"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { ejemploNotaSobrante } from "@/lib/sugerencias-traslados";
import { nombrePrenda, prendas } from "@/lib/traslados-recepcion-reglas";
import {
  MAX_NOTA_SOBRANTE,
  avisoDeSobrante,
  camposSobrante,
  opcionesDeSobrante,
  puedeGuardarSobrante,
  textoDeLaDecision,
  type DecisionSobrante,
  type SobranteTraslado,
} from "@/lib/traslados-sobrantes-reglas";
import type { TrasladoDetalle } from "@/lib/traslados";

// Lo que llegó de más en un traslado ya cerrado (ADR-0404, Felipe 2026-10-14). No está en el stock ni se puede vender hasta que
// alguien que puede cerrar la diferencia, en la sede que recibió, decide qué pasó: salió del origen, no se sabe de dónde salió
// (entra como encontrada) o fue un error al contar. Se revisa de a una prenda; lo ya revisado queda con su nota y quién lo decidió.
// La base vuelve a validar todo y un reintento con lo mismo no mueve dos veces (`resolver_sobrante_traslado`).

export function SobrantesPase({
  traslado: t,
  puedeRevisar,
}: {
  traslado: TrasladoDetalle;
  puedeRevisar: boolean;
}) {
  if (t.sobrantes.length === 0) return null;
  const nombre = (s: SobranteTraslado) => {
    const l = t.lineas.find((x) => x.varianteId === s.varianteId);
    return l ? nombrePrenda(l) : "Una prenda";
  };
  const pendientes = t.sobrantes.filter((s) => s.estado === "por_revisar");
  const enRevision = puedeRevisar ? (pendientes[0] ?? null) : null;

  return (
    <section
      data-guia="pase.sobrantes"
      aria-label="Llegó de más"
      className="tp-sobrantes"
    >
      <TituloGrupo cuenta={t.sobrantes.reduce((a, x) => a + x.cantidad, 0)}>
        Llegó de más
      </TituloGrupo>
      {enRevision && (
        <RevisarSobrante
          key={enRevision.id}
          sobrante={enRevision}
          nombre={nombre(enRevision)}
          traslado={t}
        />
      )}
      <ul className="tp-sobrantes-lista">
        {t.sobrantes
          .filter((s) => s !== enRevision)
          .map((s) => (
            <li key={s.id} data-estado={s.estado}>
              <span className="tp-sobrante-nombre">
                {nombre(s)}
                {s.cantidad > 1 ? ` · ${prendas(s.cantidad)}` : ""}
              </span>
              <span className="tp-dato">
                {textoDeLaDecision(s.estado, t.ubicacionOrigenNombre)}
                {s.estado === "por_revisar" &&
                  !puedeRevisar &&
                  ` La revisa un líder de ${t.ubicacionDestinoNombre}.`}
              </span>
              {s.nota && (
                <blockquote className="tp-cita">
                  “{s.nota}”
                  <cite>
                    {s.revisadoPorNombre
                      ? `${s.revisadoPorNombre}, al revisarla`
                      : "Al revisarla"}
                  </cite>
                </blockquote>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}

function RevisarSobrante({
  sobrante: s,
  nombre,
  traslado: t,
}: {
  sobrante: SobranteTraslado;
  nombre: string;
  traslado: TrasladoDetalle;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [decision, setDecision] = useState<DecisionSobrante | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guia = useGuiaCampos(
    camposSobrante(decision, nota, responsable.listo),
    { enModal: false },
  );
  const opciones = opcionesDeSobrante(
    t.ubicacionOrigenNombre,
    t.ubicacionDestinoNombre,
  );
  const listo = puedeGuardarSobrante(decision, nota, responsable.listo);

  async function guardar() {
    if (!listo || !decision || guardando) return;
    setGuardando(true);
    setError(null);
    const { error: e } = await firmar(
      createClient().rpc(
        "resolver_sobrante_traslado" as never,
        {
          p_sobrante_id: s.id,
          p_decision: decision,
          p_nota: nota.trim(),
        } as never,
      ),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(e);
    if (e) {
      setError(traducirError(e, "revisar la prenda de más"));
      return;
    }
    const aviso = avisoDeSobrante(
      decision,
      s.cantidad,
      t.ubicacionOrigenNombre,
      t.ubicacionDestinoNombre,
    );
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    router.refresh();
  }

  return (
    <div className="tp-sobrante-revision">
      <p className="tp-dato">
        <b className="text-tinta">{nombre}</b>
        {s.cantidad > 1 ? ` · ${prendas(s.cantidad)}` : ""}: todavía no está en
        el stock y no se puede vender.
      </p>
      <CampoGuiado id="sobrante-decision" guia={guia} titulo="¿Qué pasó?">
        <div
          className="tp-decision"
          role="group"
          aria-label="Qué pasó con la prenda de más"
        >
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={decision === o.valor}
              onClick={() => setDecision(o.valor)}
              disabled={guardando}
            >
              <b>{o.titulo}</b>
              <small>{o.sub}</small>
            </button>
          ))}
        </div>
      </CampoGuiado>
      <CampoGuiado id="sobrante-nota" guia={guia} titulo="¿Cómo lo supiste?">
        <div className="caja-cayla caja-campo">
          <textarea
            id="sobrante-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={ejemploNotaSobrante(decision, t.ubicacionOrigenNombre)}
            aria-label="Cómo lo supiste"
            maxLength={MAX_NOTA_SOBRANTE}
            rows={2}
            disabled={guardando}
            className="caja-campo-input resize-none"
          />
        </div>
      </CampoGuiado>
      <CampoGuiado
        id="sobrante-responsable"
        guia={guia}
        titulo="¿Quién lo decide?"
      >
        <ComboResponsable
          control={responsable}
          deshabilitado={guardando}
          compacto
          className="w-full"
        />
      </CampoGuiado>
      {error && (
        <Aviso tono="error" chico>
          {error}
        </Aviso>
      )}
      <PieGuia guia={guia} listo="Listo: ya puedes guardarlo." />
      <button
        type="button"
        onClick={() => void guardar()}
        disabled={!listo || guardando}
        className={`btn-cayla btn-primario tp-grande ${guia.claseConfirmar}`}
      >
        {guardando ? "Guardando…" : "Guardar lo que pasó"}
      </button>
    </div>
  );
}
