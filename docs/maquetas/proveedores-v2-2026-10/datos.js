// Datos de ejemplo de las tres maquetas de Proveedores (2026-10-26). Un solo lugar: si una suma deja de cuadrar, la consola avisa.
//
// Los casos reales salen del ADR-0502: Lasak Store (183 compradas, 6 vendidas, unas 99 semanas), Textil Anqori (138 / 19 / 22 semanas),
// Confecciones Deyner (406 / 193 / se agota en unas 3 semanas, 204 en estantes), Textiles Jacard (S/ 825 parados en 4 prendas, con costo real),
// Alex William Sevilla (22), Corporaciones Wayi (19) y Marisol Bellido (17). El resto es inventado, coherente con las reglas de
// apps/web/lib/proveedor-ritmo-reglas.ts y proveedor-prendas-reglas.ts.
//
// HOY el 0 % de lo comprado tiene costo real (todo vino por la carga inicial). En la maqueta, Deyner (64 %), Jacard (100 %) e Hilos del Sur
// (80 %) ya llegaron por Compras, para que se vea cómo cambia la pantalla cuando el dinero deja de estar «por confirmar».
//
// tallas y sedes: [vendidas, quedan]. Son los dos datos que construye otra sesión en paralelo (curva de tallas y rendimiento por sede):
// aquí son inventados y la pantalla los marca como «dato nuevo».

window.HOY = "2026-10-26";

