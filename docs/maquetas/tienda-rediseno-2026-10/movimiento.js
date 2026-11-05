// Piezas de movimiento que comparten A2, A3 y A4. Sin librerías: CSS, IntersectionObserver y la Web Animations API del
// navegador, para que llevarlas a la tienda no le sume peso. Con «reducir movimiento» del sistema, nada se mueve.
(function () {
  const calma = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const suave = "cubic-bezier(.2,.7,.2,1)";

  // Revela al entrar en vista: agrega .visto una sola vez (lo que ya se vio no vuelve a animarse).
  function revelar(raiz, selector = "[data-revela]", { margen = "0px 0px -10% 0px", umbral = 0.12 } = {}) {
    const els = raiz.querySelectorAll(selector);
    if (calma() || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("visto")); return; }
    const io = new IntersectionObserver((entradas) => entradas.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("visto"); io.unobserve(en.target); }
    }), { rootMargin: margen, threshold: umbral });
    els.forEach((e) => io.observe(e));
  }

  // Una cifra que cuenta hasta su valor (el total de la bolsa, el número de la separación).
  function contar(el, hasta, ms = 900, fmt = (n) => String(Math.round(n))) {
    if (!el) return;
    if (calma()) { el.textContent = fmt(hasta); return; }
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(hasta * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  // La foto de la prenda vuela hasta la bolsa de la cabecera: dice «se agregó» y dónde quedó.
  function volar(img, destino) {
    if (calma() || !img || !destino) return Promise.resolve();
    const a = img.getBoundingClientRect(), b = destino.getBoundingClientRect();
    const c = img.cloneNode();
    c.removeAttribute("class");
    Object.assign(c.style, { position: "fixed", left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px", zIndex: 1000, pointerEvents: "none", objectFit: "contain", margin: 0, mixBlendMode: "multiply" });
    document.body.appendChild(c);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    return c.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 60}px) scale(.45)`, opacity: 0.9, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.05)`, opacity: 0.2 },
    ], { duration: 950, easing: "cubic-bezier(.6,0,.25,1)" }).finished.then(() => c.remove());
  }

  function latir(el) { if (!calma() && el) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.6)" }, { transform: "scale(1)" }], { duration: 560, easing: suave }); }

  // Un indicador que se desliza hasta la opción elegida de un grupo (talla, filtro, tienda).
  function indicador(grupo, elegido = '[aria-pressed="true"]') {
    if (!grupo) return;
    let ind = grupo.querySelector(":scope > .indicador");
    if (!ind) {
      ind = document.createElement("span");
      ind.className = "indicador";
      ind.setAttribute("aria-hidden", "true");
      grupo.prepend(ind);
      if (getComputedStyle(grupo).position === "static") grupo.style.position = "relative";
      ind.style.transition = "none";
      requestAnimationFrame(() => requestAnimationFrame(() => (ind.style.transition = "")));
    }
    const el = grupo.querySelector(elegido);
    if (!el) { ind.style.opacity = "0"; return; }
    ind.style.opacity = "1";
    ind.style.width = el.offsetWidth + "px";
    ind.style.height = el.offsetHeight + "px";
    ind.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
  }

  // Filtrar sin saltos: lo que queda se desliza a su nuevo lugar y lo que aparece entra (técnica FLIP).
  let antes = null;
  function flipAntes(items) { antes = new Map([...items].map((e) => [e, e.hidden ? null : e.getBoundingClientRect()])); }
  function flipDespues(items) {
    if (!antes || calma()) { antes = null; return; }
    [...items].forEach((e, i) => {
      if (e.hidden) return;
      const a = antes.get(e), b = e.getBoundingClientRect();
      if (a) {
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 700, easing: suave });
      } else e.animate([{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "none" }], { duration: 650, delay: i * 30, easing: suave, fill: "backwards" });
    });
    antes = null;
  }

  // Parte un texto en letras para que entren una a una; el lector de pantalla sigue leyendo la palabra entera.
  // Las letras de cada palabra van juntas: si no, el navegador puede cortar una palabra a la mitad («NU / EVO»).
  function letras(el) {
    if (!el || el.dataset.partido) return;
    const t = el.textContent;
    el.dataset.partido = "si";
    el.setAttribute("aria-label", t);
    let i = 0;
    el.innerHTML = t.split(" ").map((palabra) => `<span class="palabra" aria-hidden="true" style="display:inline-block;white-space:nowrap">${[...palabra].map((c) => `<span class="letra" style="--l:${i++}">${c}</span>`).join("")}</span>`).join(" ");
  }

  // Un valor que sigue al puntero con inercia (el cursor propio, la luz de sala).
  function seguir(alMover) {
    if (calma() || !matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, vivo = true;
    const mover = (e) => { x = e.clientX; y = e.clientY; };
    addEventListener("pointermove", mover, { passive: true });
    const bucle = () => { if (!vivo) return; cx += (x - cx) * 0.16; cy += (y - cy) * 0.16; alMover(cx, cy, x, y); requestAnimationFrame(bucle); };
    requestAnimationFrame(bucle);
    return () => { vivo = false; removeEventListener("pointermove", mover); };
  }

  window.MOV = { calma, revelar, contar, volar, latir, indicador, flipAntes, flipDespues, letras, seguir };
})();
