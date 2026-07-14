import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  const prefix = process.env.API_PREFIX ?? 'api/v1';
  app.setGlobalPrefix(prefix);

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',');
  app.enableCors({ origin: origins, credentials: true });

  const swagger = new DocumentBuilder()
    .setTitle('FerroGestor API')
    .setDescription('API central Bufalo Sucatas / FerroGestor')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`FerroGestor API em http://localhost:${port}/${prefix}`);
  console.log(`Swagger em http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
