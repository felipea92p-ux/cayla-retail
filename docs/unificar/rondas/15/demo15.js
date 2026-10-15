// «Ver más» de la ronda 15: abre y cierra las filas de más, y la flecha gira.
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-vm]");
  if (!b) return;
  e.preventDefault();
  const caja = document.getElementById(b.dataset.vm);
  const abierto = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(abierto));
  caja?.classList.toggle("abierto", abierto);
  const t = b.querySelector("[data-t]");
  if (t) { const otro = t.dataset.t; t.dataset.t = t.textContent; t.textContent = otro; }
});
