import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Explanation } from '../engine/types';

const TAG = /<(c|b)>(.*?)<\/\1>/g;
const PARAM = /\{\{(\w+)\}\}/g;

/**
 * Renders a translation template with `<c>` (code) and `<b>` (bold) markup.
 * Parameters come from the user's program, so they are only ever inserted as text.
 */
function renderTemplate(template: string, params: Record<string, string | number>): ReactNode[] {
  const fill = (text: string) => text.replace(PARAM, (_, name: string) => String(params[name] ?? ''));
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of template.matchAll(TAG)) {
    if (match.index > last) out.push(fill(template.slice(last, match.index)));
    const Tag = match[1] === 'c' ? 'code' : 'strong';
    out.push(<Tag key={match.index}>{fill(match[2])}</Tag>);
    last = match.index + match[0].length;
  }
  if (last < template.length) out.push(fill(template.slice(last)));
  return out;
}

export function ExplanationText({ explanation }: { explanation: Explanation }) {
  const { t, i18n } = useTranslation();
  const group = (lng: string) => i18n.getResource(lng, 'translation', 'explain') as Record<string, string> | undefined;
  const template = group(i18n.language)?.[explanation.key] ?? group('fr')?.[explanation.key] ?? explanation.key;
  const params = { ...explanation.params };
  if (params.name === '') params.name = t('frame.anonymous');
  return <Fragment>{renderTemplate(template, params)}</Fragment>;
}
