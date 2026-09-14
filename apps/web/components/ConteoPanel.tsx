"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { resumirVarianza, type FilaPrevisualizacion, type Varianza } from "@/lib/conteo-varianza";
import type { ConteoAbierto } from "@/lib/conteos";

type VarianteConteo = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  costo: number;
  codigosBarras: string[];
};

function money(n: number) {
  return (n >= 0 ? "S/" : "-S/") + Math.abs(n).toFixed(2);
}

export function ConteoPanel({
  ubicacionId,
  esLider,
  conteoAbierto,
  catalogo,
}: {
  ubicacionId: string;
  esLider: boolean;
  conteoAbierto: ConteoAbierto | null;
  catalogo: VarianteConteo[];
}) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setAbriendo(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("abrir_conteo", { p_ubicacion_id: ubicacionId });
    setAbriendo(false);
    if (error) {
      setError(traducirError(error, "abrir el conteo"));
      return;
    }
    router.refresh();
  }

  if (!conteoAbierto) {
    return (
      <div className="card-cayla space-y-3 p-6 text-center">
        <p className="text-sm text-tinta/75">No hay ningún conteo abierto en esta ubicación.</p>
        {error && <p className="text-sm text-rojo">{error}</p>}
        <button type="button" onClick={abrir} disabled={abriendo} className={`${botonPrimario} mx-auto w-fit px-6`}>
          {abriendo ? "Abriendo…" : "Abrir conteo"}
        </button>
      </div>
    );
  }

  return <ConteoEnCurso conteo={conteoAbierto} catalogo={catalogo} esLider={esLider} />;
}

