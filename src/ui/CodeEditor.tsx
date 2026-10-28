import { javascript } from '@codemirror/lang-javascript';
import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useEffect, useRef } from 'react';
import type { Span } from '../engine/types';

const setHighlight = StateEffect.define<{ span?: Span; kind: 'step' | 'error' }>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setHighlight)) continue;
      const { span, kind } = effect.value;
      const length = tr.state.doc.length;
      if (!span || span.start >= length) return Decoration.none;
      const end = Math.min(Math.max(span.end, span.start + 1), length);
      const line = tr.state.doc.lineAt(span.start);
      return RangeSet.of(
        [
          Decoration.line({ class: `cm-active-step-line cm-${kind}-line` }).range(line.from),
          Decoration.mark({ class: `cm-${kind}-mark` }).range(span.start, end),
        ],
        true,
      );
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const extensions = [javascript(), highlightField, EditorView.lineWrapping];

interface Props {
  code: string;
  onChange: (code: string) => void;
  readOnly: boolean;
  highlight?: Span;
  highlightKind: 'step' | 'error';
  label: string;
  dark: boolean;
}

export function CodeEditor({ code, onChange, readOnly, highlight, highlightKind, label, dark }: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null);

  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    view.dispatch({ effects: setHighlight.of({ span: highlight, kind: highlightKind }) });
    if (highlight && highlight.start < view.state.doc.length) {
      view.dispatch({ effects: EditorView.scrollIntoView(highlight.start, { y: 'nearest' }) });
    }
  }, [highlight, highlightKind, code]);

  return (
    <CodeMirror
      ref={ref}
      value={code}
      onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      extensions={extensions}
      theme={dark ? 'dark' : 'light'}
      basicSetup={{ highlightActiveLine: !readOnly, foldGutter: false }}
      aria-label={label}
      className="editor"
    />
  );
}
