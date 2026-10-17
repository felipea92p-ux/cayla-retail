# Tienda: caché y cookies para cargar más rápido (2026-10-16) — rama `claude/tienda-cache-cookies-c8ca3e`
Estado: lo seguro está hecho y sin commitear; dos ideas esperan decisión de Felipe.

- [x] Medir en producción qué se guarda (HTML, `/_next/static`, fotos, `public/`, sesión). Resultado en la bitácora del mismo día.
- [x] Íconos y colibrí de `public/`: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` (`next.config.ts`). Sin migración.
- [ ] **Páginas de ayuda sin cuenta guardadas** (`/tiendas`, `/como-separar`, `/privacidad`, `/terminos-del-club`, `/cambios-y-devoluciones`): salen `ƒ` dinámicas
  (primer byte ~0,55–0,65 s medido desde fuera, contra ~0,37 s de una página guardada) porque `MarcoCuenta` lee `haySesion()` para elegir la cabecera.
  Camino: que el proxy mande a quien NO trae cookie de sesión a una copia estática de la página (`rewrite` + `revalidate = 300`) y deje la dinámica para quien sí.
  Cuesta tocar 5 páginas y probar que quien entra con cuenta sigue viendo su cabecera. Poca ganancia por visita; solo vale si el pie de página recibe tráfico.
- [ ] **`experimental.staleTimes.dynamic = 30`**: el navegador reutilizaría 30 s lo ya visto de Inicio, catálogo y ficha (volver atrás sería instantáneo).
  Riesgo: «cuánto hay» y los corazones podrían verse 30 s viejos (los favoritos no invalidan esa caché; la bolsa sí, porque escribe una cookie desde una acción).
  No se activó porque no se puede probar con una cuenta real en producción; hacerlo con el banco de pruebas ([[banco-de-pruebas-tienda]]) y decidir si 30 s de stock viejo es aceptable.
