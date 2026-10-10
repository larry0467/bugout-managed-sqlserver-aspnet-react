import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Empty, Input, Modal, Popconfirm, Radio, Select, Space, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  ApartmentOutlined, ArrowDownOutlined, ArrowUpOutlined, CheckOutlined, CloseOutlined, CopyOutlined, DeleteOutlined,
  EditOutlined, ExperimentOutlined, LeftOutlined, NodeIndexOutlined, PlusOutlined, RedoOutlined, RightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  developmentApi, developmentStageMap, developmentStages, developmentTestEnvironments,
  type DevelopmentOrder, type DevelopmentOrderDetail, type DevelopmentPhase, type DevelopmentSequence,
  type DevelopmentStage, type DevelopmentTestEnvironment, type DevelopmentTestItem, type DevelopmentTestSummary,
} from '../api';

// Initiatives, "builds on" and the test checklist on the Development board.
// An initiative is an order holding numbered phases (one effort, several
// videos); its stage follows its least-advanced phase. A phase (or any order)
// can build on another order, which has to reach a stage first - the board
// flags a phase that is waiting on its base or moved ahead of it.

const { Text, Link } = Typography;

const errMsg = (err: any, fallback: string) => err?.response?.data?.message || fallback;
const stageLabel = (s?: DevelopmentStage | null) => (s ? developmentStageMap[s]?.label ?? s : '');

// ===== small tags =====

export const SequenceTag: React.FC<{ sequence?: DevelopmentSequence | null; onOpen?: (id: number) => void }> = ({ sequence, onOpen }) => {
  if (!sequence?.baseOrderId || sequence.state === 'NONE' || sequence.state === 'DONE') return null;
  const id = sequence.baseOrderId;
  const props = {
    style: { marginInlineEnd: 0, fontSize: 11, cursor: onOpen ? 'pointer' : undefined },
    onClick: onOpen ? (e: React.MouseEvent) => { e.stopPropagation(); onOpen(id); } : undefined,
  };
  const tip = <span>{sequence.message}{sequence.baseTitle ? <><br />#{id} {sequence.baseTitle}</> : null}</span>;
  if (sequence.state === 'AHEAD') return <Tooltip title={tip}><Tag color="red" icon={<NodeIndexOutlined />} {...props}>ahead of #{id}</Tag></Tooltip>;
  if (sequence.state === 'READY') return <Tooltip title={tip}><Tag color="green" icon={<NodeIndexOutlined />} {...props}>ready · #{id} {stageLabel(sequence.baseStage).toLowerCase()}</Tag></Tooltip>;
  return <Tooltip title={tip}><Tag icon={<NodeIndexOutlined />} {...props}>after #{id}</Tag></Tooltip>;
};

export const TestCountTag: React.FC<{ tests?: DevelopmentTestSummary | null }> = ({ tests }) => {
  if (!tests || tests.total === 0) return null;
  const tested = tests.passed + tests.failed;
  const color = tests.failed > 0 ? 'red' : tested === tests.total ? 'green' : 'default';
  return (
    <Tooltip title={`${tests.passed} passed · ${tests.failed} failed · ${tests.untested} not tested yet`}>
      <Tag color={color} icon={<ExperimentOutlined />} style={{ marginInlineEnd: 0, fontSize: 11 }}>
        {tested}/{tests.total} tested{tests.failed > 0 ? ` · ${tests.failed} failed` : ''}
      </Tag>
    </Tooltip>
  );
};

// One small tag per phase, colored by its stage: the progression at a glance.
export const PhaseStrip: React.FC<{ phases: DevelopmentPhase[]; onOpen?: (id: number) => void }> = ({ phases, onOpen }) => (
  <Space size={2} wrap>
    {phases.map((p) => {
      const ahead = p.sequenceState === 'AHEAD';
      return (
        <Tooltip
          key={p.id}
          title={(
            <div>
              <div>Phase {p.phaseNumber} · #{p.id} {p.title}</div>
              <div>{p.stageLabel}{p.tests.total > 0 ? ` · ${p.tests.passed + p.tests.failed}/${p.tests.total} tested` : ''}</div>
              {p.sequenceMessage && <div>{p.sequenceMessage}</div>}
            </div>
          )}
        >
          <Tag
            color={developmentStageMap[p.stage]?.color}
            style={{ margin: 0, fontSize: 11, padding: '0 6px', cursor: onOpen ? 'pointer' : undefined, outline: ahead ? '2px solid #ff4d4f' : undefined }}
            onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(p.id); } : undefined}
          >
            {p.phaseNumber ?? '?'}{ahead ? ' !' : ''}
          </Tag>
        </Tooltip>
      );
    })}
  </Space>
);

