"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { EnviarACompras } from "@/components/plan-compra/EnviarACompras";
import { FormularioCategoria } from "@/components/plan-compra/FormularioCategoria";
import { PasoModelos } from "@/components/plan-compra/PasoModelos";
import { Pestanas } from "@/components/ui/Pestanas";
import type { CategoriaPlan, FilaPlan } from "@/lib/plan-compra-reglas";

// Los tres pasos de una categoría (ADR-0526, ADR-0530): ① cuánto comprar (el formulario de siempre), ② qué modelos, colores y tallas (`PasoModelos`) y ③ enviar a Compras lo que el paso 2 nombró (`EnviarACompras`).
// El paso 2 solo se ofrece cuando el paso 1 ya está guardado y pide comprar algo: reparte lo que el paso 1 decidió y nunca lo cambia. El paso 3 solo se ofrece cuando el paso 2 ya está guardado: envía lo
// guardado, no lo que se está escribiendo. Cambiar de paso con algo escrito sin guardar pregunta antes de perderlo.
//
// La ventana de una categoría en el plan de campaña (ADR-0349): el formulario de la categoría (`FormularioCategoria`, el mismo que usa
// el paso a paso) dentro de una hoja. Aquí solo vive lo propio de la hoja: el título, el pie y qué pasa al guardar. Con «Guardar y seguir
// con …» la hoja NO se cierra: pasa a la siguiente categoría que más vende y no tiene plan (la elige `PlanCampana`, que ve toda la
// lista). El formulario lleva `key` por categoría: cada una arranca con su propio borrador, nunca con el de la anterior.
//
// Salir con algo escrito sin guardar —Escape, el velo, «Cancelar», un enlace o «Atrás»— pregunta antes de perderlo (`useSalidaSinGuardar`,
// la pieza del ERP; Formidable 2026-10-10: antes se perdía en silencio). Escape y el velo preguntan con la hoja todavía a la vista
// (`antesDeCerrar` de <Modal>).

