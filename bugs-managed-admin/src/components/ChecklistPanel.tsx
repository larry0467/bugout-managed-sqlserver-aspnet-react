import React, { useEffect, useState } from 'react';
import { Checkbox, Input, Button, Space, Progress, Typography, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { checklistApi, type ChecklistItem } from '../api';

const { Text } = Typography;

interface Props {
  ticketId: number;
  onProgressChange?: (done: number, total: number) => void;
}

const ChecklistPanel: React.FC<Props> = ({ ticketId, onProgressChange }) => {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const list = await checklistApi.list(ticketId);
    setItems(list);
    if (onProgressChange) onProgressChange(list.filter((i) => i.isDone).length, list.length);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ticketId]);

  const toggle = async (item: ChecklistItem) => {
    await checklistApi.update(ticketId, item.id, { isDone: !item.isDone });
    load();
  };

  const remove = async (item: ChecklistItem) => {
    await checklistApi.remove(ticketId, item.id);
    load();
  };

  const add = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      await checklistApi.add(ticketId, newText.trim());
      setNewText('');
      await load();
    } finally {
      setAdding(false);
    }
  };

  const done = items.filter((i) => i.isDone).length;
  const total = items.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div>
      {total > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Progress percent={pct} size="small" status={pct === 100 ? 'success' : 'active'} />
          <Text type="secondary" style={{ fontSize: 11 }}>{done} of {total} done</Text>
        </div>
      )}
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <Checkbox checked={item.isDone} onChange={() => toggle(item)} />
            <Text delete={item.isDone} type={item.isDone ? 'secondary' : undefined} style={{ flex: 1 }}>
              {item.text}
            </Text>
            <Popconfirm title="Delete this item?" onConfirm={() => remove(item)}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </div>
        ))}
      </div>
      <Space.Compact style={{ marginTop: 8, width: '100%' }}>
        <Input
          size="small"
          placeholder="Add a checklist item..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onPressEnter={add}
        />
        <Button size="small" type="primary" icon={<PlusOutlined />} loading={adding} onClick={add} />
      </Space.Compact>
    </div>
  );
};

export default ChecklistPanel;
