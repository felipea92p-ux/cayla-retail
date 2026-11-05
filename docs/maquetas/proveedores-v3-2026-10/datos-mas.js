// Más proveedores para la v3 (2026-10-26): Felipe tiene muchos (52 con compras según el ADR-0502, unos 100 activos). A los 11 de
// datos.js se suman 41 inventados con una semilla fija (siempre salen los mismos), con la cola larga de verdad: pocos grandes y muchos chicos,
// casi todo por la carga inicial (costo por confirmar). Los nombres son inventados.
(function () {
  let s = 20261026;
  const azar = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const NOMBRES = ["Textiles Huancayo", "Confecciones Mirella", "Moda Andina", "Hilandería Puno", "Creaciones Yuli", "Denim del Norte", "Telas Chiclayo",
    "Inversiones Kusi", "Tejidos Cusi", "Confecciones Lucero", "Estilo Lima", "Punto Alpaca", "Creaciones Rocío", "Confecciones Sumaq", "Moda Sullana",
    "Textil Chimbote", "Taller Maya", "Corporación Inti", "Confecciones Brisa", "Algodón Pima", "Jeans Trujillo", "Grupo Wari", "Confecciones Nina",
    "Tejidos Kantu", "Moda Ayni", "Creaciones Killa", "Textil Paracas", "Confecciones Yaku", "Inka Knit", "Hilos Andinos", "Moda Qori",
    "Confecciones Pacha", "Taller Sisa", "Comercial Mallki", "Tejidos Wayra", "Confecciones Tika", "Moda Ñusta", "Distribuidora Rímac",
    "Novedades Ica", "Creaciones Valeska", "Textil Huaraz"];
  const RUBROS = ["Polos", "Blusas", "Pantalones", "Vestidos", "Chompas", "Casacas", "Faldas", "Jeans", "Accesorios", "Tejidos"];
  const repartir = (n, pesos) => { const t = pesos.reduce((a, b) => a + b, 0); const xs = pesos.map((w) => Math.floor((n * w) / t)); xs[1] += n - xs.reduce((a, b) => a + b, 0); return xs; };
  NOMBRES.forEach((nombre, i) => {
    const comprado = Math.round(6 + 115 * Math.pow(azar(), 3.2));
    const dias = azar() < 0.8 ? 25 : 30 + Math.round(azar() * 30);
    // El ritmo objetivo decide cuánto se vendió: un tercio lento, la mitad a su ritmo, el resto rápido.
    const r = azar(), semanasObjetivo = r < 0.36 ? 16 + azar() * 60 : r < 0.84 ? 6.5 + azar() * 9 : 2 + azar() * 3.8;
    const semanas = Math.max(1, dias / 7);
    // vendidas v y quedan q con q / (v / semanas) ≈ objetivo  →  v = comprado / (1 + objetivo / semanas)
    const vendidas = Math.min(comprado - 1, Math.max(0, Math.round(comprado / (1 + semanasObjetivo / semanas))));
    const estantes = comprado - vendidas;
    const costo = 18 + Math.round(azar() * 27);
    const compras = azar() < 0.1 ? Math.round(comprado * (0.5 + azar() * 0.5)) : 0;
    const conDeuda = azar() < 0.3, deuda = conDeuda ? Math.round((300 + azar() * 2700) / 10) * 10 : 0;
    const vencido = conDeuda && azar() < 0.18 ? Math.round(deuda * 0.4 / 10) * 10 : 0;
    const atrasadas = azar() < 0.07 ? 1 : 0;
    const t = repartir(vendidas, [2, 4, 3, 1]), tq = repartir(estantes, [2, 3, 3, 2]);
    const sv = repartir(vendidas, [3, 2, 3]), sq = repartir(estantes, [3, 3, 3]);
    const rubro = RUBROS[i % RUBROS.length];
    const v1 = Math.round(vendidas * 0.6), q1 = Math.round(estantes * 0.55);
    window.PROVEEDORES.push({
      id: `p${i + 1}`, nombre, marcas: [nombre.split(" ").slice(-1)[0]], ruc: `20${String(600000000 + i * 7919).slice(0, 9)}`, contacto: "—", rubro,
      comprado, compras, vendidas, estantes, dias, costo, precio: Math.round(costo * (1.6 + azar() * 0.6)),
      plataParada: 0, unidadesParadas: 0, prendasParadas: 0,
      deuda, vencido, facturasVencidas: vencido ? 1 : 0, facturas: deuda ? 1 + Math.round(azar() * 2) : 1, atrasadas, pactado: deuda ? 30 : null,
      plazoReal: null, pagadas: 0, diasEntrega: null, completas: 1, nosDebe: null, saldoFavor: 0, ultimaCompra: dias,
      tallas: { S: [t[0], tq[0]], M: [t[1], tq[1]], L: [t[2], tq[2]], XL: [t[3], tq[3]] },
      sedes: { tru: [sv[0], sq[0]], aqp: [sv[1], sq[1]], lim: [sv[2], sq[2]] },
      prendas: [{ ref: `${rubro} modelo A`, compradas: v1 + q1, vendidas: v1, quedan: q1 }, { ref: `${rubro} modelo B`, compradas: comprado - v1 - q1, vendidas: vendidas - v1, quedan: estantes - q1 }],
    });
  });
})();
