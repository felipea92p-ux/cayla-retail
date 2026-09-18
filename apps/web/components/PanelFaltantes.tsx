"use client";

import { ChevronRight } from "lucide-react";
import { CampoTexto, SelectNativo } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Chip } from "@/components/ui/Chip";
import { ETIQUETA_ESTADO_RECEPCION, ETIQUETA_MOTIVO_CIERRE, soles, type CompraResumen, type LineaCompra, type MotivoCierre } from "@/lib/compras-reglas";
import { cierresElegidos, efectoCierre, igvDeMonto, notaDelBloque, tasaIgv, type NotaBorrador } from "@/lib/recepciones-reglas";

// «Lo que faltó» (D2, ADR-0106): el cierre de faltantes DENTRO de la guía, no en un modal por línea.
//
// Antes cada línea corta tenía un «Cerrar con faltante» que abría un modal y escribía al instante.
// Tenía dos problemas: (1) con varias líneas cortas había que repetirlo línea por línea, y (2) el modal
// vivía dentro del <form> de la guía, y el «enviar» del modal subía por el árbol de React (los portales
// propagan eventos a sus ancestros) hasta el `onSubmit` de la guía: cerrar UNA línea registraba TODA la
// recepción. Ahora cada línea con faltante solo lleva una decisión —«lo espero» o el motivo por el que no
// va a llegar— y nada se escribe hasta el botón de confirmar, que registra la recepción y todos los
// cierres juntos. Esto es solo pantalla: no hay <form> ni botón de envío acá adentro.

export type BloqueFaltantes = {
  compra: CompraResumen;
  filas: { linea: LineaCompra; nombre: string; faltan: number }[];
  /** Unidades de este comprobante que se están contando en la guía. */
  llegando: number;
  /** Pendiente total del comprobante (todas sus líneas), para saber si queda cubierto. */
  pendiente: number;
};

export const NOTA_VACIA = (hoy: string): NotaBorrador => ({ activa: false, serie: "", fecha: hoy, montoTxt: null });

const VALOR_PENDIENTE = "";

