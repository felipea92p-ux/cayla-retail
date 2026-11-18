## 🧾 Escaneo repetido: «¿Quieres volver a agregar esta prenda?» (2026-10-28) — construido en Bajar al piso y Cuadrar el piso, sin migración (ADR-0562); rama `claude/duplicate-scan-confirmation-54e92c`

- [x] Maqueta `docs/maquetas/escaneo-repetido-2026-10/` (3 direcciones × escritorio y celular, claro y oscuro), probada en el navegador: primera lectura, repetida, ignoradas, Sí/No/Esc, «Son varias iguales», otra prenda = No, hoja B que bloquea.
- [x] Felipe eligió la dirección A, solo con el total de esa prenda.
- [x] `lib/lectura-repetida.ts` + prueba (12 casos), `<AvisoRepetida>`, Bajar al piso y Cuadrar el piso (pistola y cámara), guías `inventario.bajar` y `inventario.cuadrar` con su huella. Verificado en el navegador con prendas inventadas: 6 lecturas seguidas = 1 suma, 1 pregunta y 4 ignoradas; Sí, No, Esc, otra prenda, «Son varias iguales», el Enter con el foco en un botón vuelve al campo; a 375 px y dentro de la hoja de la cámara.
- [ ] **Decisión de Felipe:** Conteo (pilas de iguales) y Vender.
- [ ] **Sin probar:** con una pistola real y la cámara de un celular en la tienda; Cuadrar el piso solo por tipos y pruebas (comparte la pieza y la regla con Bajar).
- [ ] **Sin construir:** Recibir envío, Llegó mercadería, Etiquetas y Apartar (misma regla y misma pieza); `/chaos` y `/formidable` de la pieza.
