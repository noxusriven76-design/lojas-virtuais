import { Alert, Button, Card, Checkbox, Form, Input, Typography } from "antd";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { LockOutlined } from "@ant-design/icons";
import { login } from "./auth.api";
import { authStore } from "./auth.store";

type LoginForm = {
  email: string;
  password: string;
  otp_code?: string;
  remember: boolean;
};

const REMEMBER_LOGIN_KEY = "admin_panel_remember_login";
const SAVED_EMAIL_KEY = "admin_panel_saved_email";

export function LoginPage() {
  const navigate = useNavigate();
  const token = authStore.getToken();
  const [form] = Form.useForm<LoginForm>();

  const remembered = localStorage.getItem(REMEMBER_LOGIN_KEY) === "1";
  const savedEmail = remembered ? localStorage.getItem(SAVED_EMAIL_KEY) ?? "" : "";

  const mutation = useMutation({
    mutationFn: (values: LoginForm) => login(values.email, values.password, values.otp_code),
    onSuccess: (data, values) => {
      if (values.remember) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, "1");
        localStorage.setItem(SAVED_EMAIL_KEY, values.email);
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
      authStore.setToken(data.access_token);
      navigate("/", { replace: true });
    },
  });

  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <div className="login-headline">
          <LockOutlined />
          <Typography.Text className="login-kicker">Acesso Administrativo</Typography.Text>
        </div>
        <Typography.Title level={3} style={{ marginTop: 10, marginBottom: 6 }}>
          Entrar no painel
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Gerencie catalogo, pedidos, clientes e configuracoes da sua loja.
        </Typography.Paragraph>
        <Form<LoginForm>
          form={form}
          layout="vertical"
          initialValues={{ email: savedEmail, password: "", otp_code: "", remember: remembered }}
          onFinish={(values) => mutation.mutate(values)}
        >
          <Form.Item name="email" label="Email" rules={[{ required: true, message: "Informe o email" }]}>
            <Input type="email" autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Senha"
            rules={[{ required: true, message: "Informe a senha" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="otp_code" label="Codigo 2FA (opcional)">
            <Input autoComplete="one-time-code" inputMode="numeric" placeholder="Ex.: 123456" />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked" style={{ marginTop: -4 }}>
            <Checkbox>Lembrar login (email) neste navegador</Checkbox>
          </Form.Item>
          {mutation.isError ? (
            <Alert
              type="error"
              showIcon
              message="Falha no login"
              description="Verifique email/senha e tente novamente."
              style={{ marginBottom: 12 }}
            />
          ) : null}
          <Button block type="primary" htmlType="submit" loading={mutation.isPending}>
            Entrar
          </Button>
        </Form>
      </Card>
    </div>
  );
}
