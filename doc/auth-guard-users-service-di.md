# Dependencia entre AuthGuard y lookup de usuarios

## Objetivo
Explicar por qué `AuthGuard` necesita acceso a lectura de usuarios y cómo se eliminó la dependencia circular entre `AuthModule` y `UsersModule`.

## Contexto
Este proyecto usa un `AuthGuard` custom en lugar de `JwtStrategy` de Passport.

Responsabilidad actual del guard:
1. extraer bearer token
2. verificar la firma del JWT
3. validar que el `jti` no esté blocklisteado
4. cargar el usuario actual desde `UsersLookupService`
5. rechazar la request si `user.isActive === false`
6. adjuntar `request.user`

## Consecuencia arquitectónica
En el momento en que `AuthGuard` necesita leer usuarios, `AuthModule` requiere acceso a esa capacidad. Si esa lectura vive directamente dentro de `UsersModule` y `UsersModule` a la vez importa `AuthModule` para usar el guard, aparece un ciclo de dependencias.

## Problema original
Antes del refactor:

- `AuthModule` importaba `UsersModule`
- `UsersModule` importaba `AuthModule`
- Nest necesitaba `forwardRef()` en ambos lados

Eso funcionaba, pero reflejaba un acoplamiento innecesario entre autenticación y gestión de usuarios.

## Solución aplicada
Se extrajo un servicio de lectura enfocado:

- `UsersLookupService`
- expuesto desde `UsersLookupModule`

Con eso:

- `AuthModule` importa `UsersLookupModule`
- `UsersModule` importa `AuthModule`
- `UsersModule` ya no necesita ser dependencia directa de `AuthModule`
- desaparece la necesidad de `forwardRef()`

## Por qué esta es la solución correcta
Esto no se trata solo de “hacer que Nest deje de fallar”.

Refleja mejor el grafo real de dependencias:

- `AuthGuard` necesita verificar el usuario activo
- esa necesidad es de **lectura**, no de gestión completa de usuarios
- por lo tanto Auth depende de una capacidad de lookup, no del módulo completo de users

Eso reduce acoplamiento y mejora la modularidad del sistema.

## Resumen
- `UsersService` sigue siendo el servicio de casos de uso del módulo de usuarios
- `UsersLookupService` representa la dependencia mínima que autenticación necesita
- la autenticación ya no depende del módulo completo de users
- se elimina la dependencia circular sin perder validación de usuario activo
