# FerroSync: servidor compartido

## Puesta en marcha

La aplicación admite dos modos claramente separados:

- **Local:** `npm start` sin variables de base. Conserva IndexedDB, cuentas locales y uso sin conexión. No comparte datos entre equipos.
- **Servidor:** `DATABASE_URL` apunta a PostgreSQL. En Vercel la API exige una base configurada y no ofrece autenticación local como alternativa ante un fallo.

Instalar dependencias con `npm ci`, generar con `npm run build` y arrancar con `npm start`. Para una prueba persistente de un solo proceso se puede configurar `FERRO_DATA_FILE=private-data/state.json`. Ese archivo está excluido de Git y nunca se entrega por HTTP. No usar ese almacenamiento en Vercel.

Para crear la primera cuenta, definir `ADMIN_NAME`, `ADMIN_PASSWORD` (12 a 128 caracteres), `ADMIN_COMPANY` y `DATABASE_URL` en un entorno de confianza y ejecutar `npm run bootstrap`. El comando se niega a crear otra cuenta inicial si ya existen usuarios. Retirar las variables de alta inicial después. No existe registro público en el servidor.

## Permisos y sincronización

Administración habilita empresas, crea cuentas, asigna funciones y revoca accesos. Los roles operativos son Logística y Maquinista; ayudante y piloto son asignaciones del viaje para cuentas de tripulación. Solo el conductor asignado inicia/cierra tramos y transmite ubicación. El ayudante puede agregar novedades y modificar la formación de tramos pendientes.

El servidor identifica la sesión con una cookie HttpOnly, SameSite=Strict y Secure en Vercel; vuelve a comprobar permisos en cada solicitud. Las contraseñas se derivan con scrypt y sal individual. Las cuentas están separadas por empresa; la función Administrador es una administración global de empresas y cuentas.

Los navegadores consultan cambios cada cinco segundos mientras la sesión está abierta. El servidor guarda cada cambio en una transacción PostgreSQL y comprueba la revisión. Ante conflicto, rechaza el cambio, actualiza los datos y pide repetirlo. No mezcla ni sobrescribe silenciosamente operaciones concurrentes.

Sin conexión, una sesión ya abierta mantiene en pantalla su última consulta; las escrituras necesitan confirmación del servidor. No existe una cola de operaciones desconectadas. Las credenciales y sesiones del servidor no se guardan en IndexedDB. El service worker no almacena respuestas de `/api/`.

## Formación e imprevistos

En Detalle / PDF se registran matrícula, carga, tara y peso neto. El bruto se calcula como tara más neto. El primer vagón sustituye el tonelaje manual por la suma de los pesos brutos registrados. Hay que completar toda la formación. Alta y baja se indican por el tramo desde el cual aplican; solo se permiten en tramos pendientes. Cada movimiento genera una nota informativa y recalcula el tonelaje por tramo, sin alterar tramos cerrados.

Una nota informativa no genera una alerta. Un imprevisto tiene categoría, gravedad, responsable y estado Pendiente, En atención o Resuelto. El seguimiento conserva quién hizo cada cambio y cuándo. Puede resolverse incluso después de terminado el viaje. El PDF incluye formación, pesos por tramo y novedades.

## Respaldos

El respaldo local exporta todas las empresas, cuentas locales, locomotoras, personal, viajes e historial. Su restauración descarga primero una copia previa.

El respaldo del servidor se exporta por empresa e incluye datos operativos, cuentas con sus claves derivadas y auditoría. No incluye sesiones activas. Administración puede importar un archivo o restaurar una copia retenida. Se valida empresa, formato y versión; se guarda una copia antes de restaurar. La cuenta administradora que ejecuta la restauración conserva su acceso actual y las otras sesiones de esa empresa se revocan.

Se conservan las últimas 30 copias por empresa. Hay una copia por actividad al comenzar cada día y un cron diario a las 06:00 UTC (03:00 de Uruguay). Configurar `CRON_SECRET` en Vercel; el cron rechaza llamadas sin su secreto. Las copias están dentro de la misma base y no protegen frente a la pérdida total del proveedor: guardar exportaciones en almacenamiento independiente para recuperación ante desastre. Los respaldos contienen datos sensibles y deben guardarse con acceso restringido.

El límite actual de importación es 2 MB. El almacenamiento usa un documento transaccional con bloqueo por escritura, apropiado para una operación pequeña; una operación grande requerirá separar entidades en tablas, paginar y aumentar la capacidad. El plan gratuito del proveedor tiene cuotas; no se contrata ampliación automática desde el código.

## Publicaciones

`vercel.json` instala dependencias, genera `dist/` y entrega la API Node en `api/sync.js`. `DATABASE_URL` y `CRON_SECRET` son variables privadas del servidor. No exponerlas como configuración pública.

El repositorio debe estar conectado al proyecto Vercel en Settings / Git. Las pruebas GitHub incluyen navegador local y dos sesiones con servidor. Para impedir promociones con pruebas fallidas, configurar las comprobaciones de despliegue en el plan de Vercel que las admita, o exigir las pruebas en una rama protegida antes de integrar a `main`. La conexión Git por sí sola dispara el despliegue en paralelo con CI.

Como alternativa a la conexión Git nativa, el workflow incluye `publicar-vercel`, dependiente del éxito de todas las pruebas. Para activarlo, configurar el secreto GitHub `VERCEL_TOKEN` y la variable `VERCEL_DEPLOY_ENABLED=true`; sus identificadores de proyecto/equipo apuntan al FerroSync existente. Publica únicamente cambios de `main`, nunca pull requests. Mantener una sola vía de publicación para evitar despliegues duplicados. Este trabajo no configuró el token ni activó la variable.

GitHub Pages continúa siendo una aplicación local; no ejecuta la API. Los enlaces y datos del modo local no se migran automáticamente al servidor. Crear primero las cuentas autorizadas y efectuar una migración administrada de los datos existentes; conservar el respaldo original.

## Verificación reproducible

```sh
npm run build
npm run check
npm test
npm run test:viajes
npm run test:server
```

La prueba del servidor usa la misma API y reglas operativas con un almacenamiento transaccional en memoria y dos contextos de navegador independientes. En GitHub Actions utiliza PostgreSQL 17 real, aislado de producción. Comprueba permisos reales, conflictos, novedades entre sesiones, notas/imprevistos, formación por tramo, PDF, pantalla de 390 px, combustible, kilometraje, copias programadas y restauración. No sustituye la prueba del despliegue público contra Neon; registrar esa prueba por separado al publicar.
