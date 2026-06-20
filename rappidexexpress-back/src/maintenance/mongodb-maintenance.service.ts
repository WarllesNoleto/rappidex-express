import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const DEFAULT_CUTOFF = '2026-06-01T00:00:00.000Z';
const CLEANUP_COLLECTIONS = [
  'ifood_events',
  'ifood_webhook_events',
  'ifood_polling_events',
  'ifood_order_events',
  'ifood_import_logs',
  'logs',
  'webhook_logs',
  'events',
  'orders',
  'deliveries',
  'ifood_event_entity',
  'log_entity',
  'delivery_entity',
];
const DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'receivedAt',
  'date',
  'created_at',
];

@Injectable()
export class MongodbMaintenanceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async diagnostics(cutoffInput = DEFAULT_CUTOFF) {
    const cutoff = this.parseCutoff(cutoffInput);
    const db = (this.dataSource.mongoManager.connection as any).db;
    const collections = await db.listCollections().toArray();
    const stats = await Promise.all(
      collections.map(async ({ name }) =>
        this.describeCollection(name, cutoff),
      ),
    );

    return {
      cutoff: cutoff.toISOString(),
      collections: stats.sort(
        (a, b) => b.storageSizeBytes - a.storageSizeBytes,
      ),
      cleanupTargets: stats.filter((item) =>
        CLEANUP_COLLECTIONS.includes(item.name),
      ),
    };
  }

  async preview(
    cutoffInput = DEFAULT_CUTOFF,
    collections = CLEANUP_COLLECTIONS,
  ) {
    const cutoff = this.parseCutoff(cutoffInput);
    const uniqueCollections = this.normalizeCollections(collections);
    const items = await Promise.all(
      uniqueCollections.map((name) => this.describeCleanupTarget(name, cutoff)),
    );

    return {
      cutoff: cutoff.toISOString(),
      dryRun: true,
      totalToDelete: items.reduce(
        (sum, item) => sum + item.beforeCutoffCount,
        0,
      ),
      collections: items,
    };
  }

  async cleanup(
    cutoffInput = DEFAULT_CUTOFF,
    collections = CLEANUP_COLLECTIONS,
    confirm = false,
  ) {
    if (confirm !== true) {
      throw new BadRequestException(
        'Envie confirm: true para executar a limpeza. Use dryRun/preview antes de apagar.',
      );
    }

    const cutoff = this.parseCutoff(cutoffInput);
    const targets = await this.preview(cutoff.toISOString(), collections);
    const db = (this.dataSource.mongoManager.connection as any).db;
    const results = [];

    for (const target of targets.collections) {
      if (
        !target.exists ||
        !target.dateField ||
        target.beforeCutoffCount === 0
      ) {
        results.push({
          ...target,
          deletedCount: 0,
          remainingCount: target.totalCount,
        });
        continue;
      }

      const result = await db
        .collection(target.name)
        .deleteMany(this.buildDateFilter(target.dateField, cutoff));
      const afterStats = await this.describeCleanupTarget(target.name, cutoff);
      results.push({
        ...target,
        deletedCount: result.deletedCount || 0,
        remainingCount: afterStats.totalCount,
        remainingBeforeCutoffCount: afterStats.beforeCutoffCount,
      });
    }

    return {
      cutoff: cutoff.toISOString(),
      deletedTotal: results.reduce((sum, item) => sum + item.deletedCount, 0),
      collections: results,
    };
  }

  private async describeCollection(name: string, cutoff: Date) {
    const db = (this.dataSource.mongoManager.connection as any).db;
    const collection = db.collection(name);
    const stats = await db
      .command({ collStats: name })
      .catch(() => ({}) as any);
    const totalCount = await collection.countDocuments();
    const dateField = await this.resolveDateField(name);
    const beforeCutoffCount = dateField
      ? await collection.countDocuments(this.buildDateFilter(dateField, cutoff))
      : 0;

    return {
      name,
      totalCount,
      beforeCutoffCount,
      dateField,
      sizeBytes: Number(stats.size || 0),
      storageSizeBytes: Number(stats.storageSize || 0),
      avgObjSizeBytes: Number(stats.avgObjSize || 0),
      indexSizeBytes: Number(stats.totalIndexSize || 0),
    };
  }

  private async describeCleanupTarget(name: string, cutoff: Date) {
    const db = (this.dataSource.mongoManager.connection as any).db;
    const exists = Boolean(await db.listCollections({ name }).next());
    if (!exists) {
      return {
        name,
        exists,
        totalCount: 0,
        beforeCutoffCount: 0,
        dateField: null,
      };
    }
    return { exists, ...(await this.describeCollection(name, cutoff)) };
  }

  private async resolveDateField(collectionName: string) {
    const collection = (
      this.dataSource.mongoManager.connection as any
    ).db.collection(collectionName);
    for (const field of DATE_FIELDS) {
      const found = await collection.findOne(
        { [field]: { $exists: true, $ne: null } },
        { projection: { _id: 1 } },
      );
      if (found) return field;
    }
    return null;
  }

  private buildDateFilter(field: string, cutoff: Date) {
    return {
      $or: [
        { [field]: { $lt: cutoff } },
        { [field]: { $lt: cutoff.toISOString() } },
      ],
    };
  }

  private parseCutoff(value: string) {
    const cutoff = new Date(value || DEFAULT_CUTOFF);
    if (Number.isNaN(cutoff.getTime())) {
      throw new BadRequestException(
        'cutoff inválido. Use ISO, ex.: 2026-06-01T00:00:00.000Z.',
      );
    }
    if (cutoff > new Date(DEFAULT_CUTOFF)) {
      throw new BadRequestException(
        'Por segurança, a limpeza não pode apagar registros de 01/06/2026 em diante.',
      );
    }
    return cutoff;
  }

  private normalizeCollections(collections: string[]) {
    return Array.from(
      new Set(
        (collections || CLEANUP_COLLECTIONS).filter((name) =>
          CLEANUP_COLLECTIONS.includes(name),
        ),
      ),
    );
  }
}
