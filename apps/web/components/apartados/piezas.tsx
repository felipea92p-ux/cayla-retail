"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { EMISOR } from "@/lib/emisor";
import { LEY_REDONDEO_TICKET, TEXTO_REDONDEO } from "@/lib/recibo-reglas";
import { money } from "@/components/PuntoDeVenta";
import { esConstancia, tramosDelPlazo, textoDevolucion, type Apartado, type ClaveEstado } from "@/lib/separaciones-reglas";

export { FotoPrenda } from "@/components/ui/FotoPrenda";

const TONO_ESTADO: Record<ClaveEstado, string> = {
  vigente: "text-verde-profundo",
  porvencer: "text-ambar-profundo",
  vencida: "text-rojo-profundo",
  devolver: "text-rojo-profundo",
  cerrada: "text-tinta/55",
};

/** El estado con su punto de color. El punto de «vencido» late: es una señal que pide acción (ADR-0136). */
export function EstadoChip({ clave, texto }: { clave: ClaveEstado; texto: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold ${TONO_ESTADO[clave]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current ${clave === "vencida" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
      {texto}
    </span>
  );
}

/** 7 días de plazo + 2 de gracia (en rosa), con el día de hoy marcado. */
export function BarraPlazo({ creadaEl, hoy }: { creadaEl: string; hoy: string }) {
  return (
    <div aria-hidden className="grid grid-cols-9 gap-0.5">
      {tramosDelPlazo(creadaEl, hoy).map((t, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-sm ${
            t.momento === "hoy" ? (t.tipo === "gracia" ? "bg-rojo" : "bg-tinta") : t.momento === "pasado" ? (t.tipo === "gracia" ? "bg-rojo" : "bg-taupe/50") : t.tipo === "gracia" ? "bg-rojo/20" : "bg-sand"
          }`}
        />
      ))}
    </div>
  );
}

export function fechaCorta(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
}
export function fechaNumerica(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * El ticket de 80 mm del apartado (al apartar, y el final al entregar). Mismo mecanismo que `ReciboTermico`: un
 * `#comprobante-print` pegado a `<body>`; en pantalla no se ve y al imprimir es lo único que sale (globals.css).
 *
 * Desde ADR-0399 (Felipe, 2026-10-14) un apartado NUEVO no tiene boleta de anticipo: al apartar el ticket es una CONSTANCIA DE DEPÓSITO
 * (su número es el código APT-…, no un correlativo de SUNAT) y dice en claro que no es comprobante de pago; al entregar sale la boleta o
 * factura por el TOTAL, que no nombra el adelanto (es un pacto interno). Un apartado VIEJO, con su boleta de anticipo, conserva el
 * ticket de antes (`esConstancia(a)` decide). Todavía sin QR: dice que el comprobante queda registrado y se envía a SUNAT después.
 */
export function ReciboApartado({ apartado, tipo, sede, pagadoHoy, redondeo = 0, copia = false }: { apartado: Apartado; tipo: "anticipo" | "final"; sede: string; pagadoHoy?: { metodo: string; monto: number }[]; /** Lo que no se cobró por redondear el efectivo del saldo (ADR-0311); el comprobante sigue por el saldo exacto. */ redondeo?: number; /** Reimpresión desde el historial (ADR-0367): dice «COPIA» y, en la final, el saldo en una línea (no se sabe con qué medios se pagó). */ copia?: boolean }) {
  const a = apartado;
  const constancia = esConstancia(a);
  const cuerpo = (
    <div id="comprobante-print">
      <header className="rt-centro">
        <p className="rt-marca">{EMISOR.nombreComercial}</p>
        <p className="rt-negrita">
          {EMISOR.razonSocial} · RUC {EMISOR.ruc}
        </p>
        <p className="rt-tienda">{sede}</p>
      </header>
      <p className="rt-centro rt-titulo">{tipo === "anticipo" ? (constancia ? "CONSTANCIA DE APARTADO" : "BOLETA DE VENTA ELECTRÓNICA — ANTICIPO") : "BOLETA DE VENTA ELECTRÓNICA"}</p>
      <p className="rt-centro rt-numero">{tipo === "anticipo" ? (constancia ? a.codigo : a.comprobanteAnticipo) : (a.comprobanteFinal ?? "")}</p>
      {(tipo === "final" || !constancia) && <p className="rt-centro rt-negrita">APARTADO {a.codigo}{tipo === "final" ? " · ENTREGADO" : ""}</p>}
      {tipo === "anticipo" && constancia && (
        <p className="rt-sello">
          NO ES BOLETA NI FACTURA
          <small>no sirve para cambios ni como pago</small>
        </p>
      )}
      {copia && <p className="rt-centro rt-negrita">COPIA · REIMPRESA EL {fechaNumerica(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }))}</p>}
      <dl className="rt-datos">
        <dt>Cliente</dt>
        <dd>{a.nombres} {a.apellidos}</dd>
        {a.dni && (
          <>
            <dt>DNI</dt>
            <dd>{a.dni}</dd>
          </>
        )}
        {a.celular && (
          <>
            <dt>Celular</dt>
            <dd>{a.celular}</dd>
          </>
        )}
        {a.asesora && (
          <>
            <dt>Atendió</dt>
            <dd>{a.asesora}</dd>
          </>
        )}
      </dl>
      {a.prendas.map((p) => (
        <p key={p.varianteId} className="rt-fila">
          <span>{p.cantidad} {p.referencia} {p.sku}</span>
          <span>{money((p.precioUnitario - p.descuentoUnitario) * p.cantidad)}</span>
        </p>
      ))}
      <p className="rt-fila rt-negrita"><span>Total de las prendas</span><span>{money(a.total)}</span></p>
      {tipo === "anticipo" ? (
        <>
          <p className="rt-fila"><span>{constancia ? "Dejaste" : "Anticipo (incluye IGV)"}</span><span>{money(a.adelanto)}</span></p>
          <p className="rt-fila rt-total"><span>{constancia ? "FALTA PAGAR" : "SALDO AL RECOGER"}</span><span>{money(a.total - a.adelanto)}</span></p>
          <p className="rt-fila rt-negrita"><span>RECOGER HASTA</span><span>{fechaNumerica(a.venceEl)}</span></p>
          <div className="rt-pie">
            <p className="rt-negrita">CONDICIONES DE TU APARTADO</p>
            <p>1. Guardamos tus prendas hasta el {fechaNumerica(a.venceEl)}.</p>
            <p>2. Para recogerlas trae {constancia ? "esta constancia" : "este comprobante"} o tu DNI.</p>
            <p>3. Si no las recoges a tiempo vuelven a la tienda y te devolvemos el 100% por {textoDevolucion(a)}, sin que tengas que venir.</p>
            <p>4. El precio queda congelado. Cambios y devoluciones: desde el día que recoges.</p>
          </div>
        </>
      ) : (
        <>
          {!constancia && <p className="rt-fila"><span>(−) Anticipo {a.comprobanteAnticipo}</span><span>−{money(a.adelanto)}</span></p>}
          {constancia ? null : pagadoHoy ? (
            pagadoHoy.map((p, i) => (
              <p key={i} className="rt-fila"><span>Pagado hoy · {p.metodo}</span><span>{money(p.monto)}</span></p>
            ))
          ) : (
            <p className="rt-fila"><span>Saldo pagado al recoger</span><span>{money(a.total - a.adelanto)}</span></p>
          )}
          {redondeo > 0 && (
            <>
              <p className="rt-fila"><span>{TEXTO_REDONDEO}</span><span>{money(redondeo)}</span></p>
              <p className="rt-centro">{LEY_REDONDEO_TICKET}</p>
            </>
          )}
          <p className="rt-fila rt-total"><span>APARTADO LIQUIDADO</span><span>{money(a.total)}</span></p>
        </>
      )}
      <p className="rt-centro rt-lema">
        {tipo === "anticipo" && constancia
          ? "Tu boleta o factura se emite cuando recoges, por el total de la compra."
          : "Comprobante electrónico registrado: su envío a SUNAT se completa después."}
      </p>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(cuerpo, document.body);
}

/** Alto de las pestañas de abajo en el celular (`ApartadosPanel`): la barra de acción se apoya encima. Un solo número
 *  para las dos piezas, o la barra taparía las pestañas o dejaría una rendija. */
export const ALTO_PESTANAS_MOVIL = "4rem";

/** Monta lo fijo del celular en `document.body` (ADR-0211): la hoja de Apartados entra con un `transform`
 *  (`anim-sube`) y, mientras dura, un `position: fixed` adentro se pegaría a la hoja y no a la pantalla. */
const sinSuscripcion = () => () => {};

export function EnCuerpo({ children }: { children: React.ReactNode }) {
  // En el servidor no hay `document`: el portal nace en el navegador, sin romper la hidratación.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return montado ? createPortal(children, document.body) : null;
}

/**
 * La barra negra del celular (Felipe, 2026-09-26: «Pasos + pestañas abajo», spike `docs/maquetas/apartados-v2-2026-09/`):
 * fija sobre las pestañas, dice cuánto es y lleva el botón que sigue, para que el paso nunca quede enterrado bajo la
 * búsqueda. Solo existe por debajo de `lg`; en computador el panel de la derecha ya está siempre a la vista.
 */
export function BarraMovil({
  etiqueta,
  monto,
  accion,
  icono,
  deshabilitado,
  onClick,
}: {
  etiqueta: string;
  monto: number;
  accion: string;
  icono?: React.ReactNode;
  deshabilitado?: boolean;
  onClick: () => void;
}) {
  return (
    <EnCuerpo>
    <div
      className="anim-revelar fixed inset-x-0 z-20 flex items-center justify-between gap-3 border-t border-tinta bg-tinta px-5 py-3 text-crema sm:left-lateral lg:hidden"
      style={{ bottom: `calc(${ALTO_PESTANAS_MOVIL} + env(safe-area-inset-bottom))` }}
    >
      <div className="min-w-0">
        <p className="label-cayla truncate text-[10px] text-crema/60 dark:text-crema/75">{etiqueta}</p>
        <p className="font-display text-2xl leading-tight tabular-nums">{money(monto)}</p>
      </div>
      <button
        type="button"
        disabled={deshabilitado}
        onClick={onClick}
        className="label-cayla flex h-12 shrink-0 items-center gap-2 rounded-lg bg-crema px-4 text-[11px] text-tinta disabled:opacity-45"
      >
        {accion}
        {icono}
      </button>
    </div>
    </EnCuerpo>
  );
}
