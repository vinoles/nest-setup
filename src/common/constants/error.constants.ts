export const INTERNAL_ERROR_MESSAGE = 'Internal server error';

export function extractExceptionMessage(
  response: unknown,
): string | string[] | undefined {
  if (typeof response === 'string') {
    return response;
  }

  if (Array.isArray(response)) {
    return response;
  }

  if (response && typeof response === 'object' && 'message' in response) {
    return (response as { message: string | string[] | undefined }).message;
  }

  return undefined;
}