// ===== initiative drawer: its phases =====

interface PhasesCardProps {
  initiative: DevelopmentOrder;
  allOrders: DevelopmentOrder[];
  writer: boolean;
  onOpen: (id: number) => void;
  onChanged: () => void;
}

export const PhasesCard: React.FC<PhasesCardProps> = ({ initiative, allOrders, writer, onOpen, onChanged }) => {
  const phases = initiative.phases ?? [];
  const [addId, setAddId] = useState<number | undefined>();
  const [chain, setChain] = useState(true);
  const [busy, setBusy] = useState(false);

  const candidates = allOrders.filter((o) => !o.isInitiative && !o.parentOrderId && o.id !== initiative.id);

  const place = async (p: DevelopmentPhase, parentOrderId: number | null, phaseNumber?: number) => {
    setBusy(true);
    try {
      await developmentApi.setPlacement(p.id, {
        parentOrderId, phaseNumber: phaseNumber ?? null, dependsOnOrderId: p.dependsOnOrderId ?? null, dependsOnStage: p.dependsOnStage ?? null,
      });
      onChanged();
    } catch (e) {
      message.error(errMsg(e, 'Could not move the phase'));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!addId) return;
    setBusy(true);
    try {
      await developmentApi.group({ orderIds: [addId], initiativeId: initiative.id, chain });
      setAddId(undefined);
      message.success(`#${addId} added as phase ${phases.length + 1}`);
      onChanged();
    } catch (e) {
      message.error(errMsg(e, 'Could not add the phase'));
    } finally {
      setBusy(false);
    }
  };

  const ahead = phases.filter((p) => p.sequenceState === 'AHEAD');

  return (
    <Card size="small" style={{ marginBottom: 16 }} title={<Space><ApartmentOutlined /> Phases <Tag>{phases.length}</Tag></Space>}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        Each phase keeps its own video, PRs, stage and test checklist. The initiative is only as far along as its
        least-advanced phase. Phase order is the merge order; "after #N" means the phase is stacked on #N and waits for it.
      </Text>
      {ahead.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message={`${ahead.length} phase${ahead.length === 1 ? ' is' : 's are'} ahead of what ${ahead.length === 1 ? 'it builds' : 'they build'} on`}
          description={ahead.map((p) => <div key={p.id}>{p.sequenceMessage}</div>)}
        />
      )}
      {phases.length === 0 && <Empty description="No phases" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      {phases.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.15)', flexWrap: 'wrap' }}>
          <Tag style={{ margin: 0, minWidth: 64, textAlign: 'center' }}>Phase {p.phaseNumber}</Tag>
          <Link onClick={() => onOpen(p.id)} style={{ flex: '1 1 240px' }}>#{p.id} {p.title}</Link>
          <Tag color={developmentStageMap[p.stage]?.color} style={{ margin: 0 }}>{p.stageLabel}</Tag>
          {p.dependsOnOrderId && p.sequenceState !== 'NONE' && (
            <SequenceTag
              onOpen={onOpen}
              sequence={{ state: p.sequenceState, baseOrderId: p.dependsOnOrderId, gate: p.dependsOnStage ?? 'MERGED_DEV', gateLabel: '', message: p.sequenceMessage }}
            />
          )}
          <TestCountTag tests={p.tests} />
          {writer && (
            <Space size={0}>
              <Tooltip title="Earlier"><Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={busy || i === 0} onClick={() => place(p, initiative.id, i)} /></Tooltip>
              <Tooltip title="Later"><Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={busy || i === phases.length - 1} onClick={() => place(p, initiative.id, i + 2)} /></Tooltip>
              <Popconfirm title={`Take #${p.id} out of this initiative?`} onConfirm={() => place(p, null)}>
                <Tooltip title="Take out of the initiative"><Button size="small" type="text" danger icon={<CloseOutlined />} disabled={busy} /></Tooltip>
              </Popconfirm>
            </Space>
          )}
        </div>
      ))}
      {writer && (
        <Space wrap style={{ marginTop: 12 }}>
          <Select
            showSearch
            allowClear
            style={{ width: 360 }}
            placeholder="Add an order as the next phase"
            optionFilterProp="label"
            value={addId}
            onChange={(v) => setAddId(v)}
            options={candidates.map((o) => ({ label: `#${o.id} ${o.title}`, value: o.id }))}
          />
          <Checkbox checked={chain} onChange={(e) => setChain(e.target.checked)}>builds on the last phase</Checkbox>
          <Button icon={<PlusOutlined />} disabled={!addId} loading={busy} onClick={add}>Add phase</Button>
        </Space>
      )}
    </Card>
  );
};

