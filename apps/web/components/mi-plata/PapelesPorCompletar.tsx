"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageOff } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BarraAvance } from "@/components/ui/BarraAvance";
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
  chipPapel,
  ejemploSerie,
  fraseCompletar,
  fraseVeredicto,
  llegadaDePapel,
  pideSerie,
  textoFaltan,
  textoLlegada,
  veredictoPapel,
  type ProveedorOpcion,
} from "@/lib/revisar-compras-reglas";
import type { PapelConFoto } from "@/lib/revisar-compras";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ las compras que anotaron las compradoras. Rediseño (2026-10-23): cada papel
// se revisa en el detalle de la bandeja, al lado de la lista: la foto en grande junto a los campos que se copian de ella (la guía enciende
// el que sigue), «Dice el papel / Anotó X» con su estado, lo que llegó a la tienda y «Completar y pasar a los libros». Al guardar, el papel
// se vuelve un comprobante pagado desde el fondo de quien compró (Facturas de proveedor). Antes de llegar, dice dónde está y no se completa.
// La de quien mira no se completa (nadie completa su propia compra; la base tampoco lo deja).
//
// Manda el papel (Felipe 2026-10-23): si el papel dice otra cosa que lo anotado, el comprobante queda por lo del papel y el detalle lo dice
// antes de guardar. Lo que faltó ya lo dijo la tienda al recibir: aquí se ve, no se vuelve a decidir.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** La miniatura del papel en la fila de la bandeja. */
export function MiniFotoPapel({ papel }: { papel: PapelConFoto }) {
  if (!papel.fotoUrl || papel.fotoRuta?.toLowerCase().endsWith(".pdf")) {
    return (
      <span className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-xl bg-hueso text-taupe" title={papel.fotoUrl ? "Un PDF" : "Sin foto"}>
        {papel.fotoUrl ? <FileText className="h-5 w-5" aria-hidden /> : <ImageOff className="h-5 w-5" aria-hidden />}
      </span>
    );
  }
  return (
    <span className="block h-[54px] w-[54px] shrink-0 overflow-hidden rounded-xl bg-hueso">
      {/* La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={papel.fotoUrl} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

function FotoPapel({ papel }: { papel: PapelConFoto }) {
  const nombre = `${TIPOS_PAPEL[papel.tipo].nombre} de ${papel.proveedor}`;
  if (!papel.fotoUrl) {
    return <p className="nota-cayla text-sm">{papel.fotoRuta ? "La foto no se pudo abrir: recarga la pantalla." : "No subió foto: no le dieron papel."}</p>;
  }
  return (
    <a href={papel.fotoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl bg-hueso p-3" title="Ver la foto en grande">
      {papel.fotoRuta?.toLowerCase().endsWith(".pdf") ? (
        <span className="flex items-center gap-2 text-sm text-tinta">
          <FileText className="h-5 w-5" aria-hidden />
          Abrir el PDF de {nombre}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={papel.fotoUrl} alt={`Foto: ${nombre}`} className="max-h-96 w-full object-contain" />
      )}
    </a>
  );
}

/** Lo que llegó a la tienda: la barra de lo contado y, por prenda, lo que dijo la tienda de lo que faltó. */
function LlegoALaTienda({ papel }: { papel: PapelConFoto }) {
  const l = llegadaDePapel(papel);
  return (
    <div className="flex flex-col gap-2" data-guia="fondos.papel-llegada">
      <p className="campo-etiqueta flex justify-between gap-2">
        <span>Llegó a la tienda</span>
        {l && <span className={`normal-case tracking-normal ${l.completa ? "text-verde" : "text-ambar-profundo"}`}>{l.completa ? `✓ ${l.llegaron} de ${l.total}` : `${l.llegaron} de ${l.total}`}</span>}
      </p>
      {l && <BarraAvance pct={(l.llegaron / Math.max(1, l.total)) * 100} tono={l.completa ? "verde" : "ambar"} etiqueta="Lo que llegó a la tienda" texto={`${l.llegaron} de ${l.total}`} />}
      <ul className="divide-y divide-sand text-sm">
        {papel.lineas.map((x) => (
          <li key={x.id} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-tinta">
                {x.cantidad} · {x.nombre}
              </span>
              <span className="block text-xs text-taupe">
                {x.cantidad} × {soles(x.costo)} · va a {x.destino}
                {textoFaltan(x) ? <span className="text-ambar-profundo"> · {textoFaltan(x)}</span> : null}
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums text-tinta">{soles(x.subtotal)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DetallePapel({
  papel,
  proveedores,
  alTerminar,
  alSaltar,
}: {
  papel: PapelConFoto;
  proveedores: ProveedorOpcion[];
  alTerminar: () => void;
  /** «Más tarde»: pasa a la siguiente sin guardar. Sin ella (la única de la lista), no se dibuja. */
  alSaltar?: () => void;
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
  const nombre = primerNombre(papel.persona);
  const chip = chipPapel(papel);
  const cuadraPlata = Math.abs(v.pagado - v.anotado) < 0.005;

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
      detalle: `Ya está en Facturas de proveedor, pagada del fondo de ${nombre}.`,
    });
    alTerminar();
    router.refresh();
  }

  return (
    <PanelDetalle
      guia="fondos.papel-detalle"
      sobre={`Compró ${papel.persona}${papel.fecha ? ` · ${diaMes(papel.fecha)}` : ""}`}
      titulo={`${papel.tipo === "sin_comprobante" ? "Compra sin papel" : tipo} de ${soles(papel.monto)}`}
      estado={<Chip tono={chip.tono}>{papel.llego ? chip.texto : textoLlegada(papel)}</Chip>}
    >
      <div className="grid gap-5 @min-[38rem]:grid-cols-[18.75rem_minmax(0,1fr)]">
        <FotoPapel papel={papel} />
        <div className="flex min-w-0 flex-col gap-5">
          {papel.esMia ? (
            <div className="flex flex-col items-start gap-2">
              <Chip tono="pizarra">Es tuya</Chip>
              <p className="text-sm text-taupe">Nadie completa su propia compra: que la complete otra persona de Compras.</p>
            </div>
          ) : !papel.llego ? (
            <p className="nota-cayla text-sm">Se completa cuando la tienda la reciba y cierre el conteo.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmar();
              }}
              className="flex min-w-0 flex-col gap-5"
            >
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
                    <span className="text-xs text-taupe">lo eligió {nombre} al comprar</span>
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

              {/* «Dice el papel / Anotó X» con su estado, como la maqueta. «Se anotó mal» corrige el monto del papel. */}
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
                  <p className="mt-1.5 text-xs text-taupe">{nombre} anotó {soles(papel.monto)}: el comprobante y su plata quedan por este monto.</p>
                </CampoGuiado>
              ) : null}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-sand bg-crema px-4 py-3" data-guia="fondos.papel-veredicto">
                <span className="min-w-0">
                  <span className="block text-xs text-taupe">Dice el papel</span>
                  <span className="block font-serif text-2xl tabular-nums text-tinta">{soles(v.pagado)}</span>
                </span>
                <Chip tono={cuadraPlata ? "verde" : "ambar"}>{cuadraPlata ? "Cuadra" : "No cuadra"}</Chip>
                <span className="min-w-0 text-right">
                  <span className="block text-xs text-taupe">Anotó {nombre}</span>
                  <span className="block font-serif text-2xl tabular-nums text-tinta">{soles(v.anotado)}</span>
                </span>
              </div>
              {v.caso !== "cuadra" && (
                <div className="nota-cayla sin-i text-sm">
                  <span className="block font-medium text-tinta">{TITULO_CASO[v.caso]}</span>
                  <span className="block text-taupe">{fraseVeredicto(v, papel.tipo)}</span>
                </div>
              )}
              {!cambiaMonto && (
                <button type="button" className="btn-enlace self-start text-sm" disabled={guardando} onClick={() => setCambiaMonto(true)}>
                  Se anotó mal: cambiar el monto
                </button>
              )}

              <LlegoALaTienda papel={papel} />

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
              <PieGuia guia={guia} listo="Todo listo para pasarla a los libros." conFrase />
              <div className="pie-acciones border-t border-sand pt-4">
                {alSaltar && (
                  <Boton type="button" peso="fantasma" onClick={alSaltar} disabled={guardando}>
                    Más tarde
                  </Boton>
                )}
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  textoCargando="Guardando…"
                  disabled={!guia.puedeConfirmar}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                  data-guia="fondos.papel-completar"
                >
                  {fraseCompletar()}
                </Boton>
              </div>
            </form>
          )}
          {(papel.esMia || !papel.llego) && <LlegoALaTienda papel={papel} />}
        </div>
      </div>
    </PanelDetalle>
  );
}
