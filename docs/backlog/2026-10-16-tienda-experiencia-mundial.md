## 🛍️ Tienda online: a nivel de las grandes marcas, y más rápida (2026-10-16)

**Decisiones de Felipe:**
- [x] ~~**Fotos en la portada sin cuenta**~~ — Felipe 2026-10-16: sí, sin precio ni stock («Ver precio» lleva a crear la cuenta).
- [ ] **Textos nuevos de presentación** (todos describen lo que la tienda ya hace): el panel de Entrar/Crear cuenta («Separa hoy, *recoge en
  tu tienda.*» y sus tres beneficios), la franja de confianza de la portada, las promesas junto al botón de la ficha, la frase de «Cómo
  separar», las líneas de la fila «Ayuda» del pie, «Página no encontrada» y «Algo falló de nuestro lado», y los 3 pasos del vacío de
  Recomendaciones.
- [ ] **«Abrir Gmail»** junto a la caja del código: ¿se queda?
- [ ] **El sello «Nuevo» claro** (antes negro, como la maqueta): se revierte con una línea.
- [ ] **Textos legales que dicen «Mi cuenta»**: cambiarlos a «Mi perfil» en su revisión legal, con versión nueva (no se tocaron).
- [ ] **Una foto y un horario estructurado por tienda** (para «Abierto ahora»): piden campos nuevos en Configuración ▸ Tienda web.

**Para hacer:**
- [ ] **Prueba de carga en producción** de noche, con las tiendas cerradas, después de publicar (Felipe aprobó): escalones de 10 a ~1.000
  personas en las páginas sin cuenta, se detiene sola con más de 2 % de fallas. La parte con cuenta se estima con `pg_stat_statements`
  (no se pueden crear cuentas de prueba en producción).
- [ ] **«Mi perfil» es lo más pesado** (`tienda_mi_club` ~190 ms en producción): mirar su plan si la prueba de carga lo marca.
- [ ] **`tienda_looks` arma el catálogo por dentro** (1,2–1,6 s): ya se comparte 30 s; si hace falta más, que reciba los precios ya
  calculados (cambio de base, con OK de Felipe).
- [ ] **Las páginas de ayuda siguen dinámicas** (leen la sesión para la cabecera): podrían ser estáticas con una cabecera que se elija en el
  navegador.
- [ ] **El zoom de la ficha** usa la foto de 1080 px: en pantallas retina se vería más nítido con 1920 en `deviceSizes` (más ancho de banda).
- [ ] **Ver en producción con una cuenta real** al publicarse: portada, Entrar/Crear cuenta, catálogo, ficha, bolsa, ayuda, a 375 y en la
  computadora.
