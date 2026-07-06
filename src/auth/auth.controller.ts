import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './dto/auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiTags,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('api/v1/auth')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({
    summary: 'Authenticate a user',
    description:
      'Validates email and password credentials and returns a short-lived JWT access token and a long-lived refresh token.',
  })
  @ApiBody({ type: AuthDto })
  @ApiOkResponse({
    type: AuthResponseDto,
    description: 'User authenticated successfully.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  async signIn(@Body() authDto: AuthDto): Promise<AuthResponseDto> {
    return await this.authService.signIn(authDto.email, authDto.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh session tokens',
    description:
      'Receives a valid refresh token, rotates it, and returns a new pair of access and refresh tokens.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    type: AuthResponseDto,
    description: 'Tokens refreshed successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or revoked refresh token.',
  })
  @ApiForbiddenResponse({
    description:
      'Refresh token reuse detected. All sessions in this family have been revoked.',
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return await this.authService.refresh(dto.refresh_token);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({
    summary: 'Revoke a session',
    description:
      'Revokes the refresh token session and blocklists the current access token through the stored session metadata.',
  })
  @ApiBody({ type: LogoutDto })
  @ApiOkResponse({ description: 'Session revoked successfully.' })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or malformed refresh token.',
  })
  async logout(@Body() dto: LogoutDto): Promise<{ message: string }> {
    await this.authService.logout(dto.refresh_token);
    return { message: 'Session revoked successfully.' };
  }
}
