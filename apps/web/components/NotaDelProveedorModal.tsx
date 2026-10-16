"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Casilla } from "@/components/ui/Casilla";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { soles } from "@/lib/compras-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { adjuntarNotaProveedor } from "@/lib/nota-proveedor-acciones";
import {
  AVISO_DE_CORTE_NOTA_PROVEEDOR,
  argsNotaProveedor,
  borradorNotaProveedor,
  camposNotaProveedor,
  cifrasDeLaNota,
  detalleNotaProveedor,
  documentosParaLaNota,
  mensajeDeNotaProveedor,
  problemasNotaProveedor,
  seriesDelComprobante,
  sugiereRecargarNotaProveedor,
  type BorradorNotaProveedor,
} from "@/lib/nota-proveedor-reglas";
import type { FilaVista } from "@/lib/notas-credito-reglas";

// «Llegó su nota de crédito» (ADR-0362, fase 5b, actividad 3). Lo que no llegó de una FACTURA ya volvió como plata con un documento interno
// (DI-…); falta el papel del proveedor, la nota de crédito (07), para que su IGV baje el crédito fiscal. Esta hoja la adjunta: la serie y la
// fecha como dice el papel, y el monto, que tiene que ser lo mismo que lo que no llegó (si dice otra cifra, la corrige el proveedor). No mueve
// plata. La base vuelve a exigir todo (`adjuntar_nota_proveedor`); la guía de foco (ADR-0284) sale de las mismas reglas
// (`nota-proveedor-reglas.ts`). Un doble clic no adjunta dos veces (candado con una ref y el token).

