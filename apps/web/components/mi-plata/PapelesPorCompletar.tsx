"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageOff } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { primerNombre } from "@/lib/fondos-reglas";
import { TIPOS_PAPEL } from "@/lib/compra-rapida-reglas";
import { completarPapel } from "@/lib/revisar-compras-acciones";
import {
  TITULO_CASO,
  camposCompletar,
  ejemploSerie,
  fraseCompletar,
  fraseVeredicto,
  pideSerie,
  textoFaltan,
  textoLlegada,
  veredictoPapel,
  type ProveedorOpcion,
} from "@/lib/revisar-compras-reglas";
import type { PapelConFoto } from "@/lib/revisar-compras";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ las compras que anotaron las compradoras. Cada tarjeta es UN papel: su
// foto, de quién, qué prendas anotó y a qué tienda, lo que contó la tienda y si cuadra. Cuando la tienda ya cerró el conteo, «Completar»
// abre la hoja para copiar la serie y el número de la foto; al guardar, el papel se vuelve un comprobante pagado desde el fondo de quien
// compró (Facturas de proveedor). Antes de llegar, la tarjeta dice dónde está y no se completa. La de quien mira no se completa (nadie
// completa su propia compra; la base tampoco lo deja).
//
// Manda el papel (Felipe 2026-10-23): si el papel dice otra cosa que lo anotado, el comprobante queda por lo del papel y la hoja lo dice
// antes de guardar. Lo que faltó ya lo dijo la tienda al recibir: aquí se ve, no se vuelve a decidir.

export function PapelesPorCompletar({ papeles, proveedores }: { papeles: PapelConFoto[]; proveedores: ProveedorOpcion[] }) {
  return (
    <ul className="space-y-3" data-guia="fondos.papeles">
      {papeles.map((p) => (
        <TarjetaPapel key={p.id} papel={p} proveedores={proveedores} />
      ))}
    </ul>
  );
}

function FotoPapel({ papel, grande = false }: { papel: PapelConFoto; grande?: boolean }) {
  const nombre = `${TIPOS_PAPEL[papel.tipo].nombre} de ${papel.proveedor}`;
  const caja = grande ? "block overflow-hidden rounded-xl bg-hueso" : "grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-hueso text-taupe";
  if (!papel.fotoUrl) {
    return (
      <span className={grande ? "nota-cayla block text-sm" : caja} title={papel.fotoRuta ? "La foto no se pudo abrir" : "Sin foto"}>
        {grande ? (papel.fotoRuta ? "La foto no se pudo abrir: recarga la pantalla." : "No subió foto: no le dieron papel.") : <ImageOff className="h-5 w-5" aria-hidden />}
        {!grande && <span className="sr-only">Sin foto</span>}
      </span>
    );
  }
  return (
    <a href={papel.fotoUrl} target="_blank" rel="noopener noreferrer" className={caja} title="Ver la foto en grande">
      {papel.fotoRuta?.toLowerCase().endsWith(".pdf") ? (
        <FileText className="h-6 w-6" aria-hidden />
      ) : (
        // La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={papel.fotoUrl} alt={`Foto: ${nombre}`} className={grande ? "max-h-80 w-full object-contain" : "h-full w-full object-cover"} />
      )}
    </a>
  );
}

