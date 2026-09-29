"use client";

import { useMemo, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { NuevaMarcaForm, type MarcaGuardada } from "@/components/alta-producto/NuevaMarcaForm";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { proveedoresDeMarca, sugerenciasDeCategoria, type MarcaConProveedores, type MarcaOpcion, type ParejaUso, type ProveedorOpcion, type Vinculo } from "@/lib/marcas";
import { cuantasMarcas, opcionesDeParejas, separarPareja } from "@/lib/marca-proveedor-reglas";

// Elegir DE QUIÉN es un producto: marca y proveedor (ADR-0109). Una marca la
// pueden traer varios proveedores (raro, pero pasa con accesorios y chompas
// importadas), así que son dos datos con una regla: el proveedor tiene que
// traer esa marca — la base lo obliga con una llave compuesta.
//
// Spike Nuevo producto v2 (Felipe, 2026-09-28): en Nuevo producto, SOLO el buscador. Los chips de
// «lo más usado» en la categoría se apagan ahí con `sugerencias={false}`; Editar producto y el censo de
// Conteo los conservan (por defecto `true`): Felipe pidió quitarlos en el alta, no en otros módulos, y en el
// censo son el atajo de 300-900 escaneos. Se fueron para todos los pasos «¿cuál de sus proveedores?»:
// el buscador ofrece directamente las PAREJAS («CAYLA» · la trae Taller Lima),
// de la A a la Z, toda la lista al tocarlo y filtrada al escribir (sin tildes,
// por marca o por proveedor; con más de 50 se pagina sola, ADR-0209). Un toque y
// la pareja queda elegida — en el censo se usa 300-900 veces.
//
// Registrar lo que falta es la primera fila de la lista, fija arriba al bajar
// (`crearArriba`), y además un enlace siempre a la vista bajo el buscador. Los dos
// abren UN formulario, «Registrar marca o proveedor» (NuevaMarcaForm), que cubre
// marca nueva, proveedor nuevo y un proveedor más para una marca que ya existe.
// Mientras está abierto, el buscador se esconde.
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
  /** Parejas usadas en productos recientes de la categoría: los chips «Lo más usado» bajo el buscador. */
  usosCategoria: ParejaUso[];
  /** `false` apaga esos chips (Nuevo producto, spike v2). Por defecto se muestran, como antes. */
  sugerencias?: boolean;
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
  sugerencias = true,
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
  // null = no se está registrando nada; si no, con qué nombre de marca abre el formulario (lo tipeado en el buscador).
  const [creando, setCreando] = useState<{ nombre: string } | null>(null);

  const marcaPor = (id: string) => marcas.find((m) => m.id === id);
  const provPor = (id: string) => proveedores.find((p) => p.id === id);
  // Para que el formulario diga «CAYLA · ya existe. Hoy la traen …» y pregunte «¿no será CAYLA?» antes de crear otra.
  const marcasConProveedores = useMemo<MarcaConProveedores[]>(
    () =>
      marcas.map((m) => ({
        ...m,
        proveedores: proveedoresDeMarca(vinculos, m.id)
          .map((id) => proveedores.find((p) => p.id === id)?.nombre)
          .filter((n): n is string => Boolean(n)),
      })),
    [marcas, proveedores, vinculos]
  );
  const opciones = useMemo(() => opcionesDeParejas(marcas, proveedores, vinculos), [marcas, proveedores, vinculos]);
  const sugeridas = useMemo(
    () => (sugerencias ? sugerenciasDeCategoria(usosCategoria, marcas, proveedores) : []),
    [sugerencias, usosCategoria, marcas, proveedores]
  );

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
    onElegirProp(r.marcaId, r.proveedorId, { marca: r.marcaNombre, proveedor: r.proveedorNombre });
  }

  // ---------- ya elegidos ----------
  // Como el spike: la pareja en una línea y «Cambiar». Sumarle otro proveedor a la marca elegida ya no necesita un
  // atajo propio: «Cambiar» → «¿No está?» abre el formulario que lo cubre.
  if (marcaId && proveedorId && !creando) {
    const m = marcaPor(marcaId);
    const p = provPor(proveedorId);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-hueso px-3 py-2.5">
        <p className="min-w-0 text-sm text-tinta">
          <span className="font-semibold">{m?.nombre ?? nombresIniciales?.marca ?? "Marca"}</span>
          <span className="text-taupe"> · la trae {p?.nombre ?? nombresIniciales?.proveedor ?? "Proveedor"}</span>
        </p>
        <button type="button" onClick={onLimpiar} className="btn-cayla btn-enlace ml-auto text-[12.5px]">
          Cambiar
        </button>
      </div>
    );
  }

  // ---------- registrar marca o proveedor sin salir ----------
  if (creando) {
    return (
      <NuevaMarcaForm
        proveedores={proveedores}
        marcas={marcasConProveedores}
        nombreInicial={creando.nombre}
        textoGuardar="Registrar y elegir"
        onGuardado={alGuardarNueva}
        onCancelar={() => setCreando(null)}
      />
    );
  }

  // ---------- nada elegido: solo el buscador ----------
  const total = cuantasMarcas(opciones);
  return (
    <div className="space-y-1.5">
      <ComboBuscable
        id="buscar-marca"
        caja
        etiquetaAccesible="Buscar una marca o un proveedor"
        marcador={total > 0 ? `Toca para ver las ${total} marcas, o escribe la marca o el proveedor…` : "Escribe la marca o el proveedor…"}
        valor=""
        onValor={(v) => {
          const { marcaId: m, proveedorId: p } = separarPareja(v);
          onElegirProp(m, p, { marca: marcaPor(m)?.nombre ?? "", proveedor: provPor(p)?.nombre ?? "" });
        }}
        opciones={opciones}
        crearArriba
        crear={
          puedeCrear
            ? {
                etiqueta: (q) => (q ? `+ Registrar «${q}» como marca nueva` : "+ Registrar una marca o un proveedor nuevo"),
                onCrear: (q) => setCreando({ nombre: q }),
              }
            : undefined
        }
      />
      {sugeridas.length > 0 && (
        <div className="space-y-1.5 pt-1.5">
          <p className="label-cayla text-[11px] text-tinta/60">{categoriaNombre ? `Lo más usado en ${categoriaNombre}` : "Lo más usado"}</p>
          <div className="flex flex-wrap gap-1.5">
            {sugeridas.map((s) => (
              <ChipOpcion
                key={`${s.marca.id}|${s.proveedor.id}`}
                elegido={false}
                onClick={() => onElegirProp(s.marca.id, s.proveedor.id, { marca: s.marca.nombre, proveedor: s.proveedor.nombre })}
              >
                {s.marca.nombre}
                <span className="text-tinta/45">·</span>
                <span className="text-tinta/70">{s.proveedor.nombre}</span>
              </ChipOpcion>
            ))}
          </div>
        </div>
      )}
      {puedeCrear ? (
        <p className="text-xs text-taupe">
          ¿No está?{" "}
          <button type="button" onClick={() => setCreando({ nombre: "" })} className="btn-cayla btn-enlace text-xs">
            + Registrar una marca o un proveedor nuevo
          </button>
        </p>
      ) : (
        <p className="text-xs text-taupe">¿Falta una marca? Pídele a un Líder que la agregue.</p>
      )}
    </div>
  );
}
