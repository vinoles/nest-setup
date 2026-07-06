# Contrato HTTP para usuario inactivo

## Objetivo
Definir la respuesta HTTP cuando un usuario inactivo intenta autenticarse o acceder a una ruta protegida.

## Decisión
La API debe responder con:
- **HTTP status:** `403 Forbidden`
- **message:** `User account is inactive`

## Por qué `403` y no `401`
Esta diferencia importa.

- `401 Unauthorized` significa que las credenciales faltan, son inválidas, expiraron o no pueden confiarse.
- `403 Forbidden` significa que la identidad ya fue resuelta, pero el estado de la cuenta o las reglas del sistema impiden el acceso.

Para un usuario inactivo:
- el email puede ser correcto,
- la contraseña puede ser correcta,
- el JWT puede ser válido,
- el refresh token puede seguir siendo estructuralmente válido.

El verdadero bloqueo es el estado de la cuenta. Por eso `403 Forbidden` es la semántica correcta.

## Escenarios cubiertos por este contrato
El mismo contrato debe aplicarse de forma consistente en estos casos:
- usuario inactivo intenta `POST /api/v1/auth/login`
- usuario inactivo intenta `POST /api/v1/auth/refresh`
- usuario inactivo intenta `POST /api/v1/auth/logout`
- usuario inactivo consume una ruta protegida por JWT

## Alcance del contrato
Este contrato aplica cuando la identidad ya fue resuelta y el único motivo de rechazo es el estado de la cuenta.

No aplica para:
- credenciales inválidas (`401 Unauthorized`)
- refresh token inválido, expirado o revocado (`401 Unauthorized`)
- reuse detection de refresh token (`403 Forbidden` con el mensaje específico del flujo de rotación)

## Por qué la consistencia importa
Si la API devuelve distintos status o mensajes para la misma regla de estado de cuenta, el frontend termina codificando excepciones que deberían resolverse en backend.

Un contrato uniforme simplifica:
- manejo en frontend
- criterios de QA
- documentación del API
- reglas futuras de monitoreo o auditoría

## Payload sugerido
El envelope exacto depende del exception filter global, pero el contrato de negocio relevante debería verse así:

```json
{
  "statusCode": 403,
  "message": "User account is inactive"
}
```

Campos adicionales como `timestamp` y `path` pueden ser agregados por el exception filter global.
