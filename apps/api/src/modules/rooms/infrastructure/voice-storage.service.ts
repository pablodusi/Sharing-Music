import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';

@Injectable()
export class VoiceStorageService implements OnModuleInit {
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = join(
      process.cwd(),
      this.config.get<string>('VOICE_UPLOAD_DIR', 'uploads/voice'),
    );
  }

  async onModuleInit() {
    await fs.mkdir(this.uploadRoot, { recursive: true });
  }

  /**
   * Persist an uploaded voice file on the local API disk.
   * Returns a public URL path (not a filesystem path).
   */
  async saveVoiceFile(
    file: Express.Multer.File,
  ): Promise<{ audioUrl: string; absolutePath: string }> {
    const ext = this.safeExtension(file.originalname, file.mimetype);
    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    const absolutePath = join(this.uploadRoot, filename);
    await fs.writeFile(absolutePath, file.buffer);
    return {
      audioUrl: `/uploads/voice/${filename}`,
      absolutePath,
    };
  }

  private safeExtension(originalName: string, mimeType: string): string {
    const fromName = extname(originalName).toLowerCase();
    if (['.webm', '.ogg', '.mp4', '.m4a', '.mp3', '.wav'].includes(fromName)) {
      return fromName;
    }
    if (mimeType.includes('ogg')) {
      return '.ogg';
    }
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
      return '.m4a';
    }
    return '.webm';
  }
}
