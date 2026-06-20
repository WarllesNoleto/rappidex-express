import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { IfoodEventEntity } from '../database/entities';

@Injectable()
export class IfoodEventService {
  private static readonly MIN_EVENT_DATE = new Date('2026-06-01T00:00:00.000Z');
  constructor(
    @InjectRepository(IfoodEventEntity)
    private readonly ifoodEventRepository: MongoRepository<IfoodEventEntity>,
  ) {}

  async findByEventId(eventId: string) {
    return this.ifoodEventRepository.findOneBy({ eventId });
  }

  async findByOrderId(orderId: string) {
    const events = await this.ifoodEventRepository.find({
      where: { orderId } as any,
    });

    return Array.isArray(events) ? events : [];
  }

  async hasDeliveryDropCodeRequested(orderId: string) {
    const events = await this.findByOrderId(orderId);

    return events.some(
      (event) => event?.fullCode === 'DELIVERY_DROP_CODE_REQUESTED',
    );
  }

  async findRecentEligibleImportEvents(limit = 500) {
    const events = await this.ifoodEventRepository.find({
      where: {
        $or: [
          { code: 'CFM' },
          { code: 'CONFIRMED' },
          { code: 'DSP' },
          { code: 'RTP' },
          { fullCode: 'CONFIRMED' },
          { fullCode: 'DISPATCHED' },
          { fullCode: 'READY_TO_PICKUP' },
        ],
      } as any,
      order: { processedAt: 'DESC' },
      take: limit,
    });

    return Array.isArray(events) ? events : [];
  }

  isEventRecentEnough(event: { createdAt?: string }) {
    if (!event?.createdAt) {
      return true;
    }

    const eventDate = new Date(event.createdAt);
    if (Number.isNaN(eventDate.getTime())) {
      return true;
    }

    return eventDate >= IfoodEventService.MIN_EVENT_DATE;
  }

  async markAsProcessed(
    event: {
      id: string;
      orderId?: string;
      merchantId?: string;
      code?: string;
      fullCode?: string;
      salesChannel?: string;
      createdAt?: string;
    },
    acknowledged = false,
  ) {
    if (!this.isEventRecentEnough(event)) {
      return null;
    }

    await this.ifoodEventRepository.updateOne(
      { eventId: event.id },
      {
        $setOnInsert: {
          eventId: event.id,
          orderId: event.orderId ?? '',
          merchantId: event.merchantId ?? '',
          code: event.code ?? '',
          fullCode: event.fullCode ?? '',
          salesChannel: event.salesChannel ?? '',
          createdAt: event.createdAt ?? '',
          processedAt: new Date(),
        },
        $set: { acknowledged },
      } as any,
      { upsert: true } as any,
    );

    return this.findByEventId(event.id);
  }

  async markAsAcknowledged(eventId: string) {
    await this.ifoodEventRepository.updateOne({ eventId }, {
      $set: {
        acknowledged: true,
      },
    } as any);
  }

  async findUnacknowledgedEventIds(limit = 500) {
    const events = await this.findUnacknowledgedEvents(limit);

    return events.map((event) => event.eventId);
  }

  async findUnacknowledgedEvents(limit = 500) {
    const events = await this.ifoodEventRepository.find({
      where: {
        acknowledged: false,
      } as any,
      take: limit,
      select: {
        eventId: true,
        merchantId: true,
      } as any,
    });

    return (Array.isArray(events) ? events : [])
      .map((event) => ({
        eventId: String(event?.eventId || '').trim(),
        merchantId: String((event as any)?.merchantId || '').trim(),
      }))
      .filter((event) => Boolean(event.eventId));
  }
}
