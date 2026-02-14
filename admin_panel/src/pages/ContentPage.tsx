import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Form,
  Image,
  Input,
  Popconfirm,
  Space,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { getApiErrorMessage } from "../api/http";
import {
  deleteStoreBannerImage,
  fetchStoreContent,
  updateStoreContent,
  uploadStoreBannerImage,
  type StoreContent,
} from "../content/content.api";
import { useCurrentStoreId } from "../stores/store.store";
import { normalizeTrim } from "../utils/forms";

type ContentForm = {
  banner_title: string;
  banner_subtitle: string;
  highlight_title: string;
  highlight_text: string;
  institutional_text: string;
};

export function ContentPage() {
  const storeId = useCurrentStoreId();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ContentForm>();

  const contentQuery = useQuery({
    queryKey: ["admin", "store-content", storeId],
    queryFn: () => fetchStoreContent(storeId!),
    enabled: !!storeId,
  });

  useEffect(() => {
    if (!contentQuery.data) return;
    form.setFieldsValue({
      banner_title: contentQuery.data.banner_title,
      banner_subtitle: contentQuery.data.banner_subtitle,
      highlight_title: contentQuery.data.highlight_title,
      highlight_text: contentQuery.data.highlight_text,
      institutional_text: contentQuery.data.institutional_text,
    });
  }, [contentQuery.data, form]);

  const refreshContent = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "store-content", storeId] });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: ContentForm) =>
      updateStoreContent(storeId!, {
        banner_title: normalizeTrim(payload.banner_title),
        banner_subtitle: normalizeTrim(payload.banner_subtitle),
        highlight_title: normalizeTrim(payload.highlight_title),
        highlight_text: normalizeTrim(payload.highlight_text),
        institutional_text: normalizeTrim(payload.institutional_text),
      }),
    onSuccess: () => {
      msg.success("Conteudo da loja atualizado");
      refreshContent();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao salvar conteudo")),
  });

  const deleteBannerMutation = useMutation({
    mutationFn: () => deleteStoreBannerImage(storeId!),
    onSuccess: () => {
      msg.success("Banner removido");
      refreshContent();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao remover banner")),
  });

  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: ".jpg,.jpeg,.png,.webp",
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        await uploadStoreBannerImage(storeId!, file as File);
        msg.success("Banner enviado");
        refreshContent();
        onSuccess?.({}, new XMLHttpRequest());
      } catch (error) {
        msg.error(getApiErrorMessage(error, "Falha no upload do banner"));
        onError?.(new Error("upload_failed"));
      }
    },
  };

  if (!storeId) {
    return (
      <Card title="Conteudo da Loja" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para editar o conteudo." />
      </Card>
    );
  }

  const content: StoreContent | undefined = contentQuery.data;

  return (
    <Card title="Conteudo da Loja" style={{ marginTop: 16 }}>
      {contextHolder}
      {contentQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="Falha ao carregar conteudo"
          description={getApiErrorMessage(contentQuery.error)}
        />
      ) : (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Form<ContentForm> form={form} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
            <Form.Item
              name="banner_title"
              label="Titulo do banner"
              rules={[{ required: true, message: "Informe o titulo do banner" }]}
            >
              <Input maxLength={180} />
            </Form.Item>
            <Form.Item
              name="banner_subtitle"
              label="Subtitulo do banner"
              rules={[{ required: true, message: "Informe o subtitulo do banner" }]}
            >
              <Input maxLength={300} />
            </Form.Item>
            <Form.Item
              name="highlight_title"
              label="Titulo dos destaques"
              rules={[{ required: true, message: "Informe o titulo dos destaques" }]}
            >
              <Input maxLength={180} />
            </Form.Item>
            <Form.Item
              name="highlight_text"
              label="Texto de destaque"
              rules={[{ required: true, message: "Informe o texto de destaque" }]}
            >
              <Input.TextArea rows={3} maxLength={1500} showCount />
            </Form.Item>
            <Form.Item
              name="institutional_text"
              label="Texto institucional"
              rules={[{ required: true, message: "Informe o texto institucional" }]}
            >
              <Input.TextArea rows={5} maxLength={2500} showCount />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
              Salvar conteudo
            </Button>
          </Form>

          <Card size="small" title="Imagem do Banner">
            <Space direction="vertical">
              {content?.banner_image_url ? (
                <Image src={`http://localhost:8000${content.banner_image_url}`} width={320} />
              ) : (
                <Alert type="info" showIcon message="Nenhuma imagem de banner cadastrada." />
              )}
              <Space>
                <Upload {...uploadProps}>
                  <Button>Enviar banner</Button>
                </Upload>
                <Popconfirm title="Remover imagem do banner?" onConfirm={() => deleteBannerMutation.mutate()}>
                  <Button disabled={!content?.banner_image_url} loading={deleteBannerMutation.isPending}>
                    Remover banner
                  </Button>
                </Popconfirm>
              </Space>
            </Space>
          </Card>
        </Space>
      )}
    </Card>
  );
}
