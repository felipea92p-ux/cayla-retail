## ⏱️ Entrar a un módulo al instante, desde su hija y en Productos (2026-11-10, ADR-0628 act.) — solo web, sin migración; rama `claude/productos-loading-delay-099922`

- [x] El marco navega por `entrarAlInstante` y suelta el esqueleto cuando termina la transición de la navegación (menú, logo, buscador global).
      Arregla las 7 filas con hijas en el menú. Medido antes en producción: Marcas → Productos, 2,6 s sin ningún cambio.
- [x] `productos/page.tsx` con `<Suspense fallback={<EsperaPantalla />}>`: el esqueleto sale apenas responde el servidor, también al volver
      desde una ficha. Verificado en local: Grilla → Tabla sin esqueleto, el historial abre en su hoja.
- [ ] **Auditoría de todos los módulos** (pedido de Felipe, después de este PR): qué pantallas no tienen límite de carga propio y dejan la
      anterior quieta al llegar por un enlace que no es el menú. Sin `loading.tsx` ni `Suspense` en su página al 2026-11-10: `/clientas`,
      `/inventario`, `/produccion`, `/vender`, y las hijas de Productos (Marcas, Categorías, Atributos, Familias, Por revisar). Ojo con las
      carpetas que tienen una ranura `@modal`: ahí el límite va en la página, no en `loading.tsx` (Next lo aplica a cada ranura). Compras
      ya tiene `loading.tsx` y `@modal`: revisar si su hoja dibuja un esqueleto de pantalla entera debajo de la lista al abrirse.
- [ ] Los enlaces de «Volver» y las tarjetas del Inicio podrían pasar por `entrarAlInstante` para tener el esqueleto con nombre en el mismo
      cuadro (hoy: el de la página, cuando responde el servidor).
- [ ] **Sin medir en producción** hasta que se publique: repetir Marcas → Productos y Movimientos → Existencias con la sesión de Felipe.
