"use client";

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Space, Switch, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

import type { AdminAITextAgent } from "@/services/api/admin-ai-text-agents";
import { useAdminAITextAgents } from "./use-admin-ai-text-agents";

const defaultInputSources = "[]";
const defaultJsonFields = "[]";

function formatJSONText(value?: string) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function validateJSON(value: string | undefined, label: string, requireArray = false) {
  const trimmed = value?.trim();
  if (!trimmed) return Promise.resolve();
  try {
    const parsed = JSON.parse(trimmed);
    if (requireArray && !Array.isArray(parsed)) return Promise.reject(new Error(`${label}必须是 JSON 数组`));
    return Promise.resolve();
  } catch {
    return Promise.reject(new Error(`${label}不是有效 JSON`));
  }
}

export default function AdminAITextAgentsPage() {
  const {
    agents,
    keyword,
    page,
    pageSize,
    total,
    isLoading,
    searchAgents,
    changePage,
    changePageSize,
    resetFilters,
    refreshAgents,
    saveAgent,
    deleteAgent,
    deleteAgents,
  } = useAdminAITextAgents();

  const [form] = Form.useForm<Partial<AdminAITextAgent>>();
  const [keywordText, setKeywordText] = useState(keyword);
  const [editingAgent, setEditingAgent] = useState<Partial<AdminAITextAgent> | null>(null);
  const [detailAgent, setDetailAgent] = useState<AdminAITextAgent | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<AdminAITextAgent | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  useEffect(() => setKeywordText(keyword), [keyword]);

  useEffect(() => {
    if (editingAgent) {
      form.setFieldsValue({
        enabled: true,
        ...editingAgent,
        inputSources: formatJSONText(editingAgent.inputSources || defaultInputSources),
        jsonExample: formatJSONText(editingAgent.jsonExample),
        jsonFields: formatJSONText(editingAgent.jsonFields || defaultJsonFields),
      });
    } else {
      form.resetFields();
    }
  }, [editingAgent, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    await saveAgent({
      ...editingAgent,
      ...values,
      inputSources: values.inputSources?.trim() || defaultInputSources,
      jsonExample: values.jsonExample?.trim() || "",
      jsonFields: values.jsonFields?.trim() || defaultJsonFields,
    });
    setEditingAgent(null);
  };

  const handleDelete = async () => {
    if (!deletingAgent) return;
    await deleteAgent(deletingAgent.id);
    setDeletingAgent(null);
  };

  const handleBatchDelete = async () => {
    if (!selectedAgentIds.length) return;
    await deleteAgents(selectedAgentIds);
    setSelectedAgentIds([]);
  };

  const columns: ProColumns<AdminAITextAgent>[] = [
    {
      title: "名称",
      dataIndex: "name",
      width: 230,
      ellipsis: true,
      render: (_, item) => (
        <Typography.Link strong ellipsis style={{ maxWidth: 210, display: "block" }} onClick={() => setDetailAgent(item)}>
          {item.name}
        </Typography.Link>
      ),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 90,
      render: (_, item) => <Tag color={item.enabled ? "green" : "default"}>{item.enabled ? "启用" : "停用"}</Tag>,
    },
    {
      title: "默认模型",
      dataIndex: "defaultModel",
      width: 170,
      ellipsis: true,
      render: (_, item) => <Typography.Text type="secondary">{item.defaultModel || "-"}</Typography.Text>,
    },
    {
      title: "提示词",
      dataIndex: "prompt",
      ellipsis: true,
      render: (_, item) => (
        <Typography.Text type="secondary" ellipsis style={{ maxWidth: 420, display: "block" }}>
          {item.prompt}
        </Typography.Text>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 170,
      render: (_, item) => <Typography.Text type="secondary">{dayjs(item.updatedAt).format("YYYY-MM-DD HH:mm")}</Typography.Text>,
    },
    {
      title: "操作",
      key: "actions",
      width: 132,
      align: "right",
      render: (_, item) => (
        <Space size={4}>
          <Tooltip title="查看">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailAgent(item)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingAgent(item)} />
          </Tooltip>
          <Tooltip title="删除">
            <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingAgent(item)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const detailBlocks = useMemo(() => {
    if (!detailAgent) return [];
    return [
      ["提示词", detailAgent.prompt],
      ["输入来源配置", formatJSONText(detailAgent.inputSources)],
      ["JSON 示例", formatJSONText(detailAgent.jsonExample)],
      ["展示字段配置", formatJSONText(detailAgent.jsonFields)],
    ] as const;
  }, [detailAgent]);

  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>AI文本agent管理</Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>管理提供给 app 同步的 AI 文本 Agent 配置</Typography.Text>
      </div>

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card variant="borderless">
          <Form layout="vertical">
            <Row gutter={16} align="bottom">
              <Col flex="360px">
                <Form.Item label="关键词">
                  <Input.Search
                    value={keywordText}
                    placeholder="搜索名称、模型或提示词"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => searchAgents(keywordText)}
                    onChange={(event) => setKeywordText(event.target.value)}
                  />
                </Form.Item>
              </Col>
              <Col flex="none">
                <Form.Item>
                  <Space>
                    <Button onClick={() => { setKeywordText(""); resetFilters(); }}>重置</Button>
                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchAgents(keywordText)}>查询</Button>
                  </Space>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        <ProTable<AdminAITextAgent>
          rowKey="id"
          columns={columns}
          dataSource={agents}
          loading={isLoading}
          search={false}
          defaultSize="middle"
          tableLayout="fixed"
          cardProps={{ variant: "borderless" }}
          rowSelection={{ selectedRowKeys: selectedAgentIds, onChange: (keys) => setSelectedAgentIds(keys.map(String)) }}
          headerTitle={
            <Space>
              <Typography.Text strong>AI 文本 Agent</Typography.Text>
              <Tag>{total} 条</Tag>
            </Space>
          }
          options={{ density: true, setting: true, reload: () => void refreshAgents() }}
          toolBarRender={() => [
            selectedAgentIds.length > 0 && (
              <Popconfirm key="batch-delete" title={`确定删除选中的 ${selectedAgentIds.length} 个 Agent？`} onConfirm={() => void handleBatchDelete()} okButtonProps={{ danger: true }}>
                <Button danger icon={<DeleteOutlined />}>批量删除 {selectedAgentIds.length}</Button>
              </Popconfirm>
            ),
            <Button key="refresh" icon={<ReloadOutlined />} onClick={() => void refreshAgents()} />,
            <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingAgent({ enabled: true, inputSources: defaultInputSources, jsonFields: defaultJsonFields })}>
              新增 Agent
            </Button>,
          ].filter(Boolean)}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (value) => `共 ${value} 条`,
            onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
          }}
        />
      </Space>

      <Modal
        title={editingAgent?.id ? "编辑 AI 文本 Agent" : "新增 AI 文本 Agent"}
        open={Boolean(editingAgent)}
        width={920}
        onCancel={() => setEditingAgent(null)}
        onOk={() => void handleSave()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入 Agent 名称" }]}>
                <Input placeholder="例如：剧本分镜生成" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="defaultModel" label="默认模型">
                <Input placeholder="留空则使用 app 当前模型" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="enabled" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: "请输入提示词" }]}>
            <Input.TextArea rows={8} placeholder="输入完整系统提示词或任务提示词" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="inputSources" label="输入来源配置" rules={[{ validator: (_, value) => validateJSON(value, "输入来源配置", true) }]}>
                <Input.TextArea rows={9} spellCheck={false} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="jsonFields" label="展示字段配置" rules={[{ validator: (_, value) => validateJSON(value, "展示字段配置", true) }]}>
                <Input.TextArea rows={9} spellCheck={false} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="jsonExample" label="JSON 示例" rules={[{ validator: (_, value) => validateJSON(value, "JSON 示例") }]}>
            <Input.TextArea rows={7} spellCheck={false} placeholder="可选。填写后 app 侧可作为输出结构参考。" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={detailAgent?.name || "Agent 详情"} open={Boolean(detailAgent)} width={900} onCancel={() => setDetailAgent(null)} footer={<Button onClick={() => setDetailAgent(null)}>关闭</Button>}>
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Space>
            <Tag color={detailAgent?.enabled ? "green" : "default"}>{detailAgent?.enabled ? "启用" : "停用"}</Tag>
            <Typography.Text type="secondary">默认模型：{detailAgent?.defaultModel || "未设置"}</Typography.Text>
          </Space>
          {detailBlocks.map(([label, value]) => (
            <div key={label}>
              <Typography.Text strong>{label}</Typography.Text>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f7f8fa", padding: 12, borderRadius: 8, marginTop: 8, maxHeight: 260, overflow: "auto" }}>{value || "-"}</pre>
            </div>
          ))}
        </Space>
      </Modal>

      <Modal title="删除 AI 文本 Agent" open={Boolean(deletingAgent)} onCancel={() => setDeletingAgent(null)} onOk={() => void handleDelete()} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
        <Typography.Text>确定删除 AI 文本 Agent「{deletingAgent?.name}」吗？</Typography.Text>
      </Modal>
    </div>
  );
}
