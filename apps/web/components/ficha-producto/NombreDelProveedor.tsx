"use client";

import { useState } from "react";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";

// «Cómo lo llama el proveedor» en Editar producto (ADR-0556, Felipe 2026-10-28).
//
// EL PROBLEMA. El nombre que trae el proveedor («Evaluna», «SS25 311») es lo que el comprador necesita para volver a pedir la prenda, aunque en la
// tienda se llame de otra forma (una flor). Antes vivía escrito a mano dentro del nombre o de la descripción.
//
// CONTRATO. PROMETE: mostrar el dato (o «No le puso nombre») con «Editar»; al editar, una caja y «Guardar» / «Cancelar» que guardan SOLO este dato
//   con `fijar_nombre_proveedor`, firmado por el responsable de la ficha. Va aparte del «Revisar y guardar» de la ficha a propósito: es un dato de
//   compras que no cambia el precio, el stock ni el nombre de la tienda, y así no pasa por la hoja de cambios. ASUME: que quien la monta solo lo hace
//   si la base ya tiene la columna (`valor !== undefined`). NO HACE: no cambia el nombre de la prenda ni sugiere nada.

export function NombreDelProveedor({
  productoId,
  valor,
  firma,
  motivoSinFirma,
}: {
  productoId: string;
  valor: string | null;
  /** La firma del responsable de la ficha; `null` = falta elegirlo. */
  firma: () => Firma | null;
  motivoSinFirma?: string | null;
}) {
  const [guardado, setGuardado] = useState(valor);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const f = firma();
    if (!f) {
      avisar.error(motivoSinFirma ?? "Elige quién hace este cambio.");
      return;
    }
    setGuardando(true);
    const nuevo = texto.trim().replace(/\s+/g, " ");
    const { error } = await firmar(createClient().rpc("fijar_nombre_proveedor", { p_producto_id: productoId, p_nombre: nuevo }), f);
    setGuardando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar cómo lo llama el proveedor"));
      return;
    }
    setGuardado(nuevo || null);
    setEditando(false);
    avisar.exito(nuevo ? `Guardado: el proveedor la llama «${nuevo}».` : "Listo: quedó sin nombre del proveedor.");
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="campo-etiqueta">Cómo lo llama el proveedor</p>
          <p className={`mt-1 text-sm ${guardado ? "text-tinta" : "text-taupe"}`}>{guardado ?? "No le puso nombre"}</p>
        </div>
        <BotonEditar
          chico
          onClick={() => {
            setTexto(guardado ?? "");
            setEditando(true);
          }}
        >
          Editar
        </BotonEditar>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <CampoTexto
        etiqueta="Cómo lo llama el proveedor"
        maxLength={80}
        // sugerir-fijo: muestra las dos formas en que llega (un nombre o un código), no depende de la categoría ni de la marca
        placeholder="Ej. Evaluna o SS25 311"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoFocus
        pie="El nombre o código de su etiqueta o su guía: así el comprador sabe qué pedir."
      />
      <div className="pie-acciones">
        <Boton peso="fantasma" type="button" onClick={() => setEditando(false)} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton peso="primario" type="button" onClick={guardar} cargando={guardando}>
          Guardar
        </Boton>
      </div>
    </div>
  );
}
