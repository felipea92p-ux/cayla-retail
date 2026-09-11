"use client";

import { useState } from "react";
import Link from "next/link";
import { Boton } from "@/components/ui/campos";
import type { PlanDeMapeo } from "@/lib/importacion/mapeo";
import { etiquetaCorta } from "@/lib/taxonomia/anclar";

/**
 * Paso 3: qué colores y categorías trae el archivo, y el botón que importa.
 *
 * ACÁ ESTÁ LA DECISIÓN QUE FELIPE TOMÓ Y LA CORRECCIÓN QUE PROPUSE. Se pidió
 * «mapear al más cercano y marcar para revisión»; el problema de esa forma en
 * autoservicio es que la lista de revisión diferida es un archivo que nadie abre
 * nunca. La revisión no se pospone: se pone EN EL CAMINO. Esta es la última
 * pantalla antes de escribir, y el botón que importa es el mismo que aprueba
 * estos valores. Un clic si todo está bien; nada entra en silencio.
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
  /** Lo que costó, ya en dólares y con el caché contado (lib/ia/cliente.ts). */
  uso?: { entrada: number; salida: number; cacheLeido: number; costo: number };
};

type Importado = {
  importacionId: string;
  productos: number;
  variantes: number;
  colores: number;
  categorias: number;
  duplicadas: number;
  /** El reintento encontró la importación que ya había entrado. */
  repetida?: boolean;
};

