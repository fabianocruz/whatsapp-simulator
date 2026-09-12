import type { SimMessage, ValidationIssue } from './types';
import { parseInstant } from './windows';

const TEMPLATE_CATEGORIES = new Set(['marketing', 'utility', 'authentication']);

/**
 * Structural problems with a scenario, reported rather than thrown.
 *
 * A half-valid scenario is still worth pricing — the developer is mid-edit and wants to
 * see the taximeter move. Issues surface next to the number instead of blanking the UI.
 */
export function validateTimeline(messages: readonly SimMessage[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  let previousAt: number | null = null;

  for (const message of messages) {
    if (seen.has(message.id)) {
      issues.push({
        code: 'DUPLICATE_MESSAGE_ID',
        messageId: message.id,
        message: {
          pt: `Id de mensagem repetido: "${message.id}". Cada mensagem precisa de um id único.`,
          en: `Duplicate message id: "${message.id}". Every message needs a unique id.`,
        },
      });
    }
    seen.add(message.id);

    let at: number | null = null;
    try {
      at = parseInstant(message.sentAt);
    } catch {
      issues.push({
        code: 'INVALID_TIMESTAMP',
        messageId: message.id,
        message: {
          pt: `Timestamp inválido: "${message.sentAt}".`,
          en: `Invalid timestamp: "${message.sentAt}".`,
        },
      });
    }

    if (at !== null) {
      if (previousAt !== null && at < previousAt) {
        issues.push({
          code: 'OUT_OF_ORDER_TIMESTAMP',
          messageId: message.id,
          message: {
            pt: 'Mensagem fora de ordem cronológica. O motor reordena para calcular, mas a timeline exibida pode confundir.',
            en: 'Message is out of chronological order. The engine sorts before pricing, but the rendered timeline may read oddly.',
          },
        });
      }
      previousAt = at;
    }

    const categoryFits =
      message.kind === 'template' ? TEMPLATE_CATEGORIES.has(message.category) : message.category === 'service';
    if (!categoryFits) {
      issues.push({
        code: 'INVALID_CATEGORY_FOR_KIND',
        messageId: message.id,
        message: {
          pt:
            message.kind === 'template'
              ? 'Template precisa de categoria marketing, utility ou authentication.'
              : 'Mensagem non-template e sempre da categoria service.',
          en:
            message.kind === 'template'
              ? 'A template needs a marketing, utility or authentication category.'
              : 'A non-template message is always in the service category.',
        },
      });
    }
  }

  return issues;
}
