import React, { useEffect, useState } from 'react';
import { Tag, Select, Button, Popover, Space, Input, message } from 'antd';
import { TagOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import { labelApi, type TicketLabel } from '../api';

interface LabelChipsProps {
  ticketId: number;
  attached: TicketLabel[];
  available: TicketLabel[];
  onChange: () => void;
  compact?: boolean;
  // When the org's label dictionary is empty, the editor offers a quick
  // "create + attach" path so the first label is one click rather than a
  // settings detour. Caller controls whether we expose that surface.
  allowCreate?: boolean;
}

// Returns "#fff" or "#000" so the chip text is legible against the chip background.
function textForBg(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#000' : '#fff';
}

const PRESET_COLORS = [
  '#f44336', '#ff9800', '#fbc02d', '#4caf50', '#00bcd4',
  '#2196f3', '#3f51b5', '#9c27b0', '#795548', '#607d8b',
];

const LabelChips: React.FC<LabelChipsProps> = ({ ticketId, attached, available, onChange, compact, allowCreate }) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[1]);
  const [creating, setCreating] = useState(false);

  const detach = async (labelId: number) => {
    await labelApi.detach(ticketId, labelId);
    onChange();
  };

  const attach = async (labelId: number) => {
    await labelApi.attach(ticketId, labelId);
    onChange();
  };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await labelApi.create(newName.trim(), newColor);
      await labelApi.attach(ticketId, created.id);
      setNewName('');
      onChange();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to create label');
    } finally {
      setCreating(false);
    }
  };

  const attachedIds = new Set(attached.map((l) => l.id));
  const selectable = available.filter((l) => !attachedIds.has(l.id));

  const editor = (
    <div style={{ minWidth: 240 }}>
      <Select
        size="small"
        placeholder="Attach existing label..."
        style={{ width: '100%' }}
        showSearch
        value={undefined}
        onChange={(v) => attach(Number(v))}
        options={selectable.map((l) => ({
          label: <Tag color={l.color} style={{ color: textForBg(l.color), border: 'none' }}>{l.name}</Tag>,
          value: l.id,
        }))}
        filterOption={(input, option) =>
          (selectable.find((l) => l.id === option?.value)?.name || '').toLowerCase().includes(input.toLowerCase())
        }
      />
      {allowCreate && (
        <div style={{ marginTop: 8 }}>
          <Input
            size="small"
            placeholder="New label name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={create}
          />
          <Space wrap size={4} style={{ marginTop: 6 }}>
            {PRESET_COLORS.map((c) => (
              <span
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: c,
                  cursor: 'pointer',
                  display: 'inline-block',
                  border: newColor === c ? '2px solid #fff' : '2px solid transparent',
                }}
              />
            ))}
          </Space>
          <Button
            type="primary"
            size="small"
            style={{ marginTop: 6 }}
            loading={creating}
            disabled={!newName.trim()}
            onClick={create}
            block
          >
            Create + attach
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Space size={4} wrap>
      {attached.map((l) => (
        <Tag
          key={l.id}
          color={l.color}
          closable
          onClose={(e) => { e.preventDefault(); detach(l.id); }}
          closeIcon={<CloseOutlined style={{ color: textForBg(l.color), fontSize: 10 }} />}
          style={{
            color: textForBg(l.color),
            border: 'none',
            fontSize: compact ? 10 : 12,
            padding: compact ? '0 6px' : undefined,
            margin: 0,
          }}
        >
          {l.name}
        </Tag>
      ))}
      <Popover
        content={editor}
        title={<><TagOutlined /> Labels</>}
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomLeft"
      >
        <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ padding: compact ? '0 4px' : undefined, height: compact ? 18 : 22 }} />
      </Popover>
    </Space>
  );
};

export default LabelChips;
