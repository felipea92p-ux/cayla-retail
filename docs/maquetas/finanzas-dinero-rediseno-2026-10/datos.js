/* Finanzas v3 · Cuentas y dinero — las cifras de ejemplo, en UN solo lugar, para que las tres maquetas cuenten la misma historia.
   Es la historia de la v2 (jueves 15 de octubre de 2026), con cada peso ubicado en una sede. Suma comprobada al final del archivo:
   si una cifra no cuadra, la consola lo dice. Nada de esto es de producción. */
(function () {
  const SEDES = [
    { id: "tru", nombre: "Trujillo", corto: "TRU", color: "var(--pizarra)" },
    { id: "aqp", nombre: "Arequipa", corto: "AQP", color: "var(--verde)" },
    { id: "lim", nombre: "Lima", corto: "LIM", color: "var(--ambar)", nota: "abre el martes 20" },
    { id: "tal", nombre: "Taller", corto: "Taller", color: "var(--taupe)" },
    { id: "emp", nombre: "CAYLA entera", corto: "Empresa", color: "color-mix(in srgb,var(--tinta) 55%,transparent)", nota: "bancos y tarjeta" },
  ];

  /* tipo: banco · camino (por depositar) · fuerte (caja fuerte) · cajon (cajón o fondo fijo) · tarjeta (lo que se debe) */
  const CUENTAS = [
    { id: "bcp", nombre: "BCP", tipo: "banco", sede: "emp", saldo: 18300, que: "Entran Yape, Plin y los depósitos de efectivo", ultimo: "mar 13", conciliada: "14 oct" },
    { id: "ibk", nombre: "Interbank", tipo: "banco", sede: "emp", saldo: 9830, que: "Llegan Izipay y Vendemás", ultimo: "mar 13", conciliada: "30 sep" },
    { id: "izi-tru", nombre: "Izipay · Trujillo", tipo: "camino", sede: "tru", saldo: 1420, que: "Tarjeta y QR del mar 13 y mié 14 · llega vie o sáb", ultimo: "mié 14" },
    { id: "izi-aqp", nombre: "Izipay · Arequipa", tipo: "camino", sede: "aqp", saldo: 720, que: "Tarjeta y QR del mié 14 · llega vie o sáb", ultimo: "mié 14" },
    { id: "ven-tru", nombre: "Vendemás · Trujillo", tipo: "camino", sede: "tru", saldo: 860, que: "Tarjeta del mié 14 · llega mañana", ultimo: "mié 14" },
    { id: "ven-aqp", nombre: "Vendemás · Arequipa", tipo: "camino", sede: "aqp", saldo: 450, que: "Tarjeta del mié 14 · llega mañana", ultimo: "mié 14" },
    { id: "cf-tru", nombre: "Caja fuerte · Trujillo", tipo: "fuerte", sede: "tru", saldo: 6200, que: "Lo que guardan los cierres desde el depósito del mar 13", ultimo: "mié 14" },
    { id: "cf-aqp", nombre: "Caja fuerte · Arequipa", tipo: "fuerte", sede: "aqp", saldo: 3900, que: "Sin depositar desde el vie 9: 6 días", ultimo: "mié 14", aviso: "6 días sin depositar" },
    { id: "cj-tru", nombre: "Cajón · Trujillo", tipo: "cajon", sede: "tru", saldo: 500, que: "El sencillo para dar vuelto", ultimo: "mié 14" },
    { id: "cj-aqp", nombre: "Cajón · Arequipa", tipo: "cajon", sede: "aqp", saldo: 500, que: "El sencillo para dar vuelto", ultimo: "mié 14" },
    { id: "cj-lim", nombre: "Cajón · Lima", tipo: "cajon", sede: "lim", saldo: 0, que: "Se carga el lunes 19, antes de abrir", ultimo: "—" },
    { id: "ff-tal", nombre: "Fondo fijo · Taller", tipo: "cajon", sede: "tal", saldo: 150, que: "Para gastos chicos del Taller", ultimo: "lun 12" },
    { id: "tc", nombre: "Tarjeta de crédito CAYLA", tipo: "tarjeta", sede: "emp", saldo: -2300, que: "Lo usado hasta el 10 de octubre · se paga el dom 25", ultimo: "vie 9" },
  ];

  const TIPOS = {
    banco: { texto: "En los bancos", corto: "Bancos", color: "var(--pizarra)" },
    camino: { texto: "En camino al banco", corto: "En camino", color: "var(--m-qr)" },
    fuerte: { texto: "En las cajas fuertes", corto: "Cajas fuertes", color: "var(--m-efectivo)" },
    cajon: { texto: "En los cajones", corto: "Cajones", color: "var(--taupe)" },
    tarjeta: { texto: "Lo que debes en la tarjeta", corto: "Tarjeta", color: "var(--rojo-p)" },
  };

  /* Lo que se debe. «tramo»: cuándo vence, contado desde hoy jueves 15. */
  const DEUDAS = [
    { id: "d1", proveedor: "Textiles del Norte", doc: "F001-2231", que: "Tela para el Taller", tipo: "Insumo del Taller", sede: "tal", vence: "lun 19", dias: 4, total: 6800, pagado: 0 },
    { id: "d2", proveedor: "Tarjeta de crédito CAYLA", doc: "Estado de cuenta oct", que: "Lo usado hasta el 10 de octubre", tipo: "Tarjeta", sede: "emp", vence: "dom 25", dias: 10, total: 2300, pagado: 0 },
    { id: "d3", proveedor: "Hilandería Andina", doc: "F002-0871", que: "Hilos", tipo: "Insumo del Taller", sede: "tal", vence: "mié 28", dias: 13, total: 4600, pagado: 0 },
    { id: "d4", proveedor: "Botones y Avíos Lima", doc: "E001-339", que: "Perchas y avíos para la apertura", tipo: "Gasto", sede: "lim", vence: "vie 6 nov", dias: 22, total: 3800, pagado: 600 },
  ];
  const TRAMOS = [
    { id: "vencido", texto: "Vencido", de: -999, a: -1 },
    { id: "semana", texto: "Próximos 7 días", de: 0, a: 7 },
    { id: "mes", texto: "De 8 a 30 días", de: 8, a: 30 },
    { id: "luego", texto: "Más adelante", de: 31, a: 999 },
  ];

  /* El efectivo de cada cajón AHORA (16:40): la misma cuenta del cierre de caja. */
  const EFECTIVO = [
    { sede: "tru", estado: "abierta", abrio: "Rosa Paredes · 9:58", apertura: 500, ventas: 1180, otros: 0, egresos: 40, depositos: 0, deberia: 1640, egresoQue: "Taxi para llevar un pedido" },
    { sede: "aqp", estado: "abierta", abrio: "Lucía Quispe · 10:05", apertura: 500, ventas: 620, otros: 0, egresos: 0, depositos: 0, deberia: 1120 },
    { sede: "lim", estado: "sin-abrir", nota: "Abre el martes 20: su caja todavía no existe" },
    { sede: "tal", estado: "fondo", nota: "El Taller no vende: tiene un fondo fijo de S/ 150 para gastos chicos", deberia: 150 },
  ];
  const CIERRES = [
    { sede: "aqp", dia: "sáb 10", quien: "Lucía Quispe", dif: -80, motivo: "Taxi que no se anotó" },
    { sede: "aqp", dia: "mar 13", quien: "Lucía Quispe", dif: -40, motivo: "Taxi que no se anotó" },
  ];

  /* Movimientos entre cuentas (la plata cambia de lugar: no es venta ni gasto). */
  const MOVIMIENTOS = [
    { id: "m1", fecha: "mar 13", tipo: "Depósito al banco", de: "Caja fuerte · Trujillo", a: "BCP", monto: 5800, sedes: ["tru"], quien: "Rosa Paredes", cuentas: ["cf-tru", "bcp"] },
    { id: "m2", fecha: "mar 13", tipo: "Depósito de la máquina", de: "Izipay", a: "Interbank", monto: 3960, comision: 68, sedes: ["tru", "aqp"], quien: "Felipe Alvarez", cuentas: ["izi-tru", "izi-aqp", "ibk"] },
    { id: "m3", fecha: "lun 12", tipo: "Pago de la tarjeta", de: "BCP", a: "Tarjeta de crédito CAYLA", monto: 1900, sedes: ["emp"], quien: "Felipe Alvarez", cuentas: ["bcp", "tc"] },
    { id: "m4", fecha: "vie 9", tipo: "Depósito al banco", de: "Caja fuerte · Arequipa", a: "BCP", monto: 2400, sedes: ["aqp"], quien: "Lucía Quispe", cuentas: ["cf-aqp", "bcp"] },
    { id: "m5", fecha: "vie 9", tipo: "Depósito de la máquina", de: "Vendemás", a: "Interbank", monto: 2180, comision: 39, sedes: ["tru", "aqp"], quien: "Felipe Alvarez", cuentas: ["ven-tru", "ven-aqp", "ibk"] },
    { id: "m6", fecha: "lun 5", tipo: "Entre cuentas", de: "BCP", a: "Interbank", monto: 3000, sedes: ["emp"], quien: "Felipe Alvarez", cuentas: ["bcp", "ibk"] },
  ];

  /* Conciliación: el extracto del banco contra lo que anotó el sistema. «sede»: de dónde salió la plata, si se sabe. */
  const BANCOS = {
    ibk: {
      nombre: "Interbank", al: "mié 14", movs: 38, solos: 34, saldoBanco: 9650, saldoSistema: 9830,
      lineas: [
        { id: "l1", fecha: "mar 13", banco: "ABONO IZIPAY", monto: 3960, sistema: "Depósito de la máquina · Izipay", sede: "tru", estado: "sugerida" },
        { id: "l2", fecha: "vie 9", banco: "ABONO VENDEMAS", monto: 2180, sistema: "Depósito de la máquina · Vendemás", sede: "aqp", estado: "sugerida" },
        { id: "l3", fecha: "lun 5", banco: "TRANSF DE BCP", monto: 3000, sistema: "Entre cuentas · BCP → Interbank", sede: "emp", estado: "sugerida" },
        { id: "l4", fecha: "sáb 3", banco: "COM MANT", monto: -180, sistema: null, sede: "emp", estado: "sola" },
      ],
    },
    bcp: {
      nombre: "BCP", al: "mié 14", movs: 42, solos: 41, saldoBanco: 19300, saldoSistema: 18300,
      lineas: [{ id: "l5", fecha: "mar 13", banco: "TRANSF +", monto: 1000, sistema: null, sede: "emp", estado: "sola" }],
    },
  };

  /* ¿Me alcanza? Es de CAYLA entera: sueldos y alquileres salen del banco. */
  const ALCANZA = { minimo: 15000, baja: 11200, dia: "sáb 31", dias: 3, salidas: [{ texto: "Sueldos y alquileres de noviembre", dia: "vie 30", monto: 37900 }] };

  /* Comprobación de que la historia cuadra (la consola avisa si una cifra se mueve). */
  const tiene = CUENTAS.filter((c) => c.tipo !== "tarjeta").reduce((a, c) => a + c.saldo, 0);
  const debe = DEUDAS.reduce((a, d) => a + d.total - d.pagado, 0);
  if (tiene !== 42830) console.warn("La plata no suma S/ 42,830:", tiene);
  if (debe !== 16900) console.warn("Lo que se debe no suma S/ 16,900:", debe);

  window.DINERO = { SEDES, CUENTAS, TIPOS, DEUDAS, TRAMOS, EFECTIVO, CIERRES, MOVIMIENTOS, BANCOS, ALCANZA };
})();
