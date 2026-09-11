"use client";

import { useState } from "react";
import type { PlanDeMapeo } from "@/lib/importacion/mapeo";

/**
 * Paso 3: qué colores y categorías trae el archivo, y qué se hace con ellos.
 *
 * ACÁ ESTÁ LA DECISIÓN QUE FELIPE TOMÓ Y LA CORRECCIÓN QUE PROPUSE. Se pidió
 * «mapear al más cercano y marcar para revisión»; el problema de esa forma en
 * autoservicio es que la lista de revisión diferida es un archivo que nadie abre
 * nunca — el cliente se entera seis meses después de que su "Fucsia neón" se
 * volvió "Fucsia". La revisión no se pospone: se pone EN EL CAMINO. Esta es la
 * última pantalla antes de escribir, y el botón que importa es el mismo que
 * aprueba estos valores. Un clic si todo está bien; nada entra en silencio.
 *
 * Y nada se pierde: "Fucsia neón" se conserva como color de ESTA marca. Lo único
 * que se decide es de qué término universal cuelga (ADR-0030).
 */

type Valor = {
  texto: string;
  apariciones: number;
  existente: { clave: string; nombre: string } | null;
  propuesta: { universalId: string | null; universalNombre: string | null; confianza: string; porque: string } | null;
};

type Campo = { yaExisten: Valor[]; aCrear: Valor[] };

type Respuesta = {
  total: number;
  colores: Campo;
  categorias: Campo;
  aviso?: string;
  uso?: { entrada: number; salida: number };
};

