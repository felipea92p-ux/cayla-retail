// Marco común de las tres direcciones: la barra de revisión (no es parte del diseño), las pantallas por #ancla, la bolsa
// y los toques que se repiten (filtros, elegir color/talla/tienda, agregar, separar). Cada dirección solo dibuja.
(function () {
  const C = window.CAYLA;
  const PANTALLAS = [["portada", "Portada"], ["catalogo", "Catálogo"], ["prenda", "Prenda"], ["bolsa", "Bolsa"], ["entrar", "Entrar"]];
  // En la barra van A y sus tres hermanas con identidad propia; las variaciones A2–A4 y B, C se abren desde la comparación.
  const DIRECCIONES = [["a-muro.html", "A"], ["d-seda.html", "D · Seda"], ["e-etiqueta.html", "E · Etiqueta"], ["f-friso.html", "F · Friso"], ["g-pasarela.html", "G · Pasarela"], ["h-vitrina.html", "H · Vitrina"], ["i-pespunte.html", "I · Pespunte"], ["j-vuelo.html", "J · Vuelo"], ["k-sedes.html", "K · Sedes"], ["l-probador.html", "L · Probador"]];
  const calma = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const avisar = (nombre, detail = {}) => document.dispatchEvent(new CustomEvent("cayla:" + nombre, { detail }));
  let primera = true;

  // La bolsa vive en la sesión del navegador; si el navegador no deja guardar, vive en memoria.
  let memoria = [];
  const bolsa = {
    leer() { try { return JSON.parse(sessionStorage.getItem("cayla-maqueta-bolsa") || "null") || memoria; } catch { return memoria; } },
    guardar(l) { memoria = l; try { sessionStorage.setItem("cayla-maqueta-bolsa", JSON.stringify(l)); } catch { /* sin almacenamiento */ } },
  };
  if (bolsa.leer().length === 0) bolsa.guardar([{ id: "kalessi", color: "Chocolate", talla: "M" }, { id: "tiana", color: "Celeste", talla: "28" }]);

  const sel = {};
  const estado = { tienda: null, separada: false };

  function ruta() {
    const [p, id] = (location.hash.replace("#", "") || "portada").split("/");
    return { pantalla: PANTALLAS.some((x) => x[0] === p) ? p : "portada", id };
  }

  function vista() { return new URLSearchParams(location.search).get("vista") === "celular" ? "celular" : "escritorio"; }

  function barra() {
    const actual = location.pathname.split("/").pop();
    const r = ruta();
    const b = document.createElement("div");
    b.className = "rev";
    b.innerHTML = `
      <a class="rev-volver" href="index.html">← Comparar</a>
      <nav class="rev-grupo" aria-label="Dirección">${DIRECCIONES.map(([f, n]) => `<a href="${f}${location.search}${location.hash}" ${f === actual ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <nav class="rev-grupo" aria-label="Pantalla">${PANTALLAS.map(([p, n]) => `<a href="#${p === "prenda" ? "prenda/" + (r.id || "kalessi") : p}" ${p === r.pantalla ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <nav class="rev-grupo" aria-label="Vista">${[["escritorio", "Escritorio"], ["celular", "Celular"]].map(([v, n]) => `<a href="?vista=${v}${location.hash}" ${v === vista() ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <span class="rev-nota">Precios, tallas y stock de ejemplo</span>`;
    return b;
  }

  function contarBolsa() { document.querySelectorAll("[data-cuenta-bolsa]").forEach((e) => (e.textContent = bolsa.leer().length)); }

  // Las direcciones con «transicion» cambian de pantalla con una transición de vista (el navegador anima de una a otra).
  function pintar() {
    const D = window.DIRECCION;
    if (!primera && D.transicion && document.startViewTransition && !calma()) {
      if (D.antesDeCambiar) D.antesDeCambiar(ruta());
      document.startViewTransition(pintarAhora);
    } else pintarAhora();
  }

  function pintarAhora() {
    const D = window.DIRECCION;
    const r = ruta();
    // En la página de comparar, las vistas previas van sin la barra de revisión (?previa).
    if (!new URLSearchParams(location.search).has("previa")) {
      const vieja = document.querySelector(".rev");
      if (vieja) vieja.replaceWith(barra()); else document.body.prepend(barra());
    }
    const lienzo = document.getElementById("lienzo");
    lienzo.dataset.vista = vista();
    lienzo.dataset.pantalla = r.pantalla;
    estado.separada = false;
    filtro.cat = "todo"; filtro.tienda = "todas"; estado.tienda = null; delete sel.tienda; delete sel.talla; delete sel.color;
    lienzo.innerHTML = D.pantallas[r.pantalla]({ C, id: r.id, bolsa: bolsa.leer(), sel, estado });
    document.title = `${D.nombre} · ${PANTALLAS.find((x) => x[0] === r.pantalla)[1]} — Rediseño de la tienda`;
    contarBolsa();
    window.scrollTo(0, 0);
    if (D.montar) D.montar(r.pantalla, lienzo, { primera, id: r.id });
    primera = false;
  }

  function elegir(boton) {
    const grupo = boton.closest("[data-grupo]");
    grupo.querySelectorAll("[data-valor]").forEach((b) => b.setAttribute("aria-pressed", String(b === boton)));
    sel[grupo.dataset.grupo] = boton.dataset.valor;
    if (grupo.dataset.grupo === "tienda") {
      estado.tienda = boton.dataset.valor;
      // Cada línea de la bolsa dice si hay en la tienda elegida (lo que no hay, la tienda lo puede traer de otra).
      document.querySelectorAll("[data-hay-aqp]").forEach((x) => {
        const n = Number(x.dataset["hay" + (estado.tienda === "aqp" ? "Aqp" : "Tru")]);
        x.textContent = n > 0 ? `${C.stockFrase(n)} en ${C.tiendas.find((t) => t.id === estado.tienda).ciudad}` : "No hay aquí: la tienda la pide a la otra";
        x.dataset.falta = String(n <= 0);
      });
    }
    const aviso = document.querySelector("[data-aviso]");
    if (aviso) aviso.textContent = "";
    avisar("elegido", { grupo: grupo.dataset.grupo, boton });
  }

  // Filtros del catálogo: categoría y tienda se combinan. «En Trujillo» deja solo lo que tiene stock allí.
  const filtro = { cat: "todo", tienda: "todas" };
  function filtrar(boton) {
    const fila = boton.closest("[data-filtros]");
    const clave = boton.dataset.filtro ? "cat" : "tienda";
    fila.querySelectorAll(clave === "cat" ? "[data-filtro]" : "[data-filtro-tienda]").forEach((b) => b.setAttribute("aria-pressed", String(b === boton)));
    filtro[clave] = boton.dataset.filtro || boton.dataset.filtroTienda;
    let visibles = 0;
    document.querySelectorAll("[data-cat]").forEach((el) => {
      const porCat = filtro.cat === "todo" || el.dataset.cat === filtro.cat;
      const porTienda = filtro.tienda === "todas" || Number(el.dataset[filtro.tienda]) > 0;
      el.hidden = !(porCat && porTienda);
      if (!el.hidden) visibles++;
    });
    document.querySelectorAll("[data-cuenta-prendas]").forEach((x) => (x.textContent = visibles));
    document.querySelectorAll("[data-sin-resultados]").forEach((x) => (x.hidden = visibles > 0));
    avisar("filtrado", { visibles, boton });
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-valor],[data-filtro],[data-filtro-tienda],[data-agregar],[data-quitar],[data-separar],[data-whatsapp]");
    if (!t) return;
    if (t.matches("[data-valor]")) return elegir(t);
    if (t.matches("[data-filtro],[data-filtro-tienda]")) return filtrar(t);
    if (t.matches("[data-agregar]")) {
      const p = C.prenda(t.dataset.agregar);
      const aviso = document.querySelector("[data-aviso]");
      if (!sel.talla) { if (aviso) aviso.textContent = "Elige tu talla para agregarla a la bolsa."; document.querySelector('[data-grupo="talla"] [data-valor]')?.focus(); return; }
      const l = bolsa.leer();
      l.push({ id: p.id, color: sel.color || p.colores[0][0], talla: sel.talla });
      bolsa.guardar(l);
      contarBolsa();
      if (aviso) aviso.textContent = `Agregaste ${p.nombre}, talla ${sel.talla}.`;
      t.dataset.hecho = "si";
      avisar("agregado", { id: p.id, boton: t });
      return;
    }
    if (t.matches("[data-quitar]")) {
      const l = bolsa.leer();
      l.splice(Number(t.dataset.quitar), 1);
      bolsa.guardar(l);
      pintar();
      return;
    }
    if (t.matches("[data-separar]")) {
      const aviso = document.querySelector("[data-aviso]");
      if (!estado.tienda) { if (aviso) aviso.textContent = "Elige en qué tienda la recoges."; document.querySelector('[data-grupo="tienda"] [data-valor]')?.focus(); return; }
      estado.separada = true;
      document.querySelectorAll("[data-antes-de-separar]").forEach((x) => (x.hidden = true));
      const listo = document.querySelector("[data-confirmacion]");
      if (listo) {
        const tienda = C.tiendas.find((x) => x.id === estado.tienda);
        listo.querySelectorAll("[data-tienda-elegida]").forEach((x) => (x.textContent = tienda.ciudad));
        listo.hidden = false;
        avisar("separado", { tienda, listo });
        listo.querySelector("h2, h3, [tabindex]")?.focus?.();
        listo.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      }
      return;
    }
    if (t.matches("[data-whatsapp]")) {
      const m = document.querySelector("[data-mensaje]");
      if (m) m.hidden = !m.hidden;
    }
  });

  // Un formulario de la maqueta nunca manda nada: «Entrar» te lleva al catálogo, como si hubieras entrado.
  document.addEventListener("submit", (e) => { e.preventDefault(); location.hash = "catalogo"; });

  window.addEventListener("hashchange", pintar);
  window.MARCO = { pintar, bolsa, sel, estado, calma, ruta };
  document.addEventListener("DOMContentLoaded", pintar);
})();
