"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { validarDocumento } from "@cayla-retail/shared";
import { createClient } from "@/lib/supabase/client";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ETIQUETA_METODO } from "@/lib/compras-reglas";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { proveedorConRuc } from "@/lib/proveedores-reglas";

// Alta y edición de un proveedor (extraído de ProveedoresPanel el 2026-09-18 para que la lista y la
// ficha abran el MISMO formulario: la ficha ganó el botón «Editar» y el formulario no se duplica).
//
// El RUC y la razón social son el mismo <ConsultaDocumento> que usa Vender/Facturación (una sola copia
// de la lógica del padrón, ver el comentario de cabecera de ese componente), en modo `boton`: SUNAT se
// consulta solo al apretar «Buscar», porque cada consulta se paga y quien registra puede preferir
// escribir el nombre a mano. Si el padrón no responde, el nombre se escribe a mano y se guarda igual
// (principio 9): un proveedor no se queda sin registrar por una API ajena.
//
// El rubro sigue siendo texto libre (ADR-0094) pero sugiere los ya usados (`rubros`): así «Tela»,
// «tela» y «Telas» no terminan siendo tres filtros distintos en la lista. ADR-0122: las sugerencias
// ahora son botones a la vista (un toque) además de la lista desplegable del campo.
//
// ADR-0122 (spike visual 2026-09-19): el formulario se rehízo con la carcasa y las piezas del spike — encabezado
// con su rótulo, contador y validación del RUC («n/11», hilo verde, ✓ que se dibuja), plazo de crédito y forma de
// pago como opciones a la vista (el plazo con un pulgar que se desliza), rubro con sugerencias en botones, y un
// botón que barre mientras guarda y confirma con un ✓ antes de cerrar. Los campos reales que el spike no tenía
// (consulta a SUNAT, teléfono, banco, cuenta) siguen: cambia cómo se ven, no qué se guarda.
//
// ADR-0122: el RUC duplicado se dice AL ESCRIBIR, con el nombre del proveedor con el que choca
// (`existentes`). El candado de verdad sigue siendo el índice único de la base; esto solo evita que el
// error llegue recién al guardar, después de haber llenado todo el formulario.

// Mismo vocabulario y orden que el selector de medio de pago en LineasPago.tsx (compra_pagos.metodo):
// un solo catálogo de formas de pago en toda la app.
const FORMAS_PAGO = Object.keys(ETIQUETA_METODO);

// Plazos que se eligen con un toque; cualquier otro número entra por «Otro».
const PLAZOS = ["15", "30", "45", "60"];
/** Debe coincidir con `.anim-salida` en globals.css. */
const MS_SALIDA = 220;

const CHIP = "rounded-full border px-3 py-0.5 text-xs transition-colors duration-200";
const CHIP_OFF = "border-tinta/15 text-tinta/75 hover:border-rojo hover:text-rojo";
const CHIP_ON = "border-tinta bg-tinta text-crema";

export type Borrador = {
  id: string | null;
  nombre: string;
  ruc: string;
  contacto: string;
  telefono: string;
  banco: string;
  cuentaBancaria: string;
  rubro: string;
  plazoCreditoDias: string;
  formaPagoPreferida: string;
};

export const BORRADOR_VACIO: Borrador = {
  id: null,
  nombre: "",
  ruc: "",
  contacto: "",
  telefono: "",
  banco: "",
  cuentaBancaria: "",
  rubro: "",
  plazoCreditoDias: "",
  formaPagoPreferida: "",
};

/** Del proveedor (de la lista o de la ficha) al formulario de edición. */
export function borradorDe(p: {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  rubro: string | null;
  plazo_credito_dias: number | null;
  forma_pago_preferida: string | null;
}): Borrador {
  return {
    id: p.id,
    nombre: p.nombre,
    ruc: p.ruc ?? "",
    contacto: p.contacto ?? "",
    telefono: p.telefono ?? "",
    banco: p.banco ?? "",
    cuentaBancaria: p.cuenta_bancaria ?? "",
    rubro: p.rubro ?? "",
    plazoCreditoDias: p.plazo_credito_dias != null ? String(p.plazo_credito_dias) : "",
    formaPagoPreferida: p.forma_pago_preferida ?? "",
  };
}

