/**
 * What a message actually contains, in the shapes the Cloud API defines.
 *
 * Pricing never reads this: Meta bills by category and window, not by whether a template
 * carried three buttons. It exists so the phone frame can render what a real application
 * sends — a template with an image header and quick replies, a list, a Flow — instead of
 * flattening everything to a line of text.
 *
 * Optional on SimMessage: a scenario written by hand can still say `bodyPreview` and get a
 * plain bubble.
 */

export type ButtonType = 'quick_reply' | 'url' | 'phone_number' | 'copy_code';

export interface MessageButton {
  type: ButtonType;
  text: string;
  /** Present on url buttons; shown as the destination host under the label. */
  url?: string;
  /** Present on copy_code buttons, the value WhatsApp copies. */
  code?: string;
}

export type HeaderMedia = 'image' | 'video' | 'document';

export interface MessageHeader {
  type: 'text' | HeaderMedia;
  /** Header text, for `type: 'text'`. */
  text?: string;
  /** Filename, for document headers. */
  filename?: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title?: string;
  rows: ListRow[];
}

export type MessageContent =
  | { kind: 'text'; body: string }
  | {
      kind: 'media';
      media: 'image' | 'video' | 'audio' | 'document' | 'sticker';
      caption?: string;
      filename?: string;
      /** Seconds, for audio and video. */
      durationSeconds?: number;
    }
  | { kind: 'location'; name?: string; address?: string }
  | {
      kind: 'template';
      /** Template name, shown as the category line above the bubble. */
      name?: string;
      header?: MessageHeader;
      body: string;
      footer?: string;
      buttons?: MessageButton[];
    }
  | {
      kind: 'buttons';
      header?: MessageHeader;
      body: string;
      footer?: string;
      buttons: MessageButton[];
    }
  | {
      kind: 'list';
      header?: string;
      body: string;
      footer?: string;
      /** Label of the button that opens the list sheet. */
      buttonText: string;
      sections: ListSection[];
    }
  | {
      kind: 'flow';
      header?: string;
      body: string;
      footer?: string;
      /** Label of the button that opens the Flow. */
      ctaText: string;
    };

/** One line of text for a message, for the CLI table and for accessible labels. */
export function contentSummary(content: MessageContent): string {
  switch (content.kind) {
    case 'text':
      return content.body;
    case 'media':
      return content.caption ?? content.filename ?? content.media;
    case 'location':
      return [content.name, content.address].filter(Boolean).join(' · ') || 'location';
    case 'template':
    case 'buttons':
      return content.body;
    case 'list':
      return `${content.body} · ${content.buttonText}`;
    case 'flow':
      return `${content.body} · ${content.ctaText}`;
  }
}
