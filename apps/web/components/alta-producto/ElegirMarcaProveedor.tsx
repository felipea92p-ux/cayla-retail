"use client";

import { useMemo, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { NuevaMarcaForm, type MarcaGuardada } from "@/components/alta-producto/NuevaMarcaForm";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { proveedoresDeMarca, sugerenciasDeCategoria, type MarcaConProveedores, type MarcaOpcion, type ParejaUso, type ProveedorOpcion, type Vinculo } from "@/lib/marcas";
import { alElegirMarca, alElegirProveedor, opcionesDeMarca, opcionesDeProveedor, type CambioDePareja, type ParejaElegida } from "@/lib/marca-proveedor-reglas";

// Elegir DE QUIÉN es un producto: marca y proveedor (ADR-0109). Una marca la pueden traer varios proveedores (raro, pero pasa
// con accesorios y chompas importadas), así que son dos datos con una regla: si hay LOS DOS, el proveedor tiene que traer esa
// marca — la base lo obliga con una llave compuesta.
//
// Marca y proveedor por separado (Felipe, 2026-09-29, ADR-0283). La mercadería llega a almacén antes de que alguien registre de
// quién es o quién la trajo; el producto se crea igual y se completa después. Por eso ya no es «una pareja o nada» (un solo
// buscador de parejas, spike v2 de 2026-09-28): son DOS campos, cada uno opcional, y cada uno recorta y completa al otro:
//   · elegir la marca pone arriba, en el proveedor, a quienes la traen (los demás siguen abajo), y si la trae uno solo, lo pone;
//   · elegir el proveedor pone arriba las marcas que trae, y si trae una sola, la pone;
//   · si lo que ya estaba elegido no es compatible con lo nuevo, se suelta y la pantalla lo dice en una línea.
// Las reglas viven en `lib/marca-proveedor-reglas.ts` (puras, probadas); este archivo solo las pinta.
//
// `opcional`: Nuevo producto y Editar producto lo pasan (pueden quedar vacíos). El censo de Conteo no: ahí siguen siendo
// obligatorios (los exige su propia pantalla) y los dos campos se ven igual, sin la frase «Opcional».
// `guardado`: en Editar, lo que el producto YA tiene. Un valor guardado se puede cambiar por otro, no quitar (regla «no
// empeora»: la base tampoco deja borrarlo); por eso ese campo no ofrece «Quitar».
//
// Los chips «Lo más usado» de la categoría siguen existiendo con `sugerencias` (por defecto sí): en el censo son el atajo
// de 300-900 escaneos y llenan los dos campos de un toque; Nuevo producto los apaga (`sugerencias={false}`).
//
// Registrar lo que falta: la primera fila de cada lista (`crearArriba`) y un enlace siempre a la vista bajo los campos abren
// UN formulario, «Registrar marca o proveedor» (NuevaMarcaForm): marca nueva, proveedor nuevo o un proveedor más para una marca
// que ya existe. Mientras está abierto, los campos se esconden.
//
// Las listas viven acá (copia local) para que lo recién creado aparezca sin recargar, y se le AVISAN al padre (`onListas`):
// el padre puede desmontar este selector (el censo lo monta de nuevo en cada escaneo; «crear otro parecido» vuelve al
// formulario) y, si no guardara las listas, lo recién creado dejaría de existir en pantalla aunque la base lo tenga. Crear
// marcas/proveedores es de Líder: quien no lo es no ve los atajos (`puedeCrear`) y la base lo rechazaría igual.

type Props = {
  marcas: MarcaOpcion[];
  proveedores: ProveedorOpcion[];
  vinculos: Vinculo[];
  /** Parejas usadas en productos recientes de la categoría: los chips «Lo más usado» bajo los campos. */
  usosCategoria: ParejaUso[];
  /** `false` apaga esos chips (Nuevo producto, spike v2). Por defecto se muestran, como antes. */
  sugerencias?: boolean;
  categoriaNombre?: string;
  /** Nombres de lo YA guardado (edición): se muestran aunque la marca o el proveedor estén hoy desactivados y no vengan en las listas activas. */
  nombresIniciales?: { marca: string; proveedor: string };
  /** «» = todavía nada. */
  marcaId: string;
  proveedorId: string;
  /** Devuelve también los NOMBRES: lo recién creado acá adentro no está en las listas del padre. Cualquiera de los dos ids puede ser «». */
  onElegir: (marcaId: string, proveedorId: string, nombres: { marca: string; proveedor: string }) => void;
  /** Ya no se llama: quitar un campo es `onElegir` con «» en ese campo. Sigue en el tipo para no obligar a los que aún lo pasan. */
  onLimpiar?: () => void;
  /** Las listas ya con lo recién creado, para que el padre las conserve si desmonta este selector. */
  onListas?: (listas: { marcas: MarcaOpcion[]; proveedores: ProveedorOpcion[]; vinculos: Vinculo[] }) => void;
  puedeCrear: boolean;
  /** Pueden quedar vacíos (ADR-0283). Sin esto, la pantalla que lo usa los sigue exigiendo. */
  opcional?: boolean;
  /** Lo que el producto ya tiene guardado: ese campo se cambia, no se quita. */
  guardado?: ParejaElegida;
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
  onListas,
  puedeCrear,
  opcional = false,
  guardado,
}: Props) {
  const [marcas, setMarcas] = useState(marcasIni);
  const [proveedores, setProveedores] = useState(proveedoresIni);
  const [vinculos, setVinculos] = useState(vinculosIni);
  // null = no se está registrando nada; si no, con qué nombre de marca abre el formulario (lo tipeado en el buscador).
  const [creando, setCreando] = useState<{ nombre: string } | null>(null);
  // La línea que explica lo que se soltó o se puso solo tras el último toque; se apaga con el toque siguiente.
  const [nota, setNota] = useState<string | null>(null);

  const marcaPor = (id: string) => marcas.find((m) => m.id === id);
  const provPor = (id: string) => proveedores.find((p) => p.id === id);
  // Un id que no está en las listas activas (lo ya guardado, hoy desactivado) se nombra con `nombresIniciales`.
  const nombreMarca = (id: string) => (id ? (marcaPor(id)?.nombre ?? nombresIniciales?.marca ?? "") : "");
  const nombreProv = (id: string) => (id ? (provPor(id)?.nombre ?? nombresIniciales?.proveedor ?? "") : "");
  const pareja: ParejaElegida = { marcaId, proveedorId };

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
  // Una marca o un proveedor ya guardado que hoy no viene en las listas activas se conserva en la suya, para que el campo lo muestre.
  const conservarMarca = marcaId && !marcas.some((m) => m.id === marcaId) ? { id: marcaId, nombre: nombresIniciales?.marca || "Marca" } : null;
  const conservarProv = proveedorId && !proveedores.some((p) => p.id === proveedorId) ? { id: proveedorId, nombre: nombresIniciales?.proveedor || "Proveedor" } : null;
  const opcionesMarca = opcionesDeMarca(marcas, proveedores, vinculos, proveedorId, conservarMarca);
  const opcionesProv = opcionesDeProveedor(marcas, proveedores, vinculos, marcaId, conservarProv);
  const sugeridas = useMemo(
    () => (sugerencias ? sugerenciasDeCategoria(usosCategoria, marcas, proveedores) : []),
    [sugerencias, usosCategoria, marcas, proveedores]
  );

  function emitir(nueva: ParejaElegida, nombres?: { marca: string; proveedor: string }) {
    onElegirProp(nueva.marcaId, nueva.proveedorId, nombres ?? { marca: nombreMarca(nueva.marcaId), proveedor: nombreProv(nueva.proveedorId) });
  }

  /** La frase que dice, con nombres, lo que pasó además de lo que la persona tocó. */
  function explicar(r: CambioDePareja, antes: ParejaElegida, tocada: "marca" | "proveedor"): string | null {
    const marcaN = nombreMarca(r.pareja.marcaId);
    const provN = nombreProv(r.pareja.proveedorId);
    if (tocada === "marca") {
      if (r.solto === "proveedor" && r.puestoSolo === "proveedor") return `${nombreProv(antes.proveedorId)} no trae ${marcaN}: puse a ${provN}, que sí la trae.`;
      if (r.solto === "proveedor") return `${nombreProv(antes.proveedorId)} no trae ${marcaN}: lo quité. Elige quién la trae.`;
      if (r.puestoSolo === "proveedor") return `Puse a ${provN} como proveedor: es el único que trae ${marcaN}.`;
      return null;
    }
    if (r.solto === "marca" && r.puestoSolo === "marca") return `${provN} no trae ${nombreMarca(antes.marcaId)}: puse ${marcaN}, la única que trae.`;
    if (r.solto === "marca") return `${provN} no trae ${nombreMarca(antes.marcaId)}: la quité. Elige cuál marca trae.`;
    if (r.puestoSolo === "marca") return `Puse ${marcaN} como marca: es la única que trae ${provN}.`;
    return null;
  }

  function elegirMarca(id: string) {
    const r = alElegirMarca(pareja, id, vinculos);
    setNota(explicar(r, pareja, "marca"));
    emitir(r.pareja);
  }
  function elegirProveedor(id: string) {
    const r = alElegirProveedor(pareja, id, vinculos);
    setNota(explicar(r, pareja, "proveedor"));
    emitir(r.pareja);
  }
  function elegirSugerida(marca: MarcaOpcion, proveedor: ProveedorOpcion) {
    setNota(null);
    emitir({ marcaId: marca.id, proveedorId: proveedor.id }, { marca: marca.nombre, proveedor: proveedor.nombre });
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
    setNota(null);
    emitir({ marcaId: r.marcaId, proveedorId: r.proveedorId }, { marca: r.marcaNombre, proveedor: r.proveedorNombre });
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

  // ---------- los dos campos ----------
  // Se puede quitar lo elegido si el campo es opcional y no es algo que el producto ya tenía guardado.
  const puedeQuitarMarca = opcional && Boolean(marcaId) && !guardado?.marcaId;
  const puedeQuitarProv = opcional && Boolean(proveedorId) && !guardado?.proveedorId;
  const totalMarcas = opcionesMarca.length;
  const totalProv = opcionesProv.length;
  const crear = (etiqueta: (q: string) => string) =>
    puedeCrear ? { etiqueta, onCrear: (q: string) => setCreando({ nombre: q }) } : undefined;
  const sinNada = !marcaId && !proveedorId;
  // Lo que dice el campo vacío: cuántas hay y, si el otro campo ya está elegido, que sus compatibles van arriba. La lista
  // ofrece TODAS (lib/marca-proveedor-reglas.ts, `primeroLasCompatibles`): no se promete «la única» cuando hay más.
  const traeAlguna = vinculos.some((v) => v.proveedorId === proveedorId);
  const laTraeAlguien = vinculos.some((v) => v.marcaId === marcaId);
  const marcadorMarca = proveedorId && traeAlguna
    ? `Primero las que trae ${nombreProv(proveedorId)}…`
    : totalMarcas === 0 ? "Escribe la marca…" : totalMarcas === 1 ? "Toca para ver la marca…" : `Toca para ver las ${totalMarcas} marcas…`;
  const marcadorProveedor = marcaId && laTraeAlguien
    ? `Primero quienes traen ${nombreMarca(marcaId)}…`
    : totalProv === 0 ? "Escribe el proveedor…" : totalProv === 1 ? "Toca para ver el proveedor…" : `Toca para ver los ${totalProv} proveedores…`;

  return (
    // `@container`: marca y proveedor van lado a lado solo si caben, según el ancho de este bloque y no el de la ventana (en
    // Editar producto, con el menú lateral abierto, dos columnas de 165 px cortaban «Toca para ver la ma…»).
    <div className="@container space-y-2">
      <div className="grid gap-x-3 gap-y-2.5 @lg:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="buscar-marca" className="label-cayla text-[11px] text-tinta/70">
              Marca
            </label>
            {puedeQuitarMarca && (
              <button type="button" onClick={() => elegirMarca("")} className="btn-cayla btn-enlace text-[12px]">
                Quitar
              </button>
            )}
          </div>
          <ComboBuscable
            id="buscar-marca"
            caja
            etiquetaAccesible="Marca"
            marcador={marcadorMarca}
            valor={marcaId}
            onValor={elegirMarca}
            opciones={opcionesMarca}
            crearArriba
            crear={crear((q) => (q ? `+ Registrar «${q}» como marca nueva` : "+ Registrar una marca o un proveedor nuevo"))}
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="buscar-proveedor" className="label-cayla text-[11px] text-tinta/70">
              Proveedor
            </label>
            {puedeQuitarProv && (
              <button type="button" onClick={() => elegirProveedor("")} className="btn-cayla btn-enlace text-[12px]">
                Quitar
              </button>
            )}
          </div>
          <ComboBuscable
            id="buscar-proveedor"
            caja
            etiquetaAccesible="Proveedor"
            marcador={marcadorProveedor}
            valor={proveedorId}
            onValor={elegirProveedor}
            opciones={opcionesProv}
            crearArriba
            crear={crear((q) => (q ? `+ Registrar «${q}» como proveedor nuevo` : "+ Registrar una marca o un proveedor nuevo"))}
          />
        </div>
      </div>

      {/* Lo que se soltó o se puso solo: sin esto, un campo que cambia solo parece un error. */}
      {nota && (
        <p className="rounded-lg bg-hueso px-3 py-2 text-[12.5px] text-tinta/80" role="status">
          {nota}
        </p>
      )}
      {opcional && sinNada && !nota && (
        <p className="text-xs text-taupe">Opcional: si todavía no los sabes, sigue sin elegirlos y complétalos después, en Editar.</p>
      )}

      {sinNada && sugeridas.length > 0 && (
        <div className="space-y-1.5 pt-1.5">
          <p className="label-cayla text-[11px] text-tinta/60">{categoriaNombre ? `Lo más usado en ${categoriaNombre}` : "Lo más usado"}</p>
          <div className="flex flex-wrap gap-1.5">
            {sugeridas.map((s) => (
              <ChipOpcion key={`${s.marca.id}|${s.proveedor.id}`} elegido={false} onClick={() => elegirSugerida(s.marca, s.proveedor)}>
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
          <button type="button" onClick={() => setCreando({ nombre: "" })} className="btn-cayla btn-enlace whitespace-normal text-left text-xs">
            + Registrar una marca o un proveedor nuevo
          </button>
        </p>
      ) : (
        <p className="text-xs text-taupe">
          {opcional ? "¿Falta una marca? Déjala vacía y pídele a un Líder que la agregue: la completas después." : "¿Falta una marca? Pídele a un Líder que la agregue."}
        </p>
      )}
    </div>
  );
}
