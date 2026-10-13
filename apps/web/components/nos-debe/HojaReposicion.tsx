"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { soles } from "@/lib/compras-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { resolverDeudaProveedor } from "@/lib/nos-debe-acciones";
import {
  AVISO_DE_CORTE_REPOSICION,
  argsResolverDeuda,
  borradorReposicion,
  camposReposicion,
  cantidadAnotada,
  detalleDeReposicion,
  dondeFalto,
  leerCantidadReposicion,
  limpiarCantidadReposicion,
  mensajeDeNosDebe,
  nombreDeDeuda,
  queDebe,
  sugiereRecargarNosDebe,
  textoBotonReposicion,
  TOPES_REPOSICION,
  type BorradorReposicion,
  type DeudaProveedor,
} from "@/lib/nos-debe-reglas";

// «Llegó la reposición» a mano (ADR-0362, fase 5a, decisión 14): el proveedor ya mandó lo que faltó, pero se recibió sin marcarlo como
// reposición, o lo entregó de otra forma. La hoja anota cuántas llegaron (de 1 a lo que debe), cómo llegó y quién lo anota
// (`resolver_deuda_proveedor`, forma «repuesta»). NO mete prendas al stock: eso lo hace la recepción; la hoja lo dice antes de pulsar.
//
// La guía de foco (ADR-0284): la cantidad viene puesta con todo lo que se debía y es «sugerida» hasta que se toca; la nota y quién lo anota
// son obligatorias, como en la base. Un doble clic no anota dos veces (candado con una ref, y el token: la base devuelve lo mismo si el pedido
// se repite igual, también tras un corte de señal).

