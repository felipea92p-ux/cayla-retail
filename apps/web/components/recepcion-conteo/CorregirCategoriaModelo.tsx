"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { CatalogoParaRecibir } from "@/lib/recepcion-envio-reglas";
import { mensajeAlGuardar } from "@/lib/recepcion-conteo-reglas";
import { corregirLineaAlContar } from "@/lib/recepcion-conteo-acciones";

// Corregir la categoría y la marca de un modelo «por crear» mientras se cuenta (Felipe 2026-11-12): en «Mis compras» se anotó «Polo nousse» en Polos y era una
// blusa. Pasa sus líneas de la compra a lo que de verdad llegó, con lo contado (`corregir_linea_al_contar`). La compra, la factura, el proveedor, el stock y el
// costo no cambian; queda en la Actividad. Con el envío cerrado se corrige en «Para después» (`YaExisteLaPrenda`).

export function CorregirCategoriaModelo({
  despachoId,
  lineaIds,
  nombre,
  categoria: categoriaActual,
  marca: marcaActual,
  proveedorId,
  catalogo,
  responsable,
  esperandoGuardar,
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
  /** El de la compra: sus marcas salen primero. */
  proveedorId: string | null;
  catalogo: CatalogoParaRecibir | null;
  responsable: ControlResponsable;
  /** Lo último contado todavía viaja a la base: se espera, para no corregir sobre un número que no llegó. */
  esperandoGuardar: boolean;
  onCorregido: (cambio: { categoriaId: string; marcaId: string }) => void;
  onCerrar: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState(categoriaActual.id);
  const [marcaId, setMarcaId] = useState(marcaActual.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categorias = catalogo?.categorias ?? [];
  const delProveedor = new Set((catalogo?.vinculos ?? []).filter((v) => proveedorId && v.proveedorId === proveedorId).map((v) => v.marcaId));
  const marcas = [...(catalogo?.marcas ?? [])].sort((a, b) => Number(delProveedor.has(b.id)) - Number(delProveedor.has(a.id)));
  const cambio = categoriaId !== categoriaActual.id || marcaId !== (marcaActual.id ?? "");
  const nuevaCategoria = categorias.find((c) => c.id === categoriaId)?.nombre ?? categoriaActual.nombre;
  const nuevaMarca = marcas.find((m) => m.id === marcaId)?.nombre ?? marcaActual.nombre;

  const guia = useGuiaCampos([
    { id: "corregir-categoria", nombre: "La categoría", requerido: true, hecho: categoriaId !== "", pendiente: "Elige la categoría de lo que llegó." },
    { id: "corregir-marca", nombre: "La marca", requerido: true, hecho: marcaId !== "", pendiente: "Elige la marca de lo que llegó." },
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
      { p_despacho_id: despachoId, p_despacho_item_ids: [...lineaIds], p_categoria_id: categoriaId, p_marca_id: marcaId },
      responsable.firma(),
    );
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      setError(mensajeAlGuardar(e, "corregir la categoría y la marca"));
      return;
    }
    avisar.exito("Categoría y marca corregidas", { detalle: `${nombre} ahora es ${nuevaCategoria} · ${nuevaMarca}.` });
    onCorregido({ categoriaId, marcaId });
  }

  return (
    <Modal titulo={`Corregir ${nombre}`} subtitulo="Lo que se anotó en la compra no es lo que llegó. Lo contado no cambia." tamano="mediana" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
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
              <CampoSelect
                etiqueta={guia.etiqueta("corregir-marca", "Marca")}
                valor={marcaId}
                onValor={(v) => {
                  setMarcaId(v);
                  setError(null);
                }}
                deshabilitado={guardando}
                opciones={marcas.map((m) => ({ valor: m.id, texto: m.nombre, grupo: delProveedor.size > 0 ? (delProveedor.has(m.id) ? "Las de este proveedor" : "Otras marcas") : undefined }))}
                marcador="Elige la marca"
              />
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
      )}
    </Modal>
  );
}
