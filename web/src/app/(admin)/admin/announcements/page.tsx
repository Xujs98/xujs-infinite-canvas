"use client";

import { PlusOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, PushpinOutlined, PushpinFilled } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Switch, Tag, Typography, Popconfirm } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useState } from "react";

import type { AdminAnnouncement } from "@/services/api/admin-announcements";
import { useAdminAnnouncements } from "./use-admin-announcements";

dayjs.extend(relativeTime);

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  active: { label: "展示中", color: "green" },
  archived: { label: "已归档", color: "orange" },
};

const statusOptions = [
  { label: "草稿", value: "draft" },
  { label: "展示中", value: "active" },
  { label: "已归档", value: "archived" },
];

const notifyTypeLabels: Record<string, string> = {
  silent: "静默",
  popup: "弹出",
};

const targetLabels: Record<string, string> = {
  all: "所有用户",
  member: "会员",
};

export default function AdminAnnouncementsPage() {
  const {
    announcements,
    keyword,
    status,
    page,
    pageSize,
    total,
    isLoading,
    searchAnnouncements,
    changeStatus,
    changePage,
    changePageSize,
    resetFilters,
    refreshAnnouncements,
    saveAnnouncement,
    deleteAnnouncement,
    batchDeleteAnnouncements,
    batchUpdatePinned,
  } = useAdminAnnouncements();

  const [form] = Form.useForm();
  const [keywordText, setKeywordText] = useState(keyword);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Partial<AdminAnnouncement> | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<AdminAnnouncement | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => setKeywordText(keyword), [keyword]);

  useEffect(() => {
    if (editingAnnouncement) {
      form.setFieldsValue({
        status: "draft",
        notifyType: "silent",
        target: "all",
        ...editingAnnouncement,
        startTime: editingAnnouncement.startTime ? dayjs(editingAnnouncement.startTime) : undefined,
        endTime: editingAnnouncement.endTime ? dayjs(editingAnnouncement.endTime) : undefined,
      });
    }
  }, [editingAnnouncement, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const data = {
      ...editingAnnouncement,
      ...values,
      startTime: values.startTime ? values.startTime.toISOString() : null,
      endTime: values.endTime ? values.endTime.toISOString() : null,
    };
    await saveAnnouncement(data);
    form.resetFields();
    setEditingAnnouncement(null);
  };

  const handleDelete = async () => {
    if (!deletingAnnouncement) return;
    await deleteAnnouncement(deletingAnnouncement.id);
    setDeletingAnnouncement(null);
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    await batchDeleteAnnouncements(selectedRowKeys as string[]);
    setSelectedRowKeys([]);
  };

  const handleBatchPinned = async (pinned: boolean) => {
    if (selectedRowKeys.length === 0) return;
    await batchUpdatePinned(selectedRowKeys as string[], pinned);
    setSelectedRowKeys([]);
  };

  const handleTogglePinned = async (item: AdminAnnouncement) => {
    await batchUpdatePinned([item.id], !item.pinned);
  };

  const columns: ProColumns<AdminAnnouncement>[] = [
    {
      title: "标题",
      dataIndex: "title",
      ellipsis: true,
      render: (_, item) => (
        <Space>
          {item.pinned && <PushpinFilled style={{ color: "#f59e0b" }} />}
          <Typography.Text strong>{item.title}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "置顶",
      dataIndex: "pinned",
      width: 80,
      align: "center",
      render: (_, item) => (
        <Switch
          size="small"
          checked={item.pinned}
          onChange={() => handleTogglePinned(item)}
        />
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (_, item) => {
        const s = statusLabels[item.status] || { label: item.status, color: "default" };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "通知方式",
      dataIndex: "notifyType",
      width: 100,
      render: (_, item) => <Tag>{notifyTypeLabels[item.notifyType] || item.notifyType}</Tag>,
    },
    {
      title: "展示条件",
      dataIndex: "target",
      width: 120,
      render: (_, item) => <Tag>{targetLabels[item.target] || item.target}</Tag>,
    },
    {
      title: "时间范围",
      key: "timeRange",
      width: 200,
      render: (_, item) => {
        if (!item.startTime && !item.endTime) return <Typography.Text type="secondary">永久</Typography.Text>;
        const start = item.startTime ? dayjs(item.startTime).format("MM-DD HH:mm") : "不限";
        const end = item.endTime ? dayjs(item.endTime).format("MM-DD HH:mm") : "不限";
        return <Typography.Text type="secondary">{start} ~ {end}</Typography.Text>;
      },
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (_, item) => <Typography.Text type="secondary">{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}</Typography.Text>,
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      align: "right",
      render: (_, item) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => setEditingAnnouncement(item)}>
            编辑
          </Button>
          <Button danger type="link" size="small" onClick={() => setDeletingAnnouncement(item)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <main style={{ padding: 24 }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card variant="borderless">
          <Form layout="vertical">
            <Row gutter={16} align="bottom">
              <Col flex="360px">
                <Form.Item label="关键词">
                  <Input.Search
                    value={keywordText}
                    placeholder="搜索公告标题或内容"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => searchAnnouncements(keywordText)}
                    onChange={(e) => setKeywordText(e.target.value)}
                  />
                </Form.Item>
              </Col>
              <Col flex="160px">
                <Form.Item label="状态">
                  <Select
                    value={status || undefined}
                    placeholder="全部状态"
                    allowClear
                    options={statusOptions}
                    onChange={(value) => changeStatus(value || "")}
                  />
                </Form.Item>
              </Col>
              <Col flex="none">
                <Form.Item>
                  <Space>
                    <Button onClick={() => { setKeywordText(""); resetFilters(); }}>重置</Button>
                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchAnnouncements(keywordText)}>查询</Button>
                  </Space>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        <ProTable<AdminAnnouncement>
          rowKey="id"
          columns={columns}
          dataSource={announcements}
          loading={isLoading}
          search={false}
          defaultSize="middle"
          tableLayout="fixed"
          cardProps={{ variant: "borderless" }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          headerTitle={
            <Space>
              <Typography.Text strong>公告管理</Typography.Text>
              <Tag>{total} 条</Tag>
            </Space>
          }
          options={{ density: true, setting: true, reload: () => refreshAnnouncements() }}
          toolBarRender={() => [
            selectedRowKeys.length > 0 && (
              <Space key="batch">
                <Popconfirm
                  title={`确定批量置顶选中的 ${selectedRowKeys.length} 条公告？`}
                  onConfirm={() => handleBatchPinned(true)}
                >
                  <Button icon={<PushpinOutlined />}>批量置顶</Button>
                </Popconfirm>
                <Popconfirm
                  title={`确定取消置顶选中的 ${selectedRowKeys.length} 条公告？`}
                  onConfirm={() => handleBatchPinned(false)}
                >
                  <Button>取消置顶</Button>
                </Popconfirm>
                <Popconfirm
                  title={`确定删除选中的 ${selectedRowKeys.length} 条公告？`}
                  onConfirm={handleBatchDelete}
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />}>批量删除</Button>
                </Popconfirm>
              </Space>
            ),
            <Button key="refresh" icon={<ReloadOutlined />} onClick={() => refreshAnnouncements()} />,
            <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingAnnouncement({})}>
              创建公告
            </Button>,
          ].filter(Boolean)}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (value) => `共 ${value} 条`,
            onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
          }}
        />
      </Space>

      {/* 创建/编辑公告 */}
      <Modal
        title={editingAnnouncement?.id ? "编辑公告" : "创建公告"}
        open={!!editingAnnouncement}
        width={640}
        onCancel={() => setEditingAnnouncement(null)}
        onOk={() => void handleSave()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="公告标题" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: "请输入内容" }]}>
            <Input.TextArea rows={4} placeholder="公告内容" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select options={statusOptions} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="notifyType" label="通知方式">
                <Select
                  options={[
                    { label: "静默", value: "silent" },
                    { label: "弹出", value: "popup" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="target" label="展示条件">
                <Select
                  options={[
                    { label: "所有用户", value: "all" },
                    { label: "会员", value: "member" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="startTime" label="开始时间">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} placeholder="留空永久生效" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endTime" label="结束时间">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} placeholder="留空永久生效" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="pinned" label="置顶" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 删除确认 */}
      <Modal
        title="删除公告"
        open={!!deletingAnnouncement}
        onCancel={() => setDeletingAnnouncement(null)}
        onOk={() => void handleDelete()}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Typography.Text>确定删除公告「{deletingAnnouncement?.title}」吗？</Typography.Text>
      </Modal>
    </main>
  );
}
