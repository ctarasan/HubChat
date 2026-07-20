import type { MessageTemplateDto, MessageTemplateRecord } from "../domain/messageTemplates.js";

export interface MessageTemplateRepository {
  listByOwner(input: {
    tenantId: string;
    ownerUserId: string;
    limit?: number;
  }): Promise<MessageTemplateDto[]>;

  getByIdForOwner(input: {
    tenantId: string;
    ownerUserId: string;
    id: string;
  }): Promise<MessageTemplateDto | null>;

  create(input: {
    tenantId: string;
    ownerUserId: string;
    title: string;
    body: string;
  }): Promise<MessageTemplateDto>;

  update(input: {
    tenantId: string;
    ownerUserId: string;
    id: string;
    title: string;
    body: string;
  }): Promise<MessageTemplateDto | null>;

  delete(input: {
    tenantId: string;
    ownerUserId: string;
    id: string;
  }): Promise<boolean>;
}

export type { MessageTemplateRecord };
