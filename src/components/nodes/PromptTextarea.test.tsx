import test from 'node:test';
import assert from 'node:assert/strict';

import { PromptTextarea } from './PromptTextarea';

function renderPromptTextarea({
  value,
  isLoading = false,
  onDraftChange = () => {},
  onCommit = () => {},
  onSubmit = () => {},
}: {
  value: string;
  isLoading?: boolean;
  onDraftChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  onSubmit?: (value: string) => void;
}) {
  const element = PromptTextarea({
    value,
    isLoading,
    onDraftChange,
    onCommit,
    onSubmit,
  });

  assert.equal(element.type, 'textarea');
  return element.props as {
    onChange: (event: { target: { value: string } }) => void;
    onBlur: (event: { target: { value: string; style: { borderColor: string } }; currentTarget: { value: string } }) => void;
    onKeyDown: (event: { ctrlKey?: boolean; metaKey?: boolean; key: string; currentTarget: { value: string }; preventDefault: () => void }) => void;
  };
}

test('typing updates the local draft without committing to the store', () => {
  const draftValues: string[] = [];
  const committedValues: string[] = [];
  const props = renderPromptTextarea({
    value: '旧提示词',
    onDraftChange: (value) => draftValues.push(value),
    onCommit: (value) => committedValues.push(value),
  });

  props.onChange({ target: { value: '新的提示词' } });

  assert.deepEqual(draftValues, ['新的提示词']);
  assert.deepEqual(committedValues, []);
});

test('blur commits the latest draft exactly once', () => {
  const committedValues: string[] = [];

  renderPromptTextarea({
    value: '旧提示词',
    onCommit: (value) => committedValues.push(value),
  }).onChange({ target: { value: '新的提示词' } });

  renderPromptTextarea({
    value: '新的提示词',
    onCommit: (value) => committedValues.push(value),
  }).onBlur({ target: { value: '新的提示词', style: { borderColor: '' } }, currentTarget: { value: '新的提示词' } });

  assert.deepEqual(committedValues, ['新的提示词']);
});

test('blur commits the current textarea value even if props are stale', () => {
  const committedValues: string[] = [];

  renderPromptTextarea({
    value: '旧提示词',
    onCommit: (value) => committedValues.push(value),
  }).onBlur({ target: { value: '新的提示词', style: { borderColor: '' } }, currentTarget: { value: '新的提示词' } });

  assert.deepEqual(committedValues, ['新的提示词']);
});

test('ctrl+enter submits the latest draft without a duplicate commit', () => {
  const committedValues: string[] = [];
  const submittedValues: string[] = [];
  let prevented = false;

  renderPromptTextarea({
    value: '新的提示词',
    onCommit: (value) => committedValues.push(value),
    onSubmit: (value) => submittedValues.push(value),
  }).onKeyDown({
    key: 'Enter',
    ctrlKey: true,
    currentTarget: { value: '新的提示词' },
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.deepEqual(committedValues, []);
  assert.deepEqual(submittedValues, ['新的提示词']);
});

test('ctrl+enter uses the current textarea value even if props are stale', () => {
  const committedValues: string[] = [];
  const submittedValues: string[] = [];

  renderPromptTextarea({
    value: '旧提示词',
    onCommit: (value) => committedValues.push(value),
    onSubmit: (value) => submittedValues.push(value),
  }).onKeyDown({
    key: 'Enter',
    metaKey: true,
    currentTarget: { value: '新的提示词' },
    preventDefault: () => {},
  });

  assert.deepEqual(committedValues, []);
  assert.deepEqual(submittedValues, ['新的提示词']);
});