// ===== any other order: where it sits and what it builds on =====

interface PlacementCardProps {
  order: DevelopmentOrder;
  allOrders: DevelopmentOrder[];
  writer: boolean;
  onOpen: (id: number) => void;
  onSaved: (d: DevelopmentOrderDetail) => void;
}

export const PlacementCard: React.FC<PlacementCardProps> = ({ order, allOrders, writer, onOpen, onSaved }) => {
  const [parentId, setParentId] = useState<number | null>(order.parentOrderId ?? null);
  const [baseId, setBaseId] = useState<number | null>(order.dependsOnOrderId ?? null);
  const [gate, setGate] = useState<DevelopmentStage>(order.dependsOnStage ?? 'MERGED_DEV');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setParentId(order.parentOrderId ?? null);
    setBaseId(order.dependsOnOrderId ?? null);
    setGate(order.dependsOnStage ?? 'MERGED_DEV');
  }, [order.id, order.parentOrderId, order.dependsOnOrderId, order.dependsOnStage]);

  const initiative = order.parentOrderId ? allOrders.find((o) => o.id === order.parentOrderId) : undefined;
  const siblings = initiative?.phases ?? [];
  const idx = siblings.findIndex((p) => p.id === order.id);
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;

  const dirty = parentId !== (order.parentOrderId ?? null)
    || baseId !== (order.dependsOnOrderId ?? null)
    || (baseId != null && gate !== (order.dependsOnStage ?? 'MERGED_DEV'));

  const save = async () => {
    setBusy(true);
    try {
      const d = await developmentApi.setPlacement(order.id, {
        parentOrderId: parentId,
        phaseNumber: parentId === order.parentOrderId ? order.phaseNumber ?? null : null,
        dependsOnOrderId: baseId,
        dependsOnStage: baseId != null ? gate : null,
      });
      onSaved(d);
      message.success('Saved');
    } catch (e) {
      message.error(errMsg(e, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  const initiatives = allOrders.filter((o) => o.isInitiative && o.id !== order.id);
  const bases = allOrders.filter((o) => o.id !== order.id && !o.isInitiative);

  return (
    <Card size="small" style={{ marginBottom: 16 }} title={<Space><ApartmentOutlined /> Initiative and sequence</Space>}>
      {order.parentOrderId && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text>Phase {order.phaseNumber}{order.phaseCount ? ` of ${order.phaseCount}` : ''} in</Text>
          <Link onClick={() => onOpen(order.parentOrderId!)}>#{order.parentOrderId} {order.parentTitle}</Link>
          {initiative?.phases && <PhaseStrip phases={initiative.phases} onOpen={onOpen} />}
          <span style={{ flex: 1 }} />
          <Button size="small" icon={<LeftOutlined />} disabled={!prev} onClick={() => prev && onOpen(prev.id)}>Previous phase</Button>
          <Button size="small" disabled={!next} onClick={() => next && onOpen(next.id)}>Next phase <RightOutlined /></Button>
        </div>
      )}
      {order.sequence?.message && (
        <Alert
          style={{ marginBottom: 8 }}
          type={order.sequence.state === 'AHEAD' ? 'error' : order.sequence.state === 'READY' ? 'success' : 'info'}
          showIcon
          message={order.sequence.message}
        />
      )}
      {order.dependsOnOrderId && order.sequence?.state === 'DONE' && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Builds on <Link onClick={() => onOpen(order.dependsOnOrderId!)}>#{order.dependsOnOrderId} {order.sequence?.baseTitle}</Link> ({stageLabel(order.sequence?.baseStage)}).
        </Text>
      )}
      {writer ? (
        <Space wrap>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 300 }}
            placeholder="Part of an initiative (none)"
            value={parentId ?? undefined}
            onChange={(v) => setParentId(v ?? null)}
            options={initiatives.map((o) => ({ label: `#${o.id} ${o.title}`, value: o.id }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 300 }}
            placeholder="Builds on (nothing)"
            value={baseId ?? undefined}
            onChange={(v) => setBaseId(v ?? null)}
            options={bases.map((o) => ({ label: `#${o.id} ${o.title}`, value: o.id }))}
          />
          {baseId != null && (
            <Space size={4}>
              <Text type="secondary">which reaches</Text>
              <Select
                style={{ width: 150 }}
                value={gate}
                onChange={(v) => setGate(v)}
                options={developmentStages.filter((s) => s.key !== 'ORDERED' && s.key !== 'ANNOUNCED').map((s) => ({ label: s.label, value: s.key }))}
              />
              <Text type="secondary">first</Text>
            </Space>
          )}
          <Button type="primary" disabled={!dirty} loading={busy} onClick={save}>Save</Button>
        </Space>
      ) : (
        !order.parentOrderId && !order.dependsOnOrderId && <Text type="secondary">Standalone order.</Text>
      )}
      {writer && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          To start a new initiative, tick the related orders on the board and choose Group.
        </Text>
      )}
    </Card>
  );
};

