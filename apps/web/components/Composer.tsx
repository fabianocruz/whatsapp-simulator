'use client';

import { useState, type FormEvent } from 'react';
import type { Category, ContentType, MsgStatus, SimMessage } from '@dyvit/whatsapp-pricing';
import type { Dictionary } from '../i18n/dictionary';
import { fromDateTimeLocal, toDateTimeLocal } from '../lib/format';
import { TIME_JUMPS } from '../lib/scenario-state';

interface Props {
  dict: Dictionary;
  /** Default timestamp for the next message, derived from the conversation clock. */
  defaultSentAt: string;
  onAdd: (message: Omit<SimMessage, 'id'>) => void;
}

const TEMPLATE_CATEGORIES: Category[] = ['marketing', 'utility', 'authentication'];
const CONTENT_TYPES: ContentType[] = [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'location',
  'interactive_buttons',
  'interactive_list',
  'cta_url',
  'flow',
];
const STATUSES: MsgStatus[] = ['delivered', 'read', 'sent', 'failed'];

const fieldClass =
  'w-full rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)] bg-white px-2.5 py-1.5 text-[13px] text-[color:var(--color-ink)]';
const labelClass = 'mono mb-1 block text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]';

export function Composer({ dict, defaultSentAt, onAdd }: Props) {
  const [outbound, setOutbound] = useState(true);
  const [isTemplate, setIsTemplate] = useState(true);
  const [category, setCategory] = useState<Category>('marketing');
  const [contentType, setContentType] = useState<ContentType>('text');
  const [status, setStatus] = useState<MsgStatus>('delivered');
  const [entryPoint, setEntryPoint] = useState<NonNullable<SimMessage['entryPoint']>>('organic');
  const [templateName, setTemplateName] = useState('');
  const [body, setBody] = useState('');
  const [sentAt, setSentAt] = useState<string | null>(null);

  // Null means "follow the conversation clock", so adding messages in a row keeps
  // advancing without the user editing the timestamp every time.
  const effectiveSentAt = sentAt ?? defaultSentAt;

  function jump(ms: number) {
    setSentAt(new Date(Date.parse(effectiveSentAt) + ms).toISOString());
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const inbound = !outbound;
    const kind: SimMessage['kind'] = inbound ? 'non_template' : isTemplate ? 'template' : 'non_template';
    onAdd({
      direction: outbound ? 'business_to_user' : 'user_to_business',
      kind,
      category: kind === 'template' ? category : 'service',
      sentAt: effectiveSentAt,
      // A customer message is inbound: it is received, never "failed on delivery" here.
      status: inbound ? 'delivered' : status,
      contentType,
      ...(kind === 'template' && templateName ? { templateName } : {}),
      ...(body ? { bodyPreview: body } : {}),
      ...(inbound ? { entryPoint } : {}),
    });
    setBody('');
    setSentAt(null);
  }

  return (
    <form onSubmit={submit} className="rounded-[var(--radius-r-lg)] border border-[color:var(--color-ink-15)] bg-white p-4">
      <h3 className="section-label mb-3">{dict.composer}</h3>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <span className={labelClass}>{dict.side}</span>
          <div className="flex overflow-hidden rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)]">
            {[
              { value: true, label: dict.business },
              { value: false, label: dict.customer },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                aria-pressed={outbound === option.value}
                onClick={() => setOutbound(option.value)}
                className={`flex-1 px-2 py-1.5 text-[12px] ${
                  outbound === option.value
                    ? 'bg-[color:var(--color-ink)] text-[color:var(--color-paper)]'
                    : 'bg-white text-[color:var(--color-ink-70)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={labelClass}>{dict.kind}</span>
          <div className="flex overflow-hidden rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)]">
            {[
              { value: true, label: dict.template },
              { value: false, label: dict.nonTemplate },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                disabled={!outbound}
                aria-pressed={outbound && isTemplate === option.value}
                onClick={() => setIsTemplate(option.value)}
                className={`flex-1 px-2 py-1.5 text-[12px] disabled:opacity-40 ${
                  outbound && isTemplate === option.value
                    ? 'bg-[color:var(--color-ink)] text-[color:var(--color-paper)]'
                    : 'bg-white text-[color:var(--color-ink-70)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {outbound && isTemplate && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>{dict.category}</span>
            <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {TEMPLATE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>{dict.templateName}</span>
            <input className={fieldClass} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          </label>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>{dict.contentType}</span>
          <select
            className={fieldClass}
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
          >
            {CONTENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        {outbound ? (
          <label className="block">
            <span className={labelClass}>{dict.status}</span>
            <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as MsgStatus)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {dict[`status${value[0]!.toUpperCase()}${value.slice(1)}` as keyof Dictionary] as string}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className={labelClass}>{dict.entryPoint}</span>
            <select
              className={fieldClass}
              value={entryPoint}
              onChange={(e) => setEntryPoint(e.target.value as NonNullable<SimMessage['entryPoint']>)}
            >
              <option value="organic">{dict.entryOrganic}</option>
              <option value="click_to_whatsapp_ad">{dict.entryAd}</option>
              <option value="facebook_page_cta">{dict.entryPageCta}</option>
            </select>
          </label>
        )}
      </div>

      <label className="mb-3 block">
        <span className={labelClass}>{dict.body}</span>
        <textarea
          className={`${fieldClass} min-h-[62px] resize-y`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      <div className="mb-3">
        <span className={labelClass}>{dict.when}</span>
        <input
          type="datetime-local"
          className={fieldClass}
          value={toDateTimeLocal(effectiveSentAt)}
          onChange={(e) => setSentAt(fromDateTimeLocal(e.target.value))}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="mono self-center text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
            {dict.jump}
          </span>
          {TIME_JUMPS.map((jumpOption) => (
            <button
              key={jumpOption.key}
              type="button"
              onClick={() => jump(jumpOption.ms)}
              className="mono rounded-full border border-[color:var(--color-ink-15)] px-2.5 py-1 text-[11px] text-[color:var(--color-ink-70)] hover:bg-[color:var(--color-ink-04)]"
            >
              {dict[jumpOption.key]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-[var(--radius-r)] bg-[color:var(--color-ink)] px-4 py-2.5 text-[13px] font-medium text-[color:var(--color-paper)] hover:opacity-90"
      >
        {dict.addMessage}
      </button>
    </form>
  );
}
