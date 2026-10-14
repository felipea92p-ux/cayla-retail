// Ronda 12 de /unificar: «Guardar» espera 2 s como si la base respondiera y vuelve. Nada se guarda.
(() => {
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const b = t?.closest("[data-r12-guardar]");
    if (!b || b.disabled) return;
    const reposo = b.querySelector("[data-r12-reposo]"), espera = b.querySelector("[data-r12-espera]"), hilo = b.querySelector(".r12-hilo");
    b.disabled = true;
    if (espera) { if (espera.classList.contains("invisible")) { espera.classList.remove("invisible"); reposo.classList.add("invisible"); } else { espera.hidden = false; reposo.hidden = true; } }
    if (hilo) hilo.hidden = false;
    setTimeout(() => {
      b.disabled = false;
      if (espera) { if (reposo.classList.contains("invisible")) { reposo.classList.remove("invisible"); espera.classList.add("invisible"); } else { espera.hidden = true; reposo.hidden = false; } }
      if (hilo) hilo.hidden = true;
      const listo = document.createElement("span");
      listo.className = "r12-listo";
      listo.textContent = "✓ Guardado (en la demo no se guarda nada)";
      (b.closest(".pie-acciones") ?? b).after(listo);
      setTimeout(() => listo.remove(), 1600);
    }, 2000);
  });
})();
