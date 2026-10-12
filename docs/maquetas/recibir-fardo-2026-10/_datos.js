/* ====================================================================
   DATOS INVENTADOS de las 3 maquetas de «Recibir mercadería»: un fardo que Compras despachó desde Lima a Tienda TRU
   (ADR-0362: un fardo trae varias órdenes de compra y varios proveedores; cada línea es CATEGORÍA + MARCA + CANTIDAD, nunca
   talla por talla), lo que de verdad viene adentro (prendas conocidas, con código de etiqueta, y prendas NUEVAS que todavía no
   existen en el catálogo), las causas de diferencia que elige la sede (anexo «faltantes-y-sobrantes» de ADR-0362) y los íconos.
   Los nombres de categoría, marcas y proveedores salen del seed del repo; las personas son inventadas.
   ==================================================================== */
window.RF = (function () {
  // Íconos de categoría POR PREFIJO (apps/web/lib/icono-categoria-reglas.ts, Felipe 2026-09-29). Trazo 1,5, sin relleno.
  const ICONOS_CAT = {
    CMS: ["M9 3.5 3.5 6.7 5 11l2.5-1.2v10.7h9V9.8L19 11l1.5-4.3L15 3.5", "m9 3.5 3 4.2 3-4.2", "M12 7.7v12.8", "M12 11h.01M12 14.5h.01M12 18h.01"],
    VES: ["M9 3 8.6 8.8l-1.4 2.8-2.6 8.9h14.8l-2.6-8.9-1.4-2.8L15 3", "M9 3c.2 2.6 1.4 4 3 4s2.8-1.4 3-4", "M7.2 11.6h9.6"],
    FAL: ["M7.6 4h8.8l3.9 16H3.7z", "M7.3 7.6h9.4", "M10.5 7.6 9 20M13.5 7.6 15 20"],
    PAN: ["M7 3h10l3 18h-6.6L12 9.6 10.6 21H4z", "M7.2 6.2h9.6", "M12 6.2v3.4"],
    CAS: ["M8.6 3.8 4.4 6 3 17.6l3.6.6L7.5 11v9.5h9V11l.9 7.2 3.6-.6L19.6 6l-4.2-2.2", "M8.6 3.8v2.4L12 8l3.4-1.8V3.8", "M8.6 3.8c1-.9 2.2-1.3 3.4-1.3s2.4.4 3.4 1.3", "M12 8v12.5", "M7.5 17.6h9"],
  };
  // Lo que cada categoría sugiere (ADR-0290: el ejemplo sigue a lo elegido) y sus tallas habituales.
  const CATS = {
    CMS: { nombre: "Blusas", art: "las", una: "blusa", varias: "blusas", tallas: ["XS", "S", "M", "L", "XL"], ej: "Blusa manga globo" },
    VES: { nombre: "Vestidos", art: "los", una: "vestido", varias: "vestidos", tallas: ["XS", "S", "M", "L", "XL"], ej: "Vestido midi estampado" },
    PAN: { nombre: "Pantalones", art: "los", una: "pantalón", varias: "pantalones", tallas: ["26", "28", "30", "32", "34"], ej: "Pantalón wide leg" },
    CAS: { nombre: "Casacas", art: "las", una: "casaca", varias: "casacas", tallas: ["XS", "S", "M", "L", "XL"], ej: "Casaca acolchada con capucha" },
    FAL: { nombre: "Faldas", art: "las", una: "falda", varias: "faldas", tallas: ["XS", "S", "M", "L", "XL"], ej: "Falda plisada" },
  };
  const COLORES = [
    { n: "Negro", hex: "#1a1a18" }, { n: "Blanco", hex: "#f5f0e8" }, { n: "Beige", hex: "#d8c3a5" }, { n: "Azul marino", hex: "#1f3a5f" },
    { n: "Rosa", hex: "#e8a5b0" }, { n: "Camel", hex: "#b0763a" }, { n: "Gris", hex: "#8a8a85" }, { n: "Verde oliva", hex: "#6b7a3a" },
  ];
  const PROVEEDORES = [
    { id: "cds", nombre: "Confecciones del Sur EIRL", marcas: ["Dulce"] },
    { id: "tan", nombre: "Textiles Andina SAC", marcas: ["Andina Denim"] },
    { id: "mgi", nombre: "Moda Gamarra Import SAC", marcas: ["Nórdica"] },
  ];
  const PERSONAS = [
    { id: "mari", nombre: "Mariana Quispe", rol: "Almacén · TRU", tono: "var(--verde)" },
    { id: "lucia", nombre: "Lucía Paredes", rol: "Encargada de sede", tono: "var(--pizarra)" },
    { id: "rosa", nombre: "Rosa Delgado", rol: "Compras · Lima", tono: "var(--taupe)" },
  ];
  const SEDE = "Tienda TRU";

  // El fardo en camino (lo que Compras dijo que venía). `dijeron` es por línea; el total es 120.
  const FARDO = {
    codigo: "F-0007", guia: "T001-000342", desde: "Lima · Compras", por: "Rosa Delgado", cuando: "ayer 17:20", llega: "hoy",
    ordenes: ["OC-000129", "OC-000131", "OC-000134"],
    lineas: [
      { id: "blu", cat: "CMS", marca: "Dulce", prov: "cds", dijeron: 40, desc: "Blusas manga globo y clásicas" },
      { id: "ves", cat: "VES", marca: "Dulce", prov: "cds", dijeron: 24, desc: "Vestidos midi" },
      { id: "pan", cat: "PAN", marca: "Andina Denim", prov: "tan", dijeron: 30, desc: "Pantalones wide leg y capri" },
      { id: "cas", cat: "CAS", marca: "Nórdica", prov: "mgi", dijeron: 16, desc: "Casacas acolchadas" },
      { id: "fal", cat: "FAL", marca: "Nórdica", prov: "mgi", dijeron: 10, desc: "Faldas plisadas" },
    ],
  };
  // El caso SIN aviso (hoy: un WhatsApp). Solo Confecciones del Sur; dijeron «64» por mensaje.
  const SIN_AVISO = { prov: "cds", dijeronTotal: 64, mensaje: "«Les mandé 64: 40 blusas y 24 vestidos, llega mañana» · WhatsApp, ayer 18:02" };

  // Los modelos NUEVOS que vienen adentro y todavía no existen en el catálogo (la pistola no los encuentra).
  const NUEVOS = {
    "blu-globo": { linea: "blu", desc: "Blusa manga globo", color: "Rosa", hex: "#e8a5b0", tallas: { S: 3, M: 3 }, cant: 6 },
    "cas-acolchada": { linea: "cas", desc: "Casaca acolchada con capucha", color: "Beige", hex: "#d8c3a5", tallas: { S: 5, M: 6, L: 5 }, cant: 16 },
  };
  // Lo que de verdad hay en la caja, por línea: prendas conocidas (código de etiqueta CAYLA) y las nuevas (código del proveedor).
  // Faltan 2 pantalones (dijeron 30, vienen 28). El orden es el de «sacar de la caja»: las nuevas asoman a mitad del montón.
  const CONTENIDO = {
    blu: [
      { codigo: "CMS-0012-M-NEG", nombre: "Blusa Aurora", talla: "M", color: "Negro", hex: "#1a1a18", n: 6 },
      { codigo: "CMS-0012-L-NEG", nombre: "Blusa Aurora", talla: "L", color: "Negro", hex: "#1a1a18", n: 6 },
      { nuevo: "blu-globo", codigoProv: "7751234500018", talla: "S", n: 3 },
      { codigo: "CMS-0021-S-BLA", nombre: "Blusa Lía", talla: "S", color: "Blanco", hex: "#f5f0e8", n: 6 },
      { codigo: "CMS-0021-M-BLA", nombre: "Blusa Lía", talla: "M", color: "Blanco", hex: "#f5f0e8", n: 6 },
      { nuevo: "blu-globo", codigoProv: "7751234500025", talla: "M", n: 3 },
      { codigo: "CMS-0033-M-BEI", nombre: "Blusa Nina", talla: "M", color: "Beige", hex: "#d8c3a5", n: 5 },
      { codigo: "CMS-0033-L-BEI", nombre: "Blusa Nina", talla: "L", color: "Beige", hex: "#d8c3a5", n: 5 },
    ],
    ves: [
      { codigo: "VES-0013-S-AZM", nombre: "Vestido Summer", talla: "S", color: "Azul marino", hex: "#1f3a5f", n: 4 },
      { codigo: "VES-0013-M-AZM", nombre: "Vestido Summer", talla: "M", color: "Azul marino", hex: "#1f3a5f", n: 4 },
      { codigo: "VES-0013-L-AZM", nombre: "Vestido Summer", talla: "L", color: "Azul marino", hex: "#1f3a5f", n: 4 },
      { codigo: "VES-0020-S-NEG", nombre: "Vestido Olivia", talla: "S", color: "Negro", hex: "#1a1a18", n: 4 },
      { codigo: "VES-0020-M-NEG", nombre: "Vestido Olivia", talla: "M", color: "Negro", hex: "#1a1a18", n: 4 },
      { codigo: "VES-0020-L-NEG", nombre: "Vestido Olivia", talla: "L", color: "Negro", hex: "#1a1a18", n: 4 },
    ],
    pan: [
      { codigo: "PAN-0008-28-AZM", nombre: "Pantalón Capri", talla: "28", color: "Azul marino", hex: "#1f3a5f", n: 5 },
      { codigo: "PAN-0008-30-AZM", nombre: "Pantalón Capri", talla: "30", color: "Azul marino", hex: "#1f3a5f", n: 5 },
      { codigo: "PAN-0008-32-AZM", nombre: "Pantalón Capri", talla: "32", color: "Azul marino", hex: "#1f3a5f", n: 4 },
      { codigo: "PAN-0015-28-NEG", nombre: "Pantalón Wide", talla: "28", color: "Negro", hex: "#1a1a18", n: 5 },
      { codigo: "PAN-0015-30-NEG", nombre: "Pantalón Wide", talla: "30", color: "Negro", hex: "#1a1a18", n: 5 },
      { codigo: "PAN-0015-32-NEG", nombre: "Pantalón Wide", talla: "32", color: "Negro", hex: "#1a1a18", n: 4 },
    ],
    cas: [
      { nuevo: "cas-acolchada", codigoProv: "7759876500011", talla: "S", n: 5 },
      { nuevo: "cas-acolchada", codigoProv: "7759876500028", talla: "M", n: 6 },
      { nuevo: "cas-acolchada", codigoProv: "7759876500035", talla: "L", n: 5 },
    ],
    fal: [
      { codigo: "FAL-0007-S-CAM", nombre: "Falda Plisada", talla: "S", color: "Camel", hex: "#b0763a", n: 3 },
      { codigo: "FAL-0007-M-CAM", nombre: "Falda Plisada", talla: "M", color: "Camel", hex: "#b0763a", n: 4 },
      { codigo: "FAL-0007-L-CAM", nombre: "Falda Plisada", talla: "L", color: "Camel", hex: "#b0763a", n: 3 },
    ],
  };
  // Las causas que elige LA SEDE (nunca ve soles; Compras decide después qué pasa con la plata). Anexo de ADR-0362.
  const CAUSAS = {
    faltante: [
      { clave: "proveedor", texto: "No vino del proveedor", luego: "Compras se lo reclama al proveedor" },
      { clave: "separacion", texto: "Lima lo mandó a otra sede", luego: "Se avisa a Lima; la otra sede lo recibe donde está" },
      { clave: "transporte", texto: "Se perdió en el camino", luego: "Compras y la encargada deciden si se reclama" },
      { clave: "danada", texto: "Llegó dañada", luego: "Entra a cuarentena, no se vende" },
    ],
    sobrante: [
      { clave: "proveedor", texto: "Vino de más", luego: "Compras decide: regalo, se paga o se descuenta" },
      { clave: "separacion", texto: "Era de otra sede", luego: "Se queda aquí; se avisa a Lima" },
      { clave: "no_pedida", texto: "Llegó algo que no se pidió", luego: "Compras lo ve con el proveedor" },
    ],
  };

  // El catálogo (prendas conocidas), deducido del contenido: lo que el buscador encuentra por nombre.
  const CATALOGO = [];
  for (const [linea, filas] of Object.entries(CONTENIDO)) for (const f of filas) if (f.codigo) CATALOGO.push({ ...f, linea, cat: FARDO.lineas.find((l) => l.id === linea).cat, marca: FARDO.lineas.find((l) => l.id === linea).marca });
  // Una prenda conocida que NO viene en este fardo (para que el buscador también encuentre lo que no está en la caja).
  CATALOGO.push({ codigo: "CMS-0040-M-AZM", nombre: "Blusa Marina", talla: "M", color: "Azul marino", hex: "#1f3a5f", n: 0, linea: "blu", cat: "CMS", marca: "Dulce" });

  /** Las unidades de una línea en el orden en que salen de la caja. Cada una es {codigo|nuevo, ...}. */
  function unidades(lineaId) {
    const filas = CONTENIDO[lineaId] || [];
    const u = [];
    for (const f of filas) for (let i = 0; i < f.n; i++) u.push({ ...f, n: undefined });
    return u;
  }
  function realDe(lineaId) { return unidades(lineaId).length; }

  // ---------- íconos de interfaz (trazo, estilo lucide) ----------
  const P = {
    check: ["M20 6 9 17l-5-5"], plus: ["M12 5v14M5 12h14"], minus: ["M5 12h14"], x: ["M18 6 6 18M6 6l12 12"],
    buscar: ["M21 21l-4.3-4.3", "C11 11 8"], etiqueta: ["M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z", "C7.5 7.5 .6"],
    caja: ["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", "M3.3 7 12 12l8.7-5", "M12 22V12", "M16.5 9.4 7.55 4.24"],
    scan: ["M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M8 7v10", "M12 7v10", "M17 7v10"],
    alerta: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
    der: ["M5 12h14", "m12 5 7 7-7 7"], izq: ["m12 19-7-7 7-7", "M19 12H5"], abajo: ["m6 9 6 6 6-6"],
    impresora: ["M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 9V3h12v6", "R6 14 12 8 1"],
    chispa: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", "M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"],
    persona: ["C12 8 4", "M4 21a8 8 0 0 1 16 0"], reloj: ["C12 12 9", "M12 7v5l3 2"],
    nota: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M8 13h8", "M8 17h8"],
    repetir: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"], deshacer: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
    mensaje: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z"],
    camion: ["M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", "M15 18H9", "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14", "C17 18 2", "C7 18 2"],
    balanza: ["m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z", "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z", "M7 21h10", "M12 3v18", "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"],
    tienda: ["m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7", "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4", "M2 7h20"],
    play: ["m6 3 14 9-14 9V3z"], percha: ["M11.3 3a1.3 1.3 0 102 1c0 .5-.3.9-.7 1.1v1.3L4 13.5a1.5 1.5 0 00-.7 1.3V16h17.4v-1.2a1.5 1.5 0 00-.7-1.3l-7.7-6.1V5.4"],
    info: ["C12 12 9", "M12 16v-4", "M12 8h.01"], lapiz: ["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"],
    montones: ["m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z", "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65", "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"],
    teclado: ["R2 6 20 12 2", "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"],
    ojo: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "C12 12 3"],
    campana: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
    lista: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
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
    const f = ICONOS_CAT[prefijo] || [P.percha[0]];
    return `<svg class="ic cat ${clase}" viewBox="0 0 24 24" aria-hidden="true">${f.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  }
  /** La miniatura de una prenda sin foto: el ícono de su categoría sobre su color (ADR-0333). Texto claro u oscuro según el color. */
  function mini(prefijo, hex, clase = "") {
    return `<span class="mini ${clase}" style="--c:${hex}" data-oscura="${esOscuro(hex) ? "si" : "no"}">${iconoCat(prefijo)}</span>`;
  }
  function esOscuro(hex) {
    const h = (hex || "#888").replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.6;
  }
  function iniciales(nombre) { return nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase(); }
  function avatar(p, px = 30) { return `<span class="av" style="--av:${px}px;--tono:${p.tono}" title="${esc(p.nombre)}">${iniciales(p.nombre)}</span>`; }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function prov(id) { return PROVEEDORES.find((p) => p.id === id); }
  function clave(t) { return String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
  /** Lo que el buscador encuentra por nombre, código o color; las de la marca del montón primero (como `sugerirPrendas`). */
  function buscar(texto, marca) {
    const k = clave(texto); if (k.length < 2) return [];
    const todas = CATALOGO.filter((p) => clave(`${p.nombre} ${p.codigo} ${p.color} ${p.talla}`).includes(k));
    const suyas = todas.filter((p) => clave(p.marca) === clave(marca || "")), otras = todas.filter((p) => clave(p.marca) !== clave(marca || ""));
    return [...suyas, ...otras].slice(0, 6);
  }
  function plural(n, una, varias) { return `${n} ${n === 1 ? una : varias}`; }

  return { CATS, COLORES, PROVEEDORES, PERSONAS, SEDE, FARDO, SIN_AVISO, NUEVOS, CONTENIDO, CAUSAS, CATALOGO, unidades, realDe, icono, iconoCat, mini, esOscuro, avatar, esc, prov, clave, buscar, plural };
})();
