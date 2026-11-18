// Ronda 18: el «?» de la cabecera abre y cierra su explicación (en las demos vivas y en las fotos aplicadas en vivo).
(() => {
  if (window.__ronda18) return;
  window.__ronda18 = true;
  const cerrarGlobos = (salvo) => {
    for (const b of document.querySelectorAll('.prop-q[data-forma="globo"][aria-expanded="true"]')) {
      if (b === salvo) continue;
      b.setAttribute("aria-expanded", "false");
      document.getElementById(b.getAttribute("aria-controls"))?.setAttribute("hidden", "");
    }
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.(".prop-q");
    if (!b) {
      if (!e.target.closest?.(".prop-globo")) cerrarGlobos(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const abierto = b.getAttribute("aria-expanded") === "true";
    const caja = document.getElementById(b.getAttribute("aria-controls"));
    if (b.dataset.forma === "globo") cerrarGlobos(b);
    b.setAttribute("aria-expanded", String(!abierto));
    if (!caja) return;
    if (abierto) caja.setAttribute("hidden", "");
    else {
      caja.removeAttribute("hidden");
      // El pico apunta al centro del «?», también cuando el globo ocupa todo el ancho en el celular.
      const rb = b.getBoundingClientRect(), rc = caja.getBoundingClientRect();
      caja.style.setProperty("--pico-x", `${Math.round(rb.left + rb.width / 2 - rc.left)}px`);
      caja.classList.remove("prop-entra");
      void caja.offsetWidth;
      caja.classList.add("prop-entra");
    }
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarGlobos(null); });
})();
