import type { DescuentoForm, ItemCarrito } from "@/components/PuntoDeVenta";
import { ticketConVale } from "./club-cupon-reparto-reglas";
import { numeroDeMonto } from "./monto-plata-reglas";
import {
  descuentoResultante,
  descuentosPedidos,
  entraAlDescuento,
  hayDescuentoManual,
  necesitaArgumentoEscrito,
  pasoDelDescuento,
  totalDeLineas,
} from "./vender-reglas";

/**
 * Todo lo que el apartado «Descuento» de Vender necesita saber, derivado del formulario y del carrito, en UN solo lugar: lo leen la hoja
 * lateral de escritorio (`HojaDeDescuento`) y el ticket del celular (`PuntoDeVentaTicket`), así que las dos dicen siempre lo mismo.
 * Antes vivía dentro del ticket, que era el único que lo dibujaba (2026-11-02, hoja lateral del descuento).
 *
 * NO agrega reglas de negocio: es la misma cuenta de antes (el % deja cada prenda sin céntimos sueltos, el S/ se reparte según el precio,
 * la campaña gana si da igual o más, una pieza de liquidación no recibe descuento). El candado de verdad sigue en `registrar_venta`.
 */
export function cuentaDelDescuento(descuento: DescuentoForm, carrito: readonly ItemCarrito[], vale: { vale: number } | null) {
  const porMonto = descuento.modo === "monto";
  const pct = Number(descuento.pct);
  const pctValido = Number.isFinite(pct) && pct > 0 && pct <= 100;
  const monto = numeroDeMonto(descuento.monto);
  const montoValido = Number.isFinite(monto) && monto > 0;
  const valorValido = porMonto ? montoValido : pctValido;
  const elegidas = descuento.elegidas;
  const todoElTicket = elegidas === null;
  const alcanza = (claveLinea: string) => elegidas === null || elegidas.includes(claveLinea);
  // Lo que de verdad recibe el descuento: lo elegido menos las piezas de liquidación (precio final, ADR-0379). Aquí `[]` es
  // «ninguna marcada» (en la regla, `[]` es todo el ticket): por eso se pregunta con `alcanza` y no con las claves.
  const recibeDescuento = (it: ItemCarrito) => alcanza(it.claveLinea) && entraAlDescuento(it, null);
  const alcanzadas = carrito.filter(recibeDescuento);
  const elegidasCuenta = elegidas === null ? carrito.length : elegidas.length;
  // El descuento por unidad que va a quedar en cada línea si se aplica ahora — en % sale del precio de cada una (sin céntimos sueltos,
  // ADR-0403); en S/ el monto es del total de lo elegido y se reparte según el precio.
  const pedidos = descuentosPedidos(descuento.modo, porMonto ? monto : pct, alcanzadas);
  const montoPedido = (it: ItemCarrito) => pedidos.get(it.claveLinea) ?? 0;
  const unidadesAlcanzadas = alcanzadas.reduce((c, it) => c + it.cantidad, 0);
  const descuentoUnitarioAplicando = (it: ItemCarrito) => (!recibeDescuento(it) ? it.descuentoUnitario : descuentoResultante(it, montoPedido(it)).monto);
  // Lo que va a quedar en «Total» si se aplica ahora. Con un cupón del Club puesto, también sin su parte (el cupón se reparte sobre lo
  // que quedará): el mismo número que quedará en el Total.
  const conDescuento = carrito.map((it) => ({ ...it, descuentoUnitario: descuentoUnitarioAplicando(it) }));
  const totalConDescuento = vale ? ticketConVale(conDescuento, vale.vale).total : totalDeLineas(conDescuento);
  // «Quitar descuento» solo tiene sentido para lo puesto a mano: el de campaña no se quita.
  const hayDescuentoEnAlcance = hayDescuentoManual(carrito.filter((it) => alcanza(it.claveLinea)));
  // Si alguna prenda alcanzada va a quedar pasada del 15 %: ahí el apartado MUESTRA el argumento. Donde la campaña gana no cuenta (ese
  // descuento no es manual).
  const mostrarArgumento =
    valorValido &&
    alcanzadas.some((it) => {
      const r = descuentoResultante(it, montoPedido(it));
      return !r.prevaleceCampana && necesitaArgumentoEscrito(it.precioUnitario, r.monto);
    });
  const motivoDescuento = !valorValido
    ? porMonto
      ? "Escribe un monto mayor a 0."
      : "Elige un porcentaje entre 1 y 100."
    : elegidasCuenta === 0
      ? "Elige al menos una prenda."
      : descuento.razon === ""
        ? "Elige por qué se aplica el descuento."
        : descuento.razon === "otro" && descuento.razonOtro.trim() === ""
          ? 'Cuenta en una línea por qué es "Otro".'
          : mostrarArgumento && descuento.argumento.trim() === ""
            ? "Este descuento pasa el 15 %: escribe el argumento."
            : null;
  // El campo que toca llenar se ilumina y, al completar uno, el foco salta al siguiente. Solo guía: lo que impide aplicar es `motivoDescuento`.
  const pasoDescuento = pasoDelDescuento({
    valorValido,
    razon: descuento.razon,
    razonOtro: descuento.razonOtro,
    pideArgumento: mostrarArgumento,
    argumento: descuento.argumento,
    prendas: elegidasCuenta,
  });
  // Los tres pasos de la hoja, para marcar ✓ el que ya está: ¿a qué prendas?, ¿cuánto?, ¿por qué?
  const hecho = {
    prendas: elegidasCuenta > 0,
    cuanto: valorValido,
    porque: descuento.razon !== "" && (descuento.razon !== "otro" || descuento.razonOtro.trim() !== ""),
  };
  return {
    porMonto,
    pct,
    monto,
    valorValido,
    elegidas,
    todoElTicket,
    alcanza,
    recibeDescuento,
    alcanzadas,
    elegidasCuenta,
    unidadesAlcanzadas,
    totalConDescuento,
    hayDescuentoEnAlcance,
    mostrarArgumento,
    motivoDescuento,
    pasoDescuento,
    hecho,
  };
}

export type CuentaDelDescuento = ReturnType<typeof cuentaDelDescuento>;

/** Las palabras de lo que sigue al elegir «Cuánto» en cada modo: dicen sobre qué se calcula (lo que confundía con solo «% | S/»). */
export const AYUDA_MODO_DESCUENTO = {
  porcentaje: "Del precio de cada prenda.",
  monto: "En soles; se reparte entre las prendas según su precio.",
} as const;
