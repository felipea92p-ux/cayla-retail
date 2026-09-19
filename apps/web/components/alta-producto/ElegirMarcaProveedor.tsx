"use client";

import { useMemo, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { NuevaMarcaForm, type MarcaGuardada } from "@/components/alta-producto/NuevaMarcaForm";
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
// recargar, y se le AVISAN al padre (`onListas`): el padre puede desmontar este
// selector (el censo lo monta de nuevo en cada escaneo, «crear otro parecido»
// vuelve al formulario) y, si no guardara las listas, lo recién creado dejaría
// de existir en pantalla aunque la base lo tenga. Crear marcas/proveedores es de
// Líder: quien no lo es no ve los atajos (`puedeCrear`) y la base lo rechazaría igual.

type Props = {
  marcas: MarcaOpcion[];
  proveedores: ProveedorOpcion[];
  vinculos: Vinculo[];
  /** Parejas usadas en productos recientes de la categoría elegida (para sugerir). */
  usosCategoria: ParejaUso[];
  categoriaNombre?: string;
  /** Nombres de la pareja YA guardada (edición): se muestran aunque la marca o el proveedor estén hoy desactivados y no vengan en las listas activas. */
  nombresIniciales?: { marca: string; proveedor: string };
  marcaId: string;
  proveedorId: string;
  /** Devuelve también los NOMBRES: lo recién creado acá adentro no está en las listas del padre. */
  onElegir: (marcaId: string, proveedorId: string, nombres: { marca: string; proveedor: string }) => void;
  onLimpiar: () => void;
  /** Las listas ya con lo recién creado, para que el padre las conserve si desmonta este selector. */
  onListas?: (listas: { marcas: MarcaOpcion[]; proveedores: ProveedorOpcion[]; vinculos: Vinculo[] }) => void;
  puedeCrear: boolean;
};

export function ElegirMarcaProveedor({
  marcas: marcasIni,
  proveedores: proveedoresIni,
  vinculos: vinculosIni,
  usosCategoria,
  categoriaNombre,
  nombresIniciales,
  marcaId,
  proveedorId,
  onElegir: onElegirProp,
  onLimpiar,
  onListas,
  puedeCrear,
}: Props) {
  const [marcas, setMarcas] = useState(marcasIni);
  const [proveedores, setProveedores] = useState(proveedoresIni);
  const [vinculos, setVinculos] = useState(vinculosIni);
  const [consulta, setConsulta] = useState("");
  const [marcaTentativa, setMarcaTentativa] = useState<string | null>(null);
  const [provTentativo, setProvTentativo] = useState<string | null>(null);
  // null = no se está creando nada; si no, con qué se abre el formulario (marca nueva, solo otro proveedor para una marca, o la primera marca de un proveedor que no trae ninguna).
  const [creando, setCreando] = useState<{ nombre: string; marcaFija: boolean; proveedorFijo?: ProveedorOpcion } | null>(null);

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

  function alGuardarNueva(r: MarcaGuardada) {
    const proveedoresNuevos =
      r.proveedorNuevo && !proveedores.some((p) => p.id === r.proveedorId) ? [...proveedores, { id: r.proveedorId, nombre: r.proveedorNombre }] : proveedores;
    const marcasNuevas = marcas.some((m) => m.id === r.marcaId) ? marcas : [...marcas, { id: r.marcaId, nombre: r.marcaNombre }];
    const vinculosNuevos = vinculos.some((v) => v.marcaId === r.marcaId && v.proveedorId === r.proveedorId)
      ? vinculos
      : [...vinculos, { marcaId: r.marcaId, proveedorId: r.proveedorId }];
    setProveedores(proveedoresNuevos);
    setMarcas(marcasNuevas);
    setVinculos(vinculosNuevos);
    onListas?.({ marcas: marcasNuevas, proveedores: proveedoresNuevos, vinculos: vinculosNuevos });
    avisar.exito(`${r.marcaNombre} · ${r.proveedorNombre}`, { detalle: "Marca y proveedor guardados." });
    setCreando(null);
    limpiarTentativas();
    onElegir(r.marcaId, r.proveedorId, { marca: r.marcaNombre, proveedor: r.proveedorNombre });
  }

  // ---------- ya elegidos ----------
  if (marcaId && proveedorId && !creando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-tinta/20 bg-tinta/[0.03] px-3 py-2.5">
        <p className="text-sm text-tinta">
          <span className="font-medium">{marcaPor(marcaId)?.nombre ?? nombresIniciales?.marca ?? "Marca"}</span>
          <span className="text-tinta/45"> · </span>
          <span className="text-tinta/80">{provPor(proveedorId)?.nombre ?? nombresIniciales?.proveedor ?? "Proveedor"}</span>
        </p>
        <button type="button" onClick={onLimpiar} className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo">
          Cambiar
        </button>
      </div>
    );
  }

  // ---------- crear marca / proveedor sin salir ----------
  if (creando) {
    return (
      <NuevaMarcaForm
        proveedores={proveedores}
        nombreInicial={creando.nombre}
        marcaFija={creando.marcaFija}
        proveedorFijo={creando.proveedorFijo}
        nombreExistente={(n) => marcas.find((m) => sinTildes(m.nombre) === sinTildes(n))?.nombre}
        onGuardado={alGuardarNueva}
        onCancelar={() => setCreando(null)}
      />
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
              onClick={() => setCreando({ nombre: m.nombre, marcaFija: true })}
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
    // Un proveedor recién registrado (o cuyas marcas se desactivaron) no trae ninguna marca todavía: sin una salida
    // acá, la persona quedaba frente a una lista vacía y un solo botón, «Cambiar proveedor».
    const sinMarcas = ms.length === 0;
    return (
      <div className="space-y-3">
        <p className="text-sm text-tinta">
          {sinMarcas ? (
            <>
              <span className="font-medium">{p?.nombre}</span> todavía no trae ninguna marca.
            </>
          ) : (
            <>
              <span className="font-medium">{p?.nombre}</span> trae varias marcas. ¿Cuál es?
            </>
          )}
        </p>
        {!sinMarcas && (
          <div className="flex flex-wrap gap-1.5">
            {ms.map((m) => (
              <ChipOpcion key={m.id} elegido={false} onClick={() => (limpiarTentativas(), onElegir(m.id, provTentativo))}>
                {m.nombre}
              </ChipOpcion>
            ))}
          </div>
        )}
        <div className="flex gap-4">
          {puedeCrear && p && (
            <button
              type="button"
              onClick={() => setCreando({ nombre: "", marcaFija: false, proveedorFijo: p })}
              className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo"
            >
              {sinMarcas ? `+ Primera marca de ${p.nombre}` : `+ Otra marca de ${p.nombre}`}
            </button>
          )}
          <button type="button" onClick={limpiarTentativas} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
            Cambiar proveedor
          </button>
        </div>
        {sinMarcas && !puedeCrear && <p className="text-xs text-tinta/55">Pídele a un Líder que le agregue la marca.</p>}
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <button type="button" onClick={() => setCreando({ nombre: consulta.trim(), marcaFija: false })} className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo">
            + Nueva marca{consulta.trim() ? ` «${consulta.trim()}»` : ""}
          </button>
          <a href="/productos/marcas" target="_blank" rel="noreferrer" className="label-cayla text-[11px] text-tinta/50 underline underline-offset-4 hover:text-rojo">
            Administrar marcas
          </a>
        </div>
      ) : (
        <p className="text-xs text-tinta/55">¿Falta una marca? Pídele a un Líder que la agregue.</p>
      )}
    </div>
  );
}
