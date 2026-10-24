"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, FileText, ImageOff, Package, TriangleAlert, Wallet, ZoomIn } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
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
import { primerNombre } from "@/lib/fondos-reglas";
import { TIPOS_PAPEL } from "@/lib/compra-rapida-reglas";
import { completarPapel } from "@/lib/revisar-compras-acciones";
import {
  camposCompletar,
  chipPapel,
  destinosDePapel,
  ejemploSerie,
  fraseCompletar,
  llegadaDePapel,
  notaNoCuadra,
  pagoPapel,
  pideSerie,
  sobrePapel,
  subtituloPapel,
  textoFaltan,
  textoLlegada,
  veredictoPapel,
  type ProveedorOpcion,
} from "@/lib/revisar-compras-reglas";
import type { PapelConFoto } from "@/lib/revisar-compras";
import { PanelDetalle } from "./PanelDetalle";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ las compras que anotaron las compradoras. Rediseño (2026-10-23): cada papel
// se revisa en el detalle de la bandeja, al lado de la lista: la foto en grande junto a los campos que se copian de ella (la guía enciende
// el que sigue), «Dice el papel / Anotó X» con su estado, lo que llegó a la tienda y «Completar». Al guardar, el papel
// se vuelve un comprobante pagado desde el fondo de quien compró (Historial de compras), o a crédito por lo que no pagó. Antes de llegar, dice dónde está y no se completa.
// La de quien mira no se completa (nadie completa su propia compra; la base tampoco lo deja).
//
// Manda el papel (Felipe 2026-10-23): si el papel dice otra cosa que lo anotado, el comprobante queda por lo del papel y el detalle lo dice
// antes de guardar. Lo que faltó ya lo dijo la tienda al recibir: aquí se ve, no se vuelve a decidir.
//
// Diseño «A · Bandeja serena» (Felipe lo eligió el 2026-10-23 mirando capturas): arriba el papel y su ronda, el proveedor y el monto en
// grande; a la izquierda la foto del papel y a la derecha tres bloques con su ícono —¿cuadra?, ¿llegó?, ¿cómo se pagó?— y debajo la serie
// y el número. Lo demás (cambiar el proveedor o el monto, las prendas) queda abajo, en una línea. Sin párrafos: cifras, íconos y chips.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** La miniatura del papel en la fila de la bandeja (48 px). */
export function MiniFotoPapel({ papel }: { papel: PapelConFoto }) {
  if (!papel.fotoUrl || papel.fotoRuta?.toLowerCase().endsWith(".pdf")) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-hueso text-taupe" title={papel.fotoUrl ? "Un PDF" : "Sin foto"}>
        {papel.fotoUrl ? <FileText className="h-5 w-5" aria-hidden /> : <ImageOff className="h-5 w-5" aria-hidden />}
      </span>
    );
  }
  return (
    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-hueso">
      {/* La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={papel.fotoUrl} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

/** La foto del papel, grande, sobre hueso; toda ella abre la foto en grande (la lupa de la esquina lo dice). */
function FotoPapel({ papel }: { papel: PapelConFoto }) {
  const nombre = `${TIPOS_PAPEL[papel.tipo].nombre} de ${papel.proveedor}`;
  if (!papel.fotoUrl) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl bg-hueso p-5 text-center">
        <ImageOff className="h-5 w-5 text-taupe" aria-hidden />
        <span className="text-sm font-medium text-tinta">{papel.fotoRuta ? "La foto no se pudo abrir" : "Sin foto"}</span>
        <span className="text-xs text-taupe">
          {papel.fotoRuta ? "Recarga la pantalla" : papel.tipo === "sin_comprobante" ? "No le dieron papel" : `Pídele el papel a ${primerNombre(papel.persona)}`}
        </span>
      </div>
    );
  }
  const esPdf = papel.fotoRuta?.toLowerCase().endsWith(".pdf");
  return (
    <a
      href={papel.fotoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-2xl bg-hueso p-4"
      title="Ver la foto en grande"
    >
      {esPdf ? (
        <span className="flex items-center gap-2 text-sm text-tinta">
          <FileText className="h-5 w-5" aria-hidden />
          Abrir el PDF de {nombre}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={papel.fotoUrl} alt={`Foto: ${nombre}`} className="max-h-96 w-full object-contain" />
      )}
      <span aria-hidden className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-papel text-tinta">
        <ZoomIn className="h-4 w-4" />
      </span>
    </a>
  );
}

/** Un bloque del detalle: el ícono en su círculo, el título, una línea y, a la derecha, una cifra. */
function Bloque({
  icono,
  tono = "neutro",
  titulo,
  linea,
  derecha,
  guia,
  children,
}: {
  icono: ReactNode;
  tono?: "neutro" | "verde" | "ambar";
  titulo: string;
  linea?: string;
  derecha?: ReactNode;
  guia?: string;
  children?: ReactNode;
}) {
  const circulo = tono === "verde" ? "bg-verde/10 text-verde" : tono === "ambar" ? "bg-ambar/10 text-ambar-profundo" : "bg-hueso text-tinta";
  return (
    <div className="rounded-2xl border border-sand px-4 py-3.5" data-guia={guia}>
      <div className="flex items-center gap-3.5">
        <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${circulo}`}>
          {icono}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-tinta">{titulo}</span>
          {linea && <span className="block text-[13px] text-taupe">{linea}</span>}
        </span>
        {derecha}
      </div>
      {children}
    </div>
  );
}

/** ¿Cuadra la plata? «Papel S/ X = anotó S/ Y» en verde; si no, la diferencia en grande y las dos cifras lado a lado. */
function Veredicto({ papel: p, monto }: { papel: PapelConFoto; monto: number }) {
  const v = veredictoPapel(p, monto);
  const diferencia = Math.round(Math.abs(v.pagado - v.anotado) * 100) / 100;
  if (diferencia < 0.005) {
    return (
      <Bloque
        guia="fondos.papel-veredicto"
        tono="verde"
        icono={<Check className="h-5 w-5" />}
        titulo="Cuadra"
        linea={`Papel ${soles(v.pagado)} = anotó ${soles(v.anotado)}`}
      />
    );
  }
  return (
    <div className="rounded-2xl bg-ambar/10 px-4 py-3.5" data-guia="fondos.papel-veredicto">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ambar-profundo">
          <TriangleAlert className="h-5 w-5" aria-hidden />
          No cuadra
        </span>
        <span className="whitespace-nowrap font-serif text-[32px] leading-none tabular-nums text-ambar-profundo">{soles(diferencia)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <span className="rounded-xl bg-papel px-3 py-2">
          <span className="label-cayla block text-[10.5px] text-taupe">Papel</span>
          <span className="block text-sm font-semibold tabular-nums text-tinta">{soles(v.pagado)}</span>
        </span>
        <span className="rounded-xl bg-papel px-3 py-2">
          <span className="label-cayla block text-[10.5px] text-taupe">Anotó {primerNombre(p.persona)}</span>
          <span className="block text-sm font-semibold tabular-nums text-tinta">{soles(v.anotado)}</span>
        </span>
      </div>
      <span className="mt-2 block text-xs text-ambar-profundo">{notaNoCuadra(p.tipo)}</span>
    </div>
  );
}

/** ¿Llegó? «Llegó todo · Tienda Lima» con «12 de 12»; «Faltaron 2»; o dónde está si todavía no llegó. */
function Llegada({ papel }: { papel: PapelConFoto }) {
  const l = llegadaDePapel(papel);
  const destinos = destinosDePapel(papel);
  return (
    <Bloque
      guia="fondos.papel-llegada"
      tono={l && !l.completa ? "ambar" : "neutro"}
      icono={<Package className="h-5 w-5" />}
      titulo={l ? chipPapel(papel).texto : textoLlegada(papel)}
      linea={l ? destinos : ["Se completa cuando la tienda la cuente", destinos].filter(Boolean).join(" · ")}
      derecha={
        l && (
          <span className="whitespace-nowrap font-serif text-tinta">
            <span className="text-2xl tabular-nums">{l.llegaron}</span>
            <span className="ml-1 text-sm text-taupe">de {l.total}</span>
          </span>
        )
      }
    />
  );
}

/** ¿Cómo se pagó? Lo que pagó quien compró, lo que le toca a Compras y la barra de lo pagado sobre el total. */
function Pago({ papel }: { papel: PapelConFoto }) {
  const pago = pagoPapel(papel);
  return (
    <Bloque
      guia="fondos.papel-pago"
      icono={papel.medioPago === "efectivo" ? <Banknote className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
      titulo={pago.titulo}
      linea={pago.detalle}
    >
      {pago.fraccion > 0 && pago.fraccion < 1 && (
        <BarraAvance pct={pago.fraccion * 100} alto="fina" etiqueta="Lo que pagó del papel" texto={`${soles(papel.pagado)} de ${soles(papel.monto)}`} className="mt-3" />
      )}
    </Bloque>
  );
}

/** Las prendas del papel, plegadas: cuántas de cada una, a qué tienda iban y lo que dijo la tienda de lo que faltó. */
function Prendas({ papel }: { papel: PapelConFoto }) {
  // Abiertas de entrada solo si faltó algo: ahí está lo que dijo la tienda.
  const [abierto, setAbierto] = useState(() => papel.lineas.some((x) => x.faltan.length > 0));
  if (papel.lineas.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <BotonVerMas
        forma="enlace"
        abierto={abierto}
        onCambiar={setAbierto}
        controla={`prendas-${papel.id}`}
        texto={papel.lineas.length === 1 ? "Ver la prenda" : `Ver las ${papel.lineas.length} prendas`}
        className="self-start"
      />
      <FilasDeMas abierto={abierto} id={`prendas-${papel.id}`}>
        <ul className="divide-y divide-sand text-sm">
          {papel.lineas.map((x) => (
            <li key={x.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-tinta">
                  {x.cantidad} · {x.nombre}
                </span>
                <span className="block text-xs text-taupe">
                  {soles(x.costo)} c/u · {x.destino}
                  {textoFaltan(x) ? <span className="text-ambar-profundo"> · {textoFaltan(x)}</span> : null}
                </span>
              </span>
              <span className="whitespace-nowrap tabular-nums text-tinta">{soles(x.subtotal)}</span>
            </li>
          ))}
        </ul>
      </FilasDeMas>
    </div>
  );
}

export function DetallePapel({
  papel,
  proveedores,
  alTerminar,
  alSaltar,
  posicion,
}: {
  papel: PapelConFoto;
  proveedores: ProveedorOpcion[];
  alTerminar: () => void;
  /** «Más tarde»: pasa a la siguiente sin guardar. Sin ella (la única de la lista), no se dibuja. */
  alSaltar?: () => void;
  /** Dónde va en la lista («1 de 3»), al pie. */
  posicion?: string;
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
  const proveedor = proveedores.find((p) => p.id === proveedorId)?.nombre ?? papel.proveedor;
  const nombre = primerNombre(papel.persona);
  // Se completa solo si llegó a la tienda y no es de quien mira (nadie completa su propia compra).
  const editable = !papel.esMia && papel.llego;

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
      // Pagada entera del fondo, o con lo que falta en Por pagar (20261023181000).
      detalle:
        papel.pagado >= papel.monto - 0.005
          ? `Ya está en el Historial de compras, pagada del fondo de ${nombre}.`
          : `Ya está en el Historial de compras; lo que falta pagar queda en Por pagar.`,
    });
    alTerminar();
    router.refresh();
  }

  // La serie y el número que se copian de la foto (la guía enciende el que sigue), y el monto si «se anotó mal».
  const campos = editable && (
    <>
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
        <p className="text-xs text-taupe">Va con un número interno (SC-…): no le dieron papel.</p>
      )}
      {cambiaMonto && (
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
          <p className="mt-1.5 text-xs text-taupe">
            {nombre} anotó {soles(papel.monto)}
          </p>
        </CampoGuiado>
      )}
    </>
  );

  // Dos columnas cuando el panel es ancho (la foto a la izquierda, los tres bloques y los campos a la derecha); angosto, la foto arriba.
  const cuerpo = (
    <div className="grid gap-5 @min-[38rem]:grid-cols-[minmax(0,16.25rem)_minmax(0,1fr)]">
      <FotoPapel papel={papel} />
      <div className="flex min-w-0 flex-col gap-3">
        <Veredicto papel={papel} monto={montoLeido ?? papel.monto} />
        <Llegada papel={papel} />
        <Pago papel={papel} />
        {papel.esMia && <p className="text-xs text-taupe">Que la complete otra persona de Compras.</p>}
        {campos && <div className="mt-2 flex flex-col gap-3">{campos}</div>}
      </div>
    </div>
  );

  // Lo que la captura no muestra y se queda, compacto y abajo: cambiar el proveedor o el monto, y las prendas plegadas.
  const extras = (editable || papel.lineas.length > 0) && (
    <div className="flex flex-col gap-2 border-t border-sand pt-3">
      {editable && cambiaProveedor && (
        <ComboBuscable
          etiquetaAccesible="Proveedor"
          caja
          valor={proveedorId}
          onValor={limpiar(setProveedorId)}
          opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre, detalle: p.ruc ? `RUC ${p.ruc}` : undefined, claves: p.ruc ? [p.ruc] : undefined }))}
          marcador="Busca por nombre o RUC"
        />
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {!cambiaProveedor && (
            <button type="button" className="btn-enlace text-sm" disabled={guardando} onClick={() => setCambiaProveedor(true)}>
              No es este proveedor: cambiar
            </button>
          )}
          {!cambiaMonto && (
            <button type="button" className="btn-enlace text-sm" disabled={guardando} onClick={() => setCambiaMonto(true)}>
              Se anotó mal: cambiar el monto
            </button>
          )}
        </div>
      )}
      <Prendas papel={papel} />
    </div>
  );

  return (
    <PanelDetalle
      guia="fondos.papel-detalle"
      sobre={sobrePapel(papel)}
      titulo={proveedor}
      subtitulo={subtituloPapel(papel)}
      monto={soles(papel.monto)}
      estado={papel.esMia ? <Chip tono="pizarra">Es tuya</Chip> : undefined}
    >
      {editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="flex min-w-0 flex-col gap-5"
        >
          {cuerpo}
          {extras}
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
          <PieGuia guia={guia} listo="Todo listo para completarla." conFrase />
          <div className="flex flex-wrap items-center gap-3 border-t border-sand pt-4">
            {posicion && <span className="text-[13px] text-taupe">{posicion}</span>}
            <div className="pie-acciones ml-auto">
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
                <Check className="h-4 w-4" aria-hidden />
                {fraseCompletar()}
              </Boton>
            </div>
          </div>
        </form>
      ) : (
        <>
          {cuerpo}
          {extras}
        </>
      )}
    </PanelDetalle>
  );
}
