import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, Checkbox, Collapse, Descriptions, Drawer, Empty, Form, Input, Modal, Popconfirm,
  Segmented, Select, Space, Spin, Steps, Table, Tabs, Tag, Timeline, Tooltip, Typography, message,
} from 'antd';
import type { TableProps } from 'antd';
import {
  AppstoreOutlined, BranchesOutlined, DeleteOutlined, EditOutlined, FileTextOutlined, LinkOutlined,
  PlayCircleOutlined, PlusOutlined, PullRequestOutlined, ReloadOutlined, RocketOutlined, SearchOutlined,
  VideoCameraAddOutlined, VideoCameraOutlined, ArrowRightOutlined, SwapOutlined, CheckSquareOutlined,
  ApartmentOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  developmentApi, developmentStages, developmentStageMap, ticketApi, fixStatusMeta,
  type AuthUser, type DevelopmentLink, type DevelopmentLinkKind, type DevelopmentOrder, type DevelopmentOrderDetail,
  type DevelopmentProject, type DevelopmentStage, type Ticket,
} from '../api';
import TicketActivityTab from '../components/TicketActivityTab';
import {
  GroupModal, PhaseStrip, PhasesCard, PlacementCard, SequenceTag, TestChecklist, TestCountTag,
} from '../components/DevelopmentPhases';

const { Title, Text, Paragraph, Link } = Typography;

interface Props {
  user: AuthUser;
}

const linkKinds: DevelopmentLinkKind[] = ['BRANCH', 'PR', 'COMMIT', 'DOC', 'VIDEO'];

// Beta is the hand-off point: from there on bugs come in through the widget
// like any other, so the default board shows only work still in flight.
// Shipped items are hidden, not gone — the digest and the announcement video
// still need them.
type BoardView = 'active' | 'shipped' | 'all';
const activeStages: DevelopmentStage[] = ['ORDERED', 'IN_PROGRESS', 'LOCAL_DEMO', 'PR_OPEN', 'MERGED_DEV'];
const shippedStages: DevelopmentStage[] = ['BETA', 'PRODUCTION', 'ANNOUNCED'];
const linkKindIcon: Record<DevelopmentLinkKind, React.ReactNode> = {
  BRANCH: <BranchesOutlined />,
  PR: <PullRequestOutlined />,
  COMMIT: <SwapOutlined />,
  DOC: <FileTextOutlined />,
  VIDEO: <VideoCameraOutlined />,
};

// The board is a tree: an initiative row holds its phases (antd tree data).
type BoardRow = DevelopmentOrder & { children?: BoardRow[] };

const buildTree = (list: DevelopmentOrder[]): BoardRow[] => {
  const byId = new Map<number, BoardRow>(list.map((o) => [o.id, { ...o }]));
  const roots: BoardRow[] = [];
  for (const row of byId.values()) {
    const parent = row.parentOrderId ? byId.get(row.parentOrderId) : undefined;
    if (parent) (parent.children ??= []).push(row);
    else roots.push(row);
  }
  for (const row of byId.values()) row.children?.sort((a, b) => (a.phaseNumber ?? 999) - (b.phaseNumber ?? 999));
  return roots;
};

// antd sorts nested rows with the column sorter too; phases of one initiative
// keep their phase order whichever column or direction is active.
const phaseAware = (cmp: (a: DevelopmentOrder, b: DevelopmentOrder) => number) =>
  (a: DevelopmentOrder, b: DevelopmentOrder, order?: 'ascend' | 'descend' | null) =>
    a.parentOrderId && a.parentOrderId === b.parentOrderId
      ? ((a.phaseNumber ?? 999) - (b.phaseNumber ?? 999)) * (order === 'descend' ? -1 : 1)
      : cmp(a, b);

const fmtDate = (v?: string | null) => (v ? dayjs(v).format('MMM D, YYYY') : '—');
const fmtDateTime = (v?: string | null) => (v ? dayjs(v).format('MMM D, YYYY h:mm A') : '—');

const StageTag: React.FC<{ stage: DevelopmentStage; style?: React.CSSProperties }> = ({ stage, style }) => {
  const meta = developmentStageMap[stage];
  return <Tag color={meta?.color ?? 'default'} style={style}>{meta?.label ?? stage}</Tag>;
};

const errMsg = (err: any, fallback: string) => err?.response?.data?.message || fallback;

