/* =====================================================================
   datos.js — lo que ve la pantalla de Tráfico.

   REAL: las 21 prendas (nombre, código, categoría, prefijo, precio, tallas y colores con su hex) salen de la base local
   (`retail.productos` + `variantes` + `categorias` + `colores` + `tallas`, consultada el 2026-10-23). El hex de cada color es DATO
   del catálogo: se pinta con `data-color-dato` y no cambia con el tema.
   DE EJEMPLO: todas las visitas. Hoy la tienda no cuenta visitas (solo mide su velocidad, ADR-0447). Se inventan persona por
   persona con una semilla fija (dos personas ven exactamente lo mismo) y TODO se cuenta desde esa misma lista: por eso, si filtras
   por Instagram, «entraron» es igual a la fila de Instagram, y la suma de los caminos es el total.
   ===================================================================== */
(function () {
  "use strict";

  const SEMILLA = 20261023;

  /** Generador con semilla (mulberry32): mismo número de entrada, misma secuencia, en cualquier navegador. */
  function conSemilla(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const azar = conSemilla(SEMILLA);
  function elegir(pesos) {
    let suma = 0;
    for (const p of pesos) suma += p;
    let r = azar() * suma;
    for (let i = 0; i < pesos.length; i++) {
      r -= pesos[i];
      if (r < 0) return i;
    }
    return pesos.length - 1;
  }

  /* ---------- El catálogo real (base local, 2026-10-23) ---------- */
  const T_LETRA = ["XS", "S", "M", "L"];
  const P_LETRA = { XS: 0.6, S: 1, M: 1.3, L: 0.9 };
  const P_NUM = { 28: 0.9, 30: 1.3, 32: 1, 34: 0.6 };
  const PRENDAS = [
    { codigo: "BLZ-0001", nombre: "Blazer Camila", categoria: "Blazers", prefijo: "BLZ", precio: 199.9, tallas: ["S", "M", "L"], colores: [["Arena", "#CCA67F"], ["Negro", "#2D2C2F"]], peso: 0.85 },
    { codigo: "CMS-0001", nombre: "Blusa Emma", categoria: "Camisas y Blusas", prefijo: "CMS", precio: 79.9, tallas: ["S", "M", "L"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], peso: 1.55 },
    { codigo: "CMS-0003", nombre: "Blusa Ivana", categoria: "Camisas y Blusas", prefijo: "CMS", precio: 149.9, tallas: ["S", "M", "L"], colores: [["Blanco", "#F4F9FF"], ["Lavanda", "#D2C4D6"]], peso: 0.55 },
    { codigo: "CMS-0002", nombre: "Blusa Valentina", categoria: "Camisas y Blusas", prefijo: "CMS", precio: 69.9, tallas: ["S", "M", "L"], colores: [["Blanco", "#F4F9FF"], ["Rosado", "#F0A1BF"]], peso: 0.8 },
    { codigo: "CAS-0002", nombre: "Casaca Luciana", categoria: "Casacas", prefijo: "CAS", precio: 159.9, tallas: ["M", "L"], colores: [["Beige", "#D5BA98"]], peso: 0.45 },
    { codigo: "CAS-0001", nombre: "Casaca Ximena", categoria: "Casacas", prefijo: "CAS", precio: 179.9, tallas: ["S", "M", "L"], colores: [["Azul marino", "#2A304E"], ["Negro", "#2D2C2F"]], peso: 1.05 },
    { codigo: "CHA-0001", nombre: "Chaleco Fiorella", categoria: "Chalecos", prefijo: "CHA", precio: 119.9, tallas: ["S", "M", "L"], colores: [["Camel", "#B0885B"], ["Gris melange", "#A2A2A1"]], peso: 0.4 },
    { codigo: "CMP-0001", nombre: "Chompa Isabella", categoria: "Chompas", prefijo: "CMP", precio: 129.9, tallas: ["S", "M", "L"], colores: [["Camel", "#B0885B"], ["Crudo", "#F3ECE0"]], peso: 0.7 },
    { codigo: "ENT-0001", nombre: "Enterizo Alessia", categoria: "Enterizos", prefijo: "ENT", precio: 169.9, tallas: ["S", "M", "L"], colores: [["Negro", "#2D2C2F"], ["Verde", "#487D49"]], peso: 0.7 },
    { codigo: "FAL-0002", nombre: "Falda Ariana", categoria: "Faldas", prefijo: "FAL", precio: 64.9, tallas: ["S", "M"], colores: [["Rosado", "#F0A1BF"]], peso: 0.3 },
    { codigo: "FAL-0001", nombre: "Falda Renata", categoria: "Faldas", prefijo: "FAL", precio: 74.9, tallas: ["S", "M", "L"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], peso: 0.6 },
    { codigo: "JEA-0001", nombre: "Jean Martina", categoria: "Jeans", prefijo: "JEA", precio: 139.9, tallas: ["28", "30", "32"], colores: [["Azul marino", "#2A304E"], ["Negro", "#2D2C2F"]], peso: 1.3 },
    { codigo: "PAN-0003", nombre: "Pantalón Brisa", categoria: "Pantalones", prefijo: "PAN", precio: 169.9, tallas: ["28", "30", "32"], colores: [["Arena", "#CCA67F"], ["Negro", "#2D2C2F"]], peso: 0.6 },
    { codigo: "PAN-0001", nombre: "Pantalón Carla", categoria: "Pantalones", prefijo: "PAN", precio: 99.9, tallas: ["28", "30", "32", "34"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], peso: 0.8 },
    { codigo: "PAN-0002", nombre: "Pantalón Mía", categoria: "Pantalones", prefijo: "PAN", precio: 109.9, tallas: ["28", "30", "32"], colores: [["Azul marino", "#2A304E"]], peso: 0.35 },
    { codigo: "POL-0001", nombre: "Polo Lucía", categoria: "Polos", prefijo: "POL", precio: 49.9, tallas: ["S", "M", "L"], colores: [["Blanco", "#F4F9FF"], ["Negro", "#2D2C2F"], ["Rosado", "#F0A1BF"]], peso: 0.9 },
    { codigo: "SHO-0001", nombre: "Short Valeria", categoria: "Shorts", prefijo: "SHO", precio: 69.9, tallas: ["S", "M", "L"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], peso: 0.5 },
    { codigo: "TOP-0001", nombre: "Top Daniela", categoria: "Tops", prefijo: "TOP", precio: 59.9, tallas: ["XS", "S", "M"], colores: [["Blanco", "#F4F9FF"], ["Terracota", "#B3573F"]], peso: 1.0, alzaDesde: [53, 3.1] }, // un video de TikTok la subió esta semana
    { codigo: "VES-0002", nombre: "Vestido Antonella", categoria: "Vestidos", prefijo: "VES", precio: 129.9, tallas: ["S", "M", "L"], colores: [["Rosado", "#F0A1BF"]], peso: 0.45 },
    { codigo: "VES-0003", nombre: "Vestido Aurora", categoria: "Vestidos", prefijo: "VES", precio: 219.9, tallas: ["S", "M", "L"], colores: [["Crudo", "#F3ECE0"], ["Morado", "#563474"]], peso: 1.25, alzaAniversario: 1.9 },
    { codigo: "VES-0001", nombre: "Vestido Sofía", categoria: "Vestidos", prefijo: "VES", precio: 149.9, tallas: ["S", "M", "L"], colores: [["Azul marino", "#2A304E"], ["Negro", "#2D2C2F"]], peso: 1.0 },
  ];
  PRENDAS.forEach((p, i) => {
    p.i = i;
    p.pesoTalla = p.tallas.map((t) => P_LETRA[t] ?? P_NUM[t] ?? 1);
    p.pesoColor = p.colores.map((_, k) => (k === 0 ? 0.6 : 0.4 / (p.colores.length - 1)));
  });

  /* ---------- Caminos, ciudades y el recorrido ---------- */
  const CAMINOS = [
    { clave: "instagram", nombre: "Instagram", peso: 36, alzaAniv: 1.25, factor: [1.0, 0.97, 1.0, 0.92, 1.0] },
    { clave: "directo", nombre: "Directo", peso: 17, alzaAniv: 1.0, factor: [1.12, 1.06, 1.05, 1.15, 1.05], ayuda: "Escribieron la dirección o la tenían guardada" },
    { clave: "whatsapp", nombre: "WhatsApp", peso: 15, alzaAniv: 1.0, factor: [1.25, 1.12, 1.1, 1.75, 1.06] },
    { clave: "tiktok", nombre: "TikTok", peso: 12, alzaAniv: 1.35, factor: [0.5, 0.85, 0.95, 1.5, 0.95] },
    { clave: "google", nombre: "Google", peso: 9, alzaAniv: 1.0, factor: [1.1, 0.75, 1.0, 1.1, 1.0] },
    { clave: "qr", nombre: "QR en tienda", peso: 6, alzaAniv: 1.4, factor: [1.3, 1.2, 1.2, 1.25, 1.15], ayuda: "Escanearon el código de una etiqueta o un cartel en la tienda" },
    { clave: "otros", nombre: "Otros", peso: 5, alzaAniv: 1.0, factor: [0.92, 0.95, 1.0, 1.0, 1.0], ayuda: "Facebook, correos y enlaces de otras páginas" },
  ];
  // Afinidad camino → prenda (lo que más se comparte en cada red).
  const AFINIDAD = {
    tiktok: { "TOP-0001": 2.2, "POL-0001": 1.6, "SHO-0001": 1.6 },
    instagram: { "VES-0003": 1.3, "CMS-0001": 1.2 },
    google: { "JEA-0001": 1.7, "BLZ-0001": 1.5 },
    whatsapp: { "CAS-0001": 1.5, "PAN-0001": 1.3 },
  };
  const CIUDADES = [
    { clave: "trujillo", nombre: "Trujillo", peso: 30, tienda: true, pesoQR: 40 },
    { clave: "lima", nombre: "Lima", peso: 25, tienda: true, pesoQR: 32 },
    { clave: "arequipa", nombre: "Arequipa", peso: 19, tienda: true, pesoQR: 28 },
    { clave: "chiclayo", nombre: "Chiclayo", peso: 8, tienda: false },
    { clave: "piura", nombre: "Piura", peso: 6, tienda: false },
    { clave: "cusco", nombre: "Cusco", peso: 5, tienda: false },
    { clave: "otras", nombre: "Otras ciudades", peso: 7, tienda: false },
  ];
  const PASOS = [
    { clave: "entraron", nombre: "Entraron", corto: "Entraron", frase: "entraron a la tienda", donde: "al entrar" },
    { clave: "vieron", nombre: "Vieron una prenda", corto: "Vieron una prenda", frase: "vieron una prenda", donde: "apenas entran" },
    { clave: "talla", nombre: "Eligieron talla", corto: "Eligieron talla", frase: "eligieron talla", donde: "al elegir talla" },
    { clave: "bolsa", nombre: "La pusieron en la bolsa", corto: "A la bolsa", frase: "la pusieron en la bolsa", donde: "al ponerla en la bolsa" },
    { clave: "separaron", nombre: "Separaron", corto: "Separaron", frase: "separaron", donde: "al separar" },
    { clave: "recogieron", nombre: "Recogieron", corto: "Recogieron", frase: "recogieron en la tienda", donde: "al recoger" },
  ];
  // Lo que pierde cada paso, dicho para quien se fue ahí: «… se fueron sin elegir talla».
  const SE_FUERON = ["", "sin mirar ninguna prenda", "sin elegir talla", "sin ponerla en la bolsa", "sin separar", "sin recoger"];
  const PASA_BASE = [0.66, 0.48, 0.58, 0.4, 0.8];

  /* ---------- Los días: del 25 de agosto al viernes 23 de octubre de 2026 (60 días) ---------- */
  const DIAS = [];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  for (let i = 0; i < 60; i++) {
    const f = new Date(Date.UTC(2026, 7, 25 + i));
    DIAS.push({ i, dia: f.getUTCDate(), mes: f.getUTCMonth(), semana: f.getUTCDay(), aniv: f.getUTCMonth() === 9 });
  }
  const HOY = 59;
  const HORA_AHORA = 16; // 4:40 de la tarde: de hoy solo cuentan las horas que ya pasaron
  const PERIODOS = {
    "7d": { clave: "7d", nombre: "7 días", desde: 53, hasta: 59, antDesde: 46, antHasta: 52, contra: "los 7 días anteriores" },
    "30d": { clave: "30d", nombre: "30 días", desde: 30, hasta: 59, antDesde: 0, antHasta: 29, contra: "los 30 días anteriores" },
    aniv: { clave: "aniv", nombre: "Aniversario", desde: 37, hasta: 59, antDesde: 7, antHasta: 29, contra: "el mismo tramo de setiembre" },
  };
  function fechaCorta(i) {
    const d = DIAS[i];
    return `${d.dia} de ${MESES[d.mes]}`;
  }
  function rango(desde, hasta) {
    const a = DIAS[desde];
    const b = DIAS[hasta];
    return a.mes === b.mes ? `del ${a.dia} al ${b.dia} de ${MESES[b.mes]}` : `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  }
  for (const p of Object.values(PERIODOS)) {
    p.rango = rango(p.desde, p.hasta);
    p.rangoCorto = p.rango.charAt(0).toUpperCase() + p.rango.slice(1);
    p.rangoAnterior = rango(p.antDesde, p.antHasta);
    p.dias = p.hasta - p.desde + 1;
  }

  /* ---------- Las horas ---------- */
  const H_BASE = [3, 1.5, 0.8, 0.5, 0.4, 0.6, 1.2, 2.5, 4, 5, 5.5, 6, 7, 7.5, 6.5, 5.5, 5.5, 6, 7, 8.5, 10, 10.5, 8, 5.5];
  const H_QR = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 4, 6, 7, 7, 7, 7, 7.5, 8, 8.5, 8, 6, 3, 0, 0];
  const H_WA = H_BASE.map((v, h) => (h >= 8 && h <= 11 ? v * 1.5 : v));
  const H_TT = H_BASE.map((v, h) => (h >= 20 || h <= 1 ? v * 1.6 : v));
  const PERFIL_HORA = { qr: H_QR, whatsapp: H_WA, tiktok: H_TT };

  /* ---------- Las personas (inventadas, una por una, siempre en el mismo orden) ---------- */
  const SEM_MULT = [1.15, 0.86, 0.9, 0.95, 1.0, 1.08, 1.2];
  const porDia = DIAS.map(() => []);
  for (const d of DIAS) {
    let n = (140 + d.i * 0.5) * SEM_MULT[d.semana] * (0.88 + azar() * 0.24);
    if (d.aniv) n *= 1.7;
    if (d.aniv && d.dia === 1) n *= 1.6; // el día que abrió el Aniversario
    n = Math.round(n);
    for (let k = 0; k < n; k++) {
      const pesosCamino = CAMINOS.map((c) => c.peso * (d.aniv ? c.alzaAniv : 1));
      const c = elegir(pesosCamino);
      const camino = CAMINOS[c];
      const u = camino.clave === "qr" ? elegir(CIUDADES.map((x) => x.pesoQR || 0)) : elegir(CIUDADES.map((x) => x.peso));
      const h = elegir(PERFIL_HORA[camino.clave] || H_BASE);
      if (d.i === HOY && h > HORA_AHORA) continue; // lo que todavía no pasa hoy
      // Hasta dónde llegó: paso a paso, con la probabilidad de su camino y de su ciudad.
      let p = 0;
      const ciudad = CIUDADES[u];
      for (let s = 0; s < 5; s++) {
        let pasa = PASA_BASE[s] * camino.factor[s];
        if (!ciudad.tienda && s === 3) pasa *= 0.45; // sin tienda cerca, separar para recoger cuesta
        if (!ciudad.tienda && s === 4) pasa *= 0.6;
        if (d.aniv && s === 3) pasa *= 1.08;
        if (azar() < Math.min(0.95, pasa)) p = s + 1;
        else break;
      }
      const persona = { d: d.i, h, c, u, p, m: -1, x: null, t: -1, k: -1 };
      if (p >= 1) {
        const af = AFINIDAD[camino.clave] || {};
        const pesos = PRENDAS.map((pr) => pr.peso * (af[pr.codigo] || 1) * (d.aniv && pr.alzaAniversario ? pr.alzaAniversario : 1) * (pr.alzaDesde && d.i >= pr.alzaDesde[0] ? pr.alzaDesde[1] : 1));
        persona.m = elegir(pesos);
        const extra = elegir([45, 30, 17, 8]);
        if (extra) {
          persona.x = [];
          for (let e = 0; e < extra; e++) {
            const j = elegir(pesos);
            if (j !== persona.m && !persona.x.includes(j)) persona.x.push(j);
          }
        }
        const pr = PRENDAS[persona.m];
        persona.k = elegir(pr.pesoColor);
        if (p >= 2) persona.t = elegir(pr.pesoTalla);
      }
      porDia[d.i].push(persona);
    }
  }

  /* ---------- Contar ---------- */
  function cumple(per, filtro) {
    return (filtro.camino == null || CAMINOS[per.c].clave === filtro.camino) && (filtro.ciudad == null || CIUDADES[per.u].clave === filtro.ciudad);
  }
  function* personas(desde, hasta) {
    for (let i = desde; i <= hasta; i++) yield* porDia[i];
  }
  /** «De cada 100» que suma exactamente 100 (resto mayor). */
  function repartir100(valores) {
    const total = valores.reduce((a, b) => a + b, 0);
    if (!total) return valores.map(() => 0);
    const exactos = valores.map((v) => (v / total) * 100);
    const base = exactos.map(Math.floor);
    let falta = 100 - base.reduce((a, b) => a + b, 0);
    const orden = exactos.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < falta; k++) base[orden[k][1]]++;
    return base;
  }
  const de100 = (n, total) => (total ? Math.round((n / total) * 100) : 0);

  /**
   * Todo lo que necesita una pantalla de Tráfico para un período y un filtro ({ camino, ciudad }), contado desde las mismas personas.
   * Los caminos se cuentan con el filtro de ciudad (no con el de camino) y las ciudades con el de camino: así la fila elegida es
   * siempre igual a «entraron» y las demás siguen a la vista para cambiar.
   */
  function resumen(clave, filtro) {
    filtro = filtro || {};
    const per = PERIODOS[clave];
    const pasos = [0, 0, 0, 0, 0, 0];
    const caminos = CAMINOS.map(() => 0);
    const ciudades = CIUDADES.map(() => 0);
    const horas = new Array(24).fill(0);
    const dias = [];
    const pr = PRENDAS.map(() => ({ miraron: 0, pasos: [0, 0, 0, 0, 0], tallas: null, colores: null, caminos: CAMINOS.map(() => 0), anterior: 0 }));
    pr.forEach((x, i) => {
      x.tallas = PRENDAS[i].tallas.map(() => 0);
      x.colores = PRENDAS[i].colores.map(() => 0);
    });
    for (let di = per.desde; di <= per.hasta; di++) {
      let nDia = 0;
      for (const p of porDia[di]) {
        const okCamino = filtro.camino == null || CAMINOS[p.c].clave === filtro.camino;
        const okCiudad = filtro.ciudad == null || CIUDADES[p.u].clave === filtro.ciudad;
        if (okCiudad) caminos[p.c]++;
        if (okCamino) ciudades[p.u]++;
        if (!okCamino || !okCiudad) continue;
        nDia++;
        for (let s = 0; s <= p.p; s++) pasos[s]++;
        horas[p.h]++;
        if (p.m >= 0) {
          const x = pr[p.m];
          x.miraron++;
          x.caminos[p.c]++;
          x.colores[p.k]++;
          for (let s = 2; s <= p.p; s++) x.pasos[s - 1]++;
          if (p.t >= 0) x.tallas[p.t]++;
          if (p.x) for (const j of p.x) {
            pr[j].miraron++;
            pr[j].caminos[p.c]++;
          }
        }
      }
      dias.push({ i: di, n: nDia, etiqueta: fechaCorta(di), hoy: di === HOY });
    }
    let anterior = 0;
    for (const p of personas(per.antDesde, per.antHasta)) {
      if (!cumple(p, filtro)) continue;
      anterior++;
      if (p.m >= 0) {
        pr[p.m].anterior++;
        if (p.x) for (const j of p.x) pr[j].anterior++;
      }
    }

    const total = pasos[0];
    const listaPasos = PASOS.map((s, i) => ({
      ...s,
      i,
      n: pasos[i],
      de100: de100(pasos[i], total),
      seFueron: i === 0 ? 0 : pasos[i - 1] - pasos[i],
      pasa: i === 0 ? 1 : pasos[i - 1] ? pasos[i] / pasos[i - 1] : 0,
      seFueronTexto: SE_FUERON[i],
    }));
    // Dónde se atora: el paso que deja pasar a menos de los que llegaron a él (el que más gente pierde, en proporción).
    let atora = null;
    for (let i = 1; i < 6; i++) {
      const s = listaPasos[i];
      if (listaPasos[i - 1].n < 5) continue;
      if (!atora || s.pasa < atora.pasa) atora = s;
    }
    if (atora) {
      atora = { ...atora, llegaron: listaPasos[atora.i - 1].n, seFueronDe100: 100 - Math.round(atora.pasa * 100), anteriorNombre: listaPasos[atora.i - 1].frase };
    }

    const reparteCaminos = repartir100(caminos);
    const reparteCiudades = repartir100(ciudades);
    const listaCaminos = CAMINOS.map((c, i) => ({ ...c, i, n: caminos[i], de100: reparteCaminos[i], elegido: filtro.camino === c.clave }));
    const listaCiudades = CIUDADES.map((c, i) => ({ ...c, i, n: ciudades[i], de100: reparteCiudades[i], elegido: filtro.ciudad === c.clave }));

    // La hora con más gente, en tramos de 2 horas (lo que una encargada recuerda: «de 8 a 10 de la noche»).
    let pico = { desde: 0, n: -1 };
    for (let h = 0; h < 24; h += 2) {
      const n = horas[h] + horas[h + 1];
      if (n > pico.n) pico = { desde: h, n };
    }
    pico.hasta = pico.desde + 2;
    pico.de100 = de100(pico.n, total);
    const tramos = [];
    for (let h = 0; h < 24; h += 2) tramos.push({ desde: h, hasta: h + 2, n: horas[h] + horas[h + 1] });
    const reparteTramos = repartir100(tramos.map((t) => t.n));
    tramos.forEach((t, i) => (t.de100 = reparteTramos[i]));

    const vieron = pasos[1];
    const listaPrendas = PRENDAS.map((p, i) => {
      const x = pr[i];
      const tallas = p.tallas.map((t, k) => ({ talla: t, n: x.tallas[k] }));
      const colores = p.colores.map(([nombre, hex], k) => ({ nombre, hex, n: x.colores[k] }));
      const rec = [x.miraron, x.pasos[1], x.pasos[2], x.pasos[3], x.pasos[4]];
      return {
        ...p,
        miraron: x.miraron,
        anterior: x.anterior,
        recorrido: rec,
        tallas,
        colores,
        caminos: CAMINOS.map((c, k) => ({ nombre: c.nombre, clave: c.clave, n: x.caminos[k] })).sort((a, b) => b.n - a.n),
        de100Vieron: de100(x.miraron, vieron),
      };
    }).sort((a, b) => b.miraron - a.miraron || a.nombre.localeCompare(b.nombre));
    listaPrendas.forEach((p, k) => (p.puesto = k + 1));

    return {
      periodo: per,
      filtro: { camino: filtro.camino ?? null, ciudad: filtro.ciudad ?? null },
      total,
      anterior,
      cambio: anterior ? Math.round(((total - anterior) / anterior) * 100) : null,
      pasos: listaPasos,
      atora,
      caminos: listaCaminos,
      ciudades: listaCiudades,
      horas,
      tramos,
      pico,
      vieron,
      prendas: listaPrendas,
      masMirada: listaPrendas[0],
      dias,
      // «Ahora mismo»: también inventado; se achica con el filtro para no contradecir a nadie.
      ahora: Math.max(0, Math.round(9 * (total / Math.max(1, resumenTotal(clave))))),
    };
  }
  const totales = {};
  function resumenTotal(clave) {
    if (totales[clave] == null) {
      const per = PERIODOS[clave];
      let n = 0;
      for (let i = per.desde; i <= per.hasta; i++) n += porDia[i].length;
      totales[clave] = n;
    }
    return totales[clave];
  }

  /* ---------- Palabras ---------- */
  const fmt = (n) => Math.round(n).toLocaleString("es-PE");
  const personasTxt = (n) => `${fmt(n)} ${n === 1 ? "persona" : "personas"}`;
  function horaTxt(h) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    if (h === 0 || h === 24) return { n: 12, de: "de la noche" };
    if (h < 6) return { n: h12, de: "de la madrugada" };
    if (h < 12) return { n: h12, de: "de la mañana" };
    if (h === 12) return { n: 12, de: "del día" };
    if (h < 19) return { n: h12, de: "de la tarde" };
    return { n: h12, de: "de la noche" };
  }
  function tramoTxt(desde, hasta) {
    const a = horaTxt(desde);
    const b = horaTxt(hasta);
    return a.de === b.de ? `de ${a.n} a ${b.n} ${b.de}` : `de ${a.n} ${a.de} a ${b.n} ${b.de}`;
  }
  /** Marca corta para un eje: «6 a. m.», «12 m.», «8 p. m.». */
  function horaCorta(h) {
    if (h === 0 || h === 24) return "12 a. m.";
    if (h === 12) return "12 m.";
    return h < 12 ? `${h} a. m.` : `${h - 12} p. m.`;
  }
  function cambioTxt(r) {
    if (r.cambio == null) return "sin datos del período anterior";
    if (r.cambio === 0) return `igual que ${r.periodo.contra}`;
    return `${Math.abs(r.cambio)} % ${r.cambio > 0 ? "más" : "menos"} que ${r.periodo.contra}`;
  }

  window.TRAFICO = {
    SEMILLA,
    PRENDAS,
    CAMINOS,
    CIUDADES,
    PASOS,
    PERIODOS,
    HOY: { texto: `${SEMANA[DIAS[HOY].semana]} ${fechaCorta(HOY)}`, hora: "4:40 p. m." },
    resumen,
    repartir100,
    de100,
    fmt,
    personasTxt,
    tramoTxt,
    horaCorta,
    cambioTxt,
  };
})();
