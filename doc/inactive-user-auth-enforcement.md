# Bloqueo de autenticación para usuarios inactivos

## Objetivo
Documentar el comportamiento esperado cuando un usuario tiene `isActive = false`.

## Decisión
Los usuarios marcados como inactivos no deben poder autenticarse por ningún punto de entrada que cree, renueve o reutilice acceso a la aplicación.

Esto implica bloquear los siguientes flujos:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- cualquier ruta protegida por `AuthGuard`

## Por qué importa
`isActive` no es un dato decorativo. Es una regla de estado de cuenta.

Si un usuario inactivo todavía puede:
- hacer login,
- refrescar tokens,
- o seguir entrando con un JWT ya emitido,

entonces el atributo pierde valor operativo.

## Comportamiento esperado
### Login
Durante el login, después de validar credenciales, la aplicación debe comprobar `user.isActive` antes de emitir:
- access token JWT
- refresh token

Si `isActive === false`, la solicitud debe ser rechazada.

### Flujo de refresh
El refresh también debe validar el estado actual del usuario. Un refresh token emitido previamente no debe permitir que un usuario inactivo prolongue su sesión indefinidamente.

### Logout
El logout revoca la sesión de refresh y blocklistea el access token asociado a esa sesión. Si el usuario ya está inactivo, el sistema debe mantener el mismo criterio de acceso denegado en toda la superficie de auth.

### Rutas protegidas
Una firma JWT válida no es suficiente. Antes de llegar al controller, la request debe verificar que el usuario detrás del token sigue activo.

## Puntos recomendados de implementación
- `AuthService.signIn()`
- `AuthService.refresh()`
- `AuthService.logout()`
- `AuthGuard.canActivate()`

Esto alinea la protección con las tres superficies reales de autenticación:
- autenticación inicial
- renovación de sesión
- revocación de sesión
- autorización de requests

## Nota de diseño
Este NO es solo un problema de login. Es un problema de ciclo de vida de sesión.

Si el sistema bloquea usuarios inactivos solo en login, entonces los tokens ya emitidos siguen rompiendo la intención de la regla de negocio.
