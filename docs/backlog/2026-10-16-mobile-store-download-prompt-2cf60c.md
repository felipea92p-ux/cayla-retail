## 📲 Instalar la tienda en el celular (2026-10-16, ADR-0431) — solo web y tienda, sin migración; rama `claude/mobile-store-download-prompt-2cf60c`

- [x] Plantillas A–F en `docs/maquetas/tienda-instalar-2026-10/`; Felipe eligió el camino: hoja (Android) o franja (si hay aviso del Club), guía de iPhone, tarjeta tras separar, fila en «Mi perfil».
- [x] Manifiesto, íconos, service worker sin caché y `proxy.ts` sin redirigirlos; `lib/instalar.ts` con 22 pruebas; verificado en Chrome con aparato móvil emulado y con las herramientas de instalabilidad de Chrome (solo «en incógnito»).
- [ ] **Sin probar en aparatos reales:** un Android con Chrome (el aviso real de instalar) y un iPhone con Safari (la guía; cambia con la versión de iOS).
- [ ] **Sin medir:** cuánta gente instala. La tienda no guarda nada de esto fuera del aparato; si Felipe lo quiere, es una decisión aparte (un evento anónimo).
- [ ] **Queda fuera a propósito:** funcionar sin conexión, notificaciones y el aviso en computadora.
