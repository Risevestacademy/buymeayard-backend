import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllCatalogue() {
    return this.prisma.material.findMany({
      where: { status: 'ACTIVE' },
    });
  }

  async findCatalogueBySlug(slug: string) {
    const material = await this.prisma.material.findUnique({
      where: { slug },
    });
    if (!material) {
      throw new NotFoundException(`Material with slug ${slug} not found`);
    }
    return material;
  }
}