function Grupo({ titulo, campo }: { titulo: string; campo: Campo }) {
  const [verExistentes, setVerExistentes] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="label-cayla text-[11px] text-tinta">{titulo}</h3>
        <span className="text-[11px] text-tinta/50">
          {campo.yaExisten.length} ya en tu vocabulario · {campo.aCrear.length} nuevos
        </span>
      </div>

      {campo.aCrear.length > 0 && (
        <ul className="space-y-1 text-xs">
          {campo.aCrear.map((v) => (
            <li key={v.texto} className="flex flex-wrap items-baseline gap-x-2 border-t border-tinta/10 py-1.5">
              <span className="font-medium text-tinta">{v.texto}</span>
              <span className="text-[10px] text-tinta/35">
                {v.apariciones} {v.apariciones === 1 ? "prenda" : "prendas"}
              </span>
              {v.propuesta?.universalNombre ? (
                <span className="text-tinta/50">→ se agrupa bajo «{v.propuesta.universalNombre}»</span>
              ) : (
                <span className="text-rojo">→ sin clasificar</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {campo.yaExisten.length > 0 && (
        <>
          <button
            onClick={() => setVerExistentes((v) => !v)}
            className="label-cayla text-[10px] text-tinta/50 hover:text-rojo"
          >
            {verExistentes ? "Ocultar" : "Ver"} los {campo.yaExisten.length} que ya tenías
          </button>
          {verExistentes && (
            <ul className="space-y-0.5 text-[11px] text-tinta/50">
              {campo.yaExisten.map((v) => (
                <li key={v.texto}>
                  {v.texto} → {v.existente?.nombre} ({v.apariciones})
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

type Importado = { importacionId: string; productos: number; variantes: number; colores: number; categorias: number; duplicadas: number };

export function RevisarValores({
  filas,
  filaCabecera,
  plan,
  origen,
}: {
  filas: string[][];
  filaCabecera: number;
  plan: PlanDeMapeo;
  origen: string;
}) {
  const [r, setR] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importado, setImportado] = useState<Importado | null>(null);

  async function importar() {
    if (!r) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/importacion/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filas,
          filaCabecera,
          plan,
          origen,
          // Solo lo NUEVO viaja para crearse. Lo que ya existía se resuelve por
          // nombre dentro del RPC, igual que se cruzó acá.
          colores: r.colores.aCrear.map((v) => ({ texto: v.texto, universalId: v.propuesta?.universalId ?? null })),
          categorias: r.categorias.aCrear.map((v) => ({ texto: v.texto, universalId: v.propuesta?.universalId ?? null })),
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? "No se pudo importar.");
        return;
      }
      setImportado(datos);
    } catch {
      setError("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCargando(false);
    }
  }

  async function revisar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/importacion/valores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas, filaCabecera, plan }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? "No se pudieron revisar los valores.");
        return;
      }
      setR(datos);
    } catch {
      setError("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCargando(false);
    }
  }

  if (!r) {
    return (
      <section className="card-cayla space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-lg text-tinta">Colores y categorías</h2>
            <p className="mt-0.5 text-xs text-tinta/65">
              Los que ya usas se reconocen solos. Los que no, se agregan a tu vocabulario con el nombre
              que tú les das.
            </p>
          </div>
          <button
            onClick={() => void revisar()}
            disabled={cargando}
            className="label-cayla rounded border border-tinta/20 px-3 py-1.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40"
          >
            {cargando ? "Revisando…" : "Revisar valores"}
          </button>
        </div>
        {error && <p className="text-xs text-rojo">{error}</p>}
      </section>
    );
  }

  const nuevos = r.colores.aCrear.length + r.categorias.aCrear.length;
  const sinClasificar =
    r.colores.aCrear.filter((v) => !v.propuesta?.universalId).length +
    r.categorias.aCrear.filter((v) => !v.propuesta?.universalId).length;

  // Ya se importó: esta pantalla termina acá. Lo que sigue es ir al Catálogo.
  if (importado) {
    return (
      <section className="card-cayla space-y-3 p-4">
        <h2 className="font-display text-lg text-tinta">Catálogo importado</h2>
        <p className="text-xs text-tinta/65">
          <strong className="text-tinta">{importado.productos}</strong> prendas ·{" "}
          <strong className="text-tinta">{importado.variantes}</strong> variantes
          {importado.colores > 0 && <> · {importado.colores} colores nuevos en tu vocabulario</>}
          {importado.categorias > 0 && <> · {importado.categorias} categorías nuevas</>}
        </p>
        {importado.duplicadas > 0 && (
          <p className="text-xs text-tinta/65">
            El archivo traía {importado.duplicadas} {importado.duplicadas === 1 ? "fila repetida" : "filas repetidas"}{" "}
            (misma prenda, misma talla, mismo color): se dejó una de cada.
          </p>
        )}
        <p className="text-xs text-tinta/65">
          Todo entró con stock en cero. Las cantidades se levantan contando —{" "}
          <a href="/inventario/conteo" className="text-rojo hover:underline">
            Inventario → Conteo
          </a>
          . Si algo salió mal, se puede deshacer: las prendas quedan descontinuadas, nunca borradas.
        </p>
        <a href="/inventario" className="label-cayla inline-block rounded bg-tinta px-4 py-2 text-[11px] text-hueso hover:opacity-90">
          Ver el catálogo
        </a>
      </section>
    );
  }

  return (
    <section className="card-cayla space-y-4 p-4">
      <div>
        <h2 className="font-display text-lg text-tinta">Colores y categorías</h2>
        <p className="mt-0.5 text-xs text-tinta/65">
          <strong className="text-tinta">{r.total}</strong> prendas ·{" "}
          {nuevos === 0
            ? "ningún valor nuevo, todo estaba en tu vocabulario"
            : `${nuevos} ${nuevos === 1 ? "valor nuevo" : "valores nuevos"} que se agregarán a tu vocabulario`}
        </p>
      </div>

      {r.aviso && <p className="rounded border border-rojo/30 p-2 text-xs text-rojo">{r.aviso}</p>}
      {error && <p className="text-xs text-rojo">{error}</p>}

      <Grupo titulo="Colores" campo={r.colores} />
      <div className="border-t border-tinta/10 pt-3">
        <Grupo titulo="Categorías" campo={r.categorias} />
      </div>

      <div className="border-t border-tinta/10 pt-3">
        {sinClasificar > 0 && (
          <p className="mb-2 text-xs text-rojo">
            {sinClasificar} {sinClasificar === 1 ? "valor quedó" : "valores quedaron"} sin clasificar. Se
            crearán igual con su nombre; solo no podrán compararse con los de otras marcas.
          </p>
        )}
        <p className="text-xs text-tinta/65">
          Ninguno de estos nombres se pierde: se guardan tal como los escribes tú. Lo que se decide acá es
          bajo qué término del estándar se agrupan.
        </p>
      </div>

      {/* El botón que importa es el mismo que aprueba los valores de arriba. Un
          clic si todo está bien; nada entra en silencio. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-3">
        <button
          onClick={() => void importar()}
          disabled={cargando}
          className="label-cayla rounded bg-tinta px-4 py-2 text-[11px] text-hueso transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {cargando ? "Importando…" : `Importar ${r.total} prendas`}
        </button>
        <span className="text-[11px] text-tinta/50">Con stock en cero. Se puede deshacer.</span>
      </div>

      {r.uso && r.uso.entrada > 0 && (
        <p className="text-[10px] text-tinta/35">
          {r.uso.entrada} tokens de entrada · {r.uso.salida} de salida ≈ $
          {((r.uso.entrada * 1) / 1e6 + (r.uso.salida * 5) / 1e6).toFixed(4)}
        </p>
      )}
    </section>
  );
}
