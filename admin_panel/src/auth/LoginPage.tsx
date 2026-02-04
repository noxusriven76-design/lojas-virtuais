import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { login } from "./auth.api";
import { authStore } from "./auth.store";

type LoginForm = {
  email: string;
  password: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const token = authStore.getToken();

  const mutation = useMutation({
    mutationFn: (values: LoginForm) => login(values.email, values.password),
    onSuccess: (data) => {
      authStore.setToken(data.access_token);
      navigate("/", { replace: true });
    },
  });

  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <Card style={{ width: 420 }}>
        <Typography.Title level={3}>Admin Login</Typography.Title>
        <Form<LoginForm> layout="vertical" onFinish={(values) => mutation.mutate(values)}>
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

