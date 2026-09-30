"use client";

import { useId, useState } from "react";
import { ElegirMarcaProveedor } from "@/components/alta-producto/ElegirMarcaProveedor";
import { ComboResponsable } from "@/components/ComboResponsable";
import { avisar } from "@/components/ui/Avisos";
import { Campo, CampoSelect, CampoTexto, Desplegable } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { clave } from "@/lib/buscar-prenda-v2";
import { codigoDePrendaNueva, mensajeMezclaEnCenso, type PrendaConteo } from "@/lib/conteo-reglas";
import { traducirError } from "@/lib/error-escritura";
import type { CatalogoMarcas } from "@/lib/marcas-datos";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import type { ControlResponsable } from "@/lib/useResponsable";

/* ====================================================================
   AltaAlVuelo · dar de alta una prenda que la etiqueta trae y el catálogo no conoce
   (Inventario ▸ Conteo ▸ Contar, rediseño 2026-09-29; venía de ConteoPanel)

   Pasa en un censo: alguien escanea una etiqueta que ninguna prenda del sistema reconoce. En vez de frenar el conteo,
   se registra la prenda ahí mismo con lo mínimo (nombre, categoría, talla, color, marca y proveedor) y enseguida se
   cuenta. Nace «pendiente» hasta que un líder la revise, o —si ya existía una prenda con ese nombre— solo se le suma la
   talla o el color.

   Sin costo ni precio (rediseño): el conteo no habla de plata. `censo_crear_variante` los recibe con valor por defecto
   0; el líder los completa al revisar la prenda. Antes se pedían aquí y quien contaba, con un rack por delante, los
   dejaba en 0 igual.

   Va en un `<Modal>` (regla de modales, ADR-0136) y no en una tarjeta pegada a la lista: la lista de abajo no debe
   moverse mientras se llena. El combo «Responsable» está adentro porque la hoja tapa el de la pantalla: dar de alta
   también firma, y el mismo control sirve a las dos.
   ==================================================================== */

