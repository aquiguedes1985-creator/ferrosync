# PDF y observaciones de viajes

1. En los viajes activos y en el historial, abrir **Detalle / PDF** y luego **Exportar a PDF**. En el cuadro de impresion del navegador, elegir guardar como PDF. El informe incluye la carga declarada, toneladas, locomotora, tripulacion, ruta y observaciones. No suma toneladas repetidas entre tramos ni calcula pesos por vagon que no fueron registrados.
2. Observado es independiente de Programado o En Transito. **Ver observados** muestra viajes con novedades, incluidos los finalizados; el contador corresponde a viajes activos observados.
3. El conductor puede registrar observaciones al iniciar y finalizar cada tramo. La tripulacion asignada y Logistica pueden agregar novedades mientras el viaje permanezca abierto. Cada entrada conserva autor, fecha, tramo y momento del servicio.
4. Las observaciones se agregan a un registro acumulativo. No se borran ni reemplazan las entradas anteriores. El cierre conserva una copia del viaje en el historial y deshabilita nuevas anotaciones.
5. Las asignaciones de ayudante usan las cuentas del rol Maquinista, como en el modelo existente. Solo el conductor inicia y cierra tramos.
6. Los datos siguen siendo locales al navegador. No hay sincronizacion entre dispositivos. Los registros antiguos sin detalle de carga no permiten reconstruir esa informacion.

Fuentes: fixes.js, helpers.js, viajes.js y build.cjs. Regenerar index.html y app.js con `node build.cjs`.

Pruebas: `node test.cjs` y `node test-viajes.cjs`. La segunda usa datos aislados de prueba y genera artifacts/viajes/viaje-OBS-001.pdf, salvo que se indique otro ARTIFACT_DIR. Ambas aceptan BASE_URL para verificar las publicaciones.
