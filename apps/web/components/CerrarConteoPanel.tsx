"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";

/**
 * Las dos decisiones que cierran un conteo: aprobarlo o tirarlo.
 *
 * VIVE APARTE DE `ConteoPanel` A PROPÓSITO. Contar es un gesto que se repite 500 veces
 * y esa pantalla está construida entera alrededor de eso —foco permanente en el
 * buscador, nada de `router.refresh()`, conteo a ciegas—. Aprobar es un gesto que pasa
 * UNA vez, lo hace otra persona (la Líder) y necesita justo lo contrario: ver todo antes
 * de tocar nada. Meter los dos en la misma pantalla obliga a que uno de los dos estorbe.
 *
 * CERRAR NO SE PUEDE DESHACER, y por eso va en dos tiempos: el primero muestra la cifra
 * en soles y qué va a pasar; el segundo la ejecuta. Es la misma disciplina del cierre de
 * caja, donde primero cuentas y después el sistema te dice si cuadró.
 */

type Resultado = {
  lineasTotales: number;
  lineasAjustadas: number;
  unidadesSobrantes: number;
  unidadesFaltantes: number;
};

type Props = {
  conteoId: string;
  sedeCodigo: string;
  /** Neto en soles al costo, ya calculado: es lo que se está aprobando. */
  solesNeto: number;
  lineasConDiferencia: number;
};

const money = (n: number) => `S/${Math.abs(n).toFixed(2)}`;

export function CerrarConteoPanel({ conteoId, sedeCodigo, solesNeto, lineasConDiferencia }: Props) {
  const router = useRouter();
  const [paso, setPaso] = useState<"inicio" | "confirmar" | "anular">("inicio");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function cerrar() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("cerrar_conteo", { p_conteo_id: conteoId });
    setLoading(false);
    if (err) {
      setError(traducirError(err, "cerrar el conteo"));
      return;
    }
    // La RPC devuelve una tabla de una sola fila.
    const fila = Array.isArray(data) ? data[0] : data;
    setResultado({
      lineasTotales: Number(fila?.lineas_totales ?? 0),
      lineasAjustadas: Number(fila?.lineas_ajustadas ?? 0),
      unidadesSobrantes: Number(fila?.unidades_sobrantes ?? 0),
      unidadesFaltantes: Number(fila?.unidades_faltantes ?? 0),
    });
    router.refresh();
  }

  async function anular() {
    if (motivo.trim() === "") {
      setError("Anular un conteo necesita un motivo — quién lo lea mañana tiene que entender por qué se tiró.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("anular_conteo", { p_conteo_id: conteoId, p_motivo: motivo.trim() });
    setLoading(false);
    if (err) {
      setError(traducirError(err, "anular el conteo"));
      return;
    }
    router.push("/inventario/conteo");
    router.refresh();
  }

  /* ---------------- el acuse: qué pasó de verdad ---------------- */
  if (resultado) {
    return (
      <div className="card-cayla space-y-4 p-5">
        <div>
          <p className="label-cayla text-[11px] text-verde-profundo">Conteo cerrado</p>
          <p className="mt-1.5 text-sm text-tinta/75">
            El inventario de {sedeCodigo} quedó igual a lo contado.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-tinta/65">Modelos revisados</dt>
            <dd className="font-display text-xl text-tinta">{resultado.lineasTotales}</dd>
          </div>
          <div>
            <dt className="text-tinta/65">Ajustados</dt>
            <dd className="font-display text-xl text-tinta">{resultado.lineasAjustadas}</dd>
          </div>
          <div>
            <dt className="text-tinta/65">Unidades de más</dt>
            <dd className="font-display text-xl text-tinta">{resultado.unidadesSobrantes}</dd>
          </div>
          <div>
            <dt className="text-tinta/65">Unidades de menos</dt>
            <dd className="font-display text-xl text-tinta">{resultado.unidadesFaltantes}</dd>
          </div>
        </dl>
        <p className="text-xs text-tinta/65">
          Cada ajuste quedó como un movimiento con su motivo, así que el historial de cada prenda
          explica de dónde salió la corrección.
        </p>
        <button type="button" onClick={() => router.push("/inventario")} className={`${botonPrimario} w-full`}>
          Ver el inventario
        </button>
      </div>
    );
  }

  /* ---------------- anular: pide motivo, como la RPC ---------------- */
  if (paso === "anular") {
    return (
      <div className="card-cayla space-y-4 p-5">
        <div>
          <p className="label-cayla text-[11px] text-rojo">Anular el conteo</p>
          <p className="mt-1.5 text-sm text-tinta/75">
            Lo contado se descarta y el inventario queda como estaba. No se ajusta nada.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="motivo-anular">
            Por qué se anula
          </label>
          <input
            id="motivo-anular"
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Se contó la trastienda por error"
            className={campoTexto}
          />
        </div>
        {error && <p className="text-sm text-rojo">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setPaso("inicio");
              setError(null);
            }}
            className={botonCancelar}
          >
            Volver
          </button>
          <button type="button" onClick={anular} disabled={loading} className={botonPrimario}>
            {loading ? "Anulando…" : "Anular conteo"}
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- confirmar: el segundo tiempo ---------------- */
  if (paso === "confirmar") {
    return (
      <div className="card-cayla space-y-4 border-rojo/40 p-5">
        <div>
          <p className="label-cayla text-[11px] text-rojo">Confirma antes de cerrar</p>
          <p className="mt-1.5 text-sm text-tinta/80">
            Se van a ajustar <strong className="text-tinta">{lineasConDiferencia}</strong>{" "}
            {lineasConDiferencia === 1 ? "prenda" : "prendas"} del piso de {sedeCodigo}, con un efecto de{" "}
            <strong className="text-tinta">{money(solesNeto)}</strong> {solesNeto < 0 ? "en contra" : "a favor"} al
            costo. Cada ajuste entra al historial como un movimiento.
          </p>
          <p className="mt-2 text-xs text-tinta/65">Esto no se puede deshacer.</p>
        </div>
        {error && <p className="text-sm text-rojo">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setPaso("inicio");
              setError(null);
            }}
            className={botonCancelar}
          >
            Todavía no
          </button>
          <button type="button" onClick={cerrar} disabled={loading} className={botonPrimario}>
            {loading ? "Cerrando…" : "Sí, cerrar y ajustar"}
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- inicio ---------------- */
  return (
    <div className="card-cayla flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="text-sm text-tinta/75">
        Cuando el piso esté contado, cierra el conteo: el inventario pasa a decir lo que se contó.
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setPaso("anular")}
          className="label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
        >
          Anular
        </button>
        <button
          type="button"
          onClick={() => setPaso("confirmar")}
          className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo"
        >
          Cerrar conteo
        </button>
      </div>
    </div>
  );
}