window.PROVEEDORES = [
  { id: "deyner", nombre: "Confecciones Deyner", marcas: ["Deyner"], ruc: "20601234871", contacto: "Deyner Quispe", rubro: "Polos y tops",
    comprado: 406, compras: 260, vendidas: 193, estantes: 204, dias: 21, costo: 24, precio: 46,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 4200, vencido: 0, facturasVencidas: 0, facturas: 3, atrasadas: 0, pactado: 30, plazoReal: 26, pagadas: 2, diasEntrega: 6, completas: 3,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 12,
    tallas: { S: [38, 52], M: [71, 41], L: [58, 56], XL: [26, 55] },
    sedes: { tru: [96, 62], aqp: [52, 70], lim: [45, 72] },
    prendas: [
      { ref: "Polo básico", compradas: 140, vendidas: 88, quedan: 48 },
      { ref: "Polo cuello V", compradas: 120, vendidas: 61, quedan: 56 },
      { ref: "Blusa de tiras", compradas: 86, vendidas: 30, quedan: 52 },
      { ref: "Top rib", compradas: 60, vendidas: 14, quedan: 48 },
    ] },
  { id: "rayza", nombre: "Confecciones Rayza", marcas: ["Rayza"], ruc: "20605539120", contacto: "Rayza Huamán", rubro: "Vestidos y faldas",
    comprado: 120, compras: 0, vendidas: 48, estantes: 70, dias: 25, costo: 30, precio: 62,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 1600, vencido: 0, facturasVencidas: 0, facturas: 1, atrasadas: 0, pactado: 15, plazoReal: null, pagadas: 0, diasEntrega: null, completas: 1,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 25,
    tallas: { S: [10, 14], M: [19, 16], L: [13, 22], XL: [6, 18] },
    sedes: { tru: [14, 26], aqp: [22, 18], lim: [12, 26] },
    prendas: [
      { ref: "Vestido de lino", compradas: 50, vendidas: 26, quedan: 23 },
      { ref: "Falda midi", compradas: 40, vendidas: 14, quedan: 25 },
      { ref: "Blusa popelina", compradas: 30, vendidas: 8, quedan: 22 },
    ] },
  { id: "jacard", nombre: "Textiles Jacard", marcas: ["Jacard"], ruc: "20498812345", contacto: "Rosa Mamani", rubro: "Tejidos",
    comprado: 62, compras: 62, vendidas: 19, estantes: 38, dias: 40, costo: 25, precio: 44,
    plataParada: 825, unidadesParadas: 33, prendasParadas: 4,
    deuda: 0, vencido: 0, facturasVencidas: 0, facturas: 2, atrasadas: 0, pactado: 30, plazoReal: 28, pagadas: 2, diasEntrega: 9, completas: 1,
    nosDebe: { prendas: 3, monto: 75 }, saldoFavor: 180, ultimaCompra: 40,
    tallas: { S: [4, 10], M: [8, 11], L: [5, 10], XL: [2, 7] },
    sedes: { tru: [11, 12], aqp: [3, 14], lim: [5, 12] },
    prendas: [
      { ref: "Cárdigan jacquard", compradas: 15, vendidas: 11, quedan: 1 },
      { ref: "Chompa rombos", compradas: 14, vendidas: 8, quedan: 4 },
      { ref: "Bufanda trenza", compradas: 9, vendidas: 0, quedan: 9 },
      { ref: "Gorro tejido", compradas: 8, vendidas: 0, quedan: 8 },
      { ref: "Chaleco rombos", compradas: 8, vendidas: 0, quedan: 8 },
      { ref: "Poncho andino", compradas: 8, vendidas: 0, quedan: 8 },
    ] },
  { id: "hilos", nombre: "Hilos del Sur", marcas: ["Sureña"], ruc: "20455501987", contacto: "Julio Ccama", rubro: "Pantalones",
    comprado: 80, compras: 64, vendidas: 34, estantes: 44, dias: 40, costo: 31, precio: 43,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 2300, vencido: 0, facturasVencidas: 0, facturas: 3, atrasadas: 1, pactado: 30, plazoReal: 33, pagadas: 2, diasEntrega: 12, completas: 2,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 18,
    tallas: { S: [6, 9], M: [12, 12], L: [11, 13], XL: [5, 10] },
    sedes: { tru: [8, 16], aqp: [19, 10], lim: [7, 18] },
    prendas: [
      { ref: "Pantalón palazzo", compradas: 44, vendidas: 20, quedan: 23 },
      { ref: "Short de lino", compradas: 36, vendidas: 14, quedan: 21 },
    ] },
  { id: "nativa", nombre: "Moda Nativa", marcas: ["Nativa"], ruc: "10456677812", contacto: "Elsa Condori", rubro: "Blusas",
    comprado: 88, compras: 0, vendidas: 22, estantes: 64, dias: 25, costo: 28, precio: 55,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 0, vencido: 0, facturasVencidas: 0, facturas: 1, atrasadas: 0, pactado: null, plazoReal: null, pagadas: 1, diasEntrega: null, completas: 1,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 25,
    tallas: { S: [5, 15], M: [9, 18], L: [6, 17], XL: [2, 14] },
    sedes: { tru: [6, 22], aqp: [4, 20], lim: [12, 22] },
    prendas: [
      { ref: "Blusa bordada", compradas: 48, vendidas: 15, quedan: 32 },
      { ref: "Camisa de lino", compradas: 40, vendidas: 7, quedan: 32 },
    ] },
  { id: "kero", nombre: "Kero Moda", marcas: ["Kero"], ruc: "10712233445", contacto: "Kevin Rojas", rubro: "Casacas",
    comprado: 14, compras: 0, vendidas: 4, estantes: 10, dias: 25, costo: 30, precio: 89,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 0, vencido: 0, facturasVencidas: 0, facturas: 0, atrasadas: 0, pactado: null, plazoReal: null, pagadas: 0, diasEntrega: null, completas: 0,
    nosDebe: null, saldoFavor: 0, ultimaCompra: null,
    tallas: { S: [1, 2], M: [2, 3], L: [1, 3], XL: [0, 2] },
    sedes: { tru: [0, 3], aqp: [0, 3], lim: [4, 4] },
    prendas: [{ ref: "Casaca denim", compradas: 14, vendidas: 4, quedan: 10 }] },
  { id: "anqori", nombre: "Textil Anqori", marcas: ["Anqori"], ruc: "20600987123", contacto: "Nilda Apaza", rubro: "Alpaca",
    comprado: 138, compras: 0, vendidas: 19, estantes: 115, dias: 25, costo: 38, precio: 72,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 2900, vencido: 1150, facturasVencidas: 1, facturas: 2, atrasadas: 0, pactado: 30, plazoReal: 41, pagadas: 2, diasEntrega: 8, completas: 2,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 25,
    tallas: { S: [3, 26], M: [8, 30], L: [6, 31], XL: [2, 28] },
    sedes: { tru: [11, 35], aqp: [2, 40], lim: [6, 40] },
    prendas: [
      { ref: "Chompa de alpaca", compradas: 52, vendidas: 9, quedan: 42 },
      { ref: "Cárdigan largo", compradas: 46, vendidas: 6, quedan: 38 },
      { ref: "Chalina", compradas: 40, vendidas: 4, quedan: 35 },
    ] },
  { id: "alex", nombre: "Alex William Sevilla", marcas: ["AW"], ruc: "10433219876", contacto: "Alex Sevilla", rubro: "Sastrería",
    comprado: 72, compras: 0, vendidas: 10, estantes: 62, dias: 25, costo: 33, precio: 60,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 0, vencido: 0, facturasVencidas: 0, facturas: 1, atrasadas: 0, pactado: null, plazoReal: null, pagadas: 1, diasEntrega: null, completas: 1,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 25,
    tallas: { S: [2, 14], M: [4, 16], L: [3, 18], XL: [1, 14] },
    sedes: { tru: [2, 20], aqp: [5, 20], lim: [3, 22] },
    prendas: [
      { ref: "Pantalón sastre", compradas: 40, vendidas: 6, quedan: 34 },
      { ref: "Blazer corto", compradas: 32, vendidas: 4, quedan: 28 },
    ] },
  { id: "wayi", nombre: "Corporaciones Wayi", marcas: ["Wayi"], ruc: "20612340099", contacto: "Luis Wayi", rubro: "Polos y poleras",
    comprado: 101, compras: 0, vendidas: 16, estantes: 85, dias: 25, costo: 26, precio: 49,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 1800, vencido: 0, facturasVencidas: 0, facturas: 3, atrasadas: 2, pactado: 30, plazoReal: null, pagadas: 1, diasEntrega: 15, completas: 1,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 9,
    tallas: { S: [3, 20], M: [6, 22], L: [5, 24], XL: [2, 19] },
    sedes: { tru: [4, 30], aqp: [3, 25], lim: [9, 30] },
    prendas: [
      { ref: "Polo estampado", compradas: 55, vendidas: 9, quedan: 46 },
      { ref: "Polera con capucha", compradas: 46, vendidas: 7, quedan: 39 },
    ] },
  { id: "marisol", nombre: "Marisol Bellido", marcas: ["Bellido"], ruc: "10401122334", contacto: "Marisol Bellido", rubro: "Vestidos",
    comprado: 58, compras: 0, vendidas: 10, estantes: 48, dias: 25, costo: 35, precio: 68,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 0, vencido: 0, facturasVencidas: 0, facturas: 1, atrasadas: 0, pactado: null, plazoReal: null, pagadas: 1, diasEntrega: null, completas: 1,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 25,
    tallas: { S: [2, 11], M: [4, 13], L: [3, 14], XL: [1, 10] },
    sedes: { tru: [5, 16], aqp: [3, 16], lim: [2, 16] },
    prendas: [{ ref: "Vestido camisero", compradas: 58, vendidas: 10, quedan: 48 }] },
  { id: "lasak", nombre: "Lasak Store", marcas: ["Lasak"], ruc: "20609988776", contacto: "Karla Salas", rubro: "Fiesta",
    comprado: 183, compras: 0, vendidas: 6, estantes: 174, dias: 24, costo: 32, precio: 59,
    plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
    deuda: 0, vencido: 0, facturasVencidas: 0, facturas: 1, atrasadas: 0, pactado: null, plazoReal: null, pagadas: 1, diasEntrega: null, completas: 1,
    nosDebe: null, saldoFavor: 0, ultimaCompra: 24,
    tallas: { S: [1, 40], M: [3, 50], L: [2, 48], XL: [0, 36] },
    sedes: { tru: [0, 0], aqp: [0, 0], lim: [6, 174] },
    prendas: [
      { ref: "Top lentejuelas", compradas: 22, vendidas: 2, quedan: 20 },
      { ref: "Blusa satén", compradas: 18, vendidas: 1, quedan: 17 },
      { ref: "Vestido de fiesta", compradas: 18, vendidas: 1, quedan: 17 },
      { ref: "Falda plisada", compradas: 16, vendidas: 1, quedan: 15 },
      { ref: "Body de encaje", compradas: 16, vendidas: 1, quedan: 15 },
      { ref: "Top brillos", compradas: 14, vendidas: 0, quedan: 14 },
      { ref: "Pantalón satén", compradas: 14, vendidas: 0, quedan: 13 },
      { ref: "Kimono", compradas: 13, vendidas: 0, quedan: 13 },
      { ref: "Crop top", compradas: 13, vendidas: 0, quedan: 13 },
      { ref: "Chaqueta lentejuela", compradas: 13, vendidas: 0, quedan: 12 },
      { ref: "Blusa de volantes", compradas: 13, vendidas: 0, quedan: 13 },
      { ref: "Enterizo", compradas: 13, vendidas: 0, quedan: 12 },
    ] },
];

