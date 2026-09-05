// Convierte un monto a letras para el pie del comprobante ("Ciento cuarenta y
// siete con 59/100 soles") — SUNAT lo exige en boletas/facturas impresas.
// Cubre hasta 999,999,999.99, de sobra para una venta de retail.

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const ESPECIALES: Record<number, string> = {
  10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
  16: "dieciséis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve",
  20: "veinte", 21: "veintiuno", 22: "veintidós", 23: "veintitrés", 24: "veinticuatro",
  25: "veinticinco", 26: "veintiséis", 27: "veintisiete", 28: "veintiocho", 29: "veintinueve",
};
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function decenasALetras(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 30) return ESPECIALES[n] ?? "";
  const decena = Math.floor(n / 10);
  const unidad = n % 10;
  if (unidad === 0) return DECENAS[decena];
  return `${DECENAS[decena]} y ${UNIDADES[unidad]}`;
}

function centenasALetras(n: number): string {
  if (n === 100) return "cien";
  if (n < 100) return decenasALetras(n);
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const prefijo = CENTENAS[centena];
  return resto === 0 ? prefijo : `${prefijo} ${decenasALetras(resto)}`;
}

function milesALetras(n: number): string {
  if (n < 1000) return centenasALetras(n);
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const prefijoMiles = miles === 1 ? "mil" : `${centenasALetras(miles)} mil`;
  return resto === 0 ? prefijoMiles : `${prefijoMiles} ${centenasALetras(resto)}`;
}

function millonesALetras(n: number): string {
  if (n < 1_000_000) return milesALetras(n);
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const prefijo = millones === 1 ? "un millón" : `${milesALetras(millones)} millones`;
  return resto === 0 ? prefijo : `${prefijo} ${milesALetras(resto)}`;
}

export function montoALetras(monto: number, moneda = "PEN"): string {
  const nombreMoneda = moneda === "USD" ? "dólares" : "soles";
  const entero = Math.floor(monto);
  const centimos = Math.round((monto - entero) * 100);
  const letras = entero === 0 ? "cero" : millonesALetras(entero);
  const letrasCapitalizadas = letras.charAt(0).toUpperCase() + letras.slice(1);
  return `${letrasCapitalizadas} con ${String(centimos).padStart(2, "0")}/100 ${nombreMoneda}`;
}
