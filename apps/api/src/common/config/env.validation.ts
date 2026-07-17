import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  PORT = 3001;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @IsNotEmpty()
  AUTH0_DOMAIN!: string;

  @IsString()
  @IsNotEmpty()
  AUTH0_AUDIENCE!: string;

  @IsUrl({ require_tld: false })
  AUTH0_ISSUER_URL!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS = 'http://localhost:3000';

  @IsOptional()
  @IsString()
  VOICE_UPLOAD_DIR = 'uploads/voice';
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
