## 🧵 Modelo nuevo sin tipo de fábrica (2026-10-30, ADR-0396 act.) — solo web, sin migración; rama `claude/modelo-nuevo-sin-tipo-de-fabrica`

- [x] El modelo nuevo nace sin tipo; la guía de foco lo pide primero y «Crear orden» espera. Un modelo existente sigue en Lote. Reglas con prueba (`tipoAlElegir`, `tipoElegidoAMano`, `problemasDelModelo`, `camposDeGuiaOrden`, nota neutra, enlace a Nuevo producto sin `tipo`); `tsc`, ESLint y la batería completa de la web en verde.
- [x] Probado en el navegador con el entorno local (sin guardar ninguna orden): modelo existente → Lote sin marca; pasar a «Crear un modelo nuevo» → nada elegido y sin pulgar; Lote → la guía pasa a Nombre; Muestra → el precio deja de faltar; y a 375 px sin desplazamiento horizontal.
- [x] Guía interactiva de Nueva orden al día (el paso «¿Lote o muestra?» ya no dice «uno nuevo arranca como Muestra»); la huella de controles no cambió.
- [ ] **Sin correr:** `tema:auditar` (el chip «por elegir» usa el tono `neutro` de `<Chip>`, solo tokens), `guias:recorrer`, `/chaos` y `/formidable` de Nueva orden.
- [ ] **OP-000005 (Vestido Rebeca, 68 prendas) sigue como muestra en producción**: Felipe dijo «es un lote». Falta su precio a tienda en los 5 colores (VES-0053-BEI/CHO/NEG/PER/VIN-STD) y pasarla con «Pasar a lote» cuando el PR #1500 esté publicado. No tiene apuro: solo lleva corte.
- [ ] **Tres tipos para lo mismo** (`Tipo` del formulario, `TipoOrden` de `modelo-nuevo-orden-reglas`, `TipoDeOrden` de `borrador-orden`): dos sobran. No se unificó aquí para no mezclar el cambio con un refactor.
