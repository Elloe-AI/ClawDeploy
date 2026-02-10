import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="grid">
      <AuthForm mode="login" />
      <div className="card">
        <div className="section-title">New to ClawDeploy</div>
        <p>Create an account to provision runners and connect Telegram.</p>
        <a href="/signup">Go to signup</a>
      </div>
    </div>
  );
}
