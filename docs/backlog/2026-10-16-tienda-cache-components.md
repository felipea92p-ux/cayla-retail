## 2026-10-16 — Tienda con Cache Components y prerender parcial · PR abierto · rama `claude/tienda-cache-components-0c6bd9`

- [x] Fase 1: flags activos y todas las rutas funcionando como antes (sin `revalidate`, sin `new Date()` al armar).
- [x] Fase 2: `/tiendas`, `/como-separar`, `/privacidad`, `/terminos-del-club`, `/cambios-y-devoluciones`, `/olvide-mi-contrasena` prerenderizadas, cabecera según sesión por detrás.
- [x] Fase 3: Inicio, catálogo, ficha, looks, bolsa, Mi perfil y pedidos con cáscara y esqueleto; opt-out solo en `/nueva-contrasena`.
- [ ] Publicar (con OK de Felipe) y confirmar con `curl -I` las cinco páginas públicas: deben salir con `x-vercel-cache` y no `private, no-store`.
- [ ] Medir en producción el primer byte de las páginas públicas antes/después (en local no se ve: no hay CDN).
- [ ] Probar en un celular real el cambio de cabecera al entrar a una página pública con la sesión abierta (se midió cuadro por cuadro en el navegador de pruebas).
- [ ] Más adelante: `ensureStatic` en las páginas públicas para que el CI avise si alguien vuelve a leer cookies en ellas.