function ConteoEnCurso({
  conteo,
  catalogo,
  esLider,
}: {
  conteo: ConteoAbierto;
  catalogo: VarianteConteo[];
  esLider: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<VarianteConteo | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revisando, setRevisando] = useState(false);

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return catalogo
      .filter((v) => v.sku.toLowerCase().includes(q) || v.codigosBarras.some((c) => c.toLowerCase() === q))
      .slice(0, 8);
  }, [busqueda, catalogo]);

  // Escanear un código de barras exacto selecciona directo, sin tener que
  // elegir de una lista — es el camino rápido que pide un conteo real con
  // pistola. Buscar por texto parcial de SKU sigue mostrando opciones.
  const yaContadas = new Set(conteo.items.map((i) => i.varianteId));

  async function registrarConteo(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionada) return;
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n < 0) {
      setError("La cantidad física debe ser un número entero, 0 o más.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("conteo_contar", {
      p_conteo_id: conteo.id,
      p_variante_id: seleccionada.varianteId,
      p_cantidad_contada: n,
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "registrar el conteo de esa prenda"));
      return;
    }
    setSeleccionada(null);
    setBusqueda("");
    setCantidad("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="card-cayla p-5">
        <p className="label-cayla text-[11px] text-tinta/65">
          Conteo abierto · {conteo.abiertoPorNombre} · {new Date(conteo.creadoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })}
        </p>

        {!seleccionada ? (
          <div className="mt-3">
            <input
              autoFocus
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                const exacto = catalogo.find((v) => v.codigosBarras.includes(e.target.value.trim()));
                if (exacto) setSeleccionada(exacto);
              }}
              placeholder="Escanea el código de barras o escribe el SKU…"
              className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
            {coincidencias.length > 0 && (
              <div className="mt-2 space-y-1">
                {coincidencias.map((v) => (
                  <button
                    key={v.varianteId}
                    type="button"
                    onClick={() => setSeleccionada(v)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/50"
                  >
                    <span>
                      {v.referencia} <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                    </span>
                    <span className="font-mono text-[11px] text-tinta/65">
                      {v.sku} {yaContadas.has(v.varianteId) && "· ya contada"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={registrarConteo} className="mt-3 space-y-3">
            <p className="text-sm text-tinta">
              {seleccionada.referencia} <span className="text-tinta/65">{[seleccionada.talla, seleccionada.color].filter(Boolean).join("/")}</span>{" "}
              <span className="font-mono text-[11px] text-tinta/65">{seleccionada.sku}</span>
            </p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="label-cayla text-[11px] text-tinta/70">Cantidad física</label>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="w-28 border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                />
              </div>
              <button type="submit" disabled={loading} className={botonPrimario}>
                {loading ? "Guardando…" : "Registrar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSeleccionada(null);
                  setBusqueda("");
                  setCantidad("");
                }}
                className={botonCancelar}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-rojo">{error}</p>}
      </div>

      {conteo.items.length > 0 && (
        <div className="card-cayla divide-y divide-tinta/10">
          {conteo.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-5 py-2.5">
              <p className="text-sm text-tinta">
                {i.referencia} <span className="text-tinta/65">{[i.talla, i.color].filter(Boolean).join("/")}</span>{" "}
                <span className="font-mono text-[11px] text-tinta/65">{i.sku}</span>
              </p>
              <p className="text-sm tabular-nums text-tinta/75">× {i.cantidadContada}</p>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={conteo.items.length === 0}
        onClick={() => setRevisando(true)}
        className={`${botonPrimario} w-full disabled:opacity-40`}
      >
        Revisar y cerrar conteo
      </button>

      {revisando && (
        <RevisarCierre conteoId={conteo.id} catalogo={catalogo} esLider={esLider} onClose={() => setRevisando(false)} />
      )}
    </div>
  );
}

function RevisarCierre({
  conteoId,
  catalogo,
  esLider,
  onClose,
}: {
  conteoId: string;
  catalogo: VarianteConteo[];
  esLider: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [varianza, setVarianza] = useState<Varianza | null>(null);
  const [noContadas, setNoContadas] = useState<FilaPrevisualizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const costoDe = new Map(catalogo.map((v) => [v.varianteId, v.costo]));
    createClient()
      .rpc("previsualizar_cierre_conteo", { p_conteo_id: conteoId })
      .then(({ data, error: errCarga }) => {
        if (!vigente) return;
        if (errCarga) {
          setError(traducirError(errCarga, "cargar la vista previa"));
          setCargando(false);
          return;
        }
        const filas = (data as FilaPrevisualizacion[]) ?? [];
        // cerrar_conteo() nunca toca lo que nadie contó — así que la
        // diferencia neta que se muestra acá solo puede venir de lo
        // realmente contado. Mezclar "no_contado" ahí adentro convertiría
        // cada variante nunca escaneada en "faltante total", una alarma
        // falsa sobre algo que el cierre real ni siquiera va a mirar.
        setVarianza(resumirVarianza(filas.filter((f) => f.origen === "contado"), costoDe));
        setNoContadas(filas.filter((f) => f.origen === "no_contado"));
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteoId]);

  async function cerrar() {
    setCerrando(true);
    setError(null);
    const { error } = await createClient().rpc("cerrar_conteo", { p_conteo_id: conteoId });
    setCerrando(false);
    if (error) {
      setError(traducirError(error, "cerrar el conteo"));
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/35 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sand bg-crema p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg text-tinta">Revisar antes de cerrar</h2>

        {cargando ? (
          <p className="mt-4 text-sm text-tinta/65">Calculando…</p>
        ) : varianza ? (
          <div className="mt-4 space-y-4">
            <div className="card-cayla p-4 text-center">
              <p className="label-cayla text-[11px] text-tinta/65">Diferencia neta</p>
              <p className={`font-display text-2xl ${varianza.solesNeto === 0 ? "text-tinta" : varianza.solesNeto < 0 ? "text-rojo" : "text-verde"}`}>
                {money(varianza.solesNeto)}
              </p>
              <p className="mt-1 text-xs text-tinta/65">
                {varianza.unidadesSobrantes} de más · {varianza.unidadesFaltantes} de menos
                {varianza.lineasSinCosto > 0 && ` · ${varianza.lineasSinCosto} sin costo cargado`}
              </p>
            </div>

            {varianza.lineas.filter((l) => l.diferencia !== 0).length > 0 && (
              <div className="card-cayla divide-y divide-tinta/10">
                {varianza.lineas
                  .filter((l) => l.diferencia !== 0)
                  .map((l) => (
                    <div key={l.varianteId} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span>
                        {l.referencia} <span className="text-tinta/65">{[l.talla, l.color].filter(Boolean).join("/")}</span>
                      </span>
                      <span className={l.diferencia > 0 ? "text-verde" : "text-rojo"}>
                        {l.sistema} → {l.contada} ({l.diferencia > 0 ? "+" : ""}
                        {l.diferencia})
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {noContadas.length > 0 && (
              <p className="text-xs text-tinta/65">
                ⚠ {noContadas.length} variante{noContadas.length > 1 ? "s" : ""} con stock en esta ubicación nunca se
                contaron y no se van a tocar al cerrar: {noContadas.map((l) => l.referencia).slice(0, 5).join(", ")}
                {noContadas.length > 5 && "…"}
              </p>
            )}

            {!esLider && <p className="text-xs text-rojo">Solo un líder puede cerrar el conteo.</p>}
            {error && <p className="text-sm text-rojo">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className={botonCancelar}>
                Seguir contando
              </button>
              <button type="button" onClick={cerrar} disabled={cerrando || !esLider} className={botonPrimario}>
                {cerrando ? "Cerrando…" : "Cerrar conteo"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-rojo">{error}</p>
        )}
      </div>
    </div>
  );
}
