"use client";

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Checkbox, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Switch, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

import type { AdminAITextAgent } from "@/services/api/admin-ai-text-agents";
import { useAdminAITextAgents } from "./use-admin-ai-text-agents";

const defaultInputSources = "[]";
const defaultJsonFields = "[]";

interface AgentInputSourceForm {
  id: string;
  type: "markdown" | "json";
  label: string;
  sourceAgentId?: string | null;
  jsonPath?: string;
  enabled: boolean;
}

interface AgentJsonFieldForm {
  id: string;
  path: string;
  label: string;
  enabled: boolean;
}

interface AgentFormValues extends Omit<Partial<AdminAITextAgent>, "inputSources" | "jsonFields"> {
  inputSources?: AgentInputSourceForm[];
  jsonFields?: AgentJsonFieldForm[];
}

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

function createFormId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseJSONList<T>(value: string | undefined, fallback: T[]): T[] {
  if (!value?.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function createDefaultInputSource(index = 0): AgentInputSourceForm {
  return {
    id: createFormId("agent-source"),
    type: "markdown",
    label: `文本来源 ${index + 1}`,
    sourceAgentId: null,
    enabled: true,
  };
}

function normalizeInputSources(value: string | undefined): AgentInputSourceForm[] {
  const sources = parseJSONList<Partial<AgentInputSourceForm>>(value, []);
  const normalized: AgentInputSourceForm[] = sources.map((source, index) => {
    const type = source.type === "json" ? "json" : "markdown";
    return {
      id: typeof source.id === "string" && source.id.trim() ? source.id : createFormId("agent-source"),
      type,
      label: typeof source.label === "string" && source.label.trim() ? source.label : type === "json" ? `JSON 来源 ${index + 1}` : `文本来源 ${index + 1}`,
      sourceAgentId: typeof source.sourceAgentId === "string" && source.sourceAgentId.trim() ? source.sourceAgentId : null,
      jsonPath: type === "json" ? source.jsonPath || "$" : undefined,
      enabled: source.enabled !== false,
    };
  });
  return normalized.length > 0 ? normalized : [createDefaultInputSource()];
}

function normalizeJsonFields(value: string | undefined): AgentJsonFieldForm[] {
  return parseJSONList<Partial<AgentJsonFieldForm>>(value, []).flatMap((field) => {
    const path = typeof field.path === "string" ? field.path.trim() : "";
    if (!path) return [];
    return [{
      id: typeof field.id === "string" && field.id.trim() ? field.id : createFormId("agent-json-field"),
      path,
      label: typeof field.label === "string" && field.label.trim() ? field.label : path,
      enabled: field.enabled !== false,
    }];
  });
}

function serializeInputSources(sources: AgentInputSourceForm[] | undefined) {
  return JSON.stringify((sources || []).map((source, index) => {
    const type = source.type === "json" ? "json" : "markdown";
    return {
      id: source.id || createFormId("agent-source"),
      type,
      label: source.label?.trim() || (type === "json" ? `JSON 来源 ${index + 1}` : `文本来源 ${index + 1}`),
      sourceAgentId: source.sourceAgentId?.trim() || null,
      jsonPath: type === "json" ? source.jsonPath?.trim() || "$" : undefined,
      enabled: source.enabled !== false,
    };
  }), null, 2);
}

function serializeJsonFields(fields: AgentJsonFieldForm[] | undefined) {
  return JSON.stringify((fields || []).flatMap((field) => {
    const path = field.path?.trim();
    if (!path) return [];
    return [{
      id: field.id || createFormId("agent-json-field"),
      path,
      label: field.label?.trim() || path,
      enabled: field.enabled !== false,
    }];
  }), null, 2);
}

function flattenJsonPaths(value: unknown, prefix = "$"): Array<{ path: string; label: string }> {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") {
      return flattenJsonPaths(first, `${prefix}[0]`);
    }
    return [{ path: prefix, label: prefix }];
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
      const childPath = prefix === "$" ? `$.${key}` : `${prefix}.${key}`;
      if (child && typeof child === "object") {
        return flattenJsonPaths(child, childPath);
      }
      return [{ path: childPath, label: key }];
    });
  }
  return [{ path: prefix, label: prefix }];
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

  const [form] = Form.useForm<AgentFormValues>();
  const jsonExampleValue = Form.useWatch("jsonExample", form);
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
        inputSources: normalizeInputSources(editingAgent.inputSources || defaultInputSources),
        jsonExample: formatJSONText(editingAgent.jsonExample),
        jsonFields: normalizeJsonFields(editingAgent.jsonFields || defaultJsonFields),
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
      inputSources: serializeInputSources(values.inputSources),
      jsonExample: values.jsonExample?.trim() || "",
      jsonFields: serializeJsonFields(values.jsonFields),
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

  const jsonPathOptions = useMemo(() => {
    const value = typeof jsonExampleValue === "string" ? jsonExampleValue.trim() : "";
    if (!value) return [];
    try {
      return flattenJsonPaths(JSON.parse(value));
    } catch {
      return [];
    }
  }, [jsonExampleValue]);

  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>AIagent管理</Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>管理提供给 app 同步的 AI Agent 配置，后续可扩展图片、视频 Agent</Typography.Text>
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
              <Typography.Text strong>AI Agent</Typography.Text>
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
        title={editingAgent?.id ? "编辑 AI Agent" : "新增 AI Agent"}
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
              <Form.Item name="enabled" label="显示开关" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item noStyle shouldUpdate>
            {() => (
              <div style={{ marginBottom: 16, border: "1px solid #f0f0f0", borderRadius: 8, padding: 12, background: "#fafafa" }}>
                <Form.Item name="enabled" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Checkbox>启用后在 AI 文本节点中显示</Checkbox>
                </Form.Item>
              </div>
            )}
          </Form.Item>
          <Form.Item name="prompt" label="Agent prompt" rules={[{ required: true, message: "请输入 Agent prompt" }]}>
            <Input.TextArea rows={8} placeholder="输入完整系统提示词或任务提示词" />
          </Form.Item>

          <Card size="small" title="输入来源配置" style={{ marginBottom: 16 }}>
            <Form.List name="inputSources">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {fields.map((field, index) => {
                    const sourceType = form.getFieldValue(["inputSources", field.name, "type"]);
                    return (
                      <Card key={field.key} size="small" style={{ background: "#fcfcfc" }}>
                        <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
                        <Row gutter={12} align="bottom">
                          <Col span={5}>
                            <Form.Item name={[field.name, "enabled"]} valuePropName="checked" label="启用">
                              <Switch size="small" />
                            </Form.Item>
                          </Col>
                          <Col span={5}>
                            <Form.Item name={[field.name, "type"]} label="来源">
                              <Select
                                options={[
                                  { value: "markdown", label: "文本" },
                                  { value: "json", label: "JSON" },
                                ]}
                                onChange={(type) => {
                                  const nextSources = [...(form.getFieldValue("inputSources") || [])];
                                  nextSources[field.name] = {
                                    ...nextSources[field.name],
                                    type,
                                    label: type === "json" ? `JSON 来源 ${index + 1}` : `文本来源 ${index + 1}`,
                                    jsonPath: type === "json" ? nextSources[field.name]?.jsonPath || "$" : undefined,
                                  };
                                  form.setFieldValue("inputSources", nextSources);
                                }}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item name={[field.name, "label"]} label="来源名称">
                              <Input placeholder={sourceType === "json" ? `JSON 来源 ${index + 1}` : `文本来源 ${index + 1}`} />
                            </Form.Item>
                          </Col>
                          <Col span={5}>
                            <Form.Item name={[field.name, "jsonPath"]} label="JSONPath">
                              <Input disabled={sourceType !== "json"} placeholder={sourceType === "json" ? "$.data" : ""} />
                            </Form.Item>
                          </Col>
                          <Col span={3}>
                            <Button danger block onClick={() => remove(field.name)} disabled={fields.length <= 1}>删除</Button>
                          </Col>
                        </Row>
                        <Form.Item name={[field.name, "sourceAgentId"]} label="上游 Agent ID（可选，留空时使用画布连接输入）">
                          <Input placeholder="留空表示画布连接输入" />
                        </Form.Item>
                      </Card>
                    );
                  })}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add(createDefaultInputSource(fields.length))}>
                    添加来源
                  </Button>
                </Space>
              )}
            </Form.List>
          </Card>

          <Card size="small" title="JSON 示例与展示字段" style={{ marginBottom: 16 }}>
            <Form.Item name="jsonExample" label="JSON 示例" rules={[{ validator: (_, value) => validateJSON(value, "JSON 示例") }]}>
              <Input.TextArea rows={7} spellCheck={false} placeholder="可选。填写后下方会列出 JSON 卡片展示项。" />
            </Form.Item>
            <Typography.Text strong>JSON 卡片展示项</Typography.Text>
            <Form.List name="jsonFields">
              {(fields, { add, remove }) => {
                const selectedPaths = new Set((form.getFieldValue("jsonFields") || []).map((item: AgentJsonFieldForm) => item?.path).filter(Boolean));
                return (
                  <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
                    {jsonPathOptions.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                        {jsonPathOptions.map((option) => (
                          <Checkbox
                            key={option.path}
                            checked={selectedPaths.has(option.path)}
                            onChange={(event) => {
                              if (event.target.checked) {
                                add({ id: createFormId("agent-json-field"), path: option.path, label: option.label, enabled: true });
                                return;
                              }
                              const removeIndex = (form.getFieldValue("jsonFields") || []).findIndex((item: AgentJsonFieldForm) => item?.path === option.path);
                              if (removeIndex >= 0) remove(removeIndex);
                            }}
                          >
                            <Typography.Text style={{ fontSize: 12 }}>{option.path}</Typography.Text>
                          </Checkbox>
                        ))}
                      </div>
                    ) : (
                      <Typography.Text type="secondary">填入可解析的 JSON 示例后，这里会列出可勾选字段。</Typography.Text>
                    )}

                    {fields.length > 0 ? (
                      <div style={{ marginTop: 8 }}>
                        <Typography.Text type="secondary">展示顺序与中文名称</Typography.Text>
                        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 8 }}>
                          {fields.map((field, index) => (
                            <Row key={field.key} gutter={8} align="middle">
                              <Col flex="42px"><Tag>{index + 1}</Tag></Col>
                              <Col flex="auto">
                                <Form.Item name={[field.name, "label"]} style={{ marginBottom: 0 }}>
                                  <Input placeholder="展示名称" />
                                </Form.Item>
                              </Col>
                              <Col flex="260px">
                                <Form.Item name={[field.name, "path"]} style={{ marginBottom: 0 }}>
                                  <Input placeholder="JSONPath" />
                                </Form.Item>
                              </Col>
                              <Col flex="80px">
                                <Form.Item name={[field.name, "enabled"]} valuePropName="checked" style={{ marginBottom: 0 }}>
                                  <Checkbox>启用</Checkbox>
                                </Form.Item>
                              </Col>
                              <Col flex="70px">
                                <Button danger onClick={() => remove(field.name)}>删除</Button>
                              </Col>
                              <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
                            </Row>
                          ))}
                        </Space>
                      </div>
                    ) : null}
                  </Space>
                );
              }}
            </Form.List>
          </Card>
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

      <Modal title="删除 AI Agent" open={Boolean(deletingAgent)} onCancel={() => setDeletingAgent(null)} onOk={() => void handleDelete()} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
        <Typography.Text>确定删除 AI Agent「{deletingAgent?.name}」吗？</Typography.Text>
      </Modal>
    </div>
  );
}