export function ProveedorModal({
  inicial,
  rubros = [],
  existentes = [],
  onClose,
  onGuardado,
  onDesactivar,
}: {
  inicial: Borrador;
  /** Rubros ya usados, para sugerir al escribir. */
  rubros?: string[];
  /** Los proveedores ya registrados, para avisar de un RUC repetido mientras se escribe. */
  existentes?: { id: string; nombre: string; ruc: string | null }[];
  onClose: () => void;
  /** `id` del proveedor guardado (el nuevo, o el que se editó): la lista lo marca y lo lleva a la vista. */
  onGuardado: (id: string | null) => void;
  /** Solo al editar: desactivar vive acá y no en la fila (ver ProveedoresPanel). */
  onDesactivar?: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [ruc, setRuc] = useState(inicial.ruc);
  const [contacto, setContacto] = useState(inicial.contacto);
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [banco, setBanco] = useState(inicial.banco);
  const [cuentaBancaria, setCuentaBancaria] = useState(inicial.cuentaBancaria);
  const [rubro, setRubro] = useState(inicial.rubro);
  const [plazoCreditoDias, setPlazoCreditoDias] = useState(inicial.plazoCreditoDias);
  // «Otro» es un modo, no un valor: un plazo de 20 días no está entre los botones y el campo tiene que seguir visible.
  const [plazoOtro, setPlazoOtro] = useState(inicial.plazoCreditoDias !== "" && !PLAZOS.includes(inicial.plazoCreditoDias));
  const [formaPagoPreferida, setFormaPagoPreferida] = useState(inicial.formaPagoPreferida);
  // reposo → guardando (el botón barre) → listo (✓) → se cierra con la salida animada.
  const [fase, setFase] = useState<"reposo" | "guardando" | "listo">("reposo");
  const [cerrando, setCerrando] = useState(false);
  const alCerrar = useRef<(() => void) | null>(null);

  const editando = inicial.id !== null;
  const rucValido = ruc.length === 0 || validarDocumento("ruc", ruc).valido;
  const repetido = proveedorConRuc(ruc, existentes, inicial.id);
  const puedeGuardar = !!nombre.trim() && rucValido && !repetido && fase === "reposo";

  // Cierre en dos tiempos, igual que `Modal`: se anima la salida y recién ahí se avisa al padre (que lo desmonta).
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => (alCerrar.current ?? onClose)(), reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onClose]);

  const modoPlazo = plazoOtro ? "otro" : plazoCreditoDias;
  function elegirPlazo(clave: string) {
    if (clave === "otro") {
      setPlazoOtro(true);
      if (PLAZOS.includes(plazoCreditoDias)) setPlazoCreditoDias("");
      return;
    }
    setPlazoOtro(false);
    setPlazoCreditoDias(clave);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fase !== "reposo") return;
    if (!nombre.trim()) return void avisar.error("El proveedor necesita un nombre.", { enfocar: "documento-nombre" });
    if (!rucValido) return void avisar.error("El RUC tiene que ser de 11 dígitos. Si no tiene, déjalo en blanco.", { enfocar: "documento-numero" });
    if (repetido) return void avisar.error(`Ese RUC ya es de ${repetido.nombre}.`, { enfocar: "documento-numero" });
    setFase("guardando");
    const supabase = createClient();
    const args = {
      p_nombre: nombre.trim(),
      p_ruc: ruc || undefined,
      p_contacto: contacto.trim() || undefined,
      p_rubro: rubro.trim() || undefined,
      p_plazo_credito_dias: plazoCreditoDias ? Number(plazoCreditoDias) : undefined,
      p_forma_pago_preferida: formaPagoPreferida || undefined,
      p_telefono: telefono.trim() || undefined,
      p_banco: banco.trim() || undefined,
      p_cuenta_bancaria: cuentaBancaria.trim() || undefined,
    };
    const { data: idNuevo, error } = editando
      ? await supabase.rpc("actualizar_proveedor", {
          p_proveedor_id: inicial.id!,
          ...args,
        })
      : await supabase.rpc("registrar_proveedor", args);
    if (error) {
      setFase("reposo");
      avisar.error(traducirError(error, editando ? "guardar el proveedor" : "registrar el proveedor"));
      return;
    }
    avisar.exito(editando ? `${nombre.trim()} actualizado` : `Proveedor ${nombre.trim()} registrado`);
    const id = editando ? inicial.id : ((idNuevo as string | null) ?? null);
    // El ✓ se ve un instante y recién ahí el modal se va: la confirmación es parte del gesto, no un aviso aparte.
    setFase("listo");
    alCerrar.current = () => onGuardado(id);
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(pedirCierre, reducido ? 0 : 520);
  }

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && fase !== "guardando" && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 bg-tinta/30 backdrop-blur-[2.5px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`} />
        {/* El centrado vive en este contenedor y no en el panel: la animación de entrada usa `transform`. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Dialog.Content
            className={`pointer-events-auto flex max-h-[92dvh] w-full max-w-[35rem] flex-col overflow-hidden rounded-t-2xl border border-sand bg-papel shadow-xl outline-none sm:rounded-2xl ${
              cerrando ? "anim-salida" : "anim-entrada"
            }`}
          >
            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-[22px]">
                <div>
                  <p className="label-cayla text-[11px] text-tinta/65">Compras · Proveedores</p>
                  <Dialog.Title asChild>
                    <h2 className="font-display mt-0.5 text-2xl leading-tight text-tinta">{editando ? "Editar proveedor" : "Registrar proveedor"}</h2>
                  </Dialog.Title>
                </div>
                <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="-mr-1 -mt-1 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <Dialog.Description className="sr-only">Datos del proveedor: RUC, razón social, contacto, rubro, plazo de crédito y forma de pago.</Dialog.Description>

              <div className="scroll-cayla min-h-0 flex-1 space-y-2 overflow-y-auto px-6 pb-5 pt-2">
                {/* La razón social y el RUC: el mismo <ConsultaDocumento> que usa Vender/Facturación (una sola copia de
                    la lógica del padrón). `contador` le agrega «n/11», el hilo verde y el ✓ del spike. */}
                <ConsultaDocumento
                  tipo="ruc"
                  obligatorio={false}
                  disparo="boton"
                  contador
                  problemaExterno={repetido ? <>Ya está registrado: <b className="font-semibold">{repetido.nombre}</b>. Un RUC no puede repetirse.</> : undefined}
                  numero={ruc}
                  onNumero={setRuc}
                  nombre={nombre}
                  onNombre={setNombre}
                />

                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  <CampoTexto etiqueta="Contacto" autoComplete="off" placeholder="Con quién se coordina" value={contacto} onChange={(e) => setContacto(e.target.value)} />
                  <CampoTexto etiqueta="Teléfono" type="tel" autoComplete="off" placeholder="El WhatsApp de los pedidos" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>

                <div>
                  <CampoTexto
                    etiqueta="Rubro"
                    autoComplete="off"
                    list="proveedor-rubros"
                    placeholder="Tela, avíos, prenda terminada, servicios…"
                    value={rubro}
                    onChange={(e) => setRubro(e.target.value)}
                  />
                  <datalist id="proveedor-rubros">
                    {rubros.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                  {rubros.length > 0 && (
                    <div className="-mt-1 mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Rubros ya usados">
                      {rubros.map((r) => {
                        const elegido = rubro.trim().toLowerCase() === r.toLowerCase();
                        return (
                          <button key={r} type="button" aria-pressed={elegido} onClick={() => setRubro(r)} className={`${CHIP} ${elegido ? CHIP_ON : CHIP_OFF}`}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Campo etiqueta="Plazo de crédito" idEtiqueta="etiqueta-plazo">
                  <SegmentoDeslizante
                    etiqueta="Plazo de crédito"
                    valor={modoPlazo}
                    onCambio={elegirPlazo}
                    opciones={[{ clave: "", etiqueta: "Sin definir" }, ...PLAZOS.map((d) => ({ clave: d, etiqueta: `${d} d` })), { clave: "otro", etiqueta: "Otro" }]}
                  />
                  {plazoOtro && (
                    <div className="anim-revelar mt-2 max-w-[12rem]">
                      <CampoTexto etiqueta="Días" type="number" min={1} step={1} autoComplete="off" placeholder="20" value={plazoCreditoDias} onChange={(e) => setPlazoCreditoDias(e.target.value)} />
                    </div>
                  )}
                </Campo>

                <Campo etiqueta="Forma de pago preferida" idEtiqueta="etiqueta-forma-pago">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="etiqueta-forma-pago">
                    {FORMAS_PAGO.map((m) => {
                      const elegido = formaPagoPreferida === m;
                      return (
                        // Tocar la elegida la quita: «sin definir» es una respuesta válida.
                        <button key={m} type="button" aria-pressed={elegido} onClick={() => setFormaPagoPreferida(elegido ? "" : m)} className={`${CHIP} ${elegido ? CHIP_ON : CHIP_OFF}`}>
                          {ETIQUETA_METODO[m]}
                        </button>
                      );
                    })}
                  </div>
                </Campo>

                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  <CampoTexto etiqueta="Banco" autoComplete="off" placeholder="BCP, Interbank…" value={banco} onChange={(e) => setBanco(e.target.value)} />
                  <CampoTexto etiqueta="Cuenta bancaria" autoComplete="off" placeholder="Número de cuenta o CCI" value={cuentaBancaria} onChange={(e) => setCuentaBancaria(e.target.value)} />
                </div>

                {onDesactivar && (
                  <p className="border-t border-tinta/10 pt-3 text-xs text-tinta/55">
                    ¿Ya no se le compra?{" "}
                    <button type="button" onClick={onDesactivar} disabled={fase !== "reposo"} className="text-rojo hover:underline">
                      Desactivar proveedor
                    </button>
                    . Deja de aparecer al registrar comprobantes; su historial se conserva.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-tinta/10 px-6 py-4">
                <Boton type="button" peso="fantasma" onClick={pedirCierre} disabled={fase !== "reposo"}>
                  Cancelar
                </Boton>
                {/* Solo se ve «apagado» en reposo, cuando de verdad falta algo; guardando y listo el botón sigue vivo (onSubmit ya ignora los clics repetidos). */}
                <Boton type="submit" peso="primario" disabled={fase === "reposo" && !puedeGuardar} className="min-w-[11.5rem]">
                  {fase === "guardando" && (
                    // El mismo hilo que barre en el spike mientras se guarda: se ve que el sistema trabaja.
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
                      <span className="block h-full w-1/3 bg-crema [animation:cayla-hilo-barrido_0.9s_linear_infinite]" />
                    </span>
                  )}
                  {fase === "listo" ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" className="trazo-linea anim-trazo" />
                      </svg>
                      Listo
                    </span>
                  ) : fase === "guardando" ? (
                    "Guardando…"
                  ) : editando ? (
                    "Guardar cambios"
                  ) : (
                    "Registrar proveedor"
                  )}
                </Boton>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