// El Taller (CAYLA SAC): producción propia, aparte del ranking y de los avisos (ADR-0502 act. b).
window.TALLER = { nombre: "CAYLA SAC", prendas: 520, gasto: 21400 };

// Las cifras de arriba de la lista (solo mercadería, ADR-0501).
window.CARTERA = { activos: 100, deCompras: 12, aFavor: 180 };

// Si una suma no cuadra, se avisa: la maqueta no puede mentir.
(function revisar() {
  const suma = (o, i) => Object.values(o).reduce((a, x) => a + x[i], 0);
  for (const p of window.PROVEEDORES) {
    const err = [];
    if (suma(p.tallas, 0) !== p.vendidas) err.push("tallas vendidas");
    if (suma(p.tallas, 1) !== p.estantes) err.push("tallas quedan");
    if (suma(p.sedes, 0) !== p.vendidas) err.push("sedes vendidas");
    if (suma(p.sedes, 1) !== p.estantes) err.push("sedes quedan");
    if (p.prendas.reduce((a, x) => a + x.compradas, 0) !== p.comprado) err.push("prendas compradas");
    if (p.prendas.reduce((a, x) => a + x.vendidas, 0) !== p.vendidas) err.push("prendas vendidas");
    if (p.prendas.reduce((a, x) => a + x.quedan, 0) !== p.estantes) err.push("prendas quedan");
    if (p.vendidas + p.estantes > p.comprado) err.push("vendidas + estantes > compradas");
    if (err.length) console.warn(`[datos] ${p.nombre}: no cuadra ${err.join(", ")}`);
  }
})();
