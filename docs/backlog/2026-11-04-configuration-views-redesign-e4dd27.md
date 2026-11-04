# Configuración, vista por vista (2026-11-04)

Hecho en la rama, sin PR: «Tiendas y caja» partida en «Metas» y «Empresa y tiendas», y Empresa y tiendas construida como «Las vitrinas».

Felipe eligió las 5 pestañas y pidió mejorar las piezas: menos texto, nada muy pequeño, más visual. Se sigue vista por vista: primero Empresa y tiendas, en `docs/maquetas/empresa-tiendas-2026-11/` eligió A · Las vitrinas, y su versión en vidrio líquido está en `docs/maquetas/empresa-tiendas-vitrinas-2026-11/`, ya construida. Antes de repetir ese lenguaje en las otras vistas hay que medir su costo en el Mac mini y en un celular de tienda.

Pendiente, además de elegir, de la propuesta de `docs/maquetas/configuracion-vistas-2026-11/`:

- [ ] Construir las 5 pestañas: juntar Cuentas + Caja y avisos en «Dinero», y Gastos fijos + Presupuesto + Reparto CLAURE en «Gastos».
- [ ] «Lo normal» como primera fila de la tabla de meses; Fechas especiales al lado o debajo.
- [ ] Campañas: plegarlas o quitarlas (decisión de negocio: es la única forma de subir el fondo solo en una campaña).
- [ ] Presupuesto: empezar en vacío con «Sugerir»; con topes, una sede a la vez.
- [ ] Impuestos: primero lo que falta confirmar; lo de arrancar, plegado.
- [ ] Cuentas: sin «Cuenta contable», «Tipo» ni «activa» en la lista; cajones plegados.
- [ ] Un solo responsable junto a las pestañas y un solo título (`TituloSeccion`) en todas las vistas.
- [ ] Decidir dónde se edita el WhatsApp de cada tienda: hoy, aquí y en Tienda web ▸ Datos y plazos.
- [ ] Revisar con Felipe la hora de cierre de las sedes: sin ella no sale el aviso de cierre de caja ni la proyección del día.
- [ ] `/focus` de `/configuracion` y sus modales sigue pendiente; `/chaos` de las pantallas que guardan, al construir lo elegido.
- [ ] Ver Reparto CLAURE en el navegador: a la base local le faltan sus migraciones (`/actualizar-flujo`, orden de Felipe).
- [x] Dos pestañas: guardar desde una página vieja ya no borra una meta ni un fondo (`lib/metas-frescas.ts`). Queda un margen de milisegundos si dos personas guardan a la vez; cerrarlo del todo pediría funciones de la base que cambien un solo dato.
- [ ] Un WhatsApp escrito con letras queda vacío y borra el número al salir (lo avisa, y así era antes). Un fondo con decimales se guarda exacto, pero la tarjeta lo muestra redondeado.
- [ ] Medir Las vitrinas en el Mac mini y en un celular de tienda: Felipe.
- [ ] `/configuracion` sigue `pendiente` en la guía de foco: «qué falta» de cada pestaña es decisión de Felipe.

