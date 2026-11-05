/* Maquetas de Finanzas v2 — comportamiento común. Sin dependencias.
   Copia de v3/gastos (2026-10-23): el hash puede llevar filtros (#a?sede=tru); el camino es lo que va antes del «?».
   - Selector de variante A/B/C (con #a #b #c en la URL y recordado en el navegador).
   - Tema claro/oscuro (data-theme), recordado.
   - Al mostrar una variante: se le pone .animar (corre la cascada una vez) y cuentan sus números [data-cuenta].
   - [data-porque="id"] abre/cierra el .desplegable con ese id.
   - Onda donde se toca en .btn.
   Una página puede escuchar el evento «variante» en document para animar lo suyo:
     document.addEventListener("variante", e => { if (e.detail === "c") … })  */
(function () {
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const leer = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const formatear = (n, dec) =>
    n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  function contar(el) {
    const fin = parseFloat(el.dataset.cuenta);
    if (isNaN(fin)) return;
    const dec = parseInt(el.dataset.dec || "0", 10);
    const pre = el.dataset.pre || "";
    const suf = el.dataset.suf || "";
    const dur = parseInt(el.dataset.dur || "1100", 10);
    if (reducido) { el.textContent = pre + formatear(fin, dec) + suf; return; }
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function paso(t) {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = pre + formatear(fin * ease(p), dec) + suf;
      if (p < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
    // Si el navegador pausa la animación (pestaña oculta), la cifra igual termina en su valor final.
    setTimeout(() => { el.textContent = pre + formatear(fin, dec) + suf; }, dur + 250);
  }
  window.mqContar = contar;

  function animar(sec) {
    if (!sec) return;
    sec.classList.remove("animar");
    void sec.offsetWidth; // reinicia las animaciones CSS
    sec.classList.add("animar");
    sec.querySelectorAll("[data-cuenta]").forEach(contar);
    // Seguro: si el navegador congela las animaciones (pestaña de fondo, miniatura), a los 4.5 s se quita
    // .animar y todo queda en su estado final, a la vista. Las entradas de base.css duran menos que eso.
    clearTimeout(sec._mqSeguro);
    sec._mqSeguro = setTimeout(() => sec.classList.remove("animar"), 4500);
  }
  window.mqAnimar = animar;

  function mostrar(clave, empujar) {
    const secciones = document.querySelectorAll(".variante");
    if (!secciones.length) return;
    let hay = false;
    secciones.forEach((s) => { if (s.dataset.variante === clave) hay = true; });
    if (!hay) clave = secciones[0].dataset.variante;
    secciones.forEach((s) => { s.hidden = s.dataset.variante !== clave; });
    document.querySelectorAll(".mq-selector button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ver === clave)));
    moverPildora();
    animar(document.querySelector(`.variante[data-variante="${clave}"]`));
    if (empujar) { try { history.replaceState(null, "", "#" + clave); } catch (_) {} }
    guardar("mq-fin-variante", clave);
    document.dispatchEvent(new CustomEvent("variante", { detail: clave }));
    window.scrollTo({ top: 0, behavior: reducido ? "auto" : "smooth" });
  }

  function moverPildora() {
    const sel = document.querySelector(".mq-selector");
    if (!sel) return;
    let p = sel.querySelector(".mq-pildora");
    if (!p) { p = document.createElement("span"); p.className = "mq-pildora"; sel.prepend(p); }
    const b = sel.querySelector('button[aria-pressed="true"]');
    if (!b) return;
    p.style.left = b.offsetLeft + "px";
    p.style.width = b.offsetWidth + "px";
  }

  function tema(valor) {
    if (valor) document.documentElement.setAttribute("data-theme", valor);
    const boton = document.querySelector(".mq-tema");
    if (boton) {
      const oscuro = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
      boton.textContent = oscuro ? "Claro" : "Oscuro";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const t = leer("mq-fin-tema");
    if (t) document.documentElement.setAttribute("data-theme", t);
    tema();
    document.querySelector(".mq-tema")?.addEventListener("click", () => {
      const ahora = document.querySelector(".mq-tema").textContent === "Claro" ? "light" : "dark";
      tema(ahora); guardar("mq-fin-tema", ahora);
    });
    document.querySelectorAll(".mq-selector button").forEach((b) =>
      b.addEventListener("click", () => mostrar(b.dataset.ver, true)));
    const inicial = (location.hash || "").replace("#", "").split("?")[0] || leer("mq-fin-variante") || "a";
    mostrar(inicial, false);
    addEventListener("resize", moverPildora);
    addEventListener("hashchange", () => mostrar(location.hash.replace("#", "").split("?")[0], false));

    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-porque]");
      if (t) {
        const caja = document.getElementById(t.dataset.porque);
        if (caja) {
          const abierto = caja.classList.toggle("abierto");
          t.setAttribute("aria-expanded", String(abierto));
          if (abierto) caja.querySelectorAll("[data-cuenta]").forEach(contar);
        }
      }
      const b = e.target.closest(".btn");
      if (b && !reducido) {
        const r = b.getBoundingClientRect();
        const d = Math.max(r.width, r.height) * 2;
        const o = document.createElement("span");
        o.className = "onda";
        o.style.width = o.style.height = d + "px";
        o.style.left = e.clientX - r.left - d / 2 + "px";
        o.style.top = e.clientY - r.top - d / 2 + "px";
        b.appendChild(o);
        setTimeout(() => o.remove(), 650);
      }
    });
  });
})();
