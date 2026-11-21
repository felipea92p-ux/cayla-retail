"use client";

import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { Aviso } from "@/components/ui/Aviso";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { useResponsable } from "@/lib/useResponsable";
import { hoyLima } from "@/lib/fechas-lima";
import { fechaCorta } from "@/lib/carga-inicial-reglas";
import {
  argsGuardarAliada,
  BORRADOR_ALIADA_VACIO,
  campoDelError,
  confirmaLaBaja,
  diaDeLaBaja,
  camposDeAliada,
  LARGO_NOMBRE_ALIADA,
  lineaDelRegimen,
  MEDIOS,
  problemaCuenta,
  REGIMENES,
  type BorradorAliada,
  type CuentaAliada,
  type MedioCuenta,
  type Regimen,
} from "@/lib/empresas-aliadas-reglas";

// La hoja «Nueva empresa aliada» / «Editar <nombre>» (ADR-0683, maqueta docs/maquetas/empresas-aliadas-2026-11/, opción D). Todo se guarda de una vez con
// `guardar_empresa_aliada`: sus datos, sus tiendas y sus cuentas para cobrar. Nunca pide la clave SOL: la conexión con SUNAT es otra cosa (fase 2).
// El RUC usa el mismo <ConsultaDocumento> de proveedores, en modo `boton`: cada consulta al padrón se paga, y si no responde la razón social se escribe a mano.

type Tienda = { id: string; nombre: string };
type Responsable = ReturnType<typeof useResponsable>;