export function NotaDelProveedorModal({ nota, filas, hoy, onCerrar }: { nota: FilaVista; filas: FilaVista[]; hoy: string; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  // Los documentos y las series se fijan al abrir: si el tablero se recarga detrás, la hoja sigue hablando de lo mismo.
  const [docs] = useState(() => documentosParaLaNota(filas, nota));
  const series = useMemo(() => seriesDelComprobante(filas, nota.compraId), [filas, nota.compraId]);
  const [borrador, setBorrador] = useState<BorradorNotaProveedor>(() => borradorNotaProveedor(docs, hoy));
  const [fechaTocada, setFechaTocada] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  // Un token por hoja, el mismo en cada reintento: la base no adjunta dos veces el mismo pedido.
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);

  const problemas = problemasNotaProveedor({ borrador, docs, seriesUsadas: series, emision: nota.compraFechaEmision, hoy });
  const guia = useGuiaCampos(camposNotaProveedor(problemas, docs, { listo: responsable.listo, motivo: responsable.motivo }, { fecha: fechaTocada }));
  const cifras = cifrasDeLaNota(docs, borrador.elegidos);
  // Un error de un campo se muestra si ya se escribió algo, o después de intentar adjuntar: no antes de empezar.
  const errorDe = (campo: "serie" | "fecha" | "monto", valor: string) => (intentado || valor.trim() !== "" ? problemas[campo] : undefined);

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  async function adjuntar() {
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic. El candado es el de la casa: una ref.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      setIntentado(true);
      const bloquea = guia.faltan.find((c) => c.requerido)?.id ?? guia.ahora;
      if (bloquea) guia.ir(bloquea);
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const { nota: adjunta, error: falla } = await adjuntarNotaProveedor(argsNotaProveedor(borrador, docs, token), responsable.firma());
      setGuardando(false);
      responsable.despues(falla);
      if (falla) {
        // Se cortó la señal: pudo adjuntarse. Reintentar sin cambiar nada es seguro (el mismo token no adjunta dos veces).
        setError(
          esFalloDeRed(falla)
            ? { texto: AVISO_DE_CORTE_NOTA_PROVEEDOR, recargar: false }
            : { texto: mensajeDeNotaProveedor(falla) ?? traducirError(falla, "adjuntar la nota del proveedor"), recargar: sugiereRecargarNotaProveedor(falla) },
        );
        return;
      }
      avisar.exito(adjunta ? `Se adjuntó la nota ${adjunta.serie}` : "Se adjuntó la nota del proveedor", { detalle: adjunta ? detalleNotaProveedor(adjunta) : undefined });
      onCerrar();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal titulo="Llegó su nota de crédito" subtitulo={`${nota.proveedorNombre} · ${nota.documento}`} bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void adjuntar();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-tinta/80">
            La plata ya volvió con el documento interno. Adjunta la nota de crédito que mandó el proveedor: desde su fecha, su IGV baja tu crédito
            fiscal. No mueve plata.
          </p>

          {docs.length > 1 ? (
            <CampoGuiado id="documentos" guia={guia} titulo="Qué respalda la nota">
              <ul className="space-y-2">
                {docs.map((d) => {
                  const marcada = borrador.elegidos.includes(d.id);
                  return (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-tinta">
                        <Casilla
                          marcada={marcada}
                          onCambio={() =>
                            setBorrador((b) => ({ ...b, elegidos: marcada ? b.elegidos.filter((x) => x !== d.id) : [...b.elegidos, d.id] }))
                          }
                          etiqueta={`${d.serieNumero ?? ""} por ${soles(d.monto)}`}
                        />
                        <span className="tabular-nums">{d.serieNumero}</span>
                        <span className="ml-auto tabular-nums text-tinta/70">{soles(d.monto)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </CampoGuiado>
          ) : (
            <p className="text-sm text-tinta/80">
              Respalda el <b className="font-semibold tabular-nums text-tinta">{docs[0]?.serieNumero}</b>, de {soles(cifras.monto)}.
            </p>
          )}

          <CampoGuiado id="serie" guia={guia} titulo="Serie y número de la nota">
            <CampoTexto
              id="np-serie"
              etiqueta="Serie y número de la nota"
              caja
              autoComplete="off"
              className="uppercase tabular-nums"
              // sugerir-fijo: es el formato de una nota de crédito de SUNAT; no depende de nada elegido antes
              placeholder="FC01-000123"
              maxLength={40}
              value={borrador.serie}
              tono={errorDe("serie", borrador.serie) ? "error" : undefined}
              pie={errorDe("serie", borrador.serie)}
              sinPie={!errorDe("serie", borrador.serie)}
              onChange={(e) => setBorrador((b) => ({ ...b, serie: e.target.value.toUpperCase() }))}
            />
          </CampoGuiado>

          <CampoGuiado id="fecha" guia={guia} titulo="Fecha de la nota">
            <CampoFecha
              id="np-fecha"
              caja
              etiqueta="Fecha de la nota"
              valor={borrador.fecha}
              onValor={(iso) => {
                setFechaTocada(true);
                setBorrador((b) => ({ ...b, fecha: iso }));
              }}
              required
              tono={errorDe("fecha", borrador.fecha) ? "error" : "neutro"}
              pie={errorDe("fecha", borrador.fecha)}
            />
            <p className="mt-1.5 text-xs text-taupe">La que dice el papel: en ese mes baja tu crédito fiscal.</p>
          </CampoGuiado>

          <CampoGuiado id="monto" guia={guia} titulo="Monto de la nota" ayuda={`tiene que decir ${soles(cifras.monto)}`}>
            <CampoMonto
              id="np-monto"
              etiqueta="Monto de la nota"
              etiquetaOculta
              inputMode="decimal"
              autoComplete="off"
              // sugerir-fijo: el formato de un monto en soles; lo que tiene que decir va al lado, en el título
              placeholder="0.00"
              value={borrador.monto}
              tono={errorDe("monto", borrador.monto) ? "error" : undefined}
              pie={errorDe("monto", borrador.monto)}
              onChange={(e) => setBorrador((b) => ({ ...b, monto: e.target.value }))}
            />
            <p className="mt-1.5 text-xs text-taupe">
              Lo que no llegó, con su IGV: base {soles(cifras.base)} + IGV {soles(cifras.igv)}.
            </p>
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia} titulo="Quién lo hace">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <PieGuia guia={guia} listo="Todo listo para adjuntar la nota." />
          {error && (
            <Aviso
              ref={avisoError}
              enfocable
              tono="error"
              titulo="No se pudo adjuntar la nota"
              accion={
                // Lo que la hoja muestra ya no es lo que hay: se cierra y el tablero se vuelve a leer.
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
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton textoCargando="Adjuntando…" type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Adjuntar la nota
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
