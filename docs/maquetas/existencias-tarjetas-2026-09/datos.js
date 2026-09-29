/* ====================================================================
   datos.js · Existencias en tarjetas (maqueta, 2026-09-29)

   Datos INVENTADOS y las pocas reglas de negocio que la maqueta necesita para ser usable.
   No toca la base ni ninguna función de retail: es solo para ver y probar la pantalla.

   Modelo (igual que el ERP real): una «prenda» es producto + color, con su stock por talla
   repartido en piso y almacén. `stock[talla] = [piso, almacén]`. Los otros colores del mismo
   producto son otras prendas: los puntos de color de la tarjeta son esa familia.

   Tienda TRU sale calzada con la imagen de referencia: las seis primeras tarjetas son las de la
   imagen y las cifras de arriba (352 en piso · 226 en almacén · 12 con alerta) son la SUMA de las
   48 prendas, no números sueltos. Las otras sedes se generan igual, con sus propias cifras.
   ==================================================================== */
(function (w) {
  "use strict";

  const TALLAS = ["XS", "S", "M", "L"];

  const ESTADOS = {
    reponer: { texto: "Hay stock para reponer", tono: "ambar", alerta: true },
    sobrestock: { texto: "Revisar sobrestock en piso", tono: "naranja", alerta: true },
    balanceado: { texto: "Stock balanceado", tono: "verde", alerta: false },
  };

  const COLORES = {
    Marfil: "#e9e0d0", Negro: "#171717", Azul: "#2d4a9b", Beige: "#e2d3bd", Gris: "#aeaeae", Arena: "#d8c8b0",
    Blanco: "#fbfbfb", Celeste: "#6f9fe6", Rosa: "#f295b8", "Crudo/Negro": "#171717", Oliva: "#6b7a4a",
    Terracota: "#b8654a", Vino: "#6d2233", Camel: "#b98a5a",
  };

  /* Familias (producto). Las seis primeras traen la foto y el stock de su primer color tal como
     aparece en la imagen de referencia. `stock` = [piso, almacén] por talla. */
  const FAMILIAS = [
    { id: "palazzo-billie", nombre: "Palazzo Billie", marca: "Wayi", categoria: "Blazers", pref: "PAL", foto: "fotos/palazzo-billie.jpg",
      colores: ["Marfil", "Negro", "Azul"],
      // Imagen: piso L = 0 y aun así «Piso 4» arriba (0+1+2+0 = 3). Aquí L = 1 para que la cifra sea la suma de las tallas.
      imagen: { estado: "balanceado", stock: { XS: [0, 2], S: [1, 3], M: [2, 1], L: [1, 0] } } },
    { id: "adelle-wide-leg", nombre: "Adelle Wide Leg", marca: "Pilar", categoria: "Pantalones", pref: "ADE", foto: "fotos/adelle-wide-leg.jpg",
      colores: ["Negro", "Beige", "Gris"],
      imagen: { estado: "reponer", stock: { XS: [0, 2], S: [1, 1], M: [2, 3], L: [1, 0] } } },
    { id: "culotte-petit-yani", nombre: "Culotte Petit Yani", marca: "Wayi", categoria: "Shorts", pref: "CUL", foto: "fotos/culotte-petit-yani.jpg",
      colores: ["Arena", "Negro", "Blanco"],
      imagen: { estado: "balanceado", stock: { XS: [0, 1], S: [2, 0], M: [0, 1], L: [0, 0] } } },
    { id: "wide-leg-corto-comfo", nombre: "Wide Leg Corto Comfo", marca: "Jirish", categoria: "Camisas", pref: "WLC", foto: "fotos/wide-leg-corto-comfo.jpg",
      colores: ["Celeste", "Blanco", "Arena"],
      imagen: { estado: "balanceado", stock: { XS: [0, 1], S: [1, 1], M: [0, 2], L: [1, 1] } } },
    { id: "top-luna", nombre: "Top Luna", marca: "Wayi", categoria: "Tops", pref: "TOP", foto: "fotos/top-luna.jpg",
      colores: ["Negro", "Blanco", "Rosa"],
      imagen: { estado: "sobrestock", stock: { XS: [1, 5], S: [3, 8], M: [4, 6], L: [1, 3] } } },
    { id: "chompa-raya", nombre: "Chompa Raya", marca: "Pilar", categoria: "Chompas", pref: "CHO", foto: "fotos/chompa-raya.jpg",
      colores: ["Crudo/Negro", "Beige", "Azul"],
      // Imagen: pastilla verde con el texto «Hay stock para reponer» (la de Adelle es ámbar). Mismo texto, mismo tono: ámbar.
      imagen: { estado: "reponer", stock: { XS: [0, 1], S: [1, 2], M: [0, 3], L: [0, 1] } } },
    { id: "blusa-emma", nombre: "Blusa Emma", marca: "Wayi", categoria: "Blusas", pref: "BLU", colores: ["Beige", "Negro", "Celeste"] },
    { id: "casaca-ximena", nombre: "Casaca Ximena", marca: "Pilar", categoria: "Casacas", pref: "CAS", colores: ["Azul", "Negro", "Beige"] },
    { id: "falda-renata", nombre: "Falda Renata", marca: "Jirish", categoria: "Faldas", pref: "FAL", colores: ["Beige", "Negro", "Vino"] },
    { id: "vestido-sofia", nombre: "Vestido Sofía", marca: "Wayi", categoria: "Vestidos", pref: "VES", colores: ["Negro", "Azul", "Oliva"] },
    { id: "pantalon-carla", nombre: "Pantalón Carla", marca: "Pilar", categoria: "Pantalones", pref: "PAN", colores: ["Arena", "Negro", "Gris"] },
    { id: "cardigan-lucia", nombre: "Cárdigan Lucía", marca: "Jirish", categoria: "Chompas", pref: "CAR", colores: ["Camel", "Gris", "Negro"] },
    { id: "enterizo-mara", nombre: "Enterizo Mara", marca: "Wayi", categoria: "Enterizos", pref: "ENT", colores: ["Negro", "Oliva", "Terracota"] },
    { id: "short-nayra", nombre: "Short Nayra", marca: "Pilar", categoria: "Shorts", pref: "SHO", colores: ["Blanco", "Celeste", "Arena"] },
    { id: "camisa-inti", nombre: "Camisa Inti", marca: "Jirish", categoria: "Camisas", pref: "CAM", colores: ["Blanco", "Celeste", "Rosa"] },
    { id: "top-kiara", nombre: "Top Kiara", marca: "Wayi", categoria: "Tops", pref: "TOK", colores: ["Blanco", "Negro", "Vino"] },
  ];

  const SEDES = [
    { id: "TRU", nombre: "Tienda TRU", meta: { seed: 2909, piso: 352, alm: 226, alertas: 12, imagen: true } },
    { id: "AQP", nombre: "Tienda AQP", meta: { seed: 1701, piso: 301, alm: 188, alertas: 9, imagen: false } },
    { id: "LIM", nombre: "Tienda LIM", meta: { seed: 4406, piso: 418, alm: 267, alertas: 15, imagen: false } },
  ];

  /* ── utilidades ── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function totalesDe(c) {
    let piso = 0, alm = 0;
    for (const t of TALLAS) { piso += c.stock[t][0]; alm += c.stock[t][1]; }
    return { piso, alm };
  }

  /* ── el estado de una prenda ──
     La imagen pinta tres estados que NO salen de una sola regla (dos prendas con las mismas cifras
     tienen pastilla distinta). Aquí la de la imagen se respeta como estado inicial (`estadoFijo`) y,
     apenas alguien toca el stock de esa prenda, manda esta regla, que sí es una función de las cifras:
       · sobrestock: 9 o más en el piso
       · reponer:    alguna talla sin nada en el piso y con algo en el almacén
       · balanceado: lo demás
     (La regla real del ERP —piso ≤ 4 es siempre «reponer», ADR de la política operativa— pintaría casi
     todas las tarjetas de «reponer»; ver la nota en el README.) */
  function regla(c) {
    if (totalesDe(c).piso >= 9) return "sobrestock";
    if (TALLAS.some((t) => c.stock[t][0] === 0 && c.stock[t][1] > 0)) return "reponer";
    return "balanceado";
  }
  const estadoDe = (c) => c.estadoFijo || regla(c);

  /* Cuánto subir a cada talla al pulsar «Reponer»: hasta 2 en el piso, sin pasarse de lo que hay en el almacén.
     La política de cantidad real todavía no existe en el ERP: este 2 es de la maqueta. */
  const OBJETIVO_PISO = 2;
  function sugerirReposicion(c) {
    const q = {};
    for (const t of TALLAS) {
      const [p, a] = c.stock[t];
      q[t] = p < OBJETIVO_PISO ? Math.min(a, OBJETIVO_PISO - p) : 0;
    }
    return q;
  }

  /* ── generación de una sede ── */
  function crearSede(sede) {
    const { seed, piso, alm, alertas, imagen } = sede.meta;
    const rnd = mulberry32(seed);
    const cards = [];
    const armarCard = (f, fi, color, ci) => ({
      id: f.id + "--" + slug(color), famId: f.id, nombre: f.nombre, marca: f.marca, categoria: f.categoria,
      color, hex: COLORES[color], foto: f.foto || null,
      codigo: f.pref + "-" + String(fi + 1).padStart(4, "0") + "-" + norm(color).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase(),
      stock: null, estadoFijo: null, clase: null, enCamino: 0, principal: !!f.imagen && ci === 0,
    });
    // Primero las seis de la imagen (en su orden), luego el resto de las 48.
    FAMILIAS.forEach((f, fi) => { if (f.imagen) cards.push(armarCard(f, fi, f.colores[0], 0)); });
    FAMILIAS.forEach((f, fi) => f.colores.forEach((color, ci) => { if (!(f.imagen && ci === 0)) cards.push(armarCard(f, fi, color, ci)); }));

    if (imagen) {
      cards.filter((c) => c.principal).forEach((c) => {
        const f = FAMILIAS.find((x) => x.id === c.famId);
        c.stock = Object.fromEntries(TALLAS.map((t) => [t, f.imagen.stock[t].slice()]));
        c.estadoFijo = f.imagen.estado;
      });
    }
    const generadas = cards.filter((c) => !c.stock);
    const alertasImagen = cards.filter((c) => c.estadoFijo && ESTADOS[c.estadoFijo].alerta).length;
    const alertasGen = Math.max(0, alertas - alertasImagen);
    const orden = generadas.map((c, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const nSobre = Math.round(alertasGen * 0.55);
    orden.forEach((idx, k) => { generadas[idx].clase = k < nSobre ? "sobrestock" : k < alertasGen ? "reponer" : "balanceado"; });

    const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    generadas.forEach((c) => {
      const sinPiso = c.clase === "reponer" ? (rnd() < 0.4 ? 2 : 1) : 0;
      const ceros = TALLAS.map((t) => [rnd(), t]).sort((a, b) => a[0] - b[0]).slice(0, sinPiso).map((x) => x[1]);
      c.stock = {};
      TALLAS.forEach((t) => {
        let p, a;
        if (c.clase === "balanceado") { p = entre(1, 2); a = rnd() < 0.3 ? 0 : entre(1, 3); }
        else if (c.clase === "reponer") { if (ceros.includes(t)) { p = 0; a = entre(1, 3); } else { p = entre(1, 2); a = entre(0, 2); } }
        else { p = entre(2, 4); a = entre(0, 4); }
        c.stock[t] = [p, a];
      });
      while (c.clase === "sobrestock" && totalesDe(c).piso < 9) c.stock[TALLAS[Math.floor(rnd() * 4)]][0]++;
    });

    // Calza las sumas de la sede con lo que dice su cabecera, sin cambiar la clase de ninguna prenda.
    const suma = (campo) => cards.reduce((n, c) => n + totalesDe(c)[campo], 0);
    [["piso", piso], ["alm", alm]].forEach(([campo, objetivo]) => {
      const i = campo === "piso" ? 0 : 1;
      let guard = 0;
      while (suma(campo) !== objetivo && guard++ < 40000) {
        const c = generadas[Math.floor(rnd() * generadas.length)];
        const t = TALLAS[Math.floor(rnd() * 4)];
        const d = objetivo > suma(campo) ? 1 : -1;
        const antes = c.stock[t][i];
        if (antes + d < 0) continue;
        c.stock[t][i] = antes + d;
        if (regla(c) !== c.clase) c.stock[t][i] = antes;
      }
    });
    cards.forEach((c) => { c.enCamino = rnd() < 0.16 ? entre(2, 6) : 0; });
    return { sede, cards };
  }

  w.DATOS = { TALLAS, ESTADOS, COLORES, FAMILIAS, SEDES, OBJETIVO_PISO, crearSede, totalesDe, estadoDe, regla, sugerirReposicion, norm, slug };
})(window);