export function HojaEmpresaAliada({
  inicial,
  bajaPedida = false,
  tiendas,
  otrosRuc,
  rucDeCasa,
  responsable,
  volverA,
  onClose,
}: {
  inicial: BorradorAliada | null;
  /** Ya tiene la baja pedida: no se ofrece pedirla otra vez (se deshace desde su tarjeta). */
  bajaPedida?: boolean;
  tiendas: readonly Tienda[];
  /** Los RUC de las demás aliadas: uno repetido se dice al escribir. */
  otrosRuc: readonly string[];
  rucDeCasa: string | null;
  responsable: Responsable;
  /** El botón que la abrió («Agregar empresa aliada» o el lápiz de su tarjeta): ahí vuelve el foco al cerrarla (/chaos 2026-11-21, TEC-06). */
  volverA: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState<BorradorAliada>(inicial ?? BORRADOR_ALIADA_VACIO);
  // Escape, el velo, la ✕ o Cancelar con algo escrito preguntan antes de perderlo (/chaos 2026-11-21, NAV-04: se cerraba sin preguntar).
  const fotoActual = fotoFormulario(b);
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(
    fotoActual !== fotoAlAbrir,
    "Escribiste datos de la empresa y todavía no se guardaron. Si cierras ahora, se pierde lo que escribiste.",
  );
  const [guardando, setGuardando] = useState(false);
  const [baja, setBaja] = useState(false);
  const campos = camposDeAliada(b, otrosRuc, rucDeCasa);
  const guia = useGuiaCampos(campos);
  const editando = b.id !== null;
  const cambia = (parcial: Partial<BorradorAliada>) => setB((x) => ({ ...x, ...parcial }));
  const cambiaCuenta = (i: number, parcial: Partial<CuentaAliada>) =>
    setB((x) => ({
      ...x,
      cuentas: x.cuentas.map((c, j) => (j === i ? { ...c, ...parcial } : c)),
    }));
  const visibles = b.cuentas.map((c, i) => ({ c, i })).filter(({ c }) => !c.quitar);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    setGuardando(true);
    const { error } = (await firmar(createClient().rpc("guardar_empresa_aliada" as never, argsGuardarAliada(b) as never) as never, responsable.firma())) as {
      error: { hint?: string | null; message?: string } | null;
    };
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      const campo = campoDelError(error.hint);
      const texto = traducirError(error as never, editando ? "guardar la empresa" : "registrar la empresa");
      if (campo) guia.marcarError(campo, texto);
      else avisar.error(texto);
      return;
    }
    avisar.exito(editando ? `${b.nombre.trim()}: cambios guardados.` : `${b.nombre.trim()} ya es una empresa aliada.`);
    // Ya está guardado: la pregunta se retira antes de cerrar, o «¿Salir sin guardar?» saldría sobre lo que acaba de guardarse.
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  return (
    <>
      <Modal
        titulo={editando ? `Editar ${inicial?.nombre ?? b.nombre}` : "Nueva empresa aliada"}
        subtitulo={editando ? "Sus datos, tiendas y cuentas." : "Otra dueña que vende en tus tiendas con su propio RUC."}
        onClose={onClose}
        antesDeCerrar={avisoSalida.pedirAccion}
        alCerrarEnfocar={volverA}
        tamano="mediana"
        bloqueado={guardando}
      >
        {(cerrar) => (
          <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="space-y-5">
            <CampoGuiado id="nombre" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("nombre", "Nombre en la tienda")}
                value={b.nombre}
                maxLength={LARGO_NOMBRE_ALIADA}
                autoComplete="off"
                // sugerir-fijo: el nombre de una empresa no depende de nada elegido antes en esta hoja
                placeholder="Como lo verán en las etiquetas"
                onChange={(ev) => cambia({ nombre: ev.target.value })}
              />
            </CampoGuiado>

            <CampoGuiado id="ruc" guia={guia}>
              <ConsultaDocumento
                tipo="ruc"
                obligatorio
                disparo="boton"
                contador
                numero={b.ruc}
                onNumero={(v) => cambia({ ruc: v })}
                nombre={b.razonSocial}
                onNombre={(v) => cambia({ razonSocial: v })}
                problemaExterno={
                  campos.find((c) => c.id === "ruc")?.hecho === false && b.ruc.replace(/\D/g, "").length === 11
                    ? campos.find((c) => c.id === "ruc")?.pendiente
                    : undefined
                }
              />
            </CampoGuiado>

            <CampoGuiado id="regimen" guia={guia}>
              <CampoSelect<Regimen | "">
                etiqueta={guia.etiqueta("regimen", "Régimen")}
                valor={b.regimen ?? ""}
                onValor={(v) => cambia({ regimen: v === "" ? null : v })}
                opciones={REGIMENES.map((r) => ({
                  valor: r.valor,
                  texto: r.nombre,
                }))}
                marcador="Elige su régimen"
                pie={lineaDelRegimen(b.regimen) ?? undefined}
              />
            </CampoGuiado>

            <CampoGuiado id="sedes" guia={guia} titulo="¿En qué tiendas vende?" retiene="fila">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {tiendas.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Casilla
                      marcada={b.sedes.includes(t.id)}
                      etiqueta={t.nombre}
                      onCambio={() =>
                        cambia({
                          sedes: b.sedes.includes(t.id) ? b.sedes.filter((s) => s !== t.id) : [...b.sedes, t.id],
                        })
                      }
                    />
                    {t.nombre}
                  </label>
                ))}
              </div>
            </CampoGuiado>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <CampoGuiado id="correo" guia={guia}>
                <CampoTexto
                  etiqueta={guia.etiqueta("correo", "Correo")}
                  type="email"
                  value={b.correo}
                  autoComplete="off"
                  onChange={(ev) => cambia({ correo: ev.target.value })}
                />
              </CampoGuiado>
              <CampoGuiado id="telefono" guia={guia}>
                <CampoTexto
                  etiqueta={guia.etiqueta("telefono", "Teléfono")}
                  inputMode="tel"
                  value={b.telefono}
                  autoComplete="off"
                  onChange={(ev) => cambia({ telefono: ev.target.value })}
                />
              </CampoGuiado>
            </div>

            <CampoGuiado id="cuentas" guia={guia} titulo="Cuentas para cobrar">
              <div className="space-y-3">
                {visibles.map(({ c, i }) => {
                  const problema = c.numero.trim() || c.banco.trim() ? problemaCuenta(c) : null;
                  return (
                    <div key={i} className="vs-cuenta-aliada relative grid gap-3 p-3 pr-12 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <CampoSelect<MedioCuenta>
                        etiqueta="Tipo"
                        valor={c.medio}
                        onValor={(v) => cambiaCuenta(i, { medio: v })}
                        opciones={MEDIOS.map((m) => ({
                          valor: m.valor,
                          texto: m.nombre,
                        }))}
                      />
                      <div className={c.medio === "transferencia" ? "grid gap-3 sm:grid-cols-2" : ""}>
                        {c.medio === "transferencia" && (
                          <CampoTexto
                            etiqueta="Banco"
                            value={c.banco}
                            maxLength={30}
                            autoComplete="off"
                            onChange={(ev) => cambiaCuenta(i, { banco: ev.target.value })}
                          />
                        )}
                        <CampoTexto
                          etiqueta={c.medio === "transferencia" ? "Cuenta o CCI" : "Celular"}
                          inputMode="numeric"
                          value={c.numero}
                          maxLength={40}
                          autoComplete="off"
                          onChange={(ev) => cambiaCuenta(i, { numero: ev.target.value })}
                          pie={problema ?? undefined}
                          tono={problema ? "error" : undefined}
                        />
                      </div>
                      <button
                        type="button"
                        className="area-dedo absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-taupe hover:text-tinta"
                        aria-label="Quitar esta cuenta"
                        title="Quitar esta cuenta"
                        onClick={() =>
                          c.id
                            ? cambiaCuenta(i, { quitar: true })
                            : setB((x) => ({
                                ...x,
                                cuentas: x.cuentas.filter((_, j) => j !== i),
                              }))
                        }
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  );
                })}
                {visibles.length < 10 && (
                  <Boton
                    type="button"
                    onClick={() =>
                      cambia({
                        cuentas: [...b.cuentas, { id: null, medio: "yape", banco: "", numero: "" }],
                      })
                    }
                  >
                    {visibles.length ? "Agregar otra cuenta" : "Agregar una cuenta"}
                  </Boton>
                )}
                {visibles.length > 0 && <p className="text-sm text-taupe">Lo que entre aquí es de ella: no suma a CAYLA.</p>}
              </div>
            </CampoGuiado>

            <Aviso tono="info" chico>
              Nunca te pediremos la clave SOL.
            </Aviso>

            <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              {/* Lo peligroso de una hoja que guarda va a la izquierda del pie, en la gota con letra roja (ADR-0358, «Lo peligroso»). */}
              {editando && !bajaPedida && (
                <Boton type="button" peso="peligro" onClick={() => setBaja(true)} disabled={guardando}>
                  Dar de baja
                </Boton>
              )}
              <PieGuia guia={guia} listo={editando ? "Todo listo para guardar." : "Todo listo para registrarla."} />
              <div className="ml-auto pie-acciones">
                {/* El `cerrar` de <Modal> no pasa por `antesDeCerrar`: Cancelar pregunta por su cuenta, como Escape y la ✕. */}
                <Boton type="button" onClick={() => avisoSalida.pedirAccion(cerrar)}>
                  Cancelar
                </Boton>
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  confirma={guia}
                  className={guia.claseConfirmar}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                >
                  {editando ? "Guardar cambios" : "Guardar empresa"}
                </Boton>
              </div>
            </div>
          </form>
        )}
      </Modal>
      {avisoSalida.aviso}
      {baja && inicial?.id && (
        <HojaDarDeBaja
          id={inicial.id}
          nombre={inicial.nombre}
          responsable={responsable}
          onClose={() => setBaja(false)}
          alTerminar={() => {
            // La baja quedó pedida: la hoja se va sin preguntar por lo que se haya tocado arriba.
            void avisoSalida.retirarYa();
            setBaja(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

// La segunda confirmación (Felipe 2026-11-21: «borrar con doble confirmación y un plazo de una semana»): tocar «Dar de baja» abre esta hoja, y aquí se escribe
// el nombre. Se puede deshacer 7 días desde su tarjeta; pasada la semana se aplica sola (el trabajo diario `/api/empresas/bajas`).
function HojaDarDeBaja({
  id,
  nombre,
  responsable,
  onClose,
  alTerminar,
}: {
  id: string;
  nombre: string;
  responsable: Responsable;
  onClose: () => void;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const [escrito, setEscrito] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const el = fechaCorta(diaDeLaBaja(hoyLima()));
  const listo = confirmaLaBaja(nombre, escrito);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) {
      setError(`Escribe «${nombre}» tal cual para confirmar.`);
      return;
    }
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    setGuardando(true);
    const { error: err } = (await firmar(
      createClient().rpc("programar_baja_empresa_aliada" as never, { p_id: id, p_confirmacion: escrito } as never) as never,
      responsable.firma(),
    )) as { error: unknown };
    setGuardando(false);
    responsable.despues(err as never);
    if (err) {
      setError(traducirError(err as never, "dar de baja la empresa"));
      return;
    }
    avisar.exito(`${nombre} se da de baja el ${el}.`, {
      detalle: "Hasta ese día puedes deshacerlo desde su tarjeta.",
    });
    router.refresh();
    alTerminar();
  }

  return (
    <Modal titulo={`Dar de baja a ${nombre}`} subtitulo={`Se aplica el ${el}. Hasta ese día puedes deshacerlo.`} onClose={onClose} bloqueado={guardando}>
      {(cerrar) => (
        <form onSubmit={confirmar} className="space-y-5">
          <ul className="space-y-1 text-sm">
            <li>Deja de vender y sale de las tiendas y de las listas.</li>
            <li>Lo que ya vendió se queda en su historia.</li>
            <li>Si nunca tuvo prendas, se borra del todo.</li>
          </ul>
          <CampoTexto
            etiqueta={`Escribe «${nombre}» para confirmar`}
            value={escrito}
            autoComplete="off"
            onChange={(ev) => {
              setEscrito(ev.target.value);
              setError(null);
            }}
            pie={error ?? undefined}
            tono={error ? "error" : undefined}
          />
          <div className="pie-acciones">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Dando de baja…">
              Dar de baja
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