const DevelopmentPage: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const writer = user.role !== 'VIEWER';

  // ----- board state -----
  const [orders, setOrders] = useState<DevelopmentOrder[]>([]);
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<number | undefined>();
  const [stageFilter, setStageFilter] = useState<DevelopmentStage[]>([]);
  const [needsVideoOnly, setNeedsVideoOnly] = useState(false);
  const [view, setView] = useState<BoardView>('active');
  const [search, setSearch] = useState('');
  const [groupByApp, setGroupByApp] = useState(false);
  const [shippedToday, setShippedToday] = useState<DevelopmentOrder[] | null>(null);
  // Every order regardless of filters: the pickers for initiative / builds on.
  const [allOrders, setAllOrders] = useState<DevelopmentOrder[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);

  // ----- detail state -----
  const [detail, setDetail] = useState<DevelopmentOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stageNote, setStageNote] = useState('');
  const [stagePick, setStagePick] = useState<DevelopmentStage | undefined>();
  const [announceUrl, setAnnounceUrl] = useState('');
  const [testingDraft, setTestingDraft] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [linkForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // ----- create / promote -----
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteCandidates, setPromoteCandidates] = useState<Ticket[]>([]);
  const [promoteId, setPromoteId] = useState<number | undefined>();

  const load = useCallback(() => {
    setLoading(true);
    // An explicit stage pick wins; "needs video" only makes sense on shipped
    // items, so it overrides the Active view's stage restriction.
    let stages: DevelopmentStage[] | undefined = stageFilter.length > 0 ? stageFilter : undefined;
    if (!stages && !needsVideoOnly) {
      if (view === 'active') stages = activeStages;
      else if (view === 'shipped') stages = shippedStages;
    }
    developmentApi
      .list({
        projectId: projectFilter,
        stage: stages,
        needsAnnouncement: needsVideoOnly,
        search: search || undefined,
        includeAnnounced: true,
        includePhases: true,
      })
      .then(setOrders)
      .catch((e) => message.error(errMsg(e, 'Could not load development orders')))
      .finally(() => setLoading(false));
    developmentApi.list({}).then(setAllOrders).catch(() => {});
  }, [projectFilter, stageFilter, needsVideoOnly, search, view]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    developmentApi.projects().then(setProjects).catch(() => {});
    developmentApi.shipped().then((r) => setShippedToday(r.items)).catch(() => setShippedToday([]));
  }, []);

  const openDetail = useCallback((orderId: number) => {
    setDetailLoading(true);
    developmentApi
      .get(orderId)
      .then((d) => {
        setDetail(d);
        setStagePick(undefined);
        setStageNote('');
        setAnnounceUrl(d.order.announcementVideoUrl ?? '');
        setTestingDraft(d.order.testingNotes ?? '');
      })
      .catch((e) => {
        message.error(errMsg(e, `Development order #${orderId} was not found`));
        navigate('/development', { replace: true });
      })
      .finally(() => setDetailLoading(false));
  }, [navigate]);

  // Deep link: /development/:id opens the drawer. The digest email lands here.
  useEffect(() => {
    if (id && /^\d+$/.test(id)) openDetail(Number(id));
    else setDetail(null);
  }, [id, openDetail]);

  const closeDetail = () => {
    setDetail(null);
    navigate('/development');
  };

  // After any mutation: refresh the drawer and the row behind it.
  const applyDetail = (d: DevelopmentOrderDetail) => {
    setDetail(d);
    setAnnounceUrl(d.order.announcementVideoUrl ?? '');
    setTestingDraft(d.order.testingNotes ?? '');
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === d.order.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = d.order;
      return next;
    });
    developmentApi.shipped().then((r) => setShippedToday(r.items)).catch(() => {});
  };

  // After a change that can touch other rows (phases, roll-up, test counts).
  const reloadDetail = () => {
    if (detail) developmentApi.get(detail.order.id).then(applyDetail).catch(() => {});
    load();
  };

  // ----- mutations -----

  const moveStage = async (order: DevelopmentOrder, stage: DevelopmentStage, note?: string) => {
    setSaving(true);
    try {
      const d = await developmentApi.setStage(order.id, stage, note || undefined);
      message.success(`#${order.id} → ${developmentStageMap[stage].label}`);
      if (detail?.order.id === order.id) applyDetail(d);
      else load();
      setStageNote('');
      setStagePick(undefined);
    } catch (e) {
      message.error(errMsg(e, 'Could not move the stage'));
    } finally {
      setSaving(false);
    }
  };

  // Widget recordings live in private blob storage and need a short-lived SAS
  // link from the API; Videos Managed links open directly.
  const openVideo = async (o: DevelopmentOrder) => {
    if (!o.videoUrl) return;
    if (o.videoUrl.includes('.blob.core.windows.net')) {
      try {
        const url = await ticketApi.getVideoUrl(o.id);
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        message.error(errMsg(e, 'Could not open the recording'));
      }
      return;
    }
    window.open(o.videoUrl, '_blank', 'noopener');
  };

  const nextStageOf = (stage: DevelopmentStage): DevelopmentStage | null => {
    const i = developmentStages.findIndex((s) => s.key === stage);
    return i >= 0 && i < developmentStages.length - 1 ? developmentStages[i + 1].key : null;
  };

  const saveAnnouncement = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const d = await developmentApi.update(detail.order.id, { announcementVideoUrl: announceUrl.trim() });
      applyDetail(d);
      message.success(announceUrl.trim() ? 'Announcement video saved' : 'Announcement video cleared');
    } catch (e) {
      message.error(errMsg(e, 'Could not save the announcement video'));
    } finally {
      setSaving(false);
    }
  };

  const saveTestingNotes = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const d = await developmentApi.update(detail.order.id, { testingNotes: testingDraft.trim() });
      applyDetail(d);
      message.success('Testing notes saved');
    } catch (e) {
      message.error(errMsg(e, 'Could not save the testing notes'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = () => {
    if (!detail) return;
    editForm.setFieldsValue({
      title: detail.order.title,
      summary: detail.order.summary ?? '',
      testingNotes: detail.order.testingNotes ?? '',
      orderedBy: detail.order.orderedBy ?? '',
      videoUrl: detail.order.videoUrl ?? '',
      sessionLogUrl: detail.order.sessionLogUrl ?? '',
      sessionId: detail.order.sessionId ?? '',
      priority: detail.order.priority,
      transcript: detail.transcript ?? '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!detail) return;
    const v = await editForm.validateFields();
    setSaving(true);
    try {
      const d = await developmentApi.update(detail.order.id, {
        title: v.title,
        summary: v.summary ?? '',
        testingNotes: v.testingNotes ?? '',
        orderedBy: v.orderedBy ?? '',
        videoUrl: v.videoUrl ?? '',
        sessionLogUrl: v.sessionLogUrl ?? '',
        sessionId: v.sessionId ?? '',
        priority: v.priority,
        transcript: v.transcript ?? '',
      });
      applyDetail(d);
      setEditOpen(false);
      message.success('Order updated');
    } catch (e) {
      message.error(errMsg(e, 'Could not update the order'));
    } finally {
      setSaving(false);
    }
  };

  const addLink = async () => {
    if (!detail) return;
    const v = await linkForm.validateFields();
    setSaving(true);
    try {
      await developmentApi.addLink(detail.order.id, {
        kind: v.kind, repo: v.repo || undefined, name: v.name, url: v.url || undefined, note: v.note || undefined,
      });
      linkForm.resetFields(['name', 'url', 'note']);
      applyDetail(await developmentApi.get(detail.order.id));
    } catch (e) {
      message.error(errMsg(e, 'Could not add the link'));
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (link: DevelopmentLink) => {
    if (!detail) return;
    try {
      await developmentApi.removeLink(detail.order.id, link.id);
      applyDetail(await developmentApi.get(detail.order.id));
    } catch (e) {
      message.error(errMsg(e, 'Could not remove the link'));
    }
  };

  const createOrder = async () => {
    const v = await createForm.validateFields();
    setSaving(true);
    try {
      const d = await developmentApi.create({
        projectId: v.projectId,
        title: v.title,
        summary: v.summary || undefined,
        testingNotes: v.testingNotes || undefined,
        videoUrl: v.videoUrl || undefined,
        sessionLogUrl: v.sessionLogUrl || undefined,
        orderedBy: v.orderedBy || undefined,
        stage: v.stage,
        priority: v.priority,
        parentOrderId: v.parentOrderId || undefined,
        dependsOnOrderId: v.dependsOnOrderId || undefined,
      });
      setCreateOpen(false);
      createForm.resetFields();
      message.success(`Development order #${d.order.id} created`);
      load();
      navigate(`/development/${d.order.id}`);
    } catch (e) {
      message.error(errMsg(e, 'Could not create the order'));
    } finally {
      setSaving(false);
    }
  };

  const openPromote = async () => {
    setPromoteOpen(true);
    setPromoteId(undefined);
    try {
      const all = await ticketApi.list();
      setPromoteCandidates(all.filter((t) => !t.isDevelopmentOrder));
    } catch {
      setPromoteCandidates([]);
    }
  };

  const promote = async () => {
    if (!promoteId) return;
    setSaving(true);
    try {
      const d = await developmentApi.promoteTicket(promoteId);
      setPromoteOpen(false);
      message.success(`Ticket #${promoteId} is now a development order`);
      load();
      navigate(`/development/${d.order.id}`);
    } catch (e) {
      message.error(errMsg(e, 'Could not promote the ticket'));
    } finally {
      setSaving(false);
    }
  };

  // ----- table -----

  const renderLinks = (links: DevelopmentLink[]) => {
    const prs = links.filter((l) => l.kind === 'PR');
    const others = links.filter((l) => l.kind !== 'PR');
    if (links.length === 0) return <Text type="secondary">—</Text>;
    return (
      <Space size={4} wrap>
        {prs.map((l) => (
          <Tooltip key={l.id} title={[l.repo, l.note].filter(Boolean).join(' · ') || l.name}>
            {l.url ? (
              <Tag icon={<PullRequestOutlined />} color="purple" style={{ cursor: 'pointer', margin: 0 }}
                onClick={(e) => { e.stopPropagation(); window.open(l.url!, '_blank', 'noopener'); }}>
                {l.name}
              </Tag>
            ) : (
              <Tag icon={<PullRequestOutlined />} style={{ margin: 0 }}>{l.name}</Tag>
            )}
          </Tooltip>
        ))}
        {others.length > 0 && (
          <Tooltip title={others.map((l) => `${l.kind.toLowerCase()} ${l.repo ? l.repo + ' ' : ''}${l.name}`).join('\n')}>
            <Tag style={{ margin: 0 }}><BranchesOutlined /> {others.length}</Tag>
          </Tooltip>
        )}
      </Space>
    );
  };

  const orderIds = useMemo(() => new Set(orders.map((o) => o.id)), [orders]);

  const columns = (withApp: boolean) => {
    const cols: any[] = [];
    if (withApp) {
      cols.push({
        title: 'App',
        dataIndex: 'projectName',
        key: 'app',
        width: 160,
        render: (v: string) => <Tag icon={<AppstoreOutlined />}>{v}</Tag>,
        sorter: phaseAware((a, b) => a.projectName.localeCompare(b.projectName)),
      });
    }
    cols.push(
      {
        title: 'Ordered development',
        key: 'title',
        render: (_: any, r: BoardRow) => (
          <div style={{ minWidth: 240, display: 'inline-block', verticalAlign: 'top' }}>
            {r.isInitiative && (
              <Tag color="blue" icon={<ApartmentOutlined />} style={{ marginRight: 6, fontSize: 11 }}>initiative · {r.phaseCount} phases</Tag>
            )}
            {r.parentOrderId && (
              orderIds.has(r.parentOrderId)
                ? <Tag style={{ marginRight: 6, fontSize: 11 }}>Phase {r.phaseNumber}</Tag>
                : (
                  <Tooltip title={`Part of #${r.parentOrderId} ${r.parentTitle ?? ''}`}>
                    <Tag style={{ marginRight: 6, fontSize: 11, cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); navigate(`/development/${r.parentOrderId}`); }}>
                      Phase {r.phaseNumber}/{r.phaseCount} of #{r.parentOrderId}
                    </Tag>
                  </Tooltip>
                )
            )}
            <Text strong style={{ cursor: 'pointer' }} onClick={() => navigate(`/development/${r.id}`)}>
              #{r.id} {r.title}
            </Text>
            {(r.sequence || r.tests) && (
              <Space size={4} style={{ marginLeft: 8 }}>
                <SequenceTag sequence={r.sequence} onOpen={(oid) => navigate(`/development/${oid}`)} />
                <TestCountTag tests={r.tests} />
              </Space>
            )}
            {r.isInitiative && r.phases && (
              <div style={{ marginTop: 4 }}>
                <PhaseStrip phases={r.phases} onOpen={(oid) => navigate(`/development/${oid}`)} />
              </div>
            )}
            {r.ticketType === 'BUG' && (
              <Tag color="volcano" style={{ marginLeft: 8, fontSize: 11 }}>
                bug fix{r.fixStatus && fixStatusMeta[r.fixStatus] ? ` · ${fixStatusMeta[r.fixStatus].label}` : ''}
              </Tag>
            )}
            {r.testingNotes && (
              <Tooltip title={r.testingNotes}>
                <Tag color="cyan" style={{ marginLeft: 4, fontSize: 11 }}>how to test</Tag>
              </Tooltip>
            )}
            {r.summary && (
              <div>
                <Text type="secondary" ellipsis style={{ maxWidth: 520, display: 'inline-block', fontSize: 13 }}>
                  {r.summary}
                </Text>
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'Ordered',
        key: 'ordered',
        width: 150,
        render: (_: any, r: DevelopmentOrder) => (
          <div>
            <div>{fmtDate(r.orderedAt)}</div>
            {r.orderedBy && <Text type="secondary" style={{ fontSize: 12 }}>{r.orderedBy}</Text>}
          </div>
        ),
        sorter: phaseAware((a, b) => dayjs(a.orderedAt).valueOf() - dayjs(b.orderedAt).valueOf()),
        defaultSortOrder: 'descend' as const,
      },
      {
        title: 'Stage',
        key: 'stage',
        width: 170,
        render: (_: any, r: DevelopmentOrder) => {
          const next = nextStageOf(r.stage);
          if (r.isInitiative) {
            return (
              <Tooltip title="An initiative is as far along as its least-advanced phase">
                <span><StageTag stage={r.stage} style={{ margin: 0 }} /></span>
              </Tooltip>
            );
          }
          return (
            <Space size={4}>
              <StageTag stage={r.stage} style={{ margin: 0 }} />
              {writer && next && (
                <Tooltip title={`Move to ${developmentStageMap[next].label}`}>
                  <Button size="small" type="text" icon={<ArrowRightOutlined />}
                    onClick={(e) => { e.stopPropagation(); moveStage(r, next); }} />
                </Tooltip>
              )}
            </Space>
          );
        },
        sorter: phaseAware((a, b) => a.stageOrder - b.stageOrder),
      },
      {
        title: 'PRs / branches',
        key: 'links',
        width: 220,
        render: (_: any, r: DevelopmentOrder) => renderLinks(r.links),
      },
      {
        title: 'Video',
        key: 'video',
        width: 90,
        align: 'center' as const,
        render: (_: any, r: DevelopmentOrder) => (
          <Space size={0}>
            {r.videoUrl ? (
              <Tooltip title={r.ticketType === 'BUG' ? 'Reporter\'s screen recording' : (r.hasTranscript ? 'Ordering video (transcript on file)' : 'Ordering video')}>
                <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={(e) => { e.stopPropagation(); openVideo(r); }} />
              </Tooltip>
            ) : <Text type="secondary">—</Text>}
            {r.guidanceVideoUrl && (
              <Tooltip title="How it should work (re-recorded at triage)">
                <Button type="link" size="small" icon={<VideoCameraAddOutlined />} href={r.guidanceVideoUrl} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} />
              </Tooltip>
            )}
          </Space>
        ),
      },
      {
        title: 'Session log',
        key: 'session',
        width: 100,
        align: 'center' as const,
        render: (_: any, r: DevelopmentOrder) => r.sessionLogUrl ? (
          <Tooltip title={r.sessionLogUrl}>
            <Button type="link" size="small" icon={<FileTextOutlined />} href={r.sessionLogUrl} target="_blank" rel="noopener" />
          </Tooltip>
        ) : <Text type="secondary">—</Text>,
      },
      {
        title: 'Production',
        key: 'production',
        width: 130,
        render: (_: any, r: DevelopmentOrder) => fmtDate(r.productionAt),
        sorter: phaseAware((a, b) =>
          (a.productionAt ? dayjs(a.productionAt).valueOf() : 0) - (b.productionAt ? dayjs(b.productionAt).valueOf() : 0)),
      },
      {
        title: 'Announcement',
        key: 'announcement',
        width: 150,
        render: (_: any, r: DevelopmentOrder) => {
          if (r.announcementVideoUrl) {
            return (
              <Button type="link" size="small" icon={<VideoCameraOutlined />} href={r.announcementVideoUrl} target="_blank" rel="noopener">
                Watch
              </Button>
            );
          }
          if (r.needsAnnouncement) {
            return <Badge status="error" text={<Text type="danger" style={{ fontSize: 13 }}>needs video</Text>} />;
          }
          return <Text type="secondary">—</Text>;
        },
      },
    );
    return cols;
  };

  const tree = useMemo(() => buildTree(orders), [orders]);

  const grouped = useMemo(() => {
    const map = new Map<string, BoardRow[]>();
    for (const o of tree) {
      const list = map.get(o.projectName) ?? [];
      list.push(o);
      map.set(o.projectName, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tree]);

  const selectedOrders = useMemo(
    () => selectedKeys.map((k) => orders.find((o) => o.id === k)).filter((o): o is DevelopmentOrder => !!o),
    [selectedKeys, orders],
  );

  const tableProps = (rows: BoardRow[], withApp: boolean): TableProps<BoardRow> => ({
    dataSource: rows,
    columns: columns(withApp),
    rowKey: 'id',
    size: 'small',
    loading,
    pagination: rows.length > 25 ? { pageSize: 25 } : false,
    onRow: (r: BoardRow) => ({ onClick: () => navigate(`/development/${r.id}`), style: { cursor: 'pointer' } }),
    scroll: { x: true },
    // Expand icon and indent in the title column, so phases sit under their
    // initiative. With row selection the checkbox column counts and antd then
    // subtracts one from any index above 0, hence +2 rather than +1.
    expandable: { indentSize: 28, expandIconColumnIndex: (withApp ? 1 : 0) + (writer ? 2 : 0) },
    rowSelection: writer
      ? { selectedRowKeys: selectedKeys, onChange: setSelectedKeys, checkStrictly: true, columnWidth: 36 }
      : undefined,
  });

  const needsVideoCount = shippedToday?.filter((o) => o.needsAnnouncement).length ?? 0;

  // ----- detail drawer -----

  const order = detail?.order;
  const currentStageIndex = order ? developmentStages.findIndex((s) => s.key === order.stage) : -1;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}><RocketOutlined /> Development</Title>
        <Space wrap>
          {writer && selectedOrders.length > 0 && (
            <Tooltip title="Make the ticked orders phases of one initiative (one effort, several videos)">
              <Button icon={<ApartmentOutlined />} onClick={() => setGroupOpen(true)}>
                Group {selectedOrders.length} into an initiative
              </Button>
            </Tooltip>
          )}
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          {writer && <Button icon={<SwapOutlined />} onClick={openPromote}>Promote a ticket</Button>}
          {writer && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              createForm.setFieldsValue({ orderedBy: user.fullName, stage: 'ORDERED', priority: 'MEDIUM' });
              setCreateOpen(true);
            }}>
              New order
            </Button>
          )}
        </Space>
      </div>

      {shippedToday && shippedToday.length > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type={needsVideoCount > 0 ? 'warning' : 'success'}
          showIcon
          icon={<VideoCameraAddOutlined />}
          message={
            needsVideoCount > 0
              ? `${shippedToday.length} item${shippedToday.length === 1 ? '' : 's'} reached production today — ${needsVideoCount} still need${needsVideoCount === 1 ? 's' : ''} the what-shipped video`
              : `${shippedToday.length} item${shippedToday.length === 1 ? '' : 's'} reached production today and ${shippedToday.length === 1 ? 'is' : 'are'} announced`
          }
          description={
            <Space wrap size={4}>
              {shippedToday.map((o) => (
                <Tag key={o.id} color={o.needsAnnouncement ? 'red' : 'green'} style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/development/${o.id}`)}>
                  #{o.id} {o.title}
                </Tag>
              ))}
            </Space>
          }
        />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={[12, 8]}>
          <Segmented
            value={view}
            onChange={(v) => setView(v as BoardView)}
            options={[
              { label: 'Active', value: 'active' },
              { label: 'Shipped (beta → announced)', value: 'shipped' },
              { label: 'All', value: 'all' },
            ]}
          />
          <Select
            allowClear
            placeholder="All apps"
            style={{ width: 220 }}
            value={projectFilter}
            onChange={(v) => setProjectFilter(v)}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="All stages"
            style={{ minWidth: 220 }}
            maxTagCount={2}
            value={stageFilter}
            onChange={(v) => setStageFilter(v as DevelopmentStage[])}
            options={developmentStages.map((s) => ({ label: s.label, value: s.key }))}
          />
          <Input.Search
            allowClear
            placeholder="Search title or summary"
            style={{ width: 260 }}
            prefix={<SearchOutlined />}
            onSearch={(v) => setSearch(v.trim())}
            onClear={() => setSearch('')}
          />
          <Checkbox checked={needsVideoOnly} onChange={(e) => setNeedsVideoOnly(e.target.checked)}>Needs announcement video</Checkbox>
          <Segmented
            value={groupByApp ? 'app' : 'flat'}
            onChange={(v) => setGroupByApp(v === 'app')}
            options={[{ label: 'One list', value: 'flat' }, { label: 'By app', value: 'app' }]}
          />
        </Space>
      </Card>

      {!groupByApp && <Table {...tableProps(tree, true)} />}

      {groupByApp && (
        grouped.length === 0
          ? <Empty description={loading ? 'Loading…' : (view === 'active' ? 'Nothing in flight — shipped items are under the Shipped view' : 'No development orders match these filters')} />
          : grouped.map(([app, rows]) => (
            <Card key={app} size="small" style={{ marginBottom: 16 }}
              title={<Space><AppstoreOutlined /> {app} <Tag>{rows.length}</Tag></Space>}>
              <Table {...tableProps(rows, false)} />
            </Card>
          ))
      )}

      {/* ===== Detail drawer (deep link target) ===== */}
      <Drawer
        open={!!id}
        onClose={closeDetail}
        width={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 40 : 900)}
        title={order ? (
          <Space wrap>
            <Text strong>#{order.id}</Text>
            <Text>{order.title}</Text>
            <Tag icon={<AppstoreOutlined />}>{order.projectName}</Tag>
            <StageTag stage={order.stage} />
          </Space>
        ) : `Development order #${id}`}
        extra={writer && order && <Button icon={<EditOutlined />} onClick={openEdit}>Edit</Button>}
      >
        {detailLoading && !detail && <Spin />}
        {order && (
          <div>
            <Steps
              size="small"
              current={currentStageIndex}
              style={{ marginBottom: 20 }}
              items={developmentStages.map((s) => ({ title: s.label }))}
            />

            {order.isInitiative && (
              <Alert
                style={{ marginBottom: 16 }}
                type="info"
                showIcon
                icon={<ApartmentOutlined />}
                message={`Initiative: ${order.phaseCount} phases. Its stage follows its least-advanced phase, so move the phases, not this.`}
              />
            )}

            {order.isInitiative && (
              <PhasesCard
                initiative={order}
                allOrders={allOrders}
                writer={writer}
                onOpen={(oid) => navigate(`/development/${oid}`)}
                onChanged={reloadDetail}
              />
            )}

            {writer && !order.isInitiative && (
              <Card size="small" style={{ marginBottom: 16 }} title="Move stage">
                <Space wrap>
                  <Select
                    style={{ width: 200 }}
                    placeholder="Pick a stage"
                    value={stagePick}
                    onChange={(v) => setStagePick(v as DevelopmentStage)}
                    options={developmentStages.map((s) => ({ label: s.label, value: s.key, disabled: s.key === order.stage }))}
                  />
                  <Input
                    style={{ width: 320 }}
                    placeholder="Note (optional) — e.g. merged by Anil, deployed to beta"
                    value={stageNote}
                    onChange={(e) => setStageNote(e.target.value)}
                    onPressEnter={() => stagePick && moveStage(order, stagePick, stageNote)}
                  />
                  <Button type="primary" disabled={!stagePick} loading={saving} onClick={() => stagePick && moveStage(order, stagePick, stageNote)}>
                    Move
                  </Button>
                  {nextStageOf(order.stage) && (
                    <Button icon={<ArrowRightOutlined />} loading={saving} onClick={() => moveStage(order, nextStageOf(order.stage)!, stageNote)}>
                      Next: {developmentStageMap[nextStageOf(order.stage)!].label}
                    </Button>
                  )}
                </Space>
              </Card>
            )}

            {!order.isInitiative && (
              <PlacementCard
                order={order}
                allOrders={allOrders}
                writer={writer}
                onOpen={(oid) => navigate(`/development/${oid}`)}
                onSaved={(d) => { applyDetail(d); load(); }}
              />
            )}

            {!order.isInitiative && (order.stage === 'PRODUCTION' || order.stage === 'ANNOUNCED') && (
              <Card
                size="small"
                style={{ marginBottom: 16, borderColor: order.needsAnnouncement ? '#ff4d4f' : undefined }}
                title={<Space><VideoCameraAddOutlined /> What-shipped video {order.needsAnnouncement && <Badge status="error" text="needs video" />}</Space>}
              >
                <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                  Reached production {fmtDateTime(order.productionAt)}.
                  {order.digestSentAt ? ` Digest emailed ${fmtDateTime(order.digestSentAt)}.` : ' Digest not sent yet.'}
                  {' '}Paste the Videos Managed link of the announcement here; the stage moves to Announced.
                </Paragraph>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={announceUrl}
                    disabled={!writer}
                    placeholder="https://videos-dev.managedplatform.com/<account>/r/<slug>"
                    onChange={(e) => setAnnounceUrl(e.target.value)}
                    onPressEnter={saveAnnouncement}
                  />
                  {writer && <Button type="primary" loading={saving} onClick={saveAnnouncement}>Save</Button>}
                  {order.announcementVideoUrl && (
                    <Button icon={<PlayCircleOutlined />} href={order.announcementVideoUrl} target="_blank" rel="noopener">Watch</Button>
                  )}
                </Space.Compact>
              </Card>
            )}

            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Ordered">{fmtDateTime(order.orderedAt)}{order.orderedBy ? ` by ${order.orderedBy}` : ''}</Descriptions.Item>
              <Descriptions.Item label="Priority / status"><Tag>{order.priority}</Tag><Tag>{order.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={order.ticketType === 'BUG' ? 'Reporter\'s recording' : 'Ordering video'}>
                {order.videoUrl
                  ? <Link onClick={() => openVideo(order)}><PlayCircleOutlined /> {order.videoUrl.includes('.blob.core.windows.net') ? 'open the screen recording' : order.videoUrl}</Link>
                  : <Text type="secondary">none</Text>}
                {order.guidanceVideoUrl && (
                  <div><Link href={order.guidanceVideoUrl} target="_blank" rel="noopener"><VideoCameraAddOutlined /> How it should work: {order.guidanceVideoUrl}</Link></div>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Session log">
                {order.sessionLogUrl
                  ? <Link href={order.sessionLogUrl} target="_blank" rel="noopener"><FileTextOutlined /> {order.sessionLogUrl}</Link>
                  : <Text type="secondary">none</Text>}
                {order.sessionId && <div><Text type="secondary" style={{ fontSize: 12 }}>session {order.sessionId}</Text></div>}
              </Descriptions.Item>
              <Descriptions.Item label="Production">{fmtDateTime(order.productionAt)}</Descriptions.Item>
              <Descriptions.Item label="Announced">{fmtDateTime(order.announcedAt)}</Descriptions.Item>
              <Descriptions.Item label="Board link" span={2}>
                <Text copyable={{ text: order.boardUrl }} style={{ fontSize: 13 }}>{order.boardUrl}</Text>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>paste into the PR description</Text>
              </Descriptions.Item>
            </Descriptions>

            {order.summary && (
              <Card size="small" title="What was ordered" style={{ marginBottom: 16 }}>
                <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{order.summary}</Paragraph>
              </Card>
            )}

            <Card
              size="small"
              style={{ marginBottom: 16, borderColor: order.testingNotes ? undefined : 'rgba(255,255,255,0.25)' }}
              title={<Space><CheckSquareOutlined /> How to test / expected outcome {!order.testingNotes && <Tag>missing</Tag>}</Space>}
            >
              {writer ? (
                <>
                  <Input.TextArea
                    rows={4}
                    value={testingDraft}
                    onChange={(e) => setTestingDraft(e.target.value)}
                    placeholder="What a tester should open, do and expect. Example: on WO 84530 open Estimates, draft with AI; the document says Estimate, lists nitrogen + recovery + vacuum + welding, and the hours match the technician's log."
                  />
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Shown on the board, copied into PR descriptions, and read by whoever tests in beta.
                    </Text>
                    <Button size="small" type="primary" loading={saving} disabled={(order.testingNotes ?? '') === testingDraft.trim()} onClick={saveTestingNotes}>
                      Save
                    </Button>
                  </div>
                </>
              ) : (
                <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{order.testingNotes || <Text type="secondary">Nobody has written how to test this yet.</Text>}</Paragraph>
              )}
            </Card>

            <Card
              size="small"
              style={{ marginBottom: 16 }}
              title={<Space><ExperimentOutlined /> Test checklist <TestCountTag tests={order.tests} /></Space>}
            >
              {!order.isInitiative && (
                <>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                    When this is ready to try (local demo, dev, beta), whoever tests it works down this list and marks each line Passed or Failed.
                  </Text>
                  <TestChecklist order={order} items={detail!.tests ?? []} writer={writer} onChanged={reloadDetail} />
                </>
              )}
              {order.isInitiative && (
                <>
                  {(detail!.tests?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <TestChecklist order={order} items={detail!.tests ?? []} writer={writer} onChanged={reloadDetail}
                        heading={<Text strong>Across the whole initiative</Text>} />
                    </div>
                  )}
                  {(detail!.phaseTests ?? []).map((p) => (
                    <div key={p.orderId} style={{ marginBottom: 16 }}>
                      <TestChecklist
                        order={{ id: p.orderId, title: p.title, stage: p.stage, boardUrl: order.boardUrl.replace(/\/\d+$/, `/${p.orderId}`), testingNotes: null }}
                        items={p.items}
                        writer={writer}
                        onChanged={reloadDetail}
                        heading={(
                          <Space size={6}>
                            <Tag style={{ margin: 0 }}>Phase {p.phaseNumber}</Tag>
                            <Link onClick={() => navigate(`/development/${p.orderId}`)}>#{p.orderId} {p.title}</Link>
                            <StageTag stage={p.stage} style={{ margin: 0 }} />
                          </Space>
                        )}
                      />
                    </div>
                  ))}
                </>
              )}
            </Card>

            <Card size="small" title={<Space><LinkOutlined /> Branches, PRs and documents <Tag>{order.links.length}</Tag></Space>} style={{ marginBottom: 16 }}>
              {order.links.length === 0 && <Text type="secondary">No links yet.</Text>}
              {order.links.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <Tag style={{ margin: 0, minWidth: 80, textAlign: 'center' }}>{linkKindIcon[l.kind]} {l.kind}</Tag>
                  {l.repo && <Text type="secondary">{l.repo}</Text>}
                  {l.url
                    ? <Link href={l.url} target="_blank" rel="noopener">{l.name}</Link>
                    : <Text code>{l.name}</Text>}
                  {l.note && <Text type="secondary" style={{ fontSize: 12 }}>— {l.note}</Text>}
                  <span style={{ flex: 1 }} />
                  {writer && (
                    <Popconfirm title="Remove this link?" onConfirm={() => removeLink(l)}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </div>
              ))}
              {writer && (
                <Form form={linkForm} layout="inline" style={{ marginTop: 12, rowGap: 8 }} initialValues={{ kind: 'PR' }}>
                  <Form.Item name="kind" rules={[{ required: true }]}>
                    <Select style={{ width: 110 }} options={linkKinds.map((k) => ({ label: k, value: k }))} />
                  </Form.Item>
                  <Form.Item name="repo">
                    <Input placeholder="Repo (ServiceManagerUI)" style={{ width: 190 }} />
                  </Form.Item>
                  <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
                    <Input placeholder="PR 4347 / branch name" style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item name="url">
                    <Input placeholder="https://…" style={{ width: 240 }} />
                  </Form.Item>
                  <Form.Item name="note">
                    <Input placeholder="Note" style={{ width: 160 }} />
                  </Form.Item>
                  <Form.Item>
                    <Button icon={<PlusOutlined />} onClick={addLink} loading={saving}>Add</Button>
                  </Form.Item>
                </Form>
              )}
            </Card>

            <Tabs
              items={[
                {
                  key: 'stages',
                  label: 'Stage history',
                  children: detail!.stageHistory.length === 0 ? <Empty description="No stage changes yet" /> : (
                    <Timeline
                      items={[...detail!.stageHistory].reverse().map((h) => ({
                        color: developmentStageMap[h.toStage as DevelopmentStage]?.color === 'success' ? 'green' : (developmentStageMap[h.toStage as DevelopmentStage]?.color ?? 'gray'),
                        children: (
                          <div>
                            <Space size={6} wrap>
                              {h.fromStage && <StageTag stage={h.fromStage as DevelopmentStage} />}
                              {h.fromStage && <ArrowRightOutlined />}
                              <StageTag stage={h.toStage as DevelopmentStage} />
                              {h.note && <Text type="secondary">— {h.note}</Text>}
                            </Space>
                            <div><Text type="secondary" style={{ fontSize: 12 }}>{fmtDateTime(h.changedAt)}{h.changedBy ? ` · ${h.changedBy}` : ''}</Text></div>
                          </div>
                        ),
                      }))}
                    />
                  ),
                },
                {
                  key: 'activity',
                  label: 'Activity',
                  children: <TicketActivityTab ticketId={order.id} active />,
                },
                {
                  key: 'transcript',
                  label: `Transcript${detail!.transcript ? '' : ' (none)'}`,
                  children: detail!.transcript
                    ? <Collapse items={[{ key: 't', label: 'Captions from the ordering video', children: <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: 420, overflow: 'auto' }}>{detail!.transcript}</pre> }]} />
                    : <Empty description="No transcript on this order" />,
                },
              ]}
            />
          </div>
        )}
      </Drawer>

      {/* ===== Edit modal ===== */}
      <Modal title={order ? `Edit order #${order.id}` : 'Edit order'} open={editOpen} onOk={saveEdit} onCancel={() => setEditOpen(false)} okButtonProps={{ loading: saving }} width={720}>
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="What was ordered">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="testingNotes" label="How to test / expected outcome">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="orderedBy" label="Ordered by" style={{ width: 220 }}><Input /></Form.Item>
            <Form.Item name="priority" label="Priority" style={{ width: 160 }}>
              <Select options={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="sessionId" label="Session id" style={{ width: 260 }}><Input /></Form.Item>
          </Space>
          <Form.Item name="videoUrl" label="Ordering video (Videos Managed link)"><Input /></Form.Item>
          <Form.Item name="sessionLogUrl" label="Session log (markdown link)"><Input /></Form.Item>
          <Form.Item name="transcript" label="Transcript"><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>

      {/* ===== Create modal ===== */}
      <Modal title="New development order" open={createOpen} onOk={createOrder} onCancel={() => setCreateOpen(false)} okText="Create" okButtonProps={{ loading: saving }} width={720}>
        <Form form={createForm} layout="vertical">
          <Form.Item name="projectId" label="App" rules={[{ required: true, message: 'Pick the application' }]}>
            <Select showSearch optionFilterProp="label" options={projects.map((p) => ({ label: p.name, value: p.id }))} />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
            <Input placeholder="Estimates + change orders + AI estimate agent" />
          </Form.Item>
          <Form.Item name="summary" label="What was ordered">
            <Input.TextArea rows={3} placeholder="One paragraph: what the video asked for" />
          </Form.Item>
          <Form.Item name="testingNotes" label="How to test / expected outcome">
            <Input.TextArea rows={2} placeholder="What a tester should open, do and expect" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="orderedBy" label="Ordered by" style={{ width: 220 }}><Input /></Form.Item>
            <Form.Item name="stage" label="Stage" style={{ width: 200 }}>
              <Select options={developmentStages.map((s) => ({ label: s.label, value: s.key }))} />
            </Form.Item>
            <Form.Item name="priority" label="Priority" style={{ width: 160 }}>
              <Select options={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => ({ label: p, value: p }))} />
            </Form.Item>
          </Space>
          <Form.Item name="videoUrl" label="Ordering video (Videos Managed link)"><Input placeholder="https://videos-dev.managedplatform.com/<account>/r/<slug>" /></Form.Item>
          <Form.Item name="sessionLogUrl" label="Session log (markdown link)"><Input /></Form.Item>
          <Space style={{ display: 'flex' }} align="start" wrap>
            <Form.Item name="parentOrderId" label="Next phase of (optional)" style={{ width: 320 }}>
              <Select allowClear showSearch optionFilterProp="label" placeholder="Standalone"
                options={allOrders.filter((o) => o.isInitiative).map((o) => ({ label: `#${o.id} ${o.title}`, value: o.id }))} />
            </Form.Item>
            <Form.Item name="dependsOnOrderId" label="Builds on (optional)" style={{ width: 320 }}>
              <Select allowClear showSearch optionFilterProp="label" placeholder="Nothing"
                options={allOrders.filter((o) => !o.isInitiative).map((o) => ({ label: `#${o.id} ${o.title}`, value: o.id }))} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <GroupModal
        open={groupOpen}
        selected={selectedOrders}
        allOrders={allOrders}
        onClose={() => setGroupOpen(false)}
        onDone={(d) => {
          setGroupOpen(false);
          setSelectedKeys([]);
          message.success(`Initiative #${d.order.id}: ${d.order.phaseCount} phases`);
          load();
          navigate(`/development/${d.order.id}`);
        }}
      />

      {/* ===== Promote modal ===== */}
      <Modal title="Promote a ticket to a development order" open={promoteOpen} onOk={promote} onCancel={() => setPromoteOpen(false)} okText="Promote" okButtonProps={{ loading: saving, disabled: !promoteId }}>
        <Paragraph type="secondary">
          Pick a ticket (usually a feature request from the widget). It keeps its history and chat; it just appears on this board at the Ordered stage.
        </Paragraph>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Search tickets"
          value={promoteId}
          onChange={(v) => setPromoteId(v)}
          optionFilterProp="label"
          options={promoteCandidates.map((t) => ({ label: `#${t.id} [${t.ticketType}] ${t.title}`, value: t.id }))}
          notFoundContent={promoteCandidates.length === 0 ? 'No tickets available' : undefined}
        />
      </Modal>
    </div>
  );
};

export default DevelopmentPage;
