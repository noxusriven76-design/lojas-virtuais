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
  Switch,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { getApiErrorMessage } from "../api/http";
import { fetchMyStores } from "../stores/stores.api";
import { useCurrentStoreId } from "../stores/store.store";
import { deleteStoreLogo, updateStore, uploadStoreLogo } from "../settings/settings.api";
import { normalizeTrim, slugify } from "../utils/forms";

type SettingsForm = {
  name: string;
  slug: string;
  is_active: boolean;
};

export function SettingsPage() {
  const storeId = useCurrentStoreId();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [form] = Form.useForm<SettingsForm>();

  const storesQuery = useQuery({
    queryKey: ["admin", "my-stores"],
    queryFn: fetchMyStores,
  });

  const selectedStore = storesQuery.data?.find((store) => store.store_id === storeId) ?? null;

  useEffect(() => {
    if (!selectedStore) return;
    form.setFieldsValue({
      name: selectedStore.name,
      slug: selectedStore.slug,
      is_active: selectedStore.is_active ?? true,
    });
  }, [form, selectedStore]);

  const refreshStores = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "my-stores"] });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: SettingsForm) =>
      updateStore(storeId!, { name: payload.name, slug: payload.slug, is_active: payload.is_active }),
    onSuccess: () => {
      msg.success("Loja atualizada");
      refreshStores();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao atualizar loja")),
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => deleteStoreLogo(storeId!),
    onSuccess: () => {
      msg.success("Logo removida");
      refreshStores();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao remover logo")),
  });

  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: ".jpg,.jpeg,.png,.webp",
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        await uploadStoreLogo(storeId!, file as File);
        msg.success("Logo enviada");
        refreshStores();
        onSuccess?.({}, new XMLHttpRequest());
      } catch (error) {
        msg.error(getApiErrorMessage(error, "Falha no upload da logo"));
        onError?.(new Error("upload_failed"));
      }
    },
  };

  if (!storeId) {
    return (
      <Card title="Configuracoes" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para alterar configuracoes." />
      </Card>
    );
  }

  return (
    <Card title="Configuracoes da Loja" style={{ marginTop: 16 }}>
      {contextHolder}
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>

      {storesQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="Falha ao carregar loja selecionada"
          description={getApiErrorMessage(storesQuery.error)}
        />
      ) : !selectedStore ? (
        <Alert type="warning" showIcon message="Loja selecionada nao encontrada em /admin/my-stores." />
      ) : (
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          <Form<SettingsForm>
            form={form}
            layout="vertical"
            onFinish={(values) =>
              updateMutation.mutate({
                ...values,
                name: normalizeTrim(values.name),
                slug: slugify(values.slug),
              })
            }
          >
            <Form.Item
              name="name"
              label="Nome"
              rules={[
                { required: true, message: "Informe o nome" },
                { min: 3, message: "Use pelo menos 3 caracteres" },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="slug"
              label="Slug"
              rules={[
                { required: true, message: "Informe o slug" },
                { pattern: /^[a-z0-9-]+$/, message: "Use apenas letras minusculas, numeros e hifen" },
              ]}
            >
              <Input onBlur={(event) => form.setFieldValue("slug", slugify(event.target.value))} />
            </Form.Item>
            <Form.Item name="is_active" label="Ativa" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
              Salvar alteracoes
            </Button>
          </Form>

          <div>
            <Typography.Title level={5}>Logo</Typography.Title>
            <Space direction="vertical" size={12}>
              {selectedStore.logo_url ? (
                <Image src={`http://localhost:8000${selectedStore.logo_url}`} width={120} />
              ) : (
                <Typography.Text type="secondary">Sem logo cadastrada.</Typography.Text>
              )}
              <Space>
                <Upload {...uploadProps}>
                  <Button>Enviar logo</Button>
                </Upload>
                <Popconfirm title="Remover logo?" onConfirm={() => deleteLogoMutation.mutate()}>
                  <Button disabled={!selectedStore.logo_url} loading={deleteLogoMutation.isPending}>
                    Remover logo
                  </Button>
                </Popconfirm>
              </Space>
            </Space>
          </div>
        </Space>
      )}
    </Card>
  );
}
