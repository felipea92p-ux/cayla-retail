/* ====================================================================
   DATOS DE EJEMPLO — «Vestido Summer» (VES-0013), la prenda de la captura de Felipe (2026-10-06).
   Inventados pero con la forma REAL de lo que guarda la base:
     · Cada evento es UN guardado (las filas de `historial_producto_cambios` que comparten `created_at`, como ya agrupa
       Actividad: 20261002234500). Un precio cambiado en 5 variantes es UN evento, no cinco filas.
     · `guarda: "hoy"`  → la base ya lo anota (precio, costo, nombre, descripción, categoría, temporada, marca, proveedor,
                          corrección de color o talla, código, estado, fotos subidas desde Existencias; el alta, en `producto_origen`).
       `guarda: "falta"` → la base NO lo anota hoy y necesita una migración: etiquetas (`variante_etiquetas` no tiene
                          disparador), un color o una talla NUEVOS (el disparador es solo AFTER UPDATE), las fotos que se cambian
                          desde la ficha, el tejido y el patrón.
     · `sinFirmaHoy: true` → en producción esa edición quedó SIN persona: Editar producto es una acción «soltada» del combo
                          (`acciones_sin_responsable.producto_confirmar_cambios`) y desde una terminal `fn_actor_persona_id(true)`
                          devuelve null. Medido el 2026-10-06: los 40 cambios de precio guardados no tienen a nadie anotado.
   ==================================================================== */
