"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import {
  buscarMarcaProveedor,
  marcaAutomatica,
  marcasDeProveedor,
  proveedorAutomatico,
  proveedoresDeMarca,
  sinTildes,
  sugerenciasDeCategoria,
  type MarcaOpcion,
  type ParejaUso,
  type ProveedorOpcion,
  type Vinculo,
} from "@/lib/marcas";

// Elegir DE QUIÉN es un producto: marca y proveedor (ADR-0109). Una marca la
// pueden traer varios proveedores (raro, pero pasa con accesorios y chompas
// importadas), así que son dos datos con una regla: el proveedor tiene que
// traer esa marca — la base lo obliga con una llave compuesta.
//
// Hecho para ir RÁPIDO, porque en el censo se usa 300-900 veces:
//   1. sugerencias — las parejas más usadas en esta categoría, un toque;
//   2. una sola caja busca marcas y proveedores a la vez (sin tildes);
//   3. si la marca la trae UN solo proveedor, se elige sola (y a la inversa);
//   4. si falta algo, "+ Nueva marca" / "+ Nuevo proveedor" sin salir.
//
// Las listas viven acá (copia local) para que lo recién creado aparezca sin
// recargar. Crear marcas/proveedores es de Líder: quien no lo es no ve los
// atajos (`puedeCrear`) y la base lo rechazaría igual.

type Props = {
  marcas: MarcaOpcion[];
  proveedores: ProveedorOpcion[];
  vinculos: Vinculo[];
  /** Parejas usadas en productos recientes de la categoría elegida (para sugerir). */
  usosCategoria: ParejaUso[];
  categoriaNombre?: string;
  marcaId: string;
  proveedorId: string;
  /** Devuelve también los NOMBRES: lo recién creado acá adentro no está en las listas del padre. */
  onElegir: (marcaId: string, proveedorId: string, nombres: { marca: string; proveedor: string }) => void;
  onLimpiar: () => void;
  puedeCrear: boolean;
};

type Borrador = {
  nombreMarca: string;
  /** Marca ya existente a la que solo se le suma proveedor: el nombre no se toca. */
  marcaFija: boolean;
  modoProveedor: "existente" | "nuevo";
  proveedorId: string;
  provNombre: string;
  provRuc: string;
};