// ===== group the ticked board rows into one initiative =====

interface GroupModalProps {
  open: boolean;
  selected: DevelopmentOrder[];
  allOrders: DevelopmentOrder[];
  onClose: () => void;
  onDone: (d: DevelopmentOrderDetail) => void;
}

export const GroupModal: React.FC<GroupModalProps> = ({ open, selected, allOrders, onClose, onDone }) => {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [initiativeId, setInitiativeId] = useState<number | undefined>();
  const [chain, setChain] = useState(true);
  const [order, setOrder] = useState<DevelopmentOrder[]>([]);
  const [busy, setBusy] = useState(false);

  const initiatives = allOrders.filter((o) => o.isInitiative);
  const phases = useMemo(() => selected.filter((o) => !o.isInitiative), [selected]);

  useEffect(() => {
    if (!open) return;
    // Oldest first: the earliest video is usually phase 1.
    setOrder([...phases].sort((a, b) => dayjs(a.orderedAt).valueOf() - dayjs(b.orderedAt).valueOf()));
    setMode(initiatives.length > 0 && selected.some((o) => o.isInitiative) ? 'existing' : 'new');
    setInitiativeId(selected.find((o) => o.isInitiative)?.id);
    setTitle('');
    setSummary('');
    setChain(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (i: number, delta: number) => {
    const next = [...order];
    const [row] = next.splice(i, 1);
    next.splice(i + delta, 0, row);
    setOrder(next);
  };

  const submit = async () => {
    if (order.length === 0) return;
    if (mode === 'new' && !title.trim()) { message.warning('Give the initiative a title'); return; }
    if (mode === 'existing' && !initiativeId) { message.warning('Pick the initiative'); return; }
    setBusy(true);
    try {
      const d = await developmentApi.group({
        orderIds: order.map((o) => o.id),
        title: mode === 'new' ? title.trim() : undefined,
        summary: mode === 'new' && summary.trim() ? summary.trim() : undefined,
        projectId: mode === 'new' ? order[0].projectId : undefined,
        initiativeId: mode === 'existing' ? initiativeId : undefined,
        chain,
      });
      onDone(d);
    } catch (e) {
      message.error(errMsg(e, 'Could not group the orders'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={<Space><ApartmentOutlined /> Group into one initiative</Space>}
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText={mode === 'new' ? 'Create initiative' : 'Add as phases'}
      okButtonProps={{ loading: busy, disabled: order.length === 0 }}
      width={720}
    >
      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ marginBottom: 12 }}>
        <Radio value="new">New initiative</Radio>
        <Radio value="existing" disabled={initiatives.length === 0}>Add to an existing initiative</Radio>
      </Radio.Group>
      {mode === 'new' ? (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Input placeholder="Title, e.g. Estimates, change orders + AI quoting" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input.TextArea rows={2} placeholder="What the whole effort is for (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Space>
      ) : (
        <Select
          style={{ width: '100%', marginBottom: 12 }}
          placeholder="Pick the initiative"
          value={initiativeId}
          onChange={(v) => setInitiativeId(v)}
          options={initiatives.map((o) => ({ label: `#${o.id} ${o.title}`, value: o.id }))}
        />
      )}
      <Text strong>Phases, in order</Text>
      <div style={{ margin: '6px 0 12px' }}>
        {order.map((o, i) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(128,128,128,0.15)' }}>
            <Tag style={{ margin: 0, minWidth: 64, textAlign: 'center' }}>Phase {i + 1}</Tag>
            <Text style={{ flex: 1 }}>#{o.id} {o.title}</Text>
            <Tag color={developmentStageMap[o.stage]?.color} style={{ margin: 0 }}>{o.stageLabel}</Tag>
            <Text type="secondary" style={{ fontSize: 12, width: 80 }}>{dayjs(o.orderedAt).format('MMM D')}</Text>
            <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
            <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === order.length - 1} onClick={() => move(i, 1)} />
          </div>
        ))}
        {selected.length !== phases.length && (
          <Text type="secondary" style={{ fontSize: 12 }}>Initiatives among the ticked rows are not added as phases.</Text>
        )}
      </div>
      <Checkbox checked={chain} onChange={(e) => setChain(e.target.checked)}>
        Each phase builds on the one before it (its branch is stacked on the previous one, so they merge in this order)
      </Checkbox>
    </Modal>
  );
};

// ===== test checklist =====

const envForStage = (stage: DevelopmentStage): DevelopmentTestEnvironment =>
  stage === 'MERGED_DEV' ? 'DEV' : stage === 'BETA' || stage === 'PRODUCTION' || stage === 'ANNOUNCED' ? 'BETA' : 'LOCAL';

// Split "how to test" notes into checklist lines: one per bullet / numbered line.
export const notesToItems = (notes: string): string[] =>
  notes
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 100);

interface TestChecklistProps {
  order: Pick<DevelopmentOrder, 'id' | 'title' | 'stage' | 'boardUrl' | 'testingNotes'>;
  items: DevelopmentTestItem[];
  writer: boolean;
  onChanged: () => void;
  // Phase checklists inside an initiative are shown smaller.
  heading?: React.ReactNode;
}

export const TestChecklist: React.FC<TestChecklistProps> = ({ order, items, writer, onChanged, heading }) => {
  const [testedIn, setTestedIn] = useState<DevelopmentTestEnvironment>(envForStage(order.stage));
  const [failing, setFailing] = useState<number | null>(null);
  const [failNote, setFailNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ text: string; expected: string; environment: DevelopmentTestEnvironment }>({ text: '', expected: '', environment: 'ANY' });
  const [editing, setEditing] = useState<DevelopmentTestItem | null>(null);

  useEffect(() => { setTestedIn(envForStage(order.stage)); }, [order.id, order.stage]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) message.success(ok);
      onChanged();
    } catch (e) {
      message.error(errMsg(e, 'Could not update the checklist'));
    } finally {
      setBusy(false);
    }
  };

  const record = (item: DevelopmentTestItem, result: 'PASS' | 'FAIL' | '', note?: string) =>
    run(() => developmentApi.tests.record(order.id, item.id, result, note, result ? testedIn : undefined));

  const copyText = () => {
    const lines = [`Test checklist: #${order.id} ${order.title}`, order.boardUrl, ''];
    items.forEach((i, n) => {
      const box = i.result === 'PASS' ? '[x]' : i.result === 'FAIL' ? '[!]' : '[ ]';
      lines.push(`- ${box} ${n + 1}. ${i.text}${i.environment !== 'ANY' ? ` (${i.environmentLabel})` : ''}`);
      if (i.expected) lines.push(`      Expect: ${i.expected}`);
      if (i.result === 'FAIL' && i.resultNote) lines.push(`      Failed: ${i.resultNote}`);
    });
    navigator.clipboard?.writeText(lines.join('\n'))
      .then(() => message.success('Checklist copied'))
      .catch(() => message.error('Could not copy'));
  };

  const passed = items.filter((i) => i.result === 'PASS').length;
  const failed = items.filter((i) => i.result === 'FAIL').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {heading}
        {/* A lone checklist has the count in its card title already. */}
        {heading && items.length > 0 && (
          <Tag color={failed > 0 ? 'red' : passed === items.length ? 'green' : 'default'} style={{ margin: 0 }}>
            {passed + failed}/{items.length} tested{failed > 0 ? ` · ${failed} failed` : ''}
          </Tag>
        )}
        <span style={{ flex: 1 }} />
        {items.length > 0 && (
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Testing in</Text>
            <Select
              size="small"
              style={{ width: 90 }}
              value={testedIn}
              onChange={(v) => setTestedIn(v)}
              options={developmentTestEnvironments.filter((e) => e.key !== 'ANY').map((e) => ({ label: e.label, value: e.key }))}
            />
          </Space>
        )}
        {items.length > 0 && <Tooltip title="Copy as text for chat, email or a PR description"><Button size="small" icon={<CopyOutlined />} onClick={copyText} /></Tooltip>}
        {writer && passed + failed > 0 && (
          <Popconfirm title="Start a new round? Every result is cleared (the old ones stay in Activity)." onConfirm={() => run(() => developmentApi.tests.newRound(order.id, `new round in ${testedIn.toLowerCase()}`), 'New test round started')}>
            <Tooltip title="New round (e.g. local passed, now test in beta)"><Button size="small" icon={<RedoOutlined />} /></Tooltip>
          </Popconfirm>
        )}
      </div>

      {items.length === 0 && (
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">No test checklist yet.</Text>
          {writer && order.testingNotes && notesToItems(order.testingNotes).length > 0 && (
            <Button size="small" type="link" loading={busy}
              onClick={() => run(() => developmentApi.tests.add(order.id, notesToItems(order.testingNotes!).map((text) => ({ text }))), 'Checklist made from the testing notes')}>
              Make one from the testing notes
            </Button>
          )}
        </div>
      )}

      {items.map((item, n) => (
        <div key={item.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Text type="secondary" style={{ minWidth: 22 }}>{n + 1}.</Text>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ textDecoration: item.result === 'PASS' ? 'line-through' : undefined }}>{item.text}</Text>
              {item.environment !== 'ANY' && <Tag style={{ marginLeft: 6, fontSize: 11 }}>{item.environmentLabel}</Tag>}
              {item.expected && <div><Text type="secondary" style={{ fontSize: 13 }}>Expect: {item.expected}</Text></div>}
              {item.result && (
                <div style={{ fontSize: 12 }}>
                  <Tag color={item.result === 'PASS' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                    {item.result === 'PASS' ? 'Passed' : 'Failed'}{item.testedIn ? ` in ${item.testedIn.toLowerCase()}` : ''}
                  </Tag>
                  <Text type="secondary">{item.testedBy}{item.testedAt ? ` · ${dayjs(item.testedAt).format('MMM D h:mm A')}` : ''}</Text>
                  {item.resultNote && <div><Text type={item.result === 'FAIL' ? 'danger' : 'secondary'}>{item.resultNote}</Text></div>}
                </div>
              )}
              {failing === item.id && (
                <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                  <Input autoFocus placeholder="What happened instead?" value={failNote} onChange={(e) => setFailNote(e.target.value)}
                    onPressEnter={() => { record(item, 'FAIL', failNote.trim() || undefined); setFailing(null); }} />
                  <Button danger loading={busy} onClick={() => { record(item, 'FAIL', failNote.trim() || undefined); setFailing(null); }}>Save as failed</Button>
                  <Button onClick={() => setFailing(null)}>Cancel</Button>
                </Space.Compact>
              )}
            </div>
            <Space size={0}>
              {item.result ? (
                <Tooltip title="Clear the result"><Button size="small" type="text" icon={<CloseOutlined />} disabled={busy} onClick={() => record(item, '')} /></Tooltip>
              ) : (
                <>
                  <Tooltip title={`Passed in ${testedIn.toLowerCase()}`}>
                    <Button size="small" type="text" style={{ color: '#52c41a' }} icon={<CheckOutlined />} disabled={busy} onClick={() => record(item, 'PASS')} />
                  </Tooltip>
                  <Tooltip title={`Failed in ${testedIn.toLowerCase()}`}>
                    <Button size="small" type="text" danger icon={<CloseOutlined />} disabled={busy} onClick={() => { setFailing(item.id); setFailNote(''); }}>Fail</Button>
                  </Tooltip>
                </>
              )}
              {writer && <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing({ ...item })} />}
              {writer && (
                <Popconfirm title="Remove this test?" onConfirm={() => run(() => developmentApi.tests.remove(order.id, item.id))}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          </div>
        </div>
      ))}

      {writer && (
        <Space.Compact style={{ width: '100%', marginTop: 8 }}>
          <Input placeholder="Test: what to do" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} style={{ width: '42%' }} />
          <Input placeholder="Expect (optional)" value={draft.expected} onChange={(e) => setDraft({ ...draft, expected: e.target.value })} style={{ width: '34%' }} />
          <Select
            value={draft.environment}
            onChange={(v) => setDraft({ ...draft, environment: v })}
            style={{ width: '14%' }}
            options={developmentTestEnvironments.map((e) => ({ label: e.label, value: e.key }))}
          />
          <Button icon={<PlusOutlined />} disabled={!draft.text.trim()} loading={busy}
            onClick={() => run(async () => {
              await developmentApi.tests.add(order.id, [{ text: draft.text.trim(), expected: draft.expected.trim() || undefined, environment: draft.environment }]);
              setDraft({ text: '', expected: '', environment: draft.environment });
            })}>
            Add
          </Button>
        </Space.Compact>
      )}

      <Modal
        title="Edit test"
        open={!!editing}
        onCancel={() => setEditing(null)}
        okButtonProps={{ loading: busy }}
        onOk={() => editing && run(async () => {
          await developmentApi.tests.update(order.id, editing.id, { text: editing.text, expected: editing.expected ?? '', environment: editing.environment });
          setEditing(null);
        })}
      >
        {editing && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input.TextArea rows={2} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
            <Input.TextArea rows={2} placeholder="Expect" value={editing.expected ?? ''} onChange={(e) => setEditing({ ...editing, expected: e.target.value })} />
            <Select
              style={{ width: 160 }}
              value={editing.environment}
              onChange={(v) => setEditing({ ...editing, environment: v })}
              options={developmentTestEnvironments.map((e) => ({ label: e.label, value: e.key }))}
            />
          </Space>
        )}
      </Modal>
    </div>
  );
};