window.HP = (function () {
  const HOY = "2026-10-06";

  const personas = {
    felipe: { id: "felipe", nombre: "Felipe Alvarez", corto: "Felipe", ini: "FA", rol: "Líder", sede: "Taller Lima", tono: "var(--taupe)" },
    lucia: { id: "lucia", nombre: "Lucía Paredes", corto: "Lucía", ini: "LP", rol: "Encargada de sede", sede: "Tienda Trujillo", tono: "var(--pizarra)" },
    rosa: { id: "rosa", nombre: "Rosa Mamani", corto: "Rosa", ini: "RM", rol: "Integrante", sede: "Tienda Trujillo", tono: "var(--verde)" },
  };

  // El color de una prenda es DATO (ADR-0336): no cambia con el tema. `oscuro`: si el ícono va en crema o en tinta encima.
  const colores = {
    Cereza: { nombre: "Cereza", hex: "#8e1f2f", oscuro: true },
    Marfil: { nombre: "Marfil", hex: "#ece3cc", oscuro: false },
    Crudo: { nombre: "Crudo", hex: "#efe9df", oscuro: false },
    Crema: { nombre: "Crema", hex: "#f8f0dc", oscuro: false },
    Marrón: { nombre: "Marrón", hex: "#6b4a33", oscuro: true },
    Turquesa: { nombre: "Turquesa", hex: "#2bb5c8", oscuro: false },
  };

  // Familias = los filtros. El tono sale de los tokens; el rojo (acento sagrado) solo marca el nacimiento.
  const familias = {
    precio: { id: "precio", nombre: "Precio", tono: "var(--ambar)", icono: "billete" },
    variantes: { id: "variantes", nombre: "Colores y tallas", tono: "var(--pizarra)", icono: "paleta" },
    etiquetas: { id: "etiquetas", nombre: "Etiquetas", tono: "var(--taupe)", icono: "etiqueta" },
    ficha: { id: "ficha", nombre: "Ficha", tono: "var(--verde)", icono: "ficha" },
    fotos: { id: "fotos", nombre: "Fotos", tono: "var(--t75)", icono: "imagen" },
    alta: { id: "alta", nombre: "Nació", tono: "var(--rojo)", icono: "brote" },
  };
  const ORDEN_FAMILIAS = ["precio", "variantes", "etiquetas", "ficha", "fotos"];

  // Cronológico (el más viejo primero). Las pantallas lo dan vuelta.
  const eventos = [
    { id: "e1", t: "2026-09-18T11:02", quien: "felipe", donde: "Taller Lima", fam: "alta", guarda: "hoy",
      titulo: "creó la prenda",
      cambios: [{ k: "alta", nombre: "Vestido Verano", categoria: "Vestidos", colores: ["Cereza", "Marfil", "Marrón"], tallas: ["Estándar"], precio: 119, stock: 15 }] },
    { id: "e2", t: "2026-09-18T11:20", quien: "felipe", donde: "Taller Lima", fam: "fotos", guarda: "falta",
      titulo: "agregó 2 fotos",
      cambios: [{ k: "foto+", colores: ["Cereza", "Marfil"] }] },
    { id: "e3", t: "2026-09-22T09:45", quien: "lucia", donde: "Tienda Trujillo", fam: "etiquetas", guarda: "falta",
      titulo: "puso la etiqueta «Nuevo»",
      cambios: [{ k: "etq+", nombre: "Nuevo", alcance: "en las 3 variantes" }] },
    { id: "e4", t: "2026-09-28T17:30", quien: "felipe", donde: "Taller Lima", fam: "ficha", guarda: "hoy", origen: "Productos ▸ Asignar temporada",
      titulo: "le asignó temporada",
      cambios: [{ k: "ref", campo: "Temporada", antes: "Sin temporada", despues: "Primavera-Verano" }] },
    { id: "e5", t: "2026-10-01T10:12", quien: "felipe", donde: "Taller Lima", fam: "variantes", guarda: "falta",
      titulo: "agregó 2 colores",
      cambios: [{ k: "col+", colores: ["Crema", "Turquesa"], detalle: "talla Estándar · S/ 119.00 · 4 prendas" }] },
    { id: "e6", t: "2026-10-02T12:40", quien: "rosa", donde: "Tienda Trujillo", fam: "variantes", guarda: "hoy", sinFirmaHoy: true,
      titulo: "corrigió un color",
      cambios: [{ k: "col~", antes: "Marfil", despues: "Crudo" }] },
    { id: "e7", t: "2026-10-02T18:05", quien: "rosa", donde: "Tienda Trujillo", fam: "fotos", guarda: "hoy", origen: "Existencias ▸ Fotos que faltan",
      titulo: "subió la foto de Marrón",
      cambios: [{ k: "foto+", colores: ["Marrón"] }] },
    { id: "e8", t: "2026-10-03T15:29", quien: "lucia", donde: "Tienda Trujillo", fam: "precio", guarda: "hoy", sinFirmaHoy: true,
      titulo: "editó precio y descripción",
      cambios: [
        { k: "precio", antes: 119, despues: 109, alcance: "en las 5 variantes" },
        { k: "texto", campo: "Descripción", antes: "Vestido largo de punto", despues: "largo, con broche en la cadera" },
      ] },
    { id: "e9", t: "2026-10-04T11:15", quien: "lucia", donde: "Tienda Trujillo", fam: "etiquetas", guarda: "falta",
      titulo: "cambió sus etiquetas",
      cambios: [{ k: "etq-", nombre: "Nuevo" }, { k: "etq+", nombre: "Oferta", alcance: "en las 5 variantes" }] },
    { id: "e10", t: "2026-10-05T16:56", quien: "felipe", donde: "Taller Lima", fam: "precio", guarda: "hoy", sinFirmaHoy: true,
      titulo: "bajó el precio",
      cambios: [{ k: "precio", antes: 109, despues: 99, alcance: "en las 5 variantes" }] },
    { id: "e11", t: "2026-10-05T17:10", quien: "felipe", donde: "Taller Lima", fam: "precio", guarda: "hoy", sinFirmaHoy: true, privado: true,
      titulo: "corrigió el costo",
      cambios: [{ k: "costo", antes: 42, despues: 45.5, alcance: "en las 5 variantes" }] },
    { id: "e12", t: "2026-10-06T09:20", quien: "lucia", donde: "Tienda Trujillo", fam: "ficha", guarda: "hoy", sinFirmaHoy: true,
      titulo: "cambió el nombre",
      cambios: [{ k: "texto", campo: "Nombre", antes: "Vestido Verano", despues: "Vestido Summer" }] },
  ];

  // «Recién creada»: una prenda que nació hoy y nadie tocó todavía.
  const eventosRecien = [
    { id: "r1", t: "2026-10-06T08:50", quien: "rosa", donde: "Tienda Trujillo", fam: "alta", guarda: "hoy",
      titulo: "creó la prenda",
      cambios: [{ k: "alta", nombre: "Vestido Summer", categoria: "Vestidos", colores: ["Cereza", "Crudo", "Crema", "Marrón", "Turquesa"], tallas: ["Estándar"], precio: 99, stock: 5 }] },
  ];

  const casos = {
    completo: { id: "completo", nombre: "Completo", nota: "Con lo que la base aún no guarda (etiquetas, colores nuevos)" },
    hoy: { id: "hoy", nombre: "Lo que se guarda hoy", nota: "Solo lo que producción anota hoy, con sus huecos" },
    recien: { id: "recien", nombre: "Recién creada", nota: "Nadie la tocó desde que nació" },
  };

  /** Los eventos de un caso, ya con la persona resuelta (null = nadie quedó anotado). */
  function eventosDe(caso) {
    const base = caso === "recien" ? eventosRecien : caso === "hoy" ? eventos.filter((e) => e.guarda === "hoy") : eventos;
    return base.map((e) => ({ ...e, persona: caso === "hoy" && e.sinFirmaHoy ? null : personas[e.quien] }));
  }

  /** Cómo estaba la prenda DESPUÉS de los primeros `n` eventos (para la máquina del tiempo). */
  function estadoTras(lista, n) {
    const s = { nombre: "", categoria: "", precio: 0, costo: 42, descripcion: "Vestido largo de punto", temporada: "Sin temporada", colores: [], tallas: [], etiquetas: [], fotos: [] };
    for (const e of lista.slice(0, n)) {
      for (const c of e.cambios) {
        if (c.k === "alta") Object.assign(s, { nombre: c.nombre, categoria: c.categoria, precio: c.precio, colores: [...c.colores], tallas: [...c.tallas] });
        if (c.k === "precio") s.precio = c.despues;
        if (c.k === "costo") s.costo = c.despues;
        if (c.k === "texto" && c.campo === "Nombre") s.nombre = c.despues;
        if (c.k === "texto" && c.campo === "Descripción") s.descripcion = c.despues;
        if (c.k === "ref" && c.campo === "Temporada") s.temporada = c.despues;
        if (c.k === "col+") s.colores.push(...c.colores);
        if (c.k === "col~") { s.colores = s.colores.map((x) => (x === c.antes ? c.despues : x)); s.fotos = s.fotos.map((x) => (x === c.antes ? c.despues : x)); }
        if (c.k === "etq+") s.etiquetas.push(c.nombre);
        if (c.k === "etq-") s.etiquetas = s.etiquetas.filter((x) => x !== c.nombre);
        if (c.k === "foto+") s.fotos.push(...c.colores);
      }
    }
    return s;
  }

  // ---------- palabras ----------
  const soles = (n) => "S/ " + Number(n).toFixed(2);
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const fecha = (t) => new Date(t.slice(0, 10) + "T12:00:00");
  const hora = (t) => t.slice(11, 16);
  function diasDesde(t) { return Math.round((fecha(HOY + "T00:00") - fecha(t)) / 864e5); }
  function dia(t) {
    const d = diasDesde(t), f = fecha(t);
    if (d === 0) return "Hoy";
    if (d === 1) return "Ayer";
    return `${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]}`;
  }
  function diaLargo(t) { const f = fecha(t); return `${f.getDate()} de ${MESES_L[f.getMonth()]}`; }
  function diaCorto(t) { const f = fecha(t); return `${f.getDate()} ${MESES[f.getMonth()]}`; }
  function haceCuanto(t) {
    const d = diasDesde(t);
    if (d === 0) return "hoy, " + hora(t);
    if (d === 1) return "ayer, " + hora(t);
    if (d < 7) return `hace ${d} días`;
    return "el " + diaLargo(t);
  }

  /** Una línea por cambio, en palabras de tienda. */
  function linea(c) {
    switch (c.k) {
      case "alta": return `Nació con ${c.colores.length} colores · ${c.tallas.length === 1 ? "1 talla" : c.tallas.length + " tallas"} · ${soles(c.precio)}`;
      case "precio": return `Precio ${soles(c.antes)} → ${soles(c.despues)} ${c.alcance || ""}`.trim();
      case "costo": return `Costo ${soles(c.antes)} → ${soles(c.despues)}`;
      case "texto":
      case "ref": return `${c.campo}: ${c.antes} → ${c.despues}`;
      case "col+": return `Nuevos colores: ${c.colores.join(" y ")}`;
      case "col~": return `Color ${c.antes} → ${c.despues}`;
      case "etq+": return `Etiqueta «${c.nombre}» puesta`;
      case "etq-": return `Etiqueta «${c.nombre}» quitada`;
      case "foto+": return c.colores.length === 1 ? `Foto de ${c.colores[0]}` : `Fotos de ${c.colores.join(" y ")}`;
      default: return "";
    }
  }

  // ---------- íconos (trazos de lucide, que es lo que usa el ERP) ----------
  const P = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    lapiz: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
    impresora: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    historial: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    caja: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>',
    basura: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    atras: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    etiqueta: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
    paleta: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    imagen: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    ficha: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    brote: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    billete: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    candado: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    play: '<path d="M6 4.5v15l13-7.5z"/>',
    pausa: '<path d="M8 5v14"/><path d="M16 5v14"/>',
    pregunta: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    flecha: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    lugar: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    ojo: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    cambio: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    vestido: '<path d="M9 2.5 10 7l-4.5 14h13L14 7l1-4.5"/><path d="M10 7h4"/><path d="M8.6 12.5c2.2.8 4.6.8 6.8 0"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  };
  const icono = (n, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;

  /** Avatar: iniciales sobre su tono; sin persona, el anillo punteado con «?». */
  function avatar(p, tam = 32) {
    if (!p) return `<span class="av nadie" style="--av:${tam}px" title="Nadie quedó anotado">?</span>`;
    return `<span class="av" style="--av:${tam}px;--tono:${p.tono}" title="${p.nombre}">${p.ini}</span>`;
  }

  /** De qué pantalla salió el guardado (la base lo sabe por la función que escribió la fila). */
  const origen = (e) => e.origen || (e.fam === "alta" ? "Nuevo producto" : "Editar producto");

  /** Cuenta de un número a otro (precio que baja, cifra que sube). Una sola vez, sin rebote; sin movimiento, salta al final. */
  function contar(el, desde, hasta, { ms = 700, formato = (n) => soles(n), quieto = false } = {}) {
    if (quieto || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = formato(hasta); return; }
    const t0 = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = formato(desde + (hasta - desde) * e);
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  return { HOY, personas, colores, familias, ORDEN_FAMILIAS, eventos, casos, eventosDe, estadoTras, soles, hora, dia, diaLargo, diaCorto, haceCuanto, diasDesde, linea, icono, avatar, esc, origen, contar };
})();
