# Dependencia entre AuthGuard y UsersService en MdmModule

## Objetivo
Explicar por qué `AuthGuard` necesita acceso a `UsersService` y qué relación de módulos debe existir cuando el guard se usa desde `MdmModule`.

## Contexto
Este proyecto usa un `AuthGuard` custom en lugar de `JwtStrategy` de Passport.

Responsabilidad actual del guard:
1. extraer bearer token
2. verificar la firma del JWT
3. validar que el `jti` no esté blocklisteado
4. cargar el usuario actual desde `UsersService`
5. rechazar la request si `user.isActive === false`
6. adjuntar `request.user`

## Consecuencia arquitectónica
En el momento en que `AuthGuard` depende de `UsersService`, cualquier módulo que consuma `AuthGuard` debe poder resolver esa dependencia dentro del grafo de DI de Nest.

## Por qué esto impacta a `MdmModule`
`MdmModule` usa `AuthGuard` en controllers como:
- `MdmDevicesController`
- `MdmOrganizationsController`

Si `MdmModule` importa solo `AuthModule`, pero el guard exportado necesita internamente `UsersService`, Nest puede fallar al resolver `UsersService` dentro de ese contexto.

## Relación de módulos requerida
Para que la resolución de dependencias sea coherente:
- `UsersModule` debe exportar `UsersService`
- `MdmModule` debe importar `UsersModule` además de `AuthModule`

En la implementación actual, `MdmModule` ya importa `UsersModule`, que es lo correcto porque el guard valida el usuario activo contra la fuente de verdad de usuarios.

## Por qué esta es la solución correcta
Esto no se trata solo de “hacer que Nest deje de fallar”.

Refleja el grafo real de dependencias:
- `MdmModule` usa `AuthGuard`
- `AuthGuard` usa `UsersService`
- `AuthGuard` también consulta la blocklist de tokens
- por lo tanto `MdmModule` debe tener acceso a `UsersService`

Eso es composición correcta de módulos, no un workaround.