export function ElegirMarcaProveedor({
  marcas: marcasIni,
  proveedores: proveedoresIni,
  vinculos: vinculosIni,
  usosCategoria,
  categoriaNombre,
  marcaId,
  proveedorId,
  onElegir: onElegirProp,
  onLimpiar,
  puedeCrear,
}: Props) {
  const [marcas, setMarcas] = useState(marcasIni);
  const [proveedores, setProveedores] = useState(proveedoresIni);
  const [vinculos, setVinculos] = useState(vinculosIni);
  const [consulta, setConsulta] = useState("");
  const [marcaTentativa, setMarcaTentativa] = useState<string | null>(null);
  const [provTentativo, setProvTentativo] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marcaPor = (id: string) => marcas.find((m) => m.id === id);
  const provPor = (id: string) => proveedores.find((p) => p.id === id);
  const sugeridas = useMemo(() => sugerenciasDeCategoria(usosCategoria, marcas, proveedores), [usosCategoria, marcas, proveedores]);
  const resultados = useMemo(() => buscarMarcaProveedor(consulta, marcas, proveedores, vinculos), [consulta, marcas, proveedores, vinculos]);
  function onElegir(m: string, p: string, nombres?: { marca: string; proveedor: string }) {
    onElegirProp(m, p, nombres ?? { marca: marcaPor(m)?.nombre ?? "", proveedor: provPor(p)?.nombre ?? "" });
  }
  const usosDe = (m: string, p: string) => usosCategoria.find((u) => u.marcaId === m && u.proveedorId === p)?.usos ?? 0;

  function limpiarTentativas() {
    setMarcaTentativa(null);
    setProvTentativo(null);
    setConsulta("");
  }

  function elegirMarca(id: string) {
    const auto = proveedorAutomatico(vinculos, id);
    if (auto) {
      limpiarTentativas();
      onElegir(id, auto);
    } else {
      setProvTentativo(null);
      setMarcaTentativa(id);
      setConsulta("");
    }
  }

  function elegirProveedor(id: string) {
    const auto = marcaAutomatica(vinculos, id);
    if (auto) {
      limpiarTentativas();
      onElegir(auto, id);
    } else {
      setMarcaTentativa(null);
      setProvTentativo(id);
      setConsulta("");
    }
  }

  function abrirNueva(partida: Partial<Borrador> = {}) {
    setError(null);
    setBorrador({ nombreMarca: "", marcaFija: false, modoProveedor: proveedores.length > 0 ? "existente" : "nuevo", proveedorId: "", provNombre: "", provRuc: "", ...partida });
  }

  async function guardarNueva() {
    if (!borrador || guardando) return;
    const nombreMarca = borrador.nombreMarca.trim();
    if (!nombreMarca) return setError("Escribe el nombre de la marca.");
    if (borrador.modoProveedor === "existente" && !borrador.proveedorId) return setError("Elige el proveedor que la trae.");
    if (borrador.modoProveedor === "nuevo" && !borrador.provNombre.trim()) return setError("Escribe el nombre del proveedor.");

    setGuardando(true);
    setError(null);
    const supabase = createClient();

    // Paso 1 (solo si el proveedor es nuevo): registrarlo con lo mínimo. Lo demás (contacto, banco, plazo) se completa en Compras.
    let provId = borrador.proveedorId;
    if (borrador.modoProveedor === "nuevo") {
      const { data, error: errProv } = await supabase.rpc("registrar_proveedor", {
        p_nombre: borrador.provNombre.trim(),
        p_ruc: borrador.provRuc.trim() || undefined,
      });
      if (errProv || !data) {
        setGuardando(false);
        return setError(traducirError(errProv, "registrar el proveedor"));
      }
      provId = data;
    }

    // Paso 2: la marca con su proveedor (si la marca ya existe, solo se le suma el proveedor).
    const { data: nuevaMarcaId, error: errMarca } = await supabase.rpc("crear_marca", { p_nombre: nombreMarca, p_proveedor_id: provId });
    setGuardando(false);
    if (errMarca || !nuevaMarcaId) {
      // Si el proveedor recién se registró y la marca falló, el proveedor YA existe: se dice, y reintentar es seguro.
      return setError(
        borrador.modoProveedor === "nuevo"
          ? `El proveedor se registró, pero la marca no se pudo guardar: ${traducirError(errMarca, "agregar la marca")} Reintenta: el proveedor ya está creado.`
          : traducirError(errMarca, "agregar la marca")
      );
    }

    const nombreMarcaFinal = marcas.find((m) => m.id === nuevaMarcaId)?.nombre ?? nombreMarca;
    const provNombre = borrador.modoProveedor === "nuevo" ? borrador.provNombre.trim() : (provPor(provId)?.nombre ?? "");
    if (borrador.modoProveedor === "nuevo") setProveedores((prev) => [...prev, { id: provId, nombre: provNombre }]);
    setMarcas((prev) => (prev.some((m) => m.id === nuevaMarcaId) ? prev : [...prev, { id: nuevaMarcaId, nombre: nombreMarca }]));
    setVinculos((prev) => (prev.some((v) => v.marcaId === nuevaMarcaId && v.proveedorId === provId) ? prev : [...prev, { marcaId: nuevaMarcaId, proveedorId: provId }]));
    avisar.exito(`${nombreMarca} · ${provNombre}`, { detalle: "Marca y proveedor guardados." });
    setBorrador(null);
    limpiarTentativas();
    onElegir(nuevaMarcaId, provId, { marca: nombreMarcaFinal, proveedor: provNombre });
  }

  // ---------- ya elegidos ----------
  if (marcaId && proveedorId && !borrador) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-tinta/20 bg-tinta/[0.03] px-3 py-2.5">
        <p className="text-sm text-tinta">
          <span className="font-medium">{marcaPor(marcaId)?.nombre ?? "Marca"}</span>
          <span className="text-tinta/45"> · </span>
          <span className="text-tinta/80">{provPor(proveedorId)?.nombre ?? "Proveedor"}</span>
        </p>
        <button type="button" onClick={onLimpiar} className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo">
          Cambiar
        </button>
      </div>
    );
  }

  // ---------- crear marca / proveedor sin salir ----------
  if (borrador) {
    return (
      <div className="space-y-3 rounded-md border border-tinta/20 p-4">
        <p className="label-cayla text-[11px] text-tinta/70">{borrador.marcaFija ? `Otro proveedor para ${borrador.nombreMarca}` : "Nueva marca"}</p>
        {!borrador.marcaFija && (
          <div>
            <label htmlFor="nueva-marca" className="text-xs text-tinta/60">
              Nombre de la marca
            </label>
            <input
              id="nueva-marca"
              autoFocus
              value={borrador.nombreMarca}
              onChange={(e) => setBorrador({ ...borrador, nombreMarca: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void guardarNueva())}
              className="mt-1 h-9 w-full border-b border-tinta/25 bg-transparent px-1 text-sm text-tinta outline-none focus:border-tinta"
            />
          </div>
        )}

        <div>
          <p className="text-xs text-tinta/60">¿Quién la trae?</p>
          <div className="mt-1.5 flex gap-1.5">
            <ChipOpcion elegido={borrador.modoProveedor === "existente"} onClick={() => setBorrador({ ...borrador, modoProveedor: "existente" })} disabled={proveedores.length === 0}>
              Un proveedor que ya tengo
            </ChipOpcion>
            <ChipOpcion elegido={borrador.modoProveedor === "nuevo"} onClick={() => setBorrador({ ...borrador, modoProveedor: "nuevo" })}>
              Un proveedor nuevo
            </ChipOpcion>
          </div>
        </div>

        {borrador.modoProveedor === "existente" ? (
          <div className="flex flex-wrap gap-1.5">
            {proveedores.map((p) => (
              <ChipOpcion key={p.id} elegido={borrador.proveedorId === p.id} onClick={() => setBorrador({ ...borrador, proveedorId: p.id })}>
                {p.nombre}
              </ChipOpcion>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nuevo-proveedor" className="text-xs text-tinta/60">
                Nombre del proveedor
              </label>
              <input
                id="nuevo-proveedor"
                value={borrador.provNombre}
                onChange={(e) => setBorrador({ ...borrador, provNombre: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void guardarNueva())}
                className="mt-1 h-9 w-full border-b border-tinta/25 bg-transparent px-1 text-sm text-tinta outline-none focus:border-tinta"
              />
            </div>
            <div>
              <label htmlFor="nuevo-ruc" className="text-xs text-tinta/60">
                RUC (opcional)
              </label>
              <input
                id="nuevo-ruc"
                inputMode="numeric"
                maxLength={11}
                value={borrador.provRuc}
                onChange={(e) => setBorrador({ ...borrador, provRuc: e.target.value.replace(/\D/g, "") })}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void guardarNueva())}
                className="mt-1 h-9 w-full border-b border-tinta/25 bg-transparent px-1 text-sm tabular-nums text-tinta outline-none focus:border-tinta"
              />
            </div>
            <p className="text-xs text-tinta/55 sm:col-span-2">Con esto alcanza para seguir; el contacto, el banco y el plazo se completan después en Compras.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-rojo-profundo">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void guardarNueva()}
            disabled={guardando}
            className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar y usar"}
          </button>
          <button type="button" onClick={() => setBorrador(null)} disabled={guardando} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ---------- una marca elegida, falta el proveedor ----------
  if (marcaTentativa) {
    const m = marcaPor(marcaTentativa);
    const provs = proveedoresDeMarca(vinculos, marcaTentativa)
      .map((id) => provPor(id))
      .filter((p): p is ProveedorOpcion => Boolean(p))
      .sort((a, b) => usosDe(marcaTentativa, b.id) - usosDe(marcaTentativa, a.id));
    return (
      <div className="space-y-3">
        <p className="text-sm text-tinta">
          <span className="font-medium">{m?.nombre}</span> la traen varios proveedores. ¿Cuál es esta vez?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {provs.map((p) => (
            <ChipOpcion key={p.id} elegido={false} onClick={() => (limpiarTentativas(), onElegir(marcaTentativa, p.id))}>
              {p.nombre}
              {usosDe(marcaTentativa, p.id) > 0 && <span className="text-[11px] text-tinta/50">· lo más usado</span>}
            </ChipOpcion>
          ))}
        </div>
        <div className="flex gap-4">
          {puedeCrear && m && (
            <button
              type="button"
              onClick={() => abrirNueva({ nombreMarca: m.nombre, marcaFija: true })}
              className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo"
            >
              + Otro proveedor para {m.nombre}
            </button>
          )}
          <button type="button" onClick={limpiarTentativas} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
            Cambiar marca
          </button>
        </div>
      </div>
    );
  }

  // ---------- un proveedor elegido, falta la marca ----------
  if (provTentativo) {
    const p = provPor(provTentativo);
    const ms = marcasDeProveedor(vinculos, provTentativo)
      .map((id) => marcaPor(id))
      .filter((x): x is MarcaOpcion => Boolean(x))
      .sort((a, b) => usosDe(b.id, provTentativo) - usosDe(a.id, provTentativo));
    return (
      <div className="space-y-3">
        <p className="text-sm text-tinta">
          <span className="font-medium">{p?.nombre}</span> trae varias marcas. ¿Cuál es?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ms.map((m) => (
            <ChipOpcion key={m.id} elegido={false} onClick={() => (limpiarTentativas(), onElegir(m.id, provTentativo))}>
              {m.nombre}
            </ChipOpcion>
          ))}
        </div>
        <button type="button" onClick={limpiarTentativas} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
          Cambiar proveedor
        </button>
      </div>
    );
  }

  // ---------- nada elegido: sugerencias + búsqueda ----------
  return (
    <div className="space-y-4">
      {sugeridas.length > 0 && (
        <div className="space-y-1.5">
          <p className="label-cayla text-[11px] text-tinta/60">{categoriaNombre ? `Lo más usado en ${categoriaNombre}` : "Lo más usado"}</p>
          <div className="flex flex-wrap gap-1.5">
            {sugeridas.map((s) => (
              <ChipOpcion key={`${s.marca.id}|${s.proveedor.id}`} elegido={false} onClick={() => onElegir(s.marca.id, s.proveedor.id)}>
                {s.marca.nombre}
                <span className="text-tinta/45">·</span>
                <span className="text-tinta/70">{s.proveedor.nombre}</span>
              </ChipOpcion>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="buscar-marca" className="sr-only">
          Buscar una marca o un proveedor
        </label>
        <input
          id="buscar-marca"
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Busca una marca o un proveedor…"
          autoComplete="off"
          className="w-full rounded-md border border-tinta/15 bg-transparent px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/50 focus:border-tinta/50"
        />
        {sinTildes(consulta) && (
          <ul className="mt-2 divide-y divide-tinta/10 rounded-md border border-tinta/15">
            {resultados.length === 0 && <li className="px-3 py-2 text-sm text-tinta/60">Nada se llama así todavía.</li>}
            {resultados.map((r) => (
              <li key={r.tipo === "marca" ? `m-${r.marca.id}` : `p-${r.proveedor.id}`}>
                <button
                  type="button"
                  onClick={() => (r.tipo === "marca" ? elegirMarca(r.marca.id) : elegirProveedor(r.proveedor.id))}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-tinta hover:bg-tinta/[0.04]"
                >
                  <span>{r.tipo === "marca" ? r.marca.nombre : r.proveedor.nombre}</span>
                  <span className="text-xs text-tinta/55">
                    {r.tipo === "marca"
                      ? `Marca · ${r.proveedores.map((p) => p.nombre).join(", ") || "sin proveedor"}`
                      : `Proveedor · ${r.marcas.length} marca${r.marcas.length === 1 ? "" : "s"}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {puedeCrear ? (
        <button type="button" onClick={() => abrirNueva({ nombreMarca: consulta.trim() })} className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo">
          + Nueva marca{consulta.trim() ? ` «${consulta.trim()}»` : ""}
        </button>
      ) : (
        <p className="text-xs text-tinta/55">¿Falta una marca? Pídele a un Líder que la agregue.</p>
      )}
    </div>
  );
}