export function PlanCategoriaModal({
  planId,
  planNombre,
  planDias,
  hoy,
  limite,
  fila,
  vendidoPorTalla,
  tope,
  inversionDeLasDemas,
  conVersion,
  versionConocida,
  precioDeLaPlata = 0,
  puedeVerCompras = false,
  siguiente,
  enSerie,
  onGuardado,
  onClose,
}: {
  planId: string;
  planNombre: string;
  /** Los días de la campaña (el normal de respaldo de la hoja). */
  planDias: number;
  /** Hoy en Lima y el último día para pedir (null = la campaña ya empezó): el paso 3 avisa si una fecha de pedido llegaría tarde. */
  hoy: string;
  limite: string | null;
  fila: FilaPlan;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  /** El tope de la campaña (null = sin tope) y lo que cuestan las otras categorías con plan. */
  tope: number | null;
  inversionDeLasDemas: number;
  /** La base ya compara versiones al guardar (B4). */
  conVersion: boolean;
  /** La versión que devolvió un guardado de esta tanda para esta categoría, si lo hubo. */
  versionConocida?: number;
  /** El precio de la plata del plan con tope que la campaña usa (0 = el plan de siempre). */
  precioDeLaPlata?: number;
  /** Ve Compras ▸ Mis compras (`ordenes_compra`): el paso 3 solo ofrece «Ver en Compras» a quien puede entrar. */
  puedeVerCompras?: boolean;
  /** La que sigue si se guarda con «Guardar y seguir»; null si no queda ninguna (el botón no se dibuja). */
  siguiente: CategoriaPlan | null;
  /** Ya se guardó alguna en esta tanda: esta llegó por «Guardar y seguir» y el cursor va a su primer campo. */
  enSerie: boolean;
  /** Se guardó la categoría. `seguir`: con «Guardar y seguir» (y hay una siguiente); si no, la hoja se cierra. `version`: la nueva. */
  onGuardado: (seguir: boolean, version: number | null) => void;
  onClose: () => void;
}) {
  const [sucio, setSucio] = useState(false);
  const [sucioPaso2, setSucioPaso2] = useState(false);
  const [paso, setPaso] = useState<"1" | "2" | "3">("1");
  // El paso 2 reparte lo que el paso 1 decidió: hace falta el paso 1 guardado y que pida comprar algo.
  const conPaso2 = fila.linea !== undefined && (fila.calculo?.comprar ?? 0) > 0;
  // El paso 3 envía a Compras lo que el paso 2 dejó GUARDADO (ADR-0530): hace falta que el paso 2 exista (null = todavía no se hizo; undefined = la base no lo sabe).
  // Se queda aunque ya no falte pedir nada (todo se confirmó): ahí está en qué quedó cada pedido y el «Ver en Compras».
  const conPaso3 = fila.linea !== undefined && fila.paso2 !== undefined && fila.paso2 !== null && (conPaso2 || (fila.envio ?? null) !== null);
  const salida = useSalidaSinGuardar(sucio || sucioPaso2, `Escribiste parte del plan de ${fila.c.nombre} y todavía no se guardó. Si sales ahora, se pierde lo que escribiste.`);
  const irAPaso = (destino: "1" | "2" | "3") => {
    if (destino === paso) return;
    salida.pedirAccion(() => {
      setSucio(false);
      setSucioPaso2(false);
      setPaso(destino);
    });
  };
  return (
    <Modal
      titulo={`Plan de ${fila.c.nombre}`}
      subtitulo={`${planNombre}.`}
      onClose={onClose}
      antesDeCerrar={salida.pedirAccion}
      variante="hoja"
      tamano="ancha"
      ancho={paso === "2" ? "max-w-5xl" : paso === "3" ? "max-w-4xl" : undefined} /* unificar-fijo: el paso 2 (modelos con sus colores y tallas) y el 3 (la tabla de proveedores con su «cuándo») son de diseño propio y necesitan más ancho que el formulario (ADR-0526 y ADR-0530, maquetas ⑥ y ⑦ elegidas por Felipe) */
    >
      {(cerrar) => (
        <>
          {conPaso2 && (
            <Pestanas
              guia="plan-modal.pasos"
              etiquetaAccesible={`Pasos del plan de ${fila.c.nombre}`}
              activa={paso}
              onCambio={(k) => irAPaso(k === "3" ? "3" : k === "2" ? "2" : "1")}
              items={[
                { clave: "1", etiqueta: "1 · Cuánto compro" },
                { clave: "2", etiqueta: "2 · Qué modelos, colores y tallas", guia: "plan-modal.paso-2" },
                ...(conPaso3 ? [{ clave: "3", etiqueta: "3 · Enviar a Compras", guia: "plan-modal.paso-3" }] : []),
              ]}
              className="mb-5"
            />
          )}
          {paso === "3" && conPaso3 ? (
            <EnviarACompras
              planId={planId}
              planNombre={planNombre}
              fila={fila}
              hoy={hoy}
              limite={limite}
              puedeVerCompras={puedeVerCompras}
              onIrAlPaso2={() => irAPaso("2")}
              onCancelar={() => salida.pedirAccion(cerrar)}
            />
          ) : paso === "2" && conPaso2 ? (
            <PasoModelos
              planId={planId}
              fila={fila}
              vendidoPorTalla={vendidoPorTalla}
              onCambios={setSucioPaso2}
              onCancelar={() => salida.pedirAccion(cerrar)}
              onIrAlPaso1={() => irAPaso("1")}
            />
          ) : (
          <FormularioCategoria
            key={fila.c.id}
            planId={planId}
            campana={{ nombre: planNombre, dias: planDias }}
            fila={fila}
            vendidoPorTalla={vendidoPorTalla}
            tope={tope}
            inversionDeLasDemas={inversionDeLasDemas}
            conVersion={conVersion}
            versionConocida={versionConocida}
            precioDeLaPlata={precioDeLaPlata}
            irAlMontar={enSerie}
            onCambios={setSucio}
            antesDeRefrescar={salida.retirarYa}
            onGuardado={(seguir, version) => {
              onGuardado(seguir && siguiente !== null, version);
              if (!(seguir && siguiente !== null)) cerrar();
            }}
            pie={({ guardando, puedeGuardar, motivo, claseConfirmar }) => (
              <div className="pie-acciones pt-2">
                <Boton type="button" onClick={() => salida.pedirAccion(cerrar)}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso={siguiente ? "fantasma" : "primario"} cargando={guardando} disabled={!puedeGuardar} title={motivo} className={siguiente ? undefined : claseConfirmar}>
                  Guardar
                </Boton>
                {siguiente && (
                  <Boton type="submit" data-seguir="1" peso="primario" cargando={guardando} disabled={!puedeGuardar} title={motivo} className={claseConfirmar}>
                    <span className="inline-flex items-center gap-2">
                      Guardar y seguir con {siguiente.nombre}
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </span>
                  </Boton>
                )}
              </div>
            )}
          />
          )}
          {salida.aviso}
        </>
      )}
    </Modal>
  );
}
