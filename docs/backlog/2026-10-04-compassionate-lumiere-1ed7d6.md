## 🧾 Inicio de Almacén = «Para hoy» de Existencias (2026-10-04, ADR-0331 act. b) — solo web, sin migración; rama `claude/compassionate-lumiere-1ed7d6` (apilada sobre `claude/kind-lederberg-a5bb65`)

- [x] Una sola cuenta de «por colgar» (`porColgarDeLaSede`) para «Para hoy» y el Inicio; `resumirPorColgar` borrado (era la segunda definición).
- [x] Aviso «Por colgar» (tallas, «Baja al piso N tallas por colgar», a `/inventario?hoy=por_colgar`) y bloque lateral con «Bajar al piso». La clave `reponer` no cambia (cookie de «Ajustar»).
- [x] Prueba: el mismo stock da la misma cifra en el aviso, el bloque, «Para hoy» y la lista filtrada; un candado de fuente exige que las dos pantallas llamen a la función compartida.
- [x] Verificado en local (arnés temporal, sin cuenta de Almacén en la semilla): Trujillo, 15 tallas · 75 guardadas en el Inicio y en Existencias; «Bajar al piso» con 15 líneas; 375 px sin desborde.
- [ ] Probarlo con una cuenta de Almacén real en producción (en local no existe ninguna con ese perfil).
- [ ] El Inicio no dice «sin stock atrás» (tallas agotadas que hay que pedir a otra sede): si la cuenta Almacén es la que pide, decidir si va como aviso propio.
