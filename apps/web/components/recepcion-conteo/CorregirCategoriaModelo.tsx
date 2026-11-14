"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Campo, CampoSelect } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { esCategoriaPorDefinir, type CatalogoParaRecibir } from "@/lib/recepcion-envio-reglas";
import { mensajeAlGuardar } from "@/lib/recepcion-conteo-reglas";
import { corregirLineaAlContar } from "@/lib/recepcion-conteo-acciones";
import { MarcaNuevaRecepcion, type MarcaRegistrada } from "./MarcaNuevaRecepcion";
import type { ProveedorDeLaLista } from "./ProveedorNuevoRecepcion";

/** «Sin marca» en el combo: vacío es «sin elegir», así que deshacer una marca elegida necesita su propio valor (como en `NuevoModelo`). */
const SIN_MARCA = "sin-marca";

// Corregir la categoría y la marca de un modelo «por crear» mientras se cuenta (Felipe 2026-11-12): en «Mis compras» se anotó «Polo nousse» en Polos y era una
// blusa. Pasa sus líneas de la compra a lo que de verdad llegó, con lo contado (`corregir_linea_al_contar`). La compra, la factura, el proveedor, el stock y el
// costo no cambian; queda en la Actividad. Con el envío cerrado se corrige en «Para después» (`YaExisteLaPrenda`).
// La marca es opcional (Felipe 2026-11-14, 20261114205000): quien recibe se la pone o la deja «Sin marca», como en «¿Ya existe?». Si no está en el
// catálogo, la crea ahí mismo con «+ Marca nueva» (ADR-0635), unida al proveedor de la compra: el mismo combo y la misma hoja de «Nuevo modelo».

