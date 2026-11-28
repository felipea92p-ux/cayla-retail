## 🧹 Existencias sin ruido (2026-11-26, ADR-0709) — solo web, sin migración; rama `claude/revisar-utilidad-elementos-68e976`

- [x] Análisis elemento por elemento (`docs/pantallas/inventario.md`) y maqueta antes/después aprobada por Felipe.
- [x] Un solo aviso del piso; botón del barrido solo sin barrido abierto; «según el sistema» sin cuadre; fuera «Gestión», «Por colgar» en
      pausa, «Se acaban», «Sin ventas», el anillo y «Pendientes de hoy»; sonido y resumen por categoría al pie; valor a costo bajo las cifras.
- [x] Pruebas de `lib/`, `tsc`, `knip` y `knip:produccion`; guía interactiva puesta al día.
- [x] **Probado con base** (2026-11-26, noche): pila Supabase propia con todas las migraciones, Trujillo con un barrido abierto y Lima sin
      barrido ni cuadre; 1440, 1920 y 375 px, claro y oscuro. Capturas en `docs/maquetas/existencias-sin-ruido-2026-11/capturas/`. Falta
      mirarlo en TRU de verdad, después de publicar.
- [ ] **«Sin stock atrás 918»** (tarea #7 del análisis): correr la consulta B del Anexo de `docs/pantallas/inventario.md` y decidir el corte
      (tallas centrales o vendidas en 30 días). Los atajos siguen contando prendas (modelo + color), a propósito (ADR-0331 act. c).
- [ ] **¿Por qué TRU tiene capacidad 480 y no 600?** Consulta A del mismo Anexo.
- [ ] El barrido de TRU está abierto con 1 prenda escaneada: terminarlo o cancelarlo y empezar uno nuevo (lo de mayor consecuencia, §10 del análisis).

### Dónde quedó (2026-11-26, noche) — listo para fusionar cuando el CI esté en verde

Hecho y verificado con base local (una pila propia, `cayla-sin-ruido`, puertos 548xx; la compartida va 84 migraciones atrás y no tiene el
barrido):
1. **Lo que pedía la verificación, visto:** con barrido abierto, una sola banda «Barrido en curso · 7 prendas escaneadas … Al terminarlo, el piso
   queda cuadrado.», sin botón de barrido, sin franja y 0 íconos «Avisos» a 375 px; sin barrido, «Barrido del piso» y la franja con «Hacer el
   barrido» (1 ícono «Avisos» a 375); «según el sistema»; atajos Todo · Sin stock atrás · Apartadas · Dañadas; panel de dos filas; el pie con
   Descargar CSV, Resumen por categoría y Sonido al confirmar en tarjetas, tabla y por talla. Ojo: la sede tiene que ser la ACTIVA (selector o
   cookie); por `?ubicacion=` de otra sede no se lee el barrido (`enSuSede`) y se ve la franja.
2. **Tres arreglos que solo se vieron con datos** (ADR-0709, «Ajustes al verlo con base»): «Ver el valor a costo» abierto va a lo ancho bajo la
   cabecera (rompía la cabecera); «Por colgar» ya no parpadea mientras se calcula el plan (`pausaPrevista`); el pie con 16 px entre renglones
   y el sonido con 44 px con el dedo.
3. **Skills obligatorias:** `/milimetro auditar /inventario` (0 graves, `docs/milimetro/auditorias/2026-11-26-existencias-sin-ruido.md`);
   `/formidable` (leyes 7,6, oficio 7; ciega ✓ con Sonnet; `docs/formidable/existencias-sin-ruido.md`); `tema:auditar` con escenarios (0 solo
   en oscuro, 25 visitas); `guias:recorrer inventario` (35/35 a 1440 y 1920, 33/33 a 375, claro y oscuro). Los escenarios de `tema:auditar` que
   abrían «Pendientes de hoy» se pasaron al pie y a `?danados=1`, y dos que ya fallaban («Ver detalle», «Ordenar por») se arreglaron.
4. **Pruebas:** la web completa (973 archivos, 169.094 pruebas), `tsc`, `knip` y `knip:produccion` en verde.

- [ ] **Los 3 cambios de `/formidable`, para Felipe:** sin barrido, una sola puerta (quitar «Barrido del piso» de la cabecera mientras la franja
      esté a la vista; cambia la decisión 2 del ADR); «Sonido al confirmar» como `<Interruptor>` (`/unificar migrar casilla`); el porqué de «según
      el sistema» a un toque (hoy solo al pasar el mouse).
- [ ] **Abierto para Felipe:** consultas A y B del Anexo de `docs/pantallas/inventario.md` (capacidad 480 contra 600 en TRU, y cuántas de las 918
      «sin stock atrás» vendieron en 30 días) y el barrido de TRU abierto con 1 prenda.
