import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="grid">
      <AuthForm mode="signup" />
      <div className="card">
        <div className="section-title">Already have an account</div>
        <a href="/login">Go to login</a>
      </div>
    </div>
  );
}
