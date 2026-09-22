# FerroSync

Planificación ferroviaria, operación por tramos, formación por vagón y seguimiento de imprevistos.

Esta versión incorpora servidor compartido, autenticación y permisos del servidor, respaldos y recuperación. El modo local sigue disponible para pruebas y para conservar los datos existentes. La sincronización entre dispositivos requiere publicar la API con PostgreSQL configurado.

## Estado de puesta en marcha

El 21/09/2026 se activó el servidor compartido en Vercel con PostgreSQL de Neon, cuenta administradora inicial y `CRON_SECRET`. Se verificó el flujo remoto contra la base real: sesiones independientes, novedades, formación, inicio desde móvil, estado En Tránsito en Logística, persistencia al recargar, cierre, PDF, permisos, conflictos, copias y restauración. Los datos y cuentas temporales se retiraron restaurando el estado inicial; las copias y la auditoría de la prueba pueden permanecer retenidas.

La aplicación compartida está publicada en [Vercel](https://ferrosync.vercel.app/). [GitHub Pages](https://aquiguedes1985-creator.github.io/ferrosync/) solo ofrece el modo local. La publicación actual se realizó con Vercel CLI autenticado; la integración automática GitHub–Vercel no está activada.

## Ejecutar y probar

```sh
npm ci
npm run build
npm start
```

Abrir `http://127.0.0.1:8765/`. Sin variables de servidor, la aplicación usa IndexedDB local. Consultar [SERVIDOR.md](SERVIDOR.md) para activar PostgreSQL, dar de alta la primera cuenta y configurar las copias automáticas.

```sh
npm run check
npm test
npm run test:viajes
npm run test:server
```

En Windows las pruebas usan Edge; en Linux, Chromium instalado con `npx playwright install --with-deps chromium`. Las pruebas del servidor abren dos contextos independientes y verifican el recorrido ayudante → Logística, permisos, conflictos, formación, PDF, cierre de tramos y restauración. GitHub Actions repite el flujo del servidor contra PostgreSQL 17 en un servicio efímero.

Los resultados están en `artifacts/local/`, `artifacts/viajes/` y `artifacts/servidor/`. No se publican cuentas de prueba en la base de producción.

## Funciones

- Administración habilita empresas y cuentas, asigna funciones y revoca acceso. Los usuarios no eligen su rol en el servidor.
- La sincronización consulta cambios cada cinco segundos y rechaza escrituras sobre revisiones antiguas.
- La tripulación asignada registra novedades. Solo el conductor inicia/cierra el tramo y envía GPS.
- La formación registra matrícula, carga, tara, neto, bruto, alta y baja por tramo. El tonelaje y el PDF se recalculan; los tramos cerrados se conservan.
- Las notas informativas se separan de los imprevistos con categoría, gravedad, responsable y estado. Cada cambio de seguimiento queda registrado.
- Hay exportación/importación local completa y respaldos del servidor por empresa, con copia previa, cuentas y auditoría. El servidor conserva 30 copias por empresa.

## Límites operativos

El modo servidor requiere conexión para guardar y no ofrece una cola de escrituras desconectadas. Los datos locales no se migran automáticamente. Las copias automáticas dentro de la misma base no sustituyen un respaldo externo contra pérdida del proveedor. El GPS necesita permiso real; las estaciones y capacidades heredadas siguen siendo datos de ejemplo sin validación ferroviaria oficial.

## Fuentes

`original.html` se conserva como referencia. `build.cjs` combina las correcciones de `fixes.js`, `helpers.js`, `viajes.js` y `colaboracion.js`, generando `app.js`, `index.html` y `dist/`. El dominio operativo está en `domain.cjs`; la API, las sesiones y el almacenamiento están en `backend/`; `api/sync.js` es la entrada de Vercel. No editar únicamente los archivos generados.
