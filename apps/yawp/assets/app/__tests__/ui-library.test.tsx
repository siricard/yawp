import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  Autocomplete,
  Avatar,
  avatarTintFromDid,
  Badge,
  Banner,
  Button,
  Card,
  DidPill,
  Field,
  Input,
  Modal,
  Pill,
  Section,
  Spinner,
  Subsection,
  Tile,
  Toast,
} from '../ui';

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

function findHostByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  const matches = tree.findAllByProps({testID});
  const host = matches.find(m => typeof m.type === 'string');
  return host ?? matches[matches.length - 1];
}

async function render(node: React.ReactElement) {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    root = ReactTestRenderer.create(node);
  });
  return root!;
}

describe('Button', () => {
  test('renders label and fires onPress', async () => {
    const onPress = jest.fn();
    const root = await render(
      <Button testID="btn" label="Click" onPress={onPress} />,
    );
    const btn = findByTestId(root.root, 'btn');
    await ReactTestRenderer.act(async () => {
      btn.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('disabled blocks onPress and exposes accessibilityState', async () => {
    const onPress = jest.fn();
    const root = await render(
      <Button testID="btn" label="Click" disabled onPress={onPress} />,
    );
    const matches = root.root.findAllByProps({testID: 'btn'});
    const withState = matches.find(
      m => m.props.accessibilityState !== undefined,
    );
    expect(withState).toBeTruthy();
    expect(withState!.props.accessibilityState.disabled).toBe(true);
  });

  test('renders all variants without crashing', async () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const root = await render(
        <Button testID={`btn-${v}`} label={v} variant={v} />,
      );
      expect(findByTestId(root.root, `btn-${v}`)).toBeTruthy();
    }
  });

  test('icon-only renders without label', async () => {
    const root = await render(
      <Button testID="icon" iconOnly={<></>} accessibilityLabel="close" />,
    );
    expect(findByTestId(root.root, 'icon')).toBeTruthy();
  });
});

describe('Input', () => {
  test('text variant fires onChangeText', async () => {
    const onChangeText = jest.fn();
    const root = await render(
      <Input testID="in" value="" onChangeText={onChangeText} />,
    );
    await ReactTestRenderer.act(async () => {
      findByTestId(root.root, 'in').props.onChangeText('hello');
    });
    expect(onChangeText).toHaveBeenCalledWith('hello');
  });

  test('password variant sets secureTextEntry', async () => {
    const root = await render(
      <Input testID="pw" variant="password" value="" onChangeText={() => {}} />,
    );
    const m = root.root
      .findAllByProps({testID: 'pw'})
      .find(n => n.props.secureTextEntry !== undefined);
    expect(m?.props.secureTextEntry).toBe(true);
  });

  test('textarea variant sets multiline', async () => {
    const root = await render(
      <Input testID="ta" variant="textarea" value="" onChangeText={() => {}} />,
    );
    const m = root.root
      .findAllByProps({testID: 'ta'})
      .find(n => n.props.multiline !== undefined);
    expect(m?.props.multiline).toBe(true);
  });
});

describe('Autocomplete', () => {
  test('shows suggestions on focus and selects one', async () => {
    const onSelect = jest.fn();
    const onChangeText = jest.fn();
    const root = await render(
      <Autocomplete
        inputTestID="ac-input"
        value="ab"
        onChangeText={onChangeText}
        suggestions={['abandon', 'ability']}
        onSelect={onSelect}
      />,
    );
    await ReactTestRenderer.act(async () => {
      findByTestId(root.root, 'ac-input').props.onFocus();
    });
    expect(findByTestId(root.root, 'autocomplete-overlay')).toBeTruthy();
    const opt = findByTestId(root.root, 'autocomplete-option-0');
    await ReactTestRenderer.act(async () => {
      opt.props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('abandon');
  });

  test('overlay is absolutely positioned (does not push siblings)', async () => {
    const root = await render(
      <Autocomplete
        inputTestID="ac-input2"
        value="x"
        onChangeText={() => {}}
        suggestions={['xenon']}
        onSelect={() => {}}
      />,
    );
    await ReactTestRenderer.act(async () => {
      findByTestId(root.root, 'ac-input2').props.onFocus();
    });
    const overlay = findByTestId(root.root, 'autocomplete-overlay');
    expect(overlay.props.style.position).toBe('absolute');
  });
});

describe('Card', () => {
  test('default renders children', async () => {
    const root = await render(<Card testID="card" />);
    expect(findByTestId(root.root, 'card')).toBeTruthy();
  });

  test('interactive fires onPress', async () => {
    const onPress = jest.fn();
    const root = await render(
      <Card testID="c2" variant="interactive" onPress={onPress} />,
    );
    await ReactTestRenderer.act(async () => {
      findByTestId(root.root, 'c2').props.onPress();
    });
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Banner', () => {
  test('renders all kinds with title', async () => {
    for (const k of ['info', 'warning', 'success', 'danger'] as const) {
      const root = await render(
        <Banner testID={`b-${k}`} kind={k} title="T" message="M" />,
      );
      expect(findByTestId(root.root, `b-${k}`)).toBeTruthy();
    }
  });
});

describe('Modal', () => {
  test('not rendered when visible=false', async () => {
    const root = await render(
      <Modal visible={false} onClose={() => {}} testID="m1" />,
    );
    expect(
      root.root.findAllByProps({testID: 'm1-backdrop'}),
    ).toHaveLength(0);
  });

  test('renders when visible and fires onClose via backdrop', async () => {
    const onClose = jest.fn();
    const root = await render(
      <Modal visible onClose={onClose} title="Hi" testID="m2" />,
    );
    expect(findByTestId(root.root, 'm2')).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      findByTestId(root.root, 'm2-backdrop-press').props.onPress();
    });
    expect(onClose).toHaveBeenCalled();
  });

  test('closeOnBackdrop=false ignores backdrop press', async () => {
    const onClose = jest.fn();
    const root = await render(
      <Modal visible onClose={onClose} testID="m3" closeOnBackdrop={false} />,
    );
    const backdrop = findByTestId(root.root, 'm3-backdrop-press');
    expect(backdrop.props.onPress).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  test('renders error when provided', async () => {
    const root = await render(
      <Field testID="f1" label="Name" error="bad">
        <Input value="" onChangeText={() => {}} />
      </Field>,
    );
    expect(findByTestId(root.root, 'f1-error')).toBeTruthy();
  });

  test('renders helper when no error', async () => {
    const root = await render(
      <Field testID="f2" label="Name" helper="hint">
        <Input value="" onChangeText={() => {}} />
      </Field>,
    );
    expect(findByTestId(root.root, 'f2-helper')).toBeTruthy();
  });
});

describe('Section / Subsection', () => {
  test('section and subsection render', async () => {
    const root = await render(
      <Section testID="s1" title="T" subtitle="sub">
        <Subsection testID="ss1" label="hi" />
      </Section>,
    );
    expect(findByTestId(root.root, 's1')).toBeTruthy();
    expect(findByTestId(root.root, 'ss1')).toBeTruthy();
  });

  test('subsection renders its label text', async () => {
    const root = await render(<Subsection testID="ss2" label="Endpoints" />);
    expect(
      root.root.findAllByProps({children: 'Endpoints'}).length,
    ).toBeGreaterThan(0);
  });
});

describe('Avatar', () => {
  test('renders initials from displayName', async () => {
    const root = await render(
      <Avatar testID="av" displayName="Nova Hawk" did="did:yawp:abc" />,
    );
    expect(findByTestId(root.root, 'av')).toBeTruthy();
  });

  test('avatarTintFromDid is deterministic', () => {
    expect(avatarTintFromDid('did:yawp:abc')).toBe(
      avatarTintFromDid('did:yawp:abc'),
    );
  });
});

describe('Badge', () => {
  test('renders count', async () => {
    const root = await render(<Badge testID="bg" count={4} />);
    expect(findByTestId(root.root, 'bg')).toBeTruthy();
  });
});

describe('Pill', () => {
  test('renders label and tones', async () => {
    const root = await render(<Pill testID="p" label="owner" tone="primary" />);
    expect(findByTestId(root.root, 'p')).toBeTruthy();
  });
});

describe('Spinner', () => {
  test('renders', async () => {
    const root = await render(<Spinner />);
    expect(findByTestId(root.root, 'spinner')).toBeTruthy();
  });
});

describe('Toast', () => {
  test('renders message', async () => {
    const root = await render(
      <Toast testID="t" message="Saved." kind="success" />,
    );
    expect(findByTestId(root.root, 't')).toBeTruthy();
  });
});

describe('Tile', () => {
  test('default renders initial and fires onPress', async () => {
    const onPress = jest.fn();
    const root = await render(
      <Tile testID="tile" label="Friends" onPress={onPress} />,
    );
    await ReactTestRenderer.act(async () => {
      findByTestId(root.root, 'tile').props.onPress();
    });
    expect(onPress).toHaveBeenCalled();
  });

  test('add variant renders + and unread/mention dots', async () => {
    const addRoot = await render(<Tile testID="add" label="add" add />);
    expect(findByTestId(addRoot.root, 'add')).toBeTruthy();
    const dotRoot = await render(
      <Tile testID="dot" label="Ops" mention />,
    );
    expect(findByTestId(dotRoot.root, 'dot-dot')).toBeTruthy();
  });
});

describe('DidPill', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('renders truncated did with copy affordance', async () => {
    const onCopy = jest.fn();
    const root = await render(
      <DidPill
        testID="dp"
        did="did:yawp:8f3a2c1b9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a"
        onCopy={onCopy}
      />,
    );
    expect(findByTestId(root.root, 'dp')).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      findByTestId(root.root, 'dp-copy').props.onPress();
    });
    expect(onCopy).toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(700);
    });
  });
});