export function BotonReposicion({ deuda, proveedorNombre, hoy }: { deuda: DeudaProveedor; proveedorNombre: string; hoy: string }) {
  const [abierta, setAbierta] = useState(false);
  // Al cerrar la hoja, el foco vuelve al botón que la abrió.
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        type="button"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
        data-guia="proveedor-ficha.reposicion"
        className="shrink-0"
      >
        Llegó la reposición
      </Boton>
      {abierta && <HojaReposicion deuda={deuda} proveedorNombre={proveedorNombre} hoy={hoy} volverA={origen} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

function HojaReposicion({
  deuda,
  proveedorNombre,
  hoy,
  volverA,
  onCerrar,
}: {
  deuda: DeudaProveedor;
  proveedorNombre: string;
  hoy: string;
  volverA: RefObject<HTMLElement | null>;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [borrador, setBorrador] = useState<BorradorReposicion>(() => borradorReposicion(deuda));
  const [cantidadTocada, setCantidadTocada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  // Un token por hoja, el mismo en cada reintento: la base no anota dos veces el mismo pedido.
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);

  const guia = useGuiaCampos(camposReposicion(borrador, deuda, { listo: responsable.listo, motivo: responsable.motivo }, { cantidad: cantidadTocada }));
  const n = cantidadAnotada(borrador, deuda);
  const problemaCantidad = deuda.pendiente > 1 && cantidadTocada ? leerCantidadReposicion(borrador.cantidad, deuda.pendiente, deuda.categoria).problema : null;

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  async function anotar() {
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic. El candado es el de la casa: una ref.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      // A lo que bloquea (la nota, quién lo anota), no a la cantidad que viene puesta y solo se sugiere revisar.
      const bloquea = guia.faltan.find((c) => c.requerido)?.id ?? guia.ahora;
      if (bloquea) guia.ir(bloquea);
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const anotadas = n ?? 0;
      const { resultado, error: falla } = await resolverDeudaProveedor(argsResolverDeuda(deuda, borrador, token), responsable.firma());
      setGuardando(false);
      responsable.despues(falla);
      if (falla) {
        // Se cortó la señal: pudo anotarse. Reintentar sin cambiar nada es seguro (el mismo token no anota dos veces).
        setError(
          esFalloDeRed(falla)
            ? { texto: AVISO_DE_CORTE_REPOSICION, recargar: false }
            : { texto: mensajeDeNosDebe(falla) ?? traducirError(falla, "anotar la reposición"), recargar: sugiereRecargarNosDebe(falla) },
        );
        return;
      }
      avisar.exito(anotadas === 1 ? "Reposición anotada: llegó 1" : `Reposición anotada: llegaron ${anotadas.toLocaleString("es-PE")}`, {
        detalle: detalleDeReposicion(proveedorNombre, deuda, anotadas, resultado),
      });
      onCerrar();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal titulo="Llegó la reposición" subtitulo={`${proveedorNombre} · ${nombreDeDeuda(deuda)}`} bloqueado={guardando} onClose={onCerrar} alCerrarEnfocar={volverA} ancho="max-w-md">
      {(cerrar) => (
        <form
          // La demo (ADR-0389) abre esta hoja para mostrarla y la cierra sin anotar nada.
          data-guia="proveedor-ficha.hoja-reposicion"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void anotar();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-tinta/80">
            Te debe <b className="font-semibold text-tinta">{queDebe(deuda)}</b> ({soles(deuda.montoPendiente)}): faltaron en {dondeFalto(deuda, hoy)}.
          </p>
          <p className="nota-cayla text-[13px]">
            Esto solo anota que el proveedor cumplió: no suma prendas al stock. Si llegaron en un envío que todavía no recibiste, márcalas al
            recibirlo («Es la reposición de lo que faltó») y se anotan solas.
          </p>

          {deuda.pendiente > 1 ? (
            <CampoGuiado id="cantidad" guia={guia} titulo="¿Cuántas llegaron?" ayuda={`te debía ${deuda.pendiente.toLocaleString("es-PE")}`}>
              <CampoTexto
                id="reposicion-cantidad"
                etiqueta="Cuántas llegaron"
                caja
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
                value={borrador.cantidad}
                tono={problemaCantidad ? "error" : undefined}
                pie={problemaCantidad ?? undefined}
                sinPie={!problemaCantidad}
                onChange={(e) => {
                  setCantidadTocada(true);
                  setBorrador((b) => ({ ...b, cantidad: limpiarCantidadReposicion(e.target.value) }));
                }}
              />
            </CampoGuiado>
          ) : (
            <p className="text-sm text-tinta/80">Te debía 1: se anota que llegó.</p>
          )}

          <CampoGuiado id="nota" guia={guia} titulo="¿Cómo llegó?">
            <CampoTexto
              id="reposicion-nota"
              etiqueta="Cómo llegó"
              caja
              maxLength={TOPES_REPOSICION.nota}
              placeholder="Escribe en qué envío llegó o quién la trajo"
              value={borrador.nota}
              onChange={(e) => setBorrador((b) => ({ ...b, nota: e.target.value }))}
            />
            <p className="mt-1.5 text-xs text-taupe">Queda en el historial de esta deuda.</p>
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia} titulo="Quién lo anota">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <PieGuia guia={guia} listo="Todo listo para anotarlo." />
          {error && (
            <Aviso
              ref={avisoError}
              enfocable
              tono="error"
              titulo="No se pudo anotar la reposición"
              accion={
                // La deuda cambió mientras la hoja estaba abierta: se cierra y la ficha se vuelve a leer, con lo que queda de verdad.
                error.recargar ? (
                  <Boton
                    type="button"
                    onClick={() => {
                      onCerrar();
                      router.refresh();
                    }}
                  >
                    Recargar
                  </Boton>
                ) : undefined
              }
            >
              {error.texto}
            </Aviso>
          )}
          {/* Fija abajo mientras el contenido pasa por detrás: en un laptop de 768 px de alto el botón quedaba bajo el pliegue. */}
          <div className="pie-hoja-fijo flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Anotando…" : textoBotonReposicion(n)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