export function CorregirCategoriaModelo({
  despachoId,
  lineaIds,
  nombre,
  categoria: categoriaActual,
  marca: marcaActual,
  proveedorId,
  proveedores,
  catalogo,
  responsable,
  esperandoGuardar,
  onMarcaNueva,
  onCorregido,
  onCerrar,
}: {
  despachoId: string;
  /** Las líneas de la compra que anotaron este modelo (`lineasParaCorregir`). */
  lineaIds: readonly string[];
  nombre: string;
  categoria: { id: string; nombre: string };
  /** `id` nulo: la compra no anotó marca. */
  marca: { id: string | null; nombre: string };
  /** El de la compra: sus marcas salen primero, y una marca nueva queda unida a él. */
  proveedorId: string | null;
  /** Los proveedores del envío: si la línea no trae el suyo, la marca nueva se une a uno de ellos. */
  proveedores: readonly ProveedorDeLaLista[];
  catalogo: CatalogoParaRecibir | null;
  responsable: ControlResponsable;
  /** Lo último contado todavía viaja a la base: se espera, para no corregir sobre un número que no llegó. */
  esperandoGuardar: boolean;
  /** Se creó una marca con «+ Marca nueva»: quien abre la hoja la suma a su catálogo. */
  onMarcaNueva?: (r: MarcaRegistrada) => void;
  /** `marcaId` nulo = sin marca. */
  onCorregido: (cambio: { categoriaId: string; marcaId: string | null }) => void;
  onCerrar: () => void;
}) {
  const porDefinir = esCategoriaPorDefinir(categoriaActual);
  const [categoriaId, setCategoriaId] = useState(categoriaActual.id);
  const [marcaId, setMarcaId] = useState(marcaActual.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** «+ Marca nueva»: lo escrito en el combo de la marca, mientras su hoja está abierta (ADR-0635). */
  const [creandoMarca, setCreandoMarca] = useState<string | null>(null);
  const idComboMarca = useId();

  const categorias = catalogo?.categorias ?? [];
  const delProveedor = new Set((catalogo?.vinculos ?? []).filter((v) => proveedorId && v.proveedorId === proveedorId).map((v) => v.marcaId));
  const marcas = [...(catalogo?.marcas ?? [])].sort((a, b) => Number(delProveedor.has(b.id)) - Number(delProveedor.has(a.id)));
  const cambio = categoriaId !== categoriaActual.id || marcaId !== (marcaActual.id ?? "");
  const nuevaCategoria = categorias.find((c) => c.id === categoriaId)?.nombre ?? categoriaActual.nombre;
  const nuevaMarca = marcaId ? (marcas.find((m) => m.id === marcaId)?.nombre ?? marcaActual.nombre) : "Sin marca";
  const delaLinea = proveedores.filter((p) => p.id === proveedorId);
  const proveedoresDeLaMarca = delaLinea.length > 0 ? delaLinea : proveedores;

  const guia = useGuiaCampos([
    { id: "corregir-categoria", nombre: "La categoría", requerido: true, hecho: categoriaId !== "", pendiente: "Elige la categoría de lo que llegó." },
    { id: "corregir-marca", nombre: "La marca", requerido: false, hecho: marcaId !== "", pendiente: "" },
    { id: "corregir-quien", nombre: "Quién lo corrige", requerido: true, hecho: !cambio || responsable.listo, pendiente: "Elige quién lo corrige." },
  ]);

  async function corregir(cerrar: () => void) {
    if (!guia.puedeConfirmar || guardando || esperandoGuardar) return;
    if (!cambio) {
      cerrar();
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: e } = await corregirLineaAlContar(
      { p_despacho_id: despachoId, p_despacho_item_ids: [...lineaIds], p_categoria_id: categoriaId, p_marca_id: marcaId || null },
      responsable.firma(),
    );
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      setError(mensajeAlGuardar(e, "corregir la categoría y la marca"));
      return;
    }
    avisar.exito("Categoría y marca corregidas", { detalle: `${nombre} ahora es ${nuevaCategoria} · ${nuevaMarca}.` });
    onCorregido({ categoriaId, marcaId: marcaId || null });
  }

  return (
    <Modal
      // ADR-0660: una prenda que llegó «por definir» no se corrige: se dice qué es por primera vez.
      titulo={porDefinir ? `¿Qué es ${nombre}?` : `Corregir ${nombre}`}
      subtitulo={porDefinir ? "Llegó por definir: elige su categoría. Lo contado no cambia." : "Lo que se anotó en la compra no es lo que llegó. Lo contado no cambia."}
      tamano="mediana"
      bloqueado={guardando}
      onClose={onCerrar}
    >
      {(cerrar) => (
        <>
        <form
          noValidate
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void corregir(cerrar);
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoGuiado id="corregir-categoria" guia={guia}>
              <CampoSelect
                etiqueta={guia.etiqueta("corregir-categoria", "Categoría")}
                valor={categoriaId}
                onValor={(v) => {
                  setCategoriaId(v);
                  setError(null);
                }}
                deshabilitado={guardando}
                opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
                marcador="Elige la categoría"
              />
            </CampoGuiado>
            <CampoGuiado id="corregir-marca" guia={guia}>
              <Campo etiqueta={guia.etiqueta("corregir-marca", "Marca")} htmlFor={idComboMarca}>
                <ComboBuscable
                  id={idComboMarca}
                  etiquetaAccesible="La marca: elige una o agrega una nueva"
                  valor={marcaId}
                  onValor={(v) => {
                    setMarcaId(v === SIN_MARCA ? "" : v);
                    setError(null);
                  }}
                  // Vacía = sin marca: «Sin marca» solo aparece para deshacer una ya elegida (como en «Nuevo modelo»).
                  opciones={[
                    ...(marcaId ? [{ valor: SIN_MARCA, texto: "Sin marca" }] : []),
                    ...marcas.map((m) => ({ valor: m.id, texto: m.nombre, detalle: delProveedor.has(m.id) ? "La trae este proveedor" : undefined })),
                  ]}
                  marcador="Déjala vacía si no tiene"
                  // «+ Marca nueva» (ADR-0635): arriba y fija, como en Nuevo producto y Nuevo modelo.
                  crearArriba
                  crear={{ etiqueta: (q) => (q ? `+ Marca nueva «${q}»` : "+ Marca nueva"), onCrear: (q) => setCreandoMarca(q) }}
                />
              </Campo>
            </CampoGuiado>
          </div>
          {cambio && (
            <p className="nota-cayla text-sm">
              Se anotó en {categoriaActual.nombre} · {marcaActual.nombre}. Al guardar, {nombre} pasa a {nuevaCategoria} · {nuevaMarca}, con lo que ya contaste. La compra y el proveedor no cambian.
            </p>
          )}
          {cambio && (
            <CampoGuiado id="corregir-quien" guia={guia}>
              <p className="mb-1.5 text-sm font-semibold text-tinta">{guia.etiqueta("corregir-quien", "Quién lo corrige")}</p>
              <ComboResponsable control={responsable} compacto deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {error && (
            <Aviso tono="error" titulo="No se pudo corregir">
              {error}
            </Aviso>
          )}
          <PieGuia guia={guia} listo={cambio ? "Todo listo para corregir." : "Elige lo que de verdad llegó."} />
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              textoCargando="Corrigiendo…"
              disabled={esperandoGuardar}
              confirma={guia}
              title={esperandoGuardar ? "Espera: lo último contado todavía se está guardando" : (guia.frase ?? undefined)}
              className={guia.claseConfirmar}
            >
              Guardar
            </Boton>
          </div>
        </form>
        {creandoMarca !== null && (
          <MarcaNuevaRecepcion
            tipeado={creandoMarca}
            marcas={catalogo?.marcas ?? []}
            vinculos={catalogo?.vinculos ?? []}
            proveedores={proveedoresDeLaMarca}
            proveedorInicial={proveedoresDeLaMarca.length === 1 ? proveedoresDeLaMarca[0].id : ""}
            // Una línea de la compra: la marca va con un proveedor del envío, no con uno nuevo.
            puedeAgregarProveedor={false}
            responsable={responsable}
            onProveedorNuevo={() => {}}
            onRegistrada={(r) => {
              onMarcaNueva?.(r);
              setMarcaId(r.marca.id);
              setError(null);
              setCreandoMarca(null);
            }}
            onCerrar={() => setCreandoMarca(null)}
          />
        )}
        </>
      )}
    </Modal>
  );
}