function TarjetaPapel({ papel, proveedores }: { papel: PapelConFoto; proveedores: ProveedorOpcion[] }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  const v = veredictoPapel(papel);
  const tipo = TIPOS_PAPEL[papel.tipo].nombre;
  return (
    <li className="card-cayla @container overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-sand px-4 py-3">
        <span className="font-serif text-lg text-tinta">
          {papel.tipo === "sin_comprobante" ? "Compra sin papel" : tipo} de <span className="whitespace-nowrap">{soles(papel.monto)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-taupe">
          Lo pagó {primerNombre(papel.persona)} con su plata de compras
          {papel.fecha ? ` · ${diaMes(papel.fecha)}` : ""}
          <Chip tono={papel.llego ? "verde" : "pizarra"}>{textoLlegada(papel)}</Chip>
        </span>
      </div>
      <div className="grid gap-4 p-4 @min-[44rem]:grid-cols-[5rem_minmax(0,1fr)_minmax(0,18rem)]">
        <FotoPapel papel={papel} />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-tinta">
            <span className="font-medium">{papel.proveedor}</span>
            <span className="text-taupe"> · lo eligió {primerNombre(papel.persona)} al comprar</span>
          </p>
          <ul className="divide-y divide-sand text-sm">
            {papel.lineas.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-tinta">
                    {l.cantidad} {l.nombre}
                  </span>
                  <span className="block text-xs text-taupe">
                    a {l.destino} · {soles(l.costo)} c/u
                    {textoFaltan(l) ? <span className="text-ambar-profundo"> · {textoFaltan(l)}</span> : null}
                  </span>
                </span>
                <span className="whitespace-nowrap tabular-nums text-tinta">{soles(l.subtotal)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          {papel.llego && (
            <div className={v.caso === "cuadra" ? "nota-cayla text-sm" : "nota-cayla sin-i text-sm"} data-guia="fondos.papel-veredicto">
              <span className="block font-medium text-tinta">{TITULO_CASO[v.caso]}</span>
              <span className="block text-taupe">{fraseVeredicto(v, papel.tipo)}</span>
            </div>
          )}
          {papel.esMia ? (
            <span className="flex justify-end">
              <Chip tono="pizarra" title="Nadie completa su propia compra: que la complete otra persona de Compras.">
                Es tuya
              </Chip>
            </span>
          ) : papel.llego ? (
            <Boton
              peso="primario"
              className="self-end"
              data-guia="fondos.papel-completar"
              onClick={(e) => {
                origen.current = e.currentTarget;
                setAbierta(true);
              }}
            >
              Completar
            </Boton>
          ) : (
            <p className="text-xs text-taupe">Se completa cuando la tienda la reciba y cierre el conteo.</p>
          )}
        </div>
      </div>
      {abierta && <CompletarPapelModal papel={papel} proveedores={proveedores} onClose={() => setAbierta(false)} volverA={origen} />}
    </li>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function CompletarPapelModal({
  papel,
  proveedores,
  onClose,
  volverA,
}: {
  papel: PapelConFoto;
  proveedores: ProveedorOpcion[];
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState(papel.proveedorId);
  const [cambiaProveedor, setCambiaProveedor] = useState(false);
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [cambiaMonto, setCambiaMonto] = useState(false);
  const [monto, setMonto] = useState(papel.monto.toFixed(2));
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposCompletar({ serie, numero, cambiaMonto, monto }, papel.tipo, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = cambiaMonto ? leerMontoPlata(monto) : papel.monto;
  const v = veredictoPapel(papel, montoLeido ?? papel.monto);
  const proveedor = proveedores.find((p) => p.id === proveedorId)?.nombre ?? papel.proveedor;
  const tipo = TIPOS_PAPEL[papel.tipo].nombre;

  const limpiar = <T,>(f: (x: T) => void) => (x: T) => {
    setRechazo(null);
    f(x);
  };

  async function confirmar() {
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    setGuardando(true);
    const firma = esPersona ? firmaOmitida("papel_completar") : responsable.firma();
    const { data, error } = await completarPapel(
      {
        p_papel_id: papel.id,
        p_proveedor_id: proveedorId === papel.proveedorId ? null : proveedorId,
        p_serie: pideSerie(papel.tipo) ? serie.trim().toUpperCase() : null,
        p_numero: papel.tipo === "sin_comprobante" ? null : numero.trim() || null,
        p_monto: cambiaMonto ? (montoLeido ?? 0) : null,
      },
      firma,
    );
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "completar el papel"), tono: "error" },
      );
    }
    const documento = (data as { documento?: string } | null)?.documento;
    avisar.exito(documento ? `Guardaste ${documento}` : "Guardaste la compra", {
      detalle: `Ya está en Facturas de proveedor, pagada del fondo de ${primerNombre(papel.persona)}.`,
    });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo={`Completar ${papel.tipo === "sin_comprobante" ? "la compra" : `la ${tipo.toLowerCase()}`}`}
      subtitulo={`${papel.persona} pagó ${soles(papel.monto)} a ${papel.proveedor}. Copia de la foto lo que falta.`}
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      alCerrarEnfocar={volverA}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          {/* Sin papel y sin foto, el aviso del número interno ya lo dice: no se repite. */}
          {(papel.fotoRuta || papel.tipo !== "sin_comprobante") && <FotoPapel papel={papel} grande />}

          <div className="space-y-1.5">
            <p className="campo-etiqueta">Proveedor</p>
            {cambiaProveedor ? (
              <ComboBuscable
                etiquetaAccesible="Proveedor"
                caja
                valor={proveedorId}
                onValor={limpiar(setProveedorId)}
                opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre, detalle: p.ruc ? `RUC ${p.ruc}` : undefined, claves: p.ruc ? [p.ruc] : undefined }))}
                marcador="Busca por nombre o RUC"
              />
            ) : (
              <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-medium text-tinta">{proveedor}</span>
                <span className="text-xs text-taupe">lo eligió {primerNombre(papel.persona)} al comprar</span>
                <button type="button" className="btn-enlace text-sm" disabled={guardando} onClick={() => setCambiaProveedor(true)}>
                  No es este: cambiar
                </button>
              </p>
            )}
          </div>

          {pideSerie(papel.tipo) ? (
            <div className="grid grid-cols-2 gap-3">
              <CampoGuiado id="serie" guia={guia} titulo="Serie">
                <CampoTexto
                  etiqueta="Serie"
                  caja
                  autoComplete="off"
                  maxLength={8}
                  placeholder={ejemploSerie(papel.tipo)}
                  value={serie}
                  disabled={guardando}
                  onChange={(e) => limpiar(setSerie)(e.target.value.toUpperCase())}
                />
              </CampoGuiado>
              <CampoGuiado id="numero" guia={guia} titulo="Número">
                <CampoTexto
                  etiqueta="Número"
                  caja
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="Como dice el papel" // sugerir-fijo: el número de un papel no depende de nada elegido antes
                  value={numero}
                  disabled={guardando}
                  onChange={(e) => limpiar(setNumero)(e.target.value)}
                />
              </CampoGuiado>
            </div>
          ) : papel.tipo === "nota_venta" ? (
            <CampoGuiado id="numero" guia={guia} titulo="Número · si lo tiene">
              <CampoTexto
                etiqueta="Número"
                caja
                autoComplete="off"
                maxLength={20}
                placeholder="Como dice el papel" // sugerir-fijo: el número de un papel no depende de nada elegido antes
                value={numero}
                disabled={guardando}
                onChange={(e) => limpiar(setNumero)(e.target.value)}
              />
            </CampoGuiado>
          ) : (
            <p className="nota-cayla text-sm">No le dieron papel: se guarda con un número interno (SC-…).</p>
          )}

          {cambiaMonto ? (
            <CampoGuiado id="monto" guia={guia} titulo="Lo que dice el papel">
              <CampoMonto
                etiqueta="Lo que dice el papel"
                etiquetaOculta
                inputMode="decimal"
                autoComplete="off"
                value={monto}
                disabled={guardando}
                onChange={(e) => limpiar(setMonto)(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-taupe">{primerNombre(papel.persona)} anotó {soles(papel.monto)}: el comprobante y su plata quedan por este monto.</p>
            </CampoGuiado>
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="text-taupe">El papel dice</span>
              <span className="font-serif text-lg tabular-nums text-tinta">{soles(papel.monto)}</span>
              <button type="button" className="btn-enlace text-sm" disabled={guardando} onClick={() => setCambiaMonto(true)}>
                Se anotó mal: cambiar el monto
              </button>
            </p>
          )}

          <div className="nota-cayla sin-i text-sm">
            <span className="block font-medium text-tinta">{TITULO_CASO[v.caso]}</span>
            <span className="block text-taupe">{fraseVeredicto(v, papel.tipo)}</span>
          </div>

          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién completa">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para guardar." conFrase />
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              textoCargando="Guardando…"
              disabled={!guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
            >
              {fraseCompletar(papel.tipo, montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
