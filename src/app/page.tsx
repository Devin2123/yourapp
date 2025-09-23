export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold">[Bot Name] — Automate Product Access</h1>
      <p className="mt-3 text-gray-600">Create products, link roles, and let automation handle delivery.</p>
      <div className="mt-8 p-4 rounded-lg border">
        <p className="text-sm text-gray-500">
          Payments are processed by external providers. We never custody funds.
        </p>
      </div>
    </main>
  );
}