export function AltaAlVuelo({
  codigoBarras,
  catalogo,
  categorias,
  colores,
  tallasPorCategoria,
  marcas,
  onListas,
  puedeCrearMarcas,
  parejaInicial,
  responsable,
  onCancelar,
  onCreada,
}: {
  codigoBarras: string;
  /** El catálogo del conteo: de ahí salen el modelo (para agrupar la talla nueva con sus hermanas) y la foto de una prenda que ya existía. */
  catalogo: readonly PrendaConteo[];
  categorias: { id: string; nombre: string }[];
  colores: { codigo: string; nombre: string }[];
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  marcas: CatalogoMarcas;
  onListas: (listas: Pick<CatalogoMarcas, "marcas" | "proveedores" | "vinculos">) => void;
  puedeCrearMarcas: boolean;
  parejaInicial: { marcaId: string; proveedorId: string } | null;
  responsable: ControlResponsable;
  onCancelar: () => void;
  /** La prenda ya existe en la base: la pantalla la suma al catálogo local y la cuenta. */
  onCreada: (prenda: PrendaConteo, pareja: { marcaId: string; proveedorId: string }) => void;
}) {
  const [referencia, setReferencia] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [marcaId, setMarcaId] = useState(parejaInicial?.marcaId ?? "");
  const [proveedorId, setProveedorId] = useState(parejaInicial?.proveedorId ?? "");
  const [tallaId, setTallaId] = useState("");
  const [colorCodigo, setColorCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La talla no tiene un `<label htmlFor>` propio (`Desplegable` no es un `<select>` nativo): se compone Campo + Desplegable.
  const idEtiquetaTalla = useId();

  const tallas = tallasPorCategoria[categoriaId] ?? [];

  async function crear(e: React.FormEvent, cerrar: () => void) {
    e.preventDefault();
    if (!referencia.trim() || !categoriaId) {
      setError("El nombre y la categoría son obligatorios.");
      return;
    }
    if (!marcaId || !proveedorId) {
      setError("Elige la marca y el proveedor de la prenda.");
      return;
    }
    if (!responsable.listo) {
      setError(responsable.motivo);
      return;
    }
    setGuardando(true);
    setError(null);
    const { data, error: fallo } = await firmar(
      createClient().rpc("censo_crear_variante", {
        p_referencia: referencia.trim(),
        p_categoria_id: categoriaId,
        p_codigo_barras: codigoBarras,
        p_talla_id: tallaId || undefined,
        p_color_codigo: colorCodigo || undefined,
        p_marca_id: marcaId,
        p_proveedor_id: proveedorId,
      }),
      responsable.firma()
    );
    setGuardando(false);
    // Como contar: el alta al vuelo es un paso del conteo (enseguida se cuenta esa prenda), así que el éxito no vacía el
    // combo; un rechazo por el responsable sí.
    if (fallo) responsable.despues(fallo);
    const fila = data?.[0];
    if (fallo || !fila) {
      // Una prenda es «Sin color» o tiene colores (ADR-0263 T5): la base lo frena, y aquí se dice con esta prenda.
      setError(mensajeMezclaEnCenso(fallo, referencia, !!colorCodigo) ?? traducirError(fallo, "dar de alta esta prenda"));
      return;
    }
    // Dos casos con consecuencias distintas y quien cuenta tiene que saber cuál fue:
    //  · reutilizado: ya existía una prenda con ese nombre (aprobada); esto solo le SUMÓ una talla o un color. No queda nada por revisar.
    //  · nueva: nace 'pendiente' hasta que un líder la revise, pero ya se puede contar.
    if (fila.reutilizado) {
      avisar.exito(`${fila.referencia}: talla o color sumado`, { detalle: "Ya existía esa prenda; se le agregó esta variante. Ya se puede contar." });
    } else {
      avisar.exito(`${fila.referencia} dada de alta`, { detalle: "Pendiente de que un líder la revise — ya se puede contar." });
    }
    // `censo_crear_variante` no devuelve el modelo: si ya había una prenda con ese nombre, la talla nueva se agrupa con sus hermanas.
    const hermana = catalogo.find((p) => clave(p.referencia) === clave(fila.referencia));
    const colorHex = (fila.color && catalogo.find((p) => p.color === fila.color)?.colorHex) || null;
    onCreada(
      {
        varianteId: fila.variante_id,
        productoId: hermana?.productoId ?? `nuevo-${fila.variante_id}`,
        categoriaId,
        referencia: fila.referencia,
        talla: fila.talla || null,
        color: fila.color || null,
        colorHex,
        fotoUrl: hermana?.fotoUrl ?? null,
        // La prenda nueva nace sin `sku`: se muestra el código que se escaneó, que es el que se tiene en la mano.
        sku: codigoDePrendaNueva(fila),
        codigosBarras: [fila.codigo_barras],
        activo: true,
      },
      { marcaId, proveedorId }
    );
    cerrar();
  }

  return (
    <Modal
      titulo="Dar de alta esta prenda"
      subtitulo={
        <>
          La etiqueta <span className="font-mono text-[12px]">{codigoBarras}</span> no es de ninguna prenda del catálogo. Se registra y se cuenta enseguida.
        </>
      }
      ancho="max-w-lg"
      bloqueado={guardando}
      onClose={onCancelar}
    >
      {(cerrar) => (
        <form onSubmit={(e) => void crear(e, cerrar)} className="space-y-3">
          <CampoTexto etiqueta="Nombre de la prenda" value={referencia} onChange={(e) => setReferencia(e.target.value)} autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoSelect
              etiqueta="Categoría"
              valor={categoriaId}
              onValor={(v) => {
                setCategoriaId(v);
                setTallaId("");
              }}
              opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
              marcador="Elige…"
            />
            <Campo etiqueta="Talla (si aplica)" idEtiqueta={idEtiquetaTalla}>
              <Desplegable
                valor={tallaId}
                onValor={setTallaId}
                opciones={[{ valor: "", texto: "Sin talla" }, ...tallas.map((t) => ({ valor: t.id, texto: t.texto }))]}
                idEtiqueta={idEtiquetaTalla}
                deshabilitado={!categoriaId}
              />
            </Campo>
          </div>
          {categoriaId && (
            <div className="space-y-1.5">
              <p className="label-cayla text-[11px] text-tinta/70">Marca y proveedor</p>
              <ElegirMarcaProveedor
                marcas={marcas.marcas}
                proveedores={marcas.proveedores}
                vinculos={marcas.vinculos}
                usosCategoria={marcas.parejasPorCategoria[categoriaId] ?? []}
                categoriaNombre={categorias.find((c) => c.id === categoriaId)?.nombre}
                marcaId={marcaId}
                proveedorId={proveedorId}
                onElegir={(m, p) => {
                  setMarcaId(m);
                  setProveedorId(p);
                }}
                onLimpiar={() => {
                  setMarcaId("");
                  setProveedorId("");
                }}
                onListas={onListas}
                puedeCrear={puedeCrearMarcas}
              />
            </div>
          )}
          <CampoSelect
            etiqueta="Color (si aplica)"
            valor={colorCodigo}
            onValor={setColorCodigo}
            opciones={[{ valor: "", texto: "Sin color" }, ...colores.map((c) => ({ valor: c.codigo, texto: c.nombre }))]}
          />
          <p className="text-xs text-taupe">Un líder revisa la prenda después y completa su costo y su precio.</p>
          {!responsable.listo && <ComboResponsable control={responsable} deshabilitado={guardando} />}
          {error && (
            <p role="alert" className="rounded-xl bg-rojo/10 px-4 py-3 text-sm text-rojo-profundo">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={cerrar} disabled={guardando} className="btn-cayla btn-secundario h-11">
              Cancelar
            </button>
            <button type="submit" disabled={guardando || !responsable.listo} title={responsable.motivo ?? undefined} className="btn-cayla btn-primario h-11">
              {guardando ? "Creando…" : "Crear y contar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
