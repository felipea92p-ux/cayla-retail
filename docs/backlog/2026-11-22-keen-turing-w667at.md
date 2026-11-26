# Barrido del piso (ADR-0690) — lo que falta

- [x] ~~`20261122195000_barrido_piso_por_resolver.sql`~~ — pegada por Felipe el 2026-11-23: la actividad 8 está encendida.
- [x] ~~`20261122196000_barrido_piso_historial.sql`~~ — pegada por Felipe el 2026-11-23: el historial está encendido.
- [x] **Actividad 9, historial de barridos** (2026-11-23): lista y detalle, con su prueba (sección H de `barrido_piso_confirmar.mjs`).
- [x] **Actividad 10, cierre** (2026-11-23): `/formidable`, prueba a ciegas, `/chaos` y `/milimetro` (`2026-11-23-barrido-en-el-celular.md`).
- [ ] **Decisión de Felipe (RPC, de `/chaos`):** acotar la hora del aparato en `registrar_lecturas_barrido`. Hoy acepta cualquier fecha:
      un reloj atrasado desordena los tramos y el «desde / hasta» del historial. Las cantidades no cambian.
- [ ] **Decisión de Felipe (RPC, de `/chaos`):** el «id reusado» no aguanta dos lotes a la vez con el mismo id y distinto contenido
      (casi imposible con `crypto.randomUUID`, pero el candado promete más de lo que cumple).
- [ ] **Decisión de Felipe (de `/chaos`):** un celular con la hora corrida más de 5 min no puede sumar (22007, «hora fuera de rango»).
      Hay dos caminos: traducir el mensaje o corregir con la hora del servidor (`fn_actor_persona_id` es común a otras pantallas).
- [ ] **Decisión de Felipe (de `/chaos`):** la hoja de confirmar no avisa si la MISMA persona escanea desde otro aparato. Con varias
      personas sí avisa.
- [ ] La flecha «Volver» de `EncabezadoPagina` mide 42 px con el dedo (pide 44): es la pieza común, va a `/unificar`.
- [ ] **Decisión de Felipe:** en Tienda LIM, una prenda cuya fila mezcla unidades de CAYLA y de CLAURE no se mueve al confirmar
      (`dos_duenos`). ¿Se reparte por una regla fija (primero la casa) o se sigue moviendo a mano en Existencias? Al 2026-11-23 no hay
      ninguna fila así en producción.
- [ ] **Decisión de Felipe:** ¿un barrido mensual debe cortar la medida de Frescura como cualquier cuadre? Hoy sí.
- [ ] Una no cargada cuya talla se fusionó con otra (la juntada queda inactiva) solo se puede resolver como «No era de aquí».
- [ ] Las reservas de número (`pnpm reservar`) fallaron con 403 desde esta sesión: ADR-0690 y las migraciones `20261122190000`–`195000` se
      eligieron por encima de toda reserva existente, sin etiqueta.
