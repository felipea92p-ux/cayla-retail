"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { CatalogoParaRecibir } from "@/lib/recepcion-envio-reglas";
import { grupoYaEnLaLista, type GrupoDeLineas } from "@/lib/recepcion-grupos-reglas";

// «¿Llegó algo que no estaba en la guía?» (ADR-0393; decisión 13 de ADR-0362): una categoría que no venía se agrega a la lista con su marca, si tiene (vacía = sin marca, Felipe
// 2026-11-03) y, si el envío trae dos o más, su proveedor; y se cuenta como las demás. Al cerrar, Compras ve lo que pasó con ella. En un envío sin aviso, todo lo que llega entra
// por aquí, y del proveedor del envío. Si esa categoría ya está en la lista, otro modelo no es otra línea: la hoja lleva a anotarlo dentro de ella.

export function AgregarFueraDeGuia({
  catalogo,
  proveedores,
  sinAviso,
  grupos,
  onAgregar,
  onIrAlGrupo,
  onCerrar,
}: {
  catalogo: CatalogoParaRecibir | null;
  proveedores: readonly { id: string; nombre: string }[];
  sinAviso: boolean;
  /** Lo que ya está en la lista, para no agregarlo dos veces. */
  grupos: readonly GrupoDeLineas[];
  onAgregar: (nuevo: { proveedorId: string | null; categoriaId: string; marcaId: string | null }) => Promise<string | null>;
  /** Eso ya está en la lista: se va a esa categoría, a anotar el modelo que llegó. */
  onIrAlGrupo: (grupo: GrupoDeLineas) => void;
  onCerrar: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedorId, setProveedorId] = useState(proveedores.length === 1 ? proveedores[0].id : "");
  const [marcaId, setMarcaId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligeProveedor = proveedores.length >= 2;

  // Las marcas del proveedor elegido primero (las que trae según `marca_proveedores`); después las demás.
  const marcas = useMemo(() => {
    const todas = catalogo?.marcas ?? [];
    const suyas = new Set((catalogo?.vinculos ?? []).filter((v) => !proveedorId || v.proveedorId === proveedorId).map((v) => v.marcaId));
    return [...todas].sort((a, b) => Number(suyas.has(b.id)) - Number(suyas.has(a.id)) || a.nombre.localeCompare(b.nombre, "es"));
  }, [catalogo, proveedorId]);
  const proveedorElegido = eligeProveedor ? proveedorId : null;
  const yaEnLista = categoriaId && proveedorElegido !== "" ? grupoYaEnLaLista(grupos, { proveedorId: proveedorElegido, categoriaId, marcaId: marcaId || null }) : null;
  const nombreCategoria = catalogo?.categorias.find((c) => c.id === categoriaId)?.nombre ?? "";

  const campos = [
    ...(eligeProveedor ? [{ id: "fuera-proveedor", nombre: "De qué proveedor", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es." }] : []),
    { id: "fuera-categoria", nombre: "Qué llegó", requerido: true, hecho: categoriaId !== "", pendiente: "Elige la categoría." },
    { id: "fuera-marca", nombre: "La marca", requerido: false, hecho: marcaId !== "", pendiente: "" },
  ];
  const guia = useGuiaCampos(campos);

  async function agregar() {
    if (!guia.puedeConfirmar) return;
    if (yaEnLista) {
      onIrAlGrupo(yaEnLista);
      onCerrar();
      return;
    }
    setGuardando(true);
    setError(null);
    const clave = await onAgregar({ proveedorId: proveedorElegido, categoriaId, marcaId: marcaId || null });
    setGuardando(false);
    if (clave) onCerrar();
    else setError("No se pudo agregar. Revisa la conexión y vuelve a intentar.");
  }

  return (
    <Modal
      titulo={sinAviso ? "¿Qué llegó?" : "Algo que no estaba en la guía"}
      subtitulo={sinAviso ? "Agrega cada categoría que llegó y cuéntala." : "Se cuenta como las demás; al cerrar dirás qué pasa con lo que vino de más."}
      bloqueado={guardando}
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void agregar();
          }}
          className="space-y-4"
        >
          {eligeProveedor && (
            <CampoGuiado id="fuera-proveedor" guia={guia}>
              <CampoSelect
                etiqueta={guia.etiqueta("fuera-proveedor", "De qué proveedor")}
                valor={proveedorId}
                onValor={(v) => {
                  setProveedorId(v);
                  setMarcaId("");
                }}
                opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
                marcador="Elige el proveedor"
              />
            </CampoGuiado>
          )}
          <CampoGuiado id="fuera-categoria" guia={guia}>
            <CampoSelect
              etiqueta={guia.etiqueta("fuera-categoria", "Qué llegó")}
              valor={categoriaId}
              onValor={setCategoriaId}
              opciones={(catalogo?.categorias ?? []).map((c) => ({ valor: c.id, texto: c.nombre }))}
              marcador="Elige la categoría"
            />
          </CampoGuiado>
          <CampoGuiado id="fuera-marca" guia={guia}>
            <CampoSelect
              etiqueta={guia.etiqueta("fuera-marca", "La marca")}
              valor={marcaId}
              onValor={setMarcaId}
              // Vacía = sin marca (Felipe 2026-11-03): hay prendas que no la tienen; se completa después en Editar producto. «Sin marca» solo aparece para deshacer una ya elegida.
              opciones={[...(marcaId ? [{ valor: "", texto: "Sin marca" }] : []), ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]}
              marcador="Déjala vacía si no tiene"
            />
          </CampoGuiado>
          {yaEnLista && (
            <p className="nota-cayla text-sm">
              <b className="text-tinta">{nombreCategoria} ya está en tu lista.</b> Si llegó otro modelo, se anota ahí con su nombre.
            </p>
          )}
          {!catalogo && <Aviso tono="atencion" titulo="No se pudo leer el catálogo">Recarga la pantalla para elegir la categoría y la marca.</Aviso>}
          {error && <Aviso tono="error" titulo="No se pudo agregar">{error}</Aviso>}
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Agregando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {yaEnLista ? `+ Agregar dentro de ${nombreCategoria}` : "+ Agregar y contar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
