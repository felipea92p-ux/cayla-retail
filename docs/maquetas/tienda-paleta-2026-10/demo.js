// La demo: con «?demo» en la dirección, la página se recorre sola, como lo haría una clienta: baja por la portada, pasa el mouse
// por las prendas, entra al catálogo, filtra, abre una prenda, elige talla, la agrega a la bolsa, escoge tienda y separa.
// Un cursor y un rótulo abajo a la izquierda dicen qué se está viendo. Esc la detiene. Nada de esto guarda nada: es la maqueta.
// El mismo recorrido sirve para grabar el video de cada dirección (`?previa&demo` esconde la barra de revisión y deja
// `window.__demoListo = true` al terminar).
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has("demo")) return;

  const ESTILO = `
    .demo-cursor { position: fixed; left: 0; top: 0; z-index: 99999; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: rgba(255,255,255,.94); box-shadow: 0 0 0 2px #111, 0 8px 20px rgba(0,0,0,.38); pointer-events: none; opacity: 0; transition: transform 1s cubic-bezier(.45,0,.2,1), opacity .5s; }
    .demo-cursor.on { opacity: 1; }
    .demo-cursor i { position: absolute; inset: -2px; border-radius: 50%; border: 2px solid #111; opacity: 0; }
    .demo-cursor.clic i { animation: demo-onda .65s ease-out; }
    @keyframes demo-onda { from { opacity: .9; transform: scale(1); } to { opacity: 0; transform: scale(2.8); } }
    .demo-leyenda { position: fixed; left: 24px; bottom: 24px; z-index: 99998; max-width: min(540px, calc(100vw - 48px)); padding: 12px 18px 13px; border-radius: 14px; background: rgba(17,17,17,.88); color: #fff; font: 600 15px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; box-shadow: 0 14px 40px -14px rgba(0,0,0,.55); backdrop-filter: blur(8px); transition: opacity .5s, transform .5s; }
    .demo-leyenda small { display: block; margin-top: 2px; font-weight: 400; font-size: 13px; opacity: .78; }
    .demo-leyenda.fuera { opacity: 0; transform: translateY(8px); }`;
  const estilo = document.createElement("style");
  estilo.textContent = ESTILO;
  document.head.appendChild(estilo);

  const cursor = document.createElement("div");
  cursor.className = "demo-cursor";
  cursor.innerHTML = "<i></i>";
  const leyenda = document.createElement("div");
  leyenda.className = "demo-leyenda fuera";
  leyenda.setAttribute("role", "status");
  document.body.append(cursor, leyenda);

  let parar = false;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") parar = true; });
  const dormir = (ms) => new Promise((ok, no) => setTimeout(() => (parar ? no(new Error("demo detenida")) : ok()), ms));
  const q = (s) => document.querySelector(s);

  function decir(titulo, detalle) {
    leyenda.classList.add("fuera");
    setTimeout(() => { leyenda.innerHTML = `${titulo}${detalle ? `<small>${detalle}</small>` : ""}`; leyenda.classList.remove("fuera"); }, 260);
  }

  // Baja o sube con una curva suave (no el scroll del navegador, para que dure lo mismo en todas partes).
  function irA(y, ms) {
    const y0 = scrollY, t0 = performance.now();
    const destino = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
    return new Promise((ok) => {
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        scrollTo(0, y0 + (destino - y0) * e);
        k < 1 && !parar ? requestAnimationFrame(paso) : ok();
      };
      requestAnimationFrame(paso);
    });
  }
  // Deja el elemento a una altura cómoda de la pantalla (un tercio desde arriba).
  async function centrar(el, ms = 1500, tercio = 0.3) {
    if (!el) return;
    await irA(scrollY + el.getBoundingClientRect().top - innerHeight * tercio, ms);
  }
  async function mirar(el) {
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 90) await centrar(el, 1000, 0.4);
  }
  async function mover(el) {
    await mirar(el);
    const r = el.getBoundingClientRect();
    cursor.classList.add("on");
    cursor.style.transform = `translate(${Math.round(r.left + Math.min(r.width * 0.5, 160))}px, ${Math.round(r.top + Math.min(r.height * 0.5, 120))}px)`;
    await dormir(1050);
  }
  async function pasar(el, ms = 1300) {
    if (!el) return;
    await mover(el);
    el.classList.add("is-hover");
    await dormir(ms);
    el.classList.remove("is-hover");
  }
  async function clic(el, despues = 500) {
    if (!el) return;
    await mover(el);
    cursor.classList.add("clic");
    await dormir(160);
    el.click();
    setTimeout(() => cursor.classList.remove("clic"), 700);
    await dormir(despues);
  }

  // Espera a que las fotos que se ven (o están por verse) hayan llegado: así el video no empieza con los marcos vacíos.
  async function imagenes() {
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      const cerca = [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight * 1.4);
      if (cerca.every((i) => i.complete && i.naturalWidth > 0)) return;
      await dormir(200);
    }
  }

  async function recorrido() {
    // La bolsa de la demo siempre parte igual: las dos prendas de ejemplo.
    try { sessionStorage.setItem("cayla-paleta-bolsa", JSON.stringify([{ id: "kalessi", color: "Chocolate", talla: "M" }, { id: "tiana", color: "Celeste", talla: "28" }])); } catch { /* sin almacenamiento */ }
    location.hash = "#portada";
    window.TIENDA?.pintar();
    scrollTo(0, 0);
    await imagenes();
    await dormir(500);
    cursor.style.transform = `translate(${innerWidth * 0.7}px, ${innerHeight * 0.55}px)`;

    // 1 · Portada
    decir("1 · Portada", "La página entra por capas y se mueve al bajar");
    await dormir(2600);
    await mover(q(".h .btn") || q(".btn"));
    await irA(innerHeight * 0.62, 2000);
    await dormir(700);
    decir("Categorías con foto", "Cada una es una puerta al catálogo");
    await centrar(q(".cat-tiles"));
    await pasar(document.querySelectorAll(".cat-tile")[2]);
    decir("Recién llegado", "La prenda sube al tocarla y ofrece «Ver prenda»");
    await centrar(q(".sec .rejilla"));
    await pasar(document.querySelectorAll(".sec .rejilla .tj")[1], 1500);
    decir("El look", "Dos prendas montadas sobre un bloque de color");
    await centrar(q(".look"), 1600, 0.12);
    await dormir(1600);
    decir("Así se separa, y el Club", "Cuatro pasos y nada se paga en la web");
    await centrar(q(".pasos"), 1500, 0.25);
    await dormir(1300);
    await centrar(q(".club"), 1300, 0.35);
    await dormir(1400);
    await centrar(q(".tiendas"), 1300, 0.3);
    await dormir(900);
    await irA(0, 2000);
    await dormir(400);

    // 2 · Catálogo
    decir("2 · Catálogo", "Filtros que se quedan pegados al bajar y dos prendas grandes para dar ritmo");
    await clic(q('.cab-nav a[href="#catalogo"]') || q('.cab-acc a[href="#catalogo"]'), 900);
    await imagenes();
    await dormir(800);
    await irA(520, 1500);
    await dormir(600);
    await clic(q('[data-filtro="pantalones"]'), 1700);
    await clic(q('[data-filtro-tienda="tru"]'), 1600);
    await clic(q('[data-filtro="todo"]'), 500);
    await clic(q('[data-filtro-tienda="todas"]'), 1000);
    const tiana = q('.tj[href="#prenda/tiana"]');
    await pasar(tiana, 1100);

    // 3 · Prenda
    decir("3 · Prenda", "Escenario con luz y sombra de piso; se elige color y talla");
    await clic(tiana, 900);
    await imagenes();
    await dormir(1100);
    await pasar(q(".galeria > .foto"), 1500);
    await clic(q('[data-grupo="color"] [data-valor]'), 500);
    await clic(q('[data-grupo="talla"] [data-valor]:nth-of-type(2)') || q('[data-grupo="talla"] [data-valor]'), 700);
    await clic(q("[data-agregar]"), 1900);

    // 4 · Bolsa
    decir("4 · Bolsa", "Tres pasos: tu bolsa, tu tienda y separada");
    await clic(q(".cab-bolsa"), 900);
    await imagenes();
    await dormir(1100);
    await clic(q('[data-grupo="tienda"] [data-valor="aqp"]'), 1200);
    await clic(q("[data-separar]"), 2200);
    await clic(q("[data-whatsapp]"), 2600);

    decir("Fin de la demo", "Esc la detiene · recarga la página para repetirla");
    cursor.classList.remove("on");
    await dormir(2200);
  }

  const empezar = () => setTimeout(() => {
    recorrido()
      .catch(() => { cursor.classList.remove("on"); decir("Demo detenida", "Recarga la página para repetirla"); })
      .finally(() => { window.__demoListo = true; });
  }, 1500);
  if (document.readyState === "complete") empezar(); else window.addEventListener("load", empezar);
})();