function OpcionesMotivo() {
  return (
    <>
      <option value={VALOR_PENDIENTE}>Lo espero: sigue pendiente</option>
      <optgroup label="No va a llegar: se cierra">
        {(Object.keys(ETIQUETA_MOTIVO_CIERRE) as MotivoCierre[]).map((m) => (
          <option key={m} value={m}>
            {ETIQUETA_MOTIVO_CIERRE[m]}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export function PanelFaltantes({
  bloques,
  motivos,
  onMotivo,
  onTodas,
  notas,
  onNota,
  hoy,
  esLider,
  igvMes,
  porRecibirAtrasadas,
}: {
  bloques: BloqueFaltantes[];
  motivos: Record<string, MotivoCierre | undefined>;
  onMotivo: (lineaId: string, motivo: MotivoCierre | null) => void;
  onTodas: (motivo: MotivoCierre | null) => void;
  notas: Record<string, NotaBorrador | undefined>;
  onNota: (compraId: string, cambio: Partial<NotaBorrador>) => void;
  hoy: string;
  esLider: boolean;
  igvMes: number | null;
  porRecibirAtrasadas: number | null;
}) {
  const todas = bloques.flatMap((b) => b.filas);
  if (todas.length === 0) return null;
  const totalUnidades = todas.reduce((a, f) => a + f.faltan, 0);
  const primero = motivos[todas[0].linea.id] ?? VALOR_PENDIENTE;
  const comun = todas.every((f) => (motivos[f.linea.id] ?? VALOR_PENDIENTE) === primero) ? primero : "mixto";

  // El crédito fiscal y las entregas atrasadas se van encadenando entre comprobantes: el «antes» del
  // segundo es el «después» del primero. Se arma en un recorrido aparte (no dentro del `map` del JSX)
  // porque cada paso depende del anterior.
  const vistas: {
    bloque: BloqueFaltantes;
    cierres: ReturnType<typeof cierresElegidos<MotivoCierre>>;
    unidadesCerradas: number;
    tasa: number;
    borrador: NotaBorrador;
    nota: ReturnType<typeof notaDelBloque>;
    efectos: ReturnType<typeof efectoCierre>;
  }[] = [];
  let igvAcumulado = 0;
  let atrasadasAcumuladas = 0;
  for (const b of bloques) {
    if (b.filas.length === 0) continue;
    const cierres = cierresElegidos(
      b.filas.map((f) => ({ lineaId: f.linea.id, compraId: b.compra.id, faltan: f.faltan, costoUnitario: f.linea.costoUnitario })),
      motivos,
    );
    const unidadesCerradas = cierres.reduce((a, c) => a + c.faltan, 0);
    const tasa = tasaIgv(b.compra);
    const borrador = notas[b.compra.id] ?? NOTA_VACIA(hoy);
    const nota = notaDelBloque({ saldo: b.compra.saldo, tasa, cierres, esLider, borrador });
    const cubreTodo = cierres.length > 0 && b.pendiente - b.llegando - unidadesCerradas <= 0;
    const notaLista = nota.activa && nota.problema === null;
    const igvDeEstaNota = notaLista ? igvDeMonto(nota.monto, tasa) : 0;
    const efectos = efectoCierre({
      documento: b.compra.documento,
      saldo: b.compra.saldo,
      montoNota: notaLista ? nota.monto : 0,
      igvNota: igvDeEstaNota,
      igvMes: igvMes == null ? null : Math.round((igvMes - igvAcumulado) * 100) / 100,
      recepcionAntes: ETIQUETA_ESTADO_RECEPCION[b.compra.estadoRecepcion],
      cubreTodo,
      estabaAtrasada: b.compra.recepcionAtrasada,
      atrasadasAntes: porRecibirAtrasadas == null ? null : porRecibirAtrasadas - atrasadasAcumuladas,
      formato: soles,
    });
    igvAcumulado += igvDeEstaNota;
    if (cubreTodo && b.compra.recepcionAtrasada) atrasadasAcumuladas += 1;
    vistas.push({ bloque: b, cierres, unidadesCerradas, tasa, borrador, nota, efectos });
  }

  return (
    <section aria-labelledby="faltantes-titulo" className="card-cayla divide-y divide-tinta/10">
      <div className="space-y-2 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p id="faltantes-titulo" className="font-display text-xl text-tinta">
            Lo que faltó
          </p>
          <Chip tono="ambar">
            {todas.length} {todas.length === 1 ? "línea" : "líneas"} · {totalUnidades} u. sin llegar
          </Chip>
        </div>
        <p className="text-xs leading-relaxed text-tinta/65">
          Estas líneas llegaron con menos de lo pendiente. Si esperas el resto, déjalo como está y sigue pendiente en el comprobante. Si no va a llegar, elige por qué y se cierra. <b className="font-semibold">Nada se registra hasta que confirmes abajo</b>: ahí se recibe lo contado y se cierran todos los faltantes juntos.
        </p>
        {todas.length > 1 && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label htmlFor="faltantes-todas" className="label-cayla text-[11px] text-tinta/65">
              Las {todas.length} líneas
            </label>
            <div className="w-56">
              <SelectNativo
                id="faltantes-todas"
                value={comun}
                onChange={(e) => onTodas(e.target.value === VALOR_PENDIENTE ? null : (e.target.value as MotivoCierre))}
              >
                {comun === "mixto" && (
                  <option value="mixto" disabled>
                    Cada una distinta
                  </option>
                )}
                <OpcionesMotivo />
              </SelectNativo>
            </div>
          </div>
        )}
      </div>

      {vistas.map(({ bloque: b, cierres, unidadesCerradas, tasa, borrador, nota, efectos }) => (
        <div key={b.compra.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-2.5">
            <p className="text-sm tabular-nums text-tinta">{b.compra.documento}</p>
            <p className="text-xs text-tinta/55">
              {cierres.length === 0
                ? "Todo sigue pendiente"
                : `${cierres.length} de ${b.filas.length} se ${cierres.length === 1 ? "cierra" : "cierran"} · ${unidadesCerradas} u.`}
            </p>
          </div>

          {b.filas.map((f) => (
            <div key={f.linea.id} className="grid items-center gap-x-4 gap-y-1.5 px-5 py-2 sm:grid-cols-[1fr_auto_15rem]">
              <span className="min-w-0 truncate text-sm text-tinta">{f.nombre}</span>
              <span>
                <Chip tono="ambar">Faltan {f.faltan}</Chip>
              </span>
              <SelectNativo
                aria-label={`Qué pasó con lo que falta de ${f.nombre}`}
                value={motivos[f.linea.id] ?? VALOR_PENDIENTE}
                onChange={(e) => onMotivo(f.linea.id, e.target.value === VALOR_PENDIENTE ? null : (e.target.value as MotivoCierre))}
              >
                <OpcionesMotivo />
              </SelectNativo>
            </div>
      ))}

        {esLider && cierres.length > 0 && (
          <div className="mx-5 mb-4 mt-2 rounded-xl border border-sand bg-sand/30 p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={borrador.activa}
                aria-label={`El proveedor emite una nota de crédito por lo que se cierra de ${b.compra.documento}`}
                onClick={() => onNota(b.compra.id, { activa: !borrador.activa })}
                className={`relative h-[23px] w-10 shrink-0 rounded-full transition-colors ${borrador.activa ? "bg-tinta" : "bg-tinta/25"}`}
              >
                <span aria-hidden className={`absolute left-[3px] top-[3px] h-[17px] w-[17px] rounded-full bg-crema transition-transform ${borrador.activa ? "translate-x-[17px]" : ""}`} />
              </button>
              <div>
                <p className="text-sm font-semibold text-tinta">El proveedor emite una nota de crédito por lo que se cierra</p>
                <p className="text-xs text-tinta/65">Una sola para el comprobante. Baja lo que se debe y el crédito fiscal del mes. Si aún no la tienes, puedes registrarla después desde el comprobante.</p>
              </div>
            </div>
            {borrador.activa && (
              <div className="mt-4 grid gap-5 sm:grid-cols-[1.2fr_1fr_1fr]">
                <CampoTexto
                  etiqueta="Serie-número"
                  id={`nota-serie-${b.compra.id}`}
                  mono
                  value={borrador.serie}
                  onChange={(e) => onNota(b.compra.id, { serie: e.target.value.toUpperCase() })}
                  placeholder="FC01-000018"
                  autoComplete="off"
                />
                <CampoFecha etiqueta="Fecha" valor={borrador.fecha} onValor={(v) => onNota(b.compra.id, { fecha: v })} required />
                <CampoTexto
                  etiqueta="Monto"
                  id={`nota-monto-${b.compra.id}`}
                  mono
                  inputMode="decimal"
                  value={borrador.montoTxt ?? nota.sugerido.toFixed(2)}
                  onChange={(e) => onNota(b.compra.id, { montoTxt: e.target.value })}
                  pie={`${unidadesCerradas} u. cerradas a su costo + IGV ${Math.round(tasa * 100)} %. Puedes ajustarlo.`}
                />
              </div>
            )}
          </div>
        )}

        {efectos.length > 0 && (
          <div className="mx-5 mb-4">
            <p className="label-cayla mb-1 text-[11px] text-tinta/65">Cómo queda {b.compra.documento}</p>
            <div className="divide-y divide-tinta/10 border-t border-tinta/10">
              {efectos.map((f) => (
                <div key={f.etiqueta} className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 py-2">
                  <span className="text-sm text-tinta">{f.etiqueta}</span>
                  <span className="text-sm tabular-nums text-tinta/55">{f.antes}</span>
                  <ChevronRight aria-hidden className="h-3.5 w-3.5 self-center text-tinta/40" />
                  <span className="text-sm font-semibold tabular-nums text-tinta">{f.despues}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      ))}

      <p className="px-5 py-3 text-xs leading-relaxed text-tinta/55">
        No se borra nada: cada cierre y cada nota quedan como registros nuevos en el historial del comprobante. Para cerrar solo una parte de una línea, hazlo desde el detalle del comprobante.
      </p>
    </section>
  );
}
