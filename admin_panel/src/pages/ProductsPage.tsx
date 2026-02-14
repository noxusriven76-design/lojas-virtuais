import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Divider,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import { getApiErrorMessage } from "../api/http";
import { ListState } from "../components/ui/ListState";
import { PageFilterBar } from "../components/ui/PageFilterBar";
import { fetchCategories } from "../catalog/categories.api";
import {
  bulkUpdateProducts,
  duplicateProduct,
  enqueueImageReprocess,
  exportProductsCsv,
  fetchCatalogJobs,
  type Product,
  type ProductGalleryImage,
  createProduct,
  deleteProduct,
  deleteProductGalleryImage,
  importProductsFile,
  fetchProductImages,
  fetchProducts,
  updateProduct,
  updateProductGalleryImage,
  uploadProductGalleryImage,
} from "../catalog/products.api";
import { useCurrentStoreId } from "../stores/store.store";
import { normalizeTrim } from "../utils/forms";

type ProductForm = {
  category_id: number;
  name: string;
  description?: string;
  base_price: number;
  is_active: boolean;
  sku?: string;
  color?: string;
  size?: string;
  stock: number;
};

export function ProductsPage() {
  const storeId = useCurrentStoreId();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [bulkCategoryId, setBulkCategoryId] = useState<number | undefined>(undefined);
  const [bulkPrice, setBulkPrice] = useState<number | undefined>(undefined);
  const [bulkStock, setBulkStock] = useState<number | undefined>(undefined);
  const [bulkIsActive, setBulkIsActive] = useState<boolean | undefined>(undefined);
  const [form] = Form.useForm<ProductForm>();

  const productsQuery = useQuery({
    queryKey: ["admin", "products", storeId],
    queryFn: () => fetchProducts(storeId!),
    enabled: !!storeId,
  });

  const categoriesQuery = useQuery({
    queryKey: ["admin", "categories", storeId, "flat"],
    queryFn: () => fetchCategories(storeId!, false),
    enabled: !!storeId,
  });

  const productImagesQuery = useQuery({
    queryKey: ["admin", "products", "images", storeId, galleryProduct?.id ?? 0],
    queryFn: () => fetchProductImages(storeId!, galleryProduct!.id),
    enabled: !!storeId && !!galleryProduct,
  });

  const jobsQuery = useQuery({
    queryKey: ["admin", "catalog-jobs", storeId],
    queryFn: () => fetchCatalogJobs(storeId!),
    enabled: !!storeId,
  });

  const refreshProducts = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "products", storeId] });
    if (galleryProduct) {
      queryClient.invalidateQueries({
        queryKey: ["admin", "products", "images", storeId, galleryProduct.id],
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: (payload: ProductForm) => createProduct(storeId!, payload),
    onSuccess: () => {
      msg.success("Produto criado");
      setIsModalOpen(false);
      form.resetFields();
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao criar produto")),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ProductForm) =>
      updateProduct(storeId!, editingProduct!.id, {
        category_id: payload.category_id,
        name: payload.name,
        description: payload.description,
        price: payload.base_price,
        is_active: payload.is_active,
        sku: payload.sku,
        color: payload.color,
        size: payload.size,
        stock: payload.stock,
      }),
    onSuccess: () => {
      msg.success("Produto atualizado");
      setIsModalOpen(false);
      setEditingProduct(null);
      form.resetFields();
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao atualizar produto")),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: number) => deleteProduct(storeId!, productId),
    onSuccess: (result) => {
      msg.success(result.message);
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao remover produto")),
  });

  const uploadGalleryMutation = useMutation({
    mutationFn: ({ productId, file }: { productId: number; file: File }) =>
      uploadProductGalleryImage(storeId!, productId, file),
    onSuccess: () => {
      msg.success("Imagem adicionada na galeria");
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao enviar imagem")),
  });

  const deleteGalleryMutation = useMutation({
    mutationFn: ({ productId, imageId }: { productId: number; imageId: number }) =>
      deleteProductGalleryImage(storeId!, productId, imageId),
    onSuccess: () => {
      msg.success("Imagem removida");
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao remover imagem")),
  });

  const setCoverMutation = useMutation({
    mutationFn: ({ productId, imageId }: { productId: number; imageId: number }) =>
      updateProductGalleryImage(storeId!, productId, imageId, { is_cover: true }),
    onSuccess: () => {
      msg.success("Imagem definida como capa");
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao definir capa")),
  });

  const duplicateMutation = useMutation({
    mutationFn: (productId: number) => duplicateProduct(storeId!, productId),
    onSuccess: () => {
      msg.success("Produto duplicado");
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao duplicar produto")),
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      bulkUpdateProducts(storeId!, {
        product_ids: selectedProductIds,
        category_id: bulkCategoryId,
        is_active: bulkIsActive,
        price: bulkPrice,
        stock: bulkStock,
      }),
    onSuccess: (result) => {
      msg.success(`Edicao em massa aplicada em ${result.updated_count} produto(s)`);
      setSelectedProductIds([]);
      setBulkCategoryId(undefined);
      setBulkPrice(undefined);
      setBulkStock(undefined);
      setBulkIsActive(undefined);
      refreshProducts();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha na edicao em massa")),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => importProductsFile(storeId!, file),
    onSuccess: (result) => {
      msg.success(`Importacao concluida: +${result.imported} novos, ${result.updated} atualizados`);
      if (result.errors.length) {
        msg.warning(`Importacao com ${result.errors.length} erro(s).`);
      }
      refreshProducts();
      queryClient.invalidateQueries({ queryKey: ["admin", "catalog-jobs", storeId] });
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha na importacao")),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => enqueueImageReprocess(storeId!),
    onSuccess: () => {
      msg.success("Job de reprocessamento criado");
      queryClient.invalidateQueries({ queryKey: ["admin", "catalog-jobs", storeId] });
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao criar job")),
  });

  const categoryOptions = useMemo(
    () => (categoriesQuery.data ?? []).map((category) => ({ value: category.id, label: category.name })),
    [categoriesQuery.data]
  );

  const filteredProducts = useMemo(() => {
    const list = productsQuery.data ?? [];
    const token = search.trim().toLowerCase();
    return list.filter((row) => {
      if (activeFilter === "active" && !row.is_active) return false;
      if (activeFilter === "inactive" && row.is_active) return false;
      if (!token) return true;
      return (
        row.name.toLowerCase().includes(token) ||
        String(row.id).includes(token) ||
        String(row.sku ?? "").toLowerCase().includes(token)
      );
    });
  }, [productsQuery.data, search, activeFilter]);

  const columns: ColumnsType<Product> = [
    {
      title: "Capa",
      dataIndex: "image_url",
      width: 92,
      render: (value: string | null) =>
        value ? <Image src={`http://localhost:8000${value}`} width={52} height={52} /> : <Tag>Sem capa</Tag>,
    },
    { title: "Nome", dataIndex: "name" },
    { title: "Categoria", dataIndex: "category_id", width: 100 },
    {
      title: "Preco",
      dataIndex: "base_price",
      width: 120,
      render: (value: number) => `R$ ${Number(value).toFixed(2)}`,
    },
    {
      title: "Ativo",
      dataIndex: "is_active",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "Sim" : "Nao"}</Tag>,
    },
    {
      title: "Imagens",
      width: 90,
      render: (_, row) => row.images?.length ?? 0,
    },
    {
      title: "Acoes",
      key: "actions",
      width: 340,
      render: (_, row) => (
        <Space wrap>
          <Button
            size="small"
            onClick={() => {
              setEditingProduct(row);
              form.setFieldsValue({
                category_id: row.category_id,
                name: row.name,
                description: row.description ?? "",
                base_price: row.base_price,
                is_active: row.is_active,
                sku: row.sku ?? "",
                color: row.color ?? "",
                size: row.size ?? "",
                stock: row.stock ?? 0,
              });
              setIsModalOpen(true);
            }}
          >
            Editar
          </Button>
          <Button size="small" onClick={() => setGalleryProduct(row)}>
            Galeria
          </Button>
          <Button
            size="small"
            loading={duplicateMutation.isPending}
            onClick={() => duplicateMutation.mutate(row.id)}
          >
            Duplicar
          </Button>
          <Popconfirm
            title="Excluir produto?"
            description="Se houver historico, o backend faz soft-delete."
            onConfirm={() => deleteMutation.mutate(row.id)}
          >
            <Button danger size="small" loading={deleteMutation.isPending}>
              Excluir
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!storeId) {
    return (
      <Card title="Produtos" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para gerenciar produtos." />
      </Card>
    );
  }

  const galleryUploadProps: UploadProps = {
    showUploadList: false,
    accept: ".jpg,.jpeg,.png,.webp",
    multiple: true,
    customRequest: async ({ file, onSuccess, onError }) => {
      if (!galleryProduct) {
        onError?.(new Error("product_not_selected"));
        return;
      }
      try {
        await uploadGalleryMutation.mutateAsync({
          productId: galleryProduct.id,
          file: file as File,
        });
        onSuccess?.({}, new XMLHttpRequest());
      } catch {
        onError?.(new Error("upload_failed"));
      }
    },
  };

  const importUploadProps: UploadProps = {
    showUploadList: false,
    accept: ".csv,.xlsx",
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        await importMutation.mutateAsync(file as File);
        onSuccess?.({}, new XMLHttpRequest());
      } catch {
        onError?.(new Error("import_failed"));
      }
    },
  };

  return (
    <Card
      title="Produtos"
      style={{ marginTop: 16 }}
      extra={
        <Space wrap>
          <Upload {...importUploadProps}>
            <Button loading={importMutation.isPending}>Importar CSV/XLSX</Button>
          </Upload>
          <Button
            onClick={async () => {
              try {
                await exportProductsCsv(storeId);
              } catch (error) {
                msg.error(getApiErrorMessage(error, "Falha ao exportar"));
              }
            }}
          >
            Exportar CSV
          </Button>
          <Button loading={reprocessMutation.isPending} onClick={() => reprocessMutation.mutate()}>
            Reprocessar imagens
          </Button>
          <Button
            type="primary"
            onClick={() => {
              setEditingProduct(null);
              form.resetFields();
              form.setFieldsValue({
                is_active: true,
                base_price: 0,
                color: "Padrao",
                size: "Unico",
                stock: 0,
              });
              setIsModalOpen(true);
            }}
          >
            Novo produto
          </Button>
        </Space>
      }
    >
      {contextHolder}
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">
        Ultimo job de catalogo:{" "}
        {jobsQuery.data?.[0]
          ? `${jobsQuery.data[0].job_type} (${jobsQuery.data[0].status})`
          : "nenhum"}
      </Typography.Paragraph>

      <PageFilterBar>
        <Input
          placeholder="Buscar por nome, id ou SKU"
          value={search}
          allowClear
          style={{ width: 320 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={activeFilter}
          style={{ width: 180 }}
          onChange={setActiveFilter}
          options={[
            { value: "all", label: "Todos" },
            { value: "active", label: "Apenas ativos" },
            { value: "inactive", label: "Apenas inativos" },
          ]}
        />
        <Button
          onClick={() => {
            setSearch("");
            setActiveFilter("all");
          }}
        >
          Limpar
        </Button>
        <Button
          onClick={() => {
            const inactiveIds = (productsQuery.data ?? [])
              .filter((row) => !row.is_active)
              .map((row) => row.id);
            setSelectedProductIds(inactiveIds);
            msg.success(`${inactiveIds.length} produto(s) inativo(s) selecionado(s)`);
          }}
        >
          Selecionar inativos
        </Button>
      </PageFilterBar>

      <Divider orientation="left">Edicao em massa</Divider>
      <Space wrap style={{ marginBottom: 16 }}>
        <Typography.Text>{selectedProductIds.length} selecionado(s)</Typography.Text>
        <Select
          allowClear
          placeholder="Categoria (massa)"
          style={{ width: 210 }}
          options={categoryOptions}
          value={bulkCategoryId}
          onChange={(value) => setBulkCategoryId(value)}
        />
        <InputNumber
          placeholder="Preco (massa)"
          min={0.01}
          step={0.01}
          value={bulkPrice}
          onChange={(value) => setBulkPrice(value === null ? undefined : Number(value))}
        />
        <InputNumber
          placeholder="Estoque (massa)"
          min={0}
          step={1}
          precision={0}
          value={bulkStock}
          onChange={(value) => setBulkStock(value === null ? undefined : Number(value))}
        />
        <Select
          allowClear
          placeholder="Ativo?"
          style={{ width: 140 }}
          value={bulkIsActive}
          onChange={(value) => setBulkIsActive(value)}
          options={[
            { value: true, label: "Ativar" },
            { value: false, label: "Desativar" },
          ]}
        />
        <Button
          type="primary"
          disabled={selectedProductIds.length === 0}
          loading={bulkMutation.isPending}
          onClick={() => {
            if (
              bulkCategoryId === undefined &&
              bulkPrice === undefined &&
              bulkStock === undefined &&
              bulkIsActive === undefined
            ) {
              msg.warning("Informe ao menos um campo para edicao em massa");
              return;
            }
            bulkMutation.mutate();
          }}
        >
          Aplicar em massa
        </Button>
      </Space>

      <ListState
        loading={productsQuery.isLoading}
        isError={productsQuery.isError}
        errorMessage={getApiErrorMessage(productsQuery.error, "Falha ao carregar produtos")}
        isEmpty={!productsQuery.isLoading && !productsQuery.isError && filteredProducts.length === 0}
        emptyDescription="Nenhum produto encontrado com os filtros atuais"
        onRetry={() => productsQuery.refetch()}
      >
        <Table<Product>
          rowKey="id"
          dataSource={filteredProducts}
          columns={columns}
          rowSelection={{
            selectedRowKeys: selectedProductIds,
            onChange: (keys) => setSelectedProductIds(keys.map((key) => Number(key))),
          }}
        />
      </ListState>

      <Modal
        title={editingProduct ? "Editar produto" : "Novo produto"}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form<ProductForm>
          form={form}
          layout="vertical"
          onFinish={(values) => {
            const payload: ProductForm = {
              ...values,
              name: normalizeTrim(values.name),
              description: values.description ? normalizeTrim(values.description) : "",
              base_price: Number(values.base_price),
              sku: values.sku ? normalizeTrim(values.sku) : "",
              color: values.color ? normalizeTrim(values.color) : "Padrao",
              size: values.size ? normalizeTrim(values.size) : "Unico",
              stock: Number(values.stock ?? 0),
            };
            if (editingProduct) {
              updateMutation.mutate(payload);
            } else {
              createMutation.mutate(payload);
            }
          }}
        >
          <Form.Item
            name="name"
            label="Nome"
            rules={[
              { required: true, message: "Informe o nome" },
              { min: 2, message: "Use pelo menos 2 caracteres" },
            ]}
          >
            <Input maxLength={180} />
          </Form.Item>
          <Form.Item
            name="category_id"
            label="Categoria"
            rules={[{ required: true, message: "Selecione a categoria" }]}
          >
            <Select options={categoryOptions} loading={categoriesQuery.isLoading} />
          </Form.Item>
          <Form.Item
            name="base_price"
            label="Preco"
            rules={[
              { required: true, message: "Informe o preco" },
              {
                validator: (_, value: number) =>
                  value && Number(value) > 0
                    ? Promise.resolve()
                    : Promise.reject(new Error("Preco deve ser maior que zero")),
              },
            ]}
          >
            <InputNumber<number> min={0.01} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="sku" label="SKU">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item
            name="color"
            label="Cor"
            rules={[{ required: true, message: "Informe a cor" }]}
            extra="Use virgula para varias cores. Ex: Verde, Azul, Vermelho"
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="size"
            label="Tamanho"
            rules={[{ required: true, message: "Informe o tamanho" }]}
            extra="Use virgula para varios tamanhos. Ex: P, M, G"
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="stock"
            label="Estoque"
            rules={[
              { required: true, message: "Informe o estoque" },
              {
                validator: (_, value: number) =>
                  Number.isInteger(Number(value)) && Number(value) >= 0
                    ? Promise.resolve()
                    : Promise.reject(new Error("Estoque deve ser inteiro >= 0")),
              },
            ]}
          >
            <InputNumber<number> min={0} step={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="is_active" label="Ativo" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        width={640}
        title={galleryProduct ? `Galeria - ${galleryProduct.name}` : "Galeria"}
        open={!!galleryProduct}
        onClose={() => setGalleryProduct(null)}
        extra={
          <Upload {...galleryUploadProps}>
            <Button type="primary">Adicionar imagens</Button>
          </Upload>
        }
      >
        {productImagesQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="Falha ao carregar galeria"
            description={getApiErrorMessage(productImagesQuery.error)}
          />
        ) : (
          <Table<ProductGalleryImage>
            rowKey="id"
            loading={productImagesQuery.isLoading}
            dataSource={productImagesQuery.data ?? []}
            pagination={false}
            columns={[
              {
                title: "Imagem",
                dataIndex: "image_url",
                render: (value: string) => <Image src={`http://localhost:8000${value}`} width={72} />,
              },
              {
                title: "Capa",
                dataIndex: "is_cover",
                width: 90,
                render: (value: boolean) => (
                  <Tag color={value ? "green" : "default"}>{value ? "Capa" : "-"}</Tag>
                ),
              },
              { title: "Ordem", dataIndex: "sort_order", width: 80 },
              {
                title: "Acoes",
                width: 220,
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      disabled={row.is_cover}
                      loading={setCoverMutation.isPending}
                      onClick={() =>
                        setCoverMutation.mutate({
                          productId: galleryProduct!.id,
                          imageId: row.id,
                        })
                      }
                    >
                      Definir capa
                    </Button>
                    <Popconfirm
                      title="Remover imagem?"
                      onConfirm={() =>
                        deleteGalleryMutation.mutate({
                          productId: galleryProduct!.id,
                          imageId: row.id,
                        })
                      }
                    >
                      <Button danger size="small" loading={deleteGalleryMutation.isPending}>
                        Excluir
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </Card>
  );
}
