/* ====================================================================
   DATOS INVENTADOS de las 3 maquetas de «Prendas de una etiqueta» con escaneo (2026-10-21).
   Un catálogo chico (32 productos, ~120 tallas y colores) con el MISMO formato de código que imprime la etiqueta de CAYLA
   (`CMS-0011-ROS-M`: prefijo-número-color-talla; el QR y el código de barras llevan ese texto, `lib/escaner-qr.test.ts`), tres
   etiquetas de campaña para probar (una que regala, una que rebaja y una informativa) y los íconos. Nada de esto es un dato real.
   ==================================================================== */
window.EQD = (function () {
  // Íconos de categoría POR PREFIJO (apps/web/lib/icono-categoria-reglas.ts). Trazo 1,5, sin relleno.
  const ICONOS_CAT = {
    CMS: ["M9 3.5 3.5 6.7 5 11l2.5-1.2v10.7h9V9.8L19 11l1.5-4.3L15 3.5", "m9 3.5 3 4.2 3-4.2", "M12 7.7v12.8", "M12 11h.01M12 14.5h.01M12 18h.01"],
    VES: ["M9 3 8.6 8.8l-1.4 2.8-2.6 8.9h14.8l-2.6-8.9-1.4-2.8L15 3", "M9 3c.2 2.6 1.4 4 3 4s2.8-1.4 3-4", "M7.2 11.6h9.6"],
    FAL: ["M7.6 4h8.8l3.9 16H3.7z", "M7.3 7.6h9.4", "M10.5 7.6 9 20M13.5 7.6 15 20"],
    JEA: ["M7 3h10l3 18h-6.6L12 9.6 10.6 21H4z", "M7.2 6.2h9.6", "M12 6.2v3.4"],
    CAS: ["M8.6 3.8 4.4 6 3 17.6l3.6.6L7.5 11v9.5h9V11l.9 7.2 3.6-.6L19.6 6l-4.2-2.2", "M8.6 3.8v2.4L12 8l3.4-1.8V3.8", "M12 8v12.5", "M7.5 17.6h9"],
    POL: ["M8.6 3.5 3 6.6l2 4.4 2.5-1.2V20.5h9V9.8L19 11l2-4.4-5.6-3.1a3.6 3.6 0 0 1-6.8 0z"],
    TOP: ["M8.6 3 8 8.2l-2.5 2.4V16h13v-5.4L16 8.2 15.4 3", "M8.6 3c.2 3.2 1.6 5 3.4 5s3.2-1.8 3.4-5"],
    CMP: ["M9 3.7 4.4 6 3 17.6l3.4.6 1.1-6.4v8.7h9v-8.7l1.1 6.4 3.4-.6L19.6 6 15 3.7c-.4 1.8-1.6 2.8-3 2.8s-2.6-1-3-2.8z", "M7.5 18h9", "M10.4 9.6v5M12 9.6v5M13.6 9.6v5"],
    ACC: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M18.5 16.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"],
    ANL: ["C12 15 6", "M9.5 3h5l1.5 3-4 3-4-3z"],
  };
  const CATS = {
    CMS: "Blusas", VES: "Vestidos", FAL: "Faldas", JEA: "Jeans", CAS: "Casacas", POL: "Polos", TOP: "Tops", CMP: "Chompas", ACC: "Accesorios de moda", ANL: "Anillos",
  };
  const COL = {
    NEG: { n: "Negro", hex: "#1a1a18" }, BLA: { n: "Blanco", hex: "#f5f0e8" }, BEI: { n: "Beige", hex: "#d8c3a5" }, AZU: { n: "Azul", hex: "#2f4f7a" },
    ROS: { n: "Rosa", hex: "#e8a5b0" }, CAM: { n: "Camel", hex: "#b0763a" }, GRI: { n: "Gris", hex: "#8a8a85" }, OLI: { n: "Verde oliva", hex: "#6b7a3a" },
    VIN: { n: "Vino", hex: "#6e2433" }, CEL: { n: "Celeste", hex: "#9cc3df" }, MOS: { n: "Mostaza", hex: "#c99a2e" }, PLA: { n: "Plateado", hex: "#c9c9c4" },
    DOR: { n: "Dorado", hex: "#c8a44d" }, LIL: { n: "Lila", hex: "#b7a0d0" }, STD: { n: "Estándar", hex: "#d8c3a5" },
  };
  // [nombre, prefijo, número, precio, colores, tallas]
  const FILAS = [
    ["Adelle Wide Leg", "JEA", 6, 109.9, ["AZU", "NEG"], ["26", "28", "30"]],
    ["Alas de Hada", "ACC", 23, 39.9, ["OLI"], ["STD"]],
    ["Anillo para Bufanda", "ACC", 18, 8.9, ["DOR", "PLA"], ["STD"]],
    ["Anillos Luna", "ANL", 1, 25.9, ["PLA", "DOR"], ["6", "7", "8"]],
    ["Antifaz Encaje", "ACC", 20, 9.9, ["NEG", "BLA"], ["STD"]],
    ["Aretes Calavera", "ACC", 32, 19.9, ["PLA"], ["STD"]],
    ["Blusa Aurora", "CMS", 12, 79.9, ["NEG", "BLA"], ["S", "M", "L"]],
    ["Blusa Lía", "CMS", 21, 69.9, ["BLA", "CEL"], ["S", "M", "L"]],
    ["Blusa Nina", "CMS", 33, 74.9, ["BEI"], ["XS", "S", "M", "L"]],
    ["Blusa Paz manga globo", "CMS", 40, 84.9, ["ROS", "LIL"], ["S", "M"]],
    ["Casaca Bruma acolchada", "CAS", 7, 189.9, ["BEI", "NEG"], ["S", "M", "L"]],
    ["Casaca Nórdica", "CAS", 11, 219.9, ["OLI"], ["M", "L"]],
    ["Chompa Cuello Alto", "CMP", 4, 119.9, ["CAM", "GRI", "VIN"], ["S", "M", "L"]],
    ["Chompa Trenza", "CMP", 9, 129.9, ["BLA"], ["S", "M"]],
    ["Falda Plisada Vera", "FAL", 14, 89.9, ["NEG", "MOS"], ["XS", "S", "M"]],
    ["Falda Lino Sol", "FAL", 16, 79.9, ["BEI"], ["S", "M", "L"]],
    ["Jean Mom Dalia", "JEA", 10, 119.9, ["AZU", "CEL"], ["26", "28", "30", "32"]],
    ["Jean Recto Inés", "JEA", 12, 114.9, ["NEG"], ["28", "30"]],
    ["Polo Básico Alma", "POL", 3, 39.9, ["BLA", "NEG", "GRI"], ["S", "M", "L"]],
    ["Polo Rayas Mar", "POL", 8, 44.9, ["AZU"], ["S", "M"]],
    ["Top Tiras Gala", "TOP", 5, 49.9, ["NEG", "VIN"], ["XS", "S", "M"]],
    ["Top Cruzado Mía", "TOP", 9, 54.9, ["ROS"], ["S", "M"]],
    ["Vestido Midi Flora", "VES", 18, 149.9, ["VIN", "OLI"], ["S", "M", "L"]],
    ["Vestido Camisero Río", "VES", 22, 139.9, ["CEL"], ["S", "M"]],
    ["Vestido Satén Noa", "VES", 25, 169.9, ["NEG", "CAM"], ["XS", "S", "M"]],
    ["Bufanda Tejida", "ACC", 41, 34.9, ["GRI", "CAM"], ["STD"]],
    ["Cinturón Trenzado", "ACC", 44, 29.9, ["CAM", "NEG"], ["STD"]],
    ["Collar Perla", "ACC", 47, 24.9, ["BLA"], ["STD"]],
    ["Anillo Sello", "ANL", 4, 32.9, ["DOR"], ["6", "7"]],
    ["Casaca Jean Lola", "CAS", 15, 159.9, ["AZU"], ["S", "M", "L"]],
    ["Blusa Encaje Mora", "CMS", 47, 89.9, ["NEG", "BLA"], ["S", "M"]],
    ["Vestido Tejido Íris", "VES", 30, 179.9, ["GRI"], ["S", "M"]],
  ];

  let idv = 0;
  const PRODUCTOS = FILAS.map(([referencia, pre, num, precio, colores, tallas], i) => {
    const codigo = `${pre}-${String(num).padStart(4, "0")}`;
    const variantes = [];
    for (const c of colores) for (const t of tallas) {
      const k = `v${++idv}`;
      variantes.push({ id: k, sku: `${codigo}-${c}-${t}`, talla: t === "STD" ? null : t, color: COL[c].n, colorHex: COL[c].hex, precio, costo: Math.round(precio * 0.44 * 10) / 10 });
    }
    return { id: `p${i + 1}`, referencia, codigo, cat: pre, categoria: CATS[pre], colorHex: COL[colores[0]].hex, variantes };
  });
  // Una talla que ya no se vende (desactivada): se puede escanear su etiqueta vieja, pero no está en la lista.
  const FUERA_DE_VENTA = [{ sku: "VES-0018-VIN-XL", referencia: "Vestido Midi Flora", detalle: "Vino · XL", colorHex: COL.VIN.hex, cat: "VES" }];

  const sku = (s) => PRODUCTOS.flatMap((p) => p.variantes).find((v) => v.sku === s)?.id;
  const ETIQUETAS = {
    sorteo: {
      clave: "sorteo", nombre: "Sorteo", descuentoPct: 100, vigenteDesde: "2026-10-21", vigenteHasta: "2026-10-31", categorias: [],
      iniciales: [sku("CMS-0012-NEG-M")],
    },
    black: {
      clave: "black", nombre: "Black Friday", descuentoPct: 30, vigenteDesde: "2026-11-27", vigenteHasta: "2026-11-30", categorias: ["ANL"],
      iniciales: [sku("JEA-0010-AZU-28"), sku("JEA-0010-AZU-30"), sku("CAS-0007-BEI-M"), sku("CAS-0007-BEI-L"), sku("VES-0025-NEG-S")],
    },
    estreno: {
      clave: "estreno", nombre: "Estreno", descuentoPct: null, vigenteDesde: null, vigenteHasta: null, categorias: [],
      iniciales: ["CMS-0040-ROS-S", "CMS-0040-ROS-M", "CMS-0040-LIL-S", "CAS-0011-OLI-M", "CAS-0011-OLI-L", "VES-0030-GRI-S", "VES-0030-GRI-M", "CMS-0047-NEG-S", "CMS-0047-NEG-M", "CMS-0047-BLA-S", "CMS-0047-BLA-M", "CAS-0015-AZU-M", "CAS-0015-AZU-L"].map(sku),
    },
  };
  // Lo que la demo «escanea» (y el botón «Simular lectura» elige de aquí): prendas sueltas, una repetida, una por categoría,
  // una que ya no se vende y un código que no es de CAYLA.
  const LECTURAS_DEMO = ["VES-0018-OLI-M", "JEA-0006-AZU-28", "CMS-0021-CEL-S", "VES-0018-OLI-M", "ACC-0023-OLI-STD", "CMP-0004-CAM-M", "VES-0018-VIN-XL", "7750885001237", "TOP-0005-NEG-S"];

  // ---------- íconos de interfaz (trazo, estilo lucide) ----------
  const P = {
    check: ["M20 6 9 17l-5-5"], plus: ["M12 5v14M5 12h14"], minus: ["M5 12h14"], x: ["M18 6 6 18M6 6l12 12"],
    buscar: ["M21 21l-4.3-4.3", "C11 11 8"],
    etiqueta: ["M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z", "C7.5 7.5 .6"],
    scan: ["M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M7 12h10"],
    qr: ["R3 3 7 7 1", "R14 3 7 7 1", "R3 14 7 7 1", "M14 14h3v3h-3z", "M20 14v.01", "M14 20h.01", "M17 17h4v4h-4", "M6 6h.01M17 6h.01M6 17h.01"],
    camara: ["M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z", "C12 13 3"],
    pistola: ["M3 6h11l3 4v2H9l-1.5 7h-3L6 12H3z", "M17 8h4", "M17 11h3", "M17 5h3"],
    linterna: ["M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z", "M6 6h12", "M12 12v.01"],
    alerta: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
    der: ["M5 12h14", "m12 5 7 7-7 7"], izq: ["m12 19-7-7 7-7", "M19 12H5"], abajo: ["m6 9 6 6 6-6"], derChev: ["m9 18 6-6-6-6"],
    impresora: ["M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 9V3h12v6", "R6 14 12 8 1"],
    chispa: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"],
    info: ["C12 12 9", "M12 16v-4", "M12 8h.01"], deshacer: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
    repetir: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"], play: ["m6 3 14 9-14 9V3z"],
    percha: ["M11.3 3a1.3 1.3 0 102 1c0 .5-.3.9-.7 1.1v1.3L4 13.5a1.5 1.5 0 00-.7 1.3V16h17.4v-1.2a1.5 1.5 0 00-.7-1.3l-7.7-6.1V5.4"],
    camisa: ["M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"],
    embudoX: ["M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348", "M16 6l6 6", "M22 6l-6 6"],
    lista: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
    capas: ["m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z", "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65", "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"],
    regalo: ["R3 8 18 4 1", "M12 8v13", "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7", "M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"],
    teclado: ["R2 6 20 12 2", "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"],
    persona: ["C12 8 4", "M4 21a8 8 0 0 1 16 0"],
  };
  function forma(s) {
    if (s[0] === "C") { const [cx, cy, r] = s.slice(1).trim().split(" "); return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`; }
    if (s[0] === "R") { const [x, y, w, h, rx] = s.slice(1).trim().split(" "); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx || 0}"/>`; }
    return `<path d="${s}"/>`;
  }
  function icono(nombre, clase = "") {
    const f = P[nombre]; if (!f) return "";
    return `<svg class="ic ${clase}" viewBox="0 0 24 24" aria-hidden="true">${f.map(forma).join("")}</svg>`;
  }
  function iconoCat(prefijo, clase = "") {
    const f = ICONOS_CAT[prefijo] || P.percha;
    return `<svg class="ic cat ${clase}" viewBox="0 0 24 24" aria-hidden="true">${f.map(forma).join("")}</svg>`;
  }
  function esOscuro(hex) {
    const h = hex.replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 150;
  }
  /** La prenda sin foto (ADR-0333): el ícono de su categoría sobre su color. El color es dato: no cambia con el tema. */
  function mini(prefijo, hex, clase = "") {
    return `<span class="mini ${clase}" data-color-dato style="--c:${hex}" data-oscura="${esOscuro(hex) ? "si" : "no"}">${iconoCat(prefijo)}</span>`;
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  const soles = (n) => "S/ " + (Math.round(n * 100) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plural = (n, una, varias) => `${n} ${n === 1 ? una : varias}`;

  return { PRODUCTOS, FUERA_DE_VENTA, ETIQUETAS, LECTURAS_DEMO, CATS, icono, iconoCat, mini, esc, soles, plural };
})();
