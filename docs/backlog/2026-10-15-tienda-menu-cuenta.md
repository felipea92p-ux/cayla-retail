## 🛍️ Tienda online: menú de la persona y carga de la cuenta (2026-10-15)

- [ ] **Probar el menú con una cuenta real en producción:** el saludo con el nombre, «Mi perfil» y «Cerrar sesión», en la computadora y a
  375 px, en claro y en oscuro. En local solo se vio en una página de prueba (sin cuenta, la tienda local manda a «Entrar»).
- [ ] **Ver el esqueleto de «Mi cuenta» y de la bolsa con una cuenta real:** tocar la persona ▸ «Mi perfil» y la bolsa y mirar que salga
  la lista que brilla mientras carga.
- [ ] **«Mi cuenta» y la bolsa tardan ~1,2 s** porque su marco lee el catálogo completo solo para armar el menú y el buscador de la
  cabecera (`components/cuenta/MarcoCuenta.tsx`, `leerCatalogo(null)`). El esqueleto lo disimula; si molesta, cachear esa lectura o
  armar la cabecera sin el catálogo entero.