function Grupo({ titulo, campo }: { titulo: string; campo: Campo }) {
  const [verExistentes, setVerExistentes] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="label-cayla text-[11px] text-tinta">{titulo}</h3>
        <span className="text-xs text-tinta/65">
          {campo.yaExisten.length} ya en tu vocabulario · {campo.aCrear.length}{" "}
          {campo.aCrear.length === 1 ? "nuevo" : "nuevos"}
        </span>
      </div>

      {campo.aCrear.length > 0 && (
        <ul className="mt-2 divide-y divide-tinta/5">
          {campo.aCrear.map((v) => (
            <li key={v.texto} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="text-tinta">{v.texto}</span>
              <span className="text-xs tabular-nums text-tinta/50">
                {v.apariciones} {v.apariciones === 1 ? "prenda" : "prendas"}
              </span>
              {v.propuesta?.universalNombre ? (
                <span className="label-cayla inline-flex items-center rounded-full border border-sand bg-crema px-3 py-1 text-[11px] text-tinta/75">
                  se agrupa bajo {etiquetaCorta(v.propuesta.universalNombre)}
                </span>
              ) : (
                <span className="label-cayla inline-flex items-center rounded-full border border-ambar/30 bg-ambar/10 px-3 py-1 text-[11px] text-ambar-profundo">
                  sin agrupar
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {campo.yaExisten.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setVerExistentes((v) => !v)}
            className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo"
          >
            {verExistentes ? "Ocultar" : "Ver"} los {campo.yaExisten.length} que ya tenías
          </button>
          {verExistentes && (
            <ul className="anim-revelar mt-1 space-y-0.5 text-xs text-tinta/65">
              {campo.yaExisten.map((v) => (
                <li key={v.texto}>
                  {v.texto} → {v.existente?.nombre}{" "}
                  <span className="tabular-nums text-tinta/50">({v.apariciones})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [revisando, setRevisando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importado, setImportado] = useState<Importado | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [deshecha, setDeshecha] = useState<number | null>(null);
  // UN token por revisión, no por clic: si la conexión se corta después de que
  // la base confirmó, el reintento lleva el mismo token y el RPC devuelve la
  // importación que ya entró en vez de meter el catálogo dos veces (0057; el
  // mismo mecanismo que ADR-0034 en ventas).
  const [token, setToken] = useState<string | null>(null);

  async function revisar() {
    setRevisando(true);
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
      setToken(crypto.randomUUID());
    } catch {
      setError("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRevisando(false);
    }
  }

  async function importar() {
    if (!r) return;
    setImportando(true);
    setError(null);
    try {
      const res = await fetch("/api/importacion/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
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
      setError(
        "No se pudo hablar con el servidor. Vuelve a apretar Importar: si el catálogo alcanzó a entrar, el sistema lo reconoce y no lo repite."
      );
    } finally {
      setImportando(false);
    }
  }

  async function deshacer() {
    if (!importado) return;
    if (
      !window.confirm(
        `¿Deshacer la importación? Las ${importado.productos} prendas quedan descontinuadas — no se borran — y los colores y categorías nuevos se conservan.`
      )
    ) {
      return;
    }
    setDeshaciendo(true);
    setError(null);
    try {
      const res = await fetch("/api/importacion/deshacer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importacionId: importado.importacionId }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? "No se pudo deshacer.");
        return;
      }
      setDeshecha(Number(datos.descontinuados ?? 0));
    } catch {
      setError("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setDeshaciendo(false);
    }
  }

  // ---------- ya se deshizo ----------
  if (importado && deshecha !== null) {
    return (
      <section className="anim-entrada card-cayla p-5">
        <span className="label-cayla inline-flex items-center rounded-full border border-ambar/30 bg-ambar/10 px-3 py-1 text-[11px] text-ambar-profundo">
          Importación deshecha
        </span>
        <p className="font-display mt-3 text-3xl text-tinta">
          {deshecha} <span className="text-lg text-tinta/65">{deshecha === 1 ? "prenda descontinuada" : "prendas descontinuadas"}</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-tinta/75">
          Nada se borró: las prendas siguen en el catálogo como descontinuadas, y los colores y categorías que
          se crearon se conservan en tu vocabulario. Para volver a intentarlo, sube el archivo de nuevo.
        </p>
      </section>
    );
  }

  // ---------- ya se importó: la pantalla termina acá ----------
  if (importado) {
    return (
      <section className="anim-entrada card-cayla p-5">
        <span className="label-cayla inline-flex items-center rounded-full border border-verde/45 bg-verde/10 px-3 py-1 text-[11px] text-verde-profundo">
          {importado.repetida ? "Ya estaba importado" : "Catálogo importado"}
        </span>
        {importado.repetida && (
          <p className="mt-2 text-xs text-tinta/75">
            El intento anterior sí había entrado: esto es lo que ya está en el catálogo. No se importó dos veces.
          </p>
        )}
        <p className="font-display mt-3 text-3xl text-tinta">
          {importado.productos} <span className="text-lg text-tinta/65">prendas</span>{" "}
          <span className="text-tinta/35">·</span> {importado.variantes}{" "}
          <span className="text-lg text-tinta/65">variantes</span>
        </p>
        <p className="mt-2 text-xs text-tinta/75">
          {importado.colores > 0 && <>{importado.colores} colores nuevos en tu vocabulario. </>}
          {importado.categorias > 0 && <>{importado.categorias} categorías nuevas. </>}
          {importado.duplicadas > 0 && (
            <>
              El archivo traía {importado.duplicadas} {importado.duplicadas === 1 ? "fila repetida" : "filas repetidas"}{" "}
              (misma prenda, talla y color): se dejó una de cada.{" "}
            </>
          )}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-tinta/75">
          Todo entró con stock en cero: las cantidades se levantan contando. Si algo salió mal se puede
          deshacer — las prendas quedan descontinuadas, nunca borradas.
        </p>
        {error && (
          <p className="anim-revelar mt-4 rounded-md border border-rojo/30 bg-rojo/10 px-4 py-3 text-xs text-rojo-profundo">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/inventario" className="contents">
            <Boton type="button" peso="primario">
              Ver el catálogo
            </Boton>
          </Link>
          <Link href="/inventario/conteo" className="contents">
            <Boton type="button" peso="fantasma">
              Ir a contar
            </Boton>
          </Link>
          <Boton type="button" peso="discreto" cargando={deshaciendo} onClick={() => void deshacer()}>
            Deshacer esta importación
          </Boton>
        </div>
      </section>
    );
  }

  const nuevos = r ? r.colores.aCrear.length + r.categorias.aCrear.length : 0;

  return (
    <section className="anim-entrada card-cayla p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Paso 3</p>
          <h2 className="font-display mt-1 text-xl text-tinta">Colores y categorías</h2>
          {r ? (
            <p key={nuevos} className="anim-asentar mt-1 text-xs text-tinta/75">
              <span className="font-display text-base text-tinta">{r.total}</span> prendas ·{" "}
              {nuevos === 0
                ? "todo estaba ya en tu vocabulario"
                : `${nuevos} ${nuevos === 1 ? "valor nuevo" : "valores nuevos"} para tu vocabulario`}
            </p>
          ) : (
            <p className="mt-1 text-xs text-tinta/75">
              Los que ya usas se reconocen solos. Los nuevos se agregan con el nombre que tú les das.
            </p>
          )}
        </div>
        {!r && (
          <Boton type="button" peso="primario" cargando={revisando} onClick={() => void revisar()}>
            Revisar valores
          </Boton>
        )}
      </div>

      {error && (
        <p className="anim-revelar mt-4 rounded-md border border-rojo/30 bg-rojo/10 px-4 py-3 text-xs text-rojo-profundo">
          {error}
        </p>
      )}

      {r && (
        <div className="anim-velo mt-5 space-y-5">
          {r.aviso && (
            <p className="rounded-md border border-ambar/30 bg-ambar/10 px-4 py-3 text-xs text-ambar-profundo">{r.aviso}</p>
          )}

          <Grupo titulo="Colores" campo={r.colores} />
          <div className="border-t border-sand pt-4">
            <Grupo titulo="Categorías" campo={r.categorias} />
          </div>

          <p className="border-t border-sand pt-4 text-xs leading-relaxed text-tinta/65">
            Ninguno de estos nombres se pierde: se guardan tal como los escribes tú. Lo que se decide acá es
            bajo qué término del estándar se agrupan, para que el sistema los entienda.
          </p>

          {/* El botón que importa es el mismo que aprueba los valores de
              arriba. Un clic si todo está bien; nada entra en silencio. */}
          <div className="flex flex-wrap items-center gap-4">
            <Boton type="button" peso="primario" cargando={importando} onClick={() => void importar()}>
              Importar {r.total} prendas
            </Boton>
            <span className="text-xs text-tinta/65">Con stock en cero. Se puede deshacer.</span>
          </div>

          {r.uso && r.uso.costo > 0 && (
            <p className="text-[11px] text-tinta/50">
              {r.uso.entrada + r.uso.cacheLeido} tokens de entrada · {r.uso.salida} de salida ≈ ${r.uso.costo.toFixed(4)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
