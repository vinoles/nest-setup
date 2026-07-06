import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { INTERNAL_ERROR_MESSAGE } from '../../src/common/constants/error.constants';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let loggerErrorSpy: jest.SpyInstance;

  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

  const makeHost = (method = 'GET', url = '/test') =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue({ status: mockStatus }),
        getRequest: jest.fn().mockReturnValue({ method, url }),
      }),
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new HttpExceptionFilter();
    loggerErrorSpy = jest
      .spyOn((filter as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation();
  });

  it('responds with the HttpException status and string message', () => {
    filter.catch(new NotFoundException('User not found'), makeHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'User not found',
        path: '/test',
      }),
    );
  });

  it('extracts the message from an HttpException object response', () => {
    filter.catch(new ForbiddenException('Insufficient permissions'), makeHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Insufficient permissions',
      }),
    );
  });

  it('responds with 500 for unknown errors', () => {
    filter.catch(new Error('Something exploded'), makeHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: INTERNAL_ERROR_MESSAGE,
      }),
    );
  });

  it('includes a timestamp and path in every response', () => {
    filter.catch(new NotFoundException(), makeHost('POST', '/api/v1/users'));

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
        path: '/api/v1/users',
      }),
    );
  });

  it('extracts message from object response with message field', () => {
    const exception = new BadRequestException({ message: 'Validation failed', field: 'email' });
    filter.catch(exception, makeHost());

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
      }),
    );
  });

  it('extracts messages from array response (validation errors)', () => {
    const exception = new BadRequestException(['email is required', 'password is required']);
    filter.catch(exception, makeHost());

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['email is required', 'password is required'],
      }),
    );
  });

  it('falls back to default message when getResponse returns unexpected object', () => {
    const exception = new BadRequestException({ error: 'X123', reason: 'bad_input' });
    filter.catch(exception, makeHost());

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: INTERNAL_ERROR_MESSAGE,
      }),
    );
  });
});
