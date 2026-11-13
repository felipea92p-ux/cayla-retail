## 2026-11-09 (Animaciones por scroll en CSS: se midió y no conviene migrar lo que ya funciona)
Qué hice: quité `ScrollTrigger` de `lib/motion-gsap.ts`, que nadie usaba y se cargaba con Vender, y medí `FilasQueSeDeslizan` con y sin el vigía en Existencias, Movimientos y Compras.
Por qué así: Felipe pidió medir antes de decidir; el vigía gasta unos 3 ms de ~2100 ms al escribir, y pasarlo a CSS dejaría la máscara siempre puesta sobre el vidrio de `<Pestanas>` (ADR-0038, act. 2026-11-09).
Felipe se lleva: las animaciones por scroll en CSS sirven para señales nuevas, pero no hay ganancia en reescribir las filas deslizables; y una animación decorativa por scroll necesita su propio `animation: none` en modo quieto